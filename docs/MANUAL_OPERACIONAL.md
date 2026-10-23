# Manual operacional — Enfoque OS: código, build, transferência e testes

**Revisão:** 23/10/2026 · **Ambiente:** notebook Windows + Enfoque Root MCP + GitHub + VirtualBox.

Este guia documenta o processo real executado no projeto Sistema OS, para que o responsável atual ou um substituto possa repetir o trabalho em outra conversa. O Enfoque OS é uma distribuição Debian 13 ainda **experimental**; uma compilação aprovada não equivale a uma homologação para lojas.

## Resumo do fluxo

1. ChatGPT usa o **Enfoque Root MCP** para acessar o notebook Windows aprovado, identificado como **notebook**.
2. As alterações do código-fonte são versionadas em **https://github.com/tecnologia-en/Sistema-OS**.
3. O notebook mantém a cópia local na pasta **%USERPROFILE%\Desktop\OS da enfoque**.
4. **GitHub Actions > Build Enfoque OS ISO** gera a ISO em um container temporário **Debian 13 (trixie)**. A VM de desenvolvimento não é necessária no fluxo normal.
5. O artefato do GitHub (ZIP contendo ISO + SHA256SUMS) é baixado para o Windows.
6. Os scripts PowerShell preparam a ISO, verificam seu SHA-256 e montam o DVD virtual da VM de testes.
7. Testamos o **Enfoque OS - Teste** com **2048 MB de RAM e 2 CPUs**, registramos os resultados e corrigimos o código se necessário.

## 1. Confirmar acesso remoto ao notebook

O notebook deve estar ligado, conectado à internet e com o agente autorizado do Enfoque Root MCP ativo. O servidor MCP intermediário encaminha comandos para o agente; isto **não** é uma conexão AnyDesk nem uma sessão SSH aberta diretamente no PC.

Na conexão Enfoque Root MCP, as operações mais utilizadas são:

| Operação | Quando usar |
| --- | --- |
| pc_status | Listar computadores autorizados e verificar heartbeat recente de notebook |
| pc_shell | Executar PowerShell no host Windows (deviceId = notebook) |
| pc_open | Abrir navegador, Explorer ou programas no notebook |
| pc_gui | Operar mouse, teclado, cliques e atalhos do host |
| pc_screenshot | Ver a tela principal do host Windows |
| pc_workflow | Agrupar ações interativas em um fluxo |
| pc_run | Iniciar programas do Windows quando necessário |

Primeiro consultar **pc_status**. Depois executar comandos curtos de leitura via **pc_shell** para confirmar Windows, Git e VirtualBox. Se o agente não responder, não afirmar que o notebook foi acessado: verificar conexão/pareamento e pedir ao responsável que ligue o agente, sem solicitar senhas em chat.

Para screenshots do sistema **dentro da VM**, preferir o VirtualBox (pois uma captura da tela principal do Windows pode não mostrar a janela da VM).

### Conferência inicial do Windows

~~~powershell
$repo = Join-Path $env:USERPROFILE 'Desktop\OS da enfoque'
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
Test-Path -LiteralPath $repo
Test-Path -LiteralPath $vbox
git -C $repo status --short
git -C $repo branch --show-current
& $vbox list vms
& $vbox list runningvms
~~~

Máquinas registradas em 23/10/2026:
- **Enfoque OS - Teste:** testes de ISO Live, 2 GB RAM, 2 CPUs.
- **Enfoque OS - Primeiro Acesso:** testes separados de instalador, cadastro e login.
- **Enfoque OS - Dev:** Debian de desenvolvimento antigo, somente contingência.

**Nunca iniciar várias VMs simultaneamente sem avaliar a memória disponível.** O notebook possui recursos limitados.

## 2. Atualizar e desenvolver o código

O GitHub é a fonte oficial; o Windows mantém um clone. Antes de modificar arquivos, conferir o commit e a branch atual. Repositório remoto: **tecnologia-en/Sistema-OS**. O principal ramo é **main**. Há também branches de recursos que podem ter builds próprios; use somente a branch solicitada e não sobrescreva commits de outras pessoas.

O ChatGPT pode modificar o GitHub pela conexão autenticada, fazendo uma mudança/árvore, criando commit e atualizando a referência da branch **sem force push**. Alternativamente, pode editar arquivos autorizados no clone Windows e versionar com Git, quando apropriado.

