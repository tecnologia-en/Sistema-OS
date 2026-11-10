#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for script in "$ROOT"/scripts/*.sh; do bash -n "$script"; echo "OK bash: $(basename "$script")"; done
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-diagnostico"
for f in "$ROOT/config/package-lists/enfoque-base.list.chroot" "$ROOT/config/includes.chroot/etc/apt/apt.conf.d/90enfoque-piloto" "$ROOT/config/includes.chroot/etc/enfoque-os-release" "$ROOT/config/includes.binary/LEIA-ME.txt"; do
  test -s "$f" || { echo "Arquivo ausente ou vazio: $f" >&2; exit 1; }
  echo "OK arquivo: ${f#"$ROOT"/}"
done
# Use our branded offline installer instead of exposing Debian Calamares.
if grep -Eq '^calamares-settings-debian$' "$ROOT/config/package-lists/enfoque-base.list.chroot"; then
  echo "ERRO: Calamares nao pode estar na ISO Enfoque OS 0.2.15" >&2; exit 1
fi
for pkg in parted squashfs-tools dosfstools e2fsprogs grub2-common grub-pc-bin grub-efi-amd64-bin; do
  grep -Fxq "$pkg" "$ROOT/config/package-lists/enfoque-base.list.chroot" || {
    echo "ERRO: dependencia offline ausente: $pkg" >&2; exit 1;
  }
done
python3 -m unittest discover -s "$ROOT/test" -p 'test_branded_installer.py'

# Falha detectada no primeiro boot do piloto 0.1:
# user-setup precisa ser explicitamente instalado se o apt-recommends esta desativado.
grep -Eq '^[[:space:]]*user-setup[[:space:]]*$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || {
  echo 'ERRO: pacote user-setup ausente; modo Live nao criara o usuario.' >&2
  exit 1
}

# The admin support account is provisioned ONLY by the disk installer; the
# Live image chroot must keep UID 1000 free for Debian's temporary user.
for file in \
    "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-live-session" \
    "$ROOT/config/hooks/normal/104-enfoque-live-autologin.hook.chroot"; do
  test -x "$file" || { echo "ERRO: Live autologin nao-executavel: $file" >&2; exit 1; }
  sh -n "$file"
done
test -s "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-live-session.service"
grep -Fq 'After=live-config.service' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-live-session.service"
grep -Fq 'Before=lightdm.service display-manager.service' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-live-session.service"
grep -Fq 'ConditionKernelCommandLine=boot=live' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-live-session.service"
grep -Fq 'username=user user-default-groups=' "$ROOT/scripts/build-iso.sh"
grep -Eq '^[[:space:]]*sudo[[:space:]]*$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || {
  echo 'ERRO: pacote sudo ausente no modo Live.' >&2
  exit 1
}
for pkg in locales console-setup keyboard-configuration tzdata python3 python3-gi gir1.2-gtk-3.0 cups ipp-usb lightdm-gtk-greeter accountsservice dbus-x11 xserver-xorg-video-vmware xserver-xorg-video-vesa procps; do
  grep -Eq "^[[:space:]]*$pkg[[:space:]]*$" "$ROOT/config/package-lists/enfoque-base.list.chroot" || {
    echo "ERRO: dependencia obrigatoria para pt_BR: $pkg" >&2
    exit 1
  }
