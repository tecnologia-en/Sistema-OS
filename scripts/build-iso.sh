#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/.build/enfoque-os"
OUT="$ROOT/dist"
if (( EUID != 0 )); then echo 'Execute: sudo ./scripts/build-iso.sh' >&2; exit 1; fi
command -v lb >/dev/null || { echo 'Instale o pacote live-build' >&2; exit 1; }
test -s "$ROOT/config/package-lists/enfoque-base.list.chroot" || { echo 'Lista de pacotes ausente' >&2; exit 1; }
if [[ -e "$WORK" ]]; then echo "Build anterior em $WORK. Verifique antes de excluir." >&2; exit 1; fi
mkdir -p "$WORK" "$OUT"
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
  --bootappend-live 'boot=live components locales=pt_BR.UTF-8 keyboard-layouts=br' \
  --iso-application 'Enfoque OS piloto 0.1' \
  --iso-publisher 'Enfoque Papelaria - piloto interno' \
  --iso-volume 'ENFOQUE_OS_01'
lb build
shopt -s nullglob
isos=( ./*.iso )
if (( ${#isos[@]} != 1 )); then echo 'Nao foi encontrada exatamente uma ISO. Confira os logs.' >&2; exit 1; fi
TARGET="$OUT/enfoque-os-0.1-piloto-amd64.iso"
if [[ -e "$TARGET" ]]; then echo "ISO existente: $TARGET (nao sobrescrita)" >&2; exit 1; fi
mv -- "${isos[0]}" "$TARGET"
(cd "$OUT" && sha256sum "$(basename "$TARGET")" > SHA256SUMS)
echo "ISO gerada: $TARGET"
echo 'Teste numa VM separada antes de instalar em hardware real.'
