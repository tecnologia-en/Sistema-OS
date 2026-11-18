import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const file='config/includes.chroot/usr/share/enfoque-monitora/n960k-tef-inativa/n960k-pdv.js';
const text=readFileSync(file,'utf8');
assert.match(text,/FINALIZAR_MIN_WAIT_MS=3000/);
assert.doesNotMatch(text,/sendToBridge\('ack'/);
assert.doesNotMatch(text,/resetAfterSeconds:5/);
const stop=text.lastIndexOf('\n})();');
assert.ok(stop>0);
const script=text.slice(0,stop)+'\nwindow.__TEST_RECEIPT__={state,syncCustomerReceiptButtons,begin,updatePaymentButtons,cancelCurrent,testDisableOverlay:()=>{showCancelLoading=()=>{};hideCancelLoading=()=>{};closeOverlay=()=>{};render=()=>updatePaymentButtons()}};'+text.slice(stop);

function env(){
 let now=50000, requests=[], timers=[], alerts=[], ix=0;
 let bridgeReply=msg=>{
   if(msg.action==='job')return {ok:true,data:{stage:'prepared'}};
   if(msg.action==='navigate')return {ok:true,data:{stage:'prepared',navigationSent:true}};
   if(msg.action==='cancel')return {ok:true,data:{stage:'abandoned'}};
   return {ok:true,data:{inputSent:2}};
 };
 const registry={};
 const listeners={};
 class E {
  constructor(tag,id='',cl=''){
   this.tagName=tag.toUpperCase();this.id=id;this.className=cl;this.value='';
   this.title='';this.type='';this.disabled=false;this.children=[];this.parentElement=null;
   this._visible=true;this._removed=false;this.events={};this.dataset={};
   if(id)registry[id]=this;
  }
  addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
  closest(selector){
   if(selector==='a#logoSIGE')return null;
   if(selector.includes('button')||selector.includes('input'))return this;
   return null;
  }
  setAttribute(n,v){this[n]=v}
  getBoundingClientRect(){return this._visible?{width:188,height:34}:{width:0,height:0}}
  insertAdjacentElement(where,item){assert.equal(where,'afterend');assert.ok(this.parentElement);
   const kids=this.parentElement.children,pos=kids.indexOf(this);assert.ok(pos>=0);
   kids.splice(pos+1,0,item);item.parentElement=this.parentElement;
   if(item.id)registry[item.id]=item;this.parentElement.fixSiblings();}
  fixSiblings(){this.children.forEach((ch,j)=>ch.nextElementSibling=this.children[j+1]||null)}
  append(item){this.children.push(item);item.parentElement=this;this.fixSiblings();return item}
  remove(){this._removed=true;delete registry[this.id];if(this.parentElement){const k=this.parentElement.children,i=k.indexOf(this);if(i>=0)k.splice(i,1);this.parentElement.fixSiblings()}}
  querySelector(){return null}
  querySelectorAll(){return []}
 }
 const payRoot=new E('div','contentPagamentos');
 const buttons=payRoot.append(new E('div','contentButtonsPagamentos'));
 buttons.append(new E('input','btnVoltarPagamentos','btn btnVermelho buttonsPagamentos'));
 const finish=buttons.append(new E('input','btnFinalizarVendaPagamentos','btn btnGrande btnAzul buttonsPagamentos'));
 const receiptRoot=new E('div','successRoot');receiptRoot._visible=false;
 const done=receiptRoot.append(new E('div','doneHost','main'));
 const restart=done.append(new E('input','btnReinicio','btn btnMedio btnAzul'));
 restart.value='NOVA VENDA (F8)';done.append(new E('br'));
 const doc={
  body:new E('body'),documentElement:{contains:e=>!e._removed},
  getElementById:id=>registry[id]||null,createElement:tag=>new E(tag),
  readyState:'loading',
  addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn)},
  querySelectorAll:()=>[]
 };
 const win={EnfoqueN960KLogic:{paymentType:()=>null},addEventListener:()=>{},alert:m=>alerts.push(m)};
 const context={document:doc,window:win,Date:{now:()=>now},
  getComputedStyle:e=>({display:e._visible?'block':'none',visibility:'visible'}),
  chrome:{runtime:{sendMessage:(msg,callback)=>{requests.push(msg);callback(bridgeReply(msg))},lastError:null}},
  crypto:{randomUUID:()=>('n960k-' + (++ix))},
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},
  setInterval:()=>1,clearInterval:()=>{},
  console:{info:()=>{},warn:()=>{},error:()=>{}},
  Promise,Number,Math,Object,Boolean,Array,String,Set
 };
 vm.createContext(context);vm.runInContext(script,context);
 return {api:win.__TEST_RECEIPT__,payRoot,receiptRoot,buttons,finish,restart,done,registry,
  requests,timers,alerts,listeners,setBridgeReply:fn=>bridgeReply=fn,
  get now(){return now},set now(v){now=v}};
}
function click(target){
 assert.equal(target.disabled,false);
 let prevented=0,stopped=0;
 for(const f of target.events.click||[])f({preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
 assert.equal(prevented,1);assert.equal(stopped,1);
}
test('No customer receipt button on payment screen, even during active payment',()=>{
 const x=env();const {api}=x;
 api.syncCustomerReceiptButtons();
 assert.equal(x.registry['enfoque-n960k-receipt-payment'],undefined);
 assert.deepEqual(x.buttons.children.map(c=>c.id),
  ['btnVoltarPagamentos','btnFinalizarVendaPagamentos']);
 const q={stage:'sending',finalizeAvailableAtMs:x.now+3000};
 api.state.session={current:q,queue:[q],busy:true};
 api.syncCustomerReceiptButtons();
 x.now+=4000;api.syncCustomerReceiptButtons();
 assert.equal(x.registry['enfoque-n960k-receipt-payment'],undefined);
 assert.equal(x.requests.length,0);
});
test('Existing old payment-screen receipt button is removed immediately',()=>{
 const x=env();
 const old=documentLikeButton(x,'enfoque-n960k-receipt-payment');
 x.buttons.append(old);
 assert.ok(x.registry['enfoque-n960k-receipt-payment']);
 x.api.syncCustomerReceiptButtons();
 assert.equal(x.registry['enfoque-n960k-receipt-payment'],undefined);
 assert.deepEqual(x.buttons.children.map(c=>c.id),
  ['btnVoltarPagamentos','btnFinalizarVendaPagamentos']);
});
function documentLikeButton(x,id){
 const source=x.registry['btnFinalizarVendaPagamentos'];
 const c=Object.create(Object.getPrototypeOf(source));
 Object.assign(c,{...source,id,_removed:false,events:{},children:[],parentElement:null});
 x.registry[id]=c;
 return c;
}
test('Customer receipt only on completed sale, beside Nova Venda',async()=>{
 const x=env();const {api}=x;
 x.payRoot._visible=false;x.receiptRoot._visible=true;
 api.syncCustomerReceiptButtons();
 assert.equal(x.registry['enfoque-n960k-receipt-payment'],undefined);
 const done=x.registry['enfoque-n960k-receipt-success'];
 assert.ok(done);
 assert.equal(done.className,x.restart.className);
 assert.equal(done.value,'IMPRIMIR VIA DO CLIENTE');
 assert.equal(done.disabled,false);
 assert.deepEqual(x.done.children.map(c=>c.id||c.tagName),
  ['btnReinicio','BR','enfoque-n960k-receipt-success']);
 assert.equal(x.requests.length,0);
 click(done);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.requests.length,1);
 assert.equal(x.requests[0].action,'receipt');
 assert.equal(x.requests[0].payload.source,'success');
 assert.equal(x.alerts.length,0);
});
test('N960K Finalizar SIGE is native after exactly 3 seconds for all agent stages',()=>{
 for(const stage of ['sending','sent','error','pending']){
  const x=env();const {api}=x;
  const q={stage,finalizeAvailableAtMs:x.now+3000};
  api.state.session={current:q,queue:[q],nativeInvoked:false};
  let prevented=0,stopped=0;
  const event=()=>({type:'click',preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
  api.begin(event(),x.finish);
  assert.equal(prevented,1);assert.ok(api.state.session);
  x.now+=3000;
  api.begin(event(),x.finish);
  assert.equal(prevented,1,'native SIGE click must not be prevented');
  assert.equal(stopped,1,'native SIGE click must propagate');
  assert.equal(api.state.session,null);
  assert.equal(x.requests.length,0,'no receipt/USB from native finalize');
 }
});
test('Receipt never sends payment command from payment screen',()=>{
 const x=env();x.api.syncCustomerReceiptButtons();
 assert.equal(x.requests.length,0);
 assert.equal(x.registry['enfoque-n960k-receipt-payment'],undefined);
 assert.doesNotMatch(text,/makeCustomerReceiptButton\(nativeFinish,RECIBO_PAGAMENTO_ID/);
 assert.doesNotMatch(text,/source==='payment'/);
 assert.doesNotMatch(text,/sendToBridge\('ack'/);
 assert.match(text,/sendToBridge\('receipt'/);
});
test('No restart button, handler or auto-connection reset in PDV interface',()=> {
 assert.doesNotMatch(text,/HID_RESET_ID|syncManualHidResetButton|manual-hid-reset|sendToBridge\('hidReset'/);
 assert.match(text,/RECIBO_PAGAMENTO_ID/);
 assert.match(text,/RECIBO_CONCLUIDO_ID/);
 assert.match(text,/FINALIZAR_MIN_WAIT_MS=3000/);
 const x=env();
 x.api.updatePaymentButtons();
 assert.ok(!x.registry['enfoque-n960k-manual-hid-reset']);
 assert.equal(x.requests.length,0);
});

test('Cancelar returns native Voltar even when persistent USB stays connected',async()=>{
 const x=env();x.api.testDisableOverlay();
 const cancel=x.registry['btnVoltarPagamentos'];
 const q={method:'DEBIT',jobId:'my-job',stage:'sent'};
 x.api.state.session={current:q,queue:[q],note:'Test sale'};
 x.api.updatePaymentButtons();
 assert.equal(cancel.value,'CANCELAR');
 await x.api.cancelCurrent('operator_cancelled');
 assert.equal(x.api.state.session,null);
 assert.equal(x.api.state.busy,false);
 assert.equal(x.api.state.backUnlocked,true);
 assert.equal(cancel.value,'VOLTAR');
 assert.deepEqual(x.requests.map(r=>r.action),['job','navigate','cancel']);
 assert.equal(x.api.state.lastError,'');
 console.log('PASS_CANCEL_USB_PERSISTENT_AND_NATIVE_BACK');
});
test('Cancelar unlocks Voltar when the terminal fails or bridge returns 409',async()=>{
 const x=env();x.api.testDisableOverlay();
 const cancel=x.registry['btnVoltarPagamentos'];
 const q={method:'DEBIT',jobId:'my-job',stage:'sent'};
 x.api.state.session={current:q,queue:[q]};
 x.setBridgeReply(msg=>msg.action==='navigate' ?
  {ok:false,error:'HID connection USB failed'} :
  msg.action==='job'?{ok:true,data:{stage:'prepared'}}:
  {ok:true,data:{stage:'abandoned'}});
 await x.api.cancelCurrent('operator_cancelled');
 assert.equal(x.api.state.session,null);
 assert.equal(x.api.state.backUnlocked,true);
 assert.equal(cancel.value,'VOLTAR');
 assert.match(x.api.state.lastError,/Confira o cancelamento na maquininha/);
 assert.deepEqual(x.requests.map(r=>r.action),['job','navigate']);
 console.log('PASS_CANCEL_FAILURE_STILL_NATIVE_BACK');
});
test('Voltar click goes to SIGE unchanged and remains Voltar until navigation',()=>{
 const x=env();x.api.testDisableOverlay();
 const cancel=x.registry['btnVoltarPagamentos'];
 x.api.state.backUnlocked=true;x.api.updatePaymentButtons();
 assert.equal(cancel.value,'VOLTAR');
 let prevented=0,stopped=0;
 const ev={target:cancel,preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++};
 for(const f of x.listeners.click||[]) {f(ev);if(stopped)break}
 assert.equal(prevented,0);
 assert.equal(stopped,0);
 assert.equal(x.api.state.backUnlocked,true);
 assert.equal(cancel.value,'VOLTAR');
 console.log('PASS_NATIVE_SIGE_BACK_UNMODIFIED');
});
test('Cancelar during active USB command unlocks native Voltar but does not send new keys',async()=>{
 const x=env();x.api.testDisableOverlay();
 const cancel=x.registry['btnVoltarPagamentos'];
 const q={method:'DEBIT',requestId:'pending-job',stage:'sending'};
 const session={current:q,queue:[q],terminating:false};
 x.api.state.session=session;x.api.state.busy=true;
 let prevented=0,stopped=0;
 const ev={target:cancel,preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++};
 for(const f of x.listeners.click||[]) {f(ev);if(stopped)break}
 assert.equal(prevented,1);
 assert.equal(stopped,1);
 assert.equal(x.api.state.session,null);
 assert.equal(x.api.state.backUnlocked,true);
 assert.equal(cancel.value,'VOLTAR');
 assert.equal(session.terminating,true);
 assert.deepEqual(x.requests.map(r=>r.action),['cancel']);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.api.state.backUnlocked,true);
 console.log('PASS_BUSY_WORKER_CANCEL_UI_UNLOCKED_NO_USB_KEY');
});
test('No timed HID auto-restart or lateral restart button in extension',()=>{
 assert.doesNotMatch(text,/maybeRecoverDetachedHid|autoRecoveryFaults|autoRecoveryLastAttemptAt|hidAutoRecover/);
 assert.doesNotMatch(text,/HID_RESET_ID|syncManualHidResetButton|manual-hid-reset/);
 assert.match(text,/FINALIZAR_MIN_WAIT_MS=3000/);
});
