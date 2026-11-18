// =============================================================
// ENFOQUE - EXTENSÃO ATIVA EM TODO SIGE, EXCETO DANFE NFC-e
// =============================================================
(() => {
  const __ENFOQUE_BLOCK_DANFE__ =
    location.hostname === "enfoquepapelaria.meusige.com.br" &&
    location.pathname.startsWith("/sistema/danfenfce");
  if (__ENFOQUE_BLOCK_DANFE__) return;



// =============================================================
// ENFOQUE - CONFIG/POLICY: ocultar "Cancelar Pedido" por usuário
// =============================================================
let __enfoqueCancelPolicyDebounce = null;

function __enfoqueScheduleCancelPolicy(ms = 200) {
  try {
    if (__enfoqueCancelPolicyDebounce) clearTimeout(__enfoqueCancelPolicyDebounce);
    __enfoqueCancelPolicyDebounce = setTimeout(() => {
      __enfoqueCancelPolicyDebounce = null;
      __enfoqueApplyCancelButtonPolicy();
    }, ms);
  } catch (_) {}
}

async function __enfoqueApplyCancelButtonPolicy() {
  try {
    // Verificar se estamos na página de Vendas/Edit
    const isVendasEditPage = location.pathname.startsWith("/sistema/Vendas/Edit");
    
    // Se não estamos na página de Vendas/Edit, não fazer nada
    if (!isVendasEditPage) return;
    
    const btn = document.querySelector("#btnCancelarPedido");
    if (!btn) return;

    // REMOVER COMPLETAMENTE o botão de Cancelar Pedido
    // O usuário solicitou a remoção total deste botão
    btn.remove();
    console.log("[Enfoque] Botão 'Cancelar Pedido' removido da página Vendas/Edit");
  } catch (_) {}
}


function __enfoqueInitCancelPolicyWatcher() {
  try {
    if (window.__enfoqueCancelPolicyWatcherInit) return;
    window.__enfoqueCancelPolicyWatcherInit = true;

    // roda já
    __enfoqueScheduleCancelPolicy(50);

    // observa SPA do SIGE
    const mo = new MutationObserver(() => __enfoqueScheduleCancelPolicy(200));
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // fallback leve
    setInterval(() => __enfoqueScheduleCancelPolicy(0), 4000);
  } catch (_) {}
}
__enfoqueInitCancelPolicyWatcher();

// =============================================================
// ENFOQUE - INJEÇÃO (PAGE WORLD) + BRIDGE (API)
// =============================================================
let __enfoqueInjectDone = false;
function __enfoqueRequestInjectOnce() {
  try {
    if (__enfoqueInjectDone) return;
    __enfoqueInjectDone = true;
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inject-api.js");
    s.onload = function () { try { this.remove(); } catch(_){} };
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {
    console.warn("[Enfoque] Falha ao injetar inject-api.js:", e);
  }
}
__enfoqueRequestInjectOnce();

// Bridge: recebe token capturado pelo page-world e também o template do ReportProdutosPrecoVenda
window.addEventListener("message", function (ev) {
  // Allow messages from window (page context) and from the extension
  if (ev.source !== window && ev.source !== null) return;

  // Token (SIGE_BEARER_FOUND / SIGE_TOKEN)
  function __enfoqueSaveSigeToken(token, sourceDetail) {
    try {
      const isHeader = String(sourceDetail || '').toLowerCase().includes('header');
      const primaryKey = isHeader ? 'sige_api_token_header' : 'sige_api_token';
      chrome.storage.local.get(['sige_api_token_header', primaryKey], (cur) => {
        try {
          if (cur && cur[primaryKey] === token) {
            console.log('[Enfoque] Token já é o mesmo, ignorando.');
            return;
          }
          // Nao deixa token de localStorage/cookie sobrescrever token capturado de header.
          if (!isHeader && cur && cur.sige_api_token_header) {
            console.log('[Enfoque] Token não-header ignorado porque já existe token de Authorization header.');
            return;
          }
        } catch (_) {}

        const data = {};
        data[primaryKey] = token;
        data[primaryKey + '_updated_at'] = new Date().toISOString();
        data.sige_api_token_last_source = isHeader ? 'authorization-header' : 'storage-or-cookie';
        chrome.storage.local.set(data, function () {
          try { console.log('🔑 Token SIGE salvo (' + data.sige_api_token_last_source + '):', token.substring(0, 30) + '...'); } catch (_) {}
        });
      });
    } catch (_) {}
  }

  // Debug: Log all incoming messages
  if (ev.data && (ev.data.type || ev.data.source)) {
    console.log("[Enfoque] Mensagem recebida:", ev.data.type || ev.data.source, ev.data.bearer ? "(com bearer)" : "");
  }

  // Novo: evento preferido
  if (ev.data && ev.data.type === "SIGE_BEARER_FOUND") {
    const tokenRaw = ev.data.bearer;
    console.log("[Enfoque] SIGE_BEARER_FOUND recebido:", tokenRaw ? tokenRaw.substring(0, 30) + "..." : "nulo");
    const token = __enfoqueAcceptSigeBearer(tokenRaw);
    if (!token) {
      try { console.warn("⚠️ [Enfoque] Bearer ignorado (não-SIGE ou inválido).", tokenRaw ? tokenRaw.substring(0, 20) : "nulo"); } catch (_) {}
      return;
    }
    __enfoqueSaveSigeToken(token, ev.data.sourceDetail || ev.data.captureSource || 'unknown');
    return;
  }

  // Legado: compat
  if (ev.data && ev.data.source === "SIGE_TOKEN") {
    const tokenRaw = ev.data.token;
    console.log("[Enfoque] SIGE_TOKEN legado recebido:", tokenRaw ? tokenRaw.substring(0, 30) + "..." : "nulo");
    const token = __enfoqueAcceptSigeBearer(tokenRaw);
    if (!token) {
      try { console.warn("⚠️ [Enfoque] Bearer legado ignorado (não-SIGE ou inválido).", tokenRaw ? tokenRaw.substring(0, 20) : "nulo"); } catch (_) {}
      return;
    }
    __enfoqueSaveSigeToken(token, ev.data.sourceDetail || ev.data.captureSource || 'legacy');
    return;
  }
  // Template do relatório (para evitar erro 500 por payload)
  if (ev.data && ev.data.source === "ENFOQUE_REPORT_PRECO_TEMPLATE") {
    try {
      const payload = ev.data.payload;
      if (!payload || typeof payload !== "object") return;
      chrome.storage.local.set({ sige_report_preco_template: payload }, function () {
        // silencioso
      });
    } catch (e) {}
  }
});

// Pending map para respostas da API (page-world)
const __enfoquePending = new Map();
window.addEventListener("message", function (ev) {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || typeof d !== "object") return;

  if (d.type === "ENFOQUE_QUERY_RESULT" || d.type === "ENFOQUE_VALIDATE_RESULT" || d.type === "ENFOQUE_PRECO_QUERY_RESULT" || d.type === "ENFOQUE_PEDIDOS_QUERY_RESULT") {
    const entry = __enfoquePending.get(d.requestId);
    if (!entry) return;
    __enfoquePending.delete(d.requestId);
    clearTimeout(entry.timer);
    entry.resolve(d);
  }
});

function __enfoqueCallPageWorld(type, payload, timeoutMs) {
  __enfoqueRequestInjectOnce();
  timeoutMs = timeoutMs || 12000;
  return new Promise((resolve) => {
    const requestId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = setTimeout(() => {
      __enfoquePending.delete(requestId);
      resolve({ ok: false, error: "NO_RESPONSE_FROM_PAGE" });
    }, timeoutMs);

    __enfoquePending.set(requestId, { resolve, timer });

    try {
      window.postMessage({ type, requestId, ...payload }, "*");
    } catch (e) {
      clearTimeout(timer);
      __enfoquePending.delete(requestId);
      resolve({ ok: false, error: "POSTMESSAGE_FAILED" });
    }
  });
}

function __enfoqueNormalizeBearer(v) {
  if (!v) return null;
  v = String(v).trim();
  if (!v) return null;
  if (/^Bearer\s+/i.test(v)) return "Bearer " + v.replace(/^Bearer\s+/i, "").trim();
  if (/^[A-Za-z0-9\-\._~\+\/]+=*$/.test(v) && v.length > 20) return "Bearer " + v;
  return null;
}


function __enfoqueIsBlockedBearer(v) {
  try {
    const t = __enfoqueNormalizeBearer(v);
    if (!t) return true;
    const raw = t.replace(/^Bearer\s+/i, "").trim();
    // Bloqueia tokens que claramente NÃO são do SIGE (ex.: GitHub PAT)
    if (/^github_pat_/i.test(raw)) return true;
    if (/^ghp_/i.test(raw)) return true;
    if (/^gho_/i.test(raw)) return true;
    if (/^ghu_/i.test(raw)) return true;
    if (/^ghs_/i.test(raw)) return true;
    if (/^ghr_/i.test(raw)) return true;
    return false;
  } catch (_) {
    return true;
  }
}

function __enfoqueAcceptSigeBearer(v) {
  const t = __enfoqueNormalizeBearer(v);
  if (!t) return null;
  if (__enfoqueIsBlockedBearer(t)) return null;
  return t;
}

function __enfoqueGetToken(cb) {
  chrome.storage.local.get(["sige_api_token_manual", "sige_api_token"], (res) => {
    const manual = __enfoqueAcceptSigeBearer(res && res.sige_api_token_manual);
    const autoT = __enfoqueAcceptSigeBearer(res && res.sige_api_token);
    cb(manual || autoT || null);
  });
}



/* (OBSOLETO no isolated world) SIGE TOKEN SNIFFER (HEADER)
 * Mantido por compatibilidade, mas o sniffer real roda em inject-api.js
 */
(function(){
  if (window.__sigeTokenSnifferInjected) return;
  window.__sigeTokenSnifferInjected = true;

  function normalize(v){
    if(!v) return null;
    v = String(v).trim();
    if(!v) return null;
    if (/^Bearer\s+/i.test(v)) return 'Bearer ' + v.replace(/^Bearer\s+/i,'').trim();
    if (/^[a-f0-9]{16,}$/i.test(v)) return 'Bearer ' + v;
    return null;
  }
  function report(t){
    try{
      window.postMessage({ source:'SIGE_TOKEN', token:t }, '*');
    }catch(e){}
  }

  const _fetch = window.fetch;
  window.fetch = function(input, init){
    try{
      const h = init && init.headers;
      let auth = null;
      if (h){
        auth = (h.get && (h.get('authorization')||h.get('Authorization'))) || h['authorization'] || h['Authorization'];
      }
      const t = normalize(auth);
      if (t) report(t);
    }catch(e){}
    return _fetch.apply(this, arguments);
  };

  const _set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(k,v){
    try{
      if (k && String(k).toLowerCase()==='authorization'){
        const t = normalize(v);
        if (t) report(t);
      }
    }catch(e){}
    return _set.apply(this, arguments);
  };
})();


;


// =============================================================
// ASSISTENTE SIGE INTELIGENTE - CONTENT SCRIPT
// Versão para Extensão Chrome (AUTOMÁTICO - CORRIGIDA)
// Baseado na sua versão anterior + correções de backup
// + menu lateral + menu de contexto (botão direito).
// =============================================================

// =============================================================
// 1. VARIÁVEIS E ESTADOS
// =============================================================

let alertMode = false;
let restoreBannerShown = false;
let secondsInEdit = 0;
let pauseBackupUntil = 0;
let lastAlertValue = null;

let pdvMode = false;
let secondsInPdv = 0;

// =============================================================
// ENFOQUE - Ajustes automáticos (Pessoas/Edit e PDV)
// =============================================================
let __enfoqueLimiteCreditoObserver = null;
let __enfoqueLimiteCreditoUserTouched = false;

let pdvBackupData = null;
let lastPdvBackupHash = "";

// PDV - monitor de vendedor
let pdvVendedorLastWasNenhum = false;
let pdvVendorAlertShown = false;
let pdvVendorAlertTimer = null; // último estado conhecido quando o select estava visível
let pdvNomeEscolaClearStarted = false;
let pdvNomeEscolaObserver = null;

// Estoque Mov Entre Dep00f3sitos - destaque azul do 00faltimo produto digitado
let __estoqueProdMonitorActive = false;
let __estoqueProdMonitorTimer = null;
let __estoqueProdInputEl = null;
let __estoqueLastTypedText = "";
let __estoquePrevValue = "";
let __estoqueLastTypedAt = 0;

// EstoqueMovEntreDepositos/Edit - contador de itens (linhas)
let __enfoqueMovCountActive = false;
let __enfoqueMovCountObserver = null;
let __enfoqueMovCountBadgeEl = null;
let __enfoqueMovCostBadgeEl = null;
let __enfoqueMovCountDebounceTimer = null;
let __enfoqueMovCountInputListenerBound = false;
let __enfoqueMovCountInputListenerFn = null;

// =============================================================
// VENDAS/EDIT — Exportar itens (de uma venda) e Importar (em nova venda)
// =============================================================
const __ENFOQUE_VENDAS_EXPORT_KEY__ = "enfoque_vendas_export_items";
let __enfoqueVendasImportRunning = false;

function __enfoqueStripCodigoFromDescricao(raw) {
  const s = String(raw || "").trim();
  if (!s) return { codigo: null, nome: "" };

  // Caso clássico: "789... - NOME - ..."
  const m = s.match(/^\s*(\d+)\s*-\s*(.+)$/);
  if (m) return { codigo: m[1], nome: (m[2] || "").trim() };

  // Fallback: se tiver " - " e o primeiro pedaço for numérico
  const parts = s.split(" - ");
  if (parts.length >= 2 && /^\d+$/.test((parts[0] || "").trim())) {
    return {
      codigo: (parts[0] || "").trim(),
      nome: parts.slice(1).join(" - ").trim()
    };
  }

  return { codigo: null, nome: s };
}

function __enfoqueParseQtd(raw) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  // quantidade geralmente é inteira
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function __enfoqueGetVendasProdutosFromDOM() {
  const container = document.querySelector("#produtos");
  if (!container) return [];

  const tbodies = Array.from(container.querySelectorAll('tbody[ng-repeat="item in dados.Produtos"], tbody[ng-repeat]'));
  const items = [];

  tbodies.forEach((tbody) => {
    const descEl = tbody.querySelector('input[id="rptProdutoDescricao"], input[id*="rptProdutoDescricao"]');
    const qtdEl = tbody.querySelector('input[id="rptProdutoQuantidade"], input[id*="rptProdutoQuantidade"]');
    const rawDesc = (descEl && (descEl.value || descEl.getAttribute("value") || "")) || (tbody.textContent || "");
    const rawQtd = (qtdEl && (qtdEl.value || qtdEl.getAttribute("value") || "")) || "";

    const d = String(rawDesc || "").trim();
    if (!d) return;
    const { codigo, nome } = __enfoqueStripCodigoFromDescricao(d);
    const qtd = __enfoqueParseQtd(rawQtd);

    items.push({
      codigo: codigo,
      descricao_raw: d,
      nome: nome,
      quantidade: qtd
    });
  });

  return items;
}

function __enfoqueShowToast(title, msg) {
  try {
    const panel = document.getElementById("sige-assistente-panel");
    if (!panel) {
      // fallback simples
      console.log(`[SIGE Assistente] ${title}: ${msg}`);
      return;
    }
    const t = panel.querySelector("#sige-toast");
    if (!t) return;
    const titleEl = panel.querySelector("#sige-toast-title");
    const msgEl = panel.querySelector("#sige-toast-msg");
    if (titleEl) titleEl.textContent = String(title || "Aviso");
    if (msgEl) msgEl.textContent = String(msg || "");
    t.classList.add("show");
    setTimeout(() => { try { t.classList.remove("show"); } catch(_){} }, 2400);
  } catch (_) {}
}

function __enfoqueRemoveElById(id) {
  try {
    const el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (_) {}
}

function __enfoqueEnsureVendasExportBtn() {
  const id = "enfoque-vendas-export-btn";
  if (document.getElementById(id)) return;

  const btn = document.createElement("button");
  btn.id = id;
  btn.type = "button";
  btn.textContent = "⬇️ Baixar itens";
  btn.style.position = "fixed";
  btn.style.top = "14px";
  btn.style.right = "14px";
  btn.style.zIndex = "9999999";
  btn.style.padding = "8px 10px";
  btn.style.borderRadius = "12px";
  btn.style.border = "1px solid rgba(148,163,184,.30)";
  btn.style.background = "rgba(2,6,23,.35)";
  btn.style.backdropFilter = "blur(10px)";
  btn.style.color = "#e5e7eb";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "12px";
  btn.style.fontWeight = "700";
  btn.style.opacity = "0.9";

  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.9"; });

  btn.addEventListener("click", () => {
    try {
      const items = __enfoqueGetVendasProdutosFromDOM();
      if (!items.length) {
        __enfoqueShowToast("Vendas", "Não encontrei itens em #produtos.");
        return;
      }

      const payload = {
        savedAt: Date.now(),
        url: String(location.href || ""),
        items
      };

      chrome.storage.local.set({ [__ENFOQUE_VENDAS_EXPORT_KEY__]: payload }, () => {
        __enfoqueShowToast("Vendas", `Itens salvos: ${items.length}.`);
      });
    } catch (e) {
      console.error("[SIGE Assistente] Falha ao exportar itens de Vendas/Edit:", e);
      __enfoqueShowToast("Vendas", "Erro ao exportar itens.");
    }
  });

  document.body.appendChild(btn);
}

function __enfoqueEnsureVendasImportBtnInPanel() {
  const id = "enfoque-vendas-import-btn";
  const panel = document.getElementById("sige-assistente-panel");
  if (!panel) return false;
  const sidebar = panel.querySelector(".sidebar");
  if (!sidebar) return false;
  if (panel.querySelector(`#${id}`)) return true;

  const btn = document.createElement("button");
  btn.id = id;
  btn.type = "button";
  btn.textContent = "📥 Importar itens";
  btn.style.margin = "8px 0 10px";
  btn.style.width = "44px";
  btn.style.height = "44px";
  btn.style.borderRadius = "16px";
  btn.style.border = "1px solid rgba(148,163,184,.30)";
  btn.style.background = "rgba(255,255,255,.05)";
  btn.style.color = "#e5e7eb";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "10px";
  btn.style.fontWeight = "800";
  btn.style.lineHeight = "1.05";
  btn.style.display = "flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.textAlign = "center";
  btn.title = "Importar itens salvos para esta venda";

  btn.addEventListener("click", async () => {
    if (__enfoqueVendasImportRunning) {
      __enfoqueShowToast("Vendas", "Importação já em andamento...");
      return;
    }
    __enfoqueVendasImportRunning = true;
    try {
      const res = await new Promise((resolve) => {
        try {
          chrome.storage.local.get([__ENFOQUE_VENDAS_EXPORT_KEY__], resolve);
        } catch (_) { resolve({}); }
      });
      const payload = res && res[__ENFOQUE_VENDAS_EXPORT_KEY__];
      const items = payload && payload.items;
      if (!items || !Array.isArray(items) || !items.length) {
        __enfoqueShowToast("Vendas", "Nenhum item salvo. Abra uma venda e clique em 'Baixar itens'.");
        return;
      }

      ensureHumanType();

      const inputSel = "#LocalizarProdutoNew_Produto";
      const input = document.querySelector(inputSel);
      if (!input) {
        __enfoqueShowToast("Vendas", "Campo #LocalizarProdutoNew_Produto não encontrado.");
        return;
      }

      const getTbodiesProdutos = () => {
  const prod = document.querySelector("#produtos");
  if (!prod) return [];
  // Estrutura mais comum no SIGE: um <tbody ng-repeat="item in dados.Produtos"> por item
  return Array.from(prod.querySelectorAll('tbody[ng-repeat="item in dados.Produtos"]'));
};

const getTbodiesFallback = () => {
  const prod = document.querySelector("#produtos");
  if (!prod) return [];
  // Fallback permissivo (ainda restrito ao grid de produtos)
  return Array.from(prod.querySelectorAll('#produtos tbody[ng-repeat], #produtos tbody'));
};

const waitFor = (fn, timeoutMs = 12000, stepMs = 200) =>
  new Promise((resolve) => {
    const start = Date.now();
    const t = setInterval(() => {
      let ok = false;
      try { ok = !!fn(); } catch (_) {}
      if (ok) { clearInterval(t); resolve(true); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(t); resolve(false); }
    }, stepMs);
  });

const pressEnter = (el) => {
  try {
    const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
    el.dispatchEvent(ev);
  } catch (_) {}
  try {
    const ev2 = new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
    el.dispatchEvent(ev2);
  } catch (_) {}
};

const findTbodyByCodigo = (codigo) => {
  try {
    const codWant = String(codigo || "").trim();
    if (!codWant) return null;

    const tbNow = getTbodiesProdutos();
    const tbAll = tbNow.length ? tbNow : getTbodiesFallback();

    for (const tb of tbAll) {
      const descEl = tb.querySelector('input[id="rptProdutoDescricao"], input[id*="rptProdutoDescricao"]');
      const raw = descEl ? (descEl.value || descEl.getAttribute("value") || "") : "";
      const d = String(raw || "").trim();
      if (!d) continue;
      const parsed = __enfoqueStripCodigoFromDescricao(d);
      const cod = parsed && parsed.codigo ? String(parsed.codigo).trim() : "";
      if (cod && cod === codWant) return tb;
    }
  } catch (_) {}
  return null;
};

const setQtyInTbody = (tb, qtd) => {
  try {
    if (!tb || !(qtd > 0)) return false;

    // Em vendas, o campo padrão é rptProdutoQuantidade; kits podem ter rptProdutoKitQuantidade
    const qEl =
      tb.querySelector('input[id="rptProdutoQuantidade"], input[id*="rptProdutoQuantidade"]') ||
      tb.querySelector('input[id="rptProdutoKitQuantidade"], input[id*="rptProdutoKitQuantidade"]');

    if (!qEl) return false;

    try { qEl.focus(); } catch (_) {}
    qEl.value = String(qtd);
    qEl.dispatchEvent(new Event("input", { bubbles: true }));
    qEl.dispatchEvent(new Event("change", { bubbles: true }));
    try { qEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); } catch (_) {}
    try { qEl.dispatchEvent(new Event("blur", { bubbles: true })); } catch (_) {}
    try { qEl.blur(); } catch (_) {}
    return true;
  } catch (_) {}
  return false;
};

for (let i = 0; i < items.length; i++) {
  const it = items[i] || {};
  const nome = String(it.nome || "").trim();
  const qtd = Number(it.quantidade || 0);
  const codigo = String(it.codigo || "").trim();
  if (!nome) continue;

  const before = (getTbodiesProdutos().length || getTbodiesFallback().length);

  // 1) digita o nome e confirma (Enter)
  try {
    humanType(inputSel, nome);
    pressEnter(input);
  } catch (_) {
    input.value = nome;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    pressEnter(input);
  }

  // 2) espera aparecer a linha do item (por código se houver; senão por aumento de linhas)
  await waitFor(() => {
    if (codigo) return !!findTbodyByCodigo(codigo);
    const now = getTbodiesProdutos();
    if (now.length) return now.length > before;
    const fb = getTbodiesFallback();
    return fb.length > before;
  }, 14000, 250);

  // 3) escolhe o tbody da linha do item recém inserido
  let targetTbody = codigo ? findTbodyByCodigo(codigo) : null;
  if (!targetTbody) {
    const tbNow = getTbodiesProdutos();
    const tbAll = tbNow.length ? tbNow : getTbodiesFallback();
    targetTbody = tbAll[before] || tbAll[tbAll.length - 1] || null;
  }

  // 4) coloca a quantidade na MESMA linha do item
  if (qtd > 0) {
    let okSet = setQtyInTbody(targetTbody, qtd);

    // reforço: tenta por código por alguns segundos
    if (!okSet && codigo) {
      await waitFor(() => {
        const tb = findTbodyByCodigo(codigo);
        if (!tb) return false;
        return setQtyInTbody(tb, qtd);
      }, 6000, 250);
    }
  }

  // respiro para o Angular
  await new Promise((r) => setTimeout(r, 450));
}

__enfoqueShowToast("Vendas", `Importação concluída (${items.length} itens).`);
    } catch (e) {
      console.error("[SIGE Assistente] Falha ao importar itens em Vendas/Edit:", e);
      __enfoqueShowToast("Vendas", "Erro ao importar itens.");
    } finally {
      __enfoqueVendasImportRunning = false;
    }
  });

  const brand = sidebar.querySelector(".brand");
  if (brand) brand.insertAdjacentElement("afterend", btn);
  else sidebar.insertBefore(btn, sidebar.firstChild);
  return true;
}

function __enfoqueUpdateVendasButtons(isVendasEditRoot, isVendasEditWithId) {
  // Export: só em /Vendas/Edit/<id>
  if (isVendasEditWithId) {
    __enfoqueEnsureVendasExportBtn();
  } else {
    __enfoqueRemoveElById("enfoque-vendas-export-btn");
  }

  // Import: só em /Vendas/Edit (sem id) e dentro do painel lateral
  if (isVendasEditRoot) {
    const ok = __enfoqueEnsureVendasImportBtnInPanel();
    if (!ok) {
      // painel pode não ter sido injetado ainda
      setTimeout(() => { try { __enfoqueEnsureVendasImportBtnInPanel(); } catch (_) {} }, 800);
      setTimeout(() => { try { __enfoqueEnsureVendasImportBtnInPanel(); } catch (_) {} }, 2200);
    }
  } else {
    // remove botão do painel quando sair
    try {
      const panel = document.getElementById("sige-assistente-panel");
      if (panel) {
        const b = panel.querySelector("#enfoque-vendas-import-btn");
        if (b && b.parentNode) b.parentNode.removeChild(b);
      }
    } catch (_) {}
  }

  // Exportar produtos (BaterProd): aparece em qualquer Vendas/Edit
  if (isVendasEditRoot || isVendasEditWithId) {
    __enfoqueEnsureVendasExportarBtn();
  } else {
    __enfoqueRemoveElById("enfoque-vendas-exportar-btn");
  }
}


// Carrega backup PDV salvo (armazenamento Chrome)
chrome.storage.local.get(["sige_pdv_backup"], (res) => {
  if (res.sige_pdv_backup) {
    pdvBackupData = res.sige_pdv_backup;
    // silencioso
    try {
      if (pdvBackupData && Array.isArray(pdvBackupData.items)) {
        lastPdvBackupHash = hashPdvItems(pdvBackupData.items);
      }
    } catch (e) {}
  }
});

let backupData = null;

// Carrega backup salvo (armazenamento Chrome)
chrome.storage.local.get(["sige_backup"], (res) => {
  if (res.sige_backup) {
    backupData = res.sige_backup;
    console.log("💾 Backup carregado na memória:", backupData);
  }
});

// Timer interno para contar tempo na tela de edição
setInterval(() => {
  if (alertMode) secondsInEdit++;
  if (pdvMode) secondsInPdv++;
}, 1000);

// =============================================================
// 2. OBSERVAR MUDANÇA DE URL EM SPA (SIGE USA ANGULAR)
// =============================================================

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onUrlChange(location.href);
  }
}, 500);

// Primeira leitura (defer para evitar TDZ com variáveis declaradas mais abaixo)
setTimeout(() => { try { onUrlChange(location.href); } catch (e) { console.warn('[SIGE Assistente] onUrlChange init erro:', e); } }, 0);

// Sempre injeta o menu lateral (em qualquer tela SIGE)
injectAssistenteFloatingPanel();
// Retry de injeção: se por algum motivo a primeira tentativa falhar (SPA/DOM),
setTimeout(() => {
  try {
    if (!document.getElementById("sige-assistente-toggle")) {
      injectAssistenteFloatingPanel();
    }
  } catch (_) {}
}, 1500);

setTimeout(() => {
  try {
    if (!document.getElementById("sige-assistente-toggle")) {
      injectAssistenteFloatingPanel();
    }
  } catch (_) {}
}, 5000);


// =============================================================
// 3. FUNÇÃO PRINCIPAL DE DETECÇÃO DE URL
// =============================================================

function onUrlChange(url) {
  try { if (!String(url).includes("/sistema/pdv")) resetNomeEscolaClearState(); } catch(e) {}
  console.log("🌐 Página mudou:", url);

  const __enfoqueHref = String(url || "");
  const __enfoquePath = (location && location.pathname) ? String(location.pathname) : __enfoqueHref;
  const __enfoquePathLower = __enfoquePath.toLowerCase();

  // se sair do EDIT de entre depósitos, para o monitor de destaque azul
  if (!__enfoquePathLower.includes("estoquemoventredepositos/edit")) {
    try { __enfoqueStopEstoqueProdutoMonitor(); } catch (_) {}
    try { __enfoqueStopMovEntreDepositosCounter(); } catch (_) {}
  }

  // se sair do Entre Depósitos (EDIT/LIST), remove UI de rascunhos
  if (!__enfoquePathLower.includes("estoquemoventredepositos/")) {
    try { __enfoqueStopMovEntreDepositosDraftsUI(); } catch (_) {}
  }

  // ===========================================================
  // PDV (https://enfoquepapelaria.meusige.com.br/sistema/pdv)
  // ===========================================================
  if (url.includes("/sistema/pdv") && !url.toLowerCase().includes("danfenfce")) {
    // Sai de outros modos
    alertMode = false;
    restoreBannerShown = false;

    pdvMode = true;
    secondsInPdv = 0;

    pdvVendedorLastWasNenhum = false;
    hidePdvVendedorAlert();

    // PDV: backup silencioso (sem UI na página). A restauração fica no painel lateral.
    // Se houver restauração pendente (vinda do painel), executa quando o PDV carregar.
    checkPendingPdvRestore();
    startClearNomeEscolaOnceOnPdvEntry();
    ensurePdvCampoNovoAoLadoBusca();
    try { ensureEnfoquePdvAbasLaterais(); } catch (_) {}
    return;
  }

  // Se não estiver no PDV, zera o modo PDV
  pdvMode = false;
  secondsInPdv = 0;
  try { __enfoqueRemoveHideBtn15DiasForaMesStyle(); } catch (_) {}
  // (sem UI do PDV na página)

  // ===========================================================
  // PESSOAS/EDIT — Limite de Crédito mínimo (0,01)
  // ===========================================================
  if (__enfoquePathLower.includes("/sistema/pessoas/edit")) {
    try { __enfoqueStartLimiteCreditoAutoFix(); } catch (_) {}
  } else {
    try { __enfoqueStopLimiteCreditoAutoFix(); } catch (_) {}
  }

  pdvVendedorLastWasNenhum = false;
  hidePdvVendedorAlert();

  // Página EDIT - Entre Depósitos
  if (__enfoquePathLower.includes("estoquemoventredepositos/edit")) {
    alertMode = true;
    restoreBannerShown = false;
    secondsInEdit = 0;

    console.log("⚠ Página EDIT detectada.");

    injectDestinoPopup();
    checkPendingRestore(); // restaura backup se estiver pendente

    try { __enfoqueStartEstoqueProdutoMonitor(); } catch(_) {}
    try { __enfoqueStartMovEntreDepositosCounter(); } catch(_) {}
    try { __enfoqueStartMovEntreDepositosDraftButton(); } catch(_) {}

    return;
  }

  // Página LIST - Entre Depósitos
  if (__enfoquePathLower.includes("estoquemoventredepositos/list")) {
    alertMode = false;
    console.log("📋 Página LIST detectada.");
    checkForRestorePopup();
    try { __enfoqueStartMovEntreDepositosDraftListButton(); } catch(_) {}
    return;
  }


  // ===========================================================
  // VENDAS/EDIT — Exportar itens (em /Edit/<id>) e Importar (em /Edit)
  // ===========================================================
  if (/\/sistema\/vendas\/edit(\/|$)/.test(__enfoquePathLower)) {
    alertMode = false;
    restoreBannerShown = false;

    const isRoot = /\/sistema\/vendas\/edit\/?$/.test(__enfoquePathLower);
    const isWithId = /\/sistema\/vendas\/edit\/\d+/.test(__enfoquePathLower);

    try { __enfoqueUpdateVendasButtons(isRoot, isWithId); } catch (e) {
      console.warn("[SIGE Assistente] Vendas/Edit handler erro:", e);
    }
    return;
  } else {
    // Se sair de Vendas/Edit, remove botões (quando existirem)
    try { __enfoqueUpdateVendasButtons(false, false); } catch (_) {}
  }


  // ===========================================================
  // ORÇAMENTO ESCOLAR - EDIT
  // ===========================================================
  // Por enquanto: NÃO faz nada no /OrcamentoEscolar/Edit (sem banner, sem botões).
  // Apenas garante que qualquer modo/listener do LIST seja desligado ao entrar no EDIT.
  if (/\/sistema\/orcamentoescolar\/edit(\/|$)/.test(__enfoquePathLower)) {
    alertMode = false;
    restoreBannerShown = false;
    try { stopOrcamentoEscolarModes(); } catch (_) {}
    return;
  }

  // ===========================================================
  // ORÇAMENTO ESCOLAR - LIST (mostrar botão de observações)
  // ===========================================================
  if (__enfoquePathLower.includes("/sistema/orcamentoescolar/list")) {
    alertMode = false;
    restoreBannerShown = false;

    try { startOrcamentoEscolarListNotes(); } catch (e) { console.warn("Orçamento List Notes erro:", e); }
    return;
  }
  // [Enfoque] relatório personalizado removido nesta versão.

  alertMode = false;
  restoreBannerShown = false;
}

// =============================================================
// 4. POPUP DE CONFIRMAÇÃO DO DEPÓSITO DESTINO (igual à sua)
// =============================================================

function injectDestinoPopup() {
  if (window.__destinoPopupLoaded) return;
  window.__destinoPopupLoaded = true;

  const obs = new MutationObserver(() => {
    let opts = document.querySelectorAll(".autocomplete-suggestion");

    opts.forEach(el => {
      if (el.__binded) return;
      el.__binded = true;

      el.addEventListener("click", () => {
        // Popup de confirmação de depósito destino removido pela extensão.
      });
    });

  });

  obs.observe(document.body, { childList: true, subtree: true });
}


// =============================================================
// 4B. ESTOQUE - DESTAQUE AZUL DO ÚLTIMO PRODUTO DIGITADO
// - monitora #LocalizarProdutoNew_Produto
// - memoriza o texto digitado
// - quando o campo zera (após addProduto), procura a linha com o código e destaca com azul brilhante
// =============================================================

function __enfoqueEnsureBlueGlowCss() {
  if (document.getElementById("__enfoque_blue_glow_css")) return;
  const css = document.createElement("style");
  css.id = "__enfoque_blue_glow_css";
  css.textContent = `
    .__enfoque_blue_glow_tr{
      outline: 3px solid #00aaff !important;
      box-shadow: 0 0 0 2px rgba(0,170,255,0.55), 0 0 22px rgba(0,170,255,0.95) !important;
      transition: box-shadow .15s ease-out;
    }
  `;
  (document.documentElement || document.head || document.body).appendChild(css);
}

function __enfoqueStopEstoqueProdutoMonitor() {
  __estoqueProdMonitorActive = false;
  if (__estoqueProdMonitorTimer) {
    try { clearInterval(__estoqueProdMonitorTimer); } catch (_) {}
    __estoqueProdMonitorTimer = null;
  }
  __estoqueProdInputEl = null;
  __estoqueLastTypedText = "";
  __estoquePrevValue = "";
  __estoqueLastTypedAt = 0;
}

function __enfoqueStartEstoqueProdutoMonitor() {
  __enfoqueEnsureBlueGlowCss();
  __estoqueProdMonitorActive = true;

  if (__estoqueProdMonitorTimer) {
    try { clearInterval(__estoqueProdMonitorTimer); } catch (_) {}
    __estoqueProdMonitorTimer = null;
  }

  __estoqueProdMonitorTimer = setInterval(() => {
    if (!__estoqueProdMonitorActive) return;

    const inp = document.querySelector("#LocalizarProdutoNew_Produto");
    if (!inp) return;

    // garante listeners (apenas uma vez por elemento)
    if (__estoqueProdInputEl !== inp) {
      __estoqueProdInputEl = inp;
      __estoquePrevValue = String(inp.value || "").trim();

      const handler = () => {
        const val = String(inp.value || "").trim();

        // memoriza quando tem algo
        if (val) {
          __estoqueLastTypedText = val;
          __estoqueLastTypedAt = Date.now();
        }

        // quando some: tenta destacar
        if (!val && __estoquePrevValue && __estoqueLastTypedText) {
          __enfoqueHighlightProdutoRow(__estoqueLastTypedText);
          // limpa para evitar repetir
          __estoqueLastTypedText = "";
        }

        __estoquePrevValue = val;
      };

      inp.addEventListener("input", handler, { passive: true });
      inp.addEventListener("change", handler, { passive: true });
      inp.addEventListener("keyup", handler, { passive: true });
    } else {
      // fallback: se o SIGE zerar o campo sem disparar eventos, detecta por polling
      const val = String(inp.value || "").trim();
      if (!val && __estoquePrevValue && __estoqueLastTypedText) {
        __enfoqueHighlightProdutoRow(__estoqueLastTypedText);
        __estoqueLastTypedText = "";
      }
      __estoquePrevValue = val;
    }
  }, 250);
}

function __enfoqueHighlightProdutoRow(codigoOuTexto) {
  const code = String(codigoOuTexto || "").trim();
  if (!code) return;

  // tenta achar pelo início: "800162 - ..."
  const candidates = Array.from(document.querySelectorAll("td.ListField, td.ListField.ng-binding"));
  let td = candidates.find(el => {
    const t = (el.textContent || "").trim();
    return t.startsWith(code + " ") || t.startsWith(code + "-") || t.startsWith(code + " -");
  });

  // fallback: contém o código em qualquer lugar
  if (!td) td = candidates.find(el => (el.textContent || "").includes(code));

  if (!td) return;

  // pega a linha principal (o tr que contém o td da descrição)
  const tr = td.closest("tr");
  if (!tr) return;

  // remove destaque anterior
  try {
    document.querySelectorAll(".__enfoque_blue_glow_tr").forEach(x => x.classList.remove("__enfoque_blue_glow_tr"));
  } catch (_) {}

  try {
    tr.classList.add("__enfoque_blue_glow_tr");
  } catch (_) {}

  try {
    tr.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (_) {}

  // auto-remove depois de alguns segundos
  setTimeout(() => {
    try { tr.classList.remove("__enfoque_blue_glow_tr"); } catch (_) {}
  }, 8000);
}


// =============================================================
// EstoqueMovEntreDepositos/Edit — contador de linhas (itens)
// Mostra ao lado do botão "Pesquisa Detalhada" e atualiza ao vivo.
// =============================================================

function __enfoqueEnsureMovCounterCss() {
  if (document.getElementById("__enfoque_mov_counter_css")) return;
  const css = document.createElement("style");
  css.id = "__enfoque_mov_counter_css";
  css.textContent = `
    #__enfoque_mov_counter_badge{
      display:inline-block;
      margin-left:10px;
      padding:6px 10px;
      border-radius:10px;
      border:1px solid rgba(239,68,68,.28);
      background:rgba(239,68,68,.10);
      color:#b91c1c;
      font-size:12px;
      font-weight:700;
      vertical-align:middle;
      user-select:none;
    }

    #__enfoque_mov_cost_badge{
      display:inline-block;
      margin-left:8px;
      padding:6px 10px;
      border-radius:10px;
      border:1px solid rgba(59,130,246,.25);
      background:rgba(59,130,246,.10);
      color:#1d4ed8;
      font-size:12px;
      font-weight:800;
      vertical-align:middle;
      user-select:none;
      white-space:nowrap;
    }
  `;
  (document.documentElement || document.head || document.body).appendChild(css);
}

function __enfoqueParseNumberBR(raw) {
  // Aceita: "1.234,56", "1234,56", "1234.56", "1234"
  try {
    let s = String(raw ?? "").trim();
    if (!s) return 0;
    s = s.replace(/\s+/g, "");

    // remove tudo que não pareça número
    s = s.replace(/[^0-9,\.\-]/g, "");
    if (!s) return 0;

    // Se tiver vírgula, assume vírgula como decimal e ponto como milhar
    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    }

    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function __enfoqueFormatBRL(v) {
  try {
    const n = Number(v);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  } catch (_) {
    // fallback simples
    const n = Number(v);
    const fixed = Number.isFinite(n) ? n.toFixed(2) : "0.00";
    return "R$ " + fixed.replace(".", ",");
  }
}

function __enfoqueGetMovEntreDepositosItemCount() {
  try {
    const a = document.querySelectorAll('tbody[ng-repeat="item in produtos"]');
    const b = document.querySelectorAll('tbody[ng-repeat="item in dados.Produtos"]');
    const count = (a?.length || 0) + (b?.length || 0);
    return count;
  } catch (_) {
    return 0;
  }
}

function __enfoqueGetMovEntreDepositosCustoTotal() {
  try {
    const tbodies = Array.from(document.querySelectorAll(
      'tbody[ng-repeat="item in produtos"], tbody[ng-repeat="item in dados.Produtos"]'
    ));

    let total = 0;
    for (const tb of tbodies) {
      const tr = tb.querySelector("tr");
      if (!tr) continue;

      const qtdEl = tr.querySelector('input[id*="rptProdutoQuantidade"], input[ng-model$="Quantidade"], input[ng-model*="Quantidade"]');
      const custoEl = tr.querySelector('input[ng-model$="PrecoCusto"], input[ng-model*="PrecoCusto"]');

      const qtd = __enfoqueParseNumberBR(qtdEl ? qtdEl.value : "");
      const custo = __enfoqueParseNumberBR(custoEl ? custoEl.value : "");

      if (qtd > 0 && custo > 0) total += qtd * custo;
    }
    return total;
  } catch (_) {
    return 0;
  }
}

function __enfoqueUpdateMovEntreDepositosCounter() {
  if (!__enfoqueMovCountActive) return;
  const count = __enfoqueGetMovEntreDepositosItemCount();
  if (__enfoqueMovCountBadgeEl) {
    __enfoqueMovCountBadgeEl.textContent = `Itens: ${count}`;
  }

  if (__enfoqueMovCostBadgeEl) {
    const total = __enfoqueGetMovEntreDepositosCustoTotal();
    __enfoqueMovCostBadgeEl.textContent = `Custo: ${__enfoqueFormatBRL(total)}`;
  }
}

function __enfoqueAttachMovEntreDepositosCounterBadge() {
  __enfoqueEnsureMovCounterCss();

  const btn = document.getElementById("bntPesquisaDetalhada");
  if (!btn) return false;

  // não duplica
  const existing = document.getElementById("__enfoque_mov_counter_badge");
  if (existing) {
    __enfoqueMovCountBadgeEl = existing;
    // tenta pegar o badge de custo (se já existir)
    __enfoqueMovCostBadgeEl = document.getElementById("__enfoque_mov_cost_badge") || null;
    return true;
  }

  const badge = document.createElement("span");
  badge.id = "__enfoque_mov_counter_badge";
  badge.textContent = "Itens: 0";
  btn.insertAdjacentElement("afterend", badge);
  __enfoqueMovCountBadgeEl = badge;

  // badge de custo (ao lado)
  const cost = document.createElement("span");
  cost.id = "__enfoque_mov_cost_badge";
  cost.textContent = "Custo: R$ 0,00";
  badge.insertAdjacentElement("afterend", cost);
  __enfoqueMovCostBadgeEl = cost;
  return true;
}

function __enfoqueBindMovEntreDepositosLiveInputs() {
  try {
    if (__enfoqueMovCountInputListenerBound) return;
    __enfoqueMovCountInputListenerBound = true;

    __enfoqueMovCountInputListenerFn = (ev) => {
      if (!__enfoqueMovCountActive) return;
      const t = ev && ev.target;
      if (!t || t.nodeType !== 1) return;
      const el = /** @type {HTMLElement} */ (t);
      if (!el.matches) return;

      // Atualiza custo ao vivo quando mudar quantidade/custo
      const ok = el.matches('input[id*="rptProdutoQuantidade"], input[ng-model*="Quantidade"], input[ng-model*="PrecoCusto"], input[ng-model*="PrecoTotal"]');
      if (!ok) return;

      // debounce leve reaproveitando o timer já existente
      if (__enfoqueMovCountDebounceTimer) {
        try { clearTimeout(__enfoqueMovCountDebounceTimer); } catch (_) {}
        __enfoqueMovCountDebounceTimer = null;
      }
      __enfoqueMovCountDebounceTimer = setTimeout(() => {
        __enfoqueMovCountDebounceTimer = null;
        __enfoqueUpdateMovEntreDepositosCounter();
      }, 80);
    };

    document.addEventListener("input", __enfoqueMovCountInputListenerFn, true);
    document.addEventListener("change", __enfoqueMovCountInputListenerFn, true);
  } catch (_) {}
}

function __enfoqueUnbindMovEntreDepositosLiveInputs() {
  try {
    if (!__enfoqueMovCountInputListenerBound) return;
    __enfoqueMovCountInputListenerBound = false;
    if (__enfoqueMovCountInputListenerFn) {
      document.removeEventListener("input", __enfoqueMovCountInputListenerFn, true);
      document.removeEventListener("change", __enfoqueMovCountInputListenerFn, true);
    }
    __enfoqueMovCountInputListenerFn = null;
  } catch (_) {}
}

function __enfoqueStartMovEntreDepositosCounter() {
  __enfoqueMovCountActive = true;

  // tenta anexar badge; se a SPA ainda não renderizou, tenta de novo
  if (!__enfoqueAttachMovEntreDepositosCounterBadge()) {
    setTimeout(() => {
      if (!__enfoqueMovCountActive) return;
      __enfoqueAttachMovEntreDepositosCounterBadge();
      __enfoqueUpdateMovEntreDepositosCounter();
    }, 700);
  }

  __enfoqueUpdateMovEntreDepositosCounter();

  // Atualiza ao vivo quando usuário digitar quantidade
  __enfoqueBindMovEntreDepositosLiveInputs();

  // Observa mudanças no DOM para atualizar ao vivo
  if (__enfoqueMovCountObserver) {
    try { __enfoqueMovCountObserver.disconnect(); } catch (_) {}
    __enfoqueMovCountObserver = null;
  }

  __enfoqueMovCountObserver = new MutationObserver(() => {
    if (!__enfoqueMovCountActive) return;
    if (__enfoqueMovCountDebounceTimer) {
      try { clearTimeout(__enfoqueMovCountDebounceTimer); } catch (_) {}
      __enfoqueMovCountDebounceTimer = null;
    }
    __enfoqueMovCountDebounceTimer = setTimeout(() => {
      __enfoqueMovCountDebounceTimer = null;
      __enfoqueUpdateMovEntreDepositosCounter();
    }, 120);
  });

  try {
    __enfoqueMovCountObserver.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}
}

function __enfoqueStopMovEntreDepositosCounter() {
  __enfoqueMovCountActive = false;

  if (__enfoqueMovCountDebounceTimer) {
    try { clearTimeout(__enfoqueMovCountDebounceTimer); } catch (_) {}
    __enfoqueMovCountDebounceTimer = null;
  }

  if (__enfoqueMovCountObserver) {
    try { __enfoqueMovCountObserver.disconnect(); } catch (_) {}
    __enfoqueMovCountObserver = null;
  }

  try { __enfoqueUnbindMovEntreDepositosLiveInputs(); } catch (_) {}

  try { document.getElementById("__enfoque_mov_counter_badge")?.remove(); } catch (_) {}
  try { document.getElementById("__enfoque_mov_cost_badge")?.remove(); } catch (_) {}
  __enfoqueMovCountBadgeEl = null;
  __enfoqueMovCostBadgeEl = null;
}



// =============================================================
// X. RASCUNHOS — EstoqueMovEntreDepositos (Edit/List)
// =============================================================

const __ENFOQUE_MOV_DRAFTS_KEY = "enfoque_mov_rascunhos";

let __enfoqueMovDraftBtnEl = null;
let __enfoqueMovDraftListBtnEl = null;
let __enfoqueMovDraftPanelEl = null;
let __enfoqueMovDraftStyleInjected = false;

function __enfoqueInjectMovDraftStyles() {
  try {
    if (__enfoqueMovDraftStyleInjected) return;
    __enfoqueMovDraftStyleInjected = true;

    const style = document.createElement('style');
    style.id = '__enfoque_mov_drafts_style';
    style.textContent = `
      #__enfoque_btn_rascunho{margin-left:8px;}
      #__enfoque_btn_lista_rascunhos{margin-left:8px;}
      #__enfoque_mov_drafts_overlay{position:fixed;inset:0;z-index:99999999;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;padding:70px 12px 24px 12px;}
      #__enfoque_mov_drafts_panel{width:min(720px, 96vw);background:#fff;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.25);border:1px solid rgba(2,6,23,.12);overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;}
      #__enfoque_mov_drafts_panel .hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f1f5f9;border-bottom:1px solid rgba(2,6,23,.10)}
      #__enfoque_mov_drafts_panel .hdr .t{font-weight:800;font-size:14px;color:#0f172a}
      #__enfoque_mov_drafts_panel .hdr .x{border:none;background:transparent;font-size:18px;line-height:18px;padding:4px 8px;cursor:pointer;color:#0f172a}
      #__enfoque_mov_drafts_panel .body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
      .__enfoque_draft_card{border:1px solid rgba(2,6,23,.12);border-radius:12px;padding:12px;background:#fff;}
      .__enfoque_draft_top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;}
      .__enfoque_draft_route{font-weight:800;color:#0f172a;font-size:13px;}
      .__enfoque_draft_meta{color:#334155;font-size:12px;margin-top:6px;white-space:pre-line;}
      .__enfoque_draft_time{color:#64748b;font-size:12px;text-align:right;}
      .__enfoque_draft_btns{display:flex;gap:8px;margin-top:10px;}
      .__enfoque_draft_btns button{border:none;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:800;font-size:12px;}
      .__enfoque_btn_select{background:#16a34a;color:#fff;}
      .__enfoque_btn_delete{background:#dc2626;color:#fff;}
      .__enfoque_empty{color:#334155;font-size:13px;padding:10px;border:1px dashed rgba(2,6,23,.25);border-radius:12px;background:#f8fafc;}
      .__enfoque_hint{color:#475569;font-size:12px;margin-top:8px;}
    `;
    document.head.appendChild(style);
  } catch (_) {}
}

function __enfoqueToast(msg, kind) {
  try {
    const id = '__enfoque_toast_mov_draft';
    document.getElementById(id)?.remove();
    const d = document.createElement('div');
    d.id = id;
    d.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:14px',
      'z-index:99999999',
      'padding:10px 12px',
      'border-radius:12px',
      'box-shadow:0 10px 30px rgba(0,0,0,.25)',
      'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial',
      'font-size:13px',
      'font-weight:800',
      'max-width:340px'
    ].join(';');
    const bg = (kind === 'bad') ? '#b91c1c' : (kind === 'warn') ? '#b45309' : '#0f766e';
    d.style.background = bg;
    d.style.color = '#fff';
    d.textContent = String(msg || '');
    document.body.appendChild(d);
    setTimeout(() => { try { d.remove(); } catch (_) {} }, 2200);
  } catch (_) {}
}

function __enfoqueGetSelectedLabel(sel) {
  try {
    if (!sel) return '';
    const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    const t = opt ? (opt.textContent || '') : '';
    return String(t).trim();
  } catch (_) {
    return '';
  }
}

function __enfoqueCollectMovEntreDepositosBackupLike() {
  try {
    const origemSel = document.querySelector('#Deposito1');
    const destinoSel = document.querySelector('#Deposito2');

    const origem = origemSel?.value || '';
    const destino = destinoSel?.value || '';
    const origemLabel = __enfoqueGetSelectedLabel(origemSel);
    const destinoLabel = __enfoqueGetSelectedLabel(destinoSel);

    const responsavel = document.querySelector('#realizadoPor')?.value || '';
    const dataMov = document.querySelector('input.datetime')?.value || '';

    const itens = [];

    // Preferencial: tbodies do ng-repeat de produtos
    const tbodies = Array.from(document.querySelectorAll('div#produtos tbody[ng-repeat="item in produtos"], div#produtos tbody[ng-repeat="item in dados.Produtos"]'));
    if (tbodies.length) {
      for (const tb of tbodies) {
        const tr = tb.querySelector('tr');
        const cell = tr?.querySelector('.ListField');
        const q = tr?.querySelector('input[id*="rptProdutoQuantidade"], input[ng-model*="Quantidade"]');
        if (!cell || !q) continue;

        const txt = (cell.textContent || cell.innerText || '').trim();
        const parts = txt.split(' - ');
        const cod = String(parts.shift() || '').trim();
        const nome = String(parts.join(' - ') || '').trim();

        itens.push({ codigo: cod, nome: nome, quantidade: q.value || '' });
      }
    } else {
      // Fallback antigo: varre linhas (mais amplo)
      document.querySelectorAll('table tr').forEach((row) => {
        const cell = row.querySelector('.ListField');
        const q = row.querySelector('input[id*=rptProdutoQuantidade], input[ng-model*="Quantidade"]');
        if (!cell || !q) return;

        const txt = (cell.innerText || cell.textContent || '').trim();
        const parts = txt.split(' - ');
        const cod = String(parts.shift() || '').trim();
        const nome = String(parts.join(' - ') || '').trim();

        itens.push({ codigo: cod, nome: nome, quantidade: q.value || '' });
      });
    }

    if (!itens.length) return null;

    return {
      origem,
      destino,
      origemLabel,
      destinoLabel,
      responsavel,
      data: dataMov,
      itens
    };
  } catch (e) {
    return null;
  }
}

function __enfoqueReadMovDrafts(cb) {
  try {
    chrome.storage.local.get([__ENFOQUE_MOV_DRAFTS_KEY], (res) => {
      const arr = Array.isArray(res?.[__ENFOQUE_MOV_DRAFTS_KEY]) ? res[__ENFOQUE_MOV_DRAFTS_KEY] : [];
      cb(arr);
    });
  } catch (e) {
    cb([]);
  }
}

function __enfoqueWriteMovDrafts(arr, cb) {
  try {
    const v = Array.isArray(arr) ? arr : [];
    chrome.storage.local.set({ [__ENFOQUE_MOV_DRAFTS_KEY]: v }, () => cb && cb());
  } catch (e) {
    cb && cb();
  }
}

function __enfoqueSaveMovDraft() {
  const backup = __enfoqueCollectMovEntreDepositosBackupLike();
  if (!backup) {
    __enfoqueToast('Sem itens para salvar como rascunho.', 'warn');
    return;
  }

  __enfoqueReadMovDrafts((arr) => {
    const now = new Date();
    const draft = {
      id: String(Date.now()),
      createdAt: now.toISOString(),
      createdAtBR: now.toLocaleString('pt-BR'),
      kind: 'mov',
      backup
    };

    const all = Array.isArray(arr) ? arr.slice(0) : [];
    all.push(draft);

    // Regras de retenção:
    // - Mov Entre Depósitos: máx. 3
    // - BaterProd (celular): máx. 2 (não interfere nos 3 de Mov)
    const mov = all.filter(d => String(d?.kind || 'mov') !== 'baterprod_mobile');
    const bpm = all.filter(d => String(d?.kind || '') === 'baterprod_mobile');

    mov.sort((a, b) => String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')));
    while (mov.length > 3) mov.shift();

    bpm.sort((a, b) => String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')));
    while (bpm.length > 2) bpm.shift();

    const next = mov.concat(bpm);

    __enfoqueWriteMovDrafts(next, () => {
      __enfoqueToast('Rascunho salvo! (máx. 3 + 2 do celular)', 'ok');
    });
  });
}


function __enfoqueStartMovEntreDepositosDraftButton() {
  try {
    __enfoqueInjectMovDraftStyles();

    // evita duplicar
    const existing = document.getElementById('__enfoque_btn_rascunho');
    if (existing) {
      __enfoqueMovDraftBtnEl = existing;
      return;
    }

    const voltar = document.getElementById('btnCANCEL') || document.querySelector('input.btn.btn-danger[onclick*="redirectToSender"]');
    if (!voltar) return;

    const btn = document.createElement('input');
    btn.type = 'button';
    btn.id = '__enfoque_btn_rascunho';
    btn.className = 'btn';
    btn.value = 'Rascunho';
    btn.style.cssText = 'background:#60a5fa;border-color:#60a5fa;color:#0b1220;font-weight:800;';

    btn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
      __enfoqueSaveMovDraft();
    });

    voltar.insertAdjacentElement('afterend', btn);
    __enfoqueMovDraftBtnEl = btn;
  } catch (_) {}
}

function __enfoqueStartMovEntreDepositosDraftListButton() {
  try {
    __enfoqueInjectMovDraftStyles();

    const existing = document.getElementById('__enfoque_btn_lista_rascunhos');
    if (existing) {
      __enfoqueMovDraftListBtnEl = existing;
      return;
    }

    const novo = document.getElementById('btnNovo') || document.querySelector('input#btnNovo');
    if (!novo) return;

    const btn = document.createElement('input');
    btn.type = 'button';
    btn.id = '__enfoque_btn_lista_rascunhos';
    btn.className = 'btn btn-primary';
    btn.value = 'Lista de rascunhos';

    btn.addEventListener('click', (ev) => {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
      __enfoqueToggleMovDraftPanel();
    });

    novo.insertAdjacentElement('afterend', btn);
    __enfoqueMovDraftListBtnEl = btn;
  } catch (_) {}
}

function __enfoqueCloseMovDraftPanel() {
  try {
    document.getElementById('__enfoque_mov_drafts_overlay')?.remove();
  } catch (_) {}
  __enfoqueMovDraftPanelEl = null;
}

function __enfoqueToggleMovDraftPanel() {
  try {
    const overlayId = '__enfoque_mov_drafts_overlay';
    const existing = document.getElementById(overlayId);
    if (existing) {
      __enfoqueCloseMovDraftPanel();
      return;
    }

    __enfoqueReadMovDrafts((drafts) => {
      const overlay = document.createElement('div');
      overlay.id = overlayId;

      overlay.addEventListener('click', (ev) => {
        // fecha clicando no fundo
        if (ev.target === overlay) __enfoqueCloseMovDraftPanel();
      });

      const panel = document.createElement('div');
      panel.id = '__enfoque_mov_drafts_panel';

      const hdr = document.createElement('div');
      hdr.className = 'hdr';

      const t = document.createElement('div');
      t.className = 't';
      t.textContent = 'Rascunhos (3 + 2 do celular)';

      const x = document.createElement('button');
      x.className = 'x';
      x.textContent = '✕';
      x.addEventListener('click', () => __enfoqueCloseMovDraftPanel());

      hdr.appendChild(t);
      hdr.appendChild(x);

      const body = document.createElement('div');
      body.className = 'body';

      panel.appendChild(hdr);
      panel.appendChild(body);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      __enfoqueMovDraftPanelEl = panel;

      __enfoqueRenderMovDraftPanelBody(body, drafts);
    });
  } catch (_) {}
}

function __enfoqueRenderMovDraftPanelBody(body, drafts) {
  try {
    body.textContent = '';

    const arr = Array.isArray(drafts) ? drafts.slice(0) : [];

    if (!arr.length) {
      const e = document.createElement('div');
      e.className = '__enfoque_empty';
      e.textContent = 'Nenhum rascunho salvo ainda.';
      body.appendChild(e);

      const hint = document.createElement('div');
      hint.className = '__enfoque_hint';
      hint.textContent = 'Dica: na tela Edit, use o botão "Rascunho" (azul) para salvar.';
      body.appendChild(hint);
      return;
    }

    // Mostra mais novo primeiro
    arr.sort((a, b) => (b?.createdAt || '').localeCompare(a?.createdAt || ''));

    for (const d of arr) {
      const backup = d?.backup || {};
      const origemLabel = backup.origemLabel || backup.origem || '';
      const destinoLabel = backup.destinoLabel || backup.destino || '';
      const resp = backup.responsavel || '';
      const first = Array.isArray(backup.itens) && backup.itens.length ? backup.itens[0] : null;
      const firstTxt = first ? ((first.codigo ? first.codigo + ' - ' : '') + (first.nome || '')).trim() : '';

      const card = document.createElement('div');
      card.className = '__enfoque_draft_card';

      const top = document.createElement('div');
      top.className = '__enfoque_draft_top';

      const left = document.createElement('div');

      const kind = String(d?.kind || 'mov');
      const title = String(d?.title || (kind === 'baterprod_mobile' ? 'prods-celular' : '') || '').trim();

      const route = document.createElement('div');
      route.className = '__enfoque_draft_route';
      if (kind === 'baterprod_mobile') {
        route.textContent = '📱 ' + (title || 'prods-celular');
      } else {
        route.textContent = String(origemLabel || '').trim() + '  ➜  ' + String(destinoLabel || '').trim();
      }

      const meta = document.createElement('div');
      meta.className = '__enfoque_draft_meta';

      // Para rascunhos do celular, usa o "Responsável" como etiqueta e mostra qtd de itens
      if (kind === 'baterprod_mobile') {
        const qtd = Array.isArray(backup.itens) ? backup.itens.length : 0;
        const lbl = resp ? ('Etiqueta: ' + resp) : 'Etiqueta: prods-celular';
        meta.textContent = lbl + (qtd ? ('\nItens: ' + qtd) : '') + (firstTxt ? ('\n1º item: ' + firstTxt) : '');
} else {
        meta.textContent = (resp ? ('Responsável: ' + resp) : 'Responsável: (vazio)') + (firstTxt ? ('\n1º item: ' + firstTxt) : '\n1º item: (vazio)');
}

      left.appendChild(route);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = '__enfoque_draft_time';
      right.textContent = d?.createdAtBR || d?.createdAt || '';

      top.appendChild(left);
      top.appendChild(right);

      const btns = document.createElement('div');
      btns.className = '__enfoque_draft_btns';

      const bSel = document.createElement('button');
      bSel.className = '__enfoque_btn_select';
      bSel.textContent = 'Selecionar';
      bSel.addEventListener('click', () => __enfoqueSelectMovDraft(String(d.id || '')));

      const bDel = document.createElement('button');
      bDel.className = '__enfoque_btn_delete';
      bDel.textContent = 'Apagar';
      bDel.addEventListener('click', () => __enfoqueDeleteMovDraft(String(d.id || '')));

      btns.appendChild(bSel);
      btns.appendChild(bDel);

      card.appendChild(top);
      card.appendChild(btns);

      body.appendChild(card);
    }
  } catch (_) {}
}

function __enfoqueDeleteMovDraft(id) {
  try {
    const sid = String(id || '');
    if (!sid) return;

    __enfoqueReadMovDrafts((arr) => {
      const next = (Array.isArray(arr) ? arr : []).filter((d) => String(d?.id || '') != sid);
      __enfoqueWriteMovDrafts(next, () => {
        __enfoqueToast('Rascunho apagado.', 'ok');
        // re-render se painel aberto
        const body = document.querySelector('#__enfoque_mov_drafts_panel .body');
        if (body) __enfoqueRenderMovDraftPanelBody(body, next);
      });
    });
  } catch (_) {}
}

function __enfoqueSelectMovDraft(id) {
  try {
    const sid = String(id || '');
    if (!sid) return;

    __enfoqueReadMovDrafts((arr) => {
      const d = (Array.isArray(arr) ? arr : []).find((x) => String(x?.id || '') === sid);
      if (!d || !d.backup) {
        __enfoqueToast('Rascunho não encontrado.', 'bad');
        return;
      }

      // Reaproveita a restauração existente (backup + pending_restore)
      chrome.storage.local.set({ sige_backup: d.backup, sige_pending_restore: 'all' }, () => {
        __enfoqueCloseMovDraftPanel();
        location.href = 'https://enfoquepapelaria.meusige.com.br/sistema/EstoqueMovEntreDepositos/Edit';
      });
    });
  } catch (e) {
    __enfoqueToast('Erro ao selecionar rascunho.', 'bad');
  }
}

function __enfoqueStopMovEntreDepositosDraftsUI() {
  try { document.getElementById('__enfoque_btn_rascunho')?.remove(); } catch (_) {}
  try { document.getElementById('__enfoque_btn_lista_rascunhos')?.remove(); } catch (_) {}
  try { __enfoqueCloseMovDraftPanel(); } catch (_) {}
  __enfoqueMovDraftBtnEl = null;
  __enfoqueMovDraftListBtnEl = null;
}



// =============================================================
// X2. BATERPROD (MOBILE) — GitHub Gist sync + rascunhos (prods-celular)
// =============================================================
//
// Fluxo:
// - O APP do celular faz UPLOAD para um arquivo JSON dentro de um GitHub Gist (privado ou público).
// - A EXTENSÃO baixa (DOWNLOAD) esse JSON do Gist e salva no chrome.storage.local como rascunho "prods-celular".
// - Este rascunho NÃO mistura com os outros; tem limite próprio de 2.
//
// Estrutura esperada no arquivo do Gist (ex.: enfoque-sync.json):
// {
//   "baterprod_mobile": {
//     "marcelo": {
//       "history": [
//         { "title":"prods-celular", "ts": 1730000000000, "payload": { ... } }
//       ]
//     }
//   }
// }
//
// Observação: a validação usuário/senha aqui é LOCAL (por enquanto).
// A segurança real do sync é o Token do GitHub (escopo "gist").
//
// Config:
// - Gist ID + Token: vêm do perfil.txt (id: ... / token: ...), igual Orçamento Escolar.
// - Nome do arquivo do Gist: pode ser salvo em chrome.storage.local em "enfoq_bp_gist_file" (padrão: "enfoque-sync.json").
//

const __ENFOQUE_BATERPROD_MOBILE_DRAFTS_KEY = "enfoque_baterprod_mobile_rascunhos";
const __ENFOQUE_BATERPROD_MOBILE_MAX = 2;
const __ENFOQUE_BATERPROD_GIST_FILE_KEY = "enfoq_bp_gist_file";
const __ENFOQUE_BATERPROD_GIST_FILE_DEFAULT = "enfoque-sync.json";

// Login local (por enquanto)
function __enfoqueBaterprodValidateUserPass(user, pass) {
  const u = String(user || "").trim().toLowerCase();
  const p = String(pass || "").trim();
  
  const users = {
    "icarai": "1234",
    "papel e arte": "5678",
    "ilha": "9012",
    "copacabana": "3456",
    "sao goncalo": "7890",
    "centro": "2468",
    "itaipu": "1357",
    "marcelo": "a038"
  };
  
  return users[u] === p;
}

function __enfoqueReadBaterprodMobileDrafts(cb) {
  try {
    chrome.storage.local.get([__ENFOQUE_BATERPROD_MOBILE_DRAFTS_KEY], (res) => {
      const arr = Array.isArray(res?.[__ENFOQUE_BATERPROD_MOBILE_DRAFTS_KEY]) ? res[__ENFOQUE_BATERPROD_MOBILE_DRAFTS_KEY] : [];
      cb && cb(arr);
    });
  } catch (e) {
    cb && cb([]);
  }
}

function __enfoqueWriteBaterprodMobileDrafts(arr, cb) {
  try {
    const obj = {};
    obj[__ENFOQUE_BATERPROD_MOBILE_DRAFTS_KEY] = Array.isArray(arr) ? arr : [];
    chrome.storage.local.set(obj, () => cb && cb());
  } catch (e) {
    cb && cb();
  }
}


function __enfoqueRenderBaterprodMobileDraftsList() {
  try {
    const host = document.getElementById("sige-baterprod-drafts-list");
    if (!host) return;

    __enfoqueReadBaterprodMobileDrafts((arr) => {
      const items = Array.isArray(arr) ? arr.slice(0).reverse() : [];
      if (!items.length) {
        host.innerHTML = `<div style="padding:8px 10px;background:rgba(2,6,23,.04);border:1px dashed rgba(2,6,23,.18);border-radius:8px;">
          Nenhum rascunho ainda. Clique em <b>Baixar prods (celular)</b>.
        </div>`;
        return;
      }

      const rows = items.map((d) => {
        const id = String(d?.id || "");
        const when = d?.createdAtBR || d?.createdAt || "";
        const title = d?.title || "prods-celular";
        let count = "";
        let responsavel = "";
        try {
          const p = d?.payload || {};
          const arr1 = Array.isArray(p?.itens) ? p.itens : (Array.isArray(p?.items) ? p.items : (Array.isArray(p?.produtosBatidos) ? p.produtosBatidos : null));
          if (arr1) count = ` • ${arr1.length} itens`;
          if (p.exportadoPor) responsavel = ` • ${p.exportadoPor}`;
        } catch (_) {}

        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid rgba(2,6,23,.12);border-radius:10px;background:#fff;">
          <div style="min-width:0;">
            <div style="font-weight:900;font-size:12px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${__enfoqueEscHtml(title)}</div>
            <div style="font-size:11px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${__enfoqueEscHtml(when)}${__enfoqueEscHtml(responsavel)}${__enfoqueEscHtml(count)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button data-bpml-del="${__enfoqueEscHtml(id)}"
              style="padding:6px 8px;border-radius:8px;border:1px solid rgba(239,68,68,.35);background:#fff;color:#b91c1c;font-weight:800;cursor:pointer;font-size:12px;">Apagar</button>
          </div>
        </div>`;
      }).join("");

      host.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">${rows}</div>`;

      // bind delete
      host.querySelectorAll("button[data-bpml-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-bpml-del") || "";
          if (!id) return;
          __enfoqueDeleteBaterprodMobileDraft(id);
        });
      });
    });
  } catch (_) {}
}

function __enfoqueDeleteBaterprodMobileDraft(id) {
  try {
    const target = String(id || "");
    if (!target) return;
    __enfoqueReadBaterprodMobileDrafts((arr) => {
      const next = (Array.isArray(arr) ? arr : []).filter((d) => String(d?.id || "") !== target);
      __enfoqueWriteBaterprodMobileDrafts(next, () => {
        __enfoqueToast("Rascunho removido.", "ok");
        __enfoqueRenderBaterprodMobileDraftsList();
      });
    });
  } catch (_) {}
}


function __enfoqueBPMobilePayloadToMovBackup(payload) {
  try {
    const p = payload || {};
    let raw = null;

    // Suporta payload com metadados + itens e também payload aninhado em {payload:{...}}
    // Também suporta { payload: { payload: { itens: [...] } } } (double wrapped)
    const pp = (p && typeof p === "object" && p.payload && typeof p.payload === "object") ? p.payload : null;
    const ppp = (pp && pp.payload && typeof pp.payload === "object") ? pp.payload : null;

    // Tenta encontrar array de itens em múltiplos níveis
    if (Array.isArray(p.itens)) raw = p.itens;
    else if (Array.isArray(p.items)) raw = p.items;
    else if (Array.isArray(p.produtosBatidos)) raw = p.produtosBatidos;
    else if (Array.isArray(p.produtos)) raw = p.produtos;
    else if (Array.isArray(payload)) raw = payload;
    // Segundo nível
    else if (pp && Array.isArray(pp.itens)) raw = pp.itens;
    else if (pp && Array.isArray(pp.items)) raw = pp.items;
    else if (pp && Array.isArray(pp.produtosBatidos)) raw = pp.produtosBatidos;
    else if (pp && Array.isArray(pp.produtos)) raw = pp.produtos;
    // Terceiro nível
    else if (ppp && Array.isArray(ppp.itens)) raw = ppp.itens;
    else if (ppp && Array.isArray(ppp.items)) raw = ppp.items;
    else if (ppp && Array.isArray(ppp.produtosBatidos)) raw = ppp.produtosBatidos;
    else if (ppp && Array.isArray(ppp.produtos)) raw = ppp.produtos;

    const itens = [];
    (Array.isArray(raw) ? raw : []).forEach((it) => {
      if (!it) return;
      // Suporta novo formato com barcode, codigo, ou outros campos
      const codigo = String(it.barcode ?? it.codigo ?? it.cod ?? it.sku ?? it.productCode ?? it.ean ?? it.gtin ?? it.codigoBarras ?? it.codigobarras ?? '').trim();
      const nome = String(it.nome ?? it.name ?? it.descricao ?? it.desc ?? '').trim();
      const quantidade = String(it.quantidade ?? it.qtd ?? it.qtde ?? it.quantity ?? 1).trim();

      if (!codigo && !nome) return;
      // Se não tem nome, usa o código como nome
      const nomeFinal = nome || codigo;
      itens.push({ codigo, nome: nomeFinal, quantidade });
    });

    if (!itens.length) {
      console.log('[BaterProd] DEBUG: raw:', raw, 'p:', p, 'pp:', pp);
      return null;
    }

    // Usa exportadoPor como responsável, ou fallback para 'prods-celular'
    const responsavel = String(p.exportadoPor ?? pp?.exportadoPor ?? ppp?.exportadoPor ?? 'prods-celular').trim();

    return {
      origem: '',
      destino: '',
      origemLabel: '(celular)',
      destinoLabel: '',
      responsavel: responsavel,
      data: '',
      itens
    };
  } catch (e) {
    console.log('[BaterProd] DEBUG error:', e);
    return null;
  }
}

function __enfoqueSaveBaterprodMobileDraft(payload, serverId) {
  try {
    if (!payload) {
      __enfoqueToast("Nada para salvar (payload vazio).", "warn");
      return;
    }

    const backup = __enfoqueBPMobilePayloadToMovBackup(payload);
    if (!backup) {
      __enfoqueToast("Payload do celular veio sem itens válidos.", "warn");
      return;
    }

    // Usa exportadoPor como título se existir, senão usa 'prods-celular'
    const exportadoPor = String(payload.exportadoPor || "").trim();
    const title = exportadoPor ? `prods-celular (${exportadoPor})` : "prods-celular";

    __enfoqueReadMovDrafts((arr) => {
      const all = Array.isArray(arr) ? arr.slice(0) : [];

      // evita duplicar o mesmo pacote vindo do Gist
      const sid = serverId != null ? String(serverId) : "";
      if (sid && all.some((d) => String(d?.kind || "") === 'baterprod_mobile' && String(d?.serverId || "") === sid)) {
        __enfoqueToast("Já estava salvo na lista de rascunhos (celular).", "ok");
        return;
      }

      const now = new Date();
      all.push({
        id: String(Date.now()),
        serverId: sid,
        kind: "baterprod_mobile",
        title: title,
        createdAt: now.toISOString(),
        createdAtBR: now.toLocaleString("pt-BR"),
        backup
      });

      // Regras de retenção:
      // - Mov Entre Depósitos: máx. 3
      // - BaterProd (celular): máx. 2
      const mov = all.filter(d => String(d?.kind || 'mov') !== 'baterprod_mobile');
      const bpm = all.filter(d => String(d?.kind || '') === 'baterprod_mobile');

      mov.sort((a, b) => String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')));
      while (mov.length > 3) mov.shift();

      bpm.sort((a, b) => String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')));
      while (bpm.length > 2) bpm.shift();

      const next = mov.concat(bpm);

      __enfoqueWriteMovDrafts(next, () => {
        __enfoqueToast("Baixou corretamente! Apareceu em 'Lista de rascunhos'.", "ok");

        // se o painel de rascunhos estiver aberto, atualiza
        const body = document.querySelector('#__enfoque_mov_drafts_panel .body');
        if (body) __enfoqueRenderMovDraftPanelBody(body, next);
      });
    });
  } catch (e) {
    __enfoqueToast("Erro ao salvar prods-celular.", "bad");
  }
}


async function __enfoqueBaterprodGetGistConfig() {
  // BaterProd Mobile usa um arquivo separado: perfil2.txt (id/token)
  // Formato esperado:
  // id: <gist_id>
  // token: <github_pat_...>
  let gist_id = "";
  let token = "";
  try {
    const p2 = await __enfoqueReadPerfil2Txt(false);
    if (p2 && p2.gist_id) gist_id = String(p2.gist_id || "").trim();
    if (p2 && p2.token) token = String(p2.token || "").trim();
  } catch (_) {}

  // Fallback: se não existir perfil2.txt, tenta perfil.txt (para não quebrar instalações antigas)
  if (!gist_id || !token) {
    try {
      const p = await __enfoqueReadPerfilTxt(false);
      if (!gist_id && p && p.gist_id) gist_id = String(p.gist_id || "").trim();
      if (!token && p && p.token) token = String(p.token || "").trim();
    } catch (_) {}
  }

  // Também permite pegar do storage (caso já esteja salvo)
  try {
    const st = await __enfoqueStorageGet(["enfoq_gist_id", "enfoq_gh_token", __ENFOQUE_BATERPROD_GIST_FILE_KEY]);
    if (!gist_id && st.enfoq_gist_id) gist_id = String(st.enfoq_gist_id || "").trim();
    if (!token && st.enfoq_gh_token) token = String(st.enfoq_gh_token || "").trim();
    let file = st[__ENFOQUE_BATERPROD_GIST_FILE_KEY] ? String(st[__ENFOQUE_BATERPROD_GIST_FILE_KEY] || "").trim() : "";
    if (!file) file = __ENFOQUE_BATERPROD_GIST_FILE_DEFAULT;
    return { gist_id, token, file };
  } catch (_) {
    return { gist_id, token, file: __ENFOQUE_BATERPROD_GIST_FILE_DEFAULT };
  }
}

async function __enfoqueBaterprodReadFromGist(cfg, username) {
  if (!cfg || !cfg.gist_id || !cfg.token) {
    throw new Error("Faltou configurar Gist ID / Token. Edite o perfil.txt (id/token) ou configure pelo Orcamento Escolar.");
  }

  const url = `${__ENFOQUE_GH_API_BASE__}/gists/${encodeURIComponent(cfg.gist_id)}`;
  const resp = await __enfoqueGhFetch(url, cfg.token, {});
  if (resp.status === 404) throw new Error("Gist nao encontrado (404). Configure o Gist ID.");
  if (resp.status === 401 || resp.status === 403) throw new Error("Token sem permissao (401/403). Configure escopo 'gist'.");
  if (!resp.ok) throw new Error("Erro GitHub: " + resp.status);

  const json = await resp.json();
  const files = (json && json.files) ? json.files : {};
  const fileNames = Object.keys(files || {});

  // Username para filtrar pelo perfil
  const usernameLower = String(username || "").trim().toLowerCase();
  console.log('[BaterProd] DEBUG: Procurando dados para o perfil:', username, '(', usernameLower, ')');
  console.log('[BaterProd] DEBUG: Arquivos no Gist:', fileNames);

  // Funcao para processar conteudo
  function processFileContent(content, fileName) {
    const parsed = __enfoqueSafeJsonParse(content) || {};
    
    // NOVO FORMATO COM PERFIL: { "perfil": "Marcelo", "itens": [...] }
    if (parsed && typeof parsed === "object") {
      const perfil = String(parsed.perfil || "").trim();
      const temPerfilValido = perfil && perfil.toLowerCase() === usernameLower;
      const temPerfil = !!perfil;
      
      // Pega a data para ordenacao
      let ts = 0;
      if (parsed.dataExportacao) {
        ts = new Date(parsed.dataExportacao).getTime() || Date.now();
      } else if (parsed.data) {
        ts = new Date(parsed.data).getTime() || Date.now();
      } else {
        ts = Number(parsed.ts || parsed.updatedAt || 0) || Date.now();
      }
      
      // Verifica se tem itens
      if (Array.isArray(parsed.itens) && parsed.itens.length > 0) {
        console.log(`[BaterProd] DEBUG: ${fileName} - Perfil: "${perfil || '(sem perfil)'}", TS: ${ts}, Itens: ${parsed.itens.length}`);
        
        return { 
          payload: parsed, 
          ts: ts,
          fileName: fileName,
          temPerfilValido: temPerfilValido,
          temPerfil: temPerfil
        };
      }
    }
    
    // Formato antigo: baterprod_mobile.usuario.history[]
    const u = usernameLower;
    const root = parsed && typeof parsed === "object" ? parsed : {};
    const bp = (root.baterprod_mobile && typeof root.baterprod_mobile === "object") ? root.baterprod_mobile : {};
    const userObj = (bp[u] && typeof bp[u] === "object") ? bp[u] : null;

    if (!userObj) return null;

    // Verifica se tem history com dados
    if (Array.isArray(userObj.history) && userObj.history.length > 0) {
      const newest = userObj.history.slice(0).sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))[0];
      const payload = newest?.payload ?? newest;
      const ts = Number(newest?.ts || 0);
      if (payload) {
        console.log(`[BaterProd] DEBUG: ${fileName} - Formato antigo history, TS: ${ts}`);
        return { 
          payload, 
          ts: ts || Date.now(),
          fileName: fileName,
          temPerfilValido: true,
          temPerfil: true
        };
      }
    }
    
    return null;
  }

  // Coleta todos os arquivos validos
  const validFiles = [];
  
  for (const fileName of fileNames) {
    const fi = files[fileName];
    if (!fi) continue;
    
    let fileContent = "";
    if (typeof fi?.content === "string") {
      fileContent = fi.content;
    } else if (fi?.raw_url) {
      const rawResp = await __enfoqueGhFetch(fi.raw_url, cfg.token, {});
      if (rawResp.ok) fileContent = await rawResp.text();
    }
    
    const result = processFileContent(fileContent, fileName);
    if (result && result.payload) {
      validFiles.push(result);
    }
  }

  if (validFiles.length === 0) {
    throw new Error(`Nenhum dado encontrado para o perfil "${username}" no Gist.`);
  }

  // Separa arquivos COM perfil valido dos que NAO tem perfil
  const comPerfilValido = validFiles.filter(f => f.temPerfilValido);
  const semPerfilValido = validFiles.filter(f => !f.temPerfilValido);

  console.log(`[BaterProd] DEBUG: Com perfil valido: ${comPerfilValido.length}, Sem perfil: ${semPerfilValido.length}`);

  // Usa apenas arquivos com perfil valido (se houver)
  const arquivosParaUsar = comPerfilValido.length > 0 ? comPerfilValido : semPerfilValido;

  // Ordena por timestamp (mais recente primeiro)
  arquivosParaUsar.sort((a, b) => b.ts - a.ts);

  console.log('[BaterProd] DEBUG: Arquivos validos:', arquivosParaUsar.length);
  arquivosParaUsar.forEach((f, i) => {
    console.log(`  ${i+1}. ${f.fileName} - TS: ${f.ts}`);
  });

  // Pega o mais recente
  const maisRecente = arquivosParaUsar[0];
  console.log('[BaterProd] DEBUG: Usando arquivo mais recente:', maisRecente.fileName);

  return { 
    payload: maisRecente.payload, 
    ts: maisRecente.ts 
  };
}async function __enfoqueDownloadBaterprodFromGist(username, password, statusEl, saveType) {
  if (!__enfoqueBaterprodValidateUserPass(username, password)) {
    throw new Error("Usuário ou senha inválidos.");
  }

  if (statusEl) statusEl.textContent = "Conectando no GitHub…";
  const cfg = await __enfoqueBaterprodGetGistConfig();

  if (statusEl) statusEl.textContent = "Baixando dados do Gist…";
  const res = await __enfoqueBaterprodReadFromGist(cfg, username);

  const sid = "gist:" + String(username || "").trim().toLowerCase() + ":" + String(res.ts || Date.now());
  
  if (saveType === 'orcamento') {
    // Salvar como orçamento
    __enfoqueSaveBaterprodAsOrcamento(res.payload, sid);
  } else {
    // Salvar como rascunho (padrão)
    __enfoqueSaveBaterprodMobileDraft(res.payload, sid);
  }

  // opcional: salva o arquivo escolhido no storage (para persistir)
  try {
    const obj = {};
    obj[__ENFOQUE_BATERPROD_GIST_FILE_KEY] = cfg.file || __ENFOQUE_BATERPROD_GIST_FILE_DEFAULT;
    await __enfoqueStorageSet(obj);
  } catch (_) {}

  return true;
}

// Salvar payload do celular como orçamento no local storage
function __enfoqueSaveBaterprodAsOrcamento(payload, serverId) {
  try {
    if (!payload) {
      __enfoqueToast("Nada para salvar (payload vazio).", "warn");
      return;
    }

    // Extrai itens do payload
    const p = payload || {};
    let raw = null;
    
    // Suporta payload com metadados + itens
    const pp = (p && typeof p === "object" && p.payload && typeof p.payload === "object") ? p.payload : null;

    if (Array.isArray(p.itens)) raw = p.itens;
    else if (Array.isArray(p.items)) raw = p.items;
    else if (Array.isArray(p.produtosBatidos)) raw = p.produtosBatidos;
    else if (Array.isArray(p.produtos)) raw = p.produtos;
    else if (Array.isArray(payload)) raw = payload;
    else if (pp && Array.isArray(pp.itens)) raw = pp.itens;
    else if (pp && Array.isArray(pp.items)) raw = pp.items;
    else if (pp && Array.isArray(pp.produtosBatidos)) raw = pp.produtosBatidos;
    else if (pp && Array.isArray(pp.produtos)) raw = pp.produtos;

    const itens = [];
    (Array.isArray(raw) ? raw : []).forEach((it) => {
      if (!it) return;
      const codigo = String(it.barcode ?? it.codigo ?? it.cod ?? it.sku ?? it.productCode ?? it.ean ?? it.gtin ?? it.codigoBarras ?? it.codigobarras ?? '').trim();
      const nome = String(it.nome ?? it.name ?? it.descricao ?? it.desc ?? '').trim();
      const quantidade = String(it.quantidade ?? it.qtd ?? it.qtde ?? it.quantity ?? 1).trim();
      
      if (!codigo && !nome) return;
      const nomeFinal = nome || codigo;
      itens.push({ codigo, nome: nomeFinal, quantidade });
    });

    if (!itens.length) {
      __enfoqueToast("Payload veio sem itens válidos.", "warn");
      return;
    }

    const exportadoPor = String(p.exportadoPor ?? pp?.exportadoPor ?? 'prods-celular').trim();
    const title = exportadoPor ? `prods-celular (${exportadoPor})` : "prods-celular";

    const now = new Date();
    const orcamentoData = {
      id: String(Date.now()),
      serverId: serverId,
      title: title,
      createdAt: now.toISOString(),
      createdAtBR: now.toLocaleString("pt-BR"),
      responsavel: exportadoPor,
      itens: itens
    };

    // Salva no local storage como "enfoque_orcamento_produtos"
    chrome.storage.local.set({ "enfoque_orcamento_produtos": orcamentoData }, () => {
      __enfoqueToast("Baixado para Lista de orçamento! Use 'Exportar produtos' na página de orçamento.", "ok");
    });
  } catch (e) {
    __enfoqueToast("Erro ao salvar como orçamento.", "bad");
    console.error('[BaterProd] Erro ao salvar orçamento:', e);
  }
}

// =============================================================
// EXPORTAR PRODUTOS - Vendas/Edit (Orçamento)
// =============================================================

// Lê os produtos da página de vendas/edit
function __enfoqueReadVendasProdutosFromPage() {
  const produtos = [];
  
  try {
    // Tenta encontrar a tabela de produtos
    const tbodies = document.querySelectorAll('tbody[ng-repeat*="item in dados.Produtos"], tbody[ng-repeat*="item in Produtos"], #produtos tbody');
    
    tbodies.forEach((tbody) => {
      const tr = tbody.querySelector('tr');
      if (!tr) return;
      
      // Procura o campo de código/produto
      const cell = tr.querySelector('.ListField');
      const qtdInput = tr.querySelector('input[id*="rptProdutoQuantidade"], input[ng-model*="Quantidade"]');
      
      if (cell && qtdInput) {
        const txt = (cell.textContent || cell.innerText || '').trim();
        const parts = txt.split(' - ');
        const codigo = String(parts.shift() || '').trim();
        const nome = String(parts.join(' - ') || '').trim();
        const quantidade = qtdInput.value || '1';
        
        if (codigo || nome) {
          produtos.push({ codigo, nome: nome || codigo, quantidade });
        }
      }
    });
    
    // Fallback: tenta encontrar por outros seletores
    if (!produtos.length) {
      document.querySelectorAll('input[id*="rptProdutoDescricao"], input[id*="rptProdutoQuantidade"]').forEach((input) => {
        const row = input.closest('tr') || input.closest('tbody');
        if (!row) return;
        
        const descInput = row.querySelector('input[id*="rptProdutoDescricao"]');
        const qtdInput = row.querySelector('input[id*="rptProdutoQuantidade"]');
        
        if (descInput) {
          const txt = descInput.value || '';
          const parts = txt.split(' - ');
          const codigo = String(parts.shift() || '').trim();
          const nome = String(parts.join(' - ') || '').trim();
          const quantidade = qtdInput ? qtdInput.value || '1' : '1';
          
          if (codigo || nome) {
            produtos.push({ codigo, nome: nome || codigo, quantidade });
          }
        }
      });
    }
  } catch (e) {
    console.error('[Vendas] Erro ao ler produtos da página:', e);
  }
  
  return produtos;
}

// Exporta produtos salvos para a página de vendas/edit
function __enfoqueExportProdutosToVendasPage() {
  chrome.storage.local.get(["enfoque_orcamento_produtos"], (res) => {
    const data = res.enfoque_orcamento_produtos;
    
    if (!data || !data.itens || !data.itens.length) {
      __enfoqueToast("Nenhum produto salvo na Lista de orçamento. Baixe primeiro via 'Baixar prods (celular)'.", "warn");
      return;
    }
    
    const delay = 1500;
    
    data.itens.forEach((item, index) => {
      setTimeout(() => {
        // Encontra o campo de produto na página
        const produtoInput = document.querySelector('#LocalizarProdutoNew_Produto');
        
        if (produtoInput) {
          // Digita o código do produto
          produtoInput.focus();
          produtoInput.value = item.codigo || item.nome || '';
          produtoInput.dispatchEvent(new Event('input', { bubbles: true }));
          produtoInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Prepara a quantidade no formato esperado pelo Angular
          let qtd = item.quantidade || '1';
          // Converte para formato brasileiro se necessário
          if (!qtd.includes(',')) {
            qtd = qtd + ',0000';
          }
          
          // Aguarda o Angular adicionar a linha e preenche a quantidade
          setTimeout(() => {
            // Procura tbody com ng-repeat que contenha o código do produto
            const tbodies = document.querySelectorAll('tbody[ng-repeat="item in dados.Produtos"]');
            
            for (const tbody of tbodies) {
              const descInput = tbody.querySelector('input[id*="rptProdutoDescricao"]');
              const textContent = descInput ? (descInput.value || '') : '';
              
              // Verifica se o código está no valor do input
              if (textContent && (textContent.includes(item.codigo) || (item.codigo && textContent.includes(item.codigo)))) {
                // Encontrou a linha correta
                const qtdInput = tbody.querySelector('input[id="rptProdutoQuantidade"]');
                if (qtdInput) {
                  console.log(`[Export] Preenchendo quantidade para ${item.codigo}: ${qtd}`);
                  
                  // Seleciona todo o texto e apaga
                  qtdInput.focus();
                  qtdInput.select();
                  
                  // Apaga o texto selecionado
                  qtdInput.value = '';
                  qtdInput.dispatchEvent(new Event('input', { bubbles: true }));
                  qtdInput.dispatchEvent(new Event('change', { bubbles: true }));
                  
                  // Digita a nova quantidade
                  qtdInput.value = qtd;
                  qtdInput.dispatchEvent(new Event('input', { bubbles: true }));
                  qtdInput.dispatchEvent(new Event('change', { bubbles: true }));
                  qtdInput.dispatchEvent(new Event('blur', { bubbles: true }));
                  
                  // Simula keydown Enter
                  qtdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                  qtdInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
                  
                  // Tenta chamar a função do Angular se disponível
                  if (window.angular) {
                    const el = window.angular.element(qtdInput);
                    const scope = el.scope();
                    if (scope && scope.item) {
                      scope.item.Quantidade = parseFloat(qtd.replace(',', '.')) || 1;
                      scope.$apply();
                    }
                  }
                  break;
                }
              }
            }
          }, 1000);
        }
      }, delay * (index + 1));
    });
    
    __enfoqueToast(`Exportando ${data.itens.length} produtos para o orçamento...`, "ok");
  });
}

// Adiciona botão flutuante de exportar produtos (Vendas/Edit)
function __enfoqueEnsureVendasExportarBtn() {
  try {
    // Verifica se já existe o botão
    if (document.getElementById('enfoque-vendas-exportar-btn')) return;
    
    // Cria o botão flutuante
    const btn = document.createElement('button');
    btn.id = 'enfoque-vendas-exportar-btn';
    btn.innerHTML = '📤';
    btn.title = 'Exportar produtos da Lista de orçamento';
    btn.style.cssText = [
      'position: fixed',
      'top: 14px',
      'right: 14px',
      'z-index: 9999999',
      'width: 44px',
      'height: 44px',
      'border-radius: 16px',
      'border: 1px solid rgba(148, 163, 184, 0.3)',
      'background: rgba(124, 58, 237, 0.9)',
      'color: rgb(240, 253, 244)',
      'cursor: pointer',
      'font-size: 20px',
      'font-weight: 800',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'box-shadow: 0 4px 12px rgba(0,0,0,0.3)'
    ].join(';');
    
    btn.addEventListener('click', () => {
      __enfoqueExportProdutosToVendasPage();
    });
    
    // Adiciona ao body
    document.body.appendChild(btn);
  } catch (e) {
    console.error('[Vendas] Erro ao criar botão de exportar:', e);
  }
}

function __enfoqueCloseBaterprodMobileDownloadModal() {
  try { document.getElementById("__enfoque_bp_mobile_dl_overlay")?.remove(); } catch (_) {}
}

function __enfoqueOpenBaterprodMobileDownloadModal() {
  try {
    const overlayId = "__enfoque_bp_mobile_dl_overlay";
    document.getElementById(overlayId)?.remove();

    const overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(2,6,23,.55);z-index:999999;display:flex;align-items:center;justify-content:center;padding:18px;";

    const panel = document.createElement("div");
    panel.style.cssText = "width:520px;max-width:min(520px, 96vw);background:#fff;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.25);border:1px solid rgba(2,6,23,.12);overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;";

    const hdr = document.createElement("div");
    hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f1f5f9;border-bottom:1px solid rgba(2,6,23,.10)";

    const title = document.createElement("div");
    title.textContent = "Baixar prods (celular)";
    title.style.cssText = "font-weight:900;font-size:14px;color:#0f172a;";

    const x = document.createElement("button");
    x.textContent = "✕";
    x.style.cssText = "border:none;background:transparent;font-size:18px;line-height:18px;padding:4px 8px;cursor:pointer;color:#0f172a";
    x.addEventListener("click", () => __enfoqueCloseBaterprodMobileDownloadModal());

    hdr.appendChild(title);
    hdr.appendChild(x);

    const body = document.createElement("div");
    body.style.cssText = "padding:14px;";

    const p = document.createElement("div");
    p.style.cssText = "font-size:12px;color:#334155;line-height:1.45;margin-bottom:10px;";
    p.innerHTML = `Digite o <b>usuário e senha</b> do sync do celular.<br><span style="color:#64748b;">Usuários: ICARAI/1234, PAPEL E ARTE/5678, ILHA/9012, COPACABANA/3456, SAO GONCALO/7890, CENTRO/2468, ITAIPU/1357, Marcelo/a038</span><br><br><span style="color:#64748b;font-size:11px;">Supported formats: <b>itens</b> array with <b>codigo</b>/<b>barcode</b>, <b>quantidade</b>. Uses <b>perfil</b> for filtering.</span>`;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;";

    const c1 = document.createElement("div");
    c1.style.cssText = "flex:1;min-width:180px;";
    const lu = document.createElement("div");
    lu.textContent = "Usuário";
    lu.style.cssText = "font-size:11px;color:#475569;margin:0 0 4px;";
    const iu = document.createElement("input");
    iu.type = "text";
    iu.placeholder = "marcelo";
    iu.autocomplete = "username";
    iu.style.cssText = "width:100%;padding:9px 10px;border-radius:8px;border:1px solid rgba(2,6,23,.15);outline:none;";
    c1.appendChild(lu);
    c1.appendChild(iu);

    const c2 = document.createElement("div");
    c2.style.cssText = "flex:1;min-width:180px;";
    const lp = document.createElement("div");
    lp.textContent = "Senha";
    lp.style.cssText = "font-size:11px;color:#475569;margin:0 0 4px;";
    const ip = document.createElement("input");
    ip.type = "password";
    ip.placeholder = "••••";
    ip.autocomplete = "current-password";
    ip.style.cssText = "width:100%;padding:9px 10px;border-radius:8px;border:1px solid rgba(2,6,23,.15);outline:none;";
    c2.appendChild(lp);
    c2.appendChild(ip);

    row.appendChild(c1);
    row.appendChild(c2);

    // Opções de salvamento (rascunho ou orçamento)
    const optionsDiv = document.createElement("div");
    optionsDiv.style.cssText = "margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid rgba(2,6,23,.10);";
    
    const optionsTitle = document.createElement("div");
    optionsTitle.textContent = "Salvar em:";
    optionsTitle.style.cssText = "font-size:11px;font-weight:600;color:#475569;margin-bottom:8px;";
    optionsDiv.appendChild(optionsTitle);

    const radioGroup = document.createElement("div");
    radioGroup.style.cssText = "display:flex;gap:16px;flex-wrap:wrap;";

    function createRadio(label, value, checked) {
      const labelEl = document.createElement("label");
      labelEl.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#334155;";
      
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "saveType";
      radio.value = value;
      radio.checked = checked;
      
      const span = document.createElement("span");
      span.textContent = label;
      
      labelEl.appendChild(radio);
      labelEl.appendChild(span);
      return { labelEl, radio };
    }

    const optRascunho = createRadio("Lista de rascunho", "rascunho", true);
    const optOrcamento = createRadio("Lista de orçamento", "orcamento", false);
    
    radioGroup.appendChild(optRascunho.labelEl);
    radioGroup.appendChild(optOrcamento.labelEl);
    optionsDiv.appendChild(radioGroup);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;";

    const status = document.createElement("div");
    status.style.cssText = "flex:1;font-size:11px;color:#64748b;min-width:220px;";
    status.textContent = "";

    const btn = document.createElement("button");
    btn.textContent = "Baixar agora";
    btn.style.cssText = "padding:9px 12px;border-radius:8px;border:none;background:#2563eb;color:#eff6ff;font-weight:800;cursor:pointer;font-size:13px;";

    const btnCancel = document.createElement("button");
    btnCancel.textContent = "Cancelar";
    btnCancel.style.cssText = "padding:9px 12px;border-radius:8px;border:1px solid rgba(2,6,23,.15);background:#fff;color:#0f172a;font-weight:800;cursor:pointer;font-size:13px;";
    btnCancel.addEventListener("click", () => __enfoqueCloseBaterprodMobileDownloadModal());

    function setBusy(b) {
      try { btn.disabled = !!b; } catch (_) {}
      try { iu.disabled = !!b; } catch (_) {}
      try { ip.disabled = !!b; } catch (_) {}
      radioGroup.querySelectorAll("input").forEach(r => r.disabled = !!b);
      btn.style.opacity = b ? ".7" : "1";
      btn.style.cursor = b ? "not-allowed" : "pointer";
    }

    async function run() {
      try {
        setBusy(true);
        status.textContent = "Iniciando…";
        const saveType = optOrcamento.radio.checked ? "orcamento" : "rascunho";
        await __enfoqueDownloadBaterprodFromGist(iu.value, ip.value, status, saveType);
        status.textContent = "OK ✅";
        setTimeout(() => __enfoqueCloseBaterprodMobileDownloadModal(), 450);
      } catch (e) {
        status.textContent = String(e?.message || e || "Erro ao baixar.");
      } finally {
        setBusy(false);
      }
    }

    btn.addEventListener("click", run);
    ip.addEventListener("keydown", (ev) => { if (ev.key === "Enter") run(); });

    actions.appendChild(status);
    actions.appendChild(btnCancel);
    actions.appendChild(btn);

    body.appendChild(p);
    body.appendChild(row);
    body.appendChild(optionsDiv);
    body.appendChild(actions);

    panel.appendChild(hdr);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    setTimeout(() => { try { iu.focus(); } catch (_) {} }, 30);
  } catch (e) {
    __enfoqueToast("Erro ao abrir modal de download.", "bad");
  }
}
// =============================================================
// 5. MONITORAR QUANTIDADE ALTA (alerta visual)
// =============================================================

setInterval(() => monitorQuantity(), 600);

function monitorQuantity() {
  if (!alertMode) return;

  let input = document.querySelector("input[id*=rptProdutoQuantidade]");
  if (!input) return;

  let val = parseFloat(input.value);
  if (isNaN(val)) return;

  if (val > 50 && val !== lastAlertValue) {
    lastAlertValue = val;
    showQuantityAlert(val);
  }

  if (val <= 50) {
    lastAlertValue = null;
  }
}

function showQuantityAlert(val) {
  let old = document.getElementById("alert_quantidade");
  if (old) old.remove();

  let bar = document.createElement("div");
  bar.id = "alert_quantidade";
  bar.style = `
    position:fixed;top:0;left:0;width:100%;
    background:red;color:white;padding:12px;
    font-size:18px;font-weight:bold;text-align:center;
    z-index:9999999;
  `;
  bar.innerText = "🚨 Quantidade muito alta: " + val;

  document.body.appendChild(bar);

  setTimeout(() => {
    let x = document.getElementById("alert_quantidade");
    if (x) x.remove();
  }, 4000);
}

// =============================================================
// 6. POPUP AUTOMÁTICO PARA RESTAURAR BACKUP NA LIST (CORRIGIDO)
// =============================================================

function checkForRestorePopup() {
  if (restoreBannerShown) return;

  chrome.storage.local.get(["sige_backup"], (res) => {
    if (!res.sige_backup) return;

    backupData = res.sige_backup;
    restoreBannerShown = true;

    console.log("🔄 Backup encontrado na LIST.");

    let d = document.createElement("div");
    d.id = "restore_popup";
    d.style = `
      position:fixed;top:0;left:0;width:100%;
      background:#ffd966;padding:14px;
      font-size:18px;font-weight:bold;
      border-bottom:3px solid #c49f00;
      text-align:center;z-index:99999999;
    `;
    d.innerHTML = `
      🔄 Backup encontrado! Deseja restaurar?<br><br>
      <button id='rYes'>Sim (cabeçalho + produtos)</button>
      <button id='rItems'>Só produtos (troca depósito)</button>
      <button id='rNo'>Não</button>
    `;
    document.body.appendChild(d);

    // RESTAURAR COMPLETO
    document.getElementById("rYes").onclick = () => {
      chrome.storage.local.set({ sige_pending_restore: "all" }, () => {
        pauseBackupUntil = Date.now() + 120000; // 2 min
        location.href =
          "https://enfoquepapelaria.meusige.com.br/sistema/EstoqueMovEntreDepositos/Edit";
      });
    };

    // RESTAURAR SOMENTE PRODUTOS
    document.getElementById("rItems").onclick = () => {
      chrome.storage.local.set({ sige_pending_restore: "items" }, () => {
        pauseBackupUntil = Date.now() + 120000; // 2 min
        location.href =
          "https://enfoquepapelaria.meusige.com.br/sistema/EstoqueMovEntreDepositos/Edit";
      });
    };

    // DESCARTAR BACKUP
    document.getElementById("rNo").onclick = () => {
      chrome.storage.local.remove(["sige_backup", "sige_pending_restore"]);
      d.remove();
    };
  });
}

// =============================================================
// 7. BACKUP AUTOMÁTICO — captura origem, destino, data e itens
// =============================================================

setInterval(() => autoBackup(), 1000);

function autoBackup() {
  if (!alertMode) return;
  if (Date.now() < pauseBackupUntil) return;
  if (secondsInEdit < 10) return;

  let origem = document.querySelector("#Deposito1")?.value || "";
  let destino = document.querySelector("#Deposito2")?.value || "";
  let responsavel = document.querySelector("#realizadoPor")?.value || "";
  let dataMov = document.querySelector("input.datetime")?.value || "";

  let itens = [];

  document.querySelectorAll("table tr").forEach(row => {
    let cell = row.querySelector(".ListField");
    let q = row.querySelector("input[id*=rptProdutoQuantidade]");

    if (cell && q) {
      const txt = (cell.innerText || "").trim();
      // Ex.: "7891027203061 - REGUA 30CM FLEXIVEL DECORADA - 790371"
      // Queremos salvar também o nome, removendo apenas o código fixo do início.
      const parts = txt.split(" - ");
      const cod = String(parts.shift() || "").trim();
      const nome = String(parts.join(" - ") || "").trim();
      itens.push({
        codigo: cod,
        nome,
        quantidade: q.value || ""
      });
    }
  });

  if (itens.length === 0) return;

  let backup = {
    origem,
    destino,
    responsavel,
    data: dataMov,
    itens
  };

  chrome.storage.local.set({ sige_backup: backup });
  backupData = backup;

  console.log("💾 Backup salvo:", backup);
}

// =============================================================
// 7B. BACKUP AUTOMÁTICO — PDV (/sistema/pdv)
//     Captura itens do carrinho (Qtd + Descrição) e permite restaurar
// =============================================================

setInterval(() => autoBackupPDV(), 1000);

// Monitora o vendedor do PDV (alerta apenas se estava 'Nenhum Vendedor' e o campo sumir/ficar invisível)
setInterval(() => monitorPdvVendedor(), 800);

// Monitora tela de Pagamentos do PDV e mantém o bridge atualizado
setInterval(() => { try { window.__ENFOQUE_PDV_BRIDGE__ && window.__ENFOQUE_PDV_BRIDGE__.tick && window.__ENFOQUE_PDV_BRIDGE__.tick(); } catch (_) {} }, 700);

// Mantém o campo novo do PDV ao lado do campo de busca de produto
setInterval(() => { try { ensurePdvCampoNovoAoLadoBusca(); } catch (_) {} }, 1000);

const __ENFOQUE_PDV_MARCA_API = "https://enfoquepapelaria.meusige.com.br/api/v2/Autocomplete/MarcaProduto";
const __ENFOQUE_PDV_AUTOCOMPLETE_PRODUTO_API = "https://enfoquepapelaria.meusige.com.br/api/v2/Autocomplete/Produto";
let __enfoquePdvMarcaTimer = null;
let __enfoquePdvProdutoTimer = null;
let __enfoquePdvMarcaReqSeq = 0;
let __enfoquePdvProdutoReqSeq = 0;
let __enfoquePdvProdutoHooked = false;

function ensurePdvCampoNovoAoLadoBusca() {
  try {
    if (!pdvMode && !/\/sistema\/pdv/i.test(location.pathname || "")) return;

    const busca = document.getElementById("txtNomeProduto");
    if (!busca || !busca.parentNode) return;

    const styleId = "enfoque_pdv_campo_novo_style";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        #txtNomeProduto.enfoque-pdv-busca-com-campo-novo{
          width: 445px !important;
          max-width: 445px !important;
        }
        #enfoquePdvCampoNovo{
          width: 110px !important;
          height: 40px !important;
          margin-top: 1px !important;
          margin-left: 6px !important;
          padding: 0 8px !important;
          border: 2px solid #9ccc65 !important;
          border-radius: 2px !important;
          box-sizing: border-box !important;
          font-size: 13px !important;
          color: #4b5563 !important;
          background: #fff !important;
          vertical-align: top !important;
          outline: none !important;
        }
        #enfoquePdvCampoNovo:focus{
          border-color: #6fac3f !important;
          box-shadow: 0 0 0 2px rgba(111,172,63,.16) !important;
        }
        #enfoquePdvMarcaSuggestions{
          --primary: hsl(23, 91%, 58%);
          --primary10: hsl(23, 91%, 58%, 10%);
          --primary20: hsl(23, 91%, 58%, 20%);
          --primary50: hsl(23, 91%, 58%, 50%);
          --primary70: hsl(23, 91%, 58%, 70%);
          --secondary: hsl(46, 89%, 64%);
          --secondary10: hsl(46, 89%, 64%, 10%);
          --secondary20: hsl(46, 89%, 64%, 20%);
          --secondary50: hsl(46, 89%, 64%, 50%);
          --secondary70: hsl(46, 89%, 64%, 70%);
          --bg-dark: hsl(0 0% 90%);
          --bg: hsl(0, 0%, 97%);
          --bg-light: hsl(300 50% 100%);
          --text: hsl(300 0% 4%);
          --text-muted: hsl(0 0% 28%);
          --border: hsl(0 0% 50%);
          --border-muted: hsl(340 0% 80%);
          --danger-primary35: hsl(14, 91%, 58%, 35%);
          --danger-primary40: hsl(14, 91%, 58%, 40%);
          --danger-primary45: hsl(14, 91%, 58%, 45%);
          --danger-secondary35: hsl(10, 100%, 84%, 35%);
          --bg-danger: linear-gradient(to top, var(--danger-primary35), var(--danger-secondary35));
          font-family: 'Open Sans', sans-serif !important;
          margin: 0 !important;
          position: absolute !important;
          z-index: 9999999 !important;
          display: none;
          background: var(--bg-light) !important;
          max-height: 300px !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          box-sizing: border-box !important;
          border: 1px solid var(--border-muted) !important;
          border-top: 0 !important;
          border-radius: 0 0 8px 8px !important;
          box-shadow: 0 10px 24px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.03) !important;
        }
        #enfoquePdvMarcaSuggestions{
          min-width: 110px !important;
          max-width: 360px !important;
        }
        #enfoquePdvMarcaSuggestions .autocomplete-suggestion{
          display: block !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          box-sizing: border-box !important;
          cursor: pointer !important;
          color: var(--text) !important;
          background: var(--bg-light) !important;
          border-bottom: 1px solid var(--border-muted) !important;
          padding: 7px 10px !important;
          line-height: 18px !important;
          font-size: 13px !important;
        }
        #enfoquePdvMarcaSuggestions .autocomplete-suggestion{
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          min-height: 24px !important;
          line-height: 16px !important;
        }
        #enfoquePdvMarcaSuggestions .autocomplete-suggestion:hover,
        #enfoquePdvMarcaSuggestions .autocomplete-selected{
          background: linear-gradient(90deg, var(--primary10), var(--secondary10)) !important;
        }
        #enfoquePdvMarcaSuggestions .autocomplete-suggestion strong{
          font-weight: 700 !important;
          color: hsl(23, 91%, 42%) !important;
        }
      `;
      document.head.appendChild(st);
    }

    busca.classList.add("enfoque-pdv-busca-com-campo-novo");
    let campo = document.getElementById("enfoquePdvCampoNovo");
    if (!campo) {
      campo = document.createElement("input");
      campo.type = "text";
      campo.id = "enfoquePdvCampoNovo";
      campo.placeholder = "Marcas";
      campo.autocomplete = "off";
      campo.setAttribute("aria-label", "Marcas");
      campo.value = localStorage.getItem("enfoque_pdv_marca_selecionada") || "";
      if (campo.value) campo.dataset.enfoqueMarcaSelecionada = campo.value;
      busca.insertAdjacentElement("afterend", campo);
    } else {
      campo.placeholder = "Marcas";
      campo.setAttribute("aria-label", "Marcas");
      if (campo.previousElementSibling !== busca) busca.insertAdjacentElement("afterend", campo);
    }

    enfoquePdvAtualizarModoMarcaAtiva(campo);
    ensurePdvMarcaAutocomplete(campo);
    try { __enfoquePdvInstallProductPhotoPreview(); } catch (_) {}
  } catch (e) {
    console.warn("Falha ao inserir campo Marcas no PDV:", e);
  }
}

function enfoquePdvGetTokenAsync() {
  return new Promise((resolve) => {
    try { __enfoqueGetToken((token) => resolve(token || null)); }
    catch (_) { resolve(null); }
  });
}

function enfoquePdvPosicionarLista(lista, input, minWidth, opts) {
  try {
    const r = input.getBoundingClientRect();
    const grudado = opts && opts.grudado;
    lista.style.left = (window.scrollX + r.left) + "px";
    lista.style.top = (window.scrollY + r.bottom + (grudado ? 0 : 2)) + "px";
    lista.style.minWidth = Math.max(minWidth || 0, r.width) + "px";
    if (opts && opts.widthAuto) lista.style.width = "auto";
    else lista.style.width = Math.max(minWidth || 0, r.width) + "px";
  } catch (_) {}
}

function enfoquePdvHideLista(id) {
  try {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  } catch (_) {}
}

function enfoquePdvMarcaValidaAtual(campoMarca) {
  try {
    const digitada = String((campoMarca && campoMarca.value) || "").trim();
    if (!digitada) return "";
    const selecionada = String((campoMarca && campoMarca.dataset && campoMarca.dataset.enfoqueMarcaSelecionada) || "").trim();
    const salva = String(localStorage.getItem("enfoque_pdv_marca_selecionada") || "").trim();
    const normalizar = (v) => String(v || "").trim().toLocaleUpperCase("pt-BR");
    if (selecionada && normalizar(selecionada) === normalizar(digitada)) return selecionada;
    if (salva && normalizar(salva) === normalizar(digitada)) {
      if (campoMarca && campoMarca.dataset) campoMarca.dataset.enfoqueMarcaSelecionada = salva;
      return salva;
    }
    return "";
  } catch (_) { return ""; }
}

function enfoquePdvAtualizarModoMarcaAtiva(campoMarca) {
  try {
    const ativa = !!enfoquePdvMarcaValidaAtual(campoMarca);
    document.body.classList.toggle("enfoque-pdv-marca-valida", ativa);
  } catch (_) {}
}

function enfoquePdvOcultarAutocompleteNativoProduto() {
  // V23: autocomplete/lista nativa de produtos do SIGE deve ficar visivel.
  // Esta funcao foi mantida como no-op por compatibilidade com chamadas antigas.
}

function enfoquePdvRestaurarAutocompleteNativoProduto() {
  try {
    if (/\/sistema\/pdv/i.test(location.pathname || "") || pdvMode) return;
    document.querySelectorAll('[data-enfoque-native-hidden="1"]').forEach((el) => {
      if (!el || el.id === "enfoquePdvMarcaSuggestions" || el.id === "enfoquePdvProdutoSuggestions") return;
      const oldDisplay = el.dataset.enfoqueOldDisplay || "";
      const oldVisibility = el.dataset.enfoqueOldVisibility || "";
      const oldPointer = el.dataset.enfoqueOldPointerEvents || "";
      if (oldDisplay) el.style.setProperty("display", oldDisplay); else el.style.removeProperty("display");
      if (oldVisibility) el.style.setProperty("visibility", oldVisibility); else el.style.removeProperty("visibility");
      if (oldPointer) el.style.setProperty("pointer-events", oldPointer); else el.style.removeProperty("pointer-events");
      delete el.dataset.enfoqueNativeHidden;
      delete el.dataset.enfoqueOldDisplay;
      delete el.dataset.enfoqueOldVisibility;
      delete el.dataset.enfoqueOldPointerEvents;
    });
  } catch (_) {}
}

function enfoquePdvEnsureHideNativeObserver() {
  // V23: nao observa nem oculta o autocomplete nativo do SIGE.
}

function enfoquePdvEscHtml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function enfoquePdvHighlightAutocomplete(texto, query) {
  const safe = enfoquePdvEscHtml(texto);
  const q = String(query || "").trim();
  if (!q) return safe;
  try {
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(esc, "ig"), (m) => "<strong>" + m + "</strong>");
  } catch (_) {
    return safe;
  }
}

function enfoquePdvProdutoNomeParaOrdenar(item) {
  const value = String((item && item.value) || "").trim();
  const aposTraco = value.includes("—") ? value.split("—").slice(1).join("—").trim() : value;
  return aposTraco || value;
}


function __enfoqueSendRuntimeMessageSafe(message) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error("chrome.runtime indisponivel"));
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message || String(lastError)));
          return;
        }
        if (!response || response.ok !== true) {
          reject(new Error((response && response.error) || "Resposta invalida da extensao"));
          return;
        }
        resolve(response.data);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function enfoquePdvBuscarMarcas(query) {
  const q = String(query || "").trim();
  if (q.length < 1) return [];
  try {
    const data = await __enfoqueSendRuntimeMessageSafe({
      type: "enfoque-sige-autocomplete-marca",
      params: { query: q }
    });
    const payload = data && data.data ? data.data : data;
    return Array.isArray(payload && payload.suggestions) ? payload.suggestions.filter(Boolean) : [];
  } catch (error) {
    console.warn("[Enfoque PDV] Falha no autocomplete de marcas via backend:", error);
    return [];
  }
}

function ensurePdvMarcaAutocomplete(campo) {
  if (!campo || campo.dataset.enfoqueMarcaHooked === "1") return;
  campo.dataset.enfoqueMarcaHooked = "1";

  let lista = document.getElementById("enfoquePdvMarcaSuggestions");
  if (!lista) {
    lista = document.createElement("div");
    lista.id = "enfoquePdvMarcaSuggestions";
    lista.className = "autocomplete-suggestions";
    document.body.appendChild(lista);
  }

  function renderMarcas(marcas) {
    enfoquePdvPosicionarLista(lista, campo, campo.offsetWidth || 110, { grudado: true });
    lista.innerHTML = "";
    if (!marcas || !marcas.length) {
      lista.style.display = "none";
      return;
    }
    marcas.slice(0, 12).forEach((marca, idx) => {
      const item = document.createElement("div");
      item.className = "autocomplete-suggestion" + (idx === 0 ? " autocomplete-selected" : "");
      item.innerHTML = enfoquePdvHighlightAutocomplete(marca, campo.value);
      item.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        campo.value = marca;
        campo.dataset.enfoqueMarcaSelecionada = marca;
        localStorage.setItem("enfoque_pdv_marca_selecionada", marca);
        enfoquePdvAtualizarModoMarcaAtiva(campo);
        lista.style.display = "none";
      });
      lista.appendChild(item);
    });
    lista.style.display = "block";
  }

  campo.addEventListener("input", () => {
    const q = String(campo.value || "").trim();
    campo.dataset.enfoqueMarcaSelecionada = "";
    localStorage.removeItem("enfoque_pdv_marca_selecionada");
    enfoquePdvAtualizarModoMarcaAtiva(campo);
    if (!q) {
      enfoquePdvHideLista("enfoquePdvMarcaSuggestions");
      return;
    }
    clearTimeout(__enfoquePdvMarcaTimer);
    __enfoquePdvMarcaTimer = setTimeout(async () => {
      const seq = ++__enfoquePdvMarcaReqSeq;
      const marcas = await enfoquePdvBuscarMarcas(q);
      if (seq !== __enfoquePdvMarcaReqSeq) return;
      renderMarcas(marcas);
    }, 120);
  });

  campo.addEventListener("focus", () => {
    if (String(campo.value || "").trim() && !campo.dataset.enfoqueMarcaSelecionada) {
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  campo.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") enfoquePdvHideLista("enfoquePdvMarcaSuggestions");
    if (ev.key === "Enter") {
      const sel = lista && lista.querySelector(".autocomplete-selected");
      if (sel && lista.style.display !== "none") {
        ev.preventDefault();
        sel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      }
    }
  });

  campo.addEventListener("blur", () => setTimeout(() => enfoquePdvHideLista("enfoquePdvMarcaSuggestions"), 180));
}

async function enfoquePdvBuscarProdutosAutocomplete(query) {
  const q = String(query || "").trim();
  if (q.length < 1) return [];
  try {
    const data = await __enfoqueSendRuntimeMessageSafe({
      type: "enfoque-sige-autocomplete-produto",
      params: { showoption: "Tudo", isvenda: "true", requestData: "true", query: q }
    });
    const payload = data && data.data ? data.data : data;
    const sugestoes = Array.isArray(payload && payload.suggestions) ? payload.suggestions.filter(Boolean) : [];
    return sugestoes.sort((a, b) => enfoquePdvProdutoNomeParaOrdenar(a).localeCompare(enfoquePdvProdutoNomeParaOrdenar(b), "pt-BR", { sensitivity: "base", numeric: true }));
  } catch (error) {
    console.warn("[Enfoque PDV] Falha no autocomplete de produtos via backend:", error);
    return [];
  }
}

function enfoquePdvRenderProdutosAutocomplete(busca, sugestoes) {
  // V23: nao renderiza sugestoes proprias de produtos; usa a lista nativa do SIGE.
}

function enfoquePdvNormalizarCodigoAutocomplete(v) {
  try {
    const raw = String(v || "").trim();
    if (!raw) return "";
    const soDigitos = raw.replace(/\D+/g, "");
    if (soDigitos) return soDigitos.replace(/^0+/, "") || "0";
    return raw.toLocaleUpperCase("pt-BR");
  } catch (_) { return String(v || "").trim(); }
}

function enfoquePdvTextoCodigoAutocomplete(v) {
  try {
    return String(v || "").split("—")[0].trim();
  } catch (_) { return ""; }
}

function enfoquePdvDispararEventosAutocompleteNativo(el) {
  if (!el) return false;
  try {
    ["mouseover", "mouseenter", "mousedown", "mouseup", "click"].forEach((tipo) => {
      try {
        el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window }));
      } catch (_) {}
    });
    return true;
  } catch (_) { return false; }
}

function enfoquePdvTentarSelecionarAutocompleteNativo(busca, sug) {
  try {
    const value = String((sug && sug.value) || "").trim();
    const produtoId = String((sug && sug.data && sug.data.ProdutoId) || "").trim();
    const codigoValue = enfoquePdvTextoCodigoAutocomplete(value);
    const alvoId = enfoquePdvNormalizarCodigoAutocomplete(produtoId);
    const alvoCodigo = enfoquePdvNormalizarCodigoAutocomplete(codigoValue);
    const alvoNome = value.split("—").slice(1).join("—").trim().toLocaleUpperCase("pt-BR");

    const candidatos = Array.from(document.querySelectorAll("div.autocomplete-suggestions:not(#enfoquePdvMarcaSuggestions):not(#enfoquePdvProdutoSuggestions) .autocomplete-suggestion"));
    if (!candidatos.length) return false;

    const scoreItem = (el) => {
      const texto = String(el.textContent || "").replace(/;\s*$/, "").trim();
      const codigoEl = enfoquePdvNormalizarCodigoAutocomplete(enfoquePdvTextoCodigoAutocomplete(texto));
      const nomeEl = texto.split("—").slice(1).join("—").trim().toLocaleUpperCase("pt-BR");
      if (alvoId && codigoEl && codigoEl === alvoId) return 100;
      if (alvoCodigo && codigoEl && codigoEl === alvoCodigo) return 90;
      if (alvoNome && nomeEl && nomeEl === alvoNome) return 80;
      if (value && texto.toLocaleUpperCase("pt-BR") === value.toLocaleUpperCase("pt-BR")) return 70;
      return 0;
    };

    let melhor = null;
    let melhorScore = 0;
    candidatos.forEach((el) => {
      const sc = scoreItem(el);
      if (sc > melhorScore) { melhor = el; melhorScore = sc; }
    });

    if (!melhor || melhorScore <= 0) return false;
    return enfoquePdvDispararEventosAutocompleteNativo(melhor);
  } catch (e) {
    console.warn("[Enfoque PDV] Falha ao tentar selecionar item nativo do autocomplete:", e);
    return false;
  }
}

function enfoquePdvSelecionarProdutoAutocomplete(busca, sug) {
  try {
    const value = String((sug && sug.value) || "").trim();
    const produtoId = String((sug && sug.data && sug.data.ProdutoId) || "").trim();
    const codigo = produtoId || (value.includes("—") ? value.split("—")[0].trim() : value);

    // Primeiro tenta deixar o SIGE selecionar o produto pelo próprio item nativo escondido.
    // Isso evita erro quando o código curto/reduzido sozinho bate com outros produtos.
    if (enfoquePdvTentarSelecionarAutocompleteNativo(busca, sug)) {
      return;
    }

    // Fallback: comportamento anterior, usando apenas o código.
    busca.value = codigo;
    try { busca.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
    try { busca.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
    try {
      if (window.angular && typeof window.angular.element === "function") {
        const ngEl = window.angular.element(busca);
        const ngModel = ngEl && ngEl.controller ? ngEl.controller("ngModel") : null;
        if (ngModel && typeof ngModel.$setViewValue === "function") {
          ngModel.$setViewValue(codigo);
          if (typeof ngModel.$render === "function") ngModel.$render();
        }
        const scope = ngEl && typeof ngEl.scope === "function" ? ngEl.scope() : null;
        if (scope) {
          if ("nomeProduto" in scope) scope.nomeProduto = codigo;
          if (typeof scope.onProdutoTextChanged === "function") { try { scope.onProdutoTextChanged(true); } catch (_) {} }
          if (typeof scope.$applyAsync === "function") scope.$applyAsync();
          else if (typeof scope.$apply === "function") { try { scope.$apply(); } catch (_) {} }
        }
      }
    } catch (_) {}
    setTimeout(() => {
      try { busca.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", which: 13, keyCode: 13 })); } catch (_) {}
      try { busca.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", which: 13, keyCode: 13 })); } catch (_) {}
    }, 30);
  } catch (e) {
    console.warn("[Enfoque PDV] Falha ao selecionar produto do autocomplete novo:", e);
  }
}

async function enfoquePdvBuscarProdutosAutocompleteApi(busca) {
  // V23: desativado para restaurar autocomplete padrao do SIGE.
  enfoquePdvHideLista("enfoquePdvProdutoSuggestions");
}

function enfoquePdvMoverSelecaoProduto(delta) {
  try {
    const lista = document.getElementById("enfoquePdvProdutoSuggestions");
    if (!lista || lista.style.display === "none") return;
    const itens = Array.from(lista.querySelectorAll(".autocomplete-suggestion[data-enfoque-codigo]"));
    if (!itens.length) return;
    let idx = itens.findIndex((el) => el.classList.contains("autocomplete-selected"));
    if (idx < 0) idx = 0;
    itens[idx].classList.remove("autocomplete-selected");
    idx = (idx + delta + itens.length) % itens.length;
    itens[idx].classList.add("autocomplete-selected");
    try { itens[idx].scrollIntoView({ block: "nearest" }); } catch (_) {}
  } catch (_) {}
}

function ensurePdvProdutoAutocompleteApi(busca, campoMarca) {
  // V23: removido autocomplete/lista de sugestoes de produtos da extensao.
  // O campo #txtNomeProduto volta a usar somente o autocomplete padrao do SIGE.
}


// =============================================================
// V25 - Preview de foto do produto nas sugestoes nativas do SIGE
// Ao passar o mouse em uma sugestao do #txtNomeProduto, pega o codigo
// exibido pelo SIGE, consulta a rota normalizada da intranet/estoque-api
// para obter o ID interno do produto e exibe a foto via MostraFoto.ashx.
// =============================================================
const __ENFOQUE_PDV_PRODUCT_PREVIEW_SEARCH_API = "https://intranet.enfoquepapelaria.com.br/estoque-api/api/products/search";
const __ENFOQUE_PDV_PRODUCT_PREVIEW_GEREN_ID = "2c836e8b-b9ee-4110-8791-9883a9cf0eb7";
const __ENFOQUE_PDV_PRODUCT_PREVIEW_WIDTH = 230;
let __enfoquePdvProductPreviewInstalled = false;
let __enfoquePdvProductPreviewTimer = null;
let __enfoquePdvProductPreviewHideTimer = null;
let __enfoquePdvProductPreviewTarget = null;
let __enfoquePdvProductPreviewSeq = 0;
const __enfoquePdvProductPreviewCache = new Map();

function __enfoquePdvProductPreviewText(el) {
  return String((el && el.textContent) || "").replace(/\s+/g, " ").trim();
}

function __enfoquePdvProductPreviewExtractCode(el) {
  const texto = __enfoquePdvProductPreviewText(el);
  const antesDoTraco = texto.split("—")[0] || "";
  return antesDoTraco.replace(/[^\dA-Za-z]/g, "").trim();
}

function __enfoquePdvProductPreviewNormalize(v) {
  try {
    return String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    return String(v || "").toLowerCase().trim();
  }
}

function __enfoquePdvProductPreviewIsNativeProductSuggestion(item) {
  try {
    if (!item || !pdvMode && !/\/sistema\/pdv/i.test(location.pathname || "")) return false;
    const container = item.closest(".autocomplete-suggestions");
    if (!container) return false;
    if (container.id === "enfoquePdvMarcaSuggestions" || container.id === "enfoquePdvProdutoSuggestions" || container.id === "enfoque-school-customer-suggestions") return false;
    if (container.closest("#enfoquePdvMarcaSuggestions, #enfoquePdvProdutoSuggestions, #enfoque-school-customer-suggestions")) return false;

    const texto = __enfoquePdvProductPreviewText(item);
    if (!texto || texto.indexOf("—") < 0) return false;
    const codigo = __enfoquePdvProductPreviewExtractCode(item);
    if (!codigo) return false;

    const busca = document.getElementById("txtNomeProduto");
    if (!busca) return false;
    const br = busca.getBoundingClientRect();
    const cr = container.getBoundingClientRect();

    // O autocomplete nativo do produto aparece abaixo do campo #txtNomeProduto.
    // Isso evita acionar preview em outros autocompletes que usam a mesma classe.
    const verticalPerto = Math.abs(cr.top - br.bottom) < 140 || (cr.top >= br.top - 20 && cr.top <= br.bottom + 200);
    const horizontalPerto = Math.abs(cr.left - br.left) < 260 || (cr.left <= br.right + 80 && cr.right >= br.left - 80);
    return verticalPerto && horizontalPerto;
  } catch (_) {
    return false;
  }
}

function __enfoquePdvProductPreviewChooseProduct(products, codigo, textoSugestao) {
  const cod = __enfoquePdvProductPreviewNormalize(codigo);
  const texto = __enfoquePdvProductPreviewNormalize(textoSugestao);
  const list = Array.isArray(products) ? products : [];
  return (
    list.find((p) => __enfoquePdvProductPreviewNormalize(p && p.code) === cod) ||
    list.find((p) => __enfoquePdvProductPreviewNormalize(p && p.raw && p.raw.CodigoNFe) === cod) ||
    list.find((p) => __enfoquePdvProductPreviewNormalize(p && p.raw && p.raw.Codigo) === cod) ||
    list.find((p) => texto && __enfoquePdvProductPreviewNormalize(p && p.name) && texto.includes(__enfoquePdvProductPreviewNormalize(p && p.name))) ||
    list[0]
  );
}

async function __enfoquePdvProductPreviewSearch(codigo, textoSugestao) {
  const chave = String(codigo || textoSugestao || "").trim();
  if (!chave) throw new Error("Codigo da sugestao vazio.");
  if (__enfoquePdvProductPreviewCache.has(chave)) return __enfoquePdvProductPreviewCache.get(chave);

  const url = __ENFOQUE_PDV_PRODUCT_PREVIEW_SEARCH_API + "?" + new URLSearchParams({ q: chave, limit: "10" }).toString();
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const json = await response.json().catch(() => null);
  const products = Array.isArray(json && json.products) ? json.products : Array.isArray(json && json.Produtos) ? json.Produtos : [];
  if (!response.ok || !products.length) throw new Error("Nenhum produto encontrado.");

  const product = __enfoquePdvProductPreviewChooseProduct(products, codigo, textoSugestao);
  if (!product || !product.id) throw new Error("Produto encontrado sem ID.");
  __enfoquePdvProductPreviewCache.set(chave, product);
  return product;
}

function __enfoquePdvProductPreviewEnsureStyle() {
  if (document.getElementById("enfoque_pdv_product_preview_style")) return;
  const st = document.createElement("style");
  st.id = "enfoque_pdv_product_preview_style";
  st.textContent = `
    #enfoquePdvProductPreviewBox{
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 270px !important;
      min-height: 130px !important;
      background: #fff !important;
      border: 1px solid #d0d7de !important;
      border-radius: 12px !important;
      box-shadow: 0 10px 28px rgba(0,0,0,.20) !important;
      padding: 10px !important;
      display: none;
      font-family: Arial, sans-serif !important;
      color: #111827 !important;
      font-size: 12px !important;
      line-height: 1.35 !important;
      box-sizing: border-box !important;
    }
    #enfoquePdvProductPreviewBox .enfoque-product-preview-title{
      font-weight: 700 !important;
      margin-bottom: 7px !important;
      font-size: 13px !important;
    }
    #enfoquePdvProductPreviewBox .enfoque-product-preview-name{
      color: #374151 !important;
      margin-bottom: 8px !important;
      word-break: break-word !important;
    }
    #enfoquePdvProductPreviewBox img{
      display: block !important;
      max-width: 230px !important;
      max-height: 230px !important;
      margin: 0 auto !important;
      border-radius: 8px !important;
      border: 1px solid #eee !important;
      background: #fafafa !important;
    }
  `;
  document.head.appendChild(st);
}

function __enfoquePdvProductPreviewBox() {
  __enfoquePdvProductPreviewEnsureStyle();
  let box = document.getElementById("enfoquePdvProductPreviewBox");
  if (box) return box;
  box = document.createElement("div");
  box.id = "enfoquePdvProductPreviewBox";
  document.body.appendChild(box);
  return box;
}

function __enfoquePdvProductPreviewPosition(box, item) {
  try {
    const rect = item.getBoundingClientRect();
    let left = rect.right + 12;
    let top = rect.top;
    if (left + 290 > window.innerWidth) left = rect.left - 290;
    if (top + 310 > window.innerHeight) top = window.innerHeight - 320;
    box.style.left = Math.max(10, left) + "px";
    box.style.top = Math.max(10, top) + "px";
  } catch (_) {}
}

function __enfoquePdvProductPreviewShowLoading(item) {
  const box = __enfoquePdvProductPreviewBox();
  __enfoquePdvProductPreviewPosition(box, item);
  box.innerHTML = '<div class="enfoque-product-preview-title">Carregando foto...</div><div style="color:#6b7280;">Buscando produto pelo codigo da sugestao.</div>';
  box.style.display = "block";
  __enfoquePdvProductPreviewScheduleHide();
}

function __enfoquePdvProductPreviewShowError(item, message) {
  const box = __enfoquePdvProductPreviewBox();
  __enfoquePdvProductPreviewPosition(box, item);
  box.innerHTML = '<div class="enfoque-product-preview-title" style="color:#b42318;">Sem preview</div><div>' + enfoquePdvEscHtml(message || "Nao foi possivel carregar a foto.") + '</div>';
  box.style.display = "block";
  __enfoquePdvProductPreviewScheduleHide();
}

function __enfoquePdvProductPreviewShowProduct(item, product) {
  const box = __enfoquePdvProductPreviewBox();
  __enfoquePdvProductPreviewPosition(box, item);
  const raw = product && product.raw ? product.raw : {};
  const codigo = product.code || raw.CodigoNFe || raw.Codigo || "";
  const nome = product.name || raw.Nome || "";
  const fotoUrl = location.origin + "/sistema/MostraFoto.ashx?" + new URLSearchParams({
    ProdutoID: String(product.id),
    GerenID: __ENFOQUE_PDV_PRODUCT_PREVIEW_GEREN_ID,
    width: String(__ENFOQUE_PDV_PRODUCT_PREVIEW_WIDTH)
  }).toString();
  box.innerHTML =
    '<div class="enfoque-product-preview-title">Preview do produto</div>' +
    '<div class="enfoque-product-preview-name">' + enfoquePdvEscHtml((codigo ? codigo + " — " : "") + nome) + '</div>' +
    '<img src="' + enfoquePdvEscHtml(fotoUrl) + '" alt="Foto do produto" ' +
    'onerror="this.style.display=\'none\'; this.parentElement.insertAdjacentHTML(\'beforeend\', \'<div style=&quot;color:#b42318;font-weight:700;&quot;>Produto sem foto ou foto indisponivel.</div>\')" />';
  box.style.display = "block";
  __enfoquePdvProductPreviewScheduleHide();
}

function __enfoquePdvProductPreviewHide() {
  clearTimeout(__enfoquePdvProductPreviewHideTimer);
  const box = document.getElementById("enfoquePdvProductPreviewBox");
  if (box) box.style.display = "none";
}

function __enfoquePdvProductPreviewScheduleHide() {
  clearTimeout(__enfoquePdvProductPreviewHideTimer);
  __enfoquePdvProductPreviewHideTimer = setTimeout(function () {
    __enfoquePdvProductPreviewHide();
  }, 3000);
}

function __enfoquePdvInstallProductPhotoPreview() {
  if (__enfoquePdvProductPreviewInstalled) return;
  __enfoquePdvProductPreviewInstalled = true;

  document.addEventListener("mouseover", function (ev) {
    const item = ev.target && ev.target.closest ? ev.target.closest(".autocomplete-suggestion") : null;
    if (!item || !__enfoquePdvProductPreviewIsNativeProductSuggestion(item)) return;

    __enfoquePdvProductPreviewTarget = item;
    clearTimeout(__enfoquePdvProductPreviewTimer);
    clearTimeout(__enfoquePdvProductPreviewHideTimer);
    const seq = ++__enfoquePdvProductPreviewSeq;

    __enfoquePdvProductPreviewTimer = setTimeout(async function () {
      const texto = __enfoquePdvProductPreviewText(item);
      const codigo = __enfoquePdvProductPreviewExtractCode(item);
      if (!codigo) return;
      try {
        __enfoquePdvProductPreviewShowLoading(item);
        const product = await __enfoquePdvProductPreviewSearch(codigo, texto);
        if (seq === __enfoquePdvProductPreviewSeq && __enfoquePdvProductPreviewTarget === item) {
          __enfoquePdvProductPreviewShowProduct(item, product);
        }
      } catch (error) {
        console.warn("[Enfoque PDV] Falha no preview de foto do produto:", error);
        if (seq === __enfoquePdvProductPreviewSeq && __enfoquePdvProductPreviewTarget === item) {
          __enfoquePdvProductPreviewShowError(item, error && error.message ? error.message : String(error));
        }
      }
    }, 280);
  }, true);

  document.addEventListener("mouseout", function (ev) {
    const item = ev.target && ev.target.closest ? ev.target.closest(".autocomplete-suggestion") : null;
    if (!item || !__enfoquePdvProductPreviewIsNativeProductSuggestion(item)) return;
    const related = ev.relatedTarget;
    if (related && item.contains(related)) return;
    clearTimeout(__enfoquePdvProductPreviewTimer);
    __enfoquePdvProductPreviewTarget = null;

    // V27: o preview fecha sozinho 3 segundos depois de aparecer,
    // independente do mouse continuar ou nao em cima da sugestao.
    __enfoquePdvProductPreviewScheduleHide();
  }, true);

  document.addEventListener("keydown", function (ev) {
    if (ev && ev.key === "Escape") __enfoquePdvProductPreviewHide();
  });
}

// Gera um hash estável para comparar backups do PDV
function hashPdvItems(items) {
  try {
    const norm = (Array.isArray(items) ? items : [])
      .map((it) => ({
        nome: String(it?.nome || "").trim(),
        qtd: parseInt(it?.qtd, 10) || 0
      }))
      .filter((it) => it.nome && it.qtd > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return JSON.stringify(norm);
  } catch (e) {
    return "";
  }
}

function readPdvProductsFromTable() {
  const rows = document.querySelectorAll("#contentTabelaProdutos #tabelaProdutos tbody tr");
  const items = [];

  rows.forEach((row) => {
    const ths = row.querySelectorAll("th.ng-binding");
    if (!ths || ths.length < 2) return;

    const rawQtd = (ths[0]?.textContent || "").trim();
    let qtd = parseInt(rawQtd.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(qtd) || qtd <= 0) return;

    let nome = (ths[1]?.textContent || "").trim();

    // Remove reticências no final ( ... ou … )
    nome = nome.replace(/\s*(\.\.\.|…)\s*$/, "").trim();

    // Se ainda sobrar “...” no fim por duplicidade, remove em loop
    while (/\.\.\.$/.test(nome) || /…$/.test(nome)) {
      nome = nome.replace(/\s*(\.\.\.|…)\s*$/, "").trim();
    }

    if (!nome) return;

    items.push({ nome, qtd });
  });

  // Consolida por nome (caso o PDV repita linhas)
  const byName = new Map();
  items.forEach((it) => {
    const k = it.nome;
    byName.set(k, (byName.get(k) || 0) + it.qtd);
  });

  // Ordena para ter hash estável
  return Array.from(byName.entries())
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function autoBackupPDV() {
  if (!pdvMode) return;
  // Dá um tempo pro Angular renderizar o carrinho
  // (requisito) aguarda ~30s após entrar no PDV para começar a ler/armazenar
  if (secondsInPdv < 30) return;

  const items = readPdvProductsFromTable();
  if (!items.length) return;

  const payload = {
    savedAt: new Date().toISOString(),
    url: location.href,
    items
  };

  const hash = hashPdvItems(items);
  if (!hash) return;

  // Requisito: só substitui quando houver produtos novos/diferentes
  if (hash === lastPdvBackupHash) return;

  chrome.storage.local.set({ sige_pdv_backup: payload }, () => {
    pdvBackupData = payload;
    lastPdvBackupHash = hash;
    // Silencioso: sem avisos. Atualiza apenas o painel se ele estiver aberto.
    updatePdvBackupPanelControls();
  });
}



function isElementVisible(el) {
  if (!el) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function showPdvVendedorAlert() {
  // Mostra uma vez e some após 7s (não fica reaparecendo em loop na tela de pagamentos)
  if (pdvVendorAlertShown) return;

  const id = "pdv_vendor_alert";
  if (!document.getElementById(id)) {
    const d = document.createElement("div");
    d.id = id;
    d.style = `
      position:fixed;
      top:10px;
      left:50%;
      transform:translateX(-50%);
      z-index:99999999;
      background:#d93025;
      color:#fff;
      padding:18px 20px;
      border-radius:14px;
      font-size:18px;
      box-shadow:0 10px 26px rgba(0,0,0,.35);
      width:min(820px, calc(100% - 24px));
      text-align:center;
      line-height:1.25;
    `;
    d.textContent = "Nenhum vendedor encontrado, verfique, caso deseje volte e adicione um vendedor.";
    document.body.appendChild(d);
  }

  pdvVendorAlertShown = true;

  if (pdvVendorAlertTimer) clearTimeout(pdvVendorAlertTimer);
  pdvVendorAlertTimer = setTimeout(() => {
    hidePdvVendedorAlert();
    // Mantém pdvVendorAlertShown=true para não reaparecer na mesma tela;
    // ele será resetado quando o DropVendedor voltar a ficar visível.
  }, 7000);
}

function hidePdvVendedorAlert() {
  const el = document.getElementById("pdv_vendor_alert");
  if (el) el.remove();
  if (pdvVendorAlertTimer) {
    clearTimeout(pdvVendorAlertTimer);
    pdvVendorAlertTimer = null;
  }
}

function monitorPdvVendedor() {
  if (!pdvMode) {
    pdvVendedorLastWasNenhum = false;
    hidePdvVendedorAlert();
    return;
  }

  const sel = document.querySelector("#DropVendedor");
  if (sel && isElementVisible(sel)) {
    // Quando o seletor de vendedor está visível, não mostramos o aviso (e liberamos para mostrar novamente ao entrar em Pagamentos)
    pdvVendorAlertShown = false;
    hidePdvVendedorAlert();
    const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    const txt = (opt?.textContent || "").trim().toLowerCase();
    const isNenhum = (sel.value === "0") || txt.includes("nenhum vendedor");
    pdvVendedorLastWasNenhum = isNenhum;

    // Se escolher um vendedor, remove alerta
    if (!isNenhum) hidePdvVendedorAlert();
    return;
  }

  // Se o campo sumiu/ficou invisível e o último estado conhecido era "Nenhum Vendedor", alerta.
  if (pdvVendedorLastWasNenhum) showPdvVendedorAlert();
}

// =============================================================
// VENDA / PDV - FONTE DE VERDADE: Enfoque PDV Maquininha v1.2.41
// Arquivo enviado pelo usuario em 20/10/2026.
// Mantidos: captura por linha, bandeiras, parcelas por valor, Pix e preenchimento SIGE.
// Sem integracao TEF forcada ou bloqueio externo do FINALIZAR VENDA.
// =============================================================

// Enfoque PDV Maquininha - módulo separado
// Contém somente o modal/fluxo da maquininha, Pix e cartão manual com NSU.

// =============================================================
// 7C. PDV → Maquininha (Bridge)
//     Captura campos da tela de Pagamentos e envia ao app local (127.0.0.1:8787)
//     ENVIO MANUAL via botão flutuante (evita reenvios automáticos)
//     Suporta múltiplas linhas (pagamento parcial em débito/crédito)
// =============================================================

(function initEnfoquePdvBridge() {
  if (window.__ENFOQUE_PDV_BRIDGE__) return;
  window.__ENFOQUE_PDV_BRIDGE__ = true;

  const MAX_LOG = 140;

  const state = {
    status: { kind: "idle", text: "Aguardando tela de pagamentos..." },
    lastCapture: null,
    log: [],
    // key (linha) -> última assinatura enviada (pra desabilitar botão se não mudou)
    sentByKey: new Map(),
    ui: { sendBox: null },
    autoCreditConfigured: new Set(),
    autoCreditSnooze: new Map(),
    autoCreditPending: false,
    _captureTimer: null,
    _mo: null,
  };

  // ---------- utils ----------
  function nowISO() {
    return new Date().toISOString();
  }

  function addLog(level, msg, data) {
    try {
      const line = {
        t: new Date().toLocaleTimeString(),
        level: (level || "info").toLowerCase(),
        msg: String(msg || ""),
        data: data || null,
      };
      state.log.unshift(line);
      if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
      updateUI();
    } catch (_) {}
  }

  function setStatus(kind, text) {
    state.status = { kind: kind || "idle", text: text || "" };
    updateUI();
  }

  function norm(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function moneyToCents(input) {
    // aceita: "R$ 55,55", "55,55", "1.234,56", "55.55"
    const s0 = String(input || "").replace(/[^\d,.\-]/g, "").trim();
    if (!s0) return 0;

    // heurística BR: se tem vírgula, vírgula = decimal
    let s = s0;
    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // sem vírgula: mantém ponto como decimal se existir
      s = s.replace(/\./g, ".");
    }

    const v = Number(s);
    if (!isFinite(v)) return 0;
    return Math.round(v * 100);
  }

  function buildUserRef() {
    // <=10 chars recomendado. Ex: "SIGE123456"
    const n = Date.now() % 1000000;
    return ("SIGE" + String(n).padStart(6, "0")).slice(0, 10);
  }

  function installmentsFromCredenciadora(txt) {
    const t = String(txt || "");
    // aceita "1x", "2 X", "12x"
    const m = t.match(/\b(\d{1,2})\s*x\b/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!isFinite(n) || n < 1) return null;
    return n;
  }

  function isOnPdv() {
    try {
      return /\/sistema\/pdv/i.test(location.pathname);
    } catch (_) {
      return false;
    }
  }

  function getValorRecebidoRaw() {
    const el =
      document.querySelector('input[ng-model="valorRecebido"]') ||
      document.querySelector('input.txtInfoPagamento.colorRecebido') ||
      document.querySelector('#contentPagamentos input.txtInfoPagamento');
    return el ? (el.value || "") : "";
  }

  function getSelectedFormaPagamentoText() {
    try {
      const sel = document.querySelector('select#selectFormaPagamento') || document.querySelector('select[id="selectFormaPagamento"]');
      if (!sel) return "";
      const opt = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
      return norm((opt && (opt.textContent || opt.label || opt.value)) || sel.value || "");
    } catch (_) {
      return "";
    }
  }

  function isVisibleElement(el) {
    try {
      if (!el || !document.documentElement.contains(el)) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0;
    } catch (_) { return true; }
  }

  function getPaymentTbodies() {
    const table = document.querySelector("#tabelaPagamentos");
    if (!table) return [];
    // Linhas reais do SIGE ficam em tbody.ng-scope. Evita pegar templates/linhas ocultas,
    // que estavam gerando Pix R$ 0,00.
    return Array.from(table.querySelectorAll("tbody.ng-scope, tbody[ng-repeat], tbody"))
      .filter((tbody, idx, arr) => arr.indexOf(tbody) === idx)
      .filter((tbody) => tbody.querySelector(".tbFormaPagamento, .tbValor"))
      .filter((tbody) => isVisibleElement(tbody));
  }

  function xpathFirst(xpath, ctx) {
    try {
      return document.evaluate(xpath, ctx || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || null;
    } catch (_) { return null; }
  }

  function getRowCellTextByXpath(rowNumber, className) {
    const xp = `//table[@id='tabelaPagamentos']/tbody[contains(concat(' ',normalize-space(@class),' '),' ng-scope ')]/tr[1]/th[contains(concat(' ',normalize-space(@class),' '),' ${className} ')]`;
    const nodes = [];
    try {
      const res = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < res.snapshotLength; i++) {
        const n = res.snapshotItem(i);
        if (n && isVisibleElement(n)) nodes.push(n);
      }
    } catch (_) {}
    const el = nodes[Math.max(0, Number(rowNumber || 1) - 1)] || nodes[0] || null;
    return norm(el ? (el.textContent || el.innerText || "") : "");
  }

  function getExactPixValorCents(p) {
    // XPath pedido: //table[@id='tabelaPagamentos']/tbody[@class='ng-scope']/tr[1]/th[@class='tbValor ng-binding']
    const byXpath = getRowCellTextByXpath((Number(p?.idx || 0) + 1), "tbValor");
    const centsXpath = moneyToCents(byXpath);
    if (centsXpath > 0) return centsXpath;
    try {
      const tb = p?._tbody;
      const el = tb && (tb.querySelector("tr:first-child .tbValor") || tb.querySelector(".tbValor"));
      const cents = moneyToCents(el ? (el.textContent || el.innerText || "") : "");
      if (cents > 0) return cents;
    } catch (_) {}
    return Number(p?.centsLinha || 0);
  }

  function isPagamentosVisivel() {
    const el = document.getElementById("contentPagamentos");
    if (!el) return false;
    const st = getComputedStyle(el);
    return st && st.display !== "none" && st.visibility !== "hidden";
  }

  // ---------- HTTP via background ----------
  function pingLocalBridge() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "ENFOQUE_PDV_PING" }, (resp) => {
          resolve(resp || null);
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  function postTransaction(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "ENFOQUE_PDV_TX", payload }, (resp) => {
          resolve(resp || null);
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  // ---------- capture ----------
  function capture() {
    try {
      if (!isOnPdv()) return;

      if (!isPagamentosVisivel()) {
        setStatus("idle", "Fora da tela de pagamentos.");
        state.lastCapture = null;
        updateSendBox();
        updateUI();
        return;
      }

      const valorRecebidoRaw = getValorRecebidoRaw();
      const valorRecebidoCents = moneyToCents(valorRecebidoRaw);
      const formaPagamentoSelecionada = getSelectedFormaPagamentoText();

      const tbodies = getPaymentTbodies();
      const payments = tbodies.map((tbody, idx) => {
        const primeiraLinha = tbody.querySelector("tr:first-child") || tbody;
        const formaEl = primeiraLinha.querySelector(".tbFormaPagamento") || tbody.querySelector(".tbFormaPagamento");
        const valorEl = primeiraLinha.querySelector(".tbValor") || tbody.querySelector(".tbValor");

        const formaLinhaDom = norm(formaEl ? (formaEl.textContent || formaEl.innerText || "") : "");
        const valorLinhaDom = norm(valorEl ? (valorEl.textContent || valorEl.innerText || "") : "");
        // XPath exato informado pelo SIGE para Pix; usado como prioridade quando existir.
        const formaLinhaXpath = getRowCellTextByXpath(idx + 1, "tbFormaPagamento");
        const valorLinhaXpath = getRowCellTextByXpath(idx + 1, "tbValor");
        const formaLinha = formaLinhaXpath || formaLinhaDom;
        const valorLinha = valorLinhaXpath || valorLinhaDom;

        const bandeiraSel = tbody.querySelector('select[ng-model="item.BandeiraCartao"]');
        const bandeira = bandeiraSel
          ? norm(bandeiraSel.options[bandeiraSel.selectedIndex]?.textContent || bandeiraSel.value || "")
          : "";

        const credEl = tbody.querySelector('input[ng-model="item.CredenciadoraCartao"]');
        const credenciadora = norm(credEl ? credEl.value : "");

        const condSel = tbody.querySelector('select[ng-model="item.CondicaoPagamento"]');
        const condicao = condSel ? String(condSel.value || "").trim() : ""; // "0" (a vista), "1" (a prazo)

        const parcelasEl = tbody.querySelector('input[ng-model="item.Parcelas"]');
        const parcelasRaw = norm(parcelasEl ? parcelasEl.value : "");
        const parcelas = parcelasRaw ? parseInt(parcelasRaw, 10) : null;

        // método por linha: para Pix, ler principalmente da tabela:
        // #tabelaPagamentos tbody.ng-scope tr:first-child .tbFormaPagamento
        // Ex.: "Pix (Máquina)" ou "Pix (CNPJ)".
        let formaTextoParaMetodo = [formaLinha, credenciadora].filter(Boolean).join(" ");
        let method = null;
        if (/pix/i.test(formaTextoParaMetodo)) method = "PIX";
        else if (/d[eé]bito/i.test(formaTextoParaMetodo)) method = "DEBIT";
        else if (/cr[eé]dito/i.test(formaTextoParaMetodo)) method = "CREDIT";
        // fallback apenas quando a linha ainda nao trouxe forma de pagamento.
        if (!method && !formaLinha && formaPagamentoSelecionada) {
          formaTextoParaMetodo = formaPagamentoSelecionada;
          if (/pix/i.test(formaTextoParaMetodo)) method = "PIX";
          else if (/d[eé]bito/i.test(formaTextoParaMetodo)) method = "DEBIT";
          else if (/cr[eé]dito/i.test(formaTextoParaMetodo)) method = "CREDIT";
        }

        const instFromCred = installmentsFromCredenciadora(credenciadora);

        // valor por linha (tbValor). fallback: valorRecebido (global).
        const centsLinha = moneyToCents(valorLinha) || valorRecebidoCents || 0;

        let installments = 1;
        let ready = false;
        let reason = "";

        if (!method) {
          reason = "Método não identificado (Pix/crédito/débito).";
        } else if (!centsLinha || centsLinha <= 0) {
          reason = "Valor inválido (linha/valor recebido).";
        } else if (method === "PIX") {
          installments = 1;
          ready = true;
        } else if (method === "CREDIT") {
          // Nova regra: ao identificar crédito, a extensão abre o modal
          // para escolher bandeira e parcelas e preenche os campos do SIGE.
          installments = (condicao === "1" && parcelas && parcelas >= 2) ? parcelas : (instFromCred || 1);
          ready = true;
        } else {
          // débito
          installments = 1;
          ready = true;
        }

        const key = `row:${idx}`;
        const sig = [
          method || "",
          centsLinha || 0,
          installments || 1,
          formaLinha || "",
          formaPagamentoSelecionada || "",
          credenciadora || "",
          condicao || "",
          parcelas || "",
          bandeira || "",
        ].join("|");

        const alreadySent = state.sentByKey.get(key) === sig;

        return {
          idx,
          key,
          sig,
          formaLinha,
          formaPagamentoSelecionada,
          valorLinha,
          bandeira,
          credenciadora,
          condicao,
          parcelas,
          valorRecebidoRaw,
          centsLinha,
          method,
          installments,
          ready,
          alreadySent,
          reason,
          _tbody: tbody,
        };
      });

      state.lastCapture = {
        at: nowISO(),
        valorRecebidoRaw,
        valorRecebidoCents,
        payments,
      };

      const readyCount = payments.filter((p) => p.ready && !p.alreadySent).length;
      setStatus("ok", readyCount > 0 ? `${readyCount} pagamento(s) pronto(s) para enviar.` : "Nenhum pagamento pronto (ou já enviado).");

      updateSendBox();
      updateUI();
      autoOpenCreditModalIfNeeded(payments);
    } catch (e) {
      setStatus("bad", "Erro ao capturar campos.");
      addLog("error", "Erro no capture()", { error: String(e) });
    }
  }


  function needsCreditSetup(p) {
    if (!p || p.method !== 'CREDIT' || !p.ready) return false;
    const hasBrand = !!norm(p.bandeira) && normalizeChoiceText(p.bandeira) !== 'selecione';
    const cred = norm(p.credenciadora);
    const hasCreditRange = /CREDITO\s*-\s*(1X|2X\s*a\s*6X|7X\s*a\s*12X)/i.test(cred);
    return !(hasBrand && hasCreditRange);
  }

  function autoOpenCreditModalIfNeeded(payments) {
    try {
      if (state.autoCreditPending) return;
      const list = Array.isArray(payments) ? payments : [];
      const p = list.find(x => x && x.method === 'CREDIT' && x.ready && !x.alreadySent && needsCreditSetup(x));
      if (!p) return;
      const autoKey = [p.key, p.centsLinha || 0, p.formaLinha || '', p.valorLinha || ''].join('|');
      const snoozedAt = state.autoCreditSnooze && state.autoCreditSnooze.get(autoKey);
      if (snoozedAt && Date.now() - snoozedAt < 1800) return;
      state.autoCreditPending = true;
      setTimeout(async () => {
        try {
          addLog('info', 'Abrindo seleção de bandeira/parcelas para crédito.', { row: p.idx, valor: p.valorLinha });
          const details = await chooseAndFillCreditDetails(p);
          addLog('ok', 'Bandeira/parcelas preenchidas automaticamente.', details);
          scheduleCapture(80);
        } catch (e) {
          const msg = String(e && e.message ? e.message : e);
          addLog('warn', 'Seleção de crédito cancelada ou falhou.', { error: msg });
          try { state.autoCreditSnooze.set(autoKey, Date.now()); } catch (_) {}
        } finally {
          state.autoCreditPending = false;
        }
      }, 80);
    } catch (e) {
      state.autoCreditPending = false;
      addLog('error', 'Erro ao abrir modal automático de crédito.', { error: String(e) });
    }
  }

  function scheduleCapture(ms) {
    clearTimeout(state._captureTimer);
    state._captureTimer = setTimeout(capture, typeof ms === "number" ? ms : 160);
  }

  // ---------- floating send box ----------
  function ensureSendBox() {
    if (state.ui.sendBox && document.body.contains(state.ui.sendBox)) return state.ui.sendBox;

    const box = document.createElement("div");
    box.id = "enfoque-pdv-sendbox";
    box.setAttribute("data-enfoque-hooked", "1");
    box.style.cssText = [
      "position:fixed",
      "left:18px",
      "bottom:18px",
      "z-index:9999999",
      "max-width:360px",
      "font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial",
      "color:#fff",
      "background:rgba(2,6,23,.72)",
      "backdrop-filter:blur(10px)",
      "border:1px solid rgba(255,255,255,.12)",
      "border-radius:14px",
      "box-shadow:0 18px 40px rgba(0,0,0,.35)",
      "padding:10px",
      "display:none",
    ].join(";");

    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="font-weight:800;font-size:12px;letter-spacing:.2px;">Maquininha</div>
        <div id="enfoque-pdv-sendbox-hint" style="font-size:11px;color:rgba(255,255,255,.70);margin-left:auto;">Aguardando...</div>
      </div>
      <div id="enfoque-pdv-sendbox-items" style="display:flex;flex-direction:column;gap:8px;"></div>
    `;

    document.body.appendChild(box);
    state.ui.sendBox = box;
    return box;
  }

  function fmtBRL(cents) {
    try {
      const v = (Number(cents || 0) / 100);
      return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch (_) {
      return String(cents || 0);
    }
  }

  function setNativeValue(el, value) {
    if (!el) return false;
    const v = String(value || "").trim();
    try {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto || HTMLInputElement.prototype, "value");
      if (desc && desc.set) desc.set.call(el, v);
      else el.value = v;
    } catch (_) {
      el.value = v;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "1" })); } catch (_) { el.dispatchEvent(new Event("keyup", { bubbles: true })); }
    try { if (window.angular) window.angular.element(el).triggerHandler("input"); } catch (_) {}
    return true;
  }

  function findVisibleInPaymentBody(p, selector) {
    try {
      const tb = p && p._tbody;
      if (!tb || !tb.querySelectorAll) return null;
      return Array.from(tb.querySelectorAll(selector)).find(isVisibleElement) || tb.querySelector(selector) || null;
    } catch (_) { return null; }
  }

  function findByLabelInPaymentBody(p, labelText, tagSelector) {
    try {
      const tb = p && p._tbody;
      if (!tb) return null;
      const wanted = normalizeChoiceText(labelText);
      const labels = Array.from(tb.querySelectorAll('label'));
      for (const label of labels) {
        const txt = normalizeChoiceText(label.textContent || label.innerText || '');
        if (!txt.includes(wanted)) continue;
        const li = label.closest('li') || label.parentElement;
        const field = li && li.querySelector(tagSelector || 'input,select,textarea');
        if (field) return field;
      }
    } catch (_) {}
    return null;
  }

  function getPaymentBodyIndex(p) {
    try {
      const list = getPaymentTbodies();
      const idx = list.indexOf(p && p._tbody);
      return idx >= 0 ? idx : Number(p?.idx || 0);
    } catch (_) { return Number(p?.idx || 0); }
  }

  function findInPaymentByRowXpath(p, relativeXpath) {
    // Busca dentro do tbody da linha selecionada, evitando preencher o primeiro pagamento
    // quando a venda tem débito + crédito ou outras formas parciais.
    try {
      const tb = p && p._tbody;
      if (tb) {
        return document.evaluate(relativeXpath, tb, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || null;
      }
    } catch (_) {}
    return null;
  }

  function findNsuInputForPayment(p) {
    // CV/NSU fica no tbody do pagamento selecionado, na área infoCartao.
    return findVisibleInPaymentBody(p, 'input[ng-model="item.CV_NSU"]') ||
           findByLabelInPaymentBody(p, 'CV/NSU', 'input') ||
           findInPaymentByRowXpath(p, './/tr[2]/td/ul[contains(concat(" ",normalize-space(@class)," ")," infoCartao ")]/li[3]/input') ||
           (p && p._tbody ? Array.from(p._tbody.querySelectorAll('ul.infoCartao input')).find((_, i) => i === 2) : null) ||
           null;
  }

  function generateLocalNsu() {
    return String(Date.now()).slice(-6).padStart(6, "0");
  }

  const ENFOQUE_CARD_BRANDS = [
    { name: "Visa", img: "bandeiras/visa.png" },
    { name: "Mastercard", img: "bandeiras/mastercard.png" },
    { name: "American Express", img: "bandeiras/american-express.png" },
    { name: "Sorocred", img: "bandeiras/sorocred.png" },
    { name: "Diners Club", img: "bandeiras/diners-club.png" },
    { name: "Elo", img: "bandeiras/elo.png" },
    { name: "Hipercard", img: "bandeiras/hipercard.png" },
    { name: "Aura", img: "bandeiras/aura.png" },
    { name: "Cabal", img: "bandeiras/cabal.png" },
    { name: "Outros", img: "" }
  ];

  function normalizeChoiceText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function setSelectByTextOrValue(select, wantedText) {
    if (!select) return false;
    const want = normalizeChoiceText(wantedText);
    const opts = Array.from(select.options || []);
    let opt = opts.find(o => normalizeChoiceText(o.textContent || o.label || o.value) === want) ||
              opts.find(o => normalizeChoiceText(o.textContent || o.label || o.value).includes(want)) ||
              opts.find(o => want.includes(normalizeChoiceText(o.textContent || o.label || o.value)));
    if (!opt && /outros/i.test(String(wantedText || ""))) {
      opt = opts.find(o => /outros?|outr/i.test(normalizeChoiceText(o.textContent || o.label || o.value)));
    }
    if (!opt) return false;
    try { select.value = opt.value; } catch (_) {}
    try { select.selectedIndex = opts.indexOf(opt); } catch (_) {}
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    try { if (window.angular) window.angular.element(select).triggerHandler("change"); } catch (_) {}
    return true;
  }

  function findCardBrandSelect(p) {
    return findVisibleInPaymentBody(p, 'select[ng-model="item.BandeiraCartao"]') ||
           findByLabelInPaymentBody(p, 'Bandeira', 'select') ||
           findInPaymentByRowXpath(p, './/tr[2]/td/ul[contains(concat(" ",normalize-space(@class)," ")," infoCartao ")]/li[1]/select') ||
           null;
  }

  function findCreditInstallmentInput(p) {
    // Este campo no SIGE aparece com o label Credenciadora, e nele vamos gravar
    // CREDITO - 1X / CREDITO - 2X a 6X / CREDITO - 7X a 12X.
    return findVisibleInPaymentBody(p, 'input[ng-model="item.CredenciadoraCartao"]') ||
           findByLabelInPaymentBody(p, 'Credenciadora', 'input') ||
           findInPaymentByRowXpath(p, './/tr[2]/td/ul[contains(concat(" ",normalize-space(@class)," ")," infoCartao ")]/li[2]/input') ||
           null;
  }

  function findPaymentConditionSelect(p) {
    return findVisibleInPaymentBody(p, 'select[ng-model="item.CondicaoPagamento"]') ||
           findByLabelInPaymentBody(p, 'Opção de Pagamento', 'select') ||
           findInPaymentByRowXpath(p, './/tr[3]/td/ul[contains(concat(" ",normalize-space(@class)," ")," infoCartao ")]/li[1]/select') ||
           null;
  }

  function findParcelasRealInput(p) {
    return findVisibleInPaymentBody(p, 'input[ng-model="item.Parcelas"]') ||
           findByLabelInPaymentBody(p, 'Número de Parcelas', 'input') ||
           findInPaymentByRowXpath(p, './/tr[3]/td/ul[contains(concat(" ",normalize-space(@class)," ")," infoCartao ")]/li[2]/input') ||
           null;
  }

  function creditRangeLabel(n) {
    const x = Math.max(1, Math.min(12, parseInt(n, 10) || 1));
    if (x === 1) return "CREDITO - 1X";
    if (x <= 6) return "CREDITO - 2X a 6X";
    return "CREDITO - 7X a 12X";
  }

  function maxInstallmentsForCents(cents) {
    const v = Math.max(0, Number(cents || 0) / 100);
    if (v >= 800) return 12;
    if (v >= 730) return 11;
    if (v >= 660) return 10;
    if (v >= 530) return 9;
    if (v >= 460) return 8;
    if (v >= 400) return 7;
    if (v >= 330) return 6;
    if (v >= 260) return 5;
    if (v >= 200) return 4;
    if (v >= 150) return 3;
    if (v >= 100) return 2;
    return 1;
  }

  function installmentOptionsForCents(cents) {
    const max = maxInstallmentsForCents(cents);
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  function fillCreditDetails(p, brand, installments) {
    const n = Math.max(1, Math.min(12, parseInt(installments, 10) || 1));
    const brandOk = setSelectByTextOrValue(findCardBrandSelect(p), brand);
    const credOk = setNativeValue(findCreditInstallmentInput(p), creditRangeLabel(n));
    const cond = findPaymentConditionSelect(p);
    let condOk = true;
    if (cond) condOk = setSelectByTextOrValue(cond, n > 1 ? "A Prazo" : "A Vista");
    const parcelasEl = findParcelasRealInput(p);
    let parcelasOk = true;
    if (parcelasEl) parcelasOk = setNativeValue(parcelasEl, String(n));
    try {
      p.bandeira = brand;
      p.credenciadora = creditRangeLabel(n);
      p.installments = n;
      p.condicao = n > 1 ? "1" : "0";
      p.parcelas = n;
    } catch (_) {}
    return { brandOk, credOk, condOk, parcelasOk, installments: n, brand, row: getPaymentBodyIndex(p) + 1 };
  }


  function getPdvCoverRect() {
    const candidates = [
      document.querySelector('#contentPagamentos'),
      document.querySelector('#controllerPDV'),
      document.querySelector('#contentFormasPagamento'),
      document.querySelector('.main')
    ].filter(Boolean);
    for (const el of candidates) {
      try {
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 160 && r.bottom > 0 && r.right > 0) return r;
      } catch (_) {}
    }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function renderBrandChoice(item) {
    const name = item && item.name ? String(item.name) : String(item || "");
    const img = item && item.img ? chrome.runtime.getURL(item.img) : "";
    const safeName = name.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] || ch));
    if (!img) {
      return `<div style="height:62px;display:flex;align-items:center;justify-content:center;border-radius:16px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);font-size:18px;font-weight:950;color:#334155;">${safeName}</div><div style="margin-top:10px;font-size:13px;font-weight:950;">${safeName}</div>`;
    }
    return `<div style="height:70px;display:flex;align-items:center;justify-content:center;border-radius:18px;background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,.06);overflow:hidden;padding:10px;"><img src="${img}" alt="${safeName}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"></div><div style="margin-top:10px;font-size:13px;font-weight:950;color:#0f172a;">${safeName}</div>`;
  }

  function showCenteredChoiceModal(opts) {
    return new Promise((resolve) => {
      const old = document.getElementById('enfoque-pdv-card-choice-overlay');
      if (old) old.remove();

      const rect = getPdvCoverRect();
      const overlay = document.createElement('div');
      overlay.id = 'enfoque-pdv-card-choice-overlay';
      overlay.style.cssText = [
        'position:fixed',
        `left:${Math.max(0, rect.left)}px`,
        `top:${Math.max(0, rect.top)}px`,
        `width:${Math.min(window.innerWidth, rect.width)}px`,
        `height:${Math.min(window.innerHeight, rect.height)}px`,
        'z-index:2147483646',
        'background:linear-gradient(135deg,rgba(15,23,42,.76),rgba(2,6,23,.68))',
        'backdrop-filter:blur(9px)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial',
        'color:#fff',
        'pointer-events:auto'
      ].join(';');

      const card = document.createElement('div');
      card.style.cssText = [
        'width:min(760px,calc(100% - 64px))',
        'max-height:calc(100% - 64px)',
        'overflow:auto',
        'border-radius:28px',
        'background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(248,250,252,.96))',
        'border:1px solid rgba(148,163,184,.35)',
        'box-shadow:0 34px 100px rgba(15,23,42,.38)',
        'padding:26px',
        'color:#0f172a'
      ].join(';');

      const title = document.createElement('div');
      title.style.cssText = 'font-weight:950;font-size:24px;margin-bottom:6px;text-align:center;letter-spacing:.2px;color:#0f172a;';
      title.textContent = opts.title || 'Selecione';

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'font-weight:800;font-size:13px;color:#64748b;margin-bottom:22px;text-align:center;';
      subtitle.textContent = opts.subtitle || '';

      const grid = document.createElement('div');
      const cols = Math.max(1, Math.min(4, Number(opts.columns || 2)));
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:14px;`;

      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        try { overlay.remove(); } catch (_) {}
        resolve(value);
      };

      const items = Array.isArray(opts.items) ? opts.items : [];
      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = [
          'min-height:116px',
          'border-radius:20px',
          'border:1px solid rgba(14,165,233,.22)',
          'background:linear-gradient(180deg,#ffffff,#f8fafc)',
          'color:#0f172a',
          'font-weight:950',
          'font-size:15px',
          'cursor:pointer',
          'padding:12px',
          'text-align:center',
          'box-shadow:0 10px 24px rgba(15,23,42,.08)',
          'transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease'
        ].join(';');
        if (typeof opts.renderItem === 'function') btn.innerHTML = opts.renderItem(item);
        else btn.textContent = String(item);
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          finish(item);
        }, true);
        grid.appendChild(btn);
      });

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;justify-content:center;margin-top:16px;';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancelar';
      cancel.style.cssText = 'height:40px;padding:0 20px;border-radius:14px;border:1px solid rgba(148,163,184,.35);background:#f8fafc;color:#334155;font-weight:950;cursor:pointer;box-shadow:0 6px 16px rgba(15,23,42,.06);';
      cancel.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); finish(null); }, true);
      footer.appendChild(cancel);

      const onKey = (ev) => {
        if (ev.key === 'Escape' || ev.key === 'F4') {
          ev.preventDefault();
          ev.stopPropagation();
          finish(null);
        }
      };
      document.addEventListener('keydown', onKey, true);

      card.appendChild(title);
      if (subtitle.textContent) card.appendChild(subtitle);
      card.appendChild(grid);
      card.appendChild(footer);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  async function chooseAndFillCreditDetails(p) {
    const brand = await showCenteredChoiceModal({
      title: "Selecione a bandeira",
      subtitle: `Crédito • ${fmtBRL(p.centsLinha)}`,
      items: ENFOQUE_CARD_BRANDS,
      columns: 3,
      renderItem: (item) => renderBrandChoice(item)
    });
    if (!brand) throw new Error("CANCELADO");
    const brandName = brand.name || String(brand || "");

    const allowedInstallments = installmentOptionsForCents(p.centsLinha);
    const maxInstallments = allowedInstallments[allowedInstallments.length - 1] || 1;

    // Se a regra de parcelamento permitir somente 1x, nao abre o modal de parcelas.
    // Preenche automaticamente como CREDITO - 1X e segue para aprovacao.
    if (maxInstallments <= 1 || allowedInstallments.length <= 1) {
      return fillCreditDetails(p, brandName, 1);
    }

    const installments = await showCenteredChoiceModal({
      title: "Selecione as parcelas",
      subtitle: `${brandName} • ${fmtBRL(p.centsLinha)} • até ${maxInstallments}x`,
      items: allowedInstallments,
      columns: maxInstallments <= 6 ? 2 : 2,
      renderItem: (n) => `<div style="font-size:22px;font-weight:950;">${n}x</div><div style="font-weight:750;font-size:11px;color:#64748b;margin-top:5px;">${creditRangeLabel(n)}</div>`
    });
    if (!installments) throw new Error("CANCELADO");

    return fillCreditDetails(p, brandName, installments);
  }

  function waitF1ApprovalOverlay(p) {
    return new Promise((resolve) => {
      const old = document.getElementById("enfoque-pdv-f1-approval");
      if (old) old.remove();
      const div = document.createElement("div");
      div.id = "enfoque-pdv-f1-approval";
      div.style.cssText = "position:fixed;inset:auto 18px 96px auto;z-index:10000000;width:360px;padding:14px;border-radius:16px;background:rgba(15,23,42,.96);color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.45);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial";
      const label = p.method === "CREDIT" ? `CRÉDITO ${p.installments || 1}x` : "DÉBITO";
      div.innerHTML = `<div style="font-weight:900;font-size:13px;margin-bottom:6px;">${label} • ${fmtBRL(p.centsLinha)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.78);line-height:1.35;margin-bottom:12px;">Confirme manualmente a aprovação do cartão.<br>Ao clicar, a extensão gera e preenche o NSU no SIGE.</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" id="enfoque-pdv-card-cancel" style="height:36px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(148,163,184,.18);color:#fff;font-weight:800;cursor:pointer;">Cancelar</button>
          <button type="button" id="enfoque-pdv-card-approve" style="height:36px;padding:0 14px;border-radius:12px;border:1px solid rgba(34,197,94,.45);background:rgba(34,197,94,.24);color:#fff;font-weight:900;cursor:pointer;">Aprovar venda</button>
        </div>`;
      document.body.appendChild(div);

      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey, true);
        try { div.remove(); } catch (_) {}
        resolve(result);
      };
      const onKey = (ev) => {
        // Fallback pelo teclado do PC.
        if (ev.key === "F1") { ev.preventDefault(); ev.stopPropagation(); finish({ ok: true, nsu: generateLocalNsu(), source: "keyboard" }); }
        if (ev.key === "F4" || ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); finish({ ok: false, error: "CANCELADO", source: "keyboard" }); }
      };
      document.addEventListener("keydown", onKey, true);

      const approveBtn = div.querySelector("#enfoque-pdv-card-approve");
      const cancelBtn = div.querySelector("#enfoque-pdv-card-cancel");
      if (approveBtn) approveBtn.addEventListener("click", () => finish({ ok: true, nsu: generateLocalNsu(), source: "button" }), true);
      if (cancelBtn) cancelBtn.addEventListener("click", () => finish({ ok: false, error: "CANCELADO", source: "button" }), true);
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try { chrome.storage.local.get([key], (r) => resolve(r ? r[key] : null)); } catch (_) { resolve(null); }
    });
  }
  function storageSet(obj) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set(obj, () => resolve(true)); } catch (_) { resolve(false); }
    });
  }

  const ENFOQUE_PDV_PIX_TOKEN_HARDCODED = "enfoque_pdv_pix_local_60303778";

  async function getPixToken() {
    return ENFOQUE_PDV_PIX_TOKEN_HARDCODED;
  }

  let enfoquePixDotsTimer = null;
  let enfoquePixPinpadInFlight = false;
  let enfoquePixActiveFlow = null;

  function newPixFlow(pedidoId) {
    enfoquePixActiveFlow = { pedidoId: pedidoId || null, cancelled: false, finished: false };
    return enfoquePixActiveFlow;
  }

  async function clearPinpadForNextSale() {
    try { await sendPinpadDisplay("", ""); } catch (_) {}
    try { await sendPinpadDisplay("ENFOQUE", "PROXIMA VENDA"); } catch (_) {}
    setTimeout(() => { try { sendPinpadDisplay("", ""); } catch (_) {} }, 1200);
  }

  function cancelPixFlow(reason) {
    if (enfoquePixActiveFlow && !enfoquePixActiveFlow.finished) {
      enfoquePixActiveFlow.cancelled = true;
      enfoquePixActiveFlow.cancelReason = reason || "cancelado";
    }
    stopPixWaitingDots();
    setPixQrModalStatus("Pix cancelado", false);
    sendPinpadDisplay("PIX CANCELADO", "PROXIMA VENDA").catch(() => {});
    setTimeout(() => clearPinpadForNextSale(), 900);
  }

  function startPixWaitingDots(flow) {
    stopPixWaitingDots();
    let i = 0;
    const tick = () => {
      if (flow && flow.cancelled) { stopPixWaitingDots(); return; }
      i = (i % 3) + 1;
      setPixQrModalStatus("Aguardando pagamento" + ".".repeat(i), false);
      pinpadPixWaiting(i).catch(() => {});
    };
    tick();
    enfoquePixDotsTimer = setInterval(tick, 1000);
  }
  function stopPixWaitingDots() {
    if (enfoquePixDotsTimer) {
      clearInterval(enfoquePixDotsTimer);
      enfoquePixDotsTimer = null;
    }
  }

  function pixMessage(type, payload) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type, ...(payload || {}) }, (resp) => resolve(resp || null)); } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }


  function sendPinpadDisplay(line1, line2) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: "ENFOQUE_PDV_DISPLAY",
          payload: {
            line1: String(line1 || "").slice(0, 16),
            line2: String(line2 || "").slice(0, 16),
            text: [String(line1 || ""), String(line2 || "")].filter(Boolean).join("\n")
          }
        }, (resp) => resolve(resp || null));
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }

  function waitPinpadKey(timeoutMs) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: "ENFOQUE_PDV_WAIT_KEY",
          payload: { timeout_ms: Number(timeoutMs || 1500) }
        }, (resp) => resolve(resp || null));
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }

  async function pinpadPixWaiting(i) {
    if (enfoquePixPinpadInFlight) return null;
    enfoquePixPinpadInFlight = true;
    try {
      const dots = ".".repeat(((i - 1) % 3) + 1);
      return await sendPinpadDisplay("AGUARDANDO", "PAGAMENTO" + dots);
    } finally {
      enfoquePixPinpadInFlight = false;
    }
  }

  function ensurePixQrModal(data) {
    let modal = document.getElementById("enfoque-pdv-pix-modal");
    if (modal) modal.remove();

    const qr = data?.rede?.qrCodeResponse || data?.rede || {};
    const img = qr.qrCodeImage || data?.qrCodeImage || "";
    const copia = qr.qrCodeData || data?.qrCodeData || "";
    const imgSrc = img ? (String(img).startsWith("data:") ? img : "data:image/png;base64," + img) : "";

    modal = document.createElement("div");
    modal.id = "enfoque-pdv-pix-modal";
    modal.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "z-index:10000050",
      "width:min(420px,calc(100vw - 28px))",
      "background:#ffffff",
      "color:#0f172a",
      "border:1px solid rgba(15,23,42,.18)",
      "border-radius:18px",
      "box-shadow:0 30px 90px rgba(0,0,0,.42)",
      "font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial",
      "overflow:hidden"
    ].join(";");

    const header = document.createElement("div");
    header.id = "enfoque-pdv-pix-drag";
    header.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px 14px;background:#0f172a;color:#fff;cursor:move;user-select:none;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:900;font-size:14px;line-height:1.2;";
    title.textContent = `Pix ${fmtBRL(data?.valorCentavos || 0)}`;

    const status = document.createElement("div");
    status.id = "enfoque-pdv-pix-status";
    status.style.cssText = "font-size:11px;color:rgba(255,255,255,.76);margin-left:auto;";
    status.textContent = "Aguardando pagamento...";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.style.cssText = "width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.10);color:#fff;font-size:20px;line-height:22px;cursor:pointer;";
    close.addEventListener("click", () => {
      cancelPixFlow("modal_fechado");
      try { modal.remove(); } catch (_) {}
    });

    header.appendChild(title);
    header.appendChild(status);
    header.appendChild(close);

    const body = document.createElement("div");
    body.style.cssText = "padding:16px;text-align:center;background:#fff;";

    if (imgSrc) {
      const qrImg = document.createElement("img");
      qrImg.src = imgSrc;
      qrImg.alt = "QR Code Pix";
      qrImg.style.cssText = "display:block;width:300px;max-width:86vw;margin:0 auto 12px;border:1px solid #e5e7eb;border-radius:14px;padding:10px;background:#fff;";
      body.appendChild(qrImg);
    } else {
      const noImg = document.createElement("div");
      noImg.style.cssText = "padding:24px;border:1px dashed #cbd5e1;border-radius:14px;margin-bottom:12px;color:#64748b;";
      noImg.textContent = "QR Code não retornado pelo backend.";
      body.appendChild(noImg);
    }

    const pedido = document.createElement("div");
    pedido.style.cssText = "font-size:12px;color:#334155;margin-bottom:10px;";
    pedido.textContent = data?.pedidoId ? `Pedido: ${data.pedidoId}` : "";
    body.appendChild(pedido);

    const ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.value = copia || "";
    ta.style.cssText = "width:100%;height:82px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:10px;font-size:11px;color:#0f172a;resize:none;";
    body.appendChild(ta);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copiar Pix copia e cola";
    copy.style.cssText = "margin-top:10px;height:34px;padding:0 14px;border-radius:12px;border:1px solid #0284c7;background:#0ea5e9;color:#fff;font-weight:800;cursor:pointer;";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(copia || ""); copy.textContent = "Copiado"; setTimeout(() => copy.textContent = "Copiar Pix copia e cola", 1400); } catch (_) {}
    });
    body.appendChild(copy);

    modal.appendChild(header);
    modal.appendChild(body);
    document.body.appendChild(modal);

    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    header.addEventListener("mousedown", (ev) => {
      if (ev.target === close) return;
      dragging = true;
      const rect = modal.getBoundingClientRect();
      modal.style.transform = "none";
      modal.style.left = rect.left + "px";
      modal.style.top = rect.top + "px";
      sx = ev.clientX; sy = ev.clientY; sl = rect.left; st = rect.top;
      ev.preventDefault();
    }, true);
    document.addEventListener("mousemove", (ev) => {
      if (!dragging) return;
      modal.style.left = Math.max(4, Math.min(window.innerWidth - 40, sl + (ev.clientX - sx))) + "px";
      modal.style.top = Math.max(4, Math.min(window.innerHeight - 40, st + (ev.clientY - sy))) + "px";
    }, true);
    document.addEventListener("mouseup", () => { dragging = false; }, true);

    return modal;
  }

  function setPixQrModalStatus(text, ok) {
    const el = document.getElementById("enfoque-pdv-pix-status");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = ok ? "#86efac" : "rgba(255,255,255,.76)";
  }

  async function runPixBackendFlow(p, btn) {
    const token = await getPixToken();
    if (!token) throw new Error("TOKEN_PIX_VAZIO");
    const valorPixCentavos = getExactPixValorCents(p);
    if (!valorPixCentavos || valorPixCentavos <= 0) throw new Error("VALOR_PIX_INVALIDO");
    btn.textContent = "Gerando Pix...";
    await sendPinpadDisplay("PIX " + fmtBRL(valorPixCentavos).slice(0, 12), "GERANDO QR");
    const create = await pixMessage("ENFOQUE_PDV_PIX_CREATE", { token, valorCentavos: valorPixCentavos, descricao: "PDV SIGE Pix" });
    if (!create || !create.ok || !create.data || !create.data.success) throw new Error(create?.error || create?.data?.error || "FALHA_CRIAR_PIX");
    create.data.valorCentavos = valorPixCentavos;
    ensurePixQrModal(create.data);
    btn.textContent = "Aguardando Pix...";
    const pedidoId = create.data.pedidoId;
    const flow = newPixFlow(pedidoId);
    startPixWaitingDots(flow);
    const start = Date.now();
    try {
      while (Date.now() - start < 10 * 60 * 1000) {
        if (flow.cancelled) throw new Error("PIX_CANCELADO");
        await new Promise(r => setTimeout(r, 2500));
        if (flow.cancelled) throw new Error("PIX_CANCELADO");
        const st = await pixMessage("ENFOQUE_PDV_PIX_STATUS", { token, pedidoId });
        const status = String(st?.data?.status || "").toLowerCase();
        if (st?.ok && (status === "pago" || status === "approved" || st?.data?.rede?.authorization?.status === "Approved")) {
          flow.finished = true;
          stopPixWaitingDots();
          setPixQrModalStatus("Pix aprovado", true);
          sendPinpadDisplay("PIX APROVADO", fmtBRL(valorPixCentavos).slice(0, 16)).catch(() => {});
          return { ok: true, pedidoId, status: "pago", raw: st.data };
        }
      }
    } finally {
      if (document.getElementById("enfoque-pdv-pix-status")) {
        // mantém a animação só enquanto está aguardando; no erro/time-out ela será parada abaixo
      }
    }
    stopPixWaitingDots();
    if (flow && flow.cancelled) throw new Error("PIX_CANCELADO");
    throw new Error("TIMEOUT_PIX");
  }

  function updateSendBox() {
    const box = ensureSendBox();
    if (!isPagamentosVisivel()) {
      box.style.display = "none";
      return;
    }

    const cap = state.lastCapture;
    if (!cap || !cap.payments || cap.payments.length === 0) {
      box.style.display = "none";
      return;
    }

    const items = cap.payments.filter((p) => p.ready);
    if (items.length === 0) {
      box.style.display = "none";
      return;
    }

    // mostra
    box.style.display = "block";
    const hint = box.querySelector("#enfoque-pdv-sendbox-hint");
    if (hint) hint.textContent = "Clique para enviar";

    const wrap = box.querySelector("#enfoque-pdv-sendbox-items");
    if (!wrap) return;

    wrap.innerHTML = "";

    items.forEach((p) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);border-radius:12px;padding:10px;";

      const left = document.createElement("div");
      left.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;";

      const title = document.createElement("div");
      title.style.cssText = "font-weight:800;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const methodLabel = p.method === "PIX" ? "Pix" : (p.method === "CREDIT" ? "Crédito" : "Débito");
      const instLabel = p.method === "CREDIT" ? ` • ${p.installments}x` : "";
      title.textContent = `${methodLabel}${instLabel} • ${fmtBRL(p.method === "PIX" ? getExactPixValorCents(p) : p.centsLinha)}`;

      const sub = document.createElement("div");
      sub.style.cssText = "font-size:11px;color:rgba(255,255,255,.70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      sub.textContent = p.method === "CREDIT" ? (norm(p.bandeira || p.credenciadora) || "Selecionar bandeira/parcelas") : (norm(p.credenciadora) || "(credenciadora)");

      left.appendChild(title);
      left.appendChild(sub);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.cssText = [
        "height:34px",
        "padding:0 12px",
        "border-radius:12px",
        "border:1px solid rgba(14,165,233,.35)",
        "background:rgba(14,165,233,.22)",
        "color:#fff",
        "cursor:pointer",
        "font-weight:800",
        "font-size:11px",
        "white-space:nowrap",
      ].join(";");

      if (p.alreadySent) {
        btn.textContent = "Enviado";
        btn.disabled = true;
        btn.style.opacity = "0.55";
        btn.style.cursor = "not-allowed";
      } else {
        btn.textContent = p.method === "PIX" ? "Gerar Pix" : "Aprovar";
      }

      btn.addEventListener("click", async () => {
        try {
          if (btn.disabled) return;

          const payload = {
            amount_cents: p.method === "PIX" ? getExactPixValorCents(p) : p.centsLinha,
            method: p.method,
            installments: p.installments,
            user_ref: buildUserRef(),
            // extras úteis p/ debug
            meta: {
              forma: p.formaLinha,
              forma_select: p.formaPagamentoSelecionada,
              valor_linha: p.valorLinha,
              valor_recebido: p.valorRecebidoRaw,
              credenciadora: p.credenciadora,
              bandeira: p.bandeira,
              condicao: p.condicao,
              parcelas: p.parcelas,
              captured_at: cap.at,
              row: p.idx,
            },
          };

          btn.disabled = true;
          btn.style.opacity = "0.75";
          btn.style.cursor = "progress";

          if (p.method === "PIX") {
            addLog("info", "Gerando Pix no backend...", payload);
            const pix = await runPixBackendFlow(p, btn);
            state.sentByKey.set(p.key, p.sig);
            addLog("ok", "Pix aprovado pelo backend.", pix);
          } else {
            addLog("info", "Aguardando clique para aprovar cartão e preencher NSU...", payload);
            btn.textContent = "Confirmar";
            if (p.method === "CREDIT") {
              btn.textContent = "Bandeira";
              const details = await chooseAndFillCreditDetails(p);
              addLog("ok", "Bandeira/parcelas preenchidas no SIGE.", details);
            }
            await sendPinpadDisplay((p.method === "CREDIT" ? "CREDITO " : "DEBITO ") + fmtBRL(p.centsLinha).slice(0, 8), "CONFIRME TELA");
            const approved = await waitF1ApprovalOverlay(p);
            if (!approved.ok) throw new Error(approved.error || "CANCELADO");
            const filled = fillNsuForPayment(p, approved.nsu);
            await sendPinpadDisplay("CARTAO APROVADO", ("NSU " + approved.nsu).slice(0, 16));
            state.sentByKey.set(p.key, p.sig);
            addLog(filled ? "ok" : "warn", filled ? "Cartão aprovado: NSU preenchido no SIGE." : "Cartão aprovado, mas campo NSU não foi encontrado.", { nsu: approved.nsu, filled });
          }
          scheduleCapture(50);
        } catch (e) {
          const errMsg = String(e && e.message ? e.message : e);
          stopPixWaitingDots();
          if (errMsg === "PIX_CANCELADO") {
            setPixQrModalStatus("Pix cancelado", false);
            sendPinpadDisplay("PIX CANCELADO", "PROXIMA VENDA").catch(() => {});
            setTimeout(() => clearPinpadForNextSale(), 900);
            addLog("warn", "Pix cancelado pelo fechamento do QR Code.", { error: errMsg });
          } else {
            setPixQrModalStatus("Erro no Pix", false);
            sendPinpadDisplay("ERRO NO PIX", "TENTE NOVAMENTE").catch(() => {});
            addLog("error", "Erro ao enviar /transaction.", { error: errMsg });
          }
        } finally {
          scheduleCapture(120);
        }
      });

      row.appendChild(left);
      row.appendChild(btn);
      wrap.appendChild(row);
    });
  }

  // ---------- UI (aba PDV do painel lateral) ----------
  function updateUI() {
    try {
      // Status
      const stEl = document.getElementById("enfoque-pdv-bridge-status");
      if (stEl) stEl.textContent = state.status.text || "";

      // Última captura
      const lastEl = document.getElementById("enfoque-pdv-bridge-last");
      if (lastEl) {
        if (!state.lastCapture) {
          lastEl.textContent = "(sem captura ainda)";
        } else {
          const c = state.lastCapture;
          const list = (c.payments || []).map((p) => {
            const methodLabel = p.method === "PIX" ? "PIX" : (p.method === "CREDIT" ? "CREDIT" : (p.method === "DEBIT" ? "DEBIT" : "N/A"));
            const rdy = p.ready ? (p.alreadySent ? "✅ enviado" : "🟢 pronto") : "⚪ incompleto";
            const inst = p.method === "CREDIT" ? `${p.installments || "?"}x` : "-";
            const reason = (!p.ready && p.reason) ? ` • ${p.reason}` : "";
            return `<div style="margin:6px 0 0;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.03);">
              <div><b>Linha:</b> ${p.idx + 1} • <b>${methodLabel}</b> • <b>${inst}</b> • <b>${fmtBRL(p.centsLinha)}</b> • ${rdy}${reason}</div>
              <div style="color:#9ca3af;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.formaLinha || ""} • ${p.credenciadora || ""}</div>
            </div>`;
          }).join("");

          lastEl.innerHTML = `
            <div><b>Capturado em:</b> ${new Date(c.at).toLocaleString()}</div>
            <div style="margin-top:6px;"><b>Valor Recebido (campo):</b> ${norm(c.valorRecebidoRaw) || "(vazio)"}</div>
            <div style="margin-top:6px;"><b>Pagamentos:</b></div>
            ${list || "<div style='color:#9ca3af'>(nenhuma linha encontrada)</div>"}
          `;
        }
      }

      // Log
      const logEl = document.getElementById("enfoque-pdv-bridge-log");
      if (logEl) {
        const lines = (state.log || []).slice(0, 80).map((l) => {
          const badge = l.level === "error" ? "❌" : (l.level === "warn" ? "⚠️" : (l.level === "ok" ? "✅" : "ℹ️"));
          const data = l.data ? `<pre style="margin:6px 0 0;padding:8px;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.06);white-space:pre-wrap;word-break:break-word;font-size:10px;color:#d1d5db;">${escapeHtml(JSON.stringify(l.data, null, 2))}</pre>` : "";
          return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">
            <div style="font-size:11px;"><b>${badge} ${escapeHtml(l.t)}</b> — ${escapeHtml(l.msg)}</div>
            ${data}
          </div>`;
        }).join("");
        logEl.innerHTML = lines || `<div style="color:#9ca3af;">(sem logs)</div>`;
      }
    } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------- watchers ----------
  function hookPanelButtons() {
    // Ping (aba PDV no painel lateral)
    const btn = document.getElementById("enfoque-pdv-btn-ping");
    if (btn && !btn.dataset.enfoqueHooked) {
      btn.dataset.enfoqueHooked = "1";
      btn.addEventListener("click", async () => {
        addLog("info", "Pingando app local (127.0.0.1:8787)...");
        const r = await pingLocalBridge();
        if (r && r.ok && r.resp && r.resp.ok) {
          addLog("ok", "Ping OK.", r);
        } else {
          addLog("warn", "Ping falhou. App está aberto?", r);
        }
      });
    }
  }

  function attachObservers() {
    if (state._mo) return;

    // Captura ao digitar/alterar campos relevantes
    const onEvt = (ev) => {
      const t = ev && ev.target ? ev.target : null;
      if (!t) return;
      if (
        t.matches('input[ng-model="valorRecebido"]') ||
        t.matches('input[ng-model="item.CredenciadoraCartao"]') ||
        t.matches('select[ng-model="item.CondicaoPagamento"]') ||
        t.matches('input[ng-model="item.Parcelas"]') ||
        t.matches('select[ng-model="item.BandeiraCartao"]')
      ) {
        scheduleCapture(120);
      }
    };

    document.addEventListener("input", onEvt, true);
    document.addEventListener("change", onEvt, true);

    // Observa mudanças no DOM (Angular / ngRepeat)
    const mo = new MutationObserver(() => {
      hookPanelButtons();
      scheduleCapture(160);
    });

    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    state._mo = mo;
  }

  // ---------- init ----------
  function init() {
    if (!isOnPdv()) return;

    addLog("info", "Venda v1.2.41 ativa.");
    hookPanelButtons();
    attachObservers();

    // captura inicial
    scheduleCapture(50);

    // e recaptura leve (caso o Angular mude sem eventos)
    setInterval(() => {
      hookPanelButtons();
      scheduleCapture(220);
    }, 1400);
  }

  init();
})();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restorePdvBackup() {
  chrome.storage.local.get(["sige_pdv_backup"], async (res) => {
    const backup = res.sige_pdv_backup;
    if (!backup?.items?.length) {
      console.warn("⚠ Sem backup PDV para restaurar.");
      return;
    }

    const fieldSel = "#txtNomeProduto";
    const field = document.querySelector(fieldSel);
    if (!field || !window.humanType) {
      console.warn("⚠ Campo #txtNomeProduto ou humanType não encontrado.");
      return;
    }

    // Monta fila: nome repetido qtd vezes
    const queue = [];
    backup.items.forEach((it) => {
      const nome = (it.nome || "").trim();
      const qtd = parseInt(it.qtd, 10);
      if (!nome || !Number.isFinite(qtd) || qtd <= 0) return;

      for (let i = 0; i < qtd; i++) queue.push(nome);
    });

    console.log("🔁 Restaurando backup PDV. Total de digitações:", queue.length);

    // Digita e confirma com Enter (PDV costuma ouvir keypress/keyup)
    const typeAndEnter = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.focus();
      el.value = value;

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      const evtBase = { key: "Enter", code: "Enter", bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent("keydown", evtBase));
      el.dispatchEvent(new KeyboardEvent("keypress", evtBase));
      el.dispatchEvent(new KeyboardEvent("keyup", evtBase));
    };
    // Clica no botão 'ADICIONAR ITEM' após o tempo de processamento do campo
    const clickAddButton = () => {
      const btn = document.querySelector('#btnAdicionar');
      if (!btn) {
        console.warn("⚠ Botão #btnAdicionar não encontrado no PDV.");
        return;
      }
      try {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.click();
      } catch (e) {
        try { btn.click(); } catch (_) {}
      }
    };

    for (let i = 0; i < queue.length; i++) {
      const nome = queue[i];
      typeAndEnter(fieldSel, nome);
      // aguarda o autocomplete/processamento do Angular
      await sleep(1500);
      clickAddButton();
      // respiro entre itens (evita dupla inserção por debounce do PDV)
      await sleep(500);
    }

    console.log("✅ Restauração PDV concluída.");
  });
}

// Atualiza o botão/meta do PDV dentro da aba de Backup do painel lateral.
// (Sem qualquer UI na página do PDV)
function updatePdvBackupPanelControls() {
  try {
    const btn = document.getElementById("sige-btn-restore-pdv");
    const meta = document.getElementById("sige-pdv-backup-meta");
    if (!btn && !meta) return;

    const has = !!(pdvBackupData && Array.isArray(pdvBackupData.items) && pdvBackupData.items.length);
    if (btn) btn.style.display = has ? "block" : "none";

    if (meta) {
      if (!has) {
        meta.textContent = "Sem backup do PDV salvo ainda.";
      } else {
        const total = (pdvBackupData.items || []).reduce((acc, it) => acc + (parseInt(it.qtd, 10) || 0), 0);
        const when = pdvBackupData.savedAt ? new Date(pdvBackupData.savedAt).toLocaleString("pt-BR") : "";
        meta.textContent = `Último backup: ${when} • Itens: ${pdvBackupData.items.length} • Qtd total: ${total}`;
      }
    }
  } catch (e) {}
}

function startPdvRestoreFromPanel() {
  chrome.storage.local.get(["sige_pdv_backup"], (res) => {
    const backup = res.sige_pdv_backup;
    if (!backup?.items?.length) {
      alert("Não há backup do PDV salvo ainda.");
      return;
    }

    // Se não estiver no PDV, marca pendência e navega.
    if (!location.href.includes("/sistema/pdv")) {
      chrome.storage.local.set({ sige_pdv_pending_restore: true }, () => {
        location.href = "https://enfoquepapelaria.meusige.com.br/sistema/pdv";
      });
      return;
    }

    // Já está no PDV: restaura agora
    restorePdvBackup();
  });
}

function checkPendingPdvRestore() {
  chrome.storage.local.get(["sige_pdv_pending_restore"], (res) => {
    if (!res.sige_pdv_pending_restore) return;
    // Limpa flag e executa com pequeno delay pra Angular renderizar
    chrome.storage.local.remove(["sige_pdv_pending_restore"], () => {
      setTimeout(() => {
        try { ensureHumanType(); } catch(e) {}
        restorePdvBackup();
      }, 2000);
    });
  });
}

// =============================================================
// PDV: limpar campo "Nome da Escola" ao entrar no PDV (uma vez por entrada)
// =============================================================
function resetNomeEscolaClearState() {
  pdvNomeEscolaClearStarted = false;
  if (pdvNomeEscolaObserver) {
    try { pdvNomeEscolaObserver.disconnect(); } catch (e) {}
    pdvNomeEscolaObserver = null;
  }
}

function tryClearNomeEscolaField() {
  const el = document.getElementById("idNomeEscola");
  if (!el) return false;

  // Limpa agora
  el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  // Se o Angular reescrever o valor depois, tenta limpar de novo por alguns segundos,
  // mas sem atrapalhar se o usuário já estiver digitando (campo em foco).
  [250, 600, 1200, 2000, 3200].forEach((ms) => {
    setTimeout(() => {
      const e = document.getElementById("idNomeEscola");
      if (!e) return;
      if (document.activeElement === e) return;
      if (e.value && String(e.value).trim() !== "") {
        e.value = "";
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, ms);
  });

  return true;
}

function startClearNomeEscolaOnceOnPdvEntry() {
  if (!location.href.includes("/sistema/pdv")) return;
  if (pdvNomeEscolaClearStarted) return;
  pdvNomeEscolaClearStarted = true;

  const attempt = () => {
    const ok = tryClearNomeEscolaField();
    if (ok && pdvNomeEscolaObserver) {
      try { pdvNomeEscolaObserver.disconnect(); } catch (e) {}
      pdvNomeEscolaObserver = null;
    }
    return ok;
  };

  // Tentativas rápidas (caso o elemento já exista)
  if (attempt()) return;

  // Observa o DOM até o campo aparecer
  pdvNomeEscolaObserver = new MutationObserver(() => {
    attempt();
  });
  try {
    pdvNomeEscolaObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // Fallback: retries por alguns segundos
  [500, 1000, 2000, 4000, 8000].forEach((ms) => setTimeout(attempt, ms));

  // Não fica observando para sempre
  setTimeout(() => {
    if (pdvNomeEscolaObserver) {
      try { pdvNomeEscolaObserver.disconnect(); } catch (e) {}
      pdvNomeEscolaObserver = null;
    }
  }, 20000);
}


// =============================================================
// 8. FUNÇÃO humanType() – simula digitação humana no SIGE
// =============================================================

function ensureHumanType() {
  if (window.humanType) return;

  window.humanType = function (selector, value) {
    let el = document.querySelector(selector);
    if (!el) return;

    el.focus();
    el.value = value;

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
}



// =============================================================
// ENFOQUE EXTRA: Pessoas/Edit — Limite de Crédito mínimo (0,01)
// Requisito: se #LimiteCredito estiver vazio ou 0 (0,00), autoajusta para 0,01
// sem "brigar" com o usuário (não reescreve depois que o usuário editar).
// =============================================================

function __enfoqueParseMoneyToNumber__BR(str) {
  const s = String(str || "").trim();
  if (!s) return 0;

  let t = s.replace(/[^\d,.\-]/g, "");
  if (!t) return 0;

  // Se tiver vírgula, assume formato pt-BR: "1.234,56"
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    // Se tiver muitos pontos, assume separador de milhar e preserva o último como decimal
    const parts = t.split(".");
    if (parts.length > 2) {
      const last = parts.pop();
      t = parts.join("") + "." + last;
    }
  }

  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function __enfoqueStopLimiteCreditoAutoFix() {
  try { __enfoqueLimiteCreditoObserver && __enfoqueLimiteCreditoObserver.disconnect(); } catch (_) {}
  __enfoqueLimiteCreditoObserver = null;
  __enfoqueLimiteCreditoUserTouched = false;
}

function __enfoqueTryFixLimiteCreditoOnce() {
  const el = document.getElementById("LimiteCredito");
  if (!el) return;

  // Marca quando o usuário mexer (apenas eventos trusted)
  if (!el.dataset.enfoqueLimiteCreditoHooked) {
    el.dataset.enfoqueLimiteCreditoHooked = "1";
    el.addEventListener("input", (ev) => {
      if (ev && ev.isTrusted) __enfoqueLimiteCreditoUserTouched = true;
    }, { passive: true });
    el.addEventListener("keydown", (ev) => {
      if (ev && ev.isTrusted) __enfoqueLimiteCreditoUserTouched = true;
    }, { passive: true });
  }

  if (__enfoqueLimiteCreditoUserTouched) return;

  // Evita re-aplicar no mesmo elemento
  if (el.dataset.enfoqueLimiteCreditoAutoSet === "1") return;

  const raw = String(el.value || "").trim();
  const n = __enfoqueParseMoneyToNumber__BR(raw);

  if (!raw || n === 0) {
    try { ensureHumanType && ensureHumanType(); } catch (_) {}
    if (window.humanType) {
      window.humanType("#LimiteCredito", "0,01");
    } else {
      // fallback simples
      el.focus();
      el.value = "0,01";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    el.dataset.enfoqueLimiteCreditoAutoSet = "1";
  }
}

function __enfoqueStartLimiteCreditoAutoFix() {
  if (__enfoqueLimiteCreditoObserver) return;

  // Tenta imediatamente (caso já esteja no DOM)
  __enfoqueTryFixLimiteCreditoOnce();

  // Observa o DOM (Angular pode renderizar depois)
  __enfoqueLimiteCreditoObserver = new MutationObserver(() => {
    try { __enfoqueTryFixLimiteCreditoOnce(); } catch (_) {}
  });

  const root = document.body || document.documentElement;
  if (!root) return;

  try {
    __enfoqueLimiteCreditoObserver.observe(root, { childList: true, subtree: true });
  } catch (_) {}
}


// =============================================================
// ENFOQUE EXTRA: PDV — esconder botão "15 DIAS FORA MÊS"
// =============================================================

function __enfoqueRemoveHideBtn15DiasForaMesStyle() {
  const st = document.getElementById("enfoque_hide_btn_15dias_fora_mes");
  if (st && st.parentNode) st.parentNode.removeChild(st);
}

function __enfoqueEnsureHideBtn15DiasForaMes() {
  if (!pdvMode) return;

  // Faz como o "Hide element" do DevTools: CSS + reforço por JS
  if (!document.getElementById("enfoque_hide_btn_15dias_fora_mes")) {
    const st = document.createElement("style");
    st.id = "enfoque_hide_btn_15dias_fora_mes";
    st.textContent = `
      #btnForma15DiasForaMes{
        display:none !important;
        visibility:hidden !important;
        pointer-events:none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  const btn = document.getElementById("btnForma15DiasForaMes");
  if (btn) {
    btn.style.display = "none";
    btn.style.visibility = "hidden";
    btn.setAttribute("aria-hidden", "true");
  }
}

// Interval leve (só atua quando pdvMode = true)
setInterval(() => { try { __enfoqueEnsureHideBtn15DiasForaMes(); } catch (_) {} }, 700);



// =============================================================
// 8.1 RESTAURAÇÃO ENTRE DEPÓSITOS — digitar produto e confirmar item
// =============================================================
function __enfoqueFindMovAdicionarItemButton() {
  try {
    return document.getElementById('btnAdicionar') ||
      document.querySelector('input[value="Adicionar Item"], button[value="Adicionar Item"]') ||
      Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button')).find((el) => {
        const t = String(el.value || el.textContent || '').trim();
        return /Adicionar\s+Item/i.test(t);
      }) || null;
  } catch (_) {
    return null;
  }
}

function __enfoqueDispatchFullInput(el) {
  try { el.focus(); } catch (_) {}
  try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  try { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); } catch (_) {}
  try { el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); } catch (_) {}
  try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
}

function __enfoqueMovTypeProductAndAdd(item) {
  try {
    ensureHumanType();
    const input = document.querySelector('#LocalizarProdutoNew_Produto');
    if (!input) {
      console.warn('⚠ Campo #LocalizarProdutoNew_Produto não encontrado para restaurar rascunho.');
      return;
    }

    // Antes estava digitando o nome do produto. No Entre Depósitos isso pode deixar
    // o autocomplete sem selecionar o item. Usamos o código do card, que é mais exato.
    const codigo = String(item?.codigo || '').trim();
    const nome = String(item?.nome || '').trim();
    const termo = codigo || nome;

    input.focus();
    input.value = termo;
    __enfoqueDispatchFullInput(input);

    setTimeout(() => {
      try {
        input.focus();
        input.value = termo;
        __enfoqueDispatchFullInput(input);
      } catch (_) {}

      const btn = __enfoqueFindMovAdicionarItemButton();
      if (btn) {
        try { btn.click(); } catch (_) {}
        console.log('✔ Produto enviado para adicionar no rascunho:', termo);
      } else {
        console.warn('⚠ Botão Adicionar Item não encontrado. Produto digitado:', termo);
      }
    }, 350);
  } catch (e) {
    console.warn('⚠ Erro ao restaurar produto do rascunho:', e);
  }
}

// =============================================================
// 9. RESTAURAÇÃO COMPLETA (cabeçalho + itens + quantidade)
// =============================================================

function restoreBackup() {
  chrome.storage.local.get(["sige_backup"], (res) => {
    if (!res.sige_backup) {
      console.warn("❌ Nenhum backup encontrado para restaurar.");
      return;
    }

    let data = res.sige_backup;
    console.log("🔁 Restaurando backup completo:", data);

    ensureHumanType();

    // 1 — Preencher cabeçalho
    setTimeout(() => {
      humanType("#Deposito1", data.origem);
      humanType("#Deposito2", data.destino);
      humanType("#realizadoPor", data.responsavel);

      let d = document.querySelector("input.datetime");
      if (d) {
        d.value = data.data;
        d.dispatchEvent(new Event("input", { bubbles: true }));
        d.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, 800);

    // 2 — Inserir produtos + restaurar quantidade
    let delay = 2600;

    data.itens.forEach((item, index) => {
      let codigo = item.codigo;
      let qtd = item.quantidade;

      // Inserir o código do produto
      setTimeout(() => {
        // No SIGE, o campo aceita a descrição. Para reduzir erro de leitura,
        // digitamos apenas o nome (sem o código fixo do início).
        __enfoqueMovTypeProductAndAdd(item);
      }, delay * (index + 1));

      // Ajustar a quantidade depois
      setTimeout(() => {
        restoreQuantity(codigo, qtd);
      }, delay * (index + 1) + 1500);
    });
  });
}

// =============================================================
// 10. RESTAURAR QUANTIDADE PARA UM CÓDIGO ESPECÍFICO
// =============================================================

function restoreQuantity(codigo, quantidade, tentativa = 0) {
  let found = false;
  let tbodies = document.querySelectorAll("tbody[ng-repeat]");

  tbodies.forEach((tbody) => {
    let cell = tbody.querySelector(".ListField");
    let q = tbody.querySelector("input[id*=rptProdutoQuantidade], input[ng-model*=Quantidade]");

    if (cell && q) {
      let txt = cell.innerText.trim();
      let cod = txt.split(" - ")[0].trim();

      // Comparação flexível: remove zeros à esquerda para comparar
      let codClean = cod.replace(/^0+/, '');
      let codigoClean = String(codigo || '').replace(/^0+/, '');

      if (codClean === codigoClean) {
        found = true;
        q.focus();
        q.value = quantidade;

        q.dispatchEvent(new Event("input", { bubbles: true }));
        q.dispatchEvent(new Event("change", { bubbles: true }));
        q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        q.dispatchEvent(new Event("blur", { bubbles: true }));

        console.log(`✔ Quantidade restaurada (${codigo} = ${quantidade})`);
      }
    }
  });

  // O SIGE pode demorar para inserir o produto depois de clicar em Adicionar Item.
  // Repetimos por alguns segundos antes de desistir.
  if (!found && tentativa < 12) {
    setTimeout(() => restoreQuantity(codigo, quantidade, tentativa + 1), 500);
  } else if (!found) {
    console.warn(`⚠ Não encontrei o produto ${codigo} para restaurar quantidade ${quantidade}`);
  }
}

// =============================================================
// 11. RESTAURAR APENAS PRODUTOS (troca depósito)
// =============================================================

function restoreOnlyProducts() {
  chrome.storage.local.get(["sige_backup"], (res) => {
    if (!res.sige_backup) {
      console.warn("❌ Sem backup para restaurar itens.");
      return;
    }

    let itens = res.sige_backup.itens;
    ensureHumanType();

    let delay = 2600;

    itens.forEach((item, index) => {
      let codigo = item.codigo;
      let qtd = item.quantidade;

      setTimeout(() => {
        __enfoqueMovTypeProductAndAdd(item);
      }, delay * (index + 1));

      setTimeout(() => {
        restoreQuantity(codigo, qtd);
      }, delay * (index + 1) + 1500);
    });

    console.log("✔ Produtos restaurados (troca depósito).");
  });
}

// =============================================================
// 12.1 CONTAGEM REGRESSIVA PARA RESTAURAR ITENS IMPORTADOS
function startItemsCountdownAndRestore() {
  const total = 7;
  let remaining = total;

  let banner = document.getElementById("sige-import-countdown");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "sige-import-countdown";
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.background = "#0f766e";
    banner.style.color = "#ecfeff";
    banner.style.padding = "10px";
    banner.style.fontSize = "14px";
    banner.style.textAlign = "center";
    banner.style.zIndex = "9999999";
    banner.style.boxShadow = "0 2px 4px rgba(15,23,42,.4)";
    document.body.appendChild(banner);
  }

  const update = () => {
    banner.textContent =
      "Importação de backup: os produtos serão restaurados em " +
      remaining +
      "s...";
  };

  update();

  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
      restoreOnlyProducts();
    } else {
      update();
    }
  }, 1000);
}

// 12. RESTAURAÇÃO PENDENTE (após redirecionar da LIST para EDIT)
// =============================================================

function checkPendingRestore() {
  chrome.storage.local.get(["sige_pending_restore"], (res) => {
    if (!res.sige_pending_restore) return;

    const mode = res.sige_pending_restore;
    chrome.storage.local.remove("sige_pending_restore");

    if (mode === "all") {
      console.log("🔁 Restauração pendente: modo completo.");
      restoreBackup();
    }
    if (mode === "items") {
      console.log("🔁 Restauração pendente: só produtos.");
      restoreOnlyProducts();
    }
    if (mode === "items_import") {
      console.log("🔁 Restauração pendente: itens importados (com atraso).");
      startItemsCountdownAndRestore();
    }
  });
}


// =============================================================

// 12.6 GERADOR DE ETIQUETAS VIA PDV
// ============================================================
//
// Quando o PDV é aberto com o parâmetro ?etq=1, esta extensão
// lê os itens diretamente da tela do PDV (Angular/DOM) e monta
// as etiquetas em tempo real. A aba "Etiquetas" do painel
// lateral mostra uma prévia e permite mandar imprimir.
//
// Isso evita depender de qualquer API externa: tudo é feito
// apenas com o que já aparece na tela do SIGE.

const sigeEtiquetasState = {
  lastSnapshotKey: "",
  pollerId: null
};

const SIGE_ETQ_TAMANHO_STORAGE_KEY = "enfoque_sige_etiquetas_tamanho";
const SIGE_ETQ_PAPEL_ARTE_STORAGE_KEY = "enfoque_sige_etiquetas_papel_arte";

function getSigeEtiquetaTamanhoAtual() {
  try {
    let t = "";
    if (typeof window !== "undefined" && window.sigeEtiquetasTamanho) {
      t = String(window.sigeEtiquetasTamanho || "");
    }
    if (!t && typeof localStorage !== "undefined") {
      t = String(localStorage.getItem(SIGE_ETQ_TAMANHO_STORAGE_KEY) || "");
    }
    t = (t || "media").toLowerCase();
    if (t !== "pequena" && t !== "media" && t !== "grande") t = "media";
    if (typeof window !== "undefined") window.sigeEtiquetasTamanho = t;
    return t;
  } catch (e) {
    return "media";
  }
}

function setSigeEtiquetaTamanhoAtual(tamanho) {
  try {
    let t = String(tamanho || "media").toLowerCase();
    if (t !== "pequena" && t !== "media" && t !== "grande") t = "media";
    if (typeof window !== "undefined") window.sigeEtiquetasTamanho = t;
    if (typeof localStorage !== "undefined") localStorage.setItem(SIGE_ETQ_TAMANHO_STORAGE_KEY, t);
    return t;
  } catch (e) {
    return "media";
  }
}

function getSigeEtiquetaPapelArteAtual() {
  try {
    let v = false;
    if (typeof window !== "undefined" && typeof window.sigeEtiquetasPapelArte !== "undefined") {
      v = !!window.sigeEtiquetasPapelArte;
    } else if (typeof localStorage !== "undefined") {
      v = localStorage.getItem(SIGE_ETQ_PAPEL_ARTE_STORAGE_KEY) === "1";
    }
    if (typeof window !== "undefined") window.sigeEtiquetasPapelArte = v;
    return v;
  } catch (e) {
    return false;
  }
}

function setSigeEtiquetaPapelArteAtual(value) {
  try {
    const v = !!value;
    if (typeof window !== "undefined") window.sigeEtiquetasPapelArte = v;
    if (typeof localStorage !== "undefined") localStorage.setItem(SIGE_ETQ_PAPEL_ARTE_STORAGE_KEY, v ? "1" : "0");
    return v;
  } catch (e) {
    return !!value;
  }
}

function isPDVModoEtiquetas() {
  try {
    const path = (window.location && window.location.pathname || "").toLowerCase();
    if (!path.includes("/sistema/pdv")) return false;
    const search = window.location && window.location.search ? window.location.search : "";
    const params = new URLSearchParams(search);
    return params.get("etq") === "1";
  } catch (e) {
    console.warn("[SIGE Assistente] Erro ao verificar modo etiquetas PDV:", e);
    return false;
  }
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function parsePrecoBR(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  let s = value.trim();
  if (!s) return 0;

  const hasComma = s.indexOf(",") !== -1;

  if (hasComma) {
    // Formato brasileiro, ex: "1.234,56" ou "R$ 5,95"
    s = s.replace(/[^0-9\.,]/g, "");
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Sem vírgula: assume ponto como separador decimal, ex: "5.95"
    s = s.replace(/[^0-9\.]/g, "");
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}
function formatPrecoBR(value) {
  const num = parsePrecoBR(value);
  return num.toFixed(2).replace(".", ",");
}

// Lê os produtos atuais do PDV usando, se possível, o escopo Angular da tabela.
// Retorna um array de objetos: { codigo, nome, preco, quantidade }
function coletarProdutosPDV() {
  const produtos = [];

  try {
    // Preferimos ler direto do Angular (mais completo e confiável)
    if (window.angular && document.querySelector("#tabelaProdutos tbody[ng-repeat]")) {
      const tbodies = document.querySelectorAll("#tabelaProdutos tbody[ng-repeat]");
      tbodies.forEach(tb => {
        try {
          const el = window.angular.element(tb);
          const scope = el && el.scope ? el.scope() : null;
          const item = scope && scope.item ? scope.item : null;
          if (!item) return;

          const qtd = Number(item.Quantidade || item.Qtd || 1) || 1;
          const nome = (item.Nome || item.Descricao || "").toString();

          // Preço unitário: priorizamos o valor unitário vindo do próprio Angular
          let precoNum = 0;

          // 1) Campos típicos do PDV: ValorUnitario, PrecoUnitario, PrecoVenda, etc.
          const precoRaw = item.ValorUnitario ?? item.PrecoUnitario ?? item.PrecoVenda ?? item.Preco ?? item.ValorUnitarioOriginal ?? item.Valor ?? 0;
          precoNum = parsePrecoBR(precoRaw);

          // 2) Se ainda não deu, tentamos derivar a partir do valor total dividido pela quantidade
          if (!precoNum) {
            const totalRaw = item.ValorTotal ?? item.Total ?? 0;
            const totalNum = parsePrecoBR(totalRaw);
            if (totalNum && qtd) {
              precoNum = totalNum / qtd;
            }
          }

          // 3) Como último recurso, usamos a coluna "Preço (R$)" da tabela (que geralmente é o total)
          //    mas dividimos pela quantidade para obter o unitário.
          if (!precoNum) {
            const row = tb.querySelector("tr");
            if (row) {
              const cols = row.querySelectorAll("th");
              if (cols.length >= 4) {
                const precoText = cols[3].innerText.trim();
                const totalNum = parsePrecoBR(precoText);
                if (totalNum && qtd) {
                  precoNum = totalNum / qtd;
                }
              }
            }
          }

          let codigo = (
            item.Codigo ||
            item.Cod ||
            item.CodigoBarras ||
            item.CodBarras ||
            item.CodBarra ||
            ""
          ).toString().trim();

          // Fallback: se o Angular não tiver o código, tenta pegar do input principal do PDV
          if (!codigo) {
            const codigoInput = document.querySelector("#txtCodigoItem");
            if (codigoInput && codigoInput.value) {
              codigo = codigoInput.value.trim();
            }
          }

          produtos.push({
            codigo,
            nome,
            preco: precoNum,
            quantidade: qtd > 0 ? qtd : 1
          });
        } catch (innerErr) {
          console.warn("[SIGE Assistente] Erro ao ler item do Angular PDV:", innerErr);
        }
      });
    }
  } catch (e) {
    console.warn("[SIGE Assistente] Erro ao coletar produtos via Angular PDV:", e);
  }

  // Fallback: se não conseguimos pelo Angular, tentamos extrair o que der do DOM.
  if (!produtos.length) {
    try {
      const rows = document.querySelectorAll("#tabelaProdutos tbody tr");
      rows.forEach(row => {
        const cols = row.querySelectorAll("th");
        if (cols.length >= 4) {
          const qtdText = cols[0].innerText.trim().replace(",", ".");
          const nome = cols[1].innerText.trim();
          const precoText = cols[3].innerText.trim();
          const qtd = parseFloat(qtdText) || 1;
          const total = parsePrecoBR(precoText);
          const preco = qtd ? (total / qtd) : total;

          let codigo = "";
          const codigoInput = document.querySelector("#txtCodigoItem");
          if (codigoInput && codigoInput.value) {
            codigo = codigoInput.value.trim();
          }

          produtos.push({
            codigo,
            nome,
            preco,
            quantidade: qtd > 0 ? qtd : 1
          });
        }
      });
    } catch (domErr) {
      console.warn("[SIGE Assistente] Erro ao coletar produtos via DOM PDV:", domErr);
    }
  }

  return produtos;
}



// A partir dos produtos do PDV, gera a lista "achatada" de etiquetas.
// Cada unidade de quantidade vira uma etiqueta separada.
function coletarEtiquetasPDV() {
  const produtos = coletarProdutosPDV();
  const etiquetas = [];

  produtos.forEach(p => {
    const qtd = p.quantidade && p.quantidade > 0 ? p.quantidade : 1;
    for (let i = 0; i < qtd; i += 1) {
      etiquetas.push({
        codigo: p.codigo || "",
        nome: p.nome || "",
        preco: p.preco || 0
      });
    }
  });

  // Fallback extra: se alguma etiqueta ficar sem código,
  // tenta pegar diretamente do campo de código do PDV (#txtCodigoItem)
  try {
    let codigoFallback = "";
    const codigoInput = document.querySelector("#txtCodigoItem");
    if (codigoInput && codigoInput.value) {
      codigoFallback = codigoInput.value.trim();
    }
    if (codigoFallback) {
      etiquetas.forEach(e => {
        if (!e.codigo) {
          e.codigo = codigoFallback;
        }
      });
    }
  } catch (err) {
    console.warn("[SIGE Assistente] Erro ao aplicar fallback de código nas etiquetas:", err);
  }

  return { produtos, etiquetas };
}

// Gera o HTML das etiquetas para a janela de impressão.

function gerarHtmlImpressaoEtiquetas(etiquetas) {
  const fontUrl = "";
  const caixaUrl = chrome.runtime.getURL("caixaTexto.jpg");
  const logoUrl = chrome.runtime.getURL("logo.jpg");
  const logoPapelUrl = chrome.runtime.getURL("loga.png");

  const t = getSigeEtiquetaTamanhoAtual();

  let cfg = {
    w: "60mm",
    h: "35mm",
    logoH: "7mm",
    precoH: "12mm",
    descH: "9mm",
    codH: "7mm",
    precoFont: "26pt",
    descFont: "9pt",
    codFont: "14pt"
  };

  if (t === "pequena") {
    cfg = { w: "40mm", h: "25mm", logoH: "5mm", precoH: "9mm", descH: "6mm", codH: "5mm", precoFont: "18pt", descFont: "7pt", codFont: "10pt" };
  } else if (t === "grande") {
    cfg = { w: "75mm", h: "50mm", logoH: "10mm", precoH: "18mm", descH: "12mm", codH: "10mm", precoFont: "38pt", descFont: "12pt", codFont: "20pt" };
  }


  const etiquetasHtml = etiquetas.map(e => {
    const rawCodigo = (e.codigo || "").toString();
    const onlyDigits = rawCodigo.replace(/[^0-9]/g, "");
    const codDisplay = (onlyDigits || rawCodigo).slice(-6);
    const nome = escapeHtml(e.nome || "");
    const preco = formatPrecoBR(e.preco);
    const isPapelArte = getSigeEtiquetaPapelArteAtual();
    const logoClass = isPapelArte ? "logo logo-papel" : "logo";

    return `
      <div class="etiqueta">
        <div class="${logoClass}"></div>
        <div class="preco">${preco}</div>
        <div class="desc">${nome}</div>
        <div class="cod">${escapeHtml(codDisplay)}</div>
      </div>
    `;
  }).join("");

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Etiquetas - Enfoque Papelaria</title>
      <style>
        @font-face {
          font-family: ui-monospace, Consolas, monospace;
          src: url('${fontUrl}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        :root {
  --etq-w: ${cfg.w};
  --etq-h: ${cfg.h};
  --etq-logo-h: ${cfg.logoH};
  --etq-preco-h: ${cfg.precoH};
  --etq-desc-h: ${cfg.descH};
  --etq-cod-h: ${cfg.codH};
  --etq-preco-font: ${cfg.precoFont};
  --etq-desc-font: ${cfg.descFont};
  --etq-cod-font: ${cfg.codFont};
}
#etiquetas {
  margin-top: 40px;
  display: flex;
  flex-wrap: wrap;
  gap: 2mm;
}
.etiqueta {
  width: var(--etq-w);
  height: var(--etq-h);
  background: #fff;
  overflow: hidden;
  font-family: Arial, sans-serif;
  padding: 0;
  border: 1px solid #111827;
  display: flex;
  flex-direction: column;
  break-inside: avoid;
  page-break-inside: avoid;
}
.logo {
  width: 100%;
  height: var(--etq-logo-h);
  margin: 0 auto;
  background: url('${logoUrl}') no-repeat center;
  background-size: cover;
}
.logo-papel {
  background: url('${logoPapelUrl}') no-repeat center;
  background-size: cover;
}
.preco {
  width: 100%;
  background: #000;
  color: #fff;
  font-size: var(--etq-preco-font);
  text-align: center;
  font-family: ui-monospace, Consolas, monospace;
  padding: 0px;
  height: var(--etq-preco-h);
  line-height: var(--etq-preco-h);
  margin: 0 auto;
}
.desc {
  width: 100%;
  background: url('${caixaUrl}') no-repeat center;
  background-size: cover;
  display: block;
  padding: 1mm 2mm;
  height: var(--etq-desc-h);
  font-size: var(--etq-desc-font);
  line-height: 1.05;
  color: #000;
  margin: 0 auto;
  text-transform: uppercase;
  overflow: hidden;
  white-space: normal;
  word-break: break-word;
}
.cod {
  width: 100%;
  background: url('${caixaUrl}') no-repeat center;
  background-size: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--etq-cod-h);
  font-size: var(--etq-cod-font);
  color: #000;
  margin: 0 auto;
  font-weight: 700;
}
/* Layout alternativo: Papel & Arte */
        .pa-etiqueta {
          width: 300px;
          background: #d0d0d0;
          box-sizing: border-box;
          display: flex;
        }
        .pa-col-esq {
          width: 65%;
          display: flex;
          flex-direction: column;
        }
        .pa-preco-area {
          height: 80px;
          background: #000;
          color: #fff;
          font-family: ui-monospace, Consolas, monospace;
          font-size: 75px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .pa-descricao-area {
          height: 50px;
          background-image: url('${caixaUrl}');
          background-size: 100% 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 14px;
          font-weight: bold;
          padding: 0 6px;
          box-sizing: border-box;
          text-align: center;
        }
        .pa-col-dir {
          width: 35%;
          background: #ffffff;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .pa-col-dir img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
@media print {
          body {
            margin: 0;
          }
        }
      </style>
    </head>
    <body>
      <div id="etiquetas">
        ${etiquetasHtml}
      </div>
    </body>
    </html>
  `;
}
function abrirJanelaImpressaoEtiquetasPDV() {
  try {
    const { produtos, etiquetas } = coletarEtiquetasPDV();
    if (!produtos.length || !etiquetas.length) {
      alert("Nenhum item encontrado no PDV para gerar etiquetas.");
      return;
    }

    const html = gerarHtmlImpressaoEtiquetas(etiquetas);
    const w = window.open("", "_blank", "width=900,height=600");

    if (!w) {
      alert("Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está desativado.");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();

    setTimeout(() => {
      try {
        w.print();
      } catch (printErr) {
        console.warn("[SIGE Assistente] Erro ao imprimir etiquetas:", printErr);
      }
    }, 600);
  } catch (e) {
    console.error("[SIGE Assistente] Erro ao preparar impressão de etiquetas:", e);
    alert("Ocorreu um erro ao gerar as etiquetas. Veja o console para mais detalhes.");
  }
}

// Insere um aviso visual no topo do PDV quando ele está em modo "Gerador de Etiquetas".
function injectPDVEtiquetasBanner() {
  try {
    if (!isPDVModoEtiquetas()) return;
    if (document.getElementById("sige-etq-banner")) return;

    const mainTop = document.getElementById("mainTop");
    if (!mainTop) return;

    const banner = document.createElement("div");
    banner.id = "sige-etq-banner";
    banner.textContent = "GERADOR DE ETIQUETAS ATIVO – leia os produtos normalmente no PDV e acompanhe as etiquetas no painel lateral (aba Etiquetas).";
    banner.style.background = "#facc15";
    banner.style.color = "#111827";
    banner.style.fontSize = "12px";
    banner.style.fontWeight = "600";
    banner.style.padding = "6px 10px";
    banner.style.marginTop = "4px";
    banner.style.borderRadius = "4px";
    banner.style.boxShadow = "0 1px 2px rgba(15,23,42,.25)";
    banner.style.textAlign = "center";

    mainTop.insertAdjacentElement("afterend", banner);
  } catch (e) {
    console.warn("[SIGE Assistente] Erro ao inserir banner de etiquetas no PDV:", e);
  }
}

// 13. MENU LATERAL / BOTÃO FLUTUANTE DO ASSISTENTE
// =============================================================


// =============================================================
// 13-A. ORÇAMENTO /Vendas/Edit → CAPTURA ANGULAR + HTML PDF
// =============================================================

function montarDadosOrcamento(payload) {
  const venda = (payload && payload.venda) || {};
  const produtos = (payload && payload.produtos) || [];
  const resumo = (payload && payload.resumo_pdf) || {};

  function g(keys, defaultVal) {
    defaultVal = defaultVal === undefined ? "" : defaultVal;
    for (const k of keys) {
      if (venda && Object.prototype.hasOwnProperty.call(venda, k)) {
        const v = venda[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          return v;
        }
      }
    }
    return defaultVal;
  }

  const dados = {};

  dados.empresa_quadro =
    payload.empresa_quadro ||
    resumo.empresa_quadro ||
    venda.Empresa ||
    "";

  dados.numero =
    resumo.orcamento_numero ||
    g(["Codigo", "CodigoPedidoCliente"], "");

  dados.emissao =
    resumo.emissao ||
    g(["Data"], "");

  dados.vendedor =
    resumo.vendedor ||
    g(["FaturadoPor", "Vendedor"], "");

  const cliente = {
    nome: resumo.cliente_nome || g(["Cliente"], ""),
    cnpj: resumo.cliente_cnpj || g(["CNPJ", "CpfCnpj"], ""),
    endereco: resumo.cliente_endereco || g(["EnderecoCompleto"], ""),
    email: resumo.cliente_email || g(["Email", "EmailCliente"], ""),
    telefone: resumo.cliente_telefone || g(["Telefone", "TelefoneCliente"], "")
  };

  dados.cliente = cliente;

  dados.itens = produtos.map((item) => {
    item = item || {};
    return {
      codigo:
        item.CodigoItem ||
        item.CodigoProduto ||
        item.Codigo ||
        "",
      descricao: item.Descricao || "",
      marca: item.Marca || "",
      unidade: item.Unidade || item.UnidadeMedida || "",
      quantidade: item.Quantidade || 0,
      preco_unit: item.ValorUnitario || 0,
      desconto_unit: item.DescontoUnitario || 0,
      preco_unit_final:
        item.ValorUnitarioLiquido ||
        item.ValorUnitarioComDesconto ||
        item.ValorUnitario ||
        0,
      total: item.ValorTotal || 0
    };
  });

  dados.totais = {
    produtos:
      resumo.total_produtos ||
      g(["SubTotalProdutos"], 0),
    descontos:
      resumo.descontos ||
      g(["DescontoDinheiro", "DescontoValor"], 0),
    frete:
      resumo.frete ||
      g(["ValorFrete"], 0),
    geral:
      resumo.total_geral ||
      g(["ValorTotalNota", "TotalGeral"], 0)
  };

  dados.entrega_prevista =
    resumo.entrega_prevista ||
    g(["DataPrevisaoEntrega"], "");
  dados.tipo_frete =
    resumo.tipo_frete ||
    g(["TipoFrete"], "");
  dados.forma_pagamento =
    resumo.forma_pagamento ||
    g(["FormadePagamento", "CondicaoPagamento"], "");
  dados.validade =
    resumo.validade ||
    g(["Validade", "DataValidadeOrcamento"], "");
  dados.observacoes =
    resumo.observacoes ||
    g(["Observacoes", "Observacao"], "");

  return dados;
}

function buildOrcamentoHtml(d) {
  const empresa_nome  = "ENFOQUE ARTES LTDA";
  const empresa_cnpj  = "21.463.846/0001-38";
  const empresa_ie    = "86.828.626";
  const empresa_end1  = "RUA DA CONCEIÇÃO 99 – LOJA 101";
  const empresa_end2  = "CENTRO, R. Maestro Felício Tolêdo, 551 – NITERÓI – RJ";
  const empresa_cep   = "CEP: 24020-087";
  const empresa_tel   = "(21) 2729-1632 / 1636 / 1643";
  const empresa_email = "comercial@enfoquepapelaria.com.br";

  const cliente = (d && d.cliente) || {};
  const cliente_nome   = cliente.nome || cliente.Cliente || "";
  const cliente_cnpj   = cliente.cnpj || cliente.CNPJ || "";
  const cliente_end    = cliente.endereco || cliente.Endereco || "";
  const cliente_email  = cliente.email || cliente.Email || "";
  const cliente_tel    = cliente.telefone || cliente.Telefone || "";

  const nome_quadro = (d.empresa_quadro || d.empresa_nome_quadro || "").trim();
  const base_nome   = nome_quadro || cliente_nome || empresa_nome;
  const upper_nome  = (base_nome || "").toUpperCase();
  const is_papel_arte = upper_nome.includes("PAPEL") && upper_nome.includes("ARTE");

  const logoFoqUrl   = chrome.runtime.getURL("foq.png");
  const logoPapelUrl = chrome.runtime.getURL("loga.png");
  const logoSrc = is_papel_arte ? logoPapelUrl : logoFoqUrl;

  let logo_html = "";
  if (logoSrc) {
    logo_html = "<img src='" + logoSrc + "' alt='Logo' " +
      "style='max-height:90px; max-width:100%; display:block; margin:0 auto 4px auto;'>";
  }

  let brand_block_html = "";
  if (is_papel_arte) {
    brand_block_html = `
      <div style="font-weight:bold; font-size:20px; line-height:1.0;">PAPEL</div>
      <div style="font-weight:bold; font-size:20px; line-height:1.0;">&amp; ARTE</div>
      <div style="font-size:9px; margin-top:2px;">
        Papelaria • Arte • Arquitetura
      </div>
    `;
  }

  function money(v) {
    try {
      if (typeof v === "string") {
        let s = v.trim();
        if (s.indexOf(",") !== -1 && (s.match(/,/g) || []).length === 1) {
          s = s.replace(/\./g, "").replace(",", ".");
        }
        v = parseFloat(s);
      }
      const num = Number(v) || 0;
      return num.toFixed(2).replace(".", ",");
    } catch (e) {
      return "0,00";
    }
  }

  let itens_rows = "";
  (d.itens || []).forEach((it) => {
    it = it || {};
    const codigo  = it.codigo || it.CodigoItem || it.CodigoProduto || it.Codigo || "";
    const desc    = it.descricao || it.Descricao || it.Produto || "";
    const marca   = it.marca || it.Marca || "";
    const un      = it.unidade || it.Unidade || it.UN || "";
    const qtd     = it.quantidade || it.Quantidade || it.qtd || "";
    const pu      = it.preco_unit || it.ValorUnitario || it.PrecoUnitario || 0;
    const du      = it.desconto_unit || it.DescontoUnitario || 0;
    const pufinal = it.preco_unit_final || it.ValorUnitarioLiquido || pu;
    const total   = it.total || it.ValorTotal || 0;

    itens_rows += `
      <tr>
        <td class="col-cod">${codigo}</td>
        <td class="col-desc">${desc}</td>
        <td class="col-marca">${marca}</td>
        <td class="col-un">${un}</td>
        <td class="col-qtd">${qtd}</td>
        <td class="col-money">R$ ${money(pu)}</td>
        <td class="col-money">R$ ${money(du)}</td>
        <td class="col-money">R$ ${money(pufinal)}</td>
        <td class="col-money">R$ ${money(total)}</td>
      </tr>
    `;
  });

  const totais = d.totais || {};
  const numero   = d.numero || "";
  const emissao  = d.emissao || "";
  const vendedor = d.vendedor || "";

  const entrega_prevista = d.entrega_prevista || "";
  const tipo_frete       = d.tipo_frete || "Do Emitente";
  const forma_pagamento  = d.forma_pagamento || "";
  const validade         = d.validade || "";
  const obs_livres       = d.observacoes || "";

  const total_prod  = money(totais.produtos || totais.SubTotalProdutos || 0);
  const total_desc  = money(totais.descontos || totais.Desconto || 0);
  const total_fret  = money(totais.frete || totais.ValorFrete || 0);
  const total_geral = money(totais.geral || totais.ValorTotalNota || 0);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Orçamento ${numero}</title>
<style>
  @page {
    size: A4;
    margin: 15mm;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    margin: 0;
  }
  .wrapper {
    max-width: 190mm;
    margin: 0 auto;
  }
  h1.title {
    text-align: center;
    font-size: 22px;
    margin: 4mm 0 6mm 0;
    font-weight: bold;
  }
  h2.section {
    text-align: center;
    font-size: 12px;
    margin: 6mm 0 2mm 0;
    font-weight: bold;
  }

  .header-row {
    width: 100%;
    display: table;
    margin-bottom: 6mm;
  }
  .header-cell {
    display: table-cell;
    vertical-align: top;
  }
  .header-logo {
    width: 35%;
    text-align: center;
  }
  .header-empresa {
    width: 35%;
    text-align: center;
  }
  .header-quadro {
    width: 30%;
    text-align: right;
  }

  .empresa-nome {
    font-weight: bold;
    margin-bottom: 2px;
  }
  .empresa-linha {
    margin: 1px 0;
  }
  .empresa-label {
    font-weight: bold;
  }

  table.quadro-orc {
    border-collapse: collapse;
    width: 100%;
    font-size: 9px;
  }
  table.quadro-orc td {
    border: 1px solid #000;
    padding: 2px 4px;
  }
  table.quadro-orc td.label {
    width: 45%;
  }
  table.quadro-orc td.valor {
    width: 55%;
    font-weight: bold;
  }

  table.tbl {
    border-collapse: collapse;
    width: 100%;
    font-size: 9px;
  }
  table.tbl td, table.tbl th {
    border: 1px solid #000;
    padding: 3px 4px;
    vertical-align: middle;
  }
  td.rotulo {
    background: #e6e6e6;
    font-weight: bold;
    white-space: nowrap;
    width: 22%;
  }

  table.itens {
    border-collapse: collapse;
    width: 100%;
    font-size: 9px;
  }
  table.itens th, table.itens td {
    border: 1px solid #000;
    padding: 3px 3px;
    vertical-align: middle;
  }
  table.itens th {
    background: #e6e6e6;
    font-weight: bold;
    text-align: center;
  }
  .col-cod  { width: 13%; text-align:left; }
  .col-desc { width: 33%; text-align:left; }
  .col-marca{ width: 10%; text-align:center; }
  .col-un   { width: 5%;  text-align:center; }
  .col-qtd  { width: 6%;  text-align:center; }
  .col-money{ width: 9%;  text-align:right; }

  .totais-box {
    width: 45%;
    margin-left: auto;
    margin-top: 3mm;
  }
  .totais-box table {
    border-collapse: collapse;
    width: 100%;
    font-size: 9px;
  }
  .totais-box td {
    border: 1px solid #000;
    padding: 3px 4px;
  }
  .tot-label {
    width: 60%;
    font-weight: bold;
  }
  .tot-valor {
    width: 40%;
    text-align: right;
  }
  .tot-geral {
    font-weight: bold;
  }

  .termos-title {
    margin-top: 4mm;
    font-weight: bold;
  }
  .termos-text {
    margin-top: 1mm;
  }

  .rodape-empresa {
    margin-top: 6mm;
    font-size: 9px;
  }
  .rodape-empresa .label {
    font-weight: bold;
  }

  .pagebreak {
    page-break-before: always;
  }
</style>
</head>
<body>
<div class="wrapper">

  <h1 class="title">ORÇAMENTO</h1>

  <div class="header-row">
    <div class="header-cell header-logo">
      ${logo_html}
      ${brand_block_html}
    </div>

    <div class="header-cell header-empresa">
      <div class="empresa-nome">${empresa_nome}</div>
      <div class="empresa-linha">CNPJ: ${empresa_cnpj}</div>
      <div class="empresa-linha">IE: ${empresa_ie}</div>
      <div class="empresa-linha">${empresa_end1}</div>
      <div class="empresa-linha">${empresa_end2}</div>
      <div class="empresa-linha">${empresa_cep}</div>
      <div class="empresa-linha empresa-label">Telefone:</div>
      <div class="empresa-linha">${empresa_tel}</div>
      <div class="empresa-linha empresa-label">Email:</div>
      <div class="empresa-linha">${empresa_email}</div>
    </div>

    <div class="header-cell header-quadro">
      <table class="quadro-orc">
        <tr>
          <td class="label">Orçamento:</td>
          <td class="valor">${numero}</td>
        </tr>
        <tr>
          <td class="label">Emissão:</td>
          <td class="valor">${emissao}</td>
        </tr>
        <tr>
          <td class="label">Vendedor:</td>
          <td class="valor">${vendedor}</td>
        </tr>
      </table>
    </div>
  </div>

  <h2 class="section">INFORMAÇÕES DO CLIENTE</h2>

  <table class="tbl">
    <tr>
      <td class="rotulo">Cliente:</td>
      <td>${cliente_nome}</td>
    </tr>
    <tr>
      <td class="rotulo">CNPJ:</td>
      <td>${cliente_cnpj}</td>
    </tr>
    <tr>
      <td class="rotulo">Endereço:</td>
      <td>${cliente_end}</td>
    </tr>
    <tr>
      <td class="rotulo">Email:</td>
      <td>${cliente_email}</td>
    </tr>
    <tr>
      <td class="rotulo">Telefone:</td>
      <td>${cliente_tel}</td>
    </tr>
  </table>

  <h2 class="section">ITENS</h2>

  <table class="itens">
    <thead>
      <tr>
        <th>Código</th>
        <th>Descrição</th>
        <th>Marca</th>
        <th>UN</th>
        <th>Qtd.</th>
        <th>Preço Unit<br>R$</th>
        <th>Desconto Unit<br>R$</th>
        <th>Preço Unit Final<br>R$</th>
        <th>Total R$</th>
      </tr>
    </thead>
    <tbody>
      ${itens_rows}
    </tbody>
  </table>

  <div class="totais-box">
    <table>
      <tr>
        <td class="tot-label">Total dos Produtos:</td>
        <td class="tot-valor">R$ ${total_prod}</td>
      </tr>
      <tr>
        <td class="tot-label">Descontos:</td>
        <td class="tot-valor">R$ ${total_desc}</td>
      </tr>
      <tr>
        <td class="tot-label">Frete:</td>
        <td class="tot-valor">R$ ${total_fret}</td>
      </tr>
      <tr>
        <td class="tot-label tot-geral">Total Geral</td>
        <td class="tot-valor tot-geral">R$ ${total_geral}</td>
      </tr>
    </table>
  </div>

  <h2 class="section">INFORMAÇÕES ADICIONAIS</h2>

  <table class="tbl">
    <tr>
      <td class="rotulo">Entrega prevista até:</td>
      <td>${entrega_prevista}</td>
    </tr>
    <tr>
      <td class="rotulo">Tipo de frete:</td>
      <td>${tipo_frete}</td>
    </tr>
    <tr>
      <td class="rotulo">Forma de Pagamento:</td>
      <td>${forma_pagamento}</td>
    </tr>
    <tr>
      <td class="rotulo">Orçamento válido até:</td>
      <td>${validade}</td>
    </tr>
  </table>

  <div class="termos-title">Termos e Condições de Vendas:</div>
  <div class="termos-text">
    Produtos sujeitos a disponibilidade de estoque no ato da compra.<br>
    O prazo de entrega é uma previsão, podendo variar para mais ou para menos.
  </div>

  <div class="rodape-empresa">
    <div>${empresa_nome}</div>
    <div>CNPJ: ${empresa_cnpj}</div>
    <div>IE: ${empresa_ie}</div>
    <div>${empresa_end1}</div>
    <div>${empresa_end2}</div>
    <div>${empresa_cep}</div>
    <div class="label">Telefone:</div>
    <div>${empresa_tel}</div>
    <div class="label">Email:</div>
    <div>${empresa_email}</div>
  </div>

</div>

<div class="wrapper pagebreak">
  <div style="margin-top:5mm; font-size:10px;">
    Cliente ciente que os preços podem sofrer alterações para mais ou para menos no ato da compra sem aviso prévio.<br>
    Sujeito a análise de crédito para Compras Faturadas.
  </div>

  <div style="margin-top:6mm; font-size:10px;">
    <span style="font-weight:bold;">Observações:</span><br>
    ${obs_livres ? obs_livres : "FINAL PÁGINA"}
  </div>
</div>

</body>
</html>
`;
  return html;
}

function captureOrcamentoAndOpenPdf() {
  const statusEl = document.getElementById("sige-orcamento-status");
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "#fca5a5" : "#9ca3af";
  };

  try {
    if (!window.angular) {
      setStatus("Angular não encontrado na página. Abra a tela /Vendas/Edit.", true);
      return;
    }

    const el = document.querySelector("[ng-controller='Vendas']");
    if (!el) {
      setStatus("Tela de vendas não encontrada. Use esta função na tela /Vendas/Edit.", true);
      return;
    }

    const scope = window.angular.element(el).scope();
    if (!scope || !scope.dados || !scope.dados.Venda) {
      setStatus("Não consegui acessar os dados do orçamento na tela atual.", true);
      return;
    }

    const venda = scope.dados.Venda || {};
    const produtos = scope.dados.Produtos || [];

    const s = (v) => (v === undefined || v === null ? "" : v);

    const payload = {
      kind: "angular_venda",
      url: window.location.href,
      saved_at: new Date().toISOString(),
      empresa_quadro: s(venda.Empresa) || "",
      venda: venda,
      produtos: produtos,
      resumo_pdf: {
        orcamento_numero: s(venda.Codigo) || s(venda.CodigoPedidoCliente) || "",
        emissao:          s(venda.Data) || "",
        vendedor:         s(venda.FaturadoPor) || s(venda.Vendedor) || "",
        cliente_nome:     s(venda.Cliente) || "",
        cliente_cnpj:     s(venda.CNPJ) || s(venda.CpfCnpj) || "",
        cliente_endereco: s(venda.EnderecoCompleto) || "",
        cliente_email:    s(venda.Email) || s(venda.EmailCliente) || "",
        cliente_telefone: s(venda.Telefone) || s(venda.TelefoneCliente) || "",
        total_produtos:   s(venda.SubTotalProdutos),
        descontos:        s(venda.DescontoDinheiro) || s(venda.DescontoValor),
        frete:            s(venda.ValorFrete),
        total_geral:      s(venda.ValorTotalNota) || s(venda.TotalGeral),
        entrega_prevista: s(venda.DataPrevisaoEntrega) || "",
        tipo_frete:       s(venda.TipoFrete) || "",
        forma_pagamento:  s(venda.FormadePagamento) || s(venda.CondicaoPagamento) || "",
        validade:         s(venda.Validade) || s(venda.DataValidadeOrcamento) || "",
        observacoes:      s(venda.Observacoes) || s(venda.Observacao) || ""
      }
    };

    setStatus("Gerando HTML do orçamento...", false);

    const dados = montarDadosOrcamento(payload);
    const html = buildOrcamentoHtml(dados);

    chrome.storage.local.set({ "orcamento_backup": payload }, () => {});

    const win = window.open("", "_blank");
    if (!win) {
      setStatus("Popup bloqueado pelo navegador. Autorize pop-ups para este site.", true);
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.error(e);
      }
    }, 800);

    setStatus("Orçamento aberto em nova aba. Use Imprimir → Salvar como PDF.", false);
  } catch (e) {
    console.error("Erro ao gerar PDF do orçamento:", e);
    setStatus("Erro ao gerar PDF do orçamento: " + e.message, true);
  }
}

function injectAssistenteFloatingPanel() {
  if (window.__assistentePanelInjected) return;
  try {

  // Botão flutuante
  const btn = document.createElement("div");
  btn.id = "sige-assistente-toggle";
  btn.style = `
    position:fixed;
    bottom:20px;
    right:20px;
    width:56px;
    height:56px;
    border-radius:50%;
    background:#0ea5e9;
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:26px;
    cursor:pointer;
    z-index:9999999;
    box-shadow:0 4px 10px rgba(0,0,0,0.25);
  `;
  btn.title = "Assistente SIGE";

  btn.innerText = "Σ";

// Badge de notificações (Observações)
const __enfoqueObsBadge = document.createElement("div");
__enfoqueObsBadge.id = "enfoque-obs-badge";
__enfoqueObsBadge.style = `
  position:absolute;
  top:-6px;
  right:-6px;
  min-width:18px;
  height:18px;
  padding:0 5px;
  display:none;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  font-size:11px;
  font-weight:800;
  background:#ef4444;
  color:white;
  box-shadow:0 2px 8px rgba(0,0,0,.25);
  line-height:18px;
`;
__enfoqueObsBadge.textContent = "";
btn.appendChild(__enfoqueObsBadge);


  // Painel lateral
  const panel = document.createElement("div");
  panel.id = "sige-assistente-panel";
  panel.style = `
    position:fixed;
    top:0;
    right:0;
    width:440px;
    height:100%;
    background:transparent;
    color:#e5e7eb;
    transform:translateX(100%);
    transition:transform .25s ease-out;
    z-index:9999998;
    box-shadow:0 0 20px rgba(0,0,0,.6);
    display:flex;
    flex-direction:column;
    font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  `;

  panel.innerHTML = `
<style id="sige-assistente-minimal-ui-style">
/* ===== Scoped Minimal UI (Enfoque) ===== */
.sige-ui{
  --bg: #061a33;
  --panel: rgba(255,255,255,.06);
  --panel-2: rgba(255,255,255,.04);
  --stroke: rgba(255,255,255,.10);
  --stroke-2: rgba(255,255,255,.06);
  --text: rgba(255,255,255,.92);
  --muted: rgba(255,255,255,.62);

  --accent: #0ea5e9;
  --accent-2: #22c55e;
  --warn: #f59e0b;
  --danger: #ef4444;

  --shadow: 0 18px 50px rgba(0,0,0,.55);
  --radius-lg: 18px;
  --radius-md: 14px;
  --radius-sm: 12px;

  --ease: cubic-bezier(.2,.8,.2,1);
  color-scheme: dark;
  height:100%;
  width:100%;
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  background:
    radial-gradient(900px 420px at 20% 0%, rgba(14,165,233,.18), transparent 60%),
    radial-gradient(900px 420px at 80% 20%, rgba(34,197,94,.12), transparent 60%),
    var(--bg);
}
/* fixed theme: ignoring prefers-color-scheme light */


.sige-ui *{ box-sizing: border-box; }
.sige-ui code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.sige-ui .app{
  width:100%;
  height:100%;
  border-radius: 0;
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow);
  border-left: 1px solid var(--stroke-2);
  background:
    linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
  backdrop-filter: blur(14px);
}

.sige-ui .topGlow{
  position:absolute; inset:-120px -120px auto -120px;
  height: 220px;
  background: radial-gradient(closest-side, rgba(14,165,233,.24), transparent 70%);
  pointer-events:none;
  filter: blur(2px);
}

.sige-ui .layout{ display:flex; height:100%; }

.sige-ui .sidebar{
  width: 74px;
  padding: 14px 10px;
  border-right: 1px solid var(--stroke-2);
  background: rgba(20,14,53,.88);
  backdrop-filter: blur(14px);
  display:flex;
  flex-direction: column;
  gap: 10px;
}

.sige-ui .brand{
  height: 44px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius: 14px;
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.06);
  margin-bottom: 6px;
  position: relative;
  overflow:hidden;
}
.sige-ui .brand::after{
  content:"";
  position:absolute; inset:-60%;
  background: radial-gradient(circle at 30% 20%, rgba(14,165,233,.35), transparent 55%);
  transform: rotate(18deg);
}
.sige-ui .brand svg{ position: relative; z-index: 1; opacity: .95; }

.sige-ui .navBtn{
  height: 44px;
  width: 44px;
  margin: 0 auto;
  border-radius: 14px;
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.05);
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  transition: transform .18s var(--ease), background .18s var(--ease), border-color .18s var(--ease);
  position: relative;
}
.sige-ui .navBtn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.08); border-color: var(--stroke); }
.sige-ui .navBtn:active{ transform: translateY(0px) scale(.98); }
.sige-ui .navBtn.active{
  background: rgba(14,165,233,.18);
  border-color: rgba(14,165,233,.35);
  box-shadow: 0 10px 20px rgba(14,165,233,.10);
}
.sige-ui .navBtn svg{ opacity: .92; }

.sige-ui .spacer{ flex:1; }

.sige-ui .miniStatus{
  width: 44px;
  margin: 0 auto;
  border-radius: 14px;
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.04);
  padding: 10px 0;
  display:flex;
  flex-direction: column;
  align-items:center;
  gap: 6px;
}

.sige-ui .dot{
  width: 10px; height: 10px; border-radius: 99px;
  background: var(--accent-2);
  box-shadow: 0 0 0 4px rgba(34,197,94,.15);
}
.sige-ui .dot.warn{ background: var(--warn); box-shadow: 0 0 0 4px rgba(245,158,11,.15); }
.sige-ui .dot.bad{ background: var(--danger); box-shadow: 0 0 0 4px rgba(239,68,68,.15); }

.sige-ui .main{
  flex: 1;
  padding: 16px;
  display:flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.sige-ui .header{
  border-radius: var(--radius-lg);
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.06);
  padding: 14px 14px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 12px;
}

.sige-ui .headerLeft{
  display:flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.sige-ui .title{
  font-weight: 700;
  letter-spacing: .2px;
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sige-ui .subtitle{
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sige-ui .chip{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(34,197,94,.28);
  background: rgba(34,197,94,.12);
  color: rgba(236,253,245,.95);
  font-size: 11px;
  user-select:none;
  white-space: nowrap;
}
/* fixed theme: ignoring prefers-color-scheme light */

.sige-ui .chipDot{
  display:inline-flex;width:8px;height:8px;border-radius:99px;
  background: var(--accent-2);
  box-shadow:0 0 0 4px rgba(34,197,94,.14);
}

.sige-ui .page{
  flex: 1;
  border-radius: var(--radius-lg);
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.04);
  overflow: hidden;
  position: relative;
}
.sige-ui .pageInner{
  position:absolute;
  inset: 0;
  padding: 12px;
  overflow:auto;
  animation: pageIn .22s var(--ease) both;
}
@keyframes pageIn{
  from{ opacity: 0; transform: translateY(6px); }
  to{ opacity: 1; transform: translateY(0); }
}

.sige-ui .footer{
  border-radius: var(--radius-lg);
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.03);
  padding: 10px 12px;
  font-size: 10px;
  color: var(--muted);
  display:flex;
  justify-content: space-between;
  align-items:center;
  gap: 10px;
}

.sige-ui .btn{
  height: 28px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid var(--stroke-2);
  background: rgba(255,255,255,.05);
  color: var(--text);
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap: 8px;
  font-size: 11px;
  transition: transform .18s var(--ease), background .18s var(--ease), border-color .18s var(--ease);
  user-select:none;
}
.sige-ui .btn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.08); border-color: var(--stroke); }
.sige-ui .btn:active{ transform: translateY(0) scale(.98); }
.sige-ui .btn.primary{ background: rgba(14,165,233,.20); border-color: rgba(14,165,233,.35); }
.sige-ui .btn.success{ background: rgba(34,197,94,.16); border-color: rgba(34,197,94,.28); }
.sige-ui .btn.ghost{ background: transparent; }

/* Toast (optional) */
.sige-ui .toast{
  position:absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  border-radius: 16px;
  border: 1px solid var(--stroke-2);
  background: rgba(2,6,23,.55);
  backdrop-filter: blur(14px);
  padding: 12px 12px;
  box-shadow: 0 18px 40px rgba(0,0,0,.35);
  display:none;
  gap: 10px;
  align-items:flex-start;
  animation: toastIn .22s var(--ease) both;
}
@keyframes toastIn{
  from{ opacity: 0; transform: translateY(10px); }
  to{ opacity: 1; transform: translateY(0); }
}
.sige-ui .toast.show{ display:flex; }
.sige-ui .toastDot{ width:10px;height:10px;border-radius:99px;background:var(--accent);margin-top:4px;box-shadow:0 0 0 4px rgba(14,165,233,.15); }
.sige-ui .toast strong{ font-size: 11px; }
.sige-ui .toast p{ margin: 4px 0 0 0; font-size: 10px; color: var(--muted); line-height: 1.35; }
.sige-ui .toastActions{ margin-left:auto; display:flex; gap: 8px; }

@media (prefers-reduced-motion: reduce){
  .sige-ui *{ transition: none !important; animation: none !important; }
}
</style>
<div class="sige-ui">
  <div class="app" role="application" aria-label="Assistente SIGE">
    <div class="topGlow"></div>

    <div class="layout">
      <aside class="sidebar" aria-label="Navegação">
        <div class="brand" title="Enfoque / SIGE">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4z" stroke="currentColor" opacity=".85"/>
            <path d="M8 12h8" stroke="currentColor" opacity=".85"/>
            <path d="M10 9h4" stroke="currentColor" opacity=".85"/>
          </svg>
        </div>
<button class="navBtn" data-section="etiquetas" title="Etiquetas" aria-label="Etiquetas">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h8" stroke="currentColor"/>
            <path d="M16 2h6v6" stroke="currentColor"/>
            <path d="M21 3l-9 9" stroke="currentColor"/>
          </svg>
        </button>

        <button class="navBtn" data-section="cartao" title="Gerador de Cartão" aria-label="Gerador de Cartão">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7z" stroke="currentColor"/>
            <path d="M8 15c1.1-1.6 2.6-2.5 4-2.5s2.9.9 4 2.5" stroke="currentColor" opacity=".85"/>
            <path d="M9 10h6" stroke="currentColor" opacity=".85"/>
          </svg>
        </button>

        </button>

        <button class="navBtn" data-section="defeituosos" title="Defeituosos" aria-label="Defeituosos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 2h9l3 3v17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor"/>
            <path d="M15 2v4h4" stroke="currentColor" opacity=".8"/>
            <path d="M8 11h8" stroke="currentColor" opacity=".85"/>
            <path d="M8 15h8" stroke="currentColor" opacity=".85"/>
            <path d="M8 19h5" stroke="currentColor" opacity=".85"/>
          </svg>
        </button>
<button class="navBtn active" data-section="observacoes" title="Observações" aria-label="Observações">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 3h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-4 3V5a2 2 0 0 1 2-2z" stroke="currentColor"/>
            <path d="M9 8h8" stroke="currentColor" opacity=".8"/>
            <path d="M9 12h8" stroke="currentColor" opacity=".8"/>
            <path d="M9 16h5" stroke="currentColor" opacity=".8"/>
          </svg>
        </button>



<button class="navBtn" data-section="caixaconf" title="Conferência Caixa" aria-label="Conferência Caixa">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor"/>
    <path d="M7 9h10" stroke="currentColor" opacity=".85"/>
    <path d="M7 13h4" stroke="currentColor" opacity=".85"/>
    <path d="M15 13h2" stroke="currentColor" opacity=".85"/>
    <path d="M7 17h10" stroke="currentColor" opacity=".6"/>
  </svg>
</button>

<button class="navBtn" data-section="pedidos" title="Pedidos" aria-label="Pedidos">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 3h12a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2z" stroke="currentColor"/>
    <path d="M8 8h8" stroke="currentColor" opacity=".85"/>
    <path d="M8 12h8" stroke="currentColor" opacity=".85"/>
    <path d="M8 16h5" stroke="currentColor" opacity=".85"/>
  </svg>
</button>

<button class="navBtn" data-section="config" title="Configurações" aria-label="Configurações">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="currentColor"/>
    <path d="M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a8 8 0 0 0-1.7-1l-.3-2.4H10.8l-.3 2.4a8 8 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 .1 2l-2 1.2 2 3.4 2.3-.7a8 8 0 0 0 1.7 1l.3 2.4h4.4l.3-2.4a8 8 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2z" stroke="currentColor" opacity=".85"/>
  </svg>
</button>

<button class="navBtn" data-section="sobre" title="Sobre" aria-label="Sobre">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 17v-6" stroke="currentColor"/>
            <path d="M12 8h.01" stroke="currentColor"/>
            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor"/>
          </svg>
        </button>

        <div class="spacer"></div>

        <div class="miniStatus" title="Status">
          <div class="dot" id="sige-miniDot"></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="opacity:.75">
            <path d="M12 8v4l2 2" stroke="currentColor"/>
            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor"/>
          </svg>
        </div>
      </aside>

      <main class="main">
        <header class="header">
          <div class="headerLeft">
            <div class="title">SIGE Assistente</div>
            <div class="subtitle" id="sige-subtitle-top">Ferramentas rápidas</div>
          </div>

          <div class="chip" id="sige-chip">
            <span class="chipDot" id="sige-chip-dot"></span>
            <span id="sige-chipText">Ativo</span>
          </div>

          <button id="sige-assistente-close" class="btn ghost" title="Fechar" aria-label="Fechar">✕</button>
        </header>

        <section class="page" aria-live="polite">
          <div class="pageInner active" id="sige-assistente-content"></div>

          <div class="toast" id="sige-toast" role="status" aria-live="polite">
            <div class="toastDot"></div>
            <div>
              <strong id="sige-toast-title">Aviso</strong>
              <p id="sige-toast-msg">Mensagem</p>
            </div>
            <div class="toastActions">
              <button class="btn ghost" id="sige-toast-close">Fechar</button>
            </div>
          </div>
        </section>

        <footer class="footer">
          <span>Enfoque • UI minimal</span>
          <span id="sige-footHint">Use os ícones à esquerda</span>
        </footer>
      </main>
    </div>
  </div>
</div>
`;

  document.body.appendChild(panel);
  document.body.appendChild(btn);

  const content = panel.querySelector("#sige-assistente-content");
  const navItems = panel.querySelectorAll(".navBtn");
  const closeBtn = panel.querySelector("#sige-assistente-close");

  function openPanel() {
    panel.style.transform = "translateX(0)";
    renderSection("observacoes");
  }

  function closePanel() {
    panel.style.transform = "translateX(100%)";
  }

  const __ETQ_UI__ = `
<div style="margin-bottom:10px;padding:8px;border:1px solid rgba(148,163,184,.3);border-radius:6px;">
  <div style="font-weight:600;margin-bottom:6px;">Status de Etiquetas (API)</div>
  <div id="sige-etq-log" style="font-size:11px;color:#9ca3af;white-space:pre-line;">Aguardando token...</div>

  <div style="display:flex;gap:6px;margin-top:10px;">
    <input id="sige-etq-bearer" type="text" placeholder="Cole o Bearer aqui (1ª vez)" style="flex:1;padding:8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#e5e7eb;font-size:12px;" />
    <button id="sige-etq-save-bearer" style="padding:8px 10px;border-radius:6px;border:1px solid #374151;background:#10b981;color:#06281d;cursor:pointer;font-weight:700;">
      💾 Salvar
    </button>
  </div>

  <div style="display:flex;gap:6px;margin-top:6px;">
    <button id="sige-etq-btn-token" style="flex:1;padding:8px;border-radius:6px;border:1px solid rgba(148,163,184,.3);background:#0b1220;color:#e5e7eb;cursor:pointer;">
      🔑 Adquirir token
    </button>
  </div>
</div>
`;

  // =============================================================
  // CONVERSA (IA - Groq)  •  sempre sobre o produto selecionado
  // =============================================================
  const __enfoqueConversaState = {
    produto: null,
    lastAnswer: ""
  };

  function __enfoqueEscHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function __enfoqueFmtMoney(v) {
    const n = Number(v || 0);
    if (!isFinite(n) || n <= 0) return "";
    return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function __enfoqueConversaBuildSystemPrompt(productName) {
    const nome = String(productName || "").trim();
    return [
      "Você é o Assistente de Produtos da Enfoque Papelaria.",
      "Você só pode responder sobre produtos de papelaria e sobre o PRODUTO SELECIONADO abaixo.",
      `Produto selecionado (nome): \"${nome}\".`,
      "",
      "Interpretação:",
      "- O usuário pode fazer perguntas sem repetir o nome do produto; assuma que a pergunta se refere ao produto selecionado.",
      "- Se a pergunta for claramente sobre outro assunto (futebol, política, notícias, finanças, vida pessoal etc.), recuse.",
      "",
      "Limites:",
      "- Use conhecimento geral + o nome do produto. Não invente medidas/especificações que não estejam implícitas no nome.",
      "- Se não der para afirmar com segurança, diga que é provável e sugira conferir embalagem/ficha técnica.",
      "",
      "Se for fora do escopo, responda somente:",
      "Evite perguntar coisas fora do produto selecionado e de papelaria.",
      "",
      "Responda em pt-BR, direto. Quando útil, dê 1 dica prática e 1 cuidado/observação."
    ].join("\n");
  }

  function __enfoqueGroqChat(messages) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: "ENFOQUE_GROQ_CHAT",
          body: {
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            max_tokens: 420,
            messages
          }
        }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: "NO_RESPONSE" });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    });
  }

  function __enfoqueConversaRenderEtiqueta(prod) {
    if (!prod) return "";
    const nomeTxt = __enfoqueEscHtml(prod.nome || "PRODUTO");
    const precoTxt = __enfoqueEscHtml(__enfoqueFmtMoney(prod.precoNum));
    const codTxt = String(prod.codigo || "").trim();
    const last6 = codTxt.replace(/\D/g, "").slice(-6);
    const codShow = __enfoqueEscHtml(last6 || codTxt);

    return `
      <div style="transform: scaleY(.90); transform-origin: top; width: 100%;">
        <div class="etiqueta">
          <div class="etiqueta-logo"></div>
          <div class="etiqueta-preco"><span class="etiqueta-moeda">R$</span><span class="etiqueta-valor">${precoTxt || "&nbsp;"}</span></div>
          <div class="etiqueta-desc">${nomeTxt}</div>
          <div class="etiqueta-cod">${codShow || "&nbsp;"}</div>
        </div>
      </div>
    `;
  }


let __enfoqueCaixaWorkbook = null;
let __enfoqueCaixaFileName = "";

function __enfoqueCaixaMoneyToNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Number(v);
  const s = String(v).trim();
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function __enfoqueCaixaFmt(v) {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function __enfoqueCellValue(ws, ref) {
  const c = ws[ref];
  if (!c) return null;
  return c.v != null ? c.v : c.w;
}

function __enfoqueReadRange(ws, cols, rowStart, rowEnd, tipo) {
  const out = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    for (const col of cols) {
      const ref = `${col}${row}`;
      const raw = __enfoqueCellValue(ws, ref);
      const value = __enfoqueCaixaMoneyToNumber(raw);
      if (value == null) continue;
      out.push({ tipo, row, col, cell: ref, value });
    }
  }
  return out;
}

function __enfoqueCountValues(items) {
  const m = new Map();
  for (const item of items) {
    const key = Number(item.value).toFixed(2);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(item);
  }
  return m;
}

function __enfoqueParseDemonstrativoHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result = {
    vendas: [],
    fechamento: {},
    totais: { debito: 0, credito: 0, dinheiro: 0, pix_maquina: 0, pix_cnpj: 0, vale_troca: 0 }
  };

  const tables = Array.from(doc.querySelectorAll('table'));
  for (const table of tables) {
    const title = (table.querySelector('h3')?.textContent || '').trim().toLowerCase();
    if (title.includes('vendas realizadas no pdv')) {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        if (tds.length < 5) continue;
        const venda = { data: tds[0], forma: tds[1], numeroVenda: tds[2], nfce: tds[3], valor: __enfoqueCaixaMoneyToNumber(tds[4]) || 0 };
        result.vendas.push(venda);
      }
    }
    if (title.includes('saldos no fechamento do caixa')) {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        if (tds.length < 2) continue;
        result.fechamento[tds[0]] = __enfoqueCaixaMoneyToNumber(tds[1]) || 0;
      }
    }
  }

  for (const venda of result.vendas) {
    if (venda.forma === 'Cartão de Débito') result.totais.debito += venda.valor;
    if (venda.forma === 'Cartão de Crédito') result.totais.credito += venda.valor;
  }
  result.totais.dinheiro = result.fechamento['Dinheiro'] || 0;
  result.totais.pix_maquina = result.fechamento['Pix (Máquina)'] || 0;
  result.totais.pix_cnpj = result.fechamento['Pix (CNPJ)'] || 0;
  result.totais.vale_troca = result.fechamento['Vale Troca'] || result.fechamento['Vale'] || 0;
  return result;
}

function __enfoqueReadWorkbook() {
  if (!__enfoqueCaixaWorkbook) throw new Error('PLANILHA_NAO_CARREGADA');
  const ws = __enfoqueCaixaWorkbook.Sheets[__enfoqueCaixaWorkbook.SheetNames[0]];
  const debito = __enfoqueReadRange(ws, ['E','F','G','H'], 1, 39, 'debito');
  const credito = __enfoqueReadRange(ws, ['J','K','L','M'], 1, 39, 'credito');
  const abertura = __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C17')) || 0;
  const deposito_final = __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C21')) || 0;
  const falta = __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C23')) || 0;
  const sobra = __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C24')) || 0;
  return {
    debito,
    credito,
    totais: {
      debito: debito.reduce((s, x) => s + x.value, 0),
      credito: credito.reduce((s, x) => s + x.value, 0),
      dinheiro: __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C6')) || 0,
      vale_troca: __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C12')) || 0,
      pix_cnpj: __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C13')) || 0,
      pix_maquina: __enfoqueCaixaMoneyToNumber(__enfoqueCellValue(ws, 'C15')) || 0,
      abertura,
      deposito_final,
      falta,
      sobra,
    }
  };
}

function __enfoqueCompareCaixa(planilha, demo) {
  const issues = [];
  const expectedDeb = __enfoqueCountValues(demo.vendas.filter(v => v.forma === 'Cartão de Débito').map(v => ({ value: v.valor, origem: v })));
  const expectedCred = __enfoqueCountValues(demo.vendas.filter(v => v.forma === 'Cartão de Crédito').map(v => ({ value: v.valor, origem: v })));
  const actualDeb = __enfoqueCountValues(planilha.debito);
  const actualCred = __enfoqueCountValues(planilha.credito);

  function consume(actualMap, expectedMap, label) {
    for (const [key, list] of actualMap.entries()) {
      const exp = expectedMap.get(key) || [];
      if (list.length > exp.length) {
        list.slice(exp.length).forEach(item => {
          issues.push(`${label}: ${item.cell} tem ${__enfoqueCaixaFmt(item.value)} sem correspondência no SIGE.`);
        });
      }
    }
    for (const [key, list] of expectedMap.entries()) {
      const act = actualMap.get(key) || [];
      if (list.length > act.length) {
        const faltam = list.length - act.length;
        for (let i = 0; i < faltam; i++) {
          issues.push(`${label}: falta lançar ${__enfoqueCaixaFmt(Number(key))} na planilha.`);
        }
      }
    }
  }

  consume(actualDeb, expectedDeb, 'Débito');
  consume(actualCred, expectedCred, 'Crédito');

  const wrongInDeb = planilha.debito.filter(item => expectedDeb.has(item.value.toFixed(2)) === false && expectedCred.has(item.value.toFixed(2)) === true);
  wrongInDeb.forEach(item => issues.push(`Débito: ${item.cell} com ${__enfoqueCaixaFmt(item.value)} parece ser Crédito.`));

  const wrongInCred = planilha.credito.filter(item => expectedCred.has(item.value.toFixed(2)) === false && expectedDeb.has(item.value.toFixed(2)) === true);
  wrongInCred.forEach(item => issues.push(`Crédito: ${item.cell} com ${__enfoqueCaixaFmt(item.value)} parece ser Débito.`));

  const fixed = [
    ['Dinheiro','C6','dinheiro'],
    ['Vale Troca','C12','vale_troca'],
    ['Pix CNPJ','C13','pix_cnpj'],
    ['Pix Máquina','C15','pix_maquina'],
    ['Total Débito','E:H','debito'],
    ['Total Crédito','J:M','credito'],
  ];

  for (const [nome, cell, key] of fixed) {
    const atual = Number(planilha.totais[key] || 0);
    const correto = Number(demo.totais[key] || 0);
    if (atual.toFixed(2) !== correto.toFixed(2)) {
      issues.push(`${nome} (${cell}): planilha ${__enfoqueCaixaFmt(atual)} | correto ${__enfoqueCaixaFmt(correto)}.`);
    }
  }

  const diferencaCaixa = Number(demo.totais.dinheiro || 0) - Number(planilha.totais.abertura || 0) - Number(planilha.totais.deposito_final || 0);
  let saldoTipo = 'zerado';
  let saldoEsperado = 0;
  let saldoPlanilha = 0;
  let saldoCell = '-';

  if (diferencaCaixa < 0) {
    saldoTipo = 'sobra';
    saldoEsperado = Math.abs(diferencaCaixa);
    saldoPlanilha = Number(planilha.totais.sobra || 0);
    saldoCell = 'C24';
    if (saldoPlanilha.toFixed(2) !== saldoEsperado.toFixed(2)) {
      issues.push(`Sobra (C24): planilha ${__enfoqueCaixaFmt(saldoPlanilha)} | correto ${__enfoqueCaixaFmt(saldoEsperado)}.`);
    }
  } else if (diferencaCaixa > 0) {
    saldoTipo = 'falta';
    saldoEsperado = diferencaCaixa;
    saldoPlanilha = Number(planilha.totais.falta || 0);
    saldoCell = 'C23';
    if (saldoPlanilha.toFixed(2) !== saldoEsperado.toFixed(2)) {
      issues.push(`Falta (C23): planilha ${__enfoqueCaixaFmt(saldoPlanilha)} | correto ${__enfoqueCaixaFmt(saldoEsperado)}.`);
    }
  } else {
    if (Number(planilha.totais.falta || 0).toFixed(2) !== '0.00') {
      issues.push(`Falta (C23): planilha ${__enfoqueCaixaFmt(planilha.totais.falta)} | correto R$ 0,00.`);
    }
    if (Number(planilha.totais.sobra || 0).toFixed(2) !== '0.00') {
      issues.push(`Sobra (C24): planilha ${__enfoqueCaixaFmt(planilha.totais.sobra)} | correto R$ 0,00.`);
    }
  }

  return {
    issues,
    resumo: {
      saldoTipo,
      saldoEsperado,
      saldoPlanilha,
      saldoCell,
      diferencaCaixa,
    }
  };
}




  function renderSection(section) {
    navItems.forEach(n => {
      n.classList.toggle("active", n.dataset.section === section);
    });


    try {
      const subEl = panel.querySelector("#sige-subtitle-top");
      const meta = {
        alerta: "Alerta de quantidade • automático",
        backup: "Backup e restore • seguro",
                pdv: "PDV • maquininha / bridge",
deposito: "Depósito destino • atalho",
        etiquetas: "Etiquetas • PDV / Produtos",
        defeituosos: "Defeituosos • página (etq=2)",
        cartao: "Cartão • gerador e impressão",
        baterprod: "BaterProd • enviar código",
        conversa: "Conversa (IA) • Produto e dicas",
        observacoes: "Observações • Orçamento Escolar",
        pedidos: "Pedidos • Relatório de vendas",
        config: "Configurações • acesso",
        caixaconf: "Conferência de caixa • automação",
        sobre: "Sobre • informações"
      };
      if (subEl) subEl.textContent = meta[section] || "Ferramentas rápidas";
    } catch (e) {}


    if (section === "alerta") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">Alerta de quantidade</h3>
        <p style="margin:0 0 8px;line-height:1.4;">
          Sempre que a quantidade do item em edição passar de <b>50 unidades</b>,
          o assistente mostra uma faixa vermelha no topo avisando.
        </p>
        <p style="margin:0;line-height:1.4;font-size:12px;color:#9ca3af;">
          Isso já está ativo automaticamente na tela de
          <b>Movimentação entre depósitos (EDIT)</b>.
        </p>
      `;
    }

    if (section === "backup") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">Backup automático</h3>
        <p style="margin:0 0 8px;line-height:1.4;">
          O assistente salva automaticamente a movimentação (origem, destino,
          responsável, data e itens) enquanto você está na tela de edição.
        </p>
        <p style="margin:0 0 8px;line-height:1.4;font-size:12px;color:#9ca3af;">
          Ao voltar para a <b>LIST</b>, será oferecida a restauração
          automaticamente se houver backup.
        </p>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
          <button id="sige-btn-restore-all" style="padding:6px 8px;border-radius:6px;border:none;background:#22c55e;color:#022c22;cursor:pointer;font-size:12px;">
            🔁 Restaurar agora (cabeçalho + produtos)
          </button>
          <button id="sige-btn-restore-items" style="padding:6px 8px;border-radius:6px;border:none;background:#fbbf24;color:#78350f;cursor:pointer;font-size:12px;">
            🧩 Restaurar só produtos
          </button>
          <button id="sige-btn-import-backup" style="padding:6px 8px;border-radius:6px;border:none;background:#0ea5e9;color:#0f172a;cursor:pointer;font-size:12px;">
            📂 Importar backup
          </button>
          <input id="sige-backup-import-file" type="file" accept=".json,application/json" style="display:none;" />
          <button id="sige-btn-clear-backup" style="padding:6px 8px;border-radius:6px;border:none;background:#ef4444;color:#fee2e2;cursor:pointer;font-size:12px;">
            🗑 Limpar backup
          </button>
        </div>

        <div style="margin-top:12px;padding:10px;border:1px solid rgba(148,163,184,.3);border-radius:6px;">
          <div style="font-weight:700;margin-bottom:6px;">Backup PDV</div>
          <div id="sige-pdv-backup-meta" style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Carregando...</div>
          <button id="sige-btn-restore-pdv" style="display:none;padding:6px 8px;border-radius:6px;border:none;background:#a78bfa;color:#1f0b3a;cursor:pointer;font-size:12px;">
            🧾 Restaurar backup PDV
          </button>
        </div>
      `;

      // Botões de ação
      setTimeout(() => {
        const btnAll = document.getElementById("sige-btn-restore-all");
        const btnItems = document.getElementById("sige-btn-restore-items");
        const btnImport = document.getElementById("sige-btn-import-backup");
        const fileInput = document.getElementById("sige-backup-import-file");
        const btnClear = document.getElementById("sige-btn-clear-backup");
        const btnRestorePdv = document.getElementById("sige-btn-restore-pdv");

        if (btnAll) btnAll.onclick = () => restoreBackup();
        if (btnItems) btnItems.onclick = () => restoreOnlyProducts();
        if (btnRestorePdv) btnRestorePdv.onclick = () => startPdvRestoreFromPanel();
        if (btnClear) btnClear.onclick = () => {
          chrome.storage.local.remove(["sige_backup", "sige_pending_restore"], () => {
            alert("Backup apagado do navegador.");
          });
        };

        // Atualiza estado do backup PDV (mostra o botão apenas quando houver backup)
        try {
          chrome.storage.local.get(["sige_pdv_backup"], (r) => {
            if (r && r.sige_pdv_backup) {
              pdvBackupData = r.sige_pdv_backup;
              try { lastPdvBackupHash = hashPdvItems(pdvBackupData.items); } catch(e) {}
            }
            updatePdvBackupPanelControls();
          });
        } catch (e) {
          updatePdvBackupPanelControls();
        }

        if (btnImport && fileInput) {
          btnImport.onclick = () => {
            try {
              fileInput.value = "";
              fileInput.click();
            } catch (e) {
              console.error("[SIGE Assistente] Erro ao abrir seletor de arquivo para backup:", e);
            }
          };

          fileInput.onchange = () => {
            try {
              const file = fileInput.files && fileInput.files[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  const text = ev.target && ev.target.result ? ev.target.result : "";
                  if (!text) {
                    alert("Arquivo vazio ou não pôde ser lido.");
                    return;
                  }

                  let data;
                  try {
                    data = JSON.parse(text);
                  } catch (parseErr) {
                    console.error("[SIGE Assistente] Erro ao parsear JSON de backup:", parseErr);
                    alert("Arquivo de backup inválido. Ele deve ser um JSON.");
                    return;
                  }

                  const itensRaw = data && Array.isArray(data.itens) ? data.itens : [];
                  if (!itensRaw.length) {
                    alert("Esse backup não possui itens para importar.");
                    return;
                  }

                  const itens = itensRaw
                    .map((it) => {
                      return {
                        codigo: String(it.codigo || it.cod || "").trim(),
                        quantidade: String(it.quantidade || it.qtd || "").trim()
                      };
                    })
                    .filter((it) => it.codigo && it.quantidade);

                  if (!itens.length) {
                    alert("Não foi possível extrair códigos e quantidades deste arquivo.");
                    return;
                  }

                  const backupImportado = {
                    origem: "",
                    destino: "",
                    responsavel: "",
                    data: "",
                    itens: itens
                  };

                  chrome.storage.local.set(
                    { sige_backup: backupImportado, sige_pending_restore: "items_import" },
                    () => {
                      try {
                        const base = window.location && window.location.origin
                          ? window.location.origin
                          : "https://enfoquepapelaria.meusige.com.br";
                        const editUrl = base + "/sistema/EstoqueMovEntreDepositos/Edit";
                        window.location.href = editUrl;
                      } catch (navErr) {
                        console.error("[SIGE Assistente] Erro ao redirecionar para tela de transferência:", navErr);
                        alert("Backup importado, mas não consegui abrir a tela de transferência.");
                      }
                    }
                  );
                } catch (err) {
                  console.error("[SIGE Assistente] Erro ao processar backup importado:", err);
                  alert("Erro ao processar o arquivo de backup.");
                }
              };

              reader.readAsText(file, "utf-8");
            } catch (e) {
              console.error("[SIGE Assistente] Erro ao iniciar leitura de backup:", e);
              alert("Não foi possível ler o arquivo de backup.");
            }
          };
        }
      }, 50);
    }
    if (section === "pdv") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">PDV → Maquininha (Bridge)</h3>

        <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:700;">Status</span>
            <span id="enfoque-pdv-bridge-status" style="font-size:12px;color:#9ca3af;">Carregando...</span>
            <button id="enfoque-pdv-btn-ping" class="btn" style="margin-left:auto;">Ping</button>
          </div>
        </div>

        <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="font-weight:700;margin-bottom:6px;">Última captura</div>
          <div id="enfoque-pdv-bridge-last" style="font-size:12px;color:#e5e7eb;line-height:1.4;">(sem captura ainda)</div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
            <button id="enfoque-pdv-btn-recheck" class="btn">Revalidar agora</button>
            <button id="enfoque-pdv-btn-clear" class="btn danger">Limpar log</button>
          </div>
        </div>

        <div style="margin:0;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="font-weight:700;">Log</div>
            <div style="font-size:11px;color:#9ca3af;">captura → valida → envia</div>
          </div>
          <div id="enfoque-pdv-bridge-log" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;"></div>
          <pre id="enfoque-pdv-bridge-json" style="margin-top:10px;white-space:pre-wrap;word-break:break-word;font-size:11px;color:#9ca3af;background:rgba(0,0,0,.18);padding:10px;border-radius:10px;border:1px solid rgba(148,163,184,.18);max-height:220px;overflow:auto;"></pre>
        </div>
      `;

      try {
        const pingBtn = content.querySelector("#enfoque-pdv-btn-ping");
        const recheckBtn = content.querySelector("#enfoque-pdv-btn-recheck");
        const clearBtn = content.querySelector("#enfoque-pdv-btn-clear");
        pingBtn && pingBtn.addEventListener("click", () => window.__ENFOQUE_PDV_BRIDGE__?.ping?.());
        recheckBtn && recheckBtn.addEventListener("click", () => window.__ENFOQUE_PDV_BRIDGE__?.recheck?.());
        clearBtn && clearBtn.addEventListener("click", () => window.__ENFOQUE_PDV_BRIDGE__?.clearLog?.());
      } catch (_) {}

      setTimeout(() => {
        try { window.__ENFOQUE_PDV_BRIDGE__?.updateUI?.(); } catch (_) {}
      }, 50);
    }



    if (section === "deposito") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">Depósito destino</h3>
        <p style="margin:0 0 8px;line-height:1.4;">
          Na tela de edição da movimentação entre depósitos, você pode
          alterar o <b>depósito destino</b> pelo campo padrão ou pelo
          menu de botão direito do Chrome:
        </p>
        <ul style="margin:0 0 8px 16px;font-size:12px;line-height:1.4;">
          <li>Abra a tela EDIT.</li>
          <li>Clique com o botão direito em qualquer lugar.</li>
          <li>Escolha <b>"Alterar depósito final"</b>.</li>
        </ul>
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          O campo #Deposito2 será preenchido automaticamente via digitação
          simulada (humanType).
        </p>
      `;
    }


    if (section === "etiquetas") {
    if (!isPDVModoEtiquetas()) {
    content.innerHTML = `${__ETQ_UI__}
      <h3 style="margin:0 0 8px;font-size:14px;">Gerador de etiquetas via PDV</h3>
      <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">
        Clique no botão abaixo para abrir o PDV já em modo "Gerador de etiquetas".
        Depois de ler os códigos normalmente no PDV, volte aqui na aba Etiquetas para
        visualizar a prévia e mandar imprimir.
      </p>
      <button id="sige-etq-open-pdv" style="margin-top:4px;padding:6px 8px;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer;">
        🖨 Abrir PDV em modo etiquetas
      </button>
    `;

    const btnOpen = document.getElementById("sige-etq-open-pdv");
    if (btnOpen) {
      btnOpen.addEventListener("click", () => {
        try {
          const origin = window.location && window.location.origin
            ? window.location.origin
            : "";
          if (!origin) {
            alert("Não foi possível detectar a URL base do SIGE.");
            return;
          }
          const url = origin + "/sistema/ProdutosPrecoVenda/Report?etq=1";
          window.open(url, "_blank");
        } catch (e) {
          console.error("[SIGE Assistente] Erro ao abrir PDV em modo etiquetas:", e);
          alert("Erro ao tentar abrir o PDV em modo etiquetas.");
        }
      });
    }

    return;
  }

  content.innerHTML = `${__ETQ_UI__}
    <h3 style="margin:0 0 8px;font-size:14px;">Etiquetas do PDV</h3>
    <p style="margin:0 4px 6px 0;font-size:12px;color:#9ca3af;line-height:1.4;">
      Leitura em tempo real dos itens do PDV aberto em modo <b>"Gerador de etiquetas"</b>.
    </p>
    <div style="margin:0 0 6px;font-size:12px;color:#9ca3af;line-height:1.4;">
      Digite ou bip o código no campo abaixo. O código será enviado automaticamente
      para o campo <code>#txtNomeProduto</code> do PDV; ao localizar o produto, ele
      aparecerá na lista para geração de etiquetas, já com nome e preço.
    </div>
    <div style="display:flex;gap:4px;margin:0 0 8px;">
      <input
        id="sige-etq-code-input"
        type="text"
        placeholder="Digite ou bip o código do produto"
        style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid rgba(148,163,184,.4);
               background:#020617;color:#e5e7eb;font-size:12px;box-sizing:border-box;"
      />
      <button
        id="sige-etq-code-send"
        style="padding:6px 10px;border-radius:6px;border:1px solid transparent;
               background:#22c55e;color:#022c22;font-size:12px;cursor:pointer;white-space:nowrap;"
      >
        ➡ Enviar
      </button>
    </div>
    <div id="sige-etq-status" style="margin:0 0 6px;font-size:12px;color:#9ca3af;">
      Lendo itens do PDV...
    </div>
    <div id="sige-etq-list" style="display:flex;flex-direction:column;gap:4px;"></div>
    <button id="sige-etq-print-btn"
      style="margin-top:8px;padding:6px 8px;border-radius:4px;background:#22c55e;color:#fff;cursor:pointer;">
      🖨 Imprimir etiquetas
    </button>
  `;

  injectPDVEtiquetasBanner();

  function updateFromPDV() {
    const statusEl = document.getElementById("sige-etq-status");
    const listEl = document.getElementById("sige-etq-list");
    if (!statusEl || !listEl) return;

    const { produtos, etiquetas } = coletarEtiquetasPDV();
    if (!produtos.length) {
      statusEl.textContent = "Nenhum item encontrado no PDV.";
      listEl.innerHTML = "";
      sigeEtiquetasState.lastSnapshotKey = "";
      return;
    }

    const normalized = produtos.map(p => ({
      codigo: p.codigo || "",
      nome: p.nome || "",
      quantidade: p.quantidade || 1,
      preco: formatPrecoBR(p.preco || 0)
    }));
    const snapshotKey = JSON.stringify(normalized);
    if (snapshotKey === sigeEtiquetasState.lastSnapshotKey) {
      return;
    }
    sigeEtiquetasState.lastSnapshotKey = snapshotKey;

    statusEl.textContent = `Itens no PDV: ${normalized.length} (total de etiquetas: ${etiquetas.length})`;

    listEl.innerHTML = normalized.map(p => `
      <div style="border:1px solid rgba(148,163,184,.4);border-radius:4px;padding:4px 6px;font-size:12px;">
        <div style="font-weight:600;">${escapeHtml(p.nome)}</div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;">
          <span>Cód: <b>${escapeHtml(p.codigo)}</b></span>
          <span>Qtd: <b>${p.quantidade}</b></span>
          <span>Preço: <b>R$ ${p.preco}</b></span>
        </div>
      </div>
    `).join("");
  }

  updateFromPDV();
  if (sigeEtiquetasState.pollerId) {
    clearInterval(sigeEtiquetasState.pollerId);
  }
  sigeEtiquetasState.pollerId = setInterval(updateFromPDV, 1000);

  const btnPrint = document.getElementById("sige-etq-print-btn");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      abrirJanelaImpressaoEtiquetasPDV();
    });
  }

  const codeInput = document.getElementById("sige-etq-code-input");
  const codeSend = document.getElementById("sige-etq-code-send");

  if (codeInput && codeSend) {
    const enviarCodigoPDV = () => {
      const valor = (codeInput.value || "").trim();
      if (!valor) return;

      const campo = document.querySelector("#txtNomeProduto");
      if (!campo) {
        alert("Campo do PDV (#txtNomeProduto) não encontrado. Abra o PDV em modo etiquetas.");
        return;
      }

      try {
        if (typeof ensureHumanType === "function") {
          ensureHumanType();
        }
        if (typeof humanType === "function") {
          humanType("#txtNomeProduto", valor);
        } else {
          campo.value = valor;
          campo.dispatchEvent(new Event("input", { bubbles: true }));
          campo.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const ev = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        campo.dispatchEvent(ev);

        codeInput.select();
      } catch (err) {
        console.error("[SIGE Assistente] Erro ao enviar código para o PDV:", err);
      }
    };

    codeSend.addEventListener("click", (e) => {
      e.preventDefault();
      enviarCodigoPDV();
    });

    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        enviarCodigoPDV();
      }
    });
  }

  return;
}


    
    if (section === "defeituosos") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">Defeituosos</h3>
        <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.4;">
          Use a página de apoio <b>(etq=2)</b> para buscar produtos pela mesma API do PDV falso e gerar o Word.
        </p>
        <button id="sige-def-open-page" class="btn">🧾 Ir para Defeituosos (etq=2)</button>
      `;

      const btn = document.getElementById("sige-def-open-page");
      if (btn) {
        btn.addEventListener("click", () => {
          try {
            const origin = window.location.origin;
            window.open(origin + "/sistema/ProdutosPrecoVenda/Report?etq=2", "_blank");
          } catch (e) {
            console.error("[SIGE Assistente] Erro ao abrir página Defeituosos (etq=2):", e);
            alert("Erro ao abrir a página Defeituosos.");
          }
        });
      }
      return;
    }




    if (section === "baterprod") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">BaterProd</h3>
        <p style="margin:0 0 10px;line-height:1.4;">
          Abra o painel de conferência via celular para bater produtos usando o leitor do seu dispositivo móvel.
        </p>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button id="sige-baterprod-download-btn"
                  style="padding:8px 12px;border-radius:6px;border:none;background:#2563eb;color:#eff6ff;font-weight:700;cursor:pointer;font-size:13px;">
            ⬇️ Baixar prods (celular)
          </button>
        </div>

        <div style="text-align:center;margin:12px 0;">
          <img id="sige-qr-code" 
               alt="QR Code BaterProd" 
               style="width:294px;height:294px;border-radius:8px;border:1px solid #e5e7eb;"
               onerror="this.src='https://enfoquepapelaria.meusige.com.br/sistema/Images/qr.png'">
        </div>

        <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;line-height:1.4;">
          • O botão <b>Baixar prods</b> puxa os produtos batidos pelo app (via GitHub Gist) e salva como rascunho na <b>Lista de rascunhos</b> de <b>Entre Depósitos</b>
          <code>(prods-celular)</code> (limite próprio: 2).<br>
        </p>
      `;

      setTimeout(() => {
        // Get QR code URL
        const qrUrl = chrome.runtime.getURL("qr.png");
        
        const btnDown = document.getElementById("sige-baterprod-download-btn");
        if (btnDown) {
          btnDown.onclick = () => {
            try {
              __enfoqueOpenBaterprodMobileDownloadModal();
            } catch (e) {
              console.error("[SIGE Assistente] Erro ao abrir modal de download do BaterProd:", e);
              alert("Não foi possível abrir o download do BaterProd.");
            }
          };
        }

        // Set QR image source
        const qrImg = document.getElementById("sige-qr-code");
        if (qrImg) {
          qrImg.src = qrUrl;
        }

      }, 50);

      return;
    }

    if (section === "orcamento") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">PDF de orçamento (/Vendas/Edit)</h3>
        <p style="margin:0 0 6px;line-height:1.4;">
          Use este recurso na tela de edição de vendas/orçamentos do SIGE
          (<code>/Vendas/Edit</code>). Ele lê os dados diretamente da tela em Angular
          e monta o mesmo layout de orçamento usado no sistema interno da Enfoque.
        </p>
        <button id="sige-orcamento-pdf-btn"
                style="padding:8px 12px;border-radius:6px;border:none;background:#0ea5e9;color:#fff;font-weight:600;cursor:pointer;margin-top:2px;">
          Gerar PDF do orçamento atual
        </button>
        <p id="sige-orcamento-status"
           style="margin:6px 0 0;font-size:11px;color:#9ca3af;"></p>
      `;

      const btnPdf = document.getElementById("sige-orcamento-pdf-btn");
      if (btnPdf) {
        btnPdf.addEventListener("click", () => {
          captureOrcamentoAndOpenPdf();
        });
      }

      return;
    }



    if (section === "conversa") {
      content.innerHTML = `${__ETQ_UI__}
        <h3 style="margin:0 0 8px;font-size:14px;">Conversa (Produtos)</h3>

        <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="font-weight:700;margin-bottom:6px;">Produto (código)</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input id="enf-chat-codigo" type="text" inputmode="numeric" placeholder="Digite ou bipa o código e aperte Enter" style="flex:1;min-width:240px;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;">
            <button class="btn primary" id="enf-chat-buscar">Buscar</button>
            <button class="btn" id="enf-chat-limpar">Limpar</button>
          </div>
          <div id="enf-chat-status" style="margin-top:8px;font-size:11px;color:#9ca3af;">Informe um código para carregar a etiqueta e a explicação do produto.</div>
          <div id="enf-chat-opcoes" style="margin-top:8px;display:none;"></div>
        </div>

        <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="font-weight:700;margin-bottom:6px;">Preview da etiqueta</div>
          <div id="enf-chat-preview" style="display:flex;justify-content:center;align-items:flex-start;"></div>
          <div style="margin-top:8px;font-size:11px;color:#9ca3af;">A etiqueta é sempre gerada 1 por vez (ao buscar, substitui a anterior).</div>
        </div>

        <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="font-weight:700;margin-bottom:6px;">IA (explicação do produto)</div>
          <div id="enf-grok-out" style="white-space:pre-wrap;font-size:12px;line-height:1.45;color:#e5e7eb;">Selecione um produto para ver a explicação.</div>
        </div>

        <div style="margin:0 0 2px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
          <div style="font-weight:700;margin-bottom:6px;">Pergunta específica</div>
          <textarea id="enf-grok-q" rows="3" placeholder="Faça uma pergunta sobre o produto selecionado…" style="width:100%;resize:vertical;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;"></textarea>
          <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;">
            <button class="btn primary" id="enf-grok-ask">Perguntar</button>
          </div>
          <div id="enf-grok-hint" style="margin-top:8px;font-size:11px;color:#9ca3af;">A IA vai responder somente sobre o produto selecionado.</div>
        </div>
      `;

      const elCodigo = content.querySelector("#enf-chat-codigo");
      const btnBuscar = content.querySelector("#enf-chat-buscar");
      const btnLimpar = content.querySelector("#enf-chat-limpar");
      const statusEl = content.querySelector("#enf-chat-status");
      const opcoesEl = content.querySelector("#enf-chat-opcoes");
      const previewEl = content.querySelector("#enf-chat-preview");
      const grokOut = content.querySelector("#enf-grok-out");
      const qEl = content.querySelector("#enf-grok-q");
      const askBtn = content.querySelector("#enf-grok-ask");

      function setStatus(txt, isErr) {
        if (!statusEl) return;
        statusEl.textContent = String(txt || "");
        statusEl.style.color = isErr ? "#fca5a5" : "#9ca3af";
      }

      function setEnabled(on) {
        if (qEl) qEl.disabled = !on;
        if (askBtn) askBtn.disabled = !on;
      }

      function clearOpcoes() {
        if (!opcoesEl) return;
        opcoesEl.innerHTML = "";
        opcoesEl.style.display = "none";
      }

      function showOpcoes(options, onPick) {
        if (!opcoesEl) return;
        opcoesEl.innerHTML = "";
        opcoesEl.style.display = "block";
        opcoesEl.style.display = "grid";
        opcoesEl.style.gridTemplateColumns = "1fr";
        opcoesEl.style.gap = "6px";

        (options || []).forEach((p) => {
          const b = document.createElement("button");
          b.className = "btn";
          const preco = (p && typeof p.precoNum === "number") ? p.precoNum : 0;
          const precoTxt = preco ? ("R$ " + preco.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : "";
          const codTxt = String((p && p.codigo) || "").trim();
          const last6 = codTxt.replace(/\\D/g, "").slice(-6);
          b.style.justifyContent = "space-between";
          b.style.display = "flex";
          b.innerHTML = `<span style="font-weight:800;opacity:.95;">${__enfoqueEscHtml(p.nome || "PRODUTO")}</span>
                         <span style="opacity:.85;font-size:12px;">${__enfoqueEscHtml(precoTxt)} • ${__enfoqueEscHtml(last6 || codTxt)}</span>`;
          b.addEventListener("click", () => { try { onPick(p); } catch (_) {} });
          opcoesEl.appendChild(b);
        });
      }

      function renderPreview(prod) {
        if (!previewEl) return;
        previewEl.innerHTML = prod ? __enfoqueConversaRenderEtiqueta(prod) : "";
      }

      function renderAssistantText(txt) {
        if (!grokOut) return;
        grokOut.textContent = String(txt || "");
      }

      async function fetchProduto(codigo) {
        const cod = String(codigo || "").trim();
        if (!cod) return null;

        // Produtos/GetList (mais estável e já usado no gerador de etiquetas)
        const p1 = await new Promise((resolve) => {
          try { sigeBuscarProdutoNaApi(cod, resolve); } catch (e) { resolve(null); }
        });
        return p1;
      }

      async function gerarResumoGrok(prod) {
        const system = __enfoqueConversaBuildSystemPrompt(prod && prod.nome ? prod.nome : "");
        const user = [
          "Explique o que é esse produto e para que serve.",
          "Dê dicas rápidas de uso e 1 cuidado importante.",
          "Se houver dúvidas comuns de aplicação (superfícies/objetos), responda de forma geral sem inventar especificações."
        ].join(" ");

        const resp = await __enfoqueGroqChat([
          { role: "system", content: system },
          { role: "user", content: user }
        ]);

        if (!resp || resp.ok !== true) {
          renderAssistantText("⚠️ Erro ao chamar a IA: " + String(resp && resp.error ? resp.error : "NO_RESPONSE"));
          return;
        }

        const txt = (resp && resp.text) ? resp.text : "";
        __enfoqueConversaState.lastAnswer = txt || "";
        renderAssistantText(txt || "(sem resposta)");
      }

      async function handleCodigo(cod) {
        clearOpcoes();
        renderAssistantText("Carregando…");
        setEnabled(false);

        const res = await fetchProduto(cod);

        if (!res) {
          __enfoqueConversaState.produto = null;
          renderPreview(null);
          renderAssistantText("Selecione um produto para ver a explicação.");
          setStatus("Produto não encontrado.", true);
          return;
        }

        if (res && res.__enfoqueMultiple && Array.isArray(res.options) && res.options.length) {
          setStatus("Encontramos mais de um produto com esse código. Escolha um:", false);
          showOpcoes(res.options, async (p) => {
            __enfoqueConversaState.produto = p;
            renderPreview(p);
            setStatus("Produto selecionado. Gerando explicação…", false);
            await gerarResumoGrok(p);
            setEnabled(true);
          });
          renderPreview(null);
          renderAssistantText("Selecione uma opção acima para gerar a explicação.");
          return;
        }

        __enfoqueConversaState.produto = res;
        renderPreview(res);
        setStatus("Produto carregado. Gerando explicação…", false);
        await gerarResumoGrok(res);
        setEnabled(true);
      }

      btnBuscar && btnBuscar.addEventListener("click", () => {
        const cod = elCodigo ? elCodigo.value : "";
        handleCodigo(cod);
      });

      elCodigo && elCodigo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleCodigo(elCodigo.value);
        }
      });

      btnLimpar && btnLimpar.addEventListener("click", () => {
        __enfoqueConversaState.produto = null;
        __enfoqueConversaState.lastAnswer = "";
        clearOpcoes();
        renderPreview(null);
        renderAssistantText("Selecione um produto para ver a explicação.");
        setStatus("Informe um código para carregar a etiqueta e a explicação do produto.", false);
        setEnabled(false);
        try { elCodigo && (elCodigo.value = ""); elCodigo && elCodigo.focus(); } catch (_) {}
      });

      askBtn && askBtn.addEventListener("click", async () => {
        const prod = __enfoqueConversaState.produto;
        const q = String(qEl && qEl.value ? qEl.value : "").trim();
        if (!prod) { setStatus("Selecione um produto antes de perguntar.", true); return; }
        if (!q) { setStatus("Digite uma pergunta.", true); return; }

        setStatus("Perguntando à IA…", false);
        askBtn.disabled = true;

        const system = __enfoqueConversaBuildSystemPrompt(prod.nome || "");
        const msgs = [
          { role: "system", content: system }
        ];

        // Mantém um pouco de contexto sem virar conversa infinita
        if (__enfoqueConversaState.lastAnswer) {
          msgs.push({ role: "assistant", content: String(__enfoqueConversaState.lastAnswer).slice(0, 1400) });
        }
        msgs.push({ role: "user", content: q });

        const resp = await __enfoqueGroqChat(msgs);
        askBtn.disabled = false;

        if (!resp || resp.ok !== true) {
          renderAssistantText("⚠️ Erro ao chamar a IA: " + String(resp && resp.error ? resp.error : "NO_RESPONSE"));
          setStatus("Falha ao chamar a IA.", true);
          return;
        }

        const txt = (resp && resp.text) ? resp.text : "";
        __enfoqueConversaState.lastAnswer = txt || "";
        renderAssistantText(txt || "(sem resposta)");
        setStatus("OK.", false);
        try { qEl.value = ""; } catch (_) {}
      });

      // estado inicial
      renderPreview(__enfoqueConversaState.produto);
      setEnabled(!!__enfoqueConversaState.produto);

      return;
    }

if (section === "observacoes") {
  content.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:14px;">Observações (Orçamento Escolar)</h3>
      <div id="enfoque-obs-auth-status" style="margin-top:6px;font-size:12px;opacity:.75;"></div>
    </div>
    <div style="font-size:12px;opacity:.8;margin-bottom:10px;">
      Compartilhado entre PCs via <b>GitHub Gist privado</b> (polling). Abra no /OrcamentoEscolar/Edit e use o botão <b>Descrição</b> para enviar.
    </div>

    
    <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px;">Orçamento atual (tela)</div>

      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        <input id="enfoque-obs-current-code" type="text" placeholder="Código do orçamento (se não preencher, digite)"
          style="flex:1;min-width:140px;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;" readonly="" />
        <input id="enfoque-obs-current-school" type="text" placeholder="Escola (Cliente) — lê do SIGE"
          style="flex:2;min-width:220px;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;" readonly="" />
        <button id="enfoque-obs-pull-code" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;cursor:pointer;">Ler dados</button>
      </div>

      <textarea id="enfoque-obs-current-note" placeholder="Digite a observação deste orçamento..."
        style="width:100%;min-height:74px;resize:vertical;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;white-space:pre-wrap;"></textarea>

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button id="enfoque-obs-save-note" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.28);background:rgba(34,197,94,.20);color:#e5e7eb;font-size:12px;cursor:pointer;">Salvar observação</button>
        <button id="enfoque-obs-del-note" style="padding:8px 10px;border:1px solid rgba(148,163,184,.35);border-radius:10px;background:rgba(239,68,68,.15);color:#fecaca;font-size:12px;cursor:pointer;">Excluir</button>
        <span id="enfoque-obs-save-status" style="font-size:12px;opacity:.75;"></span>
      </div>
    </div>

<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
      <input id="enfoque-obs-search" type="text" placeholder="Pesquisar código..." style="flex:1;min-width:160px;padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;" />
      <button id="enfoque-obs-refresh" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.05);color:#e5e7eb;font-size:12px;cursor:pointer;">Buscar</button>
      <button id="enfoque-obs-markread" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.05);color:#e5e7eb;font-size:12px;cursor:pointer;">Zerar notificações</button>
    </div>

    <div id="enfoque-obs-status" style="font-size:12px;opacity:.75;margin:0 0 10px;"></div>
    <div id="enfoque-obs-list" style="display:flex;flex-direction:column;gap:8px;"></div>

    <details style="margin-top:12px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
      <summary style="cursor:pointer;font-weight:700;">Config (GitHub Gist)</summary>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
        <div style="font-size:12px;opacity:.75;line-height:1.35;">
          Dica: use um PAT com permissão <b>gist</b> e guarde ele só no <b>chrome.storage.local</b> deste PC.
        </div>

        <label style="font-size:12px;opacity:.85;">Gist ID</label>
        <input id="enfoque-obs-gist-id" type="text" placeholder="ex.: a1b2c3d4e5f6..." style="padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;" />

        <label style="font-size:12px;opacity:.85;">GitHub Token (PAT)</label>
        <input id="enfoque-obs-gh-token" type="password" placeholder="github_pat_..." style="padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;" />

        <label style="font-size:12px;opacity:.85;">Arquivo no Gist (opcional)</label>
        <input id="enfoque-obs-gist-file" type="text" placeholder="enfoque_orcamento_observacoes.json" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:#e5e7eb;font-size:12px;outline:none;" />

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button id="enfoque-obs-save-cfg" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.05);color:#e5e7eb;font-size:12px;cursor:pointer;">Salvar config</button>
          <span id="enfoque-obs-cfg-status" style="font-size:12px;opacity:.75;"></span>
        </div>
      </div>
    </details>
  `;

  setTimeout(() => {
    try { window.__enfoqueObservacoesPanelMount && window.__enfoqueObservacoesPanelMount(content); } catch (_) {}
  }, 50);
  return;
}


if (section === "cartao") {
      content.innerHTML = `
        <h3 style="margin:0 0 8px;font-size:14px;">Gerador de Cartão Para Vendedor</h3>

        <div style="margin:0 0 10px;font-size:12px;line-height:1.4;opacity:.9;">
          Importe um modelo (PNG/JPEG) e arraste o nome no preview. Ao salvar, será aberta uma página pronta para imprimir em A4 com os cartões lado a lado.
          <div style="margin-top:6px;font-size:11px;color:#9ca3af;">
            Você pode importar o modelo em <b>qualquer tamanho</b>. Depois de selecionar a imagem, será aberta uma tela para <b>recortar e redimensionar</b> antes de salvar o modelo.
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label style="font-size:12px;min-width:54px;opacity:.9;">Modelo</label>
          <select id="sige-card-model-select" style="flex:1;padding:8px 10px;border-radius:10px;border:1px solid #374151;background:#111827;color:#e5e7eb;font-size:12px;"></select>
          <button id="sige-card-import" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(14,165,233,.35);background:#0b1220;color:#e5e7eb;cursor:pointer;font-weight:700;">
            ⬆️ Importar
          </button>
          <input id="sige-card-file" type="file" accept="image/png,image/jpeg" style="display:none;" />
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label style="font-size:12px;min-width:54px;opacity:.9;">Nome</label>
          <input id="sige-card-name" type="text" placeholder="Digite seu nome" style="flex:1;padding:8px 10px;border-radius:10px;border:1px solid #374151;background:#111827;color:#e5e7eb;font-size:12px;" />
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
          <label style="font-size:12px;min-width:54px;opacity:.9;">Cor</label>
          <input id="sige-card-color" type="color" value="#ffffff" style="width:44px;height:34px;border:none;background:transparent;cursor:pointer;" />
          <div id="sige-card-info" style="font-size:11px;color:#9ca3af;white-space:pre-line;"></div>
        </div>

        <div style="border:1px solid rgba(148,163,184,.25);border-radius:14px;background:#0b1220;padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:12px;opacity:.9;">Preview (arraste o nome)</div>
            <button id="sige-card-reset-pos" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:#111827;color:#e5e7eb;cursor:pointer;font-size:12px;">
              ↩️ Centralizar
            </button>
          </div>

          <div style="display:flex;justify-content:center;">
            <div id="sige-card-preview" style="position:relative;width:300px;height:260px;border-radius:12px;overflow:hidden;background:#111827;border:1px solid #1f2937;">
              <img id="sige-card-preview-img" alt="Modelo" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.98;" />
              <div id="sige-card-preview-text" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.25);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.12);cursor:grab;font-weight:800;font-size:18px;letter-spacing:.2px;user-select:none;touch-action:none;white-space:pre;">
                Seu nome
              </div>
            </div>
          </div>
        </div>

        <button id="sige-card-save" style="margin-top:10px;width:100%;padding:10px 12px;border-radius:12px;border:0;background:#10b981;color:#06281d;cursor:pointer;font-weight:900;">
          💾 Salvar (abrir impressão)
        </button>
      `;

      setTimeout(async () => {
        const ASSUMED_DPI = 96; // usado para converter cm->px na saída

        const $sel = content.querySelector("#sige-card-model-select");
        const $btnImport = content.querySelector("#sige-card-import");
        const $file = content.querySelector("#sige-card-file");
        const $name = content.querySelector("#sige-card-name");
        const $color = content.querySelector("#sige-card-color");
        const $info = content.querySelector("#sige-card-info");
        const $img = content.querySelector("#sige-card-preview-img");
        const $txt = content.querySelector("#sige-card-preview-text");
        const $preview = content.querySelector("#sige-card-preview");
        const $reset = content.querySelector("#sige-card-reset-pos");
        const $save = content.querySelector("#sige-card-save");

        function cmFromPx(px) {
          const inch = (px || 0) / ASSUMED_DPI;
          return inch * 2.54;
        }
        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
        function okRange(v, a, b) { return v >= (a - 0.05) && v <= (b + 0.05); }
        function escapeHtml(s) {
          return String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
          }[c]));
        }

        async function openCropper(dataUrl, defaultName) {
          // Editor simples de recorte/redimensionamento (canvas) antes de salvar o modelo.
          // Saída: PNG (dataUrl) no tamanho definido (cm) convertido por ASSUMED_DPI.
          return await new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.id = "sige-card-crop-overlay";
            overlay.style.cssText = [
              "position:fixed","inset:0","z-index:2147483647",
              "background:rgba(0,0,0,.72)","display:flex","align-items:center","justify-content:center",
              "padding:18px"
            ].join(";");

            overlay.innerHTML = `
              <div style="width:min(980px,95vw);height:min(720px,92vh);background:#0b1220;border:1px solid rgba(148,163,184,.22);border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.18);display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <div>
                    <div style="font-weight:900;font-size:13px;">Recortar / Redimensionar modelo</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Escolha o tamanho final (cm), ajuste o recorte e clique em Aplicar.</div>
                  </div>
                  <button id="sige-card-crop-close" style="padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:#111827;color:#e5e7eb;cursor:pointer;font-weight:800;">✖</button>
                </div>

                <div style="flex:1;display:grid;grid-template-columns: 1fr 280px;gap:0;min-height:0;">
                  <div style="padding:12px;min-height:0;display:flex;flex-direction:column;gap:10px;">
                    <div style="flex:1;min-height:0;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0a1020;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                      <canvas id="sige-card-crop-canvas" style="width:100%;height:100%;display:block;"></canvas>
                    </div>
                    <div style="font-size:11px;color:#9ca3af;">
                      Dica: arraste o recorte para posicionar. Use o slider para aumentar/diminuir a área do recorte.
                    </div>
                  </div>

                  <div style="padding:12px;border-left:1px solid rgba(148,163,184,.18);display:flex;flex-direction:column;gap:10px;">
                    <div style="font-size:12px;font-weight:900;">Tamanho final (cm)</div>

                    <div style="display:flex;gap:8px;align-items:center;">
                      <label style="font-size:12px;min-width:34px;opacity:.9;">L</label>
                      <input id="sige-card-out-w" type="number" step="0.1" min="1" max="30" value="7.5" style="flex:1;padding:8px 10px;border-radius:10px;border:1px solid #374151;background:#111827;color:#e5e7eb;font-size:12px;" />
                      <span style="font-size:12px;opacity:.8;">cm</span>
                    </div>

                    <div style="display:flex;gap:8px;align-items:center;">
                      <label style="font-size:12px;min-width:34px;opacity:.9;">A</label>
                      <input id="sige-card-out-h" type="number" step="0.1" min="1" max="30" value="6.5" style="flex:1;padding:8px 10px;border-radius:10px;border:1px solid #374151;background:#111827;color:#e5e7eb;font-size:12px;" />
                      <span style="font-size:12px;opacity:.8;">cm</span>
                    </div>

                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                      <button id="sige-card-preset-1" style="flex:1;min-width:120px;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:#111827;color:#e5e7eb;cursor:pointer;font-weight:800;font-size:12px;">7,5×6,5</button>
                      <button id="sige-card-preset-2" style="flex:1;min-width:120px;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:#111827;color:#e5e7eb;cursor:pointer;font-weight:800;font-size:12px;">6,5×5,5</button>
                    </div>

                    <div style="margin-top:6px;font-size:12px;font-weight:900;">Recorte</div>
                    <label style="font-size:11px;color:#9ca3af;">Tamanho do recorte</label>
                    <input id="sige-card-crop-scale" type="range" min="20" max="100" value="90" style="width:100%;" />

                    <div id="sige-card-crop-status" style="font-size:11px;color:#9ca3af;white-space:pre-line;"></div>

                    <div style="margin-top:auto;display:flex;gap:8px;">
                      <button id="sige-card-crop-cancel" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:#111827;color:#e5e7eb;cursor:pointer;font-weight:900;">Cancelar</button>
                      <button id="sige-card-crop-apply" style="flex:1;padding:10px 12px;border-radius:12px;border:0;background:#10b981;color:#06281d;cursor:pointer;font-weight:900;">Aplicar</button>
                    </div>
                  </div>
                </div>
              </div>
            `;

            function cleanup(result) {
              try { overlay.remove(); } catch (e) {}
              resolve(result);
            }

            // Fechar ao clicar fora (opcional)
            overlay.addEventListener("mousedown", (ev) => {
              if (ev.target === overlay) cleanup(null);
            });

            document.body.appendChild(overlay);

            const $close = overlay.querySelector("#sige-card-crop-close");
            const $cancel = overlay.querySelector("#sige-card-crop-cancel");
            const $apply = overlay.querySelector("#sige-card-crop-apply");
            const $w = overlay.querySelector("#sige-card-out-w");
            const $h = overlay.querySelector("#sige-card-out-h");
            const $preset1 = overlay.querySelector("#sige-card-preset-1");
            const $preset2 = overlay.querySelector("#sige-card-preset-2");
            const $scale = overlay.querySelector("#sige-card-crop-scale");
            const $status = overlay.querySelector("#sige-card-crop-status");
            const canvas = overlay.querySelector("#sige-card-crop-canvas");
            const ctx = canvas.getContext("2d");

            $close.addEventListener("click", () => cleanup(null));
            $cancel.addEventListener("click", () => cleanup(null));

            $preset1.addEventListener("click", () => { $w.value = "7.5"; $h.value = "6.5"; recomputeCrop(); draw(); });
            $preset2.addEventListener("click", () => { $w.value = "6.5"; $h.value = "5.5"; recomputeCrop(); draw(); });

            let img = new Image();
            img.onload = () => {
              // Inicializa canvas para tamanho real do container
              fitCanvasToCSS();
              recomputeCrop(true);
              draw();
            };
            img.onerror = () => {
              alert("Falha ao carregar a imagem para recorte.");
              cleanup(null);
            };
            img.src = dataUrl;

            function fitCanvasToCSS() {
              const dpr = window.devicePixelRatio || 1;
              const r = canvas.getBoundingClientRect();
              const w = Math.max(320, Math.floor(r.width));
              const h = Math.max(240, Math.floor(r.height));
              canvas.width = Math.floor(w * dpr);
              canvas.height = Math.floor(h * dpr);
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            const ro = new ResizeObserver(() => {
              try {
                fitCanvasToCSS();
                draw();
              } catch (e) {}
            });
            ro.observe(canvas);

            function getOutCm() {
              let wCm = parseFloat(String($w.value || "").replace(",", "."));
              let hCm = parseFloat(String($h.value || "").replace(",", "."));
              if (!isFinite(wCm) || wCm <= 0) wCm = 7.5;
              if (!isFinite(hCm) || hCm <= 0) hCm = 6.5;
              return { wCm, hCm };
            }

            // Crop em coordenadas da imagem
            let crop = { cx: 0, cy: 0, w: 0, h: 0 };

            function recomputeCrop(resetCenter=false) {
              if (!img || !img.naturalWidth) return;

              const { wCm, hCm } = getOutCm();
              const ratio = wCm / hCm;

              const frac = clamp((parseInt($scale.value, 10) || 90) / 100, 0.2, 1);
              let w = img.naturalWidth * frac;
              let h = w / ratio;

              const maxH = img.naturalHeight * frac;
              if (h > maxH) {
                h = maxH;
                w = h * ratio;
              }

              // clamp final
              w = clamp(w, 40, img.naturalWidth);
              h = clamp(h, 40, img.naturalHeight);

              if (resetCenter || crop.cx === 0) {
                crop.cx = img.naturalWidth / 2;
                crop.cy = img.naturalHeight / 2;
              }
              crop.w = Math.min(w, img.naturalWidth);
              crop.h = Math.min(h, img.naturalHeight);

              // manter dentro dos limites
              crop.cx = clamp(crop.cx, crop.w / 2, img.naturalWidth - crop.w / 2);
              crop.cy = clamp(crop.cy, crop.h / 2, img.naturalHeight - crop.h / 2);

              updateStatus();
            }

            function updateStatus() {
              if (!img || !img.naturalWidth) return;
              const { wCm, hCm } = getOutCm();
              const pxW = Math.round((wCm / 2.54) * ASSUMED_DPI);
              const pxH = Math.round((hCm / 2.54) * ASSUMED_DPI);
              $status.textContent =
                `Imagem: ${img.naturalWidth}×${img.naturalHeight}px\n` +
                `Saída: ${wCm.toFixed(1)}×${hCm.toFixed(1)}cm  (~${pxW}×${pxH}px @${ASSUMED_DPI}dpi)\n` +
                `Recorte: ${Math.round(crop.w)}×${Math.round(crop.h)}px`;
            }

            $scale.addEventListener("input", () => { recomputeCrop(false); draw(); });
            $w.addEventListener("input", () => { recomputeCrop(false); draw(); });
            $h.addEventListener("input", () => { recomputeCrop(false); draw(); });

            function imgToCanvas(x, y, scale, offX, offY) {
              return { x: offX + x * scale, y: offY + y * scale };
            }

            function draw() {
              if (!img || !img.naturalWidth) return;

              const cw = canvas.getBoundingClientRect().width;
              const ch = canvas.getBoundingClientRect().height;

              // Desenho em CSS pixels (ctx já está ajustado pelo dpr via setTransform)
              ctx.clearRect(0, 0, cw, ch);

              const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
              const offX = (cw - img.naturalWidth * scale) / 2;
              const offY = (ch - img.naturalHeight * scale) / 2;

              ctx.drawImage(img, offX, offY, img.naturalWidth * scale, img.naturalHeight * scale);

              const x = crop.cx - crop.w / 2;
              const y = crop.cy - crop.h / 2;

              const p1 = imgToCanvas(x, y, scale, offX, offY);
              const rw = crop.w * scale;
              const rh = crop.h * scale;

              // overlay escuro com "buraco"
              ctx.save();
              ctx.fillStyle = "rgba(0,0,0,.45)";
              ctx.fillRect(0, 0, cw, ch);
              ctx.globalCompositeOperation = "destination-out";
              ctx.fillRect(p1.x, p1.y, rw, rh);
              ctx.restore();

              // borda + handles
              ctx.save();
              ctx.strokeStyle = "rgba(34,197,94,.95)";
              ctx.lineWidth = 2;
              ctx.strokeRect(p1.x, p1.y, rw, rh);

              const hs = 10;
              ctx.fillStyle = "rgba(34,197,94,.95)";
              ctx.fillRect(p1.x - hs/2, p1.y - hs/2, hs, hs);
              ctx.fillRect(p1.x + rw - hs/2, p1.y - hs/2, hs, hs);
              ctx.fillRect(p1.x - hs/2, p1.y + rh - hs/2, hs, hs);
              ctx.fillRect(p1.x + rw - hs/2, p1.y + rh - hs/2, hs, hs);
              ctx.restore();

              updateStatus();
            }

            // Drag do recorte
            let dragging = false;
            let dragOffset = { dx: 0, dy: 0 };

            function getPointer(ev) {
              const r = canvas.getBoundingClientRect();
              const x = ev.clientX - r.left;
              const y = ev.clientY - r.top;
              return { x, y, w: r.width, h: r.height };
            }

            function pointerToImage(px, py, cw, ch) {
              const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
              const offX = (cw - img.naturalWidth * scale) / 2;
              const offY = (ch - img.naturalHeight * scale) / 2;
              const ix = (px - offX) / scale;
              const iy = (py - offY) / scale;
              return { ix, iy, scale, offX, offY };
            }

            canvas.addEventListener("pointerdown", (ev) => {
              if (!img || !img.naturalWidth) return;
              const p = getPointer(ev);
              const { ix, iy } = pointerToImage(p.x, p.y, p.w, p.h);

              const x0 = crop.cx - crop.w/2, y0 = crop.cy - crop.h/2;
              const inside = ix >= x0 && ix <= x0 + crop.w && iy >= y0 && iy <= y0 + crop.h;
              if (!inside) return;

              dragging = true;
              canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
              dragOffset.dx = ix - crop.cx;
              dragOffset.dy = iy - crop.cy;
            });

            canvas.addEventListener("pointermove", (ev) => {
              if (!dragging || !img || !img.naturalWidth) return;
              const p = getPointer(ev);
              const { ix, iy } = pointerToImage(p.x, p.y, p.w, p.h);

              crop.cx = ix - dragOffset.dx;
              crop.cy = iy - dragOffset.dy;

              crop.cx = clamp(crop.cx, crop.w / 2, img.naturalWidth - crop.w / 2);
              crop.cy = clamp(crop.cy, crop.h / 2, img.naturalHeight - crop.h / 2);

              draw();
            });

            function endDrag() { dragging = false; }
            canvas.addEventListener("pointerup", endDrag);
            canvas.addEventListener("pointercancel", endDrag);
            canvas.addEventListener("lostpointercapture", endDrag);

            $apply.addEventListener("click", () => {
              try {
                if (!img || !img.naturalWidth) return;

                const { wCm, hCm } = getOutCm();
                const outW = Math.max(10, Math.round((wCm / 2.54) * ASSUMED_DPI));
                const outH = Math.max(10, Math.round((hCm / 2.54) * ASSUMED_DPI));

                const sx = Math.round(crop.cx - crop.w/2);
                const sy = Math.round(crop.cy - crop.h/2);
                const sw = Math.round(crop.w);
                const sh = Math.round(crop.h);

                const out = document.createElement("canvas");
                out.width = outW;
                out.height = outH;
                const octx = out.getContext("2d");
                octx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

                const outDataUrl = out.toDataURL("image/png", 1.0);

                cleanup({
                  dataUrl: outDataUrl,
                  wCm,
                  hCm,
                  name: defaultName || "Modelo"
                });
              } catch (e) {
                alert("Falha ao aplicar recorte.");
                cleanup(null);
              }
            });
          });
        }


        const storeKeys = ["sige_card_models", "sige_card_selected_model_id", "sige_card_text_state"];
        const st = await __enfoqueStorageGet(storeKeys);

        let models = Array.isArray(st.sige_card_models) ? st.sige_card_models : [];
        let selectedId = st.sige_card_selected_model_id || (models[0] && models[0].id) || "";
        let textState = (st.sige_card_text_state && typeof st.sige_card_text_state === "object") ? st.sige_card_text_state : {};
        textState = {
          name: typeof textState.name === "string" ? textState.name : "",
          color: typeof textState.color === "string" ? textState.color : "#ffffff",
          x: typeof textState.x === "number" ? textState.x : 0.5,
          y: typeof textState.y === "number" ? textState.y : 0.5
        };

        function updateInfo(model) {
          if (!model) {
            $info.textContent = "Nenhum modelo selecionado.";
            return;
          }
          const w = model.wCm ? model.wCm.toFixed(2) : "?";
          const h = model.hCm ? model.hCm.toFixed(2) : "?";
          $info.textContent = `Modelo: ${model.name || "sem nome"}\nTamanho (cm): ${w} × ${h}`;
        }

        function renderSelect() {
          $sel.innerHTML = "";
          if (!models.length) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Nenhum modelo — clique em Importar";
            $sel.appendChild(opt);
            return;
          }
          models.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = m.name || "Modelo";
            $sel.appendChild(opt);
          });
          if (selectedId) $sel.value = selectedId;
        }

        function getSelectedModel() {
          return models.find(m => m.id === selectedId) || null;
        }

        function applyTextState() {
          $name.value = textState.name || "";
          $color.value = textState.color || "#ffffff";
          $txt.style.color = textState.color || "#ffffff";
          $txt.textContent = (textState.name || "Seu nome");
          $txt.style.left = (clamp(textState.x, 0, 1) * 100) + "%";
          $txt.style.top = (clamp(textState.y, 0, 1) * 100) + "%";
        }

        function applyModel(model) {
          if (!model) {
            $img.removeAttribute("src");
            updateInfo(null);
            return;
          }
          $img.src = model.dataUrl || "";
          updateInfo(model);
        }

        async function persistAll() {
          await __enfoqueStorageSet({
            sige_card_models: models,
            sige_card_selected_model_id: selectedId,
            sige_card_text_state: textState
          });
        }

        renderSelect();
        applyModel(getSelectedModel());
        applyTextState();

        $sel.addEventListener("change", async () => {
          selectedId = $sel.value || "";
          applyModel(getSelectedModel());
          await persistAll();
        });

        $btnImport.addEventListener("click", () => $file.click());

        $file.addEventListener("change", async () => {
          const f = $file.files && $file.files[0];
          $file.value = "";
          if (!f) return;
          if (!/image\/(png|jpeg)/i.test(f.type)) {
            alert("Formato inválido. Use PNG ou JPEG.");
            return;
          }

          const dataUrl = await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ""));
            fr.onerror = () => resolve("");
            fr.readAsDataURL(f);
          });
          if (!dataUrl) {
            alert("Falha ao ler o arquivo.");
            return;
          }

          const dims = await new Promise((resolve) => {
            const im = new Image();
            im.onload = () => resolve({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
            im.onerror = () => resolve(null);
            im.src = dataUrl;
          });
          if (!dims) {
            alert("Falha ao carregar a imagem.");
            return;
          }

          // Qualquer tamanho é aceito: após selecionar a imagem, abre uma tela para recortar/redimensionar
          const cropped = await openCropper(
            dataUrl,
            (f.name || "Modelo").replace(/\.(png|jpe?g)$/i, "")
          );
          if (!cropped || !cropped.dataUrl) return;

          const id = "m_" + Date.now() + "_" + Math.random().toString(16).slice(2);
          const name = (cropped.name || (f.name || "Modelo").replace(/\.(png|jpe?g)$/i, "")) || "Modelo";
          const model = {
            id,
            name,
            dataUrl: cropped.dataUrl,
            wCm: cropped.wCm,
            hCm: cropped.hCm,
            createdAt: Date.now()
          };
          // Evitar crescer infinito: mantém os 10 mais recentes
          models = [model, ...models].slice(0, 10);
          selectedId = id;

          renderSelect();
          applyModel(model);
          await persistAll();
        });

        $name.addEventListener("input", async () => {
          textState.name = $name.value || "";
          $txt.textContent = textState.name || "Seu nome";
          await persistAll();
        });

        $color.addEventListener("input", async () => {
          textState.color = $color.value || "#ffffff";
          $txt.style.color = textState.color;
          await persistAll();
        });

        $reset.addEventListener("click", async () => {
          textState.x = 0.5;
          textState.y = 0.5;
          applyTextState();
          await persistAll();
        });

        // Drag do texto
        let dragging = false;
        function setPosFromEvent(ev) {
          const r = $preview.getBoundingClientRect();
          const x = clamp((ev.clientX - r.left) / r.width, 0, 1);
          const y = clamp((ev.clientY - r.top) / r.height, 0, 1);
          textState.x = x;
          textState.y = y;
          $txt.style.left = (x * 100) + "%";
          $txt.style.top = (y * 100) + "%";
        }

        $txt.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          dragging = true;
          $txt.setPointerCapture && $txt.setPointerCapture(ev.pointerId);
          $txt.style.cursor = "grabbing";
          setPosFromEvent(ev);
        });

        $txt.addEventListener("pointermove", (ev) => {
          if (!dragging) return;
          ev.preventDefault();
          setPosFromEvent(ev);
        });

        function endDrag() {
          if (!dragging) return;
          dragging = false;
          $txt.style.cursor = "grab";
          persistAll();
        }
        $txt.addEventListener("pointerup", endDrag);
        $txt.addEventListener("pointercancel", endDrag);
        $txt.addEventListener("lostpointercapture", endDrag);

        $save.addEventListener("click", async () => {
          const model = getSelectedModel();
          if (!model || !model.dataUrl) {
            alert("Selecione ou importe um modelo primeiro.");
            return;
          }
          const name = (textState.name || "").trim();
          if (!name) {
            alert("Digite seu nome antes de salvar.");
            return;
          }

          await persistAll();

          const wCm = model.wCm || 7.0;
          const hCm = model.hCm || 6.0;
          const xPct = clamp(textState.x, 0, 1) * 100;
          const yPct = clamp(textState.y, 0, 1) * 100;
          const color = textState.color || "#ffffff";

          const safeName = escapeHtml(name);

          // Layout: 2 colunas × 4 linhas (igual ao modelo do Canva da imagem)
          const COPIES = 8;

          const cardsHtml = Array.from({ length: COPIES }).map(() => {
            return `
              <div class="card" style="width:${wCm}cm;height:${hCm}cm;">
                <img class="bg" src="${model.dataUrl}" alt="Modelo" />
                <div class="t" style="left:${xPct}%;top:${yPct}%;color:${color};">${safeName}</div>
              </div>
            `;
          }).join("");

          const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Cartões • Impressão</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body { height: 100%; }
  body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
  .noprint { position: fixed; top: 10px; left: 10px; z-index: 9999; display: flex; gap: 8px; }
  .noprint button { padding: 10px 12px; border-radius: 10px; border: 1px solid #ddd; background: #f6f6f6; cursor: pointer; font-weight: 700; }
  .sheet { width: 21cm; height: 29.7cm; display: grid; place-items: center; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: repeat(2, ${wCm}cm); grid-template-rows: repeat(4, ${hCm}cm); column-gap: 2cm; row-gap: .45cm; }
  .card { position: relative; overflow: hidden; border: 0; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .t { position: absolute; transform: translate(-50%,-50%); font-weight: 800; font-size: 18pt; text-shadow: 0 2px 6px rgba(0,0,0,.35); white-space: pre; }
  @media print {
    .noprint { display: none !important; }
  }
</style>
</head>
<body>
  <div class="noprint">
    <button onclick="window.print()">🖨️ Imprimir</button>
    <button onclick="window.close()">✖ Fechar</button>
  </div>
  <div class="sheet">
    <div class="grid">
      ${cardsHtml}
    </div>
  </div>
</body>
</html>`;

          const w = window.open("", "_blank");
          if (!w) {
            alert("Bloqueio de pop-up: permita abrir a janela de impressão.");
            return;
          }
          w.document.open();
          w.document.write(html);
          w.document.close();
        });

      }, 80);

      return;
    }


if (section === "caixaconf") {
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <h3 style="margin:0 0 6px;font-size:14px;">Conferência de Caixa</h3>
        <p style="margin:0;color:#cbd5e1;font-size:12px;line-height:1.45;">Automação em aba de fundo: faz login, aplica filtros, abre o demonstrativo e compara com a planilha.</p>
      </div>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
        <span>Empresa</span>
        <select id="enf-caixa-empresa" style="width:100%;min-height:42px;padding:10px 38px 10px 12px;border-radius:10px;border:1px solid rgba(148,163,184,.45);background:#0f172a;color:#f8fafc;outline:none;font-size:13px;line-height:1.3;box-sizing:border-box;-webkit-appearance:none;appearance:none;background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%23e2e8f0' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E&quot;);background-repeat:no-repeat;background-position:right 12px center;background-size:12px 12px;">
          <option value="Papel &amp; Arte" style="color:#0f172a;background:#ffffff;">Papel &amp; Arte</option>
          <option value="Enfoque - Centro" style="color:#0f172a;background:#ffffff;">Enfoque - Centro</option>
          <option value="Enfoque - Copacabana" style="color:#0f172a;background:#ffffff;">Enfoque - Copacabana</option>
          <option value="Enfoque - Deposito Celestino" style="color:#0f172a;background:#ffffff;">Enfoque - Deposito Celestino</option>
          <option value="Enfoque - Icarai" style="color:#0f172a;background:#ffffff;">Enfoque - Icarai</option>
          <option value="Enfoque - Ilha Plaza" style="color:#0f172a;background:#ffffff;">Enfoque - Ilha Plaza</option>
          <option value="Enfoque - Itaipu" style="color:#0f172a;background:#ffffff;">Enfoque - Itaipu</option>
          <option value="Enfoque - São Gonçalo" style="color:#0f172a;background:#ffffff;">Enfoque - São Gonçalo</option>
          <option value="Escritório Central" style="color:#0f172a;background:#ffffff;">Escritório Central</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
        <span>Email do operador</span>
        <input id="enf-caixa-operador" type="text" placeholder="email do caixa" style="width:100%;min-height:42px;padding:10px 12px;border-radius:10px;border:1px solid rgba(148,163,184,.45);background:#0f172a;color:#f8fafc;outline:none;font-size:13px;line-height:1.3;box-sizing:border-box;" />
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
        <span>Planilha (.xlsx)</span>
        <input id="enf-caixa-file" type="file" accept=".xlsx,.xlsm,.xls" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.45);background:#0f172a;color:#f8fafc;outline:none;box-sizing:border-box;" />
        <span id="enf-caixa-file-status" style="color:#9ca3af;">Nenhuma planilha carregada.</span>
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="enf-caixa-run" class="btn">Iniciar conferência</button>
        <button id="enf-caixa-clear" class="btn ghost">Limpar resultado</button>
      </div>
      <div style="font-size:11px;color:#94a3b8;line-height:1.45;border:1px solid rgba(148,163,184,.2);padding:10px;border-radius:10px;background:rgba(255,255,255,.03);">
        Fluxo: a extensão abre a tela de fechamento em segundo plano, faz login, aplica os filtros, espera 10s para você abrir o demonstrativo e então lê o HTML para comparar com a planilha.
      </div>
      <pre id="enf-caixa-result" style="white-space:pre-wrap;word-break:break-word;min-height:220px;max-height:420px;overflow:auto;margin:0;padding:12px;border-radius:12px;border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.72);color:#e5e7eb;font-size:11px;line-height:1.45;">Aguardando ação.</pre>
    </div>
  `;

  setTimeout(() => {
    const empresaEl = document.getElementById('enf-caixa-empresa');
    const operadorEl = document.getElementById('enf-caixa-operador');
    const fileEl = document.getElementById('enf-caixa-file');
    const statusEl = document.getElementById('enf-caixa-file-status');
    const runEl = document.getElementById('enf-caixa-run');
    const clearEl = document.getElementById('enf-caixa-clear');
    const resultEl = document.getElementById('enf-caixa-result');

    try {
      const savedEmpresa = localStorage.getItem('enfoque_caixa_empresa') || '';
      if (savedEmpresa) empresaEl.value = savedEmpresa;
      const savedOperador = localStorage.getItem('enfoque_caixa_operador') || '';
      const sigeEmail = (document.querySelector('#nomeCurrentUsuarioHeader')?.textContent || '').trim();
      if (!operadorEl.value.trim()) operadorEl.value = savedOperador || sigeEmail || '';
    } catch (_) {}

    fileEl?.addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        __enfoqueCaixaWorkbook = XLSX.read(buf, { type: 'array' });
        __enfoqueCaixaFileName = file.name;
        statusEl.textContent = `Planilha carregada: ${file.name}`;
      } catch (e) {
        __enfoqueCaixaWorkbook = null;
        __enfoqueCaixaFileName = '';
        statusEl.textContent = 'Falha ao ler a planilha.';
        resultEl.textContent = 'Erro ao abrir a planilha: ' + (e && e.message ? e.message : e);
      }
    });

    clearEl?.addEventListener('click', () => {
      resultEl.textContent = 'Aguardando ação.';
    });

    runEl?.addEventListener('click', () => {
      (async () => {
        try {
          if (!__enfoqueCaixaWorkbook) throw new Error('Selecione a planilha antes de iniciar.');
          const empresa = (empresaEl.value || '').trim();
          const operadorEmail = (operadorEl.value || '').trim();
          if (!empresa || !operadorEmail) throw new Error('Preencha empresa e email do operador.');
          try {
            localStorage.setItem('enfoque_caixa_empresa', empresa);
            localStorage.setItem('enfoque_caixa_operador', operadorEmail);
          } catch (_) {}
          resultEl.textContent = 'Iniciando automação em aba de fundo...';
          const resp = await chrome.runtime.sendMessage({ type: 'ENFOQUE_CAIXA_AUTOMATE_AND_CAPTURE', empresa, operadorEmail, waitMs: 10000 });
          if (!resp || !resp.ok || !resp.capture || !resp.capture.html) throw new Error((resp && resp.error) || 'Falha ao capturar o demonstrativo.');
          const planilha = __enfoqueReadWorkbook();
          const demo = __enfoqueParseDemonstrativoHTML(resp.capture.html);
          const compare = __enfoqueCompareCaixa(planilha, demo);
          const issues = compare.issues || [];
          const resumo = compare.resumo || {};
          const lines = [];
          lines.push(issues.length ? 'Status: COM DIVERGÊNCIA' : 'Status: SEM DIVERGÊNCIA');
          lines.push('');

          if (issues.length) {
            lines.push('Divergências encontradas:');
            issues.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
          } else {
            lines.push('Nenhuma divergência encontrada.');
          }

          lines.push('');
          lines.push('Resumo dos totais:');
          lines.push(`- Débito: planilha ${__enfoqueCaixaFmt(planilha.totais.debito)} | SIGE ${__enfoqueCaixaFmt(demo.totais.debito)}`);
          lines.push(`- Crédito: planilha ${__enfoqueCaixaFmt(planilha.totais.credito)} | SIGE ${__enfoqueCaixaFmt(demo.totais.credito)}`);
          lines.push(`- Dinheiro: planilha ${__enfoqueCaixaFmt(planilha.totais.dinheiro)} | SIGE ${__enfoqueCaixaFmt(demo.totais.dinheiro)}`);
          lines.push(`- Pix Máquina: planilha ${__enfoqueCaixaFmt(planilha.totais.pix_maquina)} | SIGE ${__enfoqueCaixaFmt(demo.totais.pix_maquina)}`);
          lines.push(`- Pix CNPJ: planilha ${__enfoqueCaixaFmt(planilha.totais.pix_cnpj)} | SIGE ${__enfoqueCaixaFmt(demo.totais.pix_cnpj)}`);
          lines.push(`- Vale Troca: planilha ${__enfoqueCaixaFmt(planilha.totais.vale_troca)} | SIGE ${__enfoqueCaixaFmt(demo.totais.vale_troca)}`);
          lines.push('');
          lines.push('Abertura / fechamento do dinheiro:');
          lines.push(`- Abertura planilha (C17): ${__enfoqueCaixaFmt(planilha.totais.abertura)}`);
          lines.push(`- Depósito final planilha (C21): ${__enfoqueCaixaFmt(planilha.totais.deposito_final)}`);

          if (resumo.saldoTipo === 'falta') {
            lines.push(`- Falta apurada: ${__enfoqueCaixaFmt(resumo.saldoEsperado)} | planilha C23 ${__enfoqueCaixaFmt(resumo.saldoPlanilha)}`);
          } else if (resumo.saldoTipo === 'sobra') {
            lines.push(`- Sobra apurada: ${__enfoqueCaixaFmt(resumo.saldoEsperado)} | planilha C24 ${__enfoqueCaixaFmt(resumo.saldoPlanilha)}`);
          } else {
            lines.push(`- Resultado do caixa: zerado`);
            lines.push(`- Planilha C23: ${__enfoqueCaixaFmt(planilha.totais.falta)} | C24: ${__enfoqueCaixaFmt(planilha.totais.sobra)}`);
          }

          resultEl.textContent = lines.join('\n');
        } catch (e) {
          resultEl.textContent = 'Erro: ' + (e && e.message ? e.message : e);
        }
      })();
    });
  }, 0);
}


if (section === "config") {
  content.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:14px;">Configurações</h3>

    <div style="padding:10px;border:1px solid rgba(148,163,184,.25);border-radius:12px;background:rgba(255,255,255,.03);">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px;">Acesso (teste)</div>

      <div id="enfoque-cfg-loginBox">
        <div style="font-size:12px;opacity:.9;margin-bottom:6px;">Senha</div>
        <input id="enfoque-cfg-pass" type="password" placeholder="Digite a senha" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:rgba(0,0,0,.25);color:#fff;outline:none;margin-bottom:8px;" />
        <button id="enfoque-cfg-login" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.18);color:#bbf7d0;cursor:pointer;font-size:12px;font-weight:700;">
          🔐 Login
        </button>
      </div>

      <div id="enfoque-cfg-after" style="display:none;margin-top:10px;">
        <div style="font-size:12px;opacity:.95;margin-bottom:6px;">Email autorizado (para liberar “Cancelar Pedido”)</div>
        <input id="enfoque-cfg-email" type="email" placeholder="ex: vendas@megadestec.com.br" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:rgba(0,0,0,.25);color:#fff;outline:none;margin-bottom:8px;" />
        <button id="enfoque-cfg-save" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(59,130,246,.35);background:rgba(59,130,246,.18);color:#dbeafe;cursor:pointer;font-size:12px;font-weight:700;">
          💾 Salvar email
        </button>


        <div style="margin-top:10px;padding:8px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:rgba(255,255,255,.02);">
          <div style="font-size:11px;opacity:.85;margin-bottom:6px;font-weight:800;">Emails cadastrados</div>
          <div id="enfoque-cfg-emailList" style="display:flex;flex-direction:column;gap:6px;"></div>
          <button id="enfoque-cfg-clearEmails" style="margin-top:8px;width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fecaca;cursor:pointer;font-size:12px;font-weight:800;">
            🗑️ Excluir todos
          </button>
        </div>

        <div style="margin-top:10px;">
          ${__ETQ_UI__}
        </div>

        <div style="margin-top:10px;padding:8px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:rgba(255,255,255,.02);">
          <div style="font-size:11px;opacity:.85;margin-bottom:4px;">Email atual no SIGE (lido do header)</div>
          <div id="enfoque-cfg-current" style="font-size:12px;font-weight:800;word-break:break-all;">—</div>
          <div id="enfoque-cfg-match" style="margin-top:4px;font-size:11px;opacity:.85;">—</div>
          <button id="enfoque-cfg-applyNow" style="margin-top:8px;width:100%;padding:7px 10px;border-radius:10px;border:1px solid rgba(250,204,21,.35);background:rgba(250,204,21,.16);color:#fef9c3;cursor:pointer;font-size:12px;font-weight:700;">
            ✅ Aplicar agora
          </button>
        </div>
      </div>

      <div id="enfoque-cfg-status" style="margin-top:10px;font-size:12px;opacity:.9;"></div>
      <div style="margin-top:10px;font-size:11px;opacity:.7;line-height:1.35;">
        Regras:
        <ul style="margin:6px 0 0 16px;line-height:1.35;">
          <li>O botão <b>Cancelar Pedido</b> fica <b>invisível</b> por padrão.</li>
          <li>Ele só aparece se o email salvo aqui bater exatamente com o email do header do SIGE.</li>
        </ul>
      </div>
    </div>
  `;

  const statusEl = content.querySelector("#enfoque-cfg-status");
  const loginBox = content.querySelector("#enfoque-cfg-loginBox");
  const afterBox = content.querySelector("#enfoque-cfg-after");
  const passEl = content.querySelector("#enfoque-cfg-pass");
  const btnLogin = content.querySelector("#enfoque-cfg-login");
  const emailEl = content.querySelector("#enfoque-cfg-email");
  const btnSave = content.querySelector("#enfoque-cfg-save");
  const curEl = content.querySelector("#enfoque-cfg-current");
  const matchEl = content.querySelector("#enfoque-cfg-match");
  const btnApplyNow = content.querySelector("#enfoque-cfg-applyNow");
  const listEl = content.querySelector("#enfoque-cfg-emailList");
  const btnClear = content.querySelector("#enfoque-cfg-clearEmails");

  function __cfgNormEmail(v){
    return String(v || "").trim();
  }

  async function __cfgGetAllowedEmails(){
    const st = await __enfoqueStorageGet(["enfoq_cfg_emails_allowed", "enfoq_cfg_email_allowed"]);
    let arr = Array.isArray(st.enfoq_cfg_emails_allowed) ? st.enfoq_cfg_emails_allowed.slice() : [];

    // compat: versão antiga
    const legacy = __cfgNormEmail(st.enfoq_cfg_email_allowed || "");
    if (legacy) {
      const lk = legacy.toLowerCase();
      if (!arr.some(e => __cfgNormEmail(e).toLowerCase() === lk)) arr.push(legacy);
    }

    arr = arr.map(__cfgNormEmail).filter(Boolean);

    const seen = new Set();
    arr = arr.filter(e => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return arr;
  }

  async function __cfgSetAllowedEmails(arr){
    await __enfoqueStorageSet({ enfoq_cfg_emails_allowed: arr });
    // remove chave antiga se existir
    try { chrome.storage.local.remove(["enfoq_cfg_email_allowed"]); } catch(_) {}
  }

  async function renderEmailList(){
    if (!listEl) return;
    const arr = await __cfgGetAllowedEmails();
    if (!arr.length) {
      listEl.innerHTML = '<div style="font-size:11px;opacity:.7;">Nenhum email cadastrado.</div>';
      return;
    }
    listEl.innerHTML = arr.map(e => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(0,0,0,.18);">
        <div style="flex:1;font-size:12px;font-weight:800;word-break:break-all;">${escapeHtml(e)}</div>
        <button class="enfoque-cfg-delEmail" data-email="${encodeURIComponent(e)}" style="padding:6px 8px;border-radius:10px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fecaca;cursor:pointer;font-size:11px;font-weight:800;">Excluir</button>
      </div>
    `).join("");
  }

  async function paintCurrent() {
    const current = (document.querySelector("#nomeCurrentUsuarioHeader")?.textContent || "").trim();
    curEl.textContent = current || "—";

    const allowedList = await __cfgGetAllowedEmails();
    const ok = !!current && allowedList.some(e => e.toLowerCase() === current.toLowerCase());

    matchEl.textContent = allowedList.length
      ? (ok ? "✅ Email confere — Cancelar Pedido liberado." : "⛔ Email não confere — Cancelar Pedido continuará oculto.")
      : "⛔ Nenhum email autorizado salvo — Cancelar Pedido oculto.";
  }

  async function showAfter() {
    loginBox.style.display = "none";
    afterBox.style.display = "block";
    await renderEmailList();
    await paintCurrent();
  }


  if (window.__enfoqueCfgAuthed) {
    showAfter();
  } else {
    loginBox.style.display = "block";
    afterBox.style.display = "none";
  }

  btnLogin?.addEventListener("click", () => {
    const pass = String(passEl.value || "");
    if (pass === "Foque26") {
      window.__enfoqueCfgAuthed = true;
      statusEl.textContent = "Logado ✅";
      showAfter();
    } else {
      statusEl.textContent = "Senha incorreta ⛔";
    }
  });

    btnSave?.addEventListener("click", async () => {
    const email = String(emailEl.value || "").trim();
    if (!email || !/@/.test(email)) {
      statusEl.textContent = "Digite um email válido.";
      return;
    }

    const list = await __cfgGetAllowedEmails();
    const key = email.toLowerCase();

    if (list.some(e => String(e).toLowerCase() === key)) {
      statusEl.textContent = "Esse email já está cadastrado.";
      emailEl.value = "";
      await renderEmailList();
      await paintCurrent();
      __enfoqueApplyCancelButtonPolicy();
      return;
    }

    list.push(email);
    await __cfgSetAllowedEmails(list);

    statusEl.textContent = "Email adicionado ✅";
    emailEl.value = "";
    await renderEmailList();
    await paintCurrent();
    __enfoqueApplyCancelButtonPolicy();
  });

  // excluir um email específico
  listEl?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.(".enfoque-cfg-delEmail");
    if (!btn) return;
    const raw = btn.getAttribute("data-email") || "";
    const email = decodeURIComponent(raw);
    let list = await __cfgGetAllowedEmails();
    const before = list.length;
    list = list.filter(e => String(e).toLowerCase() !== String(email).toLowerCase());
    if (list.length === before) return;

    await __cfgSetAllowedEmails(list);
    statusEl.textContent = "Email removido ✅";
    await renderEmailList();
    await paintCurrent();
    __enfoqueApplyCancelButtonPolicy();
  });

  // excluir todos
  btnClear?.addEventListener("click", async () => {
    await __cfgSetAllowedEmails([]);
    statusEl.textContent = "Lista de emails limpa ✅";
    await renderEmailList();
    await paintCurrent();
    __enfoqueApplyCancelButtonPolicy();
  });


  btnApplyNow?.addEventListener("click", async () => {
    await paintCurrent();
    __enfoqueApplyCancelButtonPolicy();
    statusEl.textContent = "Aplicado ✅";
  });

  setTimeout(() => { try { paintCurrent(); } catch(_) {} }, 80);

  return;
}


if (section === "pedidos") {
  const pad2 = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const defaultFim = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  const defaultIni = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-01`;

  content.innerHTML = `${__ETQ_UI__}
    <h3 style="margin:0 0 8px;font-size:14px;">Pedidos 📋</h3>
    <p style="margin:0 0 10px;line-height:1.35;font-size:12px;color:#9ca3af;">
      Consulta o relatório <b>ReportPedidos/GetItens</b> direto no SIGE usando o Bearer já capturado pela extensão.
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:4px;">Data inicial
        <input id="sige-pedidos-ini" type="date" value="${defaultIni}" style="padding:8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#0b1220;color:#e5e7eb;" />
      </label>
      <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:4px;">Data final
        <input id="sige-pedidos-fim" type="date" value="${defaultFim}" style="padding:8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#0b1220;color:#e5e7eb;" />
      </label>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:4px;">Cliente
        <input id="sige-pedidos-cliente" type="text" placeholder="Opcional" style="padding:8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#0b1220;color:#e5e7eb;" />
      </label>
      <label style="font-size:11px;color:#9ca3af;display:flex;flex-direction:column;gap:4px;">Vendedor
        <input id="sige-pedidos-vendedor" type="text" placeholder="Opcional" style="padding:8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#0b1220;color:#e5e7eb;" />
      </label>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <button id="sige-pedidos-buscar" class="btn primary" style="height:34px;flex:1;">Buscar pedidos</button>
      <button id="sige-pedidos-limpar" class="btn" style="height:34px;">Limpar</button>
    </div>

    <div id="sige-pedidos-status" style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Pronto para buscar.</div>
    <div id="sige-pedidos-resumo" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;"></div>
    <div id="sige-pedidos-result" style="max-height:46vh;overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:10px;background:rgba(2,6,23,.25);"></div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusEl = $("sige-pedidos-status");
  const resultEl = $("sige-pedidos-result");
  const resumoEl = $("sige-pedidos-resumo");

  function pedidosEscape(v){
    return String(v == null ? "" : v).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
  }
  function pedidosMoney(v){
    const n = Number(v || 0);
    try { return n.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); } catch(_) { return 'R$ ' + n.toFixed(2); }
  }
  function pedidosDateToSige(v){
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || '');
  }
  function pedidosPayload(page){
    return {
      Pagina: { Number: page || 0, Lenght: 25 },
      Filtro: {
        Empresa: "",
        Cliente: String($("sige-pedidos-cliente").value || "").trim(),
        Vendedor: String($("sige-pedidos-vendedor").value || "").trim(),
        FiltrarPor: "Data",
        ValorInicial: "",
        ValorFinal: "",
        Categoria: "",
        StatusSistema: "",
        Status: "",
        DataInicial: pedidosDateToSige($("sige-pedidos-ini").value),
        DataFinal: pedidosDateToSige($("sige-pedidos-fim").value),
        TipoPeriodo: 10
      },
      Order: { DisplayName: "Data Crescente", FieldName: "Data", Ascending: true }
    };
  }
  function pedidosRowsFrom(resp){
    if (!resp) return [];
    if (Array.isArray(resp.PedidoItens)) return resp.PedidoItens;
    if (Array.isArray(resp.Itens)) return resp.Itens;
    if (Array.isArray(resp.Data)) return resp.Data;
    if (Array.isArray(resp)) return resp;
    return [];
  }
  function pedidosPageCount(resp){
    const p = resp && Array.isArray(resp.Paginas) ? resp.Paginas : [];
    if (!p.length) return 1;
    let maxN = 0;
    p.forEach(x => { const n = Number(x && x.Number); if (Number.isFinite(n) && n > maxN) maxN = n; });
    return maxN + 1;
  }
  function renderResumo(rows, totalPages, limitado){
    let total = 0;
    const pedidos = new Set();
    const clientes = new Set();
    rows.forEach(r => {
      total += Number(r.ValorTotal || r.Total || r.Valor || 0) || 0;
      const cod = r.Codigo != null ? r.Codigo : (r.Pedido || r.Numero || '');
      if (cod) pedidos.add(String(cod));
      if (r.Cliente) clientes.add(String(r.Cliente));
    });
    const cards = [
      ["Total", pedidosMoney(total)],
      ["Itens", String(rows.length)],
      ["Pedidos", String(pedidos.size || '-')],
      ["Clientes", String(clientes.size || '-')]
    ];
    resumoEl.innerHTML = cards.map(([k,v]) => `<div style="padding:9px;border:1px solid rgba(148,163,184,.22);border-radius:10px;background:rgba(255,255,255,.04);"><div style="font-size:10px;color:#9ca3af;">${k}</div><div style="font-weight:800;font-size:13px;">${v}</div></div>`).join('');
    if (limitado) statusEl.textContent = `Resultado limitado: ${rows.length} itens de ${totalPages} páginas encontradas.`;
  }
  function renderTabela(rows){
    if (!rows.length) {
      resultEl.innerHTML = `<div style="padding:12px;color:#9ca3af;font-size:12px;">Nenhum item encontrado nesse filtro.</div>`;
      return;
    }
    const topRows = rows.slice(0, 250);
    resultEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead style="position:sticky;top:0;background:#0b1220;z-index:1;">
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.25);">Data</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.25);">Pedido</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.25);">Cliente</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,.25);">Produto</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid rgba(148,163,184,.25);">Qtd</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid rgba(148,163,184,.25);">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${topRows.map(r => {
            const data = r.DataNota || r.Data || r.DataPedido || '';
            const pedido = r.Codigo != null ? r.Codigo : (r.Pedido || r.Numero || '');
            const produto = r.Produto || r.Descricao || r.NomeProduto || r.Item || '';
            const qtd = r.Quantidade != null ? r.Quantidade : (r.Qtd || '');
            const val = r.ValorTotal != null ? r.ValorTotal : (r.Total || r.Valor || 0);
            return `<tr>
              <td style="padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);white-space:nowrap;">${pedidosEscape(data)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);">${pedidosEscape(pedido)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);min-width:120px;">${pedidosEscape(r.Cliente || '')}</td>
              <td style="padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);min-width:160px;">${pedidosEscape(produto)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);text-align:right;">${pedidosEscape(qtd)}</td>
              <td style="padding:7px 8px;border-bottom:1px solid rgba(148,163,184,.12);text-align:right;white-space:nowrap;">${pedidosMoney(val)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${rows.length > topRows.length ? `<div style="padding:8px;color:#9ca3af;font-size:11px;">Mostrando 250 de ${rows.length} itens para manter o painel leve.</div>` : ''}
    `;
  }
  async function buscarPedidos(){
    const btn = $("sige-pedidos-buscar");
    btn.disabled = true;
    resumoEl.innerHTML = '';
    resultEl.innerHTML = '';
    try {
      statusEl.textContent = 'Buscando Bearer...';
      const token = await new Promise((resolve) => __enfoqueGetToken((t) => resolve(t)));
      if (!token) throw new Error('Bearer ausente. Clique em 🔑 Bearer na aba Configurações/Etiquetas ou navegue em um relatório do SIGE para capturar.');

      statusEl.textContent = 'Consultando página 1...';
      const first = await __enfoqueCallPageWorld('ENFOQUE_PEDIDOS_QUERY', { token, payload: pedidosPayload(0) }, 30000);
      if (!first || !first.ok) throw new Error(first && first.error ? first.error : 'Falha na API');

      let rows = pedidosRowsFrom(first.data);
      const totalPages = pedidosPageCount(first.data);
      const maxPages = Math.min(totalPages, 20);
      for (let page = 1; page < maxPages; page++) {
        statusEl.textContent = `Consultando página ${page + 1}/${maxPages}...`;
        const resp = await __enfoqueCallPageWorld('ENFOQUE_PEDIDOS_QUERY', { token, payload: pedidosPayload(page) }, 30000);
        if (!resp || !resp.ok) throw new Error(resp && resp.error ? resp.error : `Falha na página ${page + 1}`);
        rows = rows.concat(pedidosRowsFrom(resp.data));
      }
      statusEl.textContent = `Busca concluída: ${rows.length} itens.`;
      renderResumo(rows, totalPages, totalPages > maxPages);
      renderTabela(rows);
    } catch (e) {
      statusEl.textContent = 'Erro: ' + (e && e.message ? e.message : String(e));
      resultEl.innerHTML = `<div style="padding:12px;color:#fecaca;font-size:12px;">Não foi possível buscar os pedidos.</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  $("sige-pedidos-buscar").addEventListener("click", buscarPedidos);
  $("sige-pedidos-limpar").addEventListener("click", () => {
    $("sige-pedidos-cliente").value = "";
    $("sige-pedidos-vendedor").value = "";
    resumoEl.innerHTML = "";
    resultEl.innerHTML = "";
    statusEl.textContent = "Filtros limpos.";
  });
  return;
}


if (section === "sobre") {
      content.innerHTML = `
        <h3 style="margin:0 0 8px;font-size:14px;">Sobre</h3>
        <div style="max-height:65vh;overflow:auto;padding-right:6px;">
          <p style="margin:0 0 10px;font-size:12px;line-height:1.45;opacity:.9;">
            Esta extensão adiciona ferramentas extras ao SIGE para agilizar rotinas da Enfoque Papelaria.
            Tudo roda localmente no seu Chrome (sem instalar programas).
          </p>

          <div style="padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:rgba(255,255,255,.03);margin-bottom:10px;">
            <div style="font-weight:800;font-size:12px;margin-bottom:6px;">Observações (Orçamento Escolar)</div>
            <ul style="margin:0 0 0 16px;font-size:12px;line-height:1.45;">
              <li>Guarda observações por <b>código do orçamento</b> (e nome da escola/cliente).</li>
              <li>Sincroniza entre PCs via <b>GitHub Gist</b> (precisa configurar Gist ID + Token na aba Observações).</li>
              <li>Sem login: você pode <b>criar/editar/excluir</b> (desde que o Gist esteja configurado).</li>
              <li>Notificações: um contador aparece no botão Σ quando chegam atualizações novas.</li>
            </ul>
          </div>

          <div style="padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:rgba(255,255,255,.03);margin-bottom:10px;">
            <div style="font-weight:800;font-size:12px;margin-bottom:6px;">Etiquetas (PDV / Produtos)</div>
            <ul style="margin:0 0 0 16px;font-size:12px;line-height:1.45;">
              <li>Modo etiquetas no PDV e páginas de produtos, com pré-visualização e impressão.</li>
              <li>Atalho via parâmetro <code>?etq=1</code> (quando disponível).</li>
            </ul>
          </div>

          <div style="padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:rgba(255,255,255,.03);margin-bottom:10px;">
            <div style="font-weight:800;font-size:12px;margin-bottom:6px;">Defeituosos</div>
            <ul style="margin:0 0 0 16px;font-size:12px;line-height:1.45;">
              <li>Ferramentas auxiliares para telas relacionadas a defeituosos/etiquetas (quando ativadas).</li>
            </ul>
          </div>

          <div style="padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:rgba(255,255,255,.03);margin-bottom:10px;">
            <div style="font-weight:800;font-size:12px;margin-bottom:6px;">BaterProd</div>
            <ul style="margin:0 0 0 16px;font-size:12px;line-height:1.45;">
              <li>Envio rápido de código/fluxos auxiliares conforme rotina interna.</li>
            </ul>
          </div>

          <p style="margin:0;font-size:12px;opacity:.75;">
            Dica: se algo não aparecer, recarregue a extensão em <b>chrome://extensions</b> e dê F5 no SIGE.
          </p>
        </div>
      `;
    }
  }

  btn.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);


  // Toast (opcional)
  try {
    const toastClose = panel.querySelector("#sige-toast-close");
    if (toastClose) toastClose.addEventListener("click", () => {
      const t = panel.querySelector("#sige-toast");
      if (t) t.classList.remove("show");
    });
  } catch (e) {}


  navItems.forEach(n => {
    n.addEventListener("click", () => renderSection(n.dataset.section));
  });

  window.__assistentePanelInjected = true;
  } catch (e) {
    try { window.__assistentePanelInjected = false; } catch (_) {}
    console.warn("[SIGE Assistente] Falha ao injetar painel lateral:", e);
  }
}

// =============================================================
// 14. ESCUTAR COMANDOS DO BACKGROUND + MENU DE CONTEXTO
// =============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "ENFOQUE_CAIXA_CAPTURE_HTML") {
    sendResponse({ ok: true, url: location.href, html: document.documentElement.outerHTML });
    return true;
  }
  if (msg.action === "ENFOQUE_CAIXA_LOGIN_FILTER") {
    (async () => {
      function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
      async function waitForSelector(sel, timeoutMs){
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const el = document.querySelector(sel);
          if (el) return el;
          await sleep(250);
        }
        throw new Error('SELETOR_NAO_ENCONTRADO: ' + sel);
      }
      function setInput(el, val){
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }
      try {
        let emailEl = document.querySelector('#txtEmail');
        let passEl = document.querySelector('#txtPass');
        if (emailEl && passEl) {
          setInput(emailEl, msg.loginEmail || '');
          setInput(passEl, msg.loginPass || '');
          const btn = document.querySelector('button[onclick*="btn_Login"]') || document.querySelector('#btn_Login');
          if (!btn) throw new Error('BOTAO_LOGIN_NAO_ENCONTRADO');
          btn.click();
          await sleep(5000);
        }
        const vend = await waitForSelector('#txtFiltroVendedor', 30000);
        setInput(vend, msg.operadorEmail || '');
        await sleep(600);
        const emp = await waitForSelector('#txtFiltroEmpresa', 10000);
        setInput(emp, msg.empresa || '');
        await sleep(600);
        const filterBtn = await waitForSelector('#Button1', 10000);
        filterBtn.click();
        await sleep(3000);
        sendResponse({ ok: true, stage: 'FILTROS_APLICADOS', url: location.href });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e), url: location.href });
      }
    })();
    return true;
  }
  if (msg.action === "restoreAll") {
    restoreBackup();
  }
  if (msg.action === "restoreItems") {
    restoreOnlyProducts();
  }
  if (msg.action === "clearBackup") {
    chrome.storage.local.remove("sige_backup");
  }

  // Ação do menu de contexto "Alterar depósito final"
  if (msg.action === "changeDestinoFinal") {
    changeDestinoFinal();
  }

  if (sendResponse) sendResponse({ ok: true });
});

// Função chamada ao clicar em "Alterar depósito final" no menu de contexto

// Lista fixa de depósitos para o popup do depósito destino
const SIGE_DEPOSITOS_PRE_DEFINIDOS = [
  "Feira 1",
  "Megadestec",
  "Feira 2",
  "Ilha Plaza",
  "Itaipú",
  "DEPOSITO Celestino",
  "Colegio ABEL",
  "DEFEITUOSOS",
  "Icaraí",
  "Papel & Arte",
  "São Gonçalo",
  "ESTOQUE",
  "Centro",
  "Plinio Leite Niterói",
  "Teste (não usar)",
  "Copacabana"
];

function changeDestinoFinal() {
  ensureHumanType();

  let campo = document.querySelector("#Deposito2");
  if (!campo) {
    alert("Campo de depósito destino (#Deposito2) não encontrado.\nAbra a tela de movimentação entre depósitos (EDIT).");
    return;
  }

  // Se já existe um popup aberto, remove antes de criar outro
  const existente = document.getElementById("sige-deposito-destino-popup");
  if (existente) {
    existente.remove();
  }

  // Criar overlay
  const overlay = document.createElement("div");
  overlay.id = "sige-deposito-destino-popup";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.4)";
  overlay.style.zIndex = "999999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  // Container do popup
  const box = document.createElement("div");
  box.style.background = "#fff";
  box.style.borderRadius = "8px";
  box.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  box.style.minWidth = "280px";
  box.style.maxWidth = "360px";
  box.style.maxHeight = "70vh";
  box.style.display = "flex";
  box.style.flexDirection = "column";
  box.style.padding = "16px";
  box.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const titulo = document.createElement("div");
  titulo.textContent = "Escolha o depósito destino";
  titulo.style.fontWeight = "600";
  titulo.style.marginBottom = "8px";
  titulo.style.fontSize = "15px";

  const lista = document.createElement("div");
  lista.style.overflowY = "auto";
  lista.style.margin = "8px 0 12px 0";
  lista.style.maxHeight = "45vh";

  SIGE_DEPOSITOS_PRE_DEFINIDOS.forEach((nome) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = nome;
    botao.style.display = "block";
    botao.style.width = "100%";
    botao.style.textAlign = "left";
    botao.style.border = "1px solid #ddd";
    botao.style.borderRadius = "4px";
    botao.style.padding = "6px 8px";
    botao.style.marginBottom = "4px";
    botao.style.fontSize = "14px";
    botao.style.cursor = "pointer";
    botao.style.background = (campo.value && campo.value.trim() === nome) ? "#e6f3ff" : "#f8f8f8";

    botao.addEventListener("mouseenter", () => {
      botao.style.background = "#e6f3ff";
    });
    botao.addEventListener("mouseleave", () => {
      if (campo.value && campo.value.trim() === nome) {
        botao.style.background = "#e6f3ff";
      } else {
        botao.style.background = "#f8f8f8";
      }
    });

    botao.addEventListener("click", () => {
      humanType("#Deposito2", nome);
      console.log("🏷 Depósito destino alterado via menu de contexto para:", nome);
      overlay.remove();
    });

    lista.appendChild(botao);
  });

  // Rodapé com botão cancelar
  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.justifyContent = "flex-end";
  footer.style.gap = "8px";

  const btnCancelar = document.createElement("button");
  btnCancelar.type = "button";
  btnCancelar.textContent = "Cancelar";
  btnCancelar.style.border = "1px solid #ccc";
  btnCancelar.style.borderRadius = "4px";
  btnCancelar.style.padding = "4px 10px";
  btnCancelar.style.fontSize = "13px";
  btnCancelar.style.cursor = "pointer";
  btnCancelar.style.background = "#f5f5f5";

  btnCancelar.addEventListener("click", () => {
    overlay.remove();
  });

  footer.appendChild(btnCancelar);

  box.appendChild(titulo);
  box.appendChild(lista);
  box.appendChild(footer);
  overlay.appendChild(box);

  // Clique fora fecha também
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);

      // ===== Bearer manual (fixo) + validação (API) =====
      (function setupBearerUI(){
        try {
          const statusSpan = document.createElement("span");
          statusSpan.id = "enfoque-bearer-status";
          statusSpan.style.marginLeft = "10px";
          statusSpan.style.fontSize = "12px";
          statusSpan.style.fontWeight = "600";
          statusSpan.style.color = "#374151";
          statusSpan.textContent = "Bearer: (carregando...)";

          const btn = document.createElement("button");
          btn.id = "enfoque-bearer-btn";
          btn.className = "btn btn-blue";
          btn.style.marginLeft = "10px";
          btn.textContent = "🔑 Bearer";

          const headerRight = overlay.querySelector(".pdv-header-right");
          if (headerRight) {
            headerRight.appendChild(btn);
            headerRight.appendChild(statusSpan);
          }

          function setStatus(ok, label){
            if (!statusSpan) return;
            if (ok === true) {
              statusSpan.textContent = "Bearer: OK" + (label ? " ("+label+")" : "");
              statusSpan.style.color = "#166534";
            } else if (ok === false) {
              statusSpan.textContent = "Bearer: inválido" + (label ? " ("+label+")" : "");
              statusSpan.style.color = "#b91c1c";
            } else {
              statusSpan.textContent = "Bearer: " + (label || "não definido");
              statusSpan.style.color = "#374151";
            }
          }

          function loadStatus(){
            chrome.storage.local.get(["sige_api_token_manual", "sige_api_token"], (res) => {
              const manual = __enfoqueNormalizeBearer(res && res.sige_api_token_manual);
              const autoT = __enfoqueNormalizeBearer(res && res.sige_api_token);
              if (manual) setStatus(null, "manual (salvo)");
              else if (autoT) setStatus(null, "capturado");
              else setStatus(null, "não definido");
            });
          }

          async function validate(token){
            try {
              const resp = await __enfoqueCallPageWorld("ENFOQUE_VALIDATE", { token }, 12000);
              if (resp && resp.ok === true) return { ok: true };
              return { ok: false, error: (resp && resp.error) ? resp.error : "VALIDATE_FAILED" };
            } catch (e) {
              return { ok: false, error: String(e && e.message ? e.message : e) };
            }
          }

          btn.addEventListener("click", async () => {
            const current = await new Promise((r)=>chrome.storage.local.get(["sige_api_token_manual"], (res)=>r(res && res.sige_api_token_manual ? res.sige_api_token_manual : "")));
            const tokenRaw = prompt("Cole aqui o Bearer do SIGE (pode colar com ou sem 'Bearer '):", current || "");
            if (tokenRaw === null) return;

            const token = __enfoqueNormalizeBearer(tokenRaw);
            if (!token) {
              alert("Bearer inválido. Cole o token completo (com ou sem 'Bearer ').");
              return;
            }

            console.log("[Etiquetas] Salvando bearer manual...");
            chrome.storage.local.set({ sige_api_token_manual: token }, async () => {
              console.log("[Etiquetas] Bearer salvo. Validando no SIGE...");
              setStatus(null, "validando...");

              const v = await validate(token);
              if (v.ok) {
                console.log("[Etiquetas] Bearer validado com sucesso.");
                setStatus(true);
                alert("Bearer OK ✅");
              } else {
                console.warn("[Etiquetas] Falha na validação:", v.error);
                setStatus(false, v.error);
                alert("Bearer inválido ❌\n" + v.error);
              }
            });
          });

          loadStatus();
        } catch (e) {
          console.warn("[SIGE Assistente] Erro ao configurar UI do Bearer:", e);
        }
      })();


}


// =============================================================
// FIM DO CONTENT SCRIPT
// =============================================================

try { injectPDVEtiquetasBanner(); } catch (e) { console.warn("[SIGE Assistente] Erro ao ativar banner de etiquetas:", e); }

console.log("✅ Assistente SIGE Inteligente (extensão) carregado (versão corrigida).");




// =============================================================
// API DE PRODUTOS (SEM CACHE LOCAL) - PARA ETIQUETAS
// =============================================================
const SIGE_PRODUTOS_API_URL = "https://enfoquepapelaria.meusige.com.br/api/v2/Produtos/GetList";
/* token hardcoded removido – usar chrome.storage.local.sige_api_token */

function sigeMontarPayloadBuscaCodigo(codigo) {
  const cod = String(codigo || "").trim();
  return {
    arg: "",
    arg2: "",
    data: JSON.stringify({
      PesquisaSimples: cod,
      EhPesquisaSimples: true,
      FiltroGenero: "",
      FiltroAtributo: "",
      FiltroOrdenacao: "Nome",
      TabelaPreco: "",
      Pagina: {
        Number: 1,
        Lenght: 10
      }
    })
  };
}

function sigeNormalizarProdutoApi(bruto, codigoFallback) {
  bruto = bruto || {};
  // IMPORTANTE:
  // No SIGE, alguns endpoints retornam um campo "Codigo" que pode ser um id interno
  // (e em alguns casos pode vir como 0). Para etiquetas/defeituosos, o que a equipe
  // usa como "código" é o Código NFe (ou barras). Por isso priorizamos CodigoNFe.
  const pick = (v) => {
    const s = (v == null) ? "" : String(v).trim();
    // evita "0" e valores vazios
    if (!s || s === "0") return "";
    return s;
  };

  const cod =
    pick(bruto.CodigoNFe) ||
    pick(bruto.CodigoBarras) ||
    pick(bruto.CodigoProduto) ||
    pick(bruto.Codigo) ||
    String(codigoFallback || "").trim();

  const nome =
    bruto.Nome ||
    bruto.Descricao ||
    bruto.DescricaoProduto ||
    "";

  const marca =
    bruto.Marca ||
    bruto.MarcaDescricao ||
    "";

  const precoNum =
    Number(bruto.PrecoVenda) ||
    Number(bruto.ValorVenda) ||
    Number(bruto.Preco) ||
    Number(bruto.ValorUnitario) ||
    0;

  const precoStr = precoNum
    ? "R$ " + precoNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";

  return {
    codigo: cod,
    nome: nome,
    marca: marca,
    precoNum: precoNum,
    precoStr: precoStr
  };
}



function sigeNormalizarProdutoBackend(produto, codigoFallback) {
  const p = produto && typeof produto === "object" ? produto : {};
  const raw = p.raw && typeof p.raw === "object" ? Object.assign({}, p.raw) : {};

  if (!raw.Id && p.id) raw.Id = p.id;
  if (!raw.CodigoNFe && p.code) raw.CodigoNFe = p.code;
  if (!raw.Codigo && p.internalCode) raw.Codigo = p.internalCode;
  if (!raw.Nome && p.name) raw.Nome = p.name;
  if (!raw.Marca && p.brand) raw.Marca = p.brand;
  if (raw.PrecoVenda == null && (p.unitPrice != null || p.price != null || p.precoNum != null)) {
    raw.PrecoVenda = p.unitPrice != null ? p.unitPrice : (p.price != null ? p.price : p.precoNum);
  }

  const norm = sigeNormalizarProdutoApi(raw, codigoFallback);
  norm.id = raw.Id || p.id || "";
  norm.possuiImagem = Boolean(raw.PossuiImagem || p.hasImage);
  norm.raw = raw;
  return norm;
}

function sigeBuscarProdutoNaApi(codigo, cb) {
  const cod = String(codigo || "").trim();
  if (!cod) { cb(null); return; }

  try {
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
      console.warn("[SIGE Assistente] Runtime da extensão indisponível para buscar produto no backend.");
      cb(null);
      return;
    }

    chrome.runtime.sendMessage(
      { type: "enfoque-products-search", query: cod, limit: 25 },
      function(resp) {
        try {
          if (chrome.runtime.lastError) {
            console.warn("[SIGE Assistente] Falha ao chamar backend de produtos:", chrome.runtime.lastError.message);
            cb(null);
            return;
          }

          if (!resp || resp.ok !== true) {
            console.warn("[SIGE Assistente] Backend de produtos falhou:", resp && resp.error ? resp.error : resp);
            cb(null);
            return;
          }

          const data = resp.data || {};
          const lista = Array.isArray(data.products)
            ? data.products
            : (Array.isArray(data.Produtos) ? data.Produtos : []);

          if (!lista.length) { cb(null); return; }

          const codStr = String(cod || "").trim();
          const codDigits = codStr.replace(/\D/g, "");
          const last6 = codDigits.slice(-6);

          const exatos = [];
          const ult6 = [];
          const seen = new Set();

          for (const item of lista) {
            const raw = item && item.raw && typeof item.raw === "object" ? item.raw : item;
            const cnfe = String(
              (raw && (raw.CodigoNFe || raw.CodigoBarras || raw.CodigoProduto || raw.Codigo)) ||
              (item && (item.code || item.codigo)) ||
              ""
            ).trim();

            if (!cnfe) continue;
            const cnfeDigits = cnfe.replace(/\D/g, "");
            if (!cnfeDigits) continue;

            const nomeKey = String((raw && (raw.Nome || raw.Descricao || raw.DescricaoProduto)) || (item && item.name) || "");
            const key = cnfeDigits + "|" + nomeKey;

            if (codDigits && cnfeDigits === codDigits) {
              if (!seen.has("E:" + key)) { exatos.push(item); seen.add("E:" + key); }
              continue;
            }

            if (last6 && cnfeDigits.endsWith(last6)) {
              if (!seen.has("L:" + key)) { ult6.push(item); seen.add("L:" + key); }
            }
          }

          const candidatos = exatos.length ? exatos : ult6;

          if (candidatos.length > 1) {
            cb({
              __enfoqueMultiple: true,
              options: candidatos.map(p => sigeNormalizarProdutoBackend(p, codStr)),
              codigoDigitado: codStr,
              last6
            });
            return;
          }

          const escolhido =
            (exatos.length === 1 ? exatos[0] : null) ||
            (ult6.length === 1 ? ult6[0] : null) ||
            lista[0];

          cb(sigeNormalizarProdutoBackend(escolhido, codStr));
        } catch (err) {
          console.warn("[SIGE Assistente] Erro ao processar resposta do backend de produtos:", err);
          cb(null);
        }
      }
    );
  } catch (e) {
    console.warn("[SIGE Assistente] Erro inesperado ao buscar produto no backend da extensão:", e);
    cb(null);
  }
}





// =============================================================
// MODO DEFEITUOSOS NA TELA /ProdutosPrecoVenda/Report?etq=2
// =============================================================
(function() {
  try {
    if (!window.location || !window.location.href) return;
    var href = window.location.href.toLowerCase();
    if (href.indexOf("/sistema/produtosprecovenda/report") === -1) return;

    try {
      var u = new URL(window.location.href);
      var etqParam = u.searchParams.get("etq");
      if (etqParam !== "2") return;
    } catch (e) {
      if (href.indexOf("etq=2") === -1) return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initEnfoqueDefeituososOverlayPage);
    } else {
      initEnfoqueDefeituososOverlayPage();
    }
  } catch (e) {
    console.warn("[SIGE Assistente] Erro ao preparar modo Defeituosos (etq=2):", e);
  }
})();

function initEnfoqueDefeituososOverlayPage() {
  try {
    if (document.getElementById("enfoque-def-overlay")) return;

    const styleId = "enfoque-def-overlay-style";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        #enfoque-def-overlay { position: fixed; inset: 0; z-index: 999999; background: #0b1220; color: #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; overflow: auto; }
        #enfoque-def-overlay * { box-sizing: border-box; }
        .enfoque-def-shell { width: 980px; max-width: calc(100%% - 32px); margin: 18px auto; background: rgba(255,255,255,.04); border: 1px solid rgba(148,163,184,.22); border-radius: 16px; padding: 16px; box-shadow: 0 0 40px rgba(0,0,0,.45); }
        .enfoque-def-top { display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .enfoque-def-top h2 { margin:0; font-size: 16px; }
        .enfoque-def-top .hint { font-size:12px; color:#9ca3af; }
        .enfoque-def-top .btn { padding:6px 10px; border-radius:10px; border:1px solid rgba(148,163,184,.35); background: rgba(2,6,23,.8); color:#e5e7eb; cursor:pointer; }
        .enfoque-def-top .btn:hover { filter: brightness(1.1); }
      `;
      (document.head || document.documentElement).appendChild(st);
    }

    const overlay = document.createElement("div");
    overlay.id = "enfoque-def-overlay";
    overlay.innerHTML = `
      <div class="enfoque-def-shell">
        <div class="enfoque-def-top">
          <div>
            <h2>Defeituosos</h2>
            <div class="hint">Página de apoio (etq=2) • busca na API e exporta Word (.doc)</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button id="enfoque-def-close" class="btn">Sair</button>
          </div>
        </div>

        <div id="enfoque-def-content">
          <h3 style="margin:0 0 8px;font-size:14px;">Defeituosos</h3>
          <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;line-height:1.4;">
            Digite 6 últimos dígitos (ou 12 completos). Se vier mais de um resultado, escolha. Depois informe quantidade e motivo e adicione na pasta.
          </p>

          <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <label style="font-size:12px;color:#cbd5e1;">Pasta</label>
              <select id="sige-def-folder-select" style="min-width:220px;max-width:100%%;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;"></select>
              <button class="btn" id="sige-def-folder-new">+ Nova pasta</button>
              <button class="btn danger" id="sige-def-folder-del" title="Excluir pasta">Excluir</button>
            </div>
            <div id="sige-def-folder-newrow" style="display:none;margin-top:10px;gap:8px;align-items:center;flex-wrap:wrap;">
              <input id="sige-def-folder-name" type="text" placeholder="Nome da pasta" style="flex:1;min-width:260px;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;" />
              <button class="btn" id="sige-def-folder-create">Criar</button>
              <button class="btn ghost" id="sige-def-folder-cancel">Cancelar</button>
            </div>
          </div>

          <div style="margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
            <div style="font-weight:700;margin-bottom:8px;">Buscar produto</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input id="sige-def-code" type="text" placeholder="Código (6 últimos ou 12)" style="flex:1;min-width:260px;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;" />
              <button class="btn" id="sige-def-search">Buscar</button>
            </div>
            <div id="sige-def-status" style="margin-top:8px;font-size:12px;color:#9ca3af;"></div>
            <div id="sige-def-results" style="margin-top:8px;display:flex;flex-direction:column;gap:6px;"></div>
            <div id="sige-def-selected" style="margin-top:10px;display:none;padding:10px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(0,0,0,.15);">
              <div style="font-weight:700;" id="sige-def-selected-title"></div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
                <input id="sige-def-qtd" type="number" min="1" placeholder="Quantidade" style="width:160px;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;" />
                <input id="sige-def-motivo" type="text" placeholder="Motivo" style="flex:1;min-width:260px;padding:6px 8px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:#020617;color:#e5e7eb;font-size:12px;" />
                <button class="btn" id="sige-def-add">Adicionar</button>
              </div>
            </div>
          </div>

          <div style="margin:0;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:rgba(255,255,255,.03);">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <div style="font-weight:700;">Itens da pasta</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn" id="sige-def-export">Exportar Word (.doc)</button>
                <button class="btn danger" id="sige-def-clear">Limpar itens</button>
              </div>
            </div>
            <div id="sige-def-items" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // fecha overlay (e remove etq=2 da URL para não reabrir)
    const btnClose = document.getElementById("enfoque-def-close");
    if (btnClose) {
      btnClose.onclick = () => {
        try { overlay.remove(); } catch (_) {}
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("etq");
          history.replaceState({}, "", u.toString());
        } catch (_) {}
      };
    }

    // Reaproveita a mesma lógica da aba do menu lateral
    try { initDefeituososPanel(); } catch (e) { console.warn("[SIGE Assistente] Defeituosos overlay: falha ao iniciar:", e); }
  } catch (e) {
    console.warn("[SIGE Assistente] Erro no overlay Defeituosos:", e);
  }
}

// =============================================================
// API (RELATÓRIO) - PARA "DEFEITUOSOS" (ProdutosPrecoVenda/Report)
// =============================================================
const SIGE_REPORT_PRODUTOS_PRECO_URL = "https://enfoquepapelaria.meusige.com.br/api/v2/ReportProdutosPrecoVenda/Get";

function __enfoqueFindFirstArray(obj, maxDepth) {
  maxDepth = (maxDepth == null) ? 5 : maxDepth;
  const seen = new Set();

  function walk(node, depth) {
    if (!node || depth > maxDepth) return null;
    if (typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      // preferimos array de objetos (candidatos a produtos)
      const ok = node.length && node.every(x => x && typeof x === "object" && !Array.isArray(x));
      return ok ? node : null;
    }

    for (const k of Object.keys(node)) {
      const v = node[k];
      if (!v) continue;
      if (Array.isArray(v)) {
        const ok = v.length && v.every(x => x && typeof x === "object" && !Array.isArray(x));
        if (ok) return v;
      }
    }

    for (const k of Object.keys(node)) {
      const v = node[k];
      const got = walk(v, depth + 1);
      if (got) return got;
    }
    return null;
  }

  return walk(obj, 0);
}

function __enfoqueGetCodigoDigits(prod) {
  try {
    const raw =
      (prod && prod.CodigoNFe != null && String(prod.CodigoNFe).trim()) ||
      (prod && prod.Codigo != null && String(prod.Codigo).trim()) ||
      (prod && prod.CodigoProduto != null && String(prod.CodigoProduto).trim()) ||
      (prod && prod.CodigoBarras != null && String(prod.CodigoBarras).trim()) ||
      "";
    return String(raw || "").replace(/\D/g, "");
  } catch (_) {
    return "";
  }
}

function sigeBuscarProdutoPrecoVendaNaApi(codigo, cb) {
  const cod = String(codigo || "").trim();
  if (!cod) { cb(null); return; }

  __enfoqueGetToken(async (token) => {
    if (!token) {
      console.warn("[SIGE Assistente] Token ausente. Cole um Bearer manual (🔑 Bearer) ou navegue no SIGE para capturar.");
      cb(null);
      return;
    }

    try {
      const resp = await __enfoqueCallPageWorld("ENFOQUE_PRECO_QUERY", { codigo: cod, token }, 12000);
      if (!resp || resp.ok !== true) {
        console.warn("[SIGE Assistente] API (Produtos/GetList) falhou:", resp && resp.error ? resp.error : resp);
        cb(null);
        return;
      }

      const dados = resp.data || {};
      // Alguns endpoints retornam {Produtos:[...]}, outros retornam {Data:{...}} etc.
      const lista = (dados && Array.isArray(dados.Produtos)) ? dados.Produtos : (__enfoqueFindFirstArray(dados, 6) || []);
      if (!lista.length) { cb(null); return; }

      const codStr = String(cod || "").trim();
      const codDigits = codStr.replace(/\D/g, "");
      const last6 = codDigits.slice(-6);

      const exatos = [];
      const ult6 = [];
      const seen = new Set();

      for (const p of lista) {
        const pDigits = __enfoqueGetCodigoDigits(p);
        if (!pDigits) continue;
        const key = pDigits + "|" + (p && (p.Nome || p.Descricao || p.DescricaoProduto || ""));

        if (codDigits && pDigits === codDigits) {
          if (!seen.has("E:" + key)) { exatos.push(p); seen.add("E:" + key); }
          continue;
        }

        if (last6 && pDigits.endsWith(last6)) {
          if (!seen.has("L:" + key)) { ult6.push(p); seen.add("L:" + key); }
        }
      }

      const candidatos = (exatos.length ? exatos : ult6);

      if (candidatos.length > 1) {
        const opcoes = candidatos.map(p => sigeNormalizarProdutoApi(p, codStr));
        cb({ __enfoqueMultiple: true, options: opcoes, codigoDigitado: codStr, last6: last6 });
        return;
      }

      let escolhido = null;
      if (exatos.length === 1) escolhido = exatos[0];
      else if (ult6.length === 1) escolhido = ult6[0];
      else escolhido = lista[0];

      cb(sigeNormalizarProdutoApi(escolhido, codStr));
    } catch (e) {
      console.warn("[SIGE Assistente] Erro inesperado ao buscar produto no relatório de preços:", e);
      cb(null);
    }
  });
}


// =============================================================
// UI: DEFEITUOSOS (pasta/lista + export Word)
// =============================================================
function __defeituososNowStamp() {
  try {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  } catch (_) {
    return String(Date.now());
  }
}

function __defeituososSafeFileName(v) {
  return String(v || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-\.]+/g, "")
    .slice(0, 80) || "defeituosos";
}

function __defeituososBuildWordHtml(folderName, itens) {
  const escape = (s) => String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

  const blocks = (itens || []).map((it) => {
    return `
      <p>cod: ${escape(it.codigo)}</p>
      <p>nome: ${escape(it.nome)}</p>
      <p>quantidade: ${escape(it.quantidade)}</p>
      <p>motivo: ${escape(it.motivo)}</p>
      <p>&nbsp;</p>
    `;
  }).join("\n");

  return `
  <html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${escape(folderName || "Defeituosos")}</title>
    </head>
    <body style="font-family:Calibri, Arial, sans-serif;">
      <p style="text-align:center;font-size:16pt;font-weight:bold;margin:0;">Defeituosos</p>
      <p>&nbsp;</p>
      <p>&nbsp;</p>
      ${blocks || "<p>(sem itens)</p>"}
    </body>
  </html>`;
}

function __defeituososDownloadWord(html, filenameBase) {
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${__defeituososSafeFileName(filenameBase)}_${__defeituososNowStamp()}.doc`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (_) {}
    try { a.remove(); } catch (_) {}
  }, 1000);
}

function initDefeituososPanel() {
  const STORAGE_FOLDERS = "sige_defeituosos_folders";
  const STORAGE_ACTIVE = "sige_defeituosos_active";

  const elFolderSelect = document.getElementById("sige-def-folder-select");
  const elFolderNew = document.getElementById("sige-def-folder-new");
  const elFolderDel = document.getElementById("sige-def-folder-del");
  const elFolderNewRow = document.getElementById("sige-def-folder-newrow");
  const elFolderName = document.getElementById("sige-def-folder-name");
  const elFolderCreate = document.getElementById("sige-def-folder-create");
  const elFolderCancel = document.getElementById("sige-def-folder-cancel");

  const elCode = document.getElementById("sige-def-code");
  const elSearch = document.getElementById("sige-def-search");
  const elStatus = document.getElementById("sige-def-status");
  const elResults = document.getElementById("sige-def-results");
  const elSelectedBox = document.getElementById("sige-def-selected");
  const elSelectedTitle = document.getElementById("sige-def-selected-title");
  const elQtd = document.getElementById("sige-def-qtd");
  const elMotivo = document.getElementById("sige-def-motivo");
  const elAdd = document.getElementById("sige-def-add");

  const elItems = document.getElementById("sige-def-items");
  const elExport = document.getElementById("sige-def-export");
  const elClear = document.getElementById("sige-def-clear");

  if (!elFolderSelect || !elCode || !elSearch || !elStatus || !elResults || !elSelectedBox || !elSelectedTitle || !elItems || !elExport || !elClear) {
    console.warn("[SIGE Assistente] Defeituosos: elementos não encontrados.");
    return;
  }

  let folders = [];
  let activeId = null;
  let selectedProduto = null;

  const mkId = () => `def-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const ensureDefault = () => {
    if (!Array.isArray(folders)) folders = [];
    if (!folders.length) {
      const id = mkId();
      folders = [{ id, nome: "Pasta 1", itens: [] }];
      activeId = id;
    }
    if (!activeId || !folders.some(f => f.id === activeId)) {
      activeId = folders[0].id;
    }
  };

  const save = (cb) => {
    try {
      chrome.storage.local.set({
        [STORAGE_FOLDERS]: folders,
        [STORAGE_ACTIVE]: activeId
      }, () => cb && cb());
    } catch (e) {
      console.warn("[SIGE Assistente] Defeituosos: erro ao salvar storage:", e);
      cb && cb();
    }
  };

  const load = (cb) => {
    try {
      chrome.storage.local.get([STORAGE_FOLDERS, STORAGE_ACTIVE], (r) => {
        folders = (r && Array.isArray(r[STORAGE_FOLDERS])) ? r[STORAGE_FOLDERS] : [];
        activeId = (r && r[STORAGE_ACTIVE]) ? r[STORAGE_ACTIVE] : null;
        ensureDefault();
        cb && cb();
      });
    } catch (e) {
      folders = [];
      activeId = null;
      ensureDefault();
      cb && cb();
    }
  };

  const getActive = () => folders.find(f => f.id === activeId) || folders[0];

  const setStatus = (msg, isError) => {
    elStatus.textContent = msg || "";
    elStatus.style.color = isError ? "#fca5a5" : "#9ca3af";
  };

  const renderFolders = () => {
    elFolderSelect.innerHTML = folders.map(f => `<option value="${String(f.id)}">${escapeHtml(f.nome || "(sem nome)")}</option>`).join("");
    elFolderSelect.value = activeId;
  };

  const renderItems = () => {
    const folder = getActive();
    const itens = (folder && Array.isArray(folder.itens)) ? folder.itens : [];

    if (!itens.length) {
      elItems.innerHTML = `<div style="font-size:12px;color:#9ca3af;">(nenhum item nesta pasta)</div>`;
      return;
    }

    elItems.innerHTML = itens.map((it, idx) => {
      return `
        <div style="padding:10px;border:1px solid rgba(148,163,184,.22);border-radius:12px;background:rgba(0,0,0,.14);">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
            <div style="min-width:0;">
              <div style="font-weight:700;">${escapeHtml(it.codigo)} • ${escapeHtml(it.nome)}</div>
              <div style="margin-top:4px;font-size:12px;color:#cbd5e1;">
                Qtd: <b>${escapeHtml(it.quantidade)}</b> &nbsp;|&nbsp; Motivo: <b>${escapeHtml(it.motivo)}</b>
              </div>
            </div>
            <button class="btn danger" data-def-remove="${idx}" title="Remover">Remover</button>
          </div>
        </div>
      `;
    }).join("");
  };

  const clearSelectionUI = () => {
    selectedProduto = null;
    elResults.innerHTML = "";
    elSelectedBox.style.display = "none";
    elSelectedTitle.textContent = "";
    if (elQtd) elQtd.value = "";
    if (elMotivo) elMotivo.value = "";
  };

  const setSelectedProduto = (p) => {
    selectedProduto = p;
    if (!p) {
      clearSelectionUI();
      return;
    }
    elSelectedTitle.textContent = `${p.codigo || ""} • ${p.nome || ""}`.trim();
    elSelectedBox.style.display = "block";
    if (elQtd && !elQtd.value) elQtd.value = "1";
    if (elMotivo) elMotivo.focus();
  };

  const runSearch = () => {
    const cod = String(elCode.value || "").trim();
    clearSelectionUI();

    if (!cod) {
      setStatus("Digite o código do produto.", true);
      return;
    }

    setStatus("Buscando na API...", false);
    elSearch.disabled = true;
    try {
      sigeBuscarProdutoNaApi(cod, (res) => {
        elSearch.disabled = false;

        if (!res) {
          setStatus("Produto não encontrado.", true);
          return;
        }

        // múltiplos resultados
        if (res.__enfoqueMultiple && Array.isArray(res.options)) {
          setStatus(`Encontrados ${res.options.length} resultados. Selecione um:`, false);
          elResults.innerHTML = res.options.map((p, idx) => {
            return `
              <button class="btn" data-def-pick="${idx}" style="text-align:left;justify-content:flex-start;gap:8px;">
                <span style="font-weight:700;">${escapeHtml(p.codigo)}</span>
                <span style="opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.nome)}</span>
              </button>
            `;
          }).join("");

          // click handlers via delegação
          elResults.onclick = (ev) => {
            const btn = ev.target && ev.target.closest ? ev.target.closest("[data-def-pick]") : null;
            if (!btn) return;
            const i = Number(btn.getAttribute("data-def-pick"));
            const p = res.options[i];
            if (!p) return;
            elResults.innerHTML = "";
            setStatus("Produto selecionado.", false);
            setSelectedProduto(p);
          };

          return;
        }

        setStatus("Produto encontrado.", false);
        setSelectedProduto(res);
      });
    } catch (e) {
      elSearch.disabled = false;
      setStatus("Erro ao buscar produto.", true);
    }
  };

  const addItem = () => {
    const folder = getActive();
    if (!folder) {
      setStatus("Crie ou selecione uma pasta.", true);
      return;
    }
    if (!selectedProduto) {
      setStatus("Primeiro selecione um produto.", true);
      return;
    }
    const qtd = (elQtd ? String(elQtd.value || "").trim() : "").replace(/\D/g, "") || "1";
    const motivo = (elMotivo ? String(elMotivo.value || "").trim() : "");
    if (!motivo) {
      setStatus("Informe o motivo.", true);
      elMotivo && elMotivo.focus();
      return;
    }
    if (!Array.isArray(folder.itens)) folder.itens = [];
    folder.itens.push({
      codigo: String(selectedProduto.codigo || "").trim(),
      nome: String(selectedProduto.nome || "").trim(),
      quantidade: qtd,
      motivo: motivo
    });

    save(() => {
      renderItems();
      setStatus("Item adicionado.", false);
      if (elCode) { elCode.value = ""; elCode.focus(); }
      clearSelectionUI();
    });
  };

  const clearItems = () => {
    const folder = getActive();
    if (!folder) return;
    folder.itens = [];
    save(() => {
      renderItems();
      setStatus("Itens removidos.", false);
      clearSelectionUI();
    });
  };

  const exportWord = () => {
    const folder = getActive();
    if (!folder) return;
    const itens = (folder && Array.isArray(folder.itens)) ? folder.itens : [];
    if (!itens.length) {
      setStatus("A pasta está vazia.", true);
      return;
    }
    const html = __defeituososBuildWordHtml(folder.nome || "Defeituosos", itens);
    __defeituososDownloadWord(html, folder.nome || "defeituosos");
    setStatus("Arquivo Word gerado.", false);
  };

  const deleteFolder = () => {
    if (folders.length <= 1) {
      setStatus("Não é possível excluir a última pasta.", true);
      return;
    }
    const idx = folders.findIndex(f => f.id === activeId);
    if (idx >= 0) folders.splice(idx, 1);
    activeId = folders[0] ? folders[0].id : null;
    ensureDefault();
    save(() => {
      renderFolders();
      renderItems();
      setStatus("Pasta excluída.", false);
      clearSelectionUI();
    });
  };

  const showNewFolderRow = (show) => {
    if (!elFolderNewRow) return;
    elFolderNewRow.style.display = show ? "flex" : "none";
    if (show) {
      elFolderName && (elFolderName.value = "");
      elFolderName && elFolderName.focus();
    }
  };

  const createFolder = () => {
    const nome = String(elFolderName ? elFolderName.value : "").trim();
    if (!nome) {
      setStatus("Digite um nome para a pasta.", true);
      elFolderName && elFolderName.focus();
      return;
    }
    const id = mkId();
    folders.push({ id, nome, itens: [] });
    activeId = id;
    save(() => {
      renderFolders();
      renderItems();
      showNewFolderRow(false);
      setStatus("Pasta criada.", false);
      clearSelectionUI();
    });
  };

  // Delegação: remover item
  elItems.addEventListener("click", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-def-remove]") : null;
    if (!btn) return;
    const i = Number(btn.getAttribute("data-def-remove"));
    const folder = getActive();
    if (!folder || !Array.isArray(folder.itens)) return;
    if (i < 0 || i >= folder.itens.length) return;
    folder.itens.splice(i, 1);
    save(() => {
      renderItems();
      setStatus("Item removido.", false);
    });
  });

  // Handlers
  elFolderSelect.addEventListener("change", () => {
    activeId = elFolderSelect.value;
    ensureDefault();
    save(() => {
      renderItems();
      clearSelectionUI();
      setStatus("Pasta selecionada.", false);
    });
  });

  elFolderNew && elFolderNew.addEventListener("click", () => showNewFolderRow(true));
  elFolderCancel && elFolderCancel.addEventListener("click", () => showNewFolderRow(false));
  elFolderCreate && elFolderCreate.addEventListener("click", () => createFolder());
  elFolderDel && elFolderDel.addEventListener("click", () => deleteFolder());

  elSearch.addEventListener("click", (e) => {
    e.preventDefault();
    runSearch();
  });
  elCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });

  elAdd && elAdd.addEventListener("click", (e) => {
    e.preventDefault();
    addItem();
  });
  elMotivo && elMotivo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  });

  elClear.addEventListener("click", (e) => {
    e.preventDefault();
    clearItems();
  });
  elExport.addEventListener("click", (e) => {
    e.preventDefault();
    exportWord();
  });

  // Boot
  load(() => {
    save(() => {
      renderFolders();
      renderItems();
      setStatus("Pronto.", false);
      clearSelectionUI();
    });
  });
}


// =============================================================
// MODO ETIQUETAS NA TELA /Produtos/List
// =============================================================
(function() {
  try {
    if (!window.location || !window.location.href) return;
    var href = window.location.href.toLowerCase();
    if (href.indexOf("/sistema/produtos/list") === -1 && href.indexOf("/sistema/produtosprecovenda/report") === -1) return;

    // Só ativa o modo etiquetas se a URL tiver ?etq=1
    try {
      var url = new URL(window.location.href);
      var etqParam = url.searchParams.get("etq");
      if (etqParam !== "1") return;
    } catch (e) {
      if (href.indexOf("etq=1") === -1) return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initEnfoqueProdutosListEtiquetas);
    } else {
      initEnfoqueProdutosListEtiquetas();
    }
  } catch (e) {
    console.warn("[SIGE Assistente] Erro ao preparar modo etiquetas em Produtos/List:", e);
  }

  function initEnfoqueProdutosListEtiquetas() {
    try {
      if (document.getElementById("enfoque-etq-overlay")) return;

      // Injeta CSS
      try {
        var head = document.head || document.getElementsByTagName("head")[0];
        if (head && !document.getElementById("enfoque-etq-overlay-style")) {
          var styleEl = document.createElement("style");
          styleEl.id = "enfoque-etq-overlay-style";
          var fontUrl = "";
          var logoUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("logo.jpg") : "";
          var logoPapelUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("loga.png") : "";
          var caixaUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("caixaTexto.jpg") : "";
          var cssText = `
#enfoque-etq-overlay {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      position: fixed;
      inset: 0;
      background: #e5e7eb;
      padding: 24px;
      z-index: 999999;
      font-family: "Open Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
    }

    #enfoque-etq-overlay * {
      box-sizing: border-box;
    }

    .pdv-shell {
      width: 960px;
      margin: 0 auto;
      background: #f9fafb;
      box-shadow: 0 0 30px rgba(0, 0, 0, 0.25);
      border-radius: 4px;
      overflow: hidden;
    }

    .pdv-header {
      background: #a7d46f;
      padding: 8px 16px 4px;
      border-bottom: 3px solid #ffcc00;
    }

    .pdv-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #4b5563;
      font-size: 13px;
    }

    .pdv-header-left span {
      font-weight: 600;
      margin-right: 4px;
    }

    .pdv-header-left input[type="checkbox"] {
      vertical-align: middle;
      margin-right: 8px;
    }

    .pdv-header-left input[type="text"] {
      height: 18px;
      width: 130px;
      font-size: 11px;
      padding: 2px 4px;
      border: 1px solid #9ca3af;
      border-radius: 2px;
    }

    .pdv-header-right {
      white-space: nowrap;
    }

    .pdv-header-right span {
      font-size: 12px;
    }

    .pdv-logo-row {
      display: flex;
      align-items: center;
      margin-top: 4px;
    }

    .pdv-logo {
      width: 150px;
      height: 40px;
      background: url("LOGO_URL") no-repeat center;
      background-size: contain;
    }

    .pdv-busca {
      position: relative;
      flex: 1;
      margin-left: 8px;
    }

    .pdv-busca input {
      width: 100%;
      padding: 4px 8px;
      border-radius: 3px;
      border: 1px solid #9ca3af;
      font-size: 14px;
    }

    .pdv-busca-opcoes {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
      max-height: 240px;
      overflow: auto;
      z-index: 999999;
      display: none;
    }

    .pdv-busca-opcao {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #e5e7eb;
    }

    .pdv-busca-opcao:last-child { border-bottom: none; }

    .pdv-busca-opcao:hover { background: #f1f5f9; }

    .pdv-busca-opcao-preco {
      font-weight: 800;
      min-width: 92px;
      white-space: nowrap;
    }

    .pdv-busca-opcao-desc {
      flex: 1;
      font-size: 12px;
      line-height: 1.2;
      color: #111827;
    }

    .pdv-busca-opcao-cod {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      opacity: 0.85;
      white-space: nowrap;
    }

    .pdv-header-info-extra {
      display: flex;
      align-items: center;
      margin-left: 8px;
      gap: 6px;
    }

    .pdv-header-select,
    .pdv-header-input {
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 2px;
      border: 1px solid #9ca3af;
      background: #f9fafb;
    }

    .pdv-banner-etq {
      background: #facc15;
      color: #111827;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 10px;
      text-align: center;
      border-bottom: 1px solid #eab308;
    }

    .pdv-main {
      display: flex;
      padding: 16px;
      gap: 16px;
      min-height: 420px;
    }

    .pdv-produto {
      flex: 3;
      border-right: 1px solid #e5e7eb;
      padding-right: 12px;
    }

    .pdv-etiquetas {
      flex: 2;
      padding-left: 4px;
    }

    .pdv-produto h2 {
      font-size: 18px;
      margin-bottom: 10px;
      color: #374151;
      text-transform: uppercase;
    }

    .pdv-produto-box {
      display: flex;
      gap: 14px;
    }

    .pdv-produto-imagem {
      width: 230px;
      height: 230px;
      border: 1px solid #d1d5db;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      background: #f3f4f6;
      position: relative;
      overflow: hidden;
    }

    .pdv-produto-foto {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 24px;
      background: #e5e7eb;
      background-repeat: no-repeat;
      background-position: center;
      background-size: cover;
    }

    .pdv-produto-marca {
      position: relative;
      z-index: 1;
      font-size: 11px;
      padding: 4px 0;
      width: 100%;
      text-align: center;
      background: rgba(249, 250, 251, 0.9);
      border-top: 1px solid #d1d5db;
      color: #4b5563;
    }

    .pdv-produto-dados {
      list-style: none;
      flex: 1;
      font-size: 13px;
    }

    .pdv-produto-dados li {
      margin-bottom: 10px;
    }

    .pdv-produto-dados label {
      display: block;
      margin-bottom: 2px;
      font-weight: 600;
      color: #374151;
    }

    .pdv-produto-dados input[type="text"],
    .pdv-produto-dados input[type="number"] {
      width: 100%;
      padding: 4px 6px;
      border-radius: 3px;
      border: 1px solid #9ca3af;
      font-size: 13px;
    }

    .pdv-produto-dados input[readonly] {
      background: #e5e7eb;
    }

    .pdv-produto-acoes {
      margin-top: 6px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      padding: 6px 10px;
      border-radius: 3px;
      border: none;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-transform: uppercase;
    }

    .btn-red {
      background: #b91c1c;
      color: #fff;
    }

    .btn-green {
      background: #16a34a;
      color: #fff;
    }

    .btn-blue {
      background: #2563eb;
      color: #fff;
    }

    .btn-full {
      width: 100%;
      margin-top: 10px;
      padding: 8px 12px;
      font-size: 13px;
    }

    .btn:active {
      transform: translateY(1px);
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    }

    .pdv-etiquetas h4 {
      font-size: 14px;
      margin-bottom: 6px;
      color: #374151;
      text-transform: uppercase;
    }

    .pdv-etiquetas-total {
      background: #bbf7d0;
      color: #166534;
      font-weight: 700;
      font-size: 16px;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 8px;
      text-align: center;
    }

    /* ===== Etiquetas (prévia) ===== */
    #enfoque-etq-overlay {
      --etq-w: 60mm;  /* média: 6cm */
      --etq-h: 35mm;  /* média: 3,5cm */
      --etq-logo-h: 7mm;
      --etq-preco-h: 12mm;
      --etq-desc-h: 9mm;
      --etq-cod-h: 7mm;
      --etq-preco-font: 26pt;
      --etq-desc-font: 9pt;
      --etq-cod-font: 14pt;
    }

    #enfoque-etq-overlay.etq-size-pequena {
      --etq-w: 40mm;  /* pequena: 4cm */
      --etq-h: 25mm;  /* pequena: 2,5cm */
      --etq-logo-h: 5mm;
      --etq-preco-h: 9mm;
      --etq-desc-h: 6mm;
      --etq-cod-h: 5mm;
      --etq-preco-font: 18pt;
      --etq-desc-font: 7pt;
      --etq-cod-font: 10pt;
    }

    #enfoque-etq-overlay.etq-size-grande {
      --etq-w: 75mm;  /* grande: 7,5cm */
      --etq-h: 50mm;  /* grande: 5cm */
      --etq-logo-h: 10mm;
      --etq-preco-h: 18mm;
      --etq-desc-h: 12mm;
      --etq-cod-h: 10mm;
      --etq-preco-font: 38pt;
      --etq-desc-font: 12pt;
      --etq-cod-font: 20pt;
    }

    .pdv-etiquetas-lista {
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      background: #fefce8;
      padding: 6px;
      height: 280px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(calc(var(--etq-w) + 6mm), 1fr));
      gap: 8px;
      align-content: flex-start;
      align-items: flex-start;
      justify-items: center;
    }

    .etiqueta {
      width: var(--etq-w);
      height: var(--etq-h);
      background: #ffffff;
      overflow: hidden;
      font-family: Arial, sans-serif;
      padding: 0;
      border: 1px solid #111827;
      position: relative;
      margin: 0;
      display: flex;
      flex-direction: column;
    }

    .pdv-etiquetas-selecao .etiqueta {
      cursor: pointer;
    }

    .etiqueta-selected {
      box-shadow: 0 0 0 2px #2563eb;
      border-color: #2563eb;
    }

    .etiqueta-logo {
      width: 100%;
      height: var(--etq-logo-h);
      margin: 0 auto;
      background: url("LOGO_URL") no-repeat center;
      background-size: cover;
    }

    .etiqueta-papel .etiqueta-logo {
      background-image: url("LOGO_PAPEL_URL");
    }

    .etiqueta-preco {
      width: 100%;
      margin: 0 auto;
      background: #000;
      color: #fff;
      font-size: var(--etq-preco-font);
      text-align: center;
      font-family: Arial, sans-serif;
      padding: 0;
      height: var(--etq-preco-h);
      line-height: var(--etq-preco-h);
      display:flex;
      align-items:center;
      justify-content:center;
      gap:2mm;
    }

    .etiqueta-preco .etiqueta-moeda,
    .etiqueta-preco .etiqueta-valor {
      font-family: ui-monospace, Consolas, monospace;
      letter-spacing: .06em;
      line-height: 1;
    }

    .etiqueta-preco .etiqueta-moeda {
      font-size: .72em;
      font-weight: 400;
    }

    .etiqueta-desc {
      width: 100%;
      margin: 0 auto;
      background: url("CAIXA_URL") no-repeat center;
      background-size: cover;
      display: block;
      padding: 1mm 2mm;
      height: var(--etq-desc-h);
      font-size: var(--etq-desc-font);
      line-height: 1.05;
      color: #000;
      text-transform: uppercase;
      overflow: hidden;
      white-space: normal;
      word-break: break-word;
      text-overflow: clip;
    }

    .etiqueta-cod {
      width: 100%;
      margin: 0 auto;
      background: url("CAIXA_URL") no-repeat center;
      background-size: cover;
      display: flex;
      align-items: center;
      justify-content: center;
      height: var(--etq-cod-h);
      font-size: var(--etq-cod-font);
      color: #000;
      font-weight: 700;
    }

    /* Layout alternativo: Papel & Arte (preview) */
    .pa-etiqueta {
      width: 300px;
      background: #d0d0d0;
      box-sizing: border-box;
      display: flex;
    }
    .pa-col-esq {
      width: 65%;
      display: flex;
      flex-direction: column;
    }
    .pa-preco-area {
      height: 60px;
      background: #000;
      color: #fff;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 48px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .pa-descricao-area {
      height: 40px;
      background: url("CAIXA_URL") no-repeat center;
      background-size: 100% 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 12px;
      font-weight: bold;
      padding: 0 6px;
      box-sizing: border-box;
      text-align: center;
    }
    .pa-col-dir {
      width: 35%;
      background: #ffffff;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .pa-col-dir img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
er;
      height: 20px;
      font-size: 14px;
      color: #000;
      font-weight: 700;
    }

    .pdv-atalhos {
      background: #f3f4f6;
      padding: 6px 16px 8px;
      font-size: 11px;
      color: #4b5563;
      border-top: 1px solid #e5e7eb;
    }

    .pdv-header-close {
      position: absolute;
      top: 6px;
      right: 10px;
      font-size: 18px;
      cursor: pointer;
      color: #374151;
    }
`
            .replace(/FONT_URL_DIGITAL7/g, "")
            .replace(/LOGO_URL/g, logoUrl)
            .replace(/LOGO_PAPEL_URL/g, logoPapelUrl)
            .replace(/CAIXA_URL/g, caixaUrl);
          styleEl.textContent = cssText;
          head.appendChild(styleEl);
        }
      } catch (cssErr) {
        console.warn("[SIGE Assistente] Erro ao injetar CSS do overlay de etiquetas:", cssErr);
      }

      // Cria overlay
      var overlay = document.createElement("div");
      overlay.id = "enfoque-etq-overlay";

      overlay.innerHTML = `
        <div class="pdv-shell">
          <header class="pdv-header" style="position:relative;">
            <div class="pdv-header-top">
              <div class="pdv-header-left">
                <span>Vale Livro</span>
                <input type="checkbox" />
                <span>Cupom Desconto</span>
                <input type="text" placeholder="Código do cupom" />
              </div>
              <div class="pdv-header-right">
                <span id="enfoque-etq-header-info">Caixa - Enfoque Papelaria</span>
              </div>
            </div>
            <div class="pdv-logo-row">
              <div class="pdv-busca">
                <input type="text" id="enfoque-etq-busca-fake" placeholder="Digite o código para buscar (integra com Produtos/List)" />
                              <div id="enfoque-etq-opcoes" class="pdv-busca-opcoes"></div>
              </div>
              <div class="pdv-header-info-extra">
                <input class="pdv-header-input" type="text" placeholder="Nome da escola" />
              </div>
            </div>
            <div class="pdv-header-close" id="enfoque-etq-overlay-close" title="Fechar modo etiquetas">✕</div>
          </header>

          <div class="pdv-banner-etq">
            GERADOR DE ETIQUETAS – digite o código, confirme os dados e acompanhe a prévia à direita.
          </div>

          <main class="pdv-main">
            <section class="pdv-produto">
              <h2 id="etq-prod-nome">NOME DO PRODUTO / MARCA</h2>
              <div class="pdv-produto-box">
                <div class="pdv-produto-imagem">
                  <div class="pdv-produto-foto" id="etq-prod-foto"></div>
                  <span class="pdv-produto-marca" id="etq-prod-marca">MARCA</span>
                </div>
                <ul class="pdv-produto-dados">
                  <li>
                    <label for="etq-codigo">CÓDIGO</label>
                    <input id="etq-codigo" type="text" placeholder="Código do produto" readonly />
                  </li>
                  <li>
                    <label for="etq-qtd">QUANTIDADE</label>
                    <input id="etq-qtd" type="number" min="1" value="1" />
                  </li>
                  <li>
                    <label for="etq-preco-unit">VALOR UNITÁRIO (R$)</label>
                    <input id="etq-preco-unit" type="text" value="0,00" />
                  </li>
                  <li>
                    <label for="etq-preco-total">VALOR TOTAL (R$)</label>
                    <input id="etq-preco-total" type="text" value="0,00" readonly />
                  </li>
                  <li class="pdv-produto-acoes">
                    <button id="btn-excluir-etq" class="btn btn-red">EXCLUIR ETIQUETA</button>
                    <button id="btn-gerar-etq" class="btn btn-green">GERAR ETIQUETA</button>
                  </li>
                </ul>
              </div>
            </section>

            <aside class="pdv-etiquetas">
              <h4>PRÉVIA DE ETIQUETAS</h4>
              <div style="margin:4px 0 8px;font-size:11px;display:flex;flex-direction:column;gap:6px;">
                <label style="display:flex;flex-direction:column;gap:3px;align-items:flex-start;position:relative;">
                  <span>Tamanho</span>
                  <div id="etq-tamanho-picker" style="position:relative;width:240px;z-index:9999999;">
                    <button type="button" id="etq-tamanho-current" style="width:240px;height:30px;border:1px solid #94a3b8;border-radius:4px;background:#fff;color:#111827;font-size:12px;padding:3px 8px;text-align:left;cursor:pointer;box-shadow:none;">
                      Etiqueta média (6 × 3,5 cm) ▾
                    </button>
                    <div id="etq-tamanho-options" style="display:none;position:absolute;left:0;right:0;top:32px;background:#fff;border:1px solid #94a3b8;border-radius:4px;box-shadow:0 8px 20px rgba(0,0,0,.18);overflow:hidden;z-index:2147483647;">
                      <button type="button" data-etq-tamanho="media" style="display:block;width:100%;padding:7px 8px;border:0;background:#fff;text-align:left;font-size:12px;color:#111827;cursor:pointer;">Etiqueta média (6 × 3,5 cm)</button>
                      <button type="button" data-etq-tamanho="pequena" style="display:block;width:100%;padding:7px 8px;border:0;background:#fff;text-align:left;font-size:12px;color:#111827;cursor:pointer;">Etiqueta pequena (4 × 2,5 cm)</button>
                      <button type="button" data-etq-tamanho="grande" style="display:block;width:100%;padding:7px 8px;border:0;background:#fff;text-align:left;font-size:12px;color:#111827;cursor:pointer;">Etiqueta grande (7,5 × 5 cm)</button>
                    </div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" id="etq-papel-arte-toggle" />
                  <span>Etiquetas para Papel &amp; Arte</span>
                </label>
              </div>
              <div id="etq-total" class="pdv-etiquetas-total">0 ETIQUETAS</div>
              <div id="etq-lista" class="pdv-etiquetas-lista"></div>
              <button id="btn-imprimir-etq" class="btn btn-blue btn-full">
                IMPRIMIR ETIQUETAS
              </button>
            </aside>
          </main>

          <footer class="pdv-atalhos">
            F2 = Novo código | F4 = Mudar Quantidade | F6 = Gerar Etiqueta | F8 = Imprimir Etiquetas
          </footer>
        </div>
      `;

      document.body.appendChild(overlay);

      // ===== LÓGICA DE ETIQUETAS LIGADA À /Produtos/List =====
      var listaEtiquetas = [];

      var campoCodigo = document.getElementById("etq-codigo");
      var campoQtd = document.getElementById("etq-qtd");
      var campoPrecoUnit = document.getElementById("etq-preco-unit");
      var campoPrecoTotal = document.getElementById("etq-preco-total");
      var campoNome = document.getElementById("etq-prod-nome");
      var campoMarca = document.getElementById("etq-prod-marca");
      var listaEl = document.getElementById("etq-lista");
      var totalEl = document.getElementById("etq-total");
      var fecharBtn = document.getElementById("enfoque-etq-overlay-close");
      var buscaFake = document.getElementById("enfoque-etq-busca-fake");
      var opcoesProdutoEl = document.getElementById("enfoque-etq-opcoes");
      var papelArteToggle = document.getElementById("etq-papel-arte-toggle");
      var tamanhoPicker = document.getElementById("etq-tamanho-picker");
      var tamanhoCurrent = document.getElementById("etq-tamanho-current");
      var tamanhoOptions = document.getElementById("etq-tamanho-options");
      getSigeEtiquetaPapelArteAtual();

      function renderPrecoEtiquetaHtml(preco) {
        var raw = String(preco || "").trim();
        var semMoeda = raw.replace(/^R\$\s*/i, "").trim();
        return '<span class="etiqueta-moeda">R$</span><span class="etiqueta-valor">' + escapeHtml(semMoeda || raw) + '</span>';
      }

      function getEtiquetaTamanhoLabel(tamanho) {
        tamanho = String(tamanho || "media").toLowerCase();
        if (tamanho === "pequena") return "Etiqueta pequena (4 × 2,5 cm)";
        if (tamanho === "grande") return "Etiqueta grande (7,5 × 5 cm)";
        return "Etiqueta média (6 × 3,5 cm)";
      }

      function syncEtiquetaTamanhoPicker() {
        var t = __sigeGetEtiquetaTamanhoAtual();
        if (tamanhoCurrent) tamanhoCurrent.textContent = getEtiquetaTamanhoLabel(t) + " ▾";
        if (tamanhoOptions) {
          Array.prototype.forEach.call(tamanhoOptions.querySelectorAll("button[data-etq-tamanho]"), function(btn) {
            var active = btn.getAttribute("data-etq-tamanho") === t;
            btn.style.background = active ? "#dcfce7" : "#fff";
            btn.style.fontWeight = active ? "700" : "400";
          });
        }
      }

      function setEtiquetaTamanhoFromUi(tamanho) {
        setSigeEtiquetaTamanhoAtual(tamanho || "media");
        __sigeAplicarClasseTamanhoOverlay();
        syncEtiquetaTamanhoPicker();
        renderEtiquetas();
      }

      function __sigeGetEtiquetaTamanhoAtual() {
        try { return getSigeEtiquetaTamanhoAtual(); } catch (e) { return "media"; }
      }

      function __sigeAplicarClasseTamanhoOverlay() {
        if (!overlay) return;
        var tamanho = __sigeGetEtiquetaTamanhoAtual();
        overlay.classList.remove("etq-size-pequena", "etq-size-grande");
        if (tamanho === "pequena") overlay.classList.add("etq-size-pequena");
        if (tamanho === "grande") overlay.classList.add("etq-size-grande");
      }


      if (tamanhoCurrent && tamanhoOptions) {
        tamanhoCurrent.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          tamanhoOptions.style.display = tamanhoOptions.style.display === "block" ? "none" : "block";
        });
        Array.prototype.forEach.call(tamanhoOptions.querySelectorAll("button[data-etq-tamanho]"), function(btn) {
          btn.addEventListener("mouseenter", function() { if (btn.style.fontWeight !== "700") btn.style.background = "#f1f5f9"; });
          btn.addEventListener("mouseleave", function() { syncEtiquetaTamanhoPicker(); });
          btn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (tamanhoOptions) tamanhoOptions.style.display = "none";
            setEtiquetaTamanhoFromUi(btn.getAttribute("data-etq-tamanho") || "media");
          });
        });
        document.addEventListener("click", function(ev) {
          if (tamanhoPicker && !tamanhoPicker.contains(ev.target) && tamanhoOptions) tamanhoOptions.style.display = "none";
        }, true);
      }

      __sigeAplicarClasseTamanhoOverlay();
      syncEtiquetaTamanhoPicker();


      if (papelArteToggle) {
        papelArteToggle.checked = getSigeEtiquetaPapelArteAtual();
        papelArteToggle.addEventListener("change", function() {
          setSigeEtiquetaPapelArteAtual(!!papelArteToggle.checked);
          renderEtiquetas();
        });
      }

      if (buscaFake && campoCodigo) {
        buscaFake.addEventListener("keydown", function(e) {
          if (e.key === "Enter") {
            e.preventDefault();
            try { limparOpcoesProduto(); } catch (e) {}
            campoCodigo.value = buscaFake.value;
            buscarEGerar();
            // limpa o campo de busca após gerar
            buscaFake.value = "";
          }
        });
      }

      if (fecharBtn) {
        fecharBtn.addEventListener("click", function() {
          overlay.remove();
        });
      }


      if (typeof window !== "undefined" && !window.sigeEtiquetasDesignPerguntado) {
        window.sigeEtiquetasDesignPerguntado = true;
        try {
          abrirPopupEscolhaDesign();
        } catch (e) {
          console.warn("[SIGE Assistente] Não foi possível abrir popup de escolha de design de etiqueta:", e);
        }
      }

      function abrirPopupEscolhaDesign() {
        try {
          if (!overlay) return;
          if (document.getElementById("enfoque-etq-design-popup")) return;

          var popup = document.createElement("div");
          popup.id = "enfoque-etq-design-popup";
          popup.style.position = "absolute";
          popup.style.inset = "0";
          popup.style.background = "rgba(15,23,42,0.75)";
          popup.style.display = "flex";
          popup.style.alignItems = "center";
          popup.style.justifyContent = "center";
          popup.style.zIndex = "999999";

          var box = document.createElement("div");
          box.style.background = "#f9fafb";
          box.style.borderRadius = "8px";
          box.style.boxShadow = "0 10px 25px rgba(15,23,42,0.6)";
          box.style.padding = "16px 18px";
          box.style.width = "320px";
          box.style.maxWidth = "90%";
          box.style.fontSize = "13px";
          box.style.color = "#111827";

          box.innerHTML = `
            <h3 style="margin:0 0 8px;font-size:15px;">Escolha o modelo de etiqueta</h3>
            <p style="margin:0 0 10px;line-height:1.5;color:#4b5563;">
              Como você quer gerar as etiquetas deste PDV falso?
            </p>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <button id="etq-design-enfoque"
                      style="padding:6px 8px;border-radius:6px;border:none;background:#22c55e;color:#022c22;font-weight:600;cursor:pointer;">
                Enfoque Papelaria (padrão)
              </button>
              <button id="etq-design-papel"
                      style="padding:6px 8px;border-radius:6px;border:none;background:#0ea5e9;color:#0f172a;font-weight:600;cursor:pointer;">
                Papel &amp; Arte
              </button>
            </div>
          `;

          popup.appendChild(box);
          overlay.appendChild(popup);

          function aplicarModo(isPapelArte) {
            if (typeof window !== "undefined") {
              window.sigeEtiquetasPapelArte = !!isPapelArte;
            }
            if (papelArteToggle) {
              papelArteToggle.checked = !!isPapelArte;
            }
            try {
              renderEtiquetas();
            } catch (e) {
              console.warn("[SIGE Assistente] Erro ao atualizar prévia de etiquetas após escolha de design:", e);
            }
            if (popup && popup.parentNode) {
              popup.parentNode.removeChild(popup);
            }
          }

          var btnEnfoque = document.getElementById("etq-design-enfoque");
          var btnPapel = document.getElementById("etq-design-papel");

          if (btnEnfoque) {
            btnEnfoque.onclick = function() {
              aplicarModo(false);
            };
          }
          if (btnPapel) {
            btnPapel.onclick = function() {
              aplicarModo(true);
            };
          }
        } catch (e) {
          console.warn("[SIGE Assistente] Erro ao criar popup de design de etiquetas:", e);
        }
      }

      function parsePreco(str) {
        str = (str || "").toString().trim();
        if (!str) return 0;
        str = str.replace(/\./g, "").replace(/,/g, ".");
        var n = parseFloat(str);
        return isNaN(n) ? 0 : n;
      }

      function formatPreco(n) {
        return n.toFixed(2).replace(".", ",");
      }

      function atualizarTotal() {
        var total = listaEtiquetas.length;
        totalEl.textContent = total + (total === 1 ? " ETIQUETA" : " ETIQUETAS");
      }

      var modoSelecao = false;

      function renderEtiquetas() {
        var isPapelArte = typeof window !== "undefined" && !!window.sigeEtiquetasPapelArte;

        var html = listaEtiquetas.map(function(e, idx) {
          var extraClass = isPapelArte ? " etiqueta-papel" : "";
          return `
            <div class="etiqueta${extraClass}" data-idx="${idx}">
              <div class="etiqueta-logo"></div>
              <div class="etiqueta-preco">${renderPrecoEtiquetaHtml(e.preco)}</div>
              <div class="etiqueta-desc" title="${e.nome}">${e.nome}</div>
              <div class="etiqueta-cod">${e.codigo}</div>
            </div>
          `;
        }).join("");
        listaEl.innerHTML = html;

        // Reaplica handlers de clique para seleção
        var cards = listaEl.querySelectorAll(".etiqueta");
        cards.forEach(function(card) {
          card.addEventListener("click", function() {
            if (!modoSelecao) return;
            card.classList.toggle("etiqueta-selected");
          });
        });

        atualizarTotal();
      }

      function lerPrimeiroProdutoDaLista() {
        try {
          var tbody = document.querySelector("tbody[ng-repeat='item in produtos']");
          if (!tbody) return null;
          var spans = tbody.querySelectorAll("td.ListField span.ng-binding");
          if (!spans || spans.length === 0) return null;

          // Estrutura esperada:
          // 0: código, 1: descrição, 2: marca, 3: fornecedor, 4: preço
          var codigo = spans[0] ? spans[0].textContent.trim() : "";
          var nome = spans[1] ? spans[1].textContent.trim() : "";
          var marca = spans[2] ? spans[2].textContent.trim() : "";
          var precoStr = spans[4] ? spans[4].textContent.trim() : "";

          return {
            codigo: codigo,
            nome: nome,
            marca: marca,
            precoStr: precoStr,
            precoNum: parsePreco(precoStr)
          };
        } catch (err) {
          console.warn("[SIGE Assistente] Erro ao ler produtos em /Produtos/List:", err);
          return null;
        }
      }

      function buscarProdutoPorCodigoTela(codigo, cb) {
        try {
          var inputFiltro = document.getElementById("txtFiltroNomeCodigo");
          if (!inputFiltro) {
            alert("Campo de filtro de produtos (#txtFiltroNomeCodigo) não encontrado.");
            cb(null);
            return;
          }

          inputFiltro.value = codigo;

          var evInput = new Event("input", { bubbles: true });
          inputFiltro.dispatchEvent(evInput);
          var evChange = new Event("change", { bubbles: true });
          inputFiltro.dispatchEvent(evChange);

          var tentativas = 0;
          var maxTentativas = 20;

          (function esperar() {
            tentativas++;
            var primeiro = lerPrimeiroProdutoDaLista();
            if (primeiro && primeiro.codigo) {
              cb(primeiro);
              return;
            }
            if (tentativas >= maxTentativas) {
              cb(null);
              return;
            }
            setTimeout(esperar, 200);
          })();
        } catch (err) {
          console.warn("[SIGE Assistente] Erro ao buscar produto por código (tela):", err);
          cb(null);
        }
      }

      
      function limparOpcoesProduto() {
        if (!opcoesProdutoEl) return;
        opcoesProdutoEl.innerHTML = "";
        opcoesProdutoEl.style.display = "none";
      }

      function mostrarOpcoesProduto(opcoes, onEscolher) {
        if (!opcoesProdutoEl) return;
        opcoesProdutoEl.innerHTML = "";
        opcoesProdutoEl.style.display = "block";

        (opcoes || []).forEach(function(p) {
          var div = document.createElement("div");
          div.className = "pdv-busca-opcao";

          var precoNum = (p && typeof p.precoNum === "number") ? p.precoNum : 0;
          var precoTxt = precoNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          var nomeTxt = (p && p.nome) ? String(p.nome) : "PRODUTO";
          var codTxt = (p && p.codigo != null) ? String(p.codigo) : "";
          var last6 = codTxt.replace(/\D/g, "").slice(-6);

          div.innerHTML = `
            <div class="pdv-busca-opcao-preco">R$ ${precoTxt}</div>
            <div class="pdv-busca-opcao-desc" title="${nomeTxt.replace(/"/g, "&quot;")}">${nomeTxt}</div>
            <div class="pdv-busca-opcao-cod">${last6 || codTxt}</div>
          `;

          div.addEventListener("click", function() {
            limparOpcoesProduto();
            try { onEscolher && onEscolher(p); } catch (e) {}
            try { if (buscaFake) buscaFake.focus(); } catch (e) {}
          });

          opcoesProdutoEl.appendChild(div);
        });
      }

function buscarProdutoPorCodigo(codigo, cb) {
        try {
          if (typeof sigeBuscarProdutoNaApi === "function") {
            sigeBuscarProdutoNaApi(codigo, function (produtoApi) {
              if (produtoApi && produtoApi.__enfoqueMultiple && Array.isArray(produtoApi.options) && produtoApi.options.length) {
                mostrarOpcoesProduto(produtoApi.options, function(escolhido) {
                  if (escolhido && escolhido.codigo) { cb(escolhido); }
                });
                return;
              }
              if (produtoApi && produtoApi.codigo) {
                try { limparOpcoesProduto(); } catch (e) {}
                cb(produtoApi);
                return;
              }
              try { limparOpcoesProduto(); } catch (e) {}
              buscarProdutoPorCodigoTela(codigo, cb);
            });
          } else {
            buscarProdutoPorCodigoTela(codigo, cb);
          }
        } catch (err) {
          console.warn("[SIGE Assistente] Erro ao usar API de produtos, voltando para leitura da tela:", err);
          buscarProdutoPorCodigoTela(codigo, cb);
        }
      }


      function atualizarTotalCampo() {
        var qtd = Math.max(1, parseInt(campoQtd.value || "1", 10));
        var preco = parsePreco(campoPrecoUnit.value);
        campoPrecoTotal.value = formatPreco(qtd * preco);
      }

      campoQtd.addEventListener("input", atualizarTotalCampo);
      campoPrecoUnit.addEventListener("input", atualizarTotalCampo);

      function gerarEtiquetasComProduto(prod) {
        var codigo = (campoCodigo.value || "").trim();
        var qtd = Math.max(1, parseInt(campoQtd.value || "1", 10));
        var preco = prod && typeof prod.precoNum === "number" ? prod.precoNum : parsePreco(campoPrecoUnit.value);
        var nome = prod && prod.nome ? prod.nome : (campoNome.textContent || "PRODUTO SEM NOME");

        if (!codigo) {
          alert("Informe um código para gerar a etiqueta.");
          campoCodigo.focus();
          return;
        }

        campoNome.textContent = nome;
        campoMarca.textContent = prod && prod.marca ? prod.marca : "MARCA";
        campoPrecoUnit.value = formatPreco(preco);
        campoPrecoTotal.value = formatPreco(preco * qtd);

        for (var i = 0; i < qtd; i++) {
          listaEtiquetas.push({
            codigo: codigo,
            nome: nome,
            preco: "R$ " + formatPreco(preco)
          });
        }

        renderEtiquetas();
      }

      function buscarEGerar() {
        var codigo = (campoCodigo.value || "").trim();
        if (!codigo) {
          alert("Informe um código para buscar.");
          campoCodigo.focus();
          return;
        }
        buscarProdutoPorCodigo(codigo, function(prod) {
          if (!prod) {
            alert("Produto não encontrado na tela de produtos.");
            return;
          }
          gerarEtiquetasComProduto(prod);
        });
      }

      function excluirEtiquetasSelecionadas() {
        var btn = document.getElementById("btn-excluir-etq");
        if (!listaEl || !btn) return;

        // Primeiro clique: entra em modo seleção
        if (!modoSelecao) {
          modoSelecao = true;
          listaEl.classList.add("pdv-etiquetas-selecao");
          btn.textContent = "APAGAR SELECIONADAS";
          btn.classList.remove("btn-red");
          btn.classList.add("btn-blue");

          // limpa seleções antigas
          var antigos = listaEl.querySelectorAll(".etiqueta-selected");
          antigos.forEach(function(el) { el.classList.remove("etiqueta-selected"); });
          return;
        }

        // Segundo clique: remove as selecionadas (se houver) e sai do modo
        var selecionadas = listaEl.querySelectorAll(".etiqueta.etiqueta-selected");
        if (selecionadas.length) {
          var indices = Array.prototype.map.call(selecionadas, function(el) {
            return parseInt(el.getAttribute("data-idx"), 10);
          }).filter(function(i) { return !isNaN(i); });

          indices.sort(function(a, b) { return b - a; }).forEach(function(i) {
            if (i >= 0 && i < listaEtiquetas.length) {
              listaEtiquetas.splice(i, 1);
            }
          });
        }

        modoSelecao = false;
        listaEl.classList.remove("pdv-etiquetas-selecao");
        btn.textContent = "EXCLUIR ETIQUETA";
        btn.classList.remove("btn-blue");
        btn.classList.add("btn-red");
        renderEtiquetas();
      }

      function imprimirEtiquetas() {
        if (!listaEtiquetas.length) {
          alert("Nenhuma etiqueta para imprimir.");
          return;
        }

        var fontUrl = "";

        var isPapelArte = typeof window !== "undefined" && !!window.sigeEtiquetasPapelArte;
        var logoEnfoqueUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("logo.jpg") : "";
        var logoPapelUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("loga.png") : "";
        var logoUrl = isPapelArte ? logoPapelUrl : logoEnfoqueUrl;

        var caixaUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("caixaTexto.jpg") : "";

        var tamanho = (typeof __sigeGetEtiquetaTamanhoAtual === "function")
          ? __sigeGetEtiquetaTamanhoAtual()
          : ((typeof window !== "undefined" && window.sigeEtiquetasTamanho) ? String(window.sigeEtiquetasTamanho) : "media");
        tamanho = (tamanho || "media").toLowerCase();

        var cfg = {
          w: "60mm",
          h: "35mm",
          logoH: "7mm",
          precoH: "12mm",
          descH: "9mm",
          codH: "7mm",
          precoFont: "26pt",
          descFont: "9pt",
          codFont: "14pt"
        };

        if (tamanho === "pequena") {
          cfg = { w: "40mm", h: "25mm", logoH: "5mm", precoH: "9mm", descH: "6mm", codH: "5mm", precoFont: "18pt", descFont: "7pt", codFont: "10pt" };
        } else if (tamanho === "grande") {
          cfg = { w: "75mm", h: "50mm", logoH: "10mm", precoH: "18mm", descH: "12mm", codH: "10mm", precoFont: "38pt", descFont: "12pt", codFont: "20pt" };
        }

        var etiquetasHtml = listaEtiquetas.map(function(e) {
          return `
            <div class="etiqueta">
              <div class="etiqueta-logo" style="background-image:url('${logoUrl}');"></div>
              <div class="etiqueta-preco">${renderPrecoEtiquetaHtml(e.preco)}</div>
              <div class="etiqueta-desc" style="background-image:url('${caixaUrl}');" title="${e.nome}">${e.nome}</div>
              <div class="etiqueta-cod" style="background-image:url('${caixaUrl}');">${e.codigo}</div>
            </div>
          `;
        }).join("");

        var win = window.open("", "_blank", "width=800,height=600");
        if (!win) {
          alert("Não foi possível abrir a janela de impressão (popup bloqueado?).");
          return;
        }
        win.document.write(`
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>Impressão de Etiquetas</title>
              <style>
                @font-face {
                  font-family: ui-monospace, Consolas, monospace;
                  src: url("${fontUrl}") format("truetype");
                  font-weight: normal;
                  font-style: normal;
                }
                @page {
                  margin: 5mm;
                }
                :root {
                  --etq-w: ${cfg.w};
                  --etq-h: ${cfg.h};
                  --etq-logo-h: ${cfg.logoH};
                  --etq-preco-h: ${cfg.precoH};
                  --etq-desc-h: ${cfg.descH};
                  --etq-cod-h: ${cfg.codH};
                  --etq-preco-font: ${cfg.precoFont};
                  --etq-desc-font: ${cfg.descFont};
                  --etq-cod-font: ${cfg.codFont};
                }
                body {
                  margin: 0;
                  font-family: Arial, sans-serif;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .sheet {
                  display: flex;
                  flex-wrap: wrap;
                  align-content: flex-start;
                  gap: 2mm;
                }
                .etiqueta {
                  width: var(--etq-w);
                  height: var(--etq-h);
                  background: #ffffff;
                  overflow: hidden;
                  font-family: Arial, sans-serif;
                  padding: 0;
                  border: 1px solid #111827;
                  position: relative;
                  display: flex;
                  flex-direction: column;
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                .etiqueta-logo {
                  width: 100%;
                  height: var(--etq-logo-h);
                  margin: 0 auto;
                  background-repeat: no-repeat;
                  background-position: center;
                  background-size: cover;
                }
                .etiqueta-preco {
                  width: 100%;
                  margin: 0 auto;
                  background: #000;
                  color: #fff;
                  font-size: var(--etq-preco-font);
                  text-align: center;
                  font-family: Arial, sans-serif;
                  padding: 0;
                  height: var(--etq-preco-h);
                  line-height: var(--etq-preco-h);
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  gap:2mm;
                }
                .etiqueta-preco .etiqueta-moeda,
                .etiqueta-preco .etiqueta-valor {
                  font-family: ui-monospace, Consolas, monospace;
                  letter-spacing: .06em;
                  line-height: 1;
                }
                .etiqueta-preco .etiqueta-moeda {
                  font-size: .72em;
                  font-weight: 400;
                }
                .etiqueta-desc {
                  width: 100%;
                  margin: 0 auto;
                  background-repeat: no-repeat;
                  background-position: center;
                  background-size: cover;
                  display: block;
                  padding: 1mm 2mm;
                  height: var(--etq-desc-h);
                  font-size: var(--etq-desc-font);
                  line-height: 1.05;
                  color: #000;
                  text-transform: uppercase;
                  overflow: hidden;
                  white-space: normal;
                  word-break: break-word;
                  text-overflow: clip;
                }
                .etiqueta-cod {
                  width: 100%;
                  margin: 0 auto;
                  background-repeat: no-repeat;
                  background-position: center;
                  background-size: cover;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: var(--etq-cod-h);
                  font-size: var(--etq-cod-font);
                  color: #000;
                  font-weight: 700;
                }
              </style>
            </head>
            <body onload="window.print()">
              <div class="sheet">
                ${etiquetasHtml}
              </div>
            </body>
          </html>
        `);
        win.document.close();
      }

      document.getElementById("btn-gerar-etq").addEventListener("click", function() {
        buscarEGerar();
      });
      document.getElementById("btn-excluir-etq").addEventListener("click", function() {
        excluirEtiquetasSelecionadas();
      });
      document.getElementById("btn-imprimir-etq").addEventListener("click", function() {
        imprimirEtiquetas();
      });

      campoCodigo.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          buscarEGerar();
        }
      });
    } catch (err) {
      console.warn("[SIGE Assistente] Erro ao iniciar overlay de etiquetas em Produtos/List:", err);
    }
  }
})();



/* Auto-captura Bearer no PDV falso (ProdutosPrecoVenda/Report?etq=1)
   A tela só dispara Authorization quando roda filtrar(); então clicamos automaticamente 1x
   para o inject-api.js captar e salvar o Bearer. */
(function __enfoqueAutoClickReportFiltro(){
  try {
    const path = (location.pathname || "").toLowerCase();
    const qs = new URLSearchParams(location.search || "");
    const isReportEtq = path.includes("/sistema/produtosprecovenda/report") && qs.get("etq") === "1";
    if (!isReportEtq) return;

    if (window.__enfoqueAutoFilterClicked) return;
    window.__enfoqueAutoFilterClicked = true;

    const tryClick = () => {
      try {
        const btn = document.getElementById("btnFiltrar");
        if (btn && typeof btn.click === "function") {
          btn.click();
          try { console.log("🧲 [Enfoque] Disparado 'Aplicar Filtros' para capturar Bearer automaticamente."); } catch(_) {}
          return true;
        }
      } catch(e) {}
      return false;
    };

    [200, 700, 1500, 3000, 6000].forEach((d) => setTimeout(() => { tryClick(); }, d));
  } catch (e) {}
})();

/* Etiquetas: log e botão manual */
(function(){
  document.addEventListener('click', function(e){
    if (e.target && e.target.id === 'sige-etq-btn-token') {
      const log = document.getElementById('sige-etq-log');
      if (log) log.textContent = 'Capturando Bearer automaticamente...';

      try {
        const path = (location.pathname || '').toLowerCase();
        const qs = new URLSearchParams(location.search || '');
        const isReportEtq = path.includes('/sistema/produtosprecovenda/report') && qs.get('etq') === '1';

        if (isReportEtq) {
          const btn = document.getElementById('btnFiltrar');
          if (btn && typeof btn.click === 'function') btn.click();
          if (log) log.textContent = 'Filtro disparado. Aguarde 1-2s para o token ser capturado.';
          return;
        }

        // abrir o relatório já em modo etiqueta
        const base = location.origin;
        window.open(base + '/sistema/ProdutosPrecoVenda/Report?etq=1', '_blank');
        if (log) log.textContent = 'Abrindo relatório (etq=1) para capturar Bearer automaticamente...';
      } catch (err) {
        if (log) log.textContent = 'Falha ao iniciar captura automática. Veja o console.';
      }
    }

  // Salvar Bearer manual (cola uma vez e fica salvo no storage)
  function normalizeBearer(v){
    if (!v) return "";
    v = String(v).trim();
    if (!v) return "";
    if (/^Bearer\s+/i.test(v)) return "Bearer " + v.replace(/^Bearer\s+/i, "").trim();
    // permite colar só o token
    if (v.length > 20) return "Bearer " + v;
    return "";
  }

  function loadBearerIntoInput(){
    try{
      chrome.storage.local.get(['sige_api_token_manual'], function(res){
        const input = document.getElementById('sige-etq-bearer');
        if (!input) return;
        const t = res && res.sige_api_token_manual ? String(res.sige_api_token_manual) : "";
        if (t) input.value = t;
      });
    }catch(e){}
  }

  if (!window.__enfoqueEtqSaveBearerListenerInstalled) {
  window.__enfoqueEtqSaveBearerListenerInstalled = true;
  document.addEventListener('click', function(e){
    if (e.target && e.target.id === 'sige-etq-save-bearer') {
      const input = document.getElementById('sige-etq-bearer');
      const log = document.getElementById('sige-etq-log');
      const raw = input ? input.value : "";
      const token = normalizeBearer(raw);

      if (!token) {
        if (log) log.textContent = 'Bearer inválido. Cole o token (com ou sem "Bearer ").';
        return;
      }

      try{
        chrome.storage.local.set({ sige_api_token_manual: token }, function(){
          if (log) log.textContent = '✅ Bearer salvo no storage local. Você não precisa colar novamente neste PC.';
          console.log('[Etiquetas] Bearer manual salvo no storage.');
        });
      }catch(err){
        if (log) log.textContent = 'Erro ao salvar Bearer no storage.';
      }
    }
  });
}


  // Ao abrir a aba Etiquetas, pré-carrega bearer salvo (se existir)
  loadBearerIntoInput();

  });
  chrome.storage.local.get(['sige_api_token'], function(res){
    const log = document.getElementById('sige-etq-log');
    if (!log) return;
    if (res && res.sige_api_token) log.textContent = 'Token OK. API pronta.';
  });
})();


/* ==============================================
   PDV: reduzir erro humano (Cartão Crédito/Débito)
   Problema: operador escolhe “Cartão de Crédito” / “Cartão de Débito” na tela de formas
   e depois o SIGE pede novamente no campo CredenciadoraCartao (autocomplete).
   Objetivo: quando o campo CredenciadoraCartao ganhar foco, preencher automaticamente
   apenas o prefixo "CREDITO" ou "DEBITO" conforme a escolha anterior (ou conforme o
   select #selectFormaPagamento quando existir). Sem avisos na UI.
================================================= */
(function(){
  try {
    const isPDV = () => /\/sistema\/pdv/i.test(location.pathname) || /\/sistema\/pdv/i.test(location.href);
    const isEtiquetas = () => {
      try { return new URLSearchParams(location.search).get("etq") === "1"; } catch(_) { return false; }
    };
    if (!isPDV() || isEtiquetas()) return;

    let lastEscolha = null; // "CREDITO" | "DEBITO" (fallback quando o select ainda não existe)

    const norm = (s) => (s || "").toString().trim().toUpperCase();

    const prefixFromTexto = (txt) => {
      const t = norm(txt);
      if (!t) return null;

      // variações com/sem acento
      const noAccents = t
        .replace(/Á|À|Â|Ã/g, "A")
        .replace(/É|Ê/g, "E")
        .replace(/Í/g, "I")
        .replace(/Ó|Ô|Õ/g, "O")
        .replace(/Ú/g, "U")
        .replace(/Ç/g, "C");

      if (noAccents.includes("CARTAO DE CREDITO") || noAccents.includes("CREDITO")) return "CREDITO";
      if (noAccents.includes("CARTAO DE DEBITO") || noAccents.includes("DEBITO")) return "DEBITO";
      return null;
    };

    const formaTextoDaLinhaDoInput = (inputEl) => {
      try {
        if (!inputEl || !inputEl.closest) return "";
        const detailTr = inputEl.closest('tr');

        // Estrutura real do SIGE: a credenciadora fica em um <tr> de detalhes
        // separado. Para pagamento dividido, a forma correta e a primeira
        // .tbFormaPagamento encontrada caminhando PARA CIMA a partir desse tr.
        if (detailTr) {
          let row = detailTr.previousElementSibling;
          let guard = 0;
          while (row && guard++ < 12) {
            const formaEl = row.querySelector && row.querySelector('.tbFormaPagamento');
            const txt = formaEl ? String(formaEl.textContent || formaEl.innerText || '').trim() : '';
            if (txt) return txt;
            row = row.previousElementSibling;
          }
        }

        // Fallback quando o SIGE agrupa cada pagamento em um tbody proprio.
        const tb = inputEl.closest('tbody');
        if (tb) {
          const formaEls = Array.from(tb.querySelectorAll('.tbFormaPagamento'));
          for (let i = formaEls.length - 1; i >= 0; i--) {
            const txt = String(formaEls[i].textContent || formaEls[i].innerText || '').trim();
            if (txt) return txt;
          }
        }
      } catch (_) {}
      return "";
    };

    const readFormaAtual = (inputEl) => {
      // Fonte principal: linha real de pagamento correspondente a ESTE input.
      const fromRow = prefixFromTexto(formaTextoDaLinhaDoInput(inputEl));
      if (fromRow) return fromRow;

      // fallback: usa o select principal apenas quando a linha ainda nao apareceu.
      const sel = document.querySelector("#selectFormaPagamento");
      const raw = sel && sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : "";
      return prefixFromTexto(raw);
    };

    const setInputValue = (el, value) => {
      if (!el) return;
      const last = String(el.value || '');

      // Usa o setter nativo para o AngularJS/ngModel perceber a mudanca mesmo
      // quando outro codigo colocou um setter/proxy na propriedade value.
      try {
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (desc && typeof desc.set === 'function') desc.set.call(el, value);
        else el.value = value;
      } catch (_) {
        el.value = value;
      }

      // AngularJS 1.x escuta input/change; o autocomplete legado do SIGE tambem
      // reage a keyup. Disparamos todos no mesmo elemento real.
      try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
      try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
      try {
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) || " " }));
      } catch (_) {
        try { el.dispatchEvent(new Event("keyup", { bubbles: true })); } catch (_) {}
      }

      if (last !== value) {
        try { el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "-" })); } catch (_) {}
      }
    };

    const isCredenciadoraInput = (el) => {
      if (!el || el.tagName !== "INPUT" || el.type !== "text") return false;
      const ng = el.getAttribute("ng-model") || "";
      return ng === "item.CredenciadoraCartao" || /CredenciadoraCartao/i.test(ng);
    };

    const parseMoneyBR = (value) => {
      try {
        let raw = String(value || "")
          .replace(/R\$/gi, "")
          .replace(/\s+/g, "")
          .replace(/[^0-9,.-]/g, "");
        if (!raw) return 0;
        if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      } catch (_) { return 0; }
    };

    const readTextoDiretoTotalPedido = (el) => {
      try {
        if (!el) return "";
        const clone = el.cloneNode(true);
        try { clone.querySelectorAll("span").forEach((span) => span.remove()); } catch (_) {}
        return String(clone.textContent || "").trim();
      } catch (_) { return ""; }
    };

    const readTotalPedidoParaCredito = () => {
      try {
        const candidatos = Array.from(document.querySelectorAll("#totalPedido"))
          .filter((el) => {
            try {
              const st = window.getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0;
            } catch (_) { return true; }
          });

        const preferido = candidatos.find((el) => el.closest && el.closest(".content70")) || candidatos[0];
        const valor = parseMoneyBR(readTextoDiretoTotalPedido(preferido));
        if (valor > 0) return valor;
      } catch (_) {}
      return 0;
    };

    const textoCredenciadoraDesejado = (inputEl, desired) => {
      if (desired === "CREDITO") {
        const totalVenda = readTotalPedidoParaCredito();
        // Regra Enfoque: somente vendas abaixo de R$ 200 podem entrar direto como 1X.
        // A partir de R$ 200, deixa apenas o prefixo para o menu de parcelas abrir.
        if (totalVenda > 0 && totalVenda < 200) return "CREDITO - 1X";
        return "CREDITO - ";
      }
      return desired + " - ";
    };

    const autofillIfNeeded = (el) => {
      if (!isCredenciadoraInput(el)) return;

      // Fonte primária: select da tela de Pagamentos (quando existir)
      const desired = readFormaAtual(el) || lastEscolha;

      if (desired !== "CREDITO" && desired !== "DEBITO") return;

      // No credito quem controla bandeira, credenciadora, condicao e parcelas e
      // o modal visual acima. Nao preenchemos automaticamente aqui para nao
      // fazer o SIGE parecer "ja configurado" e pular o modal.
      if (desired === "CREDITO") return;

      const wanted = textoCredenciadoraDesejado(el, desired);
      const current = norm(el.value);

      if (current === norm(wanted)) return;

      if (desired === "DEBITO") {
        // Pagamento dividido: a decisao e sempre da LINHA atual.
        // Ao focar a credenciadora de debito, inicia por DEBITO - .
        // Se uma credenciadora de debito ja tiver sido selecionada, preserva o valor.
        if (current.startsWith("DEBITO - ") && current.length > norm("DEBITO - ").length) return;
        setInputValue(el, "DEBITO - ");
        try { hideCreditRangeSuggestions(); } catch (_) {}
        return;
      }

      if (current && current.startsWith(desired) && desired === "CREDITO" && norm(wanted) !== "CREDITO - 1X") return;

      setInputValue(el, wanted);
    };

    // Mantem o campo de credenciadora sincronizado automaticamente em TODAS as
    // linhas de debito, partindo do INPUT real. Isso evita depender da forma como
    // o Angular/SIGE distribui os <tr> entre tbodies.
    let debitSyncTimer = 0;
    const syncDebitCredenciadoras = () => {
      try {
        document.querySelectorAll('#tabelaPagamentos input[ng-model="item.CredenciadoraCartao"], input[ng-model="item.CredenciadoraCartao"]').forEach((el) => {
          try {
            if (!isCredenciadoraInput(el)) return;
            const forma = readFormaAtual(el) || lastEscolha;
            if (forma !== 'DEBITO') return;

            const currentRaw = String(el.value || '');
            const current = norm(currentRaw);
            // Preserva uma credenciadora de debito ja escolhida, ex.: DEBITO - REDE.
            if (current.startsWith('DEBITO - ') && current.length > norm('DEBITO - ').length) return;

            if (current !== norm('DEBITO - ') || currentRaw !== 'DEBITO - ') {
              setInputValue(el, 'DEBITO - ');
            }
          } catch (_) {}
        });
      } catch (_) {}
    };

    const scheduleDebitSync = (delay = 30) => {
      try { clearTimeout(debitSyncTimer); } catch (_) {}
      debitSyncTimer = setTimeout(syncDebitCredenciadoras, delay);
    };

    // 1) Capturar a escolha na tela de formas (botões)
    const btnIdToPrefix = {
      btnFormaCartaoCredito: "CREDITO",
      btnFormaCartaoDebito: "DEBITO"
    };

    document.addEventListener("click", (ev) => {
      const t = ev.target;
      const btn = t && t.closest && t.closest("input[type='button'][id^='btnForma']");
      if (!btn) return;
      const p = btnIdToPrefix[btn.id] || null;
      if (p) {
        lastEscolha = p;
        if (p === "DEBITO") {
          // A linha do SIGE pode ser criada alguns ms depois do clique.
          scheduleDebitSync(20);
          setTimeout(syncDebitCredenciadoras, 120);
          setTimeout(syncDebitCredenciadoras, 350);
        }
      }
    }, true);

    // 2) Capturar atalhos (F3 crédito, F4 débito)
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "F3") lastEscolha = "CREDITO";
      if (ev.key === "F4") {
        lastEscolha = "DEBITO";
        scheduleDebitSync(20);
        setTimeout(syncDebitCredenciadoras, 120);
      }
    }, true);

    // 3) Se o operador mudar o select na tela de Pagamentos, atualizar fallback
    const bindSelect = () => {
      const sel = document.querySelector("#selectFormaPagamento");
      if (!sel || sel.__enfoqueBound) return;
      sel.__enfoqueBound = true;
      sel.addEventListener("change", () => {
        const p = readFormaAtual(document.activeElement);
        if (p) {
          lastEscolha = p;
          if (p === "DEBITO") scheduleDebitSync(20);
        }
      }, true);
    };

    // 4) No foco do campo, autopreencher debito. No credito, o modal visual
    // sera aberto pelo capturador principal (bandeira -> parcelas).
    document.addEventListener("focusin", (ev) => {
      autofillIfNeeded(ev.target);
      try {
        if (isCredenciadoraInput(ev.target)) {
          const forma = readFormaAtual(ev.target) || lastEscolha;
          if (forma === "DEBITO") {
            // O ng-focus do SIGE pode rodar depois do nosso listener e mexer no campo.
            // Reaplica logo apos o ciclo atual e novamente alguns ms depois.
            setTimeout(() => autofillIfNeeded(ev.target), 0);
            setTimeout(() => autofillIfNeeded(ev.target), 80);
          } else if (forma === "CREDITO") {
            ev.target.dataset.enfoqueCreditFocusAt = String(Date.now());
            ev.target.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      } catch (_) {}
    }, true);

    // 5) Observer para SPA/Angular: elementos aparecem depois
    const mo = new MutationObserver(() => {
      bindSelect();
      try { autofillIfNeeded(document.activeElement); } catch(_) {}
      // Se o SIGE acabou de inserir/renderizar uma linha de debito, preenche
      // a credenciadora imediatamente sem exigir foco manual.
      scheduleDebitSync(25);
    });
    mo.observe(document.documentElement, { subtree: true, childList: true });

    // Qualquer mudanca relevante da tela de pagamentos pode trocar/criar a linha.
    ['change', 'input', 'click'].forEach((evtName) => {
      document.addEventListener(evtName, (ev) => {
        try {
          const t = ev.target;
          if (!t) return;
          const ng = t.getAttribute && String(t.getAttribute('ng-model') || '');
          const id = String(t.id || '');
          if (/FormaPagamento|CredenciadoraCartao/i.test(ng) || /FormaPagamento|btnFormaCartaoDebito/i.test(id)) {
            scheduleDebitSync(0);
            setTimeout(syncDebitCredenciadoras, 60);
            setTimeout(syncDebitCredenciadoras, 180);
          }
        } catch (_) {}
      }, true);
    });

    bindSelect();
    scheduleDebitSync(10);
  } catch (err) {
    // silencioso por design
  }
})();


// =============================================================
// PDV: opções de parcelamento de crédito só aparecem quando o campo contém CREDITO
// =============================================================
(function(){
  try {
    const isPDV = () => /\/sistema\/pdv/i.test(location.pathname || location.href || "");
    if (!isPDV()) return;

    const norm = (v) => String(v || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    const isCredInput = (el) => {
      try {
        if (!el || el.tagName !== "INPUT") return false;
        const ng = el.getAttribute("ng-model") || "";
        return /CredenciadoraCartao/i.test(ng) || /credenciadora/i.test(el.id || el.name || "");
      } catch (_) { return false; }
    };

    const activeAllowsCreditRanges = () => {
      const el = document.activeElement;
      if (!isCredInput(el)) return false;
      return norm(el.value).includes("CREDITO");
    };

    const looksLikeCreditRangeBox = (el) => {
      try {
        if (!el || !el.textContent) return false;
        if (el.id === "enfoque-credit-range-suggestions") return true;
        const t = norm(el.textContent);
        return t.includes("CREDITO - 1X") || t.includes("CREDITO - 2X") || t.includes("CREDITO - 7X");
      } catch (_) { return false; }
    };

    const enforce = () => {
      const allow = activeAllowsCreditRanges();
      // V42: não mexer mais nos menus nativos do SIGE (`div.autocomplete-suggestions`).
      // Nas versões anteriores esse seletor era amplo demais e podia esconder o menu
      // de bandeira/credenciadora/parcelas. Agora só controlamos o menu criado pela
      // própria extensão, quando existir.
      document.querySelectorAll("#enfoque-credit-range-suggestions").forEach((el) => {
        if (!looksLikeCreditRangeBox(el)) return;
        if (allow) {
          if (el.dataset.enfoqueCreditHidden === "1") {
            el.style.removeProperty("display");
            el.style.removeProperty("visibility");
            el.style.removeProperty("pointer-events");
            delete el.dataset.enfoqueCreditHidden;
          }
        } else {
          el.dataset.enfoqueCreditHidden = "1";
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("pointer-events", "none", "important");
        }
      });
    };

    document.addEventListener("input", enforce, true);
    document.addEventListener("keyup", enforce, true);
    document.addEventListener("focusin", () => setTimeout(enforce, 0), true);
    document.addEventListener("focusout", () => setTimeout(enforce, 60), true);
    const mo = new MutationObserver(enforce);
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    setInterval(enforce, 180);
  } catch (_) {}
})();


// =============================================================
// 
// =============================================================
// ENFOQUE - ORÇAMENTO ESCOLAR (observações compartilhadas via GitHub Gist)
// - No EDIT: botão "Descrição" no canto superior direito (abre popup para enviar)
// - No LIST: botão discreto por linha (código) para ver observação
// - Painel lateral: aba fixa "Observações" com busca + notificações
// =============================================================

const __ENFOQUE_GH_API_BASE__ = "https://api.github.com";
const __ENFOQUE_GIST_DEFAULT_FILE__ = "enfoque_orcamento_observacoes.json";


// ---------------- Perfil.txt (Gist config) ----------------
// A extensão pode ler automaticamente o Gist ID e Token de um arquivo "perfil.txt"
// dentro da pasta da extensão. Formato esperado (exemplo):
// id: <gist_id>
// token: <github_pat_...>
let __enfoquePerfilTxtCache = null; // {gist_id, token, at}
let __enfoquePerfil2TxtCache = null; // {gist_id, token, at}

async function __enfoqueReadPerfilTxt(force = false) {
  try {
    const now = Date.now();
    if (!force && __enfoquePerfilTxtCache && (now - __enfoquePerfilTxtCache.at) < 5 * 60 * 1000) {
      return { gist_id: __enfoquePerfilTxtCache.gist_id, token: __enfoquePerfilTxtCache.token };
    }

    const url = chrome.runtime.getURL("perfil.txt");
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return null;

    const raw = await resp.text();
    const lines = String(raw || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let gist_id = "";
    let token = "";

    for (const line of lines) {
      const m = line.match(/^([a-zA-Z_\-]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const k = m[1].toLowerCase();
      const v = String(m[2] || "").trim();
      if (!v) continue;

      if (k === "id" || k === "gist" || k === "gist_id" || k === "gistid") gist_id = v;
      if (k === "token" || k === "pat" || k === "github_token" || k === "gh_token") token = v;
    }

    if (!gist_id && !token) return null;

    __enfoquePerfilTxtCache = { gist_id, token, at: now };
    return { gist_id, token };
  } catch (_) {
    return null;
  }
}

async function __enfoqueReadPerfil2Txt(force = false) {
  try {
    const now = Date.now();
    if (!force && __enfoquePerfil2TxtCache && (now - __enfoquePerfil2TxtCache.at) < 5 * 60 * 1000) {
      return { gist_id: __enfoquePerfil2TxtCache.gist_id, token: __enfoquePerfil2TxtCache.token };
    }

    // perfil2.txt é opcional; se não existir, retorna null
    const url = chrome.runtime.getURL("perfil2.txt");
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return null;

    const raw = await resp.text();
    const lines = String(raw || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let gist_id = "";
    let token = "";

    for (const line of lines) {
      const m = line.match(/^([a-zA-Z_\-]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const k = m[1].toLowerCase();
      const v = String(m[2] || "").trim();
      if (!v) continue;

      if (k === "id" || k === "gist" || k === "gist_id" || k === "gistid") gist_id = v;
      if (k === "token" || k === "pat" || k === "github_token" || k === "gh_token") token = v;
    }

    if (!gist_id && !token) return null;

    __enfoquePerfil2TxtCache = { gist_id, token, at: now };
    return { gist_id, token };
  } catch (_) {
    return null;
  }
}

const __enfoqueNotesCache = new Map(); // codigo -> {note, author, ts}
let __enfoqueNotesLastSyncAt = 0;
let __enfoqueNotesInFlight = null;
let __enfoqueNotesPollTimer = null;

let __orcEditActive = false;
let __orcListActive = false;

let __orcEditWidget = null;      // botão + popup
let __orcEditTickTimer = null;   // interval/tick do banner no Edit
let __orcListObserver = null;
let __orcListScanTimer = null;

// ---------------- Storage helpers ----------------
function __enfoqueUuid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

async function __enfoqueStorageGet(keys) {
  // Compatível com Chrome antigo (sem Promises no chrome.storage)
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    } catch (_) {
      resolve({});
    }
  });
}
async function __enfoqueStorageSet(obj) {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.set(obj || {}, () => resolve(true));
    } catch (_) {
      resolve(false);
    }
  });
}


// ---------------- Config ----------------
async function __enfoqueObsGetConfig() {
  const cfg = await __enfoqueStorageGet([
    "enfoq_gist_id",
    "enfoq_gh_token",
    "enfoq_gist_file",
    "enfoq_obs_client_id",
    "enfoq_gist_etag",
    "enfoq_obs_auth_ok",
    "enfoq_obs_auth_email"
  ]);

  
  // Se existir perfil.txt na extensão, ele prevalece e atualiza o storage automaticamente
  try {
    const perfil = await __enfoqueReadPerfilTxt(false);
    if (perfil && (perfil.gist_id || perfil.token)) {
      const up = {};
      if (perfil.gist_id) { cfg.enfoq_gist_id = perfil.gist_id; up.enfoq_gist_id = perfil.gist_id; }
      if (perfil.token) { cfg.enfoq_gh_token = perfil.token; up.enfoq_gh_token = perfil.token; }
      if (Object.keys(up).length) await __enfoqueStorageSet(up);
    }
  } catch (_) {}
let client_id = cfg.enfoq_obs_client_id;
  if (!client_id) {
    client_id = "pc_" + __enfoqueUuid();
    await __enfoqueStorageSet({ enfoq_obs_client_id: client_id });
  }

  return {
    gist_id: (cfg.enfoq_gist_id || "").trim(),
    token: (cfg.enfoq_gh_token || "").trim(),
    file: (cfg.enfoq_gist_file || "").trim() || __ENFOQUE_GIST_DEFAULT_FILE__,
    client_id,
    etag: (cfg.enfoq_gist_etag || "").trim(),
    auth_ok: !!cfg.enfoq_obs_auth_ok,
    auth_email: (cfg.enfoq_obs_auth_email || "").trim()
  };
}
async function __enfoqueObsGetAuthState() {
  const s = await __enfoqueStorageGet(["enfoq_obs_auth_email"]); 
  return { ok: true, email: (s.enfoq_obs_auth_email || "").trim() };
}

async function __enfoqueObsSetAuthState({ ok, email }) {
  const obj = {};
  if (typeof ok === "boolean") obj.enfoq_obs_auth_ok = ok;
  if (typeof email === "string") obj.enfoq_obs_auth_email = email.trim();
  await __enfoqueStorageSet(obj);
}

function __enfoqueReadHeaderUserEmail() {
  try {
    const el = document.querySelector("#nomeCurrentUsuarioHeader");
    const t = el ? String(el.textContent || "").trim() : "";
    return t;
  } catch (_) { return ""; }
}

async function __enfoqueObsSetConfig({ gist_id, token, file }) {
  const obj = {};
  if (typeof gist_id === "string") obj.enfoq_gist_id = gist_id.trim();
  if (typeof token === "string") obj.enfoq_gh_token = token.trim();
  if (typeof file === "string") obj.enfoq_gist_file = file.trim();
  await __enfoqueStorageSet(obj);
}

// ---------------- Badge helpers ----------------
function __enfoqueSetObsBadge(n) {
  try {
    const el = document.getElementById("enfoque-obs-badge");
    if (!el) return;
    const num = Number(n || 0);
    if (num > 0) {
      el.textContent = String(num);
      el.style.display = "flex";
    } else {
      el.textContent = "";
      el.style.display = "none";
    }
  } catch (_) {}
}

// ---------------- Cache persistence ----------------
async function __enfoqueObsLoadCacheFromStorage() {
  const s = await __enfoqueStorageGet(["enfoq_obs_cache"]);
  const obj = s.enfoq_obs_cache || {};
  __enfoqueNotesCache.clear();
  try {
    for (const [codigo, v] of Object.entries(obj)) {
      if (!codigo) continue;
      if (!v || typeof v !== "object") continue;
      __enfoqueNotesCache.set(String(codigo), {
        note: String(v.note || ""),
        author: String(v.author || ""),
        authorEmail: String(v.authorEmail || v.author_email || ""),
        school: String(v.school || v.cliente || ""),
        ts: Number(v.ts || 0)
      });
    }
  } catch (_) {}
}

async function __enfoqueObsSaveCacheToStorage() {
  const obj = {};
  for (const [codigo, v] of __enfoqueNotesCache.entries()) {
    obj[codigo] = { note: v.note || "", author: v.author || "", authorEmail: v.authorEmail || "", school: v.school || "", ts: Number(v.ts || 0) };
  }
  await __enfoqueStorageSet({ enfoq_obs_cache: obj });
}

// ---------------- GitHub Gist API ----------------
async function __enfoqueGhFetch(url, token, extraHeaders = {}) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extraHeaders
  };
  if (token) headers["Authorization"] = "Bearer " + token;

  const resp = await fetch(url, { method: "GET", headers, cache: "no-store", credentials: "omit" });
  return resp;
}

async function __enfoqueGhPatch(url, token, bodyObj) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
  if (token) headers["Authorization"] = "Bearer " + token;

  const resp = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(bodyObj),
    cache: "no-store",
    credentials: "omit"
  });
  return resp;
}

function __enfoqueSafeJsonParse(s) {
  try { return JSON.parse(String(s || "")); } catch (_) { return null; }
}

async function __enfoqueGistReadNotes(cfg, { force = false } = {}) {
  if (!cfg || !cfg.gist_id || !cfg.token) return { changed: false, notes: {} };

  const headers = {};
  if (!force && cfg.etag) headers["If-None-Match"] = cfg.etag;

  const url = `${__ENFOQUE_GH_API_BASE__}/gists/${encodeURIComponent(cfg.gist_id)}`;
  const resp = await __enfoqueGhFetch(url, cfg.token, headers);

  if (resp.status === 304) return { changed: false, notes: {} };
  if (resp.status === 404) throw new Error("Gist não encontrado (404). Confira o Gist ID.");
  if (resp.status === 401 || resp.status === 403) throw new Error("Token sem permissão (401/403). Confira escopo 'gist'.");
  if (!resp.ok) throw new Error("Erro GitHub: " + resp.status);

  const etag = resp.headers.get("ETag") || "";
  const json = await resp.json();

  const files = json && json.files ? json.files : {};
  const fileInfo = files[cfg.file] || files[Object.keys(files || {})[0]];

  let content = "";
  if (fileInfo && typeof fileInfo.content === "string") {
    content = fileInfo.content;
  } else if (fileInfo && fileInfo.raw_url) {
    // fallback para raw_url (caso esteja truncado)
    const rawResp = await __enfoqueGhFetch(fileInfo.raw_url, cfg.token, {});
    if (rawResp.ok) content = await rawResp.text();
  }

  const parsed = __enfoqueSafeJsonParse(content) || {};
  const notes = (parsed && typeof parsed === "object" && parsed.notes && typeof parsed.notes === "object") ? parsed.notes : {};

  await __enfoqueStorageSet({ enfoq_gist_etag: etag || "" });
  return { changed: true, notes };
}

async function __enfoqueGistWriteNotes(cfg, notesObj) {
  if (!cfg || !cfg.gist_id || !cfg.token) throw new Error("Config incompleta (gist_id/token).");

  const url = `${__ENFOQUE_GH_API_BASE__}/gists/${encodeURIComponent(cfg.gist_id)}`;
  const payload = {
    files: {
      [cfg.file]: {
        content: JSON.stringify({
          version: 1,
          updated_at: Date.now(),
          notes: notesObj || {}
        }, null, 2)
      }
    }
  };

  const resp = await __enfoqueGhPatch(url, cfg.token, payload);
  if (resp.status === 404) throw new Error("Gist não encontrado (404).");
  if (resp.status === 401 || resp.status === 403) throw new Error("Token sem permissão (401/403).");
  if (!resp.ok) throw new Error("Erro ao salvar no Gist: " + resp.status);

  const etag = resp.headers.get("ETag") || "";
  await __enfoqueStorageSet({ enfoq_gist_etag: etag || "" });
  return true;
}

// ---------------- Sync / unseen counter ----------------
async function __enfoqueObsComputeUnseenCount(cfg) {
  const st = await __enfoqueStorageGet(["enfoq_obs_seen_map"]);
  const seen = st.enfoq_obs_seen_map || {};
  let unseen = 0;

  for (const [codigo, v] of __enfoqueNotesCache.entries()) {
    const ts = Number(v.ts || 0);
    const lastSeen = Number(seen[codigo] || 0);
    if (ts > lastSeen && String(v.author || "") !== String(cfg.client_id || "")) unseen++;
  }
  await __enfoqueStorageSet({ enfoq_obs_unseen_count: unseen });
  __enfoqueSetObsBadge(unseen);
  return unseen;
}

async function __enfoqueObsMarkAllRead() {
  const cfg = await __enfoqueObsGetConfig();
  const seen = {};
  for (const [codigo, v] of __enfoqueNotesCache.entries()) {
    seen[codigo] = Number(v.ts || 0);
  }
  await __enfoqueStorageSet({ enfoq_obs_seen_map: seen, enfoq_obs_unseen_count: 0 });
  __enfoqueSetObsBadge(0);
}

async function __enfoqueObsSync({ force = false } = {}) {
  if (__enfoqueNotesInFlight) return __enfoqueNotesInFlight;

  const now = Date.now();
  if (!force && (now - __enfoqueNotesLastSyncAt) < 15000) return;

  __enfoqueNotesInFlight = (async () => {
    const cfg = await __enfoqueObsGetConfig();
    if (!cfg.gist_id || !cfg.token) {
      __enfoqueSetObsBadge(0);
      return;
    }

    try {
      const res = await __enfoqueGistReadNotes(cfg, { force });
      if (res && res.changed) {
        __enfoqueNotesCache.clear();
        const notes = res.notes || {};
        for (const [codigo, v] of Object.entries(notes)) {
          if (!codigo) continue;
          const vv = v && typeof v === "object" ? v : {};
          __enfoqueNotesCache.set(String(codigo), {
            note: String(vv.note || ""),
            author: String(vv.author || ""),
            authorEmail: String(vv.authorEmail || vv.author_email || ""),
            school: String(vv.school || vv.cliente || ""),
            ts: Number(vv.ts || 0)
          });
        }
        await __enfoqueObsSaveCacheToStorage();
      }
      __enfoqueNotesLastSyncAt = now;
      await __enfoqueObsComputeUnseenCount(cfg);
    } catch (e) {
      // se der erro, não quebra o resto da extensão
      // (badge fica como estava)
      console.warn("[Orçamento Observações] Sync erro:", e);
    }
  })().finally(() => {
    __enfoqueNotesInFlight = null;
  });

  return __enfoqueNotesInFlight;
}

async function __enfoqueNoteGetMany(codigos) {
  await __enfoqueObsSync({ force: false });
  const out = {};
  for (const c of (codigos || [])) {
    const codigo = String(c || "");
    if (!codigo) continue;
    const v = __enfoqueNotesCache.get(codigo);
    out[codigo] = v ? { note: v.note, author: v.author, ts: v.ts } : null;
  }
  return out;
}



async function __enfoqueBuildNotesObjFromCache() {
  const merged = {};
  for (const [k, v] of __enfoqueNotesCache.entries()) {
    const key = String(k || "").trim();
    if (!key) continue;
    const clean = String(v && v.note ? v.note : "").trimEnd();
    if (!clean) continue; // não salva vazio
    merged[key] = {
      note: clean,
      author: String(v.author || ""),
      authorEmail: String(v.authorEmail || ""),
      school: String(v.school || ""),
      ts: Number(v.ts || 0)
    };
  }
  return merged;
}

async function __enfoqueNoteDelete(codigo) {
  const cfg = await __enfoqueObsGetConfig();
  const c = String(codigo || "").trim();
  if (!c) throw new Error("Código vazio.");

  // sincroniza antes de deletar (para não apagar atualizações recentes)
  await __enfoqueObsSync({ force: true });

  __enfoqueNotesCache.delete(c);
  await __enfoqueObsSaveCacheToStorage();

  const merged = await __enfoqueBuildNotesObjFromCache();
  // garante remoção mesmo se existir no merged
  delete merged[c];

  await __enfoqueGistWriteNotes(cfg, merged);

  // atualiza cache novamente após gravar
  __enfoqueNotesCache.delete(c);
  await __enfoqueObsSaveCacheToStorage();
  await __enfoqueObsComputeUnseenCount(cfg);

  try { window.__enfoqueObservacoesPanelRender && window.__enfoqueObservacoesPanelRender(); } catch (_) {}
}

async function __enfoqueNoteSet(codigo, noteText, meta = {}) {
  const cfg = await __enfoqueObsGetConfig();
  const c = String(codigo || "").trim();
  if (!c) throw new Error("Código vazio.");

  const cleanNote = String(noteText || "").trimEnd();

  // se vazio => deletar
  if (!cleanNote) {
    await __enfoqueNoteDelete(c);
    return;
  }

  const school = typeof meta.school === "string" ? meta.school.trim() : "";
  const authorEmail = typeof meta.authorEmail === "string" ? meta.authorEmail.trim() : (cfg.auth_email || "");

  const entry = {
    note: cleanNote,
    author: cfg.client_id,
    authorEmail,
    school,
    ts: Date.now()
  };

  // atualiza local primeiro (rápido)
  __enfoqueNotesCache.set(c, entry);
  await __enfoqueObsSaveCacheToStorage();

  // atualiza remoto (merge com o que estiver no gist)
  await __enfoqueObsSync({ force: true }); // pega versão mais recente antes de gravar

  // re-aplica entry depois do sync (sync pode sobrescrever)
  __enfoqueNotesCache.set(c, entry);

  const merged = await __enfoqueBuildNotesObjFromCache();
  merged[c] = {
    note: entry.note,
    author: entry.author,
    authorEmail: entry.authorEmail,
    school: entry.school,
    ts: entry.ts
  };

  await __enfoqueGistWriteNotes(cfg, merged);

  // garante que o cache fique consistente com o que foi enviado
  __enfoqueNotesCache.set(c, entry);
  await __enfoqueObsSaveCacheToStorage();
  await __enfoqueObsComputeUnseenCount(cfg);

  try { window.__enfoqueObservacoesPanelRender && window.__enfoqueObservacoesPanelRender(); } catch (_) {}
}

// ---------------- UI helpers (CSS + Popup) ----------------
let __orcCssAdded = false;
function __enfoqueEnsureOrcamentoCss() {
  if (__orcCssAdded) return;
  __orcCssAdded = true;

  const st = document.createElement("style");
  st.textContent = `
    #__enfoque_orc_desc_btn{
      position:fixed;
      top: 14px;
      right: 14px;
      z-index: 2147483647;
      padding: 10px 12px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,.55);
      background: rgba(17,24,39,.88);
      color: #e5e7eb;
      font-size: 12px;
      font-weight: 800;
      cursor:pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.25);
    }
    #__enfoque_orc_desc_btn:hover{ filter: brightness(1.07); }

    #__enfoque_orc_desc_pop{
      position:fixed;
      top: 58px;
      right: 14px;
      z-index: 2147483647;
      width: 360px;
      max-width: calc(100vw - 28px);
      background: rgba(17,24,39,.97);
      border: 1px solid rgba(148,163,184,.35);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      padding: 12px;
      color: #e5e7eb;
      display:none;
    }
    #__enfoque_orc_desc_pop .row{
      display:flex;
      gap:8px;
      align-items:center;
      flex-wrap:wrap;
    }
    #__enfoque_orc_desc_pop textarea{
      width:100%;
      min-height: 92px;
      resize: vertical;
      padding: 10px 10px;
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,.35);
      background: rgba(255,255,255,.04);
      color: #e5e7eb;
      font-size: 12px;
      outline:none;
    }
    #__enfoque_orc_desc_pop button{
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,.35);
      background: rgba(255,255,255,.05);
      color:#e5e7eb;
      font-size: 12px;
      cursor:pointer;
    }
    #__enfoque_orc_desc_pop button:hover{ filter: brightness(1.07); }

    .__enfoque_orc_note_btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius: 999px;
      border: 1px solid rgba(31,111,235,0.35);
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      opacity: 0.55;
      background: rgba(31,111,235,0.14);
      color: #1f6feb;
    }
    .__enfoque_orc_note_btn:hover{ opacity: 0.95; background: rgba(31,111,235,0.22); }

    .__enfoque_orc_popup{
      position: fixed;
      z-index: 1000002;
      max-width: 420px;
      min-width: 240px;
      background: rgba(255,255,255,0.98);
      border: 1px solid rgba(0,0,0,0.15);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.25);
      padding: 10px 12px;
      color: #111827;
      font-size: 12px;
    }
    .__enfoque_orc_popup .t{ font-weight: 800; margin-bottom: 8px; }
    .__enfoque_orc_popup .b{ white-space: pre-wrap; }
    .__enfoque_orc_popup .f{ display:flex;justify-content:space-between;margin-top:8px;font-size:11px;opacity:.75; }
  `;
  document.documentElement.appendChild(st);
}

function __enfoqueShowPopupNear(anchorEl, title, bodyText, footerLeft, msAutoHide = 8000) {
  try {
    const r = anchorEl.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = "__enfoque_orc_popup";

    const t = document.createElement("div");
    t.className = "t";
    t.textContent = String(title || "");

    const b = document.createElement("div");
    b.className = "b";
    b.textContent = String(bodyText || "");

    const f = document.createElement("div");
    f.className = "f";
    const fl = document.createElement("div");
    fl.textContent = String(footerLeft || "");
    const fr = document.createElement("div");
    fr.textContent = "Clique fora para fechar";
    f.appendChild(fl); f.appendChild(fr);

    pop.appendChild(t);
    pop.appendChild(b);
    pop.appendChild(f);

    pop.style.left = Math.min(window.innerWidth - 20, Math.max(10, r.left)) + "px";
    pop.style.top = Math.min(window.innerHeight - 20, r.bottom + 8) + "px";

    document.body.appendChild(pop);

    const closer = (ev) => {
      if (!pop.contains(ev.target)) {
        document.removeEventListener("mousedown", closer, true);
        try { pop.remove(); } catch (_) {}
      }
    };
    document.addEventListener("mousedown", closer, true);

    if (msAutoHide) setTimeout(() => { try { pop.remove(); } catch(_) {} }, msAutoHide);
  } catch (_) {}
}


let __enfoqueOrcObsHeadMsgEl = null;

function __enfoqueOrcObsRemoveHeadMsg() {
  try { if (__enfoqueOrcObsHeadMsgEl) __enfoqueOrcObsHeadMsgEl.remove(); } catch (_) {}
  __enfoqueOrcObsHeadMsgEl = null;
}

function __enfoqueOrcObsUpdateHeadMsg() {
  try {
    const path = String(location.pathname || "").toLowerCase();
    if (!/\/sistema\/orcamentoescolar\/edit(\/|$)/.test(path)) {
      __enfoqueOrcObsRemoveHeadMsg();
      return;
    }

    const codigoEl = document.querySelector("#Codigo");
    const codigo = codigoEl ? String(codigoEl.value || codigoEl.getAttribute("value") || "").trim() : "";
    const entry = codigo ? __enfoqueNotesCache.get(codigo) : null;
    const note = entry && entry.note ? String(entry.note).trim() : "";

    if (!codigo || !note) {
      __enfoqueOrcObsRemoveHeadMsg();
      return;
    }

    if (!__enfoqueOrcObsHeadMsgEl) {
      const div = document.createElement("div");
      div.id = "__enfoque_orc_obs_headmsg";
      div.style.position = "fixed";
      div.style.top = "0";
      div.style.left = "0";
      div.style.right = "0";
      div.style.zIndex = "9999998";
      div.style.padding = "10px 14px";
      div.style.background = "rgba(239,68,68,.16)";
      div.style.borderBottom = "1px solid rgba(239,68,68,.28)";
      div.style.color = "#fecaca";
      div.style.fontSize = "13px";
      div.style.fontWeight = "700";
      div.style.whiteSpace = "pre-wrap";
      div.style.backdropFilter = "blur(10px)";
      div.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
      div.title = "Observação do orçamento";
      document.body.appendChild(div);
      __enfoqueOrcObsHeadMsgEl = div;
    }

    __enfoqueOrcObsHeadMsgEl.textContent = note;
    __enfoqueOrcObsHeadMsgEl.style.display = "block";
  } catch (_) {}
}

function stopOrcamentoEscolarModes() {
  // Use window.* para evitar "Temporal Dead Zone" (let antes de inicializar)
  try { window.__orcEditActive = false; } catch (_) {}
  try { window.__orcListActive = false; } catch (_) {}

  try {
    if (window.__orcEditTickTimer) {
      clearTimeout(window.__orcEditTickTimer);
      window.__orcEditTickTimer = null;
    }
  } catch (_) {}

  try {
    if (window.__orcEditWidget && window.__orcEditWidget.remove) window.__orcEditWidget.remove();
    window.__orcEditWidget = null;
  } catch (_) {}

  // REMOVIDO: banner/linha no cabeçalho do EDIT (por enquanto)
  try { __enfoqueOrcObsRemoveHeadMsg && __enfoqueOrcObsRemoveHeadMsg(); } catch (_) {}

  try {
    if (window.__orcListObserver) {
      window.__orcListObserver.disconnect();
      window.__orcListObserver = null;
    }
  } catch (_) {}

  try {
    if (window.__orcListScanTimer) {
      clearInterval(window.__orcListScanTimer);
      window.__orcListScanTimer = null;
    }
  } catch (_) {}
}

// ---------------- EDIT ----------------
function startOrcamentoEscolarEditNotes() {
  stopOrcamentoEscolarModes();
  __orcEditActive = true;
  __enfoqueEnsureOrcamentoCss();

  // inicia polling (se ainda não iniciou)
  __enfoqueObsStartPolling();

  // EDIT não deve mostrar botão/popup (somente o aviso vermelho no topo).
  // Mantém um tick leve para o Angular preencher o #Codigo e atualizar a mensagem.
  const tick = async () => {
    if (!__orcEditActive) return;
    try { await __enfoqueObsSync({ force: false }); } catch (_) {}
    try { __enfoqueOrcObsUpdateHeadMsg(); } catch (_) {}
    __orcEditTickTimer = setTimeout(tick, 1200);
  };
  tick();

  try { __enfoqueOrcObsUpdateHeadMsg(); } catch (_) {}
}

// ---------------- LIST ----------------
function startOrcamentoEscolarListNotes() {
  stopOrcamentoEscolarModes();
  __orcListActive = true;
  __enfoqueEnsureOrcamentoCss();

  __enfoqueObsStartPolling();

  __orcListObserver = new MutationObserver(() => {
    if (!__orcListActive) return;
    __orcamentoListApplyToPage();
  });
  __orcListObserver.observe(document.documentElement, { subtree: true, childList: true });

  __orcListScanTimer = setInterval(() => {
    if (!__orcListActive) return;
    __orcamentoListApplyToPage();
  }, 1400);

  __orcamentoListApplyToPage();
}

function __orcamentoListGetTbodies() {
  return Array.from(document.querySelectorAll('tbody[ng-repeat="item in outputData"]')) || [];
}

function __orcamentoListFindCodigoByCtrlF(tbody, codeSet) {
  try {
    const txt = (tbody && tbody.textContent) ? String(tbody.textContent) : "";
    // Procura tokens numéricos "grandes" (>=5 dígitos) e vê se algum existe nas observações.
    // Isso imita um Ctrl+F (buscar o código na linha), sem depender da posição exata da coluna.
    const nums = txt.match(/\b\d{5,}\b/g) || [];
    for (const n of nums) {
      const code = String(n || "").trim();
      if (codeSet.has(code)) return code;
    }
  } catch (_) {}
  return null;
}

async function __orcamentoListApplyToPage() {
  const tbodies = __orcamentoListGetTbodies();
  if (!tbodies.length) return;

  // garante cache atualizado (leve)
  try { await __enfoqueObsSync({ force: false }); } catch (_) {}

  const entries = Array.from(__enfoqueNotesCache.entries())
    .map(([codigo, v]) => [String(codigo || "").trim(), v])
    .filter(([codigo, v]) => codigo && v && typeof v.note === "string" && v.note.trim().length > 0);

  const codeSet = new Set(entries.map(([codigo]) => codigo));
  const noteMap = new Map(entries.map(([codigo, v]) => [codigo, (v.note || "").trimEnd()]));

  const highlightTdColor = "rgba(248, 113, 113, 0.08)";
  const highlightBodyColor = "rgba(248, 113, 113, 0.05)";

  for (const tbody of tbodies) {
    const row = tbody.querySelector("tr[ng-dblclick]") || tbody.querySelector("tr");
    if (!row) continue;

    const codigo = __orcamentoListFindCodigoByCtrlF(tbody, codeSet);
    const hasNote = !!codigo;
    const noteText = codigo ? (noteMap.get(codigo) || "") : "";

    const allTds = Array.from(row.querySelectorAll("td"));

    if (hasNote) {
      row.style.backgroundColor = highlightTdColor;
      for (const tdCell of allTds) tdCell.style.backgroundColor = highlightTdColor;
      tbody.style.backgroundColor = highlightBodyColor;
    } else {
      row.style.backgroundColor = "";
      for (const tdCell of allTds) tdCell.style.backgroundColor = "";
      tbody.style.backgroundColor = "";
    }

    // botão no ÚLTIMO BeforeExpander (não encosta no checkbox)
    const beforeCells = Array.from(row.querySelectorAll("td.ListField.BeforeExpander"));
    const targetTd = beforeCells.length ? beforeCells[beforeCells.length - 1] : null;
    if (!targetTd) continue;

    const existingBtn = targetTd.querySelector("button.__enfoque_orc_note_btn");

    if (!hasNote) {
      if (existingBtn) existingBtn.remove();
      continue;
    }

    if (!existingBtn) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "__enfoque_orc_note_btn";
      btn.textContent = "Obs";
      btn.title = "Ver observação deste orçamento";
      btn.style.cssText = "padding:4px 9px;border-radius:10px;border:1px solid rgba(248,113,113,.45);background:rgba(248,113,113,.12);color:#fecaca;font-size:11px;cursor:pointer;";

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        __enfoqueShowPopupNear(btn, `Obs — ${codigo}`, noteText || "(sem observação)", "", 12000);
      });

      targetTd.appendChild(btn);
    } else {
      // atualiza tooltip/texto se já existia
      existingBtn.title = "Ver observação deste orçamento";
    }
  }
}

// ---------------- Polling bootstrap ----------------
function __enfoqueObsStartPolling() {
  if (__enfoqueNotesPollTimer) return;
  // carrega cache local (para não começar zerado)
  __enfoqueObsLoadCacheFromStorage().then(() => {
    __enfoqueObsSync({ force: false });
  });

  __enfoqueNotesPollTimer = setInterval(() => {
    __enfoqueObsSync({ force: false });
  }, 25000);
}

// ---------------- Painel lateral (aba Observações) ----------------
function __enfoqueObservacoesPanelRenderImpl(rootEl) {
  if (!rootEl) return;

  const listEl = rootEl.querySelector("#enfoque-obs-list");
  const statusEl = rootEl.querySelector("#enfoque-obs-status");
  const searchEl = rootEl.querySelector("#enfoque-obs-search");

  if (!listEl) return;

  const qRaw = (searchEl ? String(searchEl.value || "") : "").trim();
  const q = qRaw.replace(/^\s*#\s*/, "").trim();
  const canEdit = !!rootEl.__enfoqueObsAuthOk;

  const items = Array.from(__enfoqueNotesCache.entries())
    .map(([codigo, v]) => ({ codigo: String(codigo || ""), ...(v || {}) }))
    .filter(it => String(it.note || "").trimEnd().length > 0)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const filtered = items.filter(it => {
    if (!q) return true;
    return it.codigo.includes(q);
  });

  listEl.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.style.fontSize = "12px";
    empty.style.opacity = ".75";
    empty.textContent = q ? "Nenhum resultado." : "Sem observações ainda.";
    listEl.appendChild(empty);
  } else {
    for (const it of filtered) {
      const card = document.createElement("div");
      card.style.padding = "10px";
      card.style.border = "1px solid rgba(148,163,184,.28)";
      card.style.borderRadius = "12px";
      card.style.background = "rgba(255,255,255,.03)";

      const top = document.createElement("div");
      top.style.display = "flex";
      top.style.alignItems = "center";
      top.style.gap = "8px";

      const h = document.createElement("div");
      h.style.fontWeight = "800";
      h.style.fontSize = "12px";
      h.textContent = `#${it.codigo}`;

      const meta = document.createElement("div");
      meta.style.marginLeft = "auto";
      meta.style.fontSize = "11px";
      meta.style.opacity = ".75";
      const school = String(it.school || "").trim();
      const email = String(it.authorEmail || "").trim();
      meta.textContent = [school, email].filter(Boolean).join(" • ");

      top.appendChild(h);
      top.appendChild(meta);

      const p = document.createElement("div");
      p.style.whiteSpace = "pre-wrap";
      p.style.fontSize = "12px";
      p.style.opacity = ".92";
      p.style.marginTop = "6px";
      p.textContent = String(it.note || "");

      card.appendChild(top);
      card.appendChild(p);

      if (canEdit) {
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.justifyContent = "flex-end";
        actions.style.marginTop = "8px";

        const del = document.createElement("button");
        del.textContent = "Excluir";
        del.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid rgba(248,113,113,.55);background:rgba(248,113,113,.12);color:#fecaca;font-size:12px;cursor:pointer;";
        del.addEventListener("click", async () => {
          try {
            const pass = prompt("Senha para excluir a observação:");
            if (pass !== "Enfoque26") {
              const st = rootEl.querySelector("#enfoque-obs-status");
              if (st) st.textContent = "Senha incorreta.";
              return;
            }
            const ok = confirm(`Excluir a observação do orçamento ${it.codigo}?`);
            if (!ok) return;
            await __enfoqueNoteDelete(it.codigo);
            await __enfoqueObsMarkAllRead();
            __enfoqueObservacoesPanelRenderImpl(rootEl);
          } catch (e) {
            const st = rootEl.querySelector("#enfoque-obs-status");
            if (st) st.textContent = "Erro ao excluir: " + String(e && e.message ? e.message : e);
          }
        });

        actions.appendChild(del);
        card.appendChild(actions);
      }

      listEl.appendChild(card);
    }
  }

  if (statusEl) {
    statusEl.textContent = `Total: ${items.length} • Mostrando: ${filtered.length}`;
  }
}// expõe hooks no window para o renderSection chamar
window.__enfoqueObservacoesPanelMount = async (rootEl) => {
  try {
    __enfoqueObsStartPolling();

    // ao abrir a aba, sincroniza e zera as notificações
    await __enfoqueObsSync({ force: false });
    await __enfoqueObsMarkAllRead();

    // preenche config UI
    try {
      const cfg = await __enfoqueObsGetConfig();
      const gistIdEl = rootEl.querySelector("#enfoque-obs-gist-id");
      const tokenEl = rootEl.querySelector("#enfoque-obs-gh-token");
      const fileEl = rootEl.querySelector("#enfoque-obs-gist-file");
      const cfgStatus = rootEl.querySelector("#enfoque-obs-cfg-status");

      if (gistIdEl) gistIdEl.value = cfg.gist_id || "";
      if (tokenEl) tokenEl.value = cfg.token || "";
      if (fileEl) fileEl.value = cfg.file || "";

      // Se perfil.txt está presente, travar campos e esconder botão de salvar config
      try {
        const perfil = await __enfoqueReadPerfilTxt(false);
        if (perfil && (perfil.gist_id || perfil.token)) {
          if (gistIdEl) gistIdEl.readOnly = true;
          if (tokenEl) tokenEl.readOnly = true;
          if (fileEl) fileEl.readOnly = true;
          const saveCfgBtn = rootEl.querySelector("#enfoque-obs-save-cfg");
          if (saveCfgBtn) saveCfgBtn.style.display = "none";
          if (cfgStatus) cfgStatus.textContent = "Config carregada de perfil.txt";
        }
      } catch (_) {}

      if (cfgStatus) cfgStatus.textContent = "";
    } catch (_) {}

    // ---------------- Login UI ----------------
    const emailEl = rootEl.querySelector("#enfoque-obs-auth-email");
    const passEl = rootEl.querySelector("#enfoque-obs-auth-pass");
    const loginBtn = rootEl.querySelector("#enfoque-obs-auth-login");
    const logoutBtn = rootEl.querySelector("#enfoque-obs-auth-logout");
    const authStatus = rootEl.querySelector("#enfoque-obs-auth-status");

    async function refreshAuthUi() {
      const auth = await __enfoqueObsGetAuthState();
      rootEl.__enfoqueObsAuthOk = !!auth.ok;
      rootEl.__enfoqueObsAuthEmail = (auth.email || "").trim();

      // tenta preencher email pelo header do SIGE (sempre editável)
      const headerEmail = __enfoqueReadHeaderUserEmail();
      if (emailEl) {
        if (!emailEl.value.trim() && (auth.email || headerEmail)) {
          emailEl.value = (auth.email || headerEmail || "").trim();
        }
      }

      const canEdit = true;
      if (authStatus) authStatus.textContent = canEdit ? "Logado ✅ (edição liberada)" : "Modo leitura: faça login para editar/excluir.";

      // trava/destrava controles de edição
      const schoolEl = rootEl.querySelector("#enfoque-obs-current-school");
      const noteEl = rootEl.querySelector("#enfoque-obs-current-note");
      const saveBtn = rootEl.querySelector("#enfoque-obs-save-note");
      const delBtn = rootEl.querySelector("#enfoque-obs-del-note");

      if (schoolEl) schoolEl.readOnly = true;
      if (noteEl) noteEl.readOnly = false;

      if (saveBtn) saveBtn.style.display = "";
      if (delBtn) delBtn.style.display = "";
    }

    if (loginBtn) loginBtn.addEventListener("click", async () => {
      try {
        const email = emailEl ? String(emailEl.value || "").trim() : "";
        const pass = passEl ? String(passEl.value || "") : "";

        if (!pass) {
          if (authStatus) authStatus.textContent = "Digite a senha.";
          return;
        }

        if (pass !== __ENFOQUE_OBS_AUTH_PASSWORD__) {
          if (authStatus) authStatus.textContent = "Senha incorreta.";
          return;
        }

        await __enfoqueObsSetAuthState({ ok: true, email });
        if (passEl) passEl.value = "";
        await refreshAuthUi();
        __enfoqueObservacoesPanelRenderImpl(rootEl);
      } catch (e) {
        if (authStatus) authStatus.textContent = "Erro no login: " + String(e && e.message ? e.message : e);
      }
    });

    if (logoutBtn) logoutBtn.addEventListener("click", async () => {
      await __enfoqueObsSetAuthState({ ok: false, email: (emailEl ? String(emailEl.value || "").trim() : "") });
      if (passEl) passEl.value = "";
      await refreshAuthUi();
      __enfoqueObservacoesPanelRenderImpl(rootEl);
    });

    if (emailEl) emailEl.addEventListener("change", async () => {
      // salva email mesmo sem login (não é sensível)
      const email = String(emailEl.value || "").trim();
      const auth = await __enfoqueObsGetAuthState();
      await __enfoqueObsSetAuthState({ ok: auth.ok, email });
      await refreshAuthUi();
      __enfoqueObservacoesPanelRenderImpl(rootEl);
    });

    await refreshAuthUi();

    // ---------------- Helpers: ler código e escola ----------------
    const curCodeEl = rootEl.querySelector("#enfoque-obs-current-code");
    const curSchoolEl = rootEl.querySelector("#enfoque-obs-current-school");
    const curNoteEl = rootEl.querySelector("#enfoque-obs-current-note");
    const pullBtn = rootEl.querySelector("#enfoque-obs-pull-code");
    const searchInputEl = rootEl.querySelector("#enfoque-obs-search");
    const buscarBtn = rootEl.querySelector("#enfoque-obs-refresh");
    const saveNoteBtn = rootEl.querySelector("#enfoque-obs-save-note");
    const delNoteBtn = rootEl.querySelector("#enfoque-obs-del-note");
    const saveNoteStatus = rootEl.querySelector("#enfoque-obs-save-status");

    // Buscar (filtro por código)
    if (buscarBtn) buscarBtn.addEventListener("click", () => {
      try { __enfoqueObservacoesPanelRenderImpl(rootEl); } catch (_) {}
    });
    if (searchInputEl) searchInputEl.addEventListener("keydown", (e) => {
      if (e && e.key === "Enter") {
        e.preventDefault();
        try { __enfoqueObservacoesPanelRenderImpl(rootEl); } catch (_) {}
      }
    });

    function readCodigoFromPage() {
      try {
        const el = document.querySelector("#Codigo");
        const v = el && typeof el.value === "string" ? el.value.trim() : "";
        return v;
      } catch (_) { return ""; }
    }

    function readClienteFromPage() {
      try {
        const el = document.querySelector("#Cliente");
        const v = el && typeof el.value === "string" ? el.value.trim() : "";
        return v;
      } catch (_) { return ""; }
    }

    function fillFromCode(codigo) {
      const c = String(codigo || "").trim();
      if (curCodeEl) curCodeEl.value = c;

      // Se o usuário começou a digitar a nota, não sobrescreve
      if (rootEl.__enfoqueCurNoteDirty) return;

      const entry = (c && __enfoqueNotesCache) ? __enfoqueNotesCache.get(c) : null;
      if (curNoteEl) curNoteEl.value = entry && typeof entry.note === "string" ? entry.note : "";
      if (curSchoolEl) curSchoolEl.value = entry && typeof entry.school === "string" ? entry.school : (curSchoolEl.value || "");
    }

    function refreshFromPage() {
      const pageCode = readCodigoFromPage();
      const pageSchool = readClienteFromPage();

      const curCode = curCodeEl ? String(curCodeEl.value || "").trim() : "";
      const curSchool = curSchoolEl ? String(curSchoolEl.value || "").trim() : "";

      // se usuário digitou manualmente código diferente, não sobrescreve
      if (rootEl.__enfoqueCurCodeManual && curCode && pageCode && curCode !== pageCode) {
        // não mexe
      } else if (pageCode) {
        rootEl.__enfoqueCurCodeManual = false;
        fillFromCode(pageCode);
      }

      // escola: se usuário digitou manualmente (só permitido logado), não sobrescreve
      if (rootEl.__enfoqueCurSchoolManual && curSchool && pageSchool && curSchool !== pageSchool) {
        // não mexe
      } else if (pageSchool && curSchoolEl) {
        // só atualiza automaticamente se campo vazio ou ainda não manual
        if (!curSchoolEl.value.trim() || !rootEl.__enfoqueCurSchoolManual) {
          curSchoolEl.value = pageSchool;
        }
      }
    }

    if (curCodeEl) curCodeEl.addEventListener("input", () => {
      rootEl.__enfoqueCurCodeManual = true;
      if (!rootEl.__enfoqueCurNoteDirty) fillFromCode(curCodeEl.value);
    });

    if (curSchoolEl) curSchoolEl.addEventListener("input", () => {
      if (!rootEl.__enfoqueObsAuthOk) {
        // não deveria editar sem login
        return;
      }
      rootEl.__enfoqueCurSchoolManual = true;
    });

    if (curNoteEl) curNoteEl.addEventListener("input", () => {
      rootEl.__enfoqueCurNoteDirty = true;
    });

    if (pullBtn) pullBtn.addEventListener("click", () => {
      rootEl.__enfoqueCurCodeManual = false;
      rootEl.__enfoqueCurSchoolManual = false;
      rootEl.__enfoqueCurNoteDirty = false;
      refreshFromPage();
      if (saveNoteStatus) saveNoteStatus.textContent = "";
    });

    if (saveNoteBtn) saveNoteBtn.addEventListener("click", async () => {
      try {
        if (!rootEl.__enfoqueObsAuthOk) return;

        if (saveNoteStatus) saveNoteStatus.textContent = "Salvando...";
        const codigo = curCodeEl && curCodeEl.value ? String(curCodeEl.value).trim() : "";
        if (!codigo) {
          if (saveNoteStatus) saveNoteStatus.textContent = "Digite o código do orçamento (ou clique em Ler dados).";
          return;
        }

        const note = curNoteEl ? String(curNoteEl.value || "") : "";
        const school = curSchoolEl ? String(curSchoolEl.value || "") : "";
        const authorEmail = emailEl ? String(emailEl.value || "").trim() : "";

        await __enfoqueNoteSet(codigo, note, { school, authorEmail });

        // Espelha a observação no campo Descrição do SIGE (quando existir na página)
        try {
          const descEl = document.querySelector("#Descricao");
          if (descEl && typeof descEl.value !== "undefined") {
            descEl.value = String(note || "");
            try { descEl.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
            try { descEl.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
          }
        } catch (_) {}

rootEl.__enfoqueCurNoteDirty = false;
        rootEl.__enfoqueCurSchoolManual = true; // mantém como escolhido
        if (saveNoteStatus) saveNoteStatus.textContent = "Salvo ✅";

        __enfoqueObservacoesPanelRenderImpl(rootEl);
        await __enfoqueObsMarkAllRead();
      } catch (e) {
        if (saveNoteStatus) saveNoteStatus.textContent = "Erro: " + String(e && e.message ? e.message : e);
      }
    });

    if (delNoteBtn) delNoteBtn.addEventListener("click", async () => {
      try {
        if (!rootEl.__enfoqueObsAuthOk) return;

        const codigo = curCodeEl && curCodeEl.value ? String(curCodeEl.value).trim() : "";
        if (!codigo) {
          if (saveNoteStatus) saveNoteStatus.textContent = "Digite o código do orçamento para excluir.";
          return;
        }
        const pass = prompt("Senha para excluir a observação:");
        if (pass !== "Enfoque26") {
          if (saveNoteStatus) saveNoteStatus.textContent = "Senha incorreta.";
          return;
        }
        const ok = confirm(`Excluir a observação do orçamento ${codigo}?`);
        if (!ok) return;

        if (saveNoteStatus) saveNoteStatus.textContent = "Excluindo...";
        await __enfoqueNoteDelete(codigo);

        if (curNoteEl) curNoteEl.value = "";
        rootEl.__enfoqueCurNoteDirty = false;

        if (saveNoteStatus) saveNoteStatus.textContent = "Excluída ✅";
        __enfoqueObservacoesPanelRenderImpl(rootEl);
        await __enfoqueObsMarkAllRead();
      } catch (e) {
        if (saveNoteStatus) saveNoteStatus.textContent = "Erro: " + String(e && e.message ? e.message : e);
      }
    });

    // preenche ao abrir
    try { refreshFromPage(); } catch (_) {}

    // mantém atualizado enquanto painel estiver aberto
    try {
      if (!rootEl.__enfoqueCurCodigoInterval) {
        rootEl.__enfoqueCurCodigoInterval = setInterval(() => {
          try { refreshFromPage(); } catch (_) {}
        }, 1200);
      }
    } catch (_) {}

    // renderiza lista
    __enfoqueObservacoesPanelRenderImpl(rootEl);

  } catch (e) {
    try {
      const st = rootEl.querySelector("#enfoque-obs-status");
      if (st) st.textContent = "Erro: " + String(e && e.message ? e.message : e);
    } catch (_) {}
  }
};

// chamado internamente após enviar nota
window.__enfoqueObservacoesPanelRender = () => {
  try {
    const panel = document.getElementById("sige-assistente-panel");
    if (!panel) return;
    const content = panel.querySelector("#sige-assistente-content");
    if (!content) return;

    // Só renderiza se a aba atual for observacoes (navBtn active)
    const activeBtn = panel.querySelector(".navBtn.active");
    if (!activeBtn || activeBtn.dataset.section !== "observacoes") return;

    __enfoqueObservacoesPanelRenderImpl(content);
  } catch (_) {}
};

// inicializa badge com base no storage (persistente entre reloads)
(async () => {
  try {
    await __enfoqueObsLoadCacheFromStorage();
    const st = await __enfoqueStorageGet(["enfoq_obs_unseen_count"]);
    __enfoqueSetObsBadge(Number(st.enfoq_obs_unseen_count || 0));
    __enfoqueObsStartPolling();
  } catch (_) {}
})();

(() => {
  "use strict";

  const TARGET_RELATORIO_URL =
    "https://enfoquepapelaria.meusige.com.br/sistema/Agendamentos/Report";

  function isRelatorioClientesPage() {
    const href = String(location.href);
    return href === TARGET_RELATORIO_URL || href.includes("/sistema/Agendamentos/Report");
  }

  // ============================================================
  // MENU PRINCIPAL: inserir item direto no menu raiz
  // ============================================================
  function ensureRelatorioClientesInMainMenu() {
    const sidebar = document.querySelector("#sidebarMenu");
    if (!sidebar) return false;

    if (sidebar.querySelector('a[data-enfoque-relatorio-clientes="1"]')) return true;

    const directUls = Array.from(sidebar.querySelectorAll(":scope > ul"));
    if (!directUls.length) return false;

    let mainUl = directUls[0];
    let bestCount = -1;
    for (const ul of directUls) {
      const c = ul.querySelectorAll(":scope > li").length;
      if (c > bestCount) {
        bestCount = c;
        mainUl = ul;
      }
    }
    if (!mainUl) return false;

    const li = document.createElement("li");
    const a = document.createElement("a");
    a.setAttribute("onclick", "onMenuClick(this);");
    a.setAttribute("href", TARGET_RELATORIO_URL);
    a.dataset.enfoqueRelatorioClientes = "1";

    const icon = document.createElement("i");
    icon.className = "menuIcon icon16 icomoon-icon-people";

    const span = document.createElement("span");
    span.textContent = "Relatório de Clientes";

    a.appendChild(icon);
    a.appendChild(span);
    li.appendChild(a);

    // inserir após "Relatórios" se existir (menu principal)
    const relatoriosLi = Array.from(mainUl.querySelectorAll(":scope > li")).find(x => {
      const s = x.querySelector(":scope > a > span");
      return s && s.textContent && s.textContent.trim() === "Relatórios";
    });

    if (relatoriosLi && relatoriosLi.nextSibling) {
      mainUl.insertBefore(li, relatoriosLi.nextSibling);
    } else {
      mainUl.appendChild(li);
    }

    return true;
  }

  function startMainMenuObserver() {
    const obs = new MutationObserver(() => {
      try { ensureRelatorioClientesInMainMenu(); } catch (_) {}
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });

    ensureRelatorioClientesInMainMenu();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const ok = ensureRelatorioClientesInMainMenu();
      if (ok || tries > 40) clearInterval(t);
    }, 500);
  }

  // ============================================================
  // GUI: renderizar NO CONTEUDO (sem cobrir o sidebar do SIGE)
  // ============================================================
  function getMainContentEl() {
    // O SIGE pode variar. Tentamos alguns candidatos.
    return (
      document.querySelector("#content") ||
      document.querySelector(".content") ||
      document.querySelector(".main-content") ||
      document.querySelector("#page-wrapper") ||
      document.querySelector("body")
    );
  }

  function removeExistingRelatorio() {
    const old = document.getElementById("enfoqueRelatorioClientesRoot");
    if (old) old.remove();
  }

  function injectRelatorioStyles() {
    if (document.getElementById("enfoque-relatorio-clientes-style")) return;

    const style = document.createElement("style");
    style.id = "enfoque-relatorio-clientes-style";
    style.textContent = `
      /* Container do relatório: ocupa o miolo (não mexe no sidebar) */
      #enfoqueRelatorioClientesRoot {
        position: relative;
        width: 100%;
        min-height: calc(100vh - 10px);
        background: #f4f6f9;
        border-radius: 14px;
        overflow: hidden;
        margin: 10px 10px 10px 0;
        box-shadow: 0 6px 18px rgba(17, 24, 39, .08);
        border: 1px solid rgba(17, 24, 39, .06);
        font-family: Arial, Helvetica, sans-serif;
      }

      #enfoqueRelatorioClientesHeader {
        height: 56px;
        background: #111827;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
      }

      #enfoqueRelatorioClientesHeader .title {
        display: flex;
        gap: 10px;
        align-items: center;
        font-size: 14px;
        letter-spacing: .2px;
      }

      #enfoqueRelatorioClientesHeader .title strong { font-size: 15px; }

      #enfoqueRelatorioClientesHeader .actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .enfBtn {
        border: 0;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 12px;
      }
      .enfBtn.primary { background: #22c55e; color: #052e16; }
      .enfBtn.gray { background: #e5e7eb; color: #111827; }
      .enfBtn.dark { background: #374151; color: #fff; }

      #enfoqueRelatorioClientesBody {
        min-height: 0;
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 12px;
        padding: 12px;
      }

      .enfCard {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 6px 18px rgba(17, 24, 39, .08);
        border: 1px solid rgba(17, 24, 39, .06);
      }

      #enfoqueRelatorioClientesFilters {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .enfSectionTitle {
        font-size: 12px;
        font-weight: 900;
        color: #111827;
        margin: 4px 0 6px;
        text-transform: uppercase;
        letter-spacing: .7px;
      }

      .enfField { display: flex; flex-direction: column; gap: 6px; }
      .enfField label { font-size: 12px; color: #374151; font-weight: 800; }

      .enfField input, .enfField select {
        height: 36px;
        border-radius: 12px;
        border: 1px solid rgba(17,24,39,.15);
        padding: 0 10px;
        outline: none;
        font-size: 12px;
        font-weight: 700;
      }

      .enfDivider {
        height: 1px;
        width: 100%;
        background: rgba(17,24,39,.08);
        margin: 6px 0;
      }

      #enfoqueRelatorioClientesMain {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
      }

      #enfoqueRelatorioClientesKpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .kpi {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .kpi .label {
        font-size: 12px;
        color: #6b7280;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .6px;
      }
      .kpi .value {
        font-size: 20px;
        font-weight: 900;
        color: #111827;
      }
      .kpi .hint {
        font-size: 12px;
        color: #374151;
        font-weight: 700;
      }

      #enfoqueRelatorioClientesCharts {
        display: grid;
        grid-template-columns: 1.2fr .8fr;
        gap: 12px;
        min-height: 280px;
      }

      .chartBox {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 280px;
      }

      .chartHeader {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
      }
      .chartHeader .h {
        font-size: 13px;
        font-weight: 900;
        color: #111827;
      }
      .chartHeader .sub {
        font-size: 12px;
        color: #6b7280;
        font-weight: 800;
      }

      .chartCanvas {
        flex: 1;
        min-height: 0;
        background: #f9fafb;
        border: 1px dashed rgba(17,24,39,.15);
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      #enfoqueRelatorioClientesTables {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .tableBox {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
      }

      table.enfTable {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      table.enfTable th {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid rgba(17,24,39,.10);
        color: #111827;
        font-weight: 900;
      }
      table.enfTable td {
        padding: 10px 8px;
        border-bottom: 1px solid rgba(17,24,39,.06);
        color: #374151;
        font-weight: 800;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: #eef2ff;
        color: #3730a3;
        font-weight: 900;
        font-size: 11px;
      }

      .enfHintBox {
        background: #f9fafb;
        border: 1px dashed rgba(17,24,39,.15);
        border-radius: 14px;
        padding: 10px;
        color: #374151;
        font-size: 12px;
        font-weight: 800;
      }

      @media (max-width: 1100px) {
        #enfoqueRelatorioClientesBody { grid-template-columns: 1fr; }
        #enfoqueRelatorioClientesKpis { grid-template-columns: repeat(2, minmax(0,1fr)); }
        #enfoqueRelatorioClientesCharts { grid-template-columns: 1fr; }
        #enfoqueRelatorioClientesTables { grid-template-columns: 1fr; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function escapeXml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function createSvgBarChartMock(data) {
    const max = Math.max(...data.map(d => d.value), 1);
    const w = 640, h = 220, pad = 30;
    const barW = Math.floor((w - pad * 2) / data.length) - 10;
    const colors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb7185", "#22c55e"];

    const bars = data.map((d, i) => {
      const x = pad + i * (barW + 10);
      const bh = Math.round((d.value / max) * (h - 60));
      const y = h - 30 - bh;
      const fill = colors[i % colors.length];
      const label = escapeXml(d.label);

      return `
        <g>
          <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="8" fill="${fill}" opacity="0.9"></rect>
          <text x="${x + barW/2}" y="${h - 12}" text-anchor="middle" font-size="11" font-weight="800" fill="#374151">${label}</text>
          <text x="${x + barW/2}" y="${y - 8}" text-anchor="middle" font-size="11" font-weight="900" fill="#111827">${Math.round(d.value)}</text>
        </g>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img" aria-label="Gráfico de barras (mock)">
        <rect x="0" y="0" width="${w}" height="${h}" fill="#f9fafb"></rect>
        <line x1="${pad}" y1="${h-30}" x2="${w-pad}" y2="${h-30}" stroke="#d1d5db" stroke-width="2"></line>
        ${bars}
      </svg>
    `;
  }

  function createSvgPieChartMock(parts) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    const cx = 140, cy = 110, r = 80;
    const colors = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb7185", "#22c55e"];

    let angle = -Math.PI / 2;
    const slices = parts.map((p, i) => {
      const frac = p.value / total;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;

      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);

      const large = frac > 0.5 ? 1 : 0;
      const fill = colors[i % colors.length];

      const d = [
        `M ${cx} ${cy}`,
        `L ${x0} ${y0}`,
        `A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
        "Z",
      ].join(" ");

      return `<path d="${d}" fill="${fill}" opacity="0.95"></path>`;
    }).join("");

    const legend = parts.map((p, i) => {
      const fill = colors[i % colors.length];
      const pct = Math.round((p.value / total) * 100);
      return `
        <div style="display:flex;gap:8px;align-items:center;font-size:12px;font-weight:800;color:#374151;">
          <span style="width:10px;height:10px;border-radius:3px;background:${fill};display:inline-block;"></span>
          <span>${escapeXml(p.label)} <span style="color:#6b7280;font-weight:900">(${pct}%)</span></span>
        </div>
      `;
    }).join("");

    return `
      <div style="display:flex;gap:12px;align-items:center;justify-content:center;padding:8px;">
        <svg viewBox="0 0 280 220" width="280" height="220" role="img" aria-label="Pizza (mock)">
          <rect x="0" y="0" width="280" height="220" fill="#f9fafb"></rect>
          ${slices}
          <circle cx="${cx}" cy="${cy}" r="36" fill="#f9fafb"></circle>
          <text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="12" font-weight="900" fill="#111827">Mix</text>
        </svg>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${legend}
        </div>
      </div>
    `;
  }

  function createRelatorioRoot() {
    const root = document.createElement("div");
    root.id = "enfoqueRelatorioClientesRoot";

    // Header
    const header = document.createElement("div");
    header.id = "enfoqueRelatorioClientesHeader";

    const left = document.createElement("div");
    left.className = "title";
    const icon = document.createElement("span");
    icon.textContent = "📊";
    const title = document.createElement("strong");
    title.textContent = "Relatório de Clientes";
    const subtitle = document.createElement("span");
    subtitle.textContent = "Dados via API (ReportPedidos/GetItens)";

    left.appendChild(icon);
    left.appendChild(title);
    left.appendChild(subtitle);

    const actions = document.createElement("div");
    actions.className = "actions";

    const btnExport = document.createElement("button");
    btnExport.className = "enfBtn primary";
    btnExport.type = "button";
    btnExport.textContent = "Exportar (mock)";
    btnExport.addEventListener("click", () => alert("Exportar: mock (sem API ainda)."));

    const btnClose = document.createElement("button");
    btnClose.className = "enfBtn dark";
    btnClose.type = "button";
    btnClose.textContent = "Fechar";
    btnClose.addEventListener("click", () => removeExistingRelatorio());

    actions.appendChild(btnExport);
    actions.appendChild(btnClose);

    header.appendChild(left);
    header.appendChild(actions);

    // Body
    const body = document.createElement("div");
    body.id = "enfoqueRelatorioClientesBody";

    // Filters (left)
    const filters = document.createElement("div");
    filters.id = "enfoqueRelatorioClientesFilters";
    filters.className = "enfCard";

    const inpIni = input("date");
    const inpFim = input("date");
    const selLoja = select(["Todas", "Loja Centro (fictícia)", "Loja Shopping (fictícia)"]);
    const selVend = select(["Todos", "Ana Lima (fictício)", "Bruno Rocha (fictício)", "Carla Souza (fictício)"]);
    const inpCli = input("text", "Digite nome/CPF/CNPJ (mock)");
    const selAgrupar = select([
      "Cliente",
      // "Cidade" REMOVIDO
      "Vendedor",
      "Forma de Pagamento",
    ]);
    const selOrdenar = select(["Valor (desc)", "Quantidade (desc)", "Ticket (desc)"]);

    filters.appendChild(sectionTitle("Filtros"));
    filters.appendChild(field("Data inicial", inpIni));
    filters.appendChild(field("Data final", inpFim));
    filters.appendChild(field("Loja", selLoja));
    filters.appendChild(field("Vendedor", selVend));
    filters.appendChild(field("Cliente", inpCli));

    const divider = document.createElement("div");
    divider.className = "enfDivider";
    filters.appendChild(divider);

    filters.appendChild(sectionTitle("Visões"));
    filters.appendChild(field("Agrupar por", selAgrupar));
    filters.appendChild(field("Ordenar por", selOrdenar));

    // Botões do filtro
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "6px";

    const btnAplicar = document.createElement("button");
    btnAplicar.className = "enfBtn primary";
    btnAplicar.type = "button";
    btnAplicar.textContent = "Aplicar filtros";

    const btnLimpar = document.createElement("button");
    btnLimpar.className = "enfBtn gray";
    btnLimpar.type = "button";
    btnLimpar.textContent = "Limpar";

    btnRow.appendChild(btnAplicar);
    btnRow.appendChild(btnLimpar);
    filters.appendChild(btnRow);

    const hint = document.createElement("div");
    hint.className = "enfHintBox";
    hint.textContent =
      "Clique em “Aplicar filtros” para buscar nas APIs e preencher KPIs, gráficos e tabelas.";
    filters.appendChild(hint);

    // Main (right)
    const main = document.createElement("div");
    main.id = "enfoqueRelatorioClientesMain";

    // Render do conteúdo (mock) — separado pra reaplicar quando clicar "Aplicar filtros"
    const contentHost = document.createElement("div");
    contentHost.style.display = "flex";
    contentHost.style.flexDirection = "column";
    contentHost.style.gap = "12px";
    main.appendChild(contentHost);

    function renderMockContent() {
      contentHost.innerHTML = "";

      const kpis = document.createElement("div");
      kpis.id = "enfoqueRelatorioClientesKpis";

      // Pequena variação de mock com base em "Agrupar por" só pra dar sensação de filtro
      const group = selAgrupar.value;
      const base = group === "Vendedor" ? 201334.12 : group === "Forma de Pagamento" ? 176420.88 : 187654.32;

      kpis.appendChild(kpiCard("Total vendido", formatBRL(base), "Período selecionado (mock)"));
      kpis.appendChild(kpiCard("Clientes únicos", group === "Vendedor" ? "389" : "412", "Compraram ao menos 1x (mock)"));
      kpis.appendChild(kpiCard("Ticket médio", formatBRL(base / 412), "Média por venda (mock)"));
      kpis.appendChild(kpiCard("Recorrência", group === "Forma de Pagamento" ? "28%" : "31%", "Clientes com 2+ compras (mock)"));

      const charts = document.createElement("div");
      charts.id = "enfoqueRelatorioClientesCharts";

      const c1 = document.createElement("div");
      c1.className = "enfCard chartBox";
      c1.appendChild(chartHeader("Top 7 clientes por valor", "Barras (mock)"));
      const canvas1 = document.createElement("div");
      canvas1.className = "chartCanvas";
      canvas1.innerHTML = createSvgBarChartMock([
        { label: "Marcos", value: 8200 },
        { label: "Juliana", value: 7300 },
        { label: "Felipe", value: 6100 },
        { label: "Patricia", value: 5200 },
        { label: "Rafaela", value: 4500 },
        { label: "Gustavo", value: 3900 },
        { label: "Sonia", value: 3400 },
      ]);
      c1.appendChild(canvas1);

      const c2 = document.createElement("div");
      c2.className = "enfCard chartBox";
      c2.appendChild(chartHeader("Mix por forma de pagamento", "Pizza (mock)"));
      const canvas2 = document.createElement("div");
      canvas2.className = "chartCanvas";
      canvas2.innerHTML = createSvgPieChartMock([
        { label: "Crédito", value: 48 },
        { label: "Débito", value: 22 },
        { label: "Pix", value: 19 },
        { label: "Dinheiro", value: 11 },
      ]);
      c2.appendChild(canvas2);

      charts.appendChild(c1);
      charts.appendChild(c2);

      const tables = document.createElement("div");
      tables.id = "enfoqueRelatorioClientesTables";

      const t1 = document.createElement("div");
      t1.className = "enfCard tableBox";
      t1.appendChild(chartHeader("Ranking de clientes", "Top 10 (mock)"));
      t1.appendChild(makeTable(
        ["Cliente", "Compras", "Valor", "Ticket"],
        [
          ["Marcos Almeida", "12", formatBRL(18200), formatBRL(1516)],
          ["Juliana Cardoso", "9", formatBRL(16400), formatBRL(1822)],
          ["Felipe Santos", "15", formatBRL(15110), formatBRL(1007)],
          ["Patricia Lima", "7", formatBRL(12900), formatBRL(1842)],
          ["Rafaela Rocha", "6", formatBRL(11150), formatBRL(1858)],
          ["Gustavo Nunes", "10", formatBRL(10300), formatBRL(1030)],
          ["Sonia Ribeiro", "5", formatBRL(9800), formatBRL(1960)],
          ["Renato Vieira", "8", formatBRL(9200), formatBRL(1150)],
          ["Camila Souza", "4", formatBRL(8600), formatBRL(2150)],
          ["Diego Costa", "6", formatBRL(7900), formatBRL(1316)],
        ]
      ));

      const t2 = document.createElement("div");
      t2.className = "enfCard tableBox";
      t2.appendChild(chartHeader("Clientes em risco", "Sem compra há 60+ dias (mock)"));
      t2.appendChild(makeTable(
        ["Cliente", "Última compra", "Valor histórico", "Status"],
        [
          ["Claudia Moraes", "2025-10-02", formatBRL(3200), pill("Risco")],
          ["Aline Barros", "2025-09-18", formatBRL(4100), pill("Risco")],
          ["João Pereira", "2025-08-30", formatBRL(2750), pill("Atenção")],
          ["Marta Freitas", "2025-08-22", formatBRL(1980), pill("Atenção")],
          ["Pedro Ribeiro", "2025-07-15", formatBRL(5900), pill("Risco")],
        ],
        true
      ));

      tables.appendChild(t1);
      tables.appendChild(t2);

      contentHost.appendChild(kpis);
      contentHost.appendChild(charts);
      contentHost.appendChild(tables);
    }

    // =============================================================
    // BUSCA REAL NAS APIs (v2) PARA POPULAR O RELATORIO
    // =============================================================
    const SIGE_REPORT_PEDIDOS_ITENS_URL = window.location.origin + "/api/v2/ReportPedidos/GetItens";

    function toSigeDate(raw) {
      const s = String(raw || "").trim();
      if (!s) return "";
      // ja esta no formato dd/mm/aaaa
      const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m1) return s;
      // formato yyyy-mm-dd
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
      return "";
    }

    function parsePtBrDateTime(raw) {
      const s = String(raw || "");
      // formatos comuns: "02/01/2026 - 09:07" ou "02/01/2026"
      const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) return null;
      const dd = int(m[1]);
      const mm = int(m[2]);
      const yyyy = int(m[3]);
      if (!yyyy || !mm || !dd) return null;
      return new Date(yyyy, mm - 1, dd);
    }

    async function enfoqueFetchJson(url, payloadObj) {
      const token = await new Promise((resolve) => __enfoqueGetToken((t) => resolve(t)));
      if (!token) throw new Error("Bearer ausente. Use o botao 🔑 Bearer ou navegue no SIGE para capturar.");

      // Importante: algumas rotas do SIGE (como /sistema/Agendamentos/Report) retornam 404,
      // e certos endpoints de relatório dão 500 quando o Referer não é /sistema/Pedidos/Report.
      // Para maximizar compatibilidade, fazemos a chamada no page-world (inject-api.js),
      // forçando um referrer same-origin válido.

      const result = await __enfoqueCallPageWorld("ENFOQUE_API_CALL", {
        url,
        method: "POST",
        token,
        headers: {
                    "Accept": "application/json, text/plain, */*"
        },
        payload: payloadObj || {},
        referrer: window.location.origin + "/sistema/Pedidos/Report",
        referrerPolicy: "strict-origin-when-cross-origin"
      }, 30000);

      if (!result || !result.ok) {
        throw new Error(String(result && result.error ? result.error : "HTTP_ERROR"));
      }
      return result.data;
    }

    async function buscarReportPedidosItens(filtro) {
      const ini = toSigeDate(filtro && filtro.dataInicial);
      const fim = toSigeDate(filtro && filtro.dataFinal);

      // se usuario nao preencher, usamos padrao: inicio do mes atual ate hoje
      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, "0");
      const today = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
      const firstDay = `01/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
      const dataIni = ini || firstDay;
      const dataFim = fim || today;

      const payloadBase = {
        Pagina: { Number: 0, Lenght: 25 },
        Filtro: {
          Empresa: "",
          Cliente: (filtro && filtro.cliente) ? String(filtro.cliente) : "",
          Vendedor: (filtro && filtro.vendedor) ? String(filtro.vendedor) : "",
          FiltrarPor: "Data",
          ValorInicial: "",
          ValorFinal: "",
          Categoria: "",
          StatusSistema: "",
          Status: "",
          DataInicial: dataIni || "",
          DataFinal: dataFim || "",
          TipoPeriodo: 10
        },
        Order: { DisplayName: "Data Crescente", FieldName: "Data", Ascending: true }
      };

      const first = await enfoqueFetchJson(SIGE_REPORT_PEDIDOS_ITENS_URL, payloadBase);
      const itensFirst = Array.isArray(first && first.PedidoItens) ? first.PedidoItens : [];
      const paginas = Array.isArray(first && first.Paginas) ? first.Paginas : [];
      // Paginas normalmente vem como lista de objetos {Number, Lenght}. Se nao vier, tratamos como 1 pagina.
      const totalPages = paginas.length ? (max(paginas.map(p => int(p.Number)).filter(n => n != null)) + 1) : 1;

      const MAX_PAGES = 40; // seguranca
      const pagesToFetch = Math.min(totalPages, MAX_PAGES);
      const all = [...itensFirst];

      for (let n = 1; n < pagesToFetch; n++) {
        const payload = JSON.parse(JSON.stringify(payloadBase));
        payload.Pagina.Number = n;
        const r = await enfoqueFetchJson(SIGE_REPORT_PEDIDOS_ITENS_URL, payload);
        const itens = Array.isArray(r && r.PedidoItens) ? r.PedidoItens : [];
        all.push(...itens);
      }

      return {
        itens: all,
        totalPages,
        limitado: totalPages > MAX_PAGES
      };
    }

    function montarMetricas(itens) {
      const byCliente = new Map();
      const byVendedor = new Map();
      const byPagamento = new Map();
      const vendasGlobais = new Set();
      let total = 0;

      for (const it of (itens || [])) {
        const cliente = String(it.Cliente || "(Sem cliente)").trim();
        const vendedor = String(it.Vendedor || "(Sem vendedor)").trim();
        const pag = String(it.FormaPagamento || "(Sem forma)").trim();
        const codigo = String(it.Codigo != null ? it.Codigo : "");
        const valor = Number(it.ValorTotal) || 0;
        const qtd = Number(it.Quantidade) || 0;
        total += valor;
        if (codigo) vendasGlobais.add(codigo);

        const dt = parsePtBrDateTime(it.DataNota || it.Data);

        function up(map, key) {
          if (!map.has(key)) map.set(key, { key, valor: 0, qtd: 0, vendas: new Set(), ultima: null });
          const o = map.get(key);
          o.valor += valor;
          o.qtd += qtd;
          if (codigo) o.vendas.add(codigo);
          if (dt && (!o.ultima || dt > o.ultima)) o.ultima = dt;
        }

        up(byCliente, cliente);
        up(byVendedor, vendedor);

        if (!byPagamento.has(pag)) byPagamento.set(pag, { key: pag, valor: 0, qtd: 0, vendas: new Set() });
        const p = byPagamento.get(pag);
        p.valor += valor;
        p.qtd += qtd;
        if (codigo) p.vendas.add(codigo);
      }

      const totalVendas = vendasGlobais.size || 0;
      const clientesUnicos = byCliente.size || 0;
      const ticketMedio = totalVendas ? (total / totalVendas) : 0;
      let recorrentes = 0;
      for (const o of byCliente.values()) {
        if ((o.vendas && o.vendas.size) >= 2) recorrentes++;
      }
      const recorrencia = clientesUnicos ? (recorrentes / clientesUnicos) : 0;

      return { total, totalVendas, clientesUnicos, ticketMedio, recorrencia, byCliente, byVendedor, byPagamento };
    }

    function renderApiContentFromItens(itens, meta) {
      contentHost.innerHTML = "";

      const metrics = montarMetricas(itens);

      // KPIs
      const kpis = document.createElement("div");
      kpis.id = "enfoqueRelatorioClientesKpis";
      kpis.appendChild(kpiCard("Total vendido", formatBRL(metrics.total), "Somatorio do periodo"));
      kpis.appendChild(kpiCard("Vendas (pedidos)", String(metrics.totalVendas), "Codigo unico"));
      kpis.appendChild(kpiCard("Clientes unicos", String(metrics.clientesUnicos), "Cliente diferente"));
      kpis.appendChild(kpiCard("Ticket medio", formatBRL(metrics.ticketMedio), `Recorrencia: ${(metrics.recorrencia*100).toFixed(0)}%`));

      // Aviso de limite de paginas
      if (meta && meta.limitado) {
        const warn = document.createElement("div");
        warn.className = "enfHintBox";
        warn.textContent = `Atençao: o periodo tem ${meta.totalPages} paginas. Por performance, este prototipo buscou apenas as primeiras 40 paginas.`;
        contentHost.appendChild(warn);
      }

      // Charts
      const charts = document.createElement("div");
      charts.id = "enfoqueRelatorioClientesCharts";

      // Top 7
      const top = [...metrics.byCliente.values()]
        .map(o => ({ label: o.key.length>18?o.key.slice(0,18)+"…":o.key, value: o.valor }))
        .sort((a,b)=>b.value-a.value)
        .slice(0,7);

      const c1 = document.createElement("div");
      c1.className = "enfCard chartBox";
      c1.appendChild(chartHeader("Top 7 clientes por valor", "Barras"));
      const canvas1 = document.createElement("div");
      canvas1.className = "chartCanvas";
      canvas1.innerHTML = createSvgBarChartMock(top.length?top:[{label:"(sem dados)",value:0}]);
      c1.appendChild(canvas1);

      // Mix pagamento
      const mix = [...metrics.byPagamento.values()]
        .map(o => ({ label: o.key, value: o.valor }))
        .sort((a,b)=>b.value-a.value);
      const mixTotal = mix.reduce((s,x)=>s+(x.value||0),0) || 1;
      const pie = mix
        .slice(0,6)
        .map(x => ({ label: x.label, value: Math.round((x.value/mixTotal)*100) }));

      const c2 = document.createElement("div");
      c2.className = "enfCard chartBox";
      c2.appendChild(chartHeader("Mix por forma de pagamento", "Pizza"));
      const canvas2 = document.createElement("div");
      canvas2.className = "chartCanvas";
      canvas2.innerHTML = createSvgPieChartMock(pie.length?pie:[{label:"(sem dados)",value:100}]);
      c2.appendChild(canvas2);

      charts.appendChild(c1);
      charts.appendChild(c2);

      // Tables
      const tables = document.createElement("div");
      tables.id = "enfoqueRelatorioClientesTables";

      // Ranking conforme seleçao
      const group = selAgrupar.value;
      const order = selOrdenar.value;

      const source = group === "Vendedor" ? metrics.byVendedor : group === "Forma de Pagamento" ? metrics.byPagamento : metrics.byCliente;

      let rows = [...source.values()].map(o => {
        const compras = o.vendas ? o.vendas.size : 0;
        const ticket = compras ? (o.valor / compras) : 0;
        return {
          key: o.key,
          compras,
          valor: o.valor,
          ticket,
          ultima: o.ultima
        };
      });

      if (order.startsWith("Valor")) rows.sort((a,b)=>b.valor-a.valor);
      else if (order.startsWith("Quantidade")) rows.sort((a,b)=>(b.compras)-(a.compras));
      else rows.sort((a,b)=>b.ticket-a.ticket);

      const top10 = rows.slice(0, 10).map(r => [
        escapeHtml(r.key),
        String(r.compras),
        formatBRL(r.valor),
        formatBRL(r.ticket)
      ]);

      const t1 = document.createElement("div");
      t1.className = "enfCard tableBox";
      t1.appendChild(chartHeader(`Ranking de ${group.toLowerCase()}`, "Top 10"));
      t1.appendChild(makeTable([group, "Compras", "Valor", "Ticket"], top10, true));

      // Risco: ultima compra > 60 dias
      const now = new Date();
      const risco = rows
        .filter(r => r.ultima)
        .map(r => {
          const diff = Math.floor((now - r.ultima) / (1000*60*60*24));
          return { ...r, diff };
        })
        .filter(r => r.diff >= 60)
        .sort((a,b)=>b.diff-a.diff)
        .slice(0, 12);

      const riscoRows = risco.map(r => {
        const d = r.ultima ? r.ultima.toISOString().slice(0,10) : "";
        const status = r.diff >= 90 ? pill("Risco") : pill("Atençao");
        return [escapeHtml(r.key), d, formatBRL(r.valor), status];
      });

      const t2 = document.createElement("div");
      t2.className = "enfCard tableBox";
      t2.appendChild(chartHeader("Clientes em risco", "Sem compra ha 60+ dias"));
      t2.appendChild(makeTable(["Cliente", "Ultima compra", "Valor historico", "Status"], riscoRows.length?riscoRows:[["(nenhum)","-","-",pill("OK")]], true));

      tables.appendChild(t1);
      tables.appendChild(t2);

      contentHost.appendChild(kpis);
      contentHost.appendChild(charts);
      contentHost.appendChild(tables);
    }

    function showLoading(msg) {
      contentHost.innerHTML = "";
      const card = document.createElement("div");
      card.className = "enfCard";
      card.style.padding = "16px";
      card.textContent = msg || "Carregando...";
      contentHost.appendChild(card);
    }

    async function aplicarFiltrosReal() {
      try {
        showLoading("Buscando dados nas APIs... (isso pode levar alguns segundos)");
        const filtro = {
          dataInicial: inpIni.value,
          dataFinal: inpFim.value,
          cliente: inpCli.value,
          vendedor: selVend.value && selVend.value !== "Todos" ? selVend.value : ""
        };

        const { itens, totalPages, limitado } = await buscarReportPedidosItens(filtro);

        // Se o select de vendedor ainda esta com (ficticio), tentamos popular com vendedores reais
        try {
          const hasFict = [...selVend.options].some(o => String(o.textContent||"").includes("fict"));
          if (hasFict) {
            const set = new Set();
            for (const it of itens) {
              if (it && it.Vendedor) set.add(String(it.Vendedor).trim());
            }
            const list = [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b, 'pt-BR'));
            selVend.innerHTML = "";
            selVend.appendChild(new Option("Todos", "Todos"));
            for (const v of list) selVend.appendChild(new Option(v, v));
          }
        } catch (e) {}

        renderApiContentFromItens(itens, { totalPages, limitado });
      } catch (e) {
        console.warn("[RelatorioClientes] Falha ao buscar dados reais:", e);
        alert("Falha ao buscar dados nas APIs.\n\n" + (e && e.message ? e.message : String(e)));
        renderMockContent();
      }
    }


    btnAplicar.addEventListener("click", async () => {
      await aplicarFiltrosReal();
    });

    btnLimpar.addEventListener("click", () => {
      inpIni.value = "";
      inpFim.value = "";
      selLoja.selectedIndex = 0;
      selVend.selectedIndex = 0;
      inpCli.value = "";
      selAgrupar.selectedIndex = 0;
      selOrdenar.selectedIndex = 0;
      renderMockContent();
    });

    // Primeira renderização
    renderMockContent();

    body.appendChild(filters);
    body.appendChild(main);

    root.appendChild(header);
    root.appendChild(body);

    return root;

    // helpers
    function sectionTitle(text) {
      const d = document.createElement("div");
      d.className = "enfSectionTitle";
      d.textContent = text;
      return d;
    }
    function field(labelText, control) {
      const wrap = document.createElement("div");
      wrap.className = "enfField";
      const label = document.createElement("label");
      label.textContent = labelText;
      wrap.appendChild(label);
      wrap.appendChild(control);
      return wrap;
    }
    function input(type, placeholder = "") {
      const el = document.createElement("input");
      el.type = type;
      if (placeholder) el.placeholder = placeholder;
      return el;
    }
    function select(options) {
      const el = document.createElement("select");
      options.forEach(opt => {
        const o = document.createElement("option");
        o.textContent = opt;
        el.appendChild(o);
      });
      return el;
    }
    function kpiCard(label, value, hint) {
      const card = document.createElement("div");
      card.className = "enfCard kpi";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value"; v.textContent = value;
      const h = document.createElement("div"); h.className = "hint"; h.textContent = hint;
      card.appendChild(l); card.appendChild(v); card.appendChild(h);
      return card;
    }
    function chartHeader(titleText, subText) {
      const wrap = document.createElement("div");
      wrap.className = "chartHeader";
      const h = document.createElement("div"); h.className = "h"; h.textContent = titleText;
      const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = subText;
      wrap.appendChild(h); wrap.appendChild(sub);
      return wrap;
    }
    function makeTable(headers, rows, allowHtmlCells = false) {
      const table = document.createElement("table");
      table.className = "enfTable";
      const thead = document.createElement("thead");
      const trh = document.createElement("tr");
      headers.forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        trh.appendChild(th);
      });
      thead.appendChild(trh);

      const tbody = document.createElement("tbody");
      rows.forEach(r => {
        const tr = document.createElement("tr");
        r.forEach(cell => {
          const td = document.createElement("td");
          if (allowHtmlCells && typeof cell === "string" && cell.startsWith("<span")) td.innerHTML = cell;
          else td.textContent = String(cell);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      table.appendChild(thead);
      table.appendChild(tbody);
      return table;
    }
    function pill(text) {
      return `<span class="pill">${escapeXml(text)}</span>`;
    }
  }

  function renderRelatorioClientesInContent() {
    removeExistingRelatorio();
    injectRelatorioStyles();

    const main = getMainContentEl();
    if (!main) return;

    // insere no topo do conteúdo, sem cobrir o sidebar
    const root = createRelatorioRoot();

    // Tentativa de colocar “bem no lugar” do conteúdo principal:
    // Se existir um wrapper mais específico, você pode trocar esse append/insertBefore.
    main.insertBefore(root, main.firstChild);
  }

  // =========================
  // INIT
  // =========================
  function boot() {
    return; // [Enfoque] relatório de clientes removido nesta versão.

    startMainMenuObserver();

    if (isRelatorioClientesPage()) {
      setTimeout(() => {
        try { renderRelatorioClientesInContent(); }
        catch (e) { console.warn("[Enfoque] Relatorio Clientes mock falhou:", e); }
      }, 400);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();



// =============================================================
// RELATORIO DE VENDAS (FAKE PAGE) - /sistema/Lojas/Report=1
// =============================================================
(() => {
  "use strict";

  // IMPORTANTE:
  // A rota "/sistema/Lojas/Report=1" devolve 404 no SIGE. Isso faz o Chrome
  // registrar erro no console e, dependendo de políticas do servidor, pode
  // atrapalhar requisições que dependam de referrer.
  // Por isso, o item do menu aponta para a rota REAL do SIGE com um query param.
  // Mantemos a rota antiga como fallback para quem ainda tiver um atalho salvo.
  const TARGET_RELATORIO_VENDAS_URL =
    "https://enfoquepapelaria.meusige.com.br/sistema/Lojas/Report?enfoque=1";

  const TARGET_RELATORIO_VENDAS_URL_LEGACY =
    "https://enfoquepapelaria.meusige.com.br/sistema/Lojas/Report=1";

  const SIGE_HOME_URL = "https://enfoquepapelaria.meusige.com.br/sistema/Inicial";
  const SIGE_REFERRER_REAL = "https://enfoquepapelaria.meusige.com.br/sistema/Lojas/Report";

  // Se alguém cair na rota legada (404 do SIGE), redireciona imediatamente para a rota real.
  if (false && String(location.href).includes('/sistema/Lojas/Report=1')) {
    try { location.replace(TARGET_RELATORIO_VENDAS_URL); } catch (_) {}
  }

  const LOJAS = [
    { key: "CENTRO", label: "CENTRO" },
    { key: "ICARAI", label: "ICARAÍ" },
    { key: "ITAIPU", label: "ITAIPU" },
    { key: "SG", label: "S. GONÇALO" },
    { key: "PA", label: "P&A" },
    { key: "ILHA", label: "ILHA" },
    { key: "COPA", label: "COPA" },
  ];

  function isRelatorioVendasFakePage() {
    const href = String(location.href);
    return (
      href === TARGET_RELATORIO_VENDAS_URL ||
      href === TARGET_RELATORIO_VENDAS_URL_LEGACY ||
      href.includes("/sistema/Lojas/Report?enfoque=1") ||
      href.includes("/sistema/Lojas/Report=1")
    );
  }

  // ============================================================
  // MENU: inserir item no menu raiz do SIGE
  // ============================================================
  function ensureRelatorioVendasInMainMenu() {
    const sidebar = document.querySelector("#sidebarMenu");
    if (!sidebar) return false;

    const existing = sidebar.querySelector('a[data-enfoque-relatorio-vendas="1"]');
    if (existing) {
      // Pode existir de versões antigas com href legado; força sempre a rota atual.
      existing.setAttribute('href', TARGET_RELATORIO_VENDAS_URL);
      existing.href = TARGET_RELATORIO_VENDAS_URL;
      existing.setAttribute('onclick', 'onMenuClick(this);');
      existing.dataset.enfoqueRelatorioVendas = '1';
      return true;
    }

    const directUls = Array.from(sidebar.querySelectorAll(":scope > ul"));
    if (!directUls.length) return false;

    let mainUl = directUls[0];
    let bestCount = -1;
    for (const ul of directUls) {
      const c = ul.querySelectorAll(":scope > li").length;
      if (c > bestCount) {
        bestCount = c;
        mainUl = ul;
      }
    }
    if (!mainUl) return false;

    const li = document.createElement("li");
    const a = document.createElement("a");
    a.setAttribute("onclick", "onMenuClick(this);");
    a.setAttribute("href", TARGET_RELATORIO_VENDAS_URL);
    a.dataset.enfoqueRelatorioVendas = "1";

    const icon = document.createElement("i");
    icon.className = "menuIcon icon16 icomoon-icon-chart";

    const span = document.createElement("span");
    span.textContent = "Relatório de Vendas";

    a.appendChild(icon);
    a.appendChild(span);
    li.appendChild(a);

    // inserir após "Relatórios" se existir
    const relatoriosLi = Array.from(mainUl.querySelectorAll(":scope > li")).find((x) => {
      const s = x.querySelector(":scope > a > span");
      return s && s.textContent && s.textContent.trim() === "Relatórios";
    });

    if (relatoriosLi && relatoriosLi.nextSibling) {
      mainUl.insertBefore(li, relatoriosLi.nextSibling);
    } else {
      mainUl.appendChild(li);
    }

    return true;
  }

  function sidebarMenuClickHook() {
    const sidebar = document.querySelector('#sidebarMenu');
    if (!sidebar) return;
    if (sidebar.__enfoqueRelatorioVendasHooked) return;
    sidebar.__enfoqueRelatorioVendasHooked = true;

    sidebar.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;
      if (a.dataset && a.dataset.enfoqueRelatorioVendas === '1') {
        ev.preventDefault();
        ev.stopPropagation();
        // Sempre navega para a rota real.
        if (location.href !== TARGET_RELATORIO_VENDAS_URL) {
          location.assign(TARGET_RELATORIO_VENDAS_URL);
        } else {
          // Já estamos na página; renderiza/atualiza a GUI.
          try { renderRelatorioVendasApp(); } catch (_) {}
        }
      }
    }, true);
  }

  function startMenuObserver() {
    const obs = new MutationObserver(() => {
      try { ensureRelatorioVendasInMainMenu(); } catch (_) {}
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    ensureRelatorioVendasInMainMenu();
    // Hook de clique: evita navegar para /Report=1 (legado) e força a rota real.
    sidebarMenuClickHook();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const ok = ensureRelatorioVendasInMainMenu();
      if (ok || tries > 40) clearInterval(t);
    }, 500);
  }

  // ============================================================
  // API
  // ============================================================
  function toIsoZ(dateStr) {
    // dateStr: YYYY-MM-DD
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
    // SIGE normalmente usa 03:00Z para virar o dia local (America/Sao_Paulo)
    return `${dateStr}T03:00:00.000Z`;
  }

  function asNumber(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number" && isFinite(v)) return v;
    let s = String(v).trim();
    if (!s) return 0;
    // tenta pt-BR
    s = s.replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    }
    return undefined;
  }

  function normalizeLojaKey(name) {
    const s = String(name || "").toUpperCase().trim();
    if (!s) return null;
    if (s.includes("CENTRO")) return "CENTRO";
    if (s.includes("ICAR")) return "ICARAI";
    if (s.includes("ITAIPU")) return "ITAIPU";
    if (s.includes("GON")) return "SG";
    if (s.includes("P&A") || s.includes("P E A") || s.includes("PAPEL") || s === "PA") return "PA";
    if (s.includes("ILHA")) return "ILHA";
    if (s.includes("COPA")) return "COPA";
    return null;
  }

  function blankAgg() {
    return { vendaLojas: 0, feiras: 0, abel: 0, mega: 0, materialConsumo: 0 };
  }

  function normalizeApiVendasDiarias(raw) {
    // retorno padrão: map por lojaKey
    const acc = {};
    for (const l of LOJAS) acc[l.key] = blankAgg();

    let data = raw;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (_) {}
    }

    // tenta achar uma lista
    let list = null;
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.data)) list = data.data;
    else if (data && Array.isArray(data.result)) list = data.result;
    else if (data && Array.isArray(data.itens)) list = data.itens;
    else if (data && Array.isArray(data.lojas)) list = data.lojas;
    else if (data && Array.isArray(data.Lojas)) list = data.Lojas;

    // formato pivot: { CENTRO: {...}, ICARAI: {...} }
    if (!list && data && typeof data === "object") {
      const keys = Object.keys(data);
      const looksPivot = keys.some(k => normalizeLojaKey(k));
      if (looksPivot) {
        for (const k of keys) {
          const lojaKey = normalizeLojaKey(k);
          if (!lojaKey) continue;
          const o = data[k] || {};
          acc[lojaKey].vendaLojas += asNumber(pick(o, ["vendaLojas","vendasLojas","venda_lojas","venda","total","valor","totalVendas"])) ;
          acc[lojaKey].feiras += asNumber(pick(o, ["feiras","feira","vendaFeiras","totalFeiras"]));
          acc[lojaKey].abel += asNumber(pick(o, ["abel","vendaAbel","totalAbel"]));
          acc[lojaKey].mega += asNumber(pick(o, ["mega","vendaMega","totalMega"]));
          acc[lojaKey].materialConsumo += asNumber(pick(o, ["materialConsumo","material_consumo","consumo","totalConsumo","vendaMaterialConsumo"]));
        }
        return acc;
      }
    }

    if (!list) {
      // nada a fazer
      return acc;
    }

    // Formato lista: pode vir agregado por loja OU diário. Vamos somar tudo.
    for (const it of list) {
      if (!it || typeof it !== "object") continue;

      const lojaName = pick(it, ["loja","Loja","nomeLoja","NomeLoja","filial","Filial","unidade","Unidade","nome","Nome"]);
      const lojaKey = normalizeLojaKey(lojaName);
      if (!lojaKey) continue;

      // Alguns formatos mandam um "tipo"/"categoria" por linha.
      const tipo = String(pick(it, ["tipo","Tipo","categoria","Categoria","canal","Canal","origem","Origem"]) || "").toUpperCase();

      // tenta pegar valores
      const valor = asNumber(pick(it, [
        "valor",
        "Valor",
        "total",
        "Total",
        "vendas",
        "Vendas",
        "venda",
        "Venda",
        "valorTotal",
        "ValorTotal",
        "totalVendas",
        "TotalVendas",
        "vendaTotal",
        "VendaTotal",
      ]));

      // ou já vem separado por campos
      const vendaLojas = asNumber(pick(it, ["vendaLojas","vendasLojas","venda_lojas","totalVendaLojas","VendaLojas","VendasLojas"]));
      const feiras = asNumber(pick(it, ["feiras","Feiras","vendaFeiras","VendaFeiras"]));
      const abel = asNumber(pick(it, ["abel","Abel","vendaAbel","VendaAbel"]));
      const mega = asNumber(pick(it, ["mega","Mega","vendaMega","VendaMega"]));
      const material = asNumber(pick(it, ["materialConsumo","MaterialConsumo","material_consumo","Material_Consumo","consumo","Consumo"]));

      if (vendaLojas || feiras || abel || mega || material) {
        acc[lojaKey].vendaLojas += vendaLojas;
        acc[lojaKey].feiras += feiras;
        acc[lojaKey].abel += abel;
        acc[lojaKey].mega += mega;
        acc[lojaKey].materialConsumo += material;
        continue;
      }

      // Heurística por tipo
      if (tipo.includes("FEIRA")) acc[lojaKey].feiras += valor;
      else if (tipo.includes("ABEL")) acc[lojaKey].abel += valor;
      else if (tipo.includes("MEGA")) acc[lojaKey].mega += valor;
      else if (tipo.includes("CONSUMO") || tipo.includes("MATERIAL")) acc[lojaKey].materialConsumo += valor;
      else acc[lojaKey].vendaLojas += valor;
    }

    return acc;
  }

  async function fetchReportLojasVendasDiarias(dateIniStr, dateFimStr) {
    const iniIso = toIsoZ(dateIniStr);
    const fimIso = toIsoZ(dateFimStr);
    if (!iniIso || !fimIso) return { ok: false, error: "DATA_INVALIDA" };

    const token = await new Promise((r) => __enfoqueGetToken((t) => r(t)));
    if (!token) return { ok: false, error: "TOKEN_AUSENTE" };

    const url = `https://enfoquepapelaria.meusige.com.br/api/v2/ReportLojas/VendasDiarias?dataFaturamentoInicial=${encodeURIComponent(iniIso)}&dataFaturamentoFinal=${encodeURIComponent(fimIso)}`;

    const resp = await __enfoqueCallPageWorld(
      "ENFOQUE_API_CALL",
      {
        url,
        method: "GET",
        token,
        headers: {
          Accept: "application/json, text/plain, */*",
                  },
        referrer: SIGE_REFERRER_REAL,
        referrerPolicy: "strict-origin-when-cross-origin",
      },
      25000
    );

    if (!resp || !resp.ok) {
      return { ok: false, error: resp && resp.error ? resp.error : "ERRO_API" };
    }

    return { ok: true, data: resp.data };
  }

  // ============================================================
  // UI
  // ============================================================
  function removeExisting() {
    const old = document.getElementById("enfoqueRelatorioVendasRoot");
    if (old) old.remove();
  }

  function injectStyles() {
    if (document.getElementById("enfoque-relatorio-vendas-style")) return;
    const style = document.createElement("style");
    style.id = "enfoque-relatorio-vendas-style";
    style.textContent = `
      #enfoqueRelatorioVendasRoot{
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background:#f3f4f6;
        font-family: Arial, Helvetica, sans-serif;
      }
      #enfoqueRelatorioVendasGrid{
        height: 100vh;
        display: grid;
        grid-template-columns: 270px 1fr;
      }
      /* Sidebar estilo SIGE (simplificado) */
      #enfoqueRVSidebar{
        background:#111827;
        color:#fff;
        padding: 10px 10px;
        box-shadow: 2px 0 14px rgba(0,0,0,.22);
      }
      #enfoqueRVSidebar .menuHeader{
        display:block;
        height:56px;
        border-radius: 14px;
        background: rgba(255,255,255,.08);
        position: relative;
        overflow:hidden;
        margin-bottom: 10px;
      }
      #enfoqueRVSidebar .menuHeader:after{
        content:"Enfoque";
        position:absolute;
        left:14px;
        top:50%;
        transform: translateY(-50%);
        font-weight: 900;
        letter-spacing: .4px;
        opacity: .95;
      }
      #enfoqueRVSidebar .sideHint{
        font-size: 12px;
        opacity: .85;
        line-height: 1.35;
        padding: 6px 6px;
      }
      #enfoqueRVSidebar .sideHint b{ color:#fff; }

      #enfoqueRVMain{
        overflow:auto;
        padding: 14px;
      }

      .enfTopBar{
        height: 56px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 6px 18px rgba(17,24,39,.08);
        border: 1px solid rgba(17,24,39,.06);
        display:flex;
        align-items:center;
        justify-content: space-between;
        padding: 0 14px;
        margin-bottom: 12px;
      }
      .enfTopBar .title{ font-weight: 900; color:#111827; }
      .enfTopBar .right{ display:flex; gap:8px; align-items:center; }

      .enfBtn{
        border:0;
        border-radius: 12px;
        padding: 10px 12px;
        cursor:pointer;
        font-weight: 900;
        font-size: 12px;
      }
      .enfBtn.primary{ background:#22c55e; color:#052e16; }
      .enfBtn.gray{ background:#e5e7eb; color:#111827; }
      .enfBtn.dark{ background:#111827; color:#fff; }
      .enfBtn.orange{ background:#f59e0b; color:#3b2f05; }
      .enfBtn:disabled{ opacity:.55; cursor:not-allowed; }

      .enfWrap{
        display:grid;
        grid-template-columns: 360px 1fr 260px;
        gap: 12px;
        align-items: start;
      }

      .enfCard{
        background:#fff;
        border-radius: 16px;
        box-shadow: 0 6px 18px rgba(17,24,39,.08);
        border: 1px solid rgba(17,24,39,.06);
      }
      .enfCard .hd{
        padding: 12px 12px 0;
        font-weight: 900;
        color:#111827;
        font-size: 12px;
        letter-spacing: .7px;
        text-transform: uppercase;
      }
      .enfCard .bd{ padding: 12px; }

      .enfField{ display:flex; flex-direction: column; gap:6px; margin-bottom: 10px; }
      .enfField label{ font-size:12px; color:#374151; font-weight: 900; }
      .enfField input, .enfField select{
        height: 36px;
        border-radius: 12px;
        border: 1px solid rgba(17,24,39,.15);
        padding: 0 10px;
      }

      .miniGrid{ display:grid; grid-template-columns: 1fr 130px; gap: 8px; padding-left: 8px; }
      .miniRow{ display: contents; }
      .miniRow .k{ font-weight: 900; font-size: 12px; color:#111827; align-self:center; }
      .miniRow input{ width: 100%; }

      .enfStatus{ font-size: 12px; color:#374151; }
      .enfStatus.err{ color:#b91c1c; font-weight: 900; }

      /* Tabela estilo excel */
      .rvTable{
        width: 100%;
        border-collapse: collapse;
        border-radius: 16px;
        overflow: hidden;
      }
      .rvTable th, .rvTable td{
        border: 1px solid rgba(17,24,39,.18);
        padding: 8px 8px;
        font-size: 12px;
        text-align: right;
        white-space: nowrap;
      }
      .rvTable th:first-child, .rvTable td:first-child{ text-align:left; }
      .rvTable th{ background:#e5e7eb; color:#111827; font-weight: 900; }
      .rvX{ width: 18px; text-align:center !important; background:#fff; }

      .rowYellow td{ background:#FEF3C7; }
      .rowBlue td{ background:#DBEAFE; }
      .rowGreen td{ background:#DCFCE7; }
      .rowOrange td{ background:#FFEDD5; }
      .rowGray td:first-child{ font-weight: 900; }
      .rowBold td{ font-weight: 900; }

      .muted{ color:#6b7280; font-weight: 800; }
      .note{ font-size: 11px; color:#6b7280; margin-top: 8px; }

      /* Caixa COTA GLOBAL */
      .cotaBox table{ width:100%; border-collapse: collapse; }
      .cotaBox td{ border:1px solid rgba(17,24,39,.18); padding:8px; font-size:12px; }
      .cotaBox td:first-child{ font-weight:900; color:#111827; }
      .cotaBox .tot td{ font-weight: 900; background:#DCFCE7; }
    `;
    document.head.appendChild(style);
  }

  function fmtMoney(n) {
    try {
      return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (_) {
      return "0,00";
    }
  }

  function fmtPct(n) {
    const v = Number(n || 0);
    if (!isFinite(v)) return "0,0%";
    return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }

  function buildReportModel(aggByLoja, metas, cotaMega, cotaAbel) {
    const rows = [];

    // campos base por loja
    const per = {};
    for (const l of LOJAS) {
      const a = aggByLoja[l.key] || blankAgg();
      const meta = asNumber(metas[l.key]);
      const vendaLojas = asNumber(a.vendaLojas);
      const feiras = asNumber(a.feiras);
      const abel = asNumber(a.abel);
      const mega = asNumber(a.mega);
      const material = asNumber(a.materialConsumo);

      const vendasGeral = vendaLojas + feiras + abel + mega + material;
      const falta = meta - vendaLojas;
      const pct = meta > 0 ? (vendaLojas / meta) : 0;

      // drivers (por enquanto fixos como seu exemplo)
      const diasComSab = l.key === "ILHA" ? 7 : 6;
      const diasSemSab = 5;
      const necComSab = diasComSab > 0 ? (falta / diasComSab) : 0;
      const necSemSab = diasSemSab > 0 ? (falta / diasSemSab) : 0;

      per[l.key] = {
        vendaLojas,
        feiras,
        abel,
        mega,
        material,
        vendasGeral,
        meta,
        falta,
        pct,
        diasComSab,
        diasSemSab,
        necComSab,
        necSemSab,
      };
    }

    // GLOBAL
    const global = {
      vendasGeral: 0,
      material: 0,
      vendasSemMaterial: 0,
      cotaLojas: 0,
      cotaMega: asNumber(cotaMega),
      cotaAbel: asNumber(cotaAbel),
      cotaTotal: 0,
      falta: 0,
      pct: 0,
      necComSab: 0,
      necSemSab: 0,
    };

    for (const l of LOJAS) {
      global.vendasGeral += per[l.key].vendasGeral;
      global.material += per[l.key].material;
      global.cotaLojas += per[l.key].meta;
      global.necComSab += per[l.key].necComSab;
      global.necSemSab += per[l.key].necSemSab;
    }

    global.vendasSemMaterial = global.vendasGeral - global.material;
    global.cotaTotal = global.cotaLojas + global.cotaMega + global.cotaAbel;
    global.falta = global.cotaTotal - global.vendasSemMaterial;
    global.pct = global.cotaTotal > 0 ? (global.vendasSemMaterial / global.cotaTotal) : 0;

    function pushRow(label, cls, getter, globalGetter, isPct) {
      const r = { label, cls, vals: [] };
      for (const l of LOJAS) {
        const v = getter(per[l.key]);
        r.vals.push(isPct ? fmtPct(v) : fmtMoney(v));
      }
      // x separator
      r.vals.push("x");
      const gv = globalGetter(global);
      r.vals.push(isPct ? fmtPct(gv) : fmtMoney(gv));
      rows.push(r);
    }

    // topo
    pushRow("VENDAS GERAL", "rowBold", (x)=>x.vendasGeral, (g)=>g.vendasGeral, false);
    pushRow("FEIRAS", "rowYellow", (x)=>x.feiras, (_g)=>0, false);
    pushRow("ABEL", "rowYellow", (x)=>x.abel, (_g)=>0, false);
    pushRow("MEGA", "rowYellow", (x)=>x.mega, (_g)=>0, false);
    pushRow("MATERIAL CONSUMO", "rowYellow", (x)=>x.material, (g)=>g.material, false);
    pushRow("VENDA LOJAS", "rowBlue rowBold", (x)=>x.vendaLojas, (g)=>g.vendasSemMaterial, false);

    // metas
    pushRow("(((( COTA ))))", "rowGreen rowBold", (x)=>x.meta, (g)=>g.cotaTotal, false);
    pushRow("FALTA PARA COTA", "rowOrange rowBold", (x)=>x.falta, (g)=>g.falta, false);
    pushRow("JÁ ATINGIU %", "rowBold", (x)=>x.pct, (g)=>g.pct, true);

    // dias e necessidade
    pushRow("DIAS ÚTEIS QUE FALTAM (com Sábado)", "rowBold", (x)=>x.diasComSab, (_g)=>0, false);
    pushRow("NECESSIDADE DIÁRIA (com Sábado)", "rowOrange", (x)=>x.necComSab, (g)=>g.necComSab, false);
    pushRow("DIAS ÚTEIS QUE FALTAM (sem Sábado)", "rowBold", (x)=>x.diasSemSab, (_g)=>0, false);
    pushRow("NECESSIDADE DIÁRIA (sem Sábado)", "rowOrange", (x)=>x.necSemSab, (g)=>g.necSemSab, false);

    return { per, global, rows };
  }

  function renderTable(container, model) {
    container.innerHTML = "";

    const table = document.createElement("table");
    table.className = "rvTable enfCard";

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    const th0 = document.createElement("th");
    th0.textContent = "";
    trh.appendChild(th0);

    for (const l of LOJAS) {
      const th = document.createElement("th");
      th.innerHTML = `<span class="muted">${l.label}</span>`;
      trh.appendChild(th);
    }

    const thX = document.createElement("th");
    thX.className = "rvX";
    thX.textContent = "x";
    trh.appendChild(thX);

    const thG = document.createElement("th");
    thG.innerHTML = `<span class="muted">GLOBAL</span>`;
    trh.appendChild(thG);

    thead.appendChild(trh);

    const tbody = document.createElement("tbody");
    for (const row of model.rows) {
      const tr = document.createElement("tr");
      if (row.cls) row.cls.split(/\s+/).forEach(c => tr.classList.add(c));

      const td0 = document.createElement("td");
      td0.textContent = row.label;
      tr.appendChild(td0);

      // 7 lojas + x + global
      row.vals.forEach((v, i) => {
        const td = document.createElement("td");
        if (i === 7) td.className = "rvX"; // coluna do x
        td.textContent = String(v);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "Obs.: GLOBAL (azul) = VENDAS GERAL - MATERIAL CONSUMO (como no seu modelo).";
    container.appendChild(note);
  }

  function renderCotaBox(container, metas, cotaMega, cotaAbel) {
    const cotaLojas = LOJAS.reduce((s,l)=>s + asNumber(metas[l.key]), 0);
    const mega = asNumber(cotaMega);
    const abel = asNumber(cotaAbel);
    const total = cotaLojas + mega + abel;

    container.innerHTML = `
      <div class="hd">COTA GLOBAL</div>
      <div class="bd cotaBox">
        <table>
          <tr><td>Lojas</td><td style="text-align:right">${fmtMoney(cotaLojas)}</td></tr>
          <tr><td>Mega</td><td style="text-align:right">${fmtMoney(mega)}</td></tr>
          <tr><td>Abel</td><td style="text-align:right">${fmtMoney(abel)}</td></tr>
          <tr class="tot"><td>Total</td><td style="text-align:right">${fmtMoney(total)}</td></tr>
        </table>
      </div>
    `;
  }

  function exportExcelFromCurrent(model, metas, cotaMega, cotaAbel, dateIni, dateFim) {
    const title = `Relatorio_Vendas_Lojas_${dateIni}_a_${dateFim}`.replace(/[^A-Za-z0-9_\-]/g, "_");

    const headerRow = ["", ...LOJAS.map(l=>l.label), "x", "GLOBAL"];
    const rows = model.rows.map(r => [r.label, ...r.vals]);

    const html = `
      <html>
      <head><meta charset="UTF-8"></head>
      <body>
        <h3>${title}</h3>
        <table border="1">
          <tr>${headerRow.map(c=>`<th>${String(c).replace(/</g,'&lt;')}</th>`).join('')}</tr>
          ${rows.map(r=>`<tr>${r.map((c,idx)=>`<td ${idx===0?'':'align="right"'}>${String(c).replace(/</g,'&lt;')}</td>`).join('')}</tr>`).join('')}
        </table>
        <br/>
        <table border="1">
          <tr><th>COTA GLOBAL</th><th align="right">Valor</th></tr>
          <tr><td>Lojas</td><td align="right">${fmtMoney(LOJAS.reduce((s,l)=>s + asNumber(metas[l.key]), 0))}</td></tr>
          <tr><td>Mega</td><td align="right">${fmtMoney(cotaMega)}</td></tr>
          <tr><td>Abel</td><td align="right">${fmtMoney(cotaAbel)}</td></tr>
          <tr><td><b>Total</b></td><td align="right"><b>${fmtMoney(LOJAS.reduce((s,l)=>s + asNumber(metas[l.key]), 0) + asNumber(cotaMega) + asNumber(cotaAbel))}</b></td></tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title + ".xls";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) {}
      try { a.remove(); } catch (_) {}
    }, 500);
  }

  function renderUI() {
    removeExisting();
    injectStyles();

    const root = document.createElement("div");
    root.id = "enfoqueRelatorioVendasRoot";

    const grid = document.createElement("div");
    grid.id = "enfoqueRelatorioVendasGrid";

    // sidebar
    const sb = document.createElement("div");
    sb.id = "enfoqueRVSidebar";
    const header = document.createElement("a");
    header.className = "menuHeader";
    header.href = SIGE_HOME_URL;
    header.setAttribute("onclick", "onMenuHomeClick(this)");

    const hint = document.createElement("div");
    hint.className = "sideHint";
    hint.innerHTML = `
      <div style="margin-bottom:6px;"><b>Relatório de Vendas</b></div>
      <div style="opacity:.85">Página personalizada da extensão.</div>
      <div style="opacity:.85">Usa Bearer capturado do SIGE.</div>
    `;

    sb.appendChild(header);
    sb.appendChild(hint);

    // main
    const main = document.createElement("div");
    main.id = "enfoqueRVMain";

    const top = document.createElement("div");
    top.className = "enfTopBar";
    top.innerHTML = `
      <div class="title">Relatório de Vendas</div>
      <div class="right">
        <button class="enfBtn dark" id="rvBtnVoltar">Voltar</button>
      </div>
    `;

    const wrap = document.createElement("div");
    wrap.className = "enfWrap";

    // filtros
    const cardFilters = document.createElement("div");
    cardFilters.className = "enfCard";
    cardFilters.innerHTML = `
      <div class="hd">Filtros</div>
      <div class="bd">
        <div class="enfField">
          <label>Tipo de relatório</label>
          <select id="rvTipo">
            <option value="lojas" selected>Relatório de Lojas</option>
            <option value="vendedor">Relatório de Vendedor (em breve)</option>
          </select>
        </div>

        <div id="rvBoxLojas">
          <div class="enfField">
            <label>Data inicial</label>
            <input id="rvDataIni" type="date" />
          </div>
          <div class="enfField">
            <label>Data final</label>
            <input id="rvDataFim" type="date" />
          </div>

          <div style="height:8px"></div>
          <div class="enfField">
            <label>Meta (COTA) por loja</label>
            <div class="miniGrid" id="rvMetas"></div>
          </div>

          <div class="enfField">
            <label>Cota Mega</label>
            <input id="rvCotaMega" type="number" step="0.01" />
          </div>
          <div class="enfField">
            <label>Cota Abel</label>
            <input id="rvCotaAbel" type="number" step="0.01" />
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
            <button class="enfBtn primary" id="rvBtnGerar">Gerar relatório</button>
            <button class="enfBtn orange" id="rvBtnExcel" disabled>Exportar Excel</button>
          </div>
          <div style="margin-top:10px;" class="enfStatus" id="rvStatus"></div>
        </div>

        <div id="rvBoxVendedor" style="display:none">
          <div class="enfStatus">Ainda vamos implementar o relatório por vendedor.</div>
        </div>

      </div>
    `;

    // tabela
    const cardTable = document.createElement("div");
    cardTable.className = "enfCard";
    cardTable.innerHTML = `<div class="hd">Relatório</div><div class="bd" id="rvTableWrap"><div class="enfStatus">Selecione os filtros e clique em <b>Gerar relatório</b>.</div></div>`;

    // cota global
    const cardCota = document.createElement("div");
    cardCota.className = "enfCard";
    cardCota.id = "rvCotaBox";
    cardCota.innerHTML = `<div class="hd">COTA GLOBAL</div><div class="bd"><div class="enfStatus">Defina as metas para visualizar.</div></div>`;

    wrap.appendChild(cardFilters);
    wrap.appendChild(cardTable);
    wrap.appendChild(cardCota);

    main.appendChild(top);
    main.appendChild(wrap);

    grid.appendChild(sb);
    grid.appendChild(main);
    root.appendChild(grid);
    document.body.appendChild(root);

    // init metas inputs
    const metasEl = root.querySelector("#rvMetas");
    const metaInputs = {};
    LOJAS.forEach((l) => {
      const k = document.createElement("div");
      k.className = "miniRow";
      const key = document.createElement("div");
      key.className = "k";
      key.textContent = l.label;
      const inp = document.createElement("input");
      inp.type = "number";
      inp.step = "0.01";
      inp.dataset.lojaKey = l.key;
      metaInputs[l.key] = inp;
      metasEl.appendChild(key);
      metasEl.appendChild(inp);
    });

    // defaults (p/ não ficar vazio) - usuário pode editar
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const defaultIni = `${yyyy}-${mm}-01`;
    const defaultFim = `${yyyy}-${mm}-${dd}`;

    const dataIniEl = root.querySelector("#rvDataIni");
    const dataFimEl = root.querySelector("#rvDataFim");
    const cotaMegaEl = root.querySelector("#rvCotaMega");
    const cotaAbelEl = root.querySelector("#rvCotaAbel");
    const statusEl = root.querySelector("#rvStatus");
    const tableWrap = root.querySelector("#rvTableWrap");
    const btnExcel = root.querySelector("#rvBtnExcel");

    dataIniEl.value = defaultIni;
    dataFimEl.value = defaultFim;

    // tenta carregar metas salvas
    (async () => {
      try {
        const st = await __enfoqueStorageGet(["enfoque_rv_metas", "enfoque_rv_cotaMega", "enfoque_rv_cotaAbel", "enfoque_rv_dataIni", "enfoque_rv_dataFim"]);
        const metas = (st && st.enfoque_rv_metas && typeof st.enfoque_rv_metas === "object") ? st.enfoque_rv_metas : {};
        for (const l of LOJAS) {
          if (metaInputs[l.key]) metaInputs[l.key].value = metas[l.key] !== undefined ? String(metas[l.key]) : "";
        }
        if (st && st.enfoque_rv_cotaMega !== undefined) cotaMegaEl.value = String(st.enfoque_rv_cotaMega);
        if (st && st.enfoque_rv_cotaAbel !== undefined) cotaAbelEl.value = String(st.enfoque_rv_cotaAbel);
        if (st && st.enfoque_rv_dataIni) dataIniEl.value = String(st.enfoque_rv_dataIni);
        if (st && st.enfoque_rv_dataFim) dataFimEl.value = String(st.enfoque_rv_dataFim);
      } catch (_) {}
      // render box cota inicial
      const metasNow = {};
      for (const l of LOJAS) metasNow[l.key] = asNumber(metaInputs[l.key].value);
      renderCotaBox(cardCota, metasNow, asNumber(cotaMegaEl.value), asNumber(cotaAbelEl.value));
    })();

    // events
    root.querySelector("#rvBtnVoltar").addEventListener("click", () => {
      location.href = SIGE_HOME_URL;
    });

    root.querySelector("#rvTipo").addEventListener("change", (e) => {
      const v = String(e.target.value || "lojas");
      root.querySelector("#rvBoxLojas").style.display = v === "lojas" ? "block" : "none";
      root.querySelector("#rvBoxVendedor").style.display = v === "vendedor" ? "block" : "none";
    });

    // re-render cota box on meta edits
    function readMetas() {
      const metas = {};
      for (const l of LOJAS) metas[l.key] = asNumber(metaInputs[l.key].value);
      return metas;
    }

    function persistBasics() {
      try {
        chrome.storage.local.set({
          enfoque_rv_metas: readMetas(),
          enfoque_rv_cotaMega: asNumber(cotaMegaEl.value),
          enfoque_rv_cotaAbel: asNumber(cotaAbelEl.value),
          enfoque_rv_dataIni: dataIniEl.value,
          enfoque_rv_dataFim: dataFimEl.value,
        });
      } catch (_) {}
    }

    Object.values(metaInputs).forEach((inp) => {
      inp.addEventListener("input", () => {
        renderCotaBox(cardCota, readMetas(), asNumber(cotaMegaEl.value), asNumber(cotaAbelEl.value));
        persistBasics();
      });
    });
    cotaMegaEl.addEventListener("input", () => {
      renderCotaBox(cardCota, readMetas(), asNumber(cotaMegaEl.value), asNumber(cotaAbelEl.value));
      persistBasics();
    });
    cotaAbelEl.addEventListener("input", () => {
      renderCotaBox(cardCota, readMetas(), asNumber(cotaMegaEl.value), asNumber(cotaAbelEl.value));
      persistBasics();
    });
    dataIniEl.addEventListener("change", persistBasics);
    dataFimEl.addEventListener("change", persistBasics);

    let lastModel = null;

    root.querySelector("#rvBtnGerar").addEventListener("click", async () => {
      btnExcel.disabled = true;
      lastModel = null;
      statusEl.classList.remove("err");

      const dateIni = dataIniEl.value;
      const dateFim = dataFimEl.value;
      const metas = readMetas();
      const cotaMega = asNumber(cotaMegaEl.value);
      const cotaAbel = asNumber(cotaAbelEl.value);

      renderCotaBox(cardCota, metas, cotaMega, cotaAbel);

      statusEl.textContent = "Consultando API do SIGE...";

      const apiResp = await fetchReportLojasVendasDiarias(dateIni, dateFim);
      if (!apiResp.ok) {
        statusEl.classList.add("err");
        if (String(apiResp.error || "").includes("TOKEN")) {
          statusEl.textContent = "Token/Bearer não encontrado ou inválido. Abra algum relatório do SIGE para a extensão capturar o Bearer, ou cole no painel Σ (API).";
        } else if (String(apiResp.error || "").includes("HTTP_")) {
          statusEl.textContent = "Erro na API: " + String(apiResp.error);
        } else {
          statusEl.textContent = "Falha ao consultar API: " + String(apiResp.error || "ERRO_API");
        }
        tableWrap.innerHTML = `<div class="enfStatus err">Não foi possível gerar o relatório.</div>`;
        return;
      }

      statusEl.textContent = "Processando dados...";
      const agg = normalizeApiVendasDiarias(apiResp.data);
      const model = buildReportModel(agg, metas, cotaMega, cotaAbel);
      lastModel = { model, metas, cotaMega, cotaAbel, dateIni, dateFim };

      renderTable(tableWrap, model);
      statusEl.textContent = "Relatório gerado.";
      btnExcel.disabled = false;
    });

    btnExcel.addEventListener("click", () => {
      if (!lastModel) return;
      exportExcelFromCurrent(lastModel.model, lastModel.metas, lastModel.cotaMega, lastModel.cotaAbel, lastModel.dateIni, lastModel.dateFim);
    });
  }

  function boot() {
    return; // [Enfoque] relatório de vendas removido nesta versão.

    startMenuObserver();

    if (isRelatorioVendasFakePage()) {
      setTimeout(() => {
        try { renderUI(); }
        catch (e) { console.warn("[Enfoque] Relatorio Vendas (fake) falhou:", e); }
      }, 400);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
// =============================================================
// (fim do bloco de observações do orçamento)
// =============================================================

// =============================================================
// RELATÓRIO DE AGENDAMENTOS PERSONALIZADO
// Interface para /sistema/Agendamentos/Report/1
// =============================================================
function __enfoqueInjectRelatorioAgendamentos() {
  try {
    // Remove qualquer overlay existente
    const existing = document.getElementById("enfoqueRelatorioAgendamentosOverlay");
    if (existing) existing.remove();

    // Cria overlay que cobre toda a página
    const overlay = document.createElement("div");
    overlay.id = "enfoqueRelatorioAgendamentosOverlay";
    overlay.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 99999999",
      "background: #f3f4f6",
      "font-family: Arial, Helvetica, sans-serif",
      "overflow: auto"
    ].join(";");

    // CSS inline
    const style = document.createElement("style");
    style.textContent = `
      #enfoqueRelatorioAgendamentosOverlay * { box-sizing: border-box; }
      .enf-rel-header {
        height: 56px;
        background: #111827;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
      }
      .enf-rel-header .title { font-size: 14px; font-weight: 700; }
      .enf-rel-header .actions { display: flex; gap: 8px; }
      .enf-rel-body { padding: 16px; max-width: 1400px; margin: 0 auto; }
      .enf-rel-filters {
        background: #fff;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,.06);
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: flex-end;
      }
      .enf-rel-filters .field { display: flex; flex-direction: column; gap: 4px; }
      .enf-rel-filters label { font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; }
      .enf-rel-filters input, .enf-rel-filters select {
        height: 36px;
        border-radius: 8px;
        border: 1px solid #d1d5db;
        padding: 0 10px;
        font-size: 13px;
        min-width: 140px;
      }
      .enf-btn {
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
      }
      .enf-btn.primary { background: #2563eb; color: #fff; }
      .enf-btn.primary:hover { background: #1d4ed8; }
      .enf-btn.secondary { background: #e5e7eb; color: #111827; }
      .enf-rel-table-wrap {
        background: #fff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,.06);
      }
      .enf-rel-table { width: 100%; border-collapse: collapse; }
      .enf-rel-table th, .enf-rel-table td {
        padding: 12px 14px;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
        font-size: 13px;
      }
      .enf-rel-table th {
        background: #f9fafb;
        font-weight: 700;
        color: #374151;
        font-size: 11px;
        text-transform: uppercase;
      }
      .enf-rel-table tr:hover td { background: #f9fafb; }
      .enf-expand-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 14px;
        padding: 4px 8px;
        border-radius: 4px;
        color: #6b7280;
      }
      .enf-expand-btn:hover { background: #e5e7eb; color: #111827; }
      .enf-expand-row td { padding: 0; border: none; }
      .enf-expand-content {
        background: #f9fafb;
        padding: 16px 24px;
        border-bottom: 1px solid #e5e7eb;
      }
      .enf-expand-content h4 {
        margin: 0 0 12px;
        font-size: 13px;
        color: #374151;
      }
      .enf-pedido-item {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px dashed #e5e7eb;
        font-size: 12px;
        color: #4b5563;
      }
      .enf-pedido-item:last-child { border-bottom: none; }
      .enf-status { font-size: 11px; color: #6b7280; margin-top: 8px; }
    `;
    document.head.appendChild(style);

    // Header
    const header = document.createElement("div");
    header.className = "enf-rel-header";
    header.innerHTML = `
      <div class="title">📊 Relatório de Clientes - Agendamentos</div>
      <div class="actions">
        <button class="enf-btn secondary" id="enfRelBtnVoltar">Voltar</button>
      </div>
    `;

    // Body
    const body = document.createElement("div");
    body.className = "enf-rel-body";

    // Filtros
    const filters = document.createElement("div");
    filters.className = "enf-rel-filters";
    filters.innerHTML = `
      <div class="field">
        <label>Loja</label>
        <select id="enfRelFiltroLoja">
          <option value="">Todas</option>
          <option value="centro">Centro</option>
          <option value="itaipu">Itaipu</option>
          <option value="icarai">Icaraí</option>
          <option value="saogoncalo">São Gonçalo</option>
          <option value="papelarte">Papel & Arte</option>
          <option value="ilha">Ilha Plaza</option>
          <option value="copa">Copacabana</option>
        </select>
      </div>
      <div class="field">
        <label>Data Inicial</label>
        <input type="date" id="enfRelFiltroDataIni" />
      </div>
      <div class="field">
        <label>Data Final</label>
        <input type="date" id="enfRelFiltroDataFim" />
      </div>
      <div class="field">
        <label>Tipo Pagamento</label>
        <select id="enfRelFiltroPagamento">
          <option value="">Todos</option>
          <option value="credito">Cartão de Crédito</option>
          <option value="debito">Cartão de Débito</option>
          <option value="pix">Pix</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="vale">Vale</option>
        </select>
      </div>
      <button class="enf-btn primary" id="enfRelBtnFiltrar">Filtrar</button>
      <div class="enf-status" id="enfRelStatus"></div>
    `;

    // Tabela
    const tableWrap = document.createElement("div");
    tableWrap.className = "enf-rel-table-wrap";
    tableWrap.innerHTML = `
      <table class="enf-rel-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th>Cliente</th>
            <th>CNPJ</th>
            <th>Última Venda</th>
            <th>Total Vendas</th>
          </tr>
        </thead>
        <tbody id="enfRelTableBody">
        </tbody>
      </table>
    `;

    body.appendChild(filters);
    body.appendChild(tableWrap);

    overlay.appendChild(header);
    overlay.appendChild(body);
    document.body.appendChild(overlay);

    function formatBRL(v) {
      return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    function parseDateBR(dateStr) {
      // Converte "01/04/2026 - 09:02" para "01/04/2026"
      if (!dateStr) return "";
      const parts = String(dateStr).split(" - ");
      return parts[0] || dateStr;
    }

    function formatDateBR(dateStr) {
      // Converte data ISO ou string para DD/MM/YYYY
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString("pt-BR");
      } catch (_) {
        return dateStr;
      }
    }

    // Processa dados da API e agrupa por cliente
    function processApiData(apiResponse) {
      const data = apiResponse && apiResponse.Data ? apiResponse.Data : [];
      const clientesMap = new Map();

      data.forEach(venda => {
        const clienteId = venda.ClienteId || venda.Cliente || "DESCONHECIDO";
        const clienteNome = venda.Cliente || "DESCONHECIDO";
        const cnpj = venda.CNPJ || "";

        if (!clientesMap.has(clienteId)) {
          clientesMap.set(clienteId, {
            id: clienteId,
            nome: clienteNome,
            cnpj: cnpj,
            ultimaVenda: "",
            totalVendas: 0,
            pedidos: []
          });
        }

        const cliente = clientesMap.get(clienteId);

        // Atualiza última venda (mais recente)
        const dataVenda = venda.Data || "";
        if (!cliente.ultimaVenda || dataVenda > cliente.ultimaVenda) {
          cliente.ultimaVenda = parseDateBR(dataVenda);
        }

        // Soma total de vendas
        cliente.totalVendas += (venda.ValorFinal || 0);

        // Adiciona pedido
        cliente.pedidos.push({
          numero: venda.NumeroNFe || venda.Codigo || "N/A",
          data: parseDateBR(dataVenda),
          valor: venda.ValorFinal || 0,
          itens: venda.QuantidadeTotalItensVendidos || 0
        });
      });

      // Converte Map para array e ordena por total de vendas (maior primeiro)
      return Array.from(clientesMap.values()).sort((a, b) => b.totalVendas - a.totalVendas);
    }

    // Filtra clientes/pedidos conforme filtros da UI
    function filterData(clientes, filters) {
      return clientes.filter(cliente => {
        // Filtro por loja (empresa)
        if (filters.loja && !cliente.nome.toUpperCase().includes(filters.loja.toUpperCase())) {
          return false;
        }

        // Filtro por data
        if (filters.dataIni || filters.dataFim) {
          const temPedidoNoPeriodo = cliente.pedidos.some(p => {
            const dataPed = p.data ? p.data.split("/").reverse().join("-") : "";
            if (filters.dataIni && dataPed < filters.dataIni) return false;
            if (filters.dataFim && dataPed > filters.dataFim) return false;
            return true;
          });
          if (!temPedidoNoPeriodo) return false;
        }

        // Filtro por forma de pagamento (simplificado - verifica se tem algum pedido com essa forma)
        // Nota: a API não retorna forma de pagamento por cliente diretamente, então filtramos pelos pedidos
        if (filters.pagamento) {
          // Este filtro seria mais complexo - por enquanto mantém todos
          // Uma implementação completa precisaria armazenar forma de pagamento por pedido
        }

        return true;
      });
    }

    function renderTable(clientes) {
      const tbody = document.getElementById("enfRelTableBody");
      if (!tbody) return;

      tbody.innerHTML = "";

      clientes.forEach((cliente, idx) => {
        // Linha principal
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><button class="enf-expand-btn" data-idx="${idx}">▶</button></td>
          <td><strong>${cliente.nome}</strong></td>
          <td>${cliente.cnpj}</td>
          <td>${cliente.ultimaVenda}</td>
          <td>${formatBRL(cliente.totalVendas)}</td>
        `;
        tbody.appendChild(tr);

        // Linha expandida (oculta)
        const trExp = document.createElement("tr");
        trExp.className = "enf-expand-row";
        trExp.style.display = "none";
        trExp.id = `enfRelExpand-${idx}`;
        trExp.innerHTML = `
          <td colspan="5">
            <div class="enf-expand-content">
              <h4>Pedidos deste cliente no período:</h4>
              ${(cliente.pedidos || []).map(p => `
                <div class="enf-pedido-item">
                  <span><strong>${p.numero || "N/A"}</strong></span>
                  <span>${p.data || "N/A"}</span>
                  <span>${formatBRL(p.valor || 0)}</span>
                  <span>${p.itens || 0} itens</span>
                </div>
              `).join("") || "<div style='color:#9ca3af;font-size:12px;'>Nenhum pedido no período</div>"}
            </div>
          </td>
        `;
        tbody.appendChild(trExp);
      });

      // Bind expand/collapse
      tbody.querySelectorAll(".enf-expand-btn").forEach(btn => {
        btn.addEventListener("click", function() {
          const idx = this.getAttribute("data-idx");
          const expRow = document.getElementById(`enfRelExpand-${idx}`);
          if (expRow) {
            if (expRow.style.display === "none") {
              expRow.style.display = "";
              this.textContent = "▼";
            } else {
              expRow.style.display = "none";
              this.textContent = "▶";
            }
          }
        });
      });
    }

    // Render inicial com mock
    renderTable(mockClientes);

    // Event listeners
    document.getElementById("enfRelBtnVoltar").addEventListener("click", () => {
      overlay.remove();
      style.remove();
      // Volta para a página original do SIGE
      location.href = "https://enfoquepapelaria.meusige.com.br/sistema/Agendamentos/Report";
    });

    document.getElementById("enfRelBtnFiltrar").addEventListener("click", () => {
      const status = document.getElementById("enfRelStatus");
      status.textContent = "Buscando dados... (mock - API será integrada depois)";
      
      // Simula delay de busca
      setTimeout(() => {
        renderTable(mockClientes);
        status.textContent = `Exibindo ${mockClientes.length} clientes (dados mock)`;
      }, 500);
    });
  } catch (e) {
    console.warn("[SIGE Assistente] Erro ao injetar relatório de agendamentos:", e);
  }
}


// =============================================================
// ENFOQUE - BUSCA RAPIDA NO SIDEBAR SIGE
// Objetivo: adicionar somente um campo de busca no menu lateral,
// sem alterar visual geral, IDs, hrefs, onclicks ou estrutura funcional.
// =============================================================
(function initEnfoqueSidebarSearchOnly(){
  "use strict";

  const STYLE_ID = "enfoque-sidebar-search-only-style-v1";
  const SEARCH_ID = "enfoqueSidebarQuickSearch";

  function escapeHtml(value){
    return String(value || "").replace(/[&<>\"]/g, ch => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;"
    }[ch]));
  }

  function injectStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SEARCH_ID}{
        padding: 8px 8px 10px !important;
        margin: 0 !important;
        box-sizing: border-box !important;
        position: relative !important;
        z-index: 20 !important;
      }
      #${SEARCH_ID},
      #${SEARCH_ID} *{
        box-sizing: border-box !important;
      }
      #${SEARCH_ID} .enf-sb-searchbox{
        position: relative !important;
        width: 100% !important;
      }
      #${SEARCH_ID} input{
        width: 100% !important;
        height: 32px !important;
        margin: 0 !important;
        padding: 0 10px !important;
        border: 1px solid rgba(0,0,0,.22) !important;
        border-radius: 4px !important;
        outline: none !important;
        background: #fff !important;
        color: #333 !important;
        font-size: 12px !important;
        line-height: 32px !important;
        box-shadow: inset 0 1px 2px rgba(0,0,0,.08) !important;
      }
      #${SEARCH_ID} input:focus{
        border-color: #8dbb68 !important;
        box-shadow: 0 0 0 2px rgba(141,187,104,.22), inset 0 1px 2px rgba(0,0,0,.08) !important;
      }
      #${SEARCH_ID} .enf-sb-results{
        display: none;
        position: absolute !important;
        left: 8px !important;
        right: 8px !important;
        top: 43px !important;
        max-height: 320px !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        z-index: 999999 !important;
        background: #fff !important;
        border: 1px solid #aaa !important;
        box-shadow: 0 6px 18px rgba(0,0,0,.18) !important;
      }
      #${SEARCH_ID} .enf-sb-results.show{
        display: block !important;
      }
      #${SEARCH_ID} .enf-sb-result{
        padding: 7px 9px !important;
        border-bottom: 1px solid #e5e5e5 !important;
        color: #333 !important;
        background: #fff !important;
        font-size: 12px !important;
        line-height: 1.25 !important;
        cursor: pointer !important;
      }
      #${SEARCH_ID} .enf-sb-result:last-child{
        border-bottom: 0 !important;
      }
      #${SEARCH_ID} .enf-sb-result:hover,
      #${SEARCH_ID} .enf-sb-result:focus{
        background: #d5e8c6 !important;
        outline: none !important;
      }
      #${SEARCH_ID} .enf-sb-result-main{
        display: block !important;
        font-weight: 700 !important;
      }
      #${SEARCH_ID} .enf-sb-path{
        display: block !important;
        margin-top: 2px !important;
        color: #777 !important;
        font-size: 10px !important;
        line-height: 1.2 !important;
      }
      #${SEARCH_ID} .enf-sb-empty{
        padding: 9px !important;
        color: #666 !important;
        font-size: 12px !important;
        background: #fff !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }


  function normalizeSearchText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’'`´^~\"]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getAnchorLabel(a){
    try{
      const span = a.querySelector("span:not(.icon):not(.menuDrop)");
      return (span ? span.textContent : a.textContent || "").replace(/\s+/g, " ").trim();
    }catch(_){
      return "";
    }
  }

  function getParentPath(a){
    try{
      const parts = [];
      let currentUl = a.closest("ul");
      while (currentUl && currentUl.parentElement) {
        const parentLi = currentUl.parentElement.closest ? currentUl.parentElement.closest("li") : null;
        if (!parentLi) break;
        const parentA = parentLi.querySelector(":scope > a");
        const label = parentA ? getAnchorLabel(parentA) : "";
        if (label) parts.unshift(label);
        currentUl = parentLi.parentElement && parentLi.parentElement.closest ? parentLi.parentElement.closest("ul") : null;
      }
      return parts.slice(-2).join(" › ");
    }catch(_){
      return "";
    }
  }

  function collectMenuLinks(sidebar){
    return Array.from(sidebar.querySelectorAll("a[href]"))
      .filter(a => !a.closest(`#${SEARCH_ID}`))
      .filter(a => !a.classList.contains("menuHeader"))
      .map(a => ({
        a,
        label: getAnchorLabel(a),
        path: getParentPath(a),
        href: a.getAttribute("href") || ""
      }))
      .filter(item => item.label && item.href && item.href !== "#" && !/^javascript:/i.test(item.href));
  }

  function addSearch(sidebar){
    if (document.getElementById(SEARCH_ID)) return;

    const box = document.createElement("div");
    box.id = SEARCH_ID;
    box.innerHTML = `
      <div class="enf-sb-searchbox">
        <input type="search" autocomplete="off" placeholder="Buscar menu..." aria-label="Buscar menu" />
        <div class="enf-sb-results" role="listbox"></div>
      </div>
    `;

    const firstUl = sidebar.querySelector("ul");
    if (firstUl && firstUl.nextSibling) sidebar.insertBefore(box, firstUl.nextSibling);
    else sidebar.insertBefore(box, sidebar.firstChild);

    const input = box.querySelector("input");
    const results = box.querySelector(".enf-sb-results");

    function render(){
      const queryRaw = String(input.value || "").trim();
      const query = normalizeSearchText(queryRaw);
      results.innerHTML = "";
      if (!query) {
        results.classList.remove("show");
        return;
      }

      const links = collectMenuLinks(sidebar)
        .filter(item => normalizeSearchText(`${item.label} ${item.path}`).includes(query))
        .slice(0, 14);

      results.classList.add("show");

      if (!links.length) {
        const empty = document.createElement("div");
        empty.className = "enf-sb-empty";
        empty.textContent = "Nenhuma tela encontrada.";
        results.appendChild(empty);
        return;
      }

      links.forEach(item => {
        const row = document.createElement("div");
        row.className = "enf-sb-result";
        row.tabIndex = 0;
        row.setAttribute("role", "option");
        row.innerHTML = `
          <span class="enf-sb-result-main">${escapeHtml(item.label)}</span>
          ${item.path ? `<span class="enf-sb-path">${escapeHtml(item.path)}</span>` : ""}
        `;

        const go = () => {
          results.classList.remove("show");
          input.blur();
          try {
            item.a.click();
          } catch (_) {
            try { location.href = item.a.href; } catch(__) {}
          }
        };

        row.addEventListener("mousedown", ev => ev.preventDefault());
        row.addEventListener("click", go);
        row.addEventListener("keydown", ev => {
          if (ev.key === "Enter") go();
        });
        results.appendChild(row);
      });
    }

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("keydown", ev => {
      if (ev.key === "Escape") {
        input.value = "";
        render();
        input.blur();
      }
    });

    document.addEventListener("click", ev => {
      if (!box.contains(ev.target)) results.classList.remove("show");
    }, true);
  }

  function apply(){
    const sidebar = document.getElementById("sidebarMenu");
    if (!sidebar) return false;
    injectStyle();
    addSearch(sidebar);
    return true;
  }

  function boot(){
    apply();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (apply() || tries > 60) clearInterval(timer);
    }, 300);
    try{
      const observer = new MutationObserver(() => { try { apply(); } catch(_){} });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }catch(_){}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();


// =============================================================
// 7D. PDV - Abas laterais internas (ate 5 PDVs na mesma aba)
// =============================================================
function ensureEnfoquePdvAbasLaterais() {
  try {
    if (window.top !== window.self) return;
    if (!/\/sistema\/pdv/i.test(location.pathname || "")) return;
    if (/danfenfce/i.test(location.href || "")) return;

    if (window.__ENFOQUE_PDV_ABAS_LATERAIS__ && window.__ENFOQUE_PDV_ABAS_LATERAIS__.ready) {
      window.__ENFOQUE_PDV_ABAS_LATERAIS__.sync();
      return;
    }

    const MAX_ABAS = 5;
    const state = {
      ready: true,
      activeId: "padrao",
      abas: [{ id: "padrao", label: "PDV 1", kind: "original", iframe: null }],
      host: null,
      rail: null,
      hint: null,
      plusBtn: null,
      resizeTimer: null,
      anchorRect: null,
      preview: null,
      previewFrame: null,
      previewTimer: null,
      totalTimer: null,
    };

    window.__ENFOQUE_PDV_ABAS_LATERAIS__ = state;

    function cssText(parts) { return parts.filter(Boolean).join(";"); }

    function injectStyle() {
      if (document.getElementById("enfoque-pdv-abas-style")) return;
      const st = document.createElement("style");
      st.id = "enfoque-pdv-abas-style";
      st.textContent = `
        :root{
          --enfoque-pdv-tab-primary: #60a5fa;
          --enfoque-pdv-tab-primary20: rgba(96, 165, 250, .24);
          --enfoque-pdv-tab-secondary: #93c5fd;
          --enfoque-pdv-tab-bg: var(--bg, hsl(0, 0%, 97%));
          --enfoque-pdv-tab-text: var(--text, hsl(300 0% 4%));
          --enfoque-pdv-tab-muted: var(--text-muted, hsl(0 0% 28%));
          --enfoque-pdv-tab-border: var(--border-muted, hsl(340 0% 80%));
        }
        #enfoque-pdv-abas-host,
        #enfoque-pdv-abas-rail,
        #enfoque-pdv-abas-host * ,
        #enfoque-pdv-abas-rail * { box-sizing: border-box; }
        #enfoque-pdv-abas-rail{
          position: fixed;
          z-index: 2147483600;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          width: 46px;
          padding: 6px;
          border: 1px solid var(--enfoque-pdv-tab-border);
          border-radius: 12px;
          background: linear-gradient(180deg, #fff 0%, var(--enfoque-pdv-tab-bg) 100%);
          box-shadow: 0 14px 34px rgba(0,0,0,.22), 0 2px 5px rgba(0,0,0,.10);
          font-family: "Open Sans", Arial, sans-serif;
          user-select: none;
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-plus,
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-btn{
          width: 34px;
          min-height: 34px;
          border-radius: 10px;
          border: 1px solid var(--enfoque-pdv-tab-border);
          background: #fff;
          color: var(--enfoque-pdv-tab-text);
          cursor: pointer;
          font-weight: 900;
          line-height: 1;
          padding: 0;
          box-shadow: 0 1px 2px rgba(0,0,0,.08);
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-plus{
          font-size: 24px;
          color: #fff;
          background: linear-gradient(180deg, #93c5fd, #60a5fa);
          border-color: rgba(0,0,0,.14);
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-plus:disabled{
          opacity: .45;
          cursor: not-allowed;
          filter: grayscale(.25);
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-btn{
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--enfoque-pdv-tab-muted);
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-btn.active{
          color: #fff;
          border-color: rgba(0,0,0,.14);
          background: #60a5fa;
          box-shadow: 0 6px 14px var(--enfoque-pdv-tab-primary20);
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-close{
          position: absolute;
          right: -7px;
          top: -7px;
          width: 16px;
          height: 16px;
          border: 1px solid rgba(0,0,0,.18);
          border-radius: 999px;
          background: #fff;
          color: #9b1c1c;
          font-size: 12px;
          line-height: 12px;
          font-weight: 900;
          cursor: pointer;
          display: none;
          padding: 0;
        }
        #enfoque-pdv-abas-rail .enfoque-pdv-tab-btn:hover .enfoque-pdv-tab-close{ display:block; }
        #enfoque-pdv-abas-host{
          position: fixed;
          z-index: 2147483500;
          display: none;
          background: #fff;
          border-radius: 0;
          overflow: hidden;
          box-shadow: 0 14px 34px rgba(0,0,0,.16);
        }
        #enfoque-pdv-abas-host iframe.enfoque-pdv-tab-frame{
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          background: #fff;
          display: none;
          overflow: hidden;
        }
        #enfoque-pdv-abas-preview{
          position: fixed;
          z-index: 2147483602;
          width: 455px;
          height: 325px;
          padding: 8px;
          border-radius: 14px;
          border: 1px solid rgba(96,165,250,.45);
          background: rgba(255,255,255,.96);
          box-shadow: 0 18px 44px rgba(0,0,0,.24), 0 2px 7px rgba(0,0,0,.12);
          display: none;
          pointer-events: none;
          overflow: hidden;
          font-family: "Open Sans", Arial, sans-serif;
        }
        #enfoque-pdv-abas-preview .enfoque-pdv-preview-title{
          height: 22px;
          line-height: 20px;
          font-size: 12px;
          font-weight: 900;
          color: #2563eb;
          border-bottom: 1px solid rgba(96,165,250,.25);
          margin-bottom: 6px;
        }
        #enfoque-pdv-abas-preview iframe{
          width: 980px;
          height: 650px;
          border: 0;
          background: #fff;
          transform: scale(0.6675);
          transform-origin: top left;
          pointer-events: none;
        }
        .enfoque-pdv-total-geral-box{
          width: 100%;
          height: 100%;
          min-height: 220px;
          background: #fff !important;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          box-sizing: border-box;
          text-align: center;
          font-family: "Open Sans", Arial, sans-serif;
          color: #656a62;
        }
        .enfoque-pdv-total-geral-card{
          width: 99.8%;
          max-width: 255px;
          background-color: #cde3bc;
          border: 1px #95d064 solid;
          color: #4e9a4e;
          font-weight: bold;
          min-height: 88px;
          padding: 8px 8px 9px;
          box-sizing: border-box;
          box-shadow: none;
        }
        .enfoque-pdv-total-geral-label{
          font-size: 11px;
          line-height: 1.15;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .15px;
          color: #656a62;
          margin-bottom: 5px;
        }
        .enfoque-pdv-total-geral-value{
          font-size: 2.15em;
          line-height: 1.05;
          font-weight: bold;
          color: #4e9a4e;
          margin-bottom: 5px;
        }
        .enfoque-pdv-total-geral-help{
          max-width: 220px;
          margin: 0 auto;
          font-size: 10.5px;
          line-height: 1.25;
          font-weight: 600;
          color: #656a62;
        }
        #enfoque-pdv-abas-hint{ display:none !important; }
      `;
      document.documentElement.appendChild(st);
    }

    function getOriginalPdvElement() {
      return document.querySelector("form#content") || document.getElementById("contentWrapper") || document.getElementById("controllerPDV") || document.body;
    }

    function getPdvRect() {
      const candidates = [
        document.getElementById("contentVendas"),
        document.getElementById("controllerPDV"),
        document.getElementById("contentWrapper"),
        document.querySelector("form#content"),
      ].filter(Boolean);
      for (const el of candidates) {
        try {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          if (st.display !== "none" && r.width > 200 && r.height > 200) return r;
        } catch (_) {}
      }
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight };
    }

    function getStableAnchorRect() {
      try {
        const useCurrent = state.activeId === "padrao" || !state.anchorRect;
        if (useCurrent) {
          const r = getPdvRect();
          if (r && r.width > 200 && r.height > 200) {
            state.anchorRect = {
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom
            };
          }
        }
        return state.anchorRect || getPdvRect();
      } catch (_) {
        return getPdvRect();
      }
    }

    function placeUi() {
      try {
        const r = getStableAnchorRect();
        const safeRight = 66; // espaco reservado para a barra das linguetas
        const top = Math.max(0, Math.round(r.top));
        const rawLeft = Math.max(0, Math.round(r.left));
        const rawWidth = Math.round(r.width || 1000);
        const rawHeight = Math.round(r.height || 590);

        // O host deve acompanhar exatamente a caixa do PDV principal.
        // Nao forca 900px/1000px aqui, porque isso quebra o alinhamento do SIGE.
        const maxWidth = Math.max(620, window.innerWidth - rawLeft - safeRight - 10);
        const width = Math.max(720, Math.min(rawWidth, maxWidth));
        const maxHeight = Math.max(420, window.innerHeight - top - 10);
        const height = Math.max(520, Math.min(Math.max(rawHeight, 590), maxHeight));
        const left = Math.max(0, Math.min(rawLeft, window.innerWidth - safeRight - width - 8));

        if (state.host) {
          state.host.style.left = left + "px";
          state.host.style.top = top + "px";
          state.host.style.width = width + "px";
          state.host.style.height = height + "px";
        }

        if (state.rail) {
          const railLeft = Math.min(window.innerWidth - 52, Math.max(4, Math.round(left + width + 8)));
          const railTop = Math.max(6, Math.round(top + 24));
          state.rail.style.left = railLeft + "px";
          state.rail.style.top = railTop + "px";
        }

        try { state.abas.forEach((t) => { if (t.kind === "iframe" && t.iframe) fitIframeContent(t.iframe); }); } catch (_) {}

        if (state.hint && state.rail) {
          const rr = state.rail.getBoundingClientRect();
          state.hint.style.left = Math.max(6, Math.round(rr.left - 250)) + "px";
          state.hint.style.top = Math.round(rr.top) + "px";
        }
      } catch (_) {}
    }

    function buildBaseUrl() {
      const base = location.origin + "/sistema/pdv";
      return base + "?enfoque_pdv_aba=" + encodeURIComponent(Date.now() + "_" + Math.random().toString(16).slice(2));
    }

    function removeIframeScrollbars(iframe) {
      try {
        if (!iframe) return;
        iframe.setAttribute("scrolling", "no");
        iframe.style.overflow = "hidden";
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (!doc || !doc.documentElement) return;

        doc.documentElement.style.overflow = "hidden";
        doc.documentElement.style.margin = "0";
        doc.documentElement.style.padding = "0";
        if (doc.body) {
          doc.body.style.overflow = "hidden";
          doc.body.style.margin = "0";
          doc.body.style.padding = "0";
        }

        let st = doc.getElementById("enfoque-pdv-sem-rolagem-style");
        if (!st) {
          st = doc.createElement("style");
          st.id = "enfoque-pdv-sem-rolagem-style";
          st.textContent = `
            html, body {
              overflow: hidden !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              height: 100% !important;
              background: #fff !important;
            }
            body.enfoque-pdv-aba-interna form#content{
              transform: scale(var(--enfoque-pdv-aba-scale, 1)) !important;
              transform-origin: top left !important;
              position: relative !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              width: 1000px !important;
              min-width: 1000px !important;
              max-width: 1000px !important;
            }
            body.enfoque-pdv-aba-interna #contentWrapper,
            body.enfoque-pdv-aba-interna #controllerPDV{
              position: relative !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              width: 1000px !important;
              min-width: 1000px !important;
              max-width: 1000px !important;
              transform: none !important;
            }
            body.enfoque-pdv-aba-interna #contentVendas,
            body.enfoque-pdv-aba-interna #contentCliente,
            body.enfoque-pdv-aba-interna #contentFormasPagamento,
            body.enfoque-pdv-aba-interna #contentPagamentos,
            body.enfoque-pdv-aba-interna #contentVendaConcluida,
            body.enfoque-pdv-aba-interna #contentOperacoes{
              left: 0 !important;
              right: auto !important;
              margin-left: 0 !important;
              margin-right: 0 !important;
            }
            body.enfoque-pdv-aba-interna #sige-assistente-panel,
            body.enfoque-pdv-aba-interna #sige-assistente-toggle,
            body.enfoque-pdv-aba-interna #enfoque-pdv-abas-rail,
            body.enfoque-pdv-aba-interna #enfoque-pdv-abas-host,
            body.enfoque-pdv-aba-interna #enfoque-pdv-abas-preview{
              display: none !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
            #contentVendas, #contentCliente, #contentFormasPagamento, #contentPagamentos, #contentVendaConcluida, #contentOperacoes {
              max-width: none !important;
              overflow: visible !important;
            }
          `;
          (doc.head || doc.documentElement).appendChild(st);
        }
        if (doc.body) doc.body.classList.add("enfoque-pdv-aba-interna");
        fitIframeContent(iframe);
      } catch (_) {}
    }

    function fitIframeContent(iframe) {
      try {
        if (!iframe || !state.host) return;
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        if (!doc || !doc.body) return;
        const hostW = Math.max(600, state.host.clientWidth || 1000);
        const hostH = Math.max(420, state.host.clientHeight || 640);

        // O PDV do SIGE foi desenhado para cerca de 1000px.
        // Nao usamos scrollWidth do body aqui porque outras extensoes/painel podem inflar
        // essa medida e empurrar o PDV para a direita dentro do iframe.
        const naturalW = 1000;
        let naturalH = 620;
        ["contentVendas", "contentCliente", "contentFormasPagamento", "contentPagamentos", "contentVendaConcluida", "contentOperacoes"]
          .map((id) => doc.getElementById(id))
          .filter(Boolean)
          .filter((el) => {
            try { return ((doc.defaultView || window).getComputedStyle(el).display !== "none"); } catch (_) { return true; }
          })
          .forEach((el) => {
            const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            naturalH = Math.max(naturalH, el.offsetHeight || 0, rect ? rect.height : 0);
          });
        naturalH += 10;

        let scale = Math.min(1, hostW / naturalW, hostH / naturalH);
        // Mantem o PDV inteiro visivel sem distorcer demais. Evita recortes na tela de pagamento.
        scale = Math.max(0.86, Math.min(1, scale));
        doc.documentElement.style.setProperty("--enfoque-pdv-aba-scale", String(scale));
        doc.body.style.setProperty("--enfoque-pdv-aba-scale", String(scale));
        doc.documentElement.scrollLeft = 0;
        doc.documentElement.scrollTop = 0;
        doc.body.scrollLeft = 0;
        doc.body.scrollTop = 0;
        const content = doc.querySelector("form#content");
        if (content) {
          content.style.left = "0px";
          content.style.top = "0px";
          content.style.margin = "0px";
          content.style.width = "1000px";
          content.style.minWidth = "1000px";
          content.style.maxWidth = "1000px";
        }
        ["contentWrapper", "controllerPDV", "contentVendas", "contentCliente", "contentFormasPagamento", "contentPagamentos", "contentVendaConcluida", "contentOperacoes"].forEach((id) => {
          const el = doc.getElementById(id);
          if (!el) return;
          el.style.left = "0px";
          el.style.right = "auto";
          el.style.marginLeft = "0px";
          el.style.marginRight = "0px";
        });
      } catch (_) {}
    }

    function ensureHost() {
      injectStyle();
      let host = document.getElementById("enfoque-pdv-abas-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "enfoque-pdv-abas-host";
        document.body.appendChild(host);
      }
      state.host = host;

      let rail = document.getElementById("enfoque-pdv-abas-rail");
      if (!rail) {
        rail = document.createElement("div");
        rail.id = "enfoque-pdv-abas-rail";
        rail.setAttribute("aria-label", "Abas internas do PDV");
        document.body.appendChild(rail);
      }
      state.rail = rail;

      let hint = document.getElementById("enfoque-pdv-abas-hint");
      if (!hint) {
        hint = document.createElement("div");
        hint.id = "enfoque-pdv-abas-hint";
        document.body.appendChild(hint);
      }
      state.hint = hint;
      try { hint.style.display = "none"; } catch (_) {}

      let preview = document.getElementById("enfoque-pdv-abas-preview");
      if (!preview) {
        preview = document.createElement("div");
        preview.id = "enfoque-pdv-abas-preview";
        preview.innerHTML = '<div class="enfoque-pdv-preview-title">Preview do PDV</div><iframe tabindex="-1" aria-hidden="true"></iframe>';
        document.body.appendChild(preview);
      }
      state.preview = preview;
      state.previewFrame = preview.querySelector("iframe");

      placeUi();
    }

    function parseMoneyValue(text) {
      try {
        let raw = String(text || "").replace(/\s+/g, "").replace(/R\$/gi, "");
        if (!raw) return 0;
        raw = raw.replace(/[^0-9,.-]/g, "");
        if (raw.indexOf(",") >= 0) raw = raw.replace(/\./g, "").replace(",", ".");
        const n = parseFloat(raw);
        return isFinite(n) ? n : 0;
      } catch (_) { return 0; }
    }

    function formatBRL(n) {
      try { return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      catch (_) { return "0,00"; }
    }

    function injectTotalBoxStyleToDoc(doc) {
      try {
        if (!doc || !doc.createElement) return;
        if (doc.getElementById("enfoque-pdv-total-geral-style")) return;
        const st = doc.createElement("style");
        st.id = "enfoque-pdv-total-geral-style";
        st.textContent = `
          .enfoque-pdv-total-geral-box{
            width: 100%;
            height: 100%;
            min-height: 220px;
            background: #fff !important;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px;
            box-sizing: border-box;
            text-align: center;
            font-family: "Open Sans", Arial, sans-serif;
            color: #656a62;
          }
          .enfoque-pdv-total-geral-card{
            width: 99.8%;
            max-width: 255px;
            background-color: #cde3bc;
            border: 1px #95d064 solid;
            color: #4e9a4e;
            font-weight: bold;
            min-height: 88px;
            padding: 8px 8px 9px;
            box-sizing: border-box;
            box-shadow: none;
          }
          .enfoque-pdv-total-geral-label{
            font-size: 11px;
            line-height: 1.15;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: .15px;
            color: #656a62;
            margin-bottom: 5px;
          }
          .enfoque-pdv-total-geral-value{
            font-size: 2.15em;
            line-height: 1.05;
            font-weight: bold;
            color: #4e9a4e;
            margin-bottom: 5px;
          }
          .enfoque-pdv-total-geral-help{
            max-width: 220px;
            margin: 0 auto;
            font-size: 10.5px;
            line-height: 1.25;
            font-weight: 600;
            color: #656a62;
          }
        `;
        (doc.head || doc.documentElement || doc.body).appendChild(st);
      } catch (_) {}
    }

    function getDocForTab(tab) {
      try {
        if (!tab || tab.kind === "original") return document;
        return tab.iframe && (tab.iframe.contentDocument || (tab.iframe.contentWindow && tab.iframe.contentWindow.document));
      } catch (_) { return null; }
    }

    function isElementVisibleDeep(el, doc) {
      try {
        if (!el) return false;
        const win = (doc && doc.defaultView) || window;
        let cur = el;
        while (cur && cur.nodeType === 1) {
          const st = win.getComputedStyle(cur);
          if (!st || st.display === "none" || st.visibility === "hidden") return false;
          cur = cur.parentElement;
        }
        return true;
      } catch (_) { return true; }
    }

    function getTabTotal(tab) {
      const doc = getDocForTab(tab);
      if (!doc) return 0;
      const ordered = [];
      try {
        const vendas = doc.getElementById("contentVendas");
        if (vendas) {
          const mainTotal = vendas.querySelector("#produtosVendas #totalPedido") || vendas.querySelector("#totalPedido");
          if (mainTotal) ordered.push(mainTotal);
        }
        const pagamentos = doc.getElementById("contentPagamentos");
        if (pagamentos) {
          const payTotal = pagamentos.querySelector("#totalPagamento #totalPedido") || pagamentos.querySelector("#totalPedido");
          if (payTotal) ordered.push(payTotal);
        }
        Array.from(doc.querySelectorAll("#totalPedido")).forEach((el) => { if (!ordered.includes(el)) ordered.push(el); });
      } catch (_) {}
      for (const el of ordered) {
        try {
          if (isElementVisibleDeep(el, doc)) return parseMoneyValue(el.textContent || el.innerText || "0");
        } catch (_) {}
      }
      for (const el of ordered) {
        try {
          const v = parseMoneyValue(el.textContent || el.innerText || "0");
          if (v > 0) return v;
        } catch (_) {}
      }
      return 0;
    }

    function getTotalGeral() {
      return state.abas.reduce((sum, tab) => sum + getTabTotal(tab), 0);
    }

    function applyTotalBoxToDoc(doc, totalTexto) {
      try {
        if (!doc || !doc.querySelector) return;
        injectTotalBoxStyleToDoc(doc);
        const img = doc.getElementById("imgProduto");
        if (!img) return;
        img.style.background = "#fff";
        img.style.backgroundImage = "none";
        img.style.backgroundColor = "#fff";
        img.style.backgroundPosition = "center center";
        img.style.backgroundRepeat = "no-repeat";
        let box = img.querySelector(".enfoque-pdv-total-geral-box");
        if (!box) {
          img.innerHTML = "";
          box = doc.createElement("div");
          box.className = "enfoque-pdv-total-geral-box";
          box.innerHTML = '<div class="enfoque-pdv-total-geral-card"><div class="enfoque-pdv-total-geral-label">Total geral dos PDVs</div><div class="enfoque-pdv-total-geral-value">R$ <span>0,00</span></div><div class="enfoque-pdv-total-geral-help">Soma automática das vendas abertas em todas as linguetas laterais.</div></div>';
          img.appendChild(box);
        }
        // Garantia por inline style: deixa a aparência igual na aba padrão e nas abas carregadas em iframe.
        box.setAttribute("style", "width:100%;height:100%;min-height:220px;background:#fff!important;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;text-align:center;font-family:'Open Sans',Arial,sans-serif;color:#656a62;");
        const card = box.querySelector(".enfoque-pdv-total-geral-card");
        if (card) card.setAttribute("style", "width:99.8%;max-width:255px;background-color:#cde3bc;border:1px #95d064 solid;color:#4e9a4e;font-weight:bold;min-height:88px;padding:8px 8px 9px;box-sizing:border-box;box-shadow:none;");
        const label = box.querySelector(".enfoque-pdv-total-geral-label");
        if (label) label.setAttribute("style", "font-size:11px;line-height:1.15;font-weight:800;text-transform:uppercase;letter-spacing:.15px;color:#656a62;margin-bottom:5px;");
        const value = box.querySelector(".enfoque-pdv-total-geral-value");
        if (value) value.setAttribute("style", "font-size:2.15em;line-height:1.05;font-weight:bold;color:#4e9a4e;margin-bottom:5px;");
        const help = box.querySelector(".enfoque-pdv-total-geral-help");
        if (help) help.setAttribute("style", "max-width:220px;margin:0 auto;font-size:10.5px;line-height:1.25;font-weight:600;color:#656a62;");
        const val = box.querySelector(".enfoque-pdv-total-geral-value span");
        if (val) val.textContent = totalTexto || "0,00";
      } catch (_) {}
    }

    function updateTotalBoxes() {
      try {
        const totalTexto = formatBRL(getTotalGeral());
        state.totalGeralTexto = totalTexto;
        try { window.__ENFOQUE_PDV_TOTAL_GERAL_TEXTO__ = totalTexto; } catch (_) {}
        try { sessionStorage.setItem("enfoque_pdv_total_geral_texto", totalTexto); } catch (_) {}
        state.abas.forEach((tab) => applyTotalBoxToDoc(getDocForTab(tab), totalTexto));
      } catch (_) {}
    }

    function writePreview(tab) {
      try {
        if (!state.previewFrame) return;
        updateTotalBoxes();
        const srcDoc = getDocForTab(tab);
        const dst = state.previewFrame.contentDocument || (state.previewFrame.contentWindow && state.previewFrame.contentWindow.document);
        if (!srcDoc || !dst || !srcDoc.documentElement) return;
        const headHtml = srcDoc.head ? srcDoc.head.innerHTML : "";
        const bodyHtml = srcDoc.body ? srcDoc.body.innerHTML : srcDoc.documentElement.outerHTML;
        const cleanedHead = String(headHtml)
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<base\b[^>]*>/gi, "");
        const cleanedBody = String(bodyHtml)
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
          .replace(/id=["']enfoque-pdv-abas-rail["'][\s\S]*?<\/div>/gi, "");
        const css = `
          html,body{overflow:hidden!important;margin:0!important;padding:0!important;background:#fff!important;width:100%!important;height:100%!important;}
          *{pointer-events:none!important;}
          #enfoque-pdv-abas-rail,#enfoque-pdv-abas-host,#enfoque-pdv-abas-preview,#enfoque-pdv-abas-hint{display:none!important;}
          body{transform:scale(0.6675)!important;transform-origin:top left!important;width:980px!important;height:650px!important;}
          form#content,#contentWrapper,#controllerPDV,#contentVendas,#contentVendas .main{overflow:hidden!important;visibility:visible!important;opacity:1!important;display:block!important;}
          form#content{position:static!important;margin:0!important;pointer-events:none!important;}
          #contentWrapper,#controllerPDV{margin:0!important;left:0!important;top:0!important;}
          [style*="visibility: hidden"],[style*="visibility:hidden"]{visibility:visible!important;}
        `;
        dst.open();
        dst.write('<!doctype html><html><head><base href="' + location.origin + '/sistema/">' + cleanedHead + '<style>' + css + '</style></head><body>' + cleanedBody + '</body></html>');
        dst.close();
      } catch (_) {}
    }

    function showPreview(tab, btn) {
      try {
        if (!state.preview || !tab || !btn) return;
        const r = btn.getBoundingClientRect();
        const previewW = 455;
        const previewH = 325;
        const left = Math.max(6, Math.min(window.innerWidth - previewW - 8, Math.round(r.left - previewW - 12)));
        const top = Math.max(6, Math.min(window.innerHeight - previewH - 8, Math.round(r.top - 58)));
        state.preview.style.left = left + "px";
        state.preview.style.top = top + "px";
        const title = state.preview.querySelector(".enfoque-pdv-preview-title");
        if (title) title.textContent = "Preview - " + (tab.label || "PDV");
        state.preview.style.display = "block";
        writePreview(tab);
        clearInterval(state.previewTimer);
        state.previewTimer = setInterval(() => writePreview(tab), 700);
      } catch (_) {}
    }

    function hidePreview() {
      try {
        clearInterval(state.previewTimer);
        state.previewTimer = null;
        if (state.preview) state.preview.style.display = "none";
      } catch (_) {}
    }

    function tabNumber(tab) {
      const n = state.abas.indexOf(tab) + 1;
      return n > 0 ? n : 1;
    }

    function renderRail() {
      ensureHost();
      const rail = state.rail;
      rail.innerHTML = "";

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "enfoque-pdv-tab-plus";
      plus.textContent = "+";
      plus.removeAttribute("title");
      plus.disabled = state.abas.length >= MAX_ABAS;
      plus.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        createTab();
      }, true);
      rail.appendChild(plus);
      state.plusBtn = plus;

      state.abas.forEach((tab) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "enfoque-pdv-tab-btn" + (tab.id === state.activeId ? " active" : "");
        btn.textContent = String(tabNumber(tab));
        btn.removeAttribute("title");
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          hidePreview();
          activateTab(tab.id);
        }, true);
        btn.addEventListener("mouseenter", () => showPreview(tab, btn), true);
        btn.addEventListener("mouseleave", hidePreview, true);

        if (tab.kind === "iframe") {
          const close = document.createElement("button");
          close.type = "button";
          close.className = "enfoque-pdv-tab-close";
          close.textContent = "×";
          close.removeAttribute("title");
          close.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            closeTab(tab.id);
          }, true);
          btn.appendChild(close);
        }

        rail.appendChild(btn);
      });
      placeUi();
      updateTotalBoxes();
    }

    function createTab() {
      if (state.abas.length >= MAX_ABAS) return;
      ensureHost();
      const id = "pdv_" + Date.now() + "_" + Math.random().toString(16).slice(2);
      const label = "PDV " + (state.abas.length + 1);
      const iframe = document.createElement("iframe");
      iframe.className = "enfoque-pdv-tab-frame";
      iframe.setAttribute("title", label);
      iframe.setAttribute("data-enfoque-pdv-tab", id);
      iframe.setAttribute("scrolling", "no");
      iframe.addEventListener("load", () => {
        removeIframeScrollbars(iframe);
        setTimeout(() => removeIframeScrollbars(iframe), 250);
        setTimeout(() => removeIframeScrollbars(iframe), 900);
        setTimeout(() => fitIframeContent(iframe), 1300);
        setTimeout(updateTotalBoxes, 300);
        setTimeout(updateTotalBoxes, 1000);
      }, true);
      iframe.src = buildBaseUrl();
      state.host.appendChild(iframe);
      state.abas.push({ id, label, kind: "iframe", iframe });
      renderRail();
      activateTab(id);
    }

    function closeTab(id) {
      const idx = state.abas.findIndex((t) => t.id === id && t.kind === "iframe");
      if (idx < 0) return;
      const wasActive = state.activeId === id;
      const tab = state.abas[idx];
      try { if (tab.iframe) tab.iframe.remove(); } catch (_) {}
      updateTotalBoxes();
      state.abas.splice(idx, 1);
      state.abas.forEach((t, i) => { t.label = "PDV " + (i + 1); });
      if (wasActive) {
        const next = state.abas[Math.max(0, idx - 1)] || state.abas[0];
        state.activeId = next ? next.id : "padrao";
      }
      renderRail();
      activateTab(state.activeId);
    }

    function activateTab(id) {
      ensureHost();
      const tab = state.abas.find((t) => t.id === id) || state.abas[0];
      if (!tab) return;
      state.activeId = tab.id;

      const original = getOriginalPdvElement();
      const useIframe = tab.kind === "iframe";
      if (original) {
        original.style.visibility = useIframe ? "hidden" : "";
        original.style.pointerEvents = useIframe ? "none" : "";
      }

      if (state.host) state.host.style.display = useIframe ? "block" : "none";
      state.abas.forEach((t) => {
        if (t.kind === "iframe" && t.iframe) {
          t.iframe.style.display = t.id === tab.id ? "block" : "none";
        }
      });

      renderRail();
      placeUi();
      updateTotalBoxes();
      try {
        if (useIframe && tab.iframe) { removeIframeScrollbars(tab.iframe); fitIframeContent(tab.iframe); }
        // V9: removido foco automatico em qualquer campo ao trocar/ativar abas do PDV.
      } catch (_) {}
    }

    state.sync = function sync() {
      if (!/\/sistema\/pdv/i.test(location.pathname || "")) {
        try { if (state.rail) state.rail.style.display = "none"; } catch (_) {}
        try { if (state.host) state.host.style.display = "none"; } catch (_) {}
        try {
          const original = getOriginalPdvElement();
          if (original) { original.style.visibility = ""; original.style.pointerEvents = ""; }
        } catch (_) {}
        return;
      }
      ensureHost();
      state.rail.style.display = "flex";
      renderRail();
      activateTab(state.activeId || "padrao");
      updateTotalBoxes();
    };

    ensureHost();
    renderRail();
    activateTab(state.activeId);
    updateTotalBoxes();
    clearInterval(state.totalTimer);
    state.totalTimer = setInterval(() => { updateTotalBoxes(); }, 800);

    window.addEventListener("resize", () => {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => { placeUi(); try { state.abas.forEach((t) => { if (t.kind === "iframe" && t.iframe) fitIframeContent(t.iframe); }); } catch (_) {} }, 80);
    }, true);
    window.addEventListener("scroll", () => {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => { placeUi(); try { state.abas.forEach((t) => { if (t.kind === "iframe" && t.iframe) fitIframeContent(t.iframe); }); } catch (_) {} }, 80);
    }, true);

    try {
      const mo = new MutationObserver(() => { try { placeUi(); } catch (_) {} });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
      state.mo = mo;
    } catch (_) {}
  } catch (e) {
    try { console.warn("[Enfoque PDV] Falha ao criar abas laterais:", e); } catch (_) {}
  }
}

setInterval(() => {
  try { ensureEnfoquePdvAbasLaterais(); } catch (_) {}
}, 1200);


// ===== Enfoque - cadastro de escola em Pessoas/Clientes e busca escolar no PDV =====
(function initEnfoqueEscolaClientes() {
  "use strict";

  const FEATURE_ID = "enfoque-escola-pessoa-v1";
  const SCHOOL_API_URL = "http://187.77.224.66:3317/api/schools/customers";
  const SAVE_BUTTON_IDS = ["btnSALVAR", "btnSALVARPermanecer"];
  let pessoaLookupTimer = null;
  let pessoaLastLookupDocument = "";
  let pdvSearchTimer = null;
  let pdvLastSearchQuery = "";
  let pdvSelectedCustomer = null;
  let pdvDiscountVisualTimers = [];
  let pdvDiscountVisualLastKey = "";
  let pessoaInitialLookupUntil = 0;
  let pessoaSchoolSuggestTimer = null;
  let pessoaSelectedOfficialSchool = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function valueOf(id) {
    const el = byId(id);
    if (!el) return "";
    return String(el.value || "").trim();
  }

  function cleanText(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function onlyDigits(value) {
    return cleanText(value).replace(/\D+/g, "");
  }

  function isPessoaEditPage() {
    return /\/sistema\/Pessoas\/Edit/i.test(location.pathname || "");
  }

  function isPdvPage() {
    return /\/sistema\/pdv/i.test(location.pathname || "");
  }

  function getTipoPessoaText() {
    const select = byId("TipoPessoa");
    if (!select) return "";
    const option = select.options && select.options[select.selectedIndex];
    return cleanText((option && option.textContent) || select.value || "");
  }

  function buildPessoaPayload() {
    return {
      nome: valueOf("NomeFantasia"),
      cnpj_ou_cpf: valueOf("CNPJ_CPF") || cleanText((document.querySelector('input[ng-model="pessoa.CNPJ_CPF"], input[ng-model="pessoa.CPFCNPJ"], input[name*="CNPJ"], input[id*="CPF"]') || {}).value),
      email_geral: valueOf("Email"),
      telefone: valueOf("Telefone"),
      escola: valueOf("enfoqueEscolaPessoaNome"),
      tipo_pessoa: getTipoPessoaText(),
      origem: "meusige-pessoas-edit",
      pagina_url: location.href,
      capturado_em: new Date().toISOString(),
    };
  }

  function buildPessoaPayloadFromSige(pessoaSige) {
    pessoaSige = pessoaSige && typeof pessoaSige === "object" ? pessoaSige : {};
    const base = buildPessoaPayload();
    return {
      ...base,
      nome: cleanText(pessoaSige.NomeFantasia || pessoaSige.RazaoSocial || pessoaSige.Nome || base.nome),
      cnpj_ou_cpf: cleanText(pessoaSige.CNPJ_CPF || pessoaSige.CPFCNPJ || pessoaSige.CPF || pessoaSige.CNPJ || base.cnpj_ou_cpf),
      email_geral: cleanText(pessoaSige.Email || pessoaSige.EmailFaturamento || pessoaSige.EmailComercial || base.email_geral),
      telefone: cleanText(pessoaSige.Telefone || pessoaSige.Celular || base.telefone),
      sige_pessoa_id: cleanText(pessoaSige.Id || pessoaSige.ArquivoTemporario || pessoaSige.PessoaID || pessoaSige.PessoaId),
      pessoa_fisica: Boolean(pessoaSige.PessoaFisica),
      data_nascimento: cleanText(pessoaSige.DataNascimento),
      logradouro: cleanText(pessoaSige.Logradouro),
      logradouro_numero: cleanText(pessoaSige.LogradouroNumero),
      complemento: cleanText(pessoaSige.Complemento),
      bairro: cleanText(pessoaSige.Bairro),
      cep: cleanText(pessoaSige.CEP),
      cidade: cleanText(pessoaSige.Cidade),
      uf: cleanText(pessoaSige.UF),
      codigo_municipio: cleanText(pessoaSige.CodigoMunicipio),
      codigo_uf: cleanText(pessoaSige.CodigoUF),
      entrega_logradouro: cleanText(pessoaSige.EntregaLogradouro),
      entrega_logradouro_numero: cleanText(pessoaSige.EntregaLogradouroNumero),
      entrega_complemento: cleanText(pessoaSige.EntregaComplemento),
      entrega_bairro: cleanText(pessoaSige.EntregaBairro),
      entrega_cep: cleanText(pessoaSige.EntregaCEP),
      entrega_cidade: cleanText(pessoaSige.EntregaCidade),
      entrega_uf: cleanText(pessoaSige.EntregaUF),
      sige_pessoa_payload: pessoaSige,
      origem: "meusige-pessoas-ajax-save",
      capturado_em: new Date().toISOString(),
    };
  }

  function installPessoaAjaxSaveBridge() {
    if (window.__enfoquePessoaAjaxSaveBridgeInstalled) return;
    window.__enfoquePessoaAjaxSaveBridgeInstalled = true;

    window.addEventListener("message", async (event) => {
      try {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.type !== "ENFOQUE_PESSOA_SAVE_PAYLOAD") return;
        if (!isPessoaEditPage()) return;

        const check = byId("enfoqueEscolaPessoaCheck");
        if (!check || !check.checked) return;

        if (!isPessoaSchoolSelectionValid()) {
          setPessoaStatus("SIGE salvou, mas a escola não foi enviada: selecione uma escola oficial da lista.", "error");
          return;
        }

        const payload = { ...buildPessoaPayloadFromSige(data.pessoa || data.payload || {}), ...getPessoaSelectedSchoolPayload() };
        if (!payload.escola) payload.escola = valueOf("enfoqueEscolaPessoaNome");
        if (!payload.escola) return;

        setPessoaStatus("Enviando escola + ID SIGE...", "info");
        await apiSaveSchoolCustomer(payload);
        setPessoaStatus(payload.sige_pessoa_id ? "Escola enviada com ID SIGE." : "Escola enviada sem ID SIGE.", "ok");
      } catch (error) {
        console.warn("[Enfoque Escola] Falha ao salvar payload completo da pessoa:", error);
        setPessoaStatus("SIGE salvou, mas falhou envio extra da escola.", "error");
      }
    }, false);
  }

  function setPessoaStatus(text, kind) {
    const status = byId("enfoqueEscolaPessoaStatus");
    if (!status) return;
    status.textContent = text || "";
    status.style.color = kind === "error" ? "#b94a48" : kind === "ok" ? "#468847" : "#666";
  }

  function sendExtensionMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
          reject(new Error("chrome.runtime indisponivel"));
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message || String(lastError)));
            return;
          }
          if (!response || response.ok !== true) {
            reject(new Error((response && response.error) || "Resposta invalida da extensao"));
            return;
          }
          resolve(response.data);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function apiSaveSchoolCustomer(payload) {
    try {
      return await sendExtensionMessage({ type: "enfoque-school-customer-save", payload });
    } catch (error) {
      const body = JSON.stringify(payload || {});
      const response = await fetch(SCHOOL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: body.length < 60000,
      });
      if (!response.ok) throw new Error("Servidor respondeu HTTP " + response.status);
      return response.json().catch(() => ({ ok: true }));
    }
  }

  async function apiLookupSchoolCustomer(documentValue) {
    const doc = onlyDigits(documentValue);
    if (!doc) return null;
    try {
      const data = await sendExtensionMessage({ type: "enfoque-school-customer-lookup", document: doc });
      return data && data.found ? data.data : null;
    } catch (error) {
      const response = await fetch(SCHOOL_API_URL + "/lookup?document=" + encodeURIComponent(doc));
      if (!response.ok) throw new Error("Servidor respondeu HTTP " + response.status);
      const data = await response.json();
      return data && data.found ? data.data : null;
    }
  }

  async function apiSearchSchoolCustomers(query, limit) {
    const q = cleanText(query);
    if (!q) return [];
    try {
      const data = await sendExtensionMessage({ type: "enfoque-school-customer-search", query: q, limit: limit || 12 });
      return Array.isArray(data && data.data) ? data.data : [];
    } catch (error) {
      const response = await fetch(SCHOOL_API_URL + "/search?q=" + encodeURIComponent(q) + "&limit=" + encodeURIComponent(limit || 12));
      if (!response.ok) throw new Error("Servidor respondeu HTTP " + response.status);
      const data = await response.json();
      return Array.isArray(data && data.data) ? data.data : [];
    }
  }
  async function apiSearchOfficialSchools(query, limit) {
    const q = cleanText(query);
    if (!q) return [];
    try {
      const data = await sendExtensionMessage({ type: "enfoque-official-school-search", query: q, limit: limit || 12 });
      return Array.isArray(data && data.data) ? data.data : [];
    } catch (error) {
      const response = await fetch(SCHOOL_API_URL.replace(/\/api\/schools\/customers$/, "") + "/api/intranet/escolas-descontos/search?q=" + encodeURIComponent(q) + "&limit=" + encodeURIComponent(limit || 12));
      if (!response.ok) throw new Error("Servidor respondeu HTTP " + response.status);
      const data = await response.json();
      return Array.isArray(data && data.data) ? data.data : [];
    }
  }

  async function apiValidateSchoolDiscountPassword(password) {
    const senha = cleanText(password);
    if (!senha) return { ok: false, valida: false, error: "Senha vazia." };
    try {
      return await sendExtensionMessage({ type: "enfoque-school-discount-password-validate", senha });
    } catch (error) {
      const response = await fetch(SCHOOL_API_URL.replace(/\/api\/schools\/customers$/, "") + "/api/intranet/escolas-descontos/senha/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ senha })
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, ...data };
    }
  }



  function showEnfoqueSimpleModal(options) {
    options = options || {};
    return new Promise((resolve) => {
      const old = document.getElementById('enfoque-school-password-modal-overlay');
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.id = 'enfoque-school-password-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;';
      const box = document.createElement('div');
      box.style.cssText = 'width:360px;max-width:calc(100vw - 30px);background:#ffffff;border-radius:16px;box-shadow:0 22px 70px rgba(0,0,0,.35);border:1px solid rgba(15,23,42,.12);overflow:hidden;color:#0f172a;';
      const head = document.createElement('div');
      head.style.cssText = 'padding:14px 16px;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;font-weight:800;font-size:15px;';
      head.textContent = options.title || 'Enfoque';
      const body = document.createElement('div');
      body.style.cssText = 'padding:16px;';
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:13px;line-height:1.35;color:#334155;margin-bottom:12px;';
      msg.textContent = options.message || '';
      body.appendChild(msg);
      const status = document.createElement('div');
      status.style.cssText = 'display:none;margin-top:10px;font-size:12px;line-height:1.3;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:10px;padding:8px 10px;';
      let input = null;
      if (options.input) {
        input = document.createElement('input');
        input.type = options.inputType || 'text';
        input.autocomplete = 'off';
        input.placeholder = options.placeholder || '';
        input.style.cssText = 'width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;';
        input.addEventListener('focus', () => { input.style.borderColor = '#2563eb'; input.style.boxShadow = '0 0 0 3px rgba(37,99,235,.16)'; });
        input.addEventListener('blur', () => { input.style.borderColor = '#cbd5e1'; input.style.boxShadow = 'none'; });
        body.appendChild(input);
      }
      body.appendChild(status);
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:0 16px 16px;';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = options.cancelText || 'Cancelar';
      cancel.style.cssText = 'border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer;';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = options.okText || 'Confirmar';
      ok.style.cssText = 'border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer;';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      box.appendChild(head);
      box.appendChild(body);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const close = (value) => { overlay.remove(); resolve(value); };
      cancel.addEventListener('click', () => close(null));
      overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) close(null); });
      ok.addEventListener('click', () => {
        if (options.input) {
          const value = input ? input.value : '';
          if (options.required && !cleanText(value)) {
            status.textContent = options.requiredMessage || 'Preencha o campo.';
            status.style.display = 'block';
            if (input) input.focus();
            return;
          }
          close(value);
          return;
        }
        close(true);
      });
      if (input) {
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); ok.click(); }
          if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
        });
        setTimeout(() => input.focus(), 40);
      }
    });
  }

  function showEnfoqueNoticeModal(title, message) {
    return showEnfoqueSimpleModal({ title, message, okText: 'OK', cancelText: 'Fechar' });
  }

  async function requestPessoaSchoolPassword() {
    const check = byId("enfoqueEscolaPessoaCheck");
    const senha = window.prompt("Digite a senha para liberar o campo Escolas Parceiras:");
    if (senha === null) {
      if (check) check.checked = false;
      setPessoaStatus("Campo Escolas Parceiras não liberado: senha cancelada.", "error");
      return false;
    }
    if (!cleanText(senha)) {
      if (check) check.checked = false;
      setPessoaStatus("Campo Escolas Parceiras não liberado: senha vazia.", "error");
      return false;
    }

    setPessoaStatus("Validando senha...", "info");
    try {
      const result = await apiValidateSchoolDiscountPassword(senha);
      if (result && result.valida === true) {
        setPessoaStatus("Senha validada. Selecione a escola oficial.", "ok");
        return true;
      }
      if (check) check.checked = false;
      const msg = result && result.configurada === false
        ? "Senha de descontos escolares ainda não cadastrada na intranet."
        : "Senha incorreta. Campo Escolas Parceiras não liberado.";
      setPessoaStatus(msg, "error");
      return false;
    } catch (error) {
      if (check) check.checked = false;
      setPessoaStatus("Falha ao validar senha na intranet/backend.", "error");
      console.warn("[Enfoque Escola] Falha ao validar senha escolar:", error);
      return false;
    }
  }


  async function requestPdvSchoolPassword() {
    const toggle = byId("enfoquePdvClienteEscolasToggle");
    const senha = await showEnfoqueSimpleModal({
      title: "Liberar Escolas Parceiras no PDV",
      message: "Digite a senha de descontos escolares para liberar a busca de clientes de Escolas Parceiras.",
      input: true,
      inputType: "password",
      placeholder: "Senha",
      required: true,
      requiredMessage: "Digite a senha para continuar.",
      okText: "Liberar",
      cancelText: "Cancelar"
    });
    if (senha === null) {
      if (toggle) toggle.checked = false;
      return false;
    }

    try {
      const result = await apiValidateSchoolDiscountPassword(senha);
      if (result && result.valida === true) return true;
      if (toggle) toggle.checked = false;
      const msg = result && result.configurada === false
        ? "Senha de descontos escolares ainda não cadastrada na intranet."
        : "Senha incorreta. O campo Escolas Parceiras não foi liberado.";
      await showEnfoqueNoticeModal("Escolas Parceiras bloqueado", msg);
      return false;
    } catch (error) {
      if (toggle) toggle.checked = false;
      console.warn("[Enfoque Escola PDV] Falha ao validar senha escolar:", error);
      await showEnfoqueNoticeModal("Falha ao validar senha", "Não foi possível validar a senha na intranet/backend. O campo Escolas Parceiras não foi liberado.");
      return false;
    }
  }

  function getPessoaSelectedSchoolPayload() {
    const school = pessoaSelectedOfficialSchool && typeof pessoaSelectedOfficialSchool === "object" ? pessoaSelectedOfficialSchool : null;
    if (!school) return {};
    return {
      escola: cleanText(school.nome || school.name || school.escola || valueOf("enfoqueEscolaPessoaNome")),
      escola_id: cleanText(school.id || school.escola_id || school.codigo),
      escola_desconto_percentual: Number(school.desconto_percentual ?? school.escola_desconto_percentual ?? school.desconto ?? 0) || 0,
      escola_payload: school
    };
  }

  function isPessoaSchoolSelectionValid() {
    const check = byId("enfoqueEscolaPessoaCheck");
    if (!check || !check.checked) return true;
    const typed = cleanText(valueOf("enfoqueEscolaPessoaNome"));
    const school = pessoaSelectedOfficialSchool;
    if (!typed || !school) return false;
    const selectedName = cleanText(school.nome || school.name || school.escola);
    return Boolean(cleanText(school.id || school.escola_id || school.codigo) && selectedName && selectedName.toLowerCase() === typed.toLowerCase());
  }

  function clearPessoaSelectedSchool() {
    pessoaSelectedOfficialSchool = null;
    const input = byId("enfoqueEscolaPessoaNome");
    if (input) {
      delete input.dataset.escolaId;
      delete input.dataset.escolaDescontoPercentual;
    }
  }

  function ensurePessoaStyles() {
    if (byId("enfoqueEscolaPessoaStyle")) return;
    const style = document.createElement("style");
    style.id = "enfoqueEscolaPessoaStyle";
    style.textContent = `
      #${FEATURE_ID} .enfoque-escola-check-wrap{display:inline-flex;align-items:center;gap:7px;margin-top:4px;}
      #${FEATURE_ID} .enfoque-escola-check-wrap input{margin:0;}
      #${FEATURE_ID} #enfoqueEscolaPessoaCampo{margin-top:8px;}
      #${FEATURE_ID} #enfoqueEscolaPessoaStatus{display:inline-block;margin-left:8px;font-size:11px;vertical-align:middle;}
      #${FEATURE_ID} .enfoque-escola-input-wrap{position:relative;display:inline-block;}
      #${FEATURE_ID} #enfoqueEscolaPessoaNome{width:260px;}
      #${FEATURE_ID} #enfoqueEscolaPessoaSuggestions{display:none;position:absolute;left:0;top:25px;width:320px;max-height:240px;overflow:auto;background:#fff;border:1px solid #95d064;box-shadow:0 8px 20px rgba(0,0,0,.16);z-index:2147483640;font-family:'Open Sans',Arial,sans-serif;}
      #${FEATURE_ID} #enfoqueEscolaPessoaSuggestions.show{display:block!important;}
      #${FEATURE_ID} .enfoque-escola-sug{padding:7px 8px;border-bottom:1px solid #e5e5e5;cursor:pointer;background:#fff;color:#333;font-size:12px;line-height:1.25;}
      #${FEATURE_ID} .enfoque-escola-sug:hover{background:#d5e8c6;}
      #${FEATURE_ID} .enfoque-escola-sug .main{font-weight:800;display:block;}
      #${FEATURE_ID} .enfoque-escola-sug .sub{display:block;color:#666;font-size:10.5px;margin-top:2px;}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setPessoaEscolaChecked(checked, escolaValue, officialSchool) {
    const check = byId("enfoqueEscolaPessoaCheck");
    const campo = byId("enfoqueEscolaPessoaCampo");
    const input = byId("enfoqueEscolaPessoaNome");
    if (check) check.checked = Boolean(checked);
    if (campo) campo.style.display = checked ? "block" : "none";
    if (officialSchool && typeof officialSchool === "object") {
      pessoaSelectedOfficialSchool = officialSchool;
      if (input) {
        input.dataset.escolaId = cleanText(officialSchool.id || officialSchool.escola_id || officialSchool.codigo);
        input.dataset.escolaDescontoPercentual = String(Number(officialSchool.desconto_percentual ?? officialSchool.escola_desconto_percentual ?? 0) || 0);
      }
    }
    if (input && escolaValue !== undefined && escolaValue !== null) input.value = cleanText(escolaValue);
  }

  function createPessoaField() {
    if (byId(FEATURE_ID)) return true;

    const telefone = byId("Telefone");
    const anchorLi = telefone && telefone.closest ? telefone.closest("li") : null;
    const list = anchorLi && anchorLi.parentNode;
    if (!list) return false;

    ensurePessoaStyles();

    const li = document.createElement("li");
    li.id = FEATURE_ID;
    li.innerHTML = `
      <label class="labelform">Escolas Parceiras</label>
      <span class="enfoque-escola-check-wrap">
        <input type="checkbox" id="enfoqueEscolaPessoaCheck" />
        <label for="enfoqueEscolaPessoaCheck" style="display:inline;margin:0;cursor:pointer;">Escolas Parceiras</label>
      </span>
      <span id="enfoqueEscolaPessoaStatus"></span>
      <div id="enfoqueEscolaPessoaCampo" style="display:none;">
        <label class="labelform">Escola</label>
        <span class="enfoque-escola-input-wrap">
          <input type="text" id="enfoqueEscolaPessoaNome" maxlength="120" autocomplete="off" placeholder="Digite e selecione a escola" />
          <div id="enfoqueEscolaPessoaSuggestions"></div>
        </span>
      </div>
    `;

    list.insertBefore(li, anchorLi.nextSibling);

    const check = byId("enfoqueEscolaPessoaCheck");
    const campo = byId("enfoqueEscolaPessoaCampo");
    const input = byId("enfoqueEscolaPessoaNome");
    if (check && campo) {
      check.addEventListener("change", async () => {
        if (check.checked) {
          campo.style.display = "none";
          const allowed = await requestPessoaSchoolPassword();
          if (!allowed) {
            campo.style.display = "none";
            clearPessoaSelectedSchool();
            hidePessoaSchoolSuggestions();
            return;
          }
          campo.style.display = "block";
          if (input) setTimeout(() => input.focus(), 50);
          return;
        }

        campo.style.display = "none";
        clearPessoaSelectedSchool();
        hidePessoaSchoolSuggestions();
        setPessoaStatus("", "");
      });
    }

    if (input && input.dataset.enfoqueOfficialSchoolHooked !== "1") {
      input.dataset.enfoqueOfficialSchoolHooked = "1";
      input.addEventListener("input", () => {
        clearPessoaSelectedSchool();
        setPessoaStatus("Selecione uma escola da lista oficial.", "info");
        schedulePessoaSchoolSearch(input.value);
      }, false);
      input.addEventListener("focus", () => {
        if (cleanText(input.value).length >= 2) schedulePessoaSchoolSearch(input.value);
      }, false);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hidePessoaSchoolSuggestions();
      }, false);
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (target && target.closest && !target.closest("#enfoque-escola-pessoa-v1")) hidePessoaSchoolSuggestions();
      }, true);
    }

    return true;
  }

  function hidePessoaSchoolSuggestions() {
    const box = byId("enfoqueEscolaPessoaSuggestions");
    if (box) box.classList.remove("show");
  }

  function renderPessoaSchoolSuggestions(results) {
    const box = byId("enfoqueEscolaPessoaSuggestions");
    if (!box) return;
    if (!results || !results.length) {
      box.innerHTML = `<div class="enfoque-escola-sug"><span class="main">Nenhuma escola oficial encontrada</span><span class="sub">O cadastro não poderá ser salvo como escola sem selecionar uma opção válida.</span></div>`;
      box.classList.add("show");
      return;
    }
    box.innerHTML = results.map((school, index) => {
      const nome = escapeHtml(school.nome || school.name || school.escola || "Sem nome");
      const id = escapeHtml(school.id || school.escola_id || "sem-id");
      const desconto = Number(school.desconto_percentual ?? school.escola_desconto_percentual ?? 0) || 0;
      return `<div class="enfoque-escola-sug" data-index="${index}"><span class="main">${nome}</span><span class="sub">ID: ${id} • Desconto: ${desconto}%</span></div>`;
    }).join("");
    box.querySelectorAll(".enfoque-escola-sug[data-index]").forEach((el) => {
      el.addEventListener("click", () => {
        const index = Number(el.getAttribute("data-index"));
        selectPessoaOfficialSchool(results[index]);
      }, false);
    });
    box.classList.add("show");
  }

  function selectPessoaOfficialSchool(school) {
    if (!school) return;
    const input = byId("enfoqueEscolaPessoaNome");
    pessoaSelectedOfficialSchool = school;
    if (input) {
      input.value = cleanText(school.nome || school.name || school.escola);
      input.dataset.escolaId = cleanText(school.id || school.escola_id || school.codigo);
      input.dataset.escolaDescontoPercentual = String(Number(school.desconto_percentual ?? school.escola_desconto_percentual ?? 0) || 0);
    }
    hidePessoaSchoolSuggestions();
    setPessoaStatus(`Escola oficial selecionada (${Number(school.desconto_percentual ?? 0) || 0}% desconto).`, "ok");
  }

  function schedulePessoaSchoolSearch(query) {
    const q = cleanText(query);
    clearTimeout(pessoaSchoolSuggestTimer);
    if (q.length < 2) {
      hidePessoaSchoolSuggestions();
      return;
    }
    pessoaSchoolSuggestTimer = setTimeout(async () => {
      try {
        const results = await apiSearchOfficialSchools(q, 12);
        renderPessoaSchoolSuggestions(results);
      } catch (error) {
        console.warn("[Enfoque Escola] Falha ao buscar escolas oficiais:", error);
        const box = byId("enfoqueEscolaPessoaSuggestions");
        if (box) {
          box.innerHTML = `<div class="enfoque-escola-sug"><span class="main">Erro ao buscar escolas</span><span class="sub">Verifique o backend da intranet/extensão.</span></div>`;
          box.classList.add("show");
        }
      }
    }, 220);
  }

  async function lookupPessoaExistingSchool(force) {
    const documentInput = byId("CNPJ_CPF");
    if (!documentInput) return;
    const doc = onlyDigits(documentInput.value);
    if (!doc) return;
    if (!force && doc === pessoaLastLookupDocument) return;
    pessoaLastLookupDocument = doc;

    try {
      const customer = await apiLookupSchoolCustomer(doc);
      if (customer && cleanText(customer.escola)) {
        const official = customer.escola_id ? {
          id: customer.escola_id,
          nome: customer.escola,
          desconto_percentual: Number(customer.escola_desconto_percentual || 0) || 0,
          ativo: true
        } : null;
        setPessoaEscolaChecked(true, customer.escola, official);
        setPessoaStatus(customer.escola_id ? "Escola carregada do servidor." : "Escola antiga carregada sem ID oficial; selecione da lista antes de salvar.", customer.escola_id ? "ok" : "error");
      }
    } catch (error) {
      console.warn("[Enfoque Escola] Falha ao consultar CPF/CNPJ salvo:", error);
    }
  }

  function hookPessoaDocumentLookup() {
    const input = byId("CNPJ_CPF") || document.querySelector('input[ng-model="pessoa.CNPJ_CPF"], input[ng-model="pessoa.CPFCNPJ"], input[name*="CNPJ"], input[id*="CPF"]');
    if (!input) return;

    if (input.dataset.enfoqueEscolaLookupHooked !== "1") {
      input.dataset.enfoqueEscolaLookupHooked = "1";

      const schedule = () => {
        pessoaLastLookupDocument = "";
        clearTimeout(pessoaLookupTimer);
        pessoaLookupTimer = setTimeout(() => lookupPessoaExistingSchool(true), 450);
      };

      input.addEventListener("input", schedule, true);
      input.addEventListener("change", schedule, true);
      input.addEventListener("blur", () => lookupPessoaExistingSchool(true), true);
    }

    // O SIGE/Angular pode preencher CPF/CNPJ depois que a extensao ja carregou.
    // Por isso tentamos por alguns segundos ate encontrar um documento real.
    if (!pessoaInitialLookupUntil) pessoaInitialLookupUntil = Date.now() + 9000;
    if (Date.now() <= pessoaInitialLookupUntil) {
      clearTimeout(pessoaLookupTimer);
      pessoaLookupTimer = setTimeout(() => {
        lookupPessoaExistingSchool(false);
        if (!onlyDigits(input.value) || !byId("enfoqueEscolaPessoaCheck")?.checked) {
          if (Date.now() <= pessoaInitialLookupUntil) setTimeout(() => hookPessoaDocumentLookup(), 700);
        }
      }, 650);
    }
  }

  function hookPessoaSaveButtons() {
    SAVE_BUTTON_IDS.forEach((id) => {
      const button = byId(id);
      if (!button || button.dataset.enfoqueEscolaHooked === "1") return;
      button.dataset.enfoqueEscolaHooked = "1";

      button.addEventListener("click", async (event) => {
        if (button.dataset.enfoqueEscolaBypass === "1") {
          button.dataset.enfoqueEscolaBypass = "0";
          return;
        }

        const check = byId("enfoqueEscolaPessoaCheck");
        if (!check || !check.checked) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (!isPessoaSchoolSelectionValid()) {
          setPessoaStatus("Selecione uma escola oficial da lista antes de salvar.", "error");
          const input = byId("enfoqueEscolaPessoaNome");
          if (input) { try { input.focus(); } catch (_) {} }
          return;
        }

        const oldDisabled = button.disabled;
        button.disabled = true;
        setPessoaStatus("Enviando escola...", "info");

        try {
          await apiSaveSchoolCustomer({ ...buildPessoaPayload(), ...getPessoaSelectedSchoolPayload() });
          setPessoaStatus("Escola enviada.", "ok");
        } catch (error) {
          console.warn("[Enfoque Escola] Falha ao enviar cadastro de escola:", error);
          setPessoaStatus("Falha ao enviar escola; salvando no SIGE mesmo assim.", "error");
        } finally {
          button.disabled = oldDisabled;
          button.dataset.enfoqueEscolaBypass = "1";
          setTimeout(() => {
            try { button.click(); } catch (_) {}
          }, 80);
        }
      }, true);
    });
  }

  function syncPessoaPage() {
    if (!isPessoaEditPage()) return;
    createPessoaField();
    hookPessoaDocumentLookup();
    hookPessoaSaveButtons();
    installPessoaAjaxSaveBridge();
  }

  function ensurePdvStyles() {
    if (byId("enfoquePdvClienteEscolaStyle")) return;
    const style = document.createElement("style");
    style.id = "enfoquePdvClienteEscolaStyle";
    style.textContent = `
      #enfoquePdvClienteBuscaWrap{position:relative;margin-top:4px;display:none;clear:both;}
      #enfoquePdvClienteEscolasToggleWrap{display:flex;align-items:center;gap:6px;margin-top:4px;margin-left:-3px;color:#4b5563;font-size:12px;font-weight:700;}
      #enfoquePdvClienteEscolasToggle{width:16px!important;height:16px!important;margin:0!important;}
      #enfoquePdvClienteBusca{width:212px;margin-left:-3px;height:14px;padding:2px 4px;border:1px solid #95d064;background:#fff;color:#333;font-size:12px;box-sizing:content-box;}
      #enfoquePdvClienteBusca:focus{outline:none;border-color:#6fac3f;box-shadow:0 0 0 2px rgba(111,172,63,.16);}
      #enfoquePdvClienteSuggestions{display:none;position:absolute;left:-3px;top:23px;width:320px;max-height:260px;overflow:auto;background:#fff;border:1px solid #95d064;box-shadow:0 8px 20px rgba(0,0,0,.18);z-index:2147483640;font-family:'Open Sans',Arial,sans-serif;}
      #enfoquePdvClienteSuggestions.show{display:block!important;}
      #enfoquePdvClienteSuggestions .enfoque-pdv-cliente-sug{padding:7px 8px;border-bottom:1px solid #e5e5e5;cursor:pointer;color:#333;background:#fff;font-size:12px;line-height:1.25;}
      #enfoquePdvClienteSuggestions .enfoque-pdv-cliente-sug:hover{background:#d5e8c6;}
      #enfoquePdvClienteSuggestions .main{font-weight:800;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #enfoquePdvClienteSuggestions .sub{display:block;color:#666;font-size:10.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #enfoquePdvClienteModal{position:fixed;left:18px;top:92px;width:340px;min-width:260px;min-height:250px;max-width:80vw;max-height:90vh;z-index:2147483639;background:#ffffff;border:1px solid #80c95c;border-radius:10px;box-shadow:0 18px 44px rgba(0,0,0,.22);font-family:'Open Sans',Arial,sans-serif;color:#253326;display:none;overflow:auto;resize:both;}
      #enfoquePdvClienteModal.show{display:block;}
      #enfoquePdvClienteModal .head{background:linear-gradient(180deg,#d9f2c9,#c7e9b8);border-bottom:1px solid #95d064;padding:10px 12px;font-weight:900;color:#16823a;display:flex;justify-content:space-between;align-items:center;font-size:15px;line-height:1.2;cursor:move;user-select:none;}
      #enfoquePdvClienteModal .close{border:0;background:rgba(255,255,255,.55);color:#456044;font-size:18px;font-weight:900;cursor:pointer;line-height:20px;width:24px;height:24px;border-radius:999px;padding:0;}
      #enfoquePdvClienteModal .close:hover{background:#fff;color:#1f5e2e;}
      #enfoquePdvClienteModal .body{padding:12px;background:#fff;}
      #enfoquePdvClienteModal .fixed-alert{margin:0 0 10px 0;padding:9px 10px;border:1px solid #f59e0b;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:800;line-height:1.35;}
      #enfoquePdvClienteModal .fixed-alert b{color:#7c2d12;}
      #enfoquePdvClienteModal .row{margin:0 0 9px 0;padding:8px 9px;border:1px solid #e3efd9;border-radius:8px;background:#fbfff8;}
      #enfoquePdvClienteModal .lbl{font-size:10px;text-transform:uppercase;color:#6b7b64;font-weight:900;display:block;margin:0 0 3px 0;letter-spacing:.03em;line-height:1.1;}
      #enfoquePdvClienteModal .val{font-size:13px;color:#18251a;font-weight:800;word-break:break-word;line-height:1.25;min-height:16px;}
      #enfoquePdvClienteModal .school{background:#ecffd5;border-color:#bce98b;}
      #enfoquePdvClienteModal .school .val{font-size:15px;color:#1f7a2e;}
      #enfoquePdvClienteModal .discount{background:#e8f1ff;border-color:#9cc3ff;}
      #enfoquePdvClienteModal .discount .val{font-size:15px;color:#2563eb;}
      #enfoquePdvClienteModal .actions{padding:0 12px 12px 12px;background:#fff;display:flex;gap:8px;align-items:center;}
      #enfoquePdvClienteModal .apply-discount{width:100%;border:1px solid #60a5fa;background:#3b82f6;color:white;border-radius:8px;padding:9px 10px;font-weight:900;cursor:pointer;font-size:13px;}
      #enfoquePdvClienteModal .apply-discount:hover{background:#2563eb;}
      #enfoquePdvClienteModal .apply-discount:disabled{opacity:.55;cursor:not-allowed;}
      #enfoquePdvClienteModal .hint{padding:0 12px 10px 12px;font-size:10.5px;color:#6b7b64;line-height:1.3;background:#fff;}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function escapeHtml(value) {
    return cleanText(value).replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
  }


  function getProdutoBuscaInput() {
    return byId("txtNomeProduto");
  }

  function setProdutoBuscaTemporarilyDisabled(disabled) {
    // V8: nao desabilita mais #txtNomeProduto. Desabilitar esse input causa conflito
    // com Angular/PDV e pode travar/fechar a tela ao selecionar sugestoes.
    // O controle de foco agora e feito apenas por interceptacao de focus/click/teclado.
    const produtoBusca = getProdutoBuscaInput();
    if (!produtoBusca) return;
    try {
      if (produtoBusca.getAttribute("data-enfoque-escola-temp-disabled") === "1") {
        produtoBusca.removeAttribute("data-enfoque-escola-temp-disabled");
        produtoBusca.removeAttribute("data-enfoque-escola-old-disabled");
      }
    } catch (_) {}
  }

  function isPdvSchoolModeActive() {
    const toggle = byId("enfoquePdvClienteEscolasToggle");
    const input = byId("enfoquePdvClienteBusca");
    const wrap = byId("enfoquePdvClienteBuscaWrap");
    return Boolean(toggle && toggle.checked && input && wrap && wrap.style.display !== "none");
  }

  function isInsidePdvSchoolUi(el) {
    try {
      return !!(el && el.closest && (
        el.closest("#enfoquePdvClienteBuscaWrap") ||
        el.closest("#enfoquePdvClienteEscolasToggleWrap") ||
        el.closest("#enfoquePdvClienteModal") ||
        el.closest("#enfoquePdvCampoNovo") ||
        el.closest("#enfoquePdvMarcaSuggestions") ||
        el.closest("#enfoquePdvProdutoSuggestions")
      ));
    } catch (_) { return false; }
  }

  function rememberPdvSchoolSafeFocus(el) {
    try {
      if (el && el.id !== "txtNomeProduto" && isInsidePdvSchoolUi(el)) {
        pdvSchoolLastSafeFocus = el;
        window.__enfoquePdvLastSafeFocusAt = Date.now();
      }
    } catch (_) {}
  }

  function focusPdvSchoolSafeTargetSoon() {
    const fallback = byId("enfoquePdvClienteBusca");
    const target = (pdvSchoolLastSafeFocus && document.contains(pdvSchoolLastSafeFocus)) ? pdvSchoolLastSafeFocus : fallback;
    if (!target) return;
    setTimeout(() => { try { target.focus(); } catch (_) {} }, 0);
  }

  function setPdvSchoolFocusLock(locked) {
    window.__enfoquePdvEscolaFocusLock = Boolean(locked);
    try {
      document.body.classList.toggle("enfoque-pdv-escola-focus-lock", Boolean(locked));
      if (locked) {
        document.body.classList.remove("enfoque-pdv-produto-autocomplete-ativo");
        document.body.classList.remove("enfoque-pdv-marca-valida");
        setProdutoBuscaTemporarilyDisabled(true);
      }
    } catch (_) {}
  }

  function installPdvGlobalFocusGuard() {
    // V9: removido qualquer controle global de foco.
    // Nao intercepta foco, clique, teclado, nem sobrescreve HTMLElement.focus.
  }

  function activatePdvSchoolTypingMode() {
    // V9: sem controle de foco. Mantem apenas o autocomplete funcionando.
  }

  function releasePdvSchoolTypingModeSoon() {
    // V9: sem controle de foco.
  }

  function setPdvEscolarMode(enabled) {
    const wrap = byId("enfoquePdvClienteBuscaWrap");
    const input = byId("enfoquePdvClienteBusca");
    const modal = byId("enfoquePdvClienteModal");
    if (wrap) wrap.style.display = enabled ? "block" : "none";
    if (!enabled) {
      hidePdvSuggestions();
      if (modal) modal.classList.remove("show");
      if (input) input.value = "";
      pdvLastSearchQuery = "";
      pdvSelectedCustomer = null;
    }
    // V9: nao chama focus(), nao bloqueia #txtNomeProduto e nao altera nenhum campo do PDV.
  }

  function createPdvSearchField() {
    if (byId("enfoquePdvClienteBusca")) return true;
    const escolaInput = byId("idNomeEscola");
    const li = escolaInput && escolaInput.closest ? escolaInput.closest("li") : null;
    if (!li) return false;

    ensurePdvStyles();
    const toggleWrap = document.createElement("div");
    toggleWrap.id = "enfoquePdvClienteEscolasToggleWrap";
    toggleWrap.innerHTML = `<input type="checkbox" id="enfoquePdvClienteEscolasToggle" /><label for="enfoquePdvClienteEscolasToggle" style="display:inline;margin:0;cursor:pointer;float:none;width:auto;">Escolas Parceiras</label>`;
    li.appendChild(toggleWrap);

    const wrap = document.createElement("div");
    wrap.id = "enfoquePdvClienteBuscaWrap";
    wrap.innerHTML = `
      <input type="text" id="enfoquePdvClienteBusca" placeholder="Buscar" autocomplete="off" aria-label="Buscar cliente escolar" />
      <div id="enfoquePdvClienteSuggestions"></div>
    `;
    li.appendChild(wrap);

    const toggle = byId("enfoquePdvClienteEscolasToggle");
    const input = byId("enfoquePdvClienteBusca");
    if (toggle) {
      toggle.addEventListener("change", async () => {
        if (toggle.checked) {
          setPdvEscolarMode(false);
          const allowed = await requestPdvSchoolPassword();
          if (!allowed) {
            toggle.checked = false;
            setPdvEscolarMode(false);
            return;
          }
          toggle.checked = true;
          setPdvEscolarMode(true);
          return;
        }
        setPdvEscolarMode(false);
      }, true);
    }

    input.addEventListener("input", () => {
      schedulePdvSearch(input.value);
    }, false);
    input.addEventListener("focus", () => {
      if (cleanText(input.value).length >= 2) schedulePdvSearch(input.value);
    }, false);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hidePdvSuggestions();
    }, false);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.closest && !target.closest("#enfoquePdvClienteBuscaWrap") && !target.closest("#enfoquePdvClienteEscolasToggleWrap")) hidePdvSuggestions();
    }, true);

    createPdvModal();
    setPdvEscolarMode(false);
    return true;
  }

  function getPdvModalLayoutStorageKey() {
    return "enfoquePdvClienteModalLayoutV16";
  }

  function savePdvModalLayout() {
    try {
      const modal = byId("enfoquePdvClienteModal");
      if (!modal) return;
      const r = modal.getBoundingClientRect();
      const layout = {
        left: Math.max(0, Math.round(r.left)),
        top: Math.max(0, Math.round(r.top)),
        width: Math.max(260, Math.round(r.width)),
        height: Math.max(250, Math.round(r.height))
      };
      localStorage.setItem(getPdvModalLayoutStorageKey(), JSON.stringify(layout));
    } catch (_) {}
  }

  function loadPdvModalLayout() {
    try {
      const raw = localStorage.getItem(getPdvModalLayoutStorageKey());
      const layout = raw ? JSON.parse(raw) : null;
      if (!layout || typeof layout !== "object") return null;
      return layout;
    } catch (_) { return null; }
  }

  function applyPdvModalSavedLayout(modal) {
    try {
      const layout = loadPdvModalLayout();
      if (!layout || !modal) return;
      const maxLeft = Math.max(0, window.innerWidth - 80);
      const maxTop = Math.max(0, window.innerHeight - 80);
      modal.style.left = Math.min(Math.max(0, Number(layout.left) || 18), maxLeft) + "px";
      modal.style.top = Math.min(Math.max(0, Number(layout.top) || 92), maxTop) + "px";
      if (layout.width) modal.style.width = Math.min(Math.max(260, Number(layout.width) || 340), Math.max(260, window.innerWidth - 20)) + "px";
      if (layout.height) modal.style.height = Math.min(Math.max(250, Number(layout.height) || 0), Math.max(250, window.innerHeight - 20)) + "px";
    } catch (_) {}
  }

  function makePdvModalMovableAndResizable(modal) {
    if (!modal || modal.dataset.enfoqueMovable === "1") return;
    modal.dataset.enfoqueMovable = "1";
    applyPdvModalSavedLayout(modal);

    const head = modal.querySelector(".head");
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    if (head) {
      head.addEventListener("mousedown", (event) => {
        if (event.target && event.target.closest && event.target.closest("button")) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const r = modal.getBoundingClientRect();
        startLeft = r.left;
        startTop = r.top;
        event.preventDefault();
      }, false);
    }

    document.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const r = modal.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - Math.min(80, r.width));
      const maxTop = Math.max(0, window.innerHeight - Math.min(80, r.height));
      modal.style.left = Math.min(Math.max(0, startLeft + dx), maxLeft) + "px";
      modal.style.top = Math.min(Math.max(0, startTop + dy), maxTop) + "px";
    }, false);

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      savePdvModalLayout();
    }, false);

    try {
      const ro = new ResizeObserver(() => {
        clearTimeout(modal.__enfoqueResizeSaveTimer);
        modal.__enfoqueResizeSaveTimer = setTimeout(savePdvModalLayout, 250);
      });
      ro.observe(modal);
      modal.__enfoqueResizeObserver = ro;
    } catch (_) {
      modal.addEventListener("mouseup", savePdvModalLayout, false);
    }
  }

  function createPdvModal() {
    if (byId("enfoquePdvClienteModal")) return;
    const modal = document.createElement("div");
    modal.id = "enfoquePdvClienteModal";
    modal.innerHTML = `
      <div class="head"><span>Cliente Escolar</span><button type="button" class="close" id="enfoquePdvClienteModalClose">×</button></div>
      <div class="body" id="enfoquePdvClienteModalBody"></div>
      <div class="actions"><button type="button" class="apply-discount" id="enfoquePdvAplicarDescontoBtn">Aplicar desconto</button></div>
      <div class="hint">Arraste o cabeçalho para mover. Redimensione pelo canto inferior direito. A posição e o tamanho ficam salvos neste computador.</div>
    `;
    document.body.appendChild(modal);
    makePdvModalMovableAndResizable(modal);
    const close = byId("enfoquePdvClienteModalClose");
    if (close) close.addEventListener("click", () => modal.classList.remove("show"), true);
    const apply = byId("enfoquePdvAplicarDescontoBtn");
    if (apply) apply.addEventListener("click", () => applyPdvSelectedCustomerDiscountPercentVisual(), true);
  }

  function hidePdvSuggestions() {
    const box = byId("enfoquePdvClienteSuggestions");
    if (box) box.classList.remove("show");
  }

  function normalizePdvCustomerText(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function pdvCustomerDocument(customer) {
    return onlyDigits(customer && (customer.cnpj_ou_cpf || customer.cpf_cnpj || customer.cpf || customer.cnpj || customer.documento));
  }

  function pdvCustomerName(customer) {
    return cleanText(customer && customer.nome);
  }

  function filterPdvCustomersByNameOrDocument(results, query) {
    const textQuery = normalizePdvCustomerText(query);
    const docQuery = onlyDigits(query);
    const seen = new Set();
    const out = [];

    for (const item of results || []) {
      const nome = pdvCustomerName(item);
      const doc = pdvCustomerDocument(item);
      if (!nome && !doc) continue;

      const nameMatch = textQuery && normalizePdvCustomerText(nome).includes(textQuery);
      const documentMatch = docQuery && doc.includes(docQuery);
      if (!nameMatch && !documentMatch) continue;

      const key = doc || normalizePdvCustomerText(nome);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }

    return out;
  }

  function renderPdvSuggestions(results) {
    const box = byId("enfoquePdvClienteSuggestions");
    if (!box) return;
    if (!results || !results.length) {
      box.innerHTML = `<div class="enfoque-pdv-cliente-sug"><span class="main">Nenhum cliente encontrado</span><span class="sub">Busque por nome, CPF ou CNPJ</span></div>`;
      box.classList.add("show");
      return;
    }

    box.innerHTML = results.map((item, index) => {
      const nome = escapeHtml(pdvCustomerName(item) || "Sem nome");
      const docRaw = pdvCustomerDocument(item);
      const doc = escapeHtml(docRaw || "CPF/CNPJ vazio");
      return `<div class="enfoque-pdv-cliente-sug" data-index="${index}" tabindex="0"><span class="main">${nome}</span><span class="sub">CPF/CNPJ: ${doc}</span></div>`;
    }).join("");

    box.querySelectorAll(".enfoque-pdv-cliente-sug[data-index]").forEach((el) => {
      let choosing = false;
      const choose = () => {
        if (choosing) return;
        choosing = true;
        const index = Number(el.getAttribute("data-index"));
        const customer = results[index];
        setTimeout(() => {
          try { selectPdvCustomer(customer); } catch (error) { console.warn("[Enfoque PDV Escola] Falha ao selecionar sugestao:", error); }
          setTimeout(() => { choosing = false; }, 250);
        }, 0);
      };
      el.addEventListener("click", choose, false);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter") choose();
      }, false);
    });
    box.classList.add("show");
  }

  function findExactPdvCustomer(results, query) {
    const qText = normalizePdvCustomerText(query);
    const qDoc = onlyDigits(query);
    if (!results || !results.length) return null;
    for (const item of results) {
      const doc = pdvCustomerDocument(item);
      const nome = normalizePdvCustomerText(pdvCustomerName(item));
      if (qDoc && doc && qDoc.length >= 11 && doc === qDoc) return item;
      if (qText && nome && nome === qText && qText.length >= 4) return item;
    }
    return null;
  }

  function schedulePdvSearch(query) {
    const q = cleanText(query);
    clearTimeout(pdvSearchTimer);
    if (q.length < 2) {
      hidePdvSuggestions();
      return;
    }
    pdvSearchTimer = setTimeout(async () => {
      pdvLastSearchQuery = q;
      try {
        const rawResults = await apiSearchSchoolCustomers(q, 30);
        const results = filterPdvCustomersByNameOrDocument(rawResults, q).slice(0, 12);
        const exact = findExactPdvCustomer(results, q);
        if (exact) {
          selectPdvCustomer(exact);
          return;
        }
        renderPdvSuggestions(results);
      } catch (error) {
        console.warn("[Enfoque PDV Escola] Falha ao buscar cliente escolar:", error);
        const box = byId("enfoquePdvClienteSuggestions");
        if (box) {
          box.innerHTML = `<div class="enfoque-pdv-cliente-sug"><span class="main">Erro ao buscar</span><span class="sub">Verifique o backend da extensão</span></div>`;
          box.classList.add("show");
        }
      }
    }, 180);
  }

  function getSchoolDiscountPercentFromCustomer(customer) {
    const n = Number(customer && (customer.escola_desconto_percentual ?? customer.desconto_percentual ?? customer.desconto));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function formatMoneyBR(value) {
    return (Number(value) || 0).toFixed(2).replace(".", ",");
  }

  function isElementVisible(el) {
    if (!el) return false;
    const st = window.getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && el.offsetParent !== null;
  }

  function safeAngularApply(scope, fn) {
    if (!scope) return;
    const phase = scope.$root && scope.$root.$$phase;
    if (phase) fn();
    else scope.$apply(fn);
  }

  function getPdvScope() {
    if (typeof angular === "undefined") return null;
    const controller = document.querySelector("#controllerPDV");
    if (!controller) return null;
    try { return angular.element(controller).scope(); } catch (_) { return null; }
  }

  function getPdvProdutosFromScope(scope) {
    if (!scope) return [];
    if (Array.isArray(scope.produtos) && scope.produtos.length) return scope.produtos;
    if (Array.isArray(scope.venda && scope.venda.Produtos) && scope.venda.Produtos.length) return scope.venda.Produtos;
    if (Array.isArray(scope.pedido && scope.pedido.Produtos) && scope.pedido.Produtos.length) return scope.pedido.Produtos;
    return [];
  }

  function parsePdvMoneyValue(text) {
    try {
      let raw = String(text || "").replace(/\s+/g, "").replace(/R\$/gi, "");
      raw = raw.replace(/[^0-9,.-]/g, "");
      if (!raw) return 0;
      if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch (_) { return 0; }
  }

  function getPdvTotalPedidoPagamentoValue(scope) {
    // V18: o desconto manual deve calcular em cima do TOTAL DO PEDIDO da tela de pagamento,
    // nao do campo Valor Recebido. O SIGE usa ids repetidos (#totalPedido), entao damos
    // prioridade ao total dentro de #contentPagamentos quando ele estiver visivel.
    try {
      const pagamento = byId("contentPagamentos");
      const totalEl = pagamento ? pagamento.querySelector("#totalPedido") : null;
      if (totalEl) {
        const clone = totalEl.cloneNode(true);
        try { clone.querySelectorAll("span").forEach((el) => el.remove()); } catch (_) {}
        const byText = parsePdvMoneyValue(clone.textContent || totalEl.childNodes && totalEl.childNodes[0] && totalEl.childNodes[0].textContent || "");
        if (byText > 0) return byText;
      }
    } catch (_) {}

    try {
      const visibleTotals = Array.from(document.querySelectorAll('#totalPedido')).filter(isElementVisible);
      for (const totalEl of visibleTotals) {
        const clone = totalEl.cloneNode(true);
        try { clone.querySelectorAll("span").forEach((el) => el.remove()); } catch (_) {}
        const byText = parsePdvMoneyValue(clone.textContent || "");
        if (byText > 0) return byText;
      }
    } catch (_) {}

    // Fallback antigo, apenas se o total do pedido nao for encontrado.
    try {
      if (scope && scope.valorRecebido !== undefined && scope.valorRecebido !== null && scope.valorRecebido !== "") {
        const byScope = typeof scope.valorRecebido === "number" ? scope.valorRecebido : parsePdvMoneyValue(scope.valorRecebido);
        if (byScope > 0) return byScope;
      }
    } catch (_) {}
    const input =
      document.querySelector('input[ng-model="valorRecebido"]') ||
      document.querySelector('#contentPagamentos input.txtInfoPagamento.colorRecebido') ||
      document.querySelector('#contentPagamentos input[ng-change="valorRecebidoChanged()"]');
    return input ? parsePdvMoneyValue(input.value || input.getAttribute("value") || "") : 0;
  }

  function forceDiscountInputsVisual(descontoPercentual, descontoValor) {
    const percentText = String(Number(descontoPercentual) || 0).replace(".", ",");
    const moneyText = formatMoneyBR(descontoValor);

    const inputPercent = byId("txtDescontoPercentual");
    if (inputPercent) {
      inputPercent.value = percentText;
      inputPercent.setAttribute("value", percentText);
    }

    const inputMoney = byId("txtDesconto");
    if (inputMoney) {
      inputMoney.value = moneyText;
      inputMoney.setAttribute("value", moneyText);
    }
  }

  function applyPdvSelectedCustomerDiscountPercentVisual() {
    const customer = pdvSelectedCustomer;
    const descontoPercentual = getSchoolDiscountPercentFromCustomer(customer);
    if (!customer || !descontoPercentual) {
      alert("Selecione um cliente escolar com desconto antes de aplicar.");
      return;
    }
    try {
      const s = getPdvScope();
      const valorVenda = getPdvTotalPedidoPagamentoValue(s);
      if (!valorVenda || valorVenda <= 0) {
        alert("Nao encontrei o Total do Pedido na tela de pagamento. Va ate a tela de pagamento e tente novamente.");
        return;
      }

      const descontoValor = roundMoney(valorVenda * descontoPercentual / 100);

      if (s) {
        safeAngularApply(s, function () {
          s.descontoPercentual = descontoPercentual;
          s.desconto = descontoValor;
        });
      }

      forceDiscountInputsVisual(descontoPercentual, descontoValor);

      const btn = byId("enfoquePdvAplicarDescontoBtn");
      if (btn) {
        btn.textContent = "Desconto aplicado: " + formatMoneyBR(descontoValor) + " (" + descontoPercentual + "%)";
        setTimeout(() => { try { btn.textContent = "Aplicar desconto"; } catch (_) {} }, 2200);
      }
    } catch (error) {
      console.warn("[Enfoque PDV Escola] Falha ao aplicar desconto visual calculado:", error);
    }
  }

  function isPdvPaymentScreenVisible() {
    const el = byId("contentPagamentos");
    return isElementVisible(el);
  }

  function clearPdvDiscountVisualTimers() {
    try { pdvDiscountVisualTimers.forEach((id) => clearTimeout(id)); } catch (_) {}
    pdvDiscountVisualTimers = [];
  }

  function applyPdvDiscountVisualOnce(customer, reason) {
    // V16: sem aplicação visual automática.
  }

  function schedulePdvDiscountVisual(customer, reason) {
    // V16: sem timers/loops de desconto visual.
    clearPdvDiscountVisualTimers();
  }

  function selectPdvCustomer(customer) {
    if (!customer) return;
    try {
      pdvSelectedCustomer = customer;
      try {
        window.postMessage({ type: "ENFOQUE_PDV_ESCOLA_CLIENTE_SELECTED", customer }, "*");
      } catch (_) {}
      hidePdvSuggestions();

      // Guarda cliente para injecao segura no savevenda e aplica visualmente o desconto nativo do SIGE.
      // Nao preenche campos do PDV nem controla foco.
      setTimeout(() => {
        try { showPdvCustomerModal(customer); } catch (error) { console.warn("[Enfoque PDV Escola] Falha ao abrir modal:", error); }
        // V16: desconto visual somente pelo botao Aplicar desconto no modal.
      }, 30);
    } catch (error) {
      console.warn("[Enfoque PDV Escola] Erro ao selecionar cliente:", error);
    }
  }

  function showPdvCustomerModal(customer) {
    createPdvModal();
    const modal = byId("enfoquePdvClienteModal");
    const body = byId("enfoquePdvClienteModalBody");
    if (!modal || !body) return;
    body.innerHTML = `
      <div class="fixed-alert"><b>Atenção:</b> Não Marcar Escolas Parceiras para vendas de: Resma, Cartucho, Livros ou Uniformes.</div>
      <div class="row"><span class="lbl">Nome</span><div class="val">${escapeHtml(customer.nome || "")}</div></div>
      <div class="row"><span class="lbl">CPF/CNPJ</span><div class="val">${escapeHtml(customer.cnpj_ou_cpf || customer.cpf_cnpj || customer.cpf || customer.cnpj || "")}</div></div>
      <div class="row"><span class="lbl">E-mail</span><div class="val">${escapeHtml(customer.email_geral || customer.email || "")}</div></div>
      <div class="row"><span class="lbl">Telefone</span><div class="val">${escapeHtml(customer.telefone || "")}</div></div>
      <div class="row school"><span class="lbl">Escola</span><div class="val">${escapeHtml(customer.escola || "")}</div></div>
      <div class="row discount"><span class="lbl">Desconto escolar</span><div class="val">${escapeHtml(String(getSchoolDiscountPercentFromCustomer(customer) || 0))}%</div></div>
      <div class="row"><span class="lbl">ID SIGE</span><div class="val">${escapeHtml(customer.sige_pessoa_id || customer.Id || "sem ID salvo")}</div></div>
    `;
    modal.classList.add("show");
  }

  function syncPdvPage() {
    if (!isPdvPage()) return;
    createPdvSearchField();
    // V15: nao aplica desconto visual dentro do sync. Evita lentidao.
    // V10: nao reabre/re-renderiza modal dentro do sync.
    // Motivo: o MutationObserver percebe alteracoes no proprio modal e chamava syncAll novamente,
    // criando loop de renderizacao que travava o PDV ao selecionar uma sugestao.
  }

  function syncAll() {
    try { syncPessoaPage(); } catch (error) { console.warn("[Enfoque Escola] Erro em Pessoas:", error); }
    try { syncPdvPage(); } catch (error) { console.warn("[Enfoque PDV Escola] Erro no PDV:", error); }
  }

  function installPdvDiscountEventHooks() {
    // V16: removido acionamento automatico de desconto visual para evitar lentidao.
    // O desconto real continua sendo aplicado no payload da savevenda pelo inject-api.js.
    // O visual do campo #txtDescontoPercentual e aplicado apenas pelo botao do modal.
  }

  function start() {
    syncAll();
    installPdvDiscountEventHooks();
    setInterval(syncAll, 1500);
    try {
      let syncQueued = false;
      const mo = new MutationObserver((mutations) => {
        // Ignora mutacoes causadas pela propria UI escolar para nao entrar em loop.
        try {
          const onlyOwnUi = Array.from(mutations || []).every((m) => {
            const target = m && m.target;
            if (!target || !target.closest) return false;
            return Boolean(target.closest('#enfoquePdvClienteModal') || target.closest('#enfoquePdvClienteBuscaWrap') || target.closest('#enfoquePdvClienteEscolasToggleWrap') || target.closest('#enfoquePdvClienteSuggestions') || target.closest('#enfoque-escola-pessoa-v1'));
          });
          if (onlyOwnUi) return;
        } catch (_) {}
        if (syncQueued) return;
        syncQueued = true;
        setTimeout(() => {
          syncQueued = false;
          try { syncAll(); } catch (_) {}
        }, 250);
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

})();

(function () {
  'use strict';

  const ENFOQUE_CLONAR_VENDAS_KEY = 'enfoque_modelos_vendas_getdata_v1';
  const ENFOQUE_CLONAR_POS_KEY = 'enfoque_modelos_vendas_botao_pos_v1';
  const ENFOQUE_CLONAR_Z = 2147483646;

  function enfClonarLog() {
    try { console.log.apply(console, ['[Enfoque Clonar Venda]'].concat(Array.from(arguments))); } catch (_) {}
  }

  function enfClonarIsVendaPage() {
    const p = String(location.pathname || '').toLowerCase();
    return p.includes('/sistema/vendas/edit') || p.includes('/sistema/orcamentoescolar/edit');
  }

  function enfClonarGetVendaIdFromUrl() {
    const m = String(location.pathname || '').match(/\/sistema\/Vendas\/Edit\/([a-f0-9]{24})/i);
    return m ? m[1] : '';
  }

  function enfClonarClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function enfClonarNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function enfClonarMoney(v) {
    const n = enfClonarNum(v);
    try {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (_) {
      return 'R$ ' + n.toFixed(2).replace('.', ',');
    }
  }

  function enfClonarLoadModels() {
    try {
      const lista = JSON.parse(localStorage.getItem(ENFOQUE_CLONAR_VENDAS_KEY) || '[]');
      return (Array.isArray(lista) ? lista : [])
        .filter(x => x && x.expiraEm && x.expiraEm > Date.now());
    } catch (_) {
      return [];
    }
  }

  function enfClonarSaveModels(lista) {
    try {
      localStorage.setItem(ENFOQUE_CLONAR_VENDAS_KEY, JSON.stringify((lista || []).slice(0, 30)));
    } catch (e) {
      alert('Nao consegui salvar os dados localmente. O localStorage pode estar cheio.');
      throw e;
    }
  }

  function enfClonarBuildResumo(json) {
    const venda = (json && json.Venda) || {};
    const produtos = Array.isArray(json && json.Produtos) ? json.Produtos : [];
    return {
      codigo: venda.Codigo || 0,
      status: venda.Status || '',
      cliente: venda.Cliente || '',
      empresa: venda.Empresa || '',
      deposito: venda.Deposito || '',
      vendedor: venda.Vendedor || '',
      valorFinal: venda.ValorFinal || 0,
      produtos: produtos.length,
      data: venda.Data || '',
      origemVenda: venda.OrigemVenda || '',
      formaPagamento: venda.FormadePagamento || ''
    };
  }

  async function enfClonarDownloadCurrentVenda() {
    const vendaId = enfClonarGetVendaIdFromUrl();
    if (!vendaId) {
      alert('Esta tela nao tem ID de venda/orcamento na URL para baixar. Abra uma venda/orcamento ja salvo.');
      return;
    }

    const btn = document.getElementById('enfoque-clonar-venda-btn');
    if (btn) btn.textContent = '...';

    try {
      const resp = await fetch(location.origin + '/sistema/Vendas/Ajax/GetData?', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ data: vendaId })
      });

      const text = await resp.text();
      let json;
      try { json = JSON.parse(text); } catch (e) {
        console.error('[Enfoque Clonar Venda] Resposta nao JSON:', text);
        alert('O SIGE respondeu, mas nao veio JSON. Veja o console.');
        return;
      }

      if (!resp.ok || !json || !json.Venda) {
        console.error('[Enfoque Clonar Venda] Resposta inesperada:', resp.status, json);
        alert('Nao consegui baixar os dados da venda. Veja o console.');
        return;
      }

      const modelo = {
        id: 'modelo_' + vendaId + '_' + Date.now(),
        vendaIdOrigem: vendaId,
        criadoEm: new Date().toISOString(),
        expiraEm: Date.now() + (7 * 24 * 60 * 60 * 1000),
        resumo: enfClonarBuildResumo(json),
        raw: json
      };

      const lista = enfClonarLoadModels();
      lista.unshift(modelo);
      enfClonarSaveModels(lista);
      enfClonarLog('Modelo salvo', modelo);
      alert(
        'Modelo salvo com sucesso!\n\n' +
        'Codigo: ' + modelo.resumo.codigo + '\n' +
        'Status: ' + modelo.resumo.status + '\n' +
        'Cliente: ' + modelo.resumo.cliente + '\n' +
        'Produtos: ' + modelo.resumo.produtos + '\n' +
        'Valor: ' + enfClonarMoney(modelo.resumo.valorFinal)
      );
      enfClonarRenderPanel();
    } catch (e) {
      console.error('[Enfoque Clonar Venda] Erro ao baixar:', e);
      alert('Erro ao baixar dados. Veja o console.');
    } finally {
      if (btn) btn.textContent = 'CV';
    }
  }

  function enfClonarFindScopeVendas() {
    let best = null;
    try {
      document.querySelectorAll('*').forEach(function (el) {
        try {
          if (!window.angular || !angular.element) return;
          const s = angular.element(el).scope();
          if (!s) return;

          const ngc = el.getAttribute && String(el.getAttribute('ng-controller') || '').toLowerCase();
          const hasController = ngc === 'vendas';
          const hasDados = !!(s.dados && s.dados.Venda && Array.isArray(s.dados.Produtos));
          const hasFns = typeof s.atualizaTotaisVenda === 'function' && typeof s.atualizePagamentos === 'function';

          if (hasController || hasDados || hasFns) best = s;
        } catch (_) {}
      });
    } catch (_) {}
    return best;
  }

  function enfClonarSanitizePagamento(pg) {
    const p = enfClonarClone(pg || {});
    p.Id = null;
    p.LancamentosIDs = null;
    return p;
  }

  function enfClonarSanitizeVenda(origem, atual) {
    const venda = Object.assign({}, atual || {}, enfClonarClone(origem || {}));
    const keep = ['Id', 'Codigo', 'Data', 'Alteracao', 'Validade'];

    keep.forEach(function (k) {
      if (atual && Object.prototype.hasOwnProperty.call(atual, k)) venda[k] = atual[k];
    });

    venda.Id = (atual && atual.Id) || null;
    venda.Codigo = (atual && atual.Codigo) || 0;
    venda.Status = (atual && atual.Status) || 'Orçamento';
    venda.Finalizado = false;
    venda.Lancado = false;
    venda.FreteLancado = false;
    venda.Enviado = false;
    venda.NumeroNFe = null;
    venda.DataFaturamento = '';
    venda.DataFaturamentoNFE = '';
    venda.DataHoraFaturamentoNFE = '';
    venda.FaturadoPor = null;
    venda.FaturadoPorID = null;
    venda.DataFaturadoCaxia = '';
    venda.CanceladoPor = null;
    venda.CanceladoPorID = null;
    venda.DataCancelamento = null;

    if (Array.isArray(venda.PagamentosVenda)) {
      venda.PagamentosVenda = venda.PagamentosVenda.map(enfClonarSanitizePagamento);
    }

    return venda;
  }

  function enfClonarSanitizeProduto(p, indice) {
    const produto = enfClonarClone(p || {});
    produto.Id = null;
    produto.VendaID = null;
    produto.OSID = null;
    produto.NumeroNFE = null;
    produto.DataNFE = '';
    produto.Entregue = false;
    produto.Indice = indice + 1;

    produto.Quantidade = enfClonarNum(produto.Quantidade);
    produto.ValorUnitario = enfClonarNum(produto.ValorUnitario);
    produto.DescontoUnitario = enfClonarNum(produto.DescontoUnitario);
    produto.DescontoUnitarioPercentual = enfClonarNum(produto.DescontoUnitarioPercentual);
    produto.DescontoTotal = enfClonarNum(produto.DescontoTotal);
    produto.ValorTotal = Math.round(((produto.Quantidade * produto.ValorUnitario) - produto.DescontoTotal) * 100) / 100;
    return produto;
  }

  function enfClonarSanitizeDuplicata(d) {
    const dup = enfClonarClone(d || {});
    dup.Id = null;
    dup.VendaID = null;
    dup.LancamentoID = null;
    dup.LancamentosIDs = null;
    return dup;
  }

  function enfClonarSanitizeLancamento(l) {
    const lanc = enfClonarClone(l || {});
    lanc.Id = null;
    lanc.VendaID = null;
    lanc.OrdemServicoID = null;
    lanc.LancamentoPaiId = null;
    lanc.LancamentoGrupoID = null;
    lanc.LancamentoFaturamentoID = null;
    lanc.Pago = false;
    lanc.Conciliado = false;
    lanc.ValorPago = 0;
    lanc.Pagamentos = 0;
    lanc.PagamentosConciliados = 0;
    lanc.PagamentosList = null;
    lanc.NewPagamento = null;
    return lanc;
  }

  function enfClonarSanitizeOSItem(x) {
    const item = enfClonarClone(x || {});
    item.Id = null;
    item.VendaID = null;
    item.OSID = null;
    return item;
  }

  function enfClonarEnsurePageBridge() {
    const existing = document.getElementById('enfoque-clonar-venda-page-bridge-v3');
    if (existing || window.__enfoqueClonarVendaBridgeLoading) {
      return window.__enfoqueClonarVendaBridgeLoading || Promise.resolve();
    }

    window.__enfoqueClonarVendaBridgeLoading = new Promise(function (resolve) {
      const script = document.createElement('script');
      script.id = 'enfoque-clonar-venda-page-bridge-v3';
      script.src = chrome.runtime.getURL('clonar-vendas-bridge.js');
      script.onload = function () {
        try { script.remove(); } catch (_) {}
        setTimeout(resolve, 150);
      };
      script.onerror = function () {
        console.warn('[Enfoque Clonar Venda] Falha ao carregar bridge. Tentando mesmo assim.');
        resolve();
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return window.__enfoqueClonarVendaBridgeLoading;
  }


  async function enfClonarApplyModelViaPage(modelo) {
    await enfClonarEnsurePageBridge();

    return new Promise(function (resolve) {
      const requestId = 'clonar_' + Date.now() + '_' + Math.random().toString(16).slice(2);
      let done = false;

      function finish(payload) {
        if (done) return;
        done = true;
        window.removeEventListener('message', onMessage);
        resolve(payload);
      }

      function onMessage(ev) {
        const data = ev.data || {};
        if (!data || data.source !== 'ENFOQUE_CLONAR_VENDA_PAGE' || data.type !== 'APPLY_RESULT' || data.requestId !== requestId) return;
        finish(data);
      }

      window.addEventListener('message', onMessage);
      setTimeout(function () {
        window.postMessage({ source: 'ENFOQUE_CLONAR_VENDA_EXT', type: 'APPLY_MODEL', requestId, modelo }, '*');
      }, 120);

      setTimeout(function () {
        finish({ ok: false, error: 'timeout' });
      }, 18000);
    });
  }

  async function enfClonarApplyModel(modelo) {
    if (!modelo || !modelo.raw) {
      alert('Modelo invalido.');
      return;
    }

    const raw = modelo.raw || {};
    const resumo = modelo.resumo || enfClonarBuildResumo(raw);

    const ok = confirm(
      'Aplicar este modelo na tela atual?\n\n' +
      'Codigo origem: ' + (resumo.codigo || '') + '\n' +
      'Status origem: ' + (resumo.status || '') + '\n' +
      'Cliente: ' + (resumo.cliente || '') + '\n' +
      'Produtos: ' + (resumo.produtos || 0) + '\n' +
      'Valor: ' + enfClonarMoney(resumo.valorFinal || 0) + '\n\n' +
      'Confira a tela antes de salvar no SIGE.'
    );
    if (!ok) return;

    const btn = document.getElementById('enfoque-clonar-venda-btn');
    if (btn) btn.textContent = '...';

    try {
      let result = await enfClonarApplyModelViaPage(modelo);
      if (!result || !result.ok) {
        console.warn('[Enfoque Clonar Venda] Primeira tentativa falhou, repetindo automaticamente:', result);
        await new Promise(function (resolve) { setTimeout(resolve, 900); });
        result = await enfClonarApplyModelViaPage(modelo);
      }
      if (!result || !result.ok) {
        console.warn('[Enfoque Clonar Venda] Falha ao aplicar via pagina apos retry:', result);
        return;
      }

      const r = result.result || {};
      alert(
        'Modelo aplicado. Confira antes de salvar.\n\n' +
        'Produtos: ' + (r.produtos || 0) + '\n' +
        'Valor: ' + enfClonarMoney(r.valor || 0)
      );
    } catch (e) {
      console.error('[Enfoque Clonar Venda] Erro ao aplicar modelo:', e);
      alert('Erro ao aplicar modelo. Veja o console.');
    } finally {
      if (btn) btn.textContent = 'CV';
    }
  }

  function enfClonarDeleteModel(id) {
    const lista = enfClonarLoadModels().filter(m => m && m.id !== id);
    enfClonarSaveModels(lista);
    enfClonarRenderPanel();
  }

  function enfClonarRenderPanel() {
    const panel = document.getElementById('enfoque-clonar-venda-panel');
    if (!panel) return;

    const vendaId = enfClonarGetVendaIdFromUrl();
    const modelos = enfClonarLoadModels();

    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'enfoque-clonar-title';
    title.textContent = 'Reutilizar venda/orcamento';
    panel.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'enfoque-clonar-sub';
    sub.textContent = vendaId ? ('ID atual: ' + vendaId) : 'Tela nova/sem ID';
    panel.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'enfoque-clonar-actions';

    const btnBaixar = document.createElement('button');
    btnBaixar.type = 'button';
    btnBaixar.textContent = 'Baixar dados desta tela';
    btnBaixar.disabled = !vendaId;
    btnBaixar.onclick = enfClonarDownloadCurrentVenda;
    actions.appendChild(btnBaixar);

    const btnExportar = document.createElement('button');
    btnExportar.type = 'button';
    btnExportar.textContent = 'Exportar ultimo modelo';
    btnExportar.disabled = !modelos.length;
    btnExportar.onclick = function () { enfClonarApplyModel(enfClonarLoadModels()[0]); };
    actions.appendChild(btnExportar);

    panel.appendChild(actions);

    const listTitle = document.createElement('div');
    listTitle.className = 'enfoque-clonar-list-title';
    listTitle.textContent = 'Modelos salvos (' + modelos.length + ')';
    panel.appendChild(listTitle);

    const list = document.createElement('div');
    list.className = 'enfoque-clonar-list';

    if (!modelos.length) {
      const empty = document.createElement('div');
      empty.className = 'enfoque-clonar-empty';
      empty.textContent = 'Nenhum modelo salvo.';
      list.appendChild(empty);
    } else {
      modelos.forEach(function (m, idx) {
        const r = m.resumo || {};
        const item = document.createElement('div');
        item.className = 'enfoque-clonar-item';

        const main = document.createElement('div');
        main.className = 'enfoque-clonar-item-main';
        main.textContent = '#' + idx + ' - ' + (r.codigo || 'sem codigo') + ' - ' + (r.status || '');
        item.appendChild(main);

        const meta = document.createElement('div');
        meta.className = 'enfoque-clonar-item-meta';
        meta.textContent = (r.cliente || 'sem cliente') + ' | ' + (r.produtos || 0) + ' item(ns) | ' + enfClonarMoney(r.valorFinal || 0);
        item.appendChild(meta);

        const row = document.createElement('div');
        row.className = 'enfoque-clonar-item-actions';

        const apply = document.createElement('button');
        apply.type = 'button';
        apply.textContent = 'Aplicar';
        apply.onclick = function () { enfClonarApplyModel(m); };
        row.appendChild(apply);

        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = 'Excluir';
        del.onclick = function () {
          if (confirm('Excluir este modelo salvo?')) enfClonarDeleteModel(m.id);
        };
        row.appendChild(del);

        item.appendChild(row);
        list.appendChild(item);
      });
    }

    panel.appendChild(list);
  }

  function enfClonarInjectStyles() {
    if (document.getElementById('enfoque-clonar-venda-style')) return;
    const st = document.createElement('style');
    st.id = 'enfoque-clonar-venda-style';
    st.textContent = `
      #enfoque-clonar-venda-btn{
        position:fixed; right:22px; bottom:96px; width:54px; height:54px;
        border-radius:999px; border:0; background:rgba(17,80,155,.82); color:#fff;
        font-weight:800; font-size:15px; z-index:${ENFOQUE_CLONAR_Z}; cursor:move;
        box-shadow:0 10px 24px rgba(0,0,0,.28); opacity:.78; user-select:none;
      }
      #enfoque-clonar-venda-btn:hover{ opacity:1; }
      #enfoque-clonar-venda-panel{
        position:fixed; right:22px; bottom:158px; width:360px; max-height:70vh; overflow:auto;
        background:#fff; border:1px solid rgba(0,0,0,.18); border-radius:12px;
        box-shadow:0 14px 40px rgba(0,0,0,.28); z-index:${ENFOQUE_CLONAR_Z};
        padding:12px; font-family:Arial, sans-serif; color:#222; display:none;
      }
      #enfoque-clonar-venda-panel.show{ display:block; }
      #enfoque-clonar-venda-panel *{ box-sizing:border-box; }
      .enfoque-clonar-title{ font-weight:800; font-size:15px; margin-bottom:3px; }
      .enfoque-clonar-sub{ font-size:11px; color:#666; margin-bottom:10px; word-break:break-all; }
      .enfoque-clonar-actions{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
      #enfoque-clonar-venda-panel button{
        border:1px solid #b7c8df; background:#eef5ff; color:#174a86; border-radius:8px;
        padding:8px 9px; font-size:12px; cursor:pointer; font-weight:700;
      }
      #enfoque-clonar-venda-panel button:hover{ background:#dcecff; }
      #enfoque-clonar-venda-panel button:disabled{ opacity:.45; cursor:not-allowed; }
      .enfoque-clonar-list-title{ font-size:12px; font-weight:800; margin:8px 0; color:#333; }
      .enfoque-clonar-empty{ font-size:12px; color:#777; padding:8px; border:1px dashed #ccc; border-radius:8px; }
      .enfoque-clonar-item{ border:1px solid #e2e2e2; border-radius:10px; padding:8px; margin-bottom:8px; background:#fbfbfb; }
      .enfoque-clonar-item-main{ font-size:12px; font-weight:800; margin-bottom:3px; }
      .enfoque-clonar-item-meta{ font-size:11px; color:#555; line-height:1.35; }
      .enfoque-clonar-item-actions{ display:flex; gap:7px; margin-top:7px; }
      .enfoque-clonar-item-actions button{ padding:6px 8px !important; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function enfClonarSetupDrag(btn, panel) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    btn.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      dragging = true;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      const rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      ev.preventDefault();
    });

    document.addEventListener('mousemove', function (ev) {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const left = Math.max(8, Math.min(window.innerWidth - btn.offsetWidth - 8, startLeft + dx));
      const top = Math.max(8, Math.min(window.innerHeight - btn.offsetHeight - 8, startTop + dy));
      btn.style.left = left + 'px';
      btn.style.top = top + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      panel.style.left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, left - panel.offsetWidth + btn.offsetWidth)) + 'px';
      panel.style.top = Math.max(8, top - panel.offsetHeight - 10) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      try {
        const r = btn.getBoundingClientRect();
        localStorage.setItem(ENFOQUE_CLONAR_POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
      } catch (_) {}
      setTimeout(function () { moved = false; }, 80);
    });

    btn.addEventListener('click', function (ev) {
      if (moved) return;
      ev.preventDefault();
      enfClonarRenderPanel();
      panel.classList.toggle('show');
    });
  }

  function enfClonarCreateButton() {
    if (!enfClonarIsVendaPage()) return;
    if (document.getElementById('enfoque-clonar-venda-btn')) return;
    if (!document.body) return;

    enfClonarInjectStyles();

    const btn = document.createElement('button');
    btn.id = 'enfoque-clonar-venda-btn';
    btn.type = 'button';
    btn.title = 'Reutilizar venda/orcamento';
    btn.textContent = 'CV';

    const panel = document.createElement('div');
    panel.id = 'enfoque-clonar-venda-panel';

    try {
      const pos = JSON.parse(localStorage.getItem(ENFOQUE_CLONAR_POS_KEY) || 'null');
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        btn.style.left = Math.max(8, Math.min(window.innerWidth - 62, pos.left)) + 'px';
        btn.style.top = Math.max(8, Math.min(window.innerHeight - 62, pos.top)) + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
        panel.style.left = Math.max(8, Math.min(window.innerWidth - 372, pos.left - 306)) + 'px';
        panel.style.top = Math.max(8, pos.top - 360) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } catch (_) {}

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    enfClonarSetupDrag(btn, panel);
    enfClonarRenderPanel();
  }

  function enfClonarStart() {
    if (!enfClonarIsVendaPage()) return;
    setTimeout(enfClonarCreateButton, 800);
    setTimeout(enfClonarCreateButton, 2000);
    setTimeout(enfClonarCreateButton, 4500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enfClonarStart, { once: true });
  } else {
    enfClonarStart();
  }
})();
