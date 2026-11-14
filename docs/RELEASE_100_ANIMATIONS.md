# Enfoque OS 1.0.0 — Visual, animações e preservação operacional

## Release
- A partir desta versão o Enfoque OS passa a usar **1.0.0**, em substituição ao esquema de numeração piloto 0.2.55. Nome do produto continua Enfoque OS.
- ISO Debian 13 + pacote APT `enfoque-os-core 1.0.0-1` e biblioteca de drivers da mesma versão; sem instalar automaticamente nos computadores.
- A build anterior de 0.2.55 é cancelada automaticamente pela configuração `concurrency.cancel-in-progress: true` quando ocorre o push da 1.0.0 na mesma branch `release/enfoque-os`.

## O que entra na imagem
- Mantidos os pacotes originais AeroBird v6 HDPI + WindowsModern 1.1.1 e o menu Iniciar compacto com SVGs oficiais.
- Menu com fade-in (aprox. 180 ms) e leve subida de 13 pixels, implementado no próprio daemon GTK3 sem perder atalhos, busca, SIGE ou Chrome.
- Janelas com transparência/transições curtas pelo `picom` 12.x ou posterior (backend XRender, `fade-delta=12`, `fade-in-step=0.085`, `fade-out-step=0.11`). O arquivo central fica em `/usr/local/lib/enfoque-animations/picom-pilot.conf`.
- Inicialização controlada pelo `enfoque-animacoes-piloto` e autostart de XFCE. Se o Picom falhar, o script devolve composição nativa ao XFWM4.
- Os efeitos são **habilitados por padrão em todos os computadores Enfoque OS 1.0.0**, após iniciar uma nova sessão XFCE. O primeiro teste físico foi feito no Salão do Ilha Plaza em 14/11/2026.
- Para desligar os efeitos individualmente: `/usr/local/bin/enfoque-animacoes-desativar`. O comando desativa o autostart do usuário, restaura XFWM4 e reinicia somente o daemon do menu. O marcador `animations-disabled` impede a reativação nas próximas sessões.
- Em instalação limpa e após atualizar para 1.0.0, os efeitos são ligados por padrão em qualquer hostname quando a sessão XFCE inicia novamente, exceto se o usuário os desativou explicitamente.

## Preservações
- Drivers Bematech PDF/raster, escala de cupons, opções de gaveta/corte, bibliotecas de impressoras, sharing IPP/CUPS Pantum, Chrome, SIGE, Intranet e Zero Touch permanecem da versão anterior.
- Para a Pantum compartilhada não há ampliação da superfície de ataque: não abrir porta CUPS em rede diferente, não alterar URIs nem impressoras-padrão durante atualização.
- Sem campanha de instalação automática; a intranet deve apenas oferecer 1.0.0 depois que a ISO e o manifesto passarem na validação de checksums.

## Verificações
- Testes estáticos em `test/test_release_100.py` verificam nome da versão, animação global com opt-out individual, parâmetros de fade, rollback, dependência do Picom, impressoras e preservação visual.
- `scripts/check-project.sh` e suíte de testes antes da build; GitHub Actions compila a ISO com live-build e publica prerelease somente após validar a saída.
- A validação prática anterior no computador `salao-ilha` registrou consumo ~5 MB para o Picom e painel/Chrome/PDV preservados. Os efeitos não foram ativados nos outros PCs.

## Limites
- A ativação geral das animações na versão 1.0.0 foi solicitada pelo usuário. Equipamentos de vídeo antigos podem renderizar transparência de forma diferente; neles é possível desativar o efeito e continuar com o XFWM original.
