#!/usr/bin/env python3
"""Reproducibly unpack the *exact* two visual archives selected for Enfoque OS.

Source archives are committed in third_party/visual so the build remains
reproducible even if the original download service disappears or expires.
Only freedesktop/XFCE theme resources are extracted. Never execute zip files.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "third_party" / "visual"
TARGET = ROOT / "config" / "includes.chroot" / "usr" / "share"
ARCHIVES = {
    "WindowsModern-icons-1.1.1.zip": (
        "0e06713d567d820e92a3d54d7d4fead13a2775f4ef6432f085b63e34a6801356",
        "windows-modern",
    ),
    "xfce-aerobird-theme-v6-hdpi.zip": (
        "db1119500214fb56ab290abfac018d8a5d6eec00fbc9fcb902ddf2c3de70fbf6",
        "Aerobird-v6-hdpi",
    ),
}


def entries(archive: Path, expected_root: str):
    with zipfile.ZipFile(archive, "r") as z:
        found = set()
        for info in z.infolist():
            if info.is_dir():
                continue
            pp = PurePosixPath(info.filename)
            parts = pp.parts
            if (
                pp.is_absolute() or ".." in parts or "\\" in info.filename
                or not parts or parts[0] != expected_root
                or len(parts) < 2 or "\x00" in info.filename
            ):
                raise ValueError(f"Unsafe archive member: {info.filename[:120]}")
            attr_mode = info.external_attr >> 16
            if stat.S_IFMT(attr_mode) not in (0, stat.S_IFREG):
                raise ValueError(f"Unsupported archive member: {info.filename[:120]}")
            if info.filename in found:
                raise ValueError("Duplicate member in archive: " + info.filename)
            found.add(info.filename)
            if info.file_size > 2_500_000:
                raise ValueError("Oversized individual asset: " + info.filename)
            yield info.filename, info.file_size


def get_verified(path, expected):
    if not path.is_file():
        raise FileNotFoundError(path)
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(131072), b""):
            h.update(chunk)
    if h.hexdigest() != expected:
        raise RuntimeError(f"Unexpected SHA-256 for {path.name}")
    return path


def safe_extract(src: Path, mode: str, root: str):
    count = 0
    with zipfile.ZipFile(src) as z:
        for entry, _ in entries(src, root):
            parts = PurePosixPath(entry).parts
            if mode == "icons":
                if len(parts) < 2:
                    continue
                target = TARGET / "icons" / "windows-modern" / Path(*parts[1:])
            elif mode == "themes":
                if len(parts) < 4 or not parts[1].startswith("Aerobird-") or not parts[1].endswith("-hdpi"):
                    raise ValueError("Unexpected AeroBird file path: " + entry)
                target = TARGET / "themes" / Path(*parts[1:])
            else:
                raise ValueError(mode)
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(entry) as inp, target.open("wb") as out:
                shutil.copyfileobj(inp, out, length=65536)
            target.chmod(0o644)
            count += 1
    return count


def install_enfoque_panel():
    """Preserve the current Enfoque dock/tray behavior under the actual Aero theme."""
    theme_root = TARGET / "themes"
    old = theme_root / "EnfoqueModern" / "gtk-3.0" / "panel.css"
    if not old.is_file():
        raise FileNotFoundError("Current Enfoque panel fallback was not staged: " + str(old))
    # This is intentionally a *small* override, so original AeroBird rendering
    # for windows, menus and popups remains intact. Keep only device/tray sizing.
    corporate = """
