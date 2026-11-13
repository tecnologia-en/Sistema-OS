import importlib.util,sqlite3,tempfile,unittest,json
from pathlib import Path
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
C=load("collector052",ROOT/"config/includes.chroot/usr/local/lib/enfoque-printer-meter/collector.py")
D=load("server_meter052",ROOT/"server/office-printer-meter-db.py")
NOW=datetime.now(timezone.utc).replace(microsecond=0)
def reading(pages=100,at=NOW,**values):
 return {"model":"HP LaserJet","serial":"SERIAL001","endpointHost":"192.168.1.3",
         "profile":"printer-mib","source":"physical-snmp","totalPages":pages,
         "measuredAt":at.isoformat().replace("+00:00","Z"),**values}
class OfficeMeter052(unittest.TestCase):
 def test_receipts_excluded_in_all_paths(self):
  for name,model,uri in [("Bema","Bematech MP-4200 TH","usb://Bematech/MP4200"),
    ("Elgin_i9","Generic","usb://ELGIN/i9"),("TM","Epson TM-T20","socket://192.168.1.4")]:
   self.assertFalse(C.office_queue(name,{"printer-make-and-model":model,"device-uri":uri}))
  self.assertTrue(C.office_queue("Pantum",{"printer-make-and-model":"Pantum M6550"}))
  self.assertTrue(C.office_queue("HP",{"printer-make-and-model":"HP Color LaserJet Pro MFP 4303"}))
 def test_only_known_private_targets_and_store_scoping(self):
  found={"HP":{"printer-make-and-model":"HP LaserJet","device-uri":"socket://192.168.1.3"},
   "Thermal":{"printer-make-and-model":"Bematech MP4200","device-uri":"socket://192.168.1.4"},
   "External":{"printer-make-and-model":"HP LaserJet","device-uri":"ipp://8.8.8.8/ipp/print"}}
  self.assertEqual(C.targets("centro",found,{}),["192.168.1.3"])
  self.assertNotIn("192.168.2.100",C.targets("centro",{},{}))
  self.assertEqual(C.targets("itaipu",{},{}),["192.168.2.100"])
 def test_verified_canon_labels_and_split(self):
  values={"1.3.6.1.2.1.1.1.0":"Canon GX7100 series"}
  base="1.3.6.1.4.1.1602.1.11.2.1.1"
  for idx,label,total in [(1,"Total 1",350),(17,"Copy (Total 1)",188),(25,"Print (Total 1)",162)]:
   values[f"{base}.2.{idx}"]=label;values[f"{base}.3.{idx}"]=total
  with patch.object(C.snmp,"snmp_read",side_effect=lambda host,oid:values[oid]):
   data=C.snmp.read_metrics("192.168.0.31")
   self.assertEqual((data["printPages"],data["copyPages"],data["totalPages"]),(162,188,350))
   values[f"{base}.2.17"]="Unknown counter"
   with self.assertRaises(ValueError):C.snmp.read_metrics("192.168.0.31")
 def test_generic_counter_requires_impression_unit_and_never_invents_copies(self):
  values={"1.3.6.1.2.1.1.1.0":"HP LaserJet",
   "1.3.6.1.2.1.43.10.2.1.3.1.1":7,"1.3.6.1.2.1.43.10.2.1.4.1.1":123,
   "1.3.6.1.2.1.43.5.1.1.17.1":"SERIAL001",
   "1.3.6.1.4.1.11.2.3.9.1.1.7.0":"MFG:HP;MDL:HP LaserJet;SN:SERIAL001;"}
  with patch.object(C.snmp,"snmp_read",side_effect=lambda host,oid:values[oid]):
   result=C.snmp.read_metrics("192.168.1.3")
   self.assertEqual(result["totalPages"],123);self.assertNotIn("copyPages",result)
   values["1.3.6.1.2.1.43.10.2.1.3.1.1"]=8
   with self.assertRaises(ValueError):C.snmp.read_metrics("192.168.1.3")
 def test_durable_offline_queue_retry_and_poll_interval(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/"meter.sqlite3";db=sqlite3.connect(path)
   self.assertEqual(C.collect(db,"centro",clock=lambda:1000,hosts=["192.168.1.3"],
                             reader=lambda host:reading()),1)
   self.assertEqual(C.collect(db,"centro",clock=lambda:1010,hosts=["192.168.1.3"],
                             reader=lambda host:reading()),0)
   db.close();db=sqlite3.connect(path)
   auth={"id":"test","token":"test"}
   with self.assertRaises(OSError):C.send(db,"device",auth,transport=lambda *a,**k:(_ for _ in ()).throw(OSError("offline")))
   self.assertEqual(db.execute("SELECT COUNT(*) FROM printer_meter_queue WHERE delivered=0").fetchone()[0],1)
   class Response:
    status=200
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self,n):return b'{"ok":true,"accepted":1}'
   self.assertEqual(C.send(db,"device",auth,transport=lambda *a,**k:Response()),1)
   self.assertEqual(C.send(db,"device",auth,transport=lambda *a,**k:Response()),0)
   db.close()
 def test_server_baseline_multicomputer_dedupe_reset_and_store_identity(self):
  with tempfile.TemporaryDirectory() as temp:
   db=D.connect(Path(temp)/"db.sqlite3")
   data={"unitId":"centro","unitName":"Centro","deviceUuid":"pc1","readings":[reading()]}
   D.ingest(db,data,bridge=False)
   self.assertEqual(db.execute("SELECT delta FROM readings").fetchone()[0],0)
   data["deviceUuid"]="pc2";D.ingest(db,data,bridge=False)
   self.assertEqual(db.execute("SELECT COUNT(*) FROM readings").fetchone()[0],1)
   data["readings"]=[reading(105,NOW+timedelta(minutes=1))]
   D.ingest(db,data,bridge=False)
   self.assertEqual(db.execute("SELECT SUM(delta) FROM readings").fetchone()[0],5)
   data["readings"]=[reading(2,NOW+timedelta(minutes=2))]
   D.ingest(db,data,bridge=False)
   data["readings"]=[reading(8,NOW+timedelta(minutes=3))]
   D.ingest(db,data,bridge=False)
   self.assertEqual(db.execute("SELECT SUM(delta) FROM readings").fetchone()[0],5)
   self.assertEqual(db.execute("SELECT reset_review FROM meters").fetchone()[0],1)
   self.assertNotEqual(D.printer_id("centro",reading()),D.printer_id("itaipu",reading()))
   db.close()
 def test_known_printer_ids_match_existing_server_pollers(self):
  import hashlib
  canon=reading(profile="canon-gx7100",endpointHost="192.168.0.31")
  hp=reading(endpointHost="192.168.2.100",serial="BRBST9G0CS",model="HP Color LaserJet Pro MFP 4303")
  self.assertEqual(D.printer_id("ilha-plaza",canon),hashlib.sha256(b"enfoque|ilha-plaza|canon-gx7100|192.168.0.31").hexdigest())
  self.assertEqual(D.printer_id("itaipu",hp),hashlib.sha256(b"enfoque|itaipu|hp-4303|192.168.2.100|BRBST9G0CS").hexdigest())
 def test_partial_period_does_not_assign_prior_day_pages_to_today(self):
  with tempfile.TemporaryDirectory() as temp:
   db=D.connect(Path(temp)/"db.sqlite3")
   day=NOW.astimezone(D.TZ).date()
   prior=datetime.combine(day,D.time(0),D.TZ)-timedelta(hours=1)
   after=prior+timedelta(hours=2)
   data={"unitId":"centro","unitName":"Centro","deviceUuid":"pc1","readings":[reading(100,prior),reading(110,after)]}
   D.ingest(db,data,bridge=False)
   result=D.summary(db,{"fromDate":day.isoformat(),"toDate":day.isoformat()})
   self.assertEqual(result["officeMeters"][0]["periodPages"],0)
   self.assertTrue(result["officeMeters"][0]["partial"])
   db.close()
