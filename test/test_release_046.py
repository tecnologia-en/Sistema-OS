"""0.2.46: Chrome native file chooser and root-only XFCE personalization.

The two changes must be present both on a fresh ISO and in a signed APT
package for already-enrolled Enfoque OS computers. No upgrade is dispatched.
"""
import configparser
import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
GLOBAL=TREE/"etc/xdg/xfce4"
DEFAULT=TREE/"etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml"
XFCONF=GLOBAL/"xfconf/xfce-perchannel-xml"

def xml(path):
    return ET.parse(path).getroot()

def values(node):
    """Compare the panel template independent of whitespace/comments."""
    out=[]
    for child in node:
        out.append((child.tag,tuple(sorted(child.attrib.items())),values(child)))
    return out

class PortalAndAdminLock(unittest.TestCase):
    def test_version(self):
        release=(TREE/"etc/enfoque-os-release").read_text()
        self.assertIn('VERSION="0.2.48"',release)
        self.assertIn('PACKAGE_REVISION="1"',release)

    def test_file_chooser_portal_installed_in_iso(self):
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text().splitlines()
        for package in ("xdg-desktop-portal","xdg-desktop-portal-gtk",
                        "dbus-user-session","gvfs","google-chrome-stable"):
            # Chrome itself is installed by a vendor HTTPS hook, not in the
            # Debian package list. Do not add an unsigned replacement.
            if package=="google-chrome-stable":
                self.assertTrue((ROOT/"config/hooks/normal/075-instalar-chrome.hook.chroot").exists() or
                                any("chrome" in p.name for p in (ROOT/"config/hooks/normal").glob("*.hook.chroot")))
                continue
            self.assertIn(package,packages)
            self.assertEqual(packages.count(package),1)

    def test_xfconf_channel_is_root_only(self):
        locked=xml(XFCONF/"xfce4-panel.xml")
        self.assertEqual(locked.get("name"),"xfce4-panel")
        self.assertEqual(locked.get("unlocked"),"root")
        self.assertIsNone(locked.get("locked"))
        normal=xml(DEFAULT/"xfce4-panel.xml")
        self.assertEqual(values(locked),values(normal),
                         "The root policy must include the complete production panel so existing user icons get restored")
        panel=locked.find("./property[@name='panels']/property[@name='panel-1']")
        self.assertEqual(panel.find("./property[@name='position-locked']").get("value"),"true")
        plug=locked.find("./property[@name='plugins']/property[@name='plugin-1']")
        self.assertEqual(plug.get("value"),"launcher")
        self.assertEqual(plug.find("./property[@name='items']/value").get("value"),"enfoque-menu.desktop")
        self.assertEqual(locked.find("./property[@name='plugins']/property[@name='plugin-18']").get("value"),"docklike")

    def test_legacy_xfce_panel_kiosk_property_menu_blocked(self):
        kiosk=configparser.ConfigParser(interpolation=None)
        self.assertEqual(kiosk.read(GLOBAL/"kiosk/kioskrc"),[str(GLOBAL/"kiosk/kioskrc")])
        self.assertEqual(kiosk.get("xfce4-panel","CustomizePanel"),"NONE")
        self.assertEqual(kiosk.get("xfce4-desktop","CustomizeBackdrop"),"NONE")
        self.assertEqual(kiosk.get("xfce4-desktop","CustomizeDesktopIcons"),"NONE")
        menu=(TREE/"usr/share/applications/enfoque-menu.desktop").read_text()
        self.assertIn("Icon=enfoque-start",menu)
        self.assertIn("Exec=/usr/local/bin/enfoque-desktop-shell menu",menu)

    def test_appearance_themes_are_restricted_not_keyboard_or_accessibility(self):
        x=xml(XFCONF/"xsettings.xml")
        self.assertEqual(x.get("name"),"xsettings")
        for prop,wanted in (("./property[@name='Net']/property[@name='ThemeName']","Arc"),
                            ("./property[@name='Net']/property[@name='IconThemeName']","EnfoqueFluent"),
                            ("./property[@name='Gtk']/property[@name='FontName']","Noto Sans 10")):
            item=x.find(prop)
            self.assertIsNotNone(item)
            self.assertEqual(item.get("unlocked"),"root")
            self.assertEqual(item.get("value"),wanted)
        self.assertIsNone(x.find("./property[@name='Net']/property[@name='DoubleClickTime']"))
        self.assertIsNone(x.find("./property[@name='Gtk']/property[@name='CursorThemeSize']"))
        window=xml(XFCONF/"xfwm4.xml")
        title=window.find("./property[@name='general']/property[@name='theme']")
        self.assertEqual(title.get("value"),"Arc")
        self.assertEqual(title.get("unlocked"),"root")
        desktop=xml(XFCONF/"xfce4-desktop.xml")
        self.assertEqual(desktop.get("unlocked"),"root")
        self.assertEqual(desktop.find("./property[@name='desktop-icons']").get("unlocked"),"root")
        self.assertEqual(desktop.find("./property[@name='backdrop']").get("unlocked"),"root")

    def test_root_owns_panel_and_excludes_user_writable_kiosk(self):
        for filename in ("kiosk/kioskrc","xfconf/xfce-perchannel-xml/xfce4-panel.xml",
                         "xfconf/xfce-perchannel-xml/xsettings.xml",
                         "xfconf/xfce-perchannel-xml/xfwm4.xml"):
            p=GLOBAL/filename
            self.assertTrue(p.is_file())
            self.assertFalse(p.is_symlink())
            self.assertEqual(p.stat().st_mode & 0o002,0,"System lock file must not be world-writable")

    def test_apt_package_contains_every_root_policy(self):
        spec=importlib.util.spec_from_file_location("build046",ROOT/"scripts/build-update-package.py")
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        files={name for name,_ in module.manifest()}
        for rel in ("etc/xdg/xfce4/kiosk/kioskrc",
                    "etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml",
                    "etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml",
                    "etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml",
                    "etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml"):
            self.assertIn(rel,files)
        spec_text=(ROOT/"scripts/build-update-package.py").read_text()
        for pkg in ("xdg-desktop-portal, xdg-desktop-portal-gtk","etc/xdg/xfce4/kiosk/kioskrc"):
            self.assertIn(pkg,spec_text)
        self.assertIn("systemctl disable --now enfoque-update-apply.timer",spec_text)
        self.assertNotIn("systemctl restart display-manager.service",spec_text)

    def test_ci_validates_new_release_and_does_not_publish_to_server(self):
        workflow=(ROOT/".github/workflows/build-iso.yml").read_text()
        self.assertIn("test/test_release_046.py",workflow)
        self.assertIn("test-xfce-kiosk-policy.sh",workflow)
        self.assertIn("test-xfce-diversion.sh",workflow)
        self.assertIn("xfce_kiosk_probe.c",workflow)
        self.assertIn("xdg-desktop-portal-gtk",workflow)
        self.assertNotIn("publish-update-repo.sh",workflow)
        self.assertIn("gh release create",workflow)
        checker=(ROOT/"scripts/check-project.sh").read_text()
        self.assertIn("test_release_046.py",checker)
        self.assertIn('VERSION="0.2.48"',(TREE/"etc/enfoque-os-release").read_text())
        self.assertTrue((ROOT/"docs/RELEASE_046_PORTAL_PANEL_LOCK.md").is_file())

if __name__=="__main__":
    unittest.main()
