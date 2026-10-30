#!/usr/bin/env python3
"""PayGo temporary-test UI, now shipped in ISO. DEMO-only, never stores TEF keys."""
import hashlib
import hmac
import json
import re
import socket
import sys
import threading
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib

SOCKET = "/run/enfoque-paygo-teste/bridge.sock"
HASH = "b81e204c757a6c385e18323cae863dbca68e58a9dbfb359ef3c79ce031784f6c"
CSS = b"""
window {background: #111923; color: #f5f8fc}
#content {background: #111923}
label {color: #e8effa}
.muted {color: #a6b6cb}
.small {font-size: 12px}
.heading {font-size: 29px; font-weight: bold}
.value {background: #1e2b3b; color: white; font-size: 29px;
        border: 0; border-radius: 12px; padding: 15px}
.choice {background: #1e2b3b; color: white; font-size: 20px; font-weight: bold;
         border: 1px solid #4a6079; border-radius: 14px; padding: 27px}
.choice:checked {background: #407baf; color: white}
.choice:hover {background: #345474}
.submit {background: #4dcab6; color: #10212b; font-size: 17px;
         font-weight: bold; border-radius: 13px; padding: 17px; border: 0}
.submit:disabled {background: #597c7a; color: #b3c5c4}
.status {color: #f3a878; font-size: 13px}
.pill {background: #1d2b3d; color: #50d1b5; border-radius: 9px; padding: 12px}
"""
def valid_password(value):
    return hmac.compare_digest(hashlib.sha256(value.encode("utf-8")).hexdigest(), HASH)

