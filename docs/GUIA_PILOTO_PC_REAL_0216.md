# Enfoque OS 0.2.16 — piloto no primeiro computador físico

**Status:** candidato de QA. O boot BIOS e UEFI foi verificado na VM com a ISO 0.2.15, mas a 0.2.16 exige revalidação. Não instalar em caixas atendendo clientes sem testes de periféricos e TEF.

## Preparação

- Escolha **um PC de teste livre de dados críticos**. O instalador **apaga integralmente o disco selecionado**, não preserva sistema anterior, partições, documentos ou licenças.
- Copie e confira os backups antes. Não selecione discos com dados que deseja preservar.
- Configuração-alvo: processador x86_64, **2 GiB de RAM**, armazenamento interno >=24 GiB, rede. Manter o pendrive conectado apenas para a instalação.
- Obtenha o lançamento `v0.2.16-piloto` no GitHub depois da confirmação do checksum. Junte `chunk-00`, `chunk-01`, ... em ordem num único `enfoque-os-0.2.16-piloto-amd64.iso`, e **verifique o SHA-256 listado em `SHA256SUMS`**. Nunca grave uma imagem incompleta.
- Grave a ISO num pendrive separado usando um gravador de ISO híbrida, como Rufus em modo DD quando solicitado ou balenaEtcher. Isso apagará também o pendrive escolhido.
- Em UEFI, **Secure Boot deve estar desativado** nesta fase: o GRUB instalado não possui assinatura aceita pelo Secure Boot. Uma tela vermelha "Secure Boot Violation / Invalid signature detected" indica bloqueio pelo firmware, **não prova falha da instalação**. Desative apenas o Secure Boot na BIOS; **mantenha o modo UEFI**, não restaure chaves/TPM e não reformate sem confirmar que a instalação falhou. Escolha boot pelo pendrive usando o menu de firmware.

## Instalação

1. Inicie o Enfoque OS Live pelo pendrive e aguarde a interface XFCE. O instalador **Instalar Enfoque OS** abre no modo Live.
2. Confira **modelo, capacidade e caminho** do disco de destino. Só aparecem candidatos internos não USB, de capacidade suficiente e sem volumes montados/swap ativo. Se houver qualquer dúvida sobre o disco, **cancele**.
3. Escreva exatamente `APAGAR` e confirme. A operação é destrutiva e não tem desfazer. O instalador prepara GPT e GRUB BIOS/UEFI.
4. Após a confirmação de sucesso, **MANTENHA O PENDRIVE CONECTADO** enquanto o Linux Live ainda estiver ligado. Na 0.2.16, desligue pelo terminal com `sudo poweroff` (ou comando de desligamento do XFCE), aguarde o PC apagar **totalmente**, e só então retire o pendrive e ligue novamente pelo disco interno. **Nunca retire o pendrive com a sessão Live aberta**: isso pode derrubar o Menu Whisker e outros programas. O instalador de versões futuras terá botão de desligamento seguro.
5. No primeiro login, usuário `enfoque` e **senha temporária `123456`**. O sistema exigirá a **troca para uma senha nova** (individual) antes do desktop. Não reutilize `123456` como senha definitiva nem como credencial de acesso remoto.
6. Na tela **Configuração inicial**, informe nome identificável do computador (ex.: `CAIXA-ILHA-01`), empresa e loja. Confirme uma única vez.
7. Abra **ID do computador** e registre o código e o UUID. Reinicie e verifique que nome, loja, UUID e ID são **exatamente os mesmos**. Reinstalação com formatação gera ID novo, mas um reboot não.
8. O agente remoto envia solicitação de inscrição **somente depois da identificação**; um operador TI deve aprovar cada máquina explicitamente, com credencial individual. Não aplique uma senha global de AnyDesk a todos os equipamentos.

## Homologação antes de qualquer pagamento real

- Conferir horários locais de São Paulo, idioma, Wi-Fi/rede, barra de tarefas, SIGE, Intranet, CUPS e impressão efetiva.
- Conectar GERTEC PPC930 USB: identificar fabricante/produto e testar a porta serial persistente, /dev/ttyACM* e COM8 do Wine se aplicável.
- Validar PayGo DEMO com aprovação, negativa, cancelamento e timeout; **não reenviar venda com status incerto**, conciliar pelo ID original e logs do PSP.
- Após verificar todos os periféricos e fluxo de venda/cancelamento em homologação, realizar a aprovação administrativa da mudança para produção financeira. Até lá, **não processar vendas de clientes** no novo sistema.
- Em caso de falha, coletar logs e retornar ao sistema anterior de contingência, sem instalar em mais lojas.

## Riscos residuais

Nenhuma ISO pode ser declarada literalmente “sem brechas”. Este piloto ainda requer validação de hardware, Secure Boot, senha por usuário, anti-clonagem operacional, atualizações de segurança, restauração após queda de energia, autenticação de acesso remoto e homologação financeira. O identificador único é criado **por instalação**, portanto copiar um disco já configurado para outro PC também copiaria o ID: **instalar cada PC a partir da ISO original, não clonar instalações concluídas**.
