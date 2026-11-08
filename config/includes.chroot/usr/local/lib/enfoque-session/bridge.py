"""Enfoque OS - bridge client for the currently logged-in Linux XFCE session.

Runs in the existing networked DynamicUser system agent. No credentials from
the relay reach the desktop process. The connection is local Unix IPC only.
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
RESULT_LIMIT = 70 * 1024

def _run(argv,timeout=5):
    try:
        p=subprocess.run(argv,text=True,capture_output=True,timeout=timeout)
        return p.stdout if p.returncode==0 else ""
    except (OSError,subprocess.TimeoutExpired):
        return ""

def active_sessions():
    output=_run(["loginctl","list-sessions","--no-legend","--no-pager"],5)
    result=[]
    for line in output.splitlines()[:40]:
        pieces=line.split()
        if len(pieces)<3 or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}",pieces[0]):
            continue
        sid=pieces[0]
        details=_run(["loginctl","show-session",sid,"--no-pager",
                      "-p","Active","-p","Type","-p","Remote","-p","Name"],5)
        record=dict(row.split("=",1) for row in details.splitlines() if "=" in row)
        if record.get("Active")!="yes" or record.get("Remote")=="yes":
            continue
        if record.get("Type")!="x11":
            # The native Enfoque OS 0.2.x is XFCE on X11.
            continue
        username=record.get("Name","")
        if username in ("root","enfoque-ti") or not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}",username):
            continue
        try:
            user=pwd.getpwnam(username)
        except KeyError:
            continue
        if user.pw_uid<=999:
            continue
        result.append((sid,user.pw_uid,username))
    return result

def available_socket():
    root=SOCKET_DIR
    try:
        meta=root.lstat()
        if not stat.S_ISDIR(meta.st_mode) or meta.st_uid!=0 or meta.st_mode & 0o007:
            raise PermissionError("Diretório IPC não está protegido")
    except (OSError,PermissionError):
        raise ConnectionError("IPC local não configurado")
    for sid,uid,name in active_sessions():
        path=root/("session-"+str(uid)+".sock")
        try:
            info=path.lstat()
            if (not stat.S_ISSOCK(info.st_mode) or info.st_uid!=uid or
                    info.st_mode & 0o007 or not (info.st_mode & stat.S_IWGRP)):
                continue
        except OSError:
            continue
        return path,name,uid
    raise ConnectionError("Nenhuma sessão XFCE ativa e autorizada neste computador")

def session_command(action,args=None):
    if action not in ("open","shell","run","process","status"):
        return {"ok":False,"error":"Ação fora do agente gráfico"}
    if not isinstance(args,dict):args={}
    try:
        socket_path,name,uid=available_socket()
        if name=="enfoque-kiosk" and action in ("shell","run","process"):
            return {"ok":False,"error":"Terminal remoto bloqueado para a conta de caixa/quiosque"}
        payload=json.dumps({"action":action,"args":args},
                           ensure_ascii=False,separators=(",",":")).encode("utf-8")
        if len(payload)>60*1024:
            return {"ok":False,"error":"Comando excedeu limite de tamanho"}
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as client:
            client.settimeout(4)
            client.connect(str(socket_path))
            client.settimeout(95)
            client.sendall(payload+b"\n")
            data=bytearray()
            while len(data)<=RESULT_LIMIT:
                chunk=client.recv(4096)
                if not chunk:break
                data.extend(chunk)
                if b"\n" in data:break
        if len(data)>RESULT_LIMIT or b"\n" not in data:
            return {"ok":False,"error":"Resposta incompleta da sessão gráfica"}
        response=json.loads(bytes(data).split(b"\n",1)[0])
        if not isinstance(response,dict):
            return {"ok":False,"error":"Resposta inválida do agente de sessão"}
        response["sessionUser"]=name
        response["sessionUid"]=uid
        return response
    except (OSError,ValueError,ConnectionError,PermissionError,
            socket.timeout,json.JSONDecodeError) as error:
        return {"ok":False,"error":str(error)[:220],
                "help":"Usuário precisa estar logado no XFCE com o agente da sessão ativo"}

def session_status():
    try:
        path,name,uid=available_socket()
        return {"ok":True,"sessionUser":name,"sessionUid":uid,
                "socket":"conectável"}
    except (OSError,ConnectionError,PermissionError) as error:
        return {"ok":False,"error":str(error)[:180]}
