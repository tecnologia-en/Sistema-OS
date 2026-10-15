# Enfoque OS

Distribuição Linux corporativa **experimental**, baseada em Debian 13 (Trixie) e XFCE.

**Estado atual:** código-fonte de uma ISO Live piloto. A imagem ainda não foi compilada, inicializada ou homologada. Não instalar nos caixas e computadores de produção.

## Como trabalharemos

- **GitHub:** guarda a versão oficial do código e dos scripts.
- **VM Debian (desenvolvimento):** recebe alterações com `git pull --ff-only` e compila a ISO.
- **Outra VM (testes, 2 GB RAM):** inicia a ISO gerada, verifica desempenho e compatibilidade.

### Preparar a VM de desenvolvimento (primeira vez)

```bash
sudo apt update
sudo apt install -y git live-build debootstrap squashfs-tools xorriso syslinux-common isolinux grub-pc-bin grub-efi-amd64-bin mtools dosfstools
cd ~
git clone https://github.com/tecnologia-en/Sistema-OS.git
cd Sistema-OS
./scripts/check-project.sh
./scripts/check-host.sh
```

### Receber as próximas alterações

```bash
cd ~/Sistema-OS
git pull --ff-only
./scripts/check-project.sh
```

### Gerar a primeira ISO

```bash
cd ~/Sistema-OS
sudo ./scripts/build-iso.sh
```

Se a compilação funcionar, procure `dist/enfoque-os-0.1-piloto-amd64.iso`. **Compilar não significa homologar:** a ISO precisa iniciar em outra VM e passar pelos testes.

## O que esta versão contém

Arquivos para criar uma ISO Debian 13 amd64 em modo Live com XFCE, Firefox ESR, rede, terminal e utilitário de diagnóstico local. Inclui documentação, validação de scripts e política inicial de atualizações controladas.

**Ainda não contém:** instalador em disco, painel de TI, agente de gerenciamento, atualização corporativa remota, controle de tela, restrições de funcionários, integração ChatGPT ou compatibilidade validada com SIGE e periféricos.

Documentação: [primeiros passos](docs/PRIMEIROS_PASSOS.md), [fluxo Git](docs/FLUXO_GIT.md), [arquitetura](docs/ARQUITETURA.md), [testes](docs/TESTES_PILOTO.md) e [continuidade](docs/SEGURANCA_E_CONTINUIDADE.md).

**Segurança:** este repositório é público. Não publique tokens, senhas, endereços internos, dumps, chaves de VPN, documentos corporativos ou dados de funcionários. A licença para o código próprio ainda deve ser decidida pela empresa.

Referência: [manual Debian Live](https://live-team.pages.debian.net/live-manual/html/live-manual.en.html).
