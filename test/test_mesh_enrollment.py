import runpy
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
source = runpy.run_path(str(ROOT / "config/includes.chroot/usr/local/bin/enfoque-inscrever-computador"))
install_mesh = source["install_mesh"]

DEVICE = "59afe62b-cc72-4e2d-9a7b-7fb45516f938"
TAG = DEVICE.replace("-", "")
CONFIG = ("\r\nMeshName=Enfoque OS - Pilotos\r\nMeshType=2\r\n"
          "MeshID=0x0123456\r\nServerID=0x0123\r\n"
          "MeshServer=wss://intranet.enfoquepapelaria.com.br:443/sistema-os/agent.ashx\r\n"
          "Tag=" + TAG + "\r\n").encode()
BINARY = b"\x7fELF\x02" + b"0" * 220


class MeshEnrollmentTests(TestCase):
    def test_requires_identity_bound_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(install_mesh.__globals__, {"mesh_download": lambda _id, _token, kind, _limit:
                BINARY if kind == "meshagent" else CONFIG.replace(TAG.encode(), b"bad")}), \
                patch("subprocess.run") as command:
                with self.assertRaises(RuntimeError):
                    install_mesh(DEVICE, "sample", Path(tmp))
                command.assert_not_called()

    def test_installs_with_root_only_staging_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            def fake_run(args, cwd, timeout, check):
                self.assertTrue((Path(cwd) / "meshagent").exists())
                self.assertEqual((Path(cwd) / "meshagent.msh").read_bytes(), CONFIG)
                self.assertEqual((Path(cwd) / "meshagent.msh").stat().st_mode & 0o777, 0o600)
                self.assertTrue(check)
                return Mock(returncode=0)
            with patch.dict(install_mesh.__globals__, {"mesh_download": lambda _id, _token, kind, _limit:
                BINARY if kind == "meshagent" else CONFIG}), patch("subprocess.run", side_effect=fake_run) as command:
                self.assertTrue(install_mesh(DEVICE, "sample", Path(tmp)))
                command.assert_called_once()
                self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_refuses_invalid_binary(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(install_mesh.__globals__, {"mesh_download": lambda _id, _token, kind, _limit:
                b"MZfake" if kind == "meshagent" else CONFIG}), patch("subprocess.run") as command:
                with self.assertRaises(RuntimeError):
                    install_mesh(DEVICE, "sample", Path(tmp))
                command.assert_not_called()
