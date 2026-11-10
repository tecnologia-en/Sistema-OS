"""Tests: control-plane only applies signed version through fixed updater."""
import importlib.machinery, importlib.util
from pathlib import Path
from unittest import TestCase, mock
import unittest

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "config/includes.chroot/usr/local/sbin/enfoque-update-control"
loader = importlib.machinery.SourceFileLoader("enfoque_update_control_031", str(P))
spec = importlib.util.spec_from_loader(loader.name, loader)
worker = importlib.util.module_from_spec(spec)
loader.exec_module(worker)


class ControlledUpdateTests(TestCase):
    def test_legacy_automatic_upgrade_is_disabled(self):
        builder=(ROOT / "scripts/build-update-package.py").read_text()
        self.assertIn("systemctl disable --now enfoque-update-apply.timer",builder)
        worker_unit=(ROOT / "config/includes.chroot/etc/systemd/system/enfoque-update-control.service").read_text()
        self.assertIn("NoNewPrivileges=yes",worker_unit)
        self.assertIn("ExecStart=/usr/local/sbin/enfoque-update-control",worker_unit)

    def test_only_newer_signed_core_version_accepted(self):
        job={"action":"update-core","version":"0.2.31",
             "campaignId":"786f1d1b-c72c-4f19-9005-5e4dac1800c3",
             "packageSha256":"a"*64}
        self.assertFalse(worker.validate_command(job,"0.2.30")["alreadyApplied"])
        self.assertTrue(worker.validate_command(job,"0.2.31")["alreadyApplied"])
        with self.assertRaises(ValueError):
            worker.validate_command({**job,"action":"shell","program":"/bin/sh"},"0.2.30")
        with self.assertRaises(ValueError):
            worker.validate_command({**job,"version":"0.2.31;rm"},"0.2.30")
        with self.assertRaises(ValueError):
            worker.validate_command({**job,"packageSha256":"evil"},"0.2.30")
        self.assertEqual(worker.compare("0.2.9","0.2.30"),-1)

    def test_manual_authorization_only_calls_exact_core_updater(self):
        actions=[]
        job={"action":"update-core","version":"0.2.31",
             "campaignId":"786f1d1b-c72c-4f19-9005-5e4dac1800c3",
             "packageSha256":"a"*64}
        def reply(action,payload,*args):
            actions.append((action,payload))
            return {"ok":True,"command":job} if action=="poll" else {"ok":True}
        installed=iter(["0.2.30","0.2.31"])
        def run(args,**kwargs):
            self.assertEqual(args,[worker.UPDATER,"apply-core","0.2.31"])
            self.assertIsNotNone(kwargs["timeout"])
            return mock.Mock(returncode=0,stderr="")
        with mock.patch.object(worker,"state",return_value=("enfoqueos-uuid","secret")), \
             mock.patch.object(worker,"installed_version",side_effect=lambda:next(installed)), \
             mock.patch.object(worker,"post",side_effect=reply), \
             mock.patch.object(worker.subprocess,"run",side_effect=run) as invoked:
            self.assertEqual(worker.run_once(),0)
        invoked.assert_called_once()
        self.assertEqual(actions[-1][0],"report")
        self.assertEqual(actions[-1][1]["status"],"concluida")

    def test_no_campaign_never_calls_updater(self):
        with mock.patch.object(worker,"state",return_value=("id","token")), \
             mock.patch.object(worker,"installed_version",return_value="0.2.30"), \
             mock.patch.object(worker,"post",return_value={"ok":True,"command":None}), \
             mock.patch.object(worker.subprocess,"run") as invoked:
            self.assertEqual(worker.run_once(),0)
        invoked.assert_not_called()

    def test_failed_update_reports_failed_without_claiming_success(self):
        job={"action":"update-core","version":"0.2.31",
             "campaignId":"786f1d1b-c72c-4f19-9005-5e4dac1800c3",
             "packageSha256":"a"*64}
        actions=[]
        def reply(action,payload,*args):
            actions.append((action,payload))
            return {"ok":True,"command":job} if action=="poll" else {"ok":True}
        with mock.patch.object(worker,"state",return_value=("id","token")), \
             mock.patch.object(worker,"installed_version",return_value="0.2.30"), \
             mock.patch.object(worker,"post",side_effect=reply), \
             mock.patch.object(worker.subprocess,"run",return_value=mock.Mock(returncode=1,stderr="")):
            self.assertEqual(worker.run_once(),1)
        self.assertEqual(actions[-1][1]["status"],"falha")


if __name__=="__main__":
    unittest.main()
