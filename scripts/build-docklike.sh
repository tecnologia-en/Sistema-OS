#!/usr/bin/env bash
# Build a pinned and reviewable XFCE Docklike plugin with an attention state.
# Runs in the Debian 13 CI builder, NOT on workstations or production VPS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE="$ROOT/third_party/xfce4-docklike-plugin-0.4.3.tar.bz2"
PATCH="$ROOT/patches/xfce4-docklike-attention-0.4.3.patch"
EXPECTED="e81e16b4ab1c655a3202473d78cc81617bb4829e5dd102eecabf9addd7668a9d"
TARGET="$ROOT/config/includes.chroot/usr/local/lib/enfoque-docklike/libdocklike.so"
[[ $(uname -m) == x86_64 ]] || { echo "Docklike: unsupported build architecture" >&2; exit 2; }
test -s "$ARCHIVE" && test -s "$PATCH"
test "$(sha256sum "$ARCHIVE" | cut -d' ' -f1)" = "$EXPECTED" || {
  echo "Docklike: upstream archive checksum mismatch" >&2; exit 2;
}
command -v make >/dev/null && command -v pkg-config >/dev/null && command -v patch >/dev/null
tmp="$(mktemp -d -t enfoque-docklike-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
tar -xjf "$ARCHIVE" -C "$tmp"
cd "$tmp/xfce4-docklike-plugin-0.4.3"
patch --batch -p1 < "$PATCH"
./configure --prefix=/usr --libdir=/usr/lib/x86_64-linux-gnu --disable-nls
make -j"$(nproc)"
LIB="$(find src -type f -name libdocklike.so -print -quit)"
test -s "$LIB"
mkdir -p "$(dirname "$TARGET")"
install -m 0755 "$LIB" "$TARGET"
strip --strip-unneeded "$TARGET"
test -s "$TARGET"
echo "Enfoque Docklike attention binary built: $TARGET"
