# Enfoque OS 1.0.4 - N960K 1.7.8.36 (Caixa 1, Ilha Plaza)

## Escopo aprovado

- Removido o botao Imprimir via do cliente da tela de pagamentos do SIGE.
- Mantido o botao nativo Imprimir via do cliente somente na
  tela seguinte, ao lado de Nova Venda (F8).
- A extensao remove um botao antigo da tela de pagamentos se o SIGE SPA
  ainda o mantiver no DOM depois de atualizar a extensao.
- O fluxo Cancelar / Voltar e a recuperacao HID por erro de comando
  permanecem identicos aos da N960K 1.7.8.35.
- Nao ha clique automatico, repeticao de pagamento ou reinicio de SSH/Zero Touch.

## Origem e verificacao

- Origem: pacote completo de 45 arquivos da extensao N960K 1.7.8.36
  validado contra a versao 1.7.8.35 do Caixa 1, Ilha Plaza.
- Arquivo: /opt/enfoque-smartpos-lab/pacotes/ENFOQUE-N960K-1.7.8.36-VIA-SOMENTE-CONCLUIDA.zip
- SHA-256 ZIP: f3d666c9f421bebbd93524a66499d24ab0fc3c4b9a6dac4e095b11842639827b
- JS PDV SHA-256: 9e21e6b4efa22a193dea91265c9783d5fcdd5735060d88ce65a67ec08feca928
- Bridge SHA-256: 5bd4e6e2b28a76ce77a86082221e94dbac4d4d4893420dbd3fc0666630e59574
- Configuracao N960K na ISO: permanece inativa por padrao.
  A extensao Monitora e a sua politica Chrome permanecem intactas.
- Nao inclui br.txt, credenciais, identidade Zero Touch ou estado de venda.

## Distribuicao

- ISO Debian 13: enfoque-os-1.0.4-piloto-amd64.iso, compilada no GitHub Actions.
- APT: enfoque-os-core_1.0.4-1_all.deb, indice stable assinado
  com chave Enfoque OS e verificado com gpgv.
- O APT entrega os mesmos arquivos da arvore config/includes.chroot.
- Nao disparar campanhas automaticas na frota pelo simples ato de publicar.

## Testes

- node --test test/n960k-receipt-ui.test.mjs
- python3 -m unittest discover -s test -p test_*.py -q
- bash scripts/check-project.sh
- Comparacao SHA-256 da extensao instalada no Caixa 1 e do pacote na ISO.
- Compilacao ISO na CI e verificacao dos artefatos / integridade.
- Verificacao da assinatura dos metadados APT e disponibilidade HTTP.

A confirmacao de impressao fisica e autorizacao bancaria depende sempre do
visor e dos comprovantes na maquininha. Nenhum envio HID confirma pagamento.
