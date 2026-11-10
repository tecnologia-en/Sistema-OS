"""Persist one root-owned, non-secret machine profile after the first installed login.

The marker and the profile are the same atomic file. Only the dedicated
root helper can create it; a separate user profile never grants IT access.
"""
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
from datetime import datetime, timezone
from uuid import UUID

from identity import COMPANIES

PROFILE = Path("/var/lib/enfoque-os/firstboot.json")
DEVICE = Path("/var/lib/enfoque-os/device-identity.json")
UNIT_SUFFIX = {
    "ilha-plaza": "1", "copacabana": "2", "itaipu": "3",
    "icarai": "4", "sao-goncalo": "5", "centro": "6",
    "deposito": "7", "administracao": "8", "papel-arte": "9",
}


def validate_pc_name(name):
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-zÀ-ÿ0-9 _.-]{3,48}", name):
        raise ValueError("O nome deve conter de 3 a 48 letras, numeros, espacos ou hifens.")
    display = name.strip()
    if len(display) < 3:
        raise ValueError("Informe um nome para identificar este computador.")
    slug = unicodedata.normalize("NFKD", display).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")[:45].strip("-")
    if len(slug) < 3 or slug in {"localhost", "localhost-localdomain", "root", "admin"}:
        raise ValueError("Nome do computador reservado ou invalido.")
    return display, slug


def build_profile(name, company, unit, machine, anydesk_id=""):
    display, hostname = validate_pc_name(name)
    if company not in COMPANIES or unit not in COMPANIES[company]["units"]:
        raise ValueError("Escolha uma loja cadastrada.")
    uid = UUID(machine["uuid"])
    if uid.version != 4 or str(uid) != machine["uuid"]:
        raise ValueError("UUID local invalido.")
    short = f"{uid.int % 1000000000000:012d}"
    if machine.get("shortId") != short:
        raise ValueError("ID do computador inconsistente.")
    if anydesk_id and not re.fullmatch(r"[0-9]{6,16}", str(anydesk_id)):
        anydesk_id = ""
    return {
        "schema": 1,
        "pcName": display, "hostname": hostname,
        "companyId": company, "companyName": COMPANIES[company]["name"],
        "unitId": unit, "unitName": COMPANIES[company]["units"][unit],
        "uuid": str(uid), "shortId": short,
        "displayId": short + "-" + UNIT_SUFFIX[unit],
        "anydeskId": anydesk_id or None,
        "registration": "pending-IT-approval",
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def load_profile(path=PROFILE, machine_path=DEVICE, enforce_owner=True):
    path = Path(path)
    if path.is_symlink():
        raise PermissionError("O perfil do PC nao pode ser um link.")
    metadata = path.stat()
    if enforce_owner and (metadata.st_uid != 0 or metadata.st_mode & 0o022):
        raise PermissionError("Perfil do PC com permissoes inseguras.")
    obj = json.loads(path.read_text(encoding="utf-8"))
    machine = json.loads(Path(machine_path).read_text(encoding="utf-8"))
    expected = build_profile(obj.get("pcName"), obj.get("companyId"),
                             obj.get("unitId"), machine, obj.get("anydeskId") or "")
    for key in ("pcName", "hostname", "companyId", "unitId",
                "uuid", "shortId", "displayId"):
        if obj.get(key) != expected[key]:
            raise ValueError("Perfil do computador adulterado ou inconsistente.")
    return obj


def sync_hostname_hosts(hostname, destination=Path("/etc/hosts")):
    """Keep local DNS aligned with the hostname used by sudo after First Boot.

    A mismatched /etc/hosts makes sudo wait for unreachable DNS servers,
    which prevents noninteractive administrative maintenance and updates.
    Only the 127.0.1.1 entry is managed; other host aliases are preserved.
    """
    if not isinstance(hostname, str) or not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?", hostname):
        raise ValueError("Hostname local invalido")
    target = Path(destination)
    if target.is_symlink():
        raise PermissionError("Arquivo hosts e link simbolico")
    existing = target.read_text(encoding="utf8") if target.exists() else "127.0.0.1 localhost\n"
    updated = []
    inserted = False
    for line in existing.splitlines():
        if re.match(r"^\s*127\.0\.1\.1(?:\s|$)", line):
            if not inserted:
                updated.append("127.0.1.1 " + hostname)
                inserted = True
        else:
            updated.append(line)
    if not inserted:
        updated.append("127.0.1.1 " + hostname)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".enfoque-hosts-", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf8") as stream:
            stream.write("\n".join(updated).rstrip() + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return target


def atomic_first_write(record, destination=PROFILE):
    """Link a private temporary file into place; never overwrite an existing setup."""
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.parent.is_symlink():
        raise PermissionError("Diretorio do perfil alterado.")
    fd, temporary = tempfile.mkstemp(prefix=".firstboot-", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(record, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)
        os.link(temporary, target)
    finally:
        os.unlink(temporary)
    return target
