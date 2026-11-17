/* Independent read-only presence watcher for SIGE pages.
 * The PDV HTML, forms, buttons and finance/TEF modules are never touched.
 * The service worker does all USB/status work.
 */
(() => {
  'use strict';
  const TYPE = 'ENFOQUE_N960K_DISCOVERY_CHECK';
  let busy = false;
  async function tick() {
    if (busy || document.visibilityState !== 'visible') return;
    busy = true;
    try {
      // Response is intentionally ignored: worker sets the extension badge.
      await chrome.runtime.sendMessage({ type:TYPE, force:false });
    } catch (_) {
      // The extension can be reloaded while a SIGE tab remains open.
    } finally {
      busy = false;
    }
  }
  tick();
  const interval = setInterval(tick, 1500);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void tick();
  });
  window.addEventListener('pagehide', () => clearInterval(interval), {once:true});
})();
