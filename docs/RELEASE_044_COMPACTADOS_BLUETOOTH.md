# Enfoque OS 0.2.44 - Arquivos ZIP/7z e Bluetooth

## O que entra na imagem e nas atualizacoes APT assinadas

- Arquivos compactados: xarchiver, thunar-archive-plugin, 7zip, zip e unzip.
  Duplo clique nos ZIP, 7z e tar abre o Xarchiver; no Thunar, clicar com o botao
  direito oferece extrair e criar arquivo compactado. Suporte a 7z via 7-Zip
  instalado, nao apenas um visualizador ZIP.
- Bluetooth: bluez, blueman, bluez-obexd, pulseaudio-module-bluetooth.
  Entrada Bluetooth no menu Enfoque abre o Blueman; applet de bandeja usa o
  autostart oficial de Debian (/etc/xdg/autostart/blueman.desktop, fornecido
  pelo pacote blueman). Headsets/alto-falantes usam o PulseAudio existente.
- bluetooth.service habilitado durante instalacao/atualizacao. A tentativa
  de inicio imediato so ocorre quando existe adaptador; nenhuma obrigatoriedade
  de hardware Bluetooth para PCs sem adaptador.
- As associacoes globais de MIME tambem sao incluidas no pacote APT para PCs
  ja instalados. O arquivo pessoal do usuario permanece preservado; quando
  nao especificar programa ZIP, prevalece o novo padrao global.
- Sem atalhos extras na Area de Trabalho; apps no menu Enfoque e no Thunar.
  Configuracoes de impressoras, Chrome e Monitora nao sao alteradas por esta
  versao.

## Homologacao recomendada em uma unica maquina piloto

1. Atualizar individualmente pela Intranet, com recuperacao verificada.
   Confirmar pacote enfoque-os-core na versao 0.2.44-1.
2. Abrir o Thunar. Com um arquivo de texto descartavel, usar o menu de contexto
   para criar ZIP, abri-lo com duplo clique, extrair e verificar o arquivo.
   Repetir o ciclo com um 7z. Fechar e reabrir o Thunar se ele estava aberto
   durante a instalacao (plugin de contexto e carregado na inicializacao).
3. No menu Enfoque, pesquisar Compactador e Bluetooth e abrir os apps.
4. Com adaptador interno ou dongle USB presente, validar
   systemctl is-active bluetooth, bluetoothctl list, busca, pareamento
   e reconexao de mouse/teclado ou aparelho de teste. Para audio, testar
   fones/caixa Bluetooth e selecao de perfil no Pavucontrol.
5. Confirmar que Chrome, filas CUPS, SIGE e acesso Zero Touch continuam ativos.

Limites: software nao cria radio Bluetooth se o computador nao possuir
adaptador ou driver/firmware compativel. A compatibilidade de cada dongle e o
comportamento de dispositivos fisicos exigem teste em hardware real.
O envio da ISO/DEB nao atualiza automaticamente nenhum computador.
