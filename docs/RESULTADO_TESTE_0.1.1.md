# Primeiro teste de ponta a ponta — 15/10/2026

## Ambiente
- Desenvolvimento: Debian 13 XFCE no VirtualBox, VM 4+ GB de RAM, 2 CPUs.
- Teste: VirtualBox "Enfoque OS - Teste", 2 GB RAM, 2 CPUs, disco virtual 25 GB, rede NAT.
- Fonte: repositório tecnologia-en/Sistema-OS; ISO Live, ainda **sem instalador**.

## Versão 0.1 — falhou
- ISO gerada, SHA-256 confirmado.
- Boot Linux e login gráfico chegaram a aparecer.
- Não criou usuário Live (falha de autenticação).
- Causa: com `--apt-recommends false`, `user-setup` não estava incluso.

## Versão 0.1.1 — teste funcional
- ISO gerada: `enfoque-os-0.1.1-piloto-amd64.iso`.
- SHA-256: `29540815a6a7261646416be6217158ef5529d354dbcc3264a7a3be95a3ddf5aa`.
- Tamanho: 1.223.540.736 bytes.
- Boot e login automático do Live funcionaram.
- XFCE carregou desktop, terminal e painel.
- Memória em repouso: 407 MiB usados, 1.566 MiB disponíveis, de 1.973 MiB totais; medição do `free -m` na VM de testes.
- Rede NAT: IP 10.0.2.15, ping ao `debian.org` com 2 respostas, sem perda.
- Firefox ESR abriu e exibiu https://www.debian.org.
- `enfoque-diagnostico` executou e exibiu kernel, memória, disco e IP.
- Arquivo ISO e checksum estão no Windows em `Desktop/OS da enfoque/dist`.
- Pasta Windows clonada na branch main, com `git pull --ff-only`.

## Pendências
- A identidade visual ainda é Debian/XFCE padrão. Nada personalizado além da base, identificação e diagnóstico.
- O `/etc/enfoque-os-release` ainda mostra VERSION=0.1-piloto na ISO 0.1.1; corrigir no próximo build, sem alterar o artefato já testado.
- O modo Live é somente avaliação e não é uma instalação corporativa.
- Validar a primeira compilação pelo GitHub Actions. O workflow existe, mas não foi executado/homologado neste teste.
- Testar teclado ABNT2, periféricos das lojas, política de acesso, instalador, atualizações, recuperação e manutenção antes de produção.
- Medir desempenho real de navegação no SIGE sob carga; 407 MiB é apenas repouso.
