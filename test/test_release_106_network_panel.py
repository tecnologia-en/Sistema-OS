"""Regressao Enfoque OS 1.0.6: indicador fixo e preservacao 1.0.5."""
import importlib.machinery
import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from types import SimpleNamespace
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/"config/includes.chroot"
BIN=BASE/"usr/local/bin"
def load(path,name):
    loader=importlib.machinery.SourceFileLoader(name,str(path))
    spec=importlib.util.spec_from_loader(loader.name,loader)
    mod=importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod
network=load(BIN/"enfoque-rede-painel","network_indicator_106")
migrate=load(BIN/"enfoque-rede-painel-migrar","network_migrate_106")

class NetworkIndicator106(unittest.TestCase):
    def test_ethernet_has_priority_over_wifi(self):
        command=lambda: SimpleNamespace(returncode=0,stdout="wifi:connected\nethernet:connected\n")
        self.assertEqual(network.network_state(command),"ethernet")
    def test_wifi(self):
        command=lambda: SimpleNamespace(returncode=0,stdout="wifi:connected\nethernet:unavailable\n")
        self.assertEqual(network.network_state(command),"wifi")
    def test_disconnected_never_hides_icon(self):
        command=lambda: SimpleNamespace(returncode=0,stdout="wifi:disconnected\nethernet:unavailable\n")
        self.assertEqual(network.network_state(command),"offline")
        for state in ("ethernet","wifi","offline"):
            markup=network.markup(state)
            self.assertIn("<img>/usr/share/icons/EnfoqueFluent/scalable/status/enfoque-network-",markup)
            self.assertIn("<tool>",markup)
            self.assertIn("\n<click>",markup)
            self.assertIn("<click>nm-connection-editor</click>",markup)
    def test_nm_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            p=pathlib.Path(temp)/"enp1s0"
            p.mkdir()
            (p/"carrier").write_text("1")
            def failing():
                raise subprocess.TimeoutExpired("nmcli",2)
            self.assertEqual(network.network_state(failing,pathlib.Path(temp)),"ethernet")
    def test_panel_templates_have_fixed_plugin(self):
        for src in (BASE/"etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml",
                    BASE/"etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml"):
            root=ET.parse(src).getroot()
            panel=root.find("./property[@name='panels']/property[@name='panel-1']/property[@name='plugin-ids']")
            ids=[int(x.get("value")) for x in panel.findall("value")]
            self.assertEqual(ids.count(19),1)
            self.assertLess(ids.index(13),ids.index(19))
            self.assertEqual(root.find("./property[@name='plugins']/property[@name='plugin-19']").get("value"),"genmon")
        self.assertIn("UpdatePeriod=5000",(BASE/"etc/skel/.config/xfce4/panel/genmon-19.rc").read_text())
        for kind in ("ethernet","wifi","offline"):
            ET.parse(BASE/f"usr/share/icons/EnfoqueFluent/scalable/status/enfoque-network-{kind}.svg")
    def test_existing_panel_migration_preserves_other_plugins(self):
        calls=[]
        original="O valor e uma matriz com 4 itens:\n1\n13\n9\n11\n"
        def fake(*args):
            calls.append(args)
            if args==("-p",migrate.IDS):
                return SimpleNamespace(returncode=0,stdout=original)
            if args==("-p",migrate.PLUGIN):
                return SimpleNamespace(returncode=1,stdout="")
            return SimpleNamespace(returncode=0,stdout="",stderr="")
        with patch.object(migrate,"xfconf",side_effect=fake),patch.object(migrate,"SOURCE",pathlib.Path("/nonexistent")):
            self.assertEqual(migrate.main(),0)
        self.assertIn(("-p",migrate.PLUGIN,"-n","-t","string","-s","genmon"),calls)
        applied=calls[-1]
        self.assertEqual([int(applied[i+1]) for i in range(len(applied)-1) if applied[i]=="-s"],[1,13,19,9,11])
    def test_migration_is_idempotent(self):
        with patch.object(migrate,"xfconf",return_value=SimpleNamespace(
                returncode=0,stdout="1\n13\n19\n9\n")),patch.object(
                migrate,"SOURCE",pathlib.Path("/nonexistent")) as unused:
            self.assertEqual(migrate.main(),0)
    def test_retain_n960k_105(self):
        self.assertGreaterEqual(tuple(map(int, (BASE/"etc/enfoque-os-release").read_text().split('VERSION="')[1].split('"')[0].split('.'))), (1,0,7))
        self.assertTrue((BASE/"usr/local/lib/enfoque-n960k/N960K-HID-Headless.py").exists())
        self.assertTrue((BASE/"usr/share/enfoque-monitora/n960k-tef-inativa/n960k-background.js").exists())
        self.assertIn("1.7.8.38",(ROOT/"docs/RELEASE_105_N960K_LEDGER_PILOTO.md").read_text())
        self.assertIn("enfoque-rede-painel-sessoes",(ROOT/"scripts/build-update-package.py").read_text())

if __name__=="__main__": unittest.main()
