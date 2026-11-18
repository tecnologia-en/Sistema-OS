# Enfoque N960K AOA2 local bridge. Does NOT authorize card payments and cannot read NSU.
# Requires the previously validated Enfoque N960K-Control.py and the user-calibrated Vender JSON.
import argparse
import secrets
import ctypes
import ctypes.util
import hmac
import importlib.util
import json
import os
import sys
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

# Independent from Enfoque OS: user-local files on Linux, existing
# ProgramData paths on Windows. Extension always talks to 127.0.0.1:8879.
if os.name == 'nt':
    HOME = Path(os.environ.get('PROGRAMDATA', r'C:\ProgramData')) / 'Enfoque-SmartPOS'
elif sys.platform.startswith('linux'):
    HOME = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local' / 'share'))) / 'enfoque-smartpos'
else:
    raise RuntimeError('Ponte N960K requer Windows ou Linux.')
HOST_OS = 'windows' if os.name == 'nt' else 'linux'
CONFIG = HOME / 'n960k-agent-secret.json'
MAP = HOME / 'N960K-Vender-Map.json'
CONTINUE_MAP = HOME / 'N960K-Continuar-Parcelas-Map.json'
# The USB implementation is packaged with the unpacked Chrome extension;
# private credentials, maps, LEDGER and the USB DLL stay in ProgramData.
CONTROL = Path(__file__).resolve().with_name('N960K-HID-Headless.py')
LEDGER = HOME / 'n960k-agent-ledger.json'
PIX_TOUCH_CONFIG = Path(__file__).resolve().with_name('N960K-Pix-X-Absolute-Config.json')
PORT = 8879
MAX_BODY = 4096
LEASE_TIMEOUT_SEC = 90   # No browser heartbeat for 90 s => abandon locally
MAX_PENDING_SEC = 300    # Max pending financial-navigation session: 5 min
SWEEP_INTERVAL_SEC = 1
HID_IDLE_RESET_SEC = 40
HOME_PREPARE_TTL_SEC = 40   # Home reset must be followed by /v1/start quickly
# Original AOA2 HID driver holds keyboard keys for 65 ms and media for 80 ms.
# Extra 15 ms on keyboard, 20 ms after mouse button, 80 ms between raw
# movement reports. These are short event separators, not anti-bot delays.
HID_KEY_EXTRA_SEC = 0.015
# A tela de valor do Vender ainda nao recebe teclas imediatamente apos o clique.
VENDER_AMOUNT_SCREEN_WAIT_SEC = 1.250
HID_AMOUNT_DIGIT_EXTRA_SEC = 0.125
# Android waits until the CREDIT menu/instalment field is fully rendered.
# Previously just 80ms was enough to swallow the 5 or 2 installments.
CREDIT_MENU_READY_WAIT_SEC = 0.350
INSTALLMENTS_FIELD_READY_WAIT_SEC = 1.450
INSTALLMENTS_DIGIT_EXTRA_SEC = 0.180
INSTALLMENTS_CONTINUE_READY_WAIT_SEC = 0.450
HID_MOVE_INTERVAL_SEC = 0.080
HID_CLICK_EXTRA_SEC = 0.020
HID_MEDIA_EXTRA_SEC = 0.000
ALLOWED_EXTENSION_ID = 'deefkcpnkjonogdiepklcckmchebechj'
ADDITIONAL_EXTENSION_ID = 'bflibhoonjpjkbmkdoeliobebafhfgpc'
ALLOWED_EXTENSION_IDS = frozenset((ALLOWED_EXTENSION_ID,ADDITIONAL_EXTENSION_ID))
ALLOWED_ORIGINS = frozenset('chrome-extension://' + x for x in ALLOWED_EXTENSION_IDS)
ALLOWED_ORIGIN = 'chrome-extension://' + ALLOWED_EXTENSION_ID
TRUSTED_HOSTS = ('127.0.0.1:8879', 'localhost:8879')
_usb_cache = {'checked': 0, 'data': None}
_usb_lock = threading.Lock()


def automatic_local_token():
    # Local per-desktop secret; never package it in the extension. The agent
    # creates it on the first startup, and the browser pairs in memory.
    HOME.mkdir(parents=True, exist_ok=True)
    if CONFIG.exists():
        value = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
        token = str(value.get('token', ''))
        if not re.fullmatch('[a-f0-9]{64}', token):
            raise RuntimeError('Configuracao privada da N960K danificada.')
        return token
    token = secrets.token_hex(32)
    temp = CONFIG.with_name(CONFIG.name + '.tmp')
    temp.write_text(json.dumps({'token': token, 'created': now(), 'mode': 'AUTO_LOCAL'}, indent=2), encoding='utf-8')
    temp.replace(CONFIG)
    return token


def physical_usb_status():
    # Only enumerate VID/PID. Never send AOA keys or payment controls during
    # health checks. Recheck roughly each 0.8s (USB hotplug supported).
    # All discovery is read-only; never call libusb AOA/HID commands here.
    with _usb_lock:
        if _usb_cache['data'] and (time.monotonic() - _usb_cache['checked'] < .8):
            return dict(_usb_cache['data'])
        result = {'detected': False, 'driverReady': False, 'vendorId': '1E0E', 'productId': '902B'}
        if os.name == 'nt':
            library = HOME / 'scrcpy-win64-v5.0.1' / 'libusb-1.0.dll'
            if not library.exists():
                result['detail'] = 'Biblioteca libusb nao instalada no agente Windows.'
                _usb_cache.update(checked=time.monotonic(), data=result)
                return result
        else:
            library = ctypes.util.find_library('usb-1.0') or 'libusb-1.0.so.0'
        ctx = ctypes.c_void_p()
        devices = ctypes.POINTER(ctypes.c_void_p)()
        handle = ctypes.c_void_p()
        count = -1
        lib = None
        try:
            class Descriptor(ctypes.Structure):
                _fields_ = [('bLength',ctypes.c_uint8),('bDescriptorType',ctypes.c_uint8),
                            ('bcdUSB',ctypes.c_uint16),('bDeviceClass',ctypes.c_uint8),
                            ('bDeviceSubClass',ctypes.c_uint8),('bDeviceProtocol',ctypes.c_uint8),
                            ('bMaxPacketSize0',ctypes.c_uint8),('idVendor',ctypes.c_uint16),
                            ('idProduct',ctypes.c_uint16),('bcdDevice',ctypes.c_uint16),
                            ('iManufacturer',ctypes.c_uint8),('iProduct',ctypes.c_uint8),
                            ('iSerialNumber',ctypes.c_uint8),('bNumConfigurations',ctypes.c_uint8)]
            lib = (ctypes.WinDLL(str(library)) if os.name == 'nt'
                   else ctypes.CDLL(str(library)))
            lib.libusb_init.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
            lib.libusb_init.restype = ctypes.c_int
            lib.libusb_exit.argtypes = [ctypes.c_void_p]
            lib.libusb_get_device_list.argtypes = [ctypes.c_void_p,ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))]
            lib.libusb_get_device_list.restype = ctypes.c_ssize_t
            lib.libusb_free_device_list.argtypes = [ctypes.POINTER(ctypes.c_void_p),ctypes.c_int]
            lib.libusb_get_device_descriptor.argtypes = [ctypes.c_void_p,ctypes.POINTER(Descriptor)]
            lib.libusb_get_device_descriptor.restype = ctypes.c_int
            lib.libusb_open.argtypes = [ctypes.c_void_p,ctypes.POINTER(ctypes.c_void_p)]
            lib.libusb_open.restype = ctypes.c_int
            lib.libusb_close.argtypes = [ctypes.c_void_p]
            if lib.libusb_init(ctypes.byref(ctx)) != 0:
                raise RuntimeError('libusb_init')
            count = lib.libusb_get_device_list(ctx, ctypes.byref(devices))
            for i in range(max(0, count)):
                d = Descriptor()
                if lib.libusb_get_device_descriptor(devices[i],ctypes.byref(d)) == 0 and d.idVendor == 0x1E0E and d.idProduct == 0x902B:
                    result['detected'] = True
                    code = lib.libusb_open(devices[i], ctypes.byref(handle))
                    result['driverReady'] = (code == 0)
                    if code != 0:
                        result['detail'] = 'N960K encontrada, mas driver USB ainda nao permite abertura (' + str(code) + ').'
                    break
        except Exception as exc:
            result['detail'] = 'Falha na consulta USB (' + HOST_OS + '): ' + type(exc).__name__
        finally:
            if lib:
                if handle.value: lib.libusb_close(handle)
                if count >= 0: lib.libusb_free_device_list(devices, 1)
                if ctx.value: lib.libusb_exit(ctx)
        _usb_cache.update(checked=time.monotonic(), data=result)
        return dict(result)



