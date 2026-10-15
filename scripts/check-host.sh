#!/usr/bin/env bash
set -euo pipefail
echo '=== Requisitos para compilacao (somente leitura) ==='
if [[ -f /etc/os-release ]]; then . /etc/os-release; echo "Linux: ${PRETTY_NAME:-desconhecido}"; fi
printf 'Arquitetura: '; uname -m
printf 'CPU logicos: '; nproc
printf 'RAM total: '; awk '/MemTotal/ {printf "%.1f GiB\n", $2/1024/1024}' /proc/meminfo
printf 'Espaco livre: '; df -h . | awk 'NR==2 {print $4}'
for program in git lb; do if command -v "$program" >/dev/null 2>&1; then echo "$program: instalado"; else echo "$program: ausente"; fi; done
echo 'Recomendacao: Debian 13 amd64, 4 GB RAM e pelo menos 25 GB livres.'
