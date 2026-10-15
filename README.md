# Enfoque OS

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

Documentacao: [Windows e GitHub](docs/BUILD_WINDOWS_GITHUB.md), [testes](docs/TESTES_PILOTO.md), [relatorio 0.1.2](docs/TESTE_2026-10-15_0.1.2.md), [relatorio 0.1.1](docs/TESTE_2026-10-15_0.1.1.md), [arquitetura](docs/ARQUITETURA.md), [continuidade](docs/SEGURANCA_E_CONTINUIDADE.md).

**Nao existem nesta fase:** instalador de disco validado, controle central de usuarios, inventario corporativo, atualizacao remota, politica de bloqueios, controle de tela e automacoes ChatGPT. O SIGE e periféricos ainda nao foram testados.

**Seguranca:** repositorio publico; jamais adicionar tokens, senhas, certificados, dados internos ou informacoes pessoais. As alteracoes de seguranca requerem testes e autorizacao da empresa.
