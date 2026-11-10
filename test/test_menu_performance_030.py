"""Regression checks for 0.2.30 menu latency (no display server required)."""
import ast
import os
from pathlib import Path
import socket
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock

MENU = (Path(__file__).resolve().parents[1] /
        "config/includes.chroot/usr/local/bin/enfoque-desktop-shell")


class FastMenuTests(unittest.TestCase):
    def test_fast_client_delivers_exact_newline_without_loading_gtk(self):
        with tempfile.TemporaryDirectory() as base:
            runtime = Path(base) / "runtime"
            runtime.mkdir(mode=0o700)
            path = runtime / f"enfoque-shell-{os.getuid()}.sock"
            server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            server.bind(str(path))
            server.listen(4)
            try:
                seen = []
                def get_message():
                    c, _ = server.accept()
                    with c:
                        seen.append(c.recv(128))
                thread = threading.Thread(target=get_message, daemon=True)
                thread.start()
                env = {**os.environ, "XDG_RUNTIME_DIR": str(runtime)}
                # -S removes system site-packages, so Gtk/gi must not import.
                proc = subprocess.run(
                    [sys.executable, "-S", str(MENU), "menu"],
                    env=env, capture_output=True, text=True, timeout=5)
                thread.join(timeout=3)
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertEqual(seen, [b"menu\n"])
            finally:
                server.close()

    def test_cached_tiles_are_reused_for_repeated_open_and_search(self):
        tree = ast.parse(MENU.read_text(encoding="utf-8"))
        klass = next(n for n in tree.body if isinstance(n, ast.ClassDef)
                     and n.name == "DesktopShell")
        methods = {
            n.name: n for n in klass.body if isinstance(n, ast.FunctionDef)
            and n.name in ("populate_apps", "available_app_catalog")
        }
        ns = {"APP_IDS": [("test.desktop", "Teste", "test-icon")],
              "normalize_search": lambda s: s.casefold(),
              "app_info": lambda s: object(),
              "styled": lambda o, kind: o,
              "icon": lambda *args: MagicMock(),
              "label": lambda *args: MagicMock(),
              "Gtk": MagicMock(), "Gio": MagicMock(),
              "GLib": SimpleNamespace(Error=RuntimeError),
              "Pango": SimpleNamespace(EllipsizeMode=SimpleNamespace(END=3))}
        ns["Gtk"].Button.side_effect = lambda: MagicMock()
        ns["Gio"].AppInfo.get_all.return_value = []
        for method in methods.values():
            exec(compile(ast.Module(body=[method], type_ignores=[]),
                         str(MENU), "exec"), ns)
        shell = SimpleNamespace(
            fl=MagicMock(), _menu_tile_cache={}, _menu_catalog=None,
            _menu_showing_full=False, menu_buttons=[],
            launch=lambda _ident: None)
        shell.available_app_catalog = lambda: ns["available_app_catalog"](shell)
        load = ns["populate_apps"]
        load(shell)
        first_button = shell.menu_buttons[0][0]
        count = ns["Gtk"].Button.call_count
        self.assertEqual(count, 1)
        for _ in range(8):
            load(shell)
        self.assertEqual(ns["Gtk"].Button.call_count, count)
        self.assertIs(shell.menu_buttons[0][0], first_button)
        load(shell, "teste")
        self.assertEqual(ns["Gtk"].Button.call_count, count)
        load(shell, "inexistente")
        self.assertEqual(len(shell.menu_buttons), 0)
        load(shell)
        self.assertIs(shell.menu_buttons[0][0], first_button)


if __name__ == "__main__":
    unittest.main()
