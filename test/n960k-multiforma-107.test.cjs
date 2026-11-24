const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=path.join(__dirname,'../config/includes.chroot/usr/share/enfoque-monitora/n960k-tef-inativa');
const logicSource=fs.readFileSync(path.join(base,'n960k-logic.js'),'utf8');
let src=fs.readFileSync(path.join(base,'n960k-pdv.js'),'utf8');
const marker='  if(document.readyState===';
assert.equal(src.split(marker).length,2);
src=src.replace(marker,'  globalThis.__qa={state,updatePaymentButtons,begin};\n'+marker);
function fixture(rows,opts={}) {
  let now=100000, idNum=0, paymentVisible=true, approval=true;
  const calls=[], jobs=new Map(),confirmations=[];
  const elt=(extra={})=>Object.assign({
    parentElement:null,dataset:{},style:{},disabled:false,value:'',
    getBoundingClientRect(){return {left:0,top:0,width:100,height:40}},
    querySelector(){return null},querySelectorAll(){return []},remove(){},
    setAttribute(){},addEventListener(){},insertAdjacentElement(){},
  },extra);
  const finish=elt({id:'btnFinalizarVendaPagamentos',value:'FINALIZAR VENDA'});
  const cancel=elt({id:'btnVoltarPagamentos',value:'CANCELAR'});
  const contentPay=elt({id:'contentPagamentos',querySelector(sel){
    if(sel.includes('totalPedido'))return {textContent:'R$ '+rows.reduce((a,x)=>a+x.cents,0).toFixed(2).replace('.',',')};
    return null;
  }});
  const tbody=rows.map(row=>elt({querySelector(sel){
    if(sel==='.tbFormaPagamento,.tbValor')return {textContent:'present'};
    if(sel==='tr:first-child')return this;
    if(sel==='.tbFormaPagamento')return {textContent:row.type};
    if(sel==='.tbValor')return {textContent:'R$ '+row.cents.toFixed(2).replace('.',',')};
    if(sel.includes('CondicaoPagamento'))return {value:'0'};
    if(sel.includes('CredenciadoraCartao'))return {value:'CREDITO'};
    if(sel.includes('item.Parcelas'))return {value:'1'};
    return null;
  }}));
  const table=elt({querySelectorAll(sel){return sel==='tbody'?tbody:[]}});
  const byId={contentPagamentos:contentPay,tabelaPagamentos:table,btnFinalizarVendaPagamentos:finish,btnVoltarPagamentos:cancel,btnReinicio:elt({id:'btnReinicio'})};
  const document={
    readyState:'loading',body:elt(),documentElement:elt({contains(){return true}}),
    getElementById(id){return id==='contentPagamentos'&&!paymentVisible?null:byId[id]||null},
    addEventListener(){},
    querySelectorAll(){return []},
    createElement(){return elt()},
  };
  const mockedReply=(action,payload)=>{
    if(action==='health') {
      const busy=[...jobs.values()].some(v=>['homing','sending','home_ready','prepared'].includes(v));
      return {ok:true,busy,usbReleaseError:null,terminal:{driverReady:true},agentReady:true,
        hidHeldAfterSelection:true,pixHidStandby:!busy,venderNavigationMode:'keyboard_enter',creditContinueMode:'keyboard_enter'};
    }
    if(action==='home'){jobs.set(payload.requestId,'home_ready');return {stage:'home_ready',homeComplete:true,jobId:payload.requestId}}
    if(action==='start'){
      assert.equal(jobs.get(payload.requestId),'home_ready');
      jobs.set(payload.requestId,'prepared');return {jobId:payload.requestId,stage:'sending'}
    }
    if(action==='job')return {jobId:payload.jobId,stage:jobs.get(payload.jobId)};
    if(action==='ack'){
      if(opts.failAck)return {__error:'Falha injetada no ACK'};
      assert.equal(jobs.get(payload.jobId),'prepared');
      jobs.set(payload.jobId,'acknowledged');return {stage:'acknowledged',jobId:payload.jobId}
    }
    if(action==='heartbeat')return {ok:true}
    throw new Error('Unexpected call '+action);
  };
  const chrome={runtime:{lastError:null,sendMessage(msg,cb){
    calls.push({action:msg.action,payload:msg.payload});
    const answer=mockedReply(msg.action,msg.payload);
    cb(answer.__error?{ok:false,error:answer.__error}:{ok:true,data:answer});
  }}};
  class FakeDate extends Date{static now(){return now}}
  const sandbox={
    console,crypto:{randomUUID(){return 'fake-session-'+(++idNum)}},
    Date:FakeDate,document,chrome,getComputedStyle(){return {display:'block',visibility:'visible'}},
    setTimeout(fn,ms){if(ms<1000)queueMicrotask(fn);return 1},
    clearTimeout(){},setInterval(){return 1},clearInterval(){},
    MutationObserver:class{observe(){} disconnect(){}},
    confirm(text){confirmations.push(text);return approval},
    alert(){},addEventListener(){},location:{href:'https://enfoquepapelaria.meusige.com.br/sistema/pdv'},
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(logicSource,sandbox,{filename:'n960k-logic.js'});
  vm.runInContext(src,sandbox,{filename:'n960k-pdv.js'});
  const qa=sandbox.__qa;
  return {
    qa,calls,jobs,finish,cancel,confirmations,
    advance(ms){now+=ms},
    setApproval(value){approval=value},
    paymentDone(){paymentVisible=false},
    event(type='click'){return {type,prevented:false,stop:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stop=true}}},
  };
}
const tick=()=>new Promise(setImmediate);
async function twoRows() {
  const f=fixture([{type:'Cartão de Débito',cents:10},{type:'Cartão de Crédito',cents:20}]);
  const a=f.qa;
  a.updatePaymentButtons();
  assert.equal(f.finish.value,'MAQUININHA 1/2');
  let ev=f.event();a.begin(ev,f.finish);
  await tick();
  assert.deepEqual(Array.from(a.state.session.queue,q=>q.stage),['sent','pending']);
  assert.equal(f.finish.value,'MAQUININHA 2/2');
  assert.equal(f.finish.disabled,true,'second payment blocked for 3 seconds');
  assert.equal(f.calls.filter(c=>c.action==='home').length,1);
  ev=f.event();a.begin(ev,f.finish);
  assert.equal(ev.prevented,true);
  assert.equal(f.calls.filter(c=>c.action==='home').length,1,'premature click must not resend');
  f.advance(3001);a.updatePaymentButtons();
  assert.equal(f.finish.disabled,false);
  f.setApproval(false);
  ev=f.event();a.begin(ev,f.finish);
  assert.equal(f.calls.filter(c=>c.action==='home').length,1,'unconfirmed previous payment must not send next');
  f.setApproval(true);
  ev=f.event();a.begin(ev,f.finish);
  assert.equal(ev.prevented,true,'second step cannot finalize SIGE');
  await tick();
  assert.deepEqual(Array.from(a.state.session.queue,q=>q.stage),['done','sent']);
  assert.equal(f.calls.filter(c=>c.action==='home').length,2);
  assert.equal(f.calls.filter(c=>c.action==='start').length,2);
  assert.equal(f.calls.filter(c=>c.action==='ack').length,1);
  assert.equal(f.finish.value,'FINALIZAR VENDA');
  assert.equal(f.finish.disabled,true,'finalization blocked for second 3s period');
  const actions=f.calls.map(c=>c.action);
  assert.ok(actions.indexOf('ack')<actions.lastIndexOf('home'),'ACK must precede second HOME');
  f.advance(3001);a.updatePaymentButtons();
  assert.equal(f.finish.disabled,false);
  ev=f.event();a.begin(ev,f.finish);
  assert.equal(ev.prevented,false,'only final step triggers native SIGE');
  f.paymentDone();await tick();
  assert.equal(f.calls.filter(c=>c.action==='ack').length,2,'final ACK on SIGE success');
  console.log('PASS 2 forms: 1/2 -> 3s -> 2/2 -> 3s -> Finalizar; no duplicate USB');
}
async function threeRows() {
  const f=fixture([{type:'Cartão de Débito',cents:10},{type:'Cartão de Crédito',cents:20},{type:'Pix',cents:5}]);
  const a=f.qa;a.updatePaymentButtons();
  assert.equal(f.finish.value,'MAQUININHA 1/3');
  a.begin(f.event(),f.finish);await tick();
  for(let expected=2;expected<=3;expected++){
    f.advance(3001);a.updatePaymentButtons();
    assert.equal(f.finish.value,'MAQUININHA '+expected+'/3');
    a.begin(f.event(),f.finish);await tick();
  }
  assert.equal(f.finish.value,'FINALIZAR VENDA');
  assert.equal(f.calls.filter(c=>c.action==='home').length,3);
  assert.equal(f.calls.filter(c=>c.action==='ack').length,2);
  console.log('PASS 3 forms: all 3 sent sequentially with individual cooldown');
}
async function mixed() {
  const f=fixture([{type:'Dinheiro',cents:5},{type:'Cartão de Débito',cents:10},{type:'Pix',cents:10}]);
  f.qa.updatePaymentButtons();assert.equal(f.finish.value,'MAQUININHA 1/2');
  f.qa.begin(f.event(),f.finish);await tick();
  assert.equal(f.qa.state.session.queue.length,2,'cash excluded');
  assert.equal(f.calls.filter(c=>c.action==='home').length,1);
  console.log('PASS mixed: count includes only terminal-compatible payments');
}
async function failure() {
  const f=fixture([{type:'Cartão de Débito',cents:10},{type:'Cartão de Crédito',cents:20}],{failAck:true});
  f.qa.begin(f.event(),f.finish);await tick();f.advance(3001);f.qa.updatePaymentButtons();
  f.qa.begin(f.event(),f.finish);await tick();
  assert.equal(f.calls.filter(c=>c.action==='home').length,1,'ACK failure must never send next payment');
  assert.deepEqual(Array.from(f.qa.state.session.queue,q=>q.stage),['sent','pending']);
  console.log('PASS safety: ACK failure stops progression');
}
async function single() {
  const f=fixture([{type:'Cartão de Débito',cents:10}]);
  f.qa.updatePaymentButtons();assert.equal(f.finish.value,'MAQUININHA');
  f.qa.begin(f.event(),f.finish);await tick();assert.equal(f.finish.value,'FINALIZAR VENDA');
  f.advance(3001);f.qa.updatePaymentButtons();assert.equal(f.finish.disabled,false);
  console.log('PASS 1 form: original button labels preserved');
}
(async()=>{await twoRows();await threeRows();await mixed();await failure();await single();console.log('ALL FIVE TESTS PASSED')})().catch(err=>{console.error(err);process.exitCode=1});
