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


class InstalledSessionSafetyTests(unittest.TestCase):
    def test_firstboot_starts_in_active_xfce_session_not_background(self):
        launcher = (ROOT / "config/includes.chroot/usr/local/bin/enfoque-firstboot-launch").read_text()
        self.assertIn("exec /usr/local/bin/enfoque-primeiro-acesso", launcher)
        self.assertNotIn("systemctl --user start", launcher)
        script = (ROOT / "config/includes.chroot/usr/local/bin/enfoque-primeiro-acesso").read_text()
        self.assertIn("GLib.timeout_add(1700, focus_once)", script)
        self.assertIn("dialog.submit.get_sensitive()", script)
        hidden = (ROOT / "config/includes.chroot/etc/xdg/autostart/enfoque-central.desktop").read_text()
        self.assertIn("Hidden=true", hidden)
        self.assertTrue((ROOT / "config/includes.chroot/usr/share/applications/enfoque-central.desktop").is_file())

    def test_installed_clock_and_locale_are_explicit(self):
        installer = (ROOT / "config/includes.chroot/usr/local/sbin/enfoque-install-system").read_text()
        self.assertIn('"America/Sao_Paulo\\n"', installer)
        self.assertIn('localtime.symlink_to("/usr/share/zoneinfo/America/Sao_Paulo")', installer)
        self.assertIn('"LANG=pt_BR.UTF-8\\nLANGUAGE=pt_BR:pt\\n"', installer)
        self.assertIn('"pt_BR.UTF-8 UTF-8"', installer)
        self.assertIn('"/usr/sbin/locale-gen"', installer)
        self.assertIn('TARGET / "etc/locale.conf"', installer)
        self.assertIn('TARGET / "etc/systemd/system/lightdm.service.d/90-enfoque-portugues.conf"', installer)
        self.assertIn('Environment=LANG=pt_BR.UTF-8', installer)
        self.assertIn('Environment=LANGUAGE=pt_BR:pt', installer)
        self.assertIn('"/usr/bin/chage", "-d", "0", "enfoque"', installer)
