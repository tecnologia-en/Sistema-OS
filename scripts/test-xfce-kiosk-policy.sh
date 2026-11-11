#!/usr/bin/env bash
set -euo pipefail
# Runs exclusively in a disposable Debian 13 root container.
if (( EUID != 0 )); then echo 'Run only in isolated root test container' >&2; exit 2; fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test -s "$ROOT/config/includes.chroot/etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml"
if ! command -v xfconf-query >/dev/null || ! command -v dbus-run-session >/dev/null; then
  echo 'Install xfconf dbus-x11 first (only in test container)' >&2
  exit 3
fi
mkdir -p /etc/xdg/xfce4
cp -a "$ROOT/config/includes.chroot/etc/xdg/xfce4/." /etc/xdg/xfce4/
useradd -m -s /bin/sh funcionario
mkdir -p /home/funcionario/.config/xfce4/xfconf/xfce-perchannel-xml
cp "$ROOT/config/includes.chroot/etc/skel/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml" \
 /home/funcionario/.config/xfce4/xfconf/xfce-perchannel-xml/
sed -i 's/enfoque-menu.desktop/logo-alterada.desktop/g' \
 /home/funcionario/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml
chown -R funcionario:funcionario /home/funcionario/.config
cat > /tmp/enfoque-xfce046-user.sh <<'SESSION'
#!/bin/sh
set -eu
export XDG_CONFIG_DIRS=/etc/xdg
command -v xfconf-query
echo USER_PANEL_SIZE
xfconf-query -c xfce4-panel -p /panels/panel-1/size
echo USER_LAUNCHER_NAME
xfconf-query -c xfce4-panel -p /plugins/plugin-1/items
test "$(xfconf-query -c xfce4-panel -p /panels/panel-1/size)" = 54
xfconf-query -c xfce4-panel -p /plugins/plugin-1/items | grep -q 'enfoque-menu.desktop'
if xfconf-query -c xfce4-panel -p /panels/panel-1/size -s 67 2>/tmp/enfoque-panel-denied; then
  echo 'USER_WRITE_RETURNED_SUCCESS_BUT_CHECK_VALUE'
fi
echo AFTER_USER_WRITE
xfconf-query -c xfce4-panel -p /panels/panel-1/size
grep -Ei 'locked|not allowed|denied|not writable|permitted|unavailable|pode|permission' /tmp/enfoque-panel-denied || cat /tmp/enfoque-panel-denied
test "$(xfconf-query -c xfce4-panel -p /panels/panel-1/size)" = 54
if xfconf-query -c xsettings -p /Net/IconThemeName -s EvilTheme 2>/tmp/enfoque-theme-denied; then
  echo 'USER_THEME_WRITE_ACCEPTED_BUT_CHECK_VALUE'
fi
test "$(xfconf-query -c xsettings -p /Net/IconThemeName)" = EnfoqueFluent
/tmp/enfoque-xfce-kiosk-probe
echo XFCE_LOCKDOWN_USER_TEST_OK
SESSION
chmod 755 /tmp/enfoque-xfce046-user.sh
su - funcionario -s /bin/sh -c 'dbus-run-session -- /tmp/enfoque-xfce046-user.sh'
echo XFCE_LOCKDOWN_SMOKE_PASSED
