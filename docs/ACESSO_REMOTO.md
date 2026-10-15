# Acesso remoto do Enfoque OS - piloto

## Objetivo

Permitir que o TI visualize e controle computadores Enfoque OS por um painel web, sem depender de AnyDesk. O piloto usa **MeshCentral**, mantido em um servico isolado no VPS, e o **MeshAgent** Linux instalado em cada equipamento autorizado.

## Arquitetura

- Servidor: MeshCentral em conta Linux exclusiva, porta interna vinculada a localhost, atras do proxy HTTPS Nginx.
- Cliente: Enfoque OS Debian 13 / XFCE (X11), com agente por dispositivo.
- Recursos previstos: desktop remoto (tela, mouse, teclado), terminal e transferencia de arquivos com controle de acesso.
- Autenticacao: contas individuais e MFA; a primeira conta de administrador deve ser criada pelo responsavel, sem compartilhar a senha.
- Instancias de teste: a VM de desenvolvimento fica desligada, a VM `Enfoque OS - Teste` recebe apenas o agente do laboratorio.

**Nenhum token, chave de pareamento, credencial, certificado privado ou endereco interno deve ser versionado neste repositorio publico.**

## Situação em 15/10/2026

- [x] Servico MeshCentral instalado no VPS sob usuario Linux dedicado.
- [x] Backend restrito a `127.0.0.1` e controlado pelo systemd.
- [x] Nginx com HTTPS validado; rota de onboarding limitada a rede de teste autorizada.
- [x] Frontend do painel responde via HTTPS (200), sem afetar a homepage do ambiente de teste.
- [x] VM Enfoque OS consegue abrir o endereco de gerenciamento por HTTPS e validar o certificado (200).
- [ ] Responsavel criar a **primeira conta** diretamente no painel e configurar MFA (nao enviar senhas por chat).
- [ ] TI criar um grupo chamado `Enfoque OS - Pilotos` e gerar instalador Linux **individual**.
- [ ] Instalar o MeshAgent somente na VM de teste; confirmar registro online.
- [ ] Validar visualizacao de tela, mouse, teclado, terminal e desconexao no navegador.
- [ ] Resolver alertas de dependencias e regras de acesso antes de liberar conexoes de qualquer rede.
- [ ] Planejar persistencia do agente para OS instalado em disco, com revogacao por dispositivo.
- [ ] Integrar um atalho/permissao na intranet **somente depois** do piloto homologado.

## Seguranca e limitacoes

- O primeiro usuario de cada dominio MeshCentral pode tornar-se administrador. Nunca abrir cadastro inicial indiscriminadamente na internet.
- O prototipo da ISO 0.1.3 usa **modo Live**: instalacoes feitas diretamente na VM podem se perder no reboot. Nao distribuir uma ISO contendo credenciais ou a identidade clonada de um agente ja registrado.
- Auditoria inicial de dependencias NPM encontrou vulnerabilidades classificadas como altas. Manter ACL de rede para o piloto e revisar as dependencias antes da abertura publica.
- Permitir acesso aos dispositivos exclusivamente a usuarios de TI autorizados. Registrar quem acessou, quando e em qual equipamento.
- O agente deve poder ser removido/revogado. Preferir aviso de sessao remota e politicas de consentimento nos computadores das lojas.
- Nao foi instalado nenhum agente no Windows host, nos caixas, no SIGE ou nas lojas.

## Fluxo de pareamento quando a conta estiver pronta

1. Entrar no painel com o usuario administrativo e MFA.
2. Criar o grupo de maquinas do piloto.
3. Selecionar **Add Agent > Linux** e obter o instalador **gerado pelo proprio servidor** para o grupo.
4. Executar as instrucoes oficiais de instalacao **somente no Enfoque OS de teste**, conferir origem e TLS.
5. Verificar a maquina online no painel e testar a aba **Desktop**. Validar depois **Terminal** e **Files**.
6. Registrar os resultados e so entao preparar o procedimento de ativacao por dispositivo na versao instalavel do Enfoque OS.

Referencias: https://docs.meshcentral.com/meshcentral/ e https://docs.meshcentral.com/meshcentral/agents/
