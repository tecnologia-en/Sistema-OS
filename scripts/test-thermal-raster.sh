#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROGRAM="$ROOT/config/includes.chroot/usr/local/libexec/enfoque-thermal-raster-trim"
test -x "$PROGRAM" || { echo 'No compiled thermal trimmer to test' >&2; exit 1; }
TMP="$(mktemp -d /tmp/enfoque-thermal-smoke.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
gcc -O2 -std=c11 -Wall -Wextra -Werror -o "$TMP/fixture" \
  "$ROOT/test/thermal_raster_fixture.c" -lcupsimage -lcups
for variant in footer qr none; do
    "$TMP/fixture" write "$variant" "$TMP/$variant.before"
    "$PROGRAM" < "$TMP/$variant.before" > "$TMP/$variant.after"
    "$TMP/fixture" check "$variant" "$TMP/$variant.after"
done
echo 'THERMAL_RASTER_SMOKE_PASSED: preserved DPI/width/top; removed browser footer and excess blank roll'
