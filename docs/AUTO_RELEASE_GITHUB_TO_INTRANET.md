# Enfoque OS — publicação GitHub → intranet

## Fluxo sem distribuir para PCs

1. A equipe publica alterações na branch **`release/enfoque-os`** e atualiza `VERSION` em `config/includes.chroot/etc/enfoque-os-release` para uma **nova versão**.
2. O workflow **Build Enfoque OS ISO** verifica os testes, gera a ISO e os pacotes `.deb` correspondentes. Se qualquer etapa falhar, não publica.
3. Depois do build bem-sucedido, a mesma execução cria a GitHub **prerelease**, com partes da ISO, checksums, dois pacotes e `UPDATE_MANIFEST.json`.
4. A VPS verifica o GitHub a cada cerca de 5 minutos. Somente aceita releases da branch `release/enfoque-os` cujo SHA corresponda a um build completo e bem-sucedido. Compara checksums e assinatura, valida os pacotes, e publica o índice APT assinado.
5. A página **Computadores → Atualizações** detecta a nova versão automaticamente, sem reiniciar a intranet e sem disparar nenhuma campanha.

**Importante:** a publicação no servidor e a instalação nos PCs são operações separadas. O agendamento automático da intranet fica **desativado** e o sincronizador bloqueia a promoção se encontrar agendamento ligado ou campanha ativa. Apenas uma ação administrativa explícita cria campanhas.

## Operação

- Instalação na VPS (apenas primeira vez): `sudo bash scripts/install-release-sync.sh`
- Verificação manual sem alterações: `sudo /usr/local/sbin/enfoque-os-release-sync`
- Sincronização imediata (apenas servidor): `sudo /usr/local/sbin/enfoque-os-release-sync --apply`
- Logs: `journalctl -u enfoque-os-release-sync.service --no-pager -n 100`
- Status: `cat /srv/enfoque-os-release-sync/status.json` (após a primeira nova publicação)
- Timer: `systemctl status enfoque-os-release-sync.timer`
- Desativar sincronização: `systemctl disable --now enfoque-os-release-sync.timer`

Não reutilize números de versão em novos pacotes. Faça o incremento `0.2.52 → 0.2.53` (ou superior). Releases da mesma versão são ignoradas por segurança para evitar colisões de conteúdo e inconsistências com o atualizador dos PCs.

A ISO completa é disponibilizada por partes no GitHub. O servidor baixa somente os `.deb` (~tamanho reduzido) e expõe o repositório APT assinado utilizado pela intranet; não precisa copiar a ISO de vários gigabytes à VPS.

O script de sincronização mantém a publicação fail-closed: erros de rede, checksums, incongruência de branch/commit, build incompleto, campanha ativa ou agendamento automático ligado impedem a promoção. Não utiliza tokens do GitHub e não executa comandos nos computadores.
