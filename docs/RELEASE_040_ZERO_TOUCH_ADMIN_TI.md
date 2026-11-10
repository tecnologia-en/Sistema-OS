# Enfoque OS 0.2.40 - correção de cadastro Zero Touch da Administração / TI

## Problema confirmado no notebook TESTE2 (instalado com 0.2.31)

Em 10/11/2026, o notebook de teste, hostname teste2, foi encontrado online,
com agente comum apto a receber comandos executados como usuario enfoque
(UID 1000), mas sem SSH root ativado.

Foi executado em segundo plano um teste nao interativo de sudo:
  nohup timeout 300 sudo -n /usr/bin/id -u > /tmp/enfoque-teste2-sudo-check.txt 2>&1 &
Resposta:
  sudo: não foi possível resolver máquina teste2: Nome ou serviço desconhecido
  sudo: uma senha é necessária

O arquivo /etc/hosts continha "127.0.1.1 enfoque-novo", apesar de o
hostname ser "teste2". O problema de hostname ja possui correcao no
post-install a partir de 0.2.39, mas NAO pode ser aplicado ao equipamento
antigo sem root.

Outra falha independente foi reproduzida usando a própria funcao
local_info() do cliente Zero Touch 0.2.31:
  ValueError: Unidade invalida

O perfil de primeiro uso registrou:
  pcName = TESTE2
  companyId = enfoque
  unitId = administracao
  unitName = Administracao / TI

O cliente antigo validava unitName com o mesmo regex do nome do PC e
recusava qualquer "/". A funcao falha antes da criacao de chaves
Ed25519, e antes de enviar o cadastro ao servidor. O registro Zero Touch
de TESTE2 NAO existe no servidor.

O backend Zero Touch, mesmo com o cliente corrigido, TAMBEM recusava
"Administracao / TI", pois usava o mesmo SAFE_NAME sem "/".

## Correcao 0.2.40

1. Cliente Linux, /usr/local/sbin/enfoque-zero-touch:
   - o nome do PC continua estritamente validado, sem "/" ou caminhos;
   - unitName agora admite a excecao EXATA
     (unitId=administracao, unitName="Administracao / TI");
   - qualquer outra barra, path "..", unitId inconsistente ou
     caracteres nao previstos permanece proibido.
2. Backend servidor, server/zero-touch-registry.mjs:
   - replica a mesma excecao EXATA;
   - mantem validacao de chave Ed25519, assinatura de registro,
     nonce anti-replay, status assinado e aprovacao somente de TI.
3. Testes de regressao:
   - registro Administracao/TI assinado passa,
   - nomes de maquinas perigosos e paths continuam recusados,
   - testes anteriores de token e revogacao continuam passando.

A 0.2.40 preserva os recursos anteriores:
- tela escura sem senha apos 3 minutos e senha apos 15;
- firewall nftables;
- canal root via SSH reverso do Zero Touch com uma aprovacao na Intranet;
- recuperacao e agendamento de instalacao de pacote APT assinado;
- First Boot que cadastra PC/empresa/loja e corrige /etc/hosts.

## Limitacao operacional importante: TESTE2 0.2.31

A nova ISO ou pacote APT NAO modifica automaticamente a instalacao
antiga. Para atualizar TESTE2 sem cliques na sessao, seria necessario
ter um dos canais privilegiados previamente autorizado (SSH root da TI,
sudo com credencial valida ou worker APT capaz de instalar com snapshot).

Situacao observada:
- Zero Touch root pendente: NAO INSCRITO por validacao do nome da unidade.
- SSH administrativo: ssh.service / enfoque-tunnel.service inativos.
- Agente MCP comum: online, comandos como UID 1000 apenas.
- sudo -n: exige senha. Nao e apenas demora de DNS.
- Sistema: 0.2.31 / EXT4, Timeshift instalado mas SEM destino
  de snapshot configurado.
- Atualizador legado exige um snapshot valido ANTES de qualquer pacote.
  Um arquivo tar no HOME nao satisfaz esse requisito.
- Disco raiz /dev/sda3: aprox. 216 GiB livres.

Nao ajustar sudoers, PAM, root, /etc/hosts ou executar apt/dpkg
sem privilegio. Nao desativar guarda de snapshot.

O ciclo para a primeira correcao num PC anterior e:
1. Ter ao menos UMA autorizacao administrativa legitima capaz de
   atualizar o cliente, configurar o Timeshift e corrigir hostname
   (por exemplo, credencial no terminal administrativo fisico ou
   outra ferramenta corporativa root autorizada).
2. Configurar destino de restauracao e CRIAR/VALIDAR snapshot.
3. Instalar enfoque-os-core_0.2.40-1_all.deb pelo repositorio APT
   assinado, usando o updater.
4. Verificar Zero Touch = pending no painel e aprovar por TI.
5. Verificar endpoint SSH root por chave individual e manter auditoria.
6. Repetir diagnostico do agente, rede, CUPS e boot.

Esta release evita a mesma falha nas proximas instalacoes.
Ela nao constitui prova de restauracao real ou de upgrade de 0.2.31
para 0.2.40 no hardware TESTE2.
