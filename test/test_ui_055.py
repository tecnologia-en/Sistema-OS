"""Enfoque OS 0.2.55: regression checks for live-verified menu and icon fix."""
import ast
import re
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
SCRIPT=TREE/"usr/local/bin/enfoque-desktop-shell"
THEME=TREE/"usr/share/icons/windows-modern/index.theme"
GTK=TREE/"usr/share/themes/Aerobird-Sky-hdpi/gtk-3.0/gtk.css"

class Windows11Menu055(unittest.TestCase):
    def test_genuine_modern_icons_with_corporate_fallback(self):
        index=THEME.read_text()
        self.assertIn("Inherits=EnfoqueFluent,Papirus,Adwaita,breeze,breeze-dark,hicolor",index)
        for name in ("enfoque-my-computer","enfoque-calculator","enfoque-printer",
                     "enfoque-taskmanager","enfoque-recuperacao","enfoque-chevron-up",
                     "enfoque-computer-small"):
            p=TREE/f"usr/share/icons/EnfoqueFluent/scalable/apps/{name}.svg"
            self.assertTrue(p.is_file(),name)
            ET.parse(p)
        # WindowModern is still the first (primary) theme.
        x=ET.parse(TREE/"etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml").getroot()
        self.assertEqual(x.find("./property[@name='Net']/property[@name='IconThemeName']").get('value'),"windows-modern")

    def test_menu_uses_exact_size_and_six_across(self):
        source=SCRIPT.read_text()
        ast.parse(source)
        self.assertIn("image.set_pixel_size(size)",source)
        self.assertNotIn("Gtk.IconSize.DIALOG if size>=32",source)
        self.assertIn("fl.set_max_children_per_line(6)",source)
        self.assertIn("fl.set_min_children_per_line(6)",source)
        self.assertIn("APP_IDS[:18]",source)
        self.assertIn("box.pack_start(icon(ico,28)",source)
        self.assertIn('w,h=min(600,sw-18),min(570,sh-76)',source)
        self.assertNotIn("outer.pack_start(spacer,True,True,0)",source)
        self.assertIn('btn.connect("clicked",self.toggle_all_apps)',source)
        self.assertIn('self.all_apps_button.set_label("‹ Voltar"',source)

    def test_flat_tiles_not_glowing_bordered_cards(self):
        s=SCRIPT.read_text()
        css=re.search(r'CSS = b"""(.+?)"""',s,re.S).group(1)
        self.assertIn('button.enfoque-tile {',css)
        body=css.split('button.enfoque-tile {')[1].split('}',1)[0]
        for expected in ("background-image: none","border: none","box-shadow: none","min-width: 72px"):
            self.assertIn(expected,body)
        self.assertIn("button.enfoque-tile:hover",css)
        self.assertIn('entry.enfoque-search',css)
        self.assertNotIn("font-weight: 750",css)

    def test_dock_is_compact_with_active_underline_and_safety(self):
        css=GTK.read_text()
        self.assertIn("/* Enfoque OS 0.2.55: compact Win11-style dock",css)
        last=css.rsplit('#docklike-plugin button {',1)[-1].split('}',1)[0]
        self.assertIn("min-width: 38px",last)
        self.assertIn("margin: 0 1px",last)
        self.assertIn("background-image: none",last)
        self.assertIn("box-shadow: inset 0 -3px #58c2ff",css)
        self.assertIn("box-shadow: inset 0 -3px #ffb454",css)
        for path in (TREE/"etc/skel/.config/xfce4/panel/docklike-18.rc",
                     TREE/"etc/xdg/xfce4/panel/docklike.rc"):
            s=path.read_text()
            self.assertIn("iconSize=24",s)
            self.assertIn("pinned=google-chrome;enfoque-sige;enfoque-intranet;thunar;",s)

    def test_existing_user_profile_migration_is_conservative(self):
        s=(TREE/"usr/local/bin/enfoque-aplicar-visual").read_text()
        self.assertIn("enfoque-os-visual-v100",s)
        self.assertIn("s.count(\"iconSize=28\")==1",s)
        self.assertIn("if not backup.exists()",s)
        self.assertIn("shutil.copy2(p,backup)",s)
        self.assertNotIn("rm -rf \"$HOME/.config\"",s)
        self.assertIn("/usr/local/bin/enfoque-visual-migrate",s)

    def test_unchanged_printer_system_and_corporate_shell(self):
        self.assertTrue((TREE/"usr/lib/cups/filter/enfoque-bematech-fit").exists())
        self.assertTrue((TREE/"usr/local/sbin/enfoque-printer-share").exists())
        self.assertIn("enfoque-docklike-install",
                      (ROOT/"scripts/build-update-package.py").read_text())
        boot=(TREE/"etc/enfoque-os-release").read_text()
        self.assertIn('VERSION="1.0.0"',boot)

if __name__=="__main__":
    unittest.main()
