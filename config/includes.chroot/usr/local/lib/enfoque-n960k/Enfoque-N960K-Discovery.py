#!/usr/bin/env python3
# Enfoque Papelaria - N960K USB discovery, Windows + Linux, no Enfoque OS dependency.
# READ ONLY: No libusb open, no HID event, no payment/PIX operation, no ADB.
from __future__ import annotations

import argparse
import ctypes
import json
import os
import platform
import re
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

VID = "1E0E"
PID = "902B"
PORT = 8878
VALID_EXTENSION_IDS = frozenset({
    "bflibhoonjpjkbmkdoeliobebafhfgpc",
    "deefkcpnkjonogdiepklcckmchebechj",
})
HOSTS = frozenset({"127.0.0.1:8878", "localhost:8878"})
PLATFORM = platform.system().lower()
CACHE_SECONDS = 0.65
_CACHE = {"at": 0.0, "value": None}
_LOCK = threading.RLock()


def _linux_detect(root: Path | None = None) -> dict:
    """Enumerate only currently attached devices through sysfs (no udev/root)."""
    base = root or Path("/sys/bus/usb/devices")
    try:
        candidates = sorted(base.iterdir())
    except (OSError, PermissionError):
        return {"detected": False, "scannerReady": False,
                "detail": "Diretorio sysfs USB indisponivel."}
    for dev in candidates:
        try:
            v = (dev / "idVendor").read_text(encoding="ascii").strip().upper()
            p = (dev / "idProduct").read_text(encoding="ascii").strip().upper()
        except (OSError, UnicodeError):
            continue
        if v == VID and p == PID:
            return {"detected": True, "scannerReady": True,
                    "source": "linux-sysfs", "usbPath": dev.name}
    return {"detected": False, "scannerReady": True, "source": "linux-sysfs"}


def _windows_detect() -> dict:
    """Windows SetupAPI present-only enumeration, does not claim/open USB."""
    if os.name != "nt":
        return {"detected": False, "scannerReady": False,
                "detail": "SetupAPI somente Windows."}
    import ctypes.wintypes as wt

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", ctypes.c_uint32), ("Data2", ctypes.c_uint16),
            ("Data3", ctypes.c_uint16), ("Data4", ctypes.c_ubyte * 8),
        ]

    class SP_DEVINFO_DATA(ctypes.Structure):
        _fields_ = [
            ("cbSize", wt.DWORD), ("ClassGuid", GUID),
            ("DevInst", wt.DWORD), ("Reserved", ctypes.c_size_t),
        ]

    setup = ctypes.WinDLL("setupapi", use_last_error=True)
    setup.SetupDiGetClassDevsW.argtypes = [
        ctypes.c_void_p, wt.LPCWSTR, wt.HWND, wt.DWORD
    ]
    setup.SetupDiGetClassDevsW.restype = ctypes.c_void_p
    setup.SetupDiEnumDeviceInfo.argtypes = [
        ctypes.c_void_p, wt.DWORD, ctypes.POINTER(SP_DEVINFO_DATA)
    ]
    setup.SetupDiEnumDeviceInfo.restype = wt.BOOL
    setup.SetupDiGetDeviceInstanceIdW.argtypes = [
        ctypes.c_void_p, ctypes.POINTER(SP_DEVINFO_DATA),
        wt.LPWSTR, wt.DWORD, ctypes.POINTER(wt.DWORD),
    ]
    setup.SetupDiGetDeviceInstanceIdW.restype = wt.BOOL
    setup.SetupDiDestroyDeviceInfoList.argtypes = [ctypes.c_void_p]
    setup.SetupDiDestroyDeviceInfoList.restype = wt.BOOL

    # DIGCF_PRESENT | DIGCF_ALLCLASSES = 0x2 | 0x4.
    handle = setup.SetupDiGetClassDevsW(None, None, None, 0x06)
    invalid = ctypes.c_void_p(-1).value
    if handle is None or handle == invalid:
        return {"detected": False, "scannerReady": False,
                "detail": "Falha na enumeracao SetupAPI."}
    match = re.compile(r"VID_1E0E&PID_902B", re.I)
    try:
        info = SP_DEVINFO_DATA()
        info.cbSize = ctypes.sizeof(SP_DEVINFO_DATA)
        for index in range(12000):
            if not setup.SetupDiEnumDeviceInfo(handle, index, ctypes.byref(info)):
                break
            device_id = ctypes.create_unicode_buffer(2048)
            required = wt.DWORD()
            if setup.SetupDiGetDeviceInstanceIdW(
                handle, ctypes.byref(info), device_id, 2048,
                ctypes.byref(required)
            ):
                if match.search(device_id.value):
                    return {"detected": True, "scannerReady": True,
                            "source": "windows-setupapi",
                            "deviceInstance": device_id.value}
        return {"detected": False, "scannerReady": True,
                "source": "windows-setupapi"}
    except (OSError, ValueError) as exc:
        return {"detected": False, "scannerReady": False,
                "detail": "Falha SetupAPI: " + type(exc).__name__}
    finally:
        setup.SetupDiDestroyDeviceInfoList(handle)


