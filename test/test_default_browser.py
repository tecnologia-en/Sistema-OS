"""Regressoes de navegador padrao no primeiro login do XFCE."""
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "config/includes.chroot/usr/local/bin/enfoque-chrome-padrao"
AUTO = ROOT / "config/includes.chroot/etc/xdg/autostart/enfoque-chrome-padrao.desktop"
SYSTEM_MIME = ROOT / "config/includes.chroot/etc/xdg/mimeapps.list"
SKEL_MIME = ROOT / "config/includes.chroot/etc/skel/.config/mimeapps.list"
PANEL_ICON = ROOT / "config/includes.chroot/usr/share/icons/hicolor/48x48/apps/enfoque-intranet.png"


class BrowserConfigTests(unittest.TestCase):
    def test_system_user_mime_associations(self):
        for location in (SYSTEM_MIME, SKEL_MIME):
            values = location.read_text(encoding="utf-8")
            self.assertIn("[Default Applications]", values)
            for kind in ("text/html", "application/xhtml+xml", "application/pdf",
                         "x-scheme-handler/http", "x-scheme-handler/https"):
                self.assertIn(kind + "=google-chrome.desktop", values)

    def test_autostart_and_source_are_present(self):
        self.assertTrue(SCRIPT.is_file())
        self.assertIn("Exec=/usr/local/bin/enfoque-chrome-padrao", AUTO.read_text(encoding="utf-8"))
        self.assertIn("OnlyShowIn=XFCE;", AUTO.read_text(encoding="utf-8"))
        body = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("xdg-settings set default-web-browser", body)
        self.assertIn("xdg-settings get default-web-browser", body)
        self.assertIn("xdg-mime default", body)
        self.assertIn("chrome-default-v023", body)

    def test_real_intranet_svg_png_fallback(self):
        self.assertTrue(PANEL_ICON.is_file())
        content = PANEL_ICON.read_bytes()
        self.assertEqual(content[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual((int.from_bytes(content[16:20], "big"), int.from_bytes(content[20:24], "big")), (48, 48))
        packages = (ROOT / "config/package-lists/enfoque-base.list.chroot").read_text(encoding="utf-8")
        self.assertIn("\nlibrsvg2-common\n", packages)


@unittest.skipUnless(os.name == "posix", "Executa scripts /bin/sh nos runners Linux")
class BrowserRuntimeTests(unittest.TestCase):
    def make_fake(self, root: Path, invalid_get: bool):
        directory = root / "bin"
        directory.mkdir()
        stubs = {
            "google-chrome-stable": "#!/bin/sh\nexit 0\n",
            "xdg-settings": ("#!/bin/sh\n"
                "if [ \"$1\" = set ]; then echo \"settings:$*\" >> \"$TEST_LOG\"; exit 0; fi\n"
                + ("echo debian-sensible-browser.desktop\n" if invalid_get else "echo google-chrome.desktop\n")),
            "xdg-mime": ("#!/bin/sh\n"
                "if [ \"$1\" = default ]; then echo \"mime:$*\" >> \"$TEST_LOG\"; exit 0; fi\n"
                "if [ \"$1\" = query ]; then echo google-chrome.desktop; exit 0; fi\n"
                "exit 1\n"),
            "sleep": "#!/bin/sh\nexit 0\n",
            "logger": "#!/bin/sh\nexit 0\n",
        }
        for name, body in stubs.items():
            path = directory / name
            path.write_text(body, encoding="utf-8")
            path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
        env = dict(os.environ)
        env["HOME"] = str(root)
        env["XDG_STATE_HOME"] = str(root / ".local" / "state")
        env["TEST_LOG"] = str(root / "browser.log")
        env["PATH"] = str(directory) + ":/usr/bin:/bin"
        return env

    def test_first_login_configures_but_next_login_respects_choice(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            env = self.make_fake(root, invalid_get=False)
            first = subprocess.run(["/bin/sh", str(SCRIPT)], env=env,
                                   capture_output=True, text=True, timeout=8)
            self.assertEqual(first.returncode, 0, first.stderr)
            lines = (root / "browser.log").read_text().splitlines()
            self.assertEqual(len(lines), 2)
            self.assertIn("settings:set default-web-browser google-chrome.desktop", lines[0])
            self.assertIn("x-scheme-handler/https", lines[1])
            marker = root / ".local" / "state" / "enfoque-os" / "chrome-default-v023"
            self.assertTrue(marker.is_file())
            second = subprocess.run(["/bin/sh", str(SCRIPT)], env=env,
                                    capture_output=True, text=True, timeout=8)
            self.assertEqual(second.returncode, 0)
            self.assertEqual((root / "browser.log").read_text().splitlines(), lines)

    def test_fails_without_verifying_default_browser(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            env = self.make_fake(root, invalid_get=True)
            result = subprocess.run(["/bin/sh", str(SCRIPT)], env=env,
                                    capture_output=True, text=True, timeout=8)
            self.assertNotEqual(result.returncode, 0)
            marker = root / ".local" / "state" / "enfoque-os" / "chrome-default-v023"
            self.assertFalse(marker.exists())


if __name__ == "__main__":
    unittest.main()
