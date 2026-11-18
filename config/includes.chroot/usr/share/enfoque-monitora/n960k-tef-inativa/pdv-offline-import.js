(function () {
  'use strict';
  if (window.__ENFOQUE_OFFLINE_IMPORT_CONTENT_V2__) return;
  window.__ENFOQUE_OFFLINE_IMPORT_CONTENT_V2__ = true;

  var state = { sale: null, token: '', busy: false };
  function isPdv() { return /\/sistema\/pdv/i.test(location.pathname || ''); }
  function money(cents) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function injectBridge() {
    if (document.getElementById('enfoque-offline-import-bridge')) return;
    var s = document.createElement('script');
    s.id = 'enfoque-offline-import-bridge';
    s.src = chrome.runtime.getURL('pdv-offline-import-bridge.js');
    (document.head || document.documentElement).appendChild(s);
  }
  function ensureStyle() {
    if (document.getElementById('enfoque-offline-import-style')) return;
    var s = document.createElement('style');
    s.id = 'enfoque-offline-import-style';
    s.textContent = '#enfOfflineBtn{position:fixed;right:18px;bottom:92px;z-index:2147483000;background:#0f766e;color:#fff;border:0;border-radius:999px;padding:12px 17px;font:700 13px Arial;box-shadow:0 8px 24px #0003;cursor:pointer}#enfOfflineModal{position:fixed;inset:0;z-index:2147483646;background:#0f172acc;display:flex;align-items:center;justify-content:center;font-family:Arial}#enfOfflineCard{width:min(650px,calc(100vw - 28px));max-height:88vh;overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 30px 80px #0007}#enfOfflineCard h2{margin:0 0 8px}.enfOffRow{padding:8px 0;border-bottom:1px solid #e5e7eb}.enfOffActions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}.enfOffActions button{border:0;border-radius:9px;padding:10px 15px;font-weight:700;cursor:pointer}.enfOffPrimary{background:#0f766e;color:#fff}.enfOffSecondary{background:#e5e7eb}.enfOffLog{background:#0f172a;color:#d1fae5;border-radius:10px;padding:12px;white-space:pre-wrap;font:12px Consolas;margin-top:12px;max-height:210px;overflow:auto}.enfOffWarn{background:#fff7ed;border:1px solid #fdba74;padding:10px;border-radius:10px;margin:10px 0}';
    document.documentElement.appendChild(s);
  }
  function closeModal() { var m = document.getElementById('enfOfflineModal'); if (m) m.remove(); }
  function log(text) { var el = document.getElementById('enfOffLog'); if (el) { el.textContent += (el.textContent ? '\n' : '') + text; el.scrollTop = el.scrollHeight; } }
  function sellerSelected() {
    var sel = document.querySelector('#DropVendedor');
    if (!sel) return false;
    var opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    var txt = String(opt && opt.textContent || '').toLowerCase();
    return String(sel.value || '') !== '0' && !txt.includes('nenhum vendedor') && !!String(sel.value || '');
  }
  function decodePdfMarker(buffer) {
    var bytes = new Uint8Array(buffer), out = '', chunk = 32768;
    for (var i = 0; i < bytes.length; i += chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    var match = out.match(/%ENFOQUE-LOCAL-IMPORT:(http:\/\/127\.0\.0\.1:8876\/api\/offline-sales\/[^\r\n\s]+)/i);
    if (!match) throw new Error('Esta notinha não possui o identificador local do PDV.');
    return match[1].trim();
  }
  function renderLoaded() {
    closeModal();
    var sale = state.sale;
    var itemCount = (sale.items || []).reduce(function (a, x) { return a + Number(x.quantity || 0); }, 0);
    var m = document.createElement('div');
    m.id = 'enfOfflineModal';
    m.innerHTML = '<div id="enfOfflineCard"><h2>Importar venda offline</h2>' +
      '<div class="enfOffRow"><b>Venda:</b> ' + esc(sale.localSaleId) + '</div>' +
      '<div class="enfOffRow"><b>Data:</b> ' + esc(sale.createdAt) + '</div>' +
      '<div class="enfOffRow"><b>Itens:</b> ' + itemCount + ' unidade(s)</div>' +
      '<div class="enfOffRow"><b>Total:</b> ' + money(sale.totalCents) + '</div>' +
      '<div class="enfOffWarn">Selecione o vendedor no campo normal do MeuSIGE. A extensão enviará a venda diretamente pela API, sem abrir a tela de pagamentos.</div>' +
      '<div id="enfOffSellerState"><b>Vendedor:</b> aguardando seleção...</div>' +
      '<div id="enfOffLog" class="enfOffLog"></div>' +
      '<div class="enfOffActions"><button class="enfOffSecondary" id="enfOffCancel">Cancelar</button><button class="enfOffPrimary" id="enfOffConfirm" disabled>Confirmar vendedor e faturar</button></div></div>';
    document.body.appendChild(m);
    document.getElementById('enfOffCancel').onclick = closeModal;
    document.getElementById('enfOffConfirm').onclick = runImport;
    var timer = setInterval(function () {
      if (!document.getElementById('enfOfflineModal')) { clearInterval(timer); return; }
      var ok = sellerSelected(), sel = document.querySelector('#DropVendedor');
      var txt = sel && sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent.trim() : 'não selecionado';
      document.getElementById('enfOffSellerState').innerHTML = '<b>Vendedor:</b> ' + esc(txt);
      document.getElementById('enfOffConfirm').disabled = !ok || state.busy;
    }, 300);
  }
  async function choosePdf() {
    if (!isPdv()) { alert('Abra primeiro o PDV do MeuSIGE.'); return; }
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf,.pdf';
    input.onchange = async function () {
      try {
        var file = input.files && input.files[0]; if (!file) return;
        var url = decodePdfMarker(await file.arrayBuffer());
        var parsed = new URL(url);
        if (parsed.hostname !== '127.0.0.1' || parsed.port !== '8876') throw new Error('Identificador local inválido.');
        var response = await fetch(url, { cache: 'no-store' });
        var payload = await response.json().catch(function () { return {}; });
        if (!response.ok || !payload.ok) throw new Error(payload.message || 'Não foi possível consultar o PDV local.');
        if (payload.localStatus === 'COMPLETED') throw new Error('Esta venda já foi processada no MeuSIGE.');
        state.sale = payload.sale; state.token = parsed.searchParams.get('token') || ''; state.busy = false;
        renderLoaded();
      } catch (e) { alert('Falha ao importar notinha: ' + (e && e.message || e)); }
    };
    input.click();
  }
  async function markCompleted(result) {
    var url = 'http://127.0.0.1:8876/api/offline-sales/' + encodeURIComponent(state.sale.localSaleId) + '/complete';
    var response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: state.token, sigeSaleId: String(result && result.vendaId || ''), nfceId: String(result && result.fiscal && (result.fiscal.NFCeId || result.fiscal.Id) || '') }) });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || !payload.ok) throw new Error(payload.message || 'Não foi possível marcar a venda local como concluída.');
  }
  async function runImport() {
    if (state.busy || !state.sale) return;
    if (!sellerSelected()) { alert('Selecione o vendedor no MeuSIGE.'); return; }
    state.busy = true;
    var confirm = document.getElementById('enfOffConfirm'), cancel = document.getElementById('enfOffCancel');
    if (confirm) confirm.disabled = true; if (cancel) cancel.disabled = true;
    try {
      log('Importação direta iniciada. A tela de pagamentos não será aberta.');
      var result = await new Promise(function (resolve, reject) {
        var timeout = setTimeout(function () { window.removeEventListener('message', listener); reject(new Error('Tempo excedido. Não repita automaticamente; verifique se a venda foi criada.')); }, 120000);
        function listener(ev) {
          var d = ev.data || {};
          if (d.source !== 'ENFOQUE_OFFLINE_IMPORT_PAGE' || d.type !== 'DIRECT_IMPORT_RESULT') return;
          clearTimeout(timeout); window.removeEventListener('message', listener);
          if (d.payload && d.payload.ok) resolve(d.payload.result || {}); else reject(new Error(d.payload && d.payload.message || 'Falha ao importar a venda.'));
        }
        window.addEventListener('message', listener);
        window.postMessage({ source: 'ENFOQUE_OFFLINE_IMPORT_CONTENT', type: 'RUN_DIRECT_IMPORT', sale: state.sale }, '*');
      });
      await markCompleted(result);
      log('SUCESSO: venda criada e NFC-e autorizada.');
      alert('Venda offline faturada com sucesso.'); closeModal();
    } catch (e) {
      log('ERRO: ' + (e && e.message || e)); alert('Importação não concluída: ' + (e && e.message || e));
      state.busy = false; if (confirm) confirm.disabled = false; if (cancel) cancel.disabled = false;
    }
  }
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.source === 'ENFOQUE_OFFLINE_IMPORT_PAGE' && d.type === 'IMPORT_LOG' && d.payload && d.payload.message) log(d.payload.message);
  });
  function mount() {
    if (!isPdv()) { var old = document.getElementById('enfOfflineBtn'); if (old) old.remove(); return; }
    ensureStyle(); injectBridge();
    if (document.getElementById('enfOfflineBtn')) return;
    var b = document.createElement('button'); b.id = 'enfOfflineBtn'; b.type = 'button'; b.textContent = 'Importar venda offline'; b.onclick = choosePdf; document.body.appendChild(b);
  }
  setInterval(mount, 1000); mount();
})();
