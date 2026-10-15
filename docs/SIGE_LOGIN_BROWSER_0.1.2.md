# SIGE - smoke test de navegador (Enfoque OS 0.1.2)

Data: 15/10/2026. Ambiente: VM VirtualBox 2 GB, Debian 13 Live 0.1.2, Firefox ESR, NAT.

## Escopo realizado

- O Firefox abriu a URL institucional do SIGE, seguiu o redirecionamento e renderizou a tela de login do Meu SIGE Enfoque.
- Campos de usuario/senha e botao de acesso visiveis; scripts e estilos carregaram visualmente.
- Um teste `curl -I` sem navegador recebeu HTTP 403 com intermediario de protecao do SIGE; este resultado por si so **nao demonstra incompatibilidade do Firefox**. O navegador exibiu o formulario normalmente.
- **Nenhum login, credencial, pagamento, nota, venda ou outra transacao executada.**

## O que NAO foi validado

- Fluxos autenticados de consulta ou edicao e sessoes de trabalho longas.
- Impressao fiscal/nao fiscal, leitores, balancas, TEF, certificados e periféricos.
- Desempenho com multiplas abas, HD fisico ou hardware da loja.
- Compatibilidade de funcionalidades que dependam de plugins, drivers ou software de Windows.

Conclusao: **acesso inicial pelo Firefox aprovado** na 0.1.2; compatibilidade operacional com SIGE ainda pendente. Nao usar nos PCs de producao.
