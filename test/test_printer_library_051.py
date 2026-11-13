"""0.2.51 bank integration: exact models, verified payloads and preserved queues."""
import gzip,hashlib,importlib.machinery,importlib.util,json,os,tempfile,unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
INC=ROOT/"config/includes.chroot"
def module(name,path):
 loader=importlib.machinery.SourceFileLoader(name,str(path))
 spec=importlib.util.spec_from_loader(name,loader);obj=importlib.util.module_from_spec(spec);loader.exec_module(obj);return obj
bank=module("bank051",INC/"usr/local/lib/enfoque-printer-library/lookup.py")
auto=module("auto051",INC/"usr/local/sbin/enfoque-printer-autosetup")
stage=module("stage051",ROOT/"scripts/stage-printer-library.py")
class PrinterBank051(unittest.TestCase):
 def doc(self):
  return {"schema":1,"architecture":"amd64","models":[{"make":"Pantum","model":"Pantum M6550-Series","packages":[]}],"profiles":[]}
 def test_exact_identity_and_series(self):
  self.assertIsNotNone(bank.lookup("Pantum M6550",self.doc()))
  self.assertIsNone(bank.lookup("Pantum M6550NW",self.doc()))
  self.assertIsNone(bank.lookup("Pantum M6551",self.doc()))
  self.assertEqual(bank.identity("HP","HP Color LaserJet 2600n"),bank.normalize("Hewlett-Packard Color LaserJet 2600n"))
 def test_no_fuzzy_native_variant(self):
  self.assertIsNone(auto.model_key("Bematech MP-4200 HS"))
  self.assertIsNone(auto.model_key("ELGIN i9 FULL 2"))
 def test_installed_driver_must_match_exact_bank_identity(self):
  doc=self.doc()
  self.assertIsNone(bank.select("Pantum M6550",[("wrong","Pantum M6551")],doc))
  with mock.patch.object(bank,"verified_installed_driver",return_value=True):
   self.assertEqual(bank.select("Pantum M6550",[("right","Pantum M6550-Series, 1.0")],doc),("right",False))
 def test_secure_catalog_architecture_and_permissions(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/"catalog.json";path.write_text(json.dumps(self.doc()))
   self.assertEqual(bank.load(d)["schema"],1)
   path.chmod(0o666)
   with self.assertRaises(ValueError):bank.load(d)
   path.chmod(0o644);doc=self.doc();doc["architecture"]="i386";path.write_text(json.dumps(doc))
   with self.assertRaises(ValueError):bank.load(d)
 def fixture(self,root):
  root=Path(root);(root/"ppd").mkdir();(root/"filters").mkdir()
  name="enfoque-lib-test"
  filter=root/"filters"/name;filter.write_bytes(b"fixture");filter.chmod(0o755)
  data=gzip.compress(b'*PPD-Adobe: "4.3"\n*cupsFilter: "application/vnd.cups-raster 0 enfoque-lib-test"\n',mtime=0)
  ppd=root/"ppd"/("a"*20+".ppd.gz");ppd.write_bytes(data)
  return ppd,filter,{"ppd":str(ppd),"sha256":hashlib.sha256(data).hexdigest(),"filters":[name]}
 def test_ppd_hash_filters_and_syntax_are_verified(self):
  with tempfile.TemporaryDirectory() as d:
   ppd,filter,profile=self.fixture(d)
   with mock.patch.object(bank.subprocess,"run",return_value=mock.Mock(returncode=0)):
    self.assertEqual(bank.verified_ppd(profile,d,Path(d)/"filters"),ppd)
    ppd.write_bytes(ppd.read_bytes()+b"tampered")
    self.assertIsNone(bank.verified_ppd(profile,d,Path(d)/"filters"))
 def test_missing_filter_or_bad_ppd_is_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   ppd,filter,profile=self.fixture(d)
   with mock.patch.object(bank.subprocess,"run",return_value=mock.Mock(returncode=1)):
    self.assertIsNone(bank.verified_ppd(profile,d,Path(d)/"filters"))
   filter.unlink()
   self.assertIsNone(bank.verified_ppd(profile,d,Path(d)/"filters"))
 def test_ppd_paths_and_symlinks_cannot_choose_arbitrary_files(self):
  with tempfile.TemporaryDirectory() as d:
   ppd,filter,profile=self.fixture(d);profile["ppd"]="../../etc/passwd"
   self.assertIsNone(bank.verified_ppd(profile,d,Path(d)/"filters"))
   profile["ppd"]=str(ppd);ppd.unlink();ppd.symlink_to("/etc/passwd")
   self.assertIsNone(bank.verified_ppd(profile,d,Path(d)/"filters"))
 def test_new_usb_model_uses_bank(self):
  uri="usb://Pantum/M6550?serial=123"
  with mock.patch.object(auto.printer_library,"lookup",return_value={"models":[1]}),mock.patch.object(auto.printer_library,"select",return_value=(Path("/verified/model.ppd.gz"),True)),mock.patch.object(auto,"create_queue",return_value="would-create") as create:
   result=auto.provision_usb({},[uri],True,drivers=[],serial_finder=lambda:[])
   self.assertEqual(result,[(uri,"would-create")])
   self.assertTrue(create.call_args.kwargs["ppd"])
 def test_existing_usb_never_queries_or_changes_driver(self):
  uri="usb://Pantum/M6550?serial=123"
  with mock.patch.object(auto.printer_library,"lookup",side_effect=AssertionError("must preserve")),mock.patch.object(auto,"create_queue",side_effect=AssertionError("must preserve")):
   self.assertEqual(auto.provision_usb({"IT_queue":uri},[uri],False,drivers=[],serial_finder=lambda:[]),[(uri,"already-configured")])
 def test_unavailable_driver_stays_pending(self):
  with mock.patch.object(auto.printer_library,"lookup",return_value={"models":[1]}),mock.patch.object(auto.printer_library,"select",return_value=None),mock.patch.object(auto,"audit"),mock.patch.object(auto,"create_queue",side_effect=AssertionError("no RAW")):
   result=auto.provision_usb({},["usb://Pantum/M6550"],True,drivers=[],serial_finder=lambda:[])
   self.assertEqual(result[0][1],"driver-required")
 def test_source_hash_is_mandatory(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/"driver.zip").write_bytes(b"unexpected")
   with self.assertRaises(ValueError):stage.verified_artifact({"arquivo":"driver.zip","sha256":"0"*64},Path(d),Path(d))
 def test_inventory_came_from_server_and_release_packages_it(self):
  doc=json.loads((ROOT/"config/printer-library-models.json").read_text())
  self.assertGreater(len(doc["models"]),3500)
  self.assertEqual(doc["source"],"/srv/biblioteca-drivers-impressoras")
  self.assertIn("enfoque-printer-drivers",(ROOT/"scripts/build-update-package.py").read_text())
  self.assertIn("stage-printer-library.py",(ROOT/"scripts/build-iso.sh").read_text())
 def test_network_native_fallback_uses_exact_inventory_model(self):
  catalog={"networks":{"centro":[{"name":"Enfoque_Pantum","uri":"ipp://192.168.111.92/ipp/print","make":"Pantum","model":"M6550"}]}}
  with mock.patch.object(auto,"create_queue",side_effect=["failed","would-create"]) as create,mock.patch.object(auto,"list_queues",return_value={}),mock.patch.object(auto,"installed_drivers",return_value=[]),mock.patch.object(auto.printer_library,"select",return_value=(Path("/verified.ppd.gz"),True)) as select:
   result=auto.provision_network("centro",catalog,{},False,reachable=lambda host:True)
   self.assertEqual(result[0][1],"would-create")
   select.assert_called_once_with("Pantum M6550",[])
   self.assertTrue(create.call_args.kwargs["ppd"])
 def test_network_partial_queue_is_never_overwritten(self):
  uri="ipp://192.168.111.92/ipp/print"
  catalog={"networks":{"centro":[{"name":"Enfoque_Pantum","uri":uri,"make":"Pantum","model":"M6550"}]}}
  with mock.patch.object(auto,"create_queue",return_value="failed") as create,mock.patch.object(auto,"list_queues",return_value={"Enfoque_Pantum":uri}),mock.patch.object(auto.printer_library,"select",side_effect=AssertionError("no overwrite")):
   auto.provision_network("centro",catalog,{},False,reachable=lambda host:True)
   self.assertEqual(create.call_count,1)
if __name__=="__main__":unittest.main()
