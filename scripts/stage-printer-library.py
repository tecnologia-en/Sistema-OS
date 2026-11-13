#!/usr/bin/env python3
"""Build a namespaced amd64 driver package from the pinned Enfoque server library.
Reads data archives only: no vendor installer, udev rule, scanner or backend is run/copied.
"""
import argparse, gzip, hashlib, io, json, pathlib, re, shutil, struct
import subprocess, tarfile, tempfile, urllib.request, zipfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
_RELEASE_TEXT=(ROOT/"config/includes.chroot/etc/enfoque-os-release").read_text()
_VERSION_MATCH=re.search(r'^VERSION="([0-9]+[.][0-9]+[.][0-9]+)"$',_RELEASE_TEXT,re.M)
_REVISION_MATCH=re.search(r'^PACKAGE_REVISION="([1-9][0-9]*)"$',_RELEASE_TEXT,re.M)
if not _VERSION_MATCH or not _REVISION_MATCH:
    raise ValueError("Invalid Enfoque OS release version for printer drivers")
VERSION=_VERSION_MATCH.group(1)
REVISION=_REVISION_MATCH.group(1)
PACKAGE="enfoque-printer-drivers"
DATA=pathlib.Path("usr/share/enfoque-printer-library")
FILTERS=pathlib.Path("usr/lib/cups/filter")

def sha(data): return hashlib.sha256(data).hexdigest()

def verified_artifact(item, source, cache):
    path=source/item["arquivo"] if source else cache/pathlib.Path(item["arquivo"]).name
    if not path.is_file():
        if source: raise ValueError("Source artifact missing: "+str(path))
        path.parent.mkdir(parents=True,exist_ok=True)
        request=urllib.request.Request(item["url"],headers={"User-Agent":"Mozilla/5.0","Referer":"https://global.pantum.com/","Accept-Encoding":"identity"})
        with urllib.request.urlopen(request,timeout=90) as response:
            data=response.read(400_000_001)
        if len(data)>400_000_000:raise ValueError("Artifact exceeds limit")
        if sha(data)!=item["sha256"]:raise ValueError("Download SHA256 mismatch")
        path.write_bytes(data)
    data=path.read_bytes()
    if sha(data)!=item["sha256"]:raise ValueError("Source SHA256 mismatch: "+str(path))
    return data

def deb_members(data):
    with tempfile.TemporaryDirectory(prefix="enfoque-deb-read-") as temp:
        p=pathlib.Path(temp)/"source.deb";p.write_bytes(data)
        raw=subprocess.check_output(["dpkg-deb","--fsys-tarfile",str(p)])
    result={}
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in archive.getmembers():
            if member.isfile() and member.size<=40_000_000:
                name=member.name.removeprefix("./")
                result[name]=archive.extractfile(member).read()
    return result

def elf64(data):
    return data[:5]==b"\x7fELF\x02" and data[5]==1 and struct.unpack("<H",data[18:20])[0]==62

def normalize(label):
    import unicodedata
    label=unicodedata.normalize("NFKD",label).encode("ascii","ignore").decode().lower()
    label=re.sub(r"\b(hewlett[ -]?packard)\b","hp",label)
    label=re.sub(r"([a-z])([0-9])",r"\1 \2",label)
    label=re.sub(r"([0-9])([a-z])",r"\1 \2",label)
    words=re.sub(r"[^a-z0-9]+"," ",label).split()
    return " ".join(w for w in words if w not in ("series","serie"))

