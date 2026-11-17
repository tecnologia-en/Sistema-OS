# No GUI; AOA2 HID USB extracted from verified Enfoque N960K controller.
# Enfoque N960K - AOA2 control (Windows, sem ADB e sem APK)
# Apenas entrada HID pelo USB; nao processa pagamentos nem le a tela do terminal.
import ctypes
import ctypes.util
import os
import sys
import time
from pathlib import Path

# Windows retains the existing WinUSB/libusb DLL setup and trusted path.
# Linux uses its distro-supplied libusb, with standard per-user XDG data.
if os.name == "nt":
    ROOT = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "Enfoque-SmartPOS"
    LIB = ROOT / "scrcpy-win64-v5.0.1" / "libusb-1.0.dll"
elif sys.platform.startswith("linux"):
    ROOT = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "enfoque-smartpos"
    LIB = ctypes.util.find_library("usb-1.0") or "libusb-1.0.so.0"
else:
    raise RuntimeError("Somente Windows e Linux sao suportados.")
VID = 0x1E0E
PID = 0x902B

KBD = bytes.fromhex("05010906A101050719E029E71500250175019508810295017508810195067508150025650507190029658100C0")
MOUSE = bytes.fromhex("05010902A1010901A1000509190129031500250195037501810295017505810105010930093109381581257F750895038106C0C0")
MEDIA = bytes.fromhex("050C0901A101150026FF0319002AFF03751095018100C0")
KEYS = {
    "TAB": 0x2B, "ESC": 0x29, "ENTER": 0x28, "BACKSPACE": 0x2A,
    "UP": 0x52, "DOWN": 0x51, "LEFT": 0x50, "RIGHT": 0x4F,
    "SPACE": 0x2C, "HOME": 0x4A, "DELETE": 0x4C,
    "0": 0x27, "1": 0x1E, "2": 0x1F, "3": 0x20, "4": 0x21,
    "5": 0x22, "6": 0x23, "7": 0x24, "8": 0x25, "9": 0x26,
    ".": 0x37, ",": 0x36,
}
MEDIA_KEYS = {"VOLUME_UP": 0xE9, "VOLUME_DOWN": 0xEA, "MUTE": 0xE2, "ANDROID_HOME": 0x0223, "ANDROID_BACK": 0x0224}

class Desc(ctypes.Structure):
    _fields_ = [
        ("bLength", ctypes.c_uint8), ("bDescriptorType", ctypes.c_uint8),
        ("bcdUSB", ctypes.c_uint16), ("bDeviceClass", ctypes.c_uint8),
        ("bDeviceSubClass", ctypes.c_uint8), ("bDeviceProtocol", ctypes.c_uint8),
        ("bMaxPacketSize0", ctypes.c_uint8), ("idVendor", ctypes.c_uint16),
        ("idProduct", ctypes.c_uint16), ("bcdDevice", ctypes.c_uint16),
        ("iManufacturer", ctypes.c_uint8), ("iProduct", ctypes.c_uint8),
        ("iSerialNumber", ctypes.c_uint8), ("bNumConfigurations", ctypes.c_uint8),
    ]

# Virtual PIX touchscreen HID: absolute position, no relative mouse event.
# Logical maxima are experimental; the customer's map was relative mouse input.
PIX_TOUCH_ID = 94
PIX_TOUCH_MAX_X = 602
PIX_TOUCH_MAX_Y = 1254
PIX_TOUCH_DESCRIPTOR = bytes.fromhex(
    "05 0D 09 04 A1 01 09 32 09 33 15 00 25 01 "
    "75 01 95 02 81 02 75 01 95 06 81 01 "
    "05 01 09 30 15 00 26 5A 02 75 10 95 01 81 02 "
    "09 31 15 00 26 E6 04 75 10 95 01 81 02 C0"
)

