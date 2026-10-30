"""Regression tests for Enfoque OS 0.2.8 kiosk and low-RAM profile."""
import ast
import importlib.machinery
import importlib.util
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
IMAGE = ROOT / "config/includes.chroot"

class KioskImageTests(unittest.TestCase):
    def test_required_assets_and_no_preactivated_tef(self):
        needed = [
            "etc/default/zramswap",
            "etc/sysctl.d/90-enfoque-lowram.conf",
            "etc/default/grub.d/90-enfoque-kiosk.cfg",
            "usr/share/xsessions/enfoque-kiosk.desktop",
            "usr/local/bin/enfoque-kiosk-session",
            "usr/local/bin/enfoque-paygo-tef-run",
            "usr/local/bin/enfoque-tef-display-wait",
            "usr/local/bin/enfoque-paygo-tef-health",
            "usr/local/sbin/enfoque-kiosk-control",
            "usr/local/sbin/enfoque-paygo-provision",
            "etc/systemd/system/enfoque-paygo-tef.service",
            "etc/logrotate.d/enfoque-paygo-tef",
            "usr/share/plymouth/themes/enfoque-os/enfoque-os.plymouth",
        ]
        for item in needed:
            with self.subTest(item=item):
                self.assertTrue((IMAGE/item).is_file(), item)
        self.assertFalse(list(ROOT.rglob("PayGo.db")), "Never commit live PayGo activation")
        self.assertFalse(list(ROOT.rglob("PES_Key")), "No TEF integration keys in ISO")

    def test_low_memory_zram_and_boot(self):
        zram=(IMAGE/"etc/default/zramswap").read_text()
        self.assertIn("ALGO=lz4",zram)
        self.assertIn("PERCENT=100",zram)
        sysctl=(IMAGE/"etc/sysctl.d/90-enfoque-lowram.conf").read_text()
        self.assertIn("vm.swappiness = 120",sysctl)
        self.assertIn("vm.page-cluster = 0",sysctl)
        boot=(ROOT/"scripts/build-iso.sh").read_text()
        self.assertIn("quiet splash",boot)
        grub=(ROOT/"config/bootloaders/grub-pc/config.cfg").read_text()
        self.assertIn("set timeout_style=hidden",grub)
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text()
        for pkg in ("xfce4","zram-tools","plymouth","logrotate","cups"):
            self.assertIn("\n"+pkg+"\n",packages)
        self.assertIn("0.2.10",(IMAGE/"etc/enfoque-os-release").read_text())

    def test_separate_user_borders(self):
        admin=(IMAGE/"usr/local/sbin/enfoque-kiosk-control").read_text()
        service=(IMAGE/"etc/systemd/system/enfoque-paygo-tef.service").read_text()
        session=(IMAGE/"usr/local/bin/enfoque-kiosk-session").read_text()
        for term in ("DenyUsers enfoque-kiosk enfoque-tef","polkit.Result.NO",
                     "autologin-user=enfoque-kiosk","live_mode()","validate_admin_recovery()"):
            self.assertIn(term,admin)
        for term in ("ExecStartPre=/usr/local/bin/enfoque-tef-display-wait","User=enfoque-tef","SupplementaryGroups=dialout",
                     "ProtectSystem=strict","NoNewPrivileges=true","PrivateTmp=true"):
            self.assertIn(term,service)
        self.assertIn("xhost +SI:localuser:enfoque-tef",session)
        self.assertNotIn("xfce4-panel",session)
        self.assertNotIn("xfdesktop ",session)
        self.assertNotIn("xfce4-terminal",session)
        self.assertIn("--guest",session)
        hook=(ROOT/"config/hooks/normal/097-enfoque-lowram-kiosk.hook.chroot").read_text()
        self.assertIn("chmod 0644",hook)
        self.assertIn("chown root:root",hook)
        self.assertIn("https://intranet.enfoquepapelaria.com.br/",session)

    def test_shell_and_python_syntax(self):
        for rel in (
            "usr/local/bin/enfoque-kiosk-session",
            "usr/local/bin/enfoque-paygo-tef-run",
            "usr/local/bin/enfoque-tef-display-wait",
        ):
            f=IMAGE/rel
            # sh syntax verification on Linux CI; skip only on Windows hosts without sh.
            import shutil
            sh=shutil.which("sh")
            if sh:
                check=subprocess.run([sh,"-n",str(f)],capture_output=True,text=True)
                self.assertEqual(0,check.returncode,check.stderr)
        for rel in (
            "usr/local/bin/enfoque-paygo-tef-health",
            "usr/local/sbin/enfoque-kiosk-control",
            "usr/local/sbin/enfoque-paygo-provision",
        ):
            f=IMAGE/rel
            ast.parse(f.read_text(encoding="utf-8"),filename=str(f))

    def test_provisioner_can_resume_and_does_not_use_missing_path_chown(self):
        script=(IMAGE/"usr/local/sbin/enfoque-paygo-provision").read_text()
        self.assertIn('--resume',script)
        self.assertIn('os.chown(STATE,tef.pw_uid,tef.pw_gid)',script)
        self.assertIn('Retomada recusada',script)
        self.assertNotIn('.chown(',script.replace('os.chown(',''))

    def test_health_checks_fail_closed_without_modifying_database(self):
        path=IMAGE/"usr/local/bin/enfoque-paygo-tef-health"
        loader=importlib.machinery.SourceFileLoader("paygo_tef_health_test",str(path))
        spec=importlib.util.spec_from_loader(loader.name,loader)
        module=importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            prefix=base/"runtime"
            dbpath=prefix/"drive_c/ProgramData/PayGo/Data/PayGo.db"
            dbpath.parent.mkdir(parents=True)
            db=sqlite3.connect(dbpath)
            try:
                db.execute("CREATE TABLE PAY_Terminal(TER_Id INTEGER,TER_TERF_Id INTEGER)")
                db.execute("INSERT INTO PAY_Terminal VALUES (7057,7636)")
                db.commit()
            finally:
                db.close()
            (base/"provisioned").write_text("DEMO")
            for dirname in module.WRITE_DIRS:
                (prefix/dirname).mkdir(parents=True,exist_ok=True)
            exe=prefix/"drive_c/Program Files/PayGo/PayGo.exe"
            exe.parent.mkdir(parents=True)
            exe.write_bytes(b"MZ TEST STUB")
            module.BASE=base
            module.PREFIX=prefix
            module.DATABASE=dbpath
            module.PINPAD=prefix/"dosdevices/com8"
            # The USB/COM8 checks have their own fake-sysfs suite. This
            # fixture specifically verifies the SQLite fail-closed behavior.
            with mock.patch.object(module, "validate_pinpad_alias", return_value=Path("/dev/ttyACM0")) as pinpad:
                self.assertEqual((7057,7636),module.check())
                pinpad.assert_called_once_with()
                dbpath.unlink()
                with self.assertRaises(RuntimeError):
                    module.check()
            self.assertFalse(dbpath.exists(), "Integrity checking must never replace ledgers")

if __name__=="__main__":
    unittest.main()
