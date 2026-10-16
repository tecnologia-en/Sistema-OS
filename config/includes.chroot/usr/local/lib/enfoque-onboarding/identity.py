"""Self-declared company association, never a grant of Intranet permissions."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile

COMPANIES = {
    "enfoque": {
        "name": "Enfoque Papelaria",
        "units": {
            "ilha-plaza": "Ilha Plaza",
            "copacabana": "Copacabana",
            "itaipu": "Itaipu",
            "icarai": "Icarai",
            "sao-goncalo": "Sao Goncalo - Centro",
            "centro": "Centro - Enfoque",
            "deposito": "Deposito Celestino",
            "administracao": "Administracao / TI",
        },
    },
    "papel-arte": {
        "name": "Papel & Arte",
        "units": {"papel-arte": "Papel & Arte", "administracao": "Administracao / TI"},
    },
}

SCHEMA = 1

def validated_identity(username, company_id, unit_id, when=None):
    if not isinstance(username,str) or not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}",username):
        raise ValueError("Nome de usuario Linux invalido.")
    if company_id not in COMPANIES:
        raise ValueError("Selecione uma empresa valida.")
    company = COMPANIES[company_id]
    if unit_id not in company["units"]:
        raise ValueError("Selecione uma unidade valida.")
    return {
        "schema": SCHEMA, "username": username,
        "companyId": company_id,
        "companyName": company["name"],
        "unitId": unit_id,
        "unitName": company["units"][unit_id],
        "origin": "declared-by-local-user",
        "createdAt": when or datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

def default_identity_path(home=None):
    folder = Path(home) if home is not None else Path.home()
    return folder / ".config" / "enfoque-os" / "identity.json"

def store_identity(username, company_id, unit_id, dest=None):
    file = Path(dest) if dest is not None else default_identity_path()
    identity = validated_identity(username,company_id,unit_id)
    folder = file.parent
    folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(folder,0o700)
    # Existing choices cannot be silently overwritten by a new wizard instance.
    if file.exists():
        raise FileExistsError("Este usuario ja concluiu o primeiro acesso.")
    fd, temp = tempfile.mkstemp(prefix=".identity-", dir=folder)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as handle:
            json.dump(identity,handle,ensure_ascii=False,indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp,0o600)
        if file.exists():
            raise FileExistsError("Primeiro acesso ja concluido.")
        os.replace(temp,file)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return identity

def load_identity(file=None):
    path = Path(file) if file is not None else default_identity_path()
    obj = json.loads(path.read_text(encoding="utf-8"))
    valid = validated_identity(obj.get("username"),obj.get("companyId"),obj.get("unitId"),obj.get("createdAt"))
    if obj.get("companyName") != valid["companyName"] or obj.get("unitName") != valid["unitName"]:
        raise ValueError("Associacao de empresa inconsistente.")
    return valid
