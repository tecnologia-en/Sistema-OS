"""0.2.48: count CUPS printed pages per device without document metadata."""
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone, timedelta

ROOT=Path(__file__).resolve().parents[1]
CLIENT=ROOT/"config/includes.chroot/usr/local/sbin/enfoque-print-pages"

def get_module():
    loader=importlib.machinery.SourceFileLoader("enfoque_print_pages_048",str(CLIENT))
    spec=importlib.util.spec_from_loader(loader.name,loader)
    module=importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module
M=get_module()
SETUP=ROOT/"config/includes.chroot/usr/local/sbin/enfoque-print-cups-setup"
loader=importlib.machinery.SourceFileLoader("enfoque_print_cups_setup_048",str(SETUP))
spec=importlib.util.spec_from_loader(loader.name,loader)
S=importlib.util.module_from_spec(spec)
loader.exec_module(S)
UUID="52c2e20d-2aab-4d2e-b04b-1505cda08721"
DATE=datetime.now(timezone(timedelta(hours=-3))).strftime("%d/%b/%Y:%H:%M:%S %z")
def row(job,pages):
    return f"Elgin_i9 user {job} [{DATE}] total {pages}\n"

class PrintCounter048(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)
        self.log=self.path/"page_log"
        self.db=M.open_db(self.path/"db"/"events.sqlite3")
        self.addCleanup(self.db.close)

    def test_first_existing_log_baselines_without_old_pages(self):
        self.log.write_text(row(1,4))
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),0)
        with self.log.open("a") as f:f.write(row(2,2)+row(3,1))
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),2)
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),0)
        events=M.pending(self.db)
        self.assertEqual(sorted(e["pages"] for e in events),[1,2])
        self.assertEqual(len(set(e["id"] for e in events)),2)
        self.assertNotIn("user",json.dumps(events))
        self.assertNotIn("Elgin",json.dumps(events))

    def test_file_initially_missing_counts_first_page(self):
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),0)
        self.log.write_text(row(1,1))
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),1)

    def test_partial_line_not_counted_until_completed(self):
        self.log.write_text("")
        M.scan_pages(self.db,UUID,self.log)
        with self.log.open("a") as f:f.write(row(4,3).rstrip("\n"))
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),0)
        with self.log.open("a") as f:f.write("\n")
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),1)
        self.assertEqual(M.pending(self.db)[0]["pages"],3)

    def test_rotated_file_tail_is_captured_without_double_count(self):
        self.log.write_text("")
        M.scan_pages(self.db,UUID,self.log)
        with self.log.open("a") as f:f.write(row(1,1))
        self.log.rename(self.path/"page_log.1")
        self.log.write_text(row(2,2))
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),2)
        self.assertEqual(M.scan_pages(self.db,UUID,self.log),0)
        self.assertEqual(sorted(e["pages"] for e in M.pending(self.db)),[1,2])

    def test_retries_acked_only_after_server_confirmation(self):
        self.log.write_text("")
        M.scan_pages(self.db,UUID,self.log)
        with self.log.open("a") as f:f.write(row(7,3))
        M.scan_pages(self.db,UUID,self.log)
        auth={"id":"884ff46f-d465-4129-ac0c-34507430cc51","token":"token-in-tests"}
        class Response:
            status=200
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def read(self,n):
                return json.dumps({"ok":True,"accepted":1}).encode()
        transport=lambda request,timeout:Response()
        self.assertEqual(M.send_events(self.db,UUID,auth,transport=transport),1)
        self.assertEqual(M.pending(self.db),[])
        self.assertEqual(M.send_events(self.db,UUID,auth,transport=transport),0)

    def test_copy_counts_and_timezones_are_preserved(self):
        stamp=M.iso_cups_time("12/Nov/2026:12:05:08 -0300")
        self.assertEqual(stamp,"2026-11-12T15:05:08Z")
        text=row(31,2)
        event=M.event_from_line(text,UUID,11,88,0,23)
        self.assertEqual(event["pages"],2)
        self.assertEqual(len(event["id"]),64)

    def test_runtime_office_filter_excludes_receipts_and_keeps_page_log_cursor(self):
        self.log.write_text("")
        M.scan_pages(self.db,UUID,self.log,office=lambda name:name=="Office_HP")
        self.log.write_text(row(1,9)+row(2,3).replace("Elgin_i9","Office_HP"))
        self.assertEqual(M.scan_pages(self.db,UUID,self.log,office=lambda name:name=="Office_HP"),1)
        self.assertEqual([e["pages"] for e in M.pending(self.db)],[3])
        self.assertEqual(M.scan_pages(self.db,UUID,self.log,office=lambda name:name=="Office_HP"),0)

    def test_cups_setup_idempotent_and_defers_while_printing(self):
        conf=self.path/"cupsd.conf"
        backup=self.path/"backup"/"cupsd.old"
        conf.write_text("LogLevel warn\\nPageLogFormat\\n")
        ran=[]
        class Result: returncode=0
        self.assertFalse(S.apply(conf,backup,image=False,
            busy=lambda:True,checker=lambda:Result(),restart=lambda:ran.append("restart")))
        self.assertEqual(ran,[])
        self.assertEqual(conf.read_text(),"LogLevel warn\\nPageLogFormat\\n")
        self.assertTrue(S.apply(conf,backup,image=False,
            busy=lambda:False,checker=lambda:Result(),restart=lambda:ran.append("restart")))
        self.assertEqual(ran,["restart"])
        self.assertTrue(conf.read_text().count(S.FORMAT)==1)
        self.assertTrue(backup.is_file())
        self.assertFalse(S.apply(conf,backup,image=False,
            busy=lambda:False,checker=lambda:Result(),restart=lambda:ran.append("restart")))
        self.assertEqual(ran,["restart"])

    def test_cups_invalid_format_restores_previous_config(self):
        conf=self.path/"cupsd.conf"
        backup=self.path/"backup"/"cupsd.old"
        original="LogLevel warn\\nPageLogFormat\\n"
        conf.write_text(original)
        class Failed: returncode=1
        with self.assertRaises(RuntimeError):
            S.apply(conf,backup,image=True,checker=lambda:Failed())
        self.assertEqual(conf.read_text(),original)

    def test_cups_log_format_no_metadata_uploaded(self):
        hook=(ROOT/"config/hooks/normal/106-enfoque-print-pages.hook.chroot").read_text()
        self.assertIn("enfoque-print-cups-setup --image",hook)
        cups=(ROOT/"config/includes.chroot/usr/local/sbin/enfoque-print-cups-setup").read_text()
        self.assertIn("PageLogFormat %p %u %j %T %P %C",cups)
        self.assertNotIn("%{job-name}",hook)
        self.assertNotIn("lp -",hook)

if __name__=="__main__":unittest.main()
