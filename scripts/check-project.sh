#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for script in "$ROOT"/scripts/*.sh; do bash -n "$script"; echo "OK bash: $(basename "$script")"; done
sh -n "$ROOT/config/includes.chroot/usr/local/bin/enfoque-diagnostico"
for f in "$ROOT/config/package-lists/enfoque-base.list.chroot" "$ROOT/config/includes.chroot/etc/apt/apt.conf.d/90enfoque-piloto" "$ROOT/config/includes.chroot/etc/enfoque-os-release" "$ROOT/config/includes.binary/LEIA-ME.txt"; do
  test -s "$f" || { echo "Arquivo ausente ou vazio: $f" >&2; exit 1; }
  echo "OK arquivo: ${f#"$ROOT"/}"
done
echo 'Estrutura valida. Ainda falta compilar e testar a ISO.'
