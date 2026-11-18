# Onde consultar a versao publicada do Enfoque OS

A referencia e sempre o **repositorio APT assinado**, nunca apenas uma ISO antiga do servidor:

- URL HTTPS: `https://intranet.enfoquepapelaria.com.br/enfoque-os-updates`.
- Diretorio VPS: `/srv/enfoque-os-archive/`.
- Canal ativo: `/srv/enfoque-os-archive/dists/stable`, um link para o snapshot assinado em `releases/`.
- Indice: `/srv/enfoque-os-archive/dists/stable/main/binary-amd64/Packages`.
- Metadados assinados: `/srv/enfoque-os-archive/dists/stable/InRelease`.
- Pacotes imutaveis: `/srv/enfoque-os-archive/pool/main/e/enfoque-os-core/`.
- Chave PUBLICA de validacao: `/var/lib/enfoque-update/archive-keyring.gpg` (nao utilizar chave privada fora da VPS).

Consulta dinamica:

```sh
readlink -f /srv/enfoque-os-archive/dists/stable
awk 'BEGIN{RS=""} /^Package: enfoque-os-core\n/ {for(i=1;i<=NF;i++) if($i=="Version:") print $(i+1)}' /srv/enfoque-os-archive/dists/stable/main/binary-amd64/Packages | sort -V | tail -1
gpgv --keyring /var/lib/enfoque-update/archive-keyring.gpg /srv/enfoque-os-archive/dists/stable/InRelease
```

`/srv/enfoque-os-iso-transfer` contem ISOs antigas, nao o ultimo pacote de atualizacao.
`/srv/enfoque-os-release-sync/status.json` descreve a ultima sincronizacao de GitHub ISO; nao e, isoladamente, a versao atual do APT.
Consultar a versao instalada individualmente no PC, se a pergunta for sobre esse computador e nao o catalogo.
