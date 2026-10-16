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
  config/includes.chroot/usr/share/backgrounds/enfoque-os/wallpaper.jpg \
  config/includes.chroot/usr/share/icons/hicolor/256x256/apps/enfoque-os.png \
  config/includes.chroot/usr/local/bin/enfoque-aplicar-visual \
  config/includes.chroot/etc/xdg/autostart/enfoque-visual.desktop \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-start.svg \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-sige.svg \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-intranet.svg \
  config/includes.chroot/etc/skel/Desktop/SIGE.desktop \
  config/includes.chroot/etc/skel/Desktop/Intranet.desktop \
  config/includes.chroot/usr/share/applications/enfoque-sige.desktop \
  config/includes.chroot/usr/share/applications/enfoque-intranet.desktop
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
grep -Fq 'value="Arc-Dark"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml" || fail 'tema nao configurado'
for p in \
  config/bootloaders/isolinux/splash.png \
  config/bootloaders/grub-pc/splash.png \
  config/includes.chroot/usr/share/icons/hicolor/256x256/apps/enfoque-os.png
do
  magic="$(od -An -tx1 -N8 "$ROOT/$p" | tr -d ' \n')"
  [ "$magic" = '89504e470d0a1a0a' ] || fail "PNG invalido: $p"
done
need config/includes.chroot/etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml
if ! grep -Fq 'unlocked="root"' "$ROOT/config/includes.chroot/etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml"; then fail 'wallpaper corporativo sem bloqueio de alteracao'; fi
if ! grep -Fq 'wallpaper.jpg' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-aplicar-visual"; then fail 'wallpaper desatualizado'; fi
magic="$(od -An -tx1 -N3 "$ROOT/config/includes.chroot/usr/share/backgrounds/enfoque-os/wallpaper.jpg" | tr -d ' \n')"
[ "$magic" = 'ffd8ff' ] || fail 'JPEG corporativo invalido'
grep -Fq 'value="whiskermenu"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'menu iniciar ausente'
grep -Fq 'p=10;' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'barra inferior ausente'
grep -Fq 'https://enfoquepapelaria.meusige.com.br/' "$ROOT/config/includes.chroot/etc/skel/Desktop/SIGE.desktop" || fail 'atalho SIGE errado'
grep -Fq 'https://intranet.enfoquepapelaria.com.br/' "$ROOT/config/includes.chroot/etc/skel/Desktop/Intranet.desktop" || fail 'atalho Intranet errado'
grep -Eq '^xfce4-whiskermenu-plugin$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'whiskermenu ausente'
grep -Eq '^papirus-icon-theme$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'papirus ausente'
for f in \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-central.svg \
  config/includes.chroot/usr/local/lib/enfoque-hub/app.py \
  config/includes.chroot/usr/local/lib/enfoque-hub/devices.py \
  config/includes.chroot/usr/share/applications/enfoque-central.desktop \
  config/includes.chroot/etc/xdg/autostart/enfoque-central.desktop \
  config/includes.chroot/usr/local/bin/enfoque-parear-suporte \
  config/includes.chroot/usr/local/bin/enfoque-inscrever-computador \
  config/includes.chroot/usr/local/bin/enfoque-captura-tela \
  config/includes.chroot/etc/systemd/system/enfoque-captura-tela.service \
  config/includes.chroot/usr/share/applications/enfoque-inscrever-computador.desktop \
  config/hooks/normal/090-google-chrome.hook.chroot; do
  need "$f"
done
grep -Fq 'google-chrome-stable' "$ROOT/config/includes.chroot/etc/skel/Desktop/SIGE.desktop" || fail 'SIGE nao abre no Chrome'
grep -Fq 'google-chrome-stable' "$ROOT/config/includes.chroot/etc/skel/Desktop/Intranet.desktop" || fail 'Intranet nao abre no Chrome'
grep -Fq 'google-chrome.desktop' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'Chrome ausente do painel'
grep -Fq 'dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb' "$ROOT/config/hooks/normal/090-google-chrome.hook.chroot" || fail 'Instalador Chrome ausente'
if grep -E '^(firefox-esr|firefox-esr-l10n-pt-br)$' "$ROOT/config/package-lists/enfoque-base.list.chroot"; then
  fail 'Firefox ainda incluido na lista de pacotes'
