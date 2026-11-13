"""Security tests for automatic GitHub release to intranet publication."""
import hashlib
from importlib.machinery import SourceFileLoader
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
manifest_mod = SourceFileLoader("create_release_manifest", str(ROOT / "scripts/create-release-manifest.py")).load_module()
sync_mod = SourceFileLoader("sync_github_release", str(ROOT / "scripts/sync-github-release.py")).load_module()


class DeliveryTests(unittest.TestCase):
    def test_release_number_is_parsed_not_frozen(self):
        self.assertEqual(manifest_mod.version_and_revision('VERSION="0.2.53"\nPACKAGE_REVISION="1"\n'), ("0.2.53", "1"))
        with self.assertRaises(ValueError):
            manifest_mod.version_and_revision('VERSION="latest"\nPACKAGE_REVISION="1"\n')

    def test_monotonic_release_selection_from_trusted_sha(self):
        def rel(tag, sha="a" * 40, prerelease=True):
            return {"tag_name": tag, "target_commitish": sha, "prerelease": prerelease, "draft": False}
        releases = [rel("enfoque-os-v0.2.52-run108"),
                    rel("enfoque-os-v0.2.53-run111"),
                    rel("enfoque-os-v0.2.54-run113", prerelease=False),
                    rel("enfoque-os-v0.2.54-run115", sha="not-a-commit"),
                    rel("malicious")]
        self.assertEqual([x["tag_name"] for x in sync_mod.eligible_releases(releases, "0.2.52")],
                         ["enfoque-os-v0.2.53-run111"])

    def test_asset_digest_is_mandatory(self):
        with self.assertRaises(ValueError):
            sync_mod.asset_map({"assets": [{"name": "UPDATE_MANIFEST.json", "digest": None}]})
        with self.assertRaises(ValueError):
            sync_mod.asset_map({"assets": [{"name": "same", "digest": "sha256:" + "a" * 64},
                                            {"name": "same", "digest": "sha256:" + "a" * 64}]})

    def test_asset_url_cannot_redirect_in_initial_url(self):
        tag = "enfoque-os-v0.2.53-run110"
        with self.assertRaises(ValueError):
            sync_mod.trusted_asset_url({
                "name": "enfoque-os-core_0.2.53-1_all.deb",
                "browser_download_url": "https://malicious.example.com/package"
            }, tag)

    def test_fleet_schedule_blocks_unattended_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            schedule = root / "schedule.json"
            campaigns = root / "state.json"
            campaigns.write_text(json.dumps({"campaigns": [], "deferredFleet": None}))
            with mock.patch.object(sync_mod, "UPDATE_SCHEDULE", schedule), \
                 mock.patch.object(sync_mod, "UPDATE_STATE", campaigns):
                schedule.write_text(json.dumps({"enabled": True}))
                with self.assertRaisesRegex(RuntimeError, "schedule"):
                    sync_mod.safe_to_publish()
                schedule.write_text(json.dumps({"enabled": False}))
                self.assertTrue(sync_mod.safe_to_publish())
                campaigns.write_text(json.dumps({"campaigns": [{"status": "executando"}]}))
                with self.assertRaisesRegex(RuntimeError, "campaign"):
                    sync_mod.safe_to_publish()
                campaigns.write_text(json.dumps({"campaigns": [], "deferredFleet": {"version": "0.2.53"}}))
                with self.assertRaisesRegex(RuntimeError, "deferred"):
                    sync_mod.safe_to_publish()

    def test_manifest_uses_same_packages_as_iso_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            rel = root / "config/includes.chroot/etc/enfoque-os-release"
            rel.parent.mkdir(parents=True)
            rel.write_text('VERSION="0.2.52"\nPACKAGE_REVISION="1"\n')
            packages = root / "config/packages.chroot"
            packages.mkdir()
            for name, arch in (("enfoque-os-core", "all"),
                               ("enfoque-printer-drivers", "amd64")):
                fixture = root / ("mock-" + name)
                control = fixture / "DEBIAN/control"
                control.parent.mkdir(parents=True)
                control.write_text("Package: " + name + "\nVersion: 0.2.52-1\n"
                                   + "Architecture: " + arch + "\nMaintainer: Test\n"
                                   + "Description: Test-only package\n")
                target = packages / f"{name}_0.2.52-1_{arch}.deb"
                subprocess.run(["dpkg-deb", "--root-owner-group", "--build",
                                str(fixture), str(target)], check=True,
                               stdout=subprocess.DEVNULL)
            dist = root / "dist"
            dist.mkdir()
            iso = dist / "enfoque-os-0.2.52-piloto-amd64.iso"
            iso.write_bytes(b"fake iso for manifest parser test only")
            digest = hashlib.sha256(iso.read_bytes()).hexdigest()
            (dist / "SHA256SUMS").write_text(digest + "  ./" + iso.name + "\n")
            env = {"GITHUB_REF": "refs/heads/release/enfoque-os",
                   "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "100",
                   "GITHUB_RUN_NUMBER": "77"}
            result = manifest_mod.make_manifest(root, env)
            self.assertEqual(result["version"], "0.2.52")
            self.assertEqual(result["iso"]["sha256"], digest)
            self.assertEqual(len(result["packages"]), 2)
            env["GITHUB_REF"] = "refs/heads/feature/anything"
            with self.assertRaises(ValueError):
                manifest_mod.make_manifest(root, env)

    def test_version_comparison_never_treats_minor_as_string(self):
        self.assertLess(sync_mod.version_tuple("0.2.9"), sync_mod.version_tuple("0.2.52"))
        self.assertGreater(sync_mod.version_tuple("0.3.0"), sync_mod.version_tuple("0.2.999"))
        with self.assertRaises(ValueError):
            sync_mod.version_tuple("../0.2.55")


if __name__ == "__main__":
    unittest.main()
