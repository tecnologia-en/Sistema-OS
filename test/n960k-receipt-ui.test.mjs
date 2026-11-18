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
const script=text.slice(0,stop)+'\nwindow.__TEST_RECEIPT__={state,syncCustomerReceiptButtons,begin,updatePaymentButtons};'+text.slice(stop);

function env(){
 let now=50000, requests=[], timers=[], alerts=[], ix=0;
 const registry={};
 class E {
  constructor(tag,id='',cl=''){
   this.tagName=tag.toUpperCase();this.id=id;this.className=cl;this.value='';
   this.title='';this.type='';this.disabled=false;this.children=[];this.parentElement=null;
   this._visible=true;this._removed=false;this.events={};this.dataset={};
   if(id)registry[id]=this;
  }
  addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
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
  readyState:'loading',addEventListener:()=>{},querySelectorAll:()=>[]
 };
 const win={EnfoqueN960KLogic:{paymentType:()=>null},addEventListener:()=>{},alert:m=>alerts.push(m)};
 const context={document:doc,window:win,Date:{now:()=>now},
  getComputedStyle:e=>({display:e._visible?'block':'none',visibility:'visible'}),
  chrome:{runtime:{sendMessage:(msg,callback)=>{requests.push(msg);callback({ok:true,data:{inputSent:2}})},lastError:null}},
  crypto:{randomUUID:()=>('n960k-' + (++ix))},
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},
  setInterval:()=>1,clearInterval:()=>{},
  console:{info:()=>{},warn:()=>{},error:()=>{}},
  Promise,Number,Math,Object,Boolean,Array,String,Set
 };
 vm.createContext(context);vm.runInContext(script,context);
 return {api:win.__TEST_RECEIPT__,payRoot,receiptRoot,buttons,finish,restart,done,registry,
  requests,timers,alerts,get now(){return now},set now(v){now=v}};
}
function click(target){
 assert.equal(target.disabled,false);
 let prevented=0,stopped=0;
 for(const f of target.events.click||[])f({preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
 assert.equal(prevented,1);assert.equal(stopped,1);
}
test('N960K customer receipt button matches both native SIGE screens and 3s gate',async()=>{
 const x=env();const {api}=x;
 api.syncCustomerReceiptButtons();
 const pay=x.registry['enfoque-n960k-receipt-payment'];
 assert.ok(pay);
 assert.equal(pay.value,'IMPRIMIR VIA DO CLIENTE');
 assert.equal(pay.className,x.finish.className);
 assert.deepEqual(x.buttons.children.map(c=>c.id),['btnVoltarPagamentos','btnFinalizarVendaPagamentos','enfoque-n960k-receipt-payment']);
 assert.equal(pay.disabled,true);
 assert.equal(x.requests.length,0);
 const q={stage:'sending',finalizeAvailableAtMs:x.now+3000};
 api.state.session={current:q,queue:[q],busy:true};
 api.syncCustomerReceiptButtons();assert.equal(pay.disabled,true);
 x.now+=2999;api.syncCustomerReceiptButtons();assert.equal(pay.disabled,true);
 x.now++;api.syncCustomerReceiptButtons();assert.equal(pay.disabled,false);
 click(pay);assert.equal(pay.disabled,true);
 assert.equal(x.requests.length,1);assert.equal(x.requests[0].action,'receipt');
 assert.equal(x.requests[0].payload.source,'payment');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(pay.disabled,false);
 x.payRoot._visible=false;x.receiptRoot._visible=true;api.state.session=null;
 api.syncCustomerReceiptButtons();
 assert.equal(x.registry['enfoque-n960k-receipt-payment'],undefined);
 const doneButton=x.registry['enfoque-n960k-receipt-success'];
 assert.ok(doneButton);assert.equal(doneButton.className,x.restart.className);
 assert.equal(doneButton.disabled,false);
 assert.deepEqual(x.done.children.map(c=>c.id||c.tagName),['btnReinicio','BR','enfoque-n960k-receipt-success']);
 assert.equal(x.requests.length,1);
 click(doneButton);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.requests.length,2);assert.equal(x.requests[1].payload.source,'success');
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
test('N960K print action carries no banking state and cannot auto start',()=>{
 const x=env();x.api.syncCustomerReceiptButtons();
 assert.equal(x.requests.length,0);
 const input=x.registry['enfoque-n960k-receipt-payment'];
 assert.equal(input.disabled,true);
 assert.doesNotMatch(text,/sendToBridge\('ack'/);
 assert.match(text,/sendToBridge\('receipt'/);
});
