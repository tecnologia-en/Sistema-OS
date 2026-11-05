"""Enfoque OS 0.2.22 SSH: locally authorized, loopback-only, key-only."""
from pathlib import Path
import importlib.machinery
import importlib.util
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"


def load_cli():
    loader = importlib.machinery.SourceFileLoader(
        "enfoque_ssh_support", str(TREE / "usr/local/sbin/enfoque-ssh-support"))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


support = load_cli()


class SupportSSHTests(unittest.TestCase):
    def test_hardened_sshd_config(self):
        text = (TREE / "etc/ssh/sshd_config.d/95-enfoque-suporte.conf").read_text()
        expected = [
            "ListenAddress 127.0.0.1",
            "PasswordAuthentication no",
            "KbdInteractiveAuthentication no",
            "PermitRootLogin no",
            "AuthenticationMethods publickey",
            "AllowUsers enfoque",
            "AllowTcpForwarding no",
            "PermitTunnel no",
            "AllowAgentForwarding no",
            "LogLevel VERBOSE",
        ]
        for item in expected:
            with self.subTest(item=item):
                self.assertIn(item, text)

    def test_image_contains_openssh_server(self):
        packages = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertIn("\nopenssh-server\n", packages)

    def test_default_service_disabled_until_explicit_enrollment(self):
        script = (ROOT / "config/hooks/normal/099-enfoque-ssh-local-only.hook.chroot").read_text()
        self.assertIn("systemctl disable ssh.service ssh.socket", script)
        self.assertIn("systemctl mask ssh.socket", script)
        self.assertIn("/usr/sbin/sshd -t", script)

    def test_package_includes_support_and_config(self):
        from pathlib import Path
        import importlib.util
        loader = importlib.machinery.SourceFileLoader(
            "enfoque_package_support", str(ROOT / "scripts/build-update-package.py"))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module := importlib.util.module_from_spec(spec))
        names = {name for name, _ in module.manifest()}
        self.assertIn("usr/local/sbin/enfoque-ssh-support", names)
        self.assertIn("etc/ssh/sshd_config.d/95-enfoque-suporte.conf", names)
        self.assertNotIn("etc/ssh/ssh_host_ed25519_key", names)

    def test_no_keys_embedded_or_shared(self):
        home = TREE / "etc/enfoque-ssh"
        if home.exists():
            self.assertEqual(list(home.rglob("*")), [])
        script = (TREE / "usr/local/sbin/enfoque-ssh-support").read_text()
        self.assertNotIn("123456", script)
        self.assertNotIn("StrictHostKeyChecking=no", script)
        self.assertNotIn("sshpass", script)

    def test_local_root_authorization_required(self):
        with mock.patch.object(support.os, "geteuid", return_value=1000):
            with self.assertRaises(PermissionError):
                support.root_only()

    def test_invalid_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.pub"
            for value in ("ssh-rsa AAAAC", "command=ls ssh-ed25519 AAAAC",
                          "ssh-ed25519 not!base64", "ssh-ed25519 AAAAC comment with spaces"):
                path.write_text(value)
                with self.subTest(value=value), self.assertRaises(ValueError):
                    support.load_key(path)

    @unittest.skipUnless(shutil.which("ssh-keygen"), "ssh-keygen unavailable")
    def test_valid_one_time_ssh_public_key(self):
        with tempfile.TemporaryDirectory() as directory:
            key = Path(directory) / "id_ed25519"
            subprocess.run(["ssh-keygen", "-q", "-t", "ed25519",
                            "-N", "", "-f", str(key)], check=True,
                           capture_output=True, timeout=15)
            value, fingerprint = support.load_key(Path(str(key) + ".pub"))
            self.assertTrue(value.startswith("ssh-ed25519 "))
            self.assertTrue(fingerprint.startswith("SHA256:"))

    def test_installer_forces_password_reset_before_remote_login(self):
        installer = (TREE / "usr/local/sbin/enfoque-install-system").read_text()
        self.assertIn('"/usr/bin/chage", "-d", "0", "enfoque"', installer)
        self.assertIn('"/usr/bin/passwd", "-l", "root"', installer)
        self.assertIn('"/usr/bin/ssh-keygen", "-A"', installer)

    def test_agent_stays_read_only(self):
        text = (TREE / "usr/local/bin/enfoque-remote-agent").read_text()
        self.assertIn("Operacao bloqueada pela politica de TI", text)
        self.assertIn("Apenas leitura", text)
        self.assertNotIn('name == "ssh"', text)


if __name__ == "__main__":
    unittest.main()
