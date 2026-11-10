# Enfoque OS 0.2.39 — liberaçao única de root na Intranet, sem chave manual

Data: 10/11/2026 · canal: piloto · Debian 13 XFCE.

## O que muda para a pessoa que instala

A pessoa que instala o Enfoque OS continua fazendo apenas o cadastro
que ja conhece: nome do PC, empresa e loja. Nao precisa inserir senha
administrativa, chave SSH, codigo de 10 caracteres, arquivo PEM ou comando
no terminal para habilitar acesso remoto da TI.

Apos clicar "Concluir configuracao", o instalador:
1. Gera e salva a identidade individual da maquina (fluxo existente).
2. Define o hostname da maquina.
3. Corrige /etc/hosts para associar 127.0.1.1 ao hostname atual.
4. Salva o perfil de primeiro uso, root-owned.
5. Inicia em segundo plano o service enfoque-zero-touch para inscrever a
   maquina. O timer repete a consulta periodicamente enquanto houver rede.
6. Exibe apenas a identificacao do PC e instrui a TI a usar a Intranet.

## Unica autorizacao na Intranet

Pagina: https://intranet.enfoquepapelaria.com.br/acesso-remoto.html

Na secao "Novos computadores — liberar acesso completo da TI":
- A TI autenticada confere nome, empresa/loja, UUID e comunicacao recente.
- Clica "Liberar acesso completo (root)" e confirma UMA vez.
- A interface nao pede codigo nem chave.
- A API verifica sessao de administrador TI, cabeçalho de acao administrativa
  e o campo de concessao root explicita.
- O registro so e aprovado se o dispositivo tiver enviado inscricao
  assinada por Ed25519 e realizado uma consulta de status assinada nos
  ultimos 15 minutos. Dispositivo offline/stale nao e aprovado as cegas.
- O backend usa o codigo derivado da chave publica guardado no registro;
  ele nao sai para o usuario nem precisa ser digitado.
- A VPS cria uma chave SSH exclusiva por computador e armazena a privada
  SOMENTE no servidor. A chave publica da TI e entregue pelo poll assinado.
- O PC ativa sshd somente no loopback e um tunel reverso individual
  para localhost da VPS. A chave de host de destino e fixada/pinned.
- A autorizacao dura ate que a TI clique "Revogar acesso root".
- Rejeitar e revogar tambem nao exigem introduzir chaves ou codigos.
- O agente normal de sessao nao recebe root permanente no processo:
  o canal administrativo dedicado usa enfoque-ti e sudo -n como root.

Registro: server/zero-touch-registry.mjs.
Rotas: server/zero-touch-routes.mjs.
Referencia do script UI implantado na Intranet: server/intranet-zero-touch.js.
Ativacao do PC: /usr/local/sbin/enfoque-zero-touch.
Servicos: enfoque-zero-touch.timer, enfoque-zero-touch.service, enfoque-tunnel.service.
Script de primeiro uso: /usr/local/sbin/enfoque-firstboot-apply.

## Correcao importante: sudo preso no DNS

Antes da 0.2.39, a instalacao criava /etc/hosts com "enfoque-novo"
e o primeiro acesso alterava /etc/hostname para "caixa1-itaipu", por exemplo,
sem atualizar /etc/hosts. Em redes com DNS lento, sudo consultava o
hostname errado e podia ficar bloqueado por muito tempo.

A 0.2.39:
- atualiza 127.0.1.1 em /etc/hosts no primeiro uso;
- preserva aliases e outras entradas do arquivo de hosts;
- empacota /usr/local/sbin/enfoque-hostname-repair, root-only;
- executa reparo antes de cada consulta Zero Touch e no postinst do pacote
  de atualizacao do Enfoque OS, inclusive em maquinas ja instaladas.

Nao ha mudanca de senha sudo, PAM ou autorizacao universal.
A conta enfoque-ti so recebe a chave SSH individual aprovada.

## Versoes e atualizacoes

A ISO 0.2.39 inclui todas as funcionalidades anteriores, inclusive:
- backup de arquivos ao instalar, ignorando .iso e mostrando progresso GB;
- teclado pt-BR e suporte Wi-Fi;
- bloqueio por senha apos 15 minutos e tela preta apos 3 minutos;
- firewall nftables conservador de conexoes de entrada;
- acesso root via chave por PC apos UMA liberacao;
- ferramentas de recuperacao e agendamento de APT assinado proximo boot.

Aprovacao do PC nao instala pacotes automaticamente, nao formata nem
reprograma o bootloader; atualizacoes precisam ser solicitadas pela TI.

Para PCs antigos que ja tem Zero Touch em 0.2.32, o servidor pode
aprovar o canal SSH sem precisar instalar a ISO nova, mas o reparo
de hostname e o fluxo de recuperacao automatica devem ser testados
antes da atualizacao silenciosa em massa. A ISO nao e substituto
de APT nem transfere o instalador para maquinas ja instaladas.

## Testes de aceitacao

- [ ] VM nova: preencher apenas nome, empresa e loja.
- [ ] Conferir na Intranet pedido pendente sem pedir chave ou codigo.
- [ ] Pedido antigo sem status assinado recente nao pode receber root.
- [ ] Admin TI libera root em um unico clique e confirmacao.
- [ ] PC ativa o tunel sem ninguem abrir terminal.
- [ ] TI executa id -u via canal root e recebe 0.
- [ ] TI executa segundo comando root sem nova autorizacao.
- [ ] hostnamectl e /etc/hosts resolvem hostname atual sem acesso DNS.
- [ ] TI revoga root e teste root posterior e negado.
- [ ] Firefox/Chrome, impressora local, AnyDesk e agentes seguem funcionando.
- [ ] Reinstalacao no mesmo hardware cria identidade nova e pede aprovacao de novo.

Obs.: testes unitarios de protocolo e instalacao nao substituem
homologacao da conexao real root, CUPS, firewall e recuperacao em hardware.
