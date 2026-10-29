# Enfoque OS 0.2.8 — quiosque, baixo consumo e TEF

## Escopo e garantias

Debian 13 com XFCE. Login administrativo normal continua disponivel. O quiosque e opt-in depois da instalacao em disco e configuracao pela TI. O modo Live nao ativa autologin nem contem ativacoes individuais do PayGo.

A ISO inclui o instalador oficial PayGo verificado, mas NAO inclui banco de ativacao, chave ControlPay, certificados privados, comprovantes ou Wine 11.20 modificado de uma VM. Cada computador TEF exige ativacao do proprio dispositivo e provisionamento local do runtime Wine 11.20 com patch WMI verificado. Nao copiar ativacao de VM para loja.

## Medicoes iniciais — 29/10/2026

VM Debian Live 13.7, XFCE 4.20, ISO 0.2.7: 2474 MiB RAM total, 1791 MiB usados, 683 MiB disponiveis; ZRAM LZ4 1237 MiB com 1163 MiB usados; swappiness 80; boot 24,103 s kernel + 46,608 s userspace = 70,712 s. Live-config levou 23,585 s; ldconfig 20,656 s; ajuste de VT Live 14,552 s. Esses tempos nao representam uma instalacao persistente.

PayGo em DEMO: GERTEC PPC930 1753:c902 em /dev/ttyACM0 (COM8), ControlPay terminal 7057. Intencao 174696: debito REDE de R$ 1,00, Creditado e confirmado por PWRET_OK. Creditos 174697–174699 falharam/foram recusados. CREDITO AINDA NAO HOMOLOGADO.

## Perfil de 2 GiB

- XFCE e LightDM preservados. Sessao quiosque carrega somente xfwm4, Chrome Guest e a janela de pagamentos quando necessaria; sem painel, Thunar, menus ou atalhos de terminal.
- ZRAM LZ4, PERCENT=100 e prioridade 100; swappiness 120, page-cluster 0. Nao reiniciar a ZRAM ocupada; vale no proximo boot.
- CUPS mantido para impressoras das lojas. Somente cups-browsed e Avahi desligados para nao descobrir impressoras constantemente. NetworkManager continua ativo.
- Sem instalacoes automaticas de pacotes nem reinicios do APT: TI precisa de rotina agendada de seguranca. Nao usar a ausencia de updates automaticos para abandonar patches.
- Journald limitado a 64 MiB em disco e 32 MiB em RAM. Logrotate diario para logs de diagnostico; NAO apagar PayGo.db, PGWebLib/Data, recibos e filas de transacoes.
- Plymouth reutiliza arte existente; GRUB oculto por 2 s (Shift/Esc permite recuperacao), quiet splash habilitado.

## Usuarios e permissoes

A TI cria duas contas separadas: enfoque-kiosk para o navegador e enfoque-tef para Wine/PayGo. Nao possuem sudo nem senha de acesso interativo, e DenyUsers no SSH impede login. Polkit nega elevacao. O navegador nao tem grupo dialout, nao consegue acessar o banco TEF, e usa Chrome Guest temporario. Somente o usuario TEF pode acessar o GERTEC.

A sessao do quiosque oculta launchers do Wine/PayGo, mas **NAO oculta janelas obrigatorias de pagamento, autorizacao ou cancelamento**. O TEF recebe acesso ao X11 somente pela regra local especifica de usuario. X11 nao e isolamento entre processos; para producao seria desejavel avaliar Wayland/Xwayland e AppArmor.

Referencia root-only: /opt/paygo-tef/reference. Runtime Wine root-owned: /opt/paygo-tef/wine. Dados operacionais persistentes, privados ao usuario TEF: /var/lib/paygo-tef/runtime. Nunca restaurar automaticamente uma copia antiga sobre o banco de transacoes; exigir validacao da TI.

## Provisionamento apos instalacao

1. TI: sudo /usr/local/sbin/enfoque-kiosk-control prepare
2. Instalar e ativar legalmente PayGo DEMO no hardware desta maquina, usando o terminal especifico do computador.
3. Disponibilizar prefixo ativado DESTA maquina e runtime Wine11.20 corrigido. O runtime nao e publicado no Git.
4. TI: sudo /usr/local/sbin/enfoque-paygo-provision --source-prefix /CAMINHO/DO/PREFIXO --wine-dir /CAMINHO/DO/WINE --terminal ID_TERMINAL --confirm-same-device
5. TI: sudo /usr/local/sbin/enfoque-kiosk-control enable --url https://intranet.enfoquepapelaria.com.br/
6. Reiniciar em janela de manutencao, conferir systemctl status enfoque-paygo-tef e executar sudo -u enfoque-tef /usr/local/bin/enfoque-paygo-tef-health.

Se o provisionamento for interrompido APOS todas as copias, a TI pode verificar as copias e repetir os mesmos parametros com --resume. Nunca sobrescrever os dados existentes automaticamente.

Para desfazer sem apagar dados: sudo /usr/local/sbin/enfoque-kiosk-control disable. Reiniciar LightDM na manutencao ou reiniciar o computador. O login administrativo com senha volta a ser usado.

## Integridade e quedas de energia

Debian Live usa OverlayFS sobre SquashFS, e alteracoes feitas nele nao garantem persistencia. Instalar em EXT4 com journaling, preferencialmente noatime e commit padrao de 5 s; nao usar commit=60, que aumenta a janela de dados nao confirmados. Nunca desabilitar fsync/barreiras para ganhar desempenho de pagamento.

O lancador verifica SQLite com PRAGMA quick_check e diretorios gravaveis antes de iniciar TEF. Se o banco falha, interrompe o PayGo SEM sobrescrever a ativacao e SEM desfazer transacoes. TI deve fazer backup e analise forense antes de restaurar qualquer dado.

Teste de queda de energia SOMENTE numa VM instalada descartavel e CLONADA, sem pagamentos reais: snapshot frio do VDI, executar teste sem transacao pendente, poweroff abrupto do clone, reiniciar, conferir fsck EXT4 e integridade SQLite. Nao desligar a VM original que contem a ativacao.

## Checklist de validacao

- systemd-analyze time; free -m; zramctl; cat /proc/swaps; sysctl vm.swappiness.
- systemctl list-unit-files --state=enabled; verificar que SSH, NetworkManager e CUPS continuam operacionais.
- id enfoque-kiosk; id enfoque-tef; getent group sudo; grupo sudo deve conter outro admin, nunca kiosk/tef.
- sudo -u enfoque-kiosk test -r /var/lib/paygo-tef/runtime/drive_c/ProgramData/PayGo/Data/PayGo.db DEVE FALHAR.
- sudo -u enfoque-tef /usr/local/bin/enfoque-paygo-tef-health DEVE PASSAR apos provisionar.
- SSH para as duas contas de quiosque deve ser negado; login de TI continua permitido.
- Autologin, Firefox/Chrome Guest, keyring, CUPS, rede, ausencia de terminais, e tela de transacao precisam de QA visual.
- RAM COM Chrome e PayGo, rodando no hardware real de 2 GiB, deve permanecer abaixo do teto seguro. Testar 10–20 vendas DEMO sem OOM.
- Homologar um debito E um credito aprovados antes de entrar em producao.
- Executar python3 -m unittest discover -s test -p test_kiosk_lowram.py e bash scripts/check-project.sh; executar o build da ISO pelo GitHub Actions.

ESTADO: estrutura de 0.2.8 pronta no codigo; benchmark depois, instalacao persistente, corte de energia no clone e credito aprovado ainda dependem de evidencia. Nao declarar homologacao de producao.
