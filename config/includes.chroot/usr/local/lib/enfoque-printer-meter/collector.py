"""Persistent office-printer meters, using existing approved-agent transport.
Never scan the LAN, create jobs, change queues or upload document/user fields.
"""
import concurrent.futures
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import time
import unicodedata
import urllib.request
from datetime import datetime,timezone
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("enfoque_snmp_meter",ROOT/"snmp.py")
snmp=importlib.util.module_from_spec(spec);spec.loader.exec_module(snmp)
CATALOG=Path("/etc/enfoque-os/drivers/printer-catalog.json")
PROFILE=Path("/var/lib/enfoque-os/firstboot.json")
ENDPOINT="https://intranet.enfoquepapelaria.com.br/api/remote-access/agent/print-pages"
RECEIPT=("bematech","bermatec","elgin","daruma","thermal","termica","thermo","cupom",
         "epson_tm","epson tm","/tm-","escpos","esc/pos","zebra","receipt","ecf")
OFFICE=("pantum","laserjet","deskjet","officejet","photosmart","maxify","pixma",
        "brother","ricoh","kyocera","xerox","lexmark","konica","epson","canon","samsung","oki")
last_queues=None
last_inventory=0

def normalized(value):
    return unicodedata.normalize("NFKD",str(value)).encode("ascii","ignore").decode().lower()

def office_queue(name,attributes,ppd_root=Path("/etc/cups/ppd")):
    text=normalized(" ".join(str(attributes.get(k,"")) for k in
                            ("printer-make-and-model","device-uri"))+" "+name)
    if any(word in text for word in RECEIPT):
        return False
    if any(word in text for word in OFFICE):
        return True
    # Root-owned PPD paper geometry can identify a plain generic A4 driver.
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,127}",name):
        return False
    p=ppd_root/(name+".ppd")
    try:
        if p.is_symlink() or p.stat().st_uid!=0 or p.stat().st_size>2_000_000 or p.stat().st_mode&0o022:return False
        raw=p.read_text(errors="replace")
        if any(word in normalized(raw[:12000]) for word in RECEIPT):return False
        return bool(re.search(r'^\*DefaultPageSize:\s*(?:A[3456]|Letter|Legal|Tabloid|B5)\s*$',raw,re.M))
    except OSError:
        return False

def queues(force=False):
    global last_inventory,last_queues
    if not force and last_queues is not None and time.monotonic()-last_inventory<60:
        return last_queues
    try:
        import cups
        last_queues=cups.Connection().getPrinters()
    except (ImportError,RuntimeError,OSError):
        last_queues={}
    last_inventory=time.monotonic()
    return last_queues

def is_office(name):
    data=queues()
    return name in data and office_queue(name,data[name])

