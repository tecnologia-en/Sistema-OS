#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/src/enfoque-thermal-raster-trim.c"
TARGET="$ROOT/config/includes.chroot/usr/local/libexec/enfoque-thermal-raster-trim"
command -v gcc >/dev/null || { echo 'Install gcc to build the Enfoque thermal filter' >&2; exit 2; }
test -s /usr/include/cups/raster.h || { echo 'Install libcupsimage2-dev in Debian 13 builder' >&2; exit 2; }
mkdir -p "$(dirname "$TARGET")"
gcc -O2 -std=c11 -Wall -Wextra -Werror -fstack-protector-strong \
  -D_FORTIFY_SOURCE=2 -o "$TARGET" "$SRC" -lcupsimage -lcups
chmod 0755 "$TARGET"
echo "THERMAL_RASTER_TRIM_READY $TARGET"
