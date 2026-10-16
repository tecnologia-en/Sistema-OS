"""Tests that the Live XFCE activation selects the actual Xorg VT."""
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "config/includes.chroot/usr/local/sbin/enfoque-ativar-grafico"


class GraphicalSwitchTests(unittest.TestCase):
    def run_mock(self, current):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fakebin = root / "bin"
            fakebin.mkdir()
            commands = {
                "pgrep": "#!/bin/sh\nexit 0\n",
                "ps": "#!/bin/sh\nprintf '%s\\n' '/usr/lib/xorg/Xorg :0 -seat seat0 vt7 -novtswitch'\n",
                "fgconsole": "#!/bin/sh\nprintf '%s\\n' '" + str(current) + "'\n",
                "chvt": "#!/bin/sh\nprintf '%s\\n' \"$1\" >> \"$TEST_CHVT_LOG\"\n",
                "logger": "#!/bin/sh\nexit 0\n",
                "sleep": "#!/bin/sh\nexit 0\n",
            }
            for name, body in commands.items():
                file = fakebin / name
                file.write_text(body)
                file.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
            out = root / "chvt.log"
            env = dict(os.environ, PATH=str(fakebin) + ":/usr/bin:/bin", TEST_CHVT_LOG=str(out))
            result = subprocess.run(["/bin/sh", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=8)
            self.assertEqual(result.returncode, 0, result.stderr)
            return out.read_text().strip() if out.exists() else ""

    def test_switches_to_xorg_vt_from_tty1(self):
        self.assertEqual(self.run_mock("1"), "7")

    def test_no_switch_when_graphic_vt_already_active(self):
        self.assertEqual(self.run_mock("7"), "")


if __name__ == "__main__":
    unittest.main()
