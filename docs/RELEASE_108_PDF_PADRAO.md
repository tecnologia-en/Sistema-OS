# Enfoque OS 1.0.8 - PDF padrao

Base: 1.0.7 (APT assinado e fonte b42269f). Instala Evince via Debian,
define PDF local como org.gnome.Evince.desktop no sistema e novos perfis,
migra os perfis existentes no upgrade e na primeira sessao XFCE. Chrome
continua navegador padrao para HTTP/HTTPS/HTML. Nenhuma politica de
download, fila de impressao, impressora padrao ou integracao N960K alterada.
O painel de impressoras usa LC_ALL=C apenas nas consultas CUPS para nao
perder as filas quando o desktop esta em portugues. O leitor foi validado
no Caixa 2 de Icarai antes da integracao ao release.
