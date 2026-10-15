#!/usr/bin/env python3
"""Enfoque Central: painel nativo de USB, impressoras, hardware e aplicativos."""
import os
import sys
import time
import subprocess
from pathlib import Path

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib, Gio

sys.path.insert(0, "/usr/local/lib/enfoque-hub")
from devices import ports, printer_queues  # noqa: E402

CSS = b"""
window { background: #f4f7fc; color: #1b2a42; }
headerbar { background: #ffffff; color: #17314d; border-bottom: 1px solid #dce5f1; }
headerbar button { border-radius: 9px; }
.enfoque-title { color: #173755; font-size: 20px; font-weight: 800; }
.enfoque-muted { color: #6e829c; font-size: 12px; }
.section-title { color: #263c54; font-size: 15px; font-weight: 800; }
.summary { border-radius: 13px; background: #e7f0fb; padding: 14px; }
.tile { border: 1px solid #dbe5f0; background: #ffffff; border-radius: 13px; padding: 11px; }
.tile-on { border-color: #9cc5f5; background: #f3f8ff; }
.tile-off { background: #fafbfd; }
.tile-kind { color: #2a619e; font-size: 12px; font-weight: 800; }
.tile-sub { color: #6d8098; font-size: 11px; }
button.enfoque-primary { background: #2475ce; color: white; border-radius: 10px; padding: 10px 14px; }
button.enfoque-secondary { background: #e5edf7; color: #214b77; border-radius: 10px; padding: 9px; }
progressbar trough { min-height: 9px; border-radius: 7px; }
progressbar progress { background: #2682dc; border-radius: 7px; }
"""

def label(text, style=None, selectable=False):
    widget = Gtk.Label(label=str(text), xalign=0)
    widget.set_line_wrap(True)
    widget.set_selectable(selectable)
    if style:
        widget.get_style_context().add_class(style)
    return widget


def read_memory():
    fields = {}
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                k, _, val = line.partition(":")
                fields[k] = int(val.strip().split()[0])
        total = fields.get("MemTotal", 0)
        avail = fields.get("MemAvailable", 0)
        return round((1 - avail / total) * 100) if total else 0
    except (OSError, ValueError):
        return 0


def read_cpu():
    try:
        with open("/proc/stat", encoding="ascii") as handle:
            values = [int(n) for n in handle.readline().split()[1:]]
        return sum(values), values[3] + values[4]
    except (OSError, ValueError, IndexError):
        return None


