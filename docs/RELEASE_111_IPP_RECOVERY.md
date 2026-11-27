# Enfoque OS 1.0.11 - recuperacao conservadora da Canon GX7100

A falha observada em Copacabana, Ilha Plaza e Icarai no CUPS 2.4.10 termina
com Backend ipp returned status 4 (stop printer), inclusive com retry-job.
A resposta IPP original nao foi registrada; nao se afirma corrigir firmware ou
a causa de transporte. A recuperacao evita que a fila fique parada
indefinidamente: somente eventos recentes e correlacionados ao job e estado
local, fila IPP direta de rede privada, Canon GX7100 confirmada online, ociosa,
aceitando e sem jobs remotos. Nao reenvia documentos: coloca os pendentes em
hold e verifica o estado antes de habilitar a fila. Jobs anteriores ficam
retidos para revisao da TI. Nao altera outras filas, drivers ou destinos.
Ignora pausas administrativas detectadas no log e limita a uma tentativa por
fila a cada 30 minutos. Logs locais via journalctl -u enfoque-ipp-recovery.
Pode ser desativado com /etc/enfoque-os/disable-ipp-recovery. Sem logs ou
correlacao, nao modifica nada. A cobertura inicial e GX7100 direta; outros
modelos e causas exigem evidencias especificas. Nao reinicia CUPS.
