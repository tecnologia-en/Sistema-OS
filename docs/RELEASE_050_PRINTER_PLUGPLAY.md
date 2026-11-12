# Enfoque OS 0.2.50 - reconhecimento e configuracao segura de impressoras

## Problema observado
A versao 0.2.49 tinha infraestrutura CUPS/IPP, mas o setup de hardware
nao criava filas de rede. O plug and play USB so instalava automaticamente
UMA fila de IPP-over-USB local. Os ajustes de papel termico so operavam
sobre filas ja existentes. O Avahi e o cups-browsed foram desativados
na politica de economia de recursos; a nova rotina nao depende de mDNS.

## Implementacao
- Novo daemon oneshot: enfoque-printer-autosetup; timer de 5 em 5 minutos.
  O fluxo USB existente chama o mesmo servico ao reconhecer dispositivo.
- O computador so recebe impressoras de SUA loja, via unitId do
  perfil root-owned /var/lib/enfoque-os/firstboot.json.
- Inventario da TI na ISO: /etc/enfoque-os/drivers/printer-catalog.json.
  Inicio com Canon MAXIFY GX7100 da Ilha Plaza e cinco Pantum/Canon do
  Centro com IPP Everywhere. Sem copia automatica de filas historicas.
- Verificacao TCP em 631 antes de adicionar fila IPP. O mesmo endereco
  ja configurado fica intacto mesmo com outro nome de fila.
- Nao imprime teste, nao altera a impressora padrao e nao sobrescreve
  PPD/URI de fila da loja. Falhas/offline sao adiadas.
- Elgin i9 USB e Bematech MP-4200 TH USB/serial: somente provisionar
  automaticamente caso exista driver/PPD EXATO, ja instalado e com filtro
  CUPS existente; caso contrario sinalizar needs-driver. Nao usar RAW
  nem PPD generico de outra impressora.
- Bematech serial usa /dev/serial/by-id e configuracao 115200 8N1.
- IPP-over-USB: fila unica se houver um endpoint local unico e
  nenhuma fila USB/IPP local previa.
- Eventos e erros: journalctl -u enfoque-printer-autosetup e
  /var/log/enfoque-os/printer-autosetup.jsonl.

## Validacao obrigatoria
1. Antes do piloto, guardar lsusb, dmesg, lpinfo -v, lpstat -v e
   journalctl -u 'enfoque-plugplay@*' -n 50 em um PC problematico.
2. Instalar Enfoque OS 0.2.50 EM UM PC PILOTO, sem instalacao em massa.
3. Repetir a coleta: diferenciar falha de kernel, CUPS, PPD/filtro e fila.
4. Testar Canon/Pantum de rede pela loja correta e Elgin/Bematech USB.
5. Confirmar fisicamente uma pagina NAO FISCAL, largura, corte, margens,
   Chrome/LibreOffice e nao duplicacao de filas.
6. So distribuir para a frota apos o piloto fisico.

## Escopo
Nao ha autorizacao para instalar drivers de procedencia desconhecida,
fazer flash de firmware ou alterar conexoes existentes. Mentes continua
como documentacao: os registros editaveis nao executam comandos no OS.
O catalogo oficial so muda por ISO ou pacote APT assinado pela TI.
A build do GitHub nao dispara atualizacoes na frota de PCs.

## Canfoque incluido na mesma ISO
O Enfoque OS 0.2.50 incorpora Canfoque Pilot 2.0.0-beta.1
(AppImage x86_64, SHA-256 ca87493fe0cbc33f11ed0495807821d64e67b53c0572a325ef3e288e2e0053af)
e RustDesk 1.5.3 para o piloto de acesso remoto. Os binarios sao
obtidos do servidor/origem confiavel, verificados por hash fixo antes
do empacotamento e nunca contem credenciais individuais de maquinas.
A versao piloto nao equivale a uma homologacao final.