def now():
    return datetime.now(timezone.utc).isoformat()


def elapsed_seconds(stamp):
    try:
        dt = datetime.fromisoformat(str(stamp).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds())
    except (ValueError, TypeError):
        return float('inf')


def maintenance(state):
    while True:
        time.sleep(SWEEP_INTERVAL_SEC)
        try:
            state.sweep()
            state.idle_hid_tick()
        except Exception as exc:
            # No cards/tokens in logs. Failure must not stop the monitor.
            with (HOME / 'n960k-agent-errors.log').open('a', encoding='utf-8') as fd:
                fd.write(now() + ' SWEEP ' + type(exc).__name__ + '\n')


def load_map():
    value = json.loads(MAP.read_text(encoding='utf-8-sig'))
    packets = value.get('movementPackets', [])
    if value.get('target') != 'Vender' or not isinstance(packets, list) or not 1 <= len(packets) <= 1500:
        raise ValueError('Mapa de Vender invalido. Refaca a calibracao.')
    if any(not isinstance(p, list) or len(p) != 2 or any(type(n) is not int or abs(n) > 120 for n in p) for p in packets):
        raise ValueError('Pacotes de mouse invalidos no mapa de Vender.')
    if sum(p[0] for p in packets) != value.get('netRelativeX') or sum(p[1] for p in packets) != value.get('netRelativeY'):
        raise ValueError('Coordenadas nao correspondem aos pacotes gravados.')
    return packets


def load_continue_map():
    if not CONTINUE_MAP.exists():
        raise RuntimeError('Credito parcelado: falta mapear o botao Continuar. '
                           'Abra o atalho Calibrar Continuar N960K e salve a posicao.')
    data=json.loads(CONTINUE_MAP.read_text(encoding='utf-8-sig'))
    packets=data.get('movementPackets')
    if data.get('target') != 'Continuar - Credito parcelado sem juros':
        raise ValueError('Mapa de Continuar nao corresponde a tela de parcelas.')
    if not data.get('visuallyVerified'):
        raise RuntimeError('Mapa de Continuar ainda nao foi confirmado na maquininha. '
                           'Abra o atalho Calibrar Continuar N960K e clique em Confirmar.')
    if not isinstance(packets,list) or not 1<=len(packets)<=2000:
        raise ValueError('Mapa de Continuar vazio ou muito grande.')
    if any(not isinstance(p,list) or len(p)!=2 or
           any(type(n) is not int or abs(n)>120 for n in p) for p in packets):
        raise ValueError('Movimentos invalidos no mapa de Continuar.')
    x=sum(p[0] for p in packets)
    y=sum(p[1] for p in packets)
    if x!=data.get('netRelativeX') or y!=data.get('netRelativeY') or x<=0 or y<=0:
        raise ValueError('Coordenadas invalidas no mapa de Continuar.')
    return packets


def continue_map_ready():
    try:
        load_continue_map()
        return True
    except (OSError, ValueError, RuntimeError, TypeError, json.JSONDecodeError):
        return False


def load_pix_absolute_config():
    if not PIX_TOUCH_CONFIG.is_file():
        raise RuntimeError('Calibracao de toque Pix nao instalada.')
    d=json.loads(PIX_TOUCH_CONFIG.read_text(encoding='utf-8-sig'))
    touch=d.get('touch') or {}
    reference=d.get('sourceRelativeMouse') or {}
    if (d.get('protocol')!='AOA2 HID absolute touchscreen'
            or d.get('doNotMoveMouse') is not True
            or d.get('noAutomaticRetry') is not True
            or reference.get('visuallyVerified') is not True
            or (reference.get('x'),reference.get('y'))!=(543,98)
            or (touch.get('x'),touch.get('y'))!=(543,98)
            or (touch.get('logicalMaxX'),touch.get('logicalMaxY'))!=(602,1254)
            or touch.get('repeats')!=3
            or d.get('postUsbAcceptanceWaitSeconds')!=7):
        raise RuntimeError('Calibracao experimental Pix divergente; toque bloqueado.')
    return touch


def use_usb():
    if not CONTROL.exists():
        raise RuntimeError('N960K-Control.py nao encontrado na pasta Enfoque-SmartPOS.')
    spec = importlib.util.spec_from_file_location('enfoque_n960k_control', CONTROL)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.Usb()


def send_three_home(cancel_event=None, usb=None):
    # Reset in the SAME AOA2 USB session that will be used for the sale.
    # Visual observations (16 Nov 2026): ANDROID_BACK exits Credit,
    # the method list, installments and a not-yet-paid card prompt
    # to the amount page. ANDROID_HOME then returns to Laranjinha home.
    # Neither command confirms an actual financial cancellation.
    own_usb = usb is None
    if own_usb:
        usb = use_usb()
    try:
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError('Pedido cancelado antes da preparacao.')
        protocol = usb.connect()
        if protocol < 2:
            raise RuntimeError('AOA 2.0 indisponivel durante reset.')
        # Five Back presses before EVERY sale, including the very first.
        # This only navigates the UI; it never certifies cancellation of a
        # card/Pix financial transaction.
        steps=[]
        for number in range(5):
            if cancel_event is not None and cancel_event.is_set():
                raise RuntimeError('Pedido cancelado durante a sequencia de Back.')
            usb.media('ANDROID_BACK')
            steps.append('back_'+str(number+1))
            time.sleep(0.22)
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError('Pedido cancelado depois da sequencia Back.')
        usb.media('ANDROID_HOME')
        steps.append('home_once')
        time.sleep(0.80)
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError('Pedido cancelado depois do Home.')
        return {'steps':steps,
                'hidPersistent':not own_usb,
                'screenNotVerified':True,'paymentNotVerified':True}
    finally:
        if own_usb:
            usb.disconnect()


