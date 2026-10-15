# Compilar pelo GitHub, testar no Windows

O computador Windows guarda o codigo-fonte e a ISO em `dist/`. A compilacao **nao roda no Windows**: o GitHub Actions usa uma maquina Linux temporaria na nuvem e disponibiliza o resultado para download. A ISO e o codigo-fonte sao coisas diferentes.

## Fluxo

1. No Windows: `git pull --ff-only` na pasta `OS da enfoque`.
2. Eu atualizo os arquivos do projeto via GitHub.
3. Na guia **Actions** do repositorio, abra **Build Enfoque OS ISO** e clique **Run workflow**.
4. Ao terminar com sucesso, baixe o artefato gerado pelo workflow, extraia e guarde a ISO e o `SHA256SUMS` dentro de `dist/` no Windows.
5. Antes de montar no VirtualBox, abra PowerShell dentro da pasta `dist` e valide:
   `(Get-FileHash -Algorithm SHA256 .\\enfoque-os-0.1.1-piloto-amd64.iso).Hash`
   Compare ao hash escrito em `SHA256SUMS`.
6. No VirtualBox, desligue a VM de testes, troque o disco otico pela nova ISO e inicie.

## Limites e seguranca

- O workflow fica manual (`workflow_dispatch`) para evitar builds pesados em cada commit.
- Os artefatos expiram depois de 7 dias: salve as ISOs validadas em local administrado pela empresa.
- A compilacao depende de pacotes Debian acessados pela internet; builds em datas diferentes podem variar. Futuramente fixaremos snapshots e hashes para melhorar reprodutibilidade.
- Somente pessoas autorizadas devem disparar builds e publicar versoes oficiais.
- O primeiro workflow ainda exige uma execucao para validar compatibilidade com o runner Ubuntu.
- O projeto e publico, portanto nao incluir senhas ou segredos corporativos.
