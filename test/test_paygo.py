import importlib.machinery
import importlib.util
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "config"
LAUNCHER = CFG / "includes.chroot/usr/local/bin/enfoque-paygo"


class PayGoImageTests(unittest.TestCase):
    def test_hooks_executable(self):
        for name in ("080-instalar-wine.hook.chroot", "091-incorporar-paygo.hook.chroot"):
            path = CFG / "hooks/normal" / name
            self.assertTrue(path.stat().st_mode & stat.S_IXUSR, "Hook nao executavel: " + name)
            proc = subprocess.run(["sh", "-n", str(path)], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_installer_verified_during_build(self):
        data = (CFG / "hooks/normal/091-incorporar-paygo.hook.chroot").read_text()
        self.assertIn("sha256sum -c -", data)
        self.assertIn("bccab187ff5ac25ad1e5351d584193aeb1a6f2ce467f783c5305f98d6b2d0531", data)
        self.assertIn("SetupPayGo.exe", data)
        packages = (CFG / "hooks/normal/080-instalar-wine.hook.chroot").read_text()
        self.assertIn("wine32:i386", packages)
        self.assertIn("libwine:i386", packages)
        self.assertNotIn("wine64", packages)
        self.assertIn("/usr/lib/wine/wine", packages)

    def test_launchers_and_icons(self):
        for name, cmd, icon in (
            ("PayGo", "Exec=enfoque-paygo abrir", "enfoque-paygo"),
            ("Compatibilidade-Windows", "Exec=enfoque-paygo configurar", "enfoque-wincompat")
        ):
            path = CFG / "includes.chroot/etc/skel/Desktop" / (name + ".desktop")
            self.assertTrue(path.stat().st_mode & stat.S_IXUSR)
            self.assertIn(cmd, path.read_text())
            self.assertTrue((CFG / "includes.chroot/usr/share/icons/hicolor/scalable/apps" /
                             (icon + ".svg")).is_file())
        self.assertIn('VERSION="0.2.9"', (CFG / "includes.chroot/etc/enfoque-os-release").read_text())

    def test_launcher_valid_python(self):
        self.assertTrue(LAUNCHER.stat().st_mode & stat.S_IXUSR)
        compile(LAUNCHER.read_text(), str(LAUNCHER), "exec")
        src = LAUNCHER.read_text()
        self.assertIn('WINEARCH"] = "win32"', src)
        self.assertIn('WINELOADER"] = str(WINE32)', src)
        self.assertIn('"cmd.exe", "/c", "echo", "ENFOQUE_WINE_OK"', src)
        self.assertIn("MIN_FREE_INIT", src)
        self.assertIn("paygo-win32", src)

    def test_executable_search_prefers_application(self):
        loader = importlib.machinery.SourceFileLoader("paygo_launcher_test", str(LAUNCHER))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            prefix = Path(tmp) / "paygo-win32"
            path = prefix / "drive_c/Program Files (x86)/PayGo/PayGoWindows.exe"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"MZ")
            (path.parent / "SetupPayGo.exe").write_bytes(b"MZ")
            generic = prefix / "drive_c/Program Files/Internet Explorer/iexplore.exe"
            generic.parent.mkdir(parents=True)
            generic.write_bytes(b"MZfake")
            with mock.patch.object(module, "PREFIX", prefix):
                self.assertEqual(module.principal_instalado(), path)

    def test_pinpad_auto_mapping_is_limited_to_known_device(self):
        loader = importlib.machinery.SourceFileLoader("paygo_pinpad_test", str(LAUNCHER))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dev = root / "pinpad"
            dev.write_bytes(b"")
            prefix = root / "prefix"
            dos = prefix / "dosdevices"
            dos.mkdir(parents=True)
            (dos / "com1").symlink_to("/dev/ttyS0")
            with mock.patch.object(module, "PREFIX", prefix), mock.patch.object(
                    module, "GERTEC_PINPAD", dev):
                self.assertTrue(module.mapear_pinpad_detectado())
                self.assertEqual((dos / "com1").readlink(), dev)
                self.assertEqual((dos / "com8").readlink(), dev)
                self.assertTrue(module.mapear_pinpad_detectado())

    def test_udev_rule_grants_serial_access_to_ppc930(self):
        rule = (CFG / "includes.chroot/etc/udev/rules.d/"
                "70-enfoque-gertec-pinpad.rules").read_text()
        for token in ('1753', 'c902', 'plugdev', 'MODE="0660"',
                      'SYMLINK+="enfoque-pinpad"'):
            self.assertIn(token, rule)


if __name__ == "__main__":
    unittest.main()
