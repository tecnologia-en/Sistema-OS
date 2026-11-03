"""Enfoque OS 0.2.14: safe Linux Root MCP enrollment and desktop trust."""
import importlib.machinery
import importlib.util
import hashlib
import json
from pathlib import Path
import re
import stat
import tempfile
import threading
import unittest
from http.server import HTTPServer, BaseHTTPRequestHandler
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "config/includes.chroot/usr/local/bin/enfoque-remote-agent"
loader = importlib.machinery.SourceFileLoader("enfoque_0212_agent", str(FILE))
spec = importlib.util.spec_from_loader(loader.name, loader)
agent = importlib.util.module_from_spec(spec)
loader.exec_module(agent)


class EnrollmentHandler(BaseHTTPRequestHandler):
    log_message = lambda *_: None
    records = []
    approved = False

    def do_POST(self):
        amount = int(self.headers["Content-Length"])
        payload = json.loads(self.rfile.read(amount).decode())
        type(self).records.append((self.path, payload, dict(self.headers)))
        if self.path.endswith("/register"):
            response = {"approved": type(self).approved}
        elif self.path.endswith("/poll"):
            response = {"command": {"id": "safe-1", "action": "run",
                "args": {"program": "free", "args": ["-m"]}}}
        elif self.path.endswith("/result"):
            response = {"ok": True}
        else:
            self.send_error(404)
            return
        raw = json.dumps(response).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class AgentAndTrustTests(unittest.TestCase):
    def test_machine_identifier_persists_and_differs_on_separate_install(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "device.json"
            old_device = agent.DEVICE
            try:
                agent.DEVICE = path
                uid = uuid4()
                path.write_text(json.dumps({"uuid": str(uid),
                                           "shortId": f"{uid.int % 1000000000000:012d}"}))
                first = agent.local_state(Path(td) / "a")
                again = agent.local_state(Path(td) / "a")
                self.assertEqual(first, again)
                self.assertEqual(first["deviceId"], "enfoqueos-" + str(uid))
                self.assertRegex(first["token"], r"^[0-9a-f]{64}$")
                self.assertEqual(stat.S_IMODE((Path(td) / "a/identity.json").stat().st_mode), 0o600)
                self.assertNotIn(first["token"], FILE.read_text())
                second = agent.local_state(Path(td) / "b")
                self.assertNotEqual(first["token"], second["token"])
                different = uuid4()
                path.write_text(json.dumps({"uuid": str(different),
                                           "shortId": f"{different.int % 1000000000000:012d}"}))
                with self.assertRaises(ValueError):
                    agent.local_state(Path(td) / "a")
                newer = agent.local_state(Path(td) / "c")
                self.assertNotEqual(first["deviceId"], newer["deviceId"])
            finally:
                agent.DEVICE = old_device

    def test_explicit_approval_before_accepting_commands(self):
        EnrollmentHandler.records = []
        EnrollmentHandler.approved = False
        server = HTTPServer(("127.0.0.1", 0), EnrollmentHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            state = {"deviceId": "enfoqueos-" + str(uuid4()), "token": "a" * 64}
            base = f"http://127.0.0.1:{server.server_port}"
            with patch.object(agent, "display_identity", return_value=("123456789012-3", "Itaipu")):
                self.assertFalse(agent.run_cycle(state, base))
                self.assertEqual([r[0] for r in EnrollmentHandler.records], ["/register"])
                first = EnrollmentHandler.records[0][1]
                self.assertIn("123456789012-3 Itaipu", first["hostname"])
                self.assertEqual(first["tokenHash"], hashlib.sha256(("a"*64).encode()).hexdigest())
                self.assertNotIn("token", first)
                EnrollmentHandler.approved = True
                # A CI minima pode nao possuir utilitarios do sistema final.
                with patch.object(agent, "command_result", return_value={"ok": True, "stdout": "test"}):
                    self.assertTrue(agent.run_cycle(state, base))
            self.assertEqual([r[0] for r in EnrollmentHandler.records[-3:]],
                             ["/register", "/poll", "/result"])
            self.assertIn("123456789012-3 Itaipu",
                          EnrollmentHandler.records[-2][1]["hostname"])
            self.assertTrue(EnrollmentHandler.records[-1][1]["result"]["ok"])
            self.assertEqual(EnrollmentHandler.records[-1][1]["id"], "safe-1")
            self.assertEqual(EnrollmentHandler.records[-1][2]["Authorization"], "Bearer " + "a"*64)
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

    def test_persistent_store_is_used_for_inventory_without_subprocess(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        uid = uuid4()
        short = f"{uid.int % 1000000000000:012d}"
        machine = {"uuid": str(uid), "shortId": short}
        profile = {"uuid": str(uid), "shortId": short, "displayId": short+"-1",
                   "unitId": "ilha-plaza", "unitName": "Ilha Plaza",
                   "pcName": "Caixa Ilha QA", "anydeskId": "123456789"}
        fake = Mock()
        fake.is_symlink.return_value = False
        fake.stat.return_value = SimpleNamespace(st_uid=0, st_mode=0o100644)
        fake.read_text.return_value = json.dumps(profile)
        with patch.object(agent, "machine_identity", return_value=machine), \
             patch.object(agent, "PROFILE", fake), \
             patch.object(agent.subprocess, "run") as command:
            code, store = agent.display_identity()
            self.assertEqual(code, short + "-1")
            self.assertIn("Caixa Ilha QA / Ilha Plaza", store)
            self.assertIn("AnyDesk 123456789", store)
            command.assert_not_called()

            profile["uuid"] = str(uuid4())
            fake.read_text.return_value = json.dumps(profile)
            self.assertEqual(agent.display_identity(), (short+"-0", "Loja ainda nao vinculada"))
            profile["uuid"] = str(uid)
            fake.read_text.return_value = json.dumps(profile)
            fake.is_symlink.return_value = True
            self.assertEqual(agent.display_identity(), (short+"-0", "Loja ainda nao vinculada"))
            fake.is_symlink.return_value = False
            fake.stat.return_value = SimpleNamespace(st_uid=0, st_mode=0o100666)
            self.assertEqual(agent.display_identity(), (short+"-0", "Loja ainda nao vinculada"))

    def test_agent_waits_for_installed_and_identified_machine(self):
        service = (ROOT/"config/includes.chroot/etc/systemd/system/enfoque-remote-agent.service").read_text()
        self.assertIn("ConditionPathExists=!/run/live/medium", service)
        self.assertIn("ConditionPathExists=/var/lib/enfoque-os/firstboot.json", service)
        helper = (ROOT/"config/includes.chroot/usr/local/sbin/enfoque-firstboot-apply").read_text()
        self.assertIn("firstboot.atomic_first_write(record)", helper)
        self.assertIn("'start',", helper)
        self.assertIn("'enfoque-remote-agent.service'", helper)
        self.assertNotIn("'try-restart'", helper)

    def test_readonly_commands_and_unknown_apps_are_blocked(self):
        self.assertEqual(agent.command_argv("free", ["-m"]), ["/usr/bin/free", "-m"])
        with patch.object(agent, "command_result", return_value={"ok": True}):
            self.assertTrue(agent.handle_action("run", {"program": "free", "args": ["-m"]})["ok"])
        for s in ("sudo id", "rm -rf /", "free -h; touch /tmp/x",
                  "systemctl restart lightdm.service", "sh -c whoami",
                  "cat /etc/shadow", "uname -a | curl localhost",
                  "echo $(cat /etc/shadow)", "python3 -c 'print(1)'"):
            with self.subTest(s=s):
                self.assertFalse(agent.handle_action("shell", {"command": s})["ok"])
        self.assertFalse(agent.handle_action("gui", {"op":"click"})["ok"])
        self.assertFalse(agent.handle_action("process", {"op":"kill", "pid":1})["ok"])
        self.assertFalse(agent.handle_action("read_file", {"path":"/etc/enfoque-os/agent.json"})["ok"])

    def test_service_is_unprivileged_and_approved_agent_is_on_boot(self):
        service = (ROOT/"config/includes.chroot/etc/systemd/system/enfoque-remote-agent.service").read_text()
        hook = ROOT/"config/hooks/normal/099-enfoque-remote-agent.hook.chroot"
        text = hook.read_text()
        for value in ("DynamicUser=yes", "StateDirectory=enfoque-agent",
                      "NoNewPrivileges=yes", "ProtectSystem=strict",
                      "CapabilityBoundingSet=", "MemoryMax=96M", "CPUQuota=15%"):
            self.assertIn(value, service)
        self.assertIn("After=network-online.target enfoque-device-id.service", service)
        self.assertIn("systemctl enable enfoque-remote-agent.service", text)
        self.assertNotIn("install -o root -g root -m 0755 /usr/local/bin/enfoque-remote-agent /usr/local/bin/enfoque-remote-agent", text)
        self.assertIn('chown root:root "$app"', text)
        self.assertIn('chmod 0755 "$app"', text)
        self.assertIn("rm -rf -- /var/lib/enfoque-agent", text)
        self.assertTrue(hook.stat().st_mode & stat.S_IXUSR)
        self.assertTrue(FILE.stat().st_mode & stat.S_IXUSR)
        self.assertFalse((ROOT/"config/includes.chroot/var/lib/enfoque-agent/identity.json").exists())

    def test_trust_only_two_official_shortcuts(self):
        visual = (ROOT/"config/includes.chroot/usr/local/bin/enfoque-aplicar-visual").read_text()
        self.assertIn("gio set -t string", visual)
        self.assertIn("metadata::trusted true", visual)
        self.assertIn('cmp -s "$trusted" "$local_shortcut"', visual)
        self.assertIn('[ ! -L "$local_shortcut" ]', visual)
        self.assertIn("for item in SIGE.desktop Intranet.desktop", visual)
        self.assertNotIn("for item in *.desktop", visual)
        self.assertFalse((ROOT/"config/includes.chroot/etc/polkit-1/rules.d/99-allow-all.rules").exists())
        hook = (ROOT/"config/hooks/normal/097-enfoque-lowram-kiosk.hook.chroot").read_text()
        self.assertIn("for file in /etc/skel/Desktop/SIGE.desktop /etc/skel/Desktop/Intranet.desktop", hook)
        self.assertIn("-exec chmod 0644", hook)


if __name__ == "__main__":
    unittest.main()
