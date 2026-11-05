# Enfoque OS 0.2.19 (piloto) - autenticacao remota e idioma na troca de senha

## Diagnostico confirmado em 05/11/2026

O agente Linux na ISO 0.2.18 cadastrava o computador normalmente, mas nao passava `X-PC-Device-ID` nas requisicoes autenticadas `/poll` e `/result`. O gateway MCP exigia **esse cabecalho e o token Bearer individual correspondente ao ID aprovado**. Resultado: 401 apos a aprovacao. O gateway mantem sua regra de seguranca; nenhum token foi embutido na ISO.

## Correcoes desta versao

- Envia `X-PC-Device-ID` e `Authorization: Bearer <token individual>` em ambos `/poll` e `/result`, com validacao do ID. O cadastro `/register` continua usando somente o hash do token e a aprovacao continua obrigatoria.
- O instalador grava **pt_BR.UTF-8** em `/etc/default/locale` e `/etc/locale.conf`, gera o locale e coloca um drop-in local para o `lightdm.service` iniciar em portugues **antes da etapa PAM de mudanca de senha obrigatoria**. A traducao oficial Linux-PAM em pt_BR ja existe na imagem; nao altera senha, bloqueio de root nem obrigatoriedade de troca.
- Mantidos o atalho da tecla Windows, menu somente com logo, bateria e desligamento seguro do pendrive.

## Limites e instalacoes anteriores

A ISO nova so vale para novas instalacoes. Reinstalar o Enfoque OS **apaga o disco** e gera nova identidade de dispositivo. Um PC ja instalado com a 0.2.18 precisa de atualizacao pontual do agente/configuracao em vez de reinstalacao, se for preservado o cadastro atual. A correção do header repara o polling de diagnostico **limitado**; ela nao provisiona automaticamente MeshCentral nem concede controle grafico, shell irrestrito ou privilegios root. Esses recursos continuam dependentes de pareamento individual, credenciais de TI e autorizacao de acesso. A ISO segue **piloto**, nao homologada para TEF/producao.

## Validacao

Os testes automatizados verificam compatibilidade dos cabecalhos no cliente, impedem polling sem ID valido, preservam a aprovacao individual, verificam as configuracoes de locale pre-login e protecoes de instalacao. Antes de liberar em producao, validar login, prompt PAM pt_BR e suporte remoto nos equipamentos autorizados.
