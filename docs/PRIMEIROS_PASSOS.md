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

A ISO resultante deve aparecer em `dist/enfoque-os-0.1-piloto-amd64.iso`.
Ela inicia em modo Live: **nao instala no disco**.

Para receber futuras atualizacoes do repositorio:

```bash
cd ~/Sistema-OS
git pull --ff-only
./scripts/check-project.sh
```

Se o build falhar, registre a mensagem. O script nao apaga automaticamente a pasta `.build/` nem sobrescreve ISO anterior.

Teste a imagem numa **segunda VM** com 2 GB RAM, sem dados importantes. Verifique inicializacao, consumo de RAM, rede, Firefox, teclado e o atalho de diagnostico. Nao usar no caixa, nem na VPS de producao.
