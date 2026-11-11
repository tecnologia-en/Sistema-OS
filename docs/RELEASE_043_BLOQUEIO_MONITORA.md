# Enfoque OS 0.2.43 (pacote 0.2.43-2) - tela de bloqueio e Monitora gerenciado

## Tela ligada e protecao de sessao
- O problema da 0.2.42 foi confirmado em SALAO-ILHA: modo do saver 0 (tela em branco), xset com blanking de 180s e DPMS habilitado.
- Apos 3 minutos inativo, o protetor de tela nativo XFCE mostra o visual Enfoque com wallpaper escurecido, relogio e data. O monitor nao deve apagar automaticamente.
- Antes de 15 minutos, qualquer tecla libera o descanso. A partir de 15 minutos totais, o xfce4-screensaver controla o desbloqueio com senha via PAM; o visual nao intercepta o teclado nem a senha.
- Tema usa XSCREENSAVER_WINDOW, GdkX11 e Cairo para desenhar diretamente na janela oficial do protetor, sem janela paralela, com fallback ao slideshow nativo. A transicao visual de saida e iniciada quando o XFCE encerra o tema; pode ser interrompida pelo gerenciador do bloqueio.
- enfoque-tela-ativa reaplica ajustes na sessao grafica apos instalar o pacote, sem reiniciar Chrome, caixa ou desktop. Autostart reaplica no login e watchdog preserva o monitor ligado.
- O modo Live nao recebe politica de bloqueio. Sono voluntario continua funcao separada.

Limite de homologacao: verificacoes automaticas e estaticas passam, mas a animacao, os temas XFCE e dialogo de senha exigem validacao humana em PC de testes antes da implantacao massiva.

## Monitora 1.1.0 sem intervencao grafica
- Extensao Chrome distribuida como CRX assinado com identificador constante ngghdkeagknifjchbdaaejgkipgfghbb, via atualizacao XML e CRX HTTPS em /monitora/distribuicao/. A chave privada de assinatura fica somente no servidor TI, nunca no pacote.
- Politica Linux Chrome ExtensionSettings de instalacao obrigatoria: usuario comum nao pode remover. Nao ha arquivos nem atalhos no desktop.
- Identidade Zero Touch Ed25519 com aprovacao administrativa. O servidor converte o UUID do Zero Touch em `enfoqueos-UUID` no registro Monitora; a resposta assinada ao cliente mantem o UUID original. A partir da 0.2.43, status autenticado e aprovado solicita monitoraProvision e recebe token de escrita exclusivo. O UUID publico NAO e o token.
- Servidor usa chave HMAC de 256 bits em /var/lib/monitora/bootstrap-hmac.key (apenas servidor). Banco guarda hash. Token antigo de SALAO-ILHA e reaproveitado, nao cria identidade duplicada.
- O OS grava apenas politica 3rdparty de dispositivo em 41-enfoque-monitora-device.json. A extensao 1.1.0 consulta chrome.storage.managed. Manual continua disponivel para Chrome nao gerenciado. Nenhum clique ou alteracao do perfil.
- PCs atuais so recebem token apos TI aprovar a atualizacao e Zero Touch estar validado.
- Informar colaboradores; RH/juridico validam politica de transparencia, finalidade, retencao, necessidade e base legal.

## Validação / implantacao
1. Testes: Python unittest no diretorio test; node --test dos testes Zero Touch; bash scripts/check-project.sh.
2. Conferir conteudo dpkg-deb: CRX, politicas, servicos, tema e visual. Publicar o pacote 0.2.43-2 no repositorio assinado. O pacote 0.2.43-1 anterior nao deve ser sobrescrito.
3. Nao criar campanha, nao reiniciar computador, nao modificar pendrive.
4. Homologar visual aos 3 minutos, autenticacao apos 15 e Chrome com policy obrigatoria em ambiente descartavel.
