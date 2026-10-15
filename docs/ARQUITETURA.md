# Arquitetura-alvo (futura)

```
GitHub (codigo) -> VM Debian de desenvolvimento -> ISO Live -> VM de teste
                                            |
                              (no futuro) pacotes assinados
                                            |
                    Painel TI central com RBAC e auditoria
                       /                    \
                 Agente Linux          Agente Windows
```

Esta versao contem apenas scripts para gerar a ISO Live e um diagnostico local.

Proximas etapas: instalador testado, inventario de PCs, aplicativos assinados e distribuicao gradual por grupos, regras por cargo, controle remoto autorizado e automacoes ChatGPT com permissoes limitadas.

**Seguranca:** nada de shell root irrestrito para agentes, acessos remotos invisiveis ou credenciais fixas em imagem. Servidor de gestao offline nao pode impedir login local. Atualizacoes e rollback devem ser testados.

**Compatibilidade:** validar SIGE, impressoras, leitores, certificados e periféricos antes de implantar na loja.