fi
for f in \
  config/includes.chroot/usr/local/sbin/enfoque-ativar-grafico \
  config/includes.chroot/etc/systemd/system/enfoque-ativar-grafico.service \
  config/hooks/normal/095-enable-graphical-vt.hook.chroot; do
  need "$f"
done
grep -Fq 'WantedBy=graphical.target' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-ativar-grafico.service" || fail 'ativacao do VT fora do alvo grafico'
grep -Fq 'ConditionPathExists=/run/live/medium' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-ativar-grafico.service" || fail 'protecao de modo Live ausente'
grep -Fq 'systemctl enable enfoque-ativar-grafico.service' "$ROOT/config/hooks/normal/095-enable-graphical-vt.hook.chroot" || fail 'servico VT nao habilitado'
sh -n "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-ativar-grafico" "$ROOT/config/hooks/normal/095-enable-graphical-vt.hook.chroot"
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-parear-suporte" "$ROOT/config/hooks/normal/090-google-chrome.hook.chroot"
python3 -m py_compile "$ROOT/config/includes.chroot/usr/local/lib/enfoque-hub/app.py" "$ROOT/config/includes.chroot/usr/local/lib/enfoque-hub/devices.py"
# O Chrome precisa ser default XDG real, nao apenas um botao do painel.
need config/includes.chroot/usr/local/bin/enfoque-chrome-padrao
need config/includes.chroot/etc/xdg/autostart/enfoque-chrome-padrao.desktop
need config/includes.chroot/etc/xdg/mimeapps.list
need config/includes.chroot/usr/share/icons/hicolor/48x48/apps/enfoque-intranet.png
need config/hooks/normal/092-set-default-browser.hook.chroot
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-chrome-padrao"
sh -n "$ROOT/config/hooks/normal/092-set-default-browser.hook.chroot"
grep -Fq 'xdg-settings set default-web-browser' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-chrome-padrao" || fail 'Chrome nao forcado no primeiro login'
grep -Fq 'xdg-settings get default-web-browser' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-chrome-padrao" || fail 'Sem validacao do default do Chrome'
grep -Fq 'Exec=/usr/local/bin/enfoque-chrome-padrao' "$ROOT/config/includes.chroot/etc/xdg/autostart/enfoque-chrome-padrao.desktop" || fail 'Autostart Chrome default ausente'
for f in config/includes.chroot/etc/xdg/mimeapps.list config/includes.chroot/etc/skel/.config/mimeapps.list; do
  grep -Fxq 'x-scheme-handler/https=google-chrome.desktop' "$ROOT/$f" || fail "HTTPS nao tem Chrome default: $f"
  grep -Fxq 'text/html=google-chrome.desktop' "$ROOT/$f" || fail "HTML nao tem Chrome default: $f"
done
grep -Fxq 'librsvg2-common' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'librsvg2-common ausente para icones SVG'
magic="$(od -An -tx1 -N8 "$ROOT/config/includes.chroot/usr/share/icons/hicolor/48x48/apps/enfoque-intranet.png" | tr -d ' \n')"
[ "$magic" = '89504e470d0a1a0a' ] || fail 'Fallback PNG Intranet invalido'

# Check usable audio, date and network interactions (not merely decorative icons).
need config/includes.chroot/usr/local/bin/enfoque-iniciar-rede
need config/includes.chroot/etc/xdg/autostart/enfoque-rede.desktop
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-iniciar-rede"
grep -Fq 'Exec=/usr/local/bin/enfoque-iniciar-rede' "$ROOT/config/includes.chroot/etc/xdg/autostart/enfoque-rede.desktop" || fail 'NetworkManager applet sem autostart'
for name in xfce4-pulseaudio-plugin pulseaudio pavucontrol alsa-utils network-manager-gnome; do
  grep -Fxq "$name" "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail "pacote essencial ausente: $name"
done
grep -Fq 'value="pulseaudio"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'controle clicavel de audio ausente'
grep -Fq '%d/%m/%Y' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'data nao aparece no relogio'
grep -Fq 'meusige.com.br/sistema' "$ROOT/config/includes.chroot/usr/share/applications/enfoque-sige.desktop" || fail 'SIGE aponta para pagina errada'
for name in enfoque-start enfoque-central enfoque-suporte enfoque-diagnostico enfoque-sobre enfoque-inscrever; do
  need "config/includes.chroot/usr/share/icons/hicolor/scalable/apps/$name.svg"
done
echo 'OK: boot BIOS/EFI, Chrome, painel USB, CUPS, suporte e atalhos SIGE/Intranet.'
