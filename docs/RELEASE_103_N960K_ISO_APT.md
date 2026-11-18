# Enfoque OS 1.0.3 — N960K 1.7.8.29 integrada na ISO e no APT

## Origem conferida

- Origem: Caixa 1, Ilha Plaza, extensao N960K 1.7.8.29 e ponte USB/HID corrigida.
- Diretorio consolidado no servidor: /opt/enfoque-smartpos-lab/pacotes/N960K-ISO-COMPLETA-1.7.8.29/
- ZIP completo: /opt/enfoque-smartpos-lab/pacotes/ENFOQUE-N960K-1.7.8.29-ISO-COMPLETA.zip
- SHA256 ZIP: c82d2607d3aacba61dd656c7d43e2caa93341716d73ff740511aef155425cbd7
- A ISO e o pacote enfoque-os-core usam a mesma arvore config/includes.chroot.

## Funcionalidade

1. USB Newland N960K, autodeteccao, bridge autenticada AOA2/HID.
2. Correcao Linux libusb: sem chamar .exists() em string de biblioteca.
3. O botao MAQUININHA muda para FINALIZAR VENDA, liberado apos 3 segundos, sem esperar o agente nem reiniciar o HID pelo clique do SIGE. Finalizar no SIGE nao valida o pagamento bancario.
4. Imprimir via do cliente ao lado de finalizar, desbloqueado nos mesmos 3 segundos.
5. Imprimir via do cliente abaixo de Nova Venda (F8), com as classes nativas do SIGE.
6. Clique deliberado executa KP1, aguarda 100 ms e executa KP1. Endpoint /v1/receipt autenticado; rejeita chamadas sem autorizacao, repetidas e durante envio USB. Reutiliza o HID ativo quando possivel.
7. Autoconexao sem disparar pagamentos automaticamente.

## Seguranca

A extensao N960K fica INATIVA por padrao no Chrome de novos PCs; a Monitora permanece intacta.
A consolidacao inclui 45 arquivos da extensao, ponte, driver e detector USB.
O arquivo br.txt foi EXCLUIDO porque continha um Bearer token nao referenciado pelo manifesto.
Nao empacotar identidade do PC, chave SSH, tokens do operador ou estado Zero Touch.
As rotinas fisicas nao comprovam impressao efetiva ou autorizacao bancaria.

## Distribuicao

- ISO: enfoque-os-1.0.3-piloto-amd64.iso (Debian 13).
- APT: enfoque-os-core 1.0.3-1, com indice stable assinado em /srv/enfoque-os-archive/dists/stable/InRelease.
- Regras da release: validar SHA256 dos artefatos, teste em VM, nenhuma campanha automatica na frota.

## Validacao exigida

- Python unittest completo.
- Node tests: registro Zero Touch, Monitora, telemetria de impressoras e testes N960K UI.
- scripts/check-project.sh, compilacao ISO e verificacao SHA256.
- Verificacao GPG do indice APT stable.
