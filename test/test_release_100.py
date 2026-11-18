"""Enfoque OS 1.0.0: gated Salão animation and safe window compositor."""
import ast
from pathlib import Path
import re
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
SH=TREE/"usr/local/bin/enfoque-desktop-shell"
PILOT=TREE/"usr/local/bin/enfoque-animacoes-piloto"
RESET=TREE/"usr/local/bin/enfoque-animacoes-desativar"
DESKTOP=TREE/"etc/xdg/autostart/enfoque-animacoes-piloto.desktop"
CONFIG=TREE/"usr/local/lib/enfoque-animations/picom-pilot.conf"


class Release100(unittest.TestCase):
    def test_semver_and_pilot_status(self):
        rel=(TREE/"etc/enfoque-os-release").read_text()
        match=re.search(r'(?m)^VERSION="([0-9]+[.][0-9]+[.][0-9]+)"$',rel)
        self.assertIsNotNone(match)
        version=tuple(map(int,match.group(1).split('.')))
        self.assertGreaterEqual(version,(1,0,0))
        self.assertIn('STATUS="piloto-animacoes-100"',rel)
        for relpath in ("config/bootloaders/grub-pc/live-theme/theme.txt",
                        "config/bootloaders/syslinux_common/menu.cfg"):
            self.assertIn(match.group(1),(ROOT/relpath).read_text(),relpath)
        # Driver catalog versions document the frozen printer-bank baseline.
        for relpath in ("config/includes.chroot/etc/enfoque-os/drivers/catalog.json",
                        "config/includes.chroot/etc/enfoque-os/drivers/printer-catalog.json"):
            self.assertIn("1.0.0",(ROOT/relpath).read_text(),relpath)

    def test_animation_enabled_by_default_with_local_optout(self):
        source=SH.read_text()
        ast.parse(source)
        self.assertIn('return not (prefs/"animations-disabled").exists()',source)
        self.assertNotIn('os.uname().nodename=="salao-ilha"',source)
        self.assertIn('if animate:',source)
        self.assertIn('self._animate_menu_open(win,x,y)',source)
        self.assertIn("duration=.180",source)
        self.assertIn("GLib.timeout_add(16,frame)",source)
        self.assertIn("self.search_text.grab_focus()",source)

    def test_compositor_falls_back_to_xfwm_and_applies_globally(self):
        data=PILOT.read_text()
        self.assertNotIn('host" != "salao-ilha"',data)
        self.assertIn('animations-disabled',data)
        self.assertIn('pgrep -u "$(id -u)" -x picom',data)
        self.assertIn('xfconf-query -c xfwm4 -p /general/use_compositing -s false',data)
        self.assertIn('xfconf-query -c xfwm4 -p /general/use_compositing -s true',data)
        self.assertIn('/usr/bin/picom --config "$conf" --backend xrender',data)
        self.assertNotIn('pkill -f chrome',data)
        self.assertTrue(DESKTOP.is_file())
        self.assertIn('Exec=/usr/local/bin/enfoque-animacoes-piloto',DESKTOP.read_text())
        self.assertIn("OnlyShowIn=XFCE;",DESKTOP.read_text())

    def test_opting_out_is_reversible(self):
        data=RESET.read_text()
        self.assertIn('animations-disabled',data)
        self.assertIn('Hidden=true',data)
        self.assertIn('xfconf-query -c xfwm4 -p /general/use_compositing -s true',data)
        for file in (PILOT,RESET):
            self.assertTrue(file.stat().st_mode & 0o111)
            proc=subprocess.run(["sh","-n",str(file)],check=False)
            self.assertEqual(proc.returncode,0,file.name)

    def test_resource_usage_and_dependencies(self):
        config=CONFIG.read_text()
        self.assertIn('backend = "xrender";',config)
        self.assertIn("fading = true;",config)
        self.assertIn("fade-delta = 12;",config)
        self.assertIn("shadow = false;",config)
        self.assertIn("unredir-if-possible = false;",config)
        base=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertIn("\npicom\n",base)
        pack=(ROOT/"scripts/build-update-package.py").read_text()
        self.assertIn(", picom, xfce4-genmon-plugin",pack)
        self.assertIn('"usr/local/lib/enfoque-"',pack)
        self.assertIn('"etc/xdg/autostart/enfoque-"',pack)

    def test_current_salon_config_and_production_printers_are_preserved(self):
        visual=(TREE/"usr/local/bin/enfoque-aplicar-visual").read_text()
        self.assertIn("enfoque-os-visual-v100",visual)
        self.assertNotIn('"$(hostname)" = "salao-ilha"',visual)
        self.assertIn('set_xfconf xsettings /Gtk/EnableAnimations bool true',visual)
        self.assertIn('set_xfconf xfwm4 /general/use_compositing bool true',visual)
        self.assertTrue((TREE/"usr/lib/cups/filter/enfoque-bematech-fit").is_file())
        self.assertTrue((TREE/"usr/local/sbin/enfoque-printer-share").is_file())
        self.assertTrue((TREE/"usr/share/themes/Aerobird-Sky-hdpi/gtk-3.0/gtk.css").is_file())
        self.assertTrue((TREE/"usr/share/icons/windows-modern/index.theme").is_file())


if __name__ == "__main__":
    unittest.main()
