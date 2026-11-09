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
  config/includes.chroot/etc/skel/.config/xfce4/panel/genmon-13.rc \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-keyboard-shortcuts.xml \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-start.svg \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-sige.svg \
  config/includes.chroot/usr/share/icons/hicolor/scalable/apps/enfoque-intranet.svg \
  config/includes.chroot/etc/skel/Desktop/SIGE.desktop \
  config/includes.chroot/etc/skel/Desktop/Intranet.desktop \
  config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml \
  config/includes.chroot/usr/share/applications/enfoque-sige.desktop \
  config/includes.chroot/usr/share/applications/enfoque-intranet.desktop
do
  need "$path"
done
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-aplicar-visual"
grep -q '^menu hidden$' "$ROOT/config/bootloaders/syslinux_common/menu.cfg" || fail 'menu BIOS nao oculto'\ngrep -Eq '^timeout 20$' "$ROOT/config/bootloaders/isolinux/isolinux.cfg" || fail 'timeout BIOS'
grep -Eq '^set timeout=2$' "$ROOT/config/bootloaders/grub-pc/config.cfg" || fail 'timeout EFI'
grep -Fq 'menu default' "$ROOT/config/bootloaders/syslinux_common/live.cfg.in" || fail 'Live padrao ausente'
grep -Fq 'Exec=/usr/local/bin/enfoque-aplicar-visual' "$ROOT/config/includes.chroot/etc/xdg/autostart/enfoque-visual.desktop" || fail 'autostart sem execucao'
grep -Eq '^arc-theme$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'tema Arc nao instalado'
grep -Eq '^systemd-timesyncd$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'NTP nao instalado'
grep -Fq 'value="Arc"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml" || fail 'tema nao configurado'
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
grep -Fq 'value="enfoque-menu.desktop"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'menu iniciar Enfoque OS ausente'
grep -Fq 'name="plugin-18" type="string" value="docklike"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'dock de aplicativos nao ativo'
need config/includes.chroot/etc/skel/.config/xfce4/panel/docklike-18.rc
need config/includes.chroot/etc/xdg/xfce4/panel/docklike.rc
need config/includes.chroot/usr/local/sbin/enfoque-docklike-install
grep -Fxq 'xfce4-docklike-plugin' "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'docklike ausente da ISO'
grep -Fq '#docklike-plugin .group.enfoque_attention' "$ROOT/config/includes.chroot/etc/skel/.config/gtk-3.0/gtk.css" || fail 'piscar laranja ausente'
grep -Fq 'name="plugin-13" type="string" value="genmon"' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'bateria dinamica ausente do painel'
grep -Fq 'Command=/usr/local/bin/enfoque-bateria-painel' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/panel/genmon-13.rc" || fail 'indicador de bateria adaptativo ausente'
grep -Fxq xfce4-battery-plugin "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail 'plugin bateria ausente da ISO'
need config/includes.chroot/usr/share/applications/enfoque-menu.desktop
need config/includes.chroot/usr/local/bin/enfoque-desktop-shell
need config/includes.chroot/usr/local/bin/enfoque-super-key
grep -Fq 'Super_L=Control_L|Escape' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-super-key" || fail 'tecla Windows nao inicia menu'
grep -Fq '&lt;Primary&gt;Escape' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-keyboard-shortcuts.xml" || fail 'atalho do menu GTK ausente'
grep -Fq 'p=10;' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" || fail 'barra inferior ausente'
grep -Fq 'https://enfoquepapelaria.meusige.com.br/' "$ROOT/config/includes.chroot/etc/skel/Desktop/SIGE.desktop" || fail 'atalho SIGE errado'
grep -Fq 'https://intranet.enfoquepapelaria.com.br/' "$ROOT/config/includes.chroot/etc/skel/Desktop/Intranet.desktop" || fail 'atalho Intranet errado'
if find "$ROOT/config/includes.chroot/etc/skel/Desktop" -maxdepth 1 -type f ! -name 'SIGE.desktop' ! -name 'Intranet.desktop' | grep -q .; then
  fail 'Mais de dois atalhos no Desktop da ISO'
fi
for package in libreoffice libreoffice-gtk3 libreoffice-l10n-pt-br libreoffice-help-pt-br hunspell-pt-br hyphen-pt-br; do
  grep -Fxq "$package" "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail "pacote LibreOffice faltando: $package"
done
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
grep -Fq 'google-chrome;' "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/panel/docklike-18.rc" || fail 'Chrome nao fixado no dock'
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
grep -Fq 'strftime("%d/%m/%Y")' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-relogio-painel" || fail 'data nao aparece no relogio'
grep -Fq 'meusige.com.br/sistema' "$ROOT/config/includes.chroot/usr/share/applications/enfoque-sige.desktop" || fail 'SIGE aponta para pagina errada'
for name in enfoque-start enfoque-central enfoque-suporte enfoque-diagnostico enfoque-sobre enfoque-inscrever; do
  need "config/includes.chroot/usr/share/icons/hicolor/scalable/apps/$name.svg"
done
# Installer + non-automatic login for persistent installed OS only.
for name in pkexec parted squashfs-tools dosfstools e2fsprogs grub2-common grub-pc-bin grub-efi-amd64-bin; do
  grep -Fxq "$name" "$ROOT/config/package-lists/enfoque-base.list.chroot" || fail "instalador ausente: $name"
done
need config/includes.chroot/usr/share/applications/enfoque-instalar.desktop
need config/includes.chroot/usr/local/bin/enfoque-instalar
need config/includes.chroot/usr/local/sbin/enfoque-install-system
need config/includes.chroot/etc/xdg/autostart/enfoque-instalar-live.desktop
need config/includes.chroot/usr/local/sbin/enfoque-login-instalado
need config/includes.chroot/etc/systemd/system/enfoque-login-instalado.service
need config/includes.chroot/usr/local/lib/enfoque-onboarding/identity.py
need config/includes.chroot/usr/local/bin/enfoque-primeiro-acesso
need config/includes.chroot/etc/xdg/autostart/enfoque-primeiro-acesso.desktop
need config/hooks/normal/098-enable-installed-login.hook.chroot
need config/includes.chroot/etc/lightdm/lightdm-gtk-greeter.conf.d/50-enfoque-theme.conf
for f in config/includes.chroot/usr/local/sbin/enfoque-login-instalado config/hooks/normal/098-enable-installed-login.hook.chroot; do
  sh -n "$ROOT/$f"
done
python3 -m py_compile "$ROOT/config/includes.chroot/usr/local/bin/enfoque-instalar" "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-install-system"
if grep -Fxq 'calamares-settings-debian' "$ROOT/config/package-lists/enfoque-base.list.chroot"; then
  fail 'Instalador Debian aparece na imagem'
fi
grep -Fq 'greeter-hide-users=false' "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-login-instalado" || fail 'login de usuario nao aparece'
grep -Fq 'autologin-user=' "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-login-instalado" || fail 'login automatico nao desabilitado'
grep -Fq 'strftime("%H:%M")' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-relogio-painel" || fail 'horario deve aparecer no relogio'

echo 'OK: boot BIOS/EFI, Chrome, painel USB, CUPS, suporte e atalhos SIGE/Intranet.'
