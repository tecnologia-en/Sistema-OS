"""Enfoque OS - inventario dinamico de portas USB.
Le apenas /sys, sem permitir execucao ou acesso a arquivos dos dispositivos.
"""
from __future__ import annotations
from pathlib import Path
import re
import subprocess

USB_ROOT = Path("/sys/bus/usb/devices")
CATEGORY = {
    1: "Áudio USB", 2: "Comunicação", 3: "Dispositivo HID",
    6: "Câmera", 7: "Impressora", 8: "Armazenamento",
    9: "Hub USB", 10: "Dispositivo de dados", 11: "Leitor smart card",
    14: "Webcam", 224: "Dispositivo sem fio",
}


def read_attr(folder: Path, name: str, limit=120):
    try:
        return (folder / name).read_text(encoding="utf-8", errors="replace").strip()[:limit]
    except (OSError, ValueError):
        return ""


def classify(folder: Path, device_name: str, root: Path):
    product = read_attr(folder, "product") or "Dispositivo USB"
    vendor = read_attr(folder, "manufacturer") or "Fabricante desconhecido"
    name = (vendor + " " + product).casefold()
    classes = []
    for parent in [folder, *sorted(root.glob(device_name + ":*"))]:
        code = read_attr(parent, "bDeviceClass" if parent == folder else "bInterfaceClass")
        try:
            classes.append(int(code, 16))
        except ValueError:
            pass
    kind = next((CATEGORY[k] for k in classes if k in CATEGORY and k != 9), "Dispositivo USB")
    if any(term in name for term in ("barcode", "bar code", "cod. barra", "scanner de codigo", "scanner de código")):
        kind = "Leitor de código de barras"
    elif "keyboard" in name or "teclado" in name:
        kind = "Teclado"
    elif "mouse" in name or "trackball" in name:
        kind = "Mouse"
    elif any(term in name for term in ("bematech", "elgin", "epson tm-", "receipt printer", "thermal printer")):
        kind = "Impressora térmica"
    elif 9 in classes and not any(k in classes for k in (3, 7, 8)):
        kind = "Hub USB"
    return {
        "kind": kind, "product": product, "vendor": vendor,
        "vid_pid": (read_attr(folder, "idVendor") + ":" + read_attr(folder, "idProduct")),
        "serial": read_attr(folder, "serial", 70),
    }


def ports(root: Path = USB_ROOT):
    """Inventario de portas USB root-hub e sub-hubs, vazias e ocupadas."""
    output = []
    seen = set()
    try:
        roots = sorted(root.iterdir())
    except OSError:
        return output

    def scan(prefix, bus, count, depth):
        if depth > 7 or count < 1 or count > 64:
            return
        for n in range(1, count + 1):
            if len(output) >= 256:
                return
            slot = (prefix + "." + str(n)) if prefix else (bus + "-" + str(n))
            if slot in seen:
                continue
            seen.add(slot)
            folder = root / slot
            occupied = (folder / "idVendor").exists()
            device = classify(folder, slot, root) if occupied else None
            output.append({
                "slot": slot, "occupied": occupied, "device": device,
                "depth": depth, "bus": bus,
            })
            if occupied and read_attr(folder, "bDeviceClass") == "09":
                try:
                    children = int(read_attr(folder, "maxchild"))
                except ValueError:
                    children = 0
                scan(slot, bus, children, depth + 1)

    for hub in roots:
        if not re.fullmatch(r"usb[0-9]+", hub.name):
            continue
        try:
            bus = str(int(read_attr(hub, "busnum") or hub.name[3:]))
            count = int(read_attr(hub, "maxchild"))
        except ValueError:
            continue
        scan("", bus, count, 0)
    return output



def visible_ports(entries, show_empty=False):
    """Keep occupied USB slots visible by default; diagnostics can show all."""
    if show_empty:
        return list(entries)
    return [item for item in entries if item.get("occupied")]


def printer_queues():
    try:
        run = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=3, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return []
    if run.returncode:
        return []
    items = []
    for line in run.stdout.splitlines()[:100]:
        match = re.match(r"^(?:printer|impressora)\s+(\S+)\s+(.*)$", line, re.I)
        if match:
            items.append({"name": match.group(1), "state": match.group(2)[:160]})
    return items
