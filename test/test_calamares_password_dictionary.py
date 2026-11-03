"""Regression test: a clean ISO must accept strong passwords in Calamares."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "config/package-lists/enfoque-base.list.chroot"
HOOK = ROOT / "config/hooks/normal/094-calamares-password-dictionary.hook.chroot"


class InstallerPasswordDictionaryTests(unittest.TestCase):
    def test_explicit_dependencies_without_apt_recommends(self):
        packages = set(PKG.read_text().splitlines())
        self.assertIn("calamares-settings-debian", packages)
        self.assertIn("cracklib-runtime", packages)
        self.assertIn("wbrazilian", packages)
        self.assertTrue(HOOK.stat().st_mode & 0o100)
        script = HOOK.read_text()
        self.assertIn("update-cracklib", script)
        self.assertIn("cracklib_dict.pwd", script)
        self.assertIn("cracklib_dict.pwi", script)
        self.assertIn("cracklib_dict.hwm", script)
        self.assertNotIn("chmod 777", script)


if __name__ == "__main__":
    unittest.main()
