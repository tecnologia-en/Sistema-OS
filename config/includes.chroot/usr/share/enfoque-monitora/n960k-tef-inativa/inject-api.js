/**
 * inject-api.js (page world)
 * - Captura Authorization Bearer em fetch/XHR e notifica content script via postMessage
 * - Executa chamadas para a API do SIGE (Produtos/GetList) com o mesmo "contexto" da página
 */
(function () {
  if (window.__enfoqueInjectApiLoaded) return;
  window.__enfoqueInjectApiLoaded = true;

// ===========================================================
// PDV: limpar campo "Nome da Escola" (#idNomeEscola) ao entrar no PDV
// (feito no page-world para conseguir limpar o ng-model "escola")
// ===========================================================
(function setupPdvClearNomeEscola() {
  try {
    if (!location.href.includes("/sistema/pdv")) return;
    if (location.href.toLowerCase().includes("danfenfce")) return;
    if (window.__enfoquePdvNomeEscolaClearStarted) return;
    window.__enfoquePdvNomeEscolaClearStarted = true;

    let stableEmptyCount = 0;
    let tries = 0;

    const clearOnce = () => {
      const el = document.getElementById("idNomeEscola");
      if (!el) return false;

      // Não brigar com o usuário enquanto ele estiver digitando
      if (document.activeElement === el) return false;

      // Se tiver texto, zera o value e também o model do Angular
      if (el.value && String(el.value).trim() !== "") {
        try { el.value = ""; } catch (e) {}
        try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
        try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}

        // Tenta zerar o ng-model (AngularJS)
        try {
          if (window.angular && typeof window.angular.element === "function") {
            const ngEl = window.angular.element(el);
            const ngModel = ngEl && ngEl.controller ? ngEl.controller("ngModel") : null;
            if (ngModel && typeof ngModel.$setViewValue === "function") {
              ngModel.$setViewValue("");
              if (typeof ngModel.$render === "function") ngModel.$render();
            }
            const scope = ngEl && typeof ngEl.scope === "function" ? ngEl.scope() : null;
            if (scope) {
              if ("escola" in scope) scope.escola = "";
              if (typeof scope.$applyAsync === "function") scope.$applyAsync();
              else if (typeof scope.$apply === "function") { try { scope.$apply(); } catch(e) {} }
            }
          }
        } catch (e) {}
      }

      if (!el.value || String(el.value).trim() === "") stableEmptyCount++;
      else stableEmptyCount = 0;

      return true;
    };

    const tick = () => {
      tries++;
      clearOnce();

      // Para quando ficou vazio de forma estável (3 ticks) ou depois de ~20 tentativas (~10s)
      if (stableEmptyCount >= 3 || tries >= 20) {
        try { clearInterval(timer); } catch (e) {}
      }
    };

    // roda algumas vezes porque o Angular pode reescrever o value depois
    const timer = setInterval(tick, 500);
    // tenta também logo no início
    setTimeout(tick, 50);
    setTimeout(tick, 150);
    setTimeout(tick, 300);
  } catch (e) {}
})();


  const API_URL = "https://enfoquepapelaria.meusige.com.br/api/v2/Produtos/GetList";
const API_URL_REPORT_PRECO = "https://enfoquepapelaria.meusige.com.br/api/v2/ReportProdutosPrecoVenda/Get";
const API_URL_PEDIDOS = "https://enfoquepapelaria.meusige.com.br/api/v2/ReportPedidos/GetItens";

// Payload simples para validar token no endpoint do relatório (estável e já usado pela tela)
function buildPayloadValidateReport() {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const ini = `01/${m}/${y}`;
    const fim = `31/${m}/${y}`;
    return {
      Pagina: { Number: 0, Lenght: 1 },
      Filtro: { TipoPeriodo: "10", DataAlteracaoInicial: ini, DataAlteracaoFinal: fim }
    };
  } catch (e) {
    return {
      Pagina: { Number: 0, Lenght: 1 },
      Filtro: { TipoPeriodo: "10", DataAlteracaoInicial: "01/01/2026", DataAlteracaoFinal: "31/01/2026" }
    };
  }
}


// Captura do payload real usado pela página para o relatório (evita HTTP 500 por formato inesperado)
let __enfoqueLastReportPrecoTemplate = null;
let __enfoqueLastReportPrecoTemplateKey = "";

