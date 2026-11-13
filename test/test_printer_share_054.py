"""0.2.54: opt-in CUPS share must fail closed and protect thermal queues."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest import TestCase
import unittest

ROOT=Path(__file__).resolve().parents[1]
S=SourceFileLoader("enfoque_printer_share_054",str(
    ROOT/"config/includes.chroot/usr/local/sbin/enfoque-printer-share")).load_module()

BASE="""LogLevel warn
Listen localhost:631
Listen /run/cups/cups.sock
Browsing Off
<Location />
  Order allow,deny
</Location>
<Location /admin>
  AuthType Default
  Require user @SYSTEM
  Order allow,deny
</Location>
<Location /admin/conf>
  AuthType Default
  Require user @SYSTEM
  Order allow,deny
</Location>
<Location /admin/log>
  AuthType Default
  Require user @SYSTEM
  Order allow,deny
</Location>
"""
FW="""add table inet enfoque_guard
flush table inet enfoque_guard
add chain inet enfoque_guard input { type filter hook input priority 10; policy drop; }
add rule inet enfoque_guard input iifname "lo" accept
"""


class PrinterShare054(TestCase):
    def test_restrict_to_only_private_host_network_and_interface(self):
        cups,fw=S.configured_share(BASE,FW,"192.168.111.173","192.168.111.0/24","enp2s0")
        self.assertIn("Listen 192.168.111.173:631",cups)
        self.assertIn("Allow from 192.168.111.0/24",cups)
        self.assertNotIn("Port 631",cups)
        self.assertIn('iifname "enp2s0" ip saddr 192.168.111.0/24 ip daddr 192.168.111.173 tcp dport 631 accept',fw)
        self.assertEqual(S.configured_share(cups,fw,"192.168.111.173","192.168.111.0/24","enp2s0"),(cups,fw))
        self.assertIn("Allow from localhost",cups)

    def test_cannot_share_public_or_broad_ranges(self):
        for ip,net in [("8.8.8.8","8.8.8.0/24"),("127.0.0.1","127.0.0.0/24"),
                       ("192.168.111.173","0.0.0.0/0"),("192.168.111.173","192.168.0.0/16")]:
            with self.subTest(ip=ip,net=net),self.assertRaises(ValueError):
                S.private_lan(ip,net)

    def test_remote_admin_access_not_enabled(self):
        cups,_=S.configured_share(BASE,FW,"192.168.111.173","192.168.111.0/24","enp2s0")
        for endpoint in ("admin","admin/conf","admin/log"):
            body=cups.split("<Location /"+endpoint+">",1)[1].split("</Location>",1)[0]
            self.assertNotIn("192.168.111.0/24",body)
            self.assertIn("Allow from localhost",body)

    def test_unusual_config_fails_closed(self):
        with self.assertRaises(ValueError):
            S.configured_share(BASE.replace("Listen localhost:631","Port 631"),
                              FW,"192.168.111.173","192.168.111.0/24","enp2s0")

    def test_no_forced_share_or_admin_esc_in_package(self):
        file=(ROOT/"config/includes.chroot/usr/local/sbin/enfoque-printer-share").read_text()
        self.assertIn("Thermal/receipt printers must never be exposed",file)
        self.assertIn("printer-is-shared=true",file)
        self.assertIn("refusing",file.lower())
        self.assertNotIn("chmod 777",file)
        pack=(ROOT/"scripts/build-update-package.py").read_text()
        self.assertIn("usr/local/sbin/enfoque-",pack)


if __name__=="__main__":
    unittest.main()
