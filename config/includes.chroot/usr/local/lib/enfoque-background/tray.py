"""Native GTK background drawer: SNI/DBusMenu and legacy XEmbed tray.
Lives in the existing desktop shell; no additional polling daemon.
"""
import ctypes
import ctypes.util
import os
import subprocess
from pathlib import Path
from gi.repository import Gtk, Gdk, GLib, Gio, GdkPixbuf
import gi
gi.require_version("GdkX11", "3.0")
from gi.repository import GdkX11

WATCHER_XML = """<node><interface name="org.kde.StatusNotifierWatcher">
<method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method>
<method name="RegisterStatusNotifierHost"><arg type="s" direction="in"/></method>
<property name="RegisteredStatusNotifierItems" type="as" access="read"/>
<property name="IsStatusNotifierHostRegistered" type="b" access="read"/>
<property name="ProtocolVersion" type="i" access="read"/>
<signal name="StatusNotifierItemRegistered"><arg type="s"/></signal>
<signal name="StatusNotifierItemUnregistered"><arg type="s"/></signal>
<signal name="StatusNotifierHostRegistered"/>
</interface></node>"""


def laptop_backlight(power=Path("/sys/class/power_supply"),
                     backlights=Path("/sys/class/backlight")):
    """Only a present battery plus a real adjustable display enables the slider."""
    try:
        battery = any((p/"type").read_text().strip() == "Battery" and
                      (not (p/"present").exists() or (p/"present").read_text().strip() == "1")
                      for p in power.iterdir() if (p/"type").exists())
        if not battery:
            return None
        for p in sorted(backlights.iterdir()):
            maximum = int((p/"max_brightness").read_text())
            current = int((p/"brightness").read_text())
            if maximum > 0:
                return p.name, max(0, min(100, round(current*100/maximum)))
    except (OSError, ValueError):
        pass
    return None


