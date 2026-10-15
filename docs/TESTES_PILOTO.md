# Checklist do piloto em VM de 2 GB

## Resultado Enfoque OS 0.1.2 - 15/10/2026

- [x] ISO compilada no GitHub Actions; SHA-256 conferido
- [x] Live system inicia em VM VirtualBox com 2048 MB e usuario automatico
- [x] Versao interna 0.1.2 e diagnostico executando
- [x] Layout BR ABNT2 (`setxkbmap -query`)
- [x] Locale `pt_BR.utf8` presente, menus em portugues
- [x] `America/Sao_Paulo` UTC-3 ativo
- [x] Firefox ESR navega via HTTPS ate o site oficial Debian
- [x] DNS/IP/NAT funcionando: ping 2/2, 0% perda
- [x] RAM sem Firefox ~412 MiB; com Firefox 998 MiB de 1973 MiB
- [x] Reboot pelo Linux e retorno ao XFCE
- [ ] Automaticamente selecionar Live no menu de boot (ainda manual)
- [ ] Resolver/avaliar os avisos de driver grafico vmwgfx e sincronizacao NTP
- [ ] SIGE, perifericos, HD, instalador, atualizacoes e seguranca em computadores reais

Relatorio: [TESTE_2026-10-15_0.1.2.md](TESTE_2026-10-15_0.1.2.md).
**Piloto Live aprovado na VM; ainda nao homologado para lojas.**

## Resultado Enfoque OS 0.1.1 - 15/10/2026

- [x] ISO compilada; hash SHA-256 conferido
- [x] Inicializacao pela ISO na VM 2 GB
- [x] Usuario Live e desktop XFCE funcionam
- [x] Memoria em repouso medida: 554 MiB usados
- [x] Firefox ESR navega, HTTPS e DNS funcionam
- [x] Thunar abre e permite criar/remover arquivo de teste
- [x] Enfoque Diagnostico funciona
- [x] Reinicializacao concluida e desktop recuperado
- [ ] Teclado brasileiro ABNT2 funcional desde o boot (atual: X11 US)
- [ ] Locale pt_BR.UTF-8 funcional (atual: ausente)
- [ ] Fuso horario America/Sao_Paulo (atual: UTC)
- [ ] Testes SIGE, periféricos, carga real e hardware
- [ ] Implantacao, seguranca, usuarios limitados e rollback

Relatorio detalhado: [TESTE_2026-10-15_0.1.1.md](TESTE_2026-10-15_0.1.1.md).

## Proximo passo

Avancar o proximo ciclo de melhorias em codigo no Windows/GitHub e validar cada ISO nova na VM de testes.
Nao usar em PDVs ou computadores de producao.
