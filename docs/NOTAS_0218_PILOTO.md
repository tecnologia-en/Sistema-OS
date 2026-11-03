# Enfoque OS 0.2.18 - indicador de bateria (piloto)

- Mantem a tecla Windows abrindo o menu Whisker e somente o icone no botao iniciar da 0.2.17.
- Inclui xfce4-battery-plugin e upower e exibe icone de carga, porcentagem, aviso de bateria baixa (15%) e critica (5%) ao lado do volume/relogio. O indicador depende de ACPI e hardware compativel; comportamento fisico nao foi testado nesta entrega.
- Instalador mantem pendrive ate o desligamento seguro, corrigido no repositorio apos 0.2.16.
- Administracao remota completa de tela, arquivos e terminal depende de MeshCentral provisionado com chave individual e aprovacao de TI, sem liberar shell/root via agente limitado do MCP. Nao incluir credenciais administrativas na imagem. O backend MeshCentral e a politica de aprovacao precisam de validacao independente.
- Build solicitado sem teste de VM; imagem continua candidata a piloto, nao homologada para pagamentos reais.