function __enfoqueTryRememberReportPrecoTemplate(payloadObj) {
  try {
    if (!payloadObj || typeof payloadObj !== "object") return;
    const key = JSON.stringify(payloadObj).slice(0, 6000);
    if (!key || key === __enfoqueLastReportPrecoTemplateKey) return;
    __enfoqueLastReportPrecoTemplateKey = key;
    __enfoqueLastReportPrecoTemplate = payloadObj;

    // avisa o content-script para também guardar (assim funciona mesmo após refresh)
    try {
      window.postMessage({ source: "ENFOQUE_REPORT_PRECO_TEMPLATE", payload: payloadObj }, "*");
    } catch (_) {}
  } catch (_) {}
}

function __enfoqueDeepClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
}

function __enfoquePatchSearchFields(obj, codigo) {
  // atualiza chaves comuns de pesquisa; se não existirem, não inventa estrutura
  try {
    if (!obj || typeof obj !== "object") return;
    const keys = Object.keys(obj);
    for (const k of keys) {
      const v = obj[k];
      const lk = String(k).toLowerCase();

      if (lk === "pesquisasimples" || lk === "pesquisa" || lk === "codigo" || lk === "codigonfe" || lk === "codigoproduto" || lk === "codigobarras") {
        obj[k] = String(codigo);
        continue;
      }

      if (v && typeof v === "object") __enfoquePatchSearchFields(v, codigo);
    }
  } catch (_) {}
}

