from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
CFG=ROOT/'config/includes.chroot'
HOOK=ROOT/'config/hooks/normal/093-anydesk-oficial.hook.chroot'
class AnyDeskTests(unittest.TestCase):
 def test_signed_vendor_repo(self):
  s=HOOK.read_text()
  self.assertTrue(HOOK.stat().st_mode & 0o100)
  for item in ('https://deb.anydesk.com all main','https://keys.anydesk.com/repos/DEB-GPG-KEY',
    'signed-by=/etc/apt/keyrings/keys.anydesk.com.asc','sha256sum -c -',
    "version='8.1.0'",'apt-get install -y --no-install-recommends "anydesk=$version"'):
   self.assertIn(item,s)
 def test_service_usable_and_no_build_identity(self):
  s=HOOK.read_text()
  for item in ('/usr/share/anydesk/files/systemd/anydesk.service',
   'systemctl enable anydesk.service','multi-user.target.wants/anydesk.service',
   'rm -rf -- /etc/anydesk /root/.anydesk /var/lib/anydesk'):
   self.assertIn(item,s)
  for item in ('--set-password','--register-license','--get-id'):
   self.assertNotIn(item,s)
  for item in ('etc/anydesk','var/lib/anydesk','root/.anydesk'):
   self.assertFalse((CFG/item).exists())
 def test_desktop_and_office_remain(self):
  desk=CFG/'etc/skel/Desktop'
  self.assertEqual({p.name for p in desk.iterdir() if p.is_file()},{'SIGE.desktop','Intranet.desktop'})
  self.assertFalse((desk/'AnyDesk.desktop').exists())
  pkgs=(ROOT/'config/package-lists/enfoque-base.list.chroot').read_text()
  for pkg in ('libreoffice','libreoffice-gtk3','libreoffice-l10n-pt-br','xdg-utils'):
   self.assertIn('\n'+pkg+'\n',pkgs)
if __name__=='__main__':
 unittest.main()
