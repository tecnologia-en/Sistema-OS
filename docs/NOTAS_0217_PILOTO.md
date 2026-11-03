# Enfoque OS 0.2.17 - ajustes de menu (piloto)

## Incluido na ISO

- Tecla Windows (Super_L) abre o menu Whisker (`xfce4-popup-whiskermenu`) em uma sessao XFCE nova.
- Botao de menu no painel mostra somente o icone corporativo `enfoque-start`, sem o titulo "Enfoque OS".
- Correcao de encerramento do instalador: manter pendrive ate o PC desligar; botao "Desligar com seguranca".
- Registro limitado do agente atualizado para refletir a versao 0.2.17.

## Acesso remoto: alteracao deliberadamente NAO incluida

O computador fisico instalado na 0.2.16 se registrou normalmente no servidor, mas ficou na fila de aprovacao de TI. Um botao local "Permitir" nao substitui aprovacao de operador autorizado e, por si so, nao resolveria o bloqueio administrativo encontrado. Conceder aprovacao permanente diretamente com um simples clique no cliente permitiria que um usuario local liberasse acesso remoto indefinido sem validacao central; isso nao sera implementado. A aprovacao continua sendo feita pelo fluxo administrativo oficial com auditoria e revogacao. O bloqueio da ferramenta de aprovacao utilizada pelo ChatGPT nao deve ser contornado.

## Estado do artefato

Esta versao foi solicitada sem teste em VM. O build e suas verificacoes de integridade nao substituem validacao de boot, desempenho, periféricos e TEF no PC fisico. O 0.2.17 e um **piloto**, nao uma homologacao para pagamentos reais.
