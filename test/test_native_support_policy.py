"""Guardrails for an explicitly authorized, visible company support session."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "config/includes.chroot/usr/local/lib/enfoque-native-support/session_policy.py"
spec = importlib.util.spec_from_file_location("enfoque_native_support_policy", MODULE)
module = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = module
spec.loader.exec_module(module)

SESSION = "cfe73d42-a325-4dc2-a8e9-2586c9c8ff01"
DEVICE = "bbabe514-aaf7-49f0-8cb8-35b30f2bd190"
OTHER = "caa86621-7c3a-4643-a586-34db9cfa973e"


class NativeSupportPolicyTests(unittest.TestCase):
    def new(self):
        return module.SupportSession(SESSION, DEVICE, "ti@enfoque", 1000)

    def test_default_deny_without_explicit_dual_approval(self):
        s = self.new()
        for a, b in ((False, False), (True, False), (False, True)):
            with self.assertRaises(PermissionError):
                s.approve(1010, ti_approved=a, local_consent=b)
        self.assertFalse(s.may_interact(1010, device_id=DEVICE, operator_id="ti@enfoque", ti_authorized=True))

    def test_approval_binds_operator_device_and_expires(self):
        s = self.new().approve(1010, ti_approved=True, local_consent=True)
        self.assertTrue(s.may_interact(1010, device_id=DEVICE, operator_id="ti@enfoque", ti_authorized=True))
        self.assertFalse(s.may_interact(1011, device_id=OTHER, operator_id="ti@enfoque", ti_authorized=True))
        self.assertFalse(s.may_interact(1011, device_id=DEVICE, operator_id="outro@enfoque", ti_authorized=True))
        self.assertFalse(s.may_interact(1011, device_id=DEVICE, operator_id="ti@enfoque", ti_authorized=False))
        self.assertFalse(s.may_interact(1910, device_id=DEVICE, operator_id="ti@enfoque", ti_authorized=True))
        self.assertFalse(s.close().may_interact(1020, device_id=DEVICE, operator_id="ti@enfoque", ti_authorized=True))

    def test_old_pending_requests_and_replay_are_blocked(self):
        with self.assertRaises(PermissionError):
            self.new().approve(1121, ti_approved=True, local_consent=True)
        approved = self.new().approve(1010, ti_approved=True, local_consent=True)
        with self.assertRaises(PermissionError):
            approved.approve(1020, ti_approved=True, local_consent=True)

    def test_invalid_input_is_rejected(self):
        for sid, did, operator in (("bad", DEVICE, "ti"), (SESSION, "bad", "ti"),
                                   (SESSION, DEVICE, "root;rm")):
            with self.assertRaises(ValueError):
                module.SupportSession(sid, did, operator, 1000)

    def test_no_remote_transport_or_exec_path_in_policy_module(self):
        src = MODULE.read_text(encoding="utf8")
        for forbidden in ("subprocess.run", "os.system", "exec(", "socket.socket(",
                          "pynput", "xdotool", "send_keys", "capture_screen"):
            self.assertNotIn(forbidden, src)


if __name__ == "__main__":
    unittest.main()
