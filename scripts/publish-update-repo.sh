#!/usr/bin/env bash
# Signed APT archive publisher for reviewed Enfoque OS packages.
set -euo pipefail
if [[ "$#" -ne 1 || "$EUID" -ne 0 ]]; then
  echo "Usage: publish-update-repo.sh /path/enfoque-os-core_VERSION_all.deb" >&2
  exit 2
fi
DEB="$(realpath -- "$1")"
test -f "$DEB"
NAME="$(dpkg-deb -f "$DEB" Package)"
VER="$(dpkg-deb -f "$DEB" Version)"
ARCH="$(dpkg-deb -f "$DEB" Architecture)"
[[ "$NAME" == "enfoque-os-core" && "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+-1$ && "$ARCH" == "all" ]] || {
  echo "Invalid Enfoque package" >&2; exit 1;
}
ROOT=/srv/enfoque-os-archive
KEY_HOME=/var/lib/enfoque-update/keyring
PUBLIC=/var/lib/enfoque-update/archive-keyring.gpg
[[ -d "$KEY_HOME" && -f "$PUBLIC" ]]
install -d -m 0755 "$ROOT/pool/main/e/enfoque-os-core" "$ROOT/releases" "$ROOT/dists"
exec 9> /run/lock/enfoque-repo-publish.lock
flock -x 9
TARGET="$ROOT/pool/main/e/enfoque-os-core/$(basename "$DEB")"
if [[ -f "$TARGET" ]]; then
  cmp -s "$DEB" "$TARGET" || { echo "Version already published with different content" >&2; exit 1; }
else
  install -m 0644 -- "$DEB" "$TARGET"
fi
VERSION="$(printf '%s' "$VER" | tr . -)"
STAGE="$(mktemp -d "$ROOT/releases/.build-$VERSION-XXXXXXXX")"
cleanup() { test ! -d "$STAGE" || rm -rf -- "$STAGE"; }
trap cleanup EXIT
install -d -m 0755 "$STAGE/main/binary-amd64"
( cd "$ROOT"; apt-ftparchive packages pool/main/e/enfoque-os-core > "$STAGE/main/binary-amd64/Packages" )
gzip -n -c "$STAGE/main/binary-amd64/Packages" > "$STAGE/main/binary-amd64/Packages.gz"
( cd "$STAGE"; apt-ftparchive -o "APT::FTPArchive::Release::Origin=Enfoque Papelaria" -o "APT::FTPArchive::Release::Label=Enfoque OS" -o "APT::FTPArchive::Release::Suite=stable" -o "APT::FTPArchive::Release::Codename=stable" -o "APT::FTPArchive::Release::Architectures=amd64" -o "APT::FTPArchive::Release::Components=main" release . > Release )
gpg --homedir "$KEY_HOME" --batch --yes --pinentry-mode loopback --clearsign --digest-algo SHA256 --output "$STAGE/InRelease" "$STAGE/Release"
gpg --homedir "$KEY_HOME" --batch --yes --pinentry-mode loopback --detach-sign --digest-algo SHA256 --output "$STAGE/Release.gpg" "$STAGE/Release"
gpgv --keyring "$PUBLIC" "$STAGE/Release.gpg" "$STAGE/Release" >/dev/null
gpgv --keyring "$PUBLIC" "$STAGE/InRelease" >/dev/null
id="$(date -u +%Y%m%dT%H%M%SZ)-$(sha256sum "$DEB" | cut -c1-12)"
RELEASE_DIR="$ROOT/releases/$id"
mv -- "$STAGE" "$RELEASE_DIR"
trap - EXIT
ln -s "../releases/$id" "$ROOT/dists/.stable-next"
mv -Tf -- "$ROOT/dists/.stable-next" "$ROOT/dists/stable"
chmod -R a+rX "$RELEASE_DIR"
echo "ENFOQUE_APT_PUBLISHED version=$VER index=$RELEASE_DIR"
echo "ENFOQUE_APT_PACKAGE_SHA256=$(sha256sum "$TARGET" | cut -d' ' -f1)"
