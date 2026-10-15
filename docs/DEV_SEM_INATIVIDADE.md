# Configurar inatividade na VM de desenvolvimento

Esse ajuste e **apenas para a VM de desenvolvimento**. A desativacao de bloqueio automatico reduz a seguranca fisica e **nao deve ser aplicada em computadores corporativos usados por funcionarios**.

No terminal XFCE, como usuario normal:

```bash
cd ~/Sistema-OS
git pull --ff-only
bash scripts/dev-disable-idle.sh
```

O script:
- desativa suspensao e apagamento de tela por inatividade na sessao XFCE;
- desativa screensaver e bloqueio automatico (inclui override no autostart);
- torna `xset s off -dpms` persistente para futuros logins;
- nao altera configuracoes do Windows nem do servidor.

Verificacao:

```bash
xset q
xfconf-query -c xfce4-power-manager -lv
xfconf-query -c xfce4-screensaver -lv
```

Esperado: Screen Saver timeout 0; DPMS Disabled; configuracoes de bloqueio false.
Caso a tela continue bloqueando, identifique o processo com `pgrep -a xfce4-screensaver` e `pgrep -a light-locker`, e examine as configuracoes de Sessao e Inicializacao > Inicializacao automatica de aplicativos.
