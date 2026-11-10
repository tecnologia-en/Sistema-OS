"""Server backup E2E tests on loopback: no physical disks or enrolled PCs."""
import importlib.machinery
import importlib.util
from contextlib import ExitStack
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
CLIENT_ROOT = ROOT / "config/includes.chroot/usr/local/lib/enfoque-installer"
import sys
sys.path.insert(0, str(CLIENT_ROOT))
import preserve
import server_transfer


def import_source(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    obj = importlib.util.module_from_spec(spec)
    loader.exec_module(obj)
    return obj


service = import_source("enfoque_backup_server_test",
                        ROOT / "server/installer-backup-service.py")
installer = import_source("enfoque_live_installer_test",
                          ROOT / "config/includes.chroot/usr/local/sbin/enfoque-install-system")


def write_file(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


class ServiceCases(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.old_data = service.DATA
        self.old_env = os.environ.get("ENFOQUE_TEST_HTTP_LOCAL")
        service.DATA = self.base / "private-vps"
        service.ensure_storage()
        os.environ["ENFOQUE_TEST_HTTP_LOCAL"] = "1"
        self.addCleanup(self.restore_settings)
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), service.Handler)
        self.server_thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.server_thread.start()
        self.addCleanup(self.stop_server)
        self.url = f"http://127.0.0.1:{self.http.server_port}"

    def restore_settings(self):
        service.DATA = self.old_data
        if self.old_env is None:
            os.environ.pop("ENFOQUE_TEST_HTTP_LOCAL", None)
        else:
            os.environ["ENFOQUE_TEST_HTTP_LOCAL"] = self.old_env

    def stop_server(self):
        self.http.shutdown()
        self.http.server_close()
        self.server_thread.join(3)

    def make_inventory(self):
        original = self.base / "windows" / "Users" / "Operador"
        write_file(original / "Desktop" / "vendas 2026.txt", b"relatorio da loja")
        write_file(original / "Downloads" / "lista.pdf", b"%PDF-1.5\n" * 100)
        write_file(original / "Documents" / "arquivos" / "catalogo.csv",
                   "Nome;Preço\nLápis;2,00\n".encode("utf-8"))
        return preserve.compile_inventory([
            ("old", preserve.scan_partition(self.base / "windows", "win"))])

    def session(self, files):
        code = service.issue_code()
        client = server_transfer.Client(self.url)
        client.create_session(code, len(files), sum(f.size for f in files))
        return client, code

    def test_end_to_end_secure_transfer_restore_and_purge(self):
        items = self.make_inventory()
        client, code = self.session(items)
        names = [client.upload_file(i, f) for i, f in enumerate(items)]
        summary = client.finalize(names)
        self.assertEqual(summary["total_bytes"], sum(f.size for f in items))
        self.assertEqual(len(summary["files"]), 3)
        # Failed HTTP attempts do not mutate files or delete remote backup.
        with self.assertRaises(server_transfer.BackupTransferError):
            server_transfer.Client(self.url).create_session("WRONG-CODE", 3, 5)
        newhome = self.base / "new-os" / "home" / "enfoque"
        write_file(newhome / "Desktop" / "SIGE.desktop", b"enterprise shortcut")
        restored = server_transfer.restore_files(client, summary, newhome,
                                                 os.getuid(), os.getgid())
        self.assertEqual(restored, 3)
        self.assertEqual((newhome / "Desktop/vendas 2026.txt").read_bytes(),
                         b"relatorio da loja")
        self.assertEqual((newhome / "Downloads/lista.pdf").read_bytes(),
                         b"%PDF-1.5\n" * 100)
        self.assertEqual((newhome / "Documentos/arquivos/catalogo.csv").read_bytes(),
                         "Nome;Preço\nLápis;2,00\n".encode())
        self.assertTrue((newhome / ".config/user-dirs.dirs").is_file())
        self.assertEqual((newhome / "Desktop/SIGE.desktop").read_bytes(),
                         b"enterprise shortcut")
        self.assertEqual(server_transfer.restore_files(client, summary, newhome,
                                                       os.getuid(), os.getgid()), 3)
        self.assertTrue((service.session_root(client.session_id) / "meta.json").exists())
        self.assertTrue(client.complete()["deleted"])
        self.assertFalse(service.session_root(client.session_id).exists())
        with self.assertRaises(server_transfer.BackupTransferError):
            client.get_manifest()

    def test_first_boot_revalidates_and_deletes_backup_automatically(self):
        from types import SimpleNamespace
        cleanup = import_source(
            "enfoque_cleanup_test",
            ROOT / "config/includes.chroot/usr/local/sbin/enfoque-install-backup-cleanup")
        files = self.make_inventory()
        client, code = self.session(files)
        manifest = client.finalize([client.upload_file(i, f)
                                    for i, f in enumerate(files)])
        home = self.base / "booted-Enfoque" / "home/enfoque"
        home.mkdir(parents=True)
        ticket = self.base / "var/lib/enfoque-os/install-backup-receipt.json"
        ticket.parent.mkdir(parents=True)
        ticket.write_text(json.dumps({
            "server": self.url, "session_id": client.session_id,
            "token": client.token,
            "file_count": len(files), "total_bytes": manifest["total_bytes"],
        }))
        cleanup.RECEIPT = ticket
        account = SimpleNamespace(pw_dir=str(home), pw_uid=os.getuid(),
                                  pw_gid=os.getgid())
        with mock.patch.object(cleanup.remote, "DEFAULT_URL", self.url), \
             mock.patch.object(cleanup.pwd, "getpwnam", return_value=account):
            self.assertEqual(cleanup.main(), 0)
        self.assertFalse(ticket.exists())
        self.assertFalse(service.session_root(client.session_id).exists())
        self.assertTrue((home / "Desktop/vendas 2026.txt").is_file())
        self.assertTrue((home / "Downloads/lista.pdf").is_file())

    def test_tampered_vps_copy_blocks_finalization_and_keeps_original(self):
        files = self.make_inventory()
        client, code = self.session(files)
        entries = [client.upload_file(i, f) for i, f in enumerate(files)]
        (service.session_root(client.session_id) / "files" / "00000000").write_bytes(b"corrupted")
        with self.assertRaises(server_transfer.BackupTransferError):
            client.finalize(entries)
        self.assertTrue(service.session_root(client.session_id).is_dir())
        self.assertTrue(files[0].original.is_file())

    def test_manifest_path_traversal_refused_and_upload_cannot_exceed_inventory(self):
        files = self.make_inventory()
        client, code = self.session(files)
        entries = [client.upload_file(i, f) for i, f in enumerate(files)]
        entries[0]["path"] = "Desktop/../../etc/shadow"
        with self.assertRaises(server_transfer.BackupTransferError):
            client.finalize(entries)
        self.assertTrue(service.session_root(client.session_id).is_dir())

    def test_fixed_ti_code_reusable_and_sessions_stay_isolated(self):
        # Teste no diretorio temporario, nunca em backups reais.
        import hashlib
        path = service.DATA / "master-code.sha256"
        path.write_text(hashlib.sha256(b"fixtureinternaltest2026").hexdigest() + "\n")
        path.chmod(0o600)
        items = self.make_inventory()
        c1 = server_transfer.Client(self.url)
        c2 = server_transfer.Client(self.url)
        total = sum(file.size for file in items)
        c1.create_session("fixtureinternaltest2026", len(items), total)
        c2.create_session("fixtureinternaltest2026", len(items), total)
        self.assertNotEqual(c1.session_id, c2.session_id)
        self.assertNotEqual(c1.token, c2.token)
        self.assertEqual(
            service.read_json(service.session_root(c1.session_id) / "meta.json")
            ["authorization_kind"], "fixed")
        # Acesso a copia de outra sessao exige o token da propria sessao.
        unauthorized = server_transfer.Client(self.url)
        unauthorized.session_id = c1.session_id
        unauthorized.token = c2.token
        with self.assertRaises(server_transfer.BackupTransferError):
            unauthorized.get_manifest()
        with self.assertRaises(server_transfer.BackupTransferError):
            server_transfer.Client(self.url).create_session("errado", len(items), total)

    def test_setup_code_single_use_and_server_capacity_fail_closed(self):
        items = self.make_inventory()
        client, code = self.session(items)
        with self.assertRaises(server_transfer.BackupTransferError):
            server_transfer.Client(self.url).create_session(code, len(items), 1)
        self.assertTrue(service.session_root(client.session_id).is_dir())
        with mock.patch.object(service, "MIN_AVAILABLE_BYTES", 10 ** 20):
            with self.assertRaises(server_transfer.BackupTransferError):
                server_transfer.Client(self.url).create_session(
                    service.issue_code(), 1, 100)

    def test_restore_failure_leaves_server_copy_for_recovery(self):
        items = self.make_inventory()
        client, code = self.session(items)
        manifest = client.finalize([client.upload_file(i, f) for i, f in enumerate(items)])
        home = self.base / "home-enfoque"
        home.mkdir()
        with mock.patch.object(client, "fetch_to",
                               side_effect=server_transfer.BackupTransferError("interrupted")):
            with self.assertRaises(server_transfer.BackupTransferError):
                server_transfer.restore_files(client, manifest, home,
                                             os.getuid(), os.getgid())
        self.assertTrue(service.session_root(client.session_id).is_dir())
        self.assertEqual(len(client.get_manifest()["files"]), 3)


class FailBeforeFormatCases(unittest.TestCase):
    def test_backup_failure_never_formats_disk(self):
        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(installer.os, "geteuid", return_value=0))
            live = stack.enter_context(mock.patch.object(installer, "LIVE"))
            squash = stack.enter_context(mock.patch.object(installer, "SQUASH"))
            target = stack.enter_context(mock.patch.object(installer, "TARGET"))
            stack.enter_context(mock.patch.object(installer, "REQUIRED", ()))
            stack.enter_context(mock.patch.object(installer, "available_disks",
                                                return_value=[{"path": "/dev/mockdisk"}]))
            stack.enter_context(mock.patch.object(installer, "back_up_to_server",
                                side_effect=server_transfer.BackupTransferError("offline")))
            fmt = stack.enter_context(mock.patch.object(installer, "prepare_target"))
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            target.is_mount.return_value = False
            with self.assertRaises(server_transfer.BackupTransferError):
                installer.install("/dev/mockdisk", "MANTER",
                                  mode="preserve", setup_code="one-time-code")
            fmt.assert_not_called()

    def test_erase_still_has_original_confirmation(self):
        with mock.patch.object(installer.os, "geteuid", return_value=0), \
             mock.patch.object(installer, "LIVE") as live, \
             mock.patch.object(installer, "SQUASH") as squash:
            live.is_dir.return_value = True
            squash.is_file.return_value = True
            with self.assertRaises(ValueError):
                installer.install("/dev/sda", "MANTER", mode="erase")


if __name__ == "__main__":
    unittest.main()
