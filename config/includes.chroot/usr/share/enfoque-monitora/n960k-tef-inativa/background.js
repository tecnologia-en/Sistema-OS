const SIGE_ORIGIN = 'https://enfoquepapelaria.meusige.com.br';
const DEFAULT_REPO_OWNER = 'tecnologia-en';
const DEFAULT_REPO_NAME = 'bearer-token';
const DEFAULT_BRANCH = 'main';
const COOKIE_FILE_PATH = 'captured_cookie.txt';
const TOKEN_FILE_PATH = 'captured_token.txt';
const META_FILE_PATH = 'captured_cookie_meta.json';

const COOKIE_URLS = [
  'https://enfoquepapelaria.meusige.com.br/',
  'https://enfoquepapelaria.meusige.com.br/sistema/',
  'https://enfoquepapelaria.meusige.com.br/sistema/Inicial',
  'https://enfoquepapelaria.meusige.com.br/sistema/Produtos/List',
  'https://enfoquepapelaria.meusige.com.br/sistema/Produtos/Edit',
  'https://enfoquepapelaria.meusige.com.br/sistema/NotasEntrada/List'
];

const IMPORTANT_COOKIE_NAMES = new Set([
  'ASP.NET_SessionId',
  '.ASPXAUTH',
  'sigeusertoken',
  'selectedMenuItem',
  '__utma',
  '__utmb',
  '__utmc',
  '__utmt',
  '__utmz'
]);

let captureTimer = null;
let captureInFlight = false;
let lastCookieText = '';
let lastTokenText = '';
let lastMetaText = '';

function uniqByName(cookies) {
  const map = new Map();
  for (const cookie of cookies || []) {
    if (!cookie || !cookie.name) continue;
    const current = map.get(cookie.name);
    if (!current || Number(cookie.expirationDate || 0) >= Number(current.expirationDate || 0)) {
      map.set(cookie.name, cookie);
    }
  }
  return Array.from(map.values());
}

function sanitizeCookieValue(value) {
  return String(value || '').replace(/[\r\n;]/g, '').trim();
}

function normalizeSigeBearerToken(value) {
  const raw = String(value || '').trim().replace(/^Bearer\s+/i, '').trim();
  if (!raw) return '';
  if (/^github_pat_/i.test(raw) || /^gh[pousr]_/i.test(raw)) return '';
  // Os Bearers SIGE observados para /api/v2 usam 32 caracteres hex.
  if (/^[a-f0-9]{32}$/i.test(raw)) return raw;
  return '';
}

function formatCookieHeader(cookies, token) {
  const selected = uniqByName(cookies)
    .filter((cookie) => IMPORTANT_COOKIE_NAMES.has(cookie.name) || /^__utm/.test(cookie.name))
    .map((cookie) => `${cookie.name}=${sanitizeCookieValue(cookie.value)}`)
    .filter((part) => /=.+/.test(part));

  const hasSigeUserToken = selected.some((part) => part.startsWith('sigeusertoken='));
  if (!hasSigeUserToken && token) {
    selected.push(`sigeusertoken=${sanitizeCookieValue(token)}`);
  }

  return selected.join('; ');
}

function getLocalStorageValue(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (values) => resolve(values || {}));
    } catch {
      resolve({});
    }
  });
}

async function getGithubConfig() {
  const values = await getLocalStorageValue([
    'githubToken',
    'github_token',
    'repoOwner',
    'repoName',
    'repoBranch'
  ]);
  return {
    token: values.githubToken || values.github_token || '',
    owner: values.repoOwner || DEFAULT_REPO_OWNER,
    repo: values.repoName || DEFAULT_REPO_NAME,
    branch: values.repoBranch || DEFAULT_BRANCH
  };
}

function encodeBase64Utf8(text) {
  return btoa(unescape(encodeURIComponent(String(text || ''))));
}

async function getGithubFileSha(config, path) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (response.status === 404) return '';
  if (!response.ok) throw new Error(`GitHub GET ${path} HTTP ${response.status}`);
  const json = await response.json();
  return json.sha || '';
}

