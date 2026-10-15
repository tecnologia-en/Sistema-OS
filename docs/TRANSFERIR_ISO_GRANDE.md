# Transferir ISO grande pelo GitHub sem recompilar

As ISOs do Enfoque OS podem ultrapassar 1 GB. Quando o download do artefato completo nao for possivel, use o workflow **Dividir ISO para transferencia** da aba Actions. Ele verifica `SHA256SUMS` e divide uma ISO pronta em quatro partes de ate 300 MiB; a compilacao **nao** e refeita.

## No GitHub

1. Abra [Actions > Dividir ISO para transferencia](https://github.com/tecnologia-en/Sistema-OS/actions/workflows/split-iso.yml).
2. Execute o workflow com o **run_id** do build que terminou em sucesso e o nome do artefato correspondente. Exemplo da 0.1.3: `run_id=38795132198`, `artifact_name=enfoque-os-iso-4`.
3. Aguarde o resultado de sucesso. Baixe os cinco ZIPs resultantes: `enfoque-iso-manifesto` e `enfoque-iso-parte-00` ate `enfoque-iso-parte-03`.

## No Windows

Extraia os arquivos para uma unica pasta, por exemplo `dist/0.1.3-parts/`. Ela deve conter exatamente `chunk-00`, `chunk-01`, `chunk-02`, `chunk-03`, `SHA256_PARTS` e `SHA256SUMS` (ZIPs originais podem permanecer na pasta).

Dentro da pasta `OS da enfoque`, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\juntar-iso-partes.ps1 -PartsDirectory .\dist\0.1.3-parts
```

O script verifica o SHA-256 **de cada parte** antes de unir, compara o SHA-256 final da ISO, e so entao entrega `dist/<versao>/enfoque-os-<versao>-piloto-amd64.iso`. Se a ISO ja existir, verifica seu hash sem sobrescrever arquivos. O montador foi testado com quatro partes sinteticas e tambem com reexecucao idempotente.

Com a VM de testes desligada:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\testar-iso.ps1 -IsoPath .\dist\0.1.3\enfoque-os-0.1.3-piloto-amd64.iso -StartVM
```

**Seguranca:** nao montar uma ISO se algum hash falhar. A VM e experimental; nao instalar em computadores de loja, PDVs ou equipamento de producao.
