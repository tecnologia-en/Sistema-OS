/* Enfoque N960K USB discovery (read-only, Windows/Linux).
 * Does not modify SIGE DOM, transaction flow, HID or TEF bridge.
 * Windows: standalone setupapi probe; fallback to EXISTING read-only /v1/health.
 * Linux: standalone sysfs probe. No dependence on Enfoque OS.
 * The browser cannot silently claim USB; the standalone probe only enumerates.
 */
(() => {
  'use strict';
  const NAME = 'ENFOQUE_N960K_DISCOVERY';
  const SERVICE = 'http://127.0.0.1:8878/v1/discovery';
  const SIGE = /^https:\/\/enfoquepapelaria\.meusige\.com\.br\//i;
  const ALARM = 'enfoque-n960k-readonly-presence';
  let cached = null;
  let inflight = null;
  let scannedAt = 0;
  let priorBadge = '';
  let osPromise = null;

  const platform = () => {
    if (!osPromise) {
      osPromise = chrome.runtime.getPlatformInfo().then(x => {
        if (x?.os === 'win') return 'windows';
        if (x?.os === 'linux') return 'linux';
        return 'unsupported';
      }).catch(() => 'unsupported');
    }
    return osPromise;
  };

  async function scannerProbe(expectedOs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1400);
    try {
      const response = await fetch(SERVICE, {
        method: 'GET',
        headers: { 'X-Enfoque-Extension-ID': chrome.runtime.id },
        targetAddressSpace: 'loopback',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (!response.ok) return null;
      const d = await response.json();
      if (d?.ok !== true || d.schema !== 1 ||
          d.vendorId !== '1E0E' || d.productId !== '902B' ||
          d.os !== expectedOs || d.scannerReady !== true ||
          typeof d.detected !== 'boolean') return null;
      return { connected:d.detected, source:d.source,
        device:'1E0E:902B', detectorInstalled:true, paymentReady:false };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function legacyWindowsHealth() {
    // This calls only existing "health", never "home", "start", "navigate"
    // or anything that can send HID commands. It reuses the same safe
    // auto-pairing logic already present in n960k-background.js.
    try {
      const d = await enfoqueN960KRequest('health', {});
      if (d?.ok !== true || typeof d.terminal?.detected !== 'boolean') return null;
      return { connected:d.terminal.detected,
        source:'windows-bridge-health', device:'1E0E:902B',
        detectorInstalled:false, paymentReady:Boolean(
          d.agentReady && d.terminal.driverReady && !d.usbReleaseError),
        bridgeReady:Boolean(d.agentReady && d.terminal.driverReady),
      };
    } catch (_) {
      return null;
    }
  }

  async function grantedWebUsb() {
    // getDevices() never displays a permission prompt. Only use already
    // granted devices; never open the device or claim an interface.
    try {
      if (!navigator.usb?.getDevices) return null;
      const devices = await navigator.usb.getDevices();
      const seen = devices.some(d => d.vendorId === 0x1E0E &&
        d.productId === 0x902B);
      if (!seen) return null;
      return { connected:true, source:'webusb-authorized',
        device:'1E0E:902B', detectorInstalled:false, paymentReady:false };
    } catch (_) {
      return null;
    }
  }

  async function badge(status) {
    const word = status.connected ? 'USB' :
      (status.source === 'offline' ? '?' : 'OFF');
    const title = status.connected
      ? ('N960K conectada via USB (' + status.os +
         '). Detector: ' + status.source +
         '. A presenca USB nao confirma pagamento.')
      : status.source === 'offline'
        ? ('N960K: detector local ausente no ' + status.os +
           '. Instale o detector independente Windows/Linux.')
        : ('N960K nao encontrada em USB (' + status.os + ').');
    const sig = word + '|' + title;
    if (priorBadge === sig) return;
    priorBadge = sig;
    try {
      await chrome.action.setBadgeText({ text:word });
      await chrome.action.setBadgeBackgroundColor({
        color:status.connected ? '#128963' :
          (word === 'OFF' ? '#576571' : '#a77432'),
      });
      await chrome.action.setTitle({ title });
    } catch (_) {}
  }

  async function refresh(force = false) {
    if (inflight) return inflight;
    if (!force && cached && Date.now() - scannedAt < 1050) return cached;
    inflight = (async () => {
      const os = await platform();
      let found = os === 'windows' || os === 'linux'
        ? await scannerProbe(os) : null;
      if (!found && os === 'windows') found = await legacyWindowsHealth();
      if (!found) found = await grantedWebUsb();
      const status = Object.freeze({
        ok:true, os, connected: Boolean(found?.connected),
        device:'1E0E:902B',
        source:found?.source || 'offline',
        detectorInstalled: Boolean(found?.detectorInstalled),
        // Detection is never a signal of financial approval.
        paymentAuthorized:false,
        paymentReady:Boolean(found?.paymentReady),
        scannedAt:Date.now(),
      });
      cached = status;
      scannedAt = Date.now();
      await badge(status);
      return status;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  function schedule() {
    try {
      // Chrome 120+ allows periodic 30s alarm. When the SIGE tab is
      // visible, n960k-discovery-watch.js requests scans every 1.5s.
      chrome.alarms.create(ALARM, { periodInMinutes:0.5 });
    } catch (_) {}
  }

  try {
    chrome.runtime.onInstalled.addListener(() => {
      schedule();
      void refresh(true);
    });
    chrome.runtime.onStartup.addListener(() => {
      schedule();
      void refresh(true);
    });
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === ALARM) void refresh();
    });
    chrome.tabs.onActivated.addListener(() => { void refresh(); });
    chrome.tabs.onUpdated.addListener((_tab, change, tab) => {
      if (change?.status === 'complete' && SIGE.test(tab?.url || ''))
        void refresh(true);
    });
    chrome.runtime.onMessage.addListener((msg, sender, respond) => {
      if (msg?.type !== NAME+'_CHECK') return false;
      const address = String(sender.tab?.url || sender.url || '');
      if (!SIGE.test(address)) {
        respond({ok:false,error:'Origem nao autorizada.'});
        return false;
      }
      refresh(Boolean(msg.force))
        .then(result => respond(result))
        .catch(_ => respond({ok:false,error:'Detector indisponivel.'}));
      return true;
    });
    if (navigator.usb?.addEventListener) {
      // If WebUSB permission was granted previously, connect/disconnect
      // events offer an even faster read-only refresh.
      navigator.usb.addEventListener('connect', () => { void refresh(true); });
      navigator.usb.addEventListener('disconnect', () => { void refresh(true); });
    }
  } catch (_) {}
  schedule();
  void refresh(true);
})();
