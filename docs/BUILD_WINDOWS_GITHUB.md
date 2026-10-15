# Compilar pelo GitHub, testar no Windows

O computador Windows guarda o codigo-fonte e a ISO em `dist/`. A compilacao **nao roda no Windows**: o GitHub Actions usa uma maquina Linux temporaria na nuvem e disponibiliza o resultado para download. A ISO e o codigo-fonte sao coisas diferentes.

## Fluxo

1. No Windows: `git pull --ff-only` na pasta `OS da enfoque`.
2. Eu atualizo os arquivos do projeto via GitHub.
3. Na guia **Actions** do repositorio, abra **Build Enfoque OS ISO** e clique **Run workflow**.
4. Ao terminar com sucesso, baixe o artefato gerado pelo workflow, extraia e guarde a ISO e o `SHA256SUMS` dentro de `dist/` no Windows.
5. Antes de montar no VirtualBox, abra PowerShell dentro da pasta `dist` e valide:
   `(Get-FileHash -Algorithm SHA256 .\\enfoque-os-0.1.2-piloto-amd64.iso).Hash`
   Compare ao hash escrito em `SHA256SUMS`.
6. No VirtualBox, desligue a VM de testes, troque o disco otico pela nova ISO e inicie.

## Limites e seguranca

- O workflow fica manual (`workflow_dispatch`) para evitar builds pesados em cada commit.
- Os artefatos expiram depois de 7 dias: salve as ISOs validadas em local administrado pela empresa.
- A compilacao depende de pacotes Debian acessados pela internet; builds em datas diferentes podem variar. Futuramente fixaremos snapshots e hashes para melhorar reprodutibilidade.
- Somente pessoas autorizadas devem disparar builds e publicar versoes oficiais.
- O workflow foi exercitado com a versao 0.1.2: artefato disponivel, ISO extraida, SHA-256 verificado e boot aprovado na VM de 2 GB.
- O projeto e publico, portanto nao incluir senhas ou segredos corporativos.

## Correcao de compatibilidade do runner Ubuntu (15/10/2026)

O primeiro build automatico chegou ao chroot, mas falhou porque o live-build do Ubuntu configurou a suite de seguranca inexistente `trixie/updates` (HTTP 404). O script agora usa `--security false` para omitir essa **origem padrao incorreta** e adiciona explicitamente os repositorios oficiais assinados `trixie-security` por meio dos arquivos `config/archives/trixie-security.list.{chroot,binary}`. Isso **nao desativa a verificacao de assinaturas APT** nem remove o repositorio oficial de atualizacoes de seguranca. E necessario verificar o proximo build e, depois, a ISO no VirtualBox.

## Compilador Debian 13 isolado (15/10/2026)

A segunda tentativa na maquina Ubuntu falhou ao buscar `dists/trixie/Contents-amd64.gz`, um caminho usado pelo live-build empacotado no Ubuntu que nao funciona com os repositorios atuais do Debian 13. O workflow agora usa o GitHub runner Ubuntu **apenas como anfitriao** para iniciar um container `debian:trixie`, com os utilitarios do Debian 13 instalados nele. A imagem ISO continua sendo gerada no GitHub e copiada para o Windows somente depois de validada.

O container e efemero e usa `--privileged` porque o live-build monta sistemas de arquivos durante a construcao. Essa permissao deve ficar restrita a commits confiaveis na branch main; PRs e codigo de terceiros nao devem executar este workflow automaticamente.

## Primeira validacao completa (15/10/2026)

A compilacao CI gerou o artefato `enfoque-os-iso-3`, com `enfoque-os-0.1.2-piloto-amd64.iso` e `SHA256SUMS`.
A ISO foi baixada pelo Windows, extraida em `dist/0.1.2/`, e seu hash SHA-256 foi confirmado:

```text
d6063c7b0158b083916278f6bbafc6856e4bb91357c4ee59a5c84aa3f9dffd8d
```

A VM de testes iniciou e passou boot, ABNT2, locale pt_BR, fuso Sao Paulo, Firefox via HTTPS, diagnostico e reboot. Consulte `docs/TESTE_2026-10-15_0.1.2.md`. O sistema permanece experimental, nao homologado para uso nas lojas.
