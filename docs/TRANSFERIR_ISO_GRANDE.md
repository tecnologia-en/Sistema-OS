# Transferir ISO grande pelo GitHub sem recompilar

O arquivo da ISO 0.1.2 possui mais de 1 GB. Para conexoes lentas, o workflow `Dividir ISO para transferencia` baixa o artefato original do GitHub, verifica `SHA256SUMS` e cria quatro partes (ate 300 MiB cada) com um manifesto `SHA256_PARTS`.

1. Abra a aba Actions, selecione `Dividir ISO para transferencia` e execute com o numero da compilacao bem-sucedida e nome do artefato.
2. Baixe as cinco partes disponibilizadas: manifesto e quatro partes numeradas `00` a `03`.
3. Extraia `chunk-00`, `chunk-01`, `chunk-02`, `chunk-03` e `SHA256_PARTS` para a mesma pasta.
4. Valide a integridade SHA-256 de cada parte.
5. Junte as quatro partes na ordem; a ISO resultante deve conferir com `SHA256SUMS`.
6. Execute `scripts/windows/testar-iso.ps1` para montar somente na VM de testes.

O workflow nao altera nem recompila a ISO; os bytes sao recombinados exatamente na ordem original. Nao instalar a imagem nos PCs de producao.
