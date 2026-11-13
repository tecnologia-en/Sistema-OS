"""0.2.54: verified AeroBird/WindowsModern assets and safe Bematech printing."""
import hashlib
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest import mock
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"
FILT = SourceFileLoader(
    "enfoque_thermal_print_054",
    str(TREE / "usr/local/sbin/enfoque-thermal-print")
).load_module()

BEMA80 = """*PPD-Adobe: "4.3"
*NickName: "Bematech MP-4200 TH 80mm"
*ModelName: "Bematech MP-4200 TH"
*DefaultPageSize: Roll80mm
*PageSize Roll80mm/80 mm: ""
*cupsFilter: "application/vnd.cups-pdf 0 bemafilters.sh"
*OpenUI *Drawer/Drawer pin: PickOne
*DefaultDrawer: End
*CloseUI: *Drawer
"""


class VisualAssets054(unittest.TestCase):
    def test_exact_hashes_match_archive_files(self):
        pairs = {
            "WindowsModern-icons-1.1.1.zip":
                "0e06713d567d820e92a3d54d7d4fead13a2775f4ef6432f085b63e34a6801356",
            "xfce-aerobird-theme-v6-hdpi.zip":
                "db1119500214fb56ab290abfac018d8a5d6eec00fbc9fcb902ddf2c3de70fbf6",
        }
        for name, digest in pairs.items():
            with self.subTest(name=name):
                self.assertEqual(hashlib.sha256((ROOT/"third_party/visual"/name).read_bytes()).hexdigest(), digest)

    def test_defaults_are_real_themes_and_do_not_replace_functions(self):
        settings = ET.parse(TREE/"etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml")
        self.assertEqual(settings.find(".//property[@name='ThemeName']").get("value"), "Aerobird-Sky-hdpi")
        self.assertEqual(settings.find(".//property[@name='IconThemeName']").get("value"), "windows-modern")
        wm = ET.parse(TREE/"etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml")
        self.assertEqual(wm.find(".//property[@name='theme']").get("value"),"Aerobird-Sky-hdpi")
        self.assertEqual(wm.find(".//property[@name='use_compositing']").get("value"),"true")
        self.assertTrue((TREE/"usr/share/icons/windows-modern/index.theme").is_file())
        self.assertTrue((TREE/"usr/share/themes/Aerobird-Sky-hdpi/gtk-3.0/gtk.css").is_file())
        self.assertTrue((TREE/"usr/share/themes/Aerobird-Sky-hdpi/xfwm4/themerc").is_file())
        css = (TREE/"usr/share/themes/Aerobird-Sky-hdpi/gtk-3.0/gtk.css").read_text()
        self.assertNotIn('''@import url("widgets/progress-bars.css");''',css)
        self.assertNotIn("border-color: #387db6;]",css)
        self.assertNotIn("z-index:",css)
        self.assertNotIn("max-height:",css)
        widget = (TREE/"usr/share/themes/Aerobird-Sky-hdpi/gtk-3.0/widgets/tasklist&docklike-plugin.css").read_text()
        self.assertNotIn("margin: 9px !important;",widget)

    def test_corporate_launchers_unmodified(self):
        shell = (TREE/"usr/local/bin/enfoque-desktop-shell").read_text()
        self.assertIn("enfoque-meu-computador.desktop",shell)
        self.assertIn("background-image: linear-gradient(",shell)
        sysupdate = (TREE/"usr/local/sbin/enfoque-update").read_text()
        self.assertIn("--force-confold", sysupdate)
        self.assertIn("snapshot",sysupdate)


class UniversalBematech054(unittest.TestCase):
    def test_compatible_80mm_bematech_pdf_is_wrapped_only_once(self):
        modified, original = FILT.patch_bematech_pdf_ppd("Bematech_MP4200_TH", BEMA80)
        self.assertEqual(original,"bemafilters.sh")
        self.assertIn('application/vnd.cups-pdf 0 enfoque-bematech-fit', modified)
        self.assertIn('*enfoqueOriginalPdfFilter: "bemafilters.sh"',modified)
        self.assertIn("*DefaultDrawer: End",modified)
        self.assertEqual(FILT.patch_bematech_pdf_ppd("Bematech_MP4200_TH", modified),
                         (modified,"already"))

    def test_non_bematech_and_non_receipt_are_unmodified(self):
        elgin=BEMA80.replace("Bematech","Elgin").replace("MP-4200", "i9").replace("MP4200", "i9")
        a4=BEMA80.replace("Roll80mm", "A4").replace("*PageSize A4/80 mm", "*PageSize A4/A4")
        for name, ppd in [("ELGIN_I9",elgin),("Bematech_MP4200_A4",a4)]:
            with self.subTest(name=name):
                self.assertEqual(FILT.patch_bematech_pdf_ppd(name,ppd),(ppd,None))

    def test_protect_drawer_even_if_native_options_offer_end(self):
        options="""PageSize/Media Size: *Roll80mm Letter A4
Cutter/Cutter Configuration: Off *Job Page
Drawer/Drawer Configuration (pin #2): Off Begin *End
Drawer2/Drawer Configuration (pin #5): *Off Begin End
"""
        with mock.patch.object(FILT,"queues",return_value={"BEMATECH_MP4200":"serial:/dev/ttyUSB0"}), \
             mock.patch.object(FILT,"ppd_for",return_value=BEMA80), \
             mock.patch.object(FILT,"queue_idle",return_value=True), \
             mock.patch.object(FILT,"run",return_value=(0,options,"")):
            report=FILT.scan(dry_run=True)
        self.assertEqual(len(report["changed"]),1)
        entry=report["changed"][0]
        self.assertEqual(entry["filter"],"bemafilters.sh")
        self.assertEqual(entry["options"],{})
        self.assertEqual(entry["filter"],"bemafilters.sh")

    def test_wrapper_exists_and_fallback_keeps_vendor_filter(self):
        wrapper=TREE/"usr/lib/cups/filter/enfoque-bematech-fit"
        self.assertTrue(wrapper.is_file())
        code=wrapper.read_text()
        self.assertIn('VENDOR = "/usr/lib/cups/filter/bemafilters.sh"',code)
        self.assertIn("fitted or original",code)
        self.assertIn("SIDE_PT = 5.0",code)
        self.assertIn("MAX_PAGES = 12",code)

    def test_distributable_contains_all_requirements(self):
        packager=(ROOT/"scripts/build-update-package.py").read_text()
        for item in ("usr/share/themes/Aerobird-","usr/share/icons/windows-modern/",
                     "usr/lib/cups/filter/enfoque-bematech-fit","ghostscript", "poppler-utils"):
            self.assertIn(item,packager)
        build=(ROOT/".github/workflows/build-iso.yml").read_text()
        self.assertIn("scripts/stage-visual-assets.py",build)


if __name__ == "__main__":
    unittest.main()
