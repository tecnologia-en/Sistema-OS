# Enfoque OS 0.2.27 — correção do boot Live sem tela de login

## Sintoma real do piloto anterior

- ISO 0.2.26 gravada corretamente no pendrive Twist 32 GB e verificada por SHA256.
- No boot Live, o LightDM mostrava autenticação falhando para o usuário user.
- O getty tentava login automático como user e retornava "Authentication failure".
- O antigo serviço enfoque-ativar-grafico falhava porque o XFCE não iniciava.

## Causa identificada no projeto

O pacote enfoque-os-core contém um script DEBIAN/postinst. Como live-build
instala esse .deb no chroot ANTES do primeiro boot, a linha que criava o
administrador enfoque-ti atribuía o UID 1000 antecipadamente. O Debian
live-config user-setup então não conseguia criar user no UID 1000 como
esperado. O service que trocava o VT era uma consequência, não a origem.

## Corrigido

1. Removida criação de enfoque-ti do postinst do pacote. O instalador
   Enfoque OS em disco continua criando essa conta depois da instalação.
2. Serviço enfoque-live-session roda somente quando boot=live E
   /run/live/medium existe. Espera live-config e prepara a conta user,
   com senha conhecida do Debian Live apenas para fallback de terminal.
3. LightDM inicia xfce X11 automaticamente sem pedir login:
   autologin-user=user, autologin-session=xfce, timeout=0.
4. Serviço antigo de troca de VT restringido ao VirtualBox: hardware
   físico não deve sofrer alternância de TTY que possa apagar a tela.
5. Argumentos de boot definem username=user e removem o grupo netdev,
   que não existe na instalação base Debian 13.
6. O hook de build 104 bloqueia a publicação da ISO se alguma conta
   tiver ocupado UID 1000 dentro do chroot.
7. A CI verifica o pacote .deb gerado e recusa postinst com useradd.

## Testes feitos antes do push

- Contêiner descartável Debian 13 com LightDM: conta user UID 1000
  criada, senha configurada, autologin em XFCE ativado, execução idempotente.
- Simulação de boot instalado: o serviço não habilitou autologin.
- systemd Debian 13: serviço habilitado em graphical.target,
  ordenação depois de live-config e antes de LightDM, unit validada.
- Suite completa de testes e validação do projeto.
- Teste de instalação física pelo USB continua PENDENTE: não se deve
  declarar homologado apenas com testes estáticos e em contêiner.

## Limites de segurança

- Autologin apenas na sessão Live transitória. NUNCA habilitar
  automaticamente no sistema já instalado no disco.
- Não ajustar o pendrive nem acessar o PC do usuário sem autorização
  explícita; a nova build é publicada exclusivamente pelo GitHub.
- ISO antiga 0.2.26 possui defeito de login: não reutilizar esse release
  para novas instalações. Quando 0.2.27 terminar, gravar somente
  com nova autorização do responsável e verificar hashes.
