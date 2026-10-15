#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(sed -n 's/^VERSION="\([^"]*\)"/\1/p' "$ROOT/config/includes.chroot/etc/enfoque-os-release")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Versao invalida em /etc/enfoque-os-release: $VERSION" >&2
  exit 1
fi
WORK="$ROOT/.build/enfoque-os"
OUT="$ROOT/dist"
TARGET="$OUT/enfoque-os-${VERSION}-piloto-amd64.iso"
if (( EUID != 0 )); then echo 'Execute: sudo ./scripts/build-iso.sh' >&2; exit 1; fi
command -v lb >/dev/null || { echo 'Instale o pacote live-build' >&2; exit 1; }
test -s "$ROOT/config/package-lists/enfoque-base.list.chroot" || { echo 'Lista de pacotes ausente' >&2; exit 1; }
if [[ -e "$TARGET" ]]; then echo "ISO ja existe: $TARGET (nao sobrescrita)" >&2; exit 1; fi
mkdir -p "$OUT"
if [[ -d "$WORK" ]]; then
  echo 'Reaproveitando cache do build anterior; limpando somente artefatos temporarios.'
  cd "$WORK"
  lb clean noauto --all
else
  mkdir -p "$WORK"
fi
mkdir -p "$WORK/config"
cp -a "$ROOT/config/." "$WORK/config/"
cd "$WORK"
lb config noauto \
  --mode debian \
  --distribution trixie \
  --architecture amd64 \
  --binary-image iso-hybrid \
  --system live \
  --debian-installer none \
  --archive-areas 'main non-free-firmware' \
  --apt-recommends false \
  --bootappend-live 'boot=live components locales=pt_BR.UTF-8 keyboard-layouts=br keyboard-model=abnt2 timezone=America/Sao_Paulo user-default-groups=audio,cdrom,dip,floppy,video,plugdev,netdev' \
  --iso-application "Enfoque OS piloto $VERSION" \
  --iso-publisher 'Enfoque Papelaria - piloto interno' \
  --iso-volume "ENFOQUE_OS_${VERSION//./}"
lb build
shopt -s nullglob
isos=( ./*.iso )
if (( ${#isos[@]} != 1 )); then echo 'Nao foi encontrada exatamente uma ISO. Confira os logs.' >&2; exit 1; fi
mv -- "${isos[0]}" "$TARGET"
(
  cd "$OUT"
  sha256sum ./*.iso > SHA256SUMS
)
echo "ISO gerada: $TARGET"
echo 'Teste numa VM separada antes de instalar em hardware real.'
