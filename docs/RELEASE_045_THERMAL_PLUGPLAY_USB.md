# Enfoque OS 0.2.45 - Plug and Play USB e impressoras termicas

**Estado:** pacote e ISO piloto preparados em GitHub; NAO PUBLICAR NO APT DA
INTRANET ate a equipe concluir a campanha 0.2.44 e autorizar o rollout.
O push do GitHub dispara uma build e uma prerelease GitHub, mas nao chama
`scripts/publish-update-repo.sh`, nao altera `/srv/enfoque-os-archive` e
nao envia atualizacao a nenhum computador.

## Objetivo

1. Uma impressora termica registrada agora ou no futuro, da Elgin, Bematech
   ou outro fabricante suportado, recebe as opcoes **existentes** de corte
   automatico, zero avanco adicional e economia de papel na fila CUPS.
2. Para drivers raster conhecidos, o filtro elimina o branco no FIM DA PAGINA
   em resolucao nativa, sem aplicar zoom, modificar largura, QR, topo nem
   margens laterais. Um rodape de navegador isolado por >110mm de branco e
   removido somente se preencher os limites conservadores do filtro.
   A pequena sobra mecanica necessaria para atingir a guilhotina permanece.
3. Chrome: politica corporativa PrintHeaderFooter=false; configuracao
   de 100% de escala e Margens: Nenhuma e aplicada somente nos PCs com
   filas termicas, antes de abrir o Chrome ou apos seu fechamento normal.
   O Chrome nao e encerrado para editar preferencias ativas.
4. Plug and play USB por udev + systemd, buscando VID, PID, interfaces
   USB, driver nativo e catalogo local; kernel faz autodeteccao. Consulta
   opcional a APT usa exclusivamente as origens ja assinadas do Debian /
   Enfoque. O dispositivo nao fornece codigo executavel nem comandos.
5. Impressora IPP-over-USB pode ganhar fila "everywhere" automaticamente
   se houver exatamente UMA impressora USB e UM endpoint local IPP confirmado,
   sem fila USB antiga. Nunca e tornada padrao automaticamente; nenhuma
   pagina de teste e enviada automaticamente. Outros modelos permanecem
   no assistente de impressoras, sem inventar driver fiscal.

## Fluxo e componentes

    [USB conecta: VID/PID + class/subclass]
                     |
                [kernel/udev]
                     |
      [89-enfoque-plugplay.rules] (nao executa apt)
                     |
        [enfoque-plugplay@.service]
                     |
       [enfoque-plugplay (Python)]
                     |
             [catalog.json root-only]
                /       |          \
          driver     pacote        sem correspondencia
       modalias/nativo  APT assinado     generico do kernel
                \       |          /
                     |
       [status local + jornal/notify-send]
                     |
      [impressora USB? -> IPP Everywhere seguro]
                     |
       [enfoque-thermal-print --scan]
                     |
      [CUPS PPD: confirmar papel de rolo]
                /                 \
          [opcoes nativas]   [filtro raster compat.]
                 |                  |
       [corte/economia]     [corta so brancos no final]
                 \                 /
             [papel fisico: validar no piloto]

    [timer diario] -> [inventario PCI/USB + APT cache]
    [timer 12min] -> [novas filas termicas, sem imprimir]
    [timer 8min] -> [Chrome fechado? aplica 100% / nenhuma margem]

## Catalogo de drivers

Arquivo: `/etc/enfoque-os/drivers/catalog.json` (incluido na ISO e no DEB,
root-owned, tamanho limitado, schema=1).

Estrutura:

    {
      "schema": 1,
      "usb": {
        "devices": {
          "20d1:7008": {
            "name": "Elgin i9 - impressora termica USB",
            "category": "thermal-printer",
            "modules": [],
            "packages": ["cups"],
            "manual_vendor_driver": true
          }
        },
        "interfaces": {
          "03": {"category":"hid", "modules":["usbhid"], "packages":[]},
          "08": {"category":"storage", "modules":["usb_storage"],"packages":[]},
          "0e": {"category":"camera", "modules":["uvcvideo"],"packages":[]}
        }
      }
    }

