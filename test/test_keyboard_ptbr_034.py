"""Regression tests for ABNT2 in Live, LightDM and the installed Enfoque OS.

Tests only read source files; they never change the host keyboard.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'config/includes.chroot'


class KeyboardPtBrTests(unittest.TestCase):
    def test_default_keyboard_is_brazilian_abnt2(self):
        defaults = (BASE / 'etc/default/keyboard').read_text(encoding='utf-8')
        for setting in ('XKBMODEL="abnt2"', 'XKBLAYOUT="br"',
                        'XKBVARIANT=""', 'XKBOPTIONS=""'):
            self.assertIn(setting, defaults)

    def test_x11_login_and_installer_use_same_layout(self):
        xorg = (BASE / 'etc/X11/xorg.conf.d/00-enfoque-teclado-ptbr.conf').read_text()
        for directive in ('Section "InputClass"', 'MatchIsKeyboard "on"',
                          'Option "XkbModel" "abnt2"', 'Option "XkbLayout" "br"'):
            self.assertIn(directive, xorg)

    def test_live_boot_has_brazilian_layout(self):
        build = (ROOT / 'scripts/build-iso.sh').read_text()
        self.assertIn('keyboard-layouts=br keyboard-model=abnt2', build)
        self.assertIn('locales=pt_BR.UTF-8', build)

    def test_installer_persists_layout_on_disk(self):
        script = (BASE / 'usr/local/sbin/enfoque-install-system').read_text()
        self.assertIn('TARGET / "etc/default/keyboard"', script)
        self.assertIn('write_text(keyboard_pt_br, encoding="utf-8")', script)
        self.assertIn("'XKBMODEL=\"abnt2\"\\n'", script)
        self.assertIn("'XKBLAYOUT=\"br\"\\n'", script)
        self.assertIn('VERSION="0.2.45"', (BASE / 'etc/enfoque-os-release').read_text())


if __name__ == '__main__':
    unittest.main()
