import assert from "node:assert/strict";
import { test } from "node:test";
import { VisualSessionController } from "../server/visual-session-routes.mjs";

const DEVICE = "enfoqueos-68b30434-44fe-44a2-b26c-c89a5e8aea41";
const UUID = DEVICE.slice("enfoqueos-".length);
const pixels = Buffer.concat([Buffer.from([0xff,0xd8]), Buffer.alloc(180,65), Buffer.from([0xff,0xd9])]).toString("base64");
function harness() {
  let time=Date.now();
  const events=[];
  const controller = new VisualSessionController({
    clock: () => time,
    registry: { pending: async () => [{deviceId: UUID,status:"approved"}] },
    requestPc: async (_device,action,args) => {
      events.push({action,args});
      if (action === "screenshot") return {ok:true,mimeType:"image/jpeg",data:pixels,
        width:800,height:450,screenWidth:1366,screenHeight:768};
      return {ok:true,width:1366,height:768,x:20,y:30};
    },
    log: async record => events.push({audit:record})
  });
  return {controller, events, advance: (delta) => {time+=delta;}};
}
test("TI approved device must be online and has exclusive visual session", async () => {
  const h=harness();const s=await h.controller.start(DEVICE,"ti@enfoque");
  assert.equal(s.token.length,48);
  assert.equal(h.events[0].action,"session_status");
  await assert.rejects(h.controller.start(DEVICE,"outra@enfoque"),/sessão de suporte ativa/);
  await assert.rejects(h.controller.frame(s.token,"outro@enfoque"),/Sessão visual inexistente/);
  const frame=await h.controller.frame(s.token,"ti@enfoque");
  assert.equal(frame.screenWidth,1366);
  assert.equal(frame.data,pixels);
  assert.equal(h.events.filter(e=>e.action==="screenshot").length,1);
  await h.controller.stop(s.token,"ti@enfoque");
  await assert.rejects(h.controller.frame(s.token,"ti@enfoque"),/inexistente/);
});
test("approval gate cannot be skipped for regular agent-only PC", async () => {
  const h=harness();
  h.controller.registry.pending=async()=>[{deviceId:UUID,status:"pending"}];
  await assert.rejects(h.controller.start(DEVICE,"ti@enfoque"),/Zero Touch/);
  await assert.rejects(h.controller.start("enfoqueos-../../", "ti@enfoque"),/identificador/i);
});
test("keyboard actions do not persist contents in audit", async () => {
  const h=harness();const s=await h.controller.start(DEVICE,"ti@enfoque");
  const result=await h.controller.input(s.token,"ti@enfoque",{op:"type",text:"senha-sensivel"});
  assert.equal(result.ok,true);
  const records=h.events.filter(e=>e.audit).map(e=>e.audit);
  assert.ok(records.some(e=>e.action==="input"&&e.operation==="type"));
  assert.ok(!JSON.stringify(records).includes("senha-sensivel"));
  await assert.rejects(h.controller.input(s.token,"ti@enfoque",{op:"unknown"}),/inválida/);
  await assert.rejects(h.controller.input(s.token,"ti@enfoque",{op:"type",text:"x".repeat(4000)}),/excessiva/);
});
test("visual sessions expire on inactivity, no background capture", async () => {
  const h=harness();const s=await h.controller.start(DEVICE,"ti@enfoque");
  assert.equal(h.events.filter(e=>e.action==="screenshot").length,0);
  h.advance(61000);
  await assert.rejects(h.controller.frame(s.token,"ti@enfoque"),/expirada/);
});
test("frames are bounded and invalid JPEG is refused", async () => {
  const h=harness();const s=await h.controller.start(DEVICE,"ti@enfoque");
  h.controller.requestPc=async()=>({ok:true,mimeType:"image/jpeg",data:Buffer.from("not-jpeg").toString("base64"),screenWidth:1366,screenHeight:768});
  await assert.rejects(h.controller.frame(s.token,"ti@enfoque"),/Frame retornado|JPEG inválida/);
});
test("rate limiter protects input injection and unsigned extras", async () => {
  const h=harness();const s=await h.controller.start(DEVICE,"ti@enfoque");
  for(let i=0;i<18;i++) assert.equal((await h.controller.input(s.token,"ti@enfoque",{op:"move",x:i,y:22})).ok,true);
  await assert.rejects(h.controller.input(s.token,"ti@enfoque",{op:"move",x:20,y:22}),/Limite/);
});