async function putGithubFile(config, path, content, message) {
  if (!config.token) throw new Error('GitHub token ausente na extensao.');
  const sha = await getGithubFileSha(config, path);
  const body = {
    message,
    content: encodeBase64Utf8(content),
    branch: config.branch
  };
  if (sha) body.sha = sha;

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(path)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub PUT ${path} HTTP ${response.status}: ${text.slice(0, 250)}`);
  }
  return response.json();
}

async function getCookiesFromChrome() {
  const all = [];
  for (const url of COOKIE_URLS) {
    try {
      const cookies = await chrome.cookies.getAll({ url });
      all.push(...cookies);
    } catch (error) {
      console.warn('[bearer-token] Falha ao ler cookies de', url, error);
    }
  }
  return uniqByName(all);
}

async function discoverTokenFromCookiesOrStorage(cookies) {
  const cookieToken = cookies.find((cookie) => cookie.name === 'sigeusertoken')?.value || '';
  if (cookieToken) return cookieToken.trim();

  const values = await getLocalStorageValue([
    'sige_api_token_header',
    'sige_api_token_manual',
    'sige_api_token',
    'capturedToken',
    'sigeusertoken',
    'bearerToken'
  ]);
  return String(
    values.sige_api_token_header ||
    values.sige_api_token_manual ||
    values.sige_api_token ||
    values.capturedToken ||
    values.sigeusertoken ||
    values.bearerToken ||
    ''
  ).replace(/^Bearer\s+/i, '').trim();
}

function buildMeta(cookies, token, cookieHeader) {
  const names = cookies.map((cookie) => cookie.name).sort();
  const hasAspSession = names.includes('ASP.NET_SessionId');
  const hasAspxAuth = names.includes('.ASPXAUTH');
  const hasSigeToken = Boolean(token || names.includes('sigeusertoken'));
  return {
    capturedAt: new Date().toISOString(),
    readyForWebForms: Boolean(hasAspSession && hasAspxAuth),
    readyForAjax: Boolean(hasAspSession && hasAspxAuth && hasSigeToken),
    hasAspSession,
    hasAspxAuth,
    hasSigeToken,
    cookieCount: cookies.length,
    cookieNames: names,
    chars: cookieHeader.length
  };
}

async function captureAndUpload(reason = 'manual') {
  if (captureInFlight) return;
  captureInFlight = true;
  try {
    const cookies = await getCookiesFromChrome();
    const token = await discoverTokenFromCookiesOrStorage(cookies);
    const normalizedToken = normalizeSigeBearerToken(token);
    const cookieHeader = formatCookieHeader(cookies, normalizedToken);
    const cookieText = `Cookie: ${cookieHeader}\n`;
    const tokenText = normalizedToken ? `${normalizedToken}\n` : '';
    const meta = buildMeta(cookies, normalizedToken, cookieHeader);
    const metaText = `${JSON.stringify(meta, null, 2)}\n`;

    if (!cookieHeader && !normalizedToken) throw new Error('Nenhum cookie/token MeuSIGE encontrado. Abra uma pagina do SIGE logada.');

    const cookieReadyForWebForms = Boolean(meta.hasAspSession && meta.hasAspxAuth);

    // Novo fluxo: tudo que antes era enviado para a repo agora vai para o backend proprio.
    // O backend grava em /opt/enfoque-extensao-api/data/sige-session/ com nomes iguais aos arquivos antigos.
    if (!cookieReadyForWebForms) {
      console.warn('[bearer-token] Cookie web incompleto enviado mesmo assim como diagnostico; backend mantem os arquivos atuais se vier vazio.', meta);
    }
    await sendSessionToEnfoqueBackend({
      reason,
      cookieText: cookieReadyForWebForms ? cookieText : '',
      tokenText,
      meta,
      metaText,
      legacyPaths: {
        cookie: COOKIE_FILE_PATH,
        token: TOKEN_FILE_PATH,
        meta: META_FILE_PATH
      }
    });
    lastCookieText = cookieText;
    if (tokenText) lastTokenText = tokenText;
    lastMetaText = metaText;
    console.log('[bearer-token] Captura enviada:', reason, buildMeta(cookies, token, cookieHeader));
  } catch (error) {
    console.error('[bearer-token] Falha na captura:', error);
  } finally {
    captureInFlight = false;
  }
}

function scheduleCapture(reason) {
  clearTimeout(captureTimer);
  captureTimer = setTimeout(() => captureAndUpload(reason), 2500);
}

chrome.runtime.onInstalled.addListener(() => scheduleCapture('installed'));
chrome.runtime.onStartup.addListener(() => scheduleCapture('startup'));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = String(tab?.url || '');
  if (url.startsWith(SIGE_ORIGIN)) scheduleCapture('tab-updated');
});

chrome.cookies.onChanged.addListener((changeInfo) => {
  const domain = String(changeInfo?.cookie?.domain || '');
  if (domain.includes('meusige.com.br')) scheduleCapture('cookie-changed');
});

const ENFOQUE_EXTENSION_API_BASE = 'http://187.77.224.66:3317';

async function parseEnfoqueApiResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }

  if (!response.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return data || { ok: true };
}


async function sendSessionToEnfoqueBackend(payload) {
  const response = await fetch(`${ENFOQUE_EXTENSION_API_BASE}/api/session/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  return parseEnfoqueApiResponse(response);
}

async function proxySigeAutocomplete(kind, params) {
  const qs = new URLSearchParams(params || {});
  const path = kind === 'marca' ? '/api/meusige/autocomplete/marca' : '/api/meusige/autocomplete/produto';
  const response = await fetch(`${ENFOQUE_EXTENSION_API_BASE}${path}?${qs.toString()}`, { method: 'GET' });
  return parseEnfoqueApiResponse(response);
}

