# Enfoque OS 0.2.55 — hotfix visual do Iniciar e da barra

## Motivo

Após a implantação da versão 0.2.54 em máquinas do Ilha Plaza, foi constatado na foto e na sessão real do `salao-ilha` em 14/11/2026: ícones de "bloqueio" (fallback inválido), botões do dock excessivamente largos e menu Iniciar com aplicativos grandes e linhas cortadas. Esta revisão altera somente o visual e mantém a estrutura operacional e a impressão da 0.2.54.

## Mudanças

- **Ícones WindowsModern preservados:** o tema principal continua sendo `windows-modern` enviado pelo usuário; `Inherits` recebe `EnfoqueFluent,Papirus,Adwaita` antes das demais alternativas para localizar ícones corporativos específicos (`enfoque-my-computer`, `enfoque-computer-small`, `enfoque-chevron-up`, impressoras, calculadora, recuperação e outros). Não redesenhamos os logos existentes.
- **Menu Iniciar Windows 11:** grade de seis colunas e até 18 fixados, ícones de 28 px respeitados literalmente, botões sem borda permanente, hover discreto, busca de aplicativos e botão `Todos os aplicativos / Voltar`. Removido o espaçador que roubava área da grade. Menu dimensionado a 600×570 px em telas 1280×800 e adaptável a menores.
- **Barra inferior:** largura mínima de botões Docklike reduzida de **69 px para 38 px**, ícones fixados de 28 para 24 px, margens compactas, linha inferior azul indicando app aberto/ativo e alerta laranja preservado. Indicadores do canto direito permanecem operacionais.
- **Migração respeitosa em usuários existentes:** apenas `iconSize=28` oficial é convertido para 24 quando `forceIconSize=true`, com backup no perfil; nenhum item fixado, posição de painel, configuração de impressão, aplicativo aberto ou conta é alterado.
- **Confiabilidade:** tema Aerobird e SVGs originais seguem incluídos, XFCE nativo sem dependência de internet para desenhar o menu. O pacote mantém a correção Bematech/Pantum da 0.2.54.

## Validação

- Em `salao-ilha` (Ilha Plaza, Enfoque OS 0.2.54), o hotfix visual foi instalado com cópia em `/var/backups/enfoque-ui-before-055-20261114T182539`. Após recarregar exclusivamente painel e menu, captura remota mostrou ícones restaurados, dock compacto e 3 linhas de fixados visíveis; Chrome e PDV permaneceram abertos. A versão instalada continuará 0.2.54 até uma atualização formal.
- Verificação de GTK3 confirmou resolução de todos os ícones corporativos ausentes na 0.2.54; `Gtk.CssProvider` compilou sem erro. Teste Xvfb validou grid de seis, botão `Todos os aplicativos / Voltar`, dimensões 600×570 e preservação do menu.
- `test/test_ui_055.py` cobre fallback de ícones, layout e CSS, Docklike, migração e conservação dos recursos de impressoras.

## Distribuição

Publicar como 0.2.55 via branch `release/enfoque-os`, GitHub Actions e repositório APT assinado com sincronização na Intranet. **Não acionar campanha de atualização automática nos computadores.** Validar visualmente em pelo menos outro monitor do parque antes de rollout geral.
