"""0.2.38 recovery archives, boot scheduling, one-time administrative grant.

All disk tests run only in isolated temporary folders. Real filesystem
snapshots, APT installs, reboot, and firewall changes are never performed.
"""
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "config/includes.chroot"
RECOVERY = BASE / "usr/local/sbin/enfoque-recovery-image"
NEXTBOOT = BASE / "usr/local/sbin/enfoque-update-nextboot"


def load_file(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class Recovery038Tests(unittest.TestCase):
    def test_root_archive_and_manifest_verification_in_temp_source(self):
        tool = load_file("enfoque_recovery_test_038", RECOVERY)
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            source = base / "system"
            source.mkdir()
            target = base / "backups"
            target.mkdir(mode=0o700)
            (source / "etc").mkdir()
            (source / "home").mkdir()
            (source / "etc" / "hostname").write_text("caixa-teste\n")
            (source / "home" / "manual.pdf").write_bytes(b"%PDF-1.4\n" + b"A" * 2048)
            with mock.patch.object(tool, "prepare_space", return_value=(4096, 10**11)), \
                 mock.patch.object(tool, "check_root_directory", side_effect=lambda p: p):
                result = tool.create_image("Teste de recuperacao", source, target, base/"no-efi")
            self.assertTrue(result["ok"])
            self.assertTrue(result["verified"])
            image = Path(result["image"])
            self.assertTrue(image.is_dir())
            manifest = json.loads((image / "manifest.json").read_text())
            self.assertIn("rootfs.tar.gz", manifest["archives"])
            self.assertNotIn("efi.tar.gz", manifest["archives"])
            listing = subprocess.check_output(["tar", "-tzf", str(image/"rootfs.tar.gz")], text=True)
            self.assertIn("./etc/hostname", listing)
            self.assertIn("./home/manual.pdf", listing)
            self.assertEqual(len(tool.inventory(target)), 1)
            self.assertTrue(tool.verify_image(image)["verified"])
            archive = image/"rootfs.tar.gz"
            with archive.open("ab") as out:
                out.write(b"CORRUPCAO")
            with self.assertRaises(RuntimeError):
                tool.verify_image(image)

    def test_preservation_excludes_volatile_paths_and_own_backup(self):
        code = RECOVERY.read_text()
        for required in (
            '"/dev/***"', '"/proc/***"', '"/sys/***"', '"/run/***"',
            '"/var/backups/enfoque-os/recovery/***"',
            "--one-file-system", "os.replace(tmp, final)", "verify_image(tmp)",
            "--numeric-ids", "--acls", "--xattrs",
        ):
            self.assertIn(required, code)
        self.assertIn("Nao e imagem raw bootavel", code)

    def test_apt_upgrade_uses_verified_snapshot_backend_without_bypass(self):
        maintenance = (BASE/"usr/local/sbin/enfoque-manutencao").read_text()
        updater = (BASE/"usr/local/sbin/enfoque-update").read_text()
        self.assertIn('"backend":"enfoque-archive"', maintenance)
        self.assertIn('"/usr/local/sbin/enfoque-recovery-image","create"', maintenance)
        self.assertIn('"blocked_without_snapshot"', updater)
        self.assertIn('["/usr/local/sbin/enfoque-manutencao", "snapshot"', updater)

    def test_package_contains_recovery_and_scheduler(self):
        source = (ROOT/"scripts/build-update-package.py").read_text()
        for required in ("usr/local/sbin/enfoque-recovery-image",
                         "usr/local/sbin/enfoque-update-nextboot",
                         "etc/systemd/system/enfoque-update-nextboot.timer"):
            self.assertIn(required, source)
        self.assertIn("enfoque-update-nextboot.timer enfoque-zero-touch.timer", source)
        self.assertIn('VERSION="0.2.50"', (BASE/"etc/enfoque-os-release").read_text())


class Nextboot038Tests(unittest.TestCase):
    def test_schedule_does_not_run_upgrade_until_next_kernel_boot(self):
        tool = load_file("enfoque_nextboot_test_038", NEXTBOOT)
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            tool.REQUEST = base / "pending.json"
            tool.RESULT = base / "result.json"
            tool.BOOT = base / "boot-id"
            tool.RELEASE = base / "release"
            boot1 = "c483d7e1-2964-4e69-98e1-1e976caa78a1"
            boot2 = "d483d7e1-2964-4e69-98e1-1e976caa78a1"
            tool.BOOT.write_text(boot1)
            tool.RELEASE.write_text('VERSION="0.2.37"\n')
            plan = tool.schedule("0.2.38")
            self.assertTrue(plan["ok"])
            self.assertEqual(plan["when"], "proximo-boot")
            original_read = tool.read_request
            with mock.patch.object(tool, "read_request", side_effect=lambda: original_read(owner_uid=__import__("os").getuid())), \
                 mock.patch.object(tool, "process") as executor:
                result = tool.apply()
                self.assertEqual(result["reason"], "aguardando_reinicio")
                self.assertTrue(tool.REQUEST.exists())
                executor.assert_not_called()
                tool.BOOT.write_text(boot2)
                executor.return_value = {"ok": True, "executed": True, "installed": "0.2.38"}
                result = tool.apply()
                self.assertTrue(result["ok"])
                self.assertEqual(result["installed"], "0.2.38")
                self.assertFalse(tool.REQUEST.exists())
                self.assertTrue(tool.RESULT.exists())
                executor.assert_called_once()

    def test_failure_never_retries_unattended(self):
        tool = load_file("enfoque_nextboot_failure_038", NEXTBOOT)
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            tool.REQUEST = base / "pending.json"
            tool.RESULT = base / "result.json"
            tool.BOOT = base / "boot-id"
            tool.RELEASE = base / "release"
            tool.RELEASE.write_text('VERSION="0.2.37"\n')
            tool.BOOT.write_text("c483d7e1-2964-4e69-98e1-1e976caa78a1")
            tool.schedule("0.2.38")
            tool.BOOT.write_text("d483d7e1-2964-4e69-98e1-1e976caa78a1")
            original_read = tool.read_request
            with mock.patch.object(tool, "read_request", side_effect=lambda: original_read(owner_uid=__import__("os").getuid())), \
                 mock.patch.object(tool, "process", return_value={"ok": False, "executed": True, "error": "fail"}):
                result = tool.apply()
                after_failed = tool.apply()
            self.assertFalse(result["ok"])
            self.assertFalse(tool.REQUEST.exists())
            self.assertFalse(after_failed["executed"])

    def test_signed_apt_and_recovery_do_the_update(self):
        code = NEXTBOOT.read_text()
        self.assertIn('"/usr/local/sbin/enfoque-update", "apply-core"', code)
        self.assertIn('"createdBoot": boot_id()', code)
        self.assertIn('request["createdBoot"] == boot_id()', code)
        self.assertIn('REQUEST.unlink(missing_ok=True)', code)
        self.assertIn("NoNewPrivileges=yes",
                      (BASE/"etc/systemd/system/enfoque-update-nextboot.service").read_text())
        self.assertIn("OnBootSec=2min",
                      (BASE/"etc/systemd/system/enfoque-update-nextboot.timer").read_text())


if __name__ == "__main__":
    unittest.main()
