#!/usr/bin/env python3
"""Absolute office printer counters. First sample is a baseline, never production."""
import hashlib,importlib.util,json,sqlite3,sys
from pathlib import Path
from datetime import datetime,timedelta,timezone,time,date
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parent
DB=Path("/opt/intranet-data/office-printer-meters.sqlite3")
TZ=ZoneInfo("America/Sao_Paulo")
SCHEMA="""
CREATE TABLE IF NOT EXISTS meters(
 unit_id TEXT NOT NULL, printer_id TEXT NOT NULL, model TEXT NOT NULL, endpoint TEXT NOT NULL,
 serial TEXT NOT NULL, first_at TEXT NOT NULL, last_at TEXT NOT NULL, total INTEGER NOT NULL,
 prints INTEGER, copies INTEGER, source TEXT NOT NULL, reset_review INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(unit_id,printer_id));
CREATE TABLE IF NOT EXISTS readings(
 unit_id TEXT NOT NULL,printer_id TEXT NOT NULL,at TEXT NOT NULL,previous_at TEXT,
 total INTEGER NOT NULL,delta INTEGER NOT NULL,print_delta INTEGER,copy_delta INTEGER,
 PRIMARY KEY(unit_id,printer_id,at));
"""
def connect(file=DB):
    file=Path(file);file.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(file,timeout=10);db.executescript(SCHEMA)
    return db
def stamp(value):
    d=datetime.fromisoformat(value.replace("Z","+00:00"))
    if d.tzinfo is None:raise ValueError("Timezone required")
    return d.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
def printer_id(unit,r):
    if unit=="ilha-plaza" and r["endpointHost"]=="192.168.0.31" and r["profile"]=="canon-gx7100":
        key="enfoque|ilha-plaza|canon-gx7100|192.168.0.31"
    elif unit=="itaipu" and r["endpointHost"]=="192.168.2.100" and r.get("serial")=="BRBST9G0CS" and r["model"]=="HP Color LaserJet Pro MFP 4303":
        key="enfoque|itaipu|hp-4303|192.168.2.100|BRBST9G0CS"
    else:
        identity=("serial:"+r["serial"]+"|"+r["model"].split()[0].lower()) if r.get("serial") else "host:"+r["endpointHost"]+"|"+r["model"]
        key="enfoque|"+unit+"|"+identity
    return hashlib.sha256(key.encode()).hexdigest()
def load(name):
    spec=importlib.util.spec_from_file_location("enfoque_meter_"+name.replace("-","_"),ROOT/(name+".py"))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def bridge_existing(unit,r,device,pid):
    # Same printer identity and tables as the existing read-only server pollers.
    if unit["unitId"]=="ilha-plaza" and r["endpointHost"]=="192.168.0.31" and r["profile"]=="canon-gx7100":
        module=load("copier-counter-db")
        with sqlite3.connect("/opt/intranet-data/copier-counters.sqlite3",timeout=10) as db:
            module.upgrade(db)
            module.ingest(db,{"unitId":unit["unitId"],"unitName":unit["unitName"],
                "printerId":pid,"printerName":"Canon MAXIFY GX7100 - Ilha Plaza",
                "deviceUuid":device,"source":"device-copy-counter",
                "copyPages":r["copyPages"],"printPages":r["printPages"],"measuredAt":r["measuredAt"]})
    if unit["unitId"]=="itaipu" and r["endpointHost"]=="192.168.2.100" and r.get("serial")=="BRBST9G0CS" and r["model"]=="HP Color LaserJet Pro MFP 4303":
        hp=load("itaipu-hp4303-meter")
        with hp.connect() as db:
            hp.record(db,{"pages":r["totalPages"]},hp.parse_date(r["measuredAt"]),device)
