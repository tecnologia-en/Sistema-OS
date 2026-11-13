#!/usr/bin/env python3
"""Validate the staged driver package inside a disposable Debian 13 container.
Install dependencies normally or provide their official .deb data before this check.
No printer or host service is contacted and no print job is submitted.
"""
import argparse,hashlib,importlib.machinery,importlib.util,json,pathlib,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(path):
 loader=importlib.machinery.SourceFileLoader("auto_library051",str(path));spec=importlib.util.spec_from_loader(loader.name,loader)
 mod=importlib.util.module_from_spec(spec);loader.exec_module(mod);return mod
def validate(payload_root):
 auto=load(ROOT/"config/includes.chroot/usr/local/sbin/enfoque-printer-autosetup")
 library=auto.printer_library
 library.ROOT=payload_root/"usr/share/enfoque-printer-library"
 library.FILTER_ROOT=payload_root/"usr/lib/cups/filter"
 doc=library.load();paths=set()
 for profile in doc["profiles"]:
  path=library.verified_ppd(profile)
  assert path is not None,profile["model"]
  assert str(path) not in paths,"Duplicate PPD identity"
  paths.add(str(path))
 for path in library.FILTER_ROOT.glob("enfoque-lib-*"):
  proc=subprocess.run(["ldd","-r",str(path)],capture_output=True,text=True)
  assert proc.returncode==0 and "not found" not in proc.stdout+proc.stderr and "undefined symbol" not in proc.stdout+proc.stderr,path.name
 uris=["usb://ELGIN/i9?serial=fixture","usb://Bematech/MP-4200%20TH?serial=fixture","usb://Pantum/M6550?serial=fixture","usb://Pantum/M6550NW?serial=fixture"]
 created=[]
 def create(name,uri,driver,queues,dry_run=False,ppd=False):
  assert ppd and pathlib.Path(driver).is_file()
  created.append({"uri":uri,"ppd":str(driver)})
  return "would-create"
 auto.create_queue=create
 result=auto.provision_usb({},uris,True,drivers=[],serial_finder=lambda:[])
 assert len(created)==4,result
 assert auto.provision_usb({"Preservada":uris[0]},[uris[0]],False,drivers=[],serial_finder=lambda:[])==[(uris[0],"already-configured")]
 assert len(created)==4
 print(json.dumps({"profiles_verified":len(paths),"actual_bank_lookup":created,"existing_queue_preserved":True,"print_jobs_sent":0},indent=2))
def main():
 p=argparse.ArgumentParser();p.add_argument("--package",type=pathlib.Path,required=True);p.add_argument("--installed",action="store_true");args=p.parse_args()
 if args.installed:
  validate(pathlib.Path("/"))
 else:
  with tempfile.TemporaryDirectory(prefix="enfoque-driver-integration-") as temp:
   subprocess.run(["dpkg-deb","-x",str(args.package),temp],check=True)
   validate(pathlib.Path(temp))
if __name__=="__main__":main()
