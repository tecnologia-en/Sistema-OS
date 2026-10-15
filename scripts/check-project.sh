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
for pkg in locales console-setup keyboard-configuration firefox-esr-l10n-pt-br tzdata; do
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
echo 'Estrutura valida. A ISO deve ser compilada e testada em VM.'
