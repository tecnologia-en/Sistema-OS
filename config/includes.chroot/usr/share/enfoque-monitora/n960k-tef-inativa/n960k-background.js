/* Enfoque N960K: pairing is automatic over loopback, never embedded in extension files.
   Chrome extension ID is fixed by manifest.key and verified by the local bridge.
   All sale requests still require an explicit operator action on the SIGE PDV. */
const ENFOQUE_N960K_LOCAL_BASE = 'http://127.0.0.1:8879';
const enfoqueN960KTabJobs=new Map();
const enfoqueN960KAllowedPDV=/^https:\/\/enfoquepapelaria\.meusige\.com\.br\/sistema\/pdv(?:\/|\?|#|$)/i;
function enfoqueN960KRecordTab(tabId,action,payload,data) {
  if (!Number.isInteger(tabId)) return;
  if (['home','start'].includes(action) && typeof data?.jobId==='string') {
    if (!enfoqueN960KTabJobs.has(tabId)) enfoqueN960KTabJobs.set(tabId,new Set());
    enfoqueN960KTabJobs.get(tabId).add(data.jobId);
  }
  if (action==='ack'||action==='cancel') {
    const list=enfoqueN960KTabJobs.get(tabId);
    if(list){list.delete(payload.jobId);if(!list.size) enfoqueN960KTabJobs.delete(tabId)}
  }
}
function enfoqueN960KAbandonTab(tabId) {
  const jobs=enfoqueN960KTabJobs.get(tabId);
  if(!jobs)return;
  enfoqueN960KTabJobs.delete(tabId);
  // NUNCA cancelar transacao na troca/fechamento de aba: HID deve permanecer
  // ate clique EXPLICITO em Aprovado, Cancelar ou Voltar da ultima tela.
  console.warn('[Enfoque N960K] Aba SIGE mudou com sessao N960K pendente. HID preservado para nao cancelar pagamento.',[...jobs]);
}

try {
  chrome.tabs?.onRemoved?.addListener(tabId=>enfoqueN960KAbandonTab(tabId));
  chrome.tabs?.onUpdated?.addListener((tabId,change)=>{
    if(change?.url && !enfoqueN960KAllowedPDV.test(change.url)) enfoqueN960KAbandonTab(tabId);
  });
} catch(error){console.warn('[N960K] Nao foi possivel monitorar fechamento de abas. Timeout local continua ativo.')}

let enfoqueN960KRuntimeToken = null;
let enfoqueN960KPairingPromise = null;

async function enfoqueN960KPair(force) {
  if (force) enfoqueN960KRuntimeToken = null;
  if (enfoqueN960KRuntimeToken) return enfoqueN960KRuntimeToken;
  if (enfoqueN960KPairingPromise) return enfoqueN960KPairingPromise;
  enfoqueN960KPairingPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(ENFOQUE_N960K_LOCAL_BASE + '/v1/handshake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Enfoque-Extension-ID': chrome.runtime.id,
          'X-Enfoque-Bridge-Protocol': '2'
        },
        body: '{}',
        cache: 'no-store',
        targetAddressSpace: 'loopback',
        signal: controller.signal
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok || !/^[a-f0-9]{64}$/i.test(String(json.token || ''))) {
        throw new Error(json.error || 'Nao foi possivel obter a chave local da N960K.');
      }
      enfoqueN960KRuntimeToken = String(json.token);
      return enfoqueN960KRuntimeToken;
    } catch (error) {
      throw new Error('Ponte N960K local indisponivel ou nao autorizada. O agente deve estar ativo no Enfoque OS/Windows. Detalhe: ' +
        String(error?.message || error));
    } finally {
      clearTimeout(timer);
      enfoqueN960KPairingPromise = null;
    }
  })();
  return enfoqueN960KPairingPromise;
}

