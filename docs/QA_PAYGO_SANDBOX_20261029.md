# Enfoque OS 0.2.8 - QA PayGo / ControlPay (29/10/2026)

## Escopo e limites

- VM em uso: Enfoque OS - Teste, PayGo Windows 5.1.50.924 no ambiente Demonstracao.
- Terminal logico 7057, fisico 7636, GERTEC PPC930 USB 1753:c902, COM8 -> /dev/ttyPPC930 -> /dev/ttyACM0.
- VM ISO 0.2.8 QA mantida em estado salvo. A ISO nao possui ativacao.
- A ferramenta remota BLOQUEOU o comando que criaria um Pix de R$ 1,00 antes da execucao. A consulta posterior retornou EXISTING_INTENTS [].
- Nenhuma venda nova foi criada, nem chave ou banco PayGo copiados ao repositorio.
- IMPORTANTE: a extensao SIGE atual se refere a outro terminal, 6928/7525. Nao usar a extensao para validar a VM 7057/7636.

## Evidencia real obtida sem venda nova

- Servico enfoque-tef-sandbox-028.service ativo, NRestarts=0.
- Health do TEF integro. Kernel reconhece USB GERTEC PPC930 1753:c902 e driver cdc_acm.
- Nove chamadas PW_iPPCommTest constam no log do proprio PayGo, todas com PWRET_OK. Ultima as 19:09:56 de 29/10. Sao testes anteriores, nao uma nova comunicacao executada agora.
- Preflight confirma Demonstracao, porta COM8, pinpad reconhecido e zero intencoes pendentes.
- Consulta de intencoes historicas com status HTTP 200:
  - 174696 debito R$ 1,00: status 10 Creditado, pagamento externo 15 Finalizado, autorizacao presente.
  - 174697 credito R$ 1,00: status 25 Recusado, externo 15 Finalizado.
  - 174698 credito R$ 1,00: status 25 Recusado, externo 15 Finalizado.
  - 174699 credito R$ 1,00: status 25 Recusado, externo 15 Finalizado.
- Respostas sanitizadas de GetById vieram com terminal_id null. Este campo, isoladamente, NAO prova a associacao da venda ao terminal; a identificacao da VM e feita separadamente pelo preflight.

## Matriz de testes

| Cenario | Evidencia no PIN-pad/ControlPay | Replay offline | Pendencia |
| --- | --- | --- | --- |
| Debito aprovado | Confirmado historico 174696 | PASS | Nao foi criada nova venda |
| Credito recusado | Confirmado historico 174697-174699 | PASS | Investigar motivo da recusa |
| Credito aprovado | Nao comprovado | PASS simulado | Executar na DEMO |
| Pix aprovado automaticamente | Nao executado, comando bloqueado | PASS simulado | Executar na DEMO |
| Cancelamento de aprovacao anterior | Nao executado | PASS simulado | Exige credencial tecnica |
| Cancelamento em processamento | Nao observado | PASS simulado | Monitorar ate status 20 |
| Expiracao real (status 15) | Nao observado | PASS simulado | Teste isolado |
| Timeout HTTP local | Nao provocado na VM | PASS simulado | Nao assumir expiracao |
| Falha de rede | Nao provocada na VM | PASS simulado | Nao repetir Venda/Vender |
| Troca de terminal | Detectada na integracao SIGE | PASS bloqueio de ID | Isolar 6928 e 7057 |
| Terminal ID ausente | Observado em GetById | PASS marcado incerto | Cruzar por filtro |
| USB e integridade | PASS nao financeiro | N/A | Testar apos novo boot |

## Implementacao de regressao

- scripts/paygo_sandbox_monitor.py: analisa JSON ja sanitizado apenas. Nao tem HTTP, Wine, USB ou criacao/cancelamento de vendas.
- test/test_paygo_sandbox_monitor.py: exercita aprovacao, recusa, expiracao, cancelamento, timeout local, erro de rede, dados incorretos, duplicacao de consulta, integridade de ID e terminal.
- scripts/check-project.sh: inclui a suite offline para evitar regressoes futuras.

