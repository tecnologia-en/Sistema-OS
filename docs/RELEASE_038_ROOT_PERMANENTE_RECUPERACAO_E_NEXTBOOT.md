# Enfoque OS 0.2.38 — root apos UMA aprovacao, recuperacao e proximo boot

Data de preparacao: 10/11/2026. Versao PILOTO, homologacao em hardware
e restauracao real necessarias antes de liberar todos os caixas.

## 1. Objetivo

A TI concede UMA autorizacao administrativa Zero Touch ao PC novo:
- PC gera identidade individual, chave Ed25519 e prova de posse no First Boot.
- A TI confere o codigo/fingerprint na Intranet e aprova aquela maquina.
- A VPS provisiona chave privada de administracao por computador.
- O PC recebe SOMENTE a chave publica da TI e cria tunel reverso.
- Aprovacao fica persistente ate revogacao explicita da TI.
- Depois disso, cada novo comando root NAO solicita senha, codigo ou
  consentimento repetido; a identidade SSH e validada em CADA comando.

Acesso equivalente a root completo: programas, pacotes, CUPS, systemd,
snapshot, rede, disco, reinicio e comandos arbitrarios via sudo -n.
O agente nao roda permanentemente como root. A acao privilegiada esta no
canal SSH de administracao isolado, vinculado ao PC aprovado.

Mantidos:
- Chaves privadas SSH geradas no servidor e exclusivas por UUID.
- Sem acesso SSH publico: 127.0.0.1 apenas, tunel reverso no VPS.
- Host key do PC fixada; revogacao no painel encerra o acesso ao tunel.
- Auditoria por dispositivo/horario/resultado e hash do comando.
- Agente grafico e agente WSS continuam sem elevacao de privilegio.
- Sem codigo/senha privada na ISO, no Git ou na memoria da sessao.
- Existe somente UM gate root: aprovado em Zero Touch; antiga aprovacao
  do agente MCP e separada apenas para as funcoes nao privilegiadas.

Para PCs ja instalados 0.2.32: zero-touch.timer ja esta disponivel.
Aprovacao zero-touch pendente deve ser feita uma unica vez pela TI.
O fato de estar aprovado no antigo Root MCP NAO equivale a aprovar o
canal administrativo com sua identidade criptografica.

Modulo servidor: server/pc-admin-ssh.mjs
Ferramenta MCP: pc_admin_run(deviceId,program,args,timeoutMs).
Nao exige mais confirmacao literal AUTORIZO_ROOT por comando.

## 2. Recuperacao antes de atualizar

Scripts:
- /usr/local/sbin/enfoque-recovery-image
- /usr/local/sbin/enfoque-manutencao
- /usr/local/sbin/enfoque-update

No EXT4, sem Timeshift, o novo fallback cria automaticamente uma COPIA DE
RECUPERACAO DO SISTEMA VERIFICADA antes de permitir APT. Preserva permissoes,
ACL, atributos, dono e arquivos EFI quando montados. A imagem usa rsync e tar.

Comandos administrativos:
  /usr/local/sbin/enfoque-recovery-image status
  /usr/local/sbin/enfoque-recovery-image create --reason "Antes da atualizacao"
  /usr/local/sbin/enfoque-recovery-image list
  /usr/local/sbin/enfoque-recovery-image verify image-AAAAMMDDTHHMMSSZ-xxxxxxxx

Arquivos ficam em:
  /var/backups/enfoque-os/recovery/image-*/rootfs.tar.gz
  /var/backups/enfoque-os/recovery/image-*/efi.tar.gz (se aplicavel)
  /var/backups/enfoque-os/recovery/image-*/manifest.json

A criacao verifica o SHA-256 e relê cada arquivo compactado. Se falhar,
a atualizacao nao e liberada e o estado anterior fica preservado.