/* Enfoque OS 0.2.54: compact corporate status items, preserving AeroBird glass. */
#XfcePanelWindow #launcher-12 button {
  min-width: 18px; min-height: 24px; padding: 0; margin: 2px 0;
}
#XfcePanelWindow #launcher-12 image { -gtk-icon-transform: scale(.80); }
#XfcePanelWindow #genmon-13, #XfcePanelWindow #genmon-16,
#XfcePanelWindow #genmon-17, #XfcePanelWindow #genmon-10 {
  min-width: 0; padding: 0 1px; margin: 2px 0;
}
#XfcePanelWindow #genmon-11 { min-width: 4px; padding: 0; margin: 0; }
#XfcePanelWindow .systray button, #XfcePanelWindow #pulseaudio-button {
  min-width: 16px; padding: 1px; margin: 2px 0;
}
#docklike-plugin .group.enfoque_attention {
  border: 1px solid #f9ac43;
  box-shadow: inset 0 -3px #ffb454;
}
"""
    installed = 0
    for theme_dir in sorted(theme_root.glob("Aerobird-*-hdpi")):
        css = theme_dir / "gtk-3.0" / "gtk.css"
        if not css.is_file():
            raise RuntimeError("Missing AeroBird GTK CSS: " + str(css))
        text = css.read_text("utf-8")
        # The upstream v6 HDPI archive refers to a stylesheet not shipped in
        # any of its 18 variants; progressbars are already styled in gtk.css.
        # Fix two invalid GTK3 declarations, preserving the actual values.
        missing = '@import url("widgets/progress-bars.css");'
        if missing not in text or 'border-color: #387db6;]' not in text:
            raise RuntimeError("AeroBird upstream CSS layout unexpectedly changed")
        text = text.replace(missing, '/* Progress bars are already defined in gtk.css. */')
        text = text.replace('border-color: #387db6;]', 'border-color: #387db6;')
        # GTK3 ignores these web-only CSS properties, and logs warnings.
        # Removing only those inert declarations preserves their actual look.
        text = text.replace("    max-height: 54px;", "    /* GTK3 ignores max-height. */")
        text = text.replace("\tz-index: 1;", "\t/* GTK3 ignores z-index. */")
        for widget_name, unsupported in (
            ("show-desktop-button.css", ("    max-width: 1px;",)),
            ("thunar.css", ("\tmax-height: 45px;", "\tmax-height: 41px;")),
        ):
            widget_path = css.parent / "widgets" / widget_name
            widget_source = widget_path.read_text("utf-8")
            for invalid in unsupported:
                if invalid not in widget_source:
                    raise RuntimeError("AeroBird incompatible widget declaration changed")
                widget_source = widget_source.replace(invalid,"/* Unsupported GTK3 property omitted. */")
            widget_path.write_text(widget_source, encoding="utf-8")
        widget_css = css.parent / "widgets" / "tasklist&docklike-plugin.css"
        widget_text = widget_css.read_text("utf-8")
        if "margin: 9px !important;" not in widget_text:
            raise RuntimeError("AeroBird upstream tasklist CSS layout unexpectedly changed")
        widget_css.write_text(widget_text.replace("margin: 9px !important;", "margin: 9px;"), encoding="utf-8")
        marker = "/* Enfoque OS 0.2.54: compact corporate status items, preserving AeroBird glass. */"
        if marker not in text:
            css.write_text(text.rstrip() + "\n" + corporate, encoding="utf-8")
        (css.parent / "enfoque-panel.css").write_text(corporate, encoding="utf-8")
        installed += 1
    if installed != 18:
        raise RuntimeError(f"Expected 18 AeroBird variants, found {installed}")
    return installed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    files = {name: get_verified(ASSETS / name, sha) for name, (sha, _) in ARCHIVES.items()}
    for name, source in files.items():
        count = sum(1 for _ in entries(source, ARCHIVES[name][1]))
        if count < 250:
            raise RuntimeError("Unusually small visual archive: " + name)
        print(f"VERIFIED {name} {count} files")
    if args.verify_only:
        return
    icons = safe_extract(files["WindowsModern-icons-1.1.1.zip"], "icons", "windows-modern")
    themes = safe_extract(files["xfce-aerobird-theme-v6-hdpi.zip"], "themes", "Aerobird-v6-hdpi")
    variations = install_enfoque_panel()
    idx = TARGET / "icons" / "windows-modern" / "index.theme"
    if not idx.is_file() or (TARGET / "themes" / "Aerobird-Sky-hdpi" / "xfwm4" / "themerc").stat().st_size < 40:
        raise RuntimeError("Visual assets incomplete after unpacking")
    print(f"STAGED_VISUAL_ASSETS icons={icons} theme_files={themes} aero_variations={variations}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as exc:
        print("VISUAL_ASSETS_FAILED:", exc, file=sys.stderr)
        sys.exit(1)