class LegacyTray:
    """Own the standard X11 tray selection and embed the real client windows."""
    def __init__(self, box, changed):
        self.box, self.changed, self.sockets = box, changed, {}
        self.x = ctypes.CDLL(ctypes.util.find_library("X11"))
        x=self.x
        x.XOpenDisplay.argtypes=[ctypes.c_char_p];x.XOpenDisplay.restype=ctypes.c_void_p
        self.d=x.XOpenDisplay(None)
        if not self.d:
            return
        D=ctypes.c_void_p; U=ctypes.c_ulong
        for n,args,res in [
            ("XDefaultScreen",[D],ctypes.c_int),("XRootWindow",[D,ctypes.c_int],U),
            ("XCreateSimpleWindow",[D,U,ctypes.c_int,ctypes.c_int,ctypes.c_uint,ctypes.c_uint,ctypes.c_uint,U,U],U),
            ("XInternAtom",[D,ctypes.c_char_p,ctypes.c_int],U),
            ("XGetSelectionOwner",[D,U],U),("XSetSelectionOwner",[D,U,U,U],ctypes.c_int),
            ("XSendEvent",[D,U,ctypes.c_int,ctypes.c_long,ctypes.c_void_p],ctypes.c_int),
            ("XFlush",[D],ctypes.c_int),("XPending",[D],ctypes.c_int),
            ("XNextEvent",[D,ctypes.c_void_p],ctypes.c_int),
            ("XConnectionNumber",[D],ctypes.c_int)]:
            f=getattr(x,n);f.argtypes=args;f.restype=res
        screen=x.XDefaultScreen(self.d);root=x.XRootWindow(self.d,screen)
        selection=x.XInternAtom(self.d,f"_NET_SYSTEM_TRAY_S{screen}".encode(),0)
        if x.XGetSelectionOwner(self.d,selection):
            return
        self.win=x.XCreateSimpleWindow(self.d,root,0,0,1,1,0,0,0)
        class Data(ctypes.Union):
            _fields_=[("b",ctypes.c_char*20),("s",ctypes.c_short*10),("l",ctypes.c_long*5)]
        class Message(ctypes.Structure):
            _fields_=[("type",ctypes.c_int),("serial",U),("send_event",ctypes.c_int),
                      ("display",D),("window",U),("message_type",U),
                      ("format",ctypes.c_int),("data",Data)]
        class Event(ctypes.Union):
            _fields_=[("client",Message),("pad",ctypes.c_long*24)]
        self.Event=Event
        self.opcode=x.XInternAtom(self.d,b"_NET_SYSTEM_TRAY_OPCODE",0)
        x.XSetSelectionOwner(self.d,selection,self.win,0)
        e=Event();e.client.type=33;e.client.display=self.d;e.client.window=root
        e.client.message_type=x.XInternAtom(self.d,b"MANAGER",0);e.client.format=32
        e.client.data.l[0]=0;e.client.data.l[1]=selection;e.client.data.l[2]=self.win
        x.XSendEvent(self.d,root,0,1<<17,ctypes.byref(e));x.XFlush(self.d)
        GLib.io_add_watch(x.XConnectionNumber(self.d),GLib.IO_IN,self.receive)

    def receive(self,*_):
        while self.x.XPending(self.d):
            e=self.Event();self.x.XNextEvent(self.d,ctypes.byref(e))
            if e.client.type==33 and e.client.message_type==self.opcode and e.client.data.l[1]==0:
                xid=e.client.data.l[2]
                if xid in self.sockets:
                    continue
                socket=Gtk.Socket()
                socket.set_size_request(28,28)
                wrap=Gtk.EventBox();wrap.set_border_width(8);wrap.add(socket)
                self.box.add(wrap);wrap.show_all()
                self.sockets[xid]=wrap
                socket.connect("plug-removed",self.removed,xid)
                socket.add_id(xid)
                self.changed()
        return True

    def removed(self,socket,xid):
        wrapper=self.sockets.pop(xid,None)
        if wrapper:
            wrapper.get_parent().destroy()
        self.changed()
        return True


