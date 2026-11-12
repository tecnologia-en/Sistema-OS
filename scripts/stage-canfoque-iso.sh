#!/usr/bin/env bash
# Download only pinned SHA-256-verified binaries before ISO build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SHA="ca87493fe0cbc33f11ed0495807821d64e67b53c0572a325ef3e288e2e0053af"
APP_URL="https://canfoque.enfoquepapelaria.com.br/downloads/enfoque-os/Canfoque-Pilot-2.0.0-beta.1-x86_64.AppImage"
RUST_SHA="81096d2f65fd43352540c351bca15bb0712a2a6f9efa4c95e9fff25cb97b3b81"
RUST_URL="https://github.com/rustdesk/rustdesk/releases/download/1.5.3/rustdesk-1.5.3-x86_64.deb"
APP_DEST="$ROOT/config/includes.chroot/opt/enfoque/canfoque-pilot.AppImage"
RUST_DEST="$ROOT/config/packages.chroot/rustdesk_1.5.3_amd64.deb"
verify(){
  printf '%s  %s\n' "$2" "$1" | sha256sum -c --status
}
fetch_verified(){
  local url="$1" sha="$2" dest="$3" mode="$4" temp
  mkdir -p "$(dirname "$dest")"
  if [[ -s "$dest" ]] && verify "$dest" "$sha"; then
    echo "Reutilizando arquivo verificado: $dest"
    return
  fi
  temp="$(mktemp "$(dirname "$dest")/.canfoque-download.XXXXXXXX")"
  trap 'rm -f -- "$temp"' RETURN
  curl --fail --show-error --silent --location --retry 4 --retry-all-errors \
    --connect-timeout 18 --max-time 240 --output "$temp" "$url"
  if ! verify "$temp" "$sha"; then
    echo "ERRO: integridade SHA256 divergente: $url" >&2
    exit 1
  fi
  chmod "$mode" "$temp"
  mv -f -- "$temp" "$dest"
  trap - RETURN
  echo "Arquivo validado: $dest ($(stat -c '%s' "$dest") bytes)"
}
fetch_verified "$APP_URL" "$APP_SHA" "$APP_DEST" 0755
fetch_verified "$RUST_URL" "$RUST_SHA" "$RUST_DEST" 0644
test "$(dpkg-deb -f "$RUST_DEST" Package)" = rustdesk
test "$(dpkg-deb -f "$RUST_DEST" Architecture)" = amd64
test "$(dpkg-deb -f "$RUST_DEST" Version)" = 1.5.3
echo "Canfoque Pilot + RustDesk oficiais prontos para entrar na ISO."
