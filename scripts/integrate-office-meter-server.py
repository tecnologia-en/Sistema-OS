#!/usr/bin/env python3
"""Install API adapters without overwriting unrelated intranet changes."""
from pathlib import Path
import argparse,shutil
parser=argparse.ArgumentParser();parser.add_argument('--intranet',type=Path,required=True)
args=parser.parse_args();root=args.intranet;source=Path(__file__).resolve().parents[1]
for name in ['office-printer-meter.mjs','office-printer-meter-db.py']:
    shutil.copyfile(source/'server'/name,root/'server'/name)
p=root/'server/print-page-routes.mjs';s=p.read_text()
if "from './office-printer-meter.mjs'" not in s:
    s="import {validatePhysicalBatch,ingestPhysicalBatch} from './office-printer-meter.mjs';\n"+s
    anchor="      const batch=validatePrintBatch(req.body);"
    assert s.count(anchor)==1,'Unknown print route layout'
    s=s.replace(anchor,"""      if(req.body?.kind==='physical-meter-v1'){
        const batch=validatePhysicalBatch(req.body);
        const enrolled=(await registry.read()).find(x=>x.deviceId===batch.deviceUuid&&
          x.status==='approved'&&x.issued?.id===remoteId);
        if(!enrolled)return res.status(403).json({ok:false,error:'Computador não aprovado'});
        return res.json(await ingestPhysicalBatch(req.body,enrolled));
      }
"""+anchor)
    p.write_text(s)
p=root/'server/copier-counter-routes.mjs';s=p.read_text()
if "from './office-printer-meter.mjs'" not in s:
    s="import {officeMeterDb} from './office-printer-meter.mjs';\n"+s
    anchor="      return res.json({ok:true,copiers,"
    assert s.count(anchor)==1,'Unknown copier route layout'
    s=s.replace(anchor,"""      const office=await officeMeterDb('summary',{fromDate:range.fromDate,toDate:range.toDate})
        .catch(()=>({officeMeters:[]}));
      return res.json({ok:true,copiers,
        officeMeters:(office.officeMeters||[]).filter(m=>approvedUnits.has(m.unitId)),""")
    p.write_text(s)
print('Office meter adapters installed; no workstation command or campaign dispatched.')
