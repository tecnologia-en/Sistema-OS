# Enfoque OS 0.1.4 - Telemetria para a Central de Computadores

## Limites de seguranca

A ISO inclui um **cliente apenas de leitura** para relatar CPU, RAM, IP local e uptime ao servidor HTTPS da intranet. **Nenhum token, ID, senha, controle remoto ou agente MCP fica embutido na ISO publica.** A telemetria nao parte automaticamente sem cadastramento individual.

## Procedimento de cadastro (somente VM ou computador autorizado)

1. Na Intranet, autorize um administrador na permissao `Acesso remoto (TI)`.
2. Abra `Central de Computadores` e escolha `Cadastrar computador`. Informe nome e setor.
3. A resposta fornece ID longo, ID curto e token unico. O token aparece uma unica vez. Nao compartilhar nem versionar.
4. No computador de teste, crie o arquivo `/etc/enfoque-os/agent.json`, com root:root, modo 0600:

```json
{
  "id": "UUID_FORNECIDO_PELO_SERVIDOR",
  "token": "TOKEN_INDIVIDUAL_FORNECIDO_PELO_SERVIDOR"
}
```

5. Com o arquivo presente, executar `sudo systemctl enable --now enfoque-telemetria.service`. A cada aproximadamente 30 segundos o cliente envia dados autenticados por TLS ao servidor.
6. Na central, verificar que o ID curto fica online e a CPU/RAM possuem valores reais. Para revogar, interromper o servico e revogar a identidade no servidor.

## Importante

- Na ISO Live sem persistencia, o cadastro se perde ao reiniciar. Nao adicionar identidade unica compartilhada a todas as copias da ISO.
- O agente transmite **telemetria**; nao habilita captura de tela, mouse, teclado ou execucao de comandos.
- A sessao web de controle permanece desativada enquanto nao houver agente de consentimento e transporte remoto homologado.
- Suporte administrativo via MCP requer agente corporativo distinto, conta autorizada, registro de acoes e inscricao anterior na politica de administracao.
- Nunca usar na producao das lojas sem homologacao do SO instalavel, politica de privacidade/consentimento e testes reais.
- O cliente nao depende do SIGE.
