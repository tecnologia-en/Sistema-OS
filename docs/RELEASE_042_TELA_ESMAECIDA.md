# Enfoque OS 0.2.42 - descanso com papel de parede esmaecido

Data: 11/11/2026

## Alteracao unica desta versao

O modo de descanso do XFCE deixa de ser a tela preta e passa a exibir uma
versao escurecida do papel de parede atual do usuario.

- 3 minutos sem teclado/mouse: inicia o protetor de tela com o wallpaper
  escurecido. Despertar nessa fase nao solicita senha.
- 15 minutos totais sem atividade: o xfce4-screensaver aplica bloqueio
  autenticado (PAM). O mesmo tema de wallpaper fica por tras do bloqueio.
- O monitor permanece ligado: DPMS/X11 blanking e blanking automatico do
  xfce4-power-manager ficam desabilitados.
- Suspensao/hibernacao continua bloqueando imediatamente; nao alteramos o
  logout automatico, a senha ou a autenticacao do sistema.
- O sistema Live/instalador continua sem protetor para preservar o backup.

O tema usa o slideshow ja instalado no XFCE, e a imagem e gerada sob a conta
do proprio usuario em ~/.cache/enfoque-os/idle-wallpaper-042. A imagem e
recriada somente se a configuracao do wallpaper ou o arquivo original mudar.
O tema nunca captura o conteudo de janelas/aplicativos nem desenha sobre
a autenticacao PAM. A renderizacao pode variar com multi-monitor ou imagem
de fundo personalizada nao suportada pelo XFCE.

## Arquivos

- config/includes.chroot/usr/local/bin/enfoque-proteger-tela
- config/includes.chroot/usr/local/bin/enfoque-papel-parede-ocioso
- config/includes.chroot/usr/libexec/xfce4-screensaver/enfoque-wallpaper-dim
- config/includes.chroot/usr/share/applications/screensavers/enfoque-wallpaper-dim.desktop
- config/includes.chroot/etc/xdg/autostart/enfoque-proteger-tela.desktop
- scripts/build-update-package.py

## Instalacao futura (somente quando autorizado)

Gerar .deb com scripts/build-update-package.py, publicar no arquivo APT
assinado com scripts/publish-update-repo.sh. A permissao para atualizar
computadores e uma operacao administrativa separada; nao foi criada campanha
de atualizacao automatica. Nao regenerar ISO nem regravar pendrive 0.2.41.

O novo tema e configurado na proxima inicializacao da sessao XFCE pelo
autostart enfoque-proteger-tela; nao exige reinstalar o sistema operacional.
Para aplicar imediatamente durante uma sessao, o administrador pode executar
/usr/local/bin/enfoque-proteger-tela como o usuario grafico, sem reiniciar o PC.

## Validacao

- python3 -m unittest discover -s test -p test_release_042.py
- python3 -m unittest discover -s test -p 'test_*.py'
- bash scripts/check-project.sh
- git diff --check
- dpkg-deb -c ... (validar presenca dos dois componentes novos)

Teste de 3/15 minutos, wallpaper e autenticacao em hardware real continua
necessario antes de liberar uma campanha de atualizacao em massa.
