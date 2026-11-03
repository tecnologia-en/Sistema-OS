# Enfoque OS - QA da instalação e first boot (03/11/2026)

## Escopo e ambiente

Teste real da **ISO 0.2.15**, hash SHA-256 `e4c15a908bd5813e6bc48c2d17891e37b68e002ad4799e60e493ab45dacda8fd`, montada na VM **Enfoque OS 0.2.15 QA** (VirtualBox, Debian 13, firmware BIOS, 2 GiB RAM, 2 CPUs, VDI interno de 32 GiB). ISO original preservada em `dist/0.2.15` no notebook; sem alterar discos físicos do Windows.

- A ISO Live inicializou na VM e exibiu o XFCE Enfoque.
- O instalador próprio identificou **somente** o VDI `/dev/sda` 32 GiB, exigiu digitar `APAGAR`, particionou o disco de teste em GPT, extraiu o `filesystem.squashfs`, preparou `initramfs`, GRUB BIOS e EFI e confirmou conclusão.
- A VM desligou normalmente; após ejetar o ISO e configurar o disco como primeiro boot, **iniciou pelo VDI sem mídia de instalação** e exibiu o LightDM.
- Usuário inicial `enfoque` e código provisório `123456` funcionaram; o login **exigiu trocar a senha** e validou a confirmação. A senha definitiva de QA não pertence à imagem e não deve ser registrada em relatórios.
- XFCE instalou e iniciou. O primeiro acesso foi concluído com `CAIXA ILHA QA15`, Enfoque Papelaria, loja `Ilha Plaza`. O nome de host no sistema passou a `caixa-ilha-qa15`. O ID exibido evoluiu de `733197357073-0` para **`733197357073-1`** ao selecionar a unidade.
- O arquivo de cadastro `/var/lib/enfoque-os/firstboot.json` foi criado em disco com proprietário root, e `enfoque-id --json` retornou `live:false`, a unidade e o nome corretos; não alterou o UUID. Hashes dos dois arquivos de identidade foram gravados em `/home/enfoque/qa-identity-before.sha` para comparação pós-reboot.
- O segundo boot ocorreu e a tela de login conservou o hostname `caixa-ilha-qa15`.

## Falhas residuais observadas na 0.2.15

1. Na instalação, o relógio do LightDM foi mostrado em UTC, adiantado 3 horas relativamente ao horário de São Paulo, e algumas mensagens do greeter em inglês.
2. A janela de identificação era executada em um serviço de usuário e podia ficar **atrás** do Enfoque Central aberto no início da sessão.
3. A comparação de hashes de identidade após o segundo login **não foi concluída**: a ferramenta de acesso remoto bloqueou a inserção da senha de QA; nenhuma tentativa alternativa foi feita.
4. O pinpad GERTEC PPC930 não estava conectado à VM; testes de transação PayGo em terminal físico não foram realizados.
5. Boot UEFI, redes de lojas, impressoras reais, AnyDesk unattended e MeshCentral autenticado ainda exigem validação operacional separada.

## Correções de código propostas para a ISO 0.2.16

- O instalador aplica de forma persistente `America/Sao_Paulo`, `/etc/localtime` e `pt_BR.UTF-8` no **sistema instalado**, gerando a locale no chroot.
- Enfoque Central continua disponível no menu, mas o seu autostart está explicitamente desabilitado (`Hidden=true`).
- O assistente do primeiro acesso roda na própria sessão XFCE e se apresenta uma vez após o início da sessão.
- Versão de release, interface de boot e identificação do agente alinhadas à 0.2.16.
- 144 testes automatizados de regressão e `scripts/check-project.sh` aprovados **no código-fonte**.

## Bloqueios para liberação em toda a rede

A ISO 0.2.15 foi testada em VM BIOS, mas **não deve ser tratada como homologada para pagamentos reais**. A 0.2.16 só estará pronta como piloto físico após compilar, validar checksum, reinstalar em VM, verificar fuso/idioma, confirmar firstboot em foreground, comparar IDs após reboot, testar instalação UEFI e executar PayGo/pinpad com periféricos reais. Controle remoto de cada máquina deve requerer autorização da TI com tokens próprios por dispositivo. Senha `123456` só é aceitável como código temporário de inicialização com troca obrigatória, nunca como senha remota global.

O status de produção **não é "zero brechas"**: esta alegação exige revisão e testes de segurança adicionais, além do teste em hardware de loja.
