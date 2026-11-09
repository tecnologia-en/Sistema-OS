"""Stream installation backups over HTTPS, never storing a second local copy.

All files are hashed and verified in both directions. No server credentials
or permanent enrollment tokens are embedded in the bootable ISO.
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import ssl
import stat
import time
from urllib.parse import urlsplit

CHUNK = 1024 * 1024
DEFAULT_URL = "https://intranet.enfoquepapelaria.com.br/enfoque-os-install-backup"
ROOT_DIRS = ("Desktop", "Downloads", "Documentos", "Imagens", "Vídeos", "Músicas")
MAX_JSON = 48 * 1024 ** 2
HEX_RE = re.compile(r"^[0-9a-f]{64}$")


class BackupTransferError(RuntimeError):
    pass


def digest_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as fp:
        for block in iter(lambda: fp.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def valid_relative(name):
    if (not isinstance(name, str) or not name or len(name) > 4096 or
            name.startswith("/") or "\\" in name or "\x00" in name):
        return False
    parts = name.split("/")
    return len(parts) >= 2 and parts[0] in ROOT_DIRS and all(
        x and x not in (".", "..") for x in parts)


class Client:
    def __init__(self, base_url=DEFAULT_URL, session_id=None, token=None):
        self.url = urlsplit(base_url.rstrip("/"))
        if self.url.scheme != "https":
            if (self.url.scheme != "http" or
                    self.url.hostname not in ("127.0.0.1", "localhost") or
                    os.environ.get("ENFOQUE_TEST_HTTP_LOCAL") != "1"):
                raise BackupTransferError("O servidor precisa de HTTPS valido.")
        if not self.url.hostname or self.url.username or self.url.password:
            raise BackupTransferError("Endereco do servidor de backup invalido.")
        # The server is mounted below a fixed HTTPS path.
        self.base_path = self.url.path.rstrip("/")
        self.session_id = session_id
        self.token = token

    def _request(self, method, endpoint, *, body=None, size=None, stream=None, headers=None):
        url_path = self.base_path + endpoint
        class_ = http.client.HTTPSConnection if self.url.scheme == "https" else http.client.HTTPConnection
        conn = class_(self.url.hostname, self.url.port,
                      timeout=900, context=ssl.create_default_context()) if self.url.scheme == "https" \
               else class_(self.url.hostname, self.url.port, timeout=900)
        req_headers = {"Accept": "application/json",
                       "Cache-Control": "no-store"}
        if self.token:
            req_headers["Authorization"] = "Bearer " + self.token
        if headers:
            req_headers.update(headers)
        if stream is not None:
            if size is None:
                raise BackupTransferError("Tamanho do arquivo desconhecido.")
            req_headers["Content-Length"] = str(size)
            req_headers["Content-Type"] = "application/octet-stream"
        else:
            body = body or b""
            req_headers["Content-Length"] = str(len(body))
            req_headers["Content-Type"] = "application/json"
        try:
            conn.putrequest(method, url_path)
            for key, value in req_headers.items():
                conn.putheader(key, str(value))
            conn.endheaders()
            if stream is None:
                if body:
                    conn.send(body)
            else:
                with Path(stream).open("rb") as file:
                    while block := file.read(CHUNK):
                        conn.send(block)
            response = conn.getresponse()
            if response.status >= 400:
                sample = response.read(1500).decode("utf-8", "replace")
                raise BackupTransferError(
                    f"Servidor recusou transferencia ({response.status}): {sample[:260]}")
            return conn, response
        except (OSError, http.client.HTTPException, TimeoutError) as exc:
            conn.close()
            raise BackupTransferError("Falha na conexao segura com o servidor.") from exc

    def json(self, method, endpoint, payload=None, headers=None):
        encoded = (b"" if method == "GET" else
                   json.dumps(payload or {}, ensure_ascii=False,
                              separators=(",", ":")).encode("utf-8"))
        if len(encoded) > MAX_JSON:
            raise BackupTransferError("Inventario de arquivos muito grande.")
        conn, response = self._request(method, endpoint, body=encoded, headers=headers)
        try:
            data = response.read(MAX_JSON + 1)
            if len(data) > MAX_JSON:
                raise BackupTransferError("Resposta do servidor muito grande.")
            return json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise BackupTransferError("Resposta de backup invalida.") from exc
        finally:
            conn.close()

    def create_session(self, setup_code, count, size):
        obj = self.json("POST", "/v1/sessions",
                        {"file_count": count, "total_bytes": size},
                        {"X-Enfoque-Setup-Code": setup_code})
        self.session_id = obj["session_id"]
        self.token = obj["token"]
        return obj

    def upload_file(self, index, file):
        path = Path(file.original)
        if not path.is_file() or path.is_symlink():
            raise BackupTransferError("Arquivo de origem indisponivel.")
        if path.stat().st_size != file.size:
            raise BackupTransferError("Arquivo de origem mudou de tamanho.")
        digest = digest_file(path)
        endpoint = f"/v1/sessions/{self.session_id}/files/{index}"
        for attempt in range(3):
            try:
                conn, response = self._request(
                    "PUT", endpoint, size=file.size, stream=path,
                    headers={"X-File-SHA256": digest})
                response.read()
                conn.close()
                return {"path": file.relative.as_posix(), "size": file.size,
                        "sha256": digest,
                        "mode": stat.S_IMODE(path.stat().st_mode),
                        "mtime": int(path.stat().st_mtime)}
            except BackupTransferError:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        raise BackupTransferError("Upload nao confirmado.")

    def finalize(self, entries):
        output = self.json("POST", f"/v1/sessions/{self.session_id}/finalize",
                           {"files": entries})
        if not output.get("ok") or output.get("files") != len(entries):
            raise BackupTransferError("Backup nao confirmado pelo servidor.")
        saved = self.get_manifest()
        if saved.get("files") != entries:
            raise BackupTransferError("Manifesto retornou diferente do enviado.")
        return saved

    def get_manifest(self):
        return self.json("GET", f"/v1/sessions/{self.session_id}/manifest")

    def fetch_to(self, index, temp_path, expected_size, expected_sha):
        """Stream a verified file to the new installed system on disk."""
        url = f"/v1/sessions/{self.session_id}/files/{index}"
        conn, response = self._request("GET", url)
        count = 0
        h = hashlib.sha256()
        try:
            with Path(temp_path).open("xb") as output:
                while True:
                    block = response.read(CHUNK)
                    if not block:
                        break
                    count += len(block)
                    if count > expected_size:
                        raise BackupTransferError("Download maior que o esperado.")
                    output.write(block)
                    h.update(block)
                output.flush()
                os.fsync(output.fileno())
            if count != expected_size or h.hexdigest() != expected_sha:
                raise BackupTransferError("Arquivo baixado nao passou no SHA256.")
        except Exception:
            Path(temp_path).unlink(missing_ok=True)
            raise
        finally:
            conn.close()

    def complete(self):
        return self.json("POST", f"/v1/sessions/{self.session_id}/complete")


def _contained(root, relative):
    if not valid_relative(relative):
        raise BackupTransferError("Destino fora das pastas pessoais.")
    dest = root.joinpath(*relative.split("/"))
    if not dest.resolve(strict=False).is_relative_to(root.resolve()):
        raise BackupTransferError("Caminho invalido no arquivo pessoal.")
    return dest


def _resolved_destination(home, filename, expected_sha):
    requested = _contained(home, filename)
    target = requested
    stem, suffix = requested.stem, requested.suffix
    counter = 0
    while target.exists():
        if target.is_file() and not target.is_symlink() and digest_file(target) == expected_sha:
            return target, True
        counter += 1
        target = requested.with_name(f"{stem} [arquivo antigo {counter}]{suffix}")
    return target, False


def _make_dirs(home, parent, uid, gid):
    if home.is_symlink() or not home.is_dir():
        raise BackupTransferError("Pasta de destino invalida.")
    current = home
    for segment in parent.relative_to(home).parts:
        current = current / segment
        if current.is_symlink():
            raise BackupTransferError("Destino com link simbolico inesperado.")
        current.mkdir(exist_ok=True, mode=0o755)
        os.chown(current, uid, gid)


def apply_xdg(home, uid, gid):
    config = home / ".config"
    if config.is_symlink():
        raise BackupTransferError("Configuracao XDG insegura.")
    config.mkdir(mode=0o755, exist_ok=True)
    xdg = config / "user-dirs.dirs"
    if xdg.is_symlink():
        raise BackupTransferError("Arquivo XDG inseguro.")
    mapping = {"DESKTOP": "Desktop", "DOWNLOAD": "Downloads",
               "DOCUMENTS": "Documentos", "PICTURES": "Imagens",
               "VIDEOS": "Vídeos", "MUSIC": "Músicas"}
    with xdg.open("w", encoding="utf-8") as f:
        for key, folder in mapping.items():
            f.write(f'XDG_{key}_DIR="$HOME/{folder}"\n')
    os.chown(config, uid, gid)
    os.chown(xdg, uid, gid)


def restore_files(client, manifest, home, uid, gid):
    """Idempotent restore for installer and possible first-boot recovery."""
    items = manifest.get("files")
    if (manifest.get("format") != 1 or not isinstance(items, list)
            or not items):
        raise BackupTransferError("Manifesto ausente ou vazio.")
    home = Path(home)
    total = 0
    for folder in ROOT_DIRS:
        dest = home / folder
        _make_dirs(home, dest, uid, gid)
    for index, item in enumerate(items):
        name, size, checksum = item.get("path"), item.get("size"), item.get("sha256")
        if (not valid_relative(name) or type(size) is not int or size < 0
                or not isinstance(checksum, str) or not HEX_RE.fullmatch(checksum)):
            raise BackupTransferError("Item do backup invalido.")
        target, existing = _resolved_destination(home, name, checksum)
        _make_dirs(home, target.parent, uid, gid)
        if not existing:
            for attempt in range(3):
                temporary = target.with_name(
                    target.name + ".part-" + secrets.token_hex(5))
                try:
                    client.fetch_to(index, temporary, size, checksum)
                    os.replace(temporary, target)
                    break
                except (BackupTransferError, OSError, http.client.HTTPException):
                    temporary.unlink(missing_ok=True)
                    if attempt == 2:
                        raise BackupTransferError(
                            "Falha repetida no download; backup mantido no servidor.")
                    time.sleep(2 ** attempt)
            os.chown(target, uid, gid)
            os.chmod(target, int(item.get("mode", 0o644)) & 0o777)
            if item.get("mtime"):
                os.utime(target, (int(item["mtime"]), int(item["mtime"])))
        if target.stat().st_size != size or digest_file(target) != checksum:
            raise BackupTransferError("Arquivo final nao confere: SHA256 divergente.")
        total += size
    if total != manifest.get("total_bytes"):
        raise BackupTransferError("Contagem de bytes restaurados nao confere.")
    apply_xdg(home, uid, gid)
    return len(items)
