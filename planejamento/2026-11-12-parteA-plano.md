# Parte A (box score da NBA e mapa de arremessos): plano de implementação

> **Para quem for executar:** use superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o andamento.

**Objetivo:** no detalhe de um jogo da NBA no app, mostrar um box score ordenável e o mapa de arremessos (por time e por jogador), com a quadra em proporção real.

**Arquitetura:** três peças.
- **Regras puras e desenho da quadra** num arquivo comum, `static/nba_quadra.js`, usado pelo PC e pelo app.
- **Resumo do jogo** no `celular/direto.js`: ganha o campo `nba`.
- **Telas** em `static/esportes.js`: aba Jogadores (box score), aba Arremessos e o mapa no painel do atleta.

**Tecnologia:** JavaScript puro, SVG e Node 24 para os testes.

**Spec:** `planejamento/2026-11-12-parteA-boxscore-arremessos.md`

## Regras globais

- **Onde muda:** só o app e as telas. O servidor Python não muda.
- **Nomes globais:** conferir com `grep -w` em `static/*.js` e `celular/*.js` antes de criar um nome no topo de um arquivo. Atenção: `quadraSVG` **já existe** em `static/app.js`. A Tarefa 1 move essa função para `nba_quadra.js` e a apaga de `app.js`.
- **Depois de mudar `static/` ou `celular/`:** rodar `python gerar_celular.py` e fazer o commit junto com o `docs/` gerado.
- **Testes:** `node --test testes/*.test.js`, tudo verde ao fim de cada tarefa.
- **Coordenadas do desenho:** décimos de pé, com o aro em (0, 0) e a linha de fundo em Y = −47,5. É o mesmo sistema que o PC já usa com os dados da NBA.

## Pontos de atenção na revisão

1. **Jogador que não jogou** (`didNotPlay`, `stats` vazio): vai para o fim, em cinza, com "Não jogou", e não quebra a ordenação. Teste na Tarefa 1.
2. **Valores não numéricos** ("--" ou vazio em +/− e MIN): na ordenação ficam no fim, nos dois sentidos. Teste na Tarefa 1.
3. **Lances livres e coordenadas inválidas** (cerca de −2,1 × 10⁸): ficam fora do mapa e são contados como "sem posição". Teste na Tarefa 1.
4. **Jogo agendado** (sem `plays` nem `boxscore`): as abas Jogadores e Arremessos não aparecem. Conferência na Tarefa 3.
5. **Jogo ao vivo:** a aba escolhida e a ordenação continuam depois da atualização automática (a cada 20 s). Conferência na Tarefa 3; se não houver jogo ao vivo, fica registrado.

---

### Tarefa 1: regras puras e desenho da quadra (`static/nba_quadra.js`)

**Arquivos:**
- Criar: `static/nba_quadra.js`, `testes/nba_quadra.test.js` e a amostra `testes/amostras/nba_jogo.json`. A amostra vem de um jogo real de 10/11/2026 e guarda só `boxscore.players` e os `plays` com `shootingPlay`, enxugados.
- Modificar:
  - `static/app.js`: apagar `quadraSVG` (o PC passa a usar a nova);
  - `static/index.html`: `<script src="/static/nba_quadra.js">` antes do `app.js`;
  - `gerar_celular.py`: `nba_quadra.js` no começo de `TELAS`;
  - `celular/sw.js`: `ARQUIVOS`;
  - `static/style.css`: estilos de `.quadra` (marcas novas).

**Interfaces** (globais no navegador, `module.exports` no Node):
- `converterCoordenada(c: {x, y}) -> {x, y} | null`. Devolve `{x: (c.x − 25) × 10, y: (c.y − 1) × 10}`, ou `null` quando `x` ou `y` não é número ou está fora de −5 a 55.
- `arremessosDoJogo(plays) -> {lista, semPosicao}`.
  - `lista`: um item por arremesso de quadra com coordenada válida: `{x, y, feito, tres, distancia, time_id, atleta_id, periodo, relogio, texto}`.
  - Fora: lances livres (texto com "free throw") e quem não tem `shootingPlay`.
  - `tres`: o texto tem "three point", ou a distância é ≥ 22 pés com |x − 25| ≥ 22 e y ≤ 13, ou é ≥ 23,75 pés.
  - `distancia`: em pés, arredondada, medida do aro (25, 1).
  - `semPosicao`: número de arremessos de quadra sem coordenada válida.
