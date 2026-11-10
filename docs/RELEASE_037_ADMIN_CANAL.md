# Enfoque OS 0.2.37 - Administracao via SSH aprovado pela TI

## Intencao
Permitir que a TI execute comandos administrativos/root em cada Enfoque OS
autorizado, sem dar root ao agente da sessao ou ao agente do WebSocket.

O servidor MCP tem um modulo de execucao administrativa:
- Fonte: server/pc-admin-ssh.mjs
- Chaves privadas individuais: /var/lib/enfoque-tunnel/ti-keys/<UUID>
- Chave publica da maquina fixada: /var/lib/enfoque-tunnel/known-hosts/<UUID>
- Registro da aprovacao Zero Touch: /opt/intranet-data/zero-touch-enrollment.json
- Registro de PCs MCP aprovados: /opt/chatgpt-mcp/data/pc-agent/devices.json
- Trilha de auditoria: /var/log/enfoque-pc-admin-audit.jsonl

Nao existem chaves privadas no repositorio Git ou na ISO. O acesso e
condicionado a DUAS autorizacoes separadas: Root MCP e Zero Touch da TI.

## Fluxo
1. O PC instala a ISO e gera sua identidade e chave Ed25519 unica.
2. O PC solicita inscricao Zero Touch. Nao e aprovado automaticamente.
3. Administrador TI verifica o codigo curto ligado a chave publica e
   aprova explicitamente o dispositivo pelo painel de Intranet.
4. O servidor gera um par de chaves SSH exclusivo para aquele PC e a
   conta enfoque-ti, e registra a host key do computador.
5. Na proxima pesquisa do PC, o sistema configura authorized_keys,
   ssh.service em 127.0.0.1 e enfoque-tunnel.service, com tunel
   reverso exclusivo para 127.0.0.1 na VPS.
6. Uma chamada de comando administrativo exige confirmacao explicita
   AUTORIZO_ROOT e ID exato do computador. O servidor confere todas as
   aprovacoes e as duas chaves, e so entao invoca sudo -n no canal SSH.
7. O comando e auditado por ID, horario, status, codigo de saida e
   SHA-256 dos argumentos. Nao registra o conteudo do comando ou segredos.
8. Revogacao Zero Touch remove o acesso, e sessoes revogadas devem ser
   encerradas na VPS conforme o mecanismo ja existente.

## Permissoes
A conta enfoque-ti possui NOPASSWD configurado para administracao, mas:
- Permite SSH apenas por chave Ed25519 aprovada no arquivo root-owned.
- sshd escuta SOMENTE no loopback do PC, sem acesso publico.
- Tunel SSH reverso usa chaves por maquina e so porta loopback permitida.
- O agente de servico segue com DynamicUser, NoNewPrivileges e sem capabilities.
- O agente de sessao continua sem root e precisa de login XFCE.
- Comandos root sao enviados pelo modulo SSH exclusivo no servidor MCP;
  nao sao enviados pelo protocolo comum do agente.

## Atualizacoes e compatibilidade
- A versao 0.2.37 inclui /usr/local/bin/enfoque-admin-status, comando
  nao privilegiado que informa se a conta, as chaves e o tunel estao prontos.
- A ISO e o .deb levam esse diagnostico. O servidor MCP deve ser configurado
  separadamente para usar server/pc-admin-ssh.mjs.
- O zero-touch, o sshd e o tunel ja eram incluidos em 0.2.32; mudar a ISO
  por si so NAO aprova computadores nem faz surgir root automatico.
- Para os tres PCs de Itaipu, o Zero Touch administrativo ainda estava
  pendente quando auditado em 10/11/2026. Aprovacao e indispensavel.
- O pacote .deb assinado exige Timeshift/Snapper configurado nos PCs.
  Se nao houver snapshot, a campanha falha de maneira segura. Nao burlar.
- O pacote nao reinstala GRUB, nao formata, nao altera ID nem CUPS existente.
- O firewall 0.2.36 preserva conexoes de saida e loopback para o tunel.

## Comandos para diagnostico sem expor credenciais
No computador:
  enfoque-admin-status
  systemctl status enfoque-zero-touch.timer --no-pager
  systemctl is-active ssh.service
  systemctl is-active enfoque-tunnel.service
Na VPS, administrador:
  systemctl status chatgpt-mcp --no-pager
  journalctl -u chatgpt-mcp -n 60 --no-pager

O acesso root nunca deve ser habilitado pelo protocolo de comandos
user-session. Proibido instalar chaves privadas no endpoint.
