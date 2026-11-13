#!/usr/bin/env python3
"""Create immutable GitHub Release metadata from a successful Enfoque OS ISO build."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / "config/includes.chroot/etc/enfoque-os-release"
VERSION_RE = re.compile(r'^VERSION="([0-9]+[.][0-9]+[.][0-9]+)"$', re.M)
REVISION_RE = re.compile(r'^PACKAGE_REVISION="([1-9][0-9]*)"$', re.M)


def version_and_revision(text):
    version = VERSION_RE.search(text)
    revision = REVISION_RE.search(text)
    if not version or not revision:
        raise ValueError("VERSION and PACKAGE_REVISION are required")
    return version.group(1), revision.group(1)


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def package_details(path, expected_name, expected_version, expected_arch):
    if not path.is_file():
        raise ValueError("Missing APT package: " + str(path))
    raw = subprocess.check_output(
        ["dpkg-deb", "-f", str(path), "Package", "Version", "Architecture"],
        text=True, timeout=30).splitlines()
    fields = dict(line.split(": ", 1) for line in raw)
    if fields != {"Package": expected_name, "Version": expected_version,
                  "Architecture": expected_arch}:
        raise ValueError("Package field mismatch: " + str(path))
    return {"name": expected_name, "filename": path.name,
            "version": expected_version, "architecture": expected_arch,
            "sha256": digest(path), "size": path.stat().st_size}


def make_manifest(root=ROOT, environ=None):
    env = os.environ if environ is None else environ
    version, revision = version_and_revision(
        (root / "config/includes.chroot/etc/enfoque-os-release").read_text())
    pkgver = version + "-" + revision
    if env.get("GITHUB_REF") != "refs/heads/release/enfoque-os":
        raise ValueError("Only release/enfoque-os may publish to the intranet")
    commit = env.get("GITHUB_SHA", "")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("A full GitHub commit SHA is required")
    run_id = int(env.get("GITHUB_RUN_ID", "0"))
    run_number = int(env.get("GITHUB_RUN_NUMBER", "0"))
    if run_id <= 0 or run_number <= 0:
        raise ValueError("A real GitHub Actions run is required")
    packages = root / "config/packages.chroot"
    core = package_details(packages / f"enfoque-os-core_{pkgver}_all.deb",
                           "enfoque-os-core", pkgver, "all")
    printer = package_details(packages / f"enfoque-printer-drivers_{pkgver}_amd64.deb",
                              "enfoque-printer-drivers", pkgver, "amd64")
    iso_name = f"enfoque-os-{version}-piloto-amd64.iso"
    expected = digest(root / "dist" / iso_name)
    checksum_lines = (root / "dist/SHA256SUMS").read_text().splitlines()
    if checksum_lines not in ([expected + "  " + iso_name],
                              [expected + "  ./" + iso_name]):
        raise ValueError("ISO checksum manifest does not match the ISO")
    return {
        "schema": 1, "product": "Enfoque OS", "version": version,
        "packageVersion": pkgver,
        "tag": f"enfoque-os-v{version}-run{run_number}",
        "source": {"repository": "tecnologia-en/Sistema-OS",
                   "branch": "release/enfoque-os",
                   "commit": commit, "runId": run_id, "runNumber": run_number},
        "iso": {"filename": iso_name, "sha256": expected},
        "packages": [core, printer],
        "deployment": {"automaticPcUpdates": False,
                       "requiresIntranetCampaign": True},
    }


if __name__ == "__main__":
    result = make_manifest()
    output = ROOT / "parts/UPDATE_MANIFEST.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n")
    print("Release manifest:", output, result["tag"])
