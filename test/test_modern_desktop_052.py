"""Behavior regressions for battery SVG and notification image hit target."""
import importlib.machinery, importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import json
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
BIN=TREE/"usr/local/bin"
loader=importlib.machinery.SourceFileLoader("battery052",str(BIN/"enfoque-bateria-painel"))
spec=importlib.util.spec_from_loader(loader.name,loader)
battery=importlib.util.module_from_spec(spec);loader.exec_module(battery)

class ModernDesktop(unittest.TestCase):
    def test_battery_real_svg_levels_and_no_emoji(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);bat=root/"BAT0";bat.mkdir()
            for k,v in {"type":"Battery","present":"1","status":"Discharging"}.items():
                (bat/k).write_text(v)
            for percent,icon,color in [(0,0,"#ef6468"),(15,0,"#ef6468"),(16,1,"#f1f5fa"),(51,3,"#f1f5fa"),(100,4,"#f1f5fa")]:
                (bat/"capacity").write_text(str(percent))
                markup=battery.battery_markup(root)
                self.assertIn(f"enfoque-battery-{icon}.svg",markup)
                self.assertIn(color,markup)
                self.assertNotIn("🔋",markup)
                ET.parse(TREE/f"usr/share/icons/EnfoqueFluent/scalable/status/enfoque-battery-{icon}.svg")
            (bat/"status").write_text("Charging")
            self.assertIn("enfoque-battery-charging.svg",battery.battery_markup(root))
            (bat/"status").write_text("Full")
            ac=root/"AC";ac.mkdir();(ac/"type").write_text("Mains");(ac/"online").write_text("1")
            self.assertIn("enfoque-battery-charging.svg",battery.battery_markup(root))
            (bat/"present").write_text("0")
            self.assertEqual(battery.battery_markup(root),"")
            (bat/"present").write_text("1");(bat/"capacity").write_text("invalid")
            self.assertEqual(battery.battery_markup(root),"")
    def test_notification_image_click_and_overlaid_count(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);state=home/".local/state/enfoque-os";state.mkdir(parents=True)
            (state/"hardware-status.json").write_text(json.dumps({"events":[{"state":"erro"}]}))
            env={**os.environ,"HOME":str(home),"XDG_RUNTIME_DIR":str(home)}
            output=subprocess.check_output(["python3",str(BIN/"enfoque-notificacoes-painel")],env=env,text=True)
            self.assertIn("<click>/usr/local/bin/enfoque-desktop-shell notifications</click>",output)
            self.assertNotIn("<txt>",output)
            self.assertNotIn("<txtclick>",output)
            image=ET.parse(home/"enfoque-panel/notification.svg")
            text=image.find("{http://www.w3.org/2000/svg}text")
            self.assertEqual(text.text,"1")
            first=(home/"enfoque-panel/notification.svg").stat().st_mtime_ns
            subprocess.check_output(["python3",str(BIN/"enfoque-notificacoes-painel")],env=env)
            self.assertEqual(first,(home/"enfoque-panel/notification.svg").stat().st_mtime_ns)
    def test_custom_user_stylesheet_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/".config/gtk-3.0/gtk.css";p.parent.mkdir(parents=True)
            p.write_text("/* my accessible contrast settings */")
            subprocess.run(["python3",str(BIN/"enfoque-visual-migrate")],env={**os.environ,"HOME":temp},check=True)
            self.assertEqual(p.read_text(),"/* my accessible contrast settings */")
