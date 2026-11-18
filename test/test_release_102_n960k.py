"""Regression checks for Enfoque OS 1.0.2: N960K staged but Chrome extension inactive."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
TREE=ROOT/"config/includes.chroot"
VENDOR="bflibhoonjpjkbmkdoeliobebafhfgpc"
EXT=TREE/"usr/share/enfoque-monitora/n960k-tef-inativa"
AGENT=TREE/"usr/local/lib/enfoque-n960k"


class EnfoqueN960KRelease102(unittest.TestCase):
    def test_published_release_and_inactive_manifest(self):
        self.assertIn('VERSION="1.0.2"',(TREE/"etc/enfoque-os-release").read_text())
        m=json.loads((EXT/"manifest.json").read_text())
        self.assertEqual(m["version"],"1.7.8.27")
        self.assertEqual(m["background"]["service_worker"],"n960k-discovery-worker.js")
        self.assertTrue((EXT/"n960k-boot-ready.js").is_file())
        self.assertIn("n960k-boot-ready.js",(EXT/"n960k-discovery-worker.js").read_text())
        self.assertIn("enfoqueN960KRequest('health', {})",(EXT/"n960k-boot-ready.js").read_text())
        self.assertEqual(len(m["content_scripts"]),2)
        self.assertTrue((EXT/"LEIA-ME-EXTENSAO-DESATIVADA.txt").is_file())

    def test_zero_changes_to_payment_and_visual_logic(self):
        known={
          "n960k-pdv.js":"05b5ba7f3e47e1b9f64e039b75086f0aaa5b409977646c588f3bc7795a0f71f4",
          "n960k-logic.js":"e08d0f9b5bb317868e4223e2aaff92a35986e205b5af8db3c9ad8dbf3ce2805d"
        }
        for name,expected in known.items():
            with self.subTest(name=name):
                sha=hashlib.sha256((EXT/name).read_bytes()).hexdigest()
                self.assertEqual(sha,expected)

    def test_monitora_policy_remains_sole_forced_extension(self):
        policies=TREE/"etc/opt/chrome/policies/managed"
        for p in policies.iterdir():
            if p.is_file():
                self.assertNotIn(VENDOR,p.read_text(errors="replace"))
        mon=json.loads((policies/"40-enfoque-monitora.json").read_text())
        self.assertEqual(
            mon["ExtensionSettings"]["ngghdkeagknifjchbdaaejgkipgfghbb"]["installation_mode"],
            "force_installed")
        self.assertTrue((TREE/"usr/share/enfoque-monitora/monitora-1.1.0.crx").is_file())

    def test_no_unexpected_chrome_extension_autostart(self):
        launcher=(TREE/"usr/local/bin/enfoque-n960k-session-start").read_text()
        for pattern in ("--load-extension","ExtensionInstallForcelist","google-chrome","chromium","brave"):
            self.assertNotIn(pattern.lower(),launcher.lower())
        startup=(TREE/"etc/xdg/autostart/enfoque-n960k-servicos.desktop").read_text()
        self.assertIn("NoDisplay=true",startup)
        self.assertIn("enfoque-n960k-session-start",startup)

    def test_user_services_and_specific_udev_permissions(self):
        rules=(TREE/"etc/udev/rules.d/72-enfoque-n960k.rules").read_text()
        active="\n".join(x for x in rules.splitlines() if not x.lstrip().startswith("#"))
        self.assertIn('ATTR{idVendor}=="1e0e"',active)
        self.assertIn('ATTR{idProduct}=="902b"',active)
        self.assertIn('MODE="0660"',active)
        self.assertIn('TAG+="uaccess"',active)
        self.assertNotIn("0666",active)
        for name in ("enfoque-n960k-discovery.service","enfoque-n960k-bridge.service"):
            t=(TREE/"usr/lib/systemd/user"/name).read_text()
            self.assertIn("WantedBy=default.target",t)
            self.assertIn("NoNewPrivileges=true",t)
            self.assertIn("UMask=0077",t)
            self.assertNotIn("User=root",t)

    def test_portable_aoa2_backend_and_inactive_config(self):
        for name in ("N960K-Local-Bridge.py","N960K-HID-Headless.py",
                     "N960K-Pix-X-Absolute-Config.json","Enfoque-N960K-Discovery.py"):
            self.assertTrue((AGENT/name).is_file())
        pix=json.loads((AGENT/"N960K-Pix-X-Absolute-Config.json").read_text())
        self.assertEqual((pix["touch"]["x"],pix["touch"]["y"]),(543,98))
        self.assertEqual(pix["touch"]["repeats"],3)
        self.assertTrue(pix["pixKeepsHidConnectedAfterCancel"])

    def test_package_builder_includes_every_new_component(self):
        script=ROOT/"scripts/build-update-package.py"
        spec=importlib.util.spec_from_file_location("n960k_release_package",script)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.version(),"1.0.2")
        self.assertEqual(module.PRINTER_BANK_BASELINE,"1.0.0-1")
        for name in (
            "etc/udev/rules.d/72-enfoque-n960k.rules",
            "usr/local/bin/enfoque-n960k-session-start",
            "usr/local/lib/enfoque-n960k/N960K-Local-Bridge.py",
            "usr/lib/systemd/user/enfoque-n960k-bridge.service",
            "usr/share/enfoque-monitora/n960k-tef-inativa/manifest.json",
            "usr/share/enfoque-monitora/n960k-tef-inativa/n960k-boot-ready.js"
        ):
            self.assertTrue(module.managed(name),name)
        source=script.read_text()
        self.assertIn("systemctl --global enable enfoque-n960k-discovery.service enfoque-n960k-bridge.service",source)
        self.assertIn("libusb-1.0-0, udev",source)
        self.assertIn("PRINTER_BANK_BASELINE",source)

    def test_apt_publisher_supports_core_only_when_printers_present(self):
        text=(ROOT/"scripts/publish-update-repo.sh").read_text()
        self.assertIn("required_printer",text)
        self.assertIn("installed_bank",text)
        self.assertIn("dpkg --compare-versions",text)
        self.assertIn("apt-ftparchive packages pool/main/e/enfoque-printer-drivers",text)

    def test_new_usb_dependencies_in_iso(self):
        packages=(ROOT/"config/package-lists/enfoque-base.list.chroot").read_text().splitlines()
        self.assertIn("libusb-1.0-0",packages)
        self.assertIn("udev",packages)

    def test_no_secret_files_embedded(self):
        banned={"agent.json","identity.json","private.key",".env",
                "n960k-agent-secret.json","n960k-agent-ledger.json"}
        self.assertFalse(any(p.name in banned for p in EXT.rglob("*") if p.is_file()))
        self.assertFalse(any(p.name in banned for p in AGENT.rglob("*") if p.is_file()))


if __name__=="__main__":
    unittest.main()
