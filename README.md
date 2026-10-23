# Enfoque OS

**Manual operacional completo:** [Acesso ao notebook, GitHub, build, transferência da ISO e testes no VirtualBox](docs/MANUAL_OPERACIONAL.md).

Distribuicao Linux corporativa **experimental**, baseada em Debian 13 (Trixie) e XFCE.

A imagem Live **0.1.2** foi compilada pelo GitHub Actions e testada em VM com 2 GB de RAM. Boot, XFCE, Firefox/HTTPS, rede, diagnostico, teclado ABNT2, locale pt_BR, fuso de Sao Paulo e reboot foram aprovados. **Ainda nao esta homologada para instalacao em PCs da empresa.**

## Fluxo oficial Windows + GitHub

1. Codigo-fonte mantido em https://github.com/tecnologia-en/Sistema-OS
2. Pasta de trabalho no Windows: Area de Trabalho / OS da enfoque
3. Atualize via `git pull --ff-only`, sem precisar entrar no Debian.
4. GitHub Actions executa o Linux Live Build na nuvem quando arquivos da ISO mudam; tambem pode ser acionado manualmente.
5. Depois de um build bem-sucedido, baixe a ISO e o SHA256SUMS da aba **Actions**, guarde-os em `dist/` e teste na VM Enfoque OS - Teste.

A antiga VM Enfoque OS - Dev fica reservada como contingencia; o fluxo Windows + GitHub Actions + VM de teste foi comprovado com a ISO 0.1.2.

## Versoes

- 0.1: ISO Live gerada, mas usuario Live ausente.
- 0.1.1: usuario Live corrigido; testado com 2 GB; locale/teclado/horario pendentes.
- 0.1.2: ISO compilada no GitHub Actions e testada em VM de 2 GB; pt_BR, ABNT2, horario de Sao Paulo, versao interna, Firefox e reboot aprovados. **Somente piloto Live.**
- 0.1.3: ISO compilada e testada em VM de 2 GB; boot automatico BIOS/UEFI, identidade visual, Firefox e NTP aprovados. **Em observacao por um kernel panic intermitente; nao homologada.**
- 0.1.4: cliente de telemetria autenticada de CPU/RAM incluido no piloto, com pareamento individual obrigatorio e sem tokens na ISO. **Pendente de teste na VM; nao homologada.**
- 0.1.6: testada de verdade em VM: Chrome, CUPS, Enfoque Central com 12 portas USB virtuais e telemetria autenticada da VM ID #101 ativa na intranet; detectado bug de tela preta na troca de VT do LightDM. **Piloto, nao homologado.**
- 0.1.7: troca automatica do terminal grafico Xorg no modo Live, dependencias explicitas de LightDM/D-Bus e drivers de compatibilidade, identidade visual e telemetria com versao da ISO atualizada. **Necessita novo build e teste na VM.**
- 0.1.8: inclui capturador de tela X11 com JPEG autenticado e assistente de inscricao individual (ambos desabilitados ate pareamento). Testado como prototipo na VM #101, mas a nova ISO e o canal de controle administrativo completo ainda requerem homologacao.

Documentacao: [Windows e GitHub](docs/BUILD_WINDOWS_GITHUB.md), [testes](docs/TESTES_PILOTO.md), [relatorio 0.1.3](docs/TESTE_2026-10-15_0.1.3.md), [relatorio 0.1.2](docs/TESTE_2026-10-15_0.1.2.md), [relatorio 0.1.1](docs/TESTE_2026-10-15_0.1.1.md), [arquitetura](docs/ARQUITETURA.md), [continuidade](docs/SEGURANCA_E_CONTINUIDADE.md).

**Ainda pendentes nesta fase:** instalador de disco validado, distribuicao de agentes e pareamento homologados, controle remoto de tela, atualizacao remota e automacoes ChatGPT. A telemetria 0.1.4 apenas reporta CPU/RAM depois do pareamento. O SIGE e periféricos ainda nao foram testados.

**Seguranca:** repositorio publico; jamais adicionar tokens, senhas, certificados, dados internos ou informacoes pessoais. As alteracoes de seguranca requerem testes e autorizacao da empresa.

- 0.2.0: o assistente de inscricao baixa o MeshAgent diretamente do servidor, somente apos autenticacao com identidade individual do dispositivo. Controle remoto via MeshCentral e modulo Telas da intranet requerem autorizacao da TI; validar primeiro na VM.

- 0.2.1: nova ISO compilada e validada em VM VirtualBox Live de 2 GB; XFCE iniciou sem a alternancia manual do terminal grafico, embora o boot ainda tenha atraso; Chrome e Enfoque Central conferidos no laboratorio.
- 0.2.2: corrigida estrutura XML do painel XFCE; barra inferior fixa de largura total com atalhos independentes Chrome, SIGE e Intranet. Icones vindos dos favicons reais: Intranet em SVG, SIGE em ICO/PNG incorporado em SVG. Pendente de teste em VM.

Teste detalhado: [0.2.1 e plano 0.2.2](docs/TESTE_2026-10-16_0.2.1_E_PLANO_0.2.2.md).

- 0.2.3: Google Chrome configurado como navegador padrao XDG e Debian no primeiro login do XFCE (HTTP, HTTPS, HTML, XHTML, PDF), preservando mudancas posteriores feitas pelo usuario. Correcoes de icones SVG com librsvg2-common e PNG derivado do favicon oficial da Intranet. Testada em VM Live de 2 GB, com dois boots sem troca manual de VT, Chrome reconhecido como navegador padrao no primeiro login e apos reinicio, e atalhos SVG/PNG visiveis. Ainda nao homologada para lojas.

QA 0.2.2: [teste real e pendencias](docs/TESTE_2026-10-16_0.2.2.md).

QA 0.2.3: [dois boots e navegador padrao no laboratorio](docs/TESTE_2026-10-16_0.2.3.md).

- 0.2.4: interface renovada com wallpaper da marca, barra inferior com data/hora, controle real de volume, indicador NetworkManager de rede/Wi-Fi, menu didatico, SVGs dos aplicativos internos e atalho do SIGE para /sistema. [Detalhes](docs/GUI_0.2.4.md).

- 0.2.5: login persistente com usuario e senha no instalador Debian (Calamares) e seletor de empresa no primeiro login, tela LightDM exigindo senha nos proximos acessos; correcoes finais de data e contraste na interface.

- 0.2.7 (piloto): Wine 32/64 bits e PayGo Windows sem Warsaw incorporados; atalhos PayGo e Compatibilidade Windows na area de trabalho. Compatibilidade efetiva ainda nao foi testada. [Documentacao](docs/PAYGO_WINE_PILOTO.md).
