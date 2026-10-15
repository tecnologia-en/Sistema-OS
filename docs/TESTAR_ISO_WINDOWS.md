# Testar uma ISO no Windows

**Apenas VirtualBox / VM Enfoque OS - Teste. Nunca instalar em PCs da loja.**

A compilacao ocorre no GitHub Actions. O Windows guarda a pasta do projeto e os artefatos; a VM de desenvolvimento permanece desligada.

## Preparar o ZIP baixado

Depois de baixar o ZIP do build, abra PowerShell na raiz da pasta "OS da enfoque" e execute (troque o caminho pelo arquivo baixado):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\preparar-iso.ps1 -ZipPath "$env:USERPROFILE\Downloads\enfoque-os-iso-3 (1).zip"
```

O comando valida a estrutura do ZIP, identifica automaticamente a versao, extrai para `dist/<versao>/` e compara o SHA-256 com `SHA256SUMS`. Se a versao ja existir, verifica seu hash sem sobrescrever arquivos. Se a extracao falhar, remove apenas os arquivos temporarios que criou.

## Montar e iniciar na VM

Desligue normalmente a VM **Enfoque OS - Teste**. A VM de desenvolvimento nao precisa ser ligada. Para a versao 0.1.2:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\testar-iso.ps1 -IsoPath .\dist\0.1.2\enfoque-os-0.1.2-piloto-amd64.iso -StartVM
```

Alternativamente, use `-StartVM` no comando `preparar-iso.ps1` quando a VM ja estiver desligada: ele verifica a ISO e chama o script de montagem/inicializacao.

O script de montagem **recusa trocar a ISO quando a VM estiver ligada**, nao modifica o disco virtual e nao formata nem instala discos fisicos.

## Validacoes

- Nunca confunda o SHA-256 do arquivo ZIP com o SHA-256 da ISO extraida; o manifesto `SHA256SUMS` se aplica a ISO.
- Guarde os hashes ao lado da versao correspondente, sem misturar com ISOs anteriores.
- Se um hash nao conferir, pare: nao inicie a imagem e obtenha novamente o artefato.
- O menu de boot Live ainda requer selecionar `Live system (amd64)`. O sistema e experimental, nao possui instalador corporativo homologado.