LIMITACOES IMPORTANTES:
- NAO e imagem bit-a-bit nem ISO bootavel de recuperacao.
- Copia feita com sistema online nao e snapshot atomico de bancos abertos.
- Guarda os dados NO MESMO DISCO; falha fisica/perda de disco elimina copia.
- Requer espaco livre suficiente para estagio+arquivo e sistema operacional.
- E recomendada copia adicional fora do PC antes de trabalhos sensiveis.
- A restauracao ainda requer ISO Live/Rescue e validacao manual em piloto.
- O software nao promete rollback de boot automatico.

A integracao do gestor de manutencao prioriza Btrfs/Snapper ou Timeshift
validamente configurado. Na ausencia, usa o novo arquivo de recuperacao
local apenas quando EXT4 e ha espaco suficiente. Se nenhum backend estiver
pronto, a atualizacao permanece bloqueada.

## 3. Atualizacao agendada para PROXIMO boot

Scripts:
- /usr/local/sbin/enfoque-update-nextboot
- /etc/systemd/system/enfoque-update-nextboot.timer
- /etc/systemd/system/enfoque-update-nextboot.service

No computador com a v0.2.38 instalada:
  sudo enfoque-update-nextboot schedule 0.2.39
  sudo enfoque-update-nextboot status
  sudo enfoque-update-nextboot cancel

O agendamento nao baixa nem instala imediatamente. Vincula o pedido
ao identificador do boot atual, e mesmo que o timer acorde ele nao o
executa no mesmo boot. Apos proxima inicializacao, aguarda 2 minutos,
rede online e executa o enfoque-update apply-core da versao agendada.

O enfoque-update valida APT ASSINADO, cria recuperacao ANTES da mutacao
e so entao instala a versao exata. Sucesso/erro ficam em:
  /var/lib/enfoque-update/nextboot-result.json
Falha NAO e repetida indefinidamente em todos os boots: necessidade de
novo agendamento apos diagnostico.

Agendar e cancelar exigem root, mas apos a aprovacao inicial da TI podem
ser chamados via pc_admin_run sem novas permissoes. Uma tarefa agendada
pode ser enviada por comando sem abrir janelas no caixa.

## 4. Implantacao e compatibilidade

O push da v0.2.38 dispara compilacao de ISO e pacote APT; push NAO
significa que PCs existentes receberam ou instalaram automaticamente.
Publicacao APT continua exigindo assinatura no servidor.

PCs de Itaipu da v0.2.32 antes desta release:
- root via canal TI ainda nao ativo enquanto Zero Touch estiver pendente.
- snapshot automatico 0.2.38 ainda NAO existe neles, depende upgrade.
- a v0.2.32 exige Timeshift na campanha APT e nao pode ser forçada
  silenciosamente sem uma recuperacao real.
- apos a UNICA aprovacao administrativa Zero Touch, o canal root SSH
  existente na v0.2.32 pode permitir manutencao/preparacao do backup.
- depois de criar e validar recuperacao nos computadores antigos, instalar
  o pacote assinado e checar 0.2.38, agentes, impressoras e conexao.
- nenhum PC deve ser formatado ou reiniciado automaticamente para este
  trabalho sem solicitar explicitamente a acao.

## 5. Homologacao

- Testes de Zero Touch: pending nega, approved permite, revoked nega.
- O mesmo PC aprovado executa MULTIPLOS comandos root sem nova senha.
- Host SSH pin e assinatura de identidade continuam obrigatorios.
- Teste de criacao, hash, leitura e corrupcao em diretório descartavel.
- Simular agendamento no boot atual (deve esperar).
- Simular boot seguinte (deve chamar enfoque-update).
- Simular falha (deve registrar, parar e nao repetir em loop).
- Testar disco cheio e arquivos mudando: jamais atualizar sem recuperacao.
- Testar em VM: criacao de imagem no SO completo e restauracao offline.
- Testar em piloto fisico: CUPS, rede, TEF, Chrome e acesso ao agente.
- Somente apos teste decidir sobre publicar em todos os PCs da loja.
