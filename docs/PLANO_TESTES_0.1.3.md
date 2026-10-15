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

- [x] Build GitHub Actions concluiu com sucesso; ISO e SHA256SUMS publicados.
- [x] Windows recebeu quatro partes e manifesto, confirmou hashes e montou ISO somente na VM de testes.
- [x] BIOS: Live iniciou automaticamente apos 5 s, sem teclado.
- [x] XFCE entrou sozinho com wallpaper Enfoque OS, painel e janelas Arc-Dark.
- [ ] Conferir manualmente atalho Sobre o Enfoque OS pelo menu; comando de diagnostico e release 0.1.3 funcionaram.
- [x] `setxkbmap -query`: `br` + `abnt2`; `locale -a`: `pt_BR.utf8`.
- [x] `timedatectl`: America/Sao_Paulo, NTP ativo, `System clock synchronized: yes`.
- [x] Firefox ESR abriu HTTPS publico. Login SIGE retirado do escopo conforme solicitado.
- [x] RAM com terminal: 468 MiB usados; com Firefox: 961 MiB usados em 1973 MiB.
- [ ] Estabilidade do reboot: houve um kernel panic em uma tentativa; uma reinicializacao posterior funcionou. Investigar antes de homologar.
- [x] Teste UEFI na VM concluido com desktop; firmware BIOS original restaurado.
- [x] Falha documentada; preservar a 0.1.2 como referencia do piloto anterior e manter 0.1.3 em observacao.

## Observacoes

A ISO continua Live, sem persistencia e sem instalador homologado. Nao usar em caixa/PDV, computadores das lojas ou equipamentos corporativos. Nenhuma conta, chave, senha, certificado ou link interno deve ser incluido no repositorio publico.

Referencia de bootloader: Debian Live Manual, secao 11.1, https://live-team.pages.debian.net/live-manual/html/live-manual/customizing-binary.en.html .
