"""On-demand desktop pixels and coordinate input for an approved TI request.

Runs ONLY inside the logged-in graphical user's session socket, never as root.
No daemon, microphone, camera, files, browser history, or outbound connection.
Frames are generated once per request, bounded and JPEG encoded in memory.
"""
import base64
import math
import os
import re
import shutil
import subprocess
import threading

PIXEL_LIMIT = 8192
JPEG_LIMIT = 42_000       # < 60 kB encoded so it fits the existing IPC transport.
TEXT_LIMIT = 1200
KEY = re.compile(r"^[A-Za-z0-9_+][A-Za-z0-9_+\\-]{0,47}$")
DESKTOP_LOCK = threading.Lock()


class VisualError(ValueError):
    pass


def require_x11():
    if not os.environ.get("DISPLAY", "").startswith(":") or os.environ.get("WAYLAND_DISPLAY"):
        raise VisualError("Controle visual exige a sessão XFCE X11 ativa")


def dimensions():
    require_x11()
    import gi
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk
    root = Gdk.get_default_root_window()
    if root is None:
        raise VisualError("Sessão X11 indisponível")
    w, h = int(root.get_width()), int(root.get_height())
    if not (100 <= w <= PIXEL_LIMIT and 100 <= h <= PIXEL_LIMIT):
        raise VisualError("Resolução de tela fora do limite")
    return root, w, h


def _integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise VisualError(label + " inválido")
    return value


def _button(value):
    return {"left": "1", "middle": "2", "right": "3"}.get(value) or _raise("Botão inválido")


def _raise(message):
    raise VisualError(message)


def _xdo(*args, timeout=7):
    exe = shutil.which("xdotool")
    if not exe:
        raise VisualError("Dependência xdotool não instalada")
    proc = subprocess.run([exe, *args], stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, timeout=timeout, check=False)
    if proc.returncode:
        raise VisualError("Controle X11 recusado: " + proc.stderr[-160:])
    return proc.stdout.strip()


def capture(options=None):
    """Single screen frame. No capture runs between client requests."""
    options = options or {}
    if not isinstance(options, dict):
        raise VisualError("Configuração de captura inválida")
    max_width = _integer(options.get("maxWidth", 1100), 320, 1600, "Largura")
    quality = _integer(options.get("quality", 63), 35, 85, "Qualidade")
    with DESKTOP_LOCK:
        root, screen_w, screen_h = dimensions()
        import gi
        gi.require_version("Gdk", "3.0")
        gi.require_version("GdkPixbuf", "2.0")
        from gi.repository import Gdk, GdkPixbuf
        pix = Gdk.pixbuf_get_from_window(root, 0, 0, screen_w, screen_h)
        if pix is None:
            raise VisualError("Não foi possível capturar o display X11")
        width = min(screen_w, max_width)
        jpeg = b""
        height = 0
        for _ in range(8):
            height = max(1, round(screen_h * width / screen_w))
            small = (pix if width == screen_w else pix.scale_simple(
                width, height, GdkPixbuf.InterpType.BILINEAR))
            saved, jpeg = small.save_to_bufferv(
                "jpeg", ["quality"], [str(quality)])
            if not saved:
                raise VisualError("Codificação JPEG indisponível")
            if len(jpeg) <= JPEG_LIMIT:
                break
            if quality > 42:
                quality = max(40, quality - 12)
            else:
                width = max(320, int(width * 0.78))
        if len(jpeg) > JPEG_LIMIT:
            raise VisualError("Imagem excedeu tamanho máximo permitido")
    return {
        "ok": True, "mimeType": "image/jpeg",
        "data": base64.b64encode(jpeg).decode("ascii"),
        "width": width, "height": height,
        "screenWidth": screen_w, "screenHeight": screen_h,
        "bytes": len(jpeg), "scope": "sessao-usuario",
    }


def gui(options):
    """Single validated GUI operation under the active unprivileged user."""
    if not isinstance(options, dict):
        raise VisualError("Ação GUI inválida")
    op = options.get("op")
    allowed = {"screen_size", "cursor", "move", "click", "double_click",
               "mouse_down", "mouse_up", "scroll", "type", "key", "hotkey"}
    if op not in allowed:
        raise VisualError("Operação GUI não permitida")
    with DESKTOP_LOCK:
        _, width, height = dimensions()
        if op == "screen_size":
            return {"ok": True, "width": width, "height": height,
                    "virtualLeft": 0, "virtualTop": 0,
                    "virtualWidth": width, "virtualHeight": height}
        if op == "cursor":
            text = _xdo("getmouselocation", "--shell")
            parts = dict(line.split("=", 1) for line in text.splitlines() if "=" in line)
            return {"ok": True, "x": int(parts["X"]), "y": int(parts["Y"])}
        if op in {"move", "click", "double_click"}:
            x = _integer(options.get("x"), 0, width - 1, "X")
            y = _integer(options.get("y"), 0, height - 1, "Y")
            _xdo("mousemove", "--sync", str(x), str(y))
            if op != "move":
                count = 2 if op == "double_click" else _integer(options.get("count", 1), 1, 3, "Cliques")
                _xdo("click", "--repeat", str(count), "--delay", "85",
                     _button(options.get("button", "left")))
            return {"ok": True, "x": x, "y": y, "op": op}
        if op in {"mouse_down", "mouse_up"}:
            _xdo("mousedown" if op == "mouse_down" else "mouseup",
                 _button(options.get("button", "left")))
            return {"ok": True, "op": op}
        if op == "scroll":
            delta = _integer(options.get("delta", -120), -960, 960, "Rolagem")
            if not delta:
                return {"ok": True, "delta": 0}
            clicks = max(1, min(8, math.ceil(abs(delta) / 120)))
            _xdo("click", "--repeat", str(clicks), "4" if delta > 0 else "5")
            return {"ok": True, "delta": delta}
        if op == "type":
            value = options.get("text", "")
            if not isinstance(value, str) or len(value) > TEXT_LIMIT or "\0" in value:
                raise VisualError("Texto fora do limite")
            if value:
                _xdo("type", "--clearmodifiers", "--delay", "5", "--", value, timeout=15)
            return {"ok": True, "typedChars": len(value)}
        if op in {"key", "hotkey"}:
            keys = [options.get("key")] if op == "key" else options.get("keys")
            if not isinstance(keys, list) or not 1 <= len(keys) <= 4 or any(
                    not isinstance(key, str) or not KEY.fullmatch(key) for key in keys):
                raise VisualError("Atalho de teclado inválido")
            _xdo("key", "--clearmodifiers", "+".join(keys))
            return {"ok": True, "op": op, "keys": keys}
    raise VisualError("Operação não implementada")