def cents(text):
    val = text.strip().replace("R$", "").replace(" ", "")
    if "," in val:
        val = val.replace(".", "").replace(",", ".")
    if not re.fullmatch(r"\d+(?:\.\d{1,2})?", val):
        raise ValueError("Digite um valor como 1,00 ou 165,90.")
    try:
        amount = int((Decimal(val) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError) as error:
        raise ValueError("Valor invalido.") from error
    if not 1 <= amount <= 99999999:
        raise ValueError("O valor deve ficar entre R$ 0,01 e R$ 999.999,99.")
    return amount

def currency(amount):
    return "R$ " + f"{amount//100:,}".replace(",", ".") + f",{amount%100:02d}"

def backend(payload, timeout=110):
    wire = (json.dumps(payload) + "\n").encode("utf-8")
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        client.settimeout(timeout)
        client.connect(SOCKET)
        client.sendall(wire)
        data = bytearray()
        while len(data) < 10000:
            block = client.recv(10000 - len(data))
            if not block:
                break
            data.extend(block)
            if data.endswith(b"\n"):
                break
        if not data.endswith(b"\n"):
            raise RuntimeError("Sem resposta do serviço PayGo")
        reply = json.loads(data.decode("utf-8"))
        if not reply.get("ok"):
            raise RuntimeError(reply.get("error", "PayGo indisponivel"))
        return reply
    finally:
        client.close()

def label(text, klass=""):
    x = Gtk.Label(label=text)
    x.set_xalign(0)
    if klass:
        x.get_style_context().add_class(klass)
    return x

def unlock():
    dlg = Gtk.Dialog(title="Acesso restrito - Teste PayGo", flags=0)
    dlg.set_position(Gtk.WindowPosition.CENTER)
    dlg.set_default_size(390, 185)
    dlg.set_skip_taskbar_hint(True)
    dlg.add_button("Cancelar", Gtk.ResponseType.CANCEL)
    dlg.add_button("Abrir", Gtk.ResponseType.OK)
    box = dlg.get_content_area()
    box.set_border_width(18)
    box.set_spacing(12)
    box.pack_start(label("Digite a senha para abrir o Teste PayGo"), False, False, 0)
    entry = Gtk.Entry()
    entry.set_visibility(False)
    entry.set_placeholder_text("Senha de acesso")
    entry.set_activates_default(True)
    dlg.set_default_response(Gtk.ResponseType.OK)
    box.pack_start(entry, False, False, 0)
    notice = label("Uso interno. Nao substitui a ativacao TEF.", "muted")
    box.pack_start(notice, False, False, 0)
    dlg.show_all()
    entry.grab_focus()
    for attempt in range(5):
        if dlg.run() != Gtk.ResponseType.OK:
            dlg.destroy()
            return None
        password = entry.get_text()
        if valid_password(password):
            dlg.destroy()
            return password
        entry.set_text("")
        notice.set_text(f"Senha incorreta ({attempt+1}/5).")
    dlg.destroy()
    return None

class PaymentWindow(Gtk.Window):
    def __init__(self, password):
        super().__init__(title="Teste PayGo")
        self.password = password
        self.set_default_size(820, 600)
        self.set_position(Gtk.WindowPosition.CENTER)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.connect("destroy", Gtk.main_quit)
        self.connect("key-press-event", self.keypress)
        self.busy = False
        self.ready = False
        self.selection = None
        self.last = {}
        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=17)
        root.set_name("content")
        root.set_border_width(35)
        self.add(root)
        top = Gtk.Box(spacing=10)
        top.pack_start(label("PAGAMENTO", "heading"), True, True, 0)
        chip = label("PAYGO  •  DEMONSTRACAO", "pill")
        chip.set_xalign(1)
        top.pack_end(chip, False, False, 0)
        root.pack_start(top, False, False, 0)
        root.pack_start(label("Escolha a forma de pagamento", "muted"), False, False, 8)
        choices = Gtk.Box(spacing=18)
        self.credit = Gtk.ToggleButton(label="CREDITO")
        self.debit = Gtk.ToggleButton(label="DEBITO")
        for btn, method in ((self.credit, "credit"), (self.debit, "debit")):
            btn.get_style_context().add_class("choice")
            btn.connect("toggled", self.choose, method)
            choices.pack_start(btn, True, True, 0)
        root.pack_start(choices, False, False, 2)
        root.pack_start(label("Valor da venda", "muted"), False, False, 1)
        self.amount = Gtk.Entry()
        self.amount.set_text("1,00")
        self.amount.set_input_purpose(Gtk.InputPurpose.NUMBER)
        self.amount.get_style_context().add_class("value")
        self.amount.connect("activate", lambda *_: self.send_sale())
        root.pack_start(self.amount, False, False, 0)
        self.send = Gtk.Button(label="ENVIAR PARA A MAQUININHA")
        self.send.get_style_context().add_class("submit")
        self.send.connect("clicked", lambda *_: self.send_sale())
        root.pack_start(self.send, False, False, 0)
        self.status = label("Conectando ao PayGo instalado neste computador...", "status")
        self.status.set_line_wrap(True)
        root.pack_start(self.status, True, True, 0)
        self.footer = label("Somente DEMO  •  Ativacao individual por PC  •  F11: tela cheia  •  ESC: sair", "muted")
        root.pack_end(self.footer, False, False, 0)
        GLib.timeout_add_seconds(5, self.refresh)
        self.refresh()
        self.amount.grab_focus()

    def keypress(self, _widget, event):
        key = Gdk.keyval_name(event.keyval)
        if key == "F11":
            self.unfullscreen() if self.get_window().get_state() & Gdk.WindowState.FULLSCREEN else self.fullscreen()
            return True
        if key == "Escape":
            self.close()
            return True
        return False

    def choose(self, button, method):
        if not button.get_active():
            if self.selection == method:
                self.selection = None
            return
        self.selection = method
        other = self.debit if method == "credit" else self.credit
        if other.get_active():
            other.set_active(False)

    def show_status(self, msg, good=None):
        self.status.set_text(msg)
        color = "#53d1a5" if good else "#ff8585" if good is False else "#f3a878"
        self.status.override_color(Gtk.StateFlags.NORMAL, Gdk.RGBA(*hex_color(color)))

    def run_thread(self, work, finish):
        def job():
            try:
                result = work()
                GLib.idle_add(finish, result, None)
            except Exception as err:
                GLib.idle_add(finish, None, str(err)[:210])
        threading.Thread(target=job, daemon=True).start()

    def refresh(self):
        if self.busy:
            return True
        self.run_thread(lambda: backend({"action": "status", "password": self.password}, timeout=30),
                        self.got_status)
        return True

    def got_status(self, result, error):
        if self.busy:
            return False
        self.ready = error is None and result.get("ready", False)
        if error:
            self.show_status("PayGo nao pronto: " + error, False)
        else:
            self.last = result.get("last") or {}
            state = self.last.get("state")
            self.footer.set_text(f"Sandbox • Terminal {result.get('terminal')} • F11: tela cheia • ESC: sair")
            if state in ("REQUESTED", "PROCESSING", "UNCERTAIN"):
                self.show_status("Venda anterior pendente/incerta. Consulte o PayGo antes de tentar outra.", False)
            elif state in ("APROVADA", "RECUSADA", "EXPIRADA", "CANCELADA"):
                self.show_status(f"Ultima operacao #{self.last.get('id')}: {state}", state == "APROVADA")
            else:
                self.show_status("PayGo DEMO conectado. Selecione credito ou debito.", True)
        return False

    def send_sale(self):
        if self.busy:
            return
        if not self.selection:
            self.show_status("Primeiro selecione credito ou debito.", False)
            return
        try:
            amount = cents(self.amount.get_text())
        except ValueError as err:
            self.show_status(str(err), False)
            return
        if not self.ready or self.last.get("state") in ("REQUESTED", "PROCESSING", "UNCERTAIN"):
            self.show_status("Envio bloqueado: PayGo offline ou venda anterior nao conciliada.", False)
            return
        method = self.selection
        confirm = Gtk.MessageDialog(transient_for=self, flags=0,
                                    message_type=Gtk.MessageType.QUESTION,
                                    buttons=Gtk.ButtonsType.YES_NO,
                                    text=f"Enviar {currency(amount)} no {'CREDITO' if method=='credit' else 'DEBITO'}?")
        confirm.format_secondary_text("Ambiente demonstracao. Confirme apenas uma vez; timeout nao e cancelamento.")
        approved = confirm.run() == Gtk.ResponseType.YES
        confirm.destroy()
        if not approved:
            return
        self.busy = True
        self.send.set_sensitive(False)
        self.show_status("Enviando ao terminal... nao repita o comando.")
        self.run_thread(lambda: backend({"action": "sale", "method": method,
                                         "amount_cents": amount, "password": self.password}, timeout=140),
                        self.sent)

    def sent(self, response, error):
        self.busy = False
        self.send.set_sensitive(True)
        if error:
            self.show_status("Nao confirmado: " + error + " Nao repita sem conciliar.", False)
        else:
            self.last = {"id": response["id"], "state": "PROCESSING"}
            self.show_status(f"Solicitacao #{response['id']} enviada. Aguarde o resultado na maquininha.")
        self.refresh()
        return False

def hex_color(value):
    h = value.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1,)

def main():
    if "--selftest" in sys.argv:
        assert valid_password("infante") and not valid_password("Infante")
        assert cents("165,90") == 16590 and cents("1.234,56") == 123456
        assert currency(100) == "R$ 1,00"
        print("PAYGO_UI_SELFTEST_OK")
        return 0
    css = Gtk.CssProvider()
    css.load_from_data(CSS)
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), css,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    password = unlock()
    if password is None:
        return 0
    app = PaymentWindow(password)
    app.show_all()
    Gtk.main()
    return 0

if __name__ == "__main__":
    sys.exit(main())
