# Enfoque OS 0.2.4 — Interface e recursos do desktop

## Objetivo

Padronizar a identidade do sistema com a marca Enfoque e oferecer uma barra inferior semelhante à de computadores tradicionais, **com comandos funcionais**, sem simular o estado da rede ou do áudio.

## Componentes implementados

- **Wallpaper corporativo:** novo fundo Full HD com a logo transparente original da Enfoque (menina, rosa e lettering). A composição foi refeita com os elementos azul/branco da referência aprovada e está embutida em `/usr/share/backgrounds/enfoque-os/wallpaper.jpg` (mais PNG).
- **Barra inferior:** fixa, com Menu Iniciar Enfoque, Chrome, SIGE, Intranet, Arquivos, janelas abertas, rede, áudio, data/hora e mostrar área de trabalho.
- **Áudio:** `xfce4-pulseaudio-plugin` controla o som do dispositivo pelo clique. `pulseaudio` e `pavucontrol` fornecem o servidor e mixer. Se não houver dispositivo de saída, o plugin deve reportar isso em vez de exibir volume fictício.
- **Rede:** `NetworkManager` + `nm-applet` mostram estado conectado, conexões disponíveis e configurações mediante clique. A lista Wi-Fi requer adaptador Wi-Fi físico/virtual reconhecido. Ethernet será indicada como rede cabeada.
- **Relógio:** horário e data no mesmo applet, formatados como HH:MM / DD/MM/AAAA.
- **SIGE:** o atalho da barra, menu e área de trabalho vai para `https://enfoquepapelaria.meusige.com.br/sistema` e abre no Chrome.
- **Intranet:** mantém endereço `https://intranet.enfoquepapelaria.com.br/` e usa favicon real.
- **Ícones:** aplicativos internos (Iniciar, Central, Suporte, Diagnóstico, Sobre, Vincular PC) com SVGs padronizados em azul. Marcas originais de SIGE e Intranet preservadas.
- **Menu e tema:** favoritos reordenados, fonte legível, azul corporativo e tema Arc-Dark para controles do desktop. Ajuda offline `Primeiros passos - Enfoque OS` incluída no Menu Iniciar com instruções dos atalhos, rede e volume.
- **Boot:** versão de piloto atualizada para 0.2.4 nos menus BIOS e GRUB.

## Como testar a ISO em VM

1. Compilar e conferir a ISO no GitHub Actions.
2. Conferir SHA256SUMS depois do download antes de anexar ao VirtualBox.
3. Inicializar sem uso manual de Ctrl+Alt+F7; verificar fundo, logo, menu, ícones e barra.
4. Verificar a data atual junto à hora, sem valores fixos no código.
5. Abrir o controle de áudio com clique e alterar o nível de volume em um dispositivo de saída real. Caso a VM não exponha áudio, testar novamente em hardware compatível.
6. Abrir indicador de rede e verificar conexão ativa e redes reais encontradas, sem inventar SSIDs.
7. Clicar SIGE e conferir URL exata `/sistema`; verificar Intranet e Chrome padrão.
8. Verificar guia local Primeiros passos e verificar se o menu tem atalhos legíveis.

**Status:** pré-homologação. Não instalar em PCs de loja até validação de rede/áudio em hardware real, impressoras, sessão administrativa e políticas corporativas.
