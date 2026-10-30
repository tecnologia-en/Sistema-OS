Enfoque OS 0.2.9 - Identificacao e Teste PayGo

ID do computador
- Botao ID do computador no rodape abre ID, loja, IP, rede e UUID e permite copiar.
- No primeiro boot de cada PC, enfoque-device-id.service cria um UUID v4 proprio em /var/lib/enfoque-os/device-identity.json; a ISO nao carrega UUID pregerado.
- Em modo live, usa somente /run/enfoque-os/device-identity.json (nao persiste depois de reiniciar).
- O ID curto exibido contem 12 digitos baseados no UUID, mais sufixo: 1 Ilha Plaza, 2 Copacabana, 3 Itaipu, 4 Icarai, 5 Sao Goncalo, 6 Centro, 7 Deposito, 8 Administracao, 9 Papel & Arte; 0 sem loja.
- O sufixo segue primeiro acesso ou mapeamento explicito de CIDR por TI em /etc/enfoque-os/lojas-ip.json, por exemplo: {"10.42.0.0/24":"ilha-plaza"}. Regra de rede mais especifica prevalece.
- Mesmo sem configurar CIDRs, IPs da mesma /24 mostram o mesmo grupo Gxx no modal; isso NAO comprova pertencerem a mesma loja, pois sub-redes privadas podem se repetir.
- O UUID canonico permanece fixo. O sufixo da unidade pode mudar se o PC for transferido. ID e loja sao informativos, nao concedem acesso na intranet.

Teste PayGo
- Pesquisar Teste PayGo no menu XFCE. Sem atalho na area de trabalho, sem icone fixado no rodape, sem autostart; nao aparece na lista de janelas enquanto aberto (skip_taskbar).
- Ao abrir, pede senha de treinamento fixa: infante. Senha esta em hash no codigo; NAO substitui autenticacao bancaria nem e protecao forte contra usuarios administrativos.
- Frontend GTK permite Credito, Debito, valor em reais, confirmar e enviar. F11 alterna tela cheia.
- Broker por socket Unix local roda como usuario limitado enfoque-tef. O arquivo PayGo.db e credenciais ficam somente no terminal ja provisionado, nunca na ISO.
- Exclusivamente sandbox de demonstracao do ControlPay, COM8, GERTEC PPC930. Sem ativacao por maquina o aplicativo abre mas nao permite enviar venda.
- Evita reenvio automatico, guarda identificador e estado de operacao, verifica GetById e GetByFiltros antes de considerar status final, bloqueia pendencias ou estado incerto.
- Cancelamento real, estorno e homologacao de producao NAO fazem parte desta versao.