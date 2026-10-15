# Plano de testes - Enfoque OS 0.1.3

## Objetivo

Provar a identidade visual do Enfoque OS, inicializacao automatica do modo Live e sincronizacao de horario sem alterar instalacoes de producao. O codigo e as artes sao preparados no Windows; o GitHub Actions compila; o VirtualBox valida.

## Itens implementados no codigo (pendentes da ISO)

- Menu BIOS/ISOLINUX com timeout 50 decissegundos (5 s), Live como padrao e entrada de compatibilidade mantida.
- Menu GRUB/EFI com timeout de 5 s e arte de inicializacao propria; exigir teste UEFI separado antes de considerar homologado.
- Wallpaper 1920x1080 e icone originais do Enfoque OS; splash BIOS 640x480 e splash EFI 800x600. Geracao via Python + Pillow no Windows (`scripts/windows/gerar-identidade.py`).
- Tema GTK/Xfwm `Arc-Dark`, configuracao base em `/etc/skel` e autostart visual na sessao Xfce, sem alterar rede ou politica de seguranca.
- Pacote `systemd-timesyncd` incluido para sincronizacao NTP quando a rede estiver disponivel.

## Validar na VM de 2 GB

- [ ] Build GitHub Actions conclui com sucesso; ISO e SHA256SUMS publicados.
- [ ] Windows baixa a ISO, compara SHA-256 e monta exclusivamente na VM de testes.
- [ ] BIOS: nao pressionar teclado por 5 a 10 s; confirmar inicio automatico Live.
- [ ] XFCE entra sozinho, mostra wallpaper Enfoque OS e painel/janelas em tema escuro.
- [ ] Icone Sobre o Enfoque OS no menu abre diagnostico; release interno confirma 0.1.3.
- [ ] `setxkbmap -query`: `br` + `abnt2`; `locale -a`: `pt_BR.utf8`.
- [ ] `timedatectl`: fuso America/Sao_Paulo e servico NTP identificado. Observar se `System clock synchronized` passa a yes apos tempo de rede.
- [ ] Firefox ESR abre HTTPS publico; testar a tela de login SIGE **sem autenticacao e sem transacoes**.
- [ ] RAM em repouso e com navegador aberto; observar fluidez da interface.
- [ ] Reiniciar o Live, sem editar o menu, e confirmar retorno ao desktop personalizado.
- [ ] Testar boot UEFI em ambiente isolado; nao alterar EFI de maquinas reais.
- [ ] Se algum teste falhar, manter a 0.1.2 como ultima versao aprovada em VM.

## Observacoes

A ISO continua Live, sem persistencia e sem instalador homologado. Nao usar em caixa/PDV, computadores das lojas ou equipamentos corporativos. Nenhuma conta, chave, senha, certificado ou link interno deve ser incluido no repositorio publico.

Referencia de bootloader: Debian Live Manual, secao 11.1, https://live-team.pages.debian.net/live-manual/html/live-manual/customizing-binary.en.html .
