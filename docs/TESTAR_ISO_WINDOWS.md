# Testar uma ISO no Windows

**Apenas VirtualBox / VM Enfoque OS - Teste. Nao instalar em PCs da loja.**

Depois que o GitHub Actions terminar a compilacao e disponibilizar o artefato:

1. Baixe o ZIP do build.
2. Extraia a ISO e o arquivo `SHA256SUMS` para uma pasta de versao, por exemplo `dist/0.1.2/`. Nao misture os hashes de versoes diferentes.
3. Desligue a VM de testes. A VM de desenvolvimento deve permanecer desligada.
4. Abra PowerShell na raiz `OS da enfoque` e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\testar-iso.ps1 -IsoPath .\dist\0.1.2\enfoque-os-0.1.2-piloto-amd64.iso -StartVM
```

O script nao executa codigo arbitrario da ISO: ele apenas calcula SHA-256, compara com `SHA256SUMS`, confirma que a VM esta desligada, conecta a ISO na unidade optica do VirtualBox e inicia a VM somente se `-StartVM` for informado. Nao formata, apaga ou instala discos.

O hash SHA-256 **do ZIP** tambem pode ser conferido contra o digest apresentado na pagina do GitHub Actions antes da extracao. Uma verificacao da ISO e feita usando `SHA256SUMS`.

A compilacao permanece nos servidores do GitHub; o Windows guarda os fontes e artefatos de teste.
