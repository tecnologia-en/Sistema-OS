"""Regressao offline do broker: nenhum pagamento ou USB real e chamado."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "config/includes.chroot/usr/local/lib/enfoque-paygo-teste/bridge.py"
spec = importlib.util.spec_from_file_location("enfoque_paygo_bridge_test", P)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class TestPaygoBridge(unittest.TestCase):
    def setUp(self):
        api.FAILED.clear()

    def test_static_access_password(self):
        self.assertTrue(api.authorized("infante", 1000))
        self.assertFalse(api.authorized("Infante", 1000))
        self.assertFalse(api.authorized("", 1000))

    def test_login_lockout(self):
        for _ in range(5):
            self.assertFalse(api.authorized("wrong", 3333))
        self.assertFalse(api.authorized("infante", 3333))

    def test_invalid_values_fail_before_network(self):
        with mock.patch.object(api, "profile") as profile:
            for method, amount in (("credit", 0), ("pix", 100),
                                   ("debit", -1), ("credit", "100")):
                with self.assertRaises(ValueError):
                    api.sale(method, amount)
            profile.assert_not_called()

    def test_demo_mode_required(self):
        with mock.patch.object(api, "PREFIX", Path("/does-not-exist")):
            with self.assertRaises(RuntimeError):
                api.profile()

    def test_no_production_endpoint(self):
        self.assertEqual(api.BASE, "https://sandbox.controlpay.com.br/webapi")
        self.assertEqual(set(api.FINAL), {10, 15, 20, 25})
        self.assertIn("UNCERTAIN", api.IN_FLIGHT)

if __name__ == "__main__":
    unittest.main()
