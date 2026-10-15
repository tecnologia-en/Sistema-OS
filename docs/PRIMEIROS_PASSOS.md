# Instrucoes de uso

## Windows + GitHub (fluxo principal)

Abra o terminal na pasta `OS da enfoque` do Windows:
```powershell
git pull --ff-only
```
O codigo-fonte sera atualizado. A ISO continua sendo compilada em Linux, mas pela maquina temporaria do GitHub Actions, nao pelo Windows nem pela VM de teste.

Entre no repositorio GitHub, abra a guia **Actions** e verifique **Build Enfoque OS ISO**. O workflow e automatico para alteracoes na configuracao da ISO ou manual via **Run workflow**. So baixe a ISO de um build com status *success*.

Extraia o artefato para a pasta `dist`, compare o hash SHA256SUMS e monte a nova ISO na VM **Enfoque OS - Teste**. Mantenha a VM de desenvolvimento desligada.

## Recuperacao com VM Debian (apenas contingencia)

Se o GitHub Actions ficar indisponivel, a VM Enfoque OS - Dev ainda pode compilar a imagem:

```bash
cd ~/Sistema-OS
git pull --ff-only
./scripts/check-project.sh
sudo ./scripts/build-iso.sh
```

A versao sera obtida de `config/includes.chroot/etc/enfoque-os-release`. A imagem e Live sem instalador; nunca testar em um computador de loja.
