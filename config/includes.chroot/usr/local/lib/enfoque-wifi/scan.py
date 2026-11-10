"""Parsing and safe diagnostics for Enfoque OS Wi-Fi selector.

Passwords are never logged, stored by this program, or put in argv.
NetworkManager owns the resulting credentials/profile.
"""
import re


def split_nmcli_escaped(row):
    """Split nmcli --terse fields, honoring its backslash escaping."""
    result, current, escaped = [], [], False
    for ch in str(row):
        if escaped:
            current.append(ch)
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == ":":
            result.append("".join(current))
            current = []
        else:
            current.append(ch)
    if escaped:
        current.append("\\")
    result.append("".join(current))
    return result


def parse_access_points(output):
    """Rows are SSID:SECURITY:SIGNAL, unique strongest signal first."""
    found = {}
    for row in str(output or "").splitlines():
        columns = split_nmcli_escaped(row.strip())
        if len(columns) < 3:
            continue
        ssid, security, signal = columns[:3]
        ssid = ssid.strip()
        if not ssid or len(ssid) > 32:
            continue
        try:
            strength = max(0, min(100, int(signal)))
        except (TypeError, ValueError):
            strength = 0
        record = {"ssid": ssid, "security": security, "signal": strength}
        if ssid not in found or strength > found[ssid]["signal"]:
            found[ssid] = record
    return sorted(found.values(), key=lambda item: (-item["signal"], item["ssid"].casefold()))


def has_wifi_device(output):
    return any(len(parts) >= 2 and parts[1].strip().lower() == "wifi"
               for parts in (split_nmcli_escaped(line) for line in str(output).splitlines()))


def build_connect_argv(ssid, hidden=False):
    """Never include the WPA password in command-line arguments."""
    ssid = str(ssid)
    if "\x00" in ssid or "\n" in ssid or "\r" in ssid:
        raise ValueError("Nome da rede Wi-Fi invalido")
    ssid = ssid.strip()
    if not ssid or len(ssid.encode("utf-8")) > 32:
        raise ValueError("Nome da rede Wi-Fi invalido")
    argv = ["nmcli", "--ask", "--wait", "45", "device", "wifi", "connect", ssid]
    if hidden:
        argv.extend(["hidden", "yes"])
    return argv


def diagnose(has_adapter, software_enabled, hardware_enabled, has_supplicant):
    if not has_adapter:
        return "Nenhum adaptador Wi-Fi foi detectado. Verifique o hardware e o driver."
    if not hardware_enabled:
        return "O Wi-Fi esta bloqueado fisicamente. Verifique a tecla ou chave de wireless."
    if not software_enabled:
        return "O Wi-Fi esta desligado no sistema. Ative-o e tente novamente."
    if not has_supplicant:
        return "O suporte WPA esta ausente. Instale wpasupplicant ou atualize o Enfoque OS."
    return "Placa Wi-Fi encontrada. Se nao aparecerem redes, verifique firmware e sinal."
