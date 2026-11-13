"""Local, read-only machine facts for the Enfoque OS 'Meu Computador' window.

Standard library only. No inventory upload, privileges or background process.
All commands have tight timeouts and failures are rendered as unavailable.
"""
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import subprocess


def read_text(path, fallback=""):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except (OSError, UnicodeError):
        return fallback


def format_size(value):
    """Compact binary display: B, KB, MB, GB, TB."""
    try:
        size = int(value)
    except (ValueError, TypeError):
        return "Indisponível"
    if size < 0:
        return "Indisponível"
    units = ("B", "KB", "MB", "GB", "TB", "PB")
    number = float(size)
    for unit in units:
        if number < 1024 or unit == units[-1]:
            return f"{number:.1f} {unit}" if unit in ("GB", "TB", "PB") else f"{number:.0f} {unit}"
        number /= 1024
    return "Indisponível"


def format_uptime(seconds):
    try:
        seconds = max(0, int(float(seconds)))
    except (ValueError, TypeError):
        return "Indisponível"
    days, seconds = divmod(seconds, 86400)
    hours, seconds = divmod(seconds, 3600)
    minutes = seconds // 60
    if days:
        return f"{days}d {hours}h {minutes}min"
    if hours:
        return f"{hours}h {minutes}min"
    return f"{minutes}min"


def meminfo(text):
    values = {}
    for line in text.splitlines():
        match = re.match(r"^([A-Za-z_]+):\s*([0-9]+)\s+kB", line)
        if match:
            values[match[1]] = int(match[2]) * 1024
    total = values.get("MemTotal", 0)
    free = min(total, values.get("MemAvailable", values.get("MemFree", 0)))
    return {"total": total, "used": total-free, "free": free,
            "percent": round((total-free) * 100 / total) if total else 0}


def cpuinfo(text):
    model = ""
    for line in text.splitlines():
        if line.startswith(("model name", "Hardware", "Processor")) and ":" in line:
            model = line.partition(":")[2].strip()
            if model:
                break
    model = re.sub(r"\s+", " ", model).strip()
    return model or "Processador não identificado"


def gpu_from_lspci(text):
    found = []
    for line in text.splitlines():
        try:
            parts = shlex.split(line)
        except ValueError:
            continue
        if len(parts) < 4:
            continue
        category = parts[1].lower()
        if not any(key in category for key in ("vga", "3d controller", "display controller")):
            continue
        vendor, model = parts[2], parts[3]
        if model in ("Device", "Unknown"):
            model = ""
        name = " ".join(x for x in (vendor, model) if x).strip()
        if name and name not in found:
            found.append(name)
    return found


def gpu_from_sysfs(drm):
    vendor_labels = {"0x10de": "NVIDIA", "0x1002": "AMD", "0x8086": "Intel"}
    names = []
    try:
        cards = sorted(drm.glob("card[0-9]*"))
    except OSError:
        return names
    for card in cards:
        if not re.fullmatch(r"card[0-9]+", card.name):
            continue
        vendor = read_text(card/"device/vendor").strip().lower()
        ident = read_text(card/"device/device").strip().lower()
        if not vendor or not ident:
            continue
        text = f"{vendor_labels.get(vendor, 'GPU PCI')} ({vendor}:{ident})"
        if text not in names:
            names.append(text)
    return names


def device_mounts(device):
    found = []
    def walk(obj):
        for value in (obj.get("mountpoints") or []):
            if isinstance(value, str) and value.startswith("/") and value not in found:
                found.append(value)
        for child in (obj.get("children") or []):
            walk(child)
    walk(device)
    return found


def physical_disks(text):
    try:
        devices = json.loads(text).get("blockdevices", [])
    except (ValueError, TypeError, AttributeError):
        return []
    result = []
    for dev in devices:
        if dev.get("type") != "disk":
            continue
        name = str(dev.get("name", ""))[:80]
        if not re.fullmatch(r"[a-zA-Z0-9_.-]+", name):
            continue
        rotational = dev.get("rota")
        kind = "HD" if rotational is True else ("SSD" if rotational is False else "Disco")
        try:
            size = int(dev.get("size") or 0)
        except (ValueError, TypeError):
            continue
        if size <= 0:
            continue
        result.append({"name": name, "model": str(dev.get("model") or "").strip()[:120],
                       "kind": kind, "size": size,
                       "mounts": device_mounts(dev)})
    return result


def disk_space(directory="/"):
    try:
        st = os.statvfs(directory)
        block = st.f_frsize or st.f_bsize
        total = st.f_blocks * block
        available = st.f_bavail * block
        used = (st.f_blocks - st.f_bfree) * block
        # Reserved blocks make used + available smaller than total; this is expected.
        return {"total": total, "used": used, "free": available,
                "percent": round(used * 100 / total) if total else 0}
    except OSError:
        return {"total": 0, "used": 0, "free": 0, "percent": 0}


def run_limited(command, limit=3):
    try:
        result = subprocess.run(command, text=True, capture_output=True, timeout=limit,
                                check=False, stdin=subprocess.DEVNULL)
        return result.stdout if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def snapshot(proc=Path("/proc"), drm=Path("/sys/class/drm"),
             release=Path("/etc/enfoque-os-release"), runner=run_limited):
    cpu_text = read_text(proc/"cpuinfo")
    memory = meminfo(read_text(proc/"meminfo"))
    gpu = gpu_from_lspci(runner(["lspci", "-mm"], 3))
    if not gpu:
        gpu = gpu_from_sysfs(drm)
    disks = physical_disks(runner(
        ["lsblk", "--json", "--bytes", "--output",
         "NAME,TYPE,SIZE,ROTA,MODEL,TRAN,MOUNTPOINTS"], 3))
    if not disks:
        disks = []
    match = re.search(r'(?m)^VERSION="([^"]+)"$', read_text(release))
    version = match.group(1) if match else "Indisponível"
    uptime_text = read_text(proc/"uptime").split()
    uptime = format_uptime(uptime_text[0]) if uptime_text else "Indisponível"
    return {
        "hostname": socket.gethostname()[:90],
        "version": version,
        "cpu": cpuinfo(cpu_text),
        "threads": os.cpu_count() or 0,
        "gpu": gpu,
        "memory": memory,
        "disks": disks,
        "system_space": disk_space("/"),
        "uptime": uptime,
    }
