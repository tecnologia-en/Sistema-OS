"""Regressoes da versao 0.2.42: tema dim e bloqueio seguro."""
import importlib.machinery
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"
WRAPPER = TREE / "usr/local/bin/enfoque-papel-parede-ocioso"
POLICY = TREE / "usr/local/bin/enfoque-proteger-tela"
THEME = TREE / "usr/share/applications/screensavers/enfoque-wallpaper-dim.desktop"


def load_module():
    loader = importlib.machinery.SourceFileLoader("enfoque_idle_042", str(WRAPPER))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class Version042Tests(unittest.TestCase):
    def test_papel_de_parede_atual_e_selecionado(self):
        m = load_module()
        with tempfile.TemporaryDirectory() as d:
            wallpaper = Path(d) / "teste com espaco.png"
            wallpaper.write_bytes(b"wallpaper mock")
            result = subprocess.CompletedProcess(
                args=[], returncode=0,
                stdout=f"/backdrop/screen0/monitor0/workspace0/last-image {wallpaper}\n",
            )
            with mock.patch.object(m.subprocess, "run", return_value=result):
                self.assertEqual(m.configured_wallpaper(), wallpaper)

    def test_fallback_para_papel_de_parede_do_sistema(self):
        m = load_module()
        with mock.patch.object(m.subprocess, "run", side_effect=OSError("dbus offline")):
            self.assertEqual(m.configured_wallpaper(), m.DEFAULT_WALLPAPER)

    def test_valida_caminhos_antes_de_abrir(self):
        m = load_module()
        self.assertFalse(m.valid_image(Path("wallpaper-relativo.png")))
        self.assertFalse(m.valid_image(Path("/sem/papel/de/parede.png")))

    def test_configuracao_preserva_3_e_15_minutos_e_pam(self):
        p = POLICY.read_text("utf8")
        self.assertIn("/saver/idle-activation/delay int 3", p)
        self.assertIn("/lock/saver-activation/delay int 12", p)
        self.assertIn("/lock/enabled bool true", p)
        self.assertIn("/saver/mode int 2", p)
        self.assertIn("enfoque-wallpaper-dim", p)
        self.assertIn("/xfce4-power-manager/dpms-enabled bool false", p)
        self.assertIn("xset s off -dpms", p)
        self.assertIn("tela-042-configurada", p)
        self.assertIn("if [ -e /run/live/medium ]; then", p)
        self.assertIn("xfce4-screensaver-command", p)
        self.assertNotIn("passwd ", p)

    def test_tema_executa_slideshow_nativo(self):
        s = THEME.read_text("utf8")
        self.assertIn("Categories=Screensaver;", s)
        self.assertIn("Exec=/usr/libexec/xfce4-screensaver/enfoque-wallpaper-dim", s)
        self.assertTrue((TREE / "usr/libexec/xfce4-screensaver/enfoque-wallpaper-dim").is_file())
        script = WRAPPER.read_text("utf8")
        self.assertIn("XSCREENSAVER_WINDOW", script)
        self.assertIn("os.execv(SLIDESHOW", script)
        self.assertIn("pix.composite", script)
        self.assertIn("dim.savev", script)

    def test_versao_e_manifesto(self):
        release = (TREE / "etc/enfoque-os-release").read_text("utf8")
        self.assertIn('VERSION="0.2.42"', release)
        p = (ROOT / "scripts/build-update-package.py").read_text("utf8")
        self.assertIn('"usr/share/applications/screensavers/enfoque-"', p)
        self.assertIn('"usr/share/applications/screensavers/enfoque-wallpaper-dim.desktop"', p)
        self.assertIn('"usr/libexec/xfce4-screensaver/enfoque-wallpaper-dim"', p)


if __name__ == "__main__":
    unittest.main()
