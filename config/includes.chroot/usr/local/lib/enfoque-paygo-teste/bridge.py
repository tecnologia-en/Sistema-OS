#!/usr/bin/env python3
"""Local PayGo DEMO broker. Credentials never leave the dedicated TEF account."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import threading
import time
from datetime import datetime, timezone
import urllib.parse
import urllib.request
import urllib.error
import uuid

SOCKET = Path("/run/enfoque-paygo-teste/bridge.sock")
PREFIX = Path("/var/lib/paygo-tef/runtime")
DB = PREFIX / "drive_c/ProgramData/PayGo/Data/PayGo.db"
LEDGER = Path("/var/lib/paygo-tef/test-payment-state.json")
AUTH_HASH = "b81e204c757a6c385e18323cae863dbca68e58a9dbfb359ef3c79ce031784f6c"
BASE = "https://sandbox.controlpay.com.br/webapi"
IN_FLIGHT = {"REQUESTED", "PROCESSING", "UNCERTAIN"}
FINAL = {10: "APROVADA", 15: "EXPIRADA", 20: "CANCELADA", 25: "RECUSADA"}
MUTEX = threading.Lock()
FAILED = {}

def authorized(password, uid):
    now = time.monotonic()
    prior = FAILED.get(uid, (0, 0))
    if prior[0] >= 5 and now - prior[1] < 120:
        return False
    digest = hashlib.sha256(str(password).encode("utf-8")).hexdigest()
    valid = hmac.compare_digest(digest, AUTH_HASH)
    FAILED[uid] = (0, now) if valid else (prior[0] + 1, now)
    return valid

def profile():
    if not (PREFIX / "drive_c/Program Files/PayGo/PayGo.exe").is_file():
        raise RuntimeError("PayGo nao provisionado neste computador")
    if not DB.is_file():
        raise RuntimeError("Ativacao PayGo ausente")
    with sqlite3.connect("file:" + str(DB) + "?mode=ro", uri=True, timeout=5) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("Banco PayGo com integridade incorreta")
        def setting(key):
            r = db.execute("SELECT PAR_Valor FROM PAY_Parametro WHERE PAR_Nome=?", (key,)).fetchone()
            return r[0] if r else ""
        row = db.execute("SELECT TER_Id,TER_PES_Id,TER_TERF_Id FROM PAY_Terminal LIMIT 1").fetchone()
        if not row or not all(row):
            raise RuntimeError("Terminal PayGo nao ativado")
        key_row = db.execute("SELECT PES_Key FROM PAY_Pessoa WHERE PES_Id=?", (int(row[1]),)).fetchone()
        if not key_row or not key_row[0]:
            raise RuntimeError("Chave da integracao nao configurada")
        if (setting("ControlPayAmbiente"), setting("PinpadAtivo"),
                setting("TerminalFisicoAtivo"), setting("PortaPinPad")) != ("Demonstracao", "True", "True", "8"):
            raise RuntimeError("Apenas DEMONSTRACAO e COM8 habilitadas para esta ferramenta")
        return {"terminal": int(row[0]), "physical": int(row[2]),
                "key": urllib.parse.unquote(key_row[0])}

def verify_device():
    # Reuse the existing strict PIN-pad check (sysfs vendor/product must
    # belong to the same ACM device actually mapped as Wine COM8).
    health = subprocess.run(["/usr/local/bin/enfoque-paygo-tef-health", "--quiet"],
                            capture_output=True, text=True, timeout=12)
    if health.returncode != 0:
        raise RuntimeError("Integridade TEF/PIN-pad recusada; envio bloqueado")
    com = PREFIX / "dosdevices/com8"
    if not com.is_symlink() or not os.path.realpath(com).startswith("/dev/ttyACM"):
        raise RuntimeError("COM8 ainda nao esta vinculada ao PIN-pad")
    if not os.access(os.path.realpath(com), os.R_OK | os.W_OK):
        raise RuntimeError("PIN-pad sem permissoes de leitura/escrita")
    usb = subprocess.run(["lsusb"], capture_output=True, text=True, timeout=5)
    if "1753:c902" not in usb.stdout.lower():
        raise RuntimeError("GERTEC PPC930 nao encontrada no USB")
    tasks = subprocess.run(["pgrep", "-af", "/PayGo/PayGo.exe"],
                           capture_output=True, text=True, timeout=5).stdout
    if "PayGo.exe" not in tasks or str(PREFIX) not in tasks:
        raise RuntimeError("Servico PayGo nao esta em execucao")

def request(endpoint, key, method="GET", payload=None, timeout=30):
    url = BASE + "/" + endpoint.lstrip("/") + ("&" if "?" in endpoint else "?") + urllib.parse.urlencode({"key": key})
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json",
                                          "Accept": "application/json",
                                          "User-Agent": "Enfoque-OS-PayGo-Demo/0.3"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.loads(response.read(250000))
    except urllib.error.HTTPError as error:
        return error.code, {}

def sanitized(data):
    value = data.get("intencaoVenda", data)
    if not isinstance(value, dict):
        raise RuntimeError("Resposta inesperada do ControlPay")
    status = value.get("intencaoVendaStatus") or {}
    terminal = value.get("terminal") or {}
    return {"id": value.get("id"), "status": status.get("id"),
            "terminal": terminal.get("id"), "reference": value.get("referencia")}

def ledger():
    try:
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}

def store(state):
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    temporary = LEDGER.with_suffix(".tmp")
    fd = os.open(temporary, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        json.dump(state, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(temporary, LEDGER)

def current_id_state(current, cfg):
    sale_id = current.get("id")
    if not isinstance(sale_id, int):
        return current
    http, raw = request("IntencaoVenda/GetById/?intencaoVendaId=" + str(sale_id), cfg["key"])
    if http != 200:
        return current
    result = sanitized(raw)
    if result["id"] != sale_id or result["reference"] != current.get("reference"):
        return current
    status = result.get("status")
    if status not in FINAL:
        return current
    # API GetById often omits terminal. Independently reconcile by ID+terminal.
    http2, listing = request("IntencaoVenda/GetByFiltros/", cfg["key"], "POST",
                             {"terminalId": str(cfg["terminal"]), "intencaoVendaId": str(sale_id)})
    if http2 != 200:
        return current
    for raw_item in listing.get("intencoesVendas", []):
        item = sanitized(raw_item)
        if (item["id"] == sale_id and str(item["terminal"]) == str(cfg["terminal"])
                and item["reference"] == current["reference"] and item["status"] == status):
            current["state"] = FINAL[status]
            current["status"] = status
            store(current)
            return current
    return current

def status():
    cfg = profile()
    verify_device()
    info = ledger()
    if info.get("state") in IN_FLIGHT:
        try:
            info = current_id_state(info, cfg)
        except (OSError, ValueError, RuntimeError, urllib.error.URLError):
            pass
    return {"ready": True, "terminal": cfg["terminal"], "mode": "Demonstracao",
            "last": {k: v for k, v in info.items() if k in ("id", "state", "method", "cents", "reference")}}

def sale(method, amount):
    if method not in ("credit", "debit") or not isinstance(amount, int) or not 1 <= amount <= 99999999:
        raise ValueError("Metodo ou valor em centavos invalido")
    cfg = profile()
    verify_device()
    previous = ledger()
    if previous.get("state") in IN_FLIGHT:
        previous = current_id_state(previous, cfg)
    if previous.get("state") in IN_FLIGHT:
        raise RuntimeError("Existe venda pendente ou incerta. Nao e permitido reenviar.")
    # Check current remote queue without relying on unreliable date filters.
    for status_id in (5, 6, 18, 19):
        code, out = request("IntencaoVenda/GetByFiltros/", cfg["key"], "POST",
                            {"terminalId": str(cfg["terminal"]), "statusId": status_id}, 20)
        if code != 200 or not isinstance(out, dict):
            raise RuntimeError("Fila remota nao verificada. Envio bloqueado.")
        for row in out.get("intencoesVendas", []):
            item = sanitized(row)
            if str(item["terminal"]) == str(cfg["terminal"]) and item["status"] in (5, 6, 18, 19):
                raise RuntimeError("Ha pagamento pendente no terminal. Envio bloqueado.")
    ref = "EOS-DEMO-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
    entry = {"state": "REQUESTED", "reference": ref, "terminal": cfg["terminal"],
             "cents": amount, "method": method, "createdAt": datetime.now(timezone.utc).isoformat()}
    store(entry)
    body = {"formaPagamentoId": 21 if method == "credit" else 22, "pedidoId": None,
            "terminalId": str(cfg["terminal"]), "referencia": ref,
            "observacao": "Enfoque OS - homologacao " + ref,
            "aguardarTefIniciarTransacao": True, "parcelamentoAdmin": True,
            "quantidadeParcelas": 1, "valorTotalVendido": f"{amount//100},{amount%100:02d}"}
    try:
        code, response = request("Venda/Vender/", cfg["key"], "POST", body, 45)
    except (OSError, ValueError, urllib.error.URLError):
        entry["state"] = "UNCERTAIN"
        store(entry)
        raise RuntimeError("Resposta incerta do provedor. Nao enviar novamente.")
    if not 200 <= code < 300:
        entry["state"] = "UNCERTAIN"
        store(entry)
        raise RuntimeError("ControlPay nao confirmou envio. Reconciliar antes de repetir.")
    result = sanitized(response)
    if not isinstance(result["id"], int) or result["reference"] != ref:
        entry["state"] = "UNCERTAIN"
        store(entry)
        raise RuntimeError("Intencao sem identificador seguro. Consultar antes de repetir.")
    entry.update(id=result["id"], state="PROCESSING")
    store(entry)
    return {"id": entry["id"], "state": entry["state"], "terminal": cfg["terminal"]}

def handle(sock):
    sock.settimeout(60)
    try:
        raw = bytearray()
        while len(raw) < 4096 and not raw.endswith(b"\n"):
            block = sock.recv(4096 - len(raw))
            if not block:
                break
            raw.extend(block)
        request_obj = json.loads(raw.decode("utf-8"))
        import struct
        uid = struct.unpack("3i", sock.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]
        if not authorized(request_obj.get("password", ""), uid):
            response = {"ok": False, "error": "Senha invalida ou bloqueio temporario"}
        elif request_obj.get("action") == "status":
            with MUTEX:
                response = {"ok": True, **status()}
        elif request_obj.get("action") == "sale":
            with MUTEX:
                response = {"ok": True, **sale(request_obj.get("method"), request_obj.get("amount_cents"))}
        else:
            response = {"ok": False, "error": "Acao nao autorizada"}
    except (OSError, ValueError, KeyError, RuntimeError, sqlite3.Error, urllib.error.URLError) as error:
        response = {"ok": False, "error": str(error)[:170]}
    try:
        sock.sendall((json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8"))
    except OSError:
        pass
    sock.close()

def main():
    SOCKET.parent.mkdir(parents=True, exist_ok=True)
    if SOCKET.exists():
        SOCKET.unlink()
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(SOCKET))
    os.chmod(SOCKET, 0o666)  # Only local users can connect; DEMO/password/lockout enforced.
    server.listen(8)
    while True:
        conn, _ = server.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()

if __name__ == "__main__":
    main()
