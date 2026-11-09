"""Regression tests for the 0.2.28 session bridge, printer, battery, menu."""
import ast
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
INC=ROOT/"config/includes.chroot"
BIN=INC/"usr/local/bin"
LIB=INC/"usr/local/lib/enfoque-session"
HARDWARE=INC/"usr/local/sbin/enfoque-hardware-setup"


def load(path, label):
    loader=importlib.machinery.SourceFileLoader(label,str(path))
    spec=importlib.util.spec_from_loader(label,loader)
    mod=importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


bridge=load(LIB/"bridge.py","test_028_bridge")
battery=load(BIN/"enfoque-bateria-painel","test_028_battery")
hardware=load(HARDWARE,"test_028_hardware")


class Bridge28(unittest.TestCase):
    def test_fallback_logind_records_only_verified_local_x11(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            def add(name,content):
                (root/name).write_text(content)
            good=("UID=1000\nUSER=enfoque\nSTATE=active\nACTIVE=1\n"
                  "TYPE=x11\nREMOTE=0\nCLASS=user\n")
            add("c2",good)
            add("c3",good.replace("REMOTE=0","REMOTE=1"))
            add("c4",good.replace("TYPE=x11","TYPE=tty"))
            add("c5",good.replace("STATE=active","STATE=closing").replace("ACTIVE=1","ACTIVE=0"))
            add("c6",good.replace("USER=enfoque","USER=enfoque-ti"))
            add("c7",good.replace("UID=1000","UID=1234"))
            add("c8",good.replace("USER=enfoque","USER=unknown"))
            add("c9",good.replace("CLASS=user","CLASS=greeter"))
            add("c10",good.replace("STATE=active","STATE=closing").replace("ACTIVE=1","ACTIVE=0"))
            original=bridge.Path.lstat
            def metadata(path):
                actual=original(path)
                return SimpleNamespace(st_uid=0,st_mode=actual.st_mode,
                                       st_size=actual.st_size)
            with (patch.object(bridge,"SESSION_DIR",root),
                  patch.object(bridge.Path,"lstat",autospec=True,side_effect=metadata),
                  patch.object(bridge.pwd,"getpwnam",side_effect=lambda name:
                      SimpleNamespace(pw_uid=1000) if name=="enfoque"
                      else (_ for _ in ()).throw(KeyError()))):
                sessions=bridge.sessions_via_root_records()
            self.assertEqual(sessions,[("c2",1000,"enfoque")])

    def test_unavailable_loginctl_uses_fallback_without_root_or_greeter(self):
        with patch.object(bridge,"sessions_via_logind",return_value=[]):
            with patch.object(bridge,"sessions_via_root_records",
                              return_value=[("c2",1000,"enfoque")]):
                self.assertEqual(bridge.active_sessions(),[("c2",1000,"enfoque")])
        with patch.object(bridge,"sessions_via_logind",
                          return_value=[("c2",1000,"enfoque")]):
            with patch.object(bridge,"sessions_via_root_records",
                              return_value=[("c2",1000,"enfoque")]):
                self.assertEqual(len(bridge.active_sessions()),1)

    def test_socket_ownership_never_bypassed(self):
        with patch.object(bridge,"active_sessions",return_value=[]):
            with self.assertRaises(ConnectionError):
                bridge.available_socket()
        result=bridge.session_command("gui",{})
        self.assertFalse(result["ok"])


class Battery28(unittest.TestCase):
    def test_no_battery_no_icon(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            ac=root/"AC";ac.mkdir();(ac/"type").write_text("Mains")
            self.assertEqual(battery.battery_markup(root),"")

    def test_laptop_battery_percent_and_status(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);p=root/"BAT0";p.mkdir()
            for name,value in (("type","Battery"),("present","1"),
                               ("capacity","76"),("status","Charging")):
                (p/name).write_text(value)
            self.assertIn("76%",battery.battery_markup(root))
            self.assertIn("carregando",battery.battery_markup(root))
            (p/"present").write_text("0")
            self.assertEqual(battery.battery_markup(root),"")
            (p/"present").write_text("1")
            (p/"capacity").write_text("abc")
            self.assertEqual(battery.battery_markup(root),"")

    def test_panel_migration_is_user_only_and_targeted(self):
        script=(BIN/"enfoque-bateria-migrar").read_text()
        self.assertIn('[ "$current" = battery ] || exit 0',script)
        self.assertIn('genmon-13.rc',script)
        self.assertIn('xfconf-query -c xfce4-panel -p /plugins/plugin-13 -s genmon',script)
        self.assertNotIn("sudo",script.splitlines()[-8:])
        self.assertNotIn("pkexec",script)
        self.assertIn('Command=/usr/local/bin/enfoque-bateria-painel',
            (INC/"etc/skel/.config/xfce4/panel/genmon-13.rc").read_text())


class Printer28(unittest.TestCase):
    def test_scanner_keeps_existing_queues_and_never_creates_duplicates(self):
        old=hardware.DRY
        try:
            hardware.DRY=False
            actions=[]
            def cmd(argv,limit=30):
                actions.append(argv)
                return 0,"",""
            with (patch.object(hardware,"cmd",side_effect=cmd),
                  patch.object(hardware,"event"),
                  patch.object(hardware,"install",return_value=True),
                  patch.object(hardware,"queues",return_value=[
                    ("Impressora_Real","usb://HP/Printer")]),
                  patch.object(hardware,"found",return_value=[
                    "usb://HP/Printer","ipp://localhost:60000/ipp/print"] ),
                  patch.object(hardware,"store"),
                  patch.object(hardware,"send_test",
                               side_effect=AssertionError("automatic print not allowed"))):
                hardware.INFO={"events":[]}
                hardware.printer_setup()
            self.assertFalse(any(row[0]=="lpadmin" for row in actions))
            self.assertFalse(any(row[0]=="lp" for row in actions))
            self.assertIn(["systemctl","disable","--now","cups-browsed.service"],actions)
            self.assertEqual(len(hardware.INFO["printers"]),2)
            self.assertEqual(hardware.INFO["printers"][0]["name"],"Impressora_Real")
        finally:
            hardware.DRY=old

    def test_cups_maintains_real_drivers(self):
        source=HARDWARE.read_text()
        self.assertIn("printer-driver-hpcups",source)
        self.assertNotIn('["lpadmin","-p",name',source)
        self.assertIn("fila CUPS configurada",source)
        self.assertIn("lpstat",source)
        self.assertNotIn("cups-browsed",(
            ROOT/"config/package-lists/enfoque-base.list.chroot").read_text().splitlines())

class Menu28(unittest.TestCase):
    def test_launcher_verifies_desktop_executable_and_uses_gio_launch(self):
        source=(BIN/"enfoque-desktop-shell").read_text()
        ast.parse(source)
        self.assertIn("Gio.DesktopAppInfo.new",source)
        self.assertIn("get_executable()",source)
        self.assertIn("get_string(\"TryExec\")",source)
        self.assertIn("info.launch([], None)",source)
        self.assertNotIn('["gtk-launch",desktop_id.removesuffix(".desktop")]',source)

    def test_custom_printer_search_and_hidden_missing_apps(self):
        source=(BIN/"enfoque-desktop-shell").read_text()
        self.assertIn('("enfoque-impressoras.desktop", "Impressoras"',source)
        self.assertIn('desktop_id == "system-config-printer.desktop"',source)
        self.assertIn('if ident in seen or not app_info(ident):',source)
        self.assertIn('self.toggle("printers")',source)
        self.assertIn('normalize_search(search)',source)

if __name__=="__main__":
    unittest.main()
