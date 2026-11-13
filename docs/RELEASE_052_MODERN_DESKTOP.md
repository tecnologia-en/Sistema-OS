# Enfoque OS 0.2.52 — desktop moderno e compacto

Janelas no padrão Windows: menu à esquerda, minimizar/maximizar/fechar à direita, tema GTK EnfoqueModern sobre Arc. Barra opaca de 46 px, botões compactos, ID discreto, ícones SVG com traços e bordas consistentes. Menu, pesquisa, notificações, calendário e impressoras mantêm GTK3/XFCE; sem nova shell Electron, blur ou compositor obrigatório. XShape recorta os cantos das superfícies sem composição.

A seta abre um painel com os ícones reais dos aplicativos em segundo plano (StatusNotifierItem/DBusMenu e XEmbed). O controle de brilho fica abaixo dos ícones e aparece apenas com bateria presente e backlight ajustável. Usa brightnessctl como o usuário da sessão, com debounce e erro explícito se faltar permissão. Calculadora, capturas e gerenciador de tarefas são utilitários sob demanda. Ctrl+Shift+Esc já abre o gerenciador.

O sino tem ação de clique na imagem; o contador é sobreposto ao SVG, sem botão/texto clicável separado. A bateria usa SVGs brancos em quatro níveis, vermelho até 15%, raio ao carregar e nenhuma marcação sem bateria. A biblioteca de impressoras, preservação de filas e acionamento de gaveta da 0.2.51 são mantidos.

Migração por hash apenas dos arquivos oficiais anteriores. CSS personalizado é preservado. Xsession prepara os atalhos antes da barra iniciar; não reinicia sessões ativas. Não altera documentos, impressoras cadastradas, rede ou identidade dos computadores.

## Validação

- 391 testes unitários passaram; verificação gráfica isolada cobre registro/ativação SNI, clique real XEmbed e brilho presente/ausente.
- Comparação de laboratório na mesma imagem Debian/XFCE, Xvfb 1366×768, sem aplicativos de negócio: PSS agregado dos componentes gráficos 264,88 MiB na 0.2.51 e 239,66 MiB nesta candidata (aproximadamente 9,5% menor). Amostra curta, não representa RAM total de uma estação física. Utilitários adicionais não iniciam automaticamente.
- Recurso GTK Arc distribuído com sua licença Debian/GPL em `usr/share/themes/EnfoqueModern/COPYING.debian`.

## Publicação sem atualizar computadores

Os pacotes e a ISO devem ser disponibilizados na área separada `/srv/enfoque-os-preview/`, suite `preview`, e no GitHub. Não publicar esta versão em `/srv/enfoque-os-archive/dists/stable` enquanto estiver vigente a instrução de não atualizar computadores: a intranet e o agendamento consultam o stable. O publicador aceita explicitamente `ENFOQUE_REPO_ROOT=/srv/enfoque-os-preview ENFOQUE_REPO_SUITE=preview`; o pool é separado para impedir contaminação do índice estável em publicações futuras. Nenhuma campanha 0.2.52 é criada.
