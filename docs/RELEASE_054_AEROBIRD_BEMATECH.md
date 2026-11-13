# Enfoque OS 0.2.54 — visual AeroBird/WindowsModern e impressão Bematech

## Escopo
Release piloto para ISO e atualização APT. Não instalar automaticamente nos PCs. Preserva SIGE, intranet, Canfoque, agentes remotos, menu e políticas de recuperação anteriores.

## Visual original, não apenas inspiração
- Os pacotes originais de usuário estão em third_party/visual, fixados por SHA-256 e reproduzidos por scripts/stage-visual-assets.py.
- WindowsModern-icons-1.1.1.zip SHA256 0e06713d567d820e92a3d54d7d4fead13a2775f4ef6432f085b63e34a6801356.
- xfce-aerobird-theme-v6-hdpi.zip SHA256 db1119500214fb56ab290abfac018d8a5d6eec00fbc9fcb902ddf2c3de70fbf6.
- GTK, XFWM4 e login LightDM usam Aerobird-Sky-hdpi; ícones de apps e sistema usam windows-modern.
- Todas as 18 variantes AeroBird são distribuídas, não apenas uma captura ou simulação da aparência.
- CSS corporativo adiciona somente ajustes compactos de indicador ID, bandeja e alerta; controles originais continuam operacionais.
- O antigo EnfoqueModern permanece como fallback, e as preferências anteriores dos usuários não são apagadas.
- O compositor XFWM4 é ativado para transparência; verificar desempenho em hardware antigo em piloto.

## Bematech MP-4200 TH e outras filas compatíveis
- Novo filtro binário/script em usr/lib/cups/filter/enfoque-bematech-fit, originado da configuração real dos Caixas 1/2 do Centro.
- Pré-processa PDF de recibos curtos (largura ~72mm), com proporcionalidade, ampliação máxima de 1.40x e margens de 5pt nas laterais.
- Encaminha ao bemafilters.sh original do fabricante. Não recorta documentos A4, etiquetas ou formatos incompatíveis; usa fallback.
- O serviço enfoque-thermal-print identifica TODAS as filas locais que expõem PPD Bematech de bobina 80mm com filtro PDF bemafilters.sh e, quando ociosas, faz backup e alteração transacional do PPD.
- Impressoras Bematech de outros drivers não recebem alteração especulativa do filtro; mantêm seu pipeline original.
- Não altera padrão CUPS, porta USB/serial/IPP, Cutter, Drawer, Drawer2, CashDrawer, nem configuração de venda de nenhum PC.
- Pacote APT depende de Ghostscript e poppler-utils; o módulo de impressão é empacotado para futuras atualizações.

## Pantum compartilhada via CUPS — Centro
- A configuração existente é específica da loja: Pantum P2500W USB no Caixa1, compartilhada em ipp://192.168.111.173:631/printers/CAIXA1_PANTUM_P2500_USB.
- Apenas a Pantum deve estar publicada na rede local 192.168.111.0/24; nenhuma Bematech é compartilhada.
- Em upgrades APT normais, as filas do CUPS, seus PPDs, o cupsd.conf e as preferências Chrome locais são mantidas. O firewall.nft modificado pelo operador é conffile, tratado com --force-confold.
- Uma reinstalação limpa não preserva essas configurações automaticamente; requer backup/migração.
- Se o IP do Caixa1 mudar (DHCP), os clientes podem perder o destino: fixar reserva DHCP ou DNS estável.
- A comunicação IPP não elimina a instabilidade física do dispositivo: ipp-usb já apresentou Device initialization timed out em 13/11.

## Segurança da publicação
- GitHub Actions build-iso.yml compila/testa ISO e dois pacotes versionados; publica prerelease apenas com checksums e manifesto aprovados.
- Sincronizador na VPS atualiza catálogo APT assinado e página Computadores > Atualizações após build bem-sucedido.
- Publicar versão não significa atualizar PCs; campanhas automáticas seguem desativadas e instalação requer ação explícita na intranet.

## Verificação realizada
- scripts/stage-visual-assets.py --verify-only e --stage OK; arquivos de entrada sem SVG script/JavaScript pesquisado.
- scripts/check-project.sh passou, incluindo testes de boot, painel, navegador, impressoras, pacote APT e APIs.
- test/test_release_054.py passou (8 casos novos: hashes, identidade visual, seleção segura de Bematech, proteção de gaveta, fallback).

## Fontes
- Tema AeroBird for Xfce: https://www.pling.me/p/2343514/
- WindowsModern icons: https://github.com/Jeysef/KDE-Windows-Modern/releases/tag/v1.1.1
- O conteúdo exato foi enviado pelo usuário e conferido contra as cópias baixadas por hash, em vez de redesenhado.

## Compartilhamento explícito de impressoras por loja

O executável de atualização /usr/local/sbin/enfoque-printer-share permite configurar, sob autorização administrativa, o compartilhamento de uma fila NÃO térmica, com backend local e bloqueio de qualquer Bematech, Elgin ou cupom.

Exemplo somente para operador autorizado no Caixa 1 do Centro (não executado durante o build):

    sudo enfoque-printer-share share --queue CAIXA1_PANTUM_P2500_USB --bind-ip 192.168.111.173 --subnet 192.168.111.0/24 --interface enp2s0 --dry-run
    sudo enfoque-printer-share share --queue CAIXA1_PANTUM_P2500_USB --bind-ip 192.168.111.173 --subnet 192.168.111.0/24 --interface enp2s0

Nos clientes:

    sudo enfoque-printer-share client --queue PANTUM_CAIXA1_CENTRO_REDE --uri ipp://192.168.111.173:631/printers/CAIXA1_PANTUM_P2500_USB --dry-run
    sudo enfoque-printer-share client --queue PANTUM_CAIXA1_CENTRO_REDE --uri ipp://192.168.111.173:631/printers/CAIXA1_PANTUM_P2500_USB

Este utilitário NÃO é acionado automaticamente pela atualização; é necessário executar a ação em um computador autorizado. Restringe o firewall ao IP/interface/sub-rede corporativa, não libera administração CUPS pela LAN, preserva backups locais de configs e não altera o padrão do Chrome ou CUPS de clientes existentes. Sub-redes amplas ou públicas são recusadas.

## Cobertura adicional: Bematech com driver raster nativo

A auditoria do banco de drivers mostrou que algumas Bematech não usam o bemafilters.sh PDF: há filas com enfoque-lib-bematech-raster ou rastertobematech. Na 0.2.54, o filtro raster já existente ganhou modo específico opcional ENFOQUE_BEMATECH_FIT=1, ativado apenas pelo wrapper do CUPS para fila Bematech homologada.

Esse modo mede a região impressa do raster 80 mm, aplica escala uniforme de até 1,40x para largura e altura quando o recibo realmente está estreito e mantém o número de pixels de largura, o DPI e a chamada ao driver original. Se o conteúdo já ocupa a bobina, está em outro formato ou não cabe com segurança, passa sem escala. O modo padrão para outras impressoras continua sem zoom, preservando leitura de QR/barcode e dimensões originais.

O novo teste de integração usa CUPS Raster v2 de 576 pixels e 203 DPI no Debian 13. Verifica a escala Bematech 1,400x, largura final maior, altura correta e, em paralelo, todos os testes antigos de eliminação de margem branca/rodapé para outras impressoras. A validação física ainda deve ocorrer antes de campanha geral.
