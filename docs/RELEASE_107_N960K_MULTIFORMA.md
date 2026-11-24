# Enfoque OS 1.0.7 - N960K multiplas formas (piloto)

- Base cumulativa 1.0.6; preserva indicador de rede persistente, printer bank, painel e demais ajustes.
- Extensao 1.7.8.39 copiada da versao validada no notebook de testes (JS original SHA-256 1931efd0b9fb104d1edaf41d3c7a646810e78382228891fc01614dcdd2c6f698).
- Cada linha de cartao/Pix gera uma etapa distinta; botao mostra MAQUININHA 1/N, 2/N etc. Dinheiro e Pix CNPJ ficam fora da fila.
- Cada etapa respeita trava de 3 segundos e espera os comandos USB terminarem antes de permitir novo envio.
- A partir da segunda etapa, operador confirma manualmente aprovacao anterior no visor. ACK local vem antes do proximo envio USB, sem repeticao automatica.
- Finalizar Venda do SIGE so libera depois de todas as etapas enviadas. AOA2 nao comprova autorizacao bancaria.
- Extensao continua distribuida INATIVA na ISO/APT. Nao habilitar automaticamente nos caixas sem N960K.
- Testes: node --test test/n960k-multiforma-107.test.cjs, com duas/tres formas, dinheiro, falha ACK e venda unica.
- Fonte da verdade: config/includes.chroot/usr/share/enfoque-monitora/n960k-tef-inativa, usada igualmente pela ISO e pelo APT.
- Rotacao de imagens nas lojas deve preservar imagem integra antes de remover anterior.
