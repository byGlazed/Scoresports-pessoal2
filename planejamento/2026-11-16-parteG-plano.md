# Parte G (chaveamento e Copa NBA): plano de implementação

> **Para quem for executar:** use superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`). Os títulos usam "Task" para os scripts de acompanhamento.

**Objetivo:**
- uma aba "Mata-mata" ou "Playoffs" na página da liga, com a chave em colunas montada no celular a partir dos jogos da ESPN;
- uma aba "Copa NBA" na NBA, com os grupos e a chave.

**Arquitetura:**
- **Regras puras** em `static/chave_regras.js`, testadas com `node --test` sobre amostras reais em `testes/amostras/chave_*.json`. Elas recebem eventos da ESPN (o formato do scoreboard) e devolvem colunas, confrontos e posições.
- **Rotas no `celular/direto.js`:** buscam as fases e os meses da temporada e anexam a cada confronto os jogos já convertidos (`partida`).
- **Desenho** em `static/chave.js`: a chave em colunas, a página "confronto" e as abas novas.

**Tecnologia:** JavaScript puro, CSS e SVG para as linhas; Node 24 para os testes.

**Spec:** `planejamento/2026-11-16-parteG-chaveamento.md`

## Regras globais

- **Commits:** em português e **sem nenhuma linha de coautor**.
- **Só no app:** é o app e o `docs/`. As abas novas só aparecem com `window.MODO_CELULAR`, e o site do PC fica igual.
- **Nomes globais:** os scripts são clássicos, com um escopo só. Antes de criar um nome no topo de um arquivo, conferir com `grep -w` em `static/*.js` e `celular/*.js`. As regras ficam num objeto `Chave`, como o `Rotas`.
- **Arquivo novo de tela:** entra no `TELAS` do `gerar_celular.py`, no `celular/sw.js` e no `static/index.html`. Depois, `python gerar_celular.py`, e o commit vai junto com o `docs/`.
- **Testes:** JS com `node --test testes/*.test.js`; Python com `python -m unittest discover -s testes -p "*_teste.py"`; Java com `python testes/rodar_java.py`. Tudo verde ao fim de cada tarefa.
- **Conferência no navegador:** servir `docs/` sem cache, em 375×812, nos temas claro e escuro.
- **Alvos de toque:** pelo menos 44 px. Nenhuma rolagem lateral da página inteira; só a da chave.
- **Nomes das fases em português:** Oitavas de final, Quartas de final, Semifinal, Final, Playoff (Champions), 1ª/2ª/3ª fase, Wild Card, Divisional, Final de conferência, Super Bowl, Finais da NBA, Final da Stanley Cup, World Series. O mapa sai do `slug` da ESPN ou da nota.

## Pontos de atenção na revisão

1. **Final de ida e volta decidida no agregado ou nos pênaltis:** o lado que passa vem do `series` da ESPN, e o placar é o agregado. Testes na Task 1 (Copa do Brasil 2025: Corinthians 2-1 Vasco; Champions: PSG nos pênaltis).
2. **Time que pula a fase:** a vaga aparece sem linha, sem quebrar a ordem. Testes na Task 1 (Champions: playoff de 8 para oitavas de 8) e na Task 2 (NFL: Wild Card de 6 para Divisional de 4).
3. **Fase ainda não jogada:** a quantidade certa de vagas "A definir". Testes nas Tasks 1 e 2, cortando as amostras no meio.
4. **Notas em dois idiomas e jogos que não são de playoff:** "Leste 1ª rodada" e "East 1st Round" são a mesma fase; o Pro Bowl e o Play-In não entram na chave. Teste na Task 2.
5. **Competição sem mata-mata:** a aba não aparece. Teste na Task 1 (`temChave`).

---

### Task 1: regras da chave do futebol (`static/chave_regras.js`)

**Arquivos:**
- Criar: `static/chave_regras.js`, `testes/chave.test.js`.
- Modificar: `static/index.html`, `gerar_celular.py` (`TELAS`) e `celular/sw.js` (antes de `navegacao.js`).
- As amostras já estão no repositório: `chave_champions_2025.json`, `chave_copa_do_brasil_2025.json` e `chave_libertadores_2025.json`, cada uma com `{tipos, jogos}` reais da ESPN, enxutos.

**Interfaces** (objeto global `Chave`; `module.exports = Chave` no Node):
- `Chave.COM_CHAVE`: as competições com aba.
  - Futebol: `bra.copa_do_brazil`, `conmebol.libertadores`, `conmebol.sudamericana`, `uefa.champions`, `uefa.europa`, `esp.copa_del_rey`, `esp.super_cup`, `eng.fa`, `eng.league_cup`, `eng.charity`, `ger.dfb_pokal`, `ger.super_cup`, `ita.coppa_italia`, `ita.super_cup`, `fra.coupe_de_france`, `fra.super_cup`, `por.taca.portugal`, `ned.cup`, `bra.supercopa_do_brazil`, `conmebol.recopa`, `uefa.super_cup`, `fifa.cwc`, `fifa.world`, `conmebol.america`, `uefa.euro`, `uefa.nations` e `usa.1`;
  - e mais `nba`, `nfl`, `mlb` e `nhl`.
- `Chave.temChave(esporte, liga) -> boolean`.
- `Chave.nomeDaAba(esporte) -> "Playoffs" | "Mata-mata"`. É "Playoffs" para `nba`, `nfl`, `mlb` e `nhl`, e para a liga `usa.1`.
- `Chave.fasesDoFutebol(tipos) -> {preliminares: [tipo], eliminatorias: [tipo]}`.
  - Os tipos vêm em ordem de `startDate`.
  - Grupos e fase de liga são os de `name`/slug com "group", "grupo" ou "league phase", e ficam fora.
  - As eliminatórias antes de um grupo são preliminares; as depois dele (ou todas, se não há grupo) são eliminatórias.
- `Chave.confrontos(jogos) -> [Confronto]`: junta os jogos da mesma fase (`season.type`) entre os mesmos dois times. O `Confronto` é:
  ```
  { id, fase, lados: [{ id, nome, curto, sigla, logo, placar, passou }, …2],
    jogos: [eventId…], estado: 1|2|3, resumo: string|null, primeiraData }
  ```
  - O `placar` é a soma dos gols (ida e volta), o placar do jogo único ou as vitórias na série.
  - O `passou` vem do `series.competitors[].winner` quando `series.completed`. Senão vem do jogo único encerrado (`winner`); senão é `false` para os dois.
  - O `resumo` é "pên. 4-3" quando houve pênaltis (`shootoutScore`), "agregado 2-1" na ida e volta e "4-1 na série" nos playoffs.
  - O `estado` é 2 se algum jogo está ao vivo, 3 se o confronto acabou e 1 no resto.
- `Chave.montar({fases: [tipo], confrontos, formato}) -> [Coluna]`, com `Coluna = {fase, nome, confrontos: [Confronto|null], alimenta: [[i, j|null]]}`:
  - **ordem:** de trás para a frente. A final define a ordem da semifinal (os confrontos de onde vieram seus dois lados), e assim por diante;
  - **confronto sem fase seguinte conhecida:** vai depois, pela `primeiraData`;
  - **vagas `null`:** completam a coluna até a quantidade do `formato[fase.slug]`. Sem formato, a quantidade é a metade da coluna anterior, arredondada para cima;
  - **`alimenta[k]`:** os índices, na coluna anterior, dos confrontos que alimentam o confronto `k`; `[]` quando os dois lados vieram de fora (pularam a fase).
- `Chave.FORMATOS`: as fases que não cortam pela metade. Champions, Liga Europa e Sul-Americana: `knockout-round-playoffs` 8, `round-of-16` 8. NFL, MLB e MLS na Task 2.
- `Chave.posicoes(colunas) -> [[y]]`:
  - a 1ª coluna ocupa y = 0, 1, 2…;
  - cada confronto das colunas seguintes fica na média dos y que o alimentam;
  - com um só alimentador, fica no y dele;
  - sem alimentador, ou vaga, fica logo abaixo do último já posicionado da coluna, sem sobrepor.
- `Chave.colunaInicial(colunas) -> number`: o índice da primeira coluna com até 16 confrontos. As anteriores vão para a lista simples.

**Passos:**
- [ ] **Passo 1: testes** em `testes/chave.test.js`, com as amostras:
  - `fasesDoFutebol`:
    - Libertadores: preliminares `first-stage`, `second-stage` e `third-stage`; eliminatórias de `round-of-16` até `final`;
    - Champions: sem preliminares; eliminatórias de `knockout-round-playoffs` até `final`;
    - Copa do Brasil: todas as 7.
  - `confrontos`, com a Copa do Brasil:
    - a final tem 2 jogos;
    - o lado Corinthians tem placar 2 e `passou: true`, o lado Vasco da Gama tem placar 1;
    - o resumo é "agregado 2-1" (ponto de atenção 1).
  - `confrontos`, com a Champions: a final (jogo único) é PSG x Arsenal, PSG `passou`, e o resumo tem "pên. 4-3".
  - `montar` + `colunaInicial`, com a Champions:
    - 5 colunas com 8, 8, 4, 2 e 1 confrontos;
    - cada confronto das oitavas tem no máximo 1 alimentador (ponto de atenção 2);
    - cada confronto das quartas tem 2;
    - os dois lados da final saem dos dois confrontos da semifinal.
  - `montar`, com a Copa do Brasil: a coluna inicial é a `third-round` (16 confrontos); a 1ª e a 2ª rodada vão para a lista.
  - **Corte no meio** (ponto de atenção 3): só os jogos até o fim das oitavas da Champions dão as colunas de quartas, semi e final com 4, 2 e 1 vagas `null`.
  - `posicoes`: nas quartas da Champions, o y de cada confronto é a média dos seus dois alimentadores; nenhuma posição se repete na mesma coluna.
  - `temChave` (ponto de atenção 5): `("futebol", "eng.1")` dá false; `("futebol", "eng.fa")` e `("nba", "nba")` dão true.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3: implementar.** Ligar o arquivo no `index.html`, no `TELAS` e no `sw.js`.
- [ ] **Passo 4:** a suíte inteira verde; `python gerar_celular.py`. Commit com a mensagem "Regras da chave do futebol: fases, confrontos, ordem e posições".

### Task 2: regras dos playoffs americanos

**Arquivos:**
- Modificar: `static/chave_regras.js`, `testes/chave.test.js`.
- Criar: `testes/amostras/chave_mls_2026.json` (a pós-temporada da MLS de 2026, out./nov., no mesmo formato enxuto das outras amostras).
- Amostras já guardadas: `chave_nba_2026.json`, `chave_nfl_2025.json`, `chave_mlb_2026.json` e `chave_nhl_2026.json`.

**Interfaces:**
- `Chave.faseAmericana(esporte, nota) -> {ordem: 1..4, nome, conferencia: "Leste"|"Oeste"|"AFC"|"NFC"|"AL"|"NL"|null} | null`. Devolve `null` para o que não é playoff (Pro Bowl, Play-In, "NBA Cup"). Padrões, testados do mais específico para o mais geral:
  - **NBA e NHL:** "NBA Finals" ou "Stanley Cup Final" → 4; "(East|West|Leste|Oeste) Final(s)" → 3; "Semifinals" ou "2ª rodada" ou "2nd Round" → 2; "1ª rodada" ou "1st Round" → 1;
  - **NFL:** "Super Bowl" → 4; "Championship" → 3; "Divisional" → 2; "Wild Card" → 1;
  - **MLB:** "World Series" → 4; "ALCS" ou "NLCS" → 3; "ALDS" ou "NLDS" → 2; "ALWC" ou "NLWC" → 1;
  - **MLS:** confirmar com a amostra (Wild Card, Round One, Conference Semifinal, Conference Final, MLS Cup) e mapear para 0..4. O Wild Card da MLS é a ordem 0.
- `Chave.playoffs(esporte, jogos) -> {playIn: [Confronto], colunas: [Coluna]}`:
  - usa `faseAmericana` para a fase e `confrontos` para juntar as séries;
  - monta as colunas em ordem e usa `montar` com o `FORMATOS[esporte]`: NFL `{1: 6, 2: 4, 3: 2, 4: 1}`, MLB `{1: 4, 2: 4, 3: 2, 4: 1}`, NBA e NHL `{1: 8, 2: 4, 3: 2, 4: 1}`;
  - na NBA, o Play-In (`season.type` 5) vai para `playIn`.

**Passos:**
- [ ] **Passo 1: amostra da MLS.** Guardar a pós-temporada de 2026 com o mesmo script das outras: são os eventos de `season.type` 3 dos meses de out. e nov.
- [ ] **Passo 2: testes:**
  - `faseAmericana` (ponto de atenção 4):
    - "Leste 1ª rodada - Jogo 1" e "East 1st Round - Game 3" dão a mesma ordem 1, Leste;
    - "Pro Bowl Games" e "NBA Play-In - East" dão `null`.
  - `playoffs` da NBA 2026:
    - 6 jogos em `playIn`;
    - colunas com 8, 4, 2 e 1 confrontos;
    - a final é Knicks x Spurs, Knicks `passou`, placar 4 e 1, resumo "4-1 na série".
  - `playoffs` da NFL 2025 (ponto de atenção 2):
    - colunas com 6, 4, 2 e 1;
    - o Super Bowl LX vai para o Seattle;
    - o Pro Bowl fica de fora;
    - os confrontos da Divisional com um time que pulou o Wild Card (DEN x BUF, SEA x SF) têm 1 alimentador.
  - `playoffs` da MLB 2026: colunas com 4, 4, 2 e 1; campeão Brewers.
  - `playoffs` da NHL 2026: colunas com 8, 4, 2 e 1; campeão Hurricanes.
  - `playoffs` da MLS 2026: colunas conferidas com a amostra.
  - **Corte no meio** (ponto de atenção 3): a NBA só até o fim da 1ª rodada dá colunas de 2ª rodada, final de conferência e final com 4, 2 e 1 vagas.
- [ ] **Passo 3:** os testes falham; implementar; os testes passam.
- [ ] **Passo 4:** a suíte inteira verde. Commit com a mensagem "Regras da chave dos playoffs da NBA, NFL, MLB, NHL e MLS".

### Task 3: regras da Copa NBA

**Arquivos:**
- Modificar: `static/chave_regras.js`, `testes/chave.test.js`.
- Amostra já guardada: `chave_copa_nba_2025.json`, com 67 jogos.

**Interfaces:**
- `Chave.copaNba(jogos, conferenciaDe: (timeId) => "Leste"|"Oeste"|null) -> {grupos: [Grupo], colunas: [Coluna]}`.
  - **Grupos:** os jogos com a nota "NBA Cup - Group Play". Cada grupo é um conjunto de times ligados pelos confrontos entre si (componentes conexos); são 6 grupos de 5.
  - **Nome do grupo:** `"<conferência> A|B|C"`, por conferência, na ordem do menor id de time do grupo. Sem conferência, "Grupo 1..6".
  - **Linhas do grupo:** `{time, v, d, saldo, pontos}`, ordenadas por vitórias, depois saldo e depois pontos marcados.
  - **Colunas:** as quartas, a semi e o "Championship" (pela nota), montadas com `montar` e `{quartas: 4, semi: 2, final: 1}`.

**Passos:**
- [ ] **Passo 1: testes:**
  - os grupos da amostra dão 6 grupos de 5 times;
  - cada time está em um só grupo;
  - cada grupo soma 10 jogos (cada time joga 4);
  - os V-D do grupo somam 10-10;
  - as colunas têm 4, 2 e 1 confrontos;
  - a final é New York Knicks 124 x 113 San Antonio Spurs, com os Knicks `passou`.
- [ ] **Passo 2:** os testes falham; implementar; os testes passam. Commit com a mensagem "Regras da Copa NBA: grupos, tabela e chave".

### Task 4: rotas no `direto.js`

**Arquivos:**
- Modificar: `celular/direto.js`.

**Interfaces:**
- `GET /e/{esporte}/{liga}/chave?temporada=<ano opcional>` devolve:
  ```
  { temporada: {ano, rotulo}, outra: {ano, rotulo}|null,
    preliminares: [{nome, confrontos}], playIn: [Confronto],
    colunas: [Coluna], inicio: number,
    jogos: {[eventId]: jogo} }
  ```
  - O `jogo` é o objeto de `partida(ev, esporte, liga)`, para a tela abrir a partida sem buscar de novo.
  - **Futebol:** os tipos pelo Core API (`/seasons/{ano}/types`); depois os meses entre o `startDate` da primeira fase eliminatória ou preliminar e o `endDate` da última, com `eventosPeriodo`; depois `Chave.fasesDoFutebol`, `confrontos`, `montar` e `colunaInicial`. Fases antes da `inicio` vão para `preliminares`.
  - **Americanos:** o tipo 3 (e o 5 da NBA) pelos tipos da temporada; os meses do intervalo; depois `Chave.playoffs`.
  - **Qual temporada:** sem `temporada`, é a última da lista do Core API (`/seasons?limit=2`) se algum jogo de mata-mata dela já aconteceu ou está marcado até hoje; senão, a anterior. O `outra` aponta a outra das duas.
  - **Cache:** `viaEspn`, com a chave `espn_chave_v1:{esporte}:{liga}:{ano}`, TTL de 120 s se algum confronto estiver ao vivo ou for de hoje, e de 1800 s no resto. Uma temporada encerrada fica estável.
- `GET /e/nba/nba/copa?temporada=<ano opcional>` devolve `{temporada, outra, grupos, colunas, jogos}`. Os jogos vêm dos meses de outubro a dezembro do ano em que a temporada começa, filtrados pela nota "NBA Cup". A conferência vem de `buscarClassificacao("nba", "nba")`.

**Passos:**
- [ ] **Passo 1: implementar.**
- [ ] **Passo 2: conferir no navegador** (`docs/` sem cache), pelo console:
  - `await api("/e/futebol/uefa.champions/chave")` dá a temporada 2025-26 completa: o mata-mata de 2026-27 não começou, e `outra` aponta 2026-27;
  - `/e/futebol/bra.copa_do_brazil/chave` dá a de 2026, se já houver mata-mata;
  - `/e/nba/nba/chave` dá os playoffs de 2026 (a 2026-27 está na temporada regular);
  - `/e/nba/nba/copa` dá a Copa NBA 2026-27, com os grupos em andamento e a chave vazia (vagas).
- [ ] **Passo 3:** commit com a mensagem "Rotas da chave e da Copa NBA no app".

### Task 5: a chave na tela

**Arquivos:**
- Criar: `static/chave.js`, ligado no `index.html`, no `TELAS` e no `sw.js`, depois de `esportes.js`.
- Modificar:
  - `static/esportes.js`: o `ModuloPartidas.abas` passa a receber a liga e o `desenhar` atende a aba `chave`;
  - `static/navegacao.js`: a página da liga passa `params.liga` para `abas`, e entra a página nova `confronto`;
  - `static/style.css`.

**Interfaces:**
- `ModuloPartidas.abas(esp, liga)`: com `window.MODO_CELULAR && Chave.temChave(esp.id, liga)`, acrescenta `{id: "chave", nome: Chave.nomeDaAba(...)}` depois de "Jogos".
- `chaveLista(esp, liga, temporada?)`, desenhado em `lista()`:
  - a linha da temporada ("Chave de 2025-26", com o botão para a outra);
  - as listas simples (Play-In, fases preliminares e anteriores à `inicio`), cada uma recolhível, com os confrontos em linhas;
  - a chave em colunas;
  - com um confronto ao vivo, `agendar("lista", …, 20000)`.
- `desenharChave(colunas, posicoes, {aoTocar}) -> Node`:
  - uma faixa com `overflow-x: auto`;
  - colunas de 168 px com o nome da fase em cima;
  - cartões posicionados por `top = y * altura`;
  - um SVG atrás, com as linhas de cada alimentador até o confronto (linha em cotovelo);
  - a rolagem começa na primeira coluna com confronto a jogar ou ao vivo.
- **Cartão do confronto:**
  - duas linhas (logo de 20 px, nome curto e placar), com o lado que passou em negrito e o outro apagado;
  - `resumo` pequeno embaixo;
  - borda de "ao vivo" como nos jogos;
  - a vaga mostra "A definir" apagado;
  - alvo de toque com o cartão inteiro, de pelo menos 44 px de altura.
- **Ao tocar:**
  - com 1 jogo, `Navegacao.abrir({tipo: "jogo", params: {esporte, liga, id}, jogo})`;
  - com mais, `Navegacao.abrir({tipo: "confronto", params: {}, titulo, confronto, jogos})`. A página lista os jogos com `linhaPartida`, que abrem a partida. O título é "A x B".

**Passos:**
- [ ] **Passo 1: implementar.** Depois, `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812, claro e escuro):
  - na Champions (aba "Mata-mata"): 5 colunas, linhas certas, a rolagem lateral só na chave e a final com PSG em negrito e "pên. 4-3";
  - tocar na final abre a partida; tocar num confronto de ida e volta abre a lista dos 2 jogos;
  - Copa do Brasil e Libertadores, com as listas das fases anteriores;
  - NBA, NFL e MLB (aba "Playoffs");
  - o Brasileirão sem a aba;
  - o botão de temporada troca para a outra;
  - console sem erro.
- [ ] **Passo 3: conferir o site do PC** (`uvicorn`): sem a aba.
- [ ] **Passo 4:** commit com a mensagem "A chave em colunas na página da liga".

### Task 6: a aba Copa NBA, README e conferência final

**Arquivos:**
- Modificar: `static/esportes.js` (aba `copa` na NBA do app), `static/chave.js` e `README.md`.

**Interfaces:**
- `ModuloPartidas.abas(esp, liga)`: com `esp.id === "nba"` e `MODO_CELULAR`, acrescenta `{id: "copa", nome: "Copa NBA"}`.
- `copaNbaLista(esp, temporada?)`:
  - o seletor de temporada;
  - os 6 grupos em `tabela` (#, Time, V, D, Saldo), com o 1º de cada grupo destacado;
  - a nota "Desempate aproximado: vitórias, saldo e pontos marcados.";
  - embaixo, a chave das quartas até a final com `desenharChave`.

**Passos:**
- [ ] **Passo 1: implementar.** Depois, `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador:** a Copa NBA 2026-27 (grupos em andamento, chave com vagas) e a de 2025-26 (chave completa, Knicks campeões).
- [ ] **Passo 3: README.** O chaveamento e a Copa NBA entram na lista de funcionalidades do app; e a árvore ganha `chave_regras.js` e `chave.js`.
- [ ] **Passo 4: conferência final.**
  - As três suítes verdes.
  - **Tela:**
    - a página de uma liga com chave, outra sem, um playoff americano e a Copa NBA, em 375×812, claro e escuro;
    - com um jogo ao vivo, se houver: a chave se atualiza e, ao sair, o timer para.
- [ ] **Passo 5:** commit com a mensagem "Aba Copa NBA e README do chaveamento".
