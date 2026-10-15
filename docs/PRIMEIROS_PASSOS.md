# Primeiro uso no Debian de desenvolvimento

Na maquina virtual Debian 13 XFCE (nao nos PCs da empresa):

```bash
sudo apt update
sudo apt install -y git live-build debootstrap squashfs-tools xorriso syslinux-common isolinux grub-pc-bin grub-efi-amd64-bin mtools dosfstools
cd ~
git clone https://github.com/tecnologia-en/Sistema-OS.git
cd Sistema-OS
./scripts/check-project.sh
./scripts/check-host.sh
sudo ./scripts/build-iso.sh
```

A versao atual gera `dist/enfoque-os-0.1.1-piloto-amd64.iso`.
Ela inicia em modo Live: **nao instala no disco**.

## Para atualizar e recompilar na VM existente

```bash
cd ~/Sistema-OS
git pull --ff-only
./scripts/check-project.sh
sudo ./scripts/build-iso.sh
```

O script detecta o cache de build antigo, chama `lb clean --all` apenas dentro de
`.build/enfoque-os` (preservando caches) e atualiza a configuracao. O arquivo
ISO da versao anterior nao e sobrescrito. Se ja houver ISO com o nome da versao
atual, a compilacao e recusada para evitar sobrescrita.

## Resultado do primeiro teste

- Enfoque OS 0.1: criou a ISO e iniciou no VirtualBox com 2 GB RAM;
- BUG: nao foi criado usuario Live, impossibilitando login grafico e em TTY;
- CAUSA: `--apt-recommends false` sem o pacote recomendado `user-setup`;
- CORRECAO 0.1.1: pacote `user-setup` incluso e validado no `check-project.sh`;
- PENDENTE: compilar a 0.1.1, iniciar no VirtualBox e confirmar login, XFCE e apps.

Documentacao Debian: https://live-team.pages.debian.net/live-manual/html/live-manual/customizing-package-installation.en.html

Nao usar na loja nem no caixa antes da homologacao.
