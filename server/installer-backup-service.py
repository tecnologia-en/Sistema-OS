#!/usr/bin/env python3
"""Private, one-time authenticated temporary backup server for Enfoque OS ISO.

Standard-library service behind the intranet HTTPS Nginx reverse proxy.
This endpoint has no relationship to existing PC agents or enrollment.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time

DATA = Path(os.environ.get("ENFOQUE_BACKUP_STORAGE", "/var/lib/enfoque-os-install-backups"))
HOST = os.environ.get("ENFOQUE_BACKUP_HOST", "127.0.0.1")
PORT = int(os.environ.get("ENFOQUE_BACKUP_PORT", "43210"))
MAX_SESSION_BYTES = 45 * 1024 ** 3
MAX_TOTAL_BYTES = 60 * 1024 ** 3
MIN_AVAILABLE_BYTES = 25 * 1024 ** 3
MAX_FILES = 500000
TTL = 7 * 24 * 3600
MAX_JSON = 48 * 1024 ** 2
CHUNK = 1024 * 1024
LOCK = threading.RLock()
SESSION_RX = re.compile(r"^[0-9a-f]{32}$")
HEX_RX = re.compile(r"^[0-9a-f]{64}$")


def ensure_storage():
    for path in (DATA, DATA / "codes", DATA / "sessions"):
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.chmod(0o700)


def atomic_json(path, obj):
    tmp = path.with_name(path.name + "." + secrets.token_hex(8) + ".partial")
    with tmp.open("x", encoding="utf-8") as output:
        json.dump(obj, output, ensure_ascii=False, separators=(",", ":"))
        output.flush()
        os.fsync(output.fileno())
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def valid_path(relative):
    if not isinstance(relative, str) or not relative or len(relative) > 4096:
        return False
    if "\\" in relative or "\x00" in relative or relative.startswith("/"):
        return False
    parts = PurePosixPath(relative).parts
    return (len(parts) >= 2 and parts[0] in
            ("Desktop", "Downloads", "Documentos", "Imagens", "Vídeos", "Músicas")
            and all(part not in (".", "..", "") for part in parts))


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def session_root(session_id):
    if not SESSION_RX.fullmatch(session_id):
        raise ValueError("ID invalido")
    return DATA / "sessions" / session_id


def aggregate_stored_bytes():
    total = 0
    for meta_file in (DATA / "sessions").glob("*/meta.json"):
        try:
            meta = read_json(meta_file)
            total += int(meta.get("expected_bytes", 0))
        except (ValueError, OSError, TypeError):
            pass
    return total


def issue_code():
    ensure_storage()
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(20))
    digest = hashlib.sha256(code.encode("ascii")).hexdigest()
    atomic_json(DATA / "codes" / (digest + ".json"),
                {"expires": int(time.time()) + 7200})
    return "-".join(code[i:i+5] for i in range(0, 20, 5))


def purge_expired():
    now = time.time()
    removed = 0
    for path in (DATA / "codes").glob("*.json"):
        try:
            if read_json(path)["expires"] < now:
                path.unlink()
        except (OSError, ValueError, KeyError):
            continue
    for folder in (DATA / "sessions").iterdir():
        if not SESSION_RX.fullmatch(folder.name) or folder.is_symlink():
            continue
        try:
            if read_json(folder / "meta.json")["expires"] < now:
                shutil.rmtree(folder)
                removed += 1
        except (OSError, KeyError, ValueError):
            continue
    return removed


class ErrorHTTP(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "EnfoqueInstallBackup"
    sys_version = ""

    def log_message(self, fmt, *args):
        # Never emit secret headers, setup codes, user filenames or PII.
        return

    def reply(self, status, payload):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(encoded)
        self.close_connection = True

    def request_json(self, max_bytes=MAX_JSON):
        size = self.content_length(max_bytes)
        try:
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise ErrorHTTP(400, "Corpo incompleto")
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ErrorHTTP(400, "JSON invalido")
            return data
        except (UnicodeError, json.JSONDecodeError):
            raise ErrorHTTP(400, "JSON malformado")

    def content_length(self, max_bytes):
        raw = self.headers.get("Content-Length", "")
        if not raw.isdecimal():
            raise ErrorHTTP(411, "Content-Length obrigatorio")
        size = int(raw)
        if size > max_bytes:
            raise ErrorHTTP(413, "Envio muito grande")
        return size

    def authorize(self, session_id):
        root = session_root(session_id)
        if not root.is_dir() or root.is_symlink():
            raise ErrorHTTP(404, "Sessao nao encontrada")
        try:
            meta = read_json(root / "meta.json")
        except (OSError, json.JSONDecodeError):
            raise ErrorHTTP(404, "Sessao nao encontrada")
        token = self.headers.get("Authorization", "")
        if not token.startswith("Bearer "):
            raise ErrorHTTP(401, "Autenticacao obrigatoria")
        token_hash = hashlib.sha256(token[7:].encode("utf-8")).hexdigest()
        if not hmac.compare_digest(token_hash, meta["token_hash"]):
            raise ErrorHTTP(403, "Autenticacao invalida")
        if meta["expires"] < time.time():
            raise ErrorHTTP(410, "Sessao expirada")
        return root, meta

    def create_session(self):
        setup = self.headers.get("X-Enfoque-Setup-Code", "")
        code = re.sub(r"[\s-]", "", setup).upper()
        if not re.fullmatch(r"[A-Z2-9]{20}", code):
            raise ErrorHTTP(401, "Codigo temporario necessario")
        body = self.request_json(4096)
        files = body.get("file_count")
        total = body.get("total_bytes")
        if (type(files) is not int or not 0 < files <= MAX_FILES or
                type(total) is not int or not 0 <= total <= MAX_SESSION_BYTES):
            raise ErrorHTTP(422, "Inventario invalido ou excede limite")
        digest = hashlib.sha256(code.encode("ascii")).hexdigest()
        code_path = DATA / "codes" / (digest + ".json")
        with LOCK:
            try:
                code_meta = read_json(code_path)
            except (OSError, ValueError):
                raise ErrorHTTP(401, "Codigo nao autorizado")
            if code_meta["expires"] < time.time():
                code_path.unlink(missing_ok=True)
                raise ErrorHTTP(401, "Codigo expirado")
            disk = shutil.disk_usage(DATA)
            if disk.free - total < MIN_AVAILABLE_BYTES:
                raise ErrorHTTP(507, "VPS sem margem de armazenamento")
            if aggregate_stored_bytes() + total > MAX_TOTAL_BYTES:
                raise ErrorHTTP(507, "Cota temporaria de backups atingida")
            code_path.unlink()
            session_id = secrets.token_hex(16)
            token = secrets.token_urlsafe(40)
            root = session_root(session_id)
            root.mkdir(mode=0o700)
            (root / "files").mkdir(mode=0o700)
            now = int(time.time())
            atomic_json(root / "meta.json", {
                "token_hash": hashlib.sha256(token.encode()).hexdigest(),
                "created": now, "expires": now + TTL,
                "file_count": files, "expected_bytes": total,
                "status": "uploading",
            })
        self.reply(201, {"session_id": session_id,
                         "token": token, "expires": now + TTL})

    def put_file(self, session_id, index):
        with LOCK:
            root, meta = self.authorize(session_id)
            if meta["status"] != "uploading":
                raise ErrorHTTP(409, "Sessao nao aceita mais arquivos")
            idx = int(index)
            if idx < 0 or idx >= meta["file_count"]:
                raise ErrorHTTP(400, "Indice de arquivo invalido")
            size = self.content_length(MAX_SESSION_BYTES)
            expected = self.headers.get("X-File-SHA256", "").lower()
            if not HEX_RX.fullmatch(expected):
                raise ErrorHTTP(400, "SHA256 ausente")
            name = f"{idx:08d}"
            dest = root / "files" / name
            if dest.exists():
                if dest.stat().st_size == size and sha256(dest) == expected:
                    # Replays are idempotent.
                    remaining = size
                    while remaining:
                        block = self.rfile.read(min(CHUNK, remaining))
                        if not block:
                            raise ErrorHTTP(400, "Reenvio incompleto")
                        remaining -= len(block)
                    self.reply(200, {"ok": True, "sha256": expected})
                    return
                raise ErrorHTTP(409, "Arquivo existente divergente")
            uploaded = sum(f.stat().st_size for f in (root / "files").iterdir()
                           if f.is_file() and not f.name.endswith(".partial"))
            if uploaded + size > meta["expected_bytes"]:
                raise ErrorHTTP(413, "Arquivo excede inventario")
            if shutil.disk_usage(DATA).free - size < MIN_AVAILABLE_BYTES:
                raise ErrorHTTP(507, "Armazenamento temporario insuficiente")
            partial = root / "files" / (name + ".partial")
            h = hashlib.sha256()
            try:
                with partial.open("wb") as stream:
                    remaining = size
                    while remaining:
                        block = self.rfile.read(min(CHUNK, remaining))
                        if not block:
                            raise ErrorHTTP(400, "Upload interrompido")
                        stream.write(block)
                        h.update(block)
                        remaining -= len(block)
                    stream.flush()
                    os.fsync(stream.fileno())
                if h.hexdigest() != expected:
                    raise ErrorHTTP(422, "Falha de integridade SHA256")
                os.replace(partial, dest)
            except (OSError, ErrorHTTP):
                partial.unlink(missing_ok=True)
                raise
        self.reply(201, {"ok": True, "sha256": expected})

    def finalize(self, session_id):
        body = self.request_json()
        entries = body.get("files")
        if not isinstance(entries, list):
            raise ErrorHTTP(422, "Manifesto invalido")
        with LOCK:
            root, meta = self.authorize(session_id)
            if meta["status"] not in ("uploading", "ready"):
                raise ErrorHTTP(409, "Sessao nao pode finalizar")
            if len(entries) != meta["file_count"]:
                raise ErrorHTTP(422, "Quantidade de arquivos divergente")
            used_paths = set()
            total = 0
            for i, entry in enumerate(entries):
                if not isinstance(entry, dict):
                    raise ErrorHTTP(422, "Item do manifesto invalido")
                name, size, digest = entry.get("path"), entry.get("size"), entry.get("sha256")
                if (not valid_path(name) or type(size) is not int or size < 0
                        or not isinstance(digest, str)
                        or not HEX_RX.fullmatch(digest.lower())):
                    raise ErrorHTTP(422, "Entrada de backup invalida")
                if name.casefold() in used_paths:
                    raise ErrorHTTP(422, "Caminho repetido")
                used_paths.add(name.casefold())
                source = root / "files" / f"{i:08d}"
                if (not source.is_file() or source.is_symlink() or
                        source.stat().st_size != size or sha256(source) != digest):
                    raise ErrorHTTP(422, "Copia ausente ou corrompida")
                total += size
            if total != meta["expected_bytes"]:
                raise ErrorHTTP(422, "Soma de bytes divergente")
            manifest = {"format": 1, "files": entries,
                        "total_bytes": total}
            atomic_json(root / "manifest.json", manifest)
            meta["status"] = "ready"
            atomic_json(root / "meta.json", meta)
        self.reply(200, {"ok": True, "files": len(entries), "total_bytes": total})

    def get_manifest(self, session_id):
        with LOCK:
            root, meta = self.authorize(session_id)
            if meta["status"] != "ready":
                raise ErrorHTTP(409, "Copia ainda nao verificada")
            manifest = (root / "manifest.json").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(manifest)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(manifest)
        self.close_connection = True

    def get_file(self, session_id, index):
        with LOCK:
            root, meta = self.authorize(session_id)
            if meta["status"] != "ready":
                raise ErrorHTTP(409, "Backup ainda nao validado")
            idx = int(index)
            if idx < 0 or idx >= meta["file_count"]:
                raise ErrorHTTP(404, "Indice invalido")
            f = root / "files" / f"{idx:08d}"
            if not f.is_file() or f.is_symlink():
                raise ErrorHTTP(404, "Arquivo ausente")
            length = f.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        with f.open("rb") as stream:
            for chunk in iter(lambda: stream.read(CHUNK), b""):
                self.wfile.write(chunk)
        self.close_connection = True

    def complete(self, session_id):
        with LOCK:
            root, meta = self.authorize(session_id)
            if meta["status"] != "ready":
                raise ErrorHTTP(409, "Backup nao confirmado")
            # Caller signals installed boot and locally verified restoration.
            shutil.rmtree(root)
        self.reply(200, {"deleted": True})

    def dispatch(self, method):
        path = urlsplit(self.path).path
        if path == "/v1/health" and method == "GET":
            return self.reply(200, {"ok": True})
        if path == "/v1/sessions" and method == "POST":
            return self.create_session()
        match = re.fullmatch(r"/v1/sessions/([0-9a-f]{32})(?:/(.+))?", path)
        if not match:
            raise ErrorHTTP(404, "Endpoint inexistente")
        session_id, item = match.groups()
        if method == "PUT" and item and re.fullmatch(r"files/[0-9]+", item):
            return self.put_file(session_id, item.split("/")[-1])
        if method == "POST" and item == "finalize":
            return self.finalize(session_id)
        if method == "POST" and item == "complete":
            return self.complete(session_id)
        if method == "GET" and item == "manifest":
            return self.get_manifest(session_id)
        if method == "GET" and item and re.fullmatch(r"files/[0-9]+", item):
            return self.get_file(session_id, item.split("/")[-1])
        raise ErrorHTTP(404, "Endpoint inexistente")

    def do_GET(self):
        self.handle_method("GET")

    def do_POST(self):
        self.handle_method("POST")

    def do_PUT(self):
        self.handle_method("PUT")

    def handle_method(self, method):
        try:
            self.dispatch(method)
        except ErrorHTTP as error:
            self.reply(error.status, {"error": error.message})
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            self.reply(500, {"error": "Falha interna de transferencia"})


def main():
    ensure_storage()
    if len(sys.argv) > 1 and sys.argv[1] == "issue":
        print(issue_code())
        return
    if len(sys.argv) > 1 and sys.argv[1] == "purge":
        print("removed_sessions", purge_expired())
        return
    if len(sys.argv) > 1 and sys.argv[1] == "list":
        for folder in sorted((DATA / "sessions").iterdir()):
            if SESSION_RX.fullmatch(folder.name):
                try:
                    m = read_json(folder / "meta.json")
                    print(folder.name, m["status"], m["expected_bytes"],
                          datetime.fromtimestamp(m["expires"], timezone.utc).isoformat())
                except (OSError, ValueError, KeyError):
                    pass
        return
    os.umask(0o077)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