function enfoqueN960KValidate(action, payload) {
  if (!['health','home','start','job','ack','heartbeat','cancel','navigate'].includes(action)) throw new Error('Acao N960K desconhecida.');
  if (action === 'start' || action === 'home') {
    if (!payload || !Number.isSafeInteger(payload.amountCents) || payload.amountCents < 1 || payload.amountCents > 100000000)
      throw new Error('Valor invalido para a maquininha.');
    if (!['CREDIT','DEBIT','PIX'].includes(payload.method)) throw new Error('Meio invalido.');
    if (!Number.isInteger(payload.installments) || payload.installments < 1 || payload.installments > 12)
      throw new Error('Numero de parcelas invalido.');
    if (payload.method !== 'CREDIT' && payload.installments !== 1) throw new Error('Parcelamento apenas para credito.');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(String(payload.requestId || ''))) throw new Error('Identificador invalido.');
  }
  if (['job','ack','heartbeat','cancel','navigate'].includes(action) && !/^[A-Za-z0-9_-]{1,120}$/.test(String(payload.jobId || '')))
    throw new Error('ID da transacao invalido.');
  if(action==='navigate' && payload.confirmedNoPayment!==true) throw new Error('Confirme ausencia de pagamento antes da navegacao.');
  if(action==='cancel' && !['pdv_closed','payment_table_missing','queue_changed','operator_cancelled','pdv_back','session_timeout','page_unloaded','tab_closed'].includes(payload.reason))
    throw new Error('Motivo de cancelamento local invalido.');
}

async function enfoqueN960KRequest(action, payload) {
  enfoqueN960KValidate(action, payload);
  const endpoint = action==='health' ? '/v1/health' :
    action==='home' ? '/v1/home' : action==='start' ? '/v1/start' :
    action==='job' ? '/v1/job?jobId=' + encodeURIComponent(payload.jobId) :
    action==='navigate' ? '/v1/navigate' :
    action==='ack' ? '/v1/ack' : action==='heartbeat' ? '/v1/heartbeat' : '/v1/cancel';
  for (let attempt=0;attempt<2;attempt++) {
    const token = await enfoqueN960KPair(attempt>0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (action==='home'||action==='ack'||action==='navigate')?18000:7000);
    let response;
    let body;
    try {
      response = await fetch(ENFOQUE_N960K_LOCAL_BASE + endpoint, {
        method: ['home','start','ack','heartbeat','cancel','navigate'].includes(action) ? 'POST' : 'GET',
        headers: {
          'X-Enfoque-N960K-Key': token,
          'X-Enfoque-Extension-ID': chrome.runtime.id,
          'Content-Type': 'application/json'
        },
        ...(['home','start','ack','heartbeat','cancel','navigate'].includes(action) ? {body:JSON.stringify(payload)} : {}),
        cache: 'no-store',
        targetAddressSpace: 'loopback',
        signal: controller.signal
      });
      body = await response.json().catch(() => ({}));
    } finally {
      clearTimeout(timer);
    }
    // Regenerates the runtime session automatically on a rotated/expired local token.
    // Reinicios da ponte giram o token; algumas versoes retornam HTTP 400.
    // Reemparelhar SOMENTE em erro de chave autentica, nunca em erro de pagamento.
    if(attempt===0 && (response.status===401 ||
       (response.status===400 && String(body?.error||'').includes('Sessao local nao autenticada')))) {
      enfoqueN960KRuntimeToken=null;
      continue;
    }
    if (!response.ok || body.ok === false) throw new Error(body.error || 'Ponte local HTTP ' + response.status);
    return body;
  }
  throw new Error('Nao foi possivel autenticar automaticamente a ponte N960K.');
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.type !== 'ENFOQUE_N960K_LOCAL') return false;
  const url = String(sender.tab?.url || sender.url || '');
  // Restrict commands to the real SIGE PDV page; no arbitrary web pages or extensions.
  if (!enfoqueN960KAllowedPDV.test(url)) {
    respond({ok:false,error:'Origem nao autorizada para comandos da N960K.'});
    return false;
  }
  enfoqueN960KRequest(msg.action, msg.payload || {})
    .then(data => {enfoqueN960KRecordTab(sender.tab?.id,msg.action,msg.payload||{},data);respond({ok:true,data})})
    .catch(error => respond({ok:false,error:String(error?.message || error)}));
  return true;
});

