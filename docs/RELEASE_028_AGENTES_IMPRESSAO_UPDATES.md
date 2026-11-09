## Revisao 0.2.29 — bootstrap APT Debian 13

O teste real de um Debian 13 limpo encontrou que gpgv nao e dependencia
do apt (a distribuicao base utiliza sqv). Como o atualizador da Enfoque
verifica InRelease com /usr/bin/gpgv, incluimos gpgv explicitamente tanto
na ISO quanto no Depends do pacote de atualizacao. Um cliente com gpgv
autorizado em laboratorio conseguiu habilitar a origem HTTPS e identificar
0.2.28 como candidata. A revisao 0.2.29 substitui 0.2.28 como versao final
recomendada para novas instalacoes e para o pacote corporativo.

# Enfoque OS 0.2.28 - testes e implantacao

## Correcoes incluidas
- Ponte segura do agente do sistema para o agente grafico XFCE. Verificacao
  via loginctl ou registros de sessao protegidos do systemd-logind. O socket
  local continua autenticado, sem abrir portas ou conceder root remoto.
- Pesquisa do menu pela execucao real do arquivo desktop, com Gio.DesktopAppInfo;
  lancadores sem executavel sao ocultados. Pesquisa Impressoras abre o
  painel da Enfoque, nao o sistema generico.
- CUPS: o detector deixa de criar filas extras e de imprimir paginas
  de teste sem solicitacao. O cups-browsed e desligado para evitar
  duplicacao de dispositivos IPP, sem apagar filas ja configuradas.
  Suporte a drivers genericos HP (printer-driver-hpcups).
- Bateria: indicador genmon 13 somente quando ha dispositivo Battery
  presente em sysfs. A migracao no login preserva todo o resto do painel.
- Atualizacao: pacote enfoque-os-core 0.2.28 publicado em repositorio
  APT assinado e entregue por HTTPS pela intranet.

## Testes de laboratorio
- Suite completa do projeto: 229 testes aprovados.
- Desktop GTK/GIO Debian 13: lancador valido executado, invalido ocultado.
- Agentes: socket Unix real, sessao X11 simulada, execucao de aplicativo
  como usuario grafico e diagnostico de leitura.
- Impressoras: zero lpadmin ou paginas automaticas nos testes de deteccao.
- Bateria: sysfs simulado com e sem bateria fisica.
- APT: chave verificada por GPG e metadados reconhecidos por Debian 13.

## Seguranca
- Senhas e autenticacao administrativa de PAM/Polkit sao mantidas.
- Nao remover filas CUPS ou alterar impressoras de lojas automaticamente.
- Alteracoes no computador piloto somente com backup/ponto de restauracao,
  autorizacao da TI e fora de janela de atendimento.
- Atualizacoes automaticas exigem autorizacao explicita e snapshot.

## Implantacao
- URL: https://intranet.enfoquepapelaria.com.br/enfoque-os-updates
- Repositorio stable, main, amd64, pacotes all.
- Chave privada fica exclusivamente no VPS em
  /var/lib/enfoque-update/keyring. Nunca compartilhar com GitHub.
- Primeiro validar a Bancada-Ilha com versao 0.2.28, reconexao do agente,
  abertura do Mousepad, pesquisa N10, impressao fisica no modelo real e
  bateria em desktop/notebook. Depois liberar atualizacao em escala.

O teste em contêiner nao equivale a homologacao fisica. A impressora real
ainda precisa produzir uma folha para confirmar que seu driver e URI estao
corretos.