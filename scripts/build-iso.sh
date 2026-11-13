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
# Compile the audited Docklike attention plugin before packaging the Enfoque core.
bash "$ROOT/scripts/build-docklike.sh"
# Compile no-zoom thermal white-space trimmer within the trusted Debian 13 builder.
bash "$ROOT/scripts/build-thermal-raster.sh"
bash "$ROOT/scripts/test-thermal-raster.sh"
# Embed verified Canfoque Pilot AppImage and RustDesk package without a host identity.
bash "$ROOT/scripts/stage-canfoque-iso.sh"
# Build the pinned printer bank from the approved server collection (or pinned official sources).
python3 "$ROOT/scripts/stage-printer-library.py" --validate --output "$ROOT/config/packages.chroot"
REVISION="$(grep -E '^PACKAGE_REVISION="[1-9][0-9]*"$' "$ROOT/config/includes.chroot/etc/enfoque-os-release" | cut -d '"' -f2)"
[[ "$REVISION" =~ ^[1-9][0-9]*$ ]] || { echo "Revisao do pacote invalida" >&2; exit 1; }
python3 "$ROOT/scripts/test-printer-library.py" --package "$ROOT/config/packages.chroot/enfoque-printer-drivers_${VERSION}-${REVISION}_amd64.deb"
# Register Enfoque-owned components with dpkg, enabling future signed APT upgrades.
python3 "$ROOT/scripts/build-update-package.py" --output "$ROOT/config/packages.chroot"
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
  --security false \
  --bootappend-live 'boot=live components locales=pt_BR.UTF-8 keyboard-layouts=br keyboard-model=abnt2 timezone=America/Sao_Paulo username=user user-default-groups=audio,cdrom,dip,floppy,video,plugdev,sudo quiet splash loglevel=3' \
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
