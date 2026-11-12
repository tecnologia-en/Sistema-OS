"""Enfoque OS 0.2.48: Canfoque Pilot and CUPS page telemetry."""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
class Release048(unittest.TestCase):
    def test_iso_release_and_pinned_binaries(self):
        self.assertIn('VERSION="0.2.50"',(TREE/"etc/enfoque-os-release").read_text())
        self.assertIn("Canfoque",(TREE/"usr/share/applications/enfoque-canfoque.desktop").read_text())
        self.assertIn("stage-canfoque-iso.sh",(ROOT/"scripts/build-iso.sh").read_text())
        stage=(ROOT/"scripts/stage-canfoque-iso.sh").read_text()
        self.assertIn("ca87493fe0cbc33f11ed0495807821d64e67b53c0572a325ef3e288e2e0053af",stage)
        self.assertIn("81096d2f65fd43352540c351bca15bb0712a2a6f9efa4c95e9fff25cb97b3b81",stage)
        self.assertIn("sha256sum -c --status",stage)

    def test_chrome_wget_preinstalled_before_hook(self):
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text().splitlines()
        self.assertIn("wget", packages)
        hook=(ROOT/"config/hooks/normal/090-google-chrome.hook.chroot").read_text()
        self.assertIn("dpkg-query -W -f=",hook)
        self.assertIn("Acquire::Retries=5",hook)

    def test_firstboot_device_identity_is_not_shared(self):
        binding=(TREE/"usr/local/sbin/enfoque-canfoque-firstboot").read_text()
        self.assertIn('"authorisedForRemoteControl": False',binding)
        self.assertIn('"transportId": None',binding)
        self.assertIn('firstboot.json',binding)
        self.assertNotIn('CANFOQUE_MASTER_PASSWORD',binding)
        launcher=(TREE/"usr/local/bin/enfoque-canfoque").read_text()
        self.assertIn('/run/live/medium',launcher)
        self.assertIn('/opt/enfoque/canfoque-pilot.AppImage',launcher)

    def test_cups_logging_counts_without_documents(self):
        agent=(TREE/"usr/local/sbin/enfoque-print-pages").read_text()
        for x in ('INSERT OR IGNORE','X-Enfoque-Device-Id','X-Enfoque-Device-Token',
                  'time.sleep(2.0)','/api/remote-access/agent/print-pages'):
            self.assertIn(x,agent)
        service=(TREE/"etc/systemd/system/enfoque-print-pages.service").read_text()
        self.assertIn('ConditionPathExists=/var/lib/enfoque-os/firstboot.json',service)
        self.assertIn('ProtectSystem=strict',service)
        self.assertTrue((TREE/"etc/systemd/system/enfoque-print-pages.timer").is_file())
        self.assertTrue((TREE/"etc/systemd/system/enfoque-print-cups-setup.timer").is_file())
        helper=(TREE/"usr/local/sbin/enfoque-print-cups-setup").read_text()
        self.assertIn('PageLogFormat %p %u %j %T %P %C',helper)
        self.assertIn('cups_busy()',helper)

    def test_package_updates_old_pcs_without_reinstall(self):
        src=(ROOT/"scripts/build-update-package.py").read_text()
        for part in ('opt/enfoque/canfoque-pilot.AppImage',
          'usr/local/sbin/enfoque-print-pages',
          'usr/local/sbin/enfoque-print-cups-setup',
          'enfoque-print-pages.timer','enfoque-print-cups-setup.timer'):
            self.assertIn(part,src)
        check=(ROOT/"scripts/check-project.sh").read_text()
        self.assertIn('test_release_048.py',check)
        self.assertIn('test_print_pages_048.py',check)
        flow=(ROOT/".github/workflows/build-iso.yml").read_text()
        self.assertIn('test/test_release_048.py',flow)
        self.assertIn('test/test_print_pages_048.py',flow)
        self.assertIn('feature/canfoque-v2-iso-048',flow)

if __name__=='__main__':unittest.main()
