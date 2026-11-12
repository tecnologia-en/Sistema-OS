"""0.2.44: desktop archive support and opt-in Bluetooth hardware usability."""
import configparser
import importlib.util
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"
PKGS = ROOT / "config/package-lists/enfoque-base.list.chroot"
PACKAGE_BUILDER = ROOT / "scripts/build-update-package.py"
REQUIRED_ARCHIVES = {"xarchiver", "thunar-archive-plugin", "7zip", "zip", "unzip"}
REQUIRED_BLUETOOTH = {
    "bluez", "blueman", "bluez-obexd", "pulseaudio-module-bluetooth",
}
MIME_TYPES = {
    "application/zip", "application/x-zip-compressed",
    "application/x-7z-compressed", "application/x-tar",
    "application/x-compressed-tar", "application/gzip",
    "application/x-bzip-compressed-tar", "application/x-xz-compressed-tar",
}


class Release044(unittest.TestCase):
    def test_number_and_packages(self):
        release = (TREE / "etc/enfoque-os-release").read_text()
        self.assertIn('VERSION="0.2.47"', release)
        self.assertIn('PACKAGE_REVISION="1"', release)
        packages = {s.strip() for s in PKGS.read_text().splitlines()
                    if s.strip() and not s.lstrip().startswith("#")}
        self.assertFalse((REQUIRED_ARCHIVES | REQUIRED_BLUETOOTH) - packages)
        self.assertIn("pulseaudio", packages)
        self.assertIn("rfkill", packages)
        # Never replace working PulseAudio with PipeWire merely for Bluetooth.
        self.assertNotIn("pipewire-audio", packages)

    def test_archive_mime_preserves_office_and_browser(self):
        for file in (TREE / "etc/xdg/mimeapps.list",
                     TREE / "etc/skel/.config/mimeapps.list"):
            conf = configparser.ConfigParser(interpolation=None)
            conf.optionxform = str
            conf.read(file, encoding="utf8")
            defaults = conf["Default Applications"]
            for mime in MIME_TYPES:
                self.assertEqual(defaults[mime], "xarchiver.desktop", mime)
            self.assertEqual(defaults["text/html"], "google-chrome.desktop")
            self.assertEqual(
                defaults["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
                "libreoffice-calc.desktop")

    def test_menu_integrated_and_no_new_desktop_shortcut(self):
        shell = (TREE / "usr/local/bin/enfoque-desktop-shell").read_text()
        self.assertIn('("xarchiver.desktop", "Compactador ZIP / 7z"', shell)
        self.assertIn('("blueman-manager.desktop", "Bluetooth"', shell)
        desktop = TREE / "etc/skel/Desktop"
        self.assertEqual({p.name for p in desktop.iterdir() if p.is_file()},
                         {"SIGE.desktop", "Intranet.desktop"})

    def test_upgrade_installs_missing_packages_and_enables_bluetooth(self):
        code = PACKAGE_BUILDER.read_text()
        self.assertIn('"etc/xdg/mimeapps.list"', code)
        for package in REQUIRED_ARCHIVES | REQUIRED_BLUETOOTH:
            self.assertRegex(code, r"\b" + re.escape(package) + r"\b")
        self.assertIn("systemctl enable bluetooth.service", code)
        self.assertIn("systemctl start bluetooth.service", code)
        # No unsolicited reboot, Chrome reset, or automatic fleet update.
        self.assertIn("systemctl disable --now enfoque-update-apply.timer", code)
        self.assertNotIn("reboot -f", code)
        self.assertNotIn("killall google-chrome", code)

    def test_package_manifest_contains_global_mime_defaults(self):
        spec = importlib.util.spec_from_file_location("build_update_044", PACKAGE_BUILDER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        paths = {relative for relative, _ in module.manifest()}
        self.assertIn("etc/xdg/mimeapps.list", paths)
        self.assertIn("usr/local/bin/enfoque-desktop-shell", paths)


if __name__ == "__main__":
    unittest.main()
