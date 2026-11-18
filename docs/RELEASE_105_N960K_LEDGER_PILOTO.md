# Enfoque OS 1.0.5 - N960K 1.7.8.38 (piloto)
- Origem: copia administrativamente autorizada do Caixa 1 da Ilha Plaza,
  arquivo da extensao 1.7.8.38 e ponte N960K local (18/11/2026).
- A extensao e distribuida **inativa** em
  /usr/share/enfoque-monitora/n960k-tef-inativa.
- Acrescenta ACK local apos clique explicito em Finalizar Venda,
  confirmacao visual do fluxo SIGE em tela concluida e comandos USB
  preparados. ACK local nao verifica autorizacao financeira.
- O heartbeat de 6 segundos permanece diagnostico, sem abandono automatico
  por 90 segundos; timeout geral de seguranca de 300 segundos mantido.
- Nao reinicia HID por timeout e nao reenvia automaticamente cobrancas.
- Inexistem mudancas em drivers/impressoras, recuperacao, Zero Touch,
  intranet e scripts de atualizacao do sistema.
- **Pendencia:** usuario relatou a mesma perda de comunicacao apos o ajuste.
  Publicacao apenas do codigo piloto solicitado. Nao homologada.
- Publicacao APT nao dispara campanha de frota automaticamente.
