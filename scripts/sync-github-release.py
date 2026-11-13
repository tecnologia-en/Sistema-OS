#!/usr/bin/env python3
"""Read-only GitHub poll; publish only verified CI packages into signed Enfoque APT.

No fleet campaign, workstation command, SSH or update timer is started here.
Only successful builds on the dedicated release/enfoque-os branch may publish.
"""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request


REPOSITORY = "tecnologia-en/Sistema-OS"
SOURCE_BRANCH = "release/enfoque-os"
RELEASE_TAG = re.compile(r"^enfoque-os-v([0-9]+[.][0-9]+[.][0-9]+)-run([1-9][0-9]*)$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
CORE = "enfoque-os-core"
PRINTER = "enfoque-printer-drivers"
APT_ROOT = Path("/srv/enfoque-os-archive")
WORK_ROOT = Path("/srv/enfoque-os-release-sync")
PUBLISHER = Path("/usr/local/libexec/enfoque-os-release-sync/publish-update-repo.sh")
UPDATE_STATE = Path("/opt/intranet-data/computadores-atualizacoes/state.json")
UPDATE_SCHEDULE = Path("/opt/intranet-data/computadores-atualizacoes/schedule.json")
SIGNING_KEY = Path("/var/lib/enfoque-update/archive-keyring.gpg")
MAX_ASSET = 220_000_000


def version_tuple(version):
    if not re.fullmatch(r"[0-9]+[.][0-9]+[.][0-9]+", version):
        raise ValueError("Invalid version: " + version)
    return tuple(int(x) for x in version.split("."))


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for buf in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(buf)
    return digest.hexdigest()


def fetch_json(api_path):
    if not re.fullmatch(r"/[A-Za-z0-9_.~/%?=&-]+", api_path):
        raise ValueError("Unexpected GitHub API path")
    req = urllib.request.Request("https://api.github.com/repos/" + REPOSITORY + api_path,
                                 headers={"User-Agent": "EnfoqueOS-release-sync/1",
                                          "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def current_stable():
    stable = APT_ROOT / "dists/stable"
    resolved = stable.resolve(strict=True)
    if not resolved.is_relative_to((APT_ROOT / "releases").resolve()):
        raise ValueError("Stable APT symlink points outside approved releases")
    subprocess.run(["/usr/bin/gpgv", "--keyring", str(SIGNING_KEY),
                    str(resolved / "InRelease")], check=True, timeout=15,
                   stdout=subprocess.DEVNULL)
    index = (resolved / "main/binary-amd64/Packages").read_text()
    versions = []
    for entry in index.split("\n\n"):
        fields = dict(line.split(": ", 1) for line in entry.splitlines()
                      if ": " in line and not line.startswith(" "))
        if fields.get("Package") != CORE:
            continue
        match = re.fullmatch(r"([0-9]+[.][0-9]+[.][0-9]+)-([1-9][0-9]*)",
                             fields.get("Version", ""))
        if match:
            versions.append(match.group(1))
    if not versions:
        raise RuntimeError("No valid signed Enfoque core found in stable repository")
    return max(versions, key=version_tuple)


def safe_to_publish():
    schedule = json.loads(UPDATE_SCHEDULE.read_text())
    state = json.loads(UPDATE_STATE.read_text())
    if schedule.get("enabled") is not False:
        raise RuntimeError("Automatic fleet schedule is enabled; refusing silent promotion")
    if state.get("deferredFleet"):
        raise RuntimeError("A fleet update is deferred; refusing promotion")
    if any(c.get("status") not in ("concluida", "cancelada")
           for c in state.get("campaigns", [])):
        raise RuntimeError("A fleet campaign is active; refusing promotion")
    return True


def eligible_releases(releases, current):
    candidates = []
    for item in releases:
        if item.get("draft") or item.get("prerelease") is not True:
            continue
        match = RELEASE_TAG.fullmatch(str(item.get("tag_name", "")))
        if not match or version_tuple(match.group(1)) <= version_tuple(current):
            continue
        if not HEX40.fullmatch(str(item.get("target_commitish", ""))):
            continue
        candidates.append((version_tuple(match.group(1)), int(match.group(2)), item))
    candidates.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [row[2] for row in candidates]


def asset_map(release):
    result = {}
    for asset in release.get("assets", []):
        name = str(asset.get("name", ""))
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,130}", name) or name in result:
            raise ValueError("Invalid or duplicate release asset name")
        digest = str(asset.get("digest", ""))
        if not digest.startswith("sha256:") or not HEX64.fullmatch(digest[7:]):
            raise ValueError("Release asset does not have SHA256: " + name)
        result[name] = asset
    return result


def trusted_asset_url(asset, tag):
    expected = (f"https://github.com/{REPOSITORY}/releases/download/"
                f"{tag}/{asset['name']}")
    if asset.get("browser_download_url") != expected:
        raise ValueError("Asset must be downloaded from the approved release URL")
    return expected


def download_asset(asset, tag, folder, maximum=MAX_ASSET):
    url = trusted_asset_url(asset, tag)
    size = asset.get("size")
    if not isinstance(size, int) or not 0 < size <= maximum:
        raise ValueError("Refusing unexpected asset size: " + asset["name"])
    dest = folder / asset["name"]
    request = urllib.request.Request(url, headers={"User-Agent": "EnfoqueOS-release-sync/1"})
    actual = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(request, timeout=90) as source, dest.open("xb") as output:
        while True:
            data = source.read(1024 * 1024)
            if not data:
                break
            total += len(data)
            if total > maximum or total > size:
                raise ValueError("Asset exceeded allowed size")
            output.write(data)
            actual.update(data)
    if total != size or actual.hexdigest() != asset["digest"][7:]:
        raise ValueError("GitHub release asset checksum mismatch: " + asset["name"])
    return dest


def validated_release(release, folder):
    match = RELEASE_TAG.fullmatch(release["tag_name"])
    if not match:
        raise ValueError("Release tag invalid")
    version, run_number = match.group(1), int(match.group(2))
    tag = release["tag_name"]
    assets = asset_map(release)
    manifest_path = download_asset(assets["UPDATE_MANIFEST.json"], tag, folder, 80_000)
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != 1 or manifest.get("product") != "Enfoque OS":
        raise ValueError("Unsupported release manifest schema")
    if manifest.get("tag") != tag or manifest.get("version") != version:
        raise ValueError("Release manifest version mismatch")
    if manifest.get("deployment") != {
            "automaticPcUpdates": False, "requiresIntranetCampaign": True}:
        raise ValueError("Release does not guarantee manual-only deployment")
    source = manifest.get("source", {})
    if (source.get("repository") != REPOSITORY or
        source.get("branch") != SOURCE_BRANCH or
        source.get("commit") != release.get("target_commitish") or
        source.get("runNumber") != run_number or
        not isinstance(source.get("runId"), int)):
        raise ValueError("Release provenance mismatch")
    run = fetch_json(f"/actions/runs/{source['runId']}")
    if (run.get("name") != "Build Enfoque OS ISO" or
        run.get("path") != ".github/workflows/build-iso.yml" or
        run.get("head_branch") != SOURCE_BRANCH or
        run.get("head_sha") != source["commit"] or
        run.get("run_number") != run_number or
        run.get("event") != "push" or
        run.get("status") != "completed" or
        run.get("conclusion") != "success"):
        raise ValueError("GitHub Actions ISO build not verified as successful")
    iso = manifest.get("iso", {})
    if (iso.get("filename") != f"enfoque-os-{version}-piloto-amd64.iso" or
        not HEX64.fullmatch(str(iso.get("sha256", "")))):
        raise ValueError("Invalid ISO provenance")
    checksum_path = download_asset(assets["SHA256SUMS"], tag, folder, 10_000)
    checksum = checksum_path.read_text()
    permitted = (iso["sha256"] + "  " + iso["filename"] + "\n",
                 iso["sha256"] + "  ./" + iso["filename"] + "\n")
    if checksum not in permitted:
        raise ValueError("ISO checksum manifest does not match release")
    # CI already reconstructed and hashed the ISO. Verify GH asset metadata for its parts.
    parts = {name: asset for name, asset in assets.items() if re.fullmatch(r"chunk-[0-9]{3}", name)}
    expected_names = [f"chunk-{i:03d}" for i in range(len(parts))]
    if list(sorted(parts)) != expected_names or len(parts) < 2:
        raise ValueError("ISO chunks missing or malformed")
    parts_index = download_asset(assets["SHA256_PARTS"], tag, folder, 30_000)
    expected_parts = "".join(parts[name]["digest"][7:] + "  " + name + "\n"
                             for name in expected_names)
    if parts_index.read_text() != expected_parts:
        raise ValueError("ISO parts metadata differs from CI checksums")
    pkgver = manifest.get("packageVersion")
    if pkgver != version + "-1":
        raise ValueError("Package revision must be 1 until client updater supports revision upgrades")
    provided = manifest.get("packages")
    if not isinstance(provided, list) or len(provided) != 2:
        raise ValueError("Exactly two corporate packages are required")
    names = [(CORE, "all"), (PRINTER, "amd64")]
    downloaded = []
    for name, arch in names:
        matches = [pkg for pkg in provided if pkg.get("name") == name]
        if len(matches) != 1:
            raise ValueError("Missing package metadata: " + name)
        pkg = matches[0]
        filename = f"{name}_{pkgver}_{arch}.deb"
        if (pkg.get("filename") != filename or
            pkg.get("version") != pkgver or
            pkg.get("architecture") != arch or
            not HEX64.fullmatch(str(pkg.get("sha256", ""))) or
            pkg.get("size") != assets[filename]["size"] or
            pkg["sha256"] != assets[filename]["digest"][7:]):
            raise ValueError("Invalid package metadata: " + name)
        dest = download_asset(assets[filename], tag, folder)
        details = subprocess.check_output(["dpkg-deb", "-f", str(dest),
                                          "Package", "Version", "Architecture"],
                                         text=True, timeout=35).splitlines()
        fields = dict(line.split(": ", 1) for line in details)
        if fields != {"Package": name, "Version": pkgver,
                      "Architecture": arch} or sha(dest) != pkg["sha256"]:
            raise ValueError("Package content does not match CI release")
        downloaded.append(dest)
    deps = subprocess.check_output(["dpkg-deb", "-f", str(downloaded[0]), "Depends"],
                                   text=True, timeout=35)
    if f"{PRINTER} (>= {pkgver})" not in deps:
        raise ValueError("Core lacks matching printer-bank dependency")
    return {"version": version, "tag": tag, "sha": source["commit"],
            "runId": source["runId"], "runNumber": run_number,
            "isoSha256": iso["sha256"], "packages": downloaded,
            "releaseUrl": release["html_url"]}


def publish(release_info):
    safe_to_publish()
    old_version = current_stable()
    if version_tuple(release_info["version"]) <= version_tuple(old_version):
        print("SKIPPED stable version already published:", old_version)
        return False
    subprocess.run(["/usr/bin/bash", str(PUBLISHER),
                    *map(str, release_info["packages"])],
                   check=True, timeout=150,
                   env={**os.environ, "ENFOQUE_REPO_ROOT": str(APT_ROOT),
                        "ENFOQUE_REPO_SUITE": "stable"})
    new_version = current_stable()
    if new_version != release_info["version"]:
        raise RuntimeError("Signed repository did not expose expected new version")
    status = {"version": new_version, "releaseUrl": release_info["releaseUrl"],
              "sha": release_info["sha"], "runId": release_info["runId"],
              "isoSha256": release_info["isoSha256"],
              "automaticPcUpdates": False, "fleetCampaignCreated": False}
    temporary = WORK_ROOT / ("status.json." + str(os.getpid()))
    temporary.write_text(json.dumps(status, sort_keys=True, indent=2) + "\n")
    temporary.replace(WORK_ROOT / "status.json")
    print("PUBLISHED_TO_INTRANET:", new_version, release_info["releaseUrl"])
    return True


def run(apply=False):
    WORK_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (WORK_ROOT / "sync.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("ANOTHER_SYNC_RUNNING")
            return
        current = current_stable()
        candidates = eligible_releases(fetch_json("/releases?per_page=50"), current)
        if not candidates:
            print("NO_NEW_RELEASE stable=", current)
            return
        latest = candidates[0]
        print("CANDIDATE", latest["tag_name"], "stable=", current)
        if not apply:
            print("CHECK_ONLY: no packages downloaded or published")
            return
        safe_to_publish()
        with tempfile.TemporaryDirectory(prefix="github-release-", dir=WORK_ROOT) as temp:
            release_info = validated_release(latest, Path(temp))
            publish(release_info)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Promote a verified release")
    args = parser.parse_args()
    run(apply=args.apply)
