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

    def test_launchers_and_icons(self):
        # PayGo and Wine stay in the app menu, not on the employee Desktop.
        for name, cmd, icon in (
            ("enfoque-paygo", "Exec=enfoque-paygo abrir", "enfoque-paygo"),
            ("enfoque-wincompat", "Exec=enfoque-paygo configurar", "enfoque-wincompat")
        ):
            path = CFG / "includes.chroot/usr/share/applications" / (name + ".desktop")
            self.assertIn(cmd, path.read_text())
            self.assertTrue((CFG / "includes.chroot/usr/share/icons/hicolor/scalable/apps" /
                             (icon + ".svg")).is_file())
        desktop = CFG / "includes.chroot/etc/skel/Desktop"
        self.assertFalse((desktop / "PayGo.desktop").exists())
        self.assertFalse((desktop / "Compatibilidade-Windows.desktop").exists())
        self.assertIn('VERSION="0.2.10"', (CFG / "includes.chroot/etc/enfoque-os-release").read_text())

    def test_launcher_valid_python(self):
        self.assertTrue(LAUNCHER.stat().st_mode & stat.S_IXUSR)
        compile(LAUNCHER.read_text(), str(LAUNCHER), "exec")

    def test_prevent_insufficient_space_before_wineboot(self):
        loader = importlib.machinery.SourceFileLoader("paygo_space_test", str(LAUNCHER))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            prefix = Path(tmp) / "wine-prefix"
            with mock.patch.object(module, "PREFIX", prefix), \
                 mock.patch.object(module.shutil, "which", return_value="/usr/bin/true"), \
                 mock.patch.object(module.shutil, "disk_usage", return_value=mock.Mock(free=950_000_000)), \
                 mock.patch.object(module, "aviso") as aviso, \
                 mock.patch.object(module.subprocess, "call") as wineboot:
                self.assertFalse(module.wine_pronto())
                wineboot.assert_not_called()
                self.assertIn("2 GiB", aviso.call_args.args[0])

    def test_nonzero_installer_exit_code_is_reported(self):
        loader = importlib.machinery.SourceFileLoader("paygo_exit_code_test", str(LAUNCHER))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "SetupPayGo.exe"
            exe.write_bytes(b"MZ")
            with mock.patch.object(module, "SETUP", exe), \
                 mock.patch.object(module, "aviso") as aviso, \
                 mock.patch.object(module.subprocess, "call", return_value=53) as child:
                self.assertFalse(module.instalar())
                child.assert_called_once_with(["wine", str(exe)])
                self.assertIn("53", aviso.call_args.args[0])

    def test_executable_search_prefers_application(self):
        loader = importlib.machinery.SourceFileLoader("paygo_launcher_test", str(LAUNCHER))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        module = importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            prefix = Path(tmp)
            path = prefix / "drive_c/Program Files (x86)/PayGo/PayGoWindows.exe"
            path.parent.mkdir(parents=True)
            path.write_bytes(b"MZ")
            (path.parent / "SetupPayGo.exe").write_bytes(b"MZ")
            with mock.patch.object(module, "PREFIX", prefix):
                self.assertEqual(module.principal_instalado(), path)


if __name__ == "__main__":
    unittest.main()
