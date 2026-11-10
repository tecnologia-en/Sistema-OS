# Enfoque OS 0.2.41 - tela e controle X11 sob demanda

Data: 10/11/2026. Piloto: NOTE-ITAIPU (atualmente 0.2.40).

## O que foi implementado

A imagem e as coordenadas do desktop XFCE ficam disponiveis APENAS quando
a Central de TI ou uma ferramenta MCP remota autorizada solicita o acesso:

- `pc_screenshot`: captura UMA imagem JPEG inline da sessao X11.
- `pc_gui`: recebe as operacoes screen_size, cursor, move, click,
  double_click, mouse_down, mouse_up, scroll, type, key e hotkey.
- Na Intranet, a API `/api/remote-access/visual` estabelece uma sessao
  exclusiva autenticada, mostra a imagem sequencialmente e envia os eventos
  de ponteiro e teclado com coordenadas nativas do monitor.
- Nao ha transmissao, screen recording, polling de pixels ou servidor
  TCP adicional no computador quando nao ha solicitacao.
- O JPEG e redimensionado/adaptado a no maximo 42 KB, em memoria.
  Este MVP usa quadros JPEG sucessivos (nao video H.264/WebRTC).
  A fluidez real depende da rede e da fila WebSocket do MCP.
- Cliente autentica no PC Control ja existente, com credencial individual.
  Zero Touch exige aprovacao TI (separada da aprovacao do agente comum)
  para usar o visualizador pelo navegador.
- O usuario grafico e a conta XFCE logada; o agente e isolado por
  socket Unix SO_PEERCRED, grupo, UID e sessao logind. Nao concede root
  nem abre o display root. O servidor nao envia senha sudo no navegador.
- O site exige administrador TI com permissao remote_access, cookie
  da Intranet e cabecalho de acao; a sessao expira depois de 60 segundos
  sem pedidos, termina obrigatoriamente em 2h e e exclusiva por PC.
- Logs auditam PC, operador, horario e nome da operacao, nunca a imagem,
  o texto digitado, o conteudo de telas ou teclas. Nao ha armazenamento
  de JPEG no servidor.
- O desktop mostra notificacao TI ao iniciar uma captura (anti-spam).
- Nao suporta tela Wayland, sessao sem login, desktop Windows ou tela
  de login LightDM nessa primeira etapa. Requer XFCE X11 logado.
- O controle por coordenadas assume 1 display virtual X11; multimonitor
  fica limitado ao framebuffer virtual (sem selecao individual).

## Componentes

Cliente incluído no .deb assinado e na ISO:
  /usr/local/lib/enfoque-session/visual.py
  /usr/local/bin/enfoque-session-agent
  /usr/local/bin/enfoque-remote-agent
  /usr/local/lib/enfoque-session/bridge.py
  Dependencia adicional: xdotool (ISO e pacote APT).

Servidor da Intranet:
  server/visual-session-routes.mjs
  server/intranet-visual.js (copia para assets/enfoque-visual.js)
  Hook de instalacao em server.js apos o Zero Touch, protegendo todas rotas.
  Botao "Ver tela / controlar" para equipamentos Zero Touch aprovados
  em acesso-remoto.html -> Central de Computadores.

Endpoints para um programa de TI autenticado:

- POST /api/remote-access/visual/start
  { "deviceId": "enfoqueos-<uuid>" } -> { "ok": true, "token": ... }
- POST /api/remote-access/visual/frame
  { "token": ... } -> JPEG base64 e `screenWidth,screenHeight`.
- POST /api/remote-access/visual/input
  { "token": ..., "event": { "op":"move","x":250,"y":150 } }
  ou { "op":"click","x":250,"y":150,"button":"left" }
  ou { "op":"type","text":"texto" }
- POST /api/remote-access/visual/stop
  { "token": ... }

Todos os endpoints exigem sessao autenticada de usuario TI admin,
permissao remote_access, cabeçalho:
  X-Enfoque-TI-Action: visual-remote
e mesmo site/Origin. Tokens de sessao permanecem apenas no processo
de API e expiracao; nao usar em URLs, historico ou logs.

## Fluxo de atualizacao do notebook

1. Validar release no GitHub (suite e build ISO).
2. Publicar pacote APT em repositorio assinado, verificar InRelease e SHA256.
3. No NOTE-ITAIPU, conferir snapshot Timeshift antigo, status root e rede.
4. Fazer upgrade pelo APT sem reiniciar o sistema nem fechar XFCE.
5. Reiniciar agente de sessao XFCE em segundo plano (nao fechar login).
   O agente de rede reinicia automaticamente pelo postinst; aguardar reconexao.
6. Validar `pc_gui screen_size` e `pc_screenshot` via MCP, diagnosticar
   uma imagem JPEG real, mover mouse e testar entrada numa janela segura.
7. Validar Intranet visual session, uma imagem, input e encerramento.
8. Conferir que a sessao de usuario e o tunel SSH permanecem ativos.

Nao atualizar Caixa 1 ou Caixa 3 de Itaipu neste piloto. Em caso de falha,
nao reiniciar sem consentimento operacional.

## Verificacoes no repositorio

  python3 -m unittest discover -s test -p 'test_*.py'
  node --test test/*.test.mjs
  bash scripts/check-project.sh
  git diff --check

A aprovacao dos testes nao substitui teste visual e de usabilidade no hardware.
