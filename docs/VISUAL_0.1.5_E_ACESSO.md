# Enfoque OS 0.1.5 — visual e atalhos

## Aparência inspirada no Windows

- XFCE com painel inferior único de 47 px, menu de aplicativos Whisker e lista de janelas.
- Tema Arc claro, ícones Papirus, tipografia Noto Sans, relógio e área de notificações.
- SVGs autorais para menu Enfoque OS, SIGE e Intranet; não são ícones proprietários da Microsoft.
- Atalhos clicáveis na área de trabalho, sem credenciais incorporadas:
  - SIGE: https://enfoquepapelaria.meusige.com.br/
  - Intranet: https://intranet.enfoquepapelaria.com.br/
- Firefox ESR abre os links em nova janela. A autenticação permanece nos sites respectivos.

## Suporte e telemetria

- Continua disponível o agente de telemetria 0.1.4, que só envia CPU/RAM depois de cadastrado individualmente.
- A ISO não contém agente MeshCentral pré-pareado, tokens ou credenciais compartilhadas.
- O servidor MeshCentral deve receber o agente Linux específico do equipamento após aprovação formal da empresa.
- Acesso remoto completo (tela, teclado, mouse, terminal, arquivos, reboot) **não está homologado ou integrado ao MCP pela ISO 0.1.5**.
- O navegador da intranet deve exigir aprovação explícita do funcionário em cada sessão, e a gestão administrativa deve permanecer separada.
- O ID curto não substitui a autenticação/autorizações do operador. Cada acesso administrativo exige logs e vínculo a uma política da empresa.

## Testes obrigatórios

1. Baixar ISO e SHA256SUMS do GitHub Actions; confirmar integridade.
2. Inicializar em VM de teste; checar painel inferior, apps SVG, os dois atalhos e abertura no Firefox.
3. Conferir wi-fi/rede, locale, ABNT2, login Live, logout e reinicialização, especialmente o kernel panic intermitente identificado na 0.1.3.
4. Testar telemetria somente em dispositivo de laboratório pareado; **não instalar nos PCs das lojas** antes da homologação.
