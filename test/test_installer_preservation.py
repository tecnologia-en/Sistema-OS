"""Offline fixtures only: no physical disk or registered PC may be modified."""
import importlib.machinery
import importlib.util
from contextlib import nullcontext
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "config/includes.chroot/usr/local/sbin/enfoque-install-system"
loader = importlib.machinery.SourceFileLoader("enfoque_installer_keepfiles_test", str(CORE))
spec = importlib.util.spec_from_loader(loader.name, loader)
installer = importlib.util.module_from_spec(spec)
loader.exec_module(installer)
keep = installer.migration


def store(where, value):
    where.parent.mkdir(parents=True, exist_ok=True)
    where.write_bytes(value)


class PreserveFilesTests(unittest.TestCase):
    def test_windows_and_onedrive_folders_to_correct_linux_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            old = base / "old-Windows"
            home = old / "Users" / "Marcelo"
            store(home / "Desktop" / "notas.txt", b"desktop")
            store(home / "Downloads" / "arquivo.pdf", b"pdf-contents")
            store(home / "Documents" / "escola" / "livros.csv", b"a,b\n1,2")
            store(home / "Pictures" / "imagem.jpg", b"jpg")
            store(home / "Videos" / "aula.mp4", b"video")
            store(home / "Music" / "audio.mp3", b"audio")
            store(home / "OneDrive" / "Documentos" / "plano.docx", b"cache-local")
            stock = keep.scan_partition(old, "Windows")
            self.assertEqual(len(stock), 7)
            inventory = keep.compile_inventory([("win", stock)])
            backup = base / "external" / "EnfoqueOS-Backup-TEST"
            backup.parent.mkdir()
            keep.stage_files(inventory, backup, min_free=10**9)
            self.assertEqual(len(keep.verify_stage(backup)["files"]), 7)
            newhome = base / "new-Enfoque" / "home/enfoque"
            store(newhome / "Desktop" / "SIGE.desktop", b"shortcut")
            count = keep.restore_files(backup, newhome, uid=os.getuid(), gid=os.getgid())
            self.assertEqual(count, 7)
            self.assertEqual((newhome / "Desktop/notas.txt").read_bytes(), b"desktop")
            self.assertEqual((newhome / "Downloads/arquivo.pdf").read_bytes(), b"pdf-contents")
            self.assertEqual((newhome / "Documentos/escola/livros.csv").read_bytes(), b"a,b\n1,2")
            self.assertEqual((newhome / "Imagens/imagem.jpg").read_bytes(), b"jpg")
            self.assertEqual((newhome / "Vídeos/aula.mp4").read_bytes(), b"video")
            self.assertEqual((newhome / "Músicas/audio.mp3").read_bytes(), b"audio")
            self.assertEqual((newhome / "Documentos/plano.docx").read_bytes(), b"cache-local")
            xdg = (newhome / ".config/user-dirs.dirs").read_text()
            self.assertIn('XDG_DESKTOP_DIR="$HOME/Desktop"', xdg)
            self.assertIn('XDG_VIDEOS_DIR="$HOME/Vídeos"', xdg)
            self.assertEqual((newhome / "Desktop/SIGE.desktop").read_bytes(), b"shortcut")
            # Independent copy remains after the restore and its checksum still passes.
            self.assertEqual(len(keep.verify_stage(backup)["files"]), 7)

    def test_linux_localized_folders_and_conflicts_keep_both(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "oldLinux"
            store(old / "home/enfoque/Área de Trabalho/caixa.txt", b"primeiro")
            store(old / "home/enfoque/Desktop/caixa.txt", b"segundo")
            store(old / "home/enfoque/Documentos/resumo.xlsx", b"sheet")
            files = keep.compile_inventory([("linux", keep.scan_partition(old, "linux"))])
            self.assertEqual(len(files), 3)
            self.assertEqual(len({f.relative.as_posix() for f in files}), 3)
            stage = root / "backup"
            keep.stage_files(files, stage, min_free=10**9)
            installed = root / "target"
            installed.mkdir()
            keep.restore_files(stage, installed, uid=os.getuid(), gid=os.getgid())
            self.assertEqual(len(list((installed / "Desktop").glob("*caixa*.txt"))), 2)
            self.assertEqual((installed / "Documentos/resumo.xlsx").read_bytes(), b"sheet")

    def test_multiple_windows_users_keep_primary_on_desktop_and_other_in_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "old"
            store(old / "Users/Administrador/Desktop/ajuda.txt", b"1")
            store(old / "Users/Caixa/Desktop/vendas.csv", b"vendas" * 100)
            files = keep.compile_inventory([("win", keep.scan_partition(old, "win"))])
            paths = {f.relative.as_posix() for f in files}
            self.assertIn("Desktop/vendas.csv", paths)
            self.assertIn("Desktop/Usuário Administrador/ajuda.txt", paths)

    def test_existing_shortcut_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "old"
            store(old / "Users/one/Desktop/SIGE.desktop", b"old-user-shortcut")
            files = keep.compile_inventory([("p", keep.scan_partition(old, "p"))])
            backup = root / "backup"
            keep.stage_files(files, backup, min_free=10**9)
            new = root / "new"
            store(new / "Desktop/SIGE.desktop", b"new-company-shortcut")
            keep.restore_files(backup, new, uid=os.getuid(), gid=os.getgid())
            self.assertEqual((new / "Desktop/SIGE.desktop").read_bytes(), b"new-company-shortcut")
            self.assertEqual((new / "Desktop/SIGE [arquivo antigo 1].desktop").read_bytes(),
                             b"old-user-shortcut")

    def test_data_tamper_and_insufficient_space_stop(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            old = base / "old"
            store(old / "home/person/Downloads/report.txt", b"integrity")
            files = keep.compile_inventory([("old", keep.scan_partition(old, "old"))])
            with self.assertRaises(keep.PreservationError):
                keep.stage_files(files, base / "no-room", min_free=1)
            self.assertFalse((base / "no-room").exists())
            backup = base / "backup"
            keep.stage_files(files, backup, min_free=10**9)
            (backup / "data/Downloads/report.txt").write_bytes(b"tampered")
            with self.assertRaises(keep.PreservationError):
                keep.verify_stage(backup)

    def test_symlinks_and_cloud_only_files_are_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "old/Users/user/Documents"
            src.mkdir(parents=True)
            (src / "linked").symlink_to("/etc/passwd")
            with self.assertRaises(keep.PreservationError):
                keep.scan_partition(root / "old", "source")

    def test_manifest_path_escape_and_missing_manifest_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "backup"
            root.mkdir()
            with self.assertRaises(keep.PreservationError):
                keep.verify_stage(root)
            (root / "manifest.json").write_text(json.dumps({
                "format": 1, "files": [{"path": "../../outside", "size": 0,
                                         "sha256": "0" * 64}], "total_bytes": 0}))
            with self.assertRaises(keep.PreservationError):
                keep.verify_stage(root)

    def test_empty_user_folders_must_not_cause_disk_wipe(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = Path(tmp) / "old"
            (old / "Users/Maria/Desktop").mkdir(parents=True)
            with self.assertRaises(keep.PreservationError):
                keep.compile_inventory([("win", keep.scan_partition(old, "win"))])


class BackendSafetyTests(unittest.TestCase):
    def base_patches(self, mode):
        """A pure simulation: no real mount, partition or format."""
        return [
            mock.patch.object(installer.os, "geteuid", return_value=0),
            mock.patch.object(installer, "LIVE"),
            mock.patch.object(installer, "SQUASH"),
            mock.patch.object(installer, "REQUIRED", ()),
            mock.patch.object(installer, "available_disks",
                              return_value=[{"path": "/dev/mock-source", "size": 100 * 1024**3}]),
            mock.patch.object(installer, "TARGET"),
        ]

    def test_backup_must_be_on_separate_disk_before_partitioning(self):
        with self.base_patches("preserve")[0] as _, \
             self.base_patches("preserve")[1] as live, \
             self.base_patches("preserve")[2] as squash, \
             mock.patch.object(installer, "REQUIRED", ()), \
             mock.patch.object(installer, "available_disks",
                               return_value=[{"path": "/dev/mock-source"}]), \
             mock.patch.object(installer, "backup_volumes", return_value=[]), \
             mock.patch.object(installer, "prepare_target") as fmt:
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            with self.assertRaises(keep.PreservationError):
                installer.install("/dev/mock-source", "MANTER", mode="preserve",
                                  backup_device="/dev/mock-source-part1")
            fmt.assert_not_called()

    def test_failed_backup_never_invokes_format(self):
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
             mock.patch.object(installer, "LIVE") as live, \
             mock.patch.object(installer, "SQUASH") as squash, \
             mock.patch.object(installer, "TARGET") as target, \
             mock.patch.object(installer, "REQUIRED", ()), \
             mock.patch.object(installer, "available_disks",
                               return_value=[{"path": "/dev/mock-source"}]), \
             mock.patch.object(installer, "backup_volumes",
                               return_value=[{"path": "/dev/mock-backup", "fstype": "ext4"}]), \
             mock.patch.object(installer, "mounted_volume",
                               return_value=nullcontext(Path("/unused"))), \
             mock.patch.object(installer, "backup_personal_files",
                               side_effect=keep.PreservationError("fail")) as bk, \
             mock.patch.object(installer, "prepare_target") as fmt:
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            target.is_mount.return_value = False
            with self.assertRaises(keep.PreservationError):
                installer.install("/dev/mock-source", "MANTER", mode="preserve",
                                  backup_device="/dev/mock-backup")
            bk.assert_called_once()
            fmt.assert_not_called()

    def test_old_erase_mode_still_supported_without_backup(self):
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
             mock.patch.object(installer, "LIVE") as live, \
             mock.patch.object(installer, "SQUASH") as squash, \
             mock.patch.object(installer, "TARGET") as target, \
             mock.patch.object(installer, "REQUIRED", ()), \
             mock.patch.object(installer, "available_disks",
                               return_value=[{"path": "/dev/mock-source"}]), \
             mock.patch.object(installer, "prepare_target",
                               return_value=("/dev/m1", "/dev/m2")) as fmt, \
             mock.patch.object(installer, "mount_system"), \
             mock.patch.object(installer, "configure_system"), \
             mock.patch.object(installer, "run"):
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            target.is_mount.return_value = False
            installer.install("/dev/mock-source", "APAGAR")
            fmt.assert_called_once_with("/dev/mock-source")

    def test_existing_agents_not_changed_by_installer_only_patch(self):
        gui = (ROOT / "config/includes.chroot/usr/local/bin/enfoque-instalar").read_text()
        self.assertIn("--mode", gui)
        self.assertIn("MANTER", gui)
        self.assertIn("APAGAR", gui)
        self.assertIn("--list-backups", gui)
        self.assertIn("enfoque-install-system", str(CORE))
        self.assertEqual((ROOT / "config/includes.chroot/etc/enfoque-os-release")
                         .read_text().split('VERSION="')[1].split('"')[0], "0.2.29")


if __name__ == "__main__":
    unittest.main()
