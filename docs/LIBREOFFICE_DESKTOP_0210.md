# Enfoque OS 0.2.10 - LibreOffice e Desktop enxuto

- Imagem Debian 13 com suíte **LibreOffice** completa (Writer, Calc, Impress, Draw e Math), interface, ajuda e dicionário em português do Brasil, integrada ao XFCE/GTK3.
- Apps instalados **offline já na ISO**, sem precisar baixar na primeira inicialização. Os aplicativos continuam no menu, e não criam atalhos extras na área de trabalho.
- Arquivos DOC/DOCX/ODT abrem por padrão no Writer; XLS/XLSX/ODS no Calc; PPT/PPTX/ODP no Impress. Chrome continua navegador padrão, inclusive PDF.
- etc/skel/Desktop contém **somente Intranet.desktop e SIGE.desktop**. A lixeira é desenhada como ícone virtual do XFCE; ícones de Home, filesystem, dispositivos fixos, removíveis e rede são ocultados.
- A ferramenta de instalação, Enfoque Central, PayGo e Wine continuam disponíveis por pesquisa no menu, sem atalhos no Desktop. A sessão Live não cria atalho de instalação.
- Na atualização de uma instalação anterior, o script de inicialização só remove atalhos **exatos da própria Enfoque** (comparando Exec=), mantendo os documentos e atalhos pessoais do usuário intactos. O Script só roda uma vez nesta revisão.
- Todos os programas administrativos continuam funcionais, inclusive a página de suporte e a funcionalidade de instalar sistema por menu.
- Em computadores com 2 GiB de RAM o LibreOffice pode demorar para iniciar; não desativar zram nem CUPS para economizar memória. Nenhum processo LibreOffice é lançado automaticamente no boot.
- A ISO não contém dados sensíveis PayGo nem credenciais de produção.
