# PayGo no Enfoque OS 0.2.7 (piloto)

A ISO Debian 13 incorpora Wine 64 e 32 bits e o instalador oficial PayGo Windows sem Warsaw, com hashes verificados durante a compilacao. Nao e um modulo externo.

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
