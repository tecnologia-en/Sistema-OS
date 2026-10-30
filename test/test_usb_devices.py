import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "config/includes.chroot/usr/local/lib/enfoque-hub/devices.py"
SPEC = importlib.util.spec_from_file_location("enfoque_devices", MODULE)
devices = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(devices)


class USBInventoryTests(unittest.TestCase):
    def test_empty_bus_ports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            hub = root / "usb1"
            hub.mkdir()
            (hub / "maxchild").write_text("3")
            (hub / "busnum").write_text("1")
            found = devices.ports(root)
            self.assertEqual(len(found), 3)
            self.assertEqual([x["slot"] for x in found], ["1-1", "1-2", "1-3"])
            self.assertTrue(all(not x["occupied"] for x in found))

    def test_keyboard_printer_new_device_and_empty_ports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            hub = root / "usb2"
            hub.mkdir()
            (hub / "maxchild").write_text("4")
            (hub / "busnum").write_text("2")
            keyboard = root / "2-2"
            keyboard.mkdir()
            for k, v in {"idVendor": "046d", "idProduct": "c31c", "manufacturer": "Logitech",
                         "product": "USB Keyboard", "bDeviceClass": "00"}.items():
                (keyboard / k).write_text(v)
            port = root / "2-3"
            port.mkdir()
            for k, v in {"idVendor": "0b1b", "idProduct": "0002", "manufacturer": "Bematech",
                         "product": "MP-4200 TH", "bDeviceClass": "07"}.items():
                (port / k).write_text(v)
            first = devices.ports(root)
            self.assertEqual(first[1]["device"]["kind"], "Teclado")
            self.assertEqual(first[2]["device"]["kind"], "Impressora térmica")
            self.assertFalse(first[0]["occupied"])
            new = root / "2-4"
            new.mkdir()
            for k, v in {"idVendor": "abcd", "idProduct": "0001", "product": "Futuro dispositivo",
                         "bDeviceClass": "ff"}.items():
                (new / k).write_text(v)
            self.assertEqual(devices.ports(root)[3]["device"]["product"], "Futuro dispositivo")

    def test_visible_ports_defaults_to_connected_and_diagnostics_can_show_all(self):
        entries=[
            {"slot":"1-1","occupied":False},
            {"slot":"1-2","occupied":True,"device":{"product":"GERTEC PPC930"}},
            {"slot":"1-3","occupied":False},
        ]
        self.assertEqual([x["slot"] for x in devices.visible_ports(entries)],["1-2"])
        self.assertEqual([x["slot"] for x in devices.visible_ports(entries,True)],["1-1","1-2","1-3"])
        self.assertEqual(devices.visible_ports(entries[:1]),[])
        self.assertEqual(devices.visible_ports([],True),[])
        self.assertEqual(len(entries),3)  # source inventory is not mutated

    def test_ux_shortcut_uses_only_branded_installer(self):
        root=Path(__file__).resolve().parents[1]
        visual=(root/"config/includes.chroot/usr/local/bin/enfoque-aplicar-visual").read_text()
        self.assertIn("calamares-install-debian.desktop",visual)
        self.assertIn("remove_os_shortcut " + chr(39) + "calamares-install-debian.desktop" + chr(39), visual)
        self.assertIn("remove_os_shortcut 'Instalar-Enfoque-OS.desktop'", visual)
        self.assertNotIn('cp /usr/share/applications/enfoque-instalar.desktop "$DESKTOP/', visual)
        self.assertTrue((root/"config/includes.chroot/usr/share/applications/enfoque-instalar.desktop").exists())
        app=(root/"config/includes.chroot/usr/local/lib/enfoque-hub/app.py").read_text()
        self.assertIn('self.show_empty_ports.set_active(False)',app)
        self.assertIn('visible_ports(data, self.show_empty_ports.get_active())',app)

    def test_hub_children_and_safety_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            hub = root / "usb1"
            hub.mkdir()
            (hub / "maxchild").write_text("2")
            (hub / "busnum").write_text("1")
            dev = root / "1-1"
            dev.mkdir()
            (dev / "idVendor").write_text("1234")
            (dev / "idProduct").write_text("5678")
            (dev / "bDeviceClass").write_text("09")
            (dev / "maxchild").write_text("3")
            slots = [entry["slot"] for entry in devices.ports(root)]
            self.assertEqual(slots, ["1-1", "1-1.1", "1-1.2", "1-1.3", "1-2"])


if __name__ == "__main__":
    unittest.main()