done
version="$(sed -n 's/^VERSION="\([^"]*\)"/\1/p' "$ROOT/config/includes.chroot/etc/enfoque-os-release")"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERRO: versao invalida em enfoque-os-release: $version" >&2
  exit 1
fi
grep -q 'keyboard-layouts=br' "$ROOT/scripts/build-iso.sh"
grep -q 'keyboard-model=abnt2' "$ROOT/scripts/build-iso.sh"
grep -q 'timezone=America/Sao_Paulo' "$ROOT/scripts/build-iso.sh"
echo "Versao definida: $version"
# Debian Security e incluido via repositorio oficial explicito. --security false
# desativa somente a origem padrao incompatível do live-build Ubuntu.
for f in "$ROOT/config/archives/trixie-security.list.chroot" "$ROOT/config/archives/trixie-security.list.binary"; do
  test -s "$f" || { echo "ERRO: repositorio de seguranca ausente: $f" >&2; exit 1; }
  grep -q 'trixie-security main non-free-firmware' "$f"
done
grep -Fq -- '--security false' "$ROOT/scripts/build-iso.sh" || {
  echo 'ERRO: live-build Ubuntu usara trixie/updates (inexistente).' >&2
  exit 1
}

# Verifica componentes PayGo/Wine para nao aceitar ISO sem hooks executaveis.
for hook in 080-instalar-wine 091-incorporar-paygo; do
  f="$ROOT/config/hooks/normal/$hook.hook.chroot"
  test -x "$f" || { echo "Hook nao executavel: $f" >&2; exit 1; }
  sh -n "$f"
done
test -x "$ROOT/config/includes.chroot/usr/local/bin/enfoque-paygo" || exit 1
python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-paygo"
# Legacy PayGo and Wine tools stay searchable in the menu, not on the desktop.
for app in enfoque-paygo enfoque-wincompat enfoque-central enfoque-instalar; do
  f="$ROOT/config/includes.chroot/usr/share/applications/$app.desktop"
  test -s "$f" || { echo "Menu nao tem aplicacao: $f" >&2; exit 1; }
done
desktop="$ROOT/config/includes.chroot/etc/skel/Desktop"
for app in SIGE Intranet; do
  test -s "$desktop/$app.desktop" || { echo "Atalho empresarial ausente: $app" >&2; exit 1; }
done
if find "$desktop" -mindepth 1 -maxdepth 1 -type f ! -name 'SIGE.desktop' ! -name 'Intranet.desktop' | grep -q .; then
  echo 'ERRO: ISO colocou atalhos extras na area de trabalho' >&2
  exit 1
fi
for pkg in libreoffice libreoffice-gtk3 libreoffice-l10n-pt-br hunspell-pt-br hyphen-pt-br; do
  grep -Fxq "$pkg" "$ROOT/config/package-lists/enfoque-base.list.chroot" || { echo "LibreOffice incompleto: $pkg" >&2; exit 1; }
done

# 0.2.31: somente a campanha aprovada pode iniciar update do core.
# O timer legado semanal precisa estar explicitamente desabilitado no postinst.
grep -Fq 'systemctl disable --now enfoque-update-apply.timer' "$ROOT/scripts/build-update-package.py" || {
  echo 'ERRO: instalacao automatica sem controle administrativo' >&2
  exit 1
}
test -x "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-update-control"
test -f "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-update-control.timer"

# AnyDesk vendor-signed installer must be included in the bootable ISO.
anydesk_hook="$ROOT/config/hooks/normal/093-anydesk-oficial.hook.chroot"
test -x "$anydesk_hook" || { echo 'Hook AnyDesk ausente' >&2; exit 1; }
sh -n "$anydesk_hook"
grep -Fq 'signed-by=/etc/apt/keyrings/keys.anydesk.com.asc' "$anydesk_hook"
grep -Fq 'systemctl enable anydesk.service' "$anydesk_hook"
grep -Fq 'rm -rf -- /etc/anydesk /root/.anydesk /var/lib/anydesk' "$anydesk_hook"
python3 -m unittest discover -s "$ROOT/test" -p 'test_anydesk_image.py'

# Enfoque OS 0.2.12: no embedded tokens, explicit agent approval, scoped trust.
for path in \
  "$ROOT/config/includes.chroot/usr/local/bin/enfoque-remote-agent" \
  "$ROOT/config/includes.chroot/usr/local/bin/enfoque-mesh-autoprovision" \
  "$ROOT/config/hooks/normal/099-enfoque-remote-agent.hook.chroot"; do
  test -x "$path" || { echo "Agente Linux ausente: $path" >&2; exit 1; }
done
for unit in enfoque-remote-agent enfoque-mesh-autoprovision; do
  test -s "$ROOT/config/includes.chroot/etc/systemd/system/$unit.service"
  grep -Fq "systemctl enable $unit.service" "$ROOT/config/hooks/normal/099-enfoque-remote-agent.hook.chroot"
done
test ! -e "$ROOT/config/includes.chroot/etc/enfoque-os/agent.json"
test ! -e "$ROOT/config/includes.chroot/var/lib/enfoque-agent/identity.json"
python3 -m unittest discover -s "$ROOT/test" -p 'test_agent_0212.py'
python3 -c 'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf8").read())' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-mesh-autoprovision"
sh -n "$ROOT/config/hooks/normal/099-enfoque-remote-agent.hook.chroot"
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-aplicar-visual"
grep -Fq 'DynamicUser=yes' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-remote-agent.service"
grep -Fq 'NoNewPrivileges=yes' "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-remote-agent.service"
grep -Fq '"localUuid": local_uuid' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-inscrever-computador"
grep -Fq 'config.get("localUuid") != local_uuid' "$ROOT/config/includes.chroot/usr/local/bin/enfoque-mesh-autoprovision"

# Kiosk 0.2.8: no hardcoded TEF credentials or untested scripts in ISO.
for f in "$ROOT/config/hooks/normal/097-enfoque-lowram-kiosk.hook.chroot" \
         "$ROOT/config/includes.chroot/usr/local/bin/enfoque-kiosk-session" \
         "$ROOT/config/includes.chroot/usr/local/bin/enfoque-paygo-tef-run"; do
    test -x "$f" || { echo "Executavel de quiosque ausente: $f" >&2; exit 1; }
    sh -n "$f"
done
for f in "$ROOT/config/includes.chroot/usr/local/bin/enfoque-paygo-tef-health" \
         "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-kiosk-control" \
         "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-paygo-provision"; do
    test -x "$f" || { echo "Script protegido ausente: $f" >&2; exit 1; }
    python3 -c 'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf-8").read())' "$f"
done
grep -q '^ALGO=lz4' "$ROOT/config/includes.chroot/etc/default/zramswap"
grep -q '^PERCENT=100' "$ROOT/config/includes.chroot/etc/default/zramswap"
test -s "$ROOT/config/includes.chroot/usr/share/plymouth/themes/enfoque-os/enfoque-os.plymouth"
test -s "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-paygo-tef.service"
python3 -m unittest discover -s "$ROOT/test" -p 'test_kiosk_lowram.py'
python3 -m unittest discover -s "$ROOT/test" -p 'test_paygo_sandbox_monitor.py'
python3 -m unittest discover -s "$ROOT/test" -p 'test_pinpad_identity.py'
python3 -m unittest discover -s "$ROOT/test" -p 'test_device_id.py'
python3 -m unittest discover -s "$ROOT/test" -p 'test_paygo_bridge.py'
python3 -m unittest discover -s "$ROOT/test" -p 'test_office_desktop.py'
test -s "$ROOT/config/includes.chroot/etc/systemd/system/enfoque-device-id.service"
test -s "$ROOT/config/includes.chroot/usr/share/applications/enfoque-id.desktop"
test -s "$ROOT/config/includes.chroot/usr/share/applications/enfoque-paygo-teste.desktop"
test -s "$ROOT/config/includes.chroot/usr/local/lib/enfoque-paygo-teste/app.py"
bash "$ROOT/scripts/check-visual.sh"

# Enfoque OS 0.2.21: signed APT repository and versioned core package.
for file in "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-update" \
            "$ROOT/config/includes.chroot/usr/local/bin/enfoque-update-ui" \
            "$ROOT/scripts/build-update-package.py" \
            "$ROOT/scripts/publish-update-repo.sh"; do
    test -x "$file" || { echo "Atualizador ausente: $file" >&2; exit 1; }
done
python3 -m py_compile "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-update"
python3 -m py_compile "$ROOT/scripts/build-update-package.py"
bash -n "$ROOT/scripts/publish-update-repo.sh"
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-update-ui"
test -s "$ROOT/config/includes.chroot/usr/share/keyrings/enfoque-os-archive-keyring.gpg"
grep -Fq "Signed-By: /usr/share/keyrings/enfoque-os-archive-keyring.gpg" "$ROOT/config/includes.chroot/etc/apt/sources.list.d/enfoque-os.sources"
for unit in enfoque-update-check.service enfoque-update-check.timer enfoque-update-apply.service enfoque-update-apply.timer; do
    test -s "$ROOT/config/includes.chroot/etc/systemd/system/$unit"
done
python3 -m unittest discover -s "$ROOT/test" -p 'test_enfoque_update.py'
# Enfoque OS 0.2.23: offline enrollment and per-device SSH reverse tunnel.
for unit in enfoque-zero-touch.service enfoque-zero-touch.timer enfoque-tunnel.service; do
  test -s "$ROOT/config/includes.chroot/etc/systemd/system/$unit"
done
test -x "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-zero-touch"
test -x "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-tunnel"
test -s "$ROOT/config/includes.chroot/etc/enfoque-ssh/vps-known-hosts"
test -s "$ROOT/config/includes.chroot/etc/sudoers.d/97-enfoque-ti"
python3 -m py_compile "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-zero-touch" "$ROOT/config/includes.chroot/usr/local/sbin/enfoque-tunnel"
grep -Fq 'AllowUsers enfoque-ti' "$ROOT/config/includes.chroot/etc/ssh/sshd_config.d/95-enfoque-suporte.conf"
grep -Fq 'PermitRootLogin no' "$ROOT/config/includes.chroot/etc/ssh/sshd_config.d/95-enfoque-suporte.conf"
echo 'Estrutura valida. A ISO deve ser compilada e testada em VM.'
