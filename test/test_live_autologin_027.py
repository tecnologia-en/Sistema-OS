"""Regression checks: Debian Live must have UID 1000 free and LightDM auto-login."""
import importlib.util
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
BUILD=ROOT/"scripts/build-iso.sh"
CORE=ROOT/"scripts/build-update-package.py"
LIVE=TREE/"usr/local/sbin/enfoque-live-session"
SERVICE=TREE/"etc/systemd/system/enfoque-live-session.service"
HOOK=ROOT/"config/hooks/normal/104-enfoque-live-autologin.hook.chroot"

class LiveLoginRegression(unittest.TestCase):
    def test_debian_live_username_and_only_existing_groups(self):
        cmd=BUILD.read_text()
        self.assertIn("username=user user-default-groups=audio,cdrom,dip,floppy,video,plugdev,sudo",cmd)
        self.assertNotIn("video,plugdev,netdev",cmd)

    def test_postinst_does_not_create_uid_1000_at_image_build_time(self):
        source=CORE.read_text()
        self.assertNotRegex(source,r'[" ]\s*useradd -m -s /bin/bash enfoque-ti')
        self.assertIn("disk installer explicitly provisions enfoque-ti",source)
        with tempfile.TemporaryDirectory(prefix="enfoque-live-core-") as tmp:
            spec=importlib.util.spec_from_file_location("enfoque_core_login_test",CORE)
            module=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            pkg=module.create(tmp)
            result=subprocess.run(["dpkg-deb","--ctrl-tarfile",str(pkg)],
                                  capture_output=True,check=True)
            tar=subprocess.run(["tar","-xOf","-","./postinst"],input=result.stdout,
                               capture_output=True,check=True)
            actual=tar.stdout.decode("utf-8")
            self.assertNotRegex(actual,r"\b(useradd|adduser|newusers)\b")
            self.assertIn("systemd-tmpfiles",actual)

    def test_live_systemd_unit_executes_before_lightdm(self):
        unit=SERVICE.read_text()
        self.assertIn("After=live-config.service",unit)
        self.assertIn("Before=lightdm.service display-manager.service",unit)
        self.assertIn("ConditionKernelCommandLine=boot=live",unit)
        self.assertIn("ConditionPathExists=/run/live/medium",unit)
        self.assertIn("WantedBy=graphical.target",unit)
        self.assertIn("ExecStart=/usr/local/sbin/enfoque-live-session",unit)
        self.assertIn("systemctl enable enfoque-live-session.service",HOOK.read_text())

    def test_live_fallback_creates_user_and_opens_xfce_session(self):
        script=LIVE.read_text()
        self.assertIn("useradd --create-home --shell /bin/bash user",script)
        self.assertIn("printf 'user:live\\n' | chpasswd",script)
        self.assertIn("autologin-session=xfce",script)
        self.assertIn("autologin-user=user",script)
        self.assertIn("autologin-user-timeout=0",script)
        self.assertIn("/usr/share/xsessions/xfce.desktop",script)
        self.assertIn("/run/live/medium",script)
        self.assertIn('boot=live',script)
        self.assertIn("NoNewPrivileges=false",SERVICE.read_text())

    def test_hook_fails_build_if_uid_1000_already_in_chroot(self):
        text=HOOK.read_text()
        self.assertIn("$3 == 1000",text)
        self.assertIn("ERRO: UID 1000 deve estar livre",text)
        self.assertIn("exit 1",text)

    def test_installed_system_requires_password_and_creates_ti_user_at_install(self):
        installed=(TREE/"usr/local/sbin/enfoque-install-system").read_text()
        self.assertIn('"/usr/sbin/useradd"',installed)
        self.assertIn('"enfoque-ti"',installed)
        self.assertIn('"/usr/sbin/chpasswd"',installed)
        other=(TREE/"usr/local/sbin/enfoque-login-instalado").read_text()
        self.assertIn("autologin-user=",other)
        self.assertIn("[ ! -d /run/live/medium ] || exit 0",other)

    def test_only_vm_switches_display_vt(self):
        unit=(TREE/"etc/systemd/system/enfoque-ativar-grafico.service").read_text()
        self.assertIn("ConditionVirtualization=oracle",unit)
        helper=(TREE/"usr/local/sbin/enfoque-ativar-grafico").read_text()
        self.assertIn("virtualbox|oracle",helper)
        self.assertIn("exit 0",helper)

    def test_release_version_bump(self):
        release=(TREE/"etc/enfoque-os-release").read_text()
        self.assertIn('VERSION="0.2.32"',release)

if __name__=="__main__":
    unittest.main()