def trusted(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_uid!=0 or path.stat().st_mode&0o022:
        raise ValueError("Untrusted printer configuration")
    if path.stat().st_size>128000:raise ValueError("Oversize printer configuration")
    return json.loads(path.read_text())

def unit():
    try:return trusted(PROFILE).get("unitId")
    except (ValueError,OSError):return None

def private_host(uri):
    try:
        parsed=urlsplit(uri)
        if parsed.scheme not in ("ipp","ipps","socket","lpd","http","https"):return None
        address=ipaddress.ip_address(parsed.hostname or "")
        if address.is_private and not any((address.is_loopback,address.is_link_local,address.is_multicast,address.is_unspecified)):
            return str(address)
    except ValueError:pass
    return None

def targets(store,found=None,catalog=None):
    found=queues() if found is None else found
    result={}
    for name,attributes in found.items():
        if not office_queue(name,attributes):continue
        host=private_host(attributes.get("device-uri",""))
        if host:result[host]=attributes.get("printer-make-and-model","")
    if catalog is None:
        try:catalog=trusted(CATALOG)
        except (OSError,ValueError):catalog={}
    for item in catalog.get("networks",{}).get(store,[]):
        hint=" ".join(str(item.get(k,"")) for k in ("name","make","model"))
        if any(word in normalized(hint) for word in RECEIPT):continue
        host=private_host(item.get("uri",""))
        if host:result.setdefault(host,hint)
    # Exact read-only endpoint already verified server-side; no CUPS queue required.
    if store=="itaipu":result.setdefault("192.168.2.100","HP Color LaserJet Pro MFP 4303")
    return list(result)[:12]

def read_target(host):
    metrics=snmp.read_metrics(host)
    if any(word in normalized(metrics.get("model","")) for word in RECEIPT):
        raise ValueError("Receipt printer excluded")
    metrics["model"]=re.sub(r"[\x00-\x1f\x7f]"," ",metrics["model"])[:160]
    metrics["serial"]=re.sub(r"[\x00-\x1f\x7f]"," ",metrics.get("serial",""))[:100]
    metrics["endpointHost"]=host
    metrics["measuredAt"]=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
    return metrics

def schema(db):
    db.executescript("""
CREATE TABLE IF NOT EXISTS printer_meter_queue(
 id TEXT PRIMARY KEY, payload TEXT NOT NULL, measured_at TEXT NOT NULL,
 delivered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS printer_meter_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
""")

def enqueue(db,reading):
    signature=json.dumps({k:v for k,v in reading.items() if k!="measuredAt"},sort_keys=True,separators=(",",":"))
    meta_key="last-snapshot:"+reading["endpointHost"]
    previous=db.execute("SELECT value FROM printer_meter_meta WHERE key=?",(meta_key,)).fetchone()
    if previous:
        old=json.loads(previous[0])
        if old["signature"]==signature and time.time()-old["saved"]<900:
            return None
    raw=json.dumps(reading,sort_keys=True,separators=(",",":"))
    key=hashlib.sha256(raw.encode()).hexdigest()
    with db:
        db.execute("INSERT OR REPLACE INTO printer_meter_meta VALUES(?,?)",(meta_key,json.dumps({"signature":signature,"saved":time.time()})))
        db.execute("INSERT OR IGNORE INTO printer_meter_queue VALUES(?,?,?,0)",
                   (key,raw,reading["measuredAt"]))
    return key

def collect(db,store,clock=time.time,reader=read_target,hosts=None):
    schema(db)
    previous=db.execute("SELECT value FROM printer_meter_meta WHERE key='last-poll'").fetchone()
    now=clock()
    if previous and 0<=now-float(previous[0])<60:return 0
    with db:
        db.execute("INSERT OR REPLACE INTO printer_meter_meta VALUES('last-poll',?)",(str(now),))
    selected=targets(store) if hosts is None else hosts
    count=0
    # Limited read-only GET requests to known printer endpoints; no discovery scan.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tasks=[pool.submit(reader,host) for host in selected]
        for task in tasks:
            try:
                enqueue(db,task.result());count+=1
            except (OSError,ValueError,IndexError,RuntimeError):
                pass
    return count

def send(db,machine,auth,transport=urllib.request.urlopen):
    if not auth:return 0
    schema(db)
    with db:
        db.execute("DELETE FROM printer_meter_queue WHERE measured_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')")
    # Absolute counters permit safe replay; do not replace measuredAt with retry time.
    rows=db.execute("SELECT id,payload FROM printer_meter_queue WHERE delivered=0 ORDER BY measured_at,id LIMIT 16").fetchall()
    if not rows:return 0
    payload={"kind":"physical-meter-v1","deviceUuid":machine,
             "readings":[json.loads(row[1]) for row in rows]}
    req=urllib.request.Request(ENDPOINT,json.dumps(payload).encode(),
        {"Content-Type":"application/json","X-Enfoque-Device-Id":auth["id"],
         "X-Enfoque-Device-Token":auth["token"],"User-Agent":"Enfoque-OS-printer-meter/0.2.52"},method="POST")
    with transport(req,timeout=9) as response:
        if response.status!=200:raise RuntimeError("Meter upload rejected")
        ack=json.loads(response.read(1500))
    if ack.get("ok") is not True or ack.get("accepted")!=len(rows):
        raise ValueError("Incomplete meter acknowledgement")
    with db:
        db.executemany("UPDATE printer_meter_queue SET delivered=1 WHERE id=?",[(r[0],) for r in rows])
        db.execute("DELETE FROM printer_meter_queue WHERE measured_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')")
    return len(rows)

def tick(db,machine,auth_loader):
    collect(db,unit())
    previous=db.execute("SELECT value FROM printer_meter_meta WHERE key='last-send'").fetchone()
    now=time.time()
    if previous and 0<=now-float(previous[0])<60:return 0
    with db:db.execute("INSERT OR REPLACE INTO printer_meter_meta VALUES('last-send',?)",(str(now),))
    try:return send(db,machine,auth_loader(machine))
    except (OSError,ValueError,RuntimeError):
        return 0
