"""Enfoque OS 0.2.4: regression checks for genuinely interactive desktop features."""
import struct
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CONFIG = BASE / "config/includes.chroot"
PANEL = CONFIG / "etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml"
PROGRAMS = CONFIG / "usr/share/applications"
ICONS = CONFIG / "usr/share/icons/hicolor/scalable/apps"


def plugin(number):
    return ET.parse(PANEL).getroot().find(f"./property[@name='plugins']/property[@name='plugin-{number}']")


class DesktopV024Tests(unittest.TestCase):
    def test_usable_volume_control(self):
        self.assertEqual(plugin(9).get("value"), "pulseaudio")
        pkg = (BASE / "config/package-lists/enfoque-base.list.chroot").read_text()
        packages = set(pkg.splitlines())
        self.assertTrue({"xfce4-pulseaudio-plugin", "pulseaudio", "pavucontrol",
                         "alsa-utils"}.issubset(packages))

    def test_wifi_connected_and_available_networks(self):
        self.assertEqual(plugin(8).get("value"), "systray")
        pkg = (BASE / "config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertIn("\nnetwork-manager-gnome\n", pkg)
        autostart = (CONFIG / "etc/xdg/autostart/enfoque-rede.desktop").read_text()
        self.assertIn("Exec=/usr/local/bin/enfoque-iniciar-rede", autostart)
        shell = (CONFIG / "usr/local/bin/enfoque-iniciar-rede").read_text()
        self.assertIn("pgrep -x nm-applet", shell)
        self.assertIn("exec nm-applet", shell)

    def test_clock_has_date_and_time(self):
        self.assertEqual(plugin(10).get("value"), "clock")
        t = plugin(10).find("./property[@name='digital-time-format']").get("value")
        d = plugin(10).find("./property[@name='digital-date-format']").get("value")
        self.assertIn("%H:%M", t)
        self.assertIn("%d/%m/%Y", d)
        self.assertEqual(plugin(11).get("value"), "showdesktop")

    def test_launchers_use_exact_sige_system_url(self):
        url = "https://enfoquepapelaria.meusige.com.br/sistema"
        for p in [PROGRAMS / "enfoque-sige.desktop",
                  CONFIG / "etc/skel/Desktop/SIGE.desktop"]:
            text = p.read_text()
            self.assertIn("Exec=google-chrome-stable --new-window " + url + "\n", text)
            self.assertNotIn("https://enfoquepapelaria.meusige.com.br/\n", text)

    def test_corporate_wallpaper_replaced(self):
        bg = CONFIG / "usr/share/backgrounds/enfoque-os"
        png = (bg / "wallpaper.png").read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(struct.unpack(">II", png[16:24]), (1920, 1080))
        jpg = (bg / "wallpaper.jpg").read_bytes()
        self.assertEqual(jpg[:3], b"\xff\xd8\xff")
        self.assertGreater(len(jpg), 100000)
        boot_cfg = (CONFIG / "etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml").read_text()
        self.assertIn("/usr/share/backgrounds/enfoque-os/wallpaper.jpg", boot_cfg)
        self.assertIn("unlocked=\"root\"", boot_cfg)

    def test_new_brand_icons_and_theme(self):
        names = ("enfoque-start", "enfoque-central", "enfoque-suporte",
                 "enfoque-diagnostico", "enfoque-sobre", "enfoque-inscrever")
        for name in names:
            icon = ET.parse(ICONS / (name + ".svg")).getroot()
            self.assertEqual(icon.get("viewBox"), "0 0 64 64")
            self.assertGreater(len(list(icon)), 3)
        settings = (CONFIG / "etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml").read_text()
        self.assertIn('value="Arc"', settings)
        css = CONFIG / "etc/skel/.config/gtk-3.0/gtk.css"
        self.assertTrue(css.is_file())

    def test_boot_screen_shows_correct_version(self):
        self.assertIn("0.2.6", (BASE / "config/bootloaders/syslinux_common/menu.cfg").read_text())
        self.assertIn("0.2.6", (BASE / "config/bootloaders/grub-pc/live-theme/theme.txt").read_text())


if __name__ == "__main__":
    unittest.main()
