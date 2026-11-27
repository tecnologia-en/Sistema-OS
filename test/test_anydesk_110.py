"""Release 1.0.10: safe AnyDesk readiness and official vendor upgrade."""
import hashlib
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"
READY = TREE / "usr/local/sbin/enfoque-anydesk-x11-ready"
MAINT = TREE / "usr/local/sbin/enfoque-anydesk-maintenance"
DROP = "etc/systemd/system/anydesk.service.d/20-enfoque-x11.conf"


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class AnyDeskRelease(unittest.TestCase):
    def test_packaged_and_preserves_keyboard(self):
        builder = module("builder110", ROOT / "scripts/build-update-package.py")
        for rel in (DROP, str(READY.relative_to(TREE)), str(MAINT.relative_to(TREE))):
            self.assertTrue(builder.managed(rel))
            self.assertTrue((TREE / rel).is_file())
        self.assertIn("After=display-manager.service", (TREE / DROP).read_text())
        self.assertIn("ExecStartPre=/usr/local/sbin/enfoque-anydesk-x11-ready", (TREE / DROP).read_text())
        config = (TREE / "etc/default/keyboard").read_text()
        self.assertIn('XKBMODEL="abnt2"', config)
        self.assertIn('XKBLAYOUT="br"', config)
        for token in ("xhost", "setxkbmap", "systemctl restart", "chmod ", "xauth merge"):
            self.assertNotIn(token, READY.read_text())
        self.assertNotIn("enfoque-anydesk-maintenance --apply", (ROOT / "scripts/build-update-package.py").read_text())
        for path in (READY, MAINT):
            subprocess.run(["sh", "-n", str(path)], check=True)
            self.assertTrue(path.stat().st_mode & 0o100)

    def test_readiness_succeeds_and_headless_is_nonblocking(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            bindir = p / "bin"
            bindir.mkdir()
            sockpath = p / "X0"
            auth = p / "auth"
            auth.write_text("test only")
            def cmd(name, code):
                f = bindir / name
                f.write_text("#!/bin/sh\n" + code + "\n")
                f.chmod(0o755)
            cmd("id", "echo 0")
            cmd("systemctl", "exit \"$DISPLAY_RC\"")
            cmd("xdpyinfo", "exit 0")
            cmd("sleep", "exit 0")
            script = p / "ready"
            script.write_text(READY.read_text().replace("/tmp/.X11-unix/X0", str(sockpath)).replace("/run/lightdm/root/:0", str(auth)))
            env = dict(os.environ, PATH=str(bindir) + ":" + os.environ["PATH"], DISPLAY_RC="0")
            with socket.socket(socket.AF_UNIX) as sock:
                sock.bind(str(sockpath))
                result = subprocess.run(["sh", str(script)], env=env, capture_output=True, text=True, check=True)
                self.assertIn("LightDM X11 ready", result.stdout)
            env["DISPLAY_RC"] = "1"
            result = subprocess.run(["sh", str(script)], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(result.stdout, "")
            env["DISPLAY_RC"] = "0"
            auth.unlink()
            result = subprocess.run(["sh", str(script)], env=env, capture_output=True, text=True, check=True)
            self.assertIn("not confirmed", result.stderr)

    def test_upgrade_needs_explicit_apply_and_rejects_extra_package(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td); bindir = p / "bin"; bindir.mkdir()
            key = p / "vendor.asc"; key.write_text("test fixture")
            source = p / "vendor.list"
            source.write_text("deb [arch=amd64 signed-by=" + str(key) + "] https://deb.anydesk.com all main\n")
            script = p / "maintenance"
            script.write_text(MAINT.read_text().replace("/etc/apt/keyrings/keys.anydesk.com.asc",str(key)).replace("/etc/apt/sources.list.d/anydesk-stable.list",str(source)).replace("94a83c7e40d5919e897041e7c8b07ed46bd830114a6e4bcf1607675ec4bcecd5",hashlib.sha256(key.read_bytes()).hexdigest()).replace("/run/live/medium",str(p / "not-live")))
            def cmd(name, code):
                f=bindir/name;f.write_text("#!/bin/sh\n"+code+"\n");f.chmod(0o755)
            cmd("id","echo 0")
            cmd("dpkg-query","if [ -e \"$FLAG\" ]; then echo 8.1.1; else echo 8.1.0; fi")
            cmd("dpkg","exit 1")
            cmd("systemctl","exit 0")
            cmd("apt-get", "case \" $* \" in *' -s '*) printf '%s\\n' 'Inst anydesk (8.1.1)' ; [ \"$BAD\" = 1 ] && echo 'Inst unexpected (1)' ; exit 0;; *' -y '*) touch \"$FLAG\";; esac; exit 0")
            env=dict(os.environ,PATH=str(bindir)+":"+os.environ["PATH"],FLAG=str(p/"applied"),BAD="1")
            result=subprocess.run(["sh",str(script)],env=env,capture_output=True)
            self.assertEqual(result.returncode,2)
            result=subprocess.run(["sh",str(script),"--apply"],env=env,capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertFalse((p/"applied").exists())
            env["BAD"]="0"
            result=subprocess.run(["sh",str(script),"--apply"],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertTrue((p/"applied").exists())


class PublishRelease(unittest.TestCase):
    def test_rejects_bad_digest_and_extra_assets(self):
        m=module("publish110", ROOT/"scripts/publish-github-release.py")
        expected={"a":(2,"sha256:valid")}
        good={"name":"a","state":"uploaded","size":2,"digest":"sha256:valid"}
        self.assertEqual(m.assets_ok({"assets":[good]},expected),{"a"})
        for bad in ({**good,"digest":"wrong"},{**good,"name":"b"},{**good,"state":"starter"}):
            with self.assertRaises(RuntimeError):
                m.assets_ok({"assets":[bad]},expected)

    def test_release_is_not_promoted_until_every_asset_verified(self):
        m=module("publish110b",ROOT/"scripts/publish-github-release.py")
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"asset";p.write_bytes(b"sample")
            sha="a"*40
            state={"data":None,"attempts":0,"published":False}
            def lookup(*args):return state["data"]
            def run(*args):
                if args[:2]==("release","create"):
                    state["attempts"]+=1
                    if state["attempts"]==2:
                        state["data"]={"draft":True,"assets":[]}
                elif args[:2]==("release","upload"):
                    state["data"]["assets"].append({"name":p.name,"state":"uploaded","size":p.stat().st_size,"digest":m.digest(p)})
                elif args[:2]==("release","edit"):
                    self.assertEqual(len(state["data"]["assets"]),1)
                    state["data"]["draft"]=False
                    state["published"]=True
                return subprocess.CompletedProcess(args,0,"","")
            with mock.patch.object(m,"release",side_effect=lookup),mock.patch.object(m,"run",side_effect=run),mock.patch.object(m.time,"sleep"):
                m.publish("repo","tag",sha,[p],"title","notes")
            self.assertEqual(state["attempts"],2)
            self.assertTrue(state["published"])


if __name__ == "__main__":
    unittest.main()