def discover() -> dict:
    with _LOCK:
        tick = time.monotonic()
        if _CACHE["value"] is not None and tick - _CACHE["at"] < CACHE_SECONDS:
            return dict(_CACHE["value"])
        if PLATFORM == "windows":
            state = _windows_detect()
        elif PLATFORM == "linux":
            testroot = os.environ.get("ENFOQUE_N960K_TEST_SYSFS")
            state = _linux_detect(Path(testroot) if testroot else None)
        else:
            state = {"detected": False, "scannerReady": False,
                     "detail": "Sistema operacional nao suportado."}
        result = {
            "ok": True,
            "schema": 1,
            "service": "Enfoque N960K USB Discovery",
            "os": PLATFORM,
            "vendorId": VID,
            "productId": PID,
            "detected": bool(state.get("detected")),
            "scannerReady": bool(state.get("scannerReady")),
            "source": state.get("source", "unsupported"),
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            # USB presence is deliberately NOT evidence that a TEF payment
            # bridge, AOA2 permissions, PIN-pad app or banking is ready.
            "paymentReady": False,
        }
        if state.get("detail"):
            result["detail"] = str(state["detail"])[:180]
        if state.get("usbPath"):
            result["usbPath"] = str(state["usbPath"])[:90]
        # Do not expose individual Windows device instance IDs over HTTP.
        _CACHE["value"] = result
        _CACHE["at"] = tick
        return dict(result)


class Handler(BaseHTTPRequestHandler):
    server_version = "Enfoque-N960K-Discovery/1.0"
    sys_version = ""

    def log_message(self, fmt, *args):
        # The polling traffic is expected and never includes transaction data.
        return

    def reply(self, status: int, obj: dict, origin: str = ""):
        data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def authorized(self) -> tuple[bool, str]:
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return False, ""
        if self.headers.get("Host") not in HOSTS:
            return False, ""
        supplied_id = self.headers.get("X-Enfoque-Extension-ID", "")
        if supplied_id not in VALID_EXTENSION_IDS:
            return False, ""
        origin = self.headers.get("Origin", "")
        if origin and origin != "chrome-extension://" + supplied_id:
            return False, ""
        return True, origin

    def do_GET(self):
        ok, origin = self.authorized()
        if not ok:
            return self.reply(403, {"ok": False, "error": "Extensao nao autorizada."})
        if urlsplit(self.path).path != "/v1/discovery":
            return self.reply(404, {"ok": False, "error": "Rota inexistente."}, origin)
        return self.reply(200, discover(), origin)

    def do_OPTIONS(self):
        host = self.headers.get("Host")
        origin = self.headers.get("Origin", "")
        # In a CORS preflight, the browser sends Access-Control-Request-Headers,
        # NOT the eventual X-Enfoque-Extension-ID request header value.
        origin_id = origin.removeprefix("chrome-extension://")
        requested_headers = self.headers.get("Access-Control-Request-Headers", "").lower()
        if (self.client_address[0] != "127.0.0.1" or host not in HOSTS or
                origin != "chrome-extension://" + origin_id or
                origin_id not in VALID_EXTENSION_IDS or
                "x-enfoque-extension-id" not in requested_headers):
            return self.reply(403, {"ok": False, "error": "Preflight nao autorizado."})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Enfoque-Extension-ID")
        self.send_header("Access-Control-Max-Age", "120")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        self.reply(405, {"ok": False, "error": "Somente deteccao; comandos USB proibidos."})


def main():
    parser = argparse.ArgumentParser(description="Detector independente USB Enfoque N960K (somente leitura)")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    if args.port != PORT:
        parser.error("Porta do detector fixa em 8878 para nao misturar com ponte TEF.")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Enfoque N960K USB Discovery: http://127.0.0.1:{PORT} ({PLATFORM})", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
