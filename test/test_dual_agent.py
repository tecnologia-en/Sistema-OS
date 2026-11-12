"""Enfoque OS dual agent - regressions without a real server, display or privileges."""
import importlib.machinery
import importlib.util
import io
from pathlib import Path
import socket
import struct
import sys
import threading
import time
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/"config/includes.chroot/usr/local/bin"
LIB=ROOT/"config/includes.chroot/usr/local/lib/enfoque-session"
sys.path.insert(0,str(LIB))
import bridge
import channel

def load(file,name):
    loader=importlib.machinery.SourceFileLoader(name,str(file))
    spec=importlib.util.spec_from_loader(name,loader)
    mod=importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod

sys_agent=load(BIN/"enfoque-remote-agent","dual_sys_agent")
session=load(BIN/"enfoque-session-agent","dual_session")

class DualAgentUnitTests(unittest.TestCase):
    def test_system_agent_remains_unprivileged(self):
        service=(ROOT/"config/includes.chroot/etc/systemd/system/enfoque-remote-agent.service").read_text()
        self.assertIn("DynamicUser=yes",service)
        self.assertIn("SupplementaryGroups=enfoque-remote",service)
        self.assertIn("ProtectHome=yes",service)
        self.assertIn("NoNewPrivileges=yes",service)
        self.assertNotIn("User=root",service)

    def test_session_agent_is_local_only(self):
        code=(BIN/"enfoque-session-agent").read_text()
        self.assertIn("socket.AF_UNIX",code)
        self.assertIn("SO_PEERCRED",code)
        self.assertIn("Recusado: agente gráfico jamais deve executar como root",code)
        self.assertNotIn("https://mcp.",code)
        self.assertNotIn("Authorization: Bearer",code)

    def test_service_relays_run_shell_open(self):
        with patch.object(sys_agent,"session_request",return_value={"ok":True,"scope":"sessao-usuario"}) as fn:
            for action,args in (("shell",{"command":"whoami"}),
                                ("run",{"program":"id","args":["-un"]}),
                                ("open",{"app":"default","target":"/tmp/file.pdf"})):
                self.assertTrue(sys_agent.handle_action(action,args)["ok"])
            self.assertEqual(fn.call_count,3)
        self.assertFalse(sys_agent.handle_action("gui",{"op":"click"})["ok"])

    def test_kiosk_user_is_not_an_administrative_terminal(self):
        with patch.object(bridge,"available_socket",return_value=
                          (Path("/run/enfoque-remote/session-1000.sock"),"enfoque-kiosk",1000)):
            for action in ("shell","run","process"):
                value=bridge.session_command(action,{"command":"echo a"})
                self.assertFalse(value["ok"])
                self.assertIn("bloqueado",value["error"])

    def test_errors_when_no_logged_in_session(self):
        with patch.object(bridge,"available_socket",side_effect=ConnectionError("no session")):
            resp=bridge.session_command("open",{"target":"/tmp/file.pdf"})
        self.assertFalse(resp["ok"])
        self.assertIn("sessão",resp["help"])

    def test_open_input_validation(self):
        self.assertFalse(session.open_item({"app":"default","target":"javascript:alert(1)"})["ok"])
        self.assertFalse(session.open_item({"app":"app","target":"/not/a/program"})["ok"])
        self.assertFalse(session.open_item({"app":"browser","target":"not-existing-file"})["ok"])

    def test_diagnostic_scope_has_no_root_shell(self):
        self.assertEqual(sys_agent.command_argv("free",["-m"]),["/usr/bin/free","-m"])
        for script in ("sudo id","rm -rf /","cat /etc/shadow",
                       "echo $(whoami)", "systemctl restart cups.service"):
            self.assertFalse(sys_agent.handle_action("shell",{"command":script,"scope":"diagnostic"})["ok"])

    def test_ws_requires_tls(self):
        with self.assertRaises(ValueError):
            channel.WebSocket("ws://127.0.0.1/","d","token").connect()
        with self.assertRaises(ValueError):
            channel.WebSocket("http://127.0.0.1/","d","token").connect()

    def test_client_ws_frame_masked(self):
        class Sink:
            def __init__(self):self.data=b""
            def sendall(self,data):self.data+=data
        ws=channel.WebSocket("wss://localhost/","d","t")
        ws.sock=Sink()
        ws.send_json({"type":"ping"})
        self.assertEqual(ws.sock.data[0],0x81)
        self.assertTrue(ws.sock.data[1]&128)
        length=ws.sock.data[1]&127
        mask=ws.sock.data[2:6]
        encoded=ws.sock.data[6:6+length]
        payload=bytes(ch^mask[i%4] for i,ch in enumerate(encoded))
        self.assertIn(b'"type":"ping"',payload)

    def test_websocket_reader_stays_responsive_while_command_runs(self):
        """Long local CUPS/GUI tasks cannot block server Ping/Pong handling."""
        reader_advanced=threading.Event()
        result_sent=threading.Event()
        command_done=threading.Event()
        seen=[]
        class FakeSocket:
            def __init__(self,*_a,**_kw):
                self.calls=0
            def connect(self):return self
            def send_json(self,obj):
                seen.append(obj)
                if obj.get('type')=='result': result_sent.set()
            def recv_json(self):
                self.calls+=1
                if self.calls==1:
                    return {'type':'command','command':{'id':'test-1',
                            'action':'run','args':{'program':'sleep'}}}
                reader_advanced.set()
                if not result_sent.wait(timeout=2):
                    raise AssertionError('Reader blocked while command executes')
                raise ConnectionError('Test transport closed')
            def close(self):pass
        def slow_command(_action,_args):
            if not reader_advanced.wait(timeout=2):
                raise AssertionError('WebSocket reader stopped processing frames')
            command_done.set()
            return {'ok':True}
        with patch.object(channel,'WebSocket',FakeSocket), \
             patch.object(sys_agent,'display_identity',return_value=('123456789012-6','LIVRARIA1 / Centro')), \
             patch.object(sys_agent,'handle_action',side_effect=slow_command), \
             patch.object(sys_agent,'audit_remote'):
            with self.assertRaises(ConnectionError):
                sys_agent.websocket_cycle({'deviceId':'enfoqueos-test','token':'test'})
        self.assertTrue(reader_advanced.is_set())
        self.assertTrue(command_done.is_set())
        self.assertTrue(result_sent.is_set())

    def test_websocket_reconnects_after_missing_heartbeat(self):
        ws=channel.WebSocket('wss://localhost/','device','token')
        ws.last_received_at=0
        with patch.object(channel.time,'monotonic',return_value=100):
            with patch.object(ws,'_recv_exact',side_effect=socket.timeout):
                with self.assertRaisesRegex(ConnectionError,'Heartbeat'):
                    ws.recv_json()

    def test_cross_user_group_membership_alone_does_not_grant_ipc(self):
        import os
        # UID 1001 in the IPC group cannot impersonate the network service.
        with patch.object(session.os,"getuid",return_value=1000):
            with patch.object(session.Path,"read_text",
                              return_value="0::/user.slice/user-1001.slice/session-3.scope\\n"):
                self.assertFalse(session.peer_in_group(12345,1001,987,987))
            with patch.object(session.Path,"read_text",
                              return_value="0::/system.slice/enfoque-remote-agent.service\n"):
                self.assertTrue(session.peer_in_group(12345,1001,987,987))
            self.assertTrue(session.peer_in_group(12345,1000,1000,987))
            self.assertTrue(session.peer_in_group(12345,0,0,987))

    def test_ipc_group_not_public(self):
        conf=(ROOT/"config/includes.chroot/etc/tmpfiles.d/enfoque-remote.conf").read_text()
        self.assertIn("2770 root enfoque-remote",conf)
        hook=(ROOT/"config/hooks/normal/102-enfoque-dual-agent.hook.chroot").read_text()
        self.assertIn("groupadd --system enfoque-remote",hook)
        self.assertNotIn("chmod 777",hook)

    def test_installer_uses_group_and_keeps_machine_identity(self):
        code=(ROOT/"config/includes.chroot/usr/local/sbin/enfoque-install-system").read_text()
        self.assertIn("lp,enfoque-remote",code)
        self.assertIn('str(TARGET)',code)
        self.assertNotIn("token",str(ROOT/"config/includes.chroot/etc/xdg/autostart/enfoque-session-agent.desktop"))

    def test_agent_version_and_ws_fallback(self):
        code=(BIN/"enfoque-remote-agent").read_text()
        self.assertIn('AGENT_VERSION = "0.2.49-linux-visual-ondemand"',code)
        self.assertIn("websocket_cycle(state)",code)
        self.assertIn("run_cycle(state)",code)

if __name__=="__main__":
    unittest.main()
