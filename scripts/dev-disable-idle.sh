#!/usr/bin/env bash
# Somente para a VM Debian 13 usada no desenvolvimento do Enfoque OS.
# NAO aplicar em PCs de loja ou em maquinas de producao.
set -euo pipefail
if [[ ${EUID} -eq 0 ]]; then
  echo "Execute como usuario normal, SEM sudo, dentro do XFCE." >&2
  exit 1
fi
if [[ -z "${DISPLAY:-}" ]]; then
  echo "Abra um terminal na sessao grafica XFCE antes de executar." >&2
  exit 1
fi
command -v xfconf-query >/dev/null || { echo "xfconf-query nao encontrado" >&2; exit 1; }
command -v xset >/dev/null || { echo "xset nao encontrado" >&2; exit 1; }
configure() {
  xfconf-query -c "$1" -p "$2" --create --type "$3" --set "$4"
}
# Nao suspender por inatividade na energia ou bateria (VM de desenvolvimento).
configure xfce4-power-manager /xfce4-power-manager/inactivity-on-ac uint 0
configure xfce4-power-manager /xfce4-power-manager/inactivity-on-battery uint 0
configure xfce4-power-manager /xfce4-power-manager/blank-on-ac uint 0
configure xfce4-power-manager /xfce4-power-manager/blank-on-battery uint 0
configure xfce4-power-manager /xfce4-power-manager/dpms-enabled bool false
configure xfce4-power-manager /xfce4-power-manager/lock-screen-suspend-hibernate bool false
# Desabilita o screensaver e sua trava (quando instalado).
configure xfce4-screensaver /saver/enabled bool false
configure xfce4-screensaver /lock/enabled bool false
configure xfce4-screensaver /saver/idle-activation/enabled bool false
mkdir -p "$HOME/.config/autostart"
# Evita que bloqueadores padrao sejam inicializados nas proximas sessoes.
for service in xfce4-screensaver light-locker; do
  printf '[Desktop Entry]\nType=Application\nName=%s\nHidden=true\n' "$service" > "$HOME/.config/autostart/${service}.desktop"
done
# Garante que as regras X11 sejam reaplicadas a cada login.
cat > "$HOME/.config/autostart/enfoque-dev-noidle.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Enfoque Dev - Sem inatividade
Comment=Somente na VM de desenvolvimento, nao em producao
Exec=sh -c "sleep 3; xset s off; xset s noblank; xset -dpms"
OnlyShowIn=XFCE;
Terminal=false
DESKTOP
xset s off
xset s noblank
xset -dpms
if command -v xfce4-screensaver-command >/dev/null 2>&1; then
  xfce4-screensaver-command --exit >/dev/null 2>&1 || true
fi
if command -v light-locker-command >/dev/null 2>&1; then
  light-locker-command --exit >/dev/null 2>&1 || true
fi
echo "Configuracao de inatividade desativada para este usuario na VM de desenvolvimento."
echo "O notebook Windows e os PCs corporativos NAO foram alterados."
echo "Verifique o resultado com: xset q"
