# Enfoque OS 0.1.8 - captura de tela corporativa autenticada

## Status e seguranca
- A tela da VM piloto #101 foi capturada com Gdk/X11, enviada por HTTPS para o endpoint de imagem autenticado e conferida no servidor. A captura exibe o Enfoque Central, sem simulacao.
- Cada equipamento utiliza UUID v4 e token individual; a ISO **nao contem tokens ou senha**.
- O novo aplicativo **Vincular este PC a Enfoque** solicita as credenciais fornecidas por administrador na intranet e ativa dois servicos:
  - `enfoque-telemetria.service`: CPU e RAM autenticadas.
  - `enfoque-captura-tela.service`: JPEG da area de trabalho, atualizacao aproximada a cada 4 segundos, com limitações de banda/tamanho e reutilizacao do mesmo token individual.
- Ambos os servicos ficam **desabilitados por padrao na ISO**. Somente uma inscricao corporativa deliberada deve habilita-los.
- O servidor retém apenas a captura mais recente em pasta privada, sem acesso direto por URL publica. Somente admins com `remote_access.view`, sessao valida e desbloqueio temporario no modulo **Telas** acessam imagens.
- O codigo nao transmite teclas, texto digitado, historico do navegador ou arquivos como telemetria. A imagem da tela pode conter informacoes confidenciais, portanto acesso deve ser restrito e auditado.
- Captura funciona em XFCE/X11; nao foi testada em Wayland e pode exigir ajustes para telas multiplas, resolucoes elevadas e computadores fisicos.

## Administracao completa
- O envio de screenshots **nao equivale** a controlar teclado, mouse, terminal, arquivos ou programas. Para isso é necessario instalar e homologar um agente MeshCentral corporativo separado, autenticar cada operador e vincular o ID do equipamento ao canal administrativo do Root MCP.
- O suporte via navegador iniciado por usuarios comuns continua dependente de consentimento por sessao e indisponivel ate ser testado.
- O uso sem pedir confirmacao em cada sessao so pode ser feito em equipamentos corporativos previamente autorizados para gerenciamento administrativo e com logs/revogacao.
- A VM Live perde pareamento no reboot se nao tiver volume persistente. O teste da VM #101 utiliza um pareamento de laboratorio separado que nao foi incluido no repositorio.

## Homologacao
1. Acompanhar compilacao ISO 0.1.8, checksum e boot em VirtualBox.
2. Inscrever VM em ambiente com identidade persistente, testar CPU/RAM e imagem no modulo Telas, e testar a revogacao.
3. Validar desempenho do Chrome, CUPS, IPP/USB e impressoras Bematech fisicas por modelo.
4. Testar separadamente agente de controle integral com rede corporativa, permisos e auditoria.
