#!/usr/bin/env python3
"""Run inside isolated Xvfb + session bus; no production devices or services."""
import importlib.util
import tempfile
from pathlib import Path
import gi
gi.require_version("Gtk","3.0")
from gi.repository import Gtk, Gio, GLib, Gdk

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("tray",ROOT/"config/includes.chroot/usr/local/lib/enfoque-background/tray.py")
tray=importlib.util.module_from_spec(spec);spec.loader.exec_module(tray)
failures=[]
class Owner:
    def header(self,*args):
        return Gtk.Label(label="Em segundo plano")
window=Gtk.Window()
drawer=tray.BackgroundDrawer(Owner(),window)
window.show_all()
legacy=Gtk.StatusIcon.new_from_icon_name("network-wireless")
legacy.set_title("Enfoque legacy test")
legacy.set_visible(True)
legacy.connect("activate",lambda *_: Path("/tmp/enfoque-tray-activated").write_text("ok"))
bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
xml=Gio.DBusNodeInfo.new_for_xml("""<node><interface name="org.kde.StatusNotifierItem">
<property name="IconName" type="s" access="read"/><property name="Title" type="s" access="read"/>
<property name="Status" type="s" access="read"/>
<method name="Activate"><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
</interface></node>""")
activations=[]
def method(conn,sender,path,interface,name,args,invocation):
    activations.append(name);invocation.return_value(None)
def prop(conn,sender,path,interface,name):
    return GLib.Variant("s",{"Title":"Enfoque SNI test","IconName":"network-wireless","Status":"Active"}[name])
reg=bus.register_object("/StatusNotifierItem",xml.interfaces[0],method,prop,None)
def register():
    bus.call("org.kde.StatusNotifierWatcher","/StatusNotifierWatcher",
             "org.kde.StatusNotifierWatcher","RegisterStatusNotifierItem",
             GLib.Variant("(s)",("/StatusNotifierItem",)),None,Gio.DBusCallFlags.NONE,1500,None,None)
    return False
GLib.timeout_add(150,register)
def assert_ui():
    try:
        assert len(drawer.items)==1, "SNI item not registered"
        item=next(iter(drawer.items.values()))
        assert item["props"].get("Title")=="Enfoque SNI test",item
        assert len(drawer.legacy.sockets)==1,"XEmbed icon not embedded"
        assert not drawer.empty.get_visible(),"Empty label still visible"
        class Event:
            button=1;x_root=10;y_root=10
        drawer.activate(item["button"],Event(),next(iter(drawer.items)))
        # Slider visible only with both a battery and adjustable backlight.
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);power=root/"power";lights=root/"backlight"
            power.mkdir();lights.mkdir()
            assert tray.laptop_backlight(power,lights) is None
            battery=power/"BAT0";battery.mkdir()
            (battery/"type").write_text("Battery");(battery/"present").write_text("1")
            assert tray.laptop_backlight(power,lights) is None
            screen=lights/"intel_backlight";screen.mkdir()
            (screen/"max_brightness").write_text("200");(screen/"brightness").write_text("100")
            assert tray.laptop_backlight(power,lights)==("intel_backlight",50)
            previous=tray.laptop_backlight
            tray.laptop_backlight=lambda:("intel_backlight",50)
            drawer.prepare();window.show_all()
            assert drawer.brightness_box.get_visible(),"Notebook slider hidden"
            tray.laptop_backlight=lambda:None
            drawer.prepare();window.show_all()
            assert not drawer.brightness_box.get_visible(),"Desktop has a brightness slider"
            tray.laptop_backlight=previous
        # Click the actual embedded legacy icon using XTest.
        import ctypes,ctypes.util
        socket=next(iter(drawer.legacy.sockets.values())).get_child()
        origin=socket.get_window().get_origin()
        x,y=origin[-2:]
        xt=ctypes.CDLL(ctypes.util.find_library("Xtst"))
        xt.XTestFakeMotionEvent.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong]
        xt.XTestFakeButtonEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
        xt.XTestFakeMotionEvent(drawer.legacy.d,-1,x+14,y+14,0)
        xt.XTestFakeButtonEvent(drawer.legacy.d,1,1,0);xt.XTestFakeButtonEvent(drawer.legacy.d,1,0,0)
        drawer.legacy.x.XFlush(drawer.legacy.d)
    except Exception as exc:
        failures.append(str(exc))
    GLib.timeout_add(600,finish)
    return False
def finish():
    try:
        assert activations==["Activate"],activations
        assert Path("/tmp/enfoque-tray-activated").exists(),"Legacy icon click not delivered"
    except Exception as exc:
        failures.append(str(exc))
    Gtk.main_quit()
    return False
GLib.timeout_add(1300,assert_ui)
GLib.timeout_add_seconds(8,lambda: (failures.append("Timeout"),Gtk.main_quit(),False)[-1])
Gtk.main()
if failures:
    raise SystemExit("FAILED: "+"; ".join(failures))
print("PASS: real SNI registration/activation, XEmbed embedding/click, notebook/desktop slider visibility")
