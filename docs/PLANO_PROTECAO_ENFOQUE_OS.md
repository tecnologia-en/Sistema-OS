# Enfoque OS — prevenção e recuperação (candidato, sem commit)
Base atual: Debian 13 (trixie), XFCE, instalador proprietário com EXT4, boot BIOS/UEFI.

## Implementado no candidato (necessita validar na ISO instalada)
- Central GTK «Consertar meu PC» com diagnósticos locais e operações administrativas confirmadas.
- APT do Enfoque agora exige snapshot verificado antes de instalar, remover ou atualizar.
- Atualizações automáticas exigem Timeshift/Snapper configurado; caso contrário, a operação é bloqueada e registrada.
- Override somente em manutenção manual com bandeira explícita --sem-snapshot-por-autorizacao.
- Timeshift (rsync) para instalações EXT4: snapshots e restauração via assistente, destino de backup configurado pela TI.
- Monitor de saúde SMART/temperatura/uso de disco, com alertas locais; sem enviar dados à nuvem.
- Backup criptografado restic de arquivos e perfis de navegador, só após destino e senha próprios do dispositivo serem configurados.
- Diagnóstico rede DNS/gateway/HTTPS; reparos não destrutivos preferidos.
- Reparo CUPS não apaga trabalhos por padrão; cancelar fila requer confirmação local distinta.
- Limpeza segura só alcança cache APT e /var/cache/enfoque-os antigo. Não apaga /home, /tmp, arquivos TEF nem dados do navegador.
- Solicitação de suporte registrável no PC com alerta de que envio e consentimento remoto não estão integrados ao servidor.
- Modo de quiosque SEM sudo já existia no Enfoque OS, e continua opcional.

## O que NÃO está concluído
- Rollback automático de uma falha de boot: requer arquitetura de boot A/B ou Btrfs/GRUB testada. Timeshift sobre EXT4 não faz isso.
- Sistema base imutável: raiz EXT4 atual é gravável e precisa disso para APT/PayGo. Só a conta de quiosque está protegida.
- Anti-malware universal e bloqueio de todo aplicativo: disponível somente canal APT assinado + contas de poucos privilégios. Não prometer que nada perigoso pode rodar.
- Sincronização entre computadores: Chrome/conta de usuário exige configuração e política individual, não pode copiar perfis compartilhados às cegas.
- Auto-reparo de aplicativo travado, de drivers e de toda impressora térmica: demanda validação por hardware e driver específico.
- Protocolo de consentimento remoto executável: precisa mudanças autenticadas no servidor e no agente. O serviço atual de suporte aprovado pode permanecer persistente; não afirmar que toda sessão já pede consentimento.
- Console de disparo de correções remotas em lote: continuar usando somente pacote APT assinado/fluxo remoto autorizado, nunca comandos arbitrários recebidos de rede.
- Disco SMART monitorado em hardware físico, login admin via polkit, reinicialização do sistema e restauração de verdade: ainda não homologados.

## Antes de homologar
1. Fazer instalação em VM descartável clonada com EXT4 e disco EXTRA para snapshots.
2. Configurar Timeshift; validar snapshot antes de update. Simular falha e restaurar via ISO Live.
3. Confirmar compatibilidade com PayGo, SIGE, Web apps, CUPS térmicas e controle remoto.
4. Testar mudanças somente num dispositivo piloto sem vendas reais.
5. Para imutabilidade e rollback automático, desenhar instalador Btrfs A/B isolado e QA BIOS+UEFI.

## Segurança
- Nenhuma senha, chave privada, URL de backup interna com credenciais nem token é distribuído na ISO.
- As chamadas ao reparo usam lista fixa de comandos; não há execução de shell fornecido pelo servidor.
- Reparos potencialmente disruptivos só após aprovação local e senha admin.
- Backup precisa proteger sigilo de clientes e dados do navegador; definir retenção e teste de restauração.

## Novos itens da Central
- Primeiro uso: assistente opcional para conexao, impressoras, navegador e protecao, sem ler senhas.
- Limpeza automatica: somente cache Enfoque antigo apos disco exceder 85% usado; nunca cache ou arquivos do cliente.
- Autenticacao grafica de administrador: mate-polkit, incluso na lista de pacotes de Debian 13.
- O painel de sino integra avisos locais de disco/SMART lidos de /var/lib/enfoque-os/health-status.json.
