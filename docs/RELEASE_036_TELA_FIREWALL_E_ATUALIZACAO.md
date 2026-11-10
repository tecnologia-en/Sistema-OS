# Enfoque OS 0.2.36 - privacidade da tela, bloqueio por senha e firewall

Documento de implantacao, sem segredos ou tokens.
Referencia de origem: branch feat/lowram-kiosk-028, base 0.2.35.

## Escopo da 0.2.36

Apenas duas funcionalidades novas nesta versao:
1. Protetor de tela em dois estagios, com prazo curto sem senha e prazo longo com senha.
2. Firewall de entrada para computadores Enfoque OS, sem quebrar as conexoes de saida.

Nada foi alterado nos agentes remotos, no codigo do TEF nem no sistema de
preservacao/restauracao de arquivos da instalacao. O filtro de .iso e a
barra de progresso em GB da 0.2.35 foram mantidos.

## 1. Comportamento exato da tela

Em uma sessao XFCE instalada, apos:
- 3 minutos de ociosidade: tela PRETA (protetor), basta teclado/mouse
  para voltar, SEM senha.
- 15 minutos de ociosidade total: tela continua preta, mas o
  desbloqueio passa a exigir a SENHA DO USUARIO LOCAL (PAM).
- Suspender/hibernar ou acionar bloqueio manual: exige senha imediatamente,
  sem o periodo de tolerancia da ociosidade.
- Tela cheia (Chrome/PDV) nao desativa a politica por si so.

ATENCAO: escurecer a tela SEM senha NAO e um bloqueio de seguranca:
qualquer pessoa perto do caixa pode usa-lo antes dos 15 minutos.
Este comportamento foi explicitamente solicitado. Para caixarios e
ambientes publicos, o mais seguro seria exigir senha mais cedo.

Implementacao: pacote xfce4-screensaver do Debian, integrado a XFCE/Xfconf.
Nao criamos um capturador de teclas nem senha propria do Enfoque OS.
Acoes sao executadas como o usuario grafico, nunca como root.

Arquivos:
- /usr/local/bin/enfoque-proteger-tela
- /etc/xdg/autostart/enfoque-proteger-tela.desktop
- Marker por usuario: ~/.config/enfoque-os/tela-036-configurada

Na primeira sessao apos atualizar, o autostart configura os prazos UMA vez,
sem substituir preferencias posteriores do usuario. Para laptops e
sessoes suspensas, o retorno exige senha.
A aplicacao depende de reiniciar a sessao XFCE apos receber o pacote .deb.
No modo Live, a rotina desabilita o protetor do pacote para nao
interromper backup/instalacao com o usuario temporario.

Verificacao apos login:
  dpkg-query -W xfce4-screensaver
  xfconf-query -c xfce4-screensaver -p /saver/idle-activation/delay
  xfconf-query -c xfce4-screensaver -p /lock/saver-activation/delay
  xfconf-query -c xfce4-screensaver -p /lock/enabled
  xfconf-query -c xfce4-screensaver -p /lock/sleep-activation
  xfce4-screensaver-command --query

Criterio: 3, 12, true, true; verificar 15 minutos completos de
inatividade COM uma conta de usuario que conheca a senha. Nao fazer
teste em PC de atendimento em operacao.

## 2. Firewall de entrada

Usa nftables (ja presente no Debian 13 dos caixas Itaipu 0.2.32).
A regra autoritativa pertence SOMENTE a tabela inet enfoque_guard:
- INPUT: novas conexoes de entrada nao autorizadas sao bloqueadas.
- Loopback e conexoes ESTABLISHED/RELATED sao aceitos.
- OUTPUT nao e filtrado, evitando interromper SSH REVERSO, HTTPS, WSS,
  acesso a SIGE/Intranet, TEF via cliente, AnyDesk via relay e IPP cliente.
- DHCPv4/DHCPv6, ICMPv6/NDP e descoberta multicast mDNS sao permitidos.
- Ping de diagnostico da rede IPv4 privada e permitido.
- Nao abrimos SSH remoto diretamente na rede. O SSH aprovado via
  tunel no localhost continua disponivel.
- O firewall nao administra outras tabelas e nao usa flush ruleset.
- Nao altera encaminhamento (FORWARD) ou as regras de outros softwares.

AVISO: acesso direto de outro PC ao CUPS (TCP 631), SMB (445) e
conexoes DIRETAS de entrada a um aplicativo serao bloqueados. Isto
nao impede imprimir de Chrome/LibreOffice do proprio PC, nem a
conexao de saida para uma impressora compartilhada.
O AnyDesk via relay continua iniciando conexao de saida; conexoes
diretas LAN podem exigir excecoes aprovadas pela TI.
Revisar equipamentos especiais antes de aplicar.

Arquivos:
- /etc/enfoque-os/firewall.nft
- /etc/systemd/system/enfoque-firewall.service
- /usr/sbin/nft (pacote Debian nftables)

O servico e habilitado pelo postinst do enfoque-os-core e iniciado
em maquinas instaladas; no chroot/Live, apenas fica preparado para
o primeiro boot instalado. Se o firewall nao iniciar, registrar o
erro no journal e NAO presumir que esteja protegendo o PC.