Atualizar o clone do notebook **após** publicar o commit:

~~~powershell
$repo = Join-Path $env:USERPROFILE 'Desktop\OS da enfoque'
git -C $repo status --short
git -C $repo pull --ff-only
git -C $repo log -1 --oneline
~~~

O comando **git pull** atualiza **código-fonte**, não transfere ISO. ISOs ficam no diretório **dist**, excluído do controle de versão. Se houver conflitos ou alterações locais, revisar os arquivos; **não** usar reset --hard / clean -fdx como resposta automática.

O número da próxima ISO é obtido de **config/includes.chroot/etc/enfoque-os-release**. Em 23/10/2026, a versão configurada na branch main é **0.2.7 (piloto)**. Não confundir versão compilada com versão homologada.

## 3. Gerar a ISO pelo GitHub Actions

Workflow: **.github/workflows/build-iso.yml**

Abrir: https://github.com/tecnologia-en/Sistema-OS/actions/workflows/build-iso.yml

O workflow executa automaticamente quando há mudanças relevantes em config/** ou nos scripts e arquivo do próprio build, nas branches configuradas. Também pode ser iniciado manualmente em **Run workflow**, selecionando a branch correta. Alterações exclusivamente em documentação geralmente **não** iniciam a compilação.

O que o workflow faz:
1. Faz checkout do commit selecionado.
2. Valida a estrutura com **scripts/check-project.sh**.
3. Executa um container temporário **debian:trixie** sobre um runner GitHub Ubuntu e instala live-build, debootstrap, squashfs, xorriso e utilitários de boot.
4. Executa **scripts/build-iso.sh**, que monta um sistema Debian Live **amd64**, incluindo os arquivos sob **config/**.
5. Calcula e verifica **dist/SHA256SUMS** com sha256sum.
6. Publica um artefato chamado **enfoque-os-iso-N** contendo a ISO e o arquivo SHA256SUMS.

O container precisa de permissões de montagem elevadas durante o build; só executar esse workflow para código confiável. O workflow tem controle de concorrência: uma execução mais nova pode cancelar outra em andamento. Evite enviar vários commits que disparem builds antes de conferir a primeira compilação.

**Critério de sucesso:** execução Actions marcada **success**, validação de SHA-256 aprovada e artefato presente. Salvar o ID da execução, branch, SHA do commit, versão e link. Sucesso de build **não comprova** que a ISO inicializa.

## 4. Transferir a ISO do GitHub para o notebook Windows

Método padrão:

1. Abrir a página **Actions** da execução que terminou com sucesso.
2. Em **Artifacts**, baixar **enfoque-os-iso-N**. A conta do navegador pode precisar estar autenticada no GitHub.
3. O ZIP contém uma única ISO e seu manifesto **SHA256SUMS**.
4. Guardar o ZIP em Downloads; não copiar uma ISO sem confirmar versão e integridade.
5. Preparar o artefato pelo script do projeto:

~~~powershell
$repo = Join-Path $env:USERPROFILE 'Desktop\OS da enfoque'
Set-Location -LiteralPath $repo
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\preparar-iso.ps1 -ZipPath "$env:USERPROFILE\Downloads\enfoque-os-iso-N.zip"
~~~

Trocar **N** pelo número do artefato efetivamente baixado. O script inspeciona o ZIP, identifica a versão, extrai para **dist\<versão>\**, confere SHA256SUMS e não sobrescreve versões existentes. O formato esperado é **enfoque-os-VERSAO-piloto-amd64.iso**.

**Limite técnico importante:** o conector GitHub nem sempre consegue transferir diretamente artefatos acima de 512 MiB. Isso não significa que a ISO não exista; use o navegador autorizado no notebook para baixar o artefato, ou o GitHub CLI autenticado se estiver disponível. Links temporários do Actions expiram: não reutilizar URL com assinatura expirada. Os artefatos do workflow atual são retidos por **7 dias**, salvo alteração na configuração.

**Alternativa por partes:** o workflow **split-iso.yml** e o script **juntar-iso-partes.ps1** atualmente esperam **exatamente quatro partes de até 300 MiB**. Esse fluxo histórico **NÃO** serve, sem alteração, para as ISOs mais novas que passam de 1,2 GiB. Em 23/10/2026, o artefato da compilação 0.2.7 tinha cerca de **1.978 MiB**. Para versões grandes, baixar o ZIP completo, usar uma Release publicada para aquela versão, ou **primeiro** generalizar o workflow/script de divisão para quantidade variável de partes com hash por parte e hash final. Não misturar manifestos de versões.

**Estado observado em 23/10/2026:** o build de 0.2.7 da branch main concluiu com sucesso na execução GitHub Actions **39671571270** e publicou **enfoque-os-iso-29**, mas a pasta local **dist\0.2.7** do notebook estava vazia na inspeção. Portanto, não presumir que a ISO 0.2.7 já foi copiada nem testada.

## 5. Anexar a ISO e iniciar a VM de testes

O procedimento recomendado utiliza **scripts/windows/testar-iso.ps1**. Esse script exige:
- A ISO e **SHA256SUMS** corretos na mesma pasta.
- A VM **Enfoque OS - Teste** cadastrada no VirtualBox.
- Estado da VM exatamente **poweroff** (não running nem saved).

Se a VM estiver ligada, primeiro desligar normalmente pelo menu do sistema ou solicitar desligamento ACPI e **confirmar** que terminou. Não forçar poweroff de uma VM com dados importantes.

~~~powershell
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
& $vbox showvminfo 'Enfoque OS - Teste' --machinereadable | Select-String '^VMState='
~~~

Após a ISO estar em **dist\<versão>**, executar (exemplo com versão 0.2.7, que deve ter sido baixada antes):

~~~powershell
$repo = Join-Path $env:USERPROFILE 'Desktop\OS da enfoque'
Set-Location -LiteralPath $repo
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\testar-iso.ps1 -IsoPath ".\dist\0.2.7\enfoque-os-0.2.7-piloto-amd64.iso" -StartVM
~~~

O script verifica o SHA-256, monta a ISO como DVD virtual na controladora **SATA, porta 1, dispositivo 0**, e inicia a VM em modo gráfico. Ele **não** instala o Linux no disco virtual automaticamente, não apaga partições e não altera computadores das lojas.

### Controle manual do VirtualBox, somente se necessário

~~~powershell
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
& $vbox list runningvms
& $vbox showvminfo 'Enfoque OS - Teste' --machinereadable | Select-String '^VMState='
# Apenas quando a VM estiver ligada: solicitar desligamento seguro
& $vbox controlvm 'Enfoque OS - Teste' acpipowerbutton
# Depois de confirmar VMState="poweroff", o script testar-iso.ps1 pode montar a proxima ISO.
~~~

## 6. Como o ChatGPT observa e opera a VM

O comando **pc_screenshot** mostra a tela principal do Windows. Para capturar diretamente a tela da VM, uso o programa **VBoxManage.exe** no host:

~~~powershell
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
$png = Join-Path $env:TEMP 'enfoque-os-teste.png'
& $vbox controlvm 'Enfoque OS - Teste' screenshotpng $png
~~~

A imagem criada no Windows pode ser lida por ferramenta de imagem autorizada. O comando **keyboardputstring** do VBoxManage injeta texto, e **keyboardputscancode** injeta teclas na VM, mas exigem foco e um terminal já aberto no convidado. Exemplo:

~~~powershell
& $vbox controlvm 'Enfoque OS - Teste' keyboardputstring 'free -m'
& $vbox controlvm 'Enfoque OS - Teste' keyboardputscancode 1c 9c
~~~

**Atenção:** Keyboardputstring não é um shell remoto universal. Se a VM estiver na tela errada ou sem terminal, o texto irá para o lugar errado. O teclado ABNT2 pode interferir em símbolos. Capturar a tela após cada ação importante e conferir o retorno; não afirmar que um comando rodou apenas porque foi enviado. Para execução programática real no convidado, configurar um canal autorizado de gerenciamento/Guest Additions quando estiver disponível, sem expor root ou credenciais.

## 7. Checklist mínimo de teste na VM (2 GB)

**Boot e sessão:** ISO selecionada no DVD virtual; boot sem kernel panic; login, XFCE e primeiro acesso adequados para a versão. Executar ao menos um reboot e verificar retorno ao desktop. Para cadastro e seleção de empresa, usar a VM **Enfoque OS - Primeiro Acesso**, sem interferir na VM padrão de testes.

**Identificação, desempenho e configuração:** abrir terminal na VM e conferir:

~~~bash
cat /etc/enfoque-os-release
free -m
uname -r
locale
setxkbmap -query
timedatectl
xdg-settings get default-web-browser
systemd-analyze
journalctl -b -p err --no-pager | tail -n 30
~~~

**Interface e apps:** conferir logo/wallpaper, barra inferior, relógio/data, ícones, Chrome padrão, URLs exatas do SIGE e da Intranet, gerenciador de arquivos, utilitário de diagnóstico, indicador de rede e controle de volume. Testar navegação HTTPS com páginas públicas e algumas abas, medindo RAM em repouso e sob carga.

**Recursos novos:** testar em ambiente isolado e de forma explícita. Inventário e controle de tela só depois de pareamento/autorizações; periféricos devem ser testados conforme hardware presente. O PayGo via Wine da versão 0.2.7 é **piloto não validado**: não realizar pagamentos reais, transações produtivas ou operar PIN-pads financeiros de lojas sem homologação, sandbox e aprovação.

**Falha grave:** hash divergente, tela que não inicia, kernel panic, ausência de login, funcionalidade crítica quebrada, dados sensíveis na imagem ou comportamento remoto sem autorização: marcar como **reprovado**, registrar logs, corrigir no GitHub e repetir build + teste. Nunca declarar homologação só porque a ISO foi gerada.

## 8. Registrar resultados e continuar o ciclo

Em **docs/**, manter relatório por versão com:
- Data do teste, branch, SHA do commit, run ID GitHub e hash da ISO.
- Configuração da VM (RAM/CPU/BIOS ou UEFI), passos efetivamente executados.
- Resultados de boot, interface, rede, aplicativos, RAM, logs e reinicialização.
- Bugs reproduzidos, correção proposta e status: **aprovado em laboratório / reprovado / pendente**.
- Itens ainda não testados (hardware real, segurança, SIGE autenticado, impressoras, atualizações e PDV).

Se o teste encontrar erro: alterar a fonte no GitHub, validar, publicar novo commit, atualizar o clone Windows, compilar outra ISO, transferir com hash e testar de novo.

## 9. Compilação de contingência (somente se GitHub Actions ficar indisponível)

A VM **Enfoque OS - Dev** mantém Debian 13. Se absolutamente necessário, pode gerar ISO nela:

~~~bash
cd ~/Sistema-OS
git pull --ff-only
./scripts/check-project.sh
sudo ./scripts/build-iso.sh
~~~

Depois copiar a ISO validada para o Windows por canal controlado e desligar a VM de desenvolvimento antes de ligar a de testes. Esta é uma **contingência**, não o fluxo padrão. Não expor a porta de transferência publicamente.

## 10. Pedido reutilizável para continuar em outro chat

> Continue o projeto Enfoque OS. Use o **Enfoque Root MCP**, dispositivo **notebook**, para acessar o Windows autorizado. Repositório **tecnologia-en/Sistema-OS**. O clone local fica em **%USERPROFILE%\Desktop\OS da enfoque**. Confirme o estado do Git e do VirtualBox, faça as alterações solicitadas no GitHub, valide os scripts, execute **Build Enfoque OS ISO** no GitHub Actions e verifique o SHA/artefato. Baixe a ISO no Windows, prepare com **scripts/windows/preparar-iso.ps1**, monte com **scripts/windows/testar-iso.ps1** e teste somente a VM **Enfoque OS - Teste** com 2 GB. Consulte este manual, registre os resultados e corrija os erros encontrados. A VM de desenvolvimento é apenas contingência. Não mexa em caixas nem faça pagamentos reais. Nunca invente sucesso: confirme logs, arquivos, hashes e tela de boot.

## Referências do próprio projeto

- GitHub: https://github.com/tecnologia-en/Sistema-OS
- Build: https://github.com/tecnologia-en/Sistema-OS/actions/workflows/build-iso.yml
- Builds passados: https://github.com/tecnologia-en/Sistema-OS/actions
- Referência original do workflow: docs/BUILD_WINDOWS_GITHUB.md
- Preparar ISO: scripts/windows/preparar-iso.ps1
- Validar/montar ISO: scripts/windows/testar-iso.ps1
- Divisão legada de ISO: docs/TRANSFERIR_ISO_GRANDE.md
- Checklists e relatórios: docs/TESTES_PILOTO.md