async function searchEnfoqueProducts(query, limit) {
  const qs = new URLSearchParams({
    q: String(query || ''),
    limit: String(limit || 10)
  });
  const response = await fetch(`${ENFOQUE_EXTENSION_API_BASE}/api/products/search?${qs.toString()}`, { method: 'GET' });
  return parseEnfoqueApiResponse(response);
}

async function saveEnfoqueSchoolCustomer(payload) {
  const response = await fetch(`${ENFOQUE_EXTENSION_API_BASE}/api/schools/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });

  return parseEnfoqueApiResponse(response);
}

async function lookupEnfoqueSchoolCustomer(documentValue) {
  const url = `${ENFOQUE_EXTENSION_API_BASE}/api/schools/customers/lookup?document=${encodeURIComponent(documentValue || '')}`;
  const response = await fetch(url, { method: 'GET' });
  return parseEnfoqueApiResponse(response);
}

async function searchEnfoqueSchoolCustomers(query, limit) {
  const url = `${ENFOQUE_EXTENSION_API_BASE}/api/schools/customers/search?q=${encodeURIComponent(query || '')}&limit=${encodeURIComponent(limit || 12)}`;
  const response = await fetch(url, { method: 'GET' });
  return parseEnfoqueApiResponse(response);
}

async function searchOfficialSchools(query, limit) {
  const url = `${ENFOQUE_EXTENSION_API_BASE}/api/intranet/escolas-descontos/search?q=${encodeURIComponent(query || '')}&limit=${encodeURIComponent(limit || 12)}`;
  const response = await fetch(url, { method: 'GET' });
  return parseEnfoqueApiResponse(response);
}

async function listOfficialSchools() {
  const url = `${ENFOQUE_EXTENSION_API_BASE}/api/intranet/escolas-descontos`;
  const response = await fetch(url, { method: 'GET' });
  return parseEnfoqueApiResponse(response);
}

async function validateSchoolDiscountPassword(senha) {
  const response = await fetch(`${ENFOQUE_EXTENSION_API_BASE}/api/intranet/escolas-descontos/senha/validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ senha: senha || '' })
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { ok: response.ok, http_status: response.status, ...data };
}

async function getSchoolDiscountPasswordStatus() {
  const response = await fetch(`${ENFOQUE_EXTENSION_API_BASE}/api/intranet/escolas-descontos/senha/status`, { method: 'GET' });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { ok: response.ok, http_status: response.status, ...data };
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'capture-now') {
    captureAndUpload('manual-message').then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-school-customer-save') {
    saveEnfoqueSchoolCustomer(message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-school-customer-lookup') {
    lookupEnfoqueSchoolCustomer(message.document || message.cnpj_ou_cpf || message.cpf_cnpj || '')
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-school-customer-search') {
    searchEnfoqueSchoolCustomers(message.query || '', message.limit || 12)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-official-school-search') {
    searchOfficialSchools(message.query || '', message.limit || 12)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-official-school-list') {
    listOfficialSchools()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }


  if (message?.type === 'enfoque-school-discount-password-validate') {
    validateSchoolDiscountPassword(message.senha || message.password || '')
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-school-discount-password-status') {
    getSchoolDiscountPasswordStatus()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-products-search') {
    searchEnfoqueProducts(message.query || message.q || '', message.limit || 10)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-sige-autocomplete-produto') {
    proxySigeAutocomplete('produto', message.params || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'enfoque-sige-autocomplete-marca') {
    proxySigeAutocomplete('marca', message.params || {})
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }


  return false;
});


// Captura Bearer diretamente dos headers de requisicoes /api/v2 do MeuSIGE.
// Isso evita salvar tokens de localStorage/cookie que parecem SIGE, mas nao sao aceitos pela API.
try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      try {
        const url = String(details?.url || '').toLowerCase();
        if (!url.includes('enfoquepapelaria.meusige.com.br/api/')) return;
        const headers = details.requestHeaders || [];
        const authHeader = headers.find((h) => String(h.name || '').toLowerCase() === 'authorization')?.value || '';
        const token = normalizeSigeBearerToken(authHeader);
        if (!token) return;
        chrome.storage.local.get(['sige_api_token_header'], (cur) => {
          if (cur && cur.sige_api_token_header === token) return;
          chrome.storage.local.set({
            sige_api_token_header: token,
            sige_api_token_header_updated_at: new Date().toISOString()
          }, () => {
            console.log('[bearer-token] Bearer SIGE capturado do header Authorization:', token.slice(0, 12) + '...');
            scheduleCapture('authorization-header');
          });
        });
      } catch (error) {
        console.warn('[bearer-token] Falha ao capturar Authorization header:', error);
      }
    },
    { urls: ['https://enfoquepapelaria.meusige.com.br/api/*'] },
    ['requestHeaders', 'extraHeaders']
  );
} catch (error) {
  console.warn('[bearer-token] webRequest indisponivel:', error);
}

setInterval(() => scheduleCapture('interval'), 5 * 60 * 1000);
