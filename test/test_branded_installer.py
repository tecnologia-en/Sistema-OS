"""Safety and offline provisioning regressions for the Enfoque-branded installer.

No tests may partition, format, or mount an actual disk.
"""
import importlib.machinery
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "config/includes.chroot/usr/local/sbin/enfoque-install-system"
loader = importlib.machinery.SourceFileLoader("enfoque_install_test", str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
installer = importlib.util.module_from_spec(spec)
loader.exec_module(installer)


class InstallSafetyTests(unittest.TestCase):
    def test_no_calamares_in_installer_or_dependency_list(self):
        packages = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text()
        self.assertNotIn("calamares-settings-debian", packages)
        app = (ROOT / "config/includes.chroot/usr/share/applications/enfoque-instalar.desktop").read_text()
        self.assertIn("enfoque-instalar", app)
        gui = (ROOT / "config/includes.chroot/usr/local/bin/enfoque-instalar").read_text()
        self.assertNotIn("calamares-install-debian", gui)
        self.assertIn("APAGAR", gui)
        self.assertIn("--diagnose-disks", gui)
        self.assertIn("--probe-disks", gui)

    def test_usb_must_stay_inserted_until_poweroff(self):
        gui = (ROOT / "config/includes.chroot/usr/local/bin/enfoque-instalar").read_text()
        self.assertIn("MANTENHA O PENDRIVE CONECTADO", gui)
        self.assertIn('"systemctl", "poweroff"', gui)
        self.assertIn("Desligar com seguranca", gui)
        self.assertNotIn("Remova o pendrive e reinicie o PC", gui)
        guide = (ROOT / "docs/GUIA_PILOTO_PC_REAL_0216.md").read_text()
        self.assertIn("Nunca retire o pendrive com a sessão Live aberta", guide)
        self.assertIn("Secure Boot Violation", guide)

    def test_only_live_image_may_install(self):
        with mock.patch.object(installer.os, "geteuid", return_value=1000):
            with self.assertRaises(PermissionError):
                installer.install("/dev/sda", "APAGAR")
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
             mock.patch.object(installer, "LIVE") as live:
            live.is_dir.return_value = False
            with self.assertRaises(PermissionError):
                installer.install("/dev/sda", "APAGAR")

    def test_must_type_exact_destructive_confirmation(self):
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
             mock.patch.object(installer, "LIVE") as live, \
             mock.patch.object(installer, "SQUASH") as squash:
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            for text in ("", "apagar", "SIM", None):
                with self.assertRaises(ValueError):
                    installer.install("/dev/sda", text)

    def test_unlisted_disk_never_partitioned(self):
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
             mock.patch.object(installer, "LIVE") as live, \
             mock.patch.object(installer, "SQUASH") as squash, \
             mock.patch.object(installer, "available_disks", return_value=[{"path": "/dev/vda"}]), \
             mock.patch.object(installer, "REQUIRED", ()), \
             mock.patch.object(installer, "prepare_target") as partition:
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            with self.assertRaises(ValueError):
                installer.install("/dev/sda", "APAGAR")
            partition.assert_not_called()

    def test_nested_logical_volumes_and_active_swap_block_disk(self):
        stack={"path":"/dev/sda","type":"disk","mountpoints":[None],
               "children":[{"path":"/dev/sda1","mountpoints":[None],
                            "children":[{"path":"/dev/mapper/vg-system","mountpoints":["/"]}]}]}
        self.assertTrue(installer.disk_tree_busy(stack, set()))
        stack["children"][0]["children"][0]["mountpoints"]=[None]
        self.assertFalse(installer.disk_tree_busy(stack, set()))
        self.assertTrue(installer.disk_tree_busy(stack, {"/dev/mapper/vg-system"}))
        stack["children"][0]["children"][0]["path"]="/dev/mapper/vg-home"
        self.assertFalse(installer.disk_tree_busy(stack, {"/dev/mapper/vg-system"}))
        stack["mountpoints"]=["/mnt/backup"]
        self.assertTrue(installer.disk_tree_busy(stack, set()))

    def test_partition_paths_nvme_and_sata(self):
        self.assertEqual(installer.partitions("/dev/nvme0n1"),
                         ["/dev/nvme0n1p1", "/dev/nvme0n1p2", "/dev/nvme0n1p3"])
        self.assertEqual(installer.partitions("/dev/sda"),
                         ["/dev/sda1", "/dev/sda2", "/dev/sda3"])

    def test_requires_bios_and_uefi_boot_and_new_machine_identity(self):
        src = SOURCE.read_text()
        self.assertIn("--target=i386-pc", src)
        self.assertIn("--target=x86_64-efi", src)
        self.assertIn('TARGET / "etc/machine-id"', src)
        self.assertIn('"var/lib/enfoque-os/device-identity.json"', src)
        self.assertIn('"/usr/bin/chage", "-d", "0", "enfoque"', src)
        self.assertIn('input="enfoque:123456\\n"', src)
        self.assertIn('run(["chroot", str(TARGET), "/usr/bin/passwd", "-l", "root"])', src)

    def test_minimum_disk_size_and_no_usb_drive(self):
        src = SOURCE.read_text()
        self.assertIn('MIN_BYTES = 24 * 1024 ** 3', src)
        self.assertIn('str(obj.get("tran") or "").lower() == "usb"', src)
        self.assertIn('"lsblk", "--json", "--tree"', src)
        self.assertIn('obj.get("path") == excluded', src)
        self.assertIn('elif disk_tree_busy(obj, swaps):', src)


if __name__ == "__main__":
    unittest.main()