def ingest(db,data,bridge=True):
    unit=data["unitId"];device=data["deviceUuid"]
    for r in sorted(data["readings"],key=lambda r:r["measuredAt"]):
        pid=printer_id(unit,r);when=stamp(r["measuredAt"])
        totals=[r["totalPages"],r.get("printPages"),r.get("copyPages")]
        with db:
            db.execute("BEGIN IMMEDIATE")
            prev=db.execute("SELECT last_at,total,prints,copies,reset_review FROM meters WHERE unit_id=? AND printer_id=?",(unit,pid)).fetchone()
            newer=not prev or when>prev[0]
            valid_bridge=not bool(prev and prev[4])
            if newer:
                reset=bool(prev and (prev[4] or any(v is not None and old is not None and v<old for v,old in zip(totals,prev[1:4]))))
                valid_bridge=not reset
                deltas=[None if v is None else (0 if not prev or reset or old is None else v-old)
                        for v,old in zip(totals,prev[1:4] if prev else [None]*3)]
                # Record the counter as-is, but require review before producing more deltas after a reset.
                db.execute("""INSERT INTO meters VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(unit_id,printer_id) DO UPDATE SET model=excluded.model,endpoint=excluded.endpoint,
 serial=excluded.serial,last_at=excluded.last_at,total=excluded.total,prints=excluded.prints,
 copies=excluded.copies,source=excluded.source,reset_review=excluded.reset_review""",
                    (unit,pid,r["model"],r["endpointHost"],r.get("serial",""),when,when,*totals,r["source"],int(reset)))
                db.execute("INSERT OR IGNORE INTO readings VALUES(?,?,?,?,?,?,?,?)",
                           (unit,pid,when,prev[0] if prev else None,totals[0],*deltas))
        if bridge and valid_bridge:
            bridge_existing({"unitId":unit,"unitName":data["unitName"]},r,device,pid)
    # Keep baselines and current meters; expire dated records at the supported reporting horizon.
    with db:db.execute("DELETE FROM readings WHERE at < ?",((datetime.now(timezone.utc)-timedelta(days=34)).isoformat().replace("+00:00","Z"),))
    return {"ok":True,"accepted":len(data["readings"])}
def summary(db,params,now=None):
    now=now or datetime.now(timezone.utc)
    first=date.fromisoformat(params["fromDate"]);last=date.fromisoformat(params["toDate"])
    if first>last or (last-first).days>30:raise ValueError("Invalid date range")
    start=stamp(datetime.combine(first,time(0),TZ).isoformat())
    end=stamp(datetime.combine(last+timedelta(days=1),time(0),TZ).isoformat())
    result=[]
    for unit,pid,model,host,serial,first_at,last_at,total,prints,copies,source,reset in db.execute("SELECT * FROM meters"):
        rows=db.execute("SELECT previous_at,delta,print_delta,copy_delta FROM readings WHERE unit_id=? AND printer_id=? AND at>=? AND at<?",(unit,pid,start,end)).fetchall()
        period=[0,0 if prints is not None else None,0 if copies is not None else None]
        partial=first_at>=start
        for previous,*deltas in rows:
            if previous and previous<start and any((v or 0)>0 for v in deltas):
                partial=True;continue
            for i,value in enumerate(deltas):
                if value is not None and period[i] is not None:period[i]+=value
        stale=(now-datetime.fromisoformat(last_at.replace("Z","+00:00"))).total_seconds()>1200 and last>=now.astimezone(TZ).date()
        result.append({"unitId":unit,"printerId":pid,"printerName":model,"endpointHost":host,
            "source":source,"counterType":"separated" if prints is not None and copies is not None else "print-and-copy-not-separated",
            "lifetimePages":total,"lifetimePrints":prints,"lifetimeCopies":copies,
            "periodPages":period[0],"periodPrints":period[1],"periodCopies":period[2],
            "firstReadAt":first_at,"lastReadAt":last_at,"partial":partial or bool(reset),
            "stale":stale,"resetReview":bool(reset)})
    return {"ok":True,"officeMeters":result}
if __name__=="__main__":
    command=sys.argv[1]
    with connect(Path(sys.argv[2]) if len(sys.argv)>2 else DB) as db:
        data=json.load(sys.stdin)
        result=ingest(db,data) if command=="ingest" else summary(db,data)
    print(json.dumps(result,separators=(",",":")))
