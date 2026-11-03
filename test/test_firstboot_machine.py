import importlib.util
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "config/includes.chroot/usr/local/lib/enfoque-onboarding"))
import firstboot

class BootTests(unittest.TestCase):
    def test_one_time(self):
        u = uuid.uuid4()
        machine = {"uuid": str(u), "shortId": f"{u.int % 1000000000000:012d}"}
        item = firstboot.build_profile("Caixa Ilha 01", "enfoque", "ilha-plaza", machine)
        self.assertEqual(item["displayId"], machine["shortId"] + "-1")
        with tempfile.TemporaryDirectory() as d:
            file = Path(d) / "firstboot.json"
            original = Path(d) / "identity.json"
            original.write_text(json.dumps(machine))
            firstboot.atomic_first_write(item, file)
            self.assertEqual(firstboot.load_profile(file, original, False)["pcName"], "Caixa Ilha 01")
            with self.assertRaises(FileExistsError):
                firstboot.atomic_first_write(item, file)

    def test_reject_invalid(self):
        u = uuid.uuid4()
        machine = {"uuid": str(u), "shortId": f"{u.int % 1000000000000:012d}"}
        with self.assertRaises(ValueError):
            firstboot.build_profile("../etc/hosts", "enfoque", "centro", machine)
        with self.assertRaises(ValueError):
            firstboot.build_profile("CAIXA 01", "enfoque", "papel-arte", machine)


class VisualIdentifierTests(unittest.TestCase):
    def test_store_selection_recalculates_display_suffix(self):
        code = (ROOT / "config/includes.chroot/usr/local/bin/enfoque-primeiro-acesso").read_text()
        self.assertIn('self.unit.connect("changed", self.update_id)', code)
        self.assertIn('firstboot.UNIT_SUFFIX.get(self.unit.get_active_id(), "0")', code)
        self.assertIn('self.device.set_text("Identificador: " + self.device_short + "-" + suffix)', code)
