# Enfoque OS 0.2.48 - Canfoque Pilot e contador de paginas

**Fase:** piloto. Nao instalar automaticamente em caixas sem homologar no PC de teste.

## Entregas

1. Canfoque 2.0.0-beta.1: AppImage integrado na ISO e menu de aplicativos,
   sem exigir conta pessoal no PC. Usa ID e nome do Enfoque OS no First Boot.
2. RustDesk OSS 1.5.3: motor nativo integrado na ISO. Requer configuracao de
   servidor privado e autorizacao TI antes de aceitar sessao. O staging atual
   no VPS esta limitado a loopback, sem acesso externo de lojas.
3. Telemetria: o agente enfoque-print-pages observa o CUPS page_log a cada
   dois segundos. Envia apenas ID, quantidade de paginas e horario.
   Jamais envia documento, nome de arquivo ou usuario que imprimiu.
4. Identidade: somente PCs Zero Touch aprovados podem publicar contadores.
   Identificacao de loja/nome e calculada a partir do registro central, nao
   do conteudo enviado pela propria maquina.
5. Offline e deduplicacao: banco SQLite local persiste itens pendentes. O
   servidor confirma lote e aplica UNIQUE(uuid, event_id). Repeticao nao soma.
6. Intranet: Configuracoes > Computadores > Impressoes em tempo real. Totais
   por dia, sete dias e acumulado, filtro por loja, busca ID e ultimo horario.
   Painel atualiza a cada tres segundos.

## Significado da contagem

CUPS PageLogFormat registra pagina e quantidade de copias. O agente envia
o numero contabilizado pelo spooler. Isso nao comprova a saida fisica do
papel em caso de atolamento ou falha. Trabalhos enviados diretamente para
impressoras sem passar pelo CUPS do PC nao sao contabilizados nesse PC.

A ativacao nao recupera historico inexistente. Quando a fila de impressao
estiver ocupada, a configuracao de CUPS e adiada e tentada novamente depois,
sem reiniciar o spooler durante os trabalhos.

## Testes e proxima etapa

- Validar a ISO via GitHub Actions na branch feature/canfoque-v2-iso-048.
- Instalar em PC de laboratorio, confirmar UUID exclusivo e cadastro Zero Touch.
- Imprimir uma pagina de teste autorizada, conferir o incremento +1.
- Simular internet desconectada, imprimir, reconectar e verificar reenvio unico.
- Homologar CUPS, opcoes de copias e rotacao de logs.
- So distribuir aos caixas apos esses testes e aprovacao da equipe de TI.

Maquinas antigas atualizadas pelo pacote APT recebem o painel/contador e o
aplicativo, mas RustDesk e pacote externo: instalar binario homologado pelo TI
se nao estiver presente. A nova ISO inclui RustDesk 1.5.3.

Verificacoes:
- python3 -m unittest discover -s test -p 'test_*.py' -q
- python3 -m unittest discover -s test -p 'test_print_pages_048.py' -v
- /opt/intranet-src: node --test test/print-page-routes.test.mjs
