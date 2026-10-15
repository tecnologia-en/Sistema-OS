# Enfoque OS 0.1.6: Chrome, Enfoque Central e impressoras

## Experiencia de usuario
- Google Chrome Stable oficial, instalado na compilacao pelo pacote .deb de https://dl.google.com/linux/direct/
- O Chrome substitui o Firefox: atalho SIGE, Intranet, painel inferior, menu e navegador padrao.
- Enfoque Central abre automaticamente na sessao XFCE e pode ser reaberto pelo menu ou atalho.
- Painel USB monitora /sys/bus/usb/devices a cada 2 segundos. Mostra portas logicas vazias e ocupadas, categoria, fabricante, produto e VID:PID. Reconhece perifericos novos mesmo que nao constem em lista previa.
- O catalogo de apps usa Gio.AppInfo em tempo real: novos aplicativos nao precisam ser mapeados para aparecer.
- O status de CPU/RAM e de filas de impressao e mostrado localmente.

## Impressao
- CUPS, cups-filters, cups-browsed, ipp-usb, Avahi e assistente grafico system-config-printer.
- Drivers genericos Gutenprint e ESC/PR, para impressoras compativeis. Muitos modelos modernos suportam IPP Everywhere / USB automaticamente.
- **Bematech** e outras impressoras termicas fiscais nao possuem driver generico universal assegurado: cada modelo, modo ESC/POS e ligacao USB/serial devem ser homologados. A deteccao do VID/PID nao equivale a funcionamento no SIGE/PDV.
- O aplicativo nunca instala software de origem desconhecida automaticamente.

## Controle completo / usuarios / seguranca
- Acesso administrativo *nao assistido* (tela inteira, teclado, mouse, arquivos, terminal e reinicio) deve utilizar **agente oficial MeshCentral** instalado apos autorizacao da empresa para cada equipamento, por operador TI autorizado.
- O sistema inclui somente um assistente de pareamento: instalar agente Linux fornecido por TI, validar checksum e confirmar a politica de inscricao. A ISO **nao** distribui tokens ou agente preinscrito.
- O servidor MeshCentral deve impor autenticacao, menor privilegio, trilha de auditoria e revogacao. O ID curto e apenas identificacao e nao concede acesso.
- O canal de suporte do site da intranet exige consentimento do usuario em cada sessao e nao deve compartilhar permissoes de sessao do administrador.
- O desktop inteiro do sistema esta disponivel para a tecnologia de captura remota, inclusive programas instalados depois. Essa capacidade nao depende de mapear aplicativos um a um.
- **O controle remoto completo ainda precisa de ensaio de ponta a ponta**: agente instalado e inscrito, grupo de dispositivos autorizado, captura, controle, arquivos e terminal com conta TI e politica de auditoria verificadas.
- Na ISO Live os registros de agentes e configuracoes pessoais podem ser perdidos ao reiniciar. Nao instalar nas lojas enquanto nao houver um fluxo persistente homologado.
- Windows e Linux usam abordagens diferentes: nem todos os dispositivos antigos aceitam autoinstalacao e nem todo programa do Windows roda nativamente.

## Testes de homologacao
1. Confirmar ISO, SHA256SUMS e inicializacao na VM com 4 GB; verificar ausencia de kernel panic.
2. Verificar instalacao, abertura e associacoes do Chrome; os atalhos SIGE e Intranet devem abrir corretamente.
3. No hub, conectar/desconectar USB e checar classificacao, porta logica e iconografia.
4. Testar Bematech por **modelo** e modelo de impressao (CUPS / USB / serial) antes de usar no PDV.
5. Registrar um PC piloto administrado, verificar acesso remoto real e logs; separadamente testar pedido de consentimento para suporte web.
