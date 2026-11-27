import datetime as dt
import importlib.machinery
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

ROOT=Path(__file__).resolve().parents[1]
loader=importlib.machinery.SourceFileLoader("recovery",str(ROOT/"config/includes.chroot/usr/local/sbin/enfoque-ipp-recovery"))
spec=importlib.util.spec_from_loader(loader.name,loader)
m=importlib.util.module_from_spec(spec);loader.exec_module(m)
NOW=int(dt.datetime(2026,11,27,18,19,20,tzinfo=dt.timezone.utc).timestamp())
CHANGED=NOW-17
LINE="W [27/Nov/2026:15:19:03 -0300] [Job 189] Backend ipp returned status 4 (stop printer)"
ACCESS='localhost [27/Nov/2026:15:19:00 -0300] Print-Job successful-ok'
NAME="Canon_GX7100_Copa"
URI="ipp://192.168.0.28/ipp/print"

class FakeCups:
    def __init__(self):
        self.p={"printer-state":5,"printer-state-reasons":["paused"],"printer-state-change-time":CHANGED,
                "printer-state-message":"Rendering completed","printer-is-accepting-jobs":True,"device-uri":URI}
        self.jobs={189:{"job-printer-uri":"ipp://localhost/printers/"+NAME,"job-state":3,"job-state-reasons":["printer-stopped"]},
                   190:{"job-printer-uri":"ipp://localhost/printers/"+NAME,"job-state":3,"job-state-reasons":["none"]},
                   191:{"job-printer-uri":"ipp://localhost/printers/"+NAME,"job-state":4,"job-state-reasons":["job-hold-until-specified"]},
                   4:{"job-printer-uri":"ipp://localhost/printers/Elgin","job-state":3}}
        self.actions=[]
    def getPrinterAttributes(self,*args,**kw): return self.p.copy()
    def getJobAttributes(self,j,**kw): return self.jobs[j].copy()
    def setJobHoldUntil(self,j,hold):
        self.actions.append(("hold",j,hold));self.jobs[j]["job-state"]=4
    def enablePrinter(self,name):self.actions.append(("enable",name));self.p["printer-state"]=3

class Recovery(unittest.TestCase):
    def run_case(self,c=None,errors=None,access=None,attempts=None,probe=lambda uri:True,access_check=None):
        c=c or FakeCups();attempts={} if attempts is None else attempts
        save=Mock()
        with patch.object(m,"list_job_ids",side_effect=lambda name:[j for j,v in c.jobs.items() if v.get("job-printer-uri","").endswith("/"+name)]):
            result=m.recover(c,NAME,[LINE] if errors is None else errors,[ACCESS]+(access or []),attempts,save,NOW,probe,access_check)
        return result,c,save
    def test_recovers_and_never_releases(self):
        ok,c,save=self.run_case()
        self.assertTrue(ok);save.assert_called_once()
        self.assertEqual(c.actions,[("hold",189,"indefinite"),("hold",190,"indefinite"),("enable",NAME)])
    def test_manual_pause(self):
        for op in ("Pause-Printer","Pause-Printer-After-Current-Job","Disable-Printer","Reject-Jobs"):
            ok,c,save=self.run_case(access=[f'localhost - root [27/Nov/2026:15:19:04 -0300] "POST /admin/" 200 1 {op} successful-ok'])
            self.assertFalse(ok);self.assertFalse(c.actions)
    def test_no_exact_failure(self):
        for lines in ([],[LINE.replace("189","190")],[LINE.replace("15:19:03","15:18:03")]):
            ok,c,_=self.run_case(errors=lines);self.assertFalse(ok);self.assertFalse(c.actions)
    def test_unreachable_or_cooldown(self):
        for args in ({"probe":lambda uri:False},{"attempts":{NAME:NOW-60}}):
            ok,c,_=self.run_case(**args);self.assertFalse(ok);self.assertFalse(c.actions)
    def test_other_printers_and_processing(self):
        for uri in ("ipp://192.168.0.28:631/printers/other","usb://Canon/GX7100","ipp://8.8.8.8/ipp/print","ipp://192.168.0.28/ipp/print?x=1"):
            c=FakeCups();c.p["device-uri"]=uri
            self.assertFalse(self.run_case(c=c)[0]);self.assertFalse(c.actions)
        c=FakeCups();c.jobs[190]["job-state"]=5
        self.assertFalse(self.run_case(c=c)[0]);self.assertFalse(c.actions)
    def test_hold_not_confirmed(self):
        c=FakeCups();c.setJobHoldUntil=lambda j,h:None
        self.assertFalse(self.run_case(c=c)[0]);self.assertFalse(c.actions)
    def test_new_job_during_hold(self):
        c=FakeCups();old=c.setJobHoldUntil
        def hold(j,h):
            old(j,h);c.jobs[192]={"job-printer-uri":"ipp://localhost/printers/"+NAME,"job-state":3}
        c.setJobHoldUntil=hold
        self.assertFalse(self.run_case(c=c)[0]);self.assertNotIn(("enable",NAME),c.actions)
    def test_pause_race(self):
        c=FakeCups();fresh=Mock(side_effect=[[ACCESS],[ACCESS,'localhost [27/Nov/2026:15:19:05 -0300] Pause-Printer']])
        self.assertFalse(self.run_case(c=c,access_check=fresh)[0]);self.assertNotIn(("enable",NAME),c.actions)
    def test_probe_requires_model_idle_and_empty(self):
        out="\n".join(["printer-make-and-model (textWithoutLanguage) = Canon GX7100 series","printer-state (enum) = idle",
            "printer-state-reasons (keyword) = none","printer-is-accepting-jobs (boolean) = true","queued-job-count (integer) = 0"])
        for s,expected in ((out,True),(out.replace("GX7100","GX6000"),False),(out.replace("= idle","= processing"),False),(out.replace("= 0","= 2"),False)):
            with patch.object(m.subprocess,"run",return_value=subprocess.CompletedProcess([],0,s,"")):
                self.assertEqual(m.printer_ready(URI),expected)
    def test_missing_access_history(self):
        ok,c,_=self.run_case(access_check=lambda:[])
        self.assertFalse(ok);self.assertFalse(c.actions)
    def test_package_hooks(self):
        s=(ROOT/"scripts/build-update-package.py").read_text()
        h=(ROOT/"config/hooks/normal/106-enfoque-print-pages.hook.chroot").read_text()
        self.assertIn("enfoque-ipp-recovery.timer",s)
        self.assertIn("enfoque-ipp-recovery.timer",h)
