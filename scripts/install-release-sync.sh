#!/usr/bin/env bash
# VPS-only deployment. Never dispatches updates to workstations.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if (( EUID != 0 )); then echo 'Execute como root na VPS' >&2; exit 1; fi
command -v dpkg-deb >/dev/null
command -v gpgv >/dev/null
command -v apt-ftparchive >/dev/null
[[ -f /var/lib/enfoque-update/archive-keyring.gpg ]]
[[ -f /opt/intranet-data/computadores-atualizacoes/schedule.json ]]
[[ -f /opt/intranet-data/computadores-atualizacoes/state.json ]]
install -d -m 0755 /usr/local/libexec/enfoque-os-release-sync
install -m 0755 "$ROOT/scripts/sync-github-release.py" /usr/local/sbin/enfoque-os-release-sync
install -m 0755 "$ROOT/scripts/publish-update-repo.sh" /usr/local/libexec/enfoque-os-release-sync/publish-update-repo.sh
install -m 0644 "$ROOT/scripts/systemd/enfoque-os-release-sync.service" /etc/systemd/system/
install -m 0644 "$ROOT/scripts/systemd/enfoque-os-release-sync.timer" /etc/systemd/system/
install -d -m 0700 /srv/enfoque-os-release-sync
systemctl daemon-reload
/usr/local/sbin/enfoque-os-release-sync
systemctl enable --now enfoque-os-release-sync.timer
echo 'Enfoque release sync enabled; fleet update scheduler remains unchanged.'
