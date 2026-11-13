#!/usr/bin/env bash
# Publish reviewed core and printer-bank packages in one signed APT index.
set -euo pipefail
if [[ "$#" -lt 1 || "$EUID" -ne 0 ]]; then
  echo "Usage: publish-update-repo.sh core.deb [printer-drivers.deb]" >&2
  exit 2
fi
ROOT=/srv/enfoque-os-archive
KEY_HOME=/var/lib/enfoque-update/keyring
PUBLIC=/var/lib/enfoque-update/archive-keyring.gpg
[[ -d "$KEY_HOME" && -f "$PUBLIC" ]]
declare -a DEBS=()
CORE_VER=""
PRINTER_VER=""
for input in "$@"; do
  deb="$(realpath -- "$input")"
  test -f "$deb"
  name="$(dpkg-deb -f "$deb" Package)"
  ver="$(dpkg-deb -f "$deb" Version)"
  arch="$(dpkg-deb -f "$deb" Architecture)"
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[1-9][0-9]*$ ]] || exit 1
  case "$name:$arch" in
    enfoque-os-core:all)
      [[ -z "$CORE_VER" ]] || exit 1
      CORE_VER="$ver"
      core="$deb"
      ;;
    enfoque-printer-drivers:amd64)
      [[ -z "$PRINTER_VER" ]] || exit 1
      PRINTER_VER="$ver"
      ;;
    *) echo "Invalid Enfoque package" >&2; exit 1 ;;
  esac
  DEBS+=("$deb")
done
[[ -n "$CORE_VER" ]] || { echo "A core package is required" >&2; exit 1; }
if dpkg-deb -f "$core" Depends | grep -Fq enfoque-printer-drivers; then
  [[ "$PRINTER_VER" == "$CORE_VER" ]] || {
    echo "Publish the matching printer bank together with this core" >&2; exit 1;
  }
fi
install -d -m 0755 "$ROOT/pool/main/e/enfoque-os-core" "$ROOT/pool/main/e/enfoque-printer-drivers" "$ROOT/releases" "$ROOT/dists"
exec 9> /run/lock/enfoque-repo-publish.lock
flock -x 9
# Validate collisions for the complete set before copying either package.
for deb in "${DEBS[@]}"; do
  name="$(dpkg-deb -f "$deb" Package)"
  target="$ROOT/pool/main/e/$name/$(basename "$deb")"
  if [[ -f "$target" ]]; then
    cmp -s "$deb" "$target" || { echo "Version already published with different content" >&2; exit 1; }
  fi
done
for deb in "${DEBS[@]}"; do
  name="$(dpkg-deb -f "$deb" Package)"
  target="$ROOT/pool/main/e/$name/$(basename "$deb")"
  [[ -f "$target" ]] || install -m 0644 -- "$deb" "$target"
done
VERSION="$(printf '%s' "$CORE_VER" | tr . -)"
STAGE="$(mktemp -d "$ROOT/releases/.build-$VERSION-XXXXXXXX")"
cleanup() { test ! -d "$STAGE" || rm -rf -- "$STAGE"; }
trap cleanup EXIT
install -d -m 0755 "$STAGE/main/binary-amd64"
(
  cd "$ROOT"
  apt-ftparchive packages pool/main/e/enfoque-os-core
  apt-ftparchive packages pool/main/e/enfoque-printer-drivers
) > "$STAGE/main/binary-amd64/Packages"
gzip -n -c "$STAGE/main/binary-amd64/Packages" > "$STAGE/main/binary-amd64/Packages.gz"
( cd "$STAGE"; apt-ftparchive -o "APT::FTPArchive::Release::Origin=Enfoque Papelaria" -o "APT::FTPArchive::Release::Label=Enfoque OS" -o "APT::FTPArchive::Release::Suite=stable" -o "APT::FTPArchive::Release::Codename=stable" -o "APT::FTPArchive::Release::Architectures=amd64" -o "APT::FTPArchive::Release::Components=main" release . > Release )
gpg --homedir "$KEY_HOME" --batch --yes --pinentry-mode loopback --clearsign --digest-algo SHA256 --output "$STAGE/InRelease" "$STAGE/Release"
gpg --homedir "$KEY_HOME" --batch --yes --pinentry-mode loopback --detach-sign --digest-algo SHA256 --output "$STAGE/Release.gpg" "$STAGE/Release"
gpgv --keyring "$PUBLIC" "$STAGE/Release.gpg" "$STAGE/Release" >/dev/null
gpgv --keyring "$PUBLIC" "$STAGE/InRelease" >/dev/null
id="$(date -u +%Y%m%dT%H%M%SZ)-$(sha256sum "$core" | cut -c1-12)"
RELEASE_DIR="$ROOT/releases/$id"
mv -- "$STAGE" "$RELEASE_DIR"
trap - EXIT
ln -s "../releases/$id" "$ROOT/dists/.stable-next"
mv -Tf -- "$ROOT/dists/.stable-next" "$ROOT/dists/stable"
chmod -R a+rX "$RELEASE_DIR"
echo "ENFOQUE_APT_PUBLISHED version=$CORE_VER index=$RELEASE_DIR"
