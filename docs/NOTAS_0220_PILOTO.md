# Enfoque OS 0.2.20 — ISO piloto (compilacao sem teste em VM)

## Escopo incluído nesta imagem

Esta compilação preserva a base Debian 13 XFCE, o AnyDesk, o LibreOffice,
o PayGo piloto e o agente de diagnósticos somente-leitura do Enfoque OS 0.2.19.
O agente de diagnósticos continua usando a autenticação individual corrigida
na versão 0.2.19.

Foram adicionadas bibliotecas **não operacionais** de política e registro
de sessões de suporte, acompanhadas de testes de isolamento de dispositivo,
expiração e revogação.

## Limitação conhecida e importante

**Esta imagem NÃO implementa acesso completo ao terminal do PC pelo servidor.**
Não há servidor SSH nem túnel administrativo provisionado na ISO, e nenhuma
função de controle gráfico próprio foi incluída. O AnyDesk permanece separado.

A liberação do canal administrativo próprio depende da implementação,
inscrição individual dos computadores e testes específicos de segurança.
Não confundir o agente de diagnóstico existente com terminal remoto completo.

## Validação e transferência

- Antes do build: executar scripts/check-project.sh e toda a suíte unitária.
- GitHub Actions: compilar, verificar SHA-256 da ISO, dividir em sete partes de
  350 MiB (última parte menor) e calcular/verificar hash de cada parte.
- Os artefatos do GitHub incluem manifesto SHA256SUMS e SHA256_PARTS.
- A reconstrução exige concatenar chunk-00 a chunk-06 na ordem e conferir
  SHA256SUMS contra o arquivo ISO completo.

**Por solicitação do responsável, não executar testes da ISO na máquina virtual
nesta rodada.** Por isso o build não certifica inicialização, instalação,
funcionamento do sistema em 2 GB RAM ou controle remoto completo.
Não implantar esta imagem em computadores de produção sem validação adicional.
