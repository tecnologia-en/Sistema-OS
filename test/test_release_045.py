"""Enfoque OS 0.2.45: controlled USB PnP and thermal CUPS defaults."""
from release_contract import assert_minimum_release
import importlib.machinery
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import os
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
INC=ROOT/"config/includes.chroot"
def load(name,path):
    loader=importlib.machinery.SourceFileLoader(name,str(path))
    spec=importlib.util.spec_from_loader(name,loader)
    mod=importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod
plug=load("test_plugplay045",INC/"usr/local/sbin/enfoque-plugplay")
thermal=load("test_thermal045",INC/"usr/local/sbin/enfoque-thermal-print")
chrome=load("test_chrome045",INC/"usr/local/sbin/enfoque-thermal-chrome")
CATALOG=INC/"etc/enfoque-os/drivers/catalog.json"

ELGIN_PPD='''*PPD-Adobe: "4.3"
*NickName: "ELGIN i9, 1.2.3"
*DefaultPageSize: Roll80mm
*PageSize Roll80mm: "<</PageSize[204 842]>>setpagedevice"
*cupsFilter: "application/vnd.cups-raster 100 rastertohprt"
'''
BEMATECH_PPD='''*PPD-Adobe: "4.3"
*NickName: "Bematech MP-4200 TH"
*DefaultPageSize: Roll80mm
*PageSize Roll80mm: "<</PageSize[204 842]>>setpagedevice"
*cupsFilter: "application/vnd.cups-raster 100 rastertoescpos"
'''
A4_PPD='''*PPD-Adobe: "4.3"
*NickName: "Canon GX7100"
*DefaultPageSize: A4
*PageSize A4: "<</PageSize[595 842]>>setpagedevice"
*cupsFilter: "application/vnd.cups-raster 100 rastertoescpos"
'''
LABEL_PPD='''*PPD-Adobe: "4.3"
*NickName: "Zebra Label Thermal"
*DefaultPageSize: Roll80mm
*PageSize Roll80mm: "<</PageSize[204 842]>>setpagedevice"
*cupsFilter: "application/vnd.cups-raster 100 rastertoescpos"
'''

