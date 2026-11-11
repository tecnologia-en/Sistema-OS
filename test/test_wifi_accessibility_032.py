"""Regression tests for Enfoque OS 0.2.32 Wi-Fi and on-screen keyboard."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "config/includes.chroot"
PKG = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text()
CORE_BUILDER = (ROOT / "scripts/build-update-package.py").read_text()
INSTALLER_GUI = (SRC / "usr/local/bin/enfoque-instalar").read_text()
WIFI_GUI = (SRC / "usr/local/bin/enfoque-configurar-wifi").read_text()
FIRST_USE = (SRC / "usr/local/bin/enfoque-primeiro-uso").read_text()
UPDATER = (SRC / "usr/local/sbin/enfoque-update").read_text()

spec = importlib.util.spec_from_file_location("enfoque_wifi_scan",
    SRC / "usr/local/lib/enfoque-wifi/scan.py")
wifi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wifi)


class WifiAccessibility032Tests(unittest.TestCase):
    def test_version(self):
        self.assertIn('VERSION="0.2.46"', (SRC/"etc/enfoque-os-release").read_text())

    def test_apt_core_update_allows_new_required_packages_without_removal(self):
        self.assertIn('"--no-remove", "--no-install-recommends", "install"', UPDATER)
        self.assertNotIn('"--only-upgrade", "install"', UPDATER)

    def test_offline_iso_firmware_and_wpa(self):
        for name in ("network-manager", "network-manager-gnome", "wpasupplicant", "rfkill",
                     "onboard", "firmware-iwlwifi", "firmware-realtek", "firmware-atheros",
                     "firmware-brcm80211", "firmware-mediatek"):
            self.assertIn("\n" + name + "\n", PKG)
            self.assertIn(name, CORE_BUILDER, name + " missing from APT update Depends")

    def test_installer_mouse_only_accessibility(self):
        self.assertIn('wifi = Gtk.Button(label="Conectar ao Wi-Fi")', INSTALLER_GUI)
        self.assertIn('keyboard = Gtk.Button(label="Teclado virtual")', INSTALLER_GUI)
        self.assertIn('"/usr/local/bin/enfoque-configurar-wifi"', INSTALLER_GUI)
        self.assertIn('"/usr/bin/onboard"', INSTALLER_GUI)
        self.assertIn('"/usr/bin/onboard"', FIRST_USE)

    def test_menu_launchers(self):
        wifi_menu = SRC / "usr/share/applications/enfoque-wifi.desktop"
        keyboard_menu = SRC / "usr/share/applications/enfoque-teclado-virtual.desktop"
        for entry in (wifi_menu, keyboard_menu):
            self.assertTrue(entry.is_file())
            self.assertIn("Terminal=false", entry.read_text())
        self.assertIn("Exec=/usr/bin/onboard", keyboard_menu.read_text())

    def test_escaped_ssids_and_duplicates(self):
        raw = "Escritorio\\: TI:WPA2:85\nRede Visitante:--:65\nEscritorio\\: TI:WPA2:45\n"
        items = wifi.parse_access_points(raw)
        self.assertEqual(items[0]["ssid"], "Escritorio: TI")
        self.assertEqual(items[0]["signal"], 85)
        self.assertEqual(len(items), 2)

    def test_no_unescaped_colons_confuse_parser(self):
        self.assertEqual(wifi.split_nmcli_escaped(r"rede\\com\:multa:WPA2:70"),
                         [r"rede\com:multa", "WPA2", "70"])

    def test_no_password_in_process_argv(self):
        cmd = wifi.build_connect_argv("Loja-Itaipu")
        self.assertEqual(cmd[:2], ["--ask", "--wait"])
        self.assertNotIn("nmcli", cmd)
        # run_nmcli() itself prefixes the executable; regression against
        # accidentally executing /usr/bin/nmcli nmcli --ask ...
        self.assertIn("[NMCLI, *arguments]", WIFI_GUI)
        self.assertIn("device", cmd)
        self.assertNotIn("password", cmd)
        self.assertEqual(wifi.build_connect_argv("rede", hidden=True)[-2:], ["hidden", "yes"])
        with self.assertRaises(ValueError):
            wifi.build_connect_argv("\n" + "x")

    def test_wifi_adapter_diagnostics(self):
        self.assertTrue(wifi.has_wifi_device("ens1:ethernet:connected\nwlp2s0:wifi:unavailable\n"))
        self.assertFalse(wifi.has_wifi_device("ens1:ethernet:connected\n"))
        self.assertIn("WPA", wifi.diagnose(True, True, True, False))
        self.assertIn("hardware", wifi.diagnose(False, True, True, True).lower())

    def test_wifi_gui_runs_background_and_uses_stdin(self):
        self.assertIn("threading.Thread(target=self.scan_worker", WIFI_GUI)
        self.assertIn("threading.Thread(target=self.connect_worker", WIFI_GUI)
        self.assertIn('input_text=password + "\\n"', WIFI_GUI)
        self.assertNotIn('"password", password', WIFI_GUI)
        self.assertIn("self.keyboard", WIFI_GUI)
        self.assertIn("self.password.set_text(\"\")", WIFI_GUI)


if __name__ == "__main__":
    unittest.main()
