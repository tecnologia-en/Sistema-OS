"""0.2.41 on-demand X11 screen/mouse input, without root privileges."""
from release_contract import assert_minimum_release
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

BASE = pathlib.Path(__file__).resolve().parents[1]
FILE = BASE/"config/includes.chroot/usr/local/lib/enfoque-session/visual.py"
spec = importlib.util.spec_from_file_location("enfoque_visual", FILE)
visual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(visual)


class VisualInput041(unittest.TestCase):
    def setUp(self):
        self.screen = patch.object(visual, "dimensions", return_value=(None,1366,768))
        self.runner = patch.object(visual, "_xdo")
        self.screen.start()
        self.xdo = self.runner.start()

    def tearDown(self):
        self.runner.stop()
        self.screen.stop()

    def test_geometry_and_mouse_coordinates(self):
        self.assertEqual(visual.gui({"op":"screen_size"})["width"],1366)
        self.assertEqual(visual.gui({"op":"move","x":900,"y":450})["x"],900)
        self.xdo.assert_called_with("mousemove","--sync","900","450")
        visual.gui({"op":"click","x":12,"y":13,"button":"right"})
        self.xdo.assert_any_call("click","--repeat","1","--delay","85","3")
        with self.assertRaises(visual.VisualError):
            visual.gui({"op":"move","x":1366,"y":0})
        with self.assertRaises(visual.VisualError):
            visual.gui({"op":"move","x":-1,"y":0})
        with self.assertRaises(visual.VisualError):
            visual.gui({"op":"click","x":12,"y":13,"button":"invalid"})

    def test_type_and_keystrokes_validate_inputs(self):
        self.assertEqual(visual.gui({"op":"type","text":"olá"})["typedChars"],3)
        self.xdo.assert_called_with("type","--clearmodifiers","--delay","5","--","olá",timeout=15)
        visual.gui({"op":"hotkey","keys":["Control_L","c"]})
        self.xdo.assert_called_with("key","--clearmodifiers","Control_L+c")
        for event in (
          {"op":"type","text":"x"*1201}, {"op":"hotkey","keys":["; rm -rf /"]},
          {"op":"hotkey","keys": []}, {"op":"unknown"}, {"op":"key","key":"--help"}
        ):
            with self.assertRaises(visual.VisualError):
                visual.gui(event)

    def test_scroll_and_button_state(self):
        visual.gui({"op":"mouse_down","button":"left"})
        self.xdo.assert_called_with("mousedown","1")
        visual.gui({"op":"mouse_up","button":"left"})
        self.xdo.assert_called_with("mouseup","1")
        visual.gui({"op":"scroll","delta":-240})
        self.xdo.assert_called_with("click","--repeat","2","5")
        with self.assertRaises(visual.VisualError):
            visual.gui({"op":"scroll","delta":100000})

    def test_client_route_and_requirements(self):
        agent = (BASE/"config/includes.chroot/usr/local/bin/enfoque-remote-agent").read_text()
        bridge = (BASE/"config/includes.chroot/usr/local/lib/enfoque-session/bridge.py").read_text()
        session = (BASE/"config/includes.chroot/usr/local/bin/enfoque-session-agent").read_text()
        self.assertIn('("screenshot", "gui")', agent)
        self.assertIn('"gui", "screenshot"', bridge)
        self.assertIn('from visual import capture, gui, VisualError', session)
        self.assertIn("xdotool", (BASE/"config/package-lists/enfoque-base.list.chroot").read_text())
        assert_minimum_release(self, (BASE/"config/includes.chroot/etc/enfoque-os-release").read_text())


if __name__=="__main__":
    unittest.main()
