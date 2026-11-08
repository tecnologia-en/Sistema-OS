# Servidor MCP: endurecimento ANTES de ativar terminal completo na intranet

Este patch e candidato, nao foi aplicado ao servidor em producao.

1. Configurar segredo forte ENFOQUE_PC_CONTROL_SECRET apenas no ambiente do backend MCP e no backend autenticado da intranet (nao no navegador).
2. A rota interna /internal/pc-control deixa de confiar apenas em localhost e requer cabecalho x-enfoque-pc-control-secret.
3. A intranet deve aplicar RBAC por operador, loja e computador ANTES de cada chamada. O patch nao substitui RBAC.
4. Manter log de tipo de acao, computador e resultado, sem salvar comandos/saida/tokens.
5. Testar clientes internos e so depois reiniciar o chatgpt-mcp.service com rollback do codigo anterior disponivel.
6. Nao confiar em nome de operador enviado no cabecalho pelo cliente: e necessario vincular a identidade ao login autenticado da intranet.
7. O MCP de ChatGPT tambem precisa revisao de permissoes por operador antes de liberacao geral.

IMPORTANTE: Nenhum segredo esta hardcoded aqui. Sem segredo configurado, a rota interna falha fechada.
