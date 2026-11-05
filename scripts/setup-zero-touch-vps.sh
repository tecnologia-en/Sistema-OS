#!/usr/bin/env bash
# One-time, reviewed VPS setup for Enfoque OS reverse SSH per-device tunnels.
# Existing administrator SSH access remains unchanged. No public reverse ports.
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  echo "Execute como root na VPS" >&2
  exit 2
fi
ROOT=/var/lib/enfoque-tunnel
CONF=/etc/ssh/sshd_config
START='# BEGIN ENFOQUE ZERO TOUCH RESTRICTED TUNNELS'
END='# END ENFOQUE ZERO TOUCH RESTRICTED TUNNELS'
if ! id enfoque-tunnel >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent \
    --shell /usr/sbin/nologin enfoque-tunnel
fi
install -d -o root -g root -m 0755 "$ROOT"
install -d -o root -g root -m 0700 "$ROOT/ti-keys" "$ROOT/known-hosts"
if [[ ! -e "$ROOT/authorized_keys" ]]; then
  install -o root -g root -m 0644 /dev/null "$ROOT/authorized_keys"
fi
chmod 0644 "$ROOT/authorized_keys"
if grep -Fq "$START" "$CONF"; then
  test "$(grep -Fc "$START" "$CONF")" -eq 1
  test "$(grep -Fc "$END" "$CONF")" -eq 1
else
  cp -a "$CONF" "$CONF.enfoque-zero-touch.bak"
  cat >> "$CONF" <<'EOF'

# BEGIN ENFOQUE ZERO TOUCH RESTRICTED TUNNELS
Match User enfoque-tunnel
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PubkeyAuthentication yes
    AuthorizedKeysFile /var/lib/enfoque-tunnel/authorized_keys
    AllowTcpForwarding remote
    GatewayPorts no
    PermitOpen none
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    PermitUserRC no
    MaxSessions 0
    ForceCommand /bin/false
# END ENFOQUE ZERO TOUCH RESTRICTED TUNNELS
EOF
fi
if ! /usr/sbin/sshd -t; then
  cp -a "$CONF.enfoque-zero-touch.bak" "$CONF"
  echo "Configuracao SSH invalida; revertida" >&2
  exit 1
fi
effective="$(/usr/sbin/sshd -T -C user=enfoque-tunnel,host=localhost,addr=127.0.0.1)"
for expected in 'passwordauthentication no' 'allowtcpforwarding remote' 'gatewayports no' 'maxsessions 0' 'permittty no'; do
  if ! grep -Fxq "$expected" <<< "$effective"; then
    echo "SSH nao aplicou a politica: $expected" >&2
    exit 1
  fi
done
systemctl reload ssh.service
echo "ENFOQUE_TUNNEL_VPS_READY: porta SSH existente, usuarios restritos"
