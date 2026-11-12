# Enfoque OS 0.2.47 - Diagnostico de HD/SSD no instalador

**Entrega:** codigo e build da ISO no GitHub, sem publicar 0.2.47 no APT
da Intranet e sem atualizar os computadores existentes.

## Causa identificada

O instalador 0.2.46 descartava silenciosamente qualquer disco interno
com particao montada, mesmo que o Linux o reconhecesse normalmente.
Se o Thunar montasse o volume NTFS do Windows no modo Live, o HDD/SSD
sumia da lista sem explicacao. Outra causa possivel sao controladoras
Intel VMD, Intel RST/RAID e drivers de armazenamento ainda nao carregados.

## Correcao na ISO

1. Na busca de discos, a ISO tenta carregar os modulos Linux vmd,
   nvme, ahci e sd_mod e aguarda os eventos udev. O pacote Debian
   firmware-misc-nonfree tambem passa a fazer parte da imagem.
2. A busca mostra os discos elegiveis e informa separadamente os
   encontrados mas bloqueados por montagem, swap, RAID/LVM,
   tamanho menor que 24 GiB, USB, somente leitura ou midia Live.
3. A tela oferece os botoes "Atualizar discos / detectar SSD" e
   "Por que meu HD/SSD nao aparece?". O diagnostico inclui motivo,
   tamanho/modelo e tipo de controladora PCI.
4. Comandos de diagnostico sem escrita:
   - enfoque-install-system --diagnose-disks
   - sudo -n enfoque-install-system --probe-disks (somente Live)
   - enfoque-install-system --list-disks (compatibilidade)
5. O disco e verificado novamente ANTES de particionar; o pendrive
   Live continua proibido como destino. Confirmacoes APAGAR/MANTER
   permanecem obrigatorias.

## Limites e seguranca

- O diagnostico NAO monta, desmonta, formata ou apaga discos; nem
  altera BIOS, registra particoes ou faz rescan forçado de PCI.
- O instalador NAO desmonta automaticamente volumes NTFS. Se o HD
  tiver arquivos Windows abertos pelo Thunar, feche o programa e
  realize desmontagem segura antes de atualizar a lista.
- Alguns SSDs podem permanecer invisiveis ao Linux mesmo com
  driver VMD: a TI deve analisar o modelo do PC e controladora.
- **Nao altere RST/RAID/VMD para AHCI na BIOS sem backup e
  procedimento de migracao do Windows.** Isso pode impedir o
  boot do Windows ou acesso a volumes RAID.
- No modo MANTER, o backup remoto verificado precisa terminar antes
  de formatar. Se houver erro de leitura do Windows/BitLocker, a
  instalacao deve parar sem apagar.
- O resultado da build e testes automaticos NAO substitui uma
  homologacao num SSD fisico que era invisivel na ISO anterior.

## Testes

- python3 -m unittest discover -s test -p test_storage_detection_047.py -v
- python3 -m unittest discover -s test -p test_release_047.py -v
- bash scripts/check-project.sh
- bash scripts/check-visual.sh
- python3 -m unittest discover -s test -p 'test_*.py' -q
- GitHub Actions: build da ISO, artefatos e SHA256.

No PC de homologacao: iniciar a ISO pelo pendrive, abrir o diagnostico,
verificar se o SSD aparece, confirmar que nenhum disco montado/USB
pode ser selecionado e testar a instalacao SOMENTE apos backup.
