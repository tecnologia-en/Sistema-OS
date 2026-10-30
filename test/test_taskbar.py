"""Verificacoes da barra do Enfoque OS e dos icones reais dos sites."""
import base64
import struct
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL = ROOT / "config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml"
ICONS = ROOT / "config/includes.chroot/usr/share/icons/hicolor/scalable/apps"
APPS = ROOT / "config/includes.chroot/usr/share/applications"


class TaskbarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = ET.parse(PANEL).getroot()
        cls.panels = cls.tree.find("./property[@name='panels']")
        cls.panel = cls.panels.find("./property[@name='panel-1']") if cls.panels is not None else None
        cls.plugins = cls.tree.find("./property[@name='plugins']")

    def panel_value(self, prop):
        self.assertIsNotNone(self.panel)
        node = self.panel.find(f"./property[@name='{prop}']")
        self.assertIsNotNone(node, prop)
        return node.get("value")

    def test_bottom_single_fullwidth_locked_panel(self):
        self.assertIsNotNone(self.panels)
        self.assertEqual(self.panels.find("./value").get("value"), "1")
        self.assertIsNotNone(self.panel, "Atributos devem ficar dentro de /panels/panel-1, e nao na raiz.")
        self.assertEqual(self.panel_value("position"), "p=10;x=0;y=0")
        self.assertEqual(self.panel_value("length"), "100")
        self.assertEqual(self.panel_value("length-adjust"), "false")
        self.assertEqual(self.panel_value("autohide-behavior"), "0")
        self.assertEqual(self.panel_value("position-locked"), "true")
        self.assertEqual(self.panel_value("nrows"), "1")
        self.assertEqual(self.panel_value("mode"), "0")
        self.assertGreaterEqual(int(self.panel_value("size")), 40)
        self.assertEqual(self.panels.find("./property[@name='dark-mode']").get("value"), "true")

    def test_ordered_independent_launchers_and_tasklist(self):
        ids = [int(x.get("value")) for x in self.panel.find("./property[@name='plugin-ids']")]
        self.assertEqual(ids, list(range(1, 13)))
        self.assertIsNotNone(self.plugins)
        self.assertEqual(self.plugins.find("./property[@name='plugin-1']").get("value"), "whiskermenu")
        for plugin_id, desktop in [(2,"google-chrome.desktop"), (3,"enfoque-sige.desktop"),
                                   (4,"enfoque-intranet.desktop"), (5,"thunar.desktop")]:
            p = self.plugins.find(f"./property[@name='plugin-{plugin_id}']")
            self.assertEqual(p.get("value"), "launcher")
            items = [v.get("value") for v in p.find("./property[@name='items']")]
            self.assertEqual(items, [desktop], "Atalhos precisam de botoes independentes")
        self.assertEqual(self.plugins.find("./property[@name='plugin-6']").get("value"), "tasklist")
        self.assertEqual(self.plugins.find("./property[@name='plugin-7']").get("value"), "separator")
        self.assertEqual(self.plugins.find("./property[@name='plugin-8']").get("value"), "systray")
        self.assertEqual(self.plugins.find("./property[@name='plugin-9']").get("value"), "pulseaudio")
        self.assertEqual(self.plugins.find("./property[@name='plugin-10']").get("value"), "clock")
        self.assertEqual(self.plugins.find("./property[@name='plugin-11']").get("value"), "showdesktop")
        p = self.plugins.find("./property[@name='plugin-12']")
        self.assertEqual(p.get("value"), "launcher")
        self.assertEqual(p.find("./property[@name='items']/value").get("value"), "enfoque-id.desktop")

    def test_launchers_retain_site_and_real_icons(self):
        for name, icon, host in [
            ("enfoque-sige.desktop", "enfoque-sige", "enfoquepapelaria.meusige.com.br/sistema"),
            ("enfoque-intranet.desktop", "enfoque-intranet", "intranet.enfoquepapelaria.com.br/")
        ]:
            content = (APPS/name).read_text(encoding="utf-8")
            self.assertIn("Icon="+icon, content)
            self.assertIn("google-chrome-stable --new-window https://"+host, content)

    def test_intranet_icon_is_public_site_svg(self):
        svg = ET.parse(ICONS/"enfoque-intranet.svg").getroot()
        self.assertTrue(svg.tag.endswith("svg"))
        self.assertEqual(svg.get("viewBox"), "0 0 64 64")
        self.assertEqual(svg.get("aria-label"), "Intranet Enfoque")
        self.assertFalse(any(x.tag.endswith("script") for x in svg.iter()))

    def test_sige_icon_preserves_real_browser_favicon(self):
        svg = ET.parse(ICONS/"enfoque-sige.svg").getroot()
        self.assertEqual(svg.get("viewBox"), "0 0 40 40")
        im = next(x for x in svg if x.tag.endswith("image"))
        href = im.get("href", "")
        self.assertTrue(href.startswith("data:image/png;base64,"))
        raw = base64.b64decode(href.split(",",1)[1],validate=True)
        self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(struct.unpack(">II",raw[16:24]), (40,40))
        fallback = ROOT/"config/includes.chroot/usr/share/icons/hicolor/48x48/apps/enfoque-sige.png"
        self.assertTrue(fallback.is_file())
        self.assertEqual(fallback.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")


if __name__ == "__main__":
    unittest.main()
