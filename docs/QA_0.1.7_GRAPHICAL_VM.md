# Enfoque OS 0.1.7 - Correcoes apos teste real do laboratorio

## Diagnostico comprovado
- A ISO 0.1.6 inicializou Debian 13 Live e LightDM com XFCE, mas mostrou framebuffer preto.
- No terminal tty1 o LightDM e xfce4-session estavam em execucao.
- **Rodar sudo chvt 7 exibiu imediatamente o Enfoque Central e o XFCE**, sem reinicio.
- Logo o erro nao era ausencia de XFCE: o Xorg iniciado pelo LightDM usa outro VT com o argumento `-novtswitch` e o terminal em foco continuava tty1.
- O servico `enfoque-ativar-grafico.service`, apenas em sessao Live, espera pela sessao XFCE e troca para o VT detectado diretamente da linha de comando do Xorg, sem supor fixamente VT7.
- Adicionadas dependencias explicitas para LightDM, Xorg, D-Bus, accountsservice e drivers de video de compatibilidade. O servico e habilitado durante o build.

## Pareamento real da VM
- No servidor corporativo, dispositivo de teste `Enfoque OS - Teste (VM)` registrado com ID curto `101` e autenticado individualmente.
- O agente foi instalado **apenas na VM Live**, a partir de midia privada de pareamento; nenhum token entrou neste repositorio ou na ISO.
- Heartbeat testado no servidor com indicadores online, CPU, RAM, versao e IP.
- Identidade Live nao persiste ao reiniciar sem armazenamento persistente configurado; antes de instalar em computadores fisicos sera necessario fluxo de pareamento e persistencia homologado.
- Inventario de dispositivos e **telemetria** nao equivalem a controle remoto de tela, terminal ou arquivos. Suporte via browser continua desabilitado ate implantar consentimento local.

## Verificacoes para nova ISO
- Revisar boot automatico em VM no VT grafico (sem comandar `chvt` manualmente), testar Chrome e Enfoque Central e confirmar CPU/RAM na intranet.
- Testar impressoras Bematech fisicas por modelo e conexao, ainda nao homologadas.
- Validar controle administrativo com agente MeshCentral individual, permissoes e auditoria antes de implantar nas lojas.
