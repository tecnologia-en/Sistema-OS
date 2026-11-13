#!/usr/bin/env python3
"""GTK/Xvfb visual regression: curved glass menu and Meu Computador launch."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
import sys

import gi
gi.require_version("Gtk", "3.0")
gi.require_foreign("cairo")
import cairo
from gi.repository import Gtk, Gdk

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"
sys.path.insert(0, str(TREE / "usr/local/lib/enfoque-my-computer"))
shell = SourceFileLoader("enfoque_shell_visual", str(
    TREE / "usr/local/bin/enfoque-desktop-shell")).load_module()
my_computer = SourceFileLoader("enfoque_computer_visual", str(
    TREE / "usr/local/bin/enfoque-meu-computador")).load_module()

provider = Gtk.CssProvider()
provider.load_from_data(shell.CSS)
screen = Gdk.Screen.get_default()
assert screen is not None, "No graphical display"
Gtk.StyleContext.add_provider_for_screen(
    screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
assert shell.APP_IDS[0][0] == "enfoque-meu-computador.desktop"

gui = shell.DesktopShell.__new__(shell.DesktopShell)
gui.windows = {}
menu = gui.window("menu", "Menu Enfoque OS")
menu.add(Gtk.Label(label="Menu Enfoque OS"))
menu.show_all()
while Gtk.events_pending():
    Gtk.main_iteration_do(False)
assert menu.get_visible() and not menu.get_decorated()
assert menu.get_window() is not None
assert menu.get_type_hint() == Gdk.WindowTypeHint.POPUP_MENU
# This is exactly the GI/Cairo conversion that previously failed and
# allowed a square black border around the rounded menu.
region = cairo.Region(cairo.RectangleInt(0, 12, 100, 100))
menu.get_window().shape_combine_region(region, 0, 0)
menu.hide()
menu.destroy()

panel = my_computer.MeuComputador()
panel.show_all()
while Gtk.events_pending():
    Gtk.main_iteration_do(False)
assert panel.get_titlebar() is not None
assert len(panel.content.get_children()) >= 6
panel.destroy()
print("PASS: borderless rounded GTK menu, Cairo XShape, local hardware window")
