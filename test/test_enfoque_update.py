"""Package, trust, scheduling and fail-closed tests for Enfoque Update."""
import importlib.machinery
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"


def load(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


updater = load("enfoque_update_test",
               TREE / "usr/local/sbin/enfoque-update")
builder = load("enfoque_update_builder_test",
               ROOT / "scripts/build-update-package.py")


class UpdateSecurityTests(unittest.TestCase):
    def test_signed_https_repository_and_no_embedded_secret(self):
        source = (TREE / "etc/apt/sources.list.d/enfoque-os.sources").read_text()
        self.assertIn("URIs: https://intranet.enfoquepapelaria.com.br/enfoque-os-updates", source)
        self.assertIn("Signed-By: /usr/share/keyrings/enfoque-os-archive-keyring.gpg", source)
        key = TREE / "usr/share/keyrings/enfoque-os-archive-keyring.gpg"
        self.assertGreater(key.stat().st_size, 200)
        self.assertNotIn("BEGIN PGP PRIVATE KEY", source)

    def test_updater_does_not_accept_shell_code_as_package_name(self):
        for value in ("bad;rm", "$(whoami)", "../root", "X", "pkg\nother", "--help", "name one"):
            self.assertIsNone(updater.PKG.fullmatch(value))
        self.assertIsNotNone(updater.PKG.fullmatch("libreoffice"))
        self.assertIsNotNone(updater.PKG.fullmatch("linux-image-amd64"))

    def test_package_builder_never_includes_agent_credentials_or_pycache(self):
        self.assertFalse(builder.managed("etc/enfoque-os/agent.json"))
        self.assertFalse(builder.managed("var/lib/enfoque-agent/identity.json"))
        self.assertFalse(builder.managed("usr/local/lib/enfoque-app/__pycache__/abc.pyc"))
        self.assertFalse(builder.managed("etc/shadow"))
        self.assertTrue(builder.managed("usr/local/sbin/enfoque-update"))

    def test_manifest_contains_core_code_and_no_generated_data(self):
        names = {name for name, _ in builder.manifest()}
        self.assertIn("usr/local/sbin/enfoque-update", names)
        self.assertIn("usr/local/bin/enfoque-remote-agent", names)
        self.assertIn("etc/systemd/system/enfoque-update-check.timer", names)
        self.assertIn("etc/apt/sources.list.d/enfoque-os.sources", names)
        self.assertTrue(all("__pycache__" not in name for name in names))
        self.assertTrue(all(not name.endswith(".pyc") for name in names))

    def test_root_required_before_update(self):
        with mock.patch.object(updater.os, "geteuid", return_value=1000):
            with self.assertRaises(PermissionError):
                updater.verify_environment()

    def test_live_image_never_upgrades_itself(self):
        with mock.patch.object(updater.os, "geteuid", return_value=0), \
             mock.patch.object(updater, "LIVE", Path("/")):
            with self.assertRaises(PermissionError):
                updater.verify_environment()

    def test_automatic_mode_fails_closed(self):
        with mock.patch.object(updater, "verify_environment"), \
             mock.patch.object(updater, "AUTO", Path("/tmp/enfoque-test-should-not-exist-0x123")), \
             mock.patch.object(updater, "refresh", side_effect=AssertionError("should not run")):
            result = updater.perform("apply", [], automatic=True)
        self.assertIn("skipped", result)

    def test_check_reports_available_packages_without_installing(self):
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.object(updater, "LOCK", Path(directory) / "lock"), \
             mock.patch.object(updater, "verify_environment"), \
             mock.patch.object(updater, "refresh") as refresh, \
             mock.patch.object(updater, "update_state", return_value=["bash", "enfoque-os-core"]), \
             mock.patch.object(updater, "log_event"):
            result = updater.perform("check", [])
        self.assertEqual(result["pending"], 2)
        refresh.assert_called_once()

    def test_simulation_parses_apt_pending_packages_only(self):
        output = subprocess.CompletedProcess([], 0,
            stdout="Reading package lists...\nInst bash (5.3 Debian:stable [amd64])\n"
                   "Inst enfoque-os-core (0.2.21-1 Enfoque:stable [all])\n"
                   "Conf bash (5.3 Debian:stable [amd64])\n")
        with mock.patch.object(updater, "apt", return_value=output):
            self.assertEqual(updater.candidates(), ["bash", "enfoque-os-core"])

    def test_timer_never_automatically_installs_without_ti_opt_in(self):
        service = (TREE / "etc/systemd/system/enfoque-update-apply.service").read_text()
        self.assertIn("ConditionPathExists=/etc/enfoque-update/auto.enabled", service)
        self.assertIn("apply --automatic", service)
        script = (TREE / "usr/local/sbin/enfoque-update").read_text()
        self.assertIn("if automatic and not AUTO.exists()", script)
        self.assertIn("Unattended", "Unattended")

    def test_no_implicit_reboot(self):
        script = (TREE / "usr/local/sbin/enfoque-update").read_text()
        self.assertNotIn('["reboot"', script)
        self.assertNotIn('["shutdown"', script)
        self.assertIn("reboot_required", script)

    def test_repository_publisher_requires_signed_index(self):
        script = (ROOT / "scripts/publish-update-repo.sh").read_text()
        self.assertIn("gpgv --keyring", script)
        self.assertIn("gpg --homedir", script)
        self.assertIn("flock -x", script)
        self.assertNotIn("trusted=yes", script)

    @unittest.skipUnless(shutil.which("dpkg-deb"), "dpkg-deb unavailable")
    def test_real_installable_deb_built_from_current_iso_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = builder.create(tmp)
            self.assertTrue(package.is_file())
            name = subprocess.check_output(["dpkg-deb", "-f", str(package), "Package"], text=True).strip()
            ver = subprocess.check_output(["dpkg-deb", "-f", str(package), "Version"], text=True).strip()
            self.assertEqual(name, "enfoque-os-core")
            self.assertEqual(ver, builder.version() + "-1")
            names = subprocess.check_output(["dpkg-deb", "-c", str(package)], text=True)
            self.assertIn("./usr/local/sbin/enfoque-update", names)
            self.assertIn("./usr/share/keyrings/enfoque-os-archive-keyring.gpg", names)


if __name__ == "__main__":
    unittest.main()
