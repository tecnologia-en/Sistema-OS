# Enfoque OS 1.0.6 - Indicador de rede fixo no XFCE

- Base cumulativa: codigo 1.0.5, preservando os componentes da N960K
  1.7.8.38, incluindo ponte/servicos e extensao distribuida inativa.
- Novo plugin genmon-19: SVG visivel com cabo, Wi-Fi ou sem conexao.
- O estado e lido do NetworkManager a cada 5 segundos, com fallback
  local por interfaces caso o NetworkManager esteja indisponivel.
- O icone independe do icone de bandeja do nm-applet; clicar abre
  nm-connection-editor.
- Instalacoes novas possuem o plugin no painel padrao.
- Perfis existentes recebem apenas o plugin 19, sem apagar outros plugins.
  A migracao e idempotente, executada apos instalacao em sessoes XFCE
  ativas e no login seguinte.
- A atualizacao APT exige uma imagem de recuperacao verificada pela
  rotina da frota e nao deve reiniciar computadores em operacao.
- Testes: test_release_105_n960k, test_release_106_network_panel,
  scripts/check-project.sh e comparacao integral de arquivos do pacote
  1.0.5 vs. 1.0.6.