**Regra central**: timeout do cliente nao prova que ControlPay expirou a operacao. Status 15 retornado pelo provedor e diferente de timeout HTTP. Nunca criar uma segunda venda ate esclarecer a primeira. No cancelamento, status 10 ainda representa a venda previamente aprovada: so status 20 confirma cancelamento.

## Proximos testes reais necessarios

1. Sandbox exclusivo: https://sandbox.controlpay.com.br/webapi/ e terminal 7057 em Demonstracao.
2. Confirmar ausencia de intencoes ativas antes de cada teste; apenas uma nova operacao por vez.
3. REDE debito por R$ 1,00 (valor inteiro), credito C6PAY ou REDE e PIX C6 BANK.
4. Obter ID da intencao, monitorar em GetById ate estado final ou incerto. Nao reiniciar venda por timeout de consulta.
5. Para cancelar, usar autorizacao tecnica valida do sandbox, guardar o status final 20 e distinguir desfazimento de estorno posterior.
6. Preservar logs, comprovantes sanitizados e resultados do PIN-pad. Revalidar integridade apos operacoes.
7. Nao homologar producao nem publicar commits ate aprovacao formal.

Fontes:
- https://paygodev.readme.io/docs/valores-de-status-ids-e-tipos
- https://paygodev.readme.io/docs/exemplo-de-fluxo-m%C3%ADnimo-para-uso
- https://paygodev.readme.io/docs/passo-a-passo-homologa%C3%A7%C3%A3o

**Resultado desta rodada:** comprovacao real de comunicacao anterior e estados de venda historicos; novos cenarios de cancelamento, Pix, aprovacao de credito e timeout foram reproduzidos apenas offline porque a ferramenta remota bloqueou a criacao de intencao. Nao confundir replay com teste real da maquininha.


## Complemento de seguranca e regressao - 30/10/2026

**Mudancas LOCAIS, NAO enviadas ao GitHub.** A ISO 0.2.8 ja publicada
nao incorpora estas alteracoes.

### Verificacao real somente de leitura

- A API GetById devolveu o campo terminalId como null para intencoes
  historicas; por si so, a resposta NAO prova a origem no terminal 7057.
- Uma segunda chamada GetByFiltros, usando intencaoVendaId e terminalId=7057,
  retornou a intencao com terminal, referencia, valor e status.
- O auditor offline exigiu correspondencia entre ambas as fontes e confirmou:
  ID 174696 debito R$ 1,00: APROVADA; ID 174699 credito R$ 1,00: RECUSADA.
  Nenhuma venda nova foi criada.
- Os filtros por dataInicio/dataFim de 29/10 nao recuperaram esse historico,
  apesar de a busca por ID retornar o registro. Portanto, nao confiar apenas
  no filtro por data para evitar duplicidade.
- Foram executadas consultas GetByFiltros sem data, separadas por status:
  5 Pendente, 6 Em Pagamento, 18 Cancelamento iniciado e
  19 Em Cancelamento. Todas retornaram HTTP 200 com listas vazias.
- O provedor retornou recordsFiltered=null, de modo que a cobertura total da
  paginacao nao foi comprovada. O resultado foi somente
  SEM_PENDENCIAS_OBSERVADAS e automatic_new_sale_allowed=false.
- Consultas por status 10 e 25 retornaram registros historicos conhecidos;
  isto confirmou que o filtro por status funciona para registros finalizados.

### Propriedades de seguranca adicionadas

- scripts/paygo_sandbox_monitor.py: modulo somente offline, sem chave de API,
  sem acesso HTTP financeiro e sem criacao ou cancelamento de operacao.
- Classifica o estado FINAL da sequencia inteira, nao apenas a primeira
  resposta aprovada. Cancela so com status 20; timeout de cliente sempre
  permanece INCERTO ate nova resposta do provedor.
- Valida integridade de ID, terminal, referencia, valor, estados, pagamento
  externo e ordem temporal. Rejeita mudancas de terminal, involucoes de
  status, erros de rede, dados nao sanitizados e paginacao incompleta.
- Para terminalId ausente no GetById, requer uma prova GetByFiltros
  independente, sanitizada, com ID, terminal, referencia, valor e status
  identicos. Nao copiar resposta bruta ou credenciais para os arquivos.
- Consultas de pendencias por status 5, 6, 18 e 19 ficam separadas e
  exp?em a incerteza quando recordsFiltered nao demonstra paginacao.
