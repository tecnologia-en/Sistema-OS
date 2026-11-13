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

    def test_unified_docklike_taskbar_and_attention(self):
        ids=[int(x.get("value")) for x in self.panel.find("./property[@name='plugin-ids']")]
        self.assertEqual(ids,[1,14,7,18,15,12,8,13,9,17,16,10,11])
        self.assertLess(ids.index(1),ids.index(14))
        self.assertLess(ids.index(14),ids.index(18))
        self.assertGreater(ids.index(10),ids.index(8))
        self.assertLess(ids.index(17),ids.index(16))
        self.assertEqual(ids[-2:],[10,11])
        self.assertEqual(self.plugins.find("./property[@name='plugin-1']").get("value"),"launcher")
        self.assertEqual(self.plugins.find("./property[@name='plugin-18']").get("value"),"docklike")
        for old in (2,3,4,5,6):
            self.assertIsNone(self.plugins.find(f"./property[@name='plugin-{old}']"))
        for plugin_id in (7,15):
            self.assertEqual(self.plugins.find(f"./property[@name='plugin-{plugin_id}']").get("value"),"separator")
        for plugin_id,typ in ((14,"genmon"),(8,"launcher"),(9,"pulseaudio"),(10,"genmon"),(11,"genmon")):
            self.assertEqual(self.plugins.find(f"./property[@name='plugin-{plugin_id}']").get("value"),typ)
        p=self.plugins.find("./property[@name='plugin-12']")
        self.assertEqual(p.get("value"),"launcher")
        self.assertEqual(p.find("./property[@name='items']/value").get("value"),"enfoque-id.desktop")
        pinned=(ROOT / "config/includes.chroot/etc/skel/.config/xfce4/panel/docklike-18.rc").read_text()
        self.assertIn("pinned=google-chrome;enfoque-sige;enfoque-intranet;thunar;",pinned)
        self.assertIn("showPreviews=false",pinned)
        self.assertIn("indicatorColor=rgb(108,211,255)",pinned)

    def test_windows_11_search_and_transparent_glass_taskbar(self):
        panel = self.panel
        background = panel.find("./property[@name='background-rgba']")
        self.assertEqual(float(background.findall("./value")[-1].get("value")), 1.0)
        for plugin_id in (7, 15):
            plugin = self.plugins.find(f"./property[@name='plugin-{plugin_id}']")
            self.assertEqual(plugin.find("./property[@name='expand']").get("value"), "true")
        search = ROOT / "config/includes.chroot/usr/local/bin/enfoque-busca-painel"
        self.assertIn("<txtclick>/usr/local/bin/enfoque-desktop-shell menu</txtclick>", search.read_text())
        settings = ROOT / "config/includes.chroot/etc/skel/.config/xfce4/panel/genmon-14.rc"
        self.assertIn("Command=/usr/local/bin/enfoque-busca-painel", settings.read_text())
        css = ROOT / "config/includes.chroot/usr/share/themes/EnfoqueModern/gtk-3.0/panel.css"
        style = css.read_text()
        self.assertIn("#XfcePanelWindow", style)
        package = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertIn("\nxfce4-genmon-plugin\n", package)
        self.assertIn("\nxfce4-panel\n", package)
        self.assertIn("\nxfce4-docklike-plugin\n",package)
        self.assertIn("#docklike-plugin .group.open_group",style)
        self.assertIn("#docklike-plugin .group.open_group.active_group",style)
        self.assertIn("#docklike-plugin .group.enfoque_attention",style)
        self.assertIn("#ffb454",style)

    def test_original_fluent_style_icons_and_papirus_fallback(self):
        base = ROOT / "config/includes.chroot/usr/share/icons/EnfoqueFluent"
        theme = (base / "index.theme").read_text(encoding="utf-8")
        self.assertIn("Inherits=Papirus,Adwaita,hicolor", theme)
        settings = ET.parse(ROOT / "config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml").getroot()
        p = settings.find("./property[@name='Net']/property[@name='IconThemeName']")
        self.assertEqual(p.get("value"), "windows-modern")
        for rel in ("scalable/places/folder.svg", "scalable/places/user-trash.svg",
                    "scalable/apps/utilities-terminal.svg",
                    "scalable/status/network-wireless-signal-excellent-symbolic.svg",
                    "scalable/status/audio-volume-high-symbolic.svg"):
            svg = ET.parse(base / rel).getroot()
            self.assertTrue(svg.tag.endswith("svg"))
            self.assertNotIn("script", ET.tostring(svg, encoding="unicode"))

    def test_windows_key_and_start_icon_only(self):
        launcher=self.plugins.find("./property[@name='plugin-1']")
        self.assertEqual(launcher.get("value"),"launcher")
        self.assertEqual(launcher.find("./property[@name='items']/value").get("value"),"enfoque-menu.desktop")
        app=(ROOT/"config/includes.chroot/usr/share/applications/enfoque-menu.desktop").read_text()
        self.assertIn("Icon=enfoque-start",app)
        self.assertIn("Exec=/usr/local/bin/enfoque-desktop-shell menu",app)
        hotkey=(ROOT/"config/includes.chroot/usr/local/bin/enfoque-super-key").read_text()
        self.assertIn("Super_L=Control_L|Escape",hotkey)
        keymap=ROOT/"config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-keyboard-shortcuts.xml"
        tree=ET.parse(keymap).getroot()
        binding=tree.find("./property[@name='commands']/property[@name='custom']/property[@name='<Primary>Escape']")
        self.assertIsNotNone(binding)
        self.assertEqual(binding.get("value"),"/usr/local/bin/enfoque-desktop-shell menu")

    def test_laptop_battery_indicator_and_charge(self):
        p = self.plugins.find("./property[@name='plugin-13']")
        self.assertEqual(p.get("value"), "genmon")
        battery = ROOT / "config/includes.chroot/etc/skel/.config/xfce4/panel/genmon-13.rc"
        settings = battery.read_text(encoding="utf-8")
        self.assertIn("Command=/usr/local/bin/enfoque-bateria-painel", settings)
        self.assertIn("UseLabel=0", settings)
        self.assertIn("UpdatePeriod=15000", settings)
        package = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertIn("\nxfce4-battery-plugin\n", package)
        self.assertIn("\nupower\n", package)

    def test_id_button_is_persistent_and_payment_tool_is_search_only(self):
        xml = PANEL.read_text(encoding="utf-8")
        self.assertIn("enfoque-id.desktop", xml)
        self.assertNotIn("enfoque-paygo-teste.desktop", xml)
        launcher = ROOT / "config/includes.chroot/etc/skel/.config/xfce4/panel/launcher-12/enfoque-id.desktop"
        self.assertIn("Exec=/usr/local/bin/enfoque-id --dialog", launcher.read_text(encoding="utf-8"))
        self.assertTrue((APPS / "enfoque-paygo-teste.desktop").is_file())
        self.assertFalse((ROOT / "config/includes.chroot/etc/skel/Desktop/Teste PayGo.desktop").exists())

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
