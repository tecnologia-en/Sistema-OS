#!/usr/bin/env python3
"""Add physical office counters to the existing report without changing Canon closing rules."""
import argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument("--intranet",type=Path,required=True);args=p.parse_args()
file=args.intranet/"assets/relatorio-impressoes.js";s=file.read_text()
if "function genericOfficeMeters(" not in s:
    s=s.replace("printerInventory: null, combinedMeters: []","printerInventory: null, combinedMeters: [], officeMeters: []")
    anchor="  function storeCopyPages(branch){"
    helper="""  function genericOfficeMeters(branch){
    if(['ilha-plaza','itaipu'].includes(branch.id))return null;
    const meters=(state.officeMeters||[]).filter(m=>m.unitId===branch.id&&!m.resetReview&&readingIsFresh(m));
    const unit=unitPrinterInventory(branch);
    const printers=physicalPagePrinters(branch);
    if(!meters.length||!printers.length||unit.checkedComputers!==unit.approvedComputers)return null;
    // Local/USB or unconfirmed endpoints keep the conservative CUPS fallback.
    if(!printers.every(p=>p.transport==='network'&&meters.some(m=>
      String(p.endpoint||'').startsWith('network:'+m.endpointHost+'/')||
      String(p.endpoint||'')==='network:'+m.endpointHost)))return null;
    return meters;
  }
"""
    assert s.count(anchor)==1
    s=s.replace(anchor,helper+anchor)
    s=s.replace("    const meters=storeCopiers(branch);\n    if(!meters.length)return null;",
"""    const office=genericOfficeMeters(branch);
    if(office&&office.every(m=>positiveNumber(m.periodCopies)!==null&&!m.partial))
      return office.reduce((sum,m)=>sum+m.periodCopies,0);
    const meters=storeCopiers(branch);
    if(!meters.length)return null;""")
    anchor="    const osPages=knownPages(branch.computers);"
    assert s.count(anchor)==1
    s=s.replace(anchor,"""    const office=genericOfficeMeters(branch);
    if(office){
      const split=office.every(m=>positiveNumber(m.periodPrints)!==null&&positiveNumber(m.periodCopies)!==null);
      const partial=office.some(m=>m.partial);
      return {kind:split?'printer':'combined',
        pages:split?office.reduce((sum,m)=>sum+m.periodPrints,0):null,
        combinedSheets:office.reduce((sum,m)=>sum+m.periodPages,0),partial,
        label:'Impressora física · '+(split?'impressões e cópias separadas':'total de impressões + cópias, sem separação')+
          (partial?' · período parcialmente coberto':''),
        printers:physicalPagePrinters(branch)};
    }
"""+anchor)
    s=s.replace("      state.copiers=result.copiers;","      state.copiers=result.copiers;\n      state.officeMeters=Array.isArray(result.officeMeters)?result.officeMeters:[];")
    s=s.replace("      state.copiers=[];","      state.copiers=[];\n      state.officeMeters=[];")
    file.write_text(s)
print("Report prioritizes confirmed physical counters; Canon/HP existing rules retained.")
