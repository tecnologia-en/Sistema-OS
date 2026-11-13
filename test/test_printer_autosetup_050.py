"""Release 0.2.51 - safe CUPS autosetup tests."""
import importlib.machinery, importlib.util, json, tempfile, unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
INC=ROOT/"config/includes.chroot"
SRC=INC/"usr/local/sbin/enfoque-printer-autosetup"
loader=importlib.machinery.SourceFileLoader("enfoque_print_auto_050",str(SRC))
spec=importlib.util.spec_from_loader(loader.name,loader)
mod=importlib.util.module_from_spec(spec)
loader.exec_module(mod)

def source_catalog():
 # GitHub builds in Docker as root but repository bind mounts belong to the
 # unprivileged runner. Test the source fixture as a runner-owned document;
 # real service still rejects non-root configuration when euid=0.
 with mock.patch.object(mod.os, "geteuid", return_value=1000):
  return mod.load_catalog(INC/"etc/enfoque-os/drivers/printer-catalog.json")

class PrinterAuto050(unittest.TestCase):
 def test_package_and_timer(self):
  self.assertIn('VERSION="0.2.51"',(INC/"etc/enfoque-os-release").read_text())
  self.assertIn('PACKAGE_REVISION="1"',(INC/"etc/enfoque-os-release").read_text())
  self.assertTrue((INC/"etc/systemd/system/enfoque-printer-autosetup.service").is_file())
  self.assertIn("OnBootSec=2min",(INC/"etc/systemd/system/enfoque-printer-autosetup.timer").read_text())
  self.assertIn("enfoque-printer-autosetup.timer",(ROOT/"scripts/build-update-package.py").read_text())
  self.assertIn('run(["/usr/local/sbin/enfoque-printer-autosetup","--scan"]',(INC/"usr/local/sbin/enfoque-plugplay").read_text())

 def test_newest_canfoque_is_pinned_and_staged(self):
  script=(ROOT/"scripts/stage-canfoque-iso.sh").read_text()
  self.assertIn("Canfoque-Pilot-2.0.0-beta.1-x86_64.AppImage",script)
  self.assertIn("ca87493fe0cbc33f11ed0495807821d64e67b53c0572a325ef3e288e2e0053af",script)
  self.assertIn("opt/enfoque/canfoque-pilot.AppImage",(ROOT/"scripts/build-update-package.py").read_text())

 def test_catalog_only_approved_ips(self):
  x=source_catalog()
  self.assertEqual(len(x["networks"]["centro"]),5)
  self.assertEqual(len(x["networks"]["ilha-plaza"]),1)
  self.assertNotIn("itaipu",x["networks"])
  self.assertTrue(all(mod.valid_ipp(v["uri"]) for p in x["networks"].values() for v in p))
  for url in ("ipp://8.8.8.8/ipp/print","http://192.168.0.31/ipp/print",
              "ipp://192.168.0.31/evil","ipp://127.0.0.1/ipp/print"):
   self.assertFalse(mod.valid_ipp(url))

 def test_reject_bad_catalog(self):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t)/"cat.json"
   f.write_text(json.dumps({"schema":1,"networks":{"centro":[{"name":"Enfoque_Wrong","uri":"ipp://8.8.8.8/ipp/print"}]}}))
   with self.assertRaises(ValueError):mod.load_catalog(f)
   f.write_text(json.dumps({"schema":1,"networks":{"centro":[{"name":"Enfoque_Valid","uri":"ipp://192.168.111.92/ipp/print"}]}}))
   f.chmod(0o666)
   with self.assertRaises(ValueError):mod.load_catalog(f)

 def test_catalog_requires_root_owner_in_service(self):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t)/"unsafe.json"
   f.write_text('{"schema":1,"networks":{}}')
   with mock.patch.object(mod.os,"geteuid",return_value=0):
    with mock.patch.object(Path,"stat",autospec=True,side_effect=lambda *args, **kwargs: mock.Mock(st_uid=1000,st_mode=0o100644,st_size=20)):
     with self.assertRaises(ValueError):mod.trusted_json(f)

 def test_profile_unit(self):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t)/"firstboot.json"
   f.write_text('{"schema":1,"unitId":"centro"}')
   self.assertEqual(mod.load_profile(f),"centro")
   f.write_text('{"schema":1,"unitId":"invalid"}')
   self.assertIsNone(mod.load_profile(f))

 def test_isolate_stores(self):
  x=source_catalog()
  with mock.patch.object(mod,"create_queue",return_value="would-create") as create:
   self.assertEqual(len(mod.provision_network("centro",x,{},True,reachable=lambda h:True)),5)
   self.assertTrue(all("192.168.111." in r.args[1] for r in create.call_args_list))
   create.reset_mock()
   self.assertEqual(len(mod.provision_network("ilha-plaza",x,{},True,reachable=lambda h:True)),1)
   self.assertIn("192.168.0.31",create.call_args.args[1])

 def test_network_no_duplicate_and_offline(self):
  x=source_catalog()
  q={"Existing":"ipp://192.168.0.31/ipp/print"}
  with mock.patch.object(mod,"create_queue",side_effect=AssertionError("duplicate")):
   self.assertEqual(mod.provision_network("ilha-plaza",x,q,False),
                    [("Enfoque_Canon_GX7100_Rede","already-configured")])
  self.assertEqual(mod.provision_network("ilha-plaza",x,{},False,reachable=lambda h:False)[0][1],
                   "offline-or-not-local")

 def test_no_default_or_print(self):
  with mock.patch.object(mod,"run",return_value=(0,"","")) as call,mock.patch.object(mod,"audit"):
   q={}
   self.assertEqual(mod.create_queue("Enfoque_Test","ipp://192.168.0.31/ipp/print","everywhere",q),"created")
   argv=call.call_args.args[0]
   self.assertEqual(argv[0],"/usr/sbin/lpadmin")
   self.assertEqual(argv[argv.index("-m")+1],"everywhere")
   self.assertNotIn("-d",argv)
   self.assertNotIn("/usr/bin/lp",argv)
   self.assertEqual(mod.create_queue("Enfoque_Test","ipp://192.168.0.31/ipp/print","everywhere",q),"already-configured")

 def test_empty_cups_destinations(self):
  with mock.patch.object(mod,"run",return_value=(1,"","lpstat: No destinations added.")):
   self.assertEqual(mod.list_queues(),{})
  with mock.patch.object(mod,"run",return_value=(1,"","Connection refused")):
   self.assertIsNone(mod.list_queues())
  with mock.patch.object(mod,"run",return_value=(0,"dispositivo de Elgin: usb://ELGIN/i9?serial=1\n","")):
   self.assertEqual(mod.list_queues()["Elgin"],"usb://ELGIN/i9?serial=1")

 def test_thermal_driver_and_serial(self):
  self.assertEqual(mod.model_key("ELGIN i9"),("elgin","i9"))
  self.assertEqual(mod.model_key("Bematech MP-4200 TH"),("bematech","mp 4200"))
  serial=[("serial:/dev/serial/by-id/usb-Bematech_MP-4200_TH?baud=115200",("bematech","mp 4200"))]
  drivers=[("drv:///elgin/i9.ppd","ELGIN i9, 1.2.3"),
           ("drv:///bematech/mp4200.ppd","Bematech MP-4200 TH")]
  with mock.patch.object(mod,"create_queue",return_value="would-create") as create:
   res=mod.provision_usb({},["usb://ELGIN/i9?serial=1"],True,drivers=drivers,
                         ppd_finder=lambda kind:None,serial_finder=lambda:serial)
   self.assertEqual(len(res),2)
   self.assertEqual(create.call_count,2)
   self.assertTrue(all(r.args[2].startswith("drv:///") for r in create.call_args_list))

 def test_unknown_thermal_is_pending(self):
  with mock.patch.object(mod,"audit"),mock.patch.object(mod,"create_queue",side_effect=AssertionError("RAW forbidden")):
   res=mod.provision_usb({},["usb://ELGIN/i9"],True,drivers=[],
                         ppd_finder=lambda kind:None,serial_finder=lambda:[])
   self.assertEqual(res[0][1],"driver-required")

 def test_unique_ipp_over_usb(self):
  u="ipp://localhost:60000/ipp/print"
  with mock.patch.object(mod,"create_queue",return_value="would-create") as create:
   self.assertEqual(mod.provision_usb({},[u],True,drivers=[],serial_finder=lambda:[]),[(u,"would-create")])
   create.reset_mock()
   self.assertEqual(mod.provision_usb({},[u,"ipp://localhost:60001/ipp/print"],True,
                     drivers=[],serial_finder=lambda:[]),[("ipp-over-usb","multiple-endpoints")])
   create.assert_not_called()

 def test_preserve_existing_usb_queue(self):
  with mock.patch.object(mod,"audit"),mock.patch.object(mod,"create_queue",side_effect=AssertionError("duplicate")):
   r=mod.provision_usb({"Elgin_IT":"usb://ELGIN/i9?serial=123"},["usb://ELGIN/i9?serial=123"],
                       True,drivers=[],serial_finder=lambda:[])
   self.assertEqual(r[0][1],"already-configured")
if __name__=="__main__":unittest.main()
