"""State and audit tests for the native support session coordinator."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "config/includes.chroot/usr/local/lib/enfoque-native-support"
sys.path.insert(0, str(DIR))
from session_registry import SessionRegistry

SESSION = "cfe73d42-a325-4dc2-a8e9-2586c9c8ff01"
OTHER_SESSION = "94d4facb-0189-4c4e-b13f-9c0ae8f41c88"
DEVICE = "bbabe514-aaf7-49f0-8cb8-35b30f2bd190"
OTHER_DEVICE = "caa86621-7c3a-4643-a586-34db9cfa973e"


class SessionRegistryTests(unittest.TestCase):
    def setUp(self):
        self.r = SessionRegistry()

    def test_default_deny_until_both_approvals(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        self.assertFalse(self.r.authorize(SESSION, 1001, device_id=DEVICE,
                                          operator_id="ti@enfoque", ti_authorized=True))
        with self.assertRaises(PermissionError):
            self.r.approve(SESSION, 1010, ti_approved=True, local_consent=False)
        self.r.approve(SESSION, 1010, ti_approved=True, local_consent=True)
        self.assertTrue(self.r.authorize(SESSION, 1011, device_id=DEVICE,
                                         operator_id="ti@enfoque", ti_authorized=True))

    def test_wrong_device_wrong_operator_and_no_permission(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        self.r.approve(SESSION, 1010, ti_approved=True, local_consent=True)
        self.assertFalse(self.r.authorize(SESSION, 1011, device_id=OTHER_DEVICE,
                                          operator_id="ti@enfoque", ti_authorized=True))
        self.assertFalse(self.r.authorize(SESSION, 1011, device_id=DEVICE,
                                          operator_id="outro@enfoque", ti_authorized=True))
        self.assertFalse(self.r.authorize(SESSION, 1011, device_id=DEVICE,
                                          operator_id="ti@enfoque", ti_authorized=False))

    def test_only_one_session_per_device_and_replay_blocked(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        with self.assertRaises(PermissionError):
            self.r.request(OTHER_SESSION, DEVICE, "outra@enfoque", 1000)
        with self.assertRaises(PermissionError):
            self.r.request(SESSION, OTHER_DEVICE, "outra@enfoque", 1000)
        self.r.close(SESSION, 1010)
        self.r.request(OTHER_SESSION, DEVICE, "outra@enfoque", 1011)

    def test_expiry_without_extended_access(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        self.r.approve(SESSION, 1010, ti_approved=True, local_consent=True)
        self.assertEqual(self.r.expire(1910), 1)
        self.assertFalse(self.r.authorize(SESSION, 1910, device_id=DEVICE,
                                          operator_id="ti@enfoque", ti_authorized=True))
        self.assertEqual(self.r.expire(1911), 0)

    def test_pending_request_expires_and_cannot_approve(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        self.assertEqual(self.r.expire(1121), 1)
        with self.assertRaises(PermissionError):
            self.r.approve(SESSION, 1121, ti_approved=True, local_consent=True)

    def test_expired_session_does_not_block_new_request(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        self.r.approve(SESSION, 1010, ti_approved=True, local_consent=True)
        replacement = self.r.request(OTHER_SESSION, DEVICE, "outra@enfoque", 1910)
        self.assertEqual(replacement.device_id, DEVICE)
        self.assertEqual([e.action for e in self.r.events],
                         ["requested", "active", "session-expired", "requested"])

    def test_screen_lock_or_logout_terminates_session(self):
        for reason in ("locked", "logout", "revoked", "device-disconnect"):
            with self.subTest(reason=reason):
                r = SessionRegistry()
                r.request(SESSION, DEVICE, "ti@enfoque", 1000)
                r.approve(SESSION, 1010, ti_approved=True, local_consent=True)
                r.close(SESSION, 1011, reason=reason)
                self.assertFalse(r.authorize(SESSION, 1012, device_id=DEVICE,
                                             operator_id="ti@enfoque", ti_authorized=True))
                self.assertEqual(r.events[-1].action, reason)

    def test_audit_records_are_chained(self):
        self.r.request(SESSION, DEVICE, "ti@enfoque", 1000)
        self.r.approve(SESSION, 1010, ti_approved=True, local_consent=True)
        self.r.close(SESSION, 1020, reason="operator-disconnect")
        self.assertEqual([e.action for e in self.r.events],
                         ["requested", "active", "operator-disconnect"])
        self.assertTrue(self.r.audit_valid())
        self.assertEqual(len(self.r.events[0].event_hash), 64)

    def test_not_a_network_controller(self):
        src = (DIR / "session_registry.py").read_text(encoding="utf8")
        for forbidden in ("socket.socket(", "subprocess.run(", "capture_screen",
                          "xdotool", "send_keys", "os.system("):
            self.assertNotIn(forbidden, src)


if __name__ == "__main__":
    unittest.main()