- `resumoArremessos(lista) -> {feitos, tentados, pct, feitos3, tentados3, pct3}`. O `pct` tem 1 casa decimal e é `null` sem tentativas.
- `boxScoreDoTime(t) -> {time_id, titulares, reservas, naoJogaram, totais}`.
  - Recebe um item de `boxscore.players`.
  - Cada jogador: `{id, nome, nome_curto, posicao, minutos, pts, reb, ast, stl, blk, to, pf, mais_menos, fg: {f, t}, tres: {f, t}, ft: {f, t}}`, com os números convertidos. Valor ausente fica `null`.
  - `totais` vem no mesmo formato.
- `ordenarBox(jogadores, coluna, direcao: "desc" | "asc") -> jogadores`.
  - `coluna` é uma chave de jogador; para `fg`, `tres` e `ft` vale o `f`, com o `t` como desempate.
  - `null` fica sempre no fim.
  - Empate mantém a ordem original.
  - A lista recebida não muda.
- `quadraSVG(arremessos, {aoTocar}) -> SVGElement`.
  - Usa o helper `s()` que já existe em `app.js` (carregado depois; só é chamado em tempo de uso).
  - `viewBox="-250 -52.5 500 470"`.
  - Linhas da quadra:
    - garrafão: `rect x=-80 y=-47.5 w=160 h=190`;
    - círculo do lance livre: `cx=0 cy=142.5 r=60`;
    - aro: `r=7.5`;
    - tabela: `y=-7.5`, de −30 a 30;
    - área restrita: arco de raio 40;
    - cantos da linha de três: x = ±220, de y −47,5 a 92,5;
    - arco de três: raio 237,5.
  - Marcas: acerto é um `circle r=5`; erro é um X de meia-diagonal 4,5.
  - Cada marca tem `title` e `onclick` que chamam `aoTocar(arremesso)`.

**Passos:**

- [ ] **Passo 1: salvar a amostra.** Usar o jogo de 10/11 (`scoreboard?dates=20261110`, primeiro evento) e o `summary`.
- [ ] **Passo 2: escrever os testes.**
  - `converterCoordenada`: `{x: 25, y: 1}` dá `{x: 0, y: 0}`; `{x: -214748340, y: -214748365}` dá `null`.
  - `arremessosDoJogo` com a amostra:
    - nenhum item tem "free throw" no texto;
    - o número de tentados por time mais o `semPosicao` daquele time bate com o FG tentado do total do box score;
    - todo `tres` tem distância ≥ 22.
  - `resumoArremessos`: lista vazia dá `{feitos: 0, tentados: 0, pct: null, ...}`; 3 de 4 dá `pct` 75.
  - `boxScoreDoTime` com a amostra:
    - 5 titulares;
    - a soma dos `pts` dos jogadores é igual a `totais.pts`;
    - quem tem `didNotPlay` fica em `naoJogaram`.
  - `ordenarBox`:
    - por `pts` "desc", o primeiro tem o maior número de pontos;
    - "asc" inverte;
    - `fg` desempata pelos tentados;
    - `null` fica no fim nos dois sentidos (ponto de atenção 2);
    - a lista original não muda.
- [ ] **Passo 3:** rodar e ver falhar ("Cannot find module").
- [ ] **Passo 4: implementar e ligar o arquivo.**
  - Apagar `quadraSVG` de `app.js`.
  - Em `app.js`, conferir que `nbaPainelArremessos` (PC) continua chamando `quadraSVG(lista)`, agora com as marcas novas.
  - CSS: `.quadra { width: 100%; max-width: 520px; max-height: 70vh; }` e `.quadra .acerto` / `.erro-arremesso` com `stroke: var(--superficie); stroke-width: 1`.
- [ ] **Passo 5:** suite verde; `node --check` em `static/*.js`; `python gerar_celular.py`. Commit: "Regras e desenho da quadra da NBA: arremessos, resumo, box score e ordenação".

---

### Tarefa 2: dados da NBA no resumo do jogo (`celular/direto.js`)

**Interfaces:**
- Consome, da Tarefa 1: `arremessosDoJogo` e `boxScoreDoTime`.
- Em `buscarResumo`, quando `cfg.esporte === "basketball"`, o retorno ganha `nba: { box: (dados.boxscore.players || []).map(boxScoreDoTime), ...arremessosDoJogo(dados.plays) }`, ou seja, `nba = {box, lista, semPosicao}`. Nos outros esportes, `nba: null`.

**Passos:**

