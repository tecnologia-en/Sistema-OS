"""Read-only access to the release-packaged Enfoque printer bank."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import unicodedata

ROOT=Path("/usr/share/enfoque-printer-library")
FILTER_ROOT=Path("/usr/lib/cups/filter")

def normalize(label):
    label=unicodedata.normalize("NFKD",str(label)).encode("ascii","ignore").decode().lower()
    label=re.sub(r"\bhewlett[ -]?packard\b","hp",label)
    label=re.sub(r"([a-z])([0-9])",r"\1 \2",label)
    label=re.sub(r"([0-9])([a-z])",r"\1 \2",label)
    return " ".join(w for w in re.sub(r"[^a-z0-9]+"," ",label).split() if w not in ("series","serie"))

def identity(make,model):
    make=normalize(make);model=normalize(model)
    if model.startswith(make+" "):return model
    return make+" "+model

def secure_file(path,limit):
    stat=path.lstat()
    return (path.is_file() and not path.is_symlink() and stat.st_size<=limit
            and not stat.st_mode & 0o022 and (os.geteuid()!=0 or stat.st_uid==0))

def load(root=None):
    root=ROOT if root is None else Path(root)
    path=root/"catalog.json"
    if not secure_file(path,8_000_000):raise ValueError("Unsafe printer library")
    value=json.loads(path.read_text())
    if value.get("schema")!=1 or value.get("architecture")!="amd64":
        raise ValueError("Unsupported printer library")
    if not isinstance(value.get("models"),list) or not isinstance(value.get("profiles"),list):
        raise ValueError("Malformed printer library")
    if len(value["models"])>15000 or len(value["profiles"])>2000:raise ValueError("Oversized library")
    return value

def candidate_keys(label):
    # Only remove CUPS driver descriptions; never fuzzy-match neighboring model numbers.
    label=re.split(r",|\s+(?:Foomatic|CUPS\+|hpcups|Gutenprint)\b",str(label),maxsplit=1,flags=re.I)[0]
    key=normalize(label)
    return {key}

def lookup(label,document=None):
    try:document=load() if document is None else document
    except (OSError,ValueError,json.JSONDecodeError):return None
    keys=candidate_keys(label)
    profiles=[p for p in document["profiles"] if p.get("key") in keys]
    models=[m for m in document["models"] if identity(m.get("make",""),m.get("model","")) in keys]
    if not models and not profiles:return None
    return {"keys":keys,"profiles":profiles,"models":models}

def verified_ppd(profile,root=None,filter_root=None):
    root=ROOT if root is None else Path(root)
    filter_root=FILTER_ROOT if filter_root is None else Path(filter_root)
    # JSON supplies only an opaque file ID; it cannot choose arbitrary filesystem paths.
    filename=Path(profile.get("ppd","")).name
    if not re.fullmatch(r"[0-9a-f]{20}\.ppd\.gz",filename):return None
    path=root/"ppd"/filename
    try:
        if not secure_file(path,1_000_000):return None
        data=path.read_bytes()
        if hashlib.sha256(data).hexdigest()!=profile.get("sha256"):return None
        with gzip.open(path,"rb") as stream:text=stream.read(2_000_001)
        if len(text)>2_000_000:return None
        filters=re.findall(r'^\*cups(?:Pre)?Filter2?:\s*"[^"]*\s+([^\s"]+)"',text.decode("latin1"),re.M)
        if not filters or sorted(set(filters))!=profile.get("filters"):return None
        for name in filters:
            if not re.fullmatch(r"enfoque-lib-[A-Za-z0-9_.-]+",name):return None
            binary=filter_root/name
            if not secure_file(binary,40_000_000) or not os.access(binary,os.X_OK):return None
        # The builder validates dependencies/PPDs; recheck before creating a queue.
        proc=subprocess.run(["/usr/bin/cupstestppd","-q","-I","filters","-W","translations",str(path)],
                            capture_output=True,timeout=10)
        return path if proc.returncode==0 else None
    except (OSError,ValueError,EOFError,subprocess.TimeoutExpired):return None

def verified_installed_driver(identifier):
    if not isinstance(identifier,str) or len(identifier)>512 or identifier.startswith("-") or any(c.isspace() or ord(c)<32 for c in identifier):
        return False
    try:
        generated=subprocess.run(["/usr/lib/cups/daemon/cups-driverd","cat",identifier],capture_output=True,timeout=15)
        if generated.returncode or not generated.stdout.startswith(b"*PPD-Adobe:") or len(generated.stdout)>2_000_000:
            return False
        text=generated.stdout.decode("latin1")
        filters=re.findall(r'^\*cups(?:Pre)?Filter2?:\s*"[^"]*\s+([^\s"]+)"',text,re.M)
        for name in filters:
            if name=="-":continue
            if not re.fullmatch(r"[A-Za-z0-9_.-]+",name):return False
            binary=(FILTER_ROOT/name).resolve(strict=True)
            if not secure_file(binary,40_000_000) or not os.access(binary,os.X_OK):return False
        checked=subprocess.run(["/usr/bin/cupstestppd","-q","-I","filters","-W","translations","-"],
                               input=generated.stdout,capture_output=True,timeout=10)
        return checked.returncode==0
    except (OSError,ValueError,subprocess.TimeoutExpired):return False

def select(label,drivers,document=None):
    match=lookup(label,document)
    if not match:return None
    for profile in match["profiles"]:
        path=verified_ppd(profile)
        if path:return path,True
    for identifier,description in drivers:
        if candidate_keys(description)&match["keys"] and verified_installed_driver(identifier):
            return identifier,False
    return None
