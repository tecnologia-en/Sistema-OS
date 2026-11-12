"""Regression for Admin / TI unit label in signed Zero Touch enrollment."""
import runpy
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "config/includes.chroot/usr/local/sbin/enfoque-zero-touch"


class ZeroTouchUnit040Tests(unittest.TestCase):
    def test_official_administration_unit_is_permitted_for_registration(self):
        mod = runpy.run_path(str(CLIENT))
        self.assertTrue(mod["valid_unit_name"]("administracao", "Administracao / TI"))
        self.assertTrue(mod["valid_unit_name"]("itaipu", "Itaipu"))
        self.assertTrue(mod["valid_unit_name"]("ilha-plaza", "Ilha Plaza"))
        self.assertFalse(mod["valid_unit_name"]("administracao", "../etc"))
        self.assertFalse(mod["valid_unit_name"]("administracao", "Administracao/ TI"))
        self.assertFalse(mod["valid_unit_name"]("itaipu", "Administracao / TI"))
        self.assertFalse(mod["valid_unit_name"]("itaipu", 1337))
        self.assertFalse(mod["NAME"].fullmatch("../etc"))
        self.assertIn("administracao", mod["STORES"])

    def test_version_and_regression_documentation(self):
        self.assertIn('VERSION="0.2.49"', (ROOT/"config/includes.chroot/etc/enfoque-os-release").read_text())
        server = (ROOT/"server/zero-touch-registry.mjs").read_text()
        self.assertIn('unitId === "administracao" && name === "Administracao / TI"', server)
        self.assertIn("validUnitName(data.unitId, data.unitName)", server)


if __name__ == "__main__":
    unittest.main()
