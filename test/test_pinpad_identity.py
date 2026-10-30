"""Local-only USB/serial identity tests for the isolated PayGo TEF service.

Tests create fake sysfs paths and NEVER touch the real GERTEC/PPC930 device.
"""
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import unittest
from unittest import TestCase, mock
import tempfile

HEALTH = (Path(__file__).resolve().parents[1] /
          "config/includes.chroot/usr/local/bin/enfoque-paygo-tef-health")
loader = importlib.machinery.SourceFileLoader("enfoque_tef_health_usb", str(HEALTH))
spec = importlib.util.spec_from_loader(loader.name, loader)
health = importlib.util.module_from_spec(spec)
loader.exec_module(health)


@unittest.skipIf(os.name == "nt", "Linux-only USB sysfs and Unix symlink tests")
class FakePinpadEnvironment(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dev_dir = self.root / "dev"
        self.dev_dir.mkdir()
        self.device = self.dev_dir / "ttyACM0"
        self.device.write_bytes(b"")
        self.prefix = self.root / "prefix"
        self.prefix.mkdir()
        self.pinpad = self.prefix / "com8"
        self.pinpad.symlink_to(self.device)
        self.sys_tty = self.root / "sys/class/tty"
        sys_device = self.sys_tty / "ttyACM0"
        sys_device.mkdir(parents=True)
        self.usb = self.root / "sys/usb/1-1"
        interface = self.usb / "1-1:2.0"
        interface.mkdir(parents=True)
        (sys_device / "device").symlink_to(interface, target_is_directory=True)
        (self.usb / "idVendor").write_text("1753\n")
        (self.usb / "idProduct").write_text("c902\n")

    def check_port(self):
        return health.validate_pinpad_alias(
            self.pinpad, sys_tty=self.sys_tty, dev_dir=self.dev_dir
        )

    def test_correct_gertec_acm_is_accepted(self):
        with mock.patch.object(health.stat, "S_ISCHR", return_value=True):
            self.assertEqual(self.check_port(), self.device)

    def test_missing_or_broken_com8_alias_is_rejected(self):
        self.pinpad.unlink()
        with self.assertRaisesRegex(RuntimeError, "COM8 ausente"):
            self.check_port()
        self.pinpad.symlink_to(self.dev_dir / "ttyACM9")
        with self.assertRaisesRegex(RuntimeError, "dispositivo ausente"):
            self.check_port()

    def test_regular_file_instead_of_serial_char_device_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "serial real"):
            self.check_port()

    def test_wrong_device_name_is_rejected(self):
        self.pinpad.unlink()
        self.pinpad.symlink_to(self.dev_dir / "ttyUSB0")
        (self.dev_dir / "ttyUSB0").write_bytes(b"")
        with self.assertRaisesRegex(RuntimeError, "porta USB/ACM inesperada"):
            self.check_port()

    def test_cross_directory_alias_is_rejected(self):
        self.pinpad.unlink()
        outside = self.root / "ttyACM0"
        outside.write_bytes(b"")
        self.pinpad.symlink_to(outside)
        with self.assertRaisesRegex(RuntimeError, "porta USB/ACM inesperada"):
            self.check_port()

    def test_other_usb_device_is_rejected_even_if_acm(self):
        for vendor, product in (("1a2b", "c902"), ("1753", "1234")):
            with self.subTest(vendor=vendor, product=product):
                (self.usb / "idVendor").write_text(vendor)
                (self.usb / "idProduct").write_text(product)
                with mock.patch.object(health.stat, "S_ISCHR", return_value=True):
                    with self.assertRaisesRegex(RuntimeError, "GERTEC PPC930"):
                        self.check_port()
        (self.usb / "idVendor").write_text("1753")
        (self.usb / "idProduct").write_text("c902")

    def test_usb_information_missing_fails_closed(self):
        (self.usb / "idVendor").unlink()
        with mock.patch.object(health.stat, "S_ISCHR", return_value=True):
            with self.assertRaisesRegex(RuntimeError, "Identidade USB"):
                self.check_port()

    def test_serial_permission_failure_is_rejected(self):
        with mock.patch.object(health.stat, "S_ISCHR", return_value=True), \
             mock.patch.object(health.os, "access", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "sem acesso"):
                self.check_port()

    def test_pinpad_alias_points_to_valid_serial_even_after_symlink_change(self):
        # The sysfs model is still available, but moving COM8 to a different
        # tty that wasn't verified must never be considered operational.
        device2 = self.dev_dir / "ttyACM1"
        device2.write_bytes(b"")
        self.pinpad.unlink()
        self.pinpad.symlink_to(device2)
        with mock.patch.object(health.stat, "S_ISCHR", return_value=True):
            with self.assertRaises(OSError):
                self.check_port()


if __name__ == "__main__":
    import unittest
    unittest.main()
