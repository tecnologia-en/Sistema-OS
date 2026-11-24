/* Enfoque N960K integration for SIGE. Operates ONLY after operator tries to finish payment. */
(function () {
  'use strict';
  // Instalado no host SIGE inteiro para suportar navegacao SPA ate /sistema/pdv.
  // Acoes reais ficam bloqueadas por onPaymentScreen() e origem da mensagem.
  if (window.__ENFOQUE_N960K_PDV__) return;
  window.__ENFOQUE_N960K_PDV__ = true;

  const logic = window.EnfoqueN960KLogic;
  if (!logic) { console.error('[Enfoque N960K] n960k-logic.js ausente'); return; }
  const PREFIX = 'enfoque-n960k-';
  const SESSION_TIMEOUT_MS=300000; // alerta somente, NUNCA reseta o HID automaticamente
  const MISSING_TABLE_GRACE_MS=2200;
  const HEARTBEAT_MS=6000; // Apenas monitoramento; ausencia nao encerra venda
  const FINALIZAR_MIN_WAIT_MS=3000; // SIGE + imprimir via: same 3-second gate.
  const RECIBO_PAGAMENTO_ID=PREFIX+'receipt-payment';
  const RECIBO_CONCLUIDO_ID=PREFIX+'receipt-success';
  const SAFE_NAVIGATION_REQUIRED=true;
  // Nunca desconectar HID com cartao/PIX processando; confirmar terminal antes.
  const STYLE = `
    #${PREFIX}status {display:inline-flex;align-items:center;gap:7px;margin:6px 0;padding:5px 10px;border-radius:8px;background:#eef4f8;color:#425a6a;border:1px solid #d4e1e9;font:500 11px/1.4 system-ui,Segoe UI,Arial;white-space:normal;max-width:100%;vertical-align:middle;}
    #${PREFIX}inline {position:relative;display:block;clear:both;max-width:790px;margin:8px auto 12px;padding:10px 14px;border-radius:10px;background:#f6f9fc;border:1px solid #cbdae6;color:#213b4d;font:13px/1.45 system-ui,Segoe UI,Arial;box-shadow:0 2px 8px #1525360c;}
    #${PREFIX}inline * {box-sizing:border-box;}
    #${PREFIX}dialog {display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;}
    #${PREFIX}dialog h2 {margin:0;font-size:14px;font-weight:700;color:#173e58;flex-basis:auto;}
    #${PREFIX}dialog p {margin:2px 0;flex-basis:100%;line-height:1.35;}
    #${PREFIX}dialog p.small {color:#506879;font-size:11px;}
    #${PREFIX}dialog .btn {cursor:pointer;min-height:30px;padding:5px 11px;margin:3px 3px 0 0;border:1px solid #aac3d3;background:#e7eff6;color:#1b4664;font-weight:650;border-radius:7px;font-size:12px;}
    #${PREFIX}dialog .btn.main {background:#1571a6;color:#fff;border-color:#12618b;}
    #${PREFIX}dialog .btn:disabled {opacity:.55;cursor:not-allowed;}
    #${PREFIX}dialog label {cursor:pointer;font-size:12px;}
    #${PREFIX}dialog input[type=number] {font:600 15px system-ui;border:1px solid #aac0d0;background:white;border-radius:7px;padding:5px 7px;color:#183044;width:70px;height:32px;}
    #${PREFIX}dialog .small {font-size:11px;color:#506879;}
    #${PREFIX}dialog .message {white-space:pre-wrap;flex-basis:100%;background:#fff;border:1px solid #e1e8ee;border-radius:7px;padding:7px;color:#4e5e6a;}
    #${PREFIX}dialog .enfoque-n960k-inline-decision {flex-basis:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid #d5e2e9;margin-top:7px;padding-top:7px;}
    #controllerPDV #logoSIGE {pointer-events:none !important;opacity:.43 !important;cursor:not-allowed !important;}
    #contentPagamentos #btnVoltarPagamentos {cursor:pointer;}
    #contentPagamentos #btnFinalizarVendaPagamentos:disabled {opacity:.52;cursor:not-allowed;}
    /* CometDial-inspired cancellation screen: pure CSS/SVG, no React runtime in the SIGE extension. */
    #enfoque-n960k-cancel-loading {position:fixed !important;inset:0 !important;z-index:2147483647 !important;display:flex !important;align-items:center !important;justify-content:center !important;background:rgba(4,15,13,.82) !important;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);pointer-events:auto !important;touch-action:none;overscroll-behavior:contain;user-select:none;-webkit-user-select:none;cursor:wait;}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-stack {display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;min-width:250px;max-width:90vw;text-align:center;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-svg {display:block;width:190px;height:190px;overflow:visible;filter:drop-shadow(0 0 11px rgba(38,226,142,.25));}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-track {fill:none;stroke:rgba(178,244,211,.23);stroke-width:5;stroke-linecap:round;}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-rotor {transform-origin:100px 100px;transform-box:view-box;animation:enfoque-n960k-comet-turn 1.65s linear infinite;}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-segment {fill:none;stroke:#2ae48f;stroke-linecap:round;}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-head {fill:#5bffad;filter:drop-shadow(0 0 5px #2ae48f);}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-center {fill:rgba(42,228,143,.08);stroke:rgba(42,228,143,.22);stroke-width:1.5;}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-message {margin:0;color:#f3fff9;font-size:18px;font-weight:600;line-height:1.3;letter-spacing:.015em;text-shadow:0 1px 5px rgba(0,0,0,.36);}
    #enfoque-n960k-cancel-loading .enfoque-n960k-comet-message span {color:#65f9aa;}
    @keyframes enfoque-n960k-comet-turn {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){#enfoque-n960k-cancel-loading .enfoque-n960k-comet-rotor{animation:enfoque-n960k-comet-turn 5s linear infinite;}}
  `;
  const state = {
    session: null, allowFinishOnce: false, allowBackOnce: false, busy: false,
    lastChosenButton: '', lastScreenTotal: null, lastError: '',
    mount: null, overlay: null, pollTimer: null, bridgeStatus: null,
    pendingDecision:null, idleDisplayUntil:null, backUnlocked:false,
    cancelLoading:null, cancelPreviousFocus:null, receiptPending:false
  };
  const brl = cents => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const byId = id => document.getElementById(id);
  function visible(el) {
    if (!el || !document.documentElement.contains(el)) return false;
    let p = el;
    for (let i=0;p && i<8;i++,p=p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function onPaymentScreen() { return visible(byId('contentPagamentos')); }
  function text(el) { return String(el ? (el.textContent || el.innerText || '') : '').trim(); }
  function rawRows() {
    const table = byId('tabelaPagamentos');
    if (!table) return [];
    const all = [...table.querySelectorAll('tbody')].filter(tb => tb.querySelector('.tbFormaPagamento,.tbValor') && visible(tb));
    return all.map(tb => {
      const first = tb.querySelector('tr:first-child') || tb;
      const methodText = text(first.querySelector('.tbFormaPagamento') || tb.querySelector('.tbFormaPagamento'));
      const amountText = text(first.querySelector('.tbValor') || tb.querySelector('.tbValor'));
      const condition = tb.querySelector('select[ng-model="item.CondicaoPagamento"]');
      const desc = tb.querySelector('input[ng-model="item.CredenciadoraCartao"]');
      // SIGE already renders Numero de parcelas on the A prazo condition.
      // Do not add a second selector or modify the native input.
      const parcelas=tb.querySelector('input[ng-model="item.Parcelas"]');
      return {methodText, amountText, condition:condition?.value||'',
        creditDescriptor:desc?.value||'', installmentsField:parcelas?.value||''};
    });
  }
  function readTotal() {
    const p = byId('contentPagamentos');
    const total = p?.querySelector('#totalPagamento #totalPedido') || p?.querySelector('#totalPedido');
    return logic.centsFromBRL(text(total));
  }
  function snapshot() {
    const raw = rawRows();
    if (!raw.length) throw new Error('A lista de pagamentos ainda esta vazia. Adicione uma forma de pagamento antes de finalizar.');
    const rows = logic.ensureRows(raw, readTotal());
    return {rows, fingerprint:logic.rowFingerprint(rows), totalCents:readTotal()};
  }
  function bridgeRuntime() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime ||
          typeof chrome.runtime.sendMessage !== 'function') return null;
      return chrome.runtime;
    } catch (_) { return null; }
  }
  function sendToBridge(action, payload={}) {
    return new Promise((resolve,reject) => {
      const runtime=bridgeRuntime();
      if(!runtime) {
        reject(new Error('A extensao perdeu o contexto do Chrome. Abra novamente o PDV em uma aba atualizada, sem venda pendente.'));
        return;
      }
      let finished=false;
      const timer=setTimeout(()=>{
        if(finished)return;
        finished=true;
        reject(new Error('A ponte N960K nao respondeu em 18s. Nao reenvie sem conferir a maquininha.'));
      },18000);
      try {
        runtime.sendMessage({type:'ENFOQUE_N960K_LOCAL',action,payload},(response)=>{
          if(finished)return;
          finished=true;clearTimeout(timer);
          let chromeError=null;
          try { chromeError=runtime.lastError?.message||null; }
          catch (_) { chromeError='Contexto da extensao foi encerrado durante a comunicacao.'; }
          if(chromeError) return reject(new Error(chromeError));
          if(!response||!response.ok) return reject(new Error(response?.error || 'Ponte N960K nao respondeu.'));
          resolve(response.data||{});
        });
      } catch(e) { if(!finished){finished=true;clearTimeout(timer);reject(e)} }
    });
  }
  function el(tag, cssClass='', textValue='') {
    const n=document.createElement(tag);
    if (cssClass) n.className=cssClass;
    if (textValue) n.textContent=textValue;
    return n;
  }
  function showCancelLoading() {
    if(state.cancelLoading)return;
    const svgNS='http://www.w3.org/2000/svg';
    const makeSvg=(tag,attrs={})=>{
      const node=document.createElementNS(svgNS,tag);
      for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
      return node;
    };
    const pointAt=deg=>{
      const a=deg*Math.PI/180;
      return [100+80*Math.cos(a),100+80*Math.sin(a)];
    };
    const arc=(a0,a1)=>{
      const p0=pointAt(a0),p1=pointAt(a1);
      return 'M '+p0[0].toFixed(3)+' '+p0[1].toFixed(3)+
        ' A 80 80 0 '+(a1-a0>180?1:0)+' 1 '+
        p1[0].toFixed(3)+' '+p1[1].toFixed(3);
    };
    const overlay=el('div');
    overlay.id=PREFIX+'cancel-loading';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-busy','true');
    overlay.setAttribute('aria-labelledby',PREFIX+'cancel-message');
    overlay.setAttribute('tabindex','-1');

    const stack=el('div','enfoque-n960k-comet-stack');
    const svg=makeSvg('svg',{class:'enfoque-n960k-comet-svg',
      viewBox:'0 0 200 200','aria-hidden':'true',focusable:'false'});
    svg.appendChild(makeSvg('path',{class:'enfoque-n960k-comet-track',d:arc(110,430)}));
    svg.appendChild(makeSvg('circle',{class:'enfoque-n960k-comet-center',
      cx:100,cy:100,r:47}));
    const rotor=makeSvg('g',{class:'enfoque-n960k-comet-rotor'});
    // Smooth, tapering green comet trail behind the moving bead.
    for(let i=0;i<12;i++) {
      const weight=(i+1)/12;
      rotor.appendChild(makeSvg('path',{class:'enfoque-n960k-comet-segment',
        d:arc(205+i*11,205+i*11+10.7),
        'stroke-width':(3.5+7.5*weight).toFixed(2),
        opacity:(0.06+0.92*weight*weight).toFixed(3)}));
    }
    const head=pointAt(337.7);
    rotor.appendChild(makeSvg('circle',{class:'enfoque-n960k-comet-head',
      cx:head[0].toFixed(3),cy:head[1].toFixed(3),r:6.1}));
    svg.appendChild(rotor);
    stack.appendChild(svg);
    const message=el('p','enfoque-n960k-comet-message');
    message.id=PREFIX+'cancel-message';
    message.appendChild(document.createTextNode('Cancelando. '));
    message.appendChild(el('span','','Aguarde.'));
    stack.appendChild(message);
    overlay.appendChild(stack);
    const eatEvent=e=>{e.preventDefault();e.stopImmediatePropagation()};
    for(const type of ['click','dblclick','mousedown','mouseup','pointerdown',
      'pointerup','touchstart','touchend','contextmenu']) {
      overlay.addEventListener(type,eatEvent,true);
    }
    overlay.addEventListener('wheel',eatEvent,{capture:true,passive:false});
    state.cancelPreviousFocus=document.activeElement;
    state.cancelLoading=overlay;
    document.body.appendChild(overlay);
    overlay.focus({preventScroll:true});
  }
  function pixCancelLoadingPhase(phase) {
    // The overlay blocks the SIGE from the first Cancelar click.
    // During touch reports: static overlay (no running countdown).
    // Once all three reports have returned: 7 seconds animated green.
    // During the eighth second: spinner stops, overlay remains to block
    // clicks until the existing /v1/cancel safely releases the HID.
    const overlay=state.cancelLoading;
    if(!overlay)return;
    overlay.dataset.pixPhase=phase;
    const rotor=overlay.querySelector('.enfoque-n960k-comet-rotor');
    const svg=overlay.querySelector('.enfoque-n960k-comet-svg');
    const msg=overlay.querySelector('#'+PREFIX+'cancel-message');
    if(phase==='touching') {
      if(rotor)rotor.style.animationPlayState='paused';
      if(svg)svg.style.opacity='.35';
      if(msg)msg.textContent='Enviando toques...';
    }else if(phase==='waiting') {
      if(rotor) {
        rotor.style.animation='';
        rotor.style.animationPlayState='running';
      }
      if(svg)svg.style.opacity='1';
      if(msg)msg.textContent='Cancelando. Aguarde.';
    }
  }
  function delayPixCancel(ms) {
    return new Promise(resolve=>setTimeout(resolve,ms));
  }
  function hideCancelLoading() {
    const overlay=state.cancelLoading;
    if(!overlay)return;
    state.cancelLoading=null;
    overlay.remove();
    const target=state.backUnlocked?byId('btnVoltarPagamentos'):
      state.cancelPreviousFocus;
    state.cancelPreviousFocus=null;
    if(target && document.documentElement.contains(target)) {
      try{target.focus({preventScroll:true})}catch(_){}
    }
  }
  // While the full-screen loading is active, SIGE keyboard shortcuts,
  // including F8, cannot trigger a second action behind the dark overlay.
  document.addEventListener('keydown',event=>{
    if(!state.cancelLoading)return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  function button(label, cb, primary=false) {
    const b=el('button','btn'+(primary?' main':''),label);
    b.type='button'; b.addEventListener('click', ev=>{ev.preventDefault();ev.stopPropagation();cb()},true);
    return b;
  }
  function syncCreditInputs() {
    // Remove the addon from the previous extension version if the SIGE
    // is still showing a SPA view from before the extension was reloaded.
    // Leave the SIGE's own Numero de parcelas unchanged.
    const table=byId('tabelaPagamentos');
    if(!table)return;
    for(const addon of table.querySelectorAll('[data-enfoque-n960k-period-addon]'))
      addon.remove();
  }
  function creditOnTerms(row) {
    // In the SIGE: 0 = A vista; 1 = A prazo. When A vista the field
    // Numero de parcelas does not exist and must NOT be required.
    if(String(row.condition)==='0')return false;
    if(String(row.condition)==='1')return true;
    return logic.installmentsKind({method:'CREDIT',
      creditDescriptor:row.creditDescriptor,
      condition:row.condition,installmentsField:row.installmentsField})!=='vista';
  }
  function creditReady() {
    const rows=rawRows();
    for(const row of rows) {
      if(logic.paymentType(row.methodText)!=='CREDIT')continue;
      const desc=String(row.creditDescriptor||'').trim();
      if(!desc)return {ok:false,message:'Preencha a Credenciadora do credito.'};
      if(creditOnTerms(row)) {
        const range=logic.installmentRange(desc);
        const n=Number(row.installmentsField);
        const min=range?.min||2,max=range?.max||12;
        // Number('') would be zero, but an empty/zero field must always
        // block MAQUININHA when the native SIGE field is required.
        if(!String(row.installmentsField).trim()||
           !Number.isInteger(n)||n===0||n<min||n>max)
          return {ok:false,message:'Preencha Numero de parcelas ('+min+' a '+max+') no SIGE.'};
      }
    }
    return {ok:true,message:''};
  }
  function updatePaymentButtons() {
    if(!onPaymentScreen())return;
    syncCreditInputs();
    const finish=byId('btnFinalizarVendaPagamentos');
    const cancel=byId('btnVoltarPagamentos');
    const session=state.session;
    let machineCount=0;
    try { machineCount=logic.ensureRows(rawRows()).filter(r=>r.terminal).length; }
    catch(_) { try {machineCount=rawRows().filter(r=>Boolean(logic.paymentType(r.methodText))).length;} catch(_){} }
    const queue=session?.queue||[];
    const count=queue.length||machineCount;
    const nextIndex=session?queue.findIndex(q=>q.stage==='pending'):0;
    const pendingNext=Boolean(session&&nextIndex>=0);
    const hasTEF=count>0;
    const name=!hasTEF?'FINALIZAR VENDA':
      (!session||pendingNext)
        ? (count>1?'MAQUININHA '+(session?nextIndex+1:1)+'/'+count:'MAQUININHA')
        : 'FINALIZAR VENDA';
    if(finish&&finish.value!==name)finish.value=name;
    if(cancel) {
      const label=state.backUnlocked?'VOLTAR':'CANCELAR';
      if(cancel.value!==label)cancel.value=label;
    }
    const check=creditReady();
    if(finish) {
      const cooldown=Math.max(0,(session?.current?.finalizeAvailableAtMs||0)-Date.now());
      // Cada etapa tem seus 3 segundos; nunca liberar o SIGE durante um envio USB multiplo.
      const multi=Boolean(session&&queue.length>1);
      const current=session?.current;
      const allPriorDone=queue.length>0&&queue.slice(0,-1).every(q=>q.stage==='done');
      const lastReady=Boolean(current&&current===queue[queue.length-1]&&current.stage==='sent'&&allPriorDone);
      const lock=(hasTEF&&!session&&!check.ok) ||
        Boolean(session&&(cooldown>0||state.busy||session.terminating||session.invalidated||
          (!check.ok&&pendingNext)||
          (multi&&(current?current.stage!=='sent':true))||
          (multi&&!pendingNext&&!lastReady)));
      if(lock) {
        if(!finish.disabled) {
          finish.disabled=true;finish.dataset.enfoqueN960kLocked='1';
        }
      }else if(finish.dataset.enfoqueN960kLocked==='1') {
        finish.disabled=false;delete finish.dataset.enfoqueN960kLocked;
      }
      finish.title=cooldown>0
        ? 'Aguarde '+Math.ceil(cooldown/1000)+'s para a proxima etapa N960K'
        : lock&&state.busy ? 'Aguarde o envio e a confirmacao USB da etapa atual'
        : lock&&current?.stage==='error' ? 'Falha USB: confira o terminal e utilize Cancelar'
        : lock&&!check.ok ? check.message
        : pendingNext ? 'Confirme a aprovacao da etapa anterior no terminal antes de enviar '+(nextIndex+1)+'/'+count
        : session ? 'Confira a aprovacao da ultima etapa na N960K antes de finalizar no SIGE'
        : 'Enviar a primeira forma de pagamento para a N960K';
    }
  }
  // Reuse the exact native SIGE classes. No new CSS or Angular handlers.
  function makeCustomerReceiptButton(nativeButton,id,source) {
    const input=document.createElement('input');
    input.type='button';
    input.id=id;
    input.className=nativeButton.className;
    input.value='IMPRIMIR VIA DO CLIENTE';
    input.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      void printCustomerReceipt(source,input);
    },true);
    return input;
  }
  function syncCustomerReceiptButtons() {
    // The receipt command is intentionally available ONLY on the later
    // sale-complete screen. Always remove a leftover payment-screen button
    // from an older extension version or an already-open SIGE SPA page.
    const pay=byId(RECIBO_PAGAMENTO_ID);
    if(pay)pay.remove();
    const paymentVisible=onPaymentScreen() && visible(byId('btnFinalizarVendaPagamentos'));
    const nativeNewSale=byId('btnReinicio');
    const finishedVisible=!paymentVisible && visible(nativeNewSale);
    let done=byId(RECIBO_CONCLUIDO_ID);
    if(finishedVisible) {
      if(!done) {
        done=makeCustomerReceiptButton(nativeNewSale,RECIBO_CONCLUIDO_ID,'success');
        const line= nativeNewSale.nextElementSibling?.tagName==='BR' ?
          nativeNewSale.nextElementSibling:null;
        (line||nativeNewSale).insertAdjacentElement('afterend',done);
      }
      done.disabled=state.receiptPending;
      done.title='Aciona 1 e 1 no terminal N960K; confira o visor antes de clicar';
    }else if(done)done.remove();
  }
  async function printCustomerReceipt(source,button) {
    // Only an explicit operator click ever sends these numeric key events.
    if(state.receiptPending)return;
    if(source!=='success')return;
    if(onPaymentScreen() || !visible(byId('btnReinicio')))return;
    state.receiptPending=true;syncCustomerReceiptButtons();
    try{
      const id='via-'+(crypto.randomUUID?.()||String(Date.now()));
      const result=await sendToBridge('receipt',{requestId:id,source});
      if(result.inputSent!==2)
        throw new Error('O agente nao confirmou as duas teclas.');
      button.title='Duas teclas 1 enviadas; confirme a impressao na N960K';
      console.info('[Enfoque N960K] Duas teclas 1 enviadas; a impressao fisica nao e verificavel por USB.');
    }catch(error){
      console.error('[Enfoque N960K] Falha no comando de via do cliente:',error);
      // An explicit, visible failure prevents pretending that paper was printed.
      window.alert('Nao foi possivel solicitar a via do cliente na maquininha. '+String(error?.message||error));
    }finally{
      state.receiptPending=false;syncCustomerReceiptButtons();
    }
  }
  function updateIndicator() {
    if (!document.body) return;
    updatePaymentButtons();
    syncCustomerReceiptButtons();
    let badge=byId(PREFIX+'status');
    if (!onPaymentScreen()) {state.backUnlocked=false;if(badge)badge.remove();return}
    const host=byId('contentButtonsPagamentos');
    if(!host)return;
    if (!badge) {badge=el('div');badge.id=PREFIX+'status';host.insertAdjacentElement('afterend',badge)}
    else if(badge.previousElementSibling!==host)host.insertAdjacentElement('afterend',badge);
    let newMessage='';
    try {
      const rows=logic.ensureRows(rawRows());
      const capable=rows.filter(r=>r.terminal);
      state.lastScreenTotal=readTotal();
      newMessage='N960K | Total '+(state.lastScreenTotal==null?'a conferir':brl(state.lastScreenTotal))+' | '+capable.length+' pagamento(s) na maquininha'+(state.session?' | fila em andamento':'')+(state.lastChosenButton?' | ultimo: '+state.lastChosenButton:'');
    } catch {newMessage='N960K | aguardando linhas de pagamento';}
    if(state.session?.queue?.length>1) {
      const current=state.session.current;
      const pos=current?state.session.queue.indexOf(current)+1:1;
      newMessage+=' | etapa '+pos+'/'+state.session.queue.length;
    }
    if (state.bridgeStatus) {
      const b=state.bridgeStatus;
      const label=b.online
        ? (b.ready ? 'USB N960K pronta' : b.detected ? 'N960K USB com driver indisponivel' : 'N960K desconectada')
        : 'Ponte local indisponivel';
      newMessage += ' | ' + label;
      if(b.heartbeat?.stale) newMessage += ' | Heartbeat ausente (apenas monitoramento)';
      if(b.online && state.session?.queue?.some(q=>q.method==='CREDIT' && q.kind!=='vista'))
        newMessage += b.creditContinueMode==='keyboard_enter'
          ? ' | Parcelado: Enter HID'
          : ' | Parcelado: agente precisa atualizar';
      if(!b.online && b.error)
        newMessage += ' (' + b.error.slice(0,75) + ')';
    }
    const idle=state.bridgeStatus?.idle;
    let timerText='';
    if(idle?.phase==='persistent') timerText='HID ativo continuamente; reinicio somente manual';
    else if(idle?.phase==='resetting') timerText='HID: reinicio manual em andamento';
    else if(idle?.phase==='manual_reset_required') timerText='HID: pressione Reiniciar HID apos conferir a maquininha';
    else timerText='HID: aguardando conexao; sem reinicio automatico';
    newMessage += '  |  ' + timerText;
    if(state.lastError) newMessage += ' | '+state.lastError.slice(0,115);
    else if(state.session?.note) newMessage += ' | '+state.session.note.slice(0,96);
    if(badge.textContent!==newMessage)badge.textContent=newMessage;
    badge.title=String(state.bridgeStatus?.error || '');
  }
  function showOverlay() {
    // No overlay / modal: the original controls render inside the SIGE PDV.
    const host=byId('contentButtonsPagamentos');
    if(!host || !onPaymentScreen())return null;
    if(!state.overlay || !document.documentElement.contains(state.overlay)) {
      const holder=el('div');holder.id=PREFIX+'inline';
      const dialog=el('div');dialog.id=PREFIX+'dialog';holder.appendChild(dialog);
      host.insertAdjacentElement('afterend',holder);state.overlay=holder;
    }
    return state.overlay.querySelector('#'+PREFIX+'dialog');
  }
  function closeOverlay() {
    if(state.pendingDecision) {
      const old=state.pendingDecision;state.pendingDecision=null;old.resolve(false);
    }
    if(state.overlay)state.overlay.remove();
    state.overlay=null;
  }
  function askInline(message) {
    if(state.pendingDecision)return Promise.resolve(false);
    return new Promise(resolve=>{
      state.pendingDecision={message,resolve};
      render();
    });
  }
  function finishInlineDecision(yes) {
    const pending=state.pendingDecision;
    if(!pending)return;
    state.pendingDecision=null;
    pending.resolve(Boolean(yes));
    render();
  }
  function showError(error) {
    state.lastError=String(error?.message || error);
    render();
  }
  function labelMethod(row) {
    return row.method==='DEBIT'?'Debito':row.method==='PIX'?'Pix':row.method==='CREDIT'?'Credito':(row.methodText||'Outra forma');
  }
  function rowState(row) {
    const s=state.session;
    if (!row.terminal)return 'Nao enviado (pagamento externo)';
    const idx=s?.queue.findIndex(q=>q.index===row.index);
    const q=idx>=0?s.queue[idx]:null;
    if (!q)return 'Nao iniciado';
    return q.stage==='done'?'Confirmado manualmente':q.stage==='sent'?'Comando enviado; conferir terminal':q.stage==='error'?'Erro; verifique o terminal':q.stage==='sending'?'Enviando comandos...':'Aguardando vez';
  }
  function render() {
    // No modal, approval button, installment panel or additional confirmation.
    closeOverlay();
    updateIndicator();
  }
  function stillSame() {
    const s=state.session;
    if(!onPaymentScreen())throw new Error('A pagina de pagamentos nao esta visivel.');
    const current=snapshot();
    // credit descriptor / installment can mutate from other code; only compare payment amounts/types
    const old=s.rows.map(r=>r.index+':'+r.methodText+':'+r.amountCents).join('|');
    const now=current.rows.map(r=>r.index+':'+r.methodText+':'+r.amountCents).join('|');
    if(old!==now)throw new Error('A lista de pagamentos mudou. Feche e revise a fila antes de iniciar outra cobranca.');
  }
  function goToNext() {
    const session=state.session;
    if(!session||session.stopped||state.busy)return;
    const next=session.queue.find(q=>q.stage==='pending');
    if(!next) {closeOverlay();updateIndicator();return}
    syncCreditInputs();
    const ready=creditReady();
    if(!ready.ok){state.lastError=ready.message;render();return}
    const row=rawRows()[next.index];
    if(next.method==='CREDIT') {
      next.installments=creditOnTerms(row)?Number(row.installmentsField):1;
      if(!Number.isInteger(next.installments)||next.installments<1||next.installments>12) {
        state.lastError='Informe Parcelas validas ao lado de Periodo.';
        render();return;
      }
    }else next.installments=1;
    session.current=next;session.needsInstallments=false;
    const position=session.queue.indexOf(next)+1;
    next.finalizeAvailableAtMs=Date.now()+FINALIZAR_MIN_WAIT_MS;
    // A proxima forma sera enviada somente depois de novo clique do operador.
    setTimeout(()=>{if(state.session===session)updateIndicator()},FINALIZAR_MIN_WAIT_MS);
    session.note='Etapa '+position+'/'+session.queue.length+': enviando '+labelMethod(next)+' para a N960K.';
    state.backUnlocked=false;
    startCurrent();
  }
  async function startCurrent() {
    const s=state.session;if(!s || s.stopped || state.busy || !s.current)return;
    const q=s.current;state.busy=true;state.lastError='';q.stage='sending';
    s.note=`Preparando ${labelMethod(q)} de ${brl(q.amountCents)} na N960K. Aguarde a tela do terminal.`;render();
    try {
      stillSame();
      // Only HID keyboard: Enter opens Vender and continues installments.
      // Verify this is the new bridge rather than the old mouse-based one.
      const preflight=await sendToBridge('health');
      if(preflight.venderNavigationMode!=='keyboard_enter')
        throw new Error('Agente N960K desatualizado: falta Vender pelo Enter. Confira a ponte.');
      if(q.method==='CREDIT' && q.installments>1 &&
         preflight.creditContinueMode!=='keyboard_enter')
        throw new Error('Agente N960K desatualizado: falta Continuar parcelas pelo Enter.');
      // A securely ended Pix may leave its HID registered in standby;
      // it is NOT a pending sale and will be safely reused by /v1/home.
      if(preflight.busy ||
         (preflight.hidHeldAfterSelection && preflight.pixHidStandby!==true) ||
         preflight.usbReleaseError)
        throw new Error('N960K ocupada: confira se a tentativa anterior realmente terminou. Nunca reenviar enquanto houver HID retido por uma venda ativa.');
      if(!preflight.terminal?.driverReady || !preflight.agentReady)
        throw new Error('N960K ou driver indisponivel. Verifique o cabo e o agente, sem repetir a cobranca.');
      const payload={requestId:q.requestId, amountCents:q.amountCents, method:q.method, installments:q.installments};
      // The background sends Home x3 FIRST to the headless Python agent.
      // Only after Python confirms home_ready can it execute the remainder.
      q.jobId=q.requestId;
      const reset=await sendToBridge('home',payload);
      if(reset.stage!=='home_ready' || !reset.homeComplete)
        throw new Error('O Python nao confirmou os tres comandos Home.');
      if((state.session!==s && !s.nativeInvoked) || s.terminating) {
        sendToBridge('cancel',{jobId:q.requestId,reason:'pdv_closed'}).catch(()=>{});
        return;
      }
      // The SIGE operator may already have clicked native Finalizar after
      // three seconds. Keep dispatching the pending USB job in that case.
      if(!s.nativeInvoked)stillSame();
      s.note='ANDROID_BACK + ANDROID_HOME enviados no mesmo HID; iniciando Vender, valor em centavos e modalidade.';
      render();
      const result=await sendToBridge('start',payload);
       const jobId=result.jobId;
       if((state.session!==s && !s.nativeInvoked) || s.terminating) {
         if(jobId) sendToBridge('cancel',{jobId,reason:'pdv_closed'}).catch(()=>{});
         return;
       }
      if(typeof jobId!=='string'||!jobId)throw new Error('Ponte nao retornou identificador do trabalho.');
      q.jobId=jobId;
      let last;
       // O AOA confirma envio de teclas, nao confirma aprovacao
       // nem garante que a tela seguinte seja a esperada.
       // Deadlines de seguranca da sessao e do agente seguem separados.
       for(let attempt=0;attempt<45;attempt++) {
         if((state.session!==s && !s.nativeInvoked) || s.terminating) return;
         await new Promise(resolve=>setTimeout(resolve,650));
         if((state.session!==s && !s.nativeInvoked) || s.terminating) return;
         last=await sendToBridge('job',{jobId});
         if(last.stage==='prepared' || last.stage==='error' || last.stage==='abandoned')break;
       }
       if((state.session!==s && !s.nativeInvoked) || s.terminating) return;
       if(last?.stage!=='prepared') throw new Error(last?.stage==='abandoned'?'Sessao expirada no agente: confira a maquininha antes de outra cobran‡a.':
          last?.error || 'A ponte nao confirmou o envio. Confira o terminal antes de repetir.');
      const held=await sendToBridge('health');
      if(!held.hidHeldAfterSelection || held.usbReleaseError)
        throw new Error('O HID nao permaneceu conectado ate o pagamento. Confira a N960K e NAO reenvie automaticamente.');
      q.stage='sent';
      // O AOA confirma envio de comandos, nunca aprovacao bancaria.
      if(s.nativeInvoked)return;
      const currentNumber=s.queue.indexOf(q)+1;
      const nextNumber=currentNumber+1;
      s.note=nextNumber<=s.queue.length
        ? 'Etapa '+currentNumber+'/'+s.queue.length+' enviada. Confira a aprovacao na N960K antes de clicar MAQUININHA '+nextNumber+'/'+s.queue.length+'.'
        : 'Etapa '+currentNumber+'/'+s.queue.length+' enviada. Confira a aprovacao na N960K antes de FINALIZAR VENDA.';
    } catch(e) {
      q.stage='error';state.lastError=String(e.message||e)+'\nNao reenvie automaticamente: uma tentativa pode estar aberta no terminal.';
      if(s.nativeInvoked)console.error('[Enfoque N960K] SIGE finalizado pelo operador, mas houve falha posterior no envio USB: ',e);
     } finally {state.busy=false;render()}
   }
  async function safeNavigateAndRelease(s,q,reason) {
    if(!q.jobId)return true;
    const remote=await sendToBridge('job',{jobId:q.jobId});
    if(remote.stage==='acknowledged')
      throw new Error('Essa tentativa ja foi confirmada localmente. Confira o comprovante.');
    if(remote.stage==='home_ready') {
      const out=await sendToBridge('cancel',{jobId:q.jobId,reason});
      if(out.stage!=='abandoned')throw new Error('Ponte nao encerrou o preparo.');
    }else if(remote.stage==='prepared') {
      if(!q.navigationSent) {
        const nav=await sendToBridge('navigate',{jobId:q.jobId,confirmedNoPayment:true});
        if(nav.stage!=='prepared'||nav.navigationSent!==true)
          throw new Error('Nao houve confirmacao do retorno Back/Home.');
        q.navigationSent=true;
        if(q.method==='PIX') {
          // The backend has now finished sending all 3 absolute touch
          // press/release HID reports. Keep the full seven seconds of
          // animated green loading, then complete local Pix cancellation
          // WITHOUT unregistering/restarting the USB HID. Credit/debit
          // continue to use their original disconnect behavior.
          pixCancelLoadingPhase('waiting');
          await delayPixCancel(7000);
          q.pixHidWaitCompleted=true;
        }
      }
      const out=await sendToBridge('cancel',{jobId:q.jobId,reason,
        requiresSafeNavigation:true,terminalSafe:true});
      if(out.stage!=='abandoned')throw new Error('A ponte nao confirmou o cancelamento local.');
    }else if(remote.stage==='error'||remote.stage==='abandoned') {
      if(remote.stage==='error') {
        const out=await sendToBridge('cancel',{jobId:q.jobId,reason});
        if(out.stage!=='abandoned')throw new Error('Nao foi possivel encerrar tentativa com erro.');
      }
    }else throw new Error('Estado '+remote.stage+' incerto. Confira o terminal.');
    // The HID is intentionally persistent in Enfoque N960K. Its continued
    // registration is NOT a failed cancellation. The bridge's abandoned
    // stage confirms only the local request, not banking cancellation.
    return true;
  }
  async function cancelCurrent(reason) {
    const s=state.session,q=s?.current;
    if(state.busy)return;
    if(!s||!q) {
      state.session=null;state.lastError='';state.backUnlocked=true;
      closeOverlay();updateIndicator();return;
    }
    state.busy=true;state.lastError='';
    s.note=q.method==='PIX'
      ? 'Cancelando Pix: toques no X e sete segundos, mantendo o HID.'
      : 'Cancelamento local: retorno ao menu mantendo o HID conectado.';
    render();
    showCancelLoading();
    if(q.method==='PIX')pixCancelLoadingPhase('touching');
    try {
      if(q.jobId)await safeNavigateAndRelease(s,q,reason);
      state.lastError='';
    }catch(error){
      // SIGE Back must NEVER remain trapped as Cancelar when a bridge
      // command failed or returned 409/timeout. No bank cancellation is
      // claimed; the cashier must check the physical terminal separately.
      state.lastError='Confira o cancelamento na maquininha: '+
        String(error?.message||error);
      console.warn('[Enfoque N960K] Navegacao/cancelamento USB incerto; VOLTAR liberado:',error);
    }finally{
      // Restore the native SIGE Back behavior regardless of USB outcome.
      if(state.session===s)state.session=null;
      state.backUnlocked=true;
      state.busy=false;
      closeOverlay();
      render();
      hideCancelLoading();
    }
  }
  // ACK do ledger so depois de sucesso SIGE; nao aprova pagamento nem reinicia HID.
  async function acknowledgeFinishedSale(s,q){
    if(!s?.nativeInvoked||!q||s.ackDispatched)return;
    s.ackDispatched=true;
    const jobId=q.jobId||q.requestId;
    try{
      let until=Date.now()+20000;
      while(Date.now()<until&&(onPaymentScreen()||!visible(byId('btnReinicio'))))
        await new Promise(r=>setTimeout(r,250));
      if(onPaymentScreen()||!visible(byId('btnReinicio')))
        throw new Error('SIGE nao mostrou venda concluida.');
      until=Date.now()+30000;
      while(Date.now()<until){
        if(q.stage==='error')throw new Error('Envio USB nao confirmado.');
        if(q.stage==='sent'){
          const j=await sendToBridge('job',{jobId});
          if(j.stage==='acknowledged')return;
          if(j.stage==='prepared'){
            const a=await sendToBridge('ack',{jobId,result:'operator_confirmed',resetAfterSeconds:0});
            if(a.stage!=='acknowledged')throw new Error('ACK nao confirmado.');
            console.info('[N960K] SIGE concluido; ACK local; HID preservado; aprovacao bancaria nao verificada.');
            return;
          }
          if(j.stage==='abandoned'||j.stage==='error')
            throw new Error('Sessao '+j.stage+' na ponte.');
        }
        await new Promise(r=>setTimeout(r,350));
      }
      throw new Error('USB nao ficou pronto no prazo.');
    }catch(e){
      console.error('[N960K] Finalizacao SIGE sem ACK local:',e);
      if(document.body)window.alert('Venda pode estar concluida no SIGE, mas a sessao N960K nao foi liberada. Confira a maquininha antes de outra cobranca. '+String(e?.message||e));
    }
  }
  // Antes da proxima forma: confirmacao humana + ACK local sem desconectar USB.
  // Nunca inferir aprovacao bancaria apenas pelo ACK ou pelos comandos AOA.
  async function advancePaymentQueue(session,previous) {
    if(state.busy||state.session!==session||session.current!==previous)return;
    let launchedNext=false;
    state.busy=true;state.lastError='';
    session.note='Confirmando etapa anterior no agente; ainda nao enviar outra venda.';
    render();
    try {
      stillSame();
      const jobId=previous.jobId||previous.requestId;
      const remote=await sendToBridge('job',{jobId});
      if(remote.stage!=='prepared'&&remote.stage!=='acknowledged')
        throw new Error('Etapa anterior nao preparada ('+remote.stage+'). Confira a N960K.');
      if(remote.stage==='prepared') {
        const health=await sendToBridge('health');
        if(health.usbReleaseError||!health.terminal?.driverReady||!health.agentReady)
          throw new Error('HID indisponivel. Confira a N960K antes de avancar.');
        const ack=await sendToBridge('ack',{jobId,result:'operator_confirmed',resetAfterSeconds:0});
        if(ack.stage!=='acknowledged')
          throw new Error('A ponte nao confirmou a liberacao da etapa anterior.');
      }
      if(state.session!==session||session.current!==previous||session.terminating)return;
      previous.stage='done';
      session.current=null;
      session.note='Etapa '+(session.queue.indexOf(previous)+1)+'/'+session.queue.length+' confirmada pelo operador; iniciando a proxima.';
      state.busy=false;
      goToNext();
      launchedNext=true;
    }catch(error) {
      if(state.session===session) {
        state.lastError=String(error?.message||error)+' Nao repita o pagamento; confira a maquininha.';
        session.note='Falha ao avancar a fila. Confira a transacao anterior.';
      }
    }finally{
      if(!launchedNext)state.busy=false;
      render();
    }
  }
  function begin(e,button) {
    if(state.allowFinishOnce)return;
    if(!onPaymentScreen())return;
    const activeSession=state.session,q=activeSession?.current;
    if(q) {
      const remaining=activeSession.queue.some(item=>item.stage==='pending');
      if(activeSession.queue.length>1&&remaining) {
        // O clique da proxima etapa nunca deve executar FINALIZAR VENDA.
        e.preventDefault();e.stopImmediatePropagation();
        if(Date.now()<(q.finalizeAvailableAtMs||0)||state.busy||q.stage!=='sent') {
          updateIndicator();return;
        }
        try{stillSame()}catch(error){showError(error);return}
        const currentNumber=activeSession.queue.indexOf(q)+1;
        const nextNumber=activeSession.queue.findIndex(item=>item.stage==='pending')+1;
        if(nextNumber<=0)return;
        const confirmed=window.confirm('A etapa '+currentNumber+'/'+activeSession.queue.length+
          ' ('+labelMethod(q)+' '+brl(q.amountCents)+') foi APROVADA no visor da N960K?'+
          '\n\nOK: confirmar e enviar MAQUININHA '+nextNumber+'/'+activeSession.queue.length+
          '. Cancelar: manter esta etapa sem outro envio.');
        if(!confirmed){
          activeSession.note='Confira a aprovacao da etapa '+currentNumber+'/'+activeSession.queue.length+' no terminal antes de avancar.';
          render();return;
        }
        void advancePaymentQueue(activeSession,q);
        return;
      }
      if(activeSession.queue.length>1&&
         (q.stage!=='sent'||state.busy||activeSession.queue.slice(0,-1).some(item=>item.stage!=='done'))) {
        e.preventDefault();e.stopImmediatePropagation();
        updateIndicator();return;
      }
      if(Date.now()<(q.finalizeAvailableAtMs||0)) {
        e.preventDefault();e.stopImmediatePropagation();updateIndicator();return;
      }
      if(activeSession.nativeInvoked || !visible(button)) {
        e.preventDefault();e.stopImmediatePropagation();return;
      }
      // Explicit operator click is the native SIGE payment finish.
      // No agent state (sending/sent/error/busy) delays this click.
      activeSession.nativeInvoked=true;
      state.session=null;
      state.lastError='';
      state.allowFinishOnce=true;
      closeOverlay();
      // ACK so apos venda concluida no SIGE; sem cancelamento ou reset HID.
      if(e.type==='keydown') {
        // F8: one synthetic click for SIGE, not a second TEF request.
        e.preventDefault();e.stopImmediatePropagation();
        setTimeout(()=>{
          try{if(visible(button))button.click()}
          finally{
            state.allowFinishOnce=false;updateIndicator();
            void acknowledgeFinishedSale(activeSession,q);
          }
        },0);
      }else {
        // Do NOT preventDefault/stopPropagation: original SIGE click
        // goes through in this same event, with no synthetic double click.
        setTimeout(()=>{state.allowFinishOnce=false;updateIndicator();void acknowledgeFinishedSale(activeSession,q)},0);
      }
      return;
    }
    syncCreditInputs();
    let cap;
    try {cap=snapshot()}catch(error){
      e.preventDefault();e.stopImmediatePropagation();
      state.lastError=error.message;
      if(state.session?.current){state.session.note=error.message;render()}
      else console.warn('[Enfoque N960K] Pagamentos invalidos:',error.message);
      return;
    }
    const prepared=cap.rows.filter(r=>r.terminal);
    if(!prepared.length) {
      // Nenhuma linha TEF: manter fluxo nativo e limpar fila local ainda nao cobrada.
      if(state.session && !state.session.current &&
         state.session.queue.every(q=>q.stage==='pending')) {
        state.session=null;closeOverlay();updateIndicator();
      }
      return;
    }
    e.preventDefault();e.stopImmediatePropagation();
    if(state.busy) {render();return}
    const validation=creditReady();
    if(!validation.ok) {state.lastError=validation.message;render();return}
    let s=state.session;
    if(s) {
      if(s.invalidated){
        showError('A lista de pagamento mudou durante a transacao. Confira os comprovantes e revise a venda antes de finalizar.');
        return;
      }
      const old=s.rows.map(r=>r.index+':'+r.methodText+':'+r.amountCents).join('|');
      const now=cap.rows.map(r=>r.index+':'+r.methodText+':'+r.amountCents).join('|');
      if(old!==now) {
        if(!s.current && s.queue.every(q=>q.stage==='pending')) {
          // Cliente mudou de credito para debito, Pix ou parcelas antes da
          // cobranca. SIGE e fonte da verdade; nao descartar o pedido.
          const newId=(crypto.randomUUID?.()||String(Date.now()));
          s.rows=cap.rows;s.totalCents=cap.totalCents;s.nativeButton=button;
          s.queue=prepared.map(row=>({...row,stage:'pending',installments:1,
            requestId:newId+'-row'+row.index}));
          s.invalidated=false;s.note='Forma/valor atualizados no SIGE. Nova tentativa com ID independente.';
          state.lastError='';goToNext();return;
        }
        state.lastError='Valores ou formas mudaram depois de uma tentativa. Confira o comprovante e utilize Voltar na ultima tela para revisar o pedido.';
        render();return;
      }
      if(s.queue.every(q=>q.stage==='done'))return; // no duplicate native click
      if(s.current){render();return;}
      s.nativeButton=button;goToNext();return;
    }
    const id=(crypto.randomUUID?.()||String(Date.now()));
    const queue=prepared.map(row=>({...row,stage:'pending',installments:1,requestId:id+'-row'+row.index}));
    state.session={id,rows:cap.rows,queue,totalCents:cap.totalCents,nativeButton:button,current:null,
      note:'Maquininha envia; Finalizar Venda confirma pelo funcionario.',stopped:false,
      createdAtMs:Date.now(),lastHeartbeatAtMs:0,missingSinceMs:0,changedSinceMs:0,terminating:false};
    state.lastError='';goToNext();
  }
  // Encontro do VOLTAR EXCLUSIVO da ultima tela de pagamentos, adjacente ao finalizar.
  // Nunca agir no Voltar da primeira tela ou de outras paginas do PDV.
  function finalPaymentBack(control) {
    if(!control || !onPaymentScreen() || !visible(control))return false;
    if(!control.closest('#contentPagamentos') || control.closest('#'+PREFIX+'overlay'))return false;
    const label=String(control.value||control.textContent||control.getAttribute('aria-label')||
      control.getAttribute('title')||'').trim().replace(/\s+/g,' ');
      if(control.id==='btnVoltarPagamentos')return true;
      if(!/^cancelar$/i.test(label))return false;
    const finalButtons=['btnFinalizarVendaPagamentos','btnFinalizarVendaPagamentosContigencia']
      .map(byId).filter(visible);
    return finalButtons.some(finish=>{
      if(finish===control)return false;
      if(finish.parentElement===control.parentElement)return true;
      const a=control.getBoundingClientRect(),b=finish.getBoundingClientRect();
      const rowDistance=Math.abs((a.top+a.height/2)-(b.top+b.height/2));
      const columnDistance=Math.abs((a.left+a.width/2)-(b.left+b.width/2));
      return rowDistance<=64 && columnDistance<=490 &&
        finish.closest('#contentPagamentos')===control.closest('#contentPagamentos');
    });
  }
  for(const type of ['click','auxclick'])document.addEventListener(type,event=>{
    const a=event.target?.closest?.('a#logoSIGE');
    if(a) {
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('keydown',event=>{
    const a=event.target?.closest?.('a#logoSIGE');
    if(a && (event.key==='Enter'||event.key===' ')) {
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('click',event=>{
    const control=event.target?.closest?.('button,input,a,[role="button"]');
    if(!control || !onPaymentScreen() || control.id!=='btnVoltarPagamentos')return;
    // Capture phase: suppress Angular's voltarPagamentos() action entirely.
    if(state.backUnlocked) {
      // Native SIGE voltarPagamentos() must receive this click unchanged.
      // Keep the VOLTAR label until SIGE actually navigates away.
      state.session=null;closeOverlay();return;
    }
    event.preventDefault();event.stopImmediatePropagation();
    if(state.busy){
      // The operator pressed Cancelar during an ongoing asynchronous
      // command. Restore SIGE Voltar immediately, request cancellation
      // without sending any new HID key, and mark bank status uncertain.
      const active=state.session;
      if(active)active.terminating=true;
      const id=active?.current?.jobId||active?.current?.requestId;
      state.session=null;
      state.backUnlocked=true;
      state.lastError='Confira a maquininha: operacao USB ainda estava em andamento.';
      closeOverlay();updateIndicator();
      if(id)sendToBridge('cancel',{jobId:id,reason:'operator_cancelled'})
        .catch(error=>console.warn('[Enfoque N960K] Cancelamento local incerto:',error));
      return;
    }
    void cancelCurrent('operator_cancelled');
  },true);
  // Se o SIGE navegar por conta propria, NAO reiniciar o leitor em pagehide/observer.
  // HID aberto continua no agente ate clique explicito (ou manutencao tecnica).
  window.addEventListener('pagehide',()=>{
    if(state.session?.current)
      console.info('[Enfoque N960K] Aba saiu. AOA HID NAO sera encerrado automaticamente durante pagamento.');
  });
  function watchSIGESession() {
    const s=state.session;
    if(!s || s.nativeInvoked)return;
    const now=Date.now();
    if(!onPaymentScreen() || !rawRows().length) {
      if(s.current){
        s.note='Tela do SIGE nao disponivel. HID preservado; retorne ao pagamento e use Finalizar Venda ou Cancelar.';
        return;
      }
      if(!s.missingSinceMs)s.missingSinceMs=now;
      if(now-s.missingSinceMs>=MISSING_TABLE_GRACE_MS){state.session=null;closeOverlay();}
      return;
    }
    s.missingSinceMs=0;
    if(now-s.createdAtMs>=SESSION_TIMEOUT_MS && !s.warnedTimeout) {
      s.warnedTimeout=true;
      console.info('[Enfoque N960K] Sessao longa: HID permanece conectado ate acao explicita.');
    }
    if(now-s.lastHeartbeatAtMs>=HEARTBEAT_MS) {
      s.lastHeartbeatAtMs=now;
      const q=s.current;
      if(q && (q.stage==='sending'||q.stage==='sent') && (q.jobId||q.requestId))
        sendToBridge('heartbeat',{jobId:q.jobId||q.requestId}).catch(()=>{});
    }
  }
   // Global capture listener: does not change original payment-method buttons.
  document.addEventListener('click',event=>{
    const target=event.target?.closest?.('input,button');if(!target)return;
    const id=target.id||'';
    if(/^btnForma/i.test(id)) {
      state.lastChosenButton=String(target.value||target.textContent||id).slice(0,45);
      setTimeout(updateIndicator,150);
    }
    if(id==='btnFinalizarVendaPagamentos'||id==='btnFinalizarVendaPagamentosContigencia')begin(event,target);
  },true);
  document.addEventListener('input',event=>{
    if(event.target?.matches?.('input[ng-model="item.CredenciadoraCartao"],input[ng-model="item.Parcelas"]'))
      updateIndicator();
  },true);
  document.addEventListener('change',event=>{
    if(event.target?.id==='selectFormaPagamento'){
      state.lastChosenButton=event.target.selectedOptions?.[0]?.textContent?.trim()||event.target.value||'';
    }
    if(event.target?.matches?.('select[ng-model="item.CondicaoPagamento"],input[ng-model="item.CredenciadoraCartao"],input[ng-model="item.Parcelas"]')||
       event.target?.id==='selectFormaPagamento')updateIndicator();
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='F8' && onPaymentScreen()){
      const finish=byId('btnFinalizarVendaPagamentos');
      if(finish && visible(finish) && rawRows().some(r=>logic.paymentType(r.methodText))){
        begin(event,finish);
      }
    }
  },true);
  function loadStyles(){
    if(byId(PREFIX+'style'))return;
    const css=el('style');css.id=PREFIX+'style';css.textContent=STYLE;(document.head||document.documentElement).appendChild(css);
  }
  // Read-only health; HID recovery is ONLY an exception-driven action
  // inside the local bridge, when a real USB command fails. No reset timer.
  async function refreshBridgeHealth() {
    if (!onPaymentScreen()) return;
    try {
      const h=await sendToBridge('health');
      state.bridgeStatus={
        online: true,
        detected: Boolean(h.terminal?.detected),
        ready: Boolean(h.terminal?.driverReady && h.agentReady),
        creditContinueMode: h.creditContinueMode,
        heartbeat: {stale:h.heartbeatStale===true,
          monitorOnly:h.heartbeatMonitoringOnly===true,
          ageSeconds:Number.isFinite(h.heartbeatAgeSeconds)?h.heartbeatAgeSeconds:null},
        idle: {phase:h.hidIdlePhase||'waiting',
          seconds: Number.isFinite(h.hidIdleRemainingSeconds)?h.hidIdleRemainingSeconds:null,
          updatedAt:Date.now(),
          resets:h.hidIdleRestartCount||0},
        creditContinueCalibrated: Boolean(h.creditContinueCalibrated),
      };
    } catch(error) {
      state.bridgeStatus={online:false, detected:false, ready:false,
        error:String(error?.message || error).slice(0,180)};
    }
    updateIndicator();
  }
  function start() {
    loadStyles();updateIndicator();
    document.querySelectorAll('a#logoSIGE').forEach(a=>{
      a.setAttribute('aria-disabled','true');
      a.setAttribute('tabindex','-1');
    });
    const mo=new MutationObserver(records=>{
      if(!document?.body)return;
      const ownRoot='#'+PREFIX+'status,#'+PREFIX+'inline';
      // Don't feed our own button/status changes back into the DOM observer.
      if(records.every(record=>record.target?.nodeType===1 &&
          record.target.closest?.(ownRoot)))return;
      updateIndicator();
    });
    mo.observe(document.documentElement,{childList:true,subtree:true});
    const timers=[
      setInterval(updateIndicator,1200),
      setInterval(watchSIGESession,1200),
      setInterval(refreshBridgeHealth,2500)
    ];
    window.addEventListener('pagehide',()=>{
      mo.disconnect();
      timers.forEach(clearInterval);
    },{once:true});
    refreshBridgeHealth();
    console.info('[Enfoque N960K] Finalizar Venda confirma pelo funcionario; autorizacao bancaria nao e validada via USB.');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

