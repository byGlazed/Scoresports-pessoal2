# Parte L — placar honesto, folha do jogador e comparação com o Sofascore (21/11/2026)

O pedido: o app mostrava jogo encerrado ou em andamento como "vai começar" e só depois trocava; a F1 ficava
"em andamento" o dia todo; o Alavés x La Coruña ficou sem campinho; no box score da NBA havia jogador como "…";
tocar no jogador tinha de abrir o desempenho dele no jogo (como a folha do Sofascore), com a carreira só no
"Ver perfil"; e uma comparação de todas as telas com as do Sofascore.

## O que mudou

- **Placar velho** (`celular/cache_regras.js`, `celular/direto.js`): o cache entregava a lista guardada (até 6 h)
  e buscava a nova em segundo plano. Agora, se o guardado tem jogo que já devia ter começado (ou estava ao vivo),
  a decisão é "conferir": a tela espera a rede até 2,5 s; se ela demorar, o jogo aparece com uma barrinha de
  "atualizando" no lugar do horário e sem placar velho. Vale para a lista do dia, a página do jogo, os e-sports e
  as sessões da F1. A página do jogo também já desenha o topo (times, placar, estado) com o que a lista sabe.
- **F1** (`Visual.situacaoCorrida`): a lista do dia e o calendário mostram a sessão ("Classificação: fim ·
  Corrida dom., 22 de nov., 01:00", "Sprint ao vivo") em vez do estado do fim de semana inteiro.
- **Campinho**: faltavam formações (o Alavés jogou num 3-1-4-2). A tabela ganhou as 11 que faltavam do padrão
  Opta; a numeração sai da tabela de posições do mplsoccer, que bate com as 13 já conferidas, e o 3-1-4-2 foi
  conferido no jogo real (`testes/amostras/espn_formacao_3142.json`).
- **Gol contra**: a ESPN já marca o time que ganhou o gol (conferido em 7 jogos de 5 ligas); o app invertia e
  punha o autor embaixo do time errado.
- **Box score**: a célula do jogador tinha 130 px com "…" na célula inteira; agora foto e nome lado a lado e só
  o nome encurta.
- **Folha do jogador** (`Folha` e `conteudoFolhaJogador` em `static/app.js`): sobe de baixo com foto, nota,
  "Ver perfil", os números do jogo e o carrossel dos outros jogadores. NBA: minutos, pontos, lances livres,
  2 e 3 pontos, quadra, rebotes (defensivos e ofensivos), assistências, erros, roubos, tocos, faltas, +/− e o
  mapa de arremessos. Futebol (campinho, reservas e "Melhor em campo"): minutos, gols, assistências, chutes no
  gol, defesas, faltas, cartões. O voltar do celular e do navegador fecha a folha antes de trocar de página.
- **Comparação com o Sofascore** (lista, jogo, time, jogador, F1):
  - estatísticas do futebol com seções (Visão geral, Finalizações, Passes, Defesa, Goleiro), tudo em
    português e porcentagens das contagens (`Visual.estatisticasFutebol`);
  - Resumo com melhores momentos (busca no YouTube), "Intervalo" e "Fim de jogo" na linha do tempo, melhor em
    campo e as estatísticas principais com "Ver todas";
  - campanha "4V 4E 5D" no lugar de "4-4-5" (parecia formação), posição por extenso, sem a posição "SUB";
  - perfil com "Temporada 2026-27", "Jogos" e "Como titular" no lugar de "Titular-Substitute Appearances";
  - resumo da temporada na visão geral do time.

## O que o Sofascore tem e não dá para fazer com as fontes de hoje

Gráfico de momento da partida, gols esperados (xG), mapa de calor, votação dos torcedores, narração lance a
lance, vídeo embutido, valor de mercado, transferências, radar de atributos, títulos do clube e "melhores
jogadores" da temporada (precisaria das notas de todos os jogos). O "ao vivo primeiro" na lista "Todos" é
diferente do Sofascore de propósito (plano da parte B).
