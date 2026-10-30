#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for script in "$ROOT"/scripts/*.sh; do bash -n "$script"; echo "OK bash: $(basename "$script")"; done
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-diagnostico"
for f in "$ROOT/config/package-lists/enfoque-base.list.chroot" "$ROOT/config/includes.chroot/etc/apt/apt.conf.d/90enfoque-piloto" "$ROOT/config/includes.chroot/etc/enfoque-os-release" "$ROOT/config/includes.binary/LEIA-ME.txt"; do
  test -s "$f" || { echo "Arquivo ausente ou vazio: $f" >&2; exit 1; }
  echo "OK arquivo: ${f#"$ROOT"/}"
done
# Falha detectada no primeiro boot do piloto 0.1:
# user-setup precisa ser explicitamente instalado se o apt-recommends esta desativado.
grep -Eq '^[[:space:]]*user-setup[[:space:]]*$' "$ROOT/config/package-lists/enfoque-base.list.chroot" || {
  echo 'ERRO: pacote user-setup ausente; modo Live nao criara o usuario.' >&2
  exit 1
}
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
for pkg in libreoffice libreoffice-gtk3 libreoffice-l10n-pt-br libreoffice-help-pt-br hunspell-pt-br hyphen-pt-br; do
  grep -Fxq "$pkg" "$ROOT/config/package-lists/enfoque-base.list.chroot" || { echo "LibreOffice incompleto: $pkg" >&2; exit 1; }
done

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
echo 'Estrutura valida. A ISO deve ser compilada e testada em VM.'
