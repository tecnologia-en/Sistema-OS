import {test} from "node:test";
import assert from "node:assert/strict";
import {installZeroTouchRoutes} from "../server/zero-touch-routes.mjs";
const base={deviceId:"de153222-5311-496c-a7c6-2cc9c8223e0f",pcName:"Teste",unitName:"Itaipu",status:"approved"};
function setup(record,cb) {
  const paths={};
  const app={post(p,f){paths[p]=f;},get(){}};
  installZeroTouchRoutes({app,registry:{async poll(){return record;}},inventory:{},
    provisionMonitora:cb,isAdmin:()=>false,
    provisionDeviceKeys:async()=>{},syncAuthorizedTunnels:async()=>{},
    dropTunnelSessionsAfterRevocation:async()=>{}});
  return async (body)=>{
    const response={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},
      status(c){this.code=c;return this;},json(x){this.payload=x;return this;}};
    await paths["/api/remote-access/zero-touch/status"]({body,ip:"127.0.0.1"},response);
    return response;
  };
}
test("Old clients never enroll Monitora",async()=>{
  let calls=0;
  const run=setup(base,async()=>{calls++;return "a".repeat(48)});
  const result=await run({deviceId:base.deviceId});
  assert.equal(result.code,200);
  assert.equal(result.payload.monitora,undefined);
  assert.equal(calls,0);
});
test("Only approved clients requesting managed token receive it",async()=>{
  const run=setup(base,async r=>{assert.equal(r.deviceId,base.deviceId);return "A".repeat(48)});
  const result=await run({deviceId:base.deviceId,monitoraProvision:true});
  assert.deepEqual(result.payload.monitora,{deviceId:base.deviceId,token:"A".repeat(48)});
});
test("Pending never gets a token",async()=>{
  let calls=0;
  const run=setup({...base,status:"pending"},async()=>{calls++;return "b".repeat(48)});
  const result=await run({deviceId:base.deviceId,monitoraProvision:true});
  assert.equal(result.payload.monitora,undefined);
  assert.equal(calls,0);
});
test("Server errors are not returned as secrets or admin access",async()=>{
  const run=setup(base,async()=>{throw Error("confidential-do-not-leak")});
  const result=await run({deviceId:base.deviceId,monitoraProvision:true});
  assert.equal(result.code,200);
  assert.deepEqual(result.payload.monitora,{available:false});
  assert.equal(JSON.stringify(result.payload).includes("confidential"),false);
});