def build(source, output, cache, validate=False):
    if validate and not shutil.which("cupstestppd"):raise ValueError("cups-client required for build validation")
    lock=json.loads((ROOT/"config/printer-library.lock.json").read_text())
    inventory=json.loads((ROOT/"config/printer-library-models.json").read_text())
    blobs={k:verified_artifact(v,source,cache) for k,v in lock["artifacts"].items()}
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="enfoque-printer-stage-") as temp:
        tree=pathlib.Path(temp)/"root";tree.mkdir()
        catalog={"schema":1,"version":VERSION,"architecture":"amd64",
                 "source":lock["source"],"source_models_sha256":inventory["source_models_sha256"],
                 "models":inventory["models"],"profiles":[],"rejected_profiles":[],"artifacts":lock["artifacts"]}
        def put(name,data,mode=0o644):
            path=tree/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);path.chmod(mode)
        def filter_file(name,data):
            if not elf64(data):raise ValueError("Not an amd64 ELF filter: "+name)
            name="enfoque-lib-"+name
            put(FILTERS/name,data,0o755)
            if validate:
                check=subprocess.run(["ldd","-r",str(tree/FILTERS/name)],capture_output=True,text=True)
                if check.returncode or "not found" in check.stdout+check.stderr or "undefined symbol" in check.stdout+check.stderr:
                    raise ValueError("Unresolved native dependencies: "+name+" "+check.stdout+check.stderr)
            return name
        def ppd(data,brand,source_id,filter_map,alias=None):
            if data[:2]==b"\x1f\x8b":data=gzip.decompress(data)
            text=data.decode("latin1")
            # Remove an incomplete optional Chinese translation from official Elgin PPDs.
            text=re.sub(r"^\*(?:cupsLanguages|zh\.[^:]+):[^\r\n]*\r?\n","",text,flags=re.M)
            # Bematech PDF shell path is obsolete; let standard cups-filters rasterize.
            if source_id=="bematech":
                text=re.sub(r'^\*cupsFilter:\s*"application/vnd.cups-pdf[^\n]+\n',"",text,flags=re.M)
                text=re.sub(r'^\*(ModelName|NickName):[^\r\n]*',lambda m:'*'+m[1]+': "Bematech MP-4200 TH 80mm"',text,flags=re.M)
            if source_id=="elgin" and alias=="MP-4200 HS":
                text=re.sub(r'^\*(ModelName|NickName):[^\r\n]*',lambda m:'*'+m[1]+': "Bematech MP-4200 HS"',text,flags=re.M)
            for original,replacement in filter_map.items():
                text=re.sub(r'(\*cups(?:Pre)?Filter2?:[^\r\n]*\s)'+re.escape(original)+r'(")',lambda m:m[1]+replacement+m[2],text)
            options={}
            for key,choice in re.findall(r'^\*([A-Za-z][A-Za-z0-9]*)\s+([^/\s:]+)(?:/[^:]*)?:',text,re.M):
                options.setdefault(key,[]).append(choice)
            if "End" in options.get("Drawer",[]) and "Off" in options.get("Drawer2",[]):
                defaults={"Drawer":"End","Drawer2":"Off"}
            elif "2" in options.get("Drawer1",[]) and "0" in options.get("Drawer2",[]):
                defaults={"Drawer1":"2","Drawer2":"0"}
            else:defaults={}
            for key,value in defaults.items():
                text=re.sub(r'^\*Default'+key+r':[^\r\n]*','*Default'+key+': '+value,text,flags=re.M)
            needed=re.findall(r'^\*cups(?:Pre)?Filter2?:\s*"[^"]*\s+([^\s"]+)"',text,re.M)
            if not needed or any(not (tree/FILTERS/f).is_file() for f in needed):
                return
            model=re.search(r'^\*ModelName:\s*"([^"]+)"',text,re.M)
            if not model:return
            device=re.search(r'^\*1284DeviceID:\s*"([^"]+)"',text,re.M)
            mdl=re.search(r'MDL:([^;]+)',device[1]) if device else None
            logical=alias or (mdl[1] if mdl else model[1])
            logical_normal=normalize(logical)
            make_normal=normalize(brand)
            identity=logical_normal if logical_normal.startswith(make_normal+" ") else make_normal+" "+logical_normal
            if any(x["key"]==identity for x in catalog["profiles"]):return
            ident=sha((source_id+"\0"+model[1]+"\0"+identity).encode())[:20]
            relative=DATA/"ppd"/(ident+".ppd.gz")
            packed=gzip.compress(text.encode("latin1"),mtime=0);put(relative,packed)
            if validate:
                checked=subprocess.run(["cupstestppd","-I","filters","-W","translations",str(tree/relative)],capture_output=True,text=True)
                if checked.returncode:
                    catalog["rejected_profiles"].append({"make":brand,"model":logical,"source_artifact":source_id,"reason":(checked.stdout+checked.stderr)[-1800:]})
                    (tree/relative).unlink()
                    return
            catalog["profiles"].append({"key":identity,"make":brand,"model":logical,
                "ppd":str(pathlib.Path("/")/relative),"sha256":sha(packed),
                "filters":sorted(set(needed)),"defaults":defaults,"source_artifact":source_id,
                "syntax_validation":"passed" if validate else "runtime-required","physical_validation":"pending"})
        bema=deb_members(blobs["bematech"])
        bmap={"rastertobema":filter_file("bematech-raster",bema["opt/bematech/cups/lib/filter/rastertobema"])}
        ppd(bema["opt/bematech/ppds/MP4200_80mm.ppd.gz"],"Bematech","bematech",bmap,alias="MP-4200 TH")
        with zipfile.ZipFile(io.BytesIO(blobs["elgin"])) as archive:
            n=next(n for n in archive.namelist() if n.endswith("/setup/x64/rastertohprt"))
            emap={"rastertohprt":filter_file("elgin125-raster",archive.read(n))}
            for name,alias in [("i9.ppd","i9"),("i8.ppd","i8"),("mp-4200hs.ppd","MP-4200 HS")]:
                n=next(n for n in archive.namelist() if n.endswith("/ppd/"+name))
                ppd(archive.read(n),"Bematech" if alias.startswith("MP") else "Elgin","elgin",emap,alias=alias)
        with zipfile.ZipFile(io.BytesIO(blobs["pantum"])) as archive:
            n=next(n for n in archive.namelist() if n.endswith("_amd64.deb"))
            pantum=deb_members(archive.read(n))
            license_name=next(n for n in archive.namelist() if n.endswith("/en_US.UTF-8/license.txt"))
            put(pathlib.Path("usr/share/doc")/PACKAGE/"pantum-license.txt",archive.read(license_name))
        pmap={}
        for name,data in pantum.items():
            if name.startswith("usr/lib/cups/filter/"):
                pmap[pathlib.Path(name).name]=filter_file("pantum186-"+pathlib.Path(name).name,data)
        # The print filters load this vendor CMS library by its fixed absolute pathname.
        cms="opt/pantum/lib/CMSlib/libGDIPrintCMSLib-amd64.so"
        if not elf64(pantum[cms]):raise ValueError("Invalid Pantum CMS architecture")
        put(pathlib.Path(cms),pantum[cms])
        for name,data in pantum.items():
            if name.startswith("usr/share/cups/model/") and name.endswith(".ppd"):
                ppd(data,"Pantum","pantum",pmap)
        put(DATA/"catalog.json",(json.dumps(catalog,ensure_ascii=False,separators=(",",":"))+"\n").encode())
        put(pathlib.Path("usr/share/doc")/PACKAGE/"SOURCE.json",json.dumps(lock,indent=2).encode())
        control=(f"Package: {PACKAGE}\nVersion: {VERSION}-{REVISION}\nArchitecture: amd64\n"
                 "Maintainer: Enfoque TI\nSection: text\nPriority: optional\n"
                 "Conflicts: pantum\n"
                 "Depends: cups, cups-filters, libcups2t64, libcupsimage2t64, libusb-1.0-0, libstdc++6, libgssapi-krb5-2, libkrb5-3, libk5crypto3, libcom-err2, zlib1g, libcrypt1\n"
                 "Description: Enfoque verified printer-library snapshot for Debian 13 amd64\n"
                 " Model inventory and isolated print-only filters; no vendor installation scripts.\n")
        put(pathlib.Path("DEBIAN/control"),control.encode())
        target=output/f"{PACKAGE}_{VERSION}-{REVISION}_amd64.deb"
        subprocess.run(["dpkg-deb","--root-owner-group","--build",str(tree),str(target)],check=True)
        report={"package":str(target),"sha256":sha(target.read_bytes()),"models":len(catalog["models"]),"native_profiles":len(catalog["profiles"]),"rejected_profiles":len(catalog["rejected_profiles"]),"build_validated":validate}
        (output/"printer-library-build.json").write_text(json.dumps(report,indent=2)+"\n")
        print(json.dumps(report))
        return target

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=pathlib.Path)
    parser.add_argument("--output",type=pathlib.Path,default=ROOT/"config/packages.chroot")
    parser.add_argument("--cache",type=pathlib.Path,default=ROOT/".build/printer-sources")
    parser.add_argument("--validate",action="store_true",help="Require cupstestppd and resolve every native filter dependency")
    args=parser.parse_args();build(args.source,args.output,args.cache,args.validate)
