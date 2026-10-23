# PayGo no Enfoque OS 0.2.8 (piloto)

A ISO Debian 13 incorpora Wine 32 bits e o instalador oficial PayGo Windows sem Warsaw, com hashes verificados durante a compilacao. Nao e um modulo externo.

## Area de trabalho

- PayGo (piloto): executa o instalador na primeira abertura dentro de um Wine exclusivo do usuario. Nos proximos acessos tenta executar o aplicativo instalado.
- Compatibilidade Windows: abre configuracao do Wine dedicado ao PayGo.
- No menu de aplicativos, PayGo - PIN-pad (piloto) permite mapear um dispositivo serial selecionado para a COM1 dentro do Wine.

O instalador verificado fica em /opt/enfoque/paygo/SetupPayGo.exe, mas a aplicacao Windows nao e pre-ativada nem executada na geracao da ISO. Cada usuario cria o proprio ambiente em ~/.local/share/enfoque-os/paygo-wine. Nenhuma credencial ou dado financeiro entra na imagem.

## Limitacoes

A ISO compilada nao comprova que o PayGo ou as dependencias .NET funcionam no Wine. A PayGo declara suporte somente a Windows. Sem Warsaw nao ha protecao antifraude equivalente, portanto este piloto NAO deve ser usado para pagamentos reais. O SIGE/PDV ainda nao foi conectado ao launcher.

## Validacao presencial pendente

1. Boot em maquina de laboratorio, atalhos e consumo de RAM.
2. Winecfg e instalador PayGo abrem sem falhas?
3. Aplicativo Windows principal abre apos instalar e reiniciar?
4. Dependencias .NET, conectividade e porta serial com PIN-pad real.
5. Somente sandbox, confirmacao/cancelamento e seguranca antes de considerar qualquer uso produtivo.

Documentacao oficial: https://paygodev.readme.io/docs/kit-de-integra%C3%A7%C3%A3o-1


## Atualizacao 0.2.8 - correcao comprovada

O instalador oficial verificado e PE32. O launcher usa especificamente
`/usr/lib/wine/wine`, `WINEARCH=win32` e prefixo exclusivo
`~/.local/share/enfoque-os/paygo-win32`. O carregador Wine32 executou
`wineboot.exe --init` e `cmd.exe /c echo ENFOQUE_WINE_OK` em
laboratorio isolado com o conteudo da ISO. O instalador PayGo chegou
a iniciar nesse ambiente, mas sua conclusao, requisitos .NET e operacao
financeira continuam sem validacao.

No modo Live da ISO 0.2.7, a camada gravavel era tmpfs com apenas 2 GB
e chegava a 100% durante a inicializacao do Wine; isto causa DLLs
faltantes e codigo 112 por falta de espaco. A 0.2.8 passa a verificar
espaco livre, criar prefixo limpo de 32 bits e exigir teste de cmd.exe
antes de abrir o instalador. Sem espaco, apresenta uma mensagem clara.
Para persistencia, use um disco instalado; para laboratorio e possivel
usar a variavel ENFOQUE_PAYGO_PREFIX apontando para um diretorio gravavel
em volume seguro. Nao usar pagamentos reais.

## 0.2.9: USB GERTEC PPC930 no teste da VM
O USB GERTEC PPC930 foi capturado pelo VirtualBox com VID/PID 1753:c902,
reconhecido pelo Linux como /dev/ttyACM0 (driver cdc_acm) e aberto
sem privilegios atraves do alias /dev/enfoque-pinpad com grupo plugdev.
O alias passa a ser configurado pela ISO, e o Wine mapeia COM1 e COM8
sem substituir configuracoes personalizadas de outros dispositivos.

O instalador PayGo 5.1.50.924 concluiu em um prefixo Wine32 mantido num
volume de laboratorio, com Wine Mono 10.4.1. A aplicacao PayGo.exe abriu
uma janela de erro System.Management.WmiNetUtilsHelper (dependencia .NET/WMI),
portanto ainda NAO foi validada a tela de ativacao ou qualquer transacao.
O diagnostico de rede no Wine falhou para IPv6 de api.controlpay.com.br,
embora os destinos IPv4 tenham respondido. Nao processar vendas nem ativar
um terminal real enquanto nao houver validacao e autorizacao adequada.


## 0.2.9 - teste de .NET nativo e assistente de dependencias

Na VM Debian 13, a instalacao GUI do Microsoft .NET Framework 4.8
oficial chegou a tela "Instalacao Concluida" num prefixo de laboratorio
com Windows 7 SP1. A chave do registro
`HKLM\Software\Microsoft\NET Framework Setup\NDP\v4\Full`
retornou Release 0x80eb1 (528049); `mscorlib.dll` e `WMINet_Utils.dll`
foram identificados. Isso valida o runtime, NAO a inicializacao completa
da aplicacao PayGo.

O launcher 0.2.9 agora verifica o registro .NET nativo antes de iniciar
o instalador PayGo; caso falte, solicita consentimento, baixa o instalador
da Microsoft em tempo de execucao, confere o SHA-256 e exibe a EULA.
O binario da Microsoft NAO e redistribuido junto com a ISO. Em ambiente
Live com espaco insuficiente, a operacao e recusada com mensagem clara.
Nao executa transacoes reais.

Os testes de comunicacao do instalador PayGo responderam em IPv4,
mas falharam no IPv6 da API ControlPay na VM NAT sem rota IPv6 funcional.
Somente no LABORATORIO foi experimentado um mapeamento temporario de
`/etc/hosts` para um endereco IPv4 observado. Nao inclua IP fixo de
API de pagamentos no sistema de producao: o destino pode mudar.
A abertura final do PayGo e seu protocolo com o PIN-pad ainda dependem
de validacao independente; a simples abertura de COM1/COM8 nao significa
que pagamentos funcionem.
