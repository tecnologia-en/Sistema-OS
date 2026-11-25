"""PDF default migration and local print inventory regression."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/'config/includes.chroot'
SCRIPT=TREE/'usr/local/bin/enfoque-pdf-padrao'

class PdfDefaults(unittest.TestCase):
    def test_iso_and_apt_dependency(self):
        self.assertIn('\nevince\n',(ROOT/'config/package-lists/enfoque-base.list.chroot').read_text())
        self.assertIn('evince, xdg-utils',(ROOT/'scripts/build-update-package.py').read_text())
        self.assertIn('runuser -u',(ROOT/'scripts/build-update-package.py').read_text())
        self.assertIn('Exec=/usr/local/bin/enfoque-pdf-padrao',(TREE/'etc/xdg/autostart/enfoque-pdf-padrao.desktop').read_text())
    def test_migration_once_only_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); bin=root/'bin';bin.mkdir()
            scripts={'id':'echo 1000','evince':'exit 0','xdg-mime':'''if [ "$1" = default ]; then
  printf '%s\n' "$*" >> "$LOG"
  printf '%s\n' "$2" > "$ASSOC"
elif [ "$1" = query ]; then cat "$ASSOC"; else exit 1; fi'''}
            for name, body in scripts.items():
                p=bin/name;p.write_text('#!/bin/sh\n'+body+'\n');p.chmod(0o755)
            env=dict(os.environ,HOME=tmp,XDG_STATE_HOME=str(root/'state'),PATH=str(bin)+':/usr/bin:/bin',LOG=str(root/'log'),ASSOC=str(root/'assoc'))
            for _ in range(2):
                subprocess.run(['/bin/sh',str(SCRIPT)],env=env,check=True,timeout=5)
            self.assertEqual((root/'log').read_text().splitlines(),['default org.gnome.Evince.desktop application/pdf'])
            self.assertTrue((root/'state/enfoque-os/pdf-default-v108').exists())
    def test_printer_locale(self):
        for path in ('enfoque-desktop-shell','enfoque-impressoras-painel'):
            self.assertIn('"LC_ALL":"C"',(TREE/'usr/local/bin'/path).read_text())
if __name__=='__main__':unittest.main()
