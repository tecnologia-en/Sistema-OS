#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "ERRO visual/boot: $*" >&2; exit 1; }
need() { test -s "$ROOT/$1" || fail "arquivo ausente ou vazio: $1"; }
for path in \
  config/bootloaders/isolinux/isolinux.cfg \
  config/bootloaders/isolinux/splash.png \
  config/bootloaders/syslinux_common/menu.cfg \
  config/bootloaders/syslinux_common/live.cfg.in \
  config/bootloaders/grub-pc/config.cfg \
  config/bootloaders/grub-pc/splash.png \
  config/bootloaders/grub-pc/live-theme/theme.txt \
  config/includes.chroot/usr/share/backgrounds/enfoque-os/wallpaper.png \
  config/includes.chroot/usr/share/icons/hicolor/256x256/apps/enfoque-os.png \
  config/includes.chroot/usr/local/bin/enfoque-aplicar-visual \
  config/includes.chroot/etc/xdg/autostart/enfoque-visual.desktop \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml
do
  need "$path"
done
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-aplicar-visual"
grep -Eq '^timeout 50$' "$ROOT/config/bootloaders/isolinux/isolinux.cfg" || fail 'timeout BIOS'
grep -Eq '^set timeout=5$' "$ROOT/config/bootloaders/grub-pc/config.cfg" || fail 'timeout EFI'
grep -Fq 'menu default' "$ROOT/config/bootloaders/syslinux_common/live.cfg.in" || fail 'Live padrao ausente'
grep -Fq 'Exec=/usr/local/bin/enfoque-aplicar-visual' "$ROOT/config/includes.chroot/etc/xdg/autostart/enfoque-visual.desktop" || fail 'autostart sem execucao'
grep -Eq '^arc-theme$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'tema Arc nao instalado'
grep -Eq '^systemd-timesyncd$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'NTP nao instalado'
grep -Fq 'Arc-Dark' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml" || fail 'tema nao configurado'
for p in \
  config/bootloaders/isolinux/splash.png \
  config/bootloaders/grub-pc/splash.png \
  config/includes.chroot/usr/share/backgrounds/enfoque-os/wallpaper.png \
  config/includes.chroot/usr/share/icons/hicolor/256x256/apps/enfoque-os.png
do
  magic="$(od -An -tx1 -N8 "$ROOT/$p" | tr -d ' \n')"
  [ "$magic" = '89504e470d0a1a0a' ] || fail "PNG invalido: $p"
done
echo 'OK: boot automatico BIOS/EFI e tema Enfoque OS.'
