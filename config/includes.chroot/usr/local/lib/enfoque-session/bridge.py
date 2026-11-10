"""Bridge between the remote system agent and the active local XFCE session.

Access control layers: root-owned logind session metadata, regular logged-in
UID, protected Unix socket owner/mode, and SO_PEERCRED/cgroup validation in the
desktop agent. Never infer authorization from a process name alone.
"""
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import subprocess

SOCKET_DIR = Path("/run/enfoque-remote")
SESSION_DIR = Path("/run/systemd/sessions")
RESULT_LIMIT = 70 * 1024
SID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
LOGIN = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")


def _run(argv, timeout=5):
    try:
        proc = subprocess.run(argv, text=True, capture_output=True, timeout=timeout,
                              stdin=subprocess.DEVNULL)
        return proc.stdout if proc.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _user(name, uid=None):
    if not isinstance(name, str) or not LOGIN.fullmatch(name):
        return None
    if name in ("root", "enfoque-ti"):
        return None
    try:
        account = pwd.getpwnam(name)
    except KeyError:
        return None
    if account.pw_uid <= 999 or (uid is not None and account.pw_uid != uid):
        return None
    return (account.pw_uid, name)


def sessions_via_logind():
    output = _run(["loginctl", "list-sessions", "--no-legend", "--no-pager"])
    result = []
    for line in output.splitlines()[:40]:
        fields = line.split()
        if len(fields) < 3 or not SID.fullmatch(fields[0]):
            continue
        details = _run(["loginctl", "show-session", fields[0], "--no-pager",
                        "-p", "Active", "-p", "Type", "-p", "Remote", "-p", "Name"])
        record = dict(row.split("=", 1) for row in details.splitlines() if "=" in row)
        if (record.get("Active") != "yes" or record.get("Remote") == "yes"
                or record.get("Type") != "x11"):
            continue
        account = _user(record.get("Name", ""))
        if account:
            result.append((fields[0], *account))
    return result


def sessions_via_root_records():
    """Fallback when loginctl cannot connect from a hardened DynamicUser.

    Read only immutable-to-users systemd-logind metadata. The socket handshake
    will independently authenticate the system service.
    """
    result = []
    try:
        directory = SESSION_DIR.lstat()
        if (not stat.S_ISDIR(directory.st_mode)
                or directory.st_uid != 0 or directory.st_mode & 0o022):
            return []
        entries = sorted(SESSION_DIR.iterdir(), key=lambda p: p.name)[:80]
    except OSError:
        return []
    for path in entries:
        if not SID.fullmatch(path.name):
            continue
        try:
            meta = path.lstat()
            if (not stat.S_ISREG(meta.st_mode) or meta.st_uid != 0
                    or meta.st_mode & 0o022 or not 0 < meta.st_size <= 16384):
                continue
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        data = dict(line.split("=", 1) for line in content.splitlines()
                    if "=" in line and not line.startswith("#"))
        if (data.get("TYPE") != "x11"
                or data.get("REMOTE", "0") not in ("0", "no")
                or data.get("CLASS", "user") not in ("user", "user-light")):
            continue
        # STATE=active is the systemd session record; some releases also
        # include ACTIVE=1. Ignore stale logind records and greeter sessions.
        if (data.get("STATE") != "active"
                and data.get("ACTIVE") not in ("1", "yes")):
            continue
        try:
            uid = int(data.get("UID", "-1"))
        except ValueError:
            continue
        account = _user(data.get("USER", ""), uid)
        if account:
            result.append((path.name, *account))
    return result


def active_sessions():
    sessions = sessions_via_logind()
    # A running session's socket and UID are still mandatory if either
    # logind path fails. Deduplicate by account to avoid duplicate opens.
    sessions.extend(sessions_via_root_records())
    result, seen = [], set()
    for sid, uid, name in sessions:
        if (uid, name) not in seen:
            seen.add((uid, name))
            result.append((sid, uid, name))
    return result


def available_socket():
    try:
        meta = SOCKET_DIR.lstat()
        if (not stat.S_ISDIR(meta.st_mode) or meta.st_uid != 0
                or meta.st_mode & 0o007):
            raise PermissionError("Diretório IPC não está protegido")
    except (OSError, PermissionError):
        raise ConnectionError("IPC local não configurado")
    for sid, uid, name in active_sessions():
        path = SOCKET_DIR / ("session-" + str(uid) + ".sock")
        try:
            info = path.lstat()
            if (not stat.S_ISSOCK(info.st_mode) or info.st_uid != uid
                    or info.st_mode & 0o007 or not (info.st_mode & stat.S_IWGRP)):
                continue
        except OSError:
            continue
        return path, name, uid
    raise ConnectionError("Nenhuma sessão XFCE ativa e autorizada neste computador")


def session_command(action, args=None):
    if action not in ("open", "shell", "run", "process", "status", "gui", "screenshot"):
        return {"ok": False, "error": "Ação fora do agente gráfico"}
    if not isinstance(args, dict):
        args = {}
    try:
        socket_path, name, uid = available_socket()
        if name == "enfoque-kiosk" and action in ("shell", "run", "process"):
            return {"ok": False, "error": "Terminal remoto bloqueado para a conta de caixa/quiosque"}
        payload = json.dumps({"action": action, "args": args},
                             ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(payload) > 60 * 1024:
            return {"ok": False, "error": "Comando excedeu limite de tamanho"}
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(4)
            client.connect(str(socket_path))
            client.settimeout(95)
            client.sendall(payload + b"\n")
            data = bytearray()
            while len(data) <= RESULT_LIMIT:
                chunk = client.recv(4096)
                if not chunk:
                    break
                data.extend(chunk)
                if b"\n" in data:
                    break
        if len(data) > RESULT_LIMIT or b"\n" not in data:
            return {"ok": False, "error": "Resposta incompleta da sessão gráfica"}
        response = json.loads(bytes(data).split(b"\n", 1)[0])
        if not isinstance(response, dict):
            return {"ok": False, "error": "Resposta inválida do agente de sessão"}
        response["sessionUser"] = name
        response["sessionUid"] = uid
        return response
    except (OSError, ValueError, ConnectionError, PermissionError,
            socket.timeout, json.JSONDecodeError) as error:
        return {"ok": False, "error": str(error)[:220],
                "help": "Usuário precisa estar logado no XFCE com o agente da sessão ativo"}


def session_status():
    try:
        path, name, uid = available_socket()
        return {"ok": True, "sessionUser": name, "sessionUid": uid,
                "socket": "conectável"}
    except (OSError, ConnectionError, PermissionError) as error:
        return {"ok": False, "error": str(error)[:180]}
