"""First-run + installed-user regressions for Enfoque OS."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/"config/includes.chroot"
IDENTITY=CONFIG/"usr/local/lib/enfoque-onboarding/identity.py"
spec=importlib.util.spec_from_file_location("enfoque_identity",IDENTITY)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FirstAccessTests(unittest.TestCase):
    def test_companies_and_units(self):
        self.assertIn("enfoque",mod.COMPANIES)
        self.assertIn("papel-arte",mod.COMPANIES)
        valid=mod.validated_identity("caixa1","enfoque","ilha-plaza",when="2026-10-16T00:00:00+00:00")
        self.assertEqual(valid["companyName"],"Enfoque Papelaria")
        self.assertEqual(valid["unitName"],"Ilha Plaza")
        self.assertNotIn("password",valid)
        for cid,unit in [("enfoque","unknown"),("papel-arte","ilha-plaza"),("random","administracao")]:
            with self.assertRaises(ValueError):
                mod.validated_identity("caixa1",cid,unit)
        with self.assertRaises(ValueError):
            mod.validated_identity("../etc/passwd","enfoque","ilha-plaza")

    def test_file_persists_and_does_not_store_password(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/"home"/"employee"/".config"/"enfoque-os"/"identity.json"
            record=mod.store_identity("caixa1","enfoque","ilha-plaza",p)
            self.assertTrue(p.is_file())
            self.assertEqual(record["username"],"caixa1")
            self.assertEqual(mod.load_identity(p),record)
            data=p.read_text(encoding="utf-8")
            self.assertNotIn("password",data.lower())
            self.assertNotIn("senha",data.lower())
            self.assertNotIn("token",data.lower())
            with self.assertRaises(FileExistsError):
                mod.store_identity("caixa1","enfoque","centro",p)
            if os.name=="posix":
                self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)

    def test_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/"identity.json"
            mod.store_identity("caixa1","papel-arte","papel-arte",p)
            record=json.loads(p.read_text(encoding="utf-8"))
            record["companyName"]="Not the registered company"
            p.write_text(json.dumps(record),encoding="utf-8")
            with self.assertRaises(ValueError):
                mod.load_identity(p)

    def test_debian_calamares_creates_password_account_during_install(self):
        packages=(CONFIG/"../package-lists/enfoque-base.list.chroot").resolve().read_text(encoding="utf-8").splitlines()
        self.assertIn("calamares-settings-debian",packages)
        self.assertIn("pkexec",packages)
        app=(CONFIG/"usr/share/applications/enfoque-instalar.desktop").read_text(encoding="utf-8")
        self.assertIn("Exec=/usr/local/bin/enfoque-instalar",app)
        script=(CONFIG/"usr/local/bin/enfoque-instalar").read_text(encoding="utf-8")
        self.assertIn("/run/live/medium",script)
        self.assertIn("exec calamares-install-debian",script)
        self.assertIn("TryExec=calamares-install-debian",app)

    def test_password_login_installed_only(self):
        binary=(CONFIG/"usr/local/sbin/enfoque-login-instalado").read_text(encoding="utf-8")
        self.assertIn("/run/live/medium",binary)
        self.assertIn("autologin-user=",binary)
        self.assertIn("greeter-hide-users=false",binary)
        self.assertIn("greeter-show-manual-login=true",binary)
        hook=(ROOT/"config/hooks/normal/098-enable-installed-login.hook.chroot").read_text()
        self.assertIn("systemctl enable enfoque-login-instalado.service",hook)
        service=(CONFIG/"etc/systemd/system/enfoque-login-instalado.service").read_text()
        self.assertIn("Before=lightdm.service",service)
        self.assertIn("ConditionPathExists=!/run/live/medium",service)
        self.assertTrue((CONFIG/"etc/lightdm/lightdm-gtk-greeter.conf.d/50-enfoque-theme.conf").is_file())

    def test_first_login_company_wizard_only_if_installed(self):
        script=(CONFIG/"usr/local/bin/enfoque-primeiro-acesso").read_text(encoding="utf-8")
        self.assertIn("running_live()",script)
        self.assertIn("store_identity(",script)
        self.assertIn("Gtk.ComboBoxText()",script)
        self.assertNotIn("chpasswd",script)
        launcher=(CONFIG/"etc/xdg/autostart/enfoque-primeiro-acesso.desktop").read_text(encoding="utf-8")
        self.assertIn("Exec=/usr/local/bin/enfoque-primeiro-acesso",launcher)

    def test_date_separate_formats_and_no_intrusive_hub_autostart(self):
        panel=ET.parse(CONFIG/"etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml").getroot()
        clock=panel.find("./property[@name='plugins']/property[@name='plugin-10']")
        self.assertEqual(clock.get("value"),"clock")
        fmt={p.get("name"):p.get("value") for p in clock}
        self.assertEqual(fmt.get("digital-date-format"),"%d/%m/%Y")
        self.assertEqual(fmt.get("digital-time-format"),"%H:%M")
        self.assertEqual(fmt.get("digital-layout"),"3")
        central=(CONFIG/"etc/xdg/autostart/enfoque-central.desktop").read_text()
        self.assertIn("X-GNOME-Autostart-enabled=false",central)

    def test_telemetry_contains_only_optional_non_secret_user_data(self):
        src=(CONFIG/"usr/local/bin/enfoque-telemetria").read_text(encoding="utf-8")
        self.assertIn("active_session_company()",src)
        self.assertIn('"localUsername": name',src)
        self.assertIn('"companyId": cid',src)
        self.assertIn('"companyUnitId": unit',src)
        self.assertNotIn('"password":',src)
        self.assertNotIn('"senha":',src)
        self.assertNotIn('"token": token',src)

if __name__=="__main__":
    unittest.main()
