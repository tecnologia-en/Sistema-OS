# Enfoque OS 1.0.9 - encerramento da sessao N960K
Base cumulativa: 1.0.8, incluindo Evince como leitor PDF padrao.
O Caixa 2 da Ilha Plaza ainda executava 1.7.8.36; o historico de 26/11/2026
mostrou 12 operacoes PIX encerradas por timeout de heartbeat, sem ACK local.
A versao 1.7.8.39 e a ponte ja presentes no fonte 1.0.8 foram aplicadas
ao Caixa 2 e verificadas por hash, teste simulado e health local.
Este release republica exatamente esses componentes e adiciona regressao
PIX -> conclusao SIGE -> ACK -> debito sem aguardar timeout.
ACK libera a sessao local sem emitir nova cobranca ou reiniciar HID; nao
comprova autorizacao bancaria. Falta homologar duas vendas reais consecutivas.
A extensao permanece inativa por padrao para instalacoes novas.
Nao alterar firmware da N960K, dados de vendas, perfil de Chrome ou
configuracao individual de impressora/gaveta. Nenhum disparo automatico
da frota: respeitar a campanha anterior e a assinatura APT.
