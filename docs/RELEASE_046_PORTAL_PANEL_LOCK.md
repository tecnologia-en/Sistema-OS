# Enfoque OS 0.2.46 - Seleção de planilhas e personalização administrativa

**Entrega solicitada:** SOMENTE GitHub (código + build de ISO + artefato DEB).
**Não publicado no APT da Intranet:** após a build, aguardar autorização explícita
da TI para assinar/publicar o pacote 0.2.46-1. Nenhuma campanha de atualização
de PCs é criada e nenhuma ISO é instalada automaticamente.

## 1. Anexos de fechamento de caixa no Chrome

Os cinco computadores da Ilha Plaza estavam sem
`xdg-desktop-portal` e `xdg-desktop-portal-gtk`.
A correção local foi aplicada em 11/11/2026 sem reiniciar os navegadores:
as cinco sessões responderam via DBus ao método
`org.freedesktop.portal.FileChooser` (versão 4) com os serviços GTK ativos.
As planilhas de Caixa 1 e Caixa 2 já tinham leitura local normal; a API da
Intranet retornava HTTP 200 nas pré-visualizações submetidas corretamente.

A ISO 0.2.46 inclui ambos os pacotes no `enfoque-base.list.chroot`.
O DEB `enfoque-os-core_0.2.46-1_all.deb` inclui ambos no campo `Depends`,
obrigando o gerenciador APT a instalar as dependências **também nos
equipamentos existentes**. O GTK Portal é ativado sob demanda via DBus.
A implementação não apaga planilhas, não mexe nos logins e não muda
permissões de acesso aos arquivos.

**Limite:** o teste de seleção real em um Chrome interativo ainda depende
da equipe em frente ao PC. Uma janela que o Chromium interpreta como
"cancelada" ainda pode ocorrer: orientar selecionar o arquivo e clicar
em **Abrir** ou arrastar o arquivo para o formulário da Intranet.

## 2. Personalização somente por acesso administrativo

O bloqueio antigo de `position-locked=true` impedia **mover** a barra,
mas não impedia clique direito nas propriedades do botão Iniciar. Agora:

- `/etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml`
  contém o **layout corporativo completo** com
  `<channel name="xfce4-panel" version="1.0" unlocked="root">`.
  Xfconf usa essa política mesmo se já existir um painel personalizado
  em `~/.config/xfce4/xfconf/xfce-perchannel-xml/`.
  Isso protege posição, itens, plugins e ícone Enfoque.
- `/etc/xdg/xfce4/kiosk/kioskrc` define
  `[xfce4-panel] CustomizePanel=NONE` como compatibilidade com XFCE kiosk;
  propriedades/remover/adicionar itens ficam restritos.
- O tema Arc, ícones EnfoqueFluent, fonte corporativa e tema das
  janelas recebem política pontual `unlocked="root"` em
  `xsettings.xml` e `xfwm4.xml`. Não bloqueia parâmetros de mouse,
  teclado, escala por monitor ou sessão de usuário.
  **Compatibilidade com Debian:** o pacote oficial `xfce4-settings` também
  contém `xsettings.xml`. A 0.2.46 utiliza `dpkg-divert` no `preinst`
  para preservar o arquivo original como `xsettings.xml.distrib`.
  O arquivo corporativo não é declarado como `conffile`, evitando
  perguntas interativas durante a atualização. Na remoção do pacote,
  o `postrm` restaura o original do Debian. A reinstalação do XFCE,
  sem perda da configuração corporativa, foi testada no Debian 13.
- O canal da área de trabalho recebe bloqueio de root: o papel de
  parede já era protegido, e o controle de exibir/remover ícones agora
  também é exclusivo da TI. Validado com a API nativa Xfconf.
  **Criar, mover ou abrir arquivos na Área de Trabalho continua permitido.**
- A logo real vem de `/usr/share/applications/enfoque-menu.desktop`
  e `/usr/share/icons/...`, ambos sob controle do pacote.
  O usuário local não recebe autorização root apenas por estar logado.
- O acesso administrativo continua pelo caminho TI/SSH root aprovado,
  sem criar senha fixa, mudar sudoers, adicionar botão de desbloqueio
  ou permitir bypass dentro da sessão comum.

A política é carregada por Xfconf/XFCE quando uma nova sessão gráfica
inicia. A atualização **não encerra o Chrome, não derruba o painel e
não reinicia o computador durante o trabalho**. Os bloqueios de UI entram
em vigor depois de encerrar a sessão e entrar novamente. Em caso de erro,
a TI pode restaurar o pacote anterior ou editar/remover os arquivos
administrativos e reiniciar a sessão gráfica na manutenção.

## Validação

- `python3 -m unittest discover -s test -p test_release_046.py -v`
- `python3 -m unittest discover -s test -p 'test_*.py' -q`
- `bash scripts/check-project.sh`
- `bash scripts/check-visual.sh`
- `python3 scripts/build-update-package.py --output ...`
- `bash scripts/test-xfce-diversion.sh` (apenas em contêiner descartável Debian 13)
- Instalar pacote só em contêiner/VM de homologação, não em lojas.
- Testar usuário comum tentando alterar painel, tema e o botão Iniciar:
  as mudanças não podem ser aplicadas. A API nativa
  `xfconf_channel_is_property_locked` deve retornar verdadeiro em todas
  as propriedades. Rodar `scripts/test-xfce-kiosk-policy.sh` em contêiner
  Debian 13 e conferir o valor efetivo após tentativa de escrita.
- Conferir menu de contexto do lançador Enfoque, propriedades desabilitadas,
  ícone preservado, aplicativos abertos funcionando e painel sem falhas.

**Condição de publicação:** só executar
`scripts/publish-update-repo.sh` no VPS **após solicitação expressa da TI**.
O push para GitHub cria um prerelease/pacote de build para revisão;
não altera `/srv/enfoque-os-archive`.
