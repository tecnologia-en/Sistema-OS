# Enfoque OS 0.2.29 - migracao temporaria via servidor, sem disco extra

## Preserva a frota
A ISO permanece Enfoque OS 0.2.29. Nenhum protocolo ou caminho de
comunicacao do agente remoto existente e alterado. O PC do Salao e os
demais ja instalados continuam com a mesma versao e a mesma conexao.

## Escolhas no instalador

1. **Apagar tudo e instalar** (como antes): requer confirmacao APAGAR.
2. **Manter arquivos pessoais usando o servidor**: requer confirmacao
   MANTER e um codigo temporario de instalacao fornecido pela TI.
   O codigo temporario nao fica na ISO nem e enviado por argumento de
   processo. E gerado no proprio servidor e vale apenas uma sessao.

No segundo modo, o computador inicia pelo pendrive Live e monta o disco
antigo SOMENTE PARA LEITURA. Localiza arquivos do perfil Windows/Linux,
envia cada arquivo por HTTPS autenticado para armazenamento temporario
privado no servidor, confere SHA-256 de cada arquivo e valida o manifesto
inteiro. Apenas depois da confirmacao remota a instalacao APAGA
a tabela de particoes antiga e instala o novo sistema.

Depois a ISO baixa os arquivos do servidor para
/home/enfoque/Desktop, Downloads, Documentos, Imagens, Vídeos e Músicas.
Verifica SHA-256 dos arquivos restaurados e configura os caminhos XDG
para que fiquem visiveis no Thunar e na area de trabalho. Os atalhos
SIGE/Intranet do Enfoque OS sao mantidos quando nomes conflitam.

Para evitar excluir a unica copia antes de testar o boot, a sessao no
VPS e apagada automaticamente no PRIMEIRO BOOT INSTALADO em que todos
os arquivos sao revalidados (systemd: enfoque-install-backup-cleanup).
Se a rede falhar, a restauracao pode ser retomada ao ligar; o backup
permanece disponivel para recuperacao durante sete dias. Backups expirados
sao limpos periodicamente. O registro local de acesso ao backup e
protegido por permissao 0600 e eliminado ao completar a limpeza.

## Organizacao das pastas

| Origem | Destino Enfoque OS |
| --- | --- |
| Desktop, Area de Trabalho | ~/Desktop |
| Downloads, Transferencias | ~/Downloads |
| Documents, Documentos | ~/Documentos |
| Pictures, Imagens | ~/Imagens |
| Videos | ~/Vídeos |
| Music, Musicas | ~/Músicas |

Arquivos de perfis adicionais ficam em subpastas sem sobrescrever os
arquivos do perfil principal. Pastas locais redirecionadas do OneDrive
sao reconhecidas se os arquivos estiverem presentes fisicamente.

## Seguranca e limites

- Nao exige segundo disco, pendrive de dados, nem redimensionamento de particoes.
- O backup ocorre apenas em rede HTTPS; nao ha chave permanente dentro
  da ISO e so a TI pode emitir codigos temporarios.
- Apenas arquivos das categorias acima sao copiados. Software,
  aplicativos Windows, licencas, dados apenas na nuvem e pastas
  fora da lista NAO sao migrados.
- Criptografia BitLocker/LUKS, RAID/LVM, arquivos simbolicos e
  particoes ilegíveis sao rejeitados. Nesses casos, faca backup manual.
- A copia precisa caber na cota livre do VPS. Atualmente a API
  limita sessao a 45 GiB, soma de reservas a 60 GiB e preserva
  25 GiB livres para o sistema operacional do servidor.
- Na falta de rede, espaco, codigo valido, checksum ou upload completo,
  a instalacao fica bloqueada ANTES da formatacao.
- Se houver falha apos formatacao, a copia remota fica no servidor
  por ate sete dias. A TI podera diagnosticar pelo ID de recuperacao.
- A pasta remota e excluida somente apos comprovacao de que o
  Enfoque OS iniciou e os arquivos foram restaurados corretamente.
- Dados importantes devem ter backup separado quando possivel;
  ainda ha risco de falha fisica do disco, rede ou servidor.

## Operacao

Servidor: service isolado como usuario enfoqueos-backup,
127.0.0.1:43210 (somente Nginx acessa) e HTTPS por
https://intranet.enfoquepapelaria.com.br/enfoque-os-install-backup/.

A TI emite um codigo de instalacao, valido por duas horas e uma unica vez:
  sudo -u enfoqueos-backup python3 /opt/enfoque-os-install-backup/installer-backup-service.py issue

Para listar sessoes temporarias sem exibir tokens:
  sudo -u enfoqueos-backup python3 /opt/enfoque-os-install-backup/installer-backup-service.py list

Para remover backups expirados:
  sudo -u enfoqueos-backup python3 /opt/enfoque-os-install-backup/installer-backup-service.py purge

## Testes
Usar apenas discos virtuais criados no VPS. A bateria inclui integracao
HTTPS simulada (loopback), hashes, cota, codigo de uso unico, manifesto
malicioso, upload corrompido, interrupcao da restauracao, ext4 e NTFS,
copia ao servidor antes do mkfs e reposicao nas pastas apropriadas.

A disponibilizacao para maquina real ainda requer que o workflow
GitHub Actions conclua o build e QA da ISO bootavel.
