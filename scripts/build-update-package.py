#!/usr/bin/env python3
"""Build versioned Enfoque OS core .deb from the very same files used in the ISO.

The package permits future signed APT upgrades of Enfoque applications,
services, themes and helper scripts without reinstalling the OS.
"""
import argparse
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TREE = ROOT / "config/includes.chroot"
RELEASE = TREE / "etc/enfoque-os-release"
PACKAGE = "enfoque-os-core"


def version():
    match = re.search(r'^VERSION="(\d+\.\d+\.\d+)"$',
                      RELEASE.read_text("utf8"), re.MULTILINE)
    if not match:
        raise ValueError("Enfoque OS version not found")
    return match.group(1)


def managed(name):
    """Only paths controlled by Enfoque. Never package generated host identity."""
    if (name.endswith(".pyc") or "/__pycache__/" in name or
            name.endswith("~") or "/.git/" in name):
        return False
    dirs = (
        "usr/local/bin/enfoque-",
        "usr/local/sbin/enfoque-",
        "usr/local/lib/enfoque-",
        "usr/share/applications/enfoque-",
        "usr/share/backgrounds/enfoque-os/",
        "usr/share/doc/enfoque-os/",
        "usr/share/plymouth/themes/enfoque-os/",
        "usr/share/keyrings/enfoque-os-archive-keyring.gpg",
        "usr/lib/systemd/user/enfoque-",
        "etc/systemd/system/enfoque-",
        "etc/xdg/autostart/enfoque-",
        "etc/skel/",
        "etc/logrotate.d/enfoque-",
        "etc/sysctl.d/90-enfoque",
        "etc/systemd/journald.conf.d/90-enfoque",
        "etc/default/grub.d/90-enfoque",
        "etc/enfoque-os/lojas-ip.json",
        "etc/ssh/sshd_config.d/95-enfoque-suporte.conf",
        "etc/enfoque-ssh/vps-known-hosts",
        "etc/sudoers.d/97-enfoque-ti",
        "etc/apt/sources.list.d/enfoque-os.sources",
        "etc/apt/apt.conf.d/90enfoque",
        "etc/apt/apt.conf.d/91enfoque",
        "etc/lightdm/lightdm-gtk-greeter.conf.d/50-enfoque",
        "etc/polkit-1/rules.d/60-enfoque",
        "usr/share/polkit-1/actions/org.enfoque.os.",
    )
    return (
        name == "etc/enfoque-os-release"
        or name == "usr/share/xsessions/enfoque-kiosk.desktop"
        or any(name.startswith(prefix) for prefix in dirs)
        or (name.startswith("usr/share/icons/hicolor/")
            and "/apps/enfoque-" in name)
    )


def manifest():
    paths = []
    for path in sorted(TREE.rglob("*")):
        if path.is_file() and path.name.lower() in ("agent.json", "identity.json", ".env", "private.key", "id_ed25519"):
            raise ValueError("Sensitive file in ISO overlay: " + str(path))
        if path.is_symlink():
            raise ValueError("Unexpected symlink in source overlay: " + str(path))
        if not path.is_file():
            continue
        rel = path.relative_to(TREE).as_posix()
        if managed(rel):
            paths.append((rel, path))
    if len(paths) < 70:
        raise RuntimeError("Suspiciously small Enfoque package")
    required = (
        "etc/enfoque-os-release",
        "usr/local/sbin/enfoque-update",
        "usr/local/sbin/enfoque-ssh-support",
        "usr/local/sbin/enfoque-zero-touch",
        "usr/local/sbin/enfoque-tunnel",
        "usr/share/keyrings/enfoque-os-archive-keyring.gpg",
        "etc/ssh/sshd_config.d/95-enfoque-suporte.conf",
        "etc/enfoque-ssh/vps-known-hosts",
        "etc/sudoers.d/97-enfoque-ti",
        "etc/apt/sources.list.d/enfoque-os.sources",
        "etc/systemd/system/enfoque-update-check.timer",
        "etc/systemd/system/enfoque-update-apply.timer",
    )
    included = {rel for rel, _ in paths}
    for name in required:
        if name not in included:
            raise RuntimeError("Required packaged component missing: " + name)
    return paths


def create(output):
    target = Path(output).resolve()
    target.mkdir(parents=True, exist_ok=True)
    release = version()
    dest = target / f"{PACKAGE}_{release}-1_all.deb"
    if dest.exists():
        raise FileExistsError("Package will not overwrite existing file: " + str(dest))
    files = manifest()
    with tempfile.TemporaryDirectory(prefix="enfoque-package-") as tmp:
        root = Path(tmp)
        confiles = []
        for rel, source in files:
            target_file = root / rel
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target_file, follow_symlinks=False)
            if rel.startswith("etc/") and rel != "etc/enfoque-os-release":
                confiles.append("/" + rel)
        debian = root / "DEBIAN"
        debian.mkdir()
        (debian / "control").write_text(
            f"Package: {PACKAGE}\nVersion: {release}-1\n"
            "Section: admin\nPriority: optional\nArchitecture: all\n"
            "Maintainer: Enfoque TI <tecnologia@enfoquepapelaria.com.br>\n"
            "Depends: python3, apt, systemd, ca-certificates, openssh-client, openssh-server\n"
            "Description: Enfoque OS corporate system components and updater\n"
            " Replaces custom Enfoque OS files on managed workstations using\n"
            " individually signed APT repository updates.\n",
            encoding="utf8",
        )
        (debian / "conffiles").write_text(
            "\n".join(sorted(confiles)) + "\n", encoding="utf8")
        postinst = debian / "postinst"
        postinst.write_text(
            "#!/bin/sh\nset -e\n"
            "if [ \"$1\" = configure ] && command -v systemctl >/dev/null 2>&1; then\n"
            "  systemctl daemon-reload >/dev/null 2>&1 || true\n"
            "  if ! id -u enfoque-ti >/dev/null 2>&1; then\n"
            "    useradd -m -s /bin/bash enfoque-ti\n"
            "  fi\n"
            "  systemctl enable enfoque-update-check.timer enfoque-update-apply.timer enfoque-zero-touch.timer >/dev/null 2>&1 || true\n"
            "  if [ ! -s /etc/enfoque-ssh/authorized_keys ]; then\n"
            "    systemctl disable --now ssh.service ssh.socket >/dev/null 2>&1 || true\n"
            "  fi\n"
            "  systemctl mask ssh.socket >/dev/null 2>&1 || true\n"
            "fi\n", encoding="utf8",
        )
        postinst.chmod(0o755)
        subprocess.run(
            ["dpkg-deb", "--root-owner-group", "--build", str(root), str(dest)],
            check=True,
        )
    print("ENFOQUE_DEB_READY", dest, dest.stat().st_size)
    return dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    create(args.output)
