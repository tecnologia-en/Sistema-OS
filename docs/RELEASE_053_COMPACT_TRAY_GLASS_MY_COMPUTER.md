# Enfoque OS 0.2.53 — acabamento de barra, menu e Meu Computador

- Reduz o espaço entre os controles da bandeja XFCE, mantendo os aplicativos fixos e o dock.
- Novo pictograma SVG de 18 px para o botão de ID do computador, preservando a função de copiar/consultar o ID.
- Menu Enfoque OS com gradiente de aparência *glass*, sem borda preta e com recorte arredondado de 18 px via XShape/Cairo, sem habilitar compositor ou criar serviços residentes.
- Adiciona **Meu Computador** à primeira posição dos aplicativos fixados. A janela GTK exibe CPU, GPUs, RAM total/usada/disponível, unidades SSD/HD, tamanho dos discos, uso e espaço livre das partições montadas, versão, nome da máquina e tempo ativo.
- Dados consultados localmente e somente quando a janela é aberta ou o usuário clica em **Atualizar**; não envia inventário para a rede nem exige root.
- Mantém os módulos de impressão/xerox de Ilha Plaza e Itaipu e o banco de drivers da 0.2.52.
- Corrige a integração PyGObject/Cairo necessária para recortar realmente os cantos do menu e inclui teste gráfico no CI.
- O workflow do GitHub compila ISO/pacotes versionados 0.2.53. A publicação no catálogo APT é separada da instalação; nenhuma campanha de atualização ou atualização de computadores é acionada pelo commit.

Limitação intencional: como o compositor permanece desligado por economia de recursos, o visual *glass* é simulado com gradientes e camadas translúcidas internas; não faz desfoque real do papel de parede. As informações de espaço usado/livre exigem partições montadas.
