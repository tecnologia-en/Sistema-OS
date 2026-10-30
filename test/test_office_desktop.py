"""Enfoque OS 0.2.10: LibreOffice pt-BR and a minimal three-icon desktop."""
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CHROOT = ROOT / "config/includes.chroot"
PANEL_ROOT = CHROOT / "etc/skel"
PACKAGE_LIST = ROOT / "config/package-lists/enfoque-base.list.chroot"
DESKTOP = PANEL_ROOT / "Desktop"
GLOBAL = CHROOT / "etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml"
PERSONAL = PANEL_ROOT / ".config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml"
VISUAL = CHROOT / "usr/local/bin/enfoque-aplicar-visual"

class OfficeAndDesktopTests(unittest.TestCase):
    def test_complete_office_included_offline_in_installed_iso(self):
        packages = {p.strip() for p in PACKAGE_LIST.read_text().splitlines()
                    if p.strip() and not p.lstrip().startswith("#")}
        required = {"libreoffice", "libreoffice-gtk3", "libreoffice-l10n-pt-br",
                    "libreoffice-help-pt-br", "hunspell-pt-br",
                    "hyphen-pt-br", "fonts-crosextra-carlito"}
        self.assertTrue(required.issubset(packages), sorted(required - packages))
        self.assertTrue({"xfce4", "zram-tools", "cups"}.issubset(packages))

    def test_office_file_associations_and_chrome_not_changed(self):
        for path in (CHROOT / "etc/xdg/mimeapps.list",
                     PANEL_ROOT / ".config/mimeapps.list"):
            content = path.read_text()
            for subtype, app in (
                ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "libreoffice-writer.desktop"),
                ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "libreoffice-calc.desktop"),
                ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "libreoffice-impress.desktop")
            ):
                self.assertIn(subtype + "=" + app, content)
            self.assertIn("text/html=google-chrome.desktop", content)

    def test_only_business_shortcuts_on_desktop(self):
        self.assertEqual(
            {x.name for x in DESKTOP.iterdir() if x.is_file()},
            {"SIGE.desktop", "Intranet.desktop"}
        )
        for name in ("enfoque-paygo", "enfoque-wincompat",
                     "enfoque-central", "enfoque-instalar", "enfoque-paygo-teste"):
            self.assertTrue((CHROOT / f"usr/share/applications/{name}.desktop").is_file())

    def test_trash_only_virtual_special_icon(self):
        for config in (GLOBAL, PERSONAL):
            node = ET.parse(config).getroot()
            def value(name):
                child = node.find("./property[@name='desktop-icons']/"
                                  "property[@name='file-icons']/"
                                  f"property[@name='{name}']")
                return None if child is None else child.get("value")
            with self.subTest(xml=str(config)):
                self.assertEqual(value("show-trash"), "true")
                for name in ("show-home", "show-filesystem", "show-removable",
                             "show-device-fixed", "show-device-removable",
                             "show-network-removable", "show-unknown-removable"):
                    self.assertEqual(value(name), "false", name)
                style = node.find("./property[@name='desktop-icons']/"
                                  "property[@name='style']")
                self.assertEqual(style.get("value"), "2")

    def test_clean_only_previous_system_shortcuts_and_keep_user_files(self):
        script = VISUAL.read_text()
        self.assertIn('enfoque-os-visual-v0210',script)
        self.assertIn("remove_os_shortcut 'PayGo.desktop' 'enfoque-paygo abrir'",script)
        self.assertIn("remove_os_shortcut 'Enfoque-Central.desktop' 'enfoque-central'",script)
        self.assertIn("remove_os_shortcut 'Compatibilidade-Windows.desktop' 'enfoque-paygo configurar'",script)
        self.assertIn("remove_os_shortcut 'Instalar-Enfoque-OS.desktop' '/usr/local/bin/enfoque-instalar'",script)
        self.assertIn('grep -Fxq "Exec=$expected_exec"',script)
        self.assertNotIn('rm -rf "$DESKTOP"',script)
        self.assertNotIn('cp /usr/share/applications/enfoque-instalar.desktop "$DESKTOP/',script)
        self.assertIn('set_xfconf xfce4-desktop /desktop-icons/file-icons/show-trash bool true',script)

if __name__ == "__main__":
    unittest.main()
