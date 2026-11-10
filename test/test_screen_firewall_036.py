"""Regression tests for Enfoque OS 0.2.40 screen privacy and firewall.

Never applies nftables rules to the host, never locks a real GUI, never alters
a workstation. Runtime Xfconf tests are isolated behind mock binaries.
"""
from pathlib import Path
import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SYS = ROOT / "config/includes.chroot"
LOCK_SCRIPT = SYS / "usr/local/bin/enfoque-proteger-tela"
AUTOSTART = SYS / "etc/xdg/autostart/enfoque-proteger-tela.desktop"
FIREWALL = SYS / "etc/enfoque-os/firewall.nft"
FW_SERVICE = SYS / "etc/systemd/system/enfoque-firewall.service"
PACKAGE_BUILDER = ROOT / "scripts/build-update-package.py"


class ScreenFirewall036Tests(unittest.TestCase):
    def test_release_and_core_packages(self):
        self.assertIn('VERSION="0.2.40"', (SYS / "etc/enfoque-os-release").read_text())
        packages = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertIn("\nxfce4-screensaver\n", packages)
        self.assertIn("\nnftables\n", packages)
        self.assertTrue(os.access(LOCK_SCRIPT, os.X_OK))
        desktop = AUTOSTART.read_text()
        self.assertIn("OnlyShowIn=XFCE;", desktop)
        self.assertIn("Exec=/usr/local/bin/enfoque-proteger-tela", desktop)

    def test_screen_is_dark_3_minutes_then_locked_at_15(self):
        code = LOCK_SCRIPT.read_text()
        self.assertIn("if [ -e /run/live/medium ]; then", code)
        self.assertIn("set_value /saver/enabled bool false", code)
        self.assertIn("xfce4-screensaver-command --exit", code)
        self.assertIn("set_value /saver/mode int 0", code)
        self.assertIn("set_value /saver/idle-activation/delay int 3", code)
        self.assertIn("set_value /lock/saver-activation/delay int 12", code)
        self.assertIn("set_value /lock/enabled bool true", code)
        self.assertIn("set_value /lock/sleep-activation bool true", code)
        self.assertIn("set_value /saver/fullscreen-inhibit bool false", code)

    def test_installed_session_applies_config_once_without_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            executables = base / "bin"
            executables.mkdir()
            log = base / "xfconf.log"
            mock = executables / "xfconf-query"
            mock.write_text(
                '#!/bin/sh\n'
                'printf "%s\\n" "$*" >> "$TEST_XFCONF_LOG"\n'
                'for a in "$@"; do [ "$a" = "-s" ] && exit 0; done\n'
                'exit 1\n'
            )
            mock.chmod(0o755)
            for name in ("xfce4-screensaver", "xfce4-screensaver-command"):
                exe = executables / name
                exe.write_text('#!/bin/sh\nexit 0\n')
                exe.chmod(0o755)
            env = dict(os.environ)
            env.update(HOME=tmp, DISPLAY=":777", TEST_XFCONF_LOG=str(log),
                       PATH=str(executables) + ":/usr/bin:/bin")
            run = subprocess.run(["/bin/sh", str(LOCK_SCRIPT)], env=env,
                                 text=True, capture_output=True, timeout=8)
            self.assertEqual(run.returncode, 0, run.stderr)
            configured = log.read_text()
            for term in (
                "/saver/idle-activation/delay -n -t int -s 3",
                "/lock/saver-activation/delay -n -t int -s 12",
                "/lock/sleep-activation -n -t bool -s true",
                "/lock/enabled -n -t bool -s true",
            ):
                self.assertIn(term, configured)
            count = len(log.read_text().splitlines())
            again = subprocess.run(["/bin/sh", str(LOCK_SCRIPT)], env=env,
                                   text=True, capture_output=True, timeout=8)
            self.assertEqual(again.returncode, 0, again.stderr)
            self.assertEqual(count, len(log.read_text().splitlines()))
            self.assertTrue((base / ".config/enfoque-os/tela-036-configurada").is_file())

    def test_firewall_does_not_modify_other_tables_or_block_outbound(self):
        rules = FIREWALL.read_text()
        self.assertIn("add table inet enfoque_guard", rules)
        self.assertIn("flush table inet enfoque_guard", rules)
        self.assertNotIn("flush ruleset", rules)
        self.assertNotIn("hook output", rules)
        self.assertNotIn("hook forward", rules)
        self.assertIn("hook input priority 10; policy drop;", rules)
        self.assertIn('iifname "lo" accept', rules)
        self.assertIn("ct state { established, related } accept", rules)
        self.assertIn("meta l4proto ipv6-icmp accept", rules)
        self.assertIn("udp sport 67 udp dport 68 accept", rules)
        self.assertIn("udp sport 547 udp dport 546 accept", rules)
        self.assertIn("udp dport 5353 accept", rules)
        self.assertNotIn("tcp dport 22 accept", rules)
        self.assertNotIn("tcp dport 631 accept", rules)

    def test_firewall_systemd_is_owning_its_rules_only(self):
        unit = FW_SERVICE.read_text()
        self.assertIn("After=nftables.service", unit)
        self.assertIn("ConditionPathExists=!/run/live/medium", unit)
        self.assertIn("ExecStartPre=/usr/sbin/nft --check -f /etc/enfoque-os/firewall.nft", unit)
        self.assertIn("ExecStart=/usr/sbin/nft -f /etc/enfoque-os/firewall.nft", unit)
        self.assertIn("ExecStop=-/usr/sbin/nft delete table inet enfoque_guard", unit)

    def test_installed_apt_package_carries_both_features(self):
        spec = importlib.util.spec_from_file_location("enfoque_packager_036", PACKAGE_BUILDER)
        packager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(packager)
        manifest = dict(packager.manifest())
        for path in (
            "usr/local/bin/enfoque-proteger-tela",
            "etc/xdg/autostart/enfoque-proteger-tela.desktop",
            "etc/enfoque-os/firewall.nft",
            "etc/systemd/system/enfoque-firewall.service",
        ):
            self.assertIn(path, manifest)
        with tempfile.TemporaryDirectory() as out:
            deb = packager.create(out)
            depends = subprocess.run(
                ["dpkg-deb", "-f", str(deb), "Depends"], check=True,
                capture_output=True, text=True).stdout
            self.assertIn("xfce4-screensaver", depends)
            self.assertIn("nftables", depends)
            archive = subprocess.run(["dpkg-deb", "--ctrl-tarfile", str(deb)],
                                     check=True, capture_output=True)
            # Avoid parsing binary archive in tests; inspect extracted control safely.
            extract = Path(out) / "control"
            subprocess.run(["dpkg-deb", "-e", str(deb), str(extract)], check=True)
            postinst = (extract / "postinst").read_text()
            self.assertIn("systemctl enable enfoque-firewall.service", postinst)
            self.assertIn("systemctl start enfoque-firewall.service", postinst)
            self.assertNotIn("useradd enfoque-ti", postinst)

    def test_current_installer_and_agent_behaviors_unchanged(self):
        preserve = (SYS / "usr/local/lib/enfoque-installer/preserve.py").read_text()
        transfer = (SYS / "usr/local/lib/enfoque-installer/server_transfer.py").read_text()
        self.assertIn('path.suffix.casefold() == ".iso"', preserve)
        self.assertIn("on_chunk=report_progress", transfer)
        agent = (SYS / "etc/systemd/system/enfoque-remote-agent.service").read_text()
        self.assertIn("DynamicUser=yes", agent)
        self.assertIn("NoNewPrivileges=yes", agent)


if __name__ == "__main__":
    unittest.main()