Verificar:
  systemctl status enfoque-firewall.service --no-pager
  nft list table inet enfoque_guard
  systemctl is-enabled enfoque-firewall.service
  journalctl -u enfoque-firewall.service --no-pager -n 50
  nft --check -f /etc/enfoque-os/firewall.nft

Para reverter APENAS a tabela Enfoque (TI, console/recuperacao disponivel):
  sudo systemctl disable --now enfoque-firewall.service

Nunca aplicar esse arquivo de regras no VPS, nas rotas do MCP nem nas
maquinas de terceiros. O firewall destina-se somente ao Linux instalado.

## 3. Atualizacao de computadores 0.2.32 (Itaipu)

Inspecionados em 10/11/2026:
- CAIXA1-ITAIPU: enfoque-os-core 0.2.32-1, update-control.timer enabled.
- CAIXA3-ITAIPU: enfoque-os-core 0.2.32-1, update-control.timer enabled.
- NOTE-ITAIPU:  enfoque-os-core 0.2.32-1, update-control.timer enabled.

Todos possuem nftables, mas nao tinham xfce4-screensaver instalado.
Todos tinham snapshot_backend.ready = false nos diagnosticos de
enfoque-manutencao. Nenhum dos tres esta apto neste momento a uma
campanha gerenciada que EXIJA snapshot.

A nova ISO e o novo DEB do pacote enfoque-os-core sao coisas distintas.
Um push no GitHub gera artefatos, MAS NAO PUBLICA AUTOMATICAMENTE
a versao no repositorio APT assinado da VPS nem aprova campanhas TI.

O caminho de atualizacao correto:
1. Validar a build ISO e o pacote .deb em laboratorio.
2. Validar o firewall e o bloqueio de tela em PC piloto.
3. Configurar o Timeshift/Snapper e um destino de snapshots confiavel
   NOS COMPUTADORES que receberao a campanha; verificar ready=true.
4. Publicar versao 0.2.36-1 no repositorio APT ASSINADO do VPS,
   apos autorizacao administrativa e verificacao dos metadados.
5. Autorizar campanha da intranet para PCs especificos, em janela
   de manutencao. O worker da 0.2.32 consulta cada campanha.
6. Verificar dpkg-query -W enfoque-os-core e xfce4-screensaver,
   service status e conectividade do agente; efetuar logout/login
   e testar o comportamento da senha.

A instalacao do pacote .deb entrega os ARQUIVOS GERENCIADOS pela
Enfoque e as dependencias declaradas. Nao troca particoes existentes,
nao roda o backup de instalacao, nao reformata nem refaz o First Boot,
nao regrava USB e nao instala o GRUB/bootloader por completo.

PARIDADE IMPORTANTE:
- 0.2.33: correcao do helper de Wi-Fi, usado na janela da
  instalacao Live E na interface do desktop instalado. O helper
  faz parte do .deb e chega tambem aos PCs ja instalados.
- 0.2.34: preferencia de teclado pt-BR no modo Live e persistencia
  em /etc/default/keyboard e Xorg ao instalar. Estes arquivos
  nao fazem parte do .deb atual; em 0.2.32, o teclado da sessao
  foi corrigido manualmente, mas /etc/default/keyboard ainda dizia us.
- 0.2.35: filtro de .iso e progresso de backup em GB pertencem ao
  instalador; o codigo do programa entra no .deb, mas nao e reexecutado
  em PCs que ja estao instalados.
- 0.2.36: firewall + protetor sao explicitamente incluidos NO .deb e
  dependencias, com configuracao no PC instalado e no proximo login.
- Filas USB CUPS, AnyDesk individual, IDs e configurações locais
  continuam por equipamento e nao devem ser clonados.

Importante: nem todo arquivo de config/includes.chroot e enviado no
pacote de atualizacao. O gerador scripts/build-update-package.py
limita a lista e pode requerer mudancas em novas funcionalidades.

## 4. Criterios de homologacao

- Rodar toda a suite Python e testes Node, check-project.sh e diff --check.
- Conferir que a ISO e o DEB contem a configuracao correta.
- Validar nft --check em Linux de teste (nao VPS).
- Testar com monitor, notebook e oca: 3 min sem senha e 15 min com senha.
- Testar retorno de suspensao e bloqueio manual com senha.
- Verificar que a senha nunca e enviada para o servidor.
- Com firewall ativo, validar Intranet, SIGE, HTTPS e WSS, rede cabeada,
  Wi-Fi, DNS, CUPS (USB local e IPP de rede), AnyDesk e agente MCP.
- Verificar que nenhuma regra bloqueia a sessao de suporte atual.
- Testar reboot e confirmar que regras e autostart permanecem ativos.
- Em computador de caixa, validar impressao de cupom real em ambiente
  de testes sem vendas produtivas.
- Em uma maquina piloto descartavel, simular rollback e revogacao.

Versao 0.2.36 permanece PILOTO, nao homologada por testagem automatica.
