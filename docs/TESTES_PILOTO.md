# Checklist do piloto em VM de 2 GB

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

Compilar 0.1.2 no GitHub Actions e repetir verificacoes.
Nao usar em PDVs ou computadores de producao.
