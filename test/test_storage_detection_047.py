"""0.2.48: verify Windows SSD detection and all destructive disk exclusions.

No real disk is accessed, mounted, partitioned, formatted or erased.
"""
import contextlib
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import stat
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "config/includes.chroot/usr/local/sbin/enfoque-install-system"
loader = importlib.machinery.SourceFileLoader("enfoque_storage_047", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
mod = importlib.util.module_from_spec(spec)
loader.exec_module(mod)
GiB = 1024 ** 3


def disk(name, size, *, tran="sata", rm=False, ro=False, mounted=False, children=None):
    parts = children if children is not None else [{
        "path": name + ("p1" if name[-1].isdigit() else "1"),
        "type": "part", "mountpoints": ["/media/user/Windows" if mounted else None]}]
    return {"path": name, "size": size, "type": "disk",
            "rm": int(rm), "ro": int(ro), "tran": tran,
            "model": name.upper(), "mountpoints": [None], "children": parts}


class StorageDetection047(unittest.TestCase):
    def fixture(self):
        return {"blockdevices": [
            disk("/dev/sda", 500 * GiB, mounted=True),  # Windows drive visible, mounted
            disk("/dev/sdb", 32 * GiB, tran="usb"),     # Enfoque Live pendrive
            disk("/dev/nvme0n1", 256 * GiB, tran="nvme"),
            disk("/dev/mmcblk0", 64 * GiB, tran="mmc"),
            disk("/dev/sdc", 125 * GiB,
                 children=[{"path": "/dev/sdc1", "type": "part", "mountpoints": [None],
                            "children": [{"path": "/dev/md126", "type": "raid1",
                                          "mountpoints": [None]}]}]),
            disk("/dev/sdd", 22 * GiB),
            disk("/dev/sde", 128 * GiB, ro=True),
            disk("/dev/sdf", 120 * GiB, rm=True),
            disk("/dev/sdg", 64 * GiB, tran="usb"),
            disk("/dev/sdh", 120 * GiB,
                 children=[{"path": "/dev/sdh1", "type": "part",
                            "mountpoints": [None]}]),
            {"path": "/dev/loop0", "type": "loop", "size": 256 * GiB,
             "mountpoints": ["/run/live/medium"]},
        ]}

    @contextlib.contextmanager
    def mocked_inventory(self, data=None, swaps=None):
        snapshot = data if data is not None else self.fixture()
        def fake_run(args, **kwargs):
            self.assertEqual(args[:4], ["lsblk", "--json", "--tree", "--bytes"])
            return SimpleNamespace(stdout=json.dumps(snapshot))
        with (
            mock.patch.object(mod, "run", side_effect=fake_run),
            mock.patch.object(mod, "live_media_disk", return_value="/dev/sdb"),
            mock.patch.object(mod, "active_swap_devices", return_value=swaps or set()),
            mock.patch.object(mod, "storage_controller_hints", return_value=["Intel VMD/RST"]),
            mock.patch.object(mod.Path, "resolve", autospec=True,
                              side_effect=lambda path, strict=False: path),
            mock.patch.object(mod.Path, "stat", autospec=True,
                              side_effect=lambda path, **kw: SimpleNamespace(st_mode=stat.S_IFBLK | 0o660)),
        ):
            yield

    def test_windows_disk_is_visible_in_diagnostics_but_not_offered_to_erase(self):
        with self.mocked_inventory():
            snapshot = mod.disk_inventory()
            targets = {x["path"] for x in snapshot["eligible"]}
            blocked = {x["path"]: x["reason"] for x in snapshot["blocked"]}
            self.assertEqual(targets, {"/dev/nvme0n1", "/dev/mmcblk0", "/dev/sdh"})
            self.assertEqual(blocked["/dev/sda"], "busy")
            self.assertEqual(blocked["/dev/sdb"], "live_media")
            self.assertEqual(blocked["/dev/sdc"], "complex_stack")
            self.assertEqual(blocked["/dev/sdd"], "too_small")
            self.assertEqual(blocked["/dev/sde"], "read_only")
            self.assertEqual(blocked["/dev/sdf"], "removable")
            self.assertEqual(blocked["/dev/sdg"], "usb")
            self.assertEqual(snapshot["controllers"], ["Intel VMD/RST"])
            self.assertTrue(snapshot["safe"])
            self.assertEqual(mod.available_disks(), snapshot["eligible"])

    def test_raid_metadata_without_assembled_volume_is_never_offered(self):
        drive=disk("/dev/sda",200*GiB, children=[])
        drive["fstype"]="isw_raid_member"
        with self.mocked_inventory({"blockdevices":[drive]}):
            result=mod.disk_inventory()
            self.assertEqual(result["eligible"], [])
            self.assertEqual(result["blocked"][0]["reason"],"complex_stack")

    def test_swap_is_also_reported_instead_of_silently_hidden(self):
        snapshot={"blockdevices":[disk("/dev/sda", 100 * GiB)]}
        with self.mocked_inventory(snapshot, swaps={"/dev/sda1"}):
            self.assertEqual(mod.disk_inventory()["blocked"][0]["reason"], "busy")

    def test_non_block_paths_never_appear_eligible(self):
        snapshot={"blockdevices":[disk("/dev/nvme0n1", 200 * GiB)]}
        with self.mocked_inventory(snapshot):
            with mock.patch.object(mod.stat, "S_ISBLK", return_value=False):
                d=mod.disk_inventory()
                self.assertEqual(d["eligible"], [])
                self.assertEqual(d["blocked"][0]["reason"], "not_block")

    def test_vmd_and_raid_detected_from_read_only_pci_hints(self):
        pci = """0000:00:0e.0 RAID bus controller [0104]: Intel Corporation Volume Management Device NVMe RAID [8086:467f]
0000:02:00.0 Non-Volatile memory controller [0108]: Kioxia SSD Controller [1179:011b]
0000:00:17.0 SATA controller [0106]: Intel Corporation SATA AHCI Controller [8086:a282]"""
        with mock.patch.object(mod.subprocess, "run",
                               return_value=SimpleNamespace(returncode=0, stdout=pci)) as calls:
            hints=mod.storage_controller_hints()
        self.assertIn("Intel VMD/RST",hints)
        self.assertIn("Controladora NVMe",hints)
        self.assertIn("Controladora SATA/AHCI",hints)
        self.assertTrue(all(c.args[0] == ["lspci", "-nn"] for c in calls.call_args_list))

    def test_probe_loads_only_known_modules_and_never_changes_disks(self):
        with (mock.patch.object(mod.os,"geteuid",return_value=0),
              mock.patch.object(mod,"LIVE") as live,
              mock.patch.object(mod.subprocess,"run",return_value=SimpleNamespace(returncode=0)) as exec_mock):
            live.is_dir.return_value=True
            result=mod.load_storage_modules()
            self.assertTrue(all(result.values()))
        commands=[call.args[0] for call in exec_mock.call_args_list]
        self.assertEqual(commands,[
            ["modprobe","-q","vmd"],["modprobe","-q","nvme"],
            ["modprobe","-q","ahci"],["modprobe","-q","sd_mod"],
            ["udevadm","settle","--timeout=12"]
        ])
        text=" ".join(x[0] for x in commands)
        for forbidden in ("parted","mkfs","mount","umount","dd","wipefs","/sys/bus/pci/rescan"):
            self.assertNotIn(forbidden,text)

    def test_probe_not_permitted_outside_live_root(self):
        with (mock.patch.object(mod.os,"geteuid",return_value=1000),
              mock.patch.object(mod.subprocess,"run") as run):
            with self.assertRaises(PermissionError):mod.load_storage_modules()
            run.assert_not_called()
        with (mock.patch.object(mod.os,"geteuid",return_value=0),
              mock.patch.object(mod,"LIVE") as live,
              mock.patch.object(mod.subprocess,"run") as run):
            live.is_dir.return_value=False
            with self.assertRaises(PermissionError):mod.load_storage_modules()
            run.assert_not_called()

    def test_list_disks_legacy_json_and_diagnostic_modes(self):
        eligible=[{"path":"/dev/nvme0n1","size":120*GiB,"model":"SSD"}]
        report={"eligible":eligible,"blocked":[],"controllers":[],"safe":True}
        for args,fn,result in [
            (["--list-disks"],"available_disks",eligible),
            (["--diagnose-disks"],"disk_inventory",report),
            (["--probe-disks"],"disk_inventory",report),
        ]:
            with (mock.patch.object(sys,"argv",["installer"]+args),
                  mock.patch.object(mod,fn,return_value=result),
                  mock.patch.object(mod,"load_storage_modules",return_value={}) as probe,
                  contextlib.redirect_stdout(io.StringIO()) as output):
                self.assertEqual(mod.main(),0)
                self.assertEqual(json.loads(output.getvalue()),result)
                self.assertEqual(probe.call_count,1 if args[0]=="--probe-disks" else 0)

    def test_existing_install_cannot_format_unlisted_or_busy_windows_disk(self):
        with (mock.patch.object(mod.os,"geteuid",return_value=0),
              mock.patch.object(mod,"LIVE") as live, mock.patch.object(mod,"SQUASH") as squash,
              mock.patch.object(mod,"REQUIRED",()),mock.patch.object(mod,"prepare_target") as dangerous,
              mock.patch.object(mod,"available_disks",return_value=[{"path":"/dev/nvme0n1"}])):
            live.is_dir.return_value=True
            squash.is_file.return_value=True
            with self.assertRaises(ValueError):
                mod.install("/dev/sda","APAGAR")
            dangerous.assert_not_called()

    def test_gui_exposes_diagnostic_without_changing_confirmation(self):
        gui=(ROOT/"config/includes.chroot/usr/local/bin/enfoque-instalar").read_text()
        for text in ('"--probe-disks"','"--diagnose-disks"','Por que meu HD/SSD nao aparece?',
                     'self.show_disk_diagnostics','self.submit.set_sensitive(bool(self.disks))',
                     '"sudo", "-n", INSTALLER', 'Digite APAGAR','Digite MANTER'):
            self.assertIn(text,gui)
        for forbidden in ("wipefs", "sgdisk --zap-all"):
            self.assertNotIn(forbidden,gui)

    def test_iso_dependencies_include_firmware_and_pci_identification(self):
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text().splitlines()
        for name in ("firmware-misc-nonfree","pciutils","kmod","parted","squashfs-tools"):
            self.assertEqual(packages.count(name),1)
        notes=(ROOT/"docs/RELEASE_047_ARMAZENAMENTO_INSTALADOR.md").read_text()
        self.assertIn("Intel VMD",notes)
        self.assertIn("Windows",notes)
        self.assertIn("nao",notes.lower())


if __name__ == "__main__":
    unittest.main()
