# Parte A: box score da NBA com mapa de arremessos

Data: 2026-11-12. Segunda parte da rodada: C (busca) ✔, **A**, B (redesenho), D (atualização automática), E (Kings League), F (e-sports).

## Objetivo

No detalhe de um jogo da NBA no app (e em `docs/`), mostrar:
- o **box score** no estilo do antigo, com titulares, reservas e totais, e **ordenação pela estatística escolhida**;
- o **mapa de arremessos** de cada time e de cada jogador, com as proporções da quadra corretas.

Tudo com dados da ESPN, sem depender do PC.

## Fatos conferidos (2026-11-12, jogo real da ESPN)

**Box score:** fica em `summary.boxscore.players[]`, um por time.
- Cada time tem `statistics[0]`, com:
  - `names`: `MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-`;
  - `athletes[]`, cada um com `starter`, `didNotPlay`, `athlete.{id, displayName, shortName}` e `stats[]` (textos na ordem de `names`);
  - `totals[]`.
- FG, 3PT e FT vêm como "feitos-tentados" ("1-4").

**Arremessos:** ficam em `summary.plays[]`, com `shootingPlay: true`.
- Cada arremesso tem `coordinate {x, y}` em pés, `scoringPlay`, `scoreValue`, `team.id`, `participants[0].athlete.id`, `period.number`, `clock.displayValue` e o texto do lance.
- `x` vai de 0 a 50 (largura da quadra) e o aro fica em (25, 1). Comparando com as distâncias escritas nos lances ("13-foot"), o erro médio é de 0,4 pé em 123 arremessos.
- Lances livres vêm com coordenada inválida (cerca de −2,1 × 10⁸) e ficam fora do mapa.
- O tipo do arremesso (de 3 ou de 2) vem do texto ("three point") ou da distância: 22 pés ou mais nos cantos (|x − 25| ≥ 22 e y ≤ 13) e 23,75 pés ou mais no resto.

## 1. Box score

- **Onde fica:** na aba **Jogadores** do detalhe do jogo da NBA no app, no lugar da tabela genérica atual.
- **Tabela:** uma por time (visitante primeiro, como no placar).
  - Grupos **Titulares** e **Reservas**.
  - Quem não jogou fica no fim, em cinza, com "Não jogou".
  - A última linha é **Total**.
- **Colunas, nesta ordem:** Jogador, MIN, PTS, REB, AST, FG, 3PT, FT, STL, BLK, TO, PF, +/−. OREB e DREB ficam de fora; o REB já é a soma.
- **Coluna fixa:** a do jogador fica fixa ao rolar a tabela para o lado.
- **Destaque:** o maior valor de cada coluna numérica do time fica em negrito.
- **Ordenação:**
  - tocar no cabeçalho de uma coluna ordena os jogadores por ela, do maior para o menor;
  - um segundo toque inverte;
  - um terceiro volta à ordem original (titulares e reservas).
  - Enquanto há ordenação, os jogadores aparecem numa lista única, sem a divisão titulares/reservas, e quem não jogou vai para o fim.
  - FG, 3PT e FT ordenam pelos **feitos**, com os tentados como desempate.
  - MIN ordena pelos minutos jogados.
  - A ordenação escolhida vale para as duas tabelas.
- **Ao tocar no jogador:** abre o painel dele (`abrirAtleta`), que ganha a aba **"Arremessos no jogo"** quando é aberto a partir de um jogo.

## 2. Mapa de arremessos

- **Aba nova no detalhe do jogo da NBA:** **Arremessos**.
  - Botões para escolher o time (visitante | mandante).
  - Seletor de jogador ("Todos" ou cada jogador com arremesso).
  - Resumo: "38 de 85 (44,7%) · de 3: 12 de 35".
- **Quadra:** meia quadra em escala real, num SVG com `viewBox` em décimos de pé, ocupando a largura disponível. A proporção 50 × 47 fica mantida, com altura máxima de 70% da altura da tela.
  - Linhas: aro (raio 0,75 pé), tabela, garrafão de 16 pés, círculo do lance livre (raio 6), área restrita (raio 4) e linha de três (23,75 pés, com cantos a 22 pés até 14 pés da linha de fundo).
  - Conversão: `X = (x − 25) × 10`, `Y = (y − 1) × 10`, com o aro em (0, 0) e a linha de fundo em Y = −47,5.
- **Marcas:**
  - acerto é um círculo cheio verde de raio 5;
  - erro é um X vermelho de 4,5 de meia-diagonal;
  - os dois com contorno fino na cor do fundo, para separar marcas que se sobrepõem.
- **Ao tocar numa marca:** aparece uma linha de texto acima da quadra com jogador, quarto, tempo, distância e acerto ou erro.
- **Arremessos sem coordenada válida:** ficam fora do mapa e são contados à parte ("2 arremessos sem posição").
- **No painel do jogador (aba "Arremessos no jogo"):** o mesmo mapa e o mesmo resumo, só com os arremessos dele.
- **Site do PC pelo Python:** o `quadraSVG` antigo passa a usar as mesmas medidas e marcas novas. Os dados continuam vindo do servidor.

## 3. Por dentro

**Regras puras** num arquivo novo `static/nba_quadra.js` (comum ao PC e ao app, como o `busca_regras.js`), testadas com um jogo real guardado em `testes/amostras/`:
- `arremessosDoJogo(plays, timeIds)`: lista com `{x, y, feito, tres, distancia, time_id, atleta_id, periodo, relogio, texto}` em coordenadas do desenho, sem lances livres e sem coordenadas inválidas;
- `resumoArremessos(lista)`: feitos, tentados, percentual e os mesmos números de três;
- `boxScoreDoTime(estatisticasEspn)`: titulares, reservas, quem não jogou e os totais, com os números convertidos;
- `ordenarBox(jogadores, coluna, direcao)`.

**Tela:** `static/esportes.js` (detalhe do jogo e painel do atleta). O desenho da quadra (`quadraSVG`) fica em `nba_quadra.js`, para o PC e o app usarem o mesmo.

**Dados:** o `celular/direto.js` passa os `plays` e o `boxscore` crus da NBA dentro do resumo do jogo. São os campos novos `arremessos` e `box`, montados pelas regras puras.

## 4. Conferência

- `node --test testes/*.test.js` todo verde.
- **Navegador, em 375×812,** com um jogo de ontem:
  - o box score tem titulares, reservas e totais, e o total de PTS bate com o placar;
  - a ordenação por PTS, REB e FG funciona e inverte;
  - na aba Arremessos, o número de arremessos por time bate com o FG tentado do box score, descontando os sem posição;
  - os acertos de 3 aparecem atrás da linha de três;
  - a quadra cabe na tela sem rolar para o lado.
- **Num jogo ao vivo, se houver na hora:** o mapa e o box score se atualizam.
- **Site do PC:** o mapa antigo aparece com as proporções novas.

## Fora desta parte

- Mapa de calor por região da quadra e comparação com a média da liga.
- Box score do mesmo tipo para outros esportes (a parte B reorganiza as telas).
