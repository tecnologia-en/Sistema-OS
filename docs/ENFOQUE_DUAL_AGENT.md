# Enfoque OS — controle de computadores com dois agentes (candidato)

## O problema encontrado

O agente antigo \`enfoque-remote-agent\` executava só diagnósticos de leitura
(\`free\`, \`df\`, \`ps\`, etc.) e negava abertura de programas/terminal. O serviço
usava \`DynamicUser=yes\` e \`ProtectHome=yes\`, sem \`DISPLAY\`, \`XDG_RUNTIME_DIR\`
e \`DBUS_SESSION_BUS_ADDRESS\` da sessão real. Por isso o aparelho aparecia
no servidor mas comandos gráficos não funcionavam.

## Arquitetura implementada (pré-aprovação)

\`\`\`
ChatGPT  |  painel Intranet autenticado  |  operador TI
                   |
                Root MCP
      (cadastro/approval/token e RBAC futuro)
                   |
            HTTPS/WSS de SAÍDA
                   |
         agente de serviço Linux
       DynamicUser, sem root, sem GUI
          /usr/local/bin/enfoque-remote-agent
                   |
         Unix IPC (local, mode 0660)
       /run/enfoque-remote/session-<uid>.sock
                   |
     agente da sessão (autostart XFCE)
      como usuario instalado e logado
                   |
      bash/exec/xdg-open/Thunar/Mousepad
\`\`\`

O serviço recebe o comando remoto somente depois da aprovação do dispositivo
pelo MCP, encaminha pelo socket e devolve o resultado. Nunca distribui
credencial da VPS para o usuário, não abre portas no computador e não executa
o terminal como \`root\`.

## Capacidades implementadas

- Terminal remoto como usuário gráfico (\`shell\`, via \`bash -lc\`).
- Execução de programas e captura limitada de saída e erro (\`run\`).
- Abrir PDF, arquivo, URL ou programa gráfico (\`open\` via \`xdg-open\`, Thunar
  ou executável local), com \`DISPLAY\` e D-Bus herdados do XFCE.
- Processos do usuário: listar e solicitar encerramento dos seus PIDs.
- Sem login gráfico: agente de serviço mantém os diagnósticos de leitura
  (\`scope=diagnostic\`); abertura de janela falha de maneira compreensível.
- Contas de quiosque/caixa não recebem terminal \`shell\` ou \`run\`.
- WSS autenticado com TLS validado (sem \`ws://\`), queda para polling HTTP
  autorizado se o WebSocket estiver indisponível.
- Socket valida UID do mesmo usuário ou cgroup do serviço remoto (ou root); grupo POSIX sozinho não concede acesso cruzado a outros usuários.
- Auditoria local: ID do comando, nome da ação, contexto e êxito no serviço;
  eventos por tipo no usuário. Não registrar token, scripts ou saída sensível.
- Limites de execução: 90 s, 12 KiB stdout, 3 KiB stderr, quatro clientes
  locais simultâneos, processos encerrados pelo grupo em timeout.
- Notificação visível para operações de terminal/programa na sessão.

## Integração com ChatGPT atual

Após construir a ISO, instalar no dispositivo piloto, aprovar a identidade
única e confirmar a conexão:
- \`pc_status\` lista o dispositivo aprovado.
- \`pc_run\` com \`program: "/usr/bin/id"\` e \`args: ["-un"]\` valida o usuário.
- \`pc_run\` com \`program: "/bin/bash"\`, \`args: ["-lc", "comando"]\`
  abre terminal do usuário (sem elevar permissões).
- \`pc_open\` com \`app:"default", target:"/home/enfoque/arquivo.pdf"\`
  abre o arquivo na sessão XFCE realmente logada.
- \`pc_process(op:"list")\` lista processos da sessão quando disponível.

As ferramentas MCP atuais já são capazes de transportar essas ações. Sua
descrição menciona Windows em alguns casos; para Linux, prefira \`pc_run\`
e \`pc_open\` com argumentos explícitos. O controle gráfico por mouse/teclado
e screenshot não é parte desta fase.

## Integração com Intranet/servidor: bloqueador para produção

A rota local \`/internal/pc-control\` do MCP atual confia apenas em localhost.
Está incluído, EM SEPARADO, um patch de autenticação em
\`server/chatgpt-mcp-internal-control.patch\`; ele NÃO foi aplicado ao VPS.
É necessário primeiro configurar segredo exclusivo no backend, RBAC por operador,
loja e dispositivo, e auditoria vinculada ao operador real. Não publicar o
terminal completo a clientes sem essas garantias.

## O que ainda NÃO está pronto

- Terminal \`root\` irrestrito e execução de comandos privilegiados sem login.
  Essa parte deve aproveitar o túnel SSH autenticado com chaves de TI ou
  manutenção por tarefas permitidas, com autorização por operador.
- Aplicação por lotes no servidor e workflow oficial de aprovação.
- Acesso por tela/teclado; continuam opcionais via AnyDesk/MeshCentral.
- Suporte Wayland (o Enfoque OS piloto usa XFCE/X11).
- Teste físico em dispositivo Enfoque OS instalado (computadores Linux
  antigos estavam offline neste momento).
- Identidade do operador final nos eventos de comando MCP; o agente conhece
  o ID do PC, mas a autorização humana deve ser auditada no servidor.

## Validação feita em 08/11/2026

1. Laboratório Debian 13/XFCE em contêiner isolado; socket criado
   automaticamente no login (usuário 1000, grupo \`enfoque-remote\`).
2. Teste cruzado de UID 1001:987 para usuário 1000: \`shell\`, \`run\`,
   \`open\`, \`process\`, \`status\` respondendo.
3. Relay HTTP localhost que imita cadastro aprovado e valida ID + token:
   \`shell\` e \`open\` de ponta a ponta aprovados.
4. WSS TLS com certificado de teste explicitamente confiado só no teste:
   comando entregue, programa Mousepad iniciado e janela confirmada via X11.
5. Certificado normal é verificado pelo Python \`ssl\`, e \`ws://\` é recusado.
6. Execução com stdout limitado e encerramento de comando excedendo timeout
   passam sem alterar dados ou serviços do host.
7. Testes do repositório mesclado com candidata: **203/203 aprovados** depois
   de atualizar expectativas dos testes visuais antigos.

GitHub de origem permanece em \`d2bbd4e\`; nenhuma ISO foi criada ou publicada.

## Próximo piloto real

1. Aplicar patch do servidor e implementar autorização por operador/loja.
2. Revisar o pacote candidato e subir GitHub sem iniciar build até aprovação.
3. Criar ISO piloto de teste e instalar em disco descartável.
4. No computador piloto, revisar \`loginctl list-sessions\`,
   \`systemctl status enfoque-remote-agent\`, e
   \`ls -l /run/enfoque-remote\`.
5. Testar CLI e abertura de PDF via \`pc_run\` e \`pc_open\`; confirmar
   \`enfoque\` como usuário de execução, nunca \`root\`.
6. Verificar reinicialização, logout, modo quiosque e retorno por polling sem WSS.
7. Só então homologar para caixas e outras lojas, com restauração pronta.