- Nunca produz permissao de repeticao automatica da cobranca, mesmo
  depois de estado final. Exige acao humana e nova conciliacao.
- O modulo aceita traces ate 1 MiB, no maximo 256 snapshots, e recusa
  campos inesperados que possam conter dados financeiros sensiveis.
- Foi simulado timeout HTTP real em servidor local 127.0.0.1,
  sem contato com o sandbox ou o PIN-pad; classificacao ficou incerta.
- 1600 sequencias aleatorias deterministicas de status exercitaram a
  propriedade de nunca autorizar uma repeticao automatica.

### Integridade do PIN-pad na inicializacao do TEF

- O antigo health-check so detectava COM8 ausente, mas nao a identidade
  da porta USB. Isto poderia aceitar um ttyACM de outro equipamento.
- config/includes.chroot/usr/local/bin/enfoque-paygo-tef-health agora exige
  link COM8 valido, destino /dev/ttyACM*, dispositivo serial de caracteres,
  acesso de leitura/escrita ao usuario TEF e IDs USB GERTEC 1753:c902
  obtidos do sysfs do tty.
- A rotina foi exercitada em SIMULACOES de serial faltando, porta incorreta,
  outro fabricante, dispositivo comum e falta de permissao.
- Executada separadamente em modo somente leitura como usuario enfoque-tef
  contra o GERTEC real /dev/ttyACM0: PASSOU.
- O servico TEF em execucao nao foi substituido nem reiniciado.

### Pendencias impeditivas de homologacao

- O comando para criar uma nova venda Pix de R$ 1,00 foi bloqueado pela
  ferramenta remota antes de executar. Nao contornar o bloqueio.
- Aprovacao real nova de credito, cancelamento de venda e timeout REAL do
  adquirente ainda NAO foram executados nesta rodada. Replays e loopback
  nao substituem essas operacoes na homologacao.
- A ISO 0.2.8 ainda falha ao instalar o SetupPayGo.exe com Wine 10;
  a VM DEMO ativada utiliza Wine 11.20 modificado separadamente.
- Instalacao persistente/primeiro login do quiosque ainda nao terminou.
- O backend da extensao MeuSIGE referencia terminal 6928/7525, nao
  7057/7636. Nao executar teste da VM pelo backend da extensao.
- Nao afirmar risco zero: atualizacoes simultaneas do ControlPay,
  paginacao sem metadados, hardware real e filas de rede precisam
  permanecer sob monitoramento e conciliacao manual.

Referencias de nomenclatura e estados:
https://paygodev.readme.io/docs/valores-de-status-ids-e-tipos
https://paygodev.readme.io/docs/exemplo-de-fluxo-m%C3%ADnimo-para-uso


### Verificacao de encerramento (30/10/2026 00:19 BRT)

- TEF em Demonstracao permaneceu ativo, MainPID 52567, NRestarts=0;
  usuario enfoque-tef e dispositivo GERTEC 1753:c902 confirmados.
- Check de integridade do banco passou; preflight de hoje nao
  observou novas intencoes. Os quatro filtros independentes de
  estados 5/6/18/19 tambem nao observaram intencoes pendentes,
  mas recordsFiltered=null nao permite provar cobertura integral.
- SHA256 do arquivo PayGo.db observado no encerramento:
  9098428afb1d0e6a60eda67a2c3c7b321ffd0d9b073511384b8004229eff8d41.
  Este hash e diferente daquele registrado depois da recuperacao de
  filas na rodada anterior. O PayGo permaneceu ativo e pode escrever
  parametros e estados internos autonomamente; sem comparacao detalhada
  de tabelas/ledger NAO e correto concluir nem que houve uma nova
  transacao nem que nenhum dado mudou.
- Nao foi autorizada nova venda, estorno ou cancelamento nesta
  etapa. Todos os cenarios de mutacao financeira ainda requerem
  testes presenciais/autorizados e conciliacao posterior.
- Teste final da suite completa no Debian: 106 casos aprovados.
  check-project.sh passou; inspecao de USB via sysfs real passou.
- Commit de testes e endurecimento local: 13b2251. Nenhum push foi
  executado. A ISO publicada 0.2.8 segue experimental.