def prepare_sale(payment, cancel_event=None, home_already_sent=False, usb=None):
    def check_abort():
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError('Envio USB interrompido: SIGE abandonou a fila local; conferir terminal.')
    check_abort()
    # All required maps are validated BEFORE sending any USB input.
    own_usb = usb is None
    if own_usb:
        usb = use_usb()
    steps = []

    # USB HID AOA2 original, sem pausas artificiais de 400/500 ms.
    # usb.key() JA segura tecla por 65 ms, usb.media() por 80 ms,
    # usb.mouse(click) por 60 ms. Apenas pequenas folgas residuais.
    def hid_media(name):
        check_abort()
        usb.media(name)
        if HID_MEDIA_EXTRA_SEC:
            time.sleep(HID_MEDIA_EXTRA_SEC)

    def hid_key(name):
        check_abort()
        usb.key(name)
        time.sleep(HID_KEY_EXTRA_SEC)

    def hid_digits(value, extra_pause=HID_KEY_EXTRA_SEC):
        for digit in str(value):
            check_abort()
            usb.key(digit)
            time.sleep(extra_pause)

    try:
        check_abort()
        protocol = usb.connect()
        if protocol < 2:
            raise RuntimeError('Dispositivo nao respondeu como AOA 2.0.')
        check_abort()
        # The extension already required /v1/home first. Do NOT send
        # another three Home events here (could jump out of the sale).
        if not home_already_sent:
            raise RuntimeError('Etapa Home ausente: acione /v1/home antes da venda.')
        steps.append('back_home_sent_persistent_hid')
        # On the N960K menu, keyboard Enter/Continuar opens Vender.
        # Never move or click HID mouse nor scroll the Android screen.
        time.sleep(0.180)
        hid_key('ENTER')
        steps.append('vender_keyboard_enter')
        # Aguarde a tela de valor do Vender aceitar entrada. Antes eram
        # apenas 80ms e a N960K ignorava os primeiros digitos (49170 -> 70).
        # Nenhum valor e confirmado antes de todas as teclas serem enviadas.
        time.sleep(VENDER_AMOUNT_SCREEN_WAIT_SEC)
        # Phone app amount starts at cents, e.g. 49170 means R$491.70.
        hid_digits(payment['amountCents'], HID_AMOUNT_DIGIT_EXTRA_SEC)
        steps.append('amount_cents')
        time.sleep(0.080)
        hid_key('ENTER')
        steps.append('continue_amount')
        time.sleep(0.080)
        check_abort()
        method = payment['method']
        if method == 'DEBIT':
            hid_key('2')
            steps.append('debit')
        elif method == 'PIX':
            hid_key('4')
            steps.append('pix_machine')
        elif method == 'CREDIT':
            hid_key('1')
            steps.append('credit')
            # Wait for the credit modalities page before picking 1x/parcelado.
            time.sleep(CREDIT_MENU_READY_WAIT_SEC)
            if payment['installments'] == 1:
                hid_key('1')
                steps.append('credit_single')
            else:
                hid_key('3')
                steps.append('credit_no_interest')
                # IMPORTANT: the installment screen does not accept a digit
                # as soon as the menu item is pressed. Wait until loaded.
                time.sleep(INSTALLMENTS_FIELD_READY_WAIT_SEC)
                check_abort()
                hid_digits(payment['installments'], INSTALLMENTS_DIGIT_EXTRA_SEC)
                steps.append('number_of_installments')
                # The exact count was entered in the focused installment field.
                # A plain Enter activates Continuar on the N960K keyboard path.
                # DO NOT press Tab first: earlier Tab+Enter navigated backwards.
                # Allow the numeric field to update before Continue/Enter.
                time.sleep(INSTALLMENTS_CONTINUE_READY_WAIT_SEC)
                check_abort()
                hid_key('ENTER')
                steps.append('continue_installments_keyboard_enter')
                time.sleep(0.180)
                time.sleep(0.080)
        else:
            raise ValueError('Forma nao suportada.')
        return {'steps': steps, 'aoa': protocol, 'screenNotVerified': True, 'paymentNotVerified': True}
    finally:
        # The extension's State worker keeps the registered HID alive once
        # the card-present screen has been reached. An independent direct call
        # still closes its own USB handle normally.
        if own_usb:
            usb.disconnect()


