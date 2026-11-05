# Enfoque OS 0.2.20 — Execucao do suporte nativo (em andamento)

## Resultado desta etapa

- Ultima ISO compilada e verificada: **0.2.19**. A 0.2.20 **nao foi compilada nem publicada**.
- A 0.2.19 continua no computador TESTE ESCRITORIO; este trabalho nao muda a instalacao.
- A biblioteca existente `session_policy.py` valida autorizacao individual e consentimento.
- Criado `session_registry.py`: registro de solicitacoes, exclusividade por PC, ativacao condicionada a autorizacoes, expiracao, encerramento por bloqueio de tela/logout/desconexao, e eventos encadeados por hash.
- Criados testes unitarios em `test/test_native_support_registry.py`.
- **Ainda nao existe** transporte de video/controle, servico remoto Linux, interface de controle nem uma sessao realmente funcional.
- O log em memoria do prototipo nao e auditoria duravel e nao deve ser apresentado como log imutavel de producao.

## Contrato tecnico para as proximas etapas

1. **Identificacao e autorizacao**: cada computador devera ter identidade individual validada contra o cadastro corporativo; a TI devera possuir permissao explicita e verificavel. Nunca usar credencial unica, constante ou embutida na ISO.
2. **Pedido de sessao**: selecionar exatamente empresa/loja/PC, operador, escopo e duracao. Uma unica sessao ativa por PC; expiracao maxima de 15 minutos; recusar sessao se ID, operador ou autorizacao forem diferentes.
3. **Politica de consentimento**: o codigo atual exige aceite local para cada sessao. A modalidade corporativa sem operador presente, desejada pela TI, **nao esta implementada**. Antes de inclui-la e necessario formalizar autorizacao do dispositivo gerenciado, um fluxo administrativo de ativacao e revogacao, indicacao visivel de sessao e auditoria. Nao inferir autorizacao permanente a partir de simples registro do agente.
4. **Sinalizacao e relay**: conexoes TLS de saida iniciadas pelo computador, autenticacao individual, limites de taxa e tamanho, identidade do PC e da sessao checadas em todas as mensagens; negar por padrao. Nenhuma porta aberta no roteador da loja.
5. **Cliente grafico**: processo restrito a sessao grafica do usuario, jamais um shell privilegiado. Captura e controle apenas durante sessao autorizada; bloquear ao travar a tela, sair da conta, revogar ou desconectar. Mostrar indicador e encerramento local.
6. **Painel**: listagem autorizada por loja; distinguir online para diagnosticos de online para controle; solicitar e encerrar sessao; registrar operador/PC/horario e erros sem guardar senhas nem capturas desnecessarias.
7. **Validacao**: testes negativos com IDs trocados, ausencia de consentimento, expiracao, multiplas sessoes, reconnect, perda de rede, lockscreen; QA de RAM em 2 GB, desempenho e Calc em TESTE ESCRITORIO, antes de gerar ISO.
8. **Entrega**: publicar servico no servidor apenas com autorizacao e protecoes testadas; atualizar computador-piloto por pacote versionado; depois compilar, instalar em VM e hardware fisico, e verificar checksums da ISO 0.2.20.

## Restricoes que nao devem ser removidas para acelerar

- Nao tornar o agente de diagnostico atual um executor arbitrario de comandos.
- Nao habilitar controle invisivel ou irrestrito por simples heartbeat.
- Nao transmitir senhas ou tokens para a interface dos funcionarios.
- Nao promover uma demonstracao local a implantacao em producao sem verificacao e revisao de seguranca.

## Comando de QA desta etapa

```sh
cd /opt/enfoque-os-029-git
python3 -m unittest discover -s test -p 'test_native_support*.py' -v
```
