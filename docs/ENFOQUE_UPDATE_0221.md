# Enfoque OS 0.2.21 — Enfoque Update

## Objetivo e escopo

O Enfoque Update usa o gerenciador APT do Debian para atualizar o sistema
instalado sem gravar pendrive ou reinstalar a ISO.

- **Debian 13:** pacotes instalados, bibliotecas, kernel, firmware e
  dependencias resolvidas pelo APT.
- **Aplicativos:** LibreOffice e aplicativos instalados de repositorios APT
  (Chrome e AnyDesk quando as suas fontes oficiais estao configuradas).
- **Enfoque OS:** pacote versionado `enfoque-os-core` inclui scripts,
  servicos, telas, atalhos, recursos graficos e o proprio atualizador.
- **Outros componentes internos:** podem ser distribuidos como pacotes
  Enfoque adicionais no repositorio assinado; nao executar scripts
  recebidos por HTTP sem autenticacao.
- **Sem conexao grafica:** atualizador e terminal remoto sao coisas distintas.
  O AnyDesk continua separado. O agente de diagnostico permanece limitado.

## Modelo de seguranca

Repositorio: `https://intranet.enfoquepapelaria.com.br/enfoque-os-updates`
(chave publica: `/usr/share/keyrings/enfoque-os-archive-keyring.gpg`).

A chave PRIVADA de assinatura permanece somente na VPS, em
`/var/lib/enfoque-update/keyring`, de acesso root. Jamais colocar
a chave privada na ISO, GitHub ou computador da loja.

APT confere a assinatura do `InRelease` e os hashes dos pacotes.
O sistema recusa fontes sem chave valida e nao desativa TLS nem a
validacao de assinaturas. O repositorio Enfoque comeca DESABILITADO
ate que o atualizador baixe e verifique um `InRelease` valido. Assim,
as atualizacoes do Debian nao dependem da publicacao do repositorio.
A ativacao do canal corporativo depende da publicacao autorizada no VPS.

## Uso no computador instalado

```sh
enfoque-update status                     # situacao e reinicio pendente
sudo enfoque-update check                # atualiza indices e lista pendencias
sudo enfoque-update apply                # atualiza todos os pacotes do APT
sudo enfoque-update install pacote       # instala pacote aprovado da fonte APT
sudo enfoque-update remove pacote        # remove pacote selecionado
sudo enfoque-update rollback-core 0.2.21-1 # rollback do pacote Enfoque, se disponivel
sudo enfoque-update auto on              # TI habilita instalacao semanal automatica
sudo enfoque-update auto off             # TI desabilita instalacao automatica
enfoque-update history                    # ultimos registros resumidos
```

Pela interface grafica, o item `Enfoque Update` abre o terminal local
solicitando a senha de administrador para aplicar as atualizacoes.

- A verificacao roda diariamente com atraso aleatorio.
- A instalacao automatica roda no domingo se, e SOMENTE se,
  `auto on` tiver sido ativado administrativamente.
- Nao reinicia o computador automaticamente. O estado
  `reboot_required` informa a necessidade de reiniciar.
- Historico local: `/var/log/enfoque-update/history.jsonl`.
- Situacao: `/var/lib/enfoque-update/status.json`.
- A operacao usa um lock de execucao para impedir sobreposicao.

## Publicar nova versao

Depois de revisar e testar a alteracao:

```sh
python3 scripts/build-update-package.py --output /diretorio/temporario
sudo scripts/publish-update-repo.sh /diretorio/temporario/enfoque-os-core_VERSION-1_all.deb
```

O publicador verifica os metadados do pacote, gera `Packages.gz`,
assina `InRelease` e `Release.gpg` com a chave privada da VPS,
valida as assinaturas e troca o indice do APT de forma atomica.
Nao publicar uma nova versao no canal stable sem liberacao da TI.

A publicacao do primeiro repositorio corporativo depende de uma operacao
administrativa autorizada no VPS; nao considerar esse passo concluido
se a ferramenta administrativa bloquear a assinatura/publicacao.

O mesmo pacote e construido durante o build da ISO, registrado em
`config/packages.chroot/`, para que computadores novos possam receber
atualizacoes sem precisar reinstalar o sistema.

## Limites reais (nao prometer atualizacao literalmente ilimitada)

O APT atualiza tudo que for distribuido em pacotes confiaveis.
Softwares copiados manualmente fora do APT e alteracoes de firmware
especificas precisam de seus proprios pacotes ou instaladores
homologados; o atualizador nao executa shell arbitrario vindo do servidor.

Atualizacoes de kernel, drivers e certas bibliotecas precisam de
reinicio ou reinicio de servicos. Para reversao total de estado, dados
e sistema de arquivos ext4, e necessario backup/imagem/snapshot
separado; `rollback-core` retrocede somente o pacote Enfoque se
uma versao anterior assinada estiver disponivel.

A 0.2.20 NAO possui o pacote inicial nem a chave APT. Seu primeiro
upgrade para o modelo gerenciado depende de um bootstrap local
assinado ou reinstalacao com a ISO 0.2.21. Depois disso,
as versoes futuras poderao chegar pela rede.

## Critérios de aceite

- [x] Pacote Enfoque versionado e instalavel, com chave publica na ISO.
- [x] CLI de atualizacao do SO inteiro e dos pacotes internos.
- [x] Verificacao diaria e janela semanal configuravel pela TI.
- [x] Atualizacao remota por APT sem pendrive nas proximas versoes.
- [ ] Verificar pacote no sistema instalado e testar fim a fim em
      computador piloto; nao confundir testes estaticos com homologacao.
- [ ] Verificar aplicativos especiais da loja e fluxo de reinicio real
      antes de ativar a janela automatica em producao.

O ISO 0.2.21 foi solicitado sem testes de VM nesta rodada.
Qualquer compilacao bem-sucedida deve permanecer marcada como PILOTO
ate serem feitos os testes de instalacao fisica e de atualizacoes reais.
