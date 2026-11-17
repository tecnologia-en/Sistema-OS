# Enfoque OS 1.0.1 — N960K USB/TEF preparado, extensao inativa

Tipo desta entrega: atualizacao APT do sistema existente. NAO foi gerada uma ISO 1.0.1.

## Estado publicado (17/11/2026)

- Sistema: Enfoque OS 1.0.1, revisao Debian enfoque-os-core_1.0.1-1_all.deb
- Pacote APT oficial e assinado: https://intranet.enfoquepapelaria.com.br/enfoque-os-updates/pool/main/e/enfoque-os-core/enfoque-os-core_1.0.1-1_all.deb
- SHA-256 imutavel do .deb ja publicado: 82db6a5222b983d9b486a919946412fcd9d819ff31b25283ccf561fcd7a12256
- Origem de montagem/pacote: /srv/enfoque-os-staging/1.0.1/n960k/
- Pacote oficial: /srv/enfoque-os-archive/pool/main/e/enfoque-os-core/enfoque-os-core_1.0.1-1_all.deb
- O repositorio APT stable contem tambem a 1.0.0 e mantem a biblioteca de drivers de impressora.
- Atualizacoes automaticas das lojas e campanha de distribuicao permanecem desativadas; a atualizacao 1.0.1 e oferecida quando um usuario/admin escolhe Atualizar e cumpre os pre-requisitos.

## Arquivos novos do sistema (copiados byte por byte do .deb publicado)

1. /usr/local/lib/enfoque-n960k/ — ponte AOA2 HID, driver Windows/Linux, configuracao Pix e detector USB independente.
2. /usr/lib/systemd/user/enfoque-n960k-{discovery,bridge}.service — servicos da sessao do usuario.
3. /usr/local/bin/enfoque-n960k-session-start e /etc/xdg/autostart/enfoque-n960k-servicos.desktop — inicializacao na sessao XFCE.
4. /etc/udev/rules.d/72-enfoque-n960k.rules — somente VID 1e0e, PID 902b, acesso 0660 com uaccess.
5. /usr/share/enfoque-monitora/n960k-tef-inativa/ — todos os sete arquivos da extensao 1.7.8.26, ao lado da Monitora, mas NAO habilitados/instalados/carregados no Chrome.

A Monitora instalada por politica corporativa foi preservada sem alteracoes.
Nao habilitar automaticamente a extensao TEF sem pedido expresso e homologacao.

## Garantias de integridade sobre o TEF

- n960k-pdv.js SHA256: 05b5ba7f3e47e1b9f64e039b75086f0aaa5b409977646c588f3bc7795a0f71f4
- n960k-logic.js SHA256: e08d0f9b5bb317868e4223e2aaff92a35986e205b5af8db3c9ad8dbf3ce2805d
- Visual, pagamentos, cancelamentos e temporizadores ja aprovados nao foram alterados.
- Deteccao no Linux validada; pagamentos reais com N960K fisica no Linux ainda exigem homologacao.
- No Chrome, a extensao arquivada NAO aparece ate que a TI decida ativa-la.

## Codigo-fonte para futura 1.0.2

- Repositorio: https://github.com/tecnologia-en/Sistema-OS
- Ramo base: release/enfoque-os
- Tag versionada desta atualizacao APT: enfoque-os-v1.0.1-apt
- A tag Git registra codigo-fonte, scripts e metadados; o .deb oficial permanece no APT assinado.
- scripts/build-update-package.py inclui os 17 arquivos novos (incluindo regra USB) e aceita o banco de drivers de impressora existente: enfoque-printer-drivers >= 1.0.0-1.
- scripts/publish-update-repo.sh aceita publicar apenas o pacote principal quando ja existir banco de drivers compativel, sem remove-lo nem sobrescreve-lo.
- config/package-lists/enfoque-base.list.chroot inclui libusb-1.0-0 e udev para futuras ISOs.
- Para 1.0.2: partir desta tag ou do ramo release, aumentar a versao no arquivo config/includes.chroot/etc/enfoque-os-release, testar, construir um novo pacote e publicar no APT. Nao sobrescrever o .deb 1.0.1-1 ja assinado.
- Criar uma ISO e um GitHub Release com ISO e processo separado. O commit de sincronizacao 1.0.1 utiliza [skip ci] para nao iniciar um build de ISO nao solicitado.

## Verificacoes de pacote

Comparacao binaria entre o .deb 1.0.0 e 1.0.1: 10.188 arquivos originais mantidos, apenas /etc/enfoque-os-release alterado e 17 arquivos novos adicionados. Publicacao APT validada por GPG. Servicos e detector testados isoladamente; sem homologacao de pagamento fisico no Linux.
