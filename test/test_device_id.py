"""Regressao: IDs por instalacao, etiquetas de loja e rede, sem gravar no ISO."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "config/includes.chroot/usr/local/bin/enfoque-id"
loader = importlib.machinery.SourceFileLoader("enfoque_id_test", str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
identity = importlib.util.module_from_spec(spec)
loader.exec_module(identity)

class TestDeviceId(unittest.TestCase):
    def test_unique_and_persistent_across_reboots(self):
        with tempfile.TemporaryDirectory() as folder:
            location = Path(folder) / "device-identity.json"
            with mock.patch.dict(os.environ, {"ENFOQUE_ID_STATE": str(location)}):
                first = identity.initialize()
                second = identity.initialize()
                self.assertEqual(first["uuid"], second["uuid"])
                self.assertEqual(first["shortId"], second["shortId"])
                self.assertEqual(len(first["shortId"]), 12)
                self.assertEqual(str(uuid.UUID(first["uuid"])), first["uuid"])
                self.assertEqual(location.stat().st_mode & 0o777, 0o644)
    def test_different_installations(self):
        with tempfile.TemporaryDirectory() as folder:
            results = []
            for index in range(50):
                with mock.patch.dict(os.environ, {"ENFOQUE_ID_STATE": str(Path(folder) / str(index) / "id.json")}):
                    results.append(identity.initialize()["uuid"])
            self.assertEqual(len(results), len(set(results)))
    def test_subnet_mapping_overrides_declared_unit(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder) / "id.json"
            config = Path(folder) / "lojas-ip.json"
            config.write_text(json.dumps({"192.168.42.0/24": "ilha-plaza",
                                          "192.168.0.0/16": "centro"}), encoding="utf-8")
            home = Path(folder) / "home"
            userdir = home / ".config/enfoque-os"
            userdir.mkdir(parents=True)
            (userdir / "identity.json").write_text('{"unitId":"copacabana"}', encoding="utf-8")
            with mock.patch.dict(os.environ, {"ENFOQUE_ID_STATE": str(state)}):
                identity.initialize()
                with mock.patch.object(identity, "ipv4s", return_value=["192.168.42.37"]):
                    item = identity.describe(home=home, mapping=config)
                    self.assertTrue(item["id"].endswith("-1"))
                    self.assertEqual(item["source"], "CIDR cadastrado")
                    self.assertIn("192.168.42.0/24", item["group"])
    def test_first_access_fallback_without_network_mapping(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder) / "id.json"
            home = Path(folder) / "home"
            loc = home / ".config/enfoque-os"
            loc.mkdir(parents=True)
            (loc / "identity.json").write_text('{"unitId":"papel-arte"}', encoding="utf-8")
            with mock.patch.dict(os.environ, {"ENFOQUE_ID_STATE": str(state)}):
                identity.initialize()
                with mock.patch.object(identity, "ipv4s", return_value=["10.7.8.10"]):
                    result = identity.describe(home, Path(folder) / "not-found.json")
                    self.assertTrue(result["id"].endswith("-9"))
                    self.assertEqual(result["unit"], "Papel & Arte")
    def test_gtk3_clipboard_copy_uses_supported_api(self):
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)", source)
        self.assertNotIn("Gdk.Display.get_default().get_clipboard", source)

    def test_invalid_identity_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "id.json"
            p.write_text('{"uuid":"00000000-0000-4000-8000-000000000000","shortId":"999999999999"}', encoding="utf-8")
            with self.assertRaises(ValueError):
                identity.read_id(p)

if __name__ == "__main__":
    unittest.main()
