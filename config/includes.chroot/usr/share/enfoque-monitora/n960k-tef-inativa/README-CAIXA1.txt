ENFOQUE PDV N960K AOA2 - COPIA DE LABORATORIO
Origem: extensao oficial 1.7.8 do Chrome de Caixa 1, copiada sem alterar o original.
Mecanismo PDV: n960k-pdv.js (derivado da 1.7.8.11), n960k-logic.js e n960k-background.js.
Bridge local: Python em 127.0.0.1:8879, AOA2 HID com keypad KP0-KP9, nao aprova pagamentos automaticamente.
FILTRO: somente debito, credito, Pix maquininha. Dinheiro, boleto, Pix CNPJ nao enviados.
Parcelas: faixas como 2 a 5 exigem modal com quantidade exata.
Apertar Finalizar Venda captura linhas, bloqueia finalizacao nativa e inicia fila; cada pagamento requer confirmacao VISUAL antes do proximo e da Venda Confirmada.
Na maquininha nao ha leitura automatica de CV, NSU, status ou tela.
Instalacao em Chrome (manual): chrome://extensions > Modo do desenvolvedor > Carregar sem compactacao > selecionar pasta desta copia. Nao desinstalar/modificar a 1.7.8 oficial.