- [ ] **Passo 1:** fazer a mudança; `node --check`; `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador**, pelo console, com o jogo da amostra: `api('/e/nba/nba/jogos/<id>')`.
  - `nba.box` tem 2 times.
  - `nba.lista.length + nba.semPosicao` é igual à soma do FG tentado dos dois times.
  - Num jogo de futebol, `nba` é `null`.
- [ ] **Passo 3:** commit com a mensagem "Resumo do jogo da NBA traz box score e arremessos".

---

### Tarefa 3: telas (box score ordenável, aba Arremessos e mapa do jogador)

**Arquivos:**
- Modificar:
  - `static/esportes.js`: as `abas` e o `conteudoAba` de `partidaDetalhe` (por volta das linhas 740 a 790), `desenharAtleta` e `empilharAtleta`;
  - `static/style.css`.

**Interfaces:**
- Consome, da Tarefa 1: `ordenarBox`, `resumoArremessos` e `quadraSVG`.
- Produz:
  - `boxScoreNBA(esp, liga, r, estado) -> Node[]`, com `estado = {coluna: null | string, direcao: "desc" | "asc"}`, guardado em `S.abaDetalhe[\`${chaveAba}:ordem\`]` para resistir à atualização automática;
  - `arremessosNBA(esp, liga, r, j, estado) -> Node[]`, com `estado = {time: "fora" | "casa", atleta: "todos" | id}`, guardado em `S.abaDetalhe[\`${chaveAba}:mapa\`]`;
  - `empilharAtleta(esporte, liga, id, nome, contexto = null)`, em que `contexto = {arremessos: lista}` faz `desenharAtleta` mostrar, no topo, a seção "Arremessos no jogo" (resumo e `quadraSVG`).

**Comportamento:**
- **Abas:** com `esp.id === "nba"` e `r.nba`, a aba Jogadores usa `boxScoreNBA` no lugar de `jogadoresNFL`. Com `r.nba.lista.length || r.nba.semPosicao`, aparece a aba **Arremessos**, depois de Jogadores.
- **Box score:**
  - uma tabela por time, na ordem `ordemTimes`;
  - colunas Jogador, MIN, PTS, REB, AST, FG, 3PT, FT, STL, BLK, TO, PF, +/−;
  - FG, 3PT e FT aparecem como "f-t";
  - o cabeçalho é um botão com `aria-sort` ("descending", "ascending" ou "none") e indicador ▼ ou ▲;
  - os cliques giram entre desc → asc → original;
  - sem ordenação: grupos "Titulares" e "Reservas"; com ordenação: lista única;
  - `naoJogaram` fica sempre no fim, com a classe `.nao-jogou` e "Não jogou" nas colunas;
  - a última linha é Total;
  - o maior valor de cada coluna numérica do time recebe `.destaque-box` (em negrito);
  - a coluna Jogador tem `position: sticky; left: 0` e fundo da superfície;
  - tocar no jogador chama `empilharAtleta("nba", liga, id, nome, {arremessos: lista do jogador})`.
- **Aba Arremessos:**
  - alternar de time ("Visitante" | "Mandante", com os nomes curtos);
  - `select` de jogador ("Todos" e quem tem arremesso, por número de tentativas);
  - resumo "F de T (P%) · de 3: F de T", com "· N sem posição" quando houver;
  - uma linha `p.info-arremesso` acima da quadra, que `aoTocar` preenche com "Nome · Nº quarto, relógio · N pés · Acerto/Erro".
- **CSS:**
  - `.box-ordem` (botão do cabeçalho, sem borda, com a cor da coluna);
  - `.nao-jogou td { color: var(--texto-3) }`;
  - `.destaque-box { font-weight: 700 }`;
  - a primeira coluna fixa.

**Passos:**

- [ ] **Passo 1: implementar.** Conferir os nomes com grep, rodar `node --check` e `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador**, em 375×812, com o jogo da amostra, aberto pela lista de 10/11 da NBA.
  - **Box score:**
    - titulares, reservas e Total;
    - o Total de PTS bate com o placar;
    - PTS ordena desc, depois asc, depois volta;
    - FG ordena;
    - quem não jogou fica no fim;
    - a tabela rola para o lado com o nome fixo.
  - **Arremessos:**
    - troca de time e de jogador;
    - o resumo bate com o FG do box score (descontando os sem posição);
    - tocar numa marca preenche a linha de informação;
    - a quadra cabe na largura.
  - **Painel do jogador:** tocar num jogador abre o painel com "Arremessos no jogo".
  - **Jogo agendado:** sem as abas Jogadores e Arremessos (ponto de atenção 4).
  - **Jogo ao vivo**, se houver: a ordenação e a aba continuam depois da atualização (ponto de atenção 5).
  - **Site do PC** (`uvicorn`): o mapa do jogador no PC aparece com as marcas novas.
  - Console sem erro.
- [ ] **Passo 3: README.** Uma linha em "NBA" sobre o box score ordenável e o mapa de arremessos no app; e `static/nba_quadra.js` na árvore de arquivos. Commit: "Box score da NBA ordenável e mapa de arremessos no app".
