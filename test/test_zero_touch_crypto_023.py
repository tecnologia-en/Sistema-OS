"""Cross-language Enfoque Zero Touch Ed25519 signature compatibility."""
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "config/includes.chroot/usr/local/sbin/enfoque-zero-touch"
loader = importlib.machinery.SourceFileLoader("enfoque_zt_023_test", str(SOURCE))
spec = importlib.util.spec_from_loader(loader.name, loader)
client = importlib.util.module_from_spec(spec)
loader.exec_module(client)


class ZeroTouchCryptoTest(unittest.TestCase):
    def test_python_signature_validates_against_node_api(self):
        with tempfile.TemporaryDirectory(prefix="enfoque-zt-") as directory:
            folder = Path(directory)
            private = folder / "private.pem"
            subprocess.run(["openssl", "genpkey", "-algorithm", "ED25519",
                            "-out", str(private)], check=True, capture_output=True)
            public = subprocess.check_output(["openssl", "pkey", "-in", str(private),
                                               "-pubout"], text=True)
            ssh_key = folder / "ssh-key"
            subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "",
                            "-f", str(ssh_key)], check=True, capture_output=True)
            ssh_pub = " ".join((folder / "ssh-key.pub").read_text().split()[:2])
            data = {
                "deviceId": str(uuid.uuid4()),
                "pcName": "TESTE CAIXA",
                "unitId": "ilha-plaza",
                "unitName": "Ilha Plaza",
                "publicKey": public,
                "tunnelPublicKey": ssh_pub,
                "hostPublicKey": ssh_pub,
                "timestamp": int(time.time() * 1000),
                "nonce": secrets.token_hex(16),
            }
            with patch.object(client, "PRIVATE", private), \
                 patch.object(client, "SECRETS", folder), \
                 patch.object(client, "safe_dir", return_value=None):
                data["signature"] = client.sign_message("register", data, public)
            js = (
                "import{createPublicKey,verify}from'node:crypto';"
                "import{signedPayload}from'./server/zero-touch-registry.mjs';"
                "let text='';for await(const c of process.stdin)text+=c;"
                "const data=JSON.parse(text);"
                "if(!verify(null,signedPayload('register',data),createPublicKey(data.publicKey),"
                "Buffer.from(data.signature,'base64')))process.exit(4);"
            )
            result = subprocess.run(["node", "--input-type=module", "-e", js],
                                    input=json.dumps(data), text=True,
                                    capture_output=True, cwd=ROOT, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
