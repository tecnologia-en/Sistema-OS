"""Authenticated outgoing WSS transport for the Enfoque OS command agent.

Only standard-library Python. TLS verification is mandatory. Protocol uses
the existing Enfoque Root MCP /mcp/pc-agent/ws endpoint and its signed-up
per-device token.
"""
import base64
import hashlib
import json
import os
import socket
import ssl
import struct
from urllib.parse import urlsplit

GUID="258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME=120*1024

class WebSocket:
    def __init__(self,url,device_id,token,timeout=18):
        self.url=url
        self.device_id=device_id
        self.token=token
        self.timeout=timeout
        self.sock=None
        self.buf=b""

    def connect(self):
        parsed=urlsplit(self.url)
        if parsed.scheme!="wss" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Controle remoto requer WebSocket TLS")
        host=parsed.hostname
        port=parsed.port or 443
        target=(parsed.path or "/")+("?"+parsed.query if parsed.query else "")
        raw=socket.create_connection((host,port),timeout=self.timeout)
        try:
            sock=ssl.create_default_context().wrap_socket(raw,server_hostname=host)
            sock.settimeout(self.timeout)
            nonce=base64.b64encode(os.urandom(16)).decode("ascii")
            headers=[
                f"GET {target} HTTP/1.1",
                f"Host: {host}:{port}" if port!=443 else f"Host: {host}",
                "Connection: Upgrade",
                "Upgrade: websocket",
                "Sec-WebSocket-Version: 13",
                f"Sec-WebSocket-Key: {nonce}",
                "User-Agent: EnfoqueOS/0.2.25-dual-agent",
                "X-PC-Device-ID: "+self.device_id,
                "Authorization: Bearer "+self.token,
                "\r\n",
            ]
            sock.sendall("\r\n".join(headers).encode("ascii"))
            response=bytearray()
            while b"\r\n\r\n" not in response and len(response)<14000:
                data=sock.recv(2048)
                if not data:break
                response.extend(data)
            if b"\r\n\r\n" not in response:
                raise ConnectionError("Handshake WebSocket incompleto")
            head,extra=bytes(response).split(b"\r\n\r\n",1)
            lines=head.decode("latin-1").split("\r\n")
            if " 101 " not in lines[0]:
                raise ConnectionError("WebSocket recusado")
            fields=dict(line.split(":",1) for line in lines[1:] if ":" in line)
            fields={k.lower():v.strip() for k,v in fields.items()}
            wanted=base64.b64encode(hashlib.sha1((nonce+GUID).encode("ascii")).digest()).decode("ascii")
            if fields.get("sec-websocket-accept")!=wanted:
                raise ConnectionError("Handshake não autenticado")
            if fields.get("upgrade","").lower()!="websocket":
                raise ConnectionError("Upgrade WebSocket inválido")
            self.sock=sock
            self.buf=extra
            self.sock.settimeout(25)
            return self
        except Exception:
            try:raw.close()
            except OSError:pass
            raise

    def _recv_exact(self,count):
        data=bytearray()
        if self.buf:
            use=min(len(self.buf),count)
            data.extend(self.buf[:use])
            self.buf=self.buf[use:]
        while len(data)<count:
            chunk=self.sock.recv(count-len(data))
            if not chunk:
                raise ConnectionError("Conexão WebSocket fechada")
            data.extend(chunk)
        return bytes(data)

    def send_frame(self,data,opcode=1):
        if isinstance(data,str):data=data.encode("utf-8")
        if len(data)>MAX_FRAME:
            raise ValueError("Frame demasiado grande")
        mask=os.urandom(4)
        header=bytearray([0x80|opcode])
        length=len(data)
        if length<126:
            header.append(0x80|length)
        elif length<65536:
            header.extend([0x80|126])
            header.extend(struct.pack("!H",length))
        else:
            header.extend([0x80|127])
            header.extend(struct.pack("!Q",length))
        payload=bytes(byte^mask[i%4] for i,byte in enumerate(data))
        self.sock.sendall(bytes(header)+mask+payload)

    def send_json(self,value):
        self.send_frame(json.dumps(value,ensure_ascii=False,separators=(",",":")))

    def recv_json(self):
        while True:
            try:
                first,second=self._recv_exact(2)
            except socket.timeout:
                self.send_frame(b"ping",9)
                continue
            opcode=first&15
            if first&0x80==0:
                raise ConnectionError("Fragmentação WebSocket não suportada")
            length=second&127
            if length==126:
                length=struct.unpack("!H",self._recv_exact(2))[0]
            elif length==127:
                length=struct.unpack("!Q",self._recv_exact(8))[0]
            if length>MAX_FRAME:
                raise ValueError("Comando remoto excessivo")
            mask=self._recv_exact(4) if second&0x80 else None
            payload=self._recv_exact(length) if length else b""
            if mask:
                payload=bytes(byte^mask[i%4] for i,byte in enumerate(payload))
            if opcode==8:
                raise ConnectionError("Servidor encerrou a conexão")
            if opcode==9:
                self.send_frame(payload,10)
                continue
            if opcode==10:
                continue
            if opcode!=1:
                continue
            message=json.loads(payload.decode("utf-8"))
            if not isinstance(message,dict):
                raise ValueError("Mensagem WebSocket inválida")
            return message

    def close(self):
        if self.sock:
            try:self.send_frame(b"",8)
            except (OSError,ValueError):pass
            try:self.sock.close()
            except OSError:pass
            self.sock=None