class Usb:
    def __init__(self):
        if not LIB.exists():
            raise RuntimeError("libusb nao encontrado: " + str(LIB))
        # Same libusb-1.0 C API on Windows and Linux. No changes to
        # AOA2/HID descriptors, timings, values, click or cancel behavior.
        self.dll = (ctypes.WinDLL(str(LIB)) if os.name == "nt"
                    else ctypes.CDLL(str(LIB)))
        d = self.dll
        P = ctypes.c_void_p
        d.libusb_init.argtypes = [ctypes.POINTER(P)]
        d.libusb_init.restype = ctypes.c_int
        d.libusb_exit.argtypes = [P]
        d.libusb_get_device_list.argtypes = [P, ctypes.POINTER(ctypes.POINTER(P))]
        d.libusb_get_device_list.restype = ctypes.c_ssize_t
        d.libusb_free_device_list.argtypes = [ctypes.POINTER(P), ctypes.c_int]
        d.libusb_get_device_descriptor.argtypes = [P, ctypes.POINTER(Desc)]
        d.libusb_get_device_descriptor.restype = ctypes.c_int
        d.libusb_open.argtypes = [P, ctypes.POINTER(P)]
        d.libusb_open.restype = ctypes.c_int
        d.libusb_close.argtypes = [P]
        d.libusb_control_transfer.argtypes = [
            P, ctypes.c_uint8, ctypes.c_uint8, ctypes.c_uint16,
            ctypes.c_uint16, ctypes.POINTER(ctypes.c_uint8),
            ctypes.c_uint16, ctypes.c_uint,
        ]
        d.libusb_control_transfer.restype = ctypes.c_int
        self.ctx = P()
        self.handle = P()
        self.registered = []
        self.connected = False
        self.protocol = None

    def ctrl(self, req, value=0, index=0, data=b"", request_type=0x40):
        payload = (ctypes.c_uint8 * len(data))(*data) if data else (ctypes.c_uint8 * 2)()
        return self.dll.libusb_control_transfer(
            self.handle, request_type, req, value, index, payload, len(data), 1400
        ), payload

    def connect(self):
        if self.connected:
            time.sleep(.35) # Android asynchronously registers HID report descriptors
            return self.protocol
        d = self.dll
        result = d.libusb_init(ctypes.byref(self.ctx))
        if result != 0:
            raise RuntimeError("libusb_init: " + str(result))
        devs = ctypes.POINTER(ctypes.c_void_p)()
        count = d.libusb_get_device_list(self.ctx, ctypes.byref(devs))
        opened = False
        try:
            for i in range(max(count, 0)):
                desc = Desc()
                if d.libusb_get_device_descriptor(devs[i], ctypes.byref(desc)) == 0:
                    if desc.idVendor == VID and desc.idProduct == PID:
                        rc = d.libusb_open(devs[i], ctypes.byref(self.handle))
                        if rc != 0:
                            raise RuntimeError("WinUSB/libusb nao abriu a N960K: " + str(rc))
                        opened = True
                        break
        finally:
            if count >= 0:
                d.libusb_free_device_list(devs, 1)
        if not opened:
            self.disconnect()
            raise RuntimeError("Nao encontrei a N960K (USB 1E0E:902B).")
        self.connected = True
        try:
            proto = (ctypes.c_uint8 * 2)()
            count = d.libusb_control_transfer(self.handle, 0xC0, 51, 0, 0, proto, 2, 1400)
            self.protocol = int(proto[0]) + (int(proto[1]) << 8) if count == 2 else 0
            if self.protocol < 2:
                raise RuntimeError("AOA2 indisponivel, resposta: " + str(count))
            for ident, descriptor in [(91, KBD), (92, MOUSE), (93, MEDIA)]:
                rc, _ = self.ctrl(54, ident, len(descriptor))
                if rc != 0:
                    raise RuntimeError(f"Registrar HID {ident}: {rc}")
                self.registered.append(ident)
                rc, _ = self.ctrl(56, ident, 0, descriptor)
                if rc != len(descriptor):
                    raise RuntimeError(f"Descritor HID {ident}: {rc}")
            time.sleep(.35) # Android asynchronously registers HID report descriptors
            return self.protocol
        except Exception:
            self.disconnect()
            raise

    def event(self, ident, raw):
        if not self.connected:
            raise RuntimeError("Conecte a N960K primeiro.")
        rc, _ = self.ctrl(57, ident, 0, raw)
        if rc != len(raw):
            raise RuntimeError(f"Evento USB nao aceito (HID {ident}): {rc} / {len(raw)}")
        return rc

    def key(self, name):
        code = KEYS.get(name.upper(), None)
        if code is None:
            raise ValueError("Tecla nao suportada: " + name)
        self.event(91, bytes([0, 0, code, 0, 0, 0, 0, 0]))
        time.sleep(.065)
        self.event(91, bytes(8))

    def text(self, value):
        if not isinstance(value, str) or not value or len(value) > 12:
            raise ValueError("Informe de 1 a 12 caracteres.")
        if any(ch not in "0123456789.," for ch in value):
            raise ValueError("Somente digitos, virgula ou ponto.")
        for ch in value:
            self.key(ch)
            time.sleep(.065)

    def mouse(self, dx=0, dy=0, button=0):
        if dx < -127 or dx > 127 or dy < -127 or dy > 127 or button not in (0, 1):
            raise ValueError("Movimento fora dos limites.")
        self.event(92, bytes([button, dx & 255, dy & 255, 0]))
        if button:
            time.sleep(.06)
            self.event(92, bytes(4))

    def wheel(self, amount):
        if not -127 <= amount <= 127:
            raise ValueError("Mouse wheel amount out of range.")
        self.event(92, bytes([0,0,0,amount & 255]))

    def media(self, name):
        code = MEDIA_KEYS[name]
        self.event(93, code.to_bytes(2, "little"))
        time.sleep(.08)
        self.event(93, bytes(2))

    def register_pix_absolute_touch(self):
        # Register while on the initial Pix prepare stage, NOT mid-QR payment.
        if not self.connected:raise RuntimeError("USB nao conectado.")
        if PIX_TOUCH_ID in self.registered:return
        rc,_=self.ctrl(54,PIX_TOUCH_ID,len(PIX_TOUCH_DESCRIPTOR))
        if rc!=0:raise RuntimeError("Registrar touchscreen absoluto Pix falhou: "+str(rc))
        self.registered.append(PIX_TOUCH_ID)
        rc,_=self.ctrl(56,PIX_TOUCH_ID,0,PIX_TOUCH_DESCRIPTOR)
        if rc!=len(PIX_TOUCH_DESCRIPTOR):
            raise RuntimeError("Descritor touchscreen Pix nao aceito: "+str(rc))
        time.sleep(.38)  # allow Android to register the virtual digitizer

    def tap_pix_absolute(self,x,y):
        # Sends literal ABSOLUTE touch HID coordinates; NEVER move/click mouse.
        if not self.connected or PIX_TOUCH_ID not in self.registered:
            raise RuntimeError("Touchscreen absoluto Pix nao registrado.")
        if (type(x) is not int or type(y) is not int or
                not 0<=x<=PIX_TOUCH_MAX_X or not 0<=y<=PIX_TOUCH_MAX_Y):
            raise ValueError("Coordenadas absolutas Pix fora do descriptor HID.")
        down=bytes([3,x&255,(x>>8)&255,y&255,(y>>8)&255])
        up=bytes([0,x&255,(x>>8)&255,y&255,(y>>8)&255])
        self.event(PIX_TOUCH_ID,down)
        try:
            time.sleep(.085)
        finally:
            self.event(PIX_TOUCH_ID,up)
        return True  # USB report accepted, not proof of application cancellation

    def disconnect(self):
        if self.handle.value:
            for ident in reversed(self.registered):
                try:
                    self.ctrl(55, ident)
                except Exception:
                    pass
            self.registered.clear()
            self.dll.libusb_close(self.handle)
            self.handle = ctypes.c_void_p()
        if self.ctx.value:
            self.dll.libusb_exit(self.ctx)
            self.ctx = ctypes.c_void_p()
        self.connected = False
