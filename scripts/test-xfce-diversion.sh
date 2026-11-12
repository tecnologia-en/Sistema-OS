#!/usr/bin/env bash
# Test Enfoque's config against the original Debian xfce4-settings package.
# Only in disposable Debian 13 containers, NEVER on employee PCs or VPS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if (( EUID != 0 )) || ! [[ -f /.dockerenv ]]; then
  echo 'Only run in disposable root Docker containers.' >&2
  exit 2
fi
source /etc/os-release
[[ "$ID" == debian && "$VERSION_ID" == 13 ]] ||
  { echo 'Requires Debian 13 test container.' >&2; exit 2; }
command -v dpkg-divert >/dev/null
dpkg-query -s xfce4-settings | grep -Fxq 'Status: install ok installed' ||
  { echo 'Install xfce4-settings in test container first.' >&2; exit 2; }
TMP="$(mktemp -d /tmp/enfoque-xfce-diversion.XXXXXXXX)"
trap 'rm -rf "$TMP"' EXIT
python3 "$ROOT/scripts/build-update-package.py" --output "$TMP"
RELEASE_FILE="$ROOT/config/includes.chroot/etc/enfoque-os-release"
VERSION="$(sed -n 's/^VERSION="\([^"]*\)"/\1/p' "$RELEASE_FILE")"
REVISION="$(sed -n 's/^PACKAGE_REVISION="\([1-9][0-9]*\)"/\1/p' "$RELEASE_FILE")"
test -n "$VERSION" && test -n "$REVISION"
PKG="$TMP/enfoque-os-core_${VERSION}-${REVISION}_all.deb"
test -s "$PKG"
dpkg-deb -e "$PKG" "$TMP/controls"
CONF=/etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml
test -s "$CONF"
test -z "$(dpkg-divert --listpackage "$CONF")"
test -z "$(grep -Fx "$CONF" "$TMP/controls/conffiles" || true)"
# The throwaway image intentionally does not install all Enfoque dependencies.
dpkg --unpack --force-depends "$PKG" >"$TMP/unpack.log" 2>&1 ||
  { tail -40 "$TMP/unpack.log"; exit 5; }
test "$(dpkg-divert --listpackage "$CONF")" = enfoque-os-core
test -s "$CONF" && test -s "$CONF.distrib"
grep -q 'unlocked="root"' "$CONF"
echo 'DIVERSION_ISOLATES_CORPORATE_XSETTINGS=PASS'
(
  cd "$TMP"
  apt-get download -qq xfce4-settings
  dpkg -i --force-confnew xfce4-settings_*.deb >"$TMP/vendor-reinstall.log" 2>&1 ||
    { tail -35 "$TMP/vendor-reinstall.log"; exit 6; }
)
test -s "$CONF.distrib"
grep -q 'unlocked="root"' "$CONF"
echo 'XFCE_OFFICIAL_PACKAGE_REINSTALL_IS_SAFE=PASS'
dpkg --remove --force-depends enfoque-os-core >"$TMP/remove.log" 2>&1 ||
  { tail -35 "$TMP/remove.log"; exit 7; }
test -z "$(dpkg-divert --listpackage "$CONF")"
test -s "$CONF"
echo 'ENFOQUE_REMOVE_RESTORES_VENDOR_XSETTINGS=PASS'
