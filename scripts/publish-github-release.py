#!/usr/bin/env python3
"""Publish an immutable, complete CI release; retry transient API failures."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time


def run(*args):
    try:
        return subprocess.run(["gh", *args], capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(args, 1, "", "GitHub request timed out")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def release(repo, tag, sha):
    for attempt in range(4):
        r = run("api", f"repos/{repo}/releases/tags/{tag}")
        if r.returncode == 0:
            data = json.loads(r.stdout)
            if (data.get("tag_name") != tag or data.get("target_commitish") != sha
                    or data.get("prerelease") is not True):
                raise RuntimeError("Existing release does not match this CI build")
            return data
        if "HTTP 404" in r.stderr:
            # A draft may be absent from the published-tag endpoint.
            draft = run("api", "--paginate", "--slurp", f"repos/{repo}/releases?per_page=100")
            if draft.returncode == 0:
                matches = [item for page in json.loads(draft.stdout) for item in page if item.get("tag_name") == tag]
                if not matches:
                    return None
                if len(matches) != 1 or matches[0].get("target_commitish") != sha or matches[0].get("prerelease") is not True:
                    raise RuntimeError("Existing draft does not match this CI build")
                return matches[0]
        if attempt < 3:
            time.sleep(2 ** attempt)
    raise RuntimeError("GitHub release lookup failed: " + r.stderr[-300:])


def assets_ok(data, expected):
    seen = set()
    for a in data.get("assets", []):
        name = a.get("name")
        if name in seen or name not in expected:
            raise RuntimeError("Unexpected or duplicate remote asset: " + str(name))
        seen.add(name)
        size, checksum = expected[name]
        if a.get("state") != "uploaded" or a.get("size") != size or a.get("digest") != checksum:
            raise RuntimeError("Remote asset incomplete or checksum mismatch: " + name)
    return seen


def publish(repo, tag, sha, paths, title, notes):
    expected = {p.name: (p.stat().st_size, digest(p)) for p in paths}
    if len(expected) != len(paths) or any(size <= 0 for size, _ in expected.values()):
        raise RuntimeError("Invalid release assets")
    data = release(repo, tag, sha)
    for attempt in range(4):
        if data is not None:
            break
        r = run("release", "create", tag, "--repo", repo, "--target", sha,
                "--title", title, "--notes", notes, "--draft", "--prerelease")
        time.sleep(2 ** attempt)
        data = release(repo, tag, sha)
    if data is None:
        raise RuntimeError("Cannot create release draft")
    seen = assets_ok(data, expected)
    if not data["draft"]:
        if seen == set(expected):
            print("Complete release already published", tag)
            return
        raise RuntimeError("Refusing to modify published release")
    for path in paths:
        for attempt in range(4):
            data = release(repo, tag, sha)
            if data is None or not data["draft"]:
                raise RuntimeError("Release draft disappeared or was published prematurely")
            if path.name in assets_ok(data, expected):
                break
            run("release", "upload", tag, str(path), "--repo", repo)
            time.sleep(2 ** attempt)
        else:
            data = release(repo, tag, sha)
            if data is None or path.name not in assets_ok(data, expected):
                raise RuntimeError("Upload failed: " + path.name)
    data = release(repo, tag, sha)
    if data is None or assets_ok(data, expected) != set(expected):
        raise RuntimeError("Incomplete release, leaving draft")
    for attempt in range(4):
        if not data["draft"]:
            print("Verified prerelease published", tag)
            return
        run("release", "edit", tag, "--repo", repo, "--draft=false", "--prerelease")
        time.sleep(2 ** attempt)
        data = release(repo, tag, sha)
        if data is None or assets_ok(data, expected) != set(expected):
            raise RuntimeError("Release assets changed")
    if not data["draft"]:
        print("Verified prerelease published", tag)
        return
    raise RuntimeError("Could not publish verified draft")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "parts/UPDATE_MANIFEST.json").read_text())
    repo = os.environ["GITHUB_REPOSITORY"]
    sha = os.environ["GITHUB_SHA"]
    tag = manifest["tag"]
    if (repo != "tecnologia-en/Sistema-OS" or not re.fullmatch("[0-9a-f]{40}", sha)
            or manifest["source"]["commit"] != sha
            or os.environ["GITHUB_REF"] != "refs/heads/release/enfoque-os"
            or tag != "enfoque-os-v" + manifest["version"] + "-run" + os.environ["GITHUB_RUN_NUMBER"]):
        raise RuntimeError("Unexpected CI release provenance")
    parts = root / "parts"
    paths = sorted(parts.glob("chunk-*")) + [parts / x for x in
        ("SHA256SUMS", "SHA256_PARTS", "LEIA-ME.txt", "UPDATE_MANIFEST.json")]
    paths += [root / "config/packages.chroot" / p["filename"] for p in manifest["packages"]]
    publish(repo, tag, sha, paths, "Enfoque OS " + manifest["version"] + " - ISO e atualizacao",
            "ISO e pacotes verificados. Preserva Evince e N960K; mitigacao AnyDesk X11. "
            "A VPS valida a procedencia e publica APT quando nao houver campanha ativa. "
            "Nenhuma estacao e atualizada automaticamente.")
