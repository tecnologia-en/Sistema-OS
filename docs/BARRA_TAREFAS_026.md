# Enfoque OS 0.2.26 — barra de tarefas com indicadores

## Objetivo
Barra única XFCE Docklike 0.4.3: aplicativo fixado e janela aberta usam o
mesmo ícone. Não há dois ícones para o mesmo aplicativo.

- **Fixado e fechado:** ícone normal, sem indicador.
- **Aberto, fora de foco:** fundo azul suave + linha inferior azul.
- **Aberto e em foco:** destaque azul mais forte + linha maior.
- **Pede atenção, fora de foco:** pulsa *laranja suave* alternadamente a cada
  900 ms, até o aplicativo deixar de pedir atenção ou recuperar o foco.
- **Outro programa aberto:** aparece automaticamente no Docklike.
- **Minimizado:** continua identificado como aberto.

O sinal de atenção é \`XFW_WINDOW_STATE_URGENT\` (equivalente aos hints X11
\`_NET_WM_STATE_DEMANDS_ATTENTION\`/WM_HINTS). Isso **não é um monitor de
alterações de conteúdo**: alguns programas não emitem sinal ao receber
mensagens ou atualizar uma página. O dock não deve piscar por toda mudança.

## Compilação reproduzível
Origem: xfce4-docklike-plugin 0.4.3 (XFCE, GNU GPL v3+).
Arquivo oficial em \`third_party/xfce4-docklike-plugin-0.4.3.tar.bz2\`.
SHA256 fixo:
\`e81e16b4ab1c655a3202473d78cc81617bb4829e5dd102eecabf9addd7668a9d\`.

\`patches/xfce4-docklike-attention-0.4.3.patch\` adiciona somente a classe
CSS \`enfoque_attention\` e a lógica de temporizador/cancelamento, preservando
as funções de agrupamento e atalhos do XFCE.

\`scripts/build-docklike.sh\` roda no Debian 13 da CI, antes de gerar o
\`enfoque-os-core\`. O binário é compilado no GitHub e **não** é versionado.
\`103-enfoque-docklike-attention.hook.chroot\` e o pós-instalação APT preservam
o plug-in original via \`dpkg-divert\`, instalando a extensão customizada.

## Verificações executadas
- Compilado em contêiner descartável Debian 13.
- Bibliotecas dinâmicas resolvidas no XFCE do laboratório.
- Plug-in carregado efetivamente como wrapper do Xfce Panel com ID 18.
- Mousepad e Thunar abertos na sessão de teste; hint de urgência no
  Mousepad injetado com \`xprop\`, sem crash do painel.
- Testes de código verificam as regras de aberto/em foco/atenção,
  empacotamento e checksum da origem.

## Limitações pendentes
- O comportamento final precisa ser testado em uma ISO inicializada numa
  máquina descartável, e depois num piloto físico.
- Para SIGE e Intranet abertos no Chrome comum, o aplicativo pode agrupar
  janelas sob o ícone Chrome; isso depende do identificador WM_CLASS.
- O efeito de urgência é para XFCE/X11, não para Wayland.
- Nenhuma ISO é automaticamente instalada em computadores das lojas.