O VID:PID `20d1:7008` foi lido das Elgin i9 ja instaladas na Ilha Plaza,
nao foi estimado. O banco local separa correspondencia exata por modelo de
fallback generico por classe. IDs nao conhecidos usam kernel/modalias.
Nao ha busca em sites desconhecidos ou instalacao de .deb baixado por URL.

## Seguranca

- Nunca usar `sudo`, `shell=True`, scripts de udev passados como
  parametros, instalar pacotes fora da allowlist ou adicionar repositorios
  externos silenciosamente.
- APT verifica assinatura do repositorio Debian/Enfoque configurado e
  bloqueia pacotes nao autenticados; ambiente root nao executa codigo de
  hardware desconhecido. Firmware incluido no ISO do Debian.
- Modprobe recebe somente identificadores de modulo permitidos e respeita
  blacklist do kernel; nao substitui modulo da GPU em uso.
- Falha no driver: mantem o driver generico do kernel e registra a situacao;
  se um pacote opcional foi instalado pelo mesmo evento e falhou, so o remove
  automaticamente se o dry-run do APT provar que nenhuma dependencia ou
  outro aplicativo sera removido. Pacotes essenciais (cups, ipp-usb, udev,
  kmod) nunca sao removidos automaticamente. Nao faz flash de firmware nem
  altera bootloader.
- A protecao contra falhas de boot depende do mecanismo de recuperacao e
  snapshots ja existente no Enfoque OS. **Rollback automatico apos
  travamento total do kernel nao esta homologado** no MVP 0.2.45.
- Filas A4 e de etiquetas ficam fora da politica termica. Nao remove
  impressoras, nao muda USB/IPP URI ou default nem cancela jobs.
- Troca de filtro PPD so ocorre com fila vazia, guarda copia original,
  valida o PPD com cupstestppd e restaura a copia se CUPS rejeitar a troca.
- A alteracao de preferencia Chrome e executada como usuario `enfoque`,
  quando navegador esta fechado, com copia original para rollback.

## Homologacao e limitacoes

1. Laboratorio: suites Python e smoke test do filtro CUPS na mesma resolucao
   203dpi, comparando largura, topo, QR e nota com espaco branco grande.
2. Piloto fisico: Elgin i9 Caixa 1 / Caixa 2 em horario sem operacao fiscal;
   folha de TESTE NAO FISCAL e comparacao do corte antes/depois.
3. Testar Bematech MP-4200 TH e modelos reais das lojas: cada modelo pode
   exigir PPD/filtro especifico ESC/POS/serial; a classe USB so identifica
   o dispositivo. Um modelo termico sem PPD reconhecido nao pode ser
   declarado pronto para cupom fiscal sem impressao real.
4. Pendrive: detecao usb-storage + montagens normais do kernel (sem
   formatacao ou execucao automatica). Webcam UVC e HID tambem.
5. Bluetooth e audio USB: kernel / BlueZ e PulseAudio existentes.
6. PCI: inventario de rede, video e audio; firmware Intel/AMD e Mesa no
   sistema. Driver NVIDIA proprietario, updates de kernel, Secure Boot e
   rollback de travamento total sao etapas futuras que precisam de teste.
7. Testar hotplug com rede offline; o fallback deve continuar local.
8. Nenhum teste de compra, fiscal real ou driver de TEF e executado pelo
   instalador PnP.

Logs: `journalctl -u 'enfoque-plugplay*'`,
`/var/log/enfoque-os/plugplay.jsonl`,
`/var/lib/enfoque-os/plugplay.json`, e
`/var/lib/enfoque-os/thermal-printers.json`.

## Fases seguintes

- MVP 0.2.45: USB, identificacao por classe e VID/PID, drivers
  genericos ja embarcados, CUPS termico automatico e IPP USB seguro.
- Etapa 2: adicionar novos pares VID/PID confirmados em homologacao,
  drivers Bematech/Elgin com origem assinada e revisao de licenca.
- Etapa 3: PCI especifico e sandbox para drivers opcionais; rollback
  validado em reboot problemático.
- Etapa 4: painel de controle de drivers na Intranet com aprovacao
  administrativa por loja e relatorio de falhas.

A diferenca entre **build GitHub** e **publicar atualizacao** e intencional:
primeiro validar o artefato, depois terminar a campanha 0.2.44 e so entao
publicar o pacote 0.2.45-1 no APT assinado em uma operacao separada.