class BackgroundDrawer:
    def __init__(self, owner, window):
        self.owner, self.window = owner, window
        self.items = {}
        self.root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL,spacing=8)
        self.root.set_border_width(14);window.add(self.root)
        self.root.pack_start(owner.header("Em segundo plano",window),False,False,0)
        self.box=Gtk.FlowBox();self.box.set_selection_mode(Gtk.SelectionMode.NONE)
        self.box.set_min_children_per_line(1);self.box.set_max_children_per_line(6)
        self.box.set_row_spacing(4);self.box.set_column_spacing(4)
        scroll=Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER,Gtk.PolicyType.AUTOMATIC)
        scroll.set_min_content_height(48);scroll.set_max_content_height(104)
        scroll.set_propagate_natural_height(True);scroll.add(self.box)
        self.root.pack_start(scroll,True,True,0)
        self.empty=Gtk.Label(label="Nenhum aplicativo na bandeja")
        self.root.pack_start(self.empty,False,False,6)
        self.brightness_box=Gtk.Box(orientation=Gtk.Orientation.VERTICAL,spacing=6)
        self.root.pack_end(self.brightness_box,False,False,0)
        self.pending=None
        self.legacy=LegacyTray(self.box,self.changed)
        self.bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
        node=Gio.DBusNodeInfo.new_for_xml(WATCHER_XML)
        self.registration=self.bus.register_object("/StatusNotifierWatcher",node.interfaces[0],
                                                   self.method,self.property,None)
        self.name=Gio.bus_own_name_on_connection(self.bus,"org.kde.StatusNotifierWatcher",
                                                Gio.BusNameOwnerFlags.NONE,None,None)
        self.bus.signal_subscribe("org.freedesktop.DBus","org.freedesktop.DBus","NameOwnerChanged",
                                  "/org/freedesktop/DBus",None,Gio.DBusSignalFlags.NONE,self.name_changed)
        self.bus.signal_subscribe(None,"org.kde.StatusNotifierItem",None,None,None,
                                  Gio.DBusSignalFlags.NONE,self.item_changed)
        self.changed()

    def property(self,conn,sender,path,interface,name):
        return {"RegisteredStatusNotifierItems":GLib.Variant("as",list(self.items)),
                "IsStatusNotifierHostRegistered":GLib.Variant("b",True),
                "ProtocolVersion":GLib.Variant("i",0)}.get(name)

    def method(self,conn,sender,path,interface,method,args,invocation):
        if method=="RegisterStatusNotifierItem":
            value=args.unpack()[0]
            service,path=(sender,value) if value.startswith("/") else (value,"/StatusNotifierItem")
            if not service or not Gio.dbus_is_name(service) or not GLib.Variant.is_object_path(path):
                invocation.return_dbus_error("org.kde.StatusNotifierWatcher.InvalidItem","Invalid item")
                return
            key=service+path
            if key not in self.items:
                button=Gtk.Button();button.set_size_request(38,38)
                self.items[key]={"service":service,"path":path,"button":button,"props":{},"owner":sender}
                button.connect("button-press-event",self.activate,key)
                self.box.add(button);button.show()
                self.update(key)
                self.bus.emit_signal(None,"/StatusNotifierWatcher","org.kde.StatusNotifierWatcher",
                                     "StatusNotifierItemRegistered",GLib.Variant("(s)",(key,)))
                self.changed()
        invocation.return_value(None)

    def name_changed(self,conn,sender,path,interface,signal,parameters):
        name,old,new=parameters.unpack()
        if not new:
            for key,item in list(self.items.items()):
                if name in (item["service"],item["owner"]):
                    item["button"].get_parent().destroy()
                    del self.items[key]
                    self.bus.emit_signal(None,"/StatusNotifierWatcher","org.kde.StatusNotifierWatcher",
                                         "StatusNotifierItemUnregistered",GLib.Variant("(s)",(key,)))
            self.changed()

    def item_changed(self,conn,sender,path,interface,signal,params):
        for key,item in list(self.items.items()):
            if item["path"]==path and sender in (item["service"],item["owner"]):
                self.update(key)

    def update(self,key):
        item=self.items.get(key)
        if not item:
            return
        def finished(conn,result):
            try:
                reply=conn.call_finish(result).unpack()[0]
                if key not in self.items:
                    return
                item["props"]=reply
                image=Gtk.Image.new_from_icon_name(reply.get("IconName") or "application-x-executable",
                                                  Gtk.IconSize.LARGE_TOOLBAR)
                pixmaps=reply.get("IconPixmap",[])
                if not reply.get("IconName") and pixmaps:
                    w,h,data=min(pixmaps,key=lambda p:abs(p[0]-24))
                    if 0<w<=512 and 0<h<=512 and len(data)==w*h*4:
                        argb=bytes(data);rgba=bytes(c for i in range(0,len(argb),4)
                                                  for c in (*argb[i+1:i+4],argb[i]))
                        pix=GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(rgba),GdkPixbuf.Colorspace.RGB,
                                                           True,8,w,h,w*4)
                        image=Gtk.Image.new_from_pixbuf(pix.scale_simple(24,24,GdkPixbuf.InterpType.BILINEAR))
                item["button"].set_image(image)
                item["button"].set_tooltip_text(reply.get("Title") or reply.get("Id") or "Aplicativo")
            except GLib.Error:
                pass
        self.bus.call(item["service"],item["path"],"org.freedesktop.DBus.Properties","GetAll",
                      GLib.Variant("(s)",("org.kde.StatusNotifierItem",)),None,
                      Gio.DBusCallFlags.NONE,1500,None,finished)

    def activate(self,button,event,key):
        item=self.items.get(key)
        if not item:
            return False
        props=item["props"]
        menu=props.get("Menu")
        if menu and (event.button==3 or props.get("ItemIsMenu")):
            self.show_menu(item,menu,event)
        else:
            method="SecondaryActivate" if event.button==2 else "Activate"
            self.bus.call(item["service"],item["path"],"org.kde.StatusNotifierItem",method,
                          GLib.Variant("(ii)",(int(event.x_root),int(event.y_root))),None,
                          Gio.DBusCallFlags.NONE,1500,None,None)
        return True

    def show_menu(self,item,path,event):
        def finished(conn,result):
            try:
                _,layout=conn.call_finish(result).unpack()
                menu=Gtk.Menu()
                def append(parent,node):
                    ident,props,children=node
                    if not props.get("visible",True):
                        return
                    if props.get("type")=="separator":
                        parent.append(Gtk.SeparatorMenuItem());return
                    action=Gtk.MenuItem.new_with_mnemonic(props.get("label","").replace("_","__").replace("&","_"))
                    action.set_sensitive(props.get("enabled",True));parent.append(action)
                    if children:
                        sub=Gtk.Menu();action.set_submenu(sub)
                        for child in children:
                            append(sub,child.unpack() if isinstance(child,GLib.Variant) else child)
                    else:
                        action.connect("activate",lambda *_: self.bus.call(
                            item["service"],path,"com.canonical.dbusmenu","Event",
                            GLib.Variant("(isvu)",(ident,"clicked",GLib.Variant("i",0),event.time)),
                            None,Gio.DBusCallFlags.NONE,1500,None,None))
                for child in layout[2]:
                    append(menu,child.unpack() if isinstance(child,GLib.Variant) else child)
                menu.show_all();menu.popup_at_pointer(event)
            except (GLib.Error,ValueError,TypeError):
                pass
        self.bus.call(item["service"],path,"com.canonical.dbusmenu","GetLayout",
                      GLib.Variant("(iias)",(0,3,[])),None,Gio.DBusCallFlags.NONE,1500,None,finished)

    def changed(self):
        self.empty.set_no_show_all(bool(self.items or self.legacy.sockets))
        self.empty.set_visible(not bool(self.items or self.legacy.sockets))

    def prepare(self):
        self.changed()
        for child in self.brightness_box.get_children():
            child.destroy()
        light=laptop_backlight()
        self.brightness_box.set_no_show_all(not bool(light))
        self.brightness_box.set_visible(bool(light))
        if not light:
            return
        self.device=light[0]
        heading=Gtk.Label(label="Brilho da tela");heading.set_xalign(0)
        self.brightness_box.pack_start(heading,False,False,0)
        scale=Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,1,100,1)
        scale.set_value(max(1,light[1]));scale.set_digits(0)
        scale.set_tooltip_text("Ajustar brilho da tela")
        scale.connect("value-changed",self.brightness_changed)
        self.brightness_box.pack_start(scale,False,False,0)
        self.error=Gtk.Label();self.error.set_line_wrap(True)
        self.brightness_box.pack_start(self.error,False,False,0)

    def brightness_changed(self,scale):
        if self.pending:
            GLib.source_remove(self.pending)
        value=round(scale.get_value())
        def apply():
            self.pending=None
            try:
                proc=Gio.Subprocess.new(["brightnessctl","--device",self.device,"set",f"{value}%"],
                                        Gio.SubprocessFlags.STDOUT_SILENCE|Gio.SubprocessFlags.STDERR_SILENCE)
                def done(p,result):
                    try:
                        p.wait_check_finish(result)
                        self.error.set_text("")
                    except GLib.Error:
                        self.error.set_text("Sem permissão para ajustar o brilho nesta sessão.")
                proc.wait_check_async(None,done)
            except GLib.Error:
                self.error.set_text("Controle de brilho indisponível.")
            return False
        self.pending=GLib.timeout_add(120,apply)