function __enfoqueBuildReportPrecoPayload(codigo, template) {
  const cod = String(codigo || "").trim();

  // prioridade: template passado pelo content-script; depois template capturado localmente; por fim payload genérico
  const base = __enfoqueDeepClone(template || __enfoqueLastReportPrecoTemplate || null);

  if (base && typeof base === "object") {
    try {
      // caso padrão do SIGE: {arg:"", arg2:"", data:"{...}"}
      if (typeof base.data === "string") {
        try {
          const inner = JSON.parse(base.data);
          __enfoquePatchSearchFields(inner, cod);
          // força paginação pequena
          if (inner.Pagina && typeof inner.Pagina === "object") {
            inner.Pagina.Number = 1;
            if (inner.Pagina.Lenght != null) inner.Pagina.Lenght = 25;
            if (inner.Pagina.Length != null) inner.Pagina.Length = 25;
          }
          base.data = JSON.stringify(inner);
          return base;
        } catch (_) {}
      }

      // caso em que data já é objeto
      if (base.data && typeof base.data === "object") {
        __enfoquePatchSearchFields(base.data, cod);
        return base;
      }

      // caso em que o payload é direto (sem wrapper)
      __enfoquePatchSearchFields(base, cod);
      return base;
    } catch (_) {}
  }

  // fallback genérico (pode falhar dependendo do endpoint, mas é melhor do que nada)
  return {
    arg: "",
    arg2: "",
    data: JSON.stringify({
      PesquisaSimples: cod,
      EhPesquisaSimples: true,
      FiltroOrdenacao: "Nome",
      Pagina: { Number: 1, Lenght: 25 }
    })
  };
}


  function normalizeBearer(v) {
    if (!v) return null;
    v = String(v).trim();
    if (!v) return null;
    if (/^Bearer\s+/i.test(v)) return "Bearer " + v.replace(/^Bearer\s+/i, "").trim();
    // permite colar somente o token
    if (/^[A-Za-z0-9\-\._~\+\/]+=*$/.test(v) && v.length > 20) return "Bearer " + v;
    return null;
  }


  function __enfoqueIsBlockedBearer(v) {
    const t = normalizeBearer(v);
    if (!t) return true;
    const raw = t.replace(/^Bearer\s+/i, "").trim();
    return /^github_pat_/i.test(raw)
      || /^ghp_/i.test(raw)
      || /^gho_/i.test(raw)
      || /^ghu_/i.test(raw)
      || /^ghs_/i.test(raw)
      || /^ghr_/i.test(raw);
  }

  function __enfoqueIsSigeApiUrl(url) {
    try {
      if (!url) return false;
      const u = new URL(url, location.href);
      const host = (u.hostname || "").toLowerCase();
      if (!host.endsWith("meusige.com.br")) return false;
      const path = (u.pathname || "").toLowerCase();
      // O Bearer do SIGE aparece majoritariamente em chamadas de API
      if (path.includes("/api/")) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function reportToken(t, sourceDetail) {
    try {
      console.log("[Enfoque] reportToken chamado com:", t ? t.substring(0, 30) + "..." : "nulo");
      // legado (compat)
      window.postMessage({ source: "SIGE_TOKEN", token: t, sourceDetail: sourceDetail || "unknown" }, "*");
      // novo (método preferido)
      window.postMessage({ type: "SIGE_BEARER_FOUND", bearer: t, sourceDetail: sourceDetail || "unknown" }, "*");
      console.log("[Enfoque] Mensagens postMessage enviadas");
    } catch (e) {
      console.log("[Enfoque] Erro ao enviar reportToken:", e);
    }
  }

  // ===========================================================
  // CAPTURAR TOKEN AUTOMATICAMENTE DO LOCALSTORAGE
  // ===========================================================
  function __enfoqueCaptureTokenFromLocalStorage() {
    // Only run on SIGE pages
    if (!location.hostname.includes('meusige.com.br')) return;
    
    console.log("[Enfoque] Iniciando captura de token do localStorage...");
    
    // Função auxiliar para verificar se é um token válido
    function isValidToken(val) {
      if (!val || typeof val !== 'string') return false;
      // Ignorar GitHub tokens
      if (/^github_pat_/i.test(val)) return false;
      if (/^gh[pousr]_/i.test(val)) return false;
      // Verificar padrão de token JWT ou similar (base64 com tamanho razoável)
      if (val.length > 20 && val.length < 500) return true;
      return false;
    }
    
    // Função para verificar se o valor parece um token
    function looksLikeToken(val) {
      if (!val || typeof val !== 'string') return false;
      // Se já tem "Bearer " no início, é um token
      if (/^Bearer\s+/i.test(val)) return true;
      // Se parece um token JWT (xxx.xxx.xxx)
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(val)) return true;
      // Se parece um token simples (base64 encoded)
      if (/^[A-Za-z0-9\-\._~\+\/]+=*$/.test(val) && val.length > 20) return true;
      return false;
    }
    
    // Tentar capturar com retries
    var tentativas = 0;
    var maxTentativas = 5;
    
    function tentarCapturar() {
      tentativas++;
      console.log("[Enfoque] Tentativa " + tentativas + " de capturar token...");
      
      var possibleTokens = [];
      
      // 1. Verificar localStorage - procurar chaves específicas do SIGE
      try {
        // Primeiro, procurar chaves específicas que podem conter o token
        var chavesEspecificas = ['token', 'accessToken', 'authToken', 'bearer', 'authorization', 'jwt', 'sessionToken'];
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (!key) continue;
          
          var keyLower = key.toLowerCase();
          
          // Verificar se é uma chave específica do SIGE
          var éChaveEspecifica = false;
          for (var j = 0; j < chavesEspecificas.length; j++) {
            if (keyLower.includes(chavesEspecificas[j].toLowerCase())) {
              éChaveEspecifica = true;
              break;
            }
          }
          
          if (éChaveEspecifica || keyLower.includes('token') || keyLower.includes('auth')) {
            var val = localStorage.getItem(key);
            // Ignorar GitHub tokens
            if (/^github_pat_/i.test(val)) continue;
            if (/^gh[pousr]_/i.test(val)) continue;
            // Verificar se é um token válido
            if (looksLikeToken(val)) {
              console.log("[Enfoque] Token encontrado em localStorage[" + key + "]:", val.substring(0, 30) + "...");
              possibleTokens.push(val);
            }
          }
        }
      } catch(e) {
        console.log("[Enfoque] Erro ao acessar localStorage:", e);
      }
      
      // 2. Verificar sessionStorage
      try {
        for (var i = 0; i < sessionStorage.length; i++) {
          var key = sessionStorage.key(i);
          if (!key) continue;
          
          var keyLower = key.toLowerCase();
          if (keyLower.includes('token') || keyLower.includes('auth') || keyLower.includes('bearer')) {
            var val = sessionStorage.getItem(key);
            if (looksLikeToken(val)) {
              console.log("[Enfoque] Token encontrado em sessionStorage[" + key + "]:", val.substring(0, 30) + "...");
              possibleTokens.push(val);
            }
          }
        }
      } catch(e) {}
      
      // 3. Verificar window._token ou window.token
      try {
        var windowTokens = ['token', 'accessToken', 'authToken', 'bearerToken', '_token', '__token', 'jwtToken'];
        for (var i = 0; i < windowTokens.length; i++) {
          var key = windowTokens[i];
          if (window[key] && typeof window[key] === 'string' && looksLikeToken(window[key])) {
            console.log("[Enfoque] Token encontrado em window." + key + ":", window[key].substring(0, 30) + "...");
            possibleTokens.push(window[key]);
          }
        }
      } catch(e) {}
      
      // 4. Verificar cookies
      try {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
          var cookie = cookies[i].trim();
          var idx = cookie.indexOf('=');
          if (idx > 0) {
            var name = cookie.substring(0, idx).toLowerCase();
            var value = cookie.substring(idx + 1);
            if (name.includes('token') || name.includes('auth') || name.includes('bearer')) {
              if (looksLikeToken(value)) {
                console.log("[Enfoque] Token encontrado em cookie[" + name + "]:", value.substring(0, 30) + "...");
                possibleTokens.push(value);
              }
            }
          }
        }
      } catch(e) {}
      
      if (possibleTokens.length > 0) {
        console.log("[Enfoque] Tokens encontrados:", possibleTokens.length);
        // Usar o primeiro token válido
        var token = possibleTokens[0].replace(/^Bearer\s+/i, '').trim();
        reportToken("Bearer " + token, "storage-or-cookie");
        console.log("[Enfoque] Token reportado com sucesso!");
        return true;
      }
      
      // Se não encontrou, tentar novamente (até 5 vezes)
      if (tentativas < maxTentativas) {
        console.log("[Enfoque] Token não encontrado, tentando novamente em 2 segundos... (" + tentativas + "/" + maxTentativas + ")");
        setTimeout(tentarCapturar, 2000);
      } else {
        console.log("[Enfoque] Não foi possível capturar o token automaticamente após " + maxTentativas + " tentativas.");
      }
      return false;
    }
    
    // Iniciar primeira tentativa após 2 segundos
    setTimeout(tentarCapturar, 2000);
  }
  
  // Iniciar captura automática de token
  __enfoqueCaptureTokenFromLocalStorage();



  // ===========================================================
  // ENFOQUE ESCOLA/NFCE - bridge page-world
  // - Captura o payload real de Pessoas/Ajax/Save e envia para o content script.
  // - Injeta cliente escolar selecionado no PDV em /api/v2/pdv/savevenda no formato nativo do SIGE.
  // ===========================================================
  let __enfoqueClienteEscolarSelecionado = null;

  function __enfoqueCleanText(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  function __enfoqueOnlyDigits(value) {
    return __enfoqueCleanText(value).replace(/\D+/g, "");
  }

  function __enfoqueTryJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function __enfoqueParseRequestBody(body) {
    if (typeof body !== "string") return { kind: "other", payload: null };

    const direct = __enfoqueTryJson(body, null);
    if (direct && typeof direct === "object") return { kind: "json", payload: direct };

    const idx = body.indexOf("=");
    const key = idx >= 0 ? body.slice(0, idx) : body;
    try {
      const decoded = decodeURIComponent(String(key || "").replace(/\+/g, "%20"));
      const payload = __enfoqueTryJson(decoded, null);
      if (payload && typeof payload === "object") return { kind: "encoded-key", payload };
    } catch (_) {}

    return { kind: "unknown", payload: null };
  }

  function __enfoqueSerializeRequestBody(parsed, payload, originalBody) {
    if (!payload || typeof payload !== "object") return originalBody;
    if (parsed && parsed.kind === "json") return JSON.stringify(payload);
    if (parsed && parsed.kind === "encoded-key") return encodeURIComponent(JSON.stringify(payload)) + "=";
    return originalBody;
  }

  function __enfoqueIsPessoaAjaxSaveUrl(url) {
    try {
      const u = new URL(url, location.href);
      return (u.pathname || "").toLowerCase().includes("/sistema/pessoas/ajax/save");
    } catch (_) { return false; }
  }

  function __enfoqueIsPdvSaveVendaUrl(url) {
    try {
      const u = new URL(url, location.href);
      return (u.pathname || "").toLowerCase().includes("/api/v2/pdv/savevenda");
    } catch (_) { return false; }
  }

  function __enfoqueCapturePessoaSaveBody(url, body) {
    try {
      if (!__enfoqueIsPessoaAjaxSaveUrl(url)) return;
      const parsed = __enfoqueParseRequestBody(body);
      const payload = parsed && parsed.payload;
      if (!payload || typeof payload !== "object") return;

      let pessoa = payload;
      if (typeof payload.data === "string") pessoa = __enfoqueTryJson(payload.data, null);
      if (!pessoa || typeof pessoa !== "object") return;

      window.postMessage({
        type: "ENFOQUE_PESSOA_SAVE_PAYLOAD",
        pessoa,
        capturedAt: new Date().toISOString()
      }, "*");
    } catch (e) {
      try { console.warn("[Enfoque Escola] Falha ao capturar Pessoas/Ajax/Save:", e); } catch (_) {}
    }
  }

  function __enfoqueBuildClienteSigeArg(customer) {
    customer = customer && typeof customer === "object" ? customer : null;
    if (!customer) return null;

    const id = __enfoqueCleanText(customer.sige_pessoa_id || customer.Id || customer.id || customer.PessoaID || customer.PessoaId);
    if (!id) return null;

    const payload = customer.sige_pessoa_payload && typeof customer.sige_pessoa_payload === "object" ? customer.sige_pessoa_payload : {};
    const doc = __enfoqueCleanText(customer.cnpj_ou_cpf || customer.cpf_cnpj || customer.cpf || customer.cnpj || payload.CNPJ_CPF || payload.CPFCNPJ);
    const nome = __enfoqueCleanText(customer.nome || payload.NomeFantasia || payload.Nome || payload.RazaoSocial);

    return {
      Id: id,
      Nome: nome,
      CPFCNPJ: __enfoqueOnlyDigits(doc),
      PessoaFisica: Boolean(customer.pessoa_fisica !== undefined ? customer.pessoa_fisica : payload.PessoaFisica),
      Logradouro: __enfoqueCleanText(customer.logradouro || payload.Logradouro),
      LogradouroNumero: __enfoqueCleanText(customer.logradouro_numero || payload.LogradouroNumero),
      Complemento: __enfoqueCleanText(customer.complemento || payload.Complemento),
      Bairro: __enfoqueCleanText(customer.bairro || payload.Bairro),
      CEP: __enfoqueOnlyDigits(customer.cep || payload.CEP),
      Cidade: __enfoqueCleanText(customer.cidade || payload.Cidade),
      UF: __enfoqueCleanText(customer.uf || payload.UF),
      Email: __enfoqueCleanText(customer.email_geral || customer.email || payload.Email),
      Telefone: __enfoqueOnlyDigits(customer.telefone || payload.Telefone || payload.Celular),
      DataNascimento: __enfoqueCleanText(customer.data_nascimento || payload.DataNascimento),
      Encontrou: true,
      EstaInadimplente: false
    };
  }
  function __enfoqueRoundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function __enfoqueGetSchoolDiscountPercent(customer) {
    const n = Number(customer && (customer.escola_desconto_percentual ?? customer.desconto_percentual ?? customer.desconto));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function __enfoqueAplicarDescontoEscolarPayload(payload, customer) {
    const descontoPercentual = __enfoqueGetSchoolDiscountPercent(customer);
    if (!descontoPercentual || !payload || typeof payload !== "object") return payload;

    const produtos = __enfoqueTryJson(payload.data || "[]", []);
    if (!Array.isArray(produtos) || !produtos.length) return payload;

    let totalFinal = 0;
    let descontoTotalVenda = 0;

    const produtosNovos = produtos.map((p) => {
      const qtd = Number(p.Quantidade) || 1;
      const valorOriginal = Number(p.ValorUnitarioOriginal || p.ValorUnitario || 0);
      const descontoUnitario = __enfoqueRoundMoney(valorOriginal * descontoPercentual / 100);
      const valorComDesconto = __enfoqueRoundMoney(valorOriginal - descontoUnitario);
      const descontoTotal = __enfoqueRoundMoney(descontoUnitario * qtd);
      const valorTotal = __enfoqueRoundMoney(valorComDesconto * qtd);
      totalFinal += valorTotal;
      descontoTotalVenda += descontoTotal;
      return {
        ...p,
        ValorUnitarioOriginal: valorOriginal,
        ValorUnitario: valorComDesconto,
        ValorTotal: valorTotal,
        DescontoUnitarioPercentual: descontoPercentual,
        DescontoUnitario: descontoUnitario,
        DescontoTotal: descontoTotal
      };
    });

    payload.data = JSON.stringify(produtosNovos);

    const pagamentos = __enfoqueTryJson(payload.arg2 || "[]", []);
    if (Array.isArray(pagamentos) && pagamentos.length) {
      const totalFinalRound = __enfoqueRoundMoney(totalFinal);
      payload.arg2 = JSON.stringify(pagamentos.map((p, index) => {
        if (index !== 0) return p;
        return {
          ...p,
          ValorPagamento: totalFinalRound,
          DescricaoPagamento: p.DescricaoPagamento || `Pagamento com desconto escolar ${descontoPercentual}%`
        };
      }));
    }

    try {
      console.log("[Enfoque Escola] Desconto escolar aplicado no payload:", {
        desconto_aplicado_percentual: descontoPercentual,
        desconto_aplicado_valor: __enfoqueRoundMoney(descontoTotalVenda),
        escola_id: __enfoqueCleanText(customer.escola_id || customer.escolaId || ""),
        escola: __enfoqueCleanText(customer.escola || "")
      });
    } catch (_) {}

    return payload;
  }

  function __enfoqueAlterarSaveVendaBody(body) {
    try {
      const cliente = __enfoqueBuildClienteSigeArg(__enfoqueClienteEscolarSelecionado);
      if (!cliente) return body;
      const parsed = __enfoqueParseRequestBody(body);
      const payload = parsed && parsed.payload;
      if (!payload || typeof payload !== "object") return body;
      payload.arg = JSON.stringify(cliente);
      __enfoqueAplicarDescontoEscolarPayload(payload, __enfoqueClienteEscolarSelecionado);
      try { console.log("[Enfoque Escola] Cliente escolar/desconto injetado no savevenda:", cliente); } catch (_) {}
      return __enfoqueSerializeRequestBody(parsed, payload, body);
    } catch (e) {
      try { console.warn("[Enfoque Escola] Falha ao alterar savevenda:", e); } catch (_) {}
      return body;
    }
  }

  window.addEventListener("message", function (event) {
    try {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.type === "ENFOQUE_PDV_ESCOLA_CLIENTE_SELECTED") {
        __enfoqueClienteEscolarSelecionado = data.customer || null;
        try { console.log("[Enfoque Escola] Cliente escolar selecionado para NFC-e:", __enfoqueClienteEscolarSelecionado); } catch (_) {}
      }
      if (data.type === "ENFOQUE_PDV_ESCOLA_CLIENTE_CLEAR") {
        __enfoqueClienteEscolarSelecionado = null;
      }
    } catch (_) {}
  }, false);

  // --- Sniffer: fetch ---
try {
  const _fetch = window.fetch;

  function __enfoqueGetAuthFromHeaders(hLike) {
    try {
      if (!hLike) return null;
      const h = new Headers(hLike);
      return h.get("authorization") || h.get("Authorization");
    } catch (_) {
      try {
        return (hLike && (hLike["authorization"] || hLike["Authorization"])) || null;
      } catch (_) {}
      return null;
    }
  }

  window.fetch = function (input, init) {
    try {
      const url = (typeof input === "string") ? input : (input && input.url ? input.url : "");
      if (__enfoqueIsSigeApiUrl(url)) {
        // 1) headers vindos do init
        let auth = __enfoqueGetAuthFromHeaders(init && init.headers);

        // 2) headers vindos do Request (fetch(request))
        if (!auth && input && typeof input === "object" && input.headers) {
          auth = __enfoqueGetAuthFromHeaders(input.headers);
        }

        const t = normalizeBearer(auth);
        if (t && !__enfoqueIsBlockedBearer(t)) {
          console.log("[Enfoque] Token capturado via fetch:", t.substring(0, 30) + "...");
          reportToken(t, "fetch-header");
        }
      }
    } catch (_) {}

    // Captura template do ReportProdutosPrecoVenda/Get (se a própria página chamar)
    try {
      const url = (typeof input === "string") ? input : (input && input.url ? input.url : "");
      const method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : "GET")).toUpperCase();
      const isReport = url && url.toLowerCase().includes(API_URL_REPORT_PRECO.toLowerCase());
      const bodyStr = (init && typeof init.body === "string") ? init.body : null;
      if (isReport && method === "POST" && bodyStr) {
        try {
          const parsed = JSON.parse(bodyStr);
          __enfoqueTryRememberReportPrecoTemplate(parsed);
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const url = (typeof input === "string") ? input : (input && input.url ? input.url : "");
      const method = (init && init.method ? String(init.method) : (input && input.method ? String(input.method) : "GET")).toUpperCase();
      const bodyStr = init && typeof init.body === "string" ? init.body : null;
      if (method === "POST" && bodyStr) {
        __enfoqueCapturePessoaSaveBody(url, bodyStr);
        if (__enfoqueIsPdvSaveVendaUrl(url)) {
          let offlineImport = false;
          try {
            const headers = new Headers((init && init.headers) || (input && input.headers) || {});
            offlineImport = headers.get('X-Enfoque-Offline-Import') === '1';
          } catch (_) {}
          if (!offlineImport) {
            const newBody = __enfoqueAlterarSaveVendaBody(bodyStr);
            if (newBody !== bodyStr && init) {
              const newInit = Object.assign({}, init, { body: newBody });
              return _fetch.call(this, input, newInit);
            }
          } else {
            try { console.log('[Enfoque Offline] savevenda preservado sem injeção escolar.'); } catch (_) {}
          }
        }
      }
    } catch (_) {}

    return _fetch.apply(this, arguments);
  };
} catch (_) {}

// --- Sniffer: XHR ---

  try {
    // Guarda URL/método pra podermos filtrar o Bearer pelo endpoint
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__enfoqueUrl = url; this.__enfoqueMethod = method; this.__enfoqueOfflineImport = false; } catch (_) {}
      return _open.apply(this, arguments);
    };

    // Captura Bearer somente em chamadas de API do SIGE
    const _set = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      try {
        if (k && String(k).toLowerCase() === 'x-enfoque-offline-import' && String(v) === '1') { this.__enfoqueOfflineImport = true; }
        if (k && String(k).toLowerCase() === "authorization") {
          const url = this.__enfoqueUrl || "";
          const t = normalizeBearer(v);
          if (t && __enfoqueIsSigeApiUrl(url) && !__enfoqueIsBlockedBearer(t)) {
            console.log("[Enfoque] Token capturado via XHR:", t.substring(0, 30) + "...");
            reportToken(t, "xhr-header");
          }
        }
      } catch (_) {}
      return _set.apply(this, arguments);
    };

    // Captura template via XHR ($http do AngularJS costuma usar XMLHttpRequest)
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      try {
        const url = this.__enfoqueUrl || "";
        const method = (this.__enfoqueMethod ? String(this.__enfoqueMethod) : "GET").toUpperCase();
        const isReport = url && String(url).toLowerCase().includes(API_URL_REPORT_PRECO.toLowerCase());
        if (isReport && method === "POST" && body && typeof body === "string") {
          try {
            const parsed = JSON.parse(body);
            __enfoqueTryRememberReportPrecoTemplate(parsed);
          } catch (_) {}
        }
      } catch (_) {}

      try {
        const url2 = this.__enfoqueUrl || "";
        const method2 = (this.__enfoqueMethod ? String(this.__enfoqueMethod) : "GET").toUpperCase();
        if (method2 === "POST" && body && typeof body === "string") {
          __enfoqueCapturePessoaSaveBody(url2, body);
          if (__enfoqueIsPdvSaveVendaUrl(url2) && !this.__enfoqueOfflineImport) {
            const newBody = __enfoqueAlterarSaveVendaBody(body);
            if (newBody !== body) return _send.call(this, newBody);
          }
        }
      } catch (_) {}

      return _send.apply(this, arguments);
    };
  } catch (_) {}
