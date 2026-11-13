"""0.2.48 release contract: storage is inspectable and boot ISO is safe."""
from release_contract import assert_minimum_release
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"config/includes.chroot"


class Release047(unittest.TestCase):
    def test_release_version_and_firmware(self):
        release=(BASE/"etc/enfoque-os-release").read_text()
        assert_minimum_release(self,release)
        self.assertRegex(release,r'STATUS="piloto-modern-desktop-[0-9]{3}"')
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text()
        for pkg in ("firmware-misc-nonfree","pciutils","kmod","parted"):
            self.assertIn("\n"+pkg+"\n",packages)

    def test_disk_report_and_probe_are_read_only(self):
        source=(BASE/"usr/local/sbin/enfoque-install-system").read_text()
        gui=(BASE/"usr/local/bin/enfoque-instalar").read_text()
        self.assertIn('def disk_inventory():',source)
        self.assertIn('def storage_controller_hints():',source)
        self.assertIn('def load_storage_modules():',source)
        self.assertIn('def disk_has_unsupported_stack(node):',source)
        self.assertIn('parser.add_argument("--probe-disks"',source)
        self.assertIn('parser.add_argument("--diagnose-disks"',source)
        self.assertIn('if disk not in candidates:',source)
        self.assertIn('"sudo", "-n", INSTALLER, "--probe-disks"',gui)
        self.assertIn('"--diagnose-disks"',gui)
        self.assertIn("self.submit.set_sensitive(bool(self.disks))",gui)
        self.assertIn('self.diagnose.connect("clicked", self.show_disk_diagnostics)',gui)

    def test_ci_produces_iso_in_github_but_not_published_to_internal_apt(self):
        flow=(ROOT/".github/workflows/build-iso.yml").read_text()
        self.assertIn("test/test_storage_detection_047.py",flow)
        self.assertIn("test/test_release_047.py",flow)
        self.assertIn("Build ISO with Debian 13 in a disposable container",flow)
        self.assertIn("Upload full ISO and checksums to GitHub Actions artifacts",flow)
        self.assertIn("gh release create",flow)
        self.assertNotIn("publish-update-repo.sh",flow)
        self.assertIn('test_release_047.py', (ROOT/"scripts/check-project.sh").read_text())
        diversion=(ROOT/"scripts/test-xfce-diversion.sh").read_text()
        self.assertIn('PKG="$TMP/enfoque-os-core_${VERSION}-${REVISION}_all.deb"',diversion)
        self.assertNotIn('enfoque-os-core_0.2.46-1_all.deb',diversion)
        self.assertTrue((ROOT/"docs/RELEASE_047_ARMAZENAMENTO_INSTALADOR.md").is_file())


if __name__ == "__main__":
    unittest.main()
