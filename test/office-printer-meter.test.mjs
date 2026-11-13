import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validatePhysicalBatch,ingestPhysicalBatch,officeMeterDb} from '../server/office-printer-meter.mjs';
const deviceUuid='52c2e20d-2aab-4d2e-b04b-1505cda08721';
const now=Date.now()-60000;
const reading=(totalPages=100,measuredAt=new Date(now).toISOString())=>({
  model:'Pantum M6550',serial:'TEST-ONE',endpointHost:'192.168.111.92',
  profile:'printer-mib',source:'physical-snmp',totalPages,measuredAt
});
const payload=(r=reading())=>({kind:'physical-meter-v1',deviceUuid,readings:[r]});
test('physical meter schema rejects receipt models, public endpoints, fake split and invalid numbers',()=>{
  for(const change of [
    {model:'Bematech MP4200 TH'},{model:'Elgin i9'},{endpointHost:'8.8.8.8'},
    {endpointHost:'127.0.0.1'},{totalPages:-1},{totalPages:'100'},
    {totalPages:100,printPages:90,copyPages:30},
    {profile:'canon-gx7100'},{source:'cups'},{measuredAt:'invalid'},
  ])assert.throws(()=>validatePhysicalBatch(payload({...reading(),...change})));
  assert.equal(validatePhysicalBatch(payload()).readings[0].totalPages,100);
});
test('approved enrollment defines the store; client cannot select another unit',async()=>{
  let recorded;
  await ingestPhysicalBatch({...payload(),unitId:'other'},{status:'approved',deviceId:deviceUuid,unitId:'centro'},
    {db:async(action,data)=>{recorded=data;return {ok:true,accepted:1};}});
  assert.equal(recorded.unitId,'centro');
  await assert.rejects(()=>ingestPhysicalBatch(payload(),{status:'pending',deviceId:deviceUuid,unitId:'centro'}));
});
test('real SQLite keeps one physical baseline across PCs and retries, then counts only the increment',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'office-meter-052-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const options={database:path.join(dir,'meters.sqlite3')};
  const data={...payload(),unitId:'centro',unitName:'Centro'};
  assert.equal((await officeMeterDb('ingest',data,options)).accepted,1);
  await officeMeterDb('ingest',data,options);
  await officeMeterDb('ingest',{...data,deviceUuid:'other-pc',readings:[reading(107,new Date(now+10000).toISOString())]},options);
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(now));
  const result=await officeMeterDb('summary',{fromDate:day,toDate:day},options);
  assert.equal(result.officeMeters.length,1);
  assert.equal(result.officeMeters[0].lifetimePages,107);
  assert.equal(result.officeMeters[0].periodPages,7);
  assert.equal(result.officeMeters[0].lifetimeCopies,null);
});
