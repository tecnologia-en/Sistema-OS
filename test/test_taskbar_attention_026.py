"""Enfoque OS 0.2.26: pinned/open/focused/urgent taskbar regressions."""
import hashlib
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"config/includes.chroot"
PANEL=BASE/"etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml"

class DocklikeAttentionTests(unittest.TestCase):
    def test_combines_pinned_and_running_windows_in_one_plugin(self):
        root=ET.parse(PANEL).getroot()
        ids=[int(v.get("value")) for v in root.findall("./property[@name='panels']/property[@name='panel-1']/property[@name='plugin-ids']/value")]
        self.assertEqual(ids,[1,14,7,18,15,12,8,13,9,17,16,10,11])
        self.assertEqual(root.find("./property[@name='plugins']/property[@name='plugin-18']").get("value"),"docklike")
        for legacy in (2,3,4,5,6):
            self.assertNotIn(legacy,ids)

    def test_pinned_icons_and_active_indicator(self):
        conf=(BASE/"etc/skel/.config/xfce4/panel/docklike-18.rc").read_text()
        self.assertIn("pinned=google-chrome;enfoque-sige;enfoque-intranet;thunar;",conf)
        self.assertIn("showPreviews=false",conf)
        self.assertIn("indicatorColor=rgb(108,211,255)",conf)
        self.assertIn("indicatorStyle=0",conf)
        self.assertEqual(conf,(BASE/"etc/xdg/xfce4/panel/docklike.rc").read_text())

    def test_orange_pulse_only_for_urgent_and_unfocused_windows(self):
        patch=(ROOT/"patches/xfce4-docklike-attention-0.4.3.patch").read_text()
        for token in ("XFW_WINDOW_STATE_URGENT","refreshAttention",
                      "if (!mActive)",'\"enfoque_attention\"',"g_timeout_add(900",
                      "g_source_remove(mAttentionTimerId)"):
            self.assertIn(token,patch)
        self.assertNotIn("g_timeout_add(100",patch)

    def test_style_distinguishes_open_active_and_attention(self):
        style=(BASE/"etc/skel/.config/gtk-3.0/gtk.css").read_text()
        self.assertIn("#docklike-plugin .group.open_group {",style)
        self.assertIn("#docklike-plugin .group.open_group.active_group {",style)
        self.assertIn("#docklike-plugin .group.enfoque_attention {",style)
        self.assertIn("rgba(255, 167, 64, .93)",style)

    def test_pinned_source_archive_immutable(self):
        archive=ROOT/"third_party/xfce4-docklike-plugin-0.4.3.tar.bz2"
        self.assertTrue(archive.exists())
        checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
        self.assertEqual(checksum,"e81e16b4ab1c655a3202473d78cc81617bb4829e5dd102eecabf9addd7668a9d")
        self.assertIn(checksum,(ROOT/"scripts/build-docklike.sh").read_text())

    def test_package_and_iso_hooks_remain_reproducible(self):
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text().splitlines()
        self.assertIn("xfce4-docklike-plugin",packages)
        build=(ROOT/"scripts/build-iso.sh").read_text()
        self.assertLess(build.index("scripts/build-docklike.sh"),build.index("scripts/build-update-package.py"))
        install=(BASE/"usr/local/sbin/enfoque-docklike-install").read_text()
        hook=(ROOT/"config/hooks/normal/103-enfoque-docklike-attention.hook.chroot").read_text()
        self.assertIn("dpkg-divert",install)
        self.assertIn("enfoque-docklike-install",hook)
        self.assertIn("enfoque-docklike-install",(ROOT/"scripts/build-update-package.py").read_text())
        ci=(ROOT/".github/workflows/build-iso.yml").read_text()
        self.assertIn("libxfce4windowing-0-dev",ci)

    def test_release_number(self):
        release=(BASE/"etc/enfoque-os-release").read_text()
        self.assertIn('VERSION="0.2.45"',release)

if __name__=="__main__":
    unittest.main()