function buildPayloadBusca(codigo) {
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
        Pagina: { Number: 1, Lenght: 10 }
      })
    };
  }

  function buildPayloadValidate() {
    return {
      arg: "",
      arg2: "",
      data: JSON.stringify({
        PesquisaSimples: "",
        EhPesquisaSimples: false,
        FiltroOrdenacao: "Nome",
        Pagina: { Number: 1, Lenght: 1 }
      })
    };
  }

  async function apiPost(url, payload, token) {
  const t = normalizeBearer(token);
  if (!t) throw new Error("INVALID_TOKEN_FORMAT");

  const resp = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Authorization": t,
      "Content-Type": "application/json;charset=UTF-8",
      "Accept": "application/json, text/plain, */*"
    },
    body: JSON.stringify(payload)
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("TOKEN_INVALIDO");
  }
    if (!resp.ok) {
      throw new Error("HTTP_" + resp.status);
    }
    return await resp.json();
  }

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || typeof data !== "object") return;

    // Produtos: busca por código
    if (data.type === "ENFOQUE_QUERY") {
      const requestId = data.requestId;
      const codigo = data.codigo;
      const token = data.token;

      try {
        const json = await apiPost(API_URL, buildPayloadBusca(codigo), token);
        window.postMessage({ type: "ENFOQUE_QUERY_RESULT", requestId, ok: true, data: json }, "*");
      } catch (err) {
        window.postMessage({ type: "ENFOQUE_QUERY_RESULT", requestId, ok: false, error: String(err && err.message ? err.message : err) }, "*");
      }
      return;
    }

    // Defeituosos / Relatório de preços: ReportProdutosPrecoVenda/Get
    if (data.type === "ENFOQUE_PRECO_QUERY") {
      const requestId = data.requestId;
      const codigo = data.codigo;
      const token = data.token;
      const template = data.template;

      try {
        if (template && typeof template === "object") {
          __enfoqueTryRememberReportPrecoTemplate(template);
        }

        const payload = __enfoqueBuildReportPrecoPayload(codigo, template);

        try {
          const json = await apiPost(API_URL_REPORT_PRECO, payload, token);
          __enfoqueTryRememberReportPrecoTemplate(payload);
          window.postMessage({ type: "ENFOQUE_PRECO_QUERY_RESULT", requestId, ok: true, data: json }, "*");
        } catch (err1) {
          // fallback: tenta payload genérico simples
          const json2 = await apiPost(API_URL_REPORT_PRECO, {
            PesquisaSimples: String(codigo || "").trim(),
            EhPesquisaSimples: true
          }, token);
          window.postMessage({ type: "ENFOQUE_PRECO_QUERY_RESULT", requestId, ok: true, data: json2 }, "*");
        }
      } catch (err) {
        window.postMessage({ type: "ENFOQUE_PRECO_QUERY_RESULT", requestId, ok: false, error: String(err && err.message ? err.message : err) }, "*");
      }
      return;
    }

    // Validação: checa se o token funciona
    if (data.type === "ENFOQUE_VALIDATE") {
      const requestId = data.requestId;
      const token = data.token;
      try {
        const json = await apiPost(API_URL_REPORT_PRECO, buildPayloadValidateReport(), token);
        window.postMessage({ type: "ENFOQUE_VALIDATE_RESULT", requestId, ok: true, data: json }, "*");
      } catch (err) {
        window.postMessage({ type: "ENFOQUE_VALIDATE_RESULT", requestId, ok: false, error: String(err && err.message ? err.message : err) }, "*");
      }
      return;
    }

    // Pedidos: busca por filtros (data inicial, data final, empresa, etc.)
    if (data.type === "ENFOQUE_PEDIDOS_QUERY") {
      const requestId = data.requestId;
      const token = data.token;
      const payload = data.payload;

      try {
        const json = await apiPost(API_URL_PEDIDOS, payload, token);
        window.postMessage({ type: "ENFOQUE_PEDIDOS_QUERY_RESULT", requestId, ok: true, data: json }, "*");
      } catch (err) {
        window.postMessage({ type: "ENFOQUE_PEDIDOS_QUERY_RESULT", requestId, ok: false, error: String(err && err.message ? err.message : err) }, "*");
      }
      return;
    }

    // Chamada genérica de API (page-world) - usada pelo Relatório de Clientes
    if (data.type === "ENFOQUE_API_CALL") {
      const requestId = data.requestId;
      const url = data.url;
      const method = (data.method ? String(data.method) : (data.payload === undefined ? "GET" : "POST")).toUpperCase();
      const token = data.token;
      const payload = data.payload;
      const headersIn = (data.headers && typeof data.headers === "object") ? data.headers : {};
      const referrer = data.referrer;
      const referrerPolicy = data.referrerPolicy;

      try {
        const t = normalizeBearer(token || window.__enfoqueLatestBearer);
        if (!t) throw new Error("TOKEN_AUSENTE");

        const headers = Object.assign({}, headersIn);
        if (!headers.Authorization && !headers.authorization) headers.Authorization = t;

        const isGetLike = (method === "GET" || method === "HEAD");
        // Só define Content-Type quando há body (evita problemas em GET)
        if (!isGetLike && payload !== undefined) {
          if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json;charset=UTF-8";
        } else {
          try { delete headers["Content-Type"]; } catch (_) {}
          try { delete headers["content-type"]; } catch (_) {}
        }
        if (!headers.Accept && !headers.accept) headers.Accept = "application/json, text/plain, */*";

        const fetchInit = {
          method,
          credentials: "include",
          headers,
          body: (!isGetLike && payload !== undefined) ? JSON.stringify(payload) : undefined
        };

        // Permite forçar referrer same-origin (quando o usuário está em rota 404)
        try {
          if (referrer && typeof referrer === "string") fetchInit.referrer = referrer;
          if (referrerPolicy && typeof referrerPolicy === "string") fetchInit.referrerPolicy = referrerPolicy;
        } catch (_) {}

        const resp = await fetch(url, fetchInit);
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}

        if (resp.status === 401 || resp.status === 403) throw new Error("TOKEN_INVALIDO");
        if (!resp.ok) throw new Error("HTTP_" + resp.status + "|" + (text || ""));

        window.postMessage({ type: "ENFOQUE_QUERY_RESULT", requestId, ok: true, data: json !== null ? json : text }, "*");
      } catch (err) {
        window.postMessage({ type: "ENFOQUE_QUERY_RESULT", requestId, ok: false, error: String(err && err.message ? err.message : err) }, "*");
      }
      return;
    }
  });
})();