class Release045(unittest.TestCase):
    def test_version_and_policy(self):
        release=(INC/"etc/enfoque-os-release").read_text()
        assert_minimum_release(self,release)
        self.assertIn('PACKAGE_REVISION="1"',release)
        self.assertEqual(json.loads((INC/"etc/opt/chrome/policies/managed/82-enfoque-thermal-print.json").read_text()),{"PrintHeaderFooter":False})
        self.assertNotIn('"scaling"',(INC/"etc/opt/chrome/policies/managed/82-enfoque-thermal-print.json").read_text())

    def test_usb_id_and_interface_match_real_elgin(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            dev=root/"1-3.2"
            dev.mkdir()
            (dev/"idVendor").write_text("20d1")
            (dev/"idProduct").write_text("7008")
            (dev/"manufacturer").write_text("ELGIN")
            (dev/"product").write_text("i9")
            iface=root/"1-3.2:1.0"
            iface.mkdir()
            (iface/"bInterfaceClass").write_text("07")
            info=plug.detect_usb("1-3.2",root)
            self.assertEqual(info["vid"],"20d1")
            self.assertEqual(info["pid"],"7008")
            self.assertEqual(info["classes"],["07"])
            plan=plug.match(info,json.loads(CATALOG.read_text()))
            self.assertIn("thermal-printer",plan["categories"])
            self.assertIn("cups",plan["packages"])
            self.assertEqual(plan["modules"],[])
            with self.assertRaises(ValueError):
                plug.detect_usb("../../etc/passwd",root)

    def test_class_fallback_on_unlisted_hardware(self):
        doc=json.loads(CATALOG.read_text())
        a=plug.match({"vid":"0123","pid":"4567","classes":["03"],"productName":"Teclado"},doc)
        b=plug.match({"vid":"1111","pid":"2222","classes":["08"],"productName":"Pendrive"},doc)
        c=plug.match({"vid":"1111","pid":"2223","classes":["0e"],"productName":"Webcam"},doc)
        self.assertEqual(a["modules"],["usbhid"])
        self.assertEqual(b["modules"],["usb_storage"])
        self.assertEqual(c["modules"],["uvcvideo"])
        self.assertEqual(plug.match({"vid":"ffff","pid":"eeee","classes":["ff"],"productName":"Unknown"},doc)["modules"],[])

    def test_catalog_rejects_unapproved_code_and_repo(self):
        doc=json.loads(CATALOG.read_text())
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"catalog.json"
            p.write_text(json.dumps(doc))
            self.assertEqual(plug.load_catalog(p)["schema"],1)
            doc["usb"]["interfaces"]["03"]["modules"]=["evil_kernel_module"]
            p.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError,"nao autorizada"):
                plug.load_catalog(p)
            doc=json.loads(CATALOG.read_text())
            doc["usb"]["interfaces"]["03"]["packages"]=["https://evil.example/driver.deb"]
            p.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError,"nao autorizada"):
                plug.load_catalog(p)
            self.assertFalse(plug.trusted_install("evil-driver-package"))

    def test_only_one_ippo_usb_no_fiscal_queue_duplicated(self):
        mock_device={"device":"1-1","vid":"0123","pid":"4567","classes":["07"]}
        with mock.patch.object(plug,"USB_ROOT",Path("/definitely/not/a/usb/device")),mock.patch.object(plug,"run",side_effect=AssertionError("APT/queue not allowed")):
            self.assertFalse(plug.usb_ipp_auto_queue(mock_device))

    def test_thermal_detects_receipt_but_not_a4_or_labels(self):
        self.assertTrue(thermal.thermal("Elgin_i9",ELGIN_PPD))
        self.assertTrue(thermal.thermal("Bematech_MP4200",BEMATECH_PPD))
        self.assertFalse(thermal.thermal("Canon_A4",A4_PPD))
        self.assertFalse(thermal.thermal("Zebra_Label",LABEL_PPD))

    def test_only_supported_vendor_options(self):
        options='''PageSize/PageSize: Custom.WIDTHxHEIGHT *Roll80mm
PostPrintAction/Post-Print Action: 0 1 *2 3
CutMode/Cut Mode: 0 *1
PaperSaveBottom/Paper Save Bottom: 0 *1
PaperSaveMode/Paper Save Mode: 0 *1 2 3
FormfeedLength/Feed Paper Length: *0 5 10
CutPaperLength/Cut Paper Length: *0 5 10
'''
        choices=thermal.option_choices(options)
        picked=thermal.desired_options(choices)
        self.assertEqual(picked["PaperSaveBottom"],"1")
        self.assertEqual(picked["PostPrintAction"],"2")
        self.assertEqual(picked["FormfeedLength"],"0")
        self.assertNotIn("PageSize",picked)
        defaults=thermal.current_defaults(options)
        self.assertEqual(defaults["PaperSaveBottom"],"1")
        self.assertEqual(defaults["CutPaperLength"],"0")
        self.assertTrue(all(defaults[k]==v for k,v in picked.items()))

    def test_ppd_preserves_original_driver_and_size_without_zoom(self):
        for ppd,name in ((ELGIN_PPD,"rastertohprt"),(BEMATECH_PPD,"rastertoescpos")):
            patched,origin=thermal.patch_ppd(ppd)
            self.assertEqual(origin,name)
            self.assertIn('enfoqueOriginalRasterFilter: "'+name+'"',patched)
            self.assertEqual(patched.count("enfoque-thermal-raster"),1)
            self.assertIn("*PageSize Roll80mm",patched)
            self.assertNotIn("scaling",patched.lower())
            self.assertEqual(thermal.patch_ppd(patched)[1],"already")
        self.assertFalse(thermal.thermal("Canon_A4",A4_PPD))

    def test_no_modification_to_busy_or_unknown_queue(self):
        with tempfile.TemporaryDirectory() as d,\
             mock.patch.object(thermal,"STATE",Path(d)/"state.json"),\
             mock.patch.object(thermal,"queues",return_value={"Canon":"ipp://192.168.0.31/ipp/print",
                                                                "Elgin":"usb://ELGIN/i9"}),\
             mock.patch.object(thermal,"ppd_for",side_effect=lambda name:A4_PPD if name=="Canon" else ELGIN_PPD),\
             mock.patch.object(thermal,"queue_idle",return_value=False),\
             mock.patch.object(thermal,"run",side_effect=AssertionError("No changes for busy queues")):
            result=thermal.scan(dry_run=False)
            self.assertEqual(result["thermal"],["Elgin"])
            self.assertTrue(result["errors"])

    def test_chrome_profile_waits_until_browser_closes_and_has_no_zoom(self):
        with tempfile.TemporaryDirectory() as d,\
             mock.patch.object(chrome,"PROFILE",Path(d)/"Default/Preferences"),\
             mock.patch.object(chrome,"MARKER",Path(d)/"state.json"),\
             mock.patch.object(chrome.pwd,"getpwnam",return_value=SimpleNamespace(pw_uid=os.geteuid())),\
             mock.patch.object(chrome,"thermal_present",return_value=True),\
             mock.patch.object(chrome,"active_chrome",return_value=True):
            self.assertEqual(chrome.configure(),"chrome-active-deferred")
            self.assertFalse(chrome.PROFILE.exists())
        with tempfile.TemporaryDirectory() as d,\
             mock.patch.object(chrome,"PROFILE",Path(d)/"Default/Preferences"),\
             mock.patch.object(chrome,"MARKER",Path(d)/"state.json"),\
             mock.patch.object(chrome.pwd,"getpwnam",return_value=SimpleNamespace(pw_uid=os.geteuid())),\
             mock.patch.object(chrome,"thermal_present",return_value=True),\
             mock.patch.object(chrome,"active_chrome",return_value=False):
            self.assertEqual(chrome.configure(),"updated")
            state=json.loads(json.loads(chrome.PROFILE.read_text())["printing"]["print_preview_sticky_settings"]["appState"])
            self.assertEqual(state["scaling"],"100")
            self.assertEqual(state["marginsType"],1)
            self.assertFalse(state["isHeaderFooterEnabled"])
            self.assertEqual(chrome.configure(),"already-ready")

    def test_driver_rollback_never_removes_core_or_other_packages(self):
        with mock.patch.object(plug,"run",side_effect=AssertionError("Must not remove core CUPS")):
            self.assertFalse(plug.rollback_new_driver("cups"))
            self.assertFalse(plug.rollback_new_driver("ipp-usb"))
        with mock.patch.object(plug,"run",return_value=(0,"Remv v4l-utils [1.0]\nRemv libshared [1.0]\n","")),\
             mock.patch.object(plug,"record"):
            self.assertFalse(plug.rollback_new_driver("v4l-utils"))

    def test_services_and_package_manifest_patterns(self):
        for fname in ("enfoque-thermal-print.timer","enfoque-plugplay-scan.timer","enfoque-plugplay@.service"):
            self.assertTrue((INC/"etc/systemd/system"/fname).is_file())
        rule=(INC/"etc/udev/rules.d/89-enfoque-plugplay.rules").read_text()
        self.assertIn('SUBSYSTEM=="usb"',rule)
        self.assertIn('SYSTEMD_WANTS',rule)
        self.assertNotIn("apt-get",rule)
        updater=(ROOT/"scripts/build-update-package.py").read_text()
        self.assertIn("enfoque-plugplay-scan.timer enfoque-thermal-print.timer",updater)
        self.assertIn("etc/enfoque-os/drivers/catalog.json",updater)
        self.assertIn("usr/lib/cups/filter/enfoque-thermal-raster",updater)
        self.assertIn("libcupsimage2t64",updater)
        ci=(ROOT/".github/workflows/build-iso.yml").read_text()
        self.assertIn("libcupsimage2-dev",ci)

if __name__=="__main__":
    unittest.main()
