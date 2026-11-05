# Suporte Nativo Enfoque — fundacao de seguranca para uma futura ISO 0.2.20

## Objetivo de produto

Ter um canal proprio de suporte para computadores **corporativos** administrados
pela Enfoque, sem depender do MeshCentral para o controle interativo. Usar uma
conexao de saida TLS estabelecida pelo proprio computador, protegida por
credenciais individuais, sem portas publicas abertas em cada loja.

## Estado real do projeto

- ISO publicada e verificada: **0.2.19**.
- Agente de diagnostico aprovado no gateway: funcional, apenas comandos de leitura permitidos.
- Interface de previsualizacao: existe em modulo legado, ligada ao cadastro manual antigo.
- Canal proprio de tela, teclado, mouse e transferencia de arquivos: **nao implementado**.
- Biblioteca `session_policy.py`: **implementada e testada**, sem operacoes remotas.
- Proximo numero de versao **nao deve** ser apresentado como pronto antes da integracao e validacao.

## Contrato de autorizacao obrigatorio

1. A central identifica PC por UUID persistente. Um operador da TI com permissao
   explicita solicita uma sessao com prazo e escopo de acesso.
2. O equipamento apresenta solicitacao visivel na sessao de usuario ativa.
   Somente apos aceite local e segunda verificacao da TI o servidor pode emitir
   sessao temporaria; nenhuma credencial generica em ISO.
3. Toda acao deve estar vinculada a sessao, operador, PC, timestamp e trilha
   de auditoria nao editavel pelo cliente. Sessao expira apos no maximo 15 min,
   e pode ser encerrada localmente, pela central, revogacao ou desconexao.
4. Captura/imput de desktop devem acontecer no contexto do usuario grafico,
   **sem privilegios root**. Bloquear acesso a lockscreen, campo de senha,
   UAC/polkit e executar shell privilegiado por esse canal.
5. O controlador validara tickets no servidor a cada mudanca de privilegio;
   TLS e limitacao de dados nao substituem autenticacao nem auditoria.
6. O programa deve informar claramente quando a tela esta sendo compartilhada.
   Nunca simular que uma solicitacao pendente iniciou um compartilhamento.

## Etapas ainda pendentes

- Implementar sinalizacao de presenca e pedido/aceite, com testes de expiracao.
- Criar relay de sessoes TLS no servidor com identidade da TI verificada, recusa
  padrao, revogacao e limites de uso; testes negativos contra token cruzado.
- Integrar visualizador e controle de desktop nao privilegiado, com icone e
  botao visivel de desconexao.
- Validar latencia, reconexao, consumo em 2 GB RAM, suspend/resume, rede instavel,
  auditoria, controle de acesso, acessibilidade e comportamento de logout.
- Atualizar a ISO e provar a experiencia completa em VM e pelo menos um PC
  fisico de teste antes de afirmar que o acesso remoto funciona.

## Escopo de seguranca

Nao tentar contornar bloqueios de ferramentas administrativas nem substituir
vinculo individual por um agente invisivel de controle irrestrito. Um canal
para suporte corporativo precisa passar por revisao e homologacao de seguranca.
