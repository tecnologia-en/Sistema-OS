# Enfoque OS 1.0.10 - compatibilidade AnyDesk

Base cumulativa 1.0.9; mantem Evince e piloto N960K.
Logs CANTO-COPA e CAIXA1-ILHA: X11, ABNT2, AnyDesk 8.1.0, conexoes
Android 9.1.0 da mesma origem, permissao de entrada liberada e alternancia
en_us/unknown. CAIXA2-ILHA tambem apresentou o padrao com Android 9.0.2.
A alternancia nao demonstra sozinha perda de caracteres; falta reproducao
controlada pelo Android. Ha tambem falha Xauthority na partida.

- Ordena AnyDesk apos display-manager e espera X11 por tempo limitado.
- Nao copia cookies, amplia permissoes, reinicia sessoes ou altera ABNT2.
- A protecao entra em vigor no proximo inicio do servico.
- ISO mantem AnyDesk oficial 8.1.1, ja fixado no hook.
- Estacoes existentes: TI executa enfoque-anydesk-maintenance --apply em
  janela autorizada apos instalar o core. Verifica chave e origem APT
  oficiais e so permite atualizar o proprio AnyDesk. Pode interromper acesso
  remoto. O postinst do core nao executa APT aninhado nem reinicia AnyDesk.
- 8.1.1 nao anuncia correcao especifica de teclado. Homologar Android
  9.1.0 em Auto e Local, texto ASCII, acentos, cedilha, numeros, Backspace
  e atalhos em editor vazio; conferir tambem teclado fisico.
- Sem campanha automatica; nao promover stable com campanha ativa.
