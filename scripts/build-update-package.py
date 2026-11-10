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
        "usr/share/icons/EnfoqueFluent/",
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
        "etc/enfoque-os/firewall.nft",
        "etc/tmpfiles.d/enfoque-remote.conf",
        "etc/xdg/xfce4/panel/docklike.rc",
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
        "usr/local/sbin/enfoque-update-control",
        "etc/systemd/system/enfoque-update-control.service",
        "etc/systemd/system/enfoque-update-control.timer",
        "etc/systemd/system/enfoque-firewall.service",
        "etc/enfoque-os/firewall.nft",
        "usr/local/bin/enfoque-proteger-tela",
        "etc/xdg/autostart/enfoque-proteger-tela.desktop",
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
        "usr/local/sbin/enfoque-live-session",
        "etc/systemd/system/enfoque-live-session.service",
        "usr/local/sbin/enfoque-manutencao",
        "usr/local/sbin/enfoque-saude",
        "usr/local/sbin/enfoque-docklike-install",
        "usr/local/bin/enfoque-recuperacao",
        "etc/systemd/system/enfoque-saude.timer",
        "etc/systemd/system/enfoque-backup.timer",
        "etc/systemd/system/enfoque-limpeza.timer",
        "usr/local/bin/enfoque-bateria-painel",
        "usr/local/bin/enfoque-bateria-migrar",
        "etc/xdg/autostart/enfoque-bateria-migrar.desktop",
        "usr/local/bin/enfoque-session-agent",
        "usr/local/lib/enfoque-session/bridge.py",
        "etc/tmpfiles.d/enfoque-remote.conf",
        "etc/xdg/autostart/enfoque-session-agent.desktop",
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
            "Depends: python3, python3-gi, gir1.2-gtk-3.0, apt, systemd, ca-certificates, gpgv, openssh-client, openssh-server, xfce4-genmon-plugin, xfce4-appfinder, xfce4-docklike-plugin, papirus-icon-theme, timeshift, rsync, restic, smartmontools, mate-polkit, pkexec, xfce4-screensaver, nftables, network-manager, network-manager-gnome, wpasupplicant, rfkill, onboard, firmware-iwlwifi, firmware-realtek, firmware-atheros, firmware-brcm80211, firmware-mediatek\n"
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
            "  getent group enfoque-remote >/dev/null 2>&1 || groupadd --system enfoque-remote\n"
            "  for u in enfoque enfoque-kiosk; do if id -u \"$u\" >/dev/null 2>&1; then usermod -a -G enfoque-remote \"$u\"; fi; done\n"
            "  systemd-tmpfiles --create /etc/tmpfiles.d/enfoque-remote.conf >/dev/null 2>&1 || true\n"
            "  systemctl disable --now cups-browsed.service >/dev/null 2>&1 || true\n"
            "  systemctl try-restart enfoque-remote-agent.service >/dev/null 2>&1 || true\n"
            "  if [ -s /usr/local/lib/enfoque-docklike/libdocklike.so ]; then /usr/local/sbin/enfoque-docklike-install; fi\n"
            # Important: never create a regular account from a package postinst.
            # live-build installs this .deb into the image chroot; creating
            # enfoque-ti here consumes UID 1000, breaking Debian Live's user.
            # The disk installer explicitly provisions enfoque-ti afterward.
            "  systemctl enable enfoque-update-check.timer enfoque-update-control.timer enfoque-zero-touch.timer enfoque-saude.timer enfoque-backup.timer enfoque-limpeza.timer >/dev/null 2>&1 || true\n"
            "  systemctl disable --now enfoque-update-apply.timer >/dev/null 2>&1 || true\n"
            "  systemctl enable enfoque-firewall.service >/dev/null 2>&1 || true\n"
            "  if [ -d /run/systemd/system ] && [ ! -e /run/live/medium ]; then\n"
            "    if ! systemctl start enfoque-firewall.service; then echo \"AVISO: verifique o firewall Enfoque OS\" >&2; fi\n"
            "  fi\n"
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