class EnfoqueHub(Gtk.Window):
    def __init__(self):
        super().__init__(title="Enfoque Central")
        self.set_default_size(1080, 700)
        self.set_position(Gtk.WindowPosition.CENTER)
        self.connect("destroy", Gtk.main_quit)
        self.last_devices = None
        self.last_printers = None
        self.cpu_sample = read_cpu()
        self.tabs = Gtk.Notebook()
        self.tabs.set_show_border(False)
        self._prepare_ui()
        self._tick()
        GLib.timeout_add_seconds(2, self._tick)

    def _prepare_ui(self):
        provider = Gtk.CssProvider()
        provider.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )
        header = Gtk.HeaderBar()
        header.set_show_close_button(True)
        header.props.title = "Enfoque Central"
        header.props.subtitle = "Dispositivos, impressoras e aplicativos"
        self.set_titlebar(header)

        printers_button = Gtk.Button(label="Configurar impressoras")
        printers_button.get_style_context().add_class("enfoque-primary")
        printers_button.connect("clicked", lambda *_: self._spawn(["system-config-printer"]))
        header.pack_end(printers_button)

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        box.set_border_width(17)
        self.add(box)

        heading = label("Este computador", "enfoque-title")
        box.pack_start(heading, False, False, 0)
        box.pack_start(label("As portas e dispositivos são reconhecidos automaticamente. Conecte ou desconecte um USB para ver a atualização.", "enfoque-muted"), False, False, 0)
        summary = Gtk.Box(spacing=16)
        summary.get_style_context().add_class("summary")
        self.port_status = label("Carregando USB...")
        summary.pack_start(self.port_status, True, True, 0)
        self.cpu_label = label("CPU: —")
        summary.pack_start(self.cpu_label, False, False, 0)
        self.ram_label = label("RAM: —")
        summary.pack_start(self.ram_label, False, False, 0)
        box.pack_start(summary, False, False, 0)

        self.tabs.append_page(self._devices_tab(), label("Portas USB"))
        self.tabs.append_page(self._printers_tab(), label("Impressoras"))
        self.tabs.append_page(self._apps_tab(), label("Aplicativos"))
        self.tabs.append_page(self._support_tab(), label("Suporte TI"))
        box.pack_start(self.tabs, True, True, 0)

        bottom = label("Enfoque OS • Inventário local por sysfs e CUPS • USB de hubs e máquinas virtuais pode ter numeração lógica diferente da porta física.", "enfoque-muted")
        box.pack_start(bottom, False, False, 0)

    def _scroll(self, inner):
        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        scroll.add(inner)
        return scroll

    def _devices_tab(self):
        self.flow = Gtk.FlowBox()
        self.flow.set_selection_mode(Gtk.SelectionMode.NONE)
        self.flow.set_row_spacing(12)
        self.flow.set_column_spacing(12)
        self.flow.set_max_children_per_line(4)
        self.flow.set_min_children_per_line(1)
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        outer.set_border_width(12)
        outer.pack_start(label("Mapa automático das portas USB", "section-title"), False, False, 0)
        outer.pack_start(label("Portas vazias aparecem em cinza. Teclados, mouses, leitores, impressoras e qualquer USB novo surgem sem cadastro manual.", "enfoque-muted"), False, False, 0)
        outer.pack_start(self._scroll(self.flow), True, True, 0)
        return outer

    def _printers_tab(self):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        box.set_border_width(16)
        box.pack_start(label("Impressoras reconhecidas pelo sistema", "section-title"), False, False, 0)
        box.pack_start(label("CUPS e IPP detectam várias impressoras automaticamente. Para modelos térmicos legados (como algumas Bematech), pode ser necessário o PPD / driver específico.", "enfoque-muted"), False, False, 0)
        self.printer_list = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        box.pack_start(self.printer_list, False, False, 0)
        button = Gtk.Button(label="Abrir configuração de impressoras")
        button.get_style_context().add_class("enfoque-primary")
        button.connect("clicked", lambda *_: self._spawn(["system-config-printer"]))
        box.pack_start(button, False, False, 0)
        return self._scroll(box)

    def _apps_tab(self):
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=9)
        outer.set_border_width(12)
        outer.pack_start(label("Aplicativos instalados", "section-title"), False, False, 0)
        outer.pack_start(label("Este catálogo é atualizado a cada pesquisa. Inclui programas instalados depois da criação da ISO.", "enfoque-muted"), False, False, 0)
        self.app_search = Gtk.SearchEntry()
        self.app_search.set_placeholder_text("Procurar aplicativo...")
        self.app_search.connect("search-changed", self._refresh_apps)
        outer.pack_start(self.app_search, False, False, 0)
        self.apps_list = Gtk.ListBox()
        self.apps_list.set_selection_mode(Gtk.SelectionMode.NONE)
        outer.pack_start(self._scroll(self.apps_list), True, True, 0)
        self._refresh_apps()
        return outer

    def _support_tab(self):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=13)
        box.set_border_width(17)
        box.pack_start(label("Suporte e administração corporativa", "section-title"), False, False, 0)
        box.pack_start(label("A Enfoque pode usar um agente de suporte aprovado para visualizar a área de trabalho completa, incluindo programas instalados posteriormente. O acesso administrativo persistente só pode ser habilitado durante a inscrição de um computador autorizado, com auditoria e possibilidade de revogação.", "enfoque-muted"), False, False, 0)
        box.pack_start(label("O suporte iniciado pela página da intranet deve solicitar consentimento do usuário em cada sessão. O agente instalado nesta ISO não autoriza automaticamente essa modalidade.", "enfoque-muted"), False, False, 0)
        manage = Gtk.Button(label="Configurar suporte corporativo")
        manage.get_style_context().add_class("enfoque-primary")
        manage.connect("clicked", lambda *_: self._spawn(["xfce4-terminal", "--command", "/usr/local/bin/enfoque-parear-suporte"]))
        box.pack_start(manage, False, False, 0)
        return box

    def _spawn(self, args):
        try:
            subprocess.Popen(args, close_fds=True, start_new_session=True)
        except OSError:
            dialog = Gtk.MessageDialog(transient_for=self, flags=0, message_type=Gtk.MessageType.ERROR, buttons=Gtk.ButtonsType.OK,
                                       text="Não foi possível abrir o aplicativo.")
            dialog.run()
            dialog.destroy()

    def _refresh_apps(self, *_):
        query = self.app_search.get_text().casefold()
        for widget in self.apps_list.get_children():
            self.apps_list.remove(widget)
        seen = set()
        for app in sorted(Gio.AppInfo.get_all(), key=lambda a: (a.get_display_name() or "").casefold()):
            name = app.get_display_name() or ""
            if not app.should_show() or query not in name.casefold() or name in seen:
                continue
            seen.add(name)
            row = Gtk.ListBoxRow()
            line = Gtk.Box(spacing=12)
            line.set_border_width(7)
            ico = Gtk.Image.new_from_icon_name("application-x-executable", Gtk.IconSize.DIALOG)
            line.pack_start(ico, False, False, 0)
            line.pack_start(label(name), True, True, 0)
            button = Gtk.Button(label="Abrir")
            button.connect("clicked", self._start_app, app)
            line.pack_end(button, False, False, 0)
            row.add(line)
            self.apps_list.add(row)
        self.apps_list.show_all()

    def _start_app(self, _button, app):
        try:
            app.launch([], None)
        except GLib.Error:
            pass

    def _render_ports(self, data):
        for child in self.flow.get_children():
            self.flow.remove(child)
        if not data:
            self.flow.add(label("Nenhuma controladora USB exposta. Em máquinas virtuais, ative o controlador USB nas configurações da VM.", "enfoque-muted"))
        for item in data:
            frame = Gtk.Frame()
            frame.set_size_request(215, 116)
            frame.get_style_context().add_class("tile")
            frame.get_style_context().add_class("tile-on" if item["occupied"] else "tile-off")
            card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
            card.set_border_width(10)
            top = Gtk.Box(spacing=9)
            dev = item["device"]
            icon_name = ("printer" if dev and "Impressora" in dev["kind"] else
                         "input-keyboard" if dev and "Teclado" in dev["kind"] else
                         "input-mouse" if dev and "Mouse" in dev["kind"] else
                         "drive-removable-media" if dev and dev["kind"] == "Armazenamento" else
                         "network-wired" if dev and dev["kind"] == "Hub USB" else
                         "usb-creator" if dev else "media-eject")
            top.pack_start(Gtk.Image.new_from_icon_name(icon_name, Gtk.IconSize.DIALOG), False, False, 0)
            right = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
            right.pack_start(label("Porta " + item["slot"], "tile-kind"), False, False, 0)
            right.pack_start(label(dev["kind"] if dev else "Vazia"), False, False, 0)
            top.pack_start(right, True, True, 0)
            card.pack_start(top, False, False, 0)
            if dev:
                card.pack_start(label((dev["vendor"] + " · " + dev["product"])[:95], "tile-sub"), False, False, 0)
                card.pack_start(label(dev["vid_pid"], "tile-sub"), False, False, 0)
            frame.add(card)
            self.flow.add(frame)
        self.flow.show_all()

    def _render_printers(self, data):
        for w in self.printer_list.get_children():
            self.printer_list.remove(w)
        if not data:
            self.printer_list.pack_start(label("Nenhuma fila de impressão configurada. Conecte uma impressora e abra Configurar impressoras.", "enfoque-muted"), False, False, 0)
        for item in data:
            self.printer_list.pack_start(label(item["name"] + " — " + item["state"]), False, False, 0)
        self.printer_list.show_all()

    def _tick(self):
        try:
            devs = ports()
            current = repr(devs)
            if current != self.last_devices:
                self.last_devices = current
                self._render_ports(devs)
            on = sum(bool(d["occupied"]) for d in devs)
            self.port_status.set_text(str(on) + " ocupadas   •   " + str(len(devs) - on) + " vazias   •   " + str(len(devs)) + " portas USB")
            printers = printer_queues()
            now = repr(printers)
            if now != self.last_printers:
                self.last_printers = now
                self._render_printers(printers)
            self.ram_label.set_text("RAM: " + str(read_memory()) + "%")
            nxt = read_cpu()
            if self.cpu_sample and nxt and nxt[0] != self.cpu_sample[0]:
                dt, idle = nxt[0] - self.cpu_sample[0], nxt[1] - self.cpu_sample[1]
                self.cpu_label.set_text("CPU: " + str(round(100 * (dt - idle) / dt)) + "%")
            self.cpu_sample = nxt
        except Exception as error:
            self.port_status.set_text("Falha ao ler dispositivos: " + type(error).__name__)
        return True


if __name__ == "__main__":
    app = EnfoqueHub()
    app.show_all()
    Gtk.main()
