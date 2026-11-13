"""0.2.43 package and security regression, no workstation side effects."""
from release_contract import assert_minimum_release
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
EXT_ID="ngghdkeagknifjchbdaaejgkipgfghbb"


class Release043Tests(unittest.TestCase):
    def test_lock_screen_native_and_lit(self):
        p=(TREE/"usr/local/bin/enfoque-proteger-tela").read_text()
        w=(TREE/"usr/local/bin/enfoque-screensaver-watchdog").read_text()
        visual=(TREE/"usr/local/bin/enfoque-tela-de-bloqueio").read_text()
        assert_minimum_release(self,(TREE/"etc/enfoque-os-release").read_text())
        for expected in ("/saver/idle-activation/delay int 3",
                         "/lock/saver-activation/delay int 12",
                         "/lock/enabled bool true","/saver/mode int 2",
                         "tela-043-configurada","xset -dpms"):
            self.assertIn(expected,p)
        self.assertNotIn('[ ! -e "$marker" ] || exit 0',p)
        self.assertIn("xset -dpms",w)
        self.assertIn("GdkX11.X11Window.foreign_new_for_display",visual)
        self.assertIn("Gdk.cairo_create",visual)
        self.assertNotIn("Gtk.Plug",visual)
        self.assertIn("XSCREENSAVER_WINDOW",visual)
        self.assertIn("signal.SIGTERM",visual)
        self.assertIn("BlankTime",(TREE/"etc/X11/xorg.conf.d/90-enfoque-tela-ligada.conf").read_text())

    def test_managed_extension_and_no_baked_secret(self):
        config=json.loads((TREE/"etc/opt/chrome/policies/managed/40-enfoque-monitora.json").read_text())
        forced=config["ExtensionSettings"][EXT_ID]
        self.assertEqual(forced["installation_mode"],"force_installed")
        self.assertTrue(forced["update_url"].startswith("https://intranet.enfoquepapelaria.com.br/"))
        self.assertTrue(forced["override_update_url"])
        self.assertNotIn("3rdparty",config)
        self.assertNotIn("monitoraToken",json.dumps(config))
        self.assertEqual((TREE/"usr/share/enfoque-monitora/monitora-1.1.0.crx").read_bytes()[:4],b"Cr24")
        self.assertFalse(list(TREE.rglob("*.pem")))
        service=(TREE/"etc/systemd/system/enfoque-monitora-provision.service").read_text()
        self.assertIn("ConditionPathExists=/etc/enfoque-os/agent.json",service)
        self.assertIn("ConditionPathExists=!/run/live/medium",service)
        package=(ROOT/"scripts/build-update-package.py").read_text()
        self.assertIn("enfoque-monitora-provision.timer",package)
        self.assertIn("enfoque-tela-ativa",package)

    def test_bootstrap_policy_is_atomic_per_device(self):
        p=TREE/"usr/local/sbin/enfoque-monitora-provision"
        loader=importlib.machinery.SourceFileLoader("enfoque043",str(p))
        spec=importlib.util.spec_from_loader("enfoque043",loader)
        module=importlib.util.module_from_spec(spec)
        loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            prior=module.POLICY
            module.POLICY=Path(tmp)/"managed"/"41-enfoque-monitora-device.json"
            try:
                # CI roda como usuario sem privilegios. Nesse caso, a
                # seguranca esperada e negar configuracao de policy root.
                if os.geteuid() != 0:
                    with self.assertRaises(PermissionError):
                        module.policy_file("T"*48)
                    return
                self.assertTrue(module.policy_file("T"*48))
                self.assertFalse(module.policy_file("T"*48))
                obj=json.loads(module.POLICY.read_text())
                self.assertEqual(obj["3rdparty"]["extensions"][EXT_ID]["monitoraToken"],"T"*48)
                self.assertEqual(module.POLICY.stat().st_mode&0o777,0o644)
                with self.assertRaises(ValueError):
                    module.policy_file("public-uuid")
                self.assertTrue(module.remove_policy())
            finally:
                module.POLICY=prior
