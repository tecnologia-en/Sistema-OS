# Enfoque OS 0.2.5 - Primeiro acesso, empresa e login

## Fluxo real em computador instalado

1. Inicie a **ISO Live** de testes. O modo Live **nao guarda usuarios apos reiniciar**.
2. No desktop Live, abra **Instalar Enfoque OS**. O instalador oficial Debian Calamares permite selecionar o disco de destino e pede **nome do usuario, login e senha**; o Linux gerencia o hash da senha em /etc/shadow. **AVISO: instalar/apagar particionar disco exige backup e confirmacao.**
3. Reinicie pelo **disco instalado**. O LightDM mostra a lista de usuarios locais e pede a senha. Nao ha login automatico no sistema instalado.
4. No primeiro login do novo usuario, abre uma janela **Enfoque OS - Primeiro acesso**. Escolha a **empresa** (Enfoque Papelaria ou Papel & Arte) e a **loja/unidade**. O username ja definido no instalador aparece para conferencia.
5. O cadastro e salvo em **~/.config/enfoque-os/identity.json** apenas no computador, com permissoes 600. Sem senha, token ou cookies. Nas proximas sessoes, o assistente nao reaparece; a tela LightDM continua exigindo a senha.
6. Se o computador tiver sido cadastrado *pela TI* na Central de Computadores com um token individual, a telemetria autenticada envia apenas username Linux, companyId e unitId do usuario que estiver na sessao grafica ativa.
7. Na Intranet > Central de Computadores, o cadastro aparece como **EMPRESA INFORMADA PELO USUARIO (NAO VALIDADA)**, unidade e usuario local. A identificacao nao substitui empresas/permissoes do SIGE/Intranet nem altera direitos de acesso.

## Privacidade e seguranca

- **Nenhuma senha e transmitida, salva em arquivos de inventario ou integrada ao backend.** A senha do Linux pertence ao PAM/LightDM/Calamares.
- Escolher a empresa e um dado *declarado pelo funcionario*, nao e uma declaracao de identidade corporativa verificada; a TI deve autorizar o acesso por permissoes da Intranet independentemente desse campo.
- A selecao de empresa permite: Enfoque Papelaria (Ilha Plaza, Copacabana, Itaipu, Icarai, Sao Goncalo - Centro, Centro - Enfoque, Deposito Celestino, Administracao/TI); Papel & Arte (Papel & Arte, Administracao/TI).
- Varias contas Linux no mesmo computador sao possiveis. Cada uma registra sua associacao no primeiro login.
- A instalacao pode criar contas normais; sempre criar pelo instalador, nunca compartilhar senhas. O modo Live continua aberto apenas para teste sem usuario permanente.
- O agente de telemetria so funciona apos pareamento individual autorizado com credencial especifica do dispositivo.

## Testes para homologacao

- [ ] Build da ISO e checksum SHA-256 no GitHub Actions.
- [ ] Boot ISO Live, icones e menus; verificar audio, rede e data/hora.
- [ ] Abrir Calamares **na VM de laboratorio** e instalar no disco **virtual separado**, sem tocar no disco do notebook.
- [ ] Criar usuario local e senha de teste durante a instalacao.
- [ ] Boot **do disco virtual** sem ISO: LightDM mostra usuario e pede senha.
- [ ] Login com senha valida, selecionar empresa/unidade, reiniciar, autenticar novamente; assistente nao reaparece.
- [ ] Validar perfil local persistido e ausente qualquer senha em JSON e telemetria.
- [ ] Em dispositivo pareado de teste, confirmar que a Central de Computadores exibe a empresa/unidade como *nao verificadas* e sem alterar permissoes.
- [ ] Testar em hardware fisico (audio, rede, impressoras) antes de instalar nas lojas.

**Versao:** 0.2.5 piloto. Sem homologacao de producao ate concluir a instalacao virtual e testes.
