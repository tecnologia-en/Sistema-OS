"""Version 0.2.41: simpler root enrollment and immediate hostname repair."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"


class OneClick039Tests(unittest.TestCase):
    def test_firstboot_enrolls_automatically_and_does_not_request_code(self):
        helper = (TREE / "usr/local/sbin/enfoque-firstboot-apply").read_text()
        wizard = (TREE / "usr/local/bin/enfoque-primeiro-acesso").read_text()
        self.assertIn("firstboot.sync_hostname_hosts(record['hostname'])", helper)
        self.assertIn("'enfoque-zero-touch.service'", helper)
        self.assertIn("'--no-block'", helper)
        self.assertNotIn("zeroTouchCode", helper)
        self.assertNotIn('result.get("code")', wizard)
        self.assertNotIn("Codigo de autorizacao da TI", wizard)
        self.assertIn("Liberar acesso completo (root)", wizard)
        self.assertIn("Preencha nome, empresa e loja.", wizard)

    def test_hostname_repair_is_root_service_and_in_apt_update(self):
        service = (TREE / "etc/systemd/system/enfoque-zero-touch.service").read_text()
        package = (ROOT / "scripts/build-update-package.py").read_text()
        self.assertIn("ExecStartPre=-/usr/local/sbin/enfoque-hostname-repair", service)
        self.assertIn("/usr/local/sbin/enfoque-hostname-repair", package)
        self.assertTrue((TREE / "usr/local/sbin/enfoque-hostname-repair").is_file())
        self.assertIn("0.2.47", (TREE / "etc/enfoque-os-release").read_text())

    def test_oneclick_api_requires_administrator_and_recent_device_proof(self):
        routes = (ROOT / "server/zero-touch-routes.mjs").read_text()
        store = (ROOT / "server/zero-touch-registry.mjs").read_text()
        self.assertIn("grantFullRoot", routes)
        self.assertIn("protectedAdmin(req, res)", routes)
        self.assertIn("approveFromAdmin", routes)
        self.assertIn("lastCheckAt", store)
        self.assertIn("15 * 60_000", store)
        self.assertIn("verifyProof", store)
        self.assertIn("hostPublicKey: x.hostPublicKey", store)


if __name__ == "__main__":
    unittest.main()
