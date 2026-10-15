# Fluxo GitHub > Debian > ISO

O GitHub e a fonte oficial. A VM Debian recebe o codigo e gera imagens de teste.

- Primeira vez: `git clone https://github.com/tecnologia-en/Sistema-OS.git`
- Proximas vezes: `cd ~/Sistema-OS && git pull --ff-only`
- Validar: `./scripts/check-project.sh`
- Compilar: `sudo ./scripts/build-iso.sh`
- Testar: outra VM com 2 GB de RAM.

Nao rode `git pull` com `sudo`. Nao inclua senha/token no projeto.
Se o Git relatar alteracoes locais ou conflitos, pare e revise `git status` antes de prosseguir. Nao rode `git reset --hard` ou `git clean -fdx` sem revisar, pois podem excluir arquivos.
ISOs e caches de build permanecem fora do Git. Publicar futuras versoes somente apos testes e hashes.
