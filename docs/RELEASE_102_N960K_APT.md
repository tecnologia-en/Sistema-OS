# Enfoque OS 1.0.2 — N960K 1.7.8.27 preparada, extensao inativa

## Escopo

- Fonte aprovada: `/opt/enfoque-smartpos-lab/pacotes/ENFOQUE-N960K-1.7.8.27-AUTOCONEXAO.zip`.
- SHA-256 do ZIP: `441967f9833f8ad664bc823549a916b989009794d63407f0353332634fcd0fd8`.
- Atualiza os arquivos armazenados em `/usr/share/enfoque-monitora/n960k-tef-inativa/` (oito arquivos); versao de extensao `1.7.8.27`.
- O `manifest.json` e `n960k-discovery-worker.js` foram atualizados e `n960k-boot-ready.js` foi adicionado.
- Os scripts de pagamento, logica, cancelamento, detector e bridge Linux anteriores foram preservados byte por byte.
- A nova rotina de conexao apenas consulta a saude local da ponte. Nao emite pagamentos automaticamente.
- **Extensao TEF permanece INATIVA no Chrome:** sem force-install, profile change, `--load-extension` ou autostart do navegador para ela.
- **Monitora permanece sem alteracoes.** Nao foram alteradas politicas corporativas do navegador.
- Nao instalar em PCs, nao criar campanha pela intranet, nao habilitar atualizacao automatica das lojas.
- Pagamento fisico na N960K com Linux continua sujeito a homologacao; os testes relatados no ZIP foram no Windows.

## Versao e publicacao

- Versao do sistema: `enfoque-os-core 1.0.2-1`; publicar como novo arquivo `.deb`, sem alterar o pacote imutavel `1.0.1-1`.
- Fonte oficial da versao mais recente: APT `https://intranet.enfoquepapelaria.com.br/enfoque-os-updates`, canal `stable`.
- Indice assinado: `/srv/enfoque-os-archive/dists/stable/InRelease`.
- Pacotes: `/srv/enfoque-os-archive/pool/main/e/enfoque-os-core/`.
- Manter todos os pacotes anteriores e o banco de drivers `enfoque-printer-drivers` na publicacao.
- Registro de origem GitHub: branch `release/enfoque-os`, tag de codigo `enfoque-os-v1.0.2-apt` quando publicada.
- Codigo de futuras ISOs e de atualizacoes APT e o mesmo overlay `config/includes.chroot`.
- **Uma ISO binaria nova requer compilacao e homologacao separadas.** Este lancamento e do pacote APT e do codigo-fonte da ISO; nao significa instalacao em computadores.