class State:
    def __init__(self, token, dry_run=False):
        self.token = token
        self.lock = threading.RLock()
        self.dry_run = dry_run
        self.jobs = {}
        self.cancel_events = {}
        self.usb_inflight = set()
        self.held_usb = None
        self.held_usb_job = None
        # A safely canceled Pix can leave its AOA2 HID registration OPEN.
        # Ownership becomes standby, and a subsequent sale reuses this
        # exact USB handle, instead of re-registering input devices.
        self.pix_hid_standby = False
        self.usb_release_error = None
        # Idempotent, explicit customer-receipt key requests; memory-only.
        self.receipt_requests = {}
        # Safe idle watchdog. No HID detach while a card/Pix operation is pending.
        self.hid_last_command_monotonic = None
        self.hid_idle_armed = False
        self.hid_idle_resetting = False
        self.hid_idle_restart_count = 0
        self.hid_idle_last_reset_at = None
        self.hid_idle_reset_error = None
        if LEDGER.exists():
            try:
                rows = json.loads(LEDGER.read_text(encoding='utf-8-sig'))
                if isinstance(rows, dict):
                    self.jobs = rows
                    for j in self.jobs.values():
                        # Interrupted job should never be restarted automatically.
                        if j.get('stage') in ('sending','homing'):
                            j['stage'] = 'error'
                            j['error'] = 'Etapa USB interrompida; confira a maquininha antes de repetir.'
                        elif j.get('stage')=='home_ready':
                            j.update(stage='abandoned', closedAt=now(),
                                     closedReason='interrupted_after_home',
                                     paymentVerified=False,manualReviewRequired=True,
                                     terminalNotCancelled=True)
            except (OSError, ValueError):
                raise RuntimeError('Historico de jobs invalido: revise o arquivo antes de iniciar o servidor.')
        # Old persisted prepared jobs must not lock out the next SIGE session.
        self.sweep()

    def idle_hid_tick(self):
        # A 40-second countdown runs from the LAST HID command even while a
        # customer is on the debit, credit, or Pix screen. This is NOT a
        # financial cancellation or an authorization check. Do not re-send.
        with self.lock:
            if (not self.hid_idle_armed or self.hid_last_command_monotonic is None
                or self.hid_idle_resetting or self.usb_release_error is not None):
                return False
            # Never disturb a worker WHILE it is actually sending key events.
            if self.usb_inflight:
                return False
            if time.monotonic()-self.hid_last_command_monotonic < HID_IDLE_RESET_SEC:
                return False
            self.hid_idle_armed = False
            self.hid_idle_resetting = True
            existing = self.held_usb
            rid = self.held_usb_job
            isolated = None
            try:
                if not self.dry_run:
                    if existing is not None:
                        # The same object stays owned by the current job,
                        # so the operator can still use the existing Cancel.
                        existing.disconnect()
                        protocol=existing.connect()
                        if protocol < 2:
                            raise RuntimeError('AOA2 indisponivel apos reinicio HID.')
                    else:
                        isolated=use_usb()
                        protocol=isolated.connect()
                        if protocol < 2:
                            raise RuntimeError('AOA2 indisponivel durante reinicio ocioso.')
                        isolated.disconnect()
                        isolated=None
                if rid and rid in self.jobs:
                    self.jobs[rid].update(hidIdleRestartedAt=now(),
                        manualReviewRequired=True,
                        paymentVerified=False)
                    # Preserve stage="prepared": the operator must CANCEL
                    # or confirm approval explicitly; never auto-retry.
                    self.save()
                self.hid_idle_restart_count+=1
                self.hid_idle_last_reset_at=now()
                self.hid_idle_reset_error=None
                return True
            except Exception as exc:
                self.hid_idle_reset_error=type(exc).__name__
                if existing is not None and not getattr(existing,'connected',False):
                    # Do not permit a future sale when the old connection could
                    # not be re-registered cleanly.
                    self.usb_release_error=type(exc).__name__
                return False
            finally:
                if isolated is not None:
                    try:isolated.disconnect()
                    except Exception as exc:
                        self.usb_release_error=type(exc).__name__
                # Disarm until an actual new HID key/media command.
                self.hid_last_command_monotonic=None
                self.hid_idle_resetting=False

    def _release_held_usb_locked(self, request_id):
        # Called while State.lock is held; never while a worker still sends HID.
        # This is what the old code did automatically 500ms after DEBIT.
        if self.held_usb is None or self.held_usb_job != request_id:
            return
        usb = self.held_usb
        self.held_usb = None
        self.held_usb_job = None
        self.pix_hid_standby = False
        try:
            usb.disconnect()
            self.usb_release_error = None
        except Exception as exc:
            # Fail closed: keep subsequent transactions blocked if Android
            # might still have registered HID devices after a USB error.
            self.usb_release_error = type(exc).__name__
    
    def _abandon_locked(self, job, reason):
        if job.get('stage') in ('acknowledged', 'abandoned'):
            return False
        job.update(stage='abandoned', closedAt=now(), closedReason=reason,
                   paymentVerified=False, manualReviewRequired=True,
                   terminalNotCancelled=True)
        event=self.cancel_events.get(job.get('jobId'))
        if event: event.set()
        # When already prepared, no worker is using this USB handle.
        # When still sending, the worker receives cancel_event and releases it.
        if job.get('jobId') not in self.usb_inflight:
            self._release_held_usb_locked(job.get('jobId'))
        return True

    def sweep(self):
        with self.lock:
            changed=False
            for job in self.jobs.values():
                if job.get('stage') not in ('homing','home_ready','sending','prepared'):
                    continue
                age=elapsed_seconds(job.get('createdAt'))
                idle=elapsed_seconds(job.get('lastHeartbeatAt') or job.get('createdAt'))
                if job['stage'] in ('homing','home_ready'):
                    reason = 'home_prepare_timeout' if age >= HOME_PREPARE_TTL_SEC else None
                else:
                    reason = ('hard_session_timeout' if age >= MAX_PENDING_SEC else
                              'browser_heartbeat_timeout' if idle >= LEASE_TIMEOUT_SEC else None)
                if reason:
                    changed = self._abandon_locked(job,reason) or changed
            if changed: self.save()
        return changed

    def move_pix_mapping_cursor(self, data):
        # HID mouse *movement only*, shared with the agent's held Pix session.
        # Never send a click or alter a Pix transaction's financial state.
        if not isinstance(data, dict) or set(data) - {'dx','dy'}:
            raise ValueError('Mapa Pix: apenas dx e dy inteiros.')
        dx, dy = data.get('dx'), data.get('dy')
        if any(isinstance(v,bool) or type(v) is not int or not -120<=v<=120 for v in (dx,dy)):
            raise ValueError('Movimento Pix deve usar dx/dy inteiros entre -120 e 120.')
        with self.lock:
            self.sweep()
            job=self.active_job()
            if (job is None or job.get('stage')!='prepared'
                    or job.get('method')!='PIX'):
                raise RuntimeError('Mapeamento so disponivel com uma venda Pix preparada no SIGE.')
            rid=job.get('jobId')
            usb=self.held_usb
            if (rid != self.held_usb_job or not usb or
                    not getattr(usb,'connected',False)
                    or self.usb_release_error is not None or
                    self.usb_inflight or self.hid_idle_resetting):
                raise RuntimeError('A conexao HID do Pix nao esta pronta para mapeamento.')
            if (dx or dy) and not self.dry_run:
                usb.mouse(dx,dy)  # NO button, NO click.
            if dx or dy:
                # Every real mapping HID movement is a command and restarts
                # the existing 40-second idle countdown.
                self.hid_last_command_monotonic=time.monotonic()
                self.hid_idle_armed=True
            return {'jobId':rid,'stage':job['stage'],'method':'PIX',
                    'dx':dx,'dy':dy,'mouseButtonPressed':False,
                    'paymentVerified':False}

    def heartbeat(self, data):
        rid = data.get('jobId')
        if not isinstance(rid,str) or not re.fullmatch('[A-Za-z0-9_-]{1,120}',rid):
            raise ValueError('jobId invalido.')
        with self.lock:
            job=self.jobs.get(rid)
            if not job: raise LookupError('Trabalho nao encontrado.')
            self.sweep()
            if job['stage'] in ('homing','home_ready','sending','prepared'):
                job['lastHeartbeatAt']=now()
                self.save()
            return job

    def navigate(self,data):
        rid=data.get('jobId')
        if not isinstance(rid,str) or not re.fullmatch('[A-Za-z0-9_-]{1,120}',rid):
            raise ValueError('jobId invalido.')
        if data.get('confirmedNoPayment') is not True:
            raise ValueError('Confirme ausencia de pagamento antes de sair da tela.')
        with self.lock:
            job=self.jobs.get(rid)
            if not job:
                raise LookupError('Trabalho nao encontrado.')
            self.sweep()
            if job.get('stage')!='prepared':
                raise RuntimeError('A maquininha nao esta em etapa segura para navegacao automatica. Confira o visor.')
            if self.usb_inflight:
                raise RuntimeError('Outro envio USB em andamento.')
            usb=self.held_usb
            if usb is None or self.held_usb_job!=rid or not getattr(usb,'connected',False):
                raise RuntimeError('A conexao HID persistente nao esta disponivel. Nao reinicie durante o pagamento.')
            if job.get('method')=='PIX':
                # A three-tap Pix-specific absolute touchscreen experiment.
                # Reject repeats: if a POST times out after a partial USB
                # transmission, retrying could touch the wrong new screen.
                if job.get('pixAbsoluteAttempted'):
                    raise RuntimeError('Pix: toques ja tentados; confira o visor, sem repeticao.')
                cfg=load_pix_absolute_config()
                if not getattr(usb,'tap_pix_absolute',None):
                    raise RuntimeError('Driver nao suporta touchscreen Pix absoluto.')
                if 94 not in getattr(usb,'registered',[]):
                    raise RuntimeError('Touchscreen Pix nao foi registrado ANTES do QR.')
                job.update(pixAbsoluteAttempted=True,pixAbsoluteAttemptedAt=now(),
                    pixAbsoluteX=cfg['x'],pixAbsoluteY=cfg['y'],
                    pixAbsoluteTouchUsbAccepted=0,pixAbsoluteTargetUnverified=True)
                self.save()
                try:
                    for number in range(3):
                        usb.tap_pix_absolute(cfg['x'],cfg['y'])
                        job['pixAbsoluteTouchUsbAccepted']=number+1
                        job['lastHeartbeatAt']=now()
                        self.hid_last_command_monotonic=time.monotonic()
                        self.hid_idle_armed=True
                        self.save()
                        if number<2:time.sleep(.210)
                    # Three Pix touches completed: reply immediately so the
                    # browser can run the 7s animated loading + 1s guard.
                    # The actual USB disconnect/release will occur on /v1/cancel
                    # at the eighth second. USB acceptance does NOT prove Pix
                    # financial cancellation or that X was pressed.
                except Exception as exc:
                    job['pixAbsoluteError']=type(exc).__name__
                    job['manualReviewRequired']=True
                    self.save()
                    raise RuntimeError('Falha nos toques Pix; HID preservado. Verifique o terminal.') from exc
                job.update(navigationSent=True,navigationSentAt=now(),
                    pixAbsoluteThreeUsbAccepted=True,pixPostTapWaitSeconds=7,
                    pixHidReleaseAtSecond=8,terminalNotCancelled=True,
                    paymentVerified=False)
                self.save()
                return job
            try:
                # Resultados de bancada: Back sai da tela de pagamento sem cartao e
                # Home sai da tela de valor. Nenhuma dessas teclas comprova estorno.
                usb.media('ANDROID_BACK')
                time.sleep(0.85)
                usb.media('ANDROID_HOME')
                time.sleep(0.85)
                self.hid_last_command_monotonic = time.monotonic()
                self.hid_idle_armed = True
            except Exception as exc:
                self.usb_release_error=type(exc).__name__
                raise RuntimeError('Falha ao navegar com HID. Leitor preservado para verificacao manual.') from exc
            job.update(navigationSent=True,navigationSentAt=now(),lastHeartbeatAt=now())
            self.save()
            return job

    def cancel(self, data):
        rid = data.get('jobId')
        reason = data.get('reason')
        allowed = ('pdv_closed','payment_table_missing','queue_changed',
                   'operator_cancelled','pdv_back','session_timeout','page_unloaded','tab_closed')
        if not isinstance(rid,str) or not re.fullmatch('[A-Za-z0-9_-]{1,120}',rid):
            raise ValueError('jobId invalido.')
        if reason not in allowed:
            raise ValueError('Motivo de encerramento local invalido.')
        with self.lock:
            job=self.jobs.get(rid)
            if not job: raise LookupError('Trabalho nao encontrado.')
            if data.get('requiresSafeNavigation'):
                if data.get('terminalSafe') is not True or job.get('navigationSent') is not True:
                    raise RuntimeError('Navegacao e confirmacao visual obrigatorias antes de liberar o HID.')
            stage_before = job.get('stage')
            # Pix ONLY: after all three absolute HID touch reports were
            # accepted and the seven-second loader completed in SIGE,
            # close the local job WITHOUT unregistering or reconnecting HID.
            # Ordinary credit/debit/timeout/failed Pix still use the exact
            # original _abandon_locked -> disconnect behavior.
            pix_keep_connected = (
                job.get('method')=='PIX'
                and reason=='operator_cancelled'
                and data.get('requiresSafeNavigation') is True
                and data.get('terminalSafe') is True
                and job.get('navigationSent') is True
                and job.get('pixAbsoluteThreeUsbAccepted') is True
                and job.get('pixAbsoluteTouchUsbAccepted')==3
                and job.get('stage')=='prepared')
            if pix_keep_connected:
                if self.usb_inflight or self.hid_idle_resetting:
                    raise RuntimeError('USB ocupado; nao manter HID Pix em espera.')
                if (self.held_usb_job!=rid or self.held_usb is None or
                    not getattr(self.held_usb,'connected',False) or
                    self.usb_release_error is not None):
                    raise RuntimeError('HID Pix nao esta pronto para permanecer conectado.')
                job.update(stage='abandoned',closedAt=now(),closedReason=reason,
                    paymentVerified=False,manualReviewRequired=True,
                    terminalNotCancelled=True,
                    pixHidKeptOpen=True,pixHidKeptOpenAt=now())
                self.cancel_events.pop(rid,None)
                self.held_usb_job=None
                self.pix_hid_standby=True
                # Do not trigger an IDLE 40s disconnect after the Pix is
                # canceled. The 40-second watchdog rearms after a REAL HID
                # command in the next sale and still runs during payments.
                self.hid_idle_armed=False
                self.hid_last_command_monotonic=None
                self.save()
                return job
            if self._abandon_locked(job, reason):
                if (self.usb_release_error is None and not self.usb_inflight
                    and self.held_usb is None
                    and self.hid_last_command_monotonic is not None
                    and (data.get('requiresSafeNavigation') is True
                         and data.get('terminalSafe') is True
                         and job.get('navigationSent') is True
                         or stage_before == 'home_ready')):
                    # The last real HID command (Back/Home) starts this clock.
                    self.hid_idle_armed = True
                else:
                    # Never arm the timeout from unknown/failing transactions.
                    self.hid_idle_armed = False
                self.save()
            return job

    def save(self):
        HOME.mkdir(parents=True, exist_ok=True)
        temp = LEDGER.with_name(LEDGER.name + '.tmp')
        temp.write_text(json.dumps(self.jobs, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(LEDGER)

    def active_job(self):
        if self.usb_release_error is not None:
            return {'stage':'usb_release_failed'}
        # If a canceled USB worker is still running, don't start another.
        for rid in self.usb_inflight:
            if rid in self.jobs:
                return self.jobs[rid]
        for job in self.jobs.values():
            if job['stage'] in ('homing','home_ready','sending','prepared'):
                return job
        return None

    def prepare_home(self, data):
        validate_sale(data)
        if data['method']=='PIX':
            load_pix_absolute_config()  # validation before sending ANY sale keys
        # Preflight maps BEFORE doing anything on the terminal.
        # Keyboard-only sale: no Vender/Continuar mouse map required.
        rid=data['requestId']
        with self.lock:
            self.sweep()
            existing=self.jobs.get(rid)
            if existing:
                if any(existing[k]!=data[k] for k in ('amountCents','method','installments')):
                    raise ValueError('Mesmo requestId com valores diferentes.')
                if existing['stage']=='home_ready':
                    return existing,False
                raise RuntimeError('Etapa Home ja iniciada ou encerrada. Confira o terminal.')
            if self.active_job():
                raise RuntimeError('Outra operacao N960K esta em andamento. Confira o terminal.')
            self.hid_idle_armed = False
            reused_pix_usb=None
            if self.held_usb is not None:
                if (not self.pix_hid_standby or self.held_usb_job is not None
                    or not getattr(self.held_usb,'connected',False)
                    or self.usb_release_error is not None):
                    raise RuntimeError('HID de operacao anterior ainda registrado; confira o terminal antes de outra venda.')
                # Take ownership of the SAME AOA2 connection, even for a
                # debit/credit sale following a canceled Pix. Usb.connect()
                # on a connected handle does not register the device again.
                reused_pix_usb=self.held_usb
                self.held_usb=None
                self.held_usb_job=None
                self.pix_hid_standby=False
            job=dict(requestId=rid,jobId=rid,amountCents=data['amountCents'],
                     method=data['method'],installments=data['installments'],
                     createdAt=now(),lastHeartbeatAt=now(),stage='homing',
                     result=None,paymentVerified=False)
            self.jobs[rid]=job
            event=threading.Event()
            self.cancel_events[rid]=event
            self.usb_inflight.add(rid)
            self.save()
        usb_session = reused_pix_usb
        try:
            if self.dry_run:
                details = {'steps':['back_once','home_once','simulated'],
                           'hidPersistent':False,
                           'screenNotVerified':True,'paymentNotVerified':True}
            else:
                if usb_session is None:
                    usb_session = use_usb()
                details = send_three_home(cancel_event=event, usb=usb_session)
                if data['method']=='PIX':
                    if event.is_set():
                        raise RuntimeError('Pix cancelado durante registro do touch HID.')
                    usb_session.register_pix_absolute_touch()
                with self.lock:
                    self.hid_last_command_monotonic = time.monotonic()
                    self.hid_idle_armed = True
            with self.lock:
                record = self.jobs[rid]
                if record['stage'] == 'abandoned':
                    raise RuntimeError('SIGE abandonou a fila durante Home.')
                # Take ownership of the still-connected USB handle,
                # so /v1/start uses the SAME HID registration.
                if usb_session is not None:
                    if self.held_usb is not None:
                        raise RuntimeError('Outra sessao HID ainda registrada; conferir terminal.')
                    self.held_usb = usb_session
                    self.held_usb_job = rid
                    usb_session = None
                record.update(stage='home_ready',homeReadyAt=now(),
                              homeDetails=details,lastHeartbeatAt=now())
                self.save()
                return record, True
        except Exception as error:
            with self.lock:
                record = self.jobs[rid]
                if record['stage'] != 'abandoned':
                    record.update(stage='error',error=str(error),failedAt=now())
                    self.save()
            raise
        finally:
            if usb_session is not None:
                try:
                    usb_session.disconnect()
                except Exception as exc:
                    with self.lock:
                        self.usb_release_error = type(exc).__name__
            with self.lock:
                self.usb_inflight.discard(rid)
                if self.jobs[rid]['stage'] != 'home_ready':
                    self.cancel_events.pop(rid)

    def create(self, data):
        validate_sale(data)
        request_id = data['requestId']
        with self.lock:
            self.sweep()
            existing=self.jobs.get(request_id)
            if not existing:
                raise RuntimeError('Inicializacao nao feita. A extensao precisa enviar /v1/home antes da venda.')
            if any(existing[k]!=data[k] for k in ('amountCents','method','installments')):
                raise ValueError('Mesmo requestId com valores diferentes.')
            if existing['stage'] in ('sending','prepared'):
                return existing,False
            if existing['stage']!='home_ready':
                raise RuntimeError('Home nao confirmado ou sessao expirada; confira o terminal.')
            if elapsed_seconds(existing.get('homeReadyAt'))>=HOME_PREPARE_TTL_SEC:
                self._abandon_locked(existing,'home_prepare_timeout')
                self.save()
                raise RuntimeError('Home expirou; nao reenviar sem verificar o terminal.')
            # Exactly one USB worker for this transaction.
            if self.usb_inflight:
                raise RuntimeError('USB ocupado com outra operacao.')
            job=existing
            job.update(stage='sending',lastHeartbeatAt=now())
            self.cancel_events[request_id]=threading.Event()
            self.usb_inflight.add(request_id)
            self.save()
        threading.Thread(target=self.worker, args=(request_id,), daemon=True).start()
        return job, True

    def worker(self, request_id):
        with self.lock:
            job = self.jobs[request_id].copy()
            cancel_event=self.cancel_events.get(request_id)
        session=None
        try:
            if self.dry_run:
                time.sleep(.05)
                details={'steps':['simulated'], 'screenNotVerified': True, 'paymentNotVerified': True}
            else:
                with self.lock:
                    session=(self.held_usb if self.held_usb_job==request_id else None)
                if session is None:
                    raise RuntimeError('Sessao USB do reset nao encontrada; nao iniciar pagamento.')
                details=prepare_sale(job,cancel_event=cancel_event,
                                     home_already_sent=True,usb=session)
                with self.lock:
                    self.hid_last_command_monotonic = time.monotonic()
                    self.hid_idle_armed = True
            with self.lock:
                record=self.jobs[request_id]
                if record['stage'] != 'abandoned':
                    if session is not None:
                        # Transfer the USB handle to State. Do NOT unregister
                        # keyboard/mouse/media at the card-present screen.
                        self.held_usb = session
                        self.held_usb_job = request_id
                        session = None
                    record.update(stage='prepared', preparedAt=now(), details=details)
                    self.save()
                self.cancel_events.pop(request_id,None)
                self.usb_inflight.discard(request_id)
        except Exception as error:
            with self.lock:
                record=self.jobs[request_id]
                if record['stage'] != 'abandoned':
                    record.update(stage='error', error=str(error), failedAt=now())
                    self.save()
                self.cancel_events.pop(request_id,None)
                self.usb_inflight.discard(request_id)
        finally:
            if session is not None:
                # Worker failed/cancelled. Do not leave dangling USB handle.
                try:
                    session.disconnect()
                except Exception as exc:
                    with self.lock:
                        self.usb_release_error = type(exc).__name__
                finally:
                    with self.lock:
                        if self.held_usb is session:
                            self.held_usb = None
                            self.held_usb_job = None

    def print_customer_receipt(self, data):
        # Two KP1 keyboard key presses ONLY on authenticated explicit click.
        # They do not attest bank approval or physical printing.
        if not isinstance(data,dict) or set(data)!={'requestId','source'}:
            raise ValueError('Via do cliente: dados invalidos.')
        rid,source=data.get('requestId'),data.get('source')
        if not isinstance(rid,str) or not re.fullmatch('[A-Za-z0-9_-]{1,120}',rid):
            raise ValueError('Via do cliente: identificador invalido.')
        if source not in ('payment','success'):
            raise ValueError('Via do cliente: origem invalida.')
        with self.lock:
            self.sweep()
            if rid in self.receipt_requests:
                raise RuntimeError('Via do cliente ja solicitada. Confira o visor antes de repetir.')
            if self.usb_release_error is not None or self.hid_idle_resetting:
                raise RuntimeError('HID indisponivel. Confira a maquininha.')
            if self.usb_inflight:
                raise RuntimeError('A maquininha ainda esta recebendo comandos; aguarde o fim do envio.')
            job=self.active_job()
            if job and job.get('stage')!='prepared':
                raise RuntimeError('A maquininha ainda esta preparando a operacao; confira o visor.')
            reused=self.held_usb is not None
            if reused and not getattr(self.held_usb,'connected',False):
                raise RuntimeError('HID anterior desconectado. Confira o terminal.')
            if job and job.get('stage')=='prepared':
                if not reused or job.get('jobId')!=self.held_usb_job:
                    raise RuntimeError('HID do pagamento nao esta disponivel. Confira a maquininha.')
            if len(self.receipt_requests)>200:
                for older in list(self.receipt_requests)[:100]:
                    del self.receipt_requests[older]
            # Set before the first key so an HTTP retry cannot send 1+1 twice.
            self.receipt_requests[rid]='started'
            usb=self.held_usb if reused else None
            own_usb=not reused
            try:
                if not self.dry_run:
                    if usb is None:
                        usb=use_usb()
                        proto=usb.connect()
                        if proto<2:
                            raise RuntimeError('N960K nao respondeu como AOA2.')
                    usb.key('KP1')
                    time.sleep(0.100)  # exact inter-key pause requested
                    usb.key('KP1')
                    time.sleep(0.120)  # let Android process before temp release
                    if reused:
                        self.hid_last_command_monotonic=time.monotonic()
                        self.hid_idle_armed=True
                self.receipt_requests[rid]='sent'
                return {'ok':True,'inputSent':0 if self.dry_run else 2,
                        'simulated':bool(self.dry_run),
                        'keyCode':'KP1','interKeyDelayMs':100,
                        'hidReused':reused,'paymentVerified':False,
                        'receiptPrinted':False}
            except Exception:
                # Ambiguous USB writes must never be retried automatically.
                self.receipt_requests[rid]='uncertain'
                raise
            finally:
                if own_usb and usb is not None:
                    try:
                        usb.disconnect()
                    except Exception as exc:
                        self.usb_release_error=type(exc).__name__

    def ack(self, data):
        rid=data.get('jobId')
        if data.get('result')!='operator_confirmed' or not isinstance(rid,str):
            raise ValueError('Finalizacao exige clique do funcionario.')
        delay=data.get('resetAfterSeconds',0)
        if delay not in (0,5):
            raise ValueError('Intervalo de reinicio HID invalido.')
        with self.lock:
            job=self.jobs.get(rid)
            if not job:raise LookupError('Trabalho nao encontrado.')
            self.sweep()
            if job['stage'] not in ('prepared','acknowledged'):
                raise RuntimeError('Trabalho nao chegou ao estado preparado.')
            if job['stage']=='acknowledged':
                return job
            if rid in self.usb_inflight:
                raise RuntimeError('Envio HID ainda em andamento.')
            if delay==5:
                # Finalizar Venda is manual attestation by the employee.
                # Keep the HID until 5 seconds after the native click,
                # then disconnect, re-register and release the device.
                # This DOES NOT prove bank authorization and sends no new
                # value, payment, Back or Home commands.
                time.sleep(5)
            self._release_held_usb_locked(rid)
            if self.usb_release_error is not None:
                raise RuntimeError('Falha ao liberar HID. Confira o dispositivo.')
            if delay==5 and not self.dry_run:
                fresh=None
                try:
                    fresh=use_usb()
                    version=fresh.connect()
                    if version<2:
                        raise RuntimeError('AOA2 nao disponivel no reinicio pos Finalizar.')
                    fresh.disconnect()
                    fresh=None
                except Exception as exc:
                    self.usb_release_error=type(exc).__name__
                    raise RuntimeError('Reinicio do HID falhou; confira o terminal antes de outra venda.') from exc
                finally:
                    if fresh is not None:
                        try:fresh.disconnect()
                        except Exception as exc:self.usb_release_error=type(exc).__name__
            if delay==5:
                self.hid_idle_restart_count+=1
                self.hid_idle_last_reset_at=now()
                self.hid_last_command_monotonic=None
                self.hid_idle_armed=False
            job.update(stage='acknowledged',acknowledgedAt=now(),
                verifiedBy='operator_only',paymentVerified=False,
                delayedHidRestartSeconds=delay)
            self.hid_idle_armed=False
            self.save()
            return job


def validate_sale(d):
    if not isinstance(d, dict): raise ValueError('Objeto JSON obrigatorio.')
    if not re.fullmatch('[a-zA-Z0-9_-]{1,120}', str(d.get('requestId', ''))):
        raise ValueError('requestId invalido.')
    if type(d.get('amountCents')) is not int or not 1 <= d['amountCents'] <= 100000000:
        raise ValueError('Valor em centavos invalido.')
    if d.get('method') not in ('CREDIT', 'DEBIT', 'PIX'):
        raise ValueError('Forma de pagamento invalida.')
    n=d.get('installments')
    if type(n) is not int or not 1 <= n <= 12:
        raise ValueError('Numero de parcelas invalido.')
    if d['method'] != 'CREDIT' and n != 1:
        raise ValueError('Parcelamento so para credito.')


class Handler(BaseHTTPRequestHandler):
    state = None
    server_version = 'Enfoque-N960K-Bridge/0.2-auto'
    def log_message(self, fmt, *args):
        # Do not log tokens/card values.
        pass
    def reply(self, status, data):
        raw=json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        if self.headers.get('Origin') in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin'))
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def trusted_extension(self):
        # Reject cross-site browser requests before revealing credentials or sending USB events.
        # A localhost process can forge Origin, so this is a browser boundary, not sandboxing
        # against malware already running under the Windows account.
        if self.client_address[0] not in ('127.0.0.1', '::1'):
            self.reply(403, {'ok':False,'error':'Somente localhost.'})
            return False
        if self.headers.get('Host','') not in TRUSTED_HOSTS:
            self.reply(403, {'ok':False,'error':'Host local nao autorizado.'})
            return False
        origin = self.headers.get('Origin', '')
        requested_id = self.headers.get('X-Enfoque-Extension-ID', '')
        if requested_id not in ALLOWED_EXTENSION_IDS:
            self.reply(403, {'ok':False,'error':'Extensao nao reconhecida.'})
            return False
        if origin and origin != ('chrome-extension://' + requested_id):
            self.reply(403, {'ok':False,'error':'Origem nao corresponde ao ID da extensao.'})
            return False
        return True

    def authorized(self):
        if not self.trusted_extension(): return False
        token = self.headers.get('X-Enfoque-N960K-Key', '')
        if not hmac.compare_digest(token,self.state.token):
            self.reply(401,{'ok':False,'error':'Sessao local expirada; pareamento automatico necessario.'})
            return False
        return True

    def do_OPTIONS(self):
        if self.client_address[0] not in ('127.0.0.1','::1') or self.headers.get('Origin') not in ALLOWED_ORIGINS:
            self.reply(403,{'ok':False,'error':'Preflight nao autorizado.'})
            return
        if self.headers.get('Host','') not in TRUSTED_HOSTS:
            self.reply(403,{'ok':False,'error':'Host invalido.'})
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin'))
        self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type, X-Enfoque-Extension-ID, X-Enfoque-Bridge-Protocol, X-Enfoque-N960K-Key')
        self.send_header('Access-Control-Max-Age','120')
        self.send_header('Cache-Control','no-store')
        self.send_header('Vary','Origin')
        self.send_header('Content-Length','0')
        self.end_headers()
    def body(self):
        n=int(self.headers.get('Content-Length','0'))
        if n<0 or n>MAX_BODY:raise ValueError('Corpo HTTP fora do limite.')
        return json.loads(self.rfile.read(n) or b'{}')
    def do_GET(self):
        if not self.authorized():return
        path=urlsplit(self.path)
        if path.path=='/v1/health':
            with self.state.lock:
                self.state.sweep()
                active=self.state.active_job()
                # libusb_open from the status checker may fail while OUR process
                # already owns the endpoint. Do not report driver unavailable
                # for the HID connection that is deliberately being held open.
                held=bool(self.state.held_usb and getattr(self.state.held_usb,'connected',False))
                idle_last=self.state.hid_last_command_monotonic
                if self.state.hid_idle_resetting:
                    idle_phase='resetting'
                elif self.state.hid_idle_reset_error:
                    idle_phase='error'
                elif self.state.hid_idle_armed and idle_last is not None:
                    idle_phase='counting'
                elif self.state.hid_idle_last_reset_at and idle_last is None:
                    idle_phase='done'
                elif self.state.pix_hid_standby and held:
                    idle_phase='standby'
                elif active or held:
                    idle_phase='payment'
                else:
                    idle_phase='waiting'
                idle_remaining=(round(max(0,HID_IDLE_RESET_SEC-(time.monotonic()-idle_last)),1)
                    if idle_phase=='counting' else None)
                idle_count=self.state.hid_idle_restart_count
                idle_reset_at=self.state.hid_idle_last_reset_at
                terminal=({'detected':True,'driverReady':True,
                           'vendorId':'1E0E','productId':'902B',
                           'heldByAgent':True}
                          if held else None)
            if terminal is None:
                terminal=physical_usb_status()
            return self.reply(200,{'ok':True,'mode':'DRY_RUN' if self.state.dry_run else 'AOA_USB',
                                   'hostOS':HOST_OS,
                                   'usbDetection':'libusb-1.0-auto',
                                   'deviceProbeIntervalMs':800,
                                   'protocol':'AOA2','busy':bool(active),'paymentVerified':False,
                                    'terminal':terminal, 'agentReady':CONTROL.exists(),
                                    'creditContinueCalibrated':False,
                                     'creditContinueMode':'keyboard_enter',
                                     'venderNavigationMode':'keyboard_enter',
                                    'twoStageHome':True,'persistentHidDuringHome':True,'headlessPythonFromExtension':True,
                                    'hidHeldAfterSelection': bool(self.state.held_usb),
                                    'pixHidStandby': bool(self.state.pix_hid_standby and held),
                                    'usbReleaseError': self.state.usb_release_error,
                                     'hidIdlePhase':idle_phase,
                                     'hidIdleRemainingSeconds':idle_remaining,
                                     'hidIdleRestartCount':idle_count,
                                     'hidIdleLastResetAt':idle_reset_at,
                                    'pendingTimeoutSeconds':MAX_PENDING_SEC,'heartbeatTimeoutSeconds':LEASE_TIMEOUT_SEC})
        if path.path=='/v1/pix-mapper/status':
            with self.state.lock:
                self.state.sweep()
                job=self.state.active_job()
                ready=bool(job and job.get('stage')=='prepared'
                    and job.get('method')=='PIX'
                    and self.state.held_usb is not None
                    and getattr(self.state.held_usb,'connected',False)
                    and self.state.held_usb_job==job.get('jobId')
                    and not self.state.usb_inflight
                    and self.state.usb_release_error is None
                    and not self.state.hid_idle_resetting)
                current_id=job.get('jobId') if ready else None
            return self.reply(200,{'ok':True,'pixReady':ready,
                'jobId':current_id,'movementOnly':True,
                'remoteClickAllowed':False})
        if path.path=='/v1/job':
            rid=parse_qs(path.query).get('jobId',[''])[0]
            with self.state.lock:
                self.state.sweep()
                j=self.state.jobs.get(rid)
                data=None if not j else {k:v for k,v in j.items() if k not in ('amountCents',)}
            return self.reply(200,{'ok':True,**data}) if data else self.reply(404,{'ok':False,'error':'Nao encontrado.'})
        self.reply(404,{'ok':False,'error':'Rota inexistente.'})
    def do_POST(self):
        if self.path=='/v1/handshake':
            if not self.trusted_extension(): return
            if self.headers.get('X-Enfoque-Bridge-Protocol','') != '2':
                return self.reply(403,{'ok':False,'error':'Versao de protocolo nao reconhecida.'})
            if 'application/json' not in self.headers.get('Content-Type',''):
                return self.reply(415,{'ok':False,'error':'JSON obrigatorio.'})
            # Chromium/Brave extension workers with host_permissions can omit
            # Origin on a cross-origin POST. Reject foreign/non-extension origins
            # in trusted_extension(), but allow a missing Origin when the
            # private custom extension-ID and protocol headers match.
            # Browser pages sending those headers require preflight, which
            # do_OPTIONS restricts to our extension origin.
            return self.reply(200, {'ok':True,'token':self.state.token,
                                    'mode':'AUTO_LOCAL','paired':True})
        if not self.authorized():return
        try:
            payload=self.body()
            if self.path=='/v1/receipt':
                outcome=self.state.print_customer_receipt(payload)
                return self.reply(200,outcome)
            if self.path=='/v1/home':
                j,is_new=self.state.prepare_home(payload)
                return self.reply(200,{'ok':True,'jobId':j['jobId'],
                                       'stage':j['stage'],'new':is_new,
                                       'homeComplete':j['stage']=='home_ready'})
            if self.path=='/v1/start':
                j,is_new=self.state.create(payload)
                return self.reply(202,{'ok':True,'jobId':j['jobId'],'stage':j['stage'],'new':is_new})
            if self.path=='/v1/ack':
                j=self.state.ack(payload)
                return self.reply(200,{'ok':True,'jobId':j['jobId'],'stage':j['stage'],'paymentVerified':False})
            if self.path=='/v1/heartbeat':
                j=self.state.heartbeat(payload)
                return self.reply(200,{'ok':True,'jobId':j['jobId'],'stage':j['stage'],'paymentVerified':False})
            if self.path=='/v1/pix-mapper/move':
                mapped=self.state.move_pix_mapping_cursor(payload)
                return self.reply(200,{'ok':True,**mapped})
            if self.path=='/v1/navigate':
                j=self.state.navigate(payload)
                return self.reply(200,{'ok':True,'jobId':j['jobId'],'stage':j['stage'],
                                       'navigationSent':j.get('navigationSent',False),
                                       'paymentVerified':False,'terminalNotCancelled':True})
            if self.path=='/v1/cancel':
                j=self.state.cancel(payload)
                return self.reply(200,{'ok':True,'jobId':j['jobId'],'stage':j['stage'],
                                      'paymentVerified':False,'terminalNotCancelled':True,
                                      'manualReviewRequired':j.get('manualReviewRequired',False)})
            return self.reply(404,{'ok':False,'error':'Rota inexistente.'})
        except LookupError as e:self.reply(404,{'ok':False,'error':str(e)})
        except ValueError as e:self.reply(400,{'ok':False,'error':str(e)})
        except RuntimeError as e:self.reply(409,{'ok':False,'error':str(e)})
        except Exception as e:self.reply(500,{'ok':False,'error':'Erro interno: '+type(e).__name__})


def main():
    a=argparse.ArgumentParser()
    a.add_argument('--dry-run',action='store_true',help='Simula recebimento de comandos sem tocar na N960K')
    a.add_argument('--port',type=int,default=PORT)
    args=a.parse_args()
    HOME.mkdir(parents=True,exist_ok=True)
    token=automatic_local_token()
    Handler.state=State(token,dry_run=args.dry_run)
    threading.Thread(target=maintenance,args=(Handler.state,),daemon=True).start()
    httpd=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print('Enfoque N960K HTTP local em 127.0.0.1:'+str(args.port),flush=True)
    print('Modo:', 'SIMULADO - nao envia USB' if args.dry_run else 'AOA 2.0 - permite navegar ate pagamento',flush=True)
    try:httpd.serve_forever()
    finally:
        httpd.server_close()
        with Handler.state.lock:
            if Handler.state.held_usb_job:
                Handler.state._release_held_usb_locked(Handler.state.held_usb_job)

if __name__=='__main__':main()
