# Enfoque OS 0.2.51 — banco de drivers como fonte do plug and play

A 0.2.50 só configurava térmicas USB quando já encontrava seu driver na máquina. O acervo em `/srv/biblioteca-drivers-impressoras` passa a ser a origem de um snapshot versionado da 0.2.51. Os clientes consultam o snapshot local; não precisam montar o diretório do VPS nem baixar um instalador a cada conexão USB.

## Dados e pacote

- `config/printer-library-models.json`: 3.769 registros de fabricante/modelo importados do catálogo do servidor; há variações de maiúsculas no acervo original. O SHA-256 do catálogo original está preservado.
- `config/printer-library.lock.json`: origem e SHA-256 dos arquivos oficiais selecionados da biblioteca.
- `scripts/stage-printer-library.py`: lê os arquivos do servidor com `--source /srv/biblioteca-drivers-impressoras`; no CI pode obter exatamente os mesmos arquivos, por URL e hash fixados. Nenhum instalador de fabricante é executado.
- Pacote separado `enfoque-printer-drivers_0.2.51-1_amd64.deb`: inventário em `/usr/share/enfoque-printer-library/catalog.json`, PPDs comprimidos e filtros de impressão com prefixo `enfoque-lib-`.
- 145 perfis nativos aprovados por sintaxe e dependências em Debian 13: 141 Pantum, Elgin i9/i8 e Bematech MP-4200 TH/HS. São candidatos para piloto, ainda sem homologação física.
- 125 candidatos com erros de origem de PPD ficam registrados em `rejected_profiles` e não entram como perfis nativos automáticos. Seu modelo continua no inventário e pode ser atendido por IPP Everywhere ou driver Debian válido.
- Pacotes Debian de Brother/brlaser, Epson/ESC-P/R, HP/HPCUPS, Gutenprint, Foomatic, Canon e outros são dependências explícitas. Isso é necessário porque `printer-driver-all` usa Recommends e a ISO desativa recomendações.

O pacote copia somente filtros e recursos de impressão selecionados. Não copia scanner, backend USB proprietário, regras udev nem o serviço ipp-usb do instalador Pantum. A biblioteca CMS Pantum usa o caminho absoluto esperado pelo binário; o pacote declara conflito com o pacote vendor `pantum` para não compartilhar arquivos silenciosamente.

## Seleção no plug and play

O serviço existente `enfoque-printer-autosetup` usa `lookup.py` para identificar o modelo exato pelo URI USB. São removidos separadores e a palavra Series, sem aproximar números ou variantes: M6550 e M6550NW permanecem distintos. MP-4200 HS e i9 FULL não são confundidas com MP-4200 TH e i9 original.

Antes de criar uma fila, o cliente verifica integridade do PPD, permissões, filtros executáveis e sintaxe CUPS. Para drivers Debian já presentes, gera o PPD pelo cups-driverd e verifica seus filtros antes de selecioná-lo. Metadados não fornecem comandos nem repositórios para execução.

Na rede, o inventário continua restrito à loja da estação. IPP Everywhere tem prioridade; se falhar sem deixar fila criada, o mesmo banco pode fornecer o driver do modelo exato declarado pela TI. Uma fila existente, mesmo com outro nome, não é sobrescrita.

Nenhum teste é impresso e nenhuma impressora padrão do usuário é escolhida. O padrão de gaveta pertence ao driver térmico: principal/pino 2 no fim do trabalho, segunda/pino 5 desativada, com as opções nativas equivalentes da Elgin.

## Build e distribuição

A ISO gera e valida o pacote de drivers antes de gerar o core. O core depende do pacote de drivers e dos filtros Debian necessários. O publicador APT exige os dois pacotes da mesma versão em uma operação, evitando publicar um core com dependência ausente. O workflow inclui ambos no artefato da versão.

Validação de integração: `scripts/test-printer-library.py --package ARQUIVO.deb` extrai para diretório temporário, verifica todos os perfis, resolve os filtros e simula a seleção com o banco real para quatro modelos. Nenhuma fila real ou impressora é usada.

Nenhuma atualização de frota, alteração de CAIXA3, flash de firmware ou teste de impressão está incluído nesta alteração. A ISO e os pacotes são para piloto; a homologação física continua necessária antes de distribuição às lojas.
