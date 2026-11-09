# Enfoque OS 0.2.29 - instalacao com preservacao de arquivos

## Escopo

Este ajuste altera apenas o instalador da ISO. A versao continua 0.2.29.
Nao modifica cadastro dos computadores, identidade, protocolos dos agentes,
comunicacao WebSocket/SSH, atualizador, AnyDesk, interface ou impressoras.
A ISO instalada anteriormente no Salao-Ilha continua funcionando como antes.

## Duas opcoes

1. Apagar tudo e instalar: acao anterior mantida, confirmacao literal APAGAR,
   reparticiona o disco selecionado e instala o Enfoque OS.
2. Manter arquivos pessoais e instalar: exige confirmacao literal MANTER e uma
   segunda unidade de armazenamento, independente do disco de instalacao
   e diferente do pendrive Live. O instalador nao apaga a segunda unidade:
   cria pasta de backup propria, copia, confere SHA-256 por arquivo e revalida
   antes de executar qualquer operacao destrutiva. Se falhar, interrompe antes
   de formatar o disco original. Depois instala, restaura no usuario enfoque
   e confere SHA-256 dos arquivos restaurados. O backup externo fica guardado.

## Pastas pessoais migradas

| Origem Windows ou Linux | Destino Enfoque OS |
| --- | --- |
| Desktop / Area de Trabalho | /home/enfoque/Desktop |
| Downloads / Transferencias | /home/enfoque/Downloads |
| Documents / Documentos | /home/enfoque/Documentos |
| Pictures / Imagens | /home/enfoque/Imagens |
| Videos / Videos | /home/enfoque/Vídeos |
| Music / Musicas | /home/enfoque/Músicas |

Reconhece perfis Windows em Users, Usuarios e Documents and Settings; perfis
Linux sob /home; particoes /home separadas; e pastas do OneDrive que estejam
fisicamente presentes no disco. O perfil com mais arquivos locais e restaurado
diretamente nas pastas do novo sistema. Outros perfis ficam organizados em
subpastas "Usuario NOME", sem sobrepor documentos. Arquivos de mesmo nome
recebem sufixo de importacao. Atalhos corporativos permanecem intactos.

## Limites de seguranca

- NAO migra aplicativos, licencas, configuracoes do sistema nem pastas fora
  das seis categorias listadas. Faca backup manual de quaisquer outras pastas.
- NAO recupera dados somente na nuvem que ainda nao foram baixados.
- NAO ignora BitLocker/LUKS, formatos desconhecidos, links simbolicos nas
  pastas pessoais nem volumes ilegíveis: bloqueia em vez de prometer copia.
- Exige unidade independente com espaco livre. O pendrive da ISO Live NAO
  serve como destino de backup.
- Antes de produzir em lojas, validar a ISO compilada em VM com o fluxo
  inteiro e verificar arquivos na maquina instalada.
- Recomenda-se sempre ter copia externa propria dos dados importantes.

## Testes de seguranca

Testes automatizados de inventario, integridade, destino XDG, conflitos,
perfis adicionais e bloqueio de formatacao sem backup. Testes de leitura e
restauracao usando imagens virtuais ext4 e NTFS no VPS; nenhum equipamento
cadastrado foi usado nos testes.

Comandos de validacao do projeto:
- python3 -m unittest discover -s test -p 'test_*.py' -q
- bash scripts/check-project.sh
