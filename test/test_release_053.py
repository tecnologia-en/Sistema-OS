"""0.2.53: compact taskbar, rounded glass-look menu, read-only hardware panel."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
import json
import unittest
import xml.etree.ElementTree as ET
from unittest import mock


ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
INFO=SourceFileLoader("hardware053", str(TREE/"usr/local/lib/enfoque-my-computer/info.py")).load_module()


class MyComputer053(unittest.TestCase):
    def test_memory_report_is_total_used_and_available(self):
        report=INFO.meminfo("MemTotal: 16384000 kB\nMemAvailable: 8192000 kB\n")
        self.assertEqual(report["total"], 16384000*1024)
        self.assertEqual(report["used"], 8192000*1024)
        self.assertEqual(report["percent"], 50)
        self.assertEqual(INFO.format_size(500*1024**3),"500.0 GB")
        self.assertEqual(INFO.format_size(-1),"Indisponível")

    def test_gpu_parser_and_sysfs_fallback(self):
        text=('00:02.0 "VGA compatible controller" "Intel Corporation" "UHD Graphics 620" -r01\n'
              '01:00.0 "3D controller" "NVIDIA Corporation" "GeForce GTX 970" -ra1\n'
              '00:1f.0 "ISA bridge" "Intel Corporation" "Unknown" -r01\n')
        self.assertEqual(INFO.gpu_from_lspci(text),
                         ["Intel Corporation UHD Graphics 620","NVIDIA Corporation GeForce GTX 970"])
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as temp:
            root=Path(temp)
            device=root/"card0"/"device"
            device.mkdir(parents=True)
            (device/"vendor").write_text("0x10de\n")
            (device/"device").write_text("0x13c2\n")
            self.assertEqual(INFO.gpu_from_sysfs(root),["NVIDIA (0x10de:0x13c2)"])
            (root/"card0-HDMI-A-1").mkdir()
            self.assertEqual(len(INFO.gpu_from_sysfs(root)),1)

    def test_physical_storage_follows_mounts_and_rotation(self):
        sample={"blockdevices":[
            {"name":"sda","type":"disk","size":500*1024**3,"rota":False,
             "model":"SSD Kingston","mountpoints":[None],
             "children":[{"name":"sda1","type":"part","mountpoints":["/"]}]},
            {"name":"sdb","type":"disk","size":2*1024**4,"rota":True,
             "model":"HD WD","mountpoints":["/media/backup"]},
            {"name":"sr0","type":"rom","size":1024,"rota":True}]}
        disks=INFO.physical_disks(json.dumps(sample))
        self.assertEqual([d["kind"] for d in disks],["SSD","HD"])
        self.assertEqual([d["mounts"] for d in disks],[["/"],["/media/backup"]])
        self.assertEqual(disks[0]["size"],500*1024**3)

    def test_uptime_and_cpu_strings(self):
        self.assertEqual(INFO.format_uptime("93600.1"),"1d 2h 0min")
        self.assertEqual(INFO.cpuinfo("model name : Intel(R) Core(TM) i5-3570 CPU\n"),
                         "Intel(R) Core(TM) i5-3570 CPU")

    def test_missing_information_does_not_crash(self):
        self.assertEqual(INFO.physical_disks("not-json"),[])
        self.assertEqual(INFO.gpu_from_lspci("garbled"),[])
        self.assertEqual(INFO.meminfo("")["total"],0)
        self.assertEqual(INFO.format_uptime("unknown"),"Indisponível")
        with mock.patch.object(INFO, "disk_space", return_value={"total":0,"free":0,"used":0,"percent":0}):
            with mock.patch.object(INFO, "gpu_from_sysfs", return_value=[]):
                facts=INFO.snapshot(proc=Path("/nonexistent"), drm=Path("/nonexistent"),
                                    runner=lambda *_:"")
        self.assertEqual(facts["disks"],[])
        self.assertEqual(facts["gpu"],[])

    def test_desktop_entry_pinned_and_local(self):
        shell=(TREE/"usr/local/bin/enfoque-desktop-shell").read_text()
        desktop=(TREE/"usr/share/applications/enfoque-meu-computador.desktop").read_text()
        widget=(TREE/"usr/local/bin/enfoque-meu-computador").read_text()
        self.assertIn('("enfoque-meu-computador.desktop", "Meu Computador"',shell)
        self.assertIn("Exec=/usr/local/bin/enfoque-meu-computador",desktop)
        self.assertIn("Terminal=false",desktop)
        self.assertIn("from info import snapshot",widget)
        self.assertIn("Gtk.Window",widget)

    def test_compact_id_icon_is_small_svg(self):
        path=TREE/"usr/share/icons/EnfoqueFluent/scalable/apps/enfoque-computer-small.svg"
        root=ET.parse(path).getroot()
        self.assertEqual(root.attrib["width"],"18")
        self.assertEqual(root.attrib["height"],"18")
        self.assertIn("enfoque-computer-small",
            (TREE/"usr/share/applications/enfoque-id.desktop").read_text())
        css=(TREE/"usr/share/themes/EnfoqueModern/gtk-3.0/panel.css").read_text()
        self.assertIn("#launcher-12",css)
        self.assertIn("-gtk-icon-transform: scale(.80)",css)

    def test_menu_is_rounded_borderless_glass_without_compositor(self):
        shell=(TREE/"usr/local/bin/enfoque-desktop-shell").read_text()
        self.assertIn("background-image: linear-gradient(",shell)
        self.assertIn("border: none;",shell)
        self.assertIn("radius=min(18,",shell)
        self.assertIn("Gdk.WindowTypeHint.POPUP_MENU",shell)
        self.assertIn("self.set_titlebar", (TREE/"usr/local/bin/enfoque-meu-computador").read_text())
        xfwm=(TREE/"etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml").read_text()
        self.assertIn('use_compositing" type="bool" value="true"',xfwm)

    def test_packager_includes_new_view_and_does_not_add_daemons(self):
        builder=(ROOT/"scripts/build-update-package.py").read_text()
        self.assertIn("usr/local/lib/enfoque-",builder)
        self.assertIn("usr/local/bin/enfoque-",builder)
        self.assertIn("usr/share/icons/EnfoqueFluent/",builder)
        self.assertIn("usr/share/applications/enfoque-",builder)
        self.assertFalse(list((TREE/"etc/systemd/system").glob("*meu-computador*")))


if __name__=="__main__":
    unittest.main()
