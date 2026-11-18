/* N960K 1.7.8.27: read-only local readiness after Windows/Brave startup.
 * This module never opens payment jobs, sends HID, or changes SIGE UI.
 * The bridge auto-starts in Windows HKCU Run and pairs without user action.
 */
(() => {
  'use strict';
  const PDV = /^https:\/\/enfoquepapelaria\.meusige\.com\.br\/sistema\/pdv(?:\/|\?|#|$)/i;
  const ALARM = 'enfoque-n960k-bridge-readiness';
  let inFlight = null;
  let lastProbe = 0;
  let lastReady = null;

  async function probe(force = false) {
    if (inFlight) return inFlight;
    const now = Date.now();
    if (!force && now - lastProbe < 4000) return;
    lastProbe = now;
    inFlight = (async () => {
      let ready = false;
      try {
        // Read-only call. Automatically pairs localhost when the Chromium
        // service worker has restarted or the runtime key has expired.
        const health = await enfoqueN960KRequest('health', {});
        ready = Boolean(health?.ok && health.agentReady &&
          health.terminal?.driverReady && health.terminal?.detected &&
          !health.busy && !health.usbReleaseError);
      } catch (_) {
        // Chrome can start before the Windows login agent. Retry on next
        // alarm or SIGE page load; never send HID or start a payment.
      }
      if (ready !== lastReady) {
        lastReady = ready;
        console.info('[Enfoque N960K] Ponte local pronta: ' + ready +
          '. Nenhum comando financeiro foi enviado.');
      }
      return ready;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  function setup() {
    try {
      chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
    } catch (_) {}
    void probe(true);
  }

  try {
    chrome.runtime.onInstalled.addListener(setup);
    chrome.runtime.onStartup.addListener(setup);
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm?.name === ALARM) void probe();
    });
    chrome.tabs.onUpdated.addListener((_id, change, tab) => {
      if (change?.status === 'complete' && PDV.test(String(tab?.url || ''))) {
        void probe(true);
      }
    });
  } catch (_) {
    // The approved TEF handlers in n960k-background.js are preserved.
  }
  setup();
})();
