import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const SCRIPT=fileURLToPath(new URL('./office-printer-meter-db.py',import.meta.url));
const DATABASE='/opt/intranet-data/office-printer-meters.sqlite3';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const THERMAL=/bematech|bermatec|elgin|daruma|thermal|t[eé]rmica|thermo|cupom|esc.?pos|receipt|zebra|epson.?tm/i;
function privateHost(host){
  if(net.isIP(host)!==4)return false;
  const a=host.split('.').map(Number);
  return a[0]===10||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168);
}
export function validatePhysicalBatch(raw,{now=Date.now()}={}){
  const invalid=()=>{throw Error('Lote físico inválido');};
  if(raw?.kind!=='physical-meter-v1'||!UUID.test(raw.deviceUuid||'')||
    !Array.isArray(raw.readings)||raw.readings.length<1||raw.readings.length>16)invalid();
  const readings=raw.readings.map(r=>{
    const at=Date.parse(r?.measuredAt);
    if(!r||!privateHost(r.endpointHost)||!['physical-snmp'].includes(r.source)||
      !['canon-gx7100','printer-mib'].includes(r.profile)||
      typeof r.model!=='string'||r.model.length<3||r.model.length>160||
      /[\u0000-\u001f\u007f]/.test(r.model)||THERMAL.test(r.model)||
      (r.serial!==undefined&&(typeof r.serial!=='string'||r.serial.length>100||/[\u0000-\u001f\u007f]/.test(r.serial)))||
      !Number.isFinite(at)||at<now-30*86400000||at>now+600000)invalid();
    for(const name of ['totalPages','printPages','copyPages']){
      if(name!=='totalPages'&&r[name]===undefined)continue;
      if(!Number.isSafeInteger(r[name])||r[name]<0||r[name]>1e9)invalid();
    }
    if(r.profile==='canon-gx7100'&&(!r.model.includes('Canon GX7100')||
      r.copyPages===undefined||r.printPages===undefined||r.copyPages+r.printPages!==r.totalPages))invalid();
    if(r.copyPages!==undefined&&r.printPages!==undefined&&r.copyPages+r.printPages!==r.totalPages)invalid();
    return {endpointHost:r.endpointHost,model:r.model,serial:r.serial||'',profile:r.profile,
      source:r.source,totalPages:r.totalPages,
      ...(r.printPages===undefined?{}:{printPages:r.printPages}),
      ...(r.copyPages===undefined?{}:{copyPages:r.copyPages}),
      measuredAt:new Date(at).toISOString()};
  });
  return {kind:raw.kind,deviceUuid:raw.deviceUuid,readings};
}
export function officeMeterDb(action,data,{database=DATABASE}={}){
  if(!['ingest','summary'].includes(action))throw Error('Invalid meter action');
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/python3',[SCRIPT,action,database],{stdio:['pipe','pipe','pipe'],shell:false});
    let output='',error='',settled=false;
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('Printer meter timeout'));},12000);
    child.on('error',finish);
    child.stdout.on('data',part=>{output+=part;if(output.length>200000){child.kill();finish(Error('Oversize meter response'));}});
    child.stderr.on('data',part=>{error+=part.toString().slice(0,200);});
    child.on('close',code=>{
      if(code!==0)return finish(Error('Printer meter database failed'));
      try{finish(null,JSON.parse(output));}catch(e){finish(e);}
    });
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
  });
}
export async function ingestPhysicalBatch(raw,device,{db=officeMeterDb}={}){
  const body=validatePhysicalBatch(raw);
  if(device.status!=='approved'||device.deviceId!==body.deviceUuid||!device.unitId)
    throw Error('Identidade inconsistente');
  return db('ingest',{...body,unitId:device.unitId,unitName:device.unitName||device.unitId});
}
