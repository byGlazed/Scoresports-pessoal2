# Parte 1 (fonte e página do time): plano de implementação

> **Para quem for executar:** use superpowers:subagent-driven-development ou superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o andamento.

**Objetivo:** corrigir a fonte e a faixa de dias no celular, e trocar a tela de elenco por uma página de time com cinco abas (Jogos, Elenco, Detalhes, Classificação, Estatísticas) em todos os esportes com times.

**Arquitetura:**
- As regras puras (agrupar elenco, separar jogos, escolher estatísticas, achar o técnico no Wikidata) ficam num arquivo novo, `celular/time_dados.js`. Ele é carregado antes do `direto.js` e testado com `node --test`.
- O `direto.js` ganha as rotas que buscam na ESPN e no Wikidata e usam essas regras.
- O `static/esportes.js` desenha a página no `Painel` que já existe.
- O servidor Python não muda.

**Tecnologia:** JavaScript puro (navegador e Node 24 para os testes), CSS, Java (WebView do Android), Python só para o `gerar_celular.py`.

**Spec:** `planejamento/2026-11-11-parte1-fonte-e-pagina-do-time.md`

## Regras globais

- **Onde entram as novidades:** só no app (`celular/`, `static/`, `gerar_celular.py`, `android/`). `api.py`, `espn_dados.py`, `espn_extra.py` e `nba_dados.py` não mudam.
- **Fonte:** Inter, variável, woff2, subconjunto latino, com a licença OFL junto, em `static/fontes/`. Nenhum link para `fonts.googleapis.com` ou `fonts.gstatic.com`.
- **Validade no banco do celular:**
  - cabeçalho, elenco e estatísticas do time: 6 h (21600 s);
  - jogos do time: 15 min (900 s);
  - técnico pelo Wikidata: 7 dias (604800 s).
- **Tamanho de letra no Android:** `textZoom = min(round(fontScale × 100), 115)`.
- **Textos da interface:** em português do Brasil, no padrão das telas atuais. Erros seguem o formato "Não foi possível obter dados da ESPN agora. Motivo: ...".
- **Depois de mudar `static/` ou `celular/`:** rodar `python gerar_celular.py` e fazer o commit junto com o `docs/` gerado. A pasta `android/app/src/main/assets/www/` é ignorada pelo git, então só o `docs/` entra no commit.
- **F1 e UFC:** não têm times e não mudam.

## Pontos de atenção na revisão

1. **Seleções e ligas sem estatística de time** (amistosos, Eliminatórias): a aba Estatísticas mostra "A ESPN não tem estatísticas deste time nesta competição.", sem erro. Teste na Tarefa 2 (`estatisticasDoTime` com lista vazia) e conferência na Tarefa 5.
2. **Time com nome ambíguo no Wikidata** ("Botafogo", "Nacional", "Santos"): melhor não mostrar técnico do que mostrar o técnico errado. `escolherClube` só aceita entidade que seja clube ou seleção de futebol. Teste na Tarefa 2.
3. **Começo ou fim de temporada** (sem jogos passados ou sem próximos): cada lista vazia mostra "Nenhum jogo encontrado." Teste na Tarefa 2 (`separarJogos([])`).
4. **Jogo adiado ou cancelado com data já passada:** não aparece nem em "Últimos" nem em "Próximos". Teste na Tarefa 2.
5. **Site do PC pelo `uvicorn`** (sem `window.MODO_CELULAR`): a página mostra só o Elenco, com o aviso "A página completa do time está no app e na pasta docs/". Conferência na Tarefa 4.

---

### Tarefa 1: fonte Inter embutida, faixa de dias e tamanho de letra

**Arquivos:**
- Criar: `static/fontes/inter.woff2`, `static/fontes/LICENSE.txt`
- Modificar:
  - `static/style.css`: variáveis `--fonte` e `--fonte-placar` (linhas 20 e 21), `.dia` (330 a 338), `.faixa-datas` (307 a 316), `.evento-data .dia` (891);
  - `static/esportes.js`: `caixaData`, linha 1072;
  - `static/index.html`: linhas 8 a 10;
  - `gerar_celular.py`: função `main`;
  - `celular/sw.js`: `ARQUIVOS` e o bloco das fontes do Google (linhas 41 a 50);
  - `android/app/src/main/java/com/byglazed/scoresports/MainActivity.java`: logo depois de `config.setUserAgentString(...)`.

**Interfaces:**
- Produz o caminho relativo `fontes/inter.woff2`. Ele vale em `/static/` (PC), em `docs/` e no APK.

- [ ] **Passo 1: baixar a fonte** (pedir o ok do usuário antes, porque é um download)

```bash
curl -L -o static/fontes/inter.woff2 https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/files/inter-latin-wght-normal.woff2
curl -L -o static/fontes/LICENSE.txt https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/LICENSE
```
Esperado: o `.woff2` tem mais de 30 KB, e o `LICENSE.txt` contém "SIL OPEN FONT LICENSE".

- [ ] **Passo 2: CSS da fonte**
  - Adicionar `@font-face { font-family: "Inter"; src: url("fontes/inter.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }` no topo do `style.css`.
  - `--fonte: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`
  - `--fonte-placar: "Inter", system-ui, sans-serif;`
  - `body` ganha `font-feature-settings: "tnum" 1, "cv11" 1;`, que deixa os números com largura fixa em todo o app.

- [ ] **Passo 3: faixa de dias**
  - `.dia`: `display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 6px 2px; min-height: 44px; line-height: 1.2;`.
  - `.faixa-datas`: `align-items: stretch`.
  - `.faixa-datas .seta`: `height: auto`.
  - Renomear a classe da agenda: `.evento-data .dia` vira `.evento-data .dia-evento`, no CSS e no `caixaData` do `esportes.js`.

- [ ] **Passo 4: tirar o Google Fonts**
  - Apagar as linhas 8 a 10 de `static/index.html`.
  - No `celular/sw.js`, apagar o bloco "fontes do Google" e incluir `"./fontes/inter.woff2"` em `ARQUIVOS`.

- [ ] **Passo 5: copiar a pasta da fonte no `gerar_celular.py`.** Depois do laço das `TELAS`, acrescentar `shutil.copytree(RAIZ / "static" / "fontes", DOCS / "fontes")`.

- [ ] **Passo 6: Android.** Logo depois de `config.setUserAgentString(...)`, acrescentar `config.setTextZoom(Math.min(Math.round(getResources().getConfiguration().fontScale * 100), 115));`.

- [ ] **Passo 7: gerar e conferir**

Rodar `python gerar_celular.py && ls docs/fontes && grep -c "fonts.g" docs/index.html docs/sw.js`. Esperado: lista `inter.woff2` e `LICENSE.txt`, e as duas contagens dão `0`.

- [ ] **Passo 8: conferir no navegador.** Servir `docs/` (`python -m http.server 8765 --directory docs`) e abrir em 375×812.
  - A fonte usada é `Inter`: conferir com `document.fonts.check('16px Inter')`, que deve dar `true`.
  - A faixa de dias mostra as duas linhas inteiras.
  - Com `document.documentElement.style.zoom = 1.15`, nenhuma data, filtro ou placar fica cortado. Conferir no Início, no Futebol e num jogo aberto.

- [ ] **Passo 9: commit**

```bash
git add static/fontes static/style.css static/esportes.js static/index.html gerar_celular.py celular/sw.js android/app/src/main/java docs
git commit -m "Fonte Inter embutida e faixa de dias sem cortes"
```

---

### Tarefa 2: regras puras da página do time (`celular/time_dados.js`)

**Arquivos:**
- Criar: `celular/time_dados.js`, `testes/time_dados.test.js`, `testes/amostras/*.json`
- Modificar:
  - `celular/direto.js`: tirar `atletaCurto` (linhas 982 a 992), que passa a morar no arquivo novo;
  - `gerar_celular.py`: incluir `<script src="./time_dados.js"></script>` antes do `direto.js` na troca do `index.html`;
  - `celular/sw.js`: `"./time_dados.js"` em `ARQUIVOS`.

**Interfaces** (produz funções globais no navegador; no Node, exporta com `if (typeof module !== "undefined") module.exports = {...}`):
- `atletaCurto(a) -> {id, nome, camisa, posicao, idade, foto, pais}`: o código atual, movido sem mudança.
- `grupoDaPosicao(esporte: string, posicao: {name?, abbreviation?}) -> string`
- `agruparElenco(esporte: string, roster: object) -> {grupos: [{nome: string, atletas: AtletaCurto[]}], tecnico: string|null}`
- `resultadoDoTime(jogo: Jogo, timeId: string) -> "V"|"E"|"D"|null`
- `separarJogos(jogos: Jogo[], agoraIso: string, limite = 10) -> {ultimos: Jogo[], proximos: Jogo[]}`
- `estatisticasDoTime(esporte: string, categorias: object[]) -> [{grupo: string, itens: [{rotulo: string, valor: string}]}]`
- `escolherClube(entidades: object) -> string|null`, que devolve o QID
- `idTecnicoAtual(entidade: object) -> string|null`, que devolve o QID

`Jogo` é o objeto que a função `partida()` do `direto.js` monta. Usa só os campos `estado` (1 agendado, 2 ao vivo, 3 encerrado), `status`, `inicio` (ISO), `casa` e `fora` (`{id, placar, vencedor}`).

**Valores fixos (da spec):**

Grupos do elenco por esporte. A chave é o `position.name` ou `abbreviation` da ESPN, comparado em minúsculas. A ordem dos grupos é a da lista, e "Outros" vem sempre por último.

| Esporte | Grupos |
|---|---|
| `futebol` | goalkeeper → Goleiros; defender → Defensores; midfielder → Meias; forward → Atacantes |
| `nba` | guard, `g` → Armadores; forward, `f` → Alas; center, `c` → Pivôs |
| `nfl` | Usa os grupos que vêm em `athletes[].position`: offense → Ataque; defense → Defesa; specialteam → Times especiais; injuredreserveorout → Lesionados; suspended → Suspensos; practicesquad → Elenco de treino |
| `mlb` | sp, rp, p → Arremessadores; c → Receptores; 1b, 2b, 3b, ss, if → Defensores internos; lf, cf, rf, of → Defensores externos; dh → Rebatedor designado |
| `nhl` | g → Goleiros; d → Defensores; c, lw, rw, f → Atacantes |

Técnico: `roster.coach[0]` vira `"firstName lastName"`. Se não houver, fica `null`.

Estatísticas, no formato `categoria.nome → rótulo`. O valor mostrado é o `displayValue`, e estatística ausente é pulada.

| Esporte | Grupo | Itens |
|---|---|---|
| `futebol` | Ataque | `offensive.totalGoals` Gols; `offensive.avgGoals` Gols por jogo; `offensive.totalShots` Finalizações; `offensive.shotsOnTarget` No alvo; `offensive.possessionPct` Posse de bola (%); `general.passPct` Acerto de passe (%) |
| `futebol` | Defesa | `goalKeeping.goalsConceded` Gols sofridos; `goalKeeping.cleanSheet` Jogos sem sofrer gol; `goalKeeping.saves` Defesas do goleiro; `defensive.totalTackles` Desarmes; `defensive.interceptions` Interceptações |
| `futebol` | Geral | `general.wins` Vitórias; `general.draws` Empates; `general.losses` Derrotas; `general.goalDifference` Saldo de gols; `general.yellowCards` Cartões amarelos; `general.redCards` Cartões vermelhos |
| `nba` | Ataque | `offensive.avgPoints` Pontos por jogo; `offensive.avgAssists` Assistências por jogo; `offensive.fieldGoalPct` Arremessos (%); `offensive.threePointPct` Bolas de 3 (%); `offensive.freeThrowPct` Lances livres (%) |
| `nba` | Defesa | `defensive.avgDefensiveRebounds` Rebotes defensivos por jogo; `defensive.avgSteals` Roubos por jogo; `defensive.avgBlocks` Tocos por jogo |
| `nba` | Geral | `general.avgRebounds` Rebotes por jogo; `offensive.avgTurnovers` Erros por jogo; `general.gamesPlayed` Jogos |
| `nfl` | Ataque | `scoring.totalPointsPerGame` Pontos por jogo; `passing.yardsPerGame` Jardas por jogo; `passing.passingYardsPerGame` Jardas de passe por jogo; `rushing.rushingYardsPerGame` Jardas corridas por jogo; `scoring.totalTouchdowns` Touchdowns |
| `nfl` | Defesa | `defensive.pointsAllowed` Pontos sofridos; `defensive.yardsAllowed` Jardas cedidas; `defensive.sacks` Sacks; `defensiveInterceptions.interceptions` Interceptações; `defensive.totalTackles` Tackles |
| `nfl` | Geral | `miscellaneous.turnOverDifferential` Saldo de turnovers; `miscellaneous.thirdDownConvPct` 3ª descida convertida (%); `miscellaneous.redzoneScoringPct` Aproveitamento na red zone (%); `general.totalPenalties` Faltas |

Grupo sem nenhum item é omitido. MLB e NHL devolvem `[]` (a tabela entra na parte 2).

Wikidata:
- `escolherClube` recebe a resposta de `wbgetentities` (`{entities: {Qx: {...}}}`). Devolve o primeiro QID cujo P31 contenha `Q476028` (clube de futebol) ou `Q6979593` (seleção de futebol), na ordem em que vieram.
- `idTecnicoAtual` lê `claims.P286` e devolve o QID do primeiro valor sem o qualificador `P582` (data de fim). Os de rank `preferred` vêm antes dos `normal`.

Regras de `separarJogos`:
- **Últimos:** `estado === 3`, do mais recente para o mais antigo, no máximo `limite`.
- **Próximos:** `estado < 3`, com `inicio >= agora − 4 h` e status diferente de "Adiado" ou "Cancelado", do mais cedo para o mais tarde, no máximo `limite`.
- O resto é descartado.

- [ ] **Passo 1: salvar as amostras reais** (são só leituras públicas da ESPN e do Wikidata)

```bash
mkdir -p testes/amostras && cd testes/amostras
B=https://site.api.espn.com/apis/site/v2/sports; C=https://sports.core.api.espn.com/v2/sports
curl -s $B/soccer/bra.1/teams/819/roster -o roster_futebol.json
curl -s $B/basketball/nba/teams/18/roster -o roster_nba.json
curl -s $B/football/nfl/teams/12/roster -o roster_nfl.json
curl -s $C/soccer/leagues/bra.1/seasons/2026/types/1/teams/819/statistics -o stats_futebol.json
curl -s $C/basketball/leagues/nba/seasons/2027/types/2/teams/18/statistics -o stats_nba.json
curl -s $C/football/leagues/nfl/seasons/2026/types/2/teams/12/statistics -o stats_nfl.json
curl -s "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q17479&props=claims&format=json" -A "Scoresports-pessoal/1.0" -o wikidata_flamengo.json
```

- [ ] **Passo 2: escrever os testes** em `testes/time_dados.test.js` (`node:test` e `node:assert/strict`). Cada um é um `test(...)`:
  - `agruparElenco futebol`: com `roster_futebol.json`, os nomes dos grupos são um prefixo, na ordem, de `["Goleiros","Defensores","Meias","Atacantes","Outros"]`; o total de atletas é igual a `athletes.length`; `tecnico` é `null`.
  - `agruparElenco nba`: com `roster_nba.json`, os grupos ficam dentro de `["Armadores","Alas","Pivôs","Outros"]` e `tecnico === "Mike Brown"`.
  - `agruparElenco nfl`: com `roster_nfl.json`, o primeiro grupo é `"Ataque"`, existe `"Times especiais"` e `tecnico === "Andy Reid"`.
  - `grupoDaPosicao desconhecida`: `grupoDaPosicao("futebol", {name: "Sweeper"}) === "Outros"`.
  - `grupoDaPosicao mlb/nhl`: `("mlb", {abbreviation: "SS"}) === "Defensores internos"` e `("nhl", {abbreviation: "LW"}) === "Atacantes"`.
  - `resultadoDoTime`: casa `{id:"1", placar:"2"}` e fora `{id:"2", placar:"1"}` com `estado: 3` dão `"V"` para `"1"`, `"D"` para `"2"`; 1 a 1 dá `"E"`; `estado: 1` dá `null`.
  - `separarJogos vazio`: `separarJogos([], "2026-11-11T12:00:00Z")` dá `{ultimos: [], proximos: []}`.
  - `separarJogos ordem e limite`: com 12 encerrados e 3 agendados, `ultimos.length === 10` com o mais recente em `[0]`, e `proximos` vem do mais cedo para o mais tarde.
  - `separarJogos adiado`: um jogo `{estado: 1, status: "Adiado", inicio: <ontem>}` não aparece em nenhuma das listas.
  - `estatisticasDoTime futebol`: com `stats_futebol.json` (`splits.categories`), os grupos são `["Ataque","Defesa","Geral"]`, e "Vitórias" vem com o `displayValue` de `general.wins` da amostra.
  - `estatisticasDoTime nba` e `nfl`: o primeiro item do Ataque é "Pontos por jogo".
  - `estatisticasDoTime vazio`: `estatisticasDoTime("futebol", [])` dá `[]`; `estatisticasDoTime("mlb", <categorias da nba>)` também dá `[]`.
  - `escolherClube`: `{entities: {Q1: {claims: {P31: [<Q5>]}}, Q17479: <da amostra>}}` dá `"Q17479"`; sem nenhum clube, dá `null`.
  - `idTecnicoAtual`: com a amostra do Flamengo, devolve uma string que começa com `"Q"`; uma entidade cujo único P286 tem `P582` dá `null`.

- [ ] **Passo 3: rodar e ver falhar.** `node --test testes/`. Esperado: falha com "Cannot find module '../celular/time_dados.js'".

- [ ] **Passo 4: implementar `celular/time_dados.js`** com as interfaces e os valores acima. Os mapas ficam como constantes no topo: `GRUPOS_POSICAO`, `ORDEM_GRUPOS`, `STATS_TIME`. Depois, apagar `atletaCurto` do `direto.js`.

- [ ] **Passo 5: rodar e ver passar.** `node --test testes/`. Esperado: todos `ok`. Depois, `node --check celular/direto.js`.

- [ ] **Passo 6: incluir o arquivo nas páginas.** Fazer as mudanças no `gerar_celular.py` e no `sw.js` e rodar `python gerar_celular.py`. Esperado: `docs/index.html` tem `time_dados.js` antes de `direto.js`.

- [ ] **Passo 7: commit**

```bash
git add celular/time_dados.js celular/direto.js celular/sw.js testes gerar_celular.py docs
git commit -m "Regras da página do time: elenco por posição, jogos, estatísticas e técnico"
```

---

### Tarefa 3: rotas de dados do time (`celular/direto.js` e Android)

**Arquivos:**
- Modificar:
  - `celular/direto.js`: `buscarElenco` (linhas 994 a 1015) e `ROTAS` (linha 1773 em diante); funções novas logo depois de `buscarElenco`;
  - `MainActivity.java`: a condição de `shouldInterceptRequest`.

**Interfaces:**
- Consome, da Tarefa 2: `agruparElenco`, `separarJogos`, `estatisticasDoTime`, `escolherClube`, `idTecnicoAtual`.
- Consome, do código atual: `espnGet`, `ref`, `obter`, `viaEspn`, `partida`, `dConfig`, `nomeDaLiga`, `temporadaAtual`, `logoDe`, `wiki`, `Indice.registrar`.
- Produz rotas para a Tarefa 4:

| Rota | Retorno | Validade e chave |
|---|---|---|
| `GET /e/{esporte}/{liga}/times/{id}` | `{id, nome, logo, liga_nome, posicao, campanha, estadio, cidade, tecnico}` | 21600 s, `espn_time_v1:...` |
| `GET .../times/{id}/jogos` | `{ultimos: Jogo[], proximos: Jogo[]}` | 900 s, `espn_time_jogos_v1:...` |
| `GET .../times/{id}/elenco` | o formato atual, mais `tecnico: string\|null` | 21600 s; a chave sobe para `espn_elenco_v2:...` |
| `GET .../times/{id}/estatisticas` | `{temporada: string\|null, grupos: [...]}` | 21600 s, `espn_time_stats_v1:...` |

- [ ] **Passo 1: `buscarElenco`** passa a usar `agruparElenco(esporte, dados)` e a devolver `tecnico`. O registro no `Indice` continua igual.

- [ ] **Passo 2: `async function tecnicoFutebol(nomeTime: string) -> string|null`.** Guarda em `obter("wikidata_tecnico_v1:" + semAcento(nomeTime), 604800, ...)`.
  1. `wiki("https://www.wikidata.org", {action: "wbsearchentities", search: nomeTime, language: "pt", type: "item", limit: 5})`.
  2. `wbgetentities` com os ids encontrados (`props: "claims"`), e depois `escolherClube` e `idTecnicoAtual`.
  3. `wbgetentities` do técnico com `props: "labels"`, `languages: "pt|en"`. Devolve o rótulo em pt, ou em en.
  
  Qualquer falha devolve `null`.

- [ ] **Passo 3: `async function buscarTime(esporte, liga, timeId)`.**
  1. Pede `${D_BASE}/${sport}/${liga}/teams/${timeId}`, de onde saem `team.displayName`, `logoDe(team)`, `team.standingSummary` e `team.record.items[0].summary`.
  2. Pede o Core `${D_CORE}/${sport}/leagues/${liga}/seasons/${ano}/teams/${timeId}`, com `ano` vindo de `temporadaAtual`, de onde saem `venue.fullName` e `venue.address.city`. Se falhar, os dois campos ficam `null`.
  3. Técnico: no futebol, `tecnicoFutebol(nome)`; nos outros, `tecnico` do `buscarElenco`.
  
  O campo `posicao` traduz `"1st in X"` para `"1º lugar · " + nomeDaLiga(liga)`, usando o número de `standingSummary`. Sem número, fica `null`.

- [ ] **Passo 4: `async function buscarJogosTime(esporte, liga, timeId)`.**
  - Junta `.../teams/{id}/schedule` e, só no futebol, `.../teams/{id}/schedule?fixture=true`.
  - Cada `ev` vira `partida(ev, esporte, liga)`, sem repetir `id`.
  - Devolve `separarJogos(jogos, new Date().toISOString())`.

- [ ] **Passo 5: `async function buscarEstatisticasTime(esporte, liga, timeId)`.**
  1. `[ano, tipo, nome] = await temporadaAtual(sport, liga)`.
  2. Busca em `${D_CORE}/${sport}/leagues/${liga}/seasons/${ano}/types/${tipo || (sport === "soccer" ? 1 : 2)}/teams/${timeId}/statistics`.
  3. Devolve `{temporada: nome, grupos: estatisticasDoTime(esporte, d.splits?.categories || [])}`.
  
  Erro 404 ou 400 da ESPN devolve `grupos: []`, sem lançar erro.

- [ ] **Passo 6: registrar as rotas em `ROTAS`**, antes da rota `/elenco`. A regex do cabeçalho termina em `/times/([^/]+)$`.

- [ ] **Passo 7: Android.** Em `shouldInterceptRequest`, acrescentar `|| host.endsWith("wikidata.org")` à condição de `espn.com` e `wikipedia.org`.

- [ ] **Passo 8: conferir com dados reais.**
  1. Rodar `python gerar_celular.py`, servir `docs/` e abrir em 375×812.
  2. No console do navegador, chamar:
     - `await api('/e/futebol/bra.1/times/819')`
     - `await api('/e/futebol/bra.1/times/819/jogos')`
     - `await api('/e/nba/nba/times/18/estatisticas')`
     - `await api('/e/nfl/nfl/times/12/elenco')`
  3. Esperado:
     - Flamengo com `estadio` preenchido e `posicao` começando com um número e `º lugar`;
     - `ultimos.length` maior que 0;
     - a NBA com o grupo "Ataque";
     - a NFL com `tecnico: "Andy Reid"`;
     - nenhum erro no console.
  4. Por fim, `node --check celular/direto.js`.

- [ ] **Passo 9: commit**

```bash
git add celular/direto.js android/app/src/main/java docs
git commit -m "Rotas da página do time: cabeçalho, jogos, elenco com técnico e estatísticas"
```

---

### Tarefa 4: tela da página do time (`static/esportes.js`, `static/style.css`)

**Arquivos:**
- Modificar:
  - `static/esportes.js`: `abrirElenco` e `desenharElenco` (linhas 27 a 66), `classificacaoEspn` (linhas 859 a 923) e as chamadas nas linhas 605, 606 e 886;
  - `static/inicio.js`: linhas 116 e 456;
  - `static/style.css`: estilos novos no fim do arquivo.

**Interfaces:**
- Consome as rotas da Tarefa 3, mais as funções que já existem: `Painel`, `abasDetalhe`, `secao`, `tabela`, `vazio`, `caixaErro`, `carregando`, `imgLogo`, `imgBandeira`, `botaoFavorito`, `linhaPartida`, `esporteObj`, `irPara`, `mostrarDetalhe`, `partidaDetalhe`.
- Produz:
  - `abrirTime(esporte, liga, timeId, nome)`, que troca `abrirElenco` em todos os lugares (`abrirElenco` deixa de existir);
  - `desenharTime(corpo, ativo, esporte, liga, timeId)`;
  - `cartoesClassificacao(esp, liga, c, destaqueTimeId = null) -> Node[]`, que é o miolo extraído de `classificacaoEspn` (que passa a chamá-lo). A linha do time destacado recebe a classe `destaque`;
  - `abrirJogoDoTime(esporte, liga, jogo)`: faz `Painel.fechar()`, `irPara(esporte)`, `mostrarDetalhe()` e `partidaDetalhe(esporteObj(esporte), liga, jogo, false)`.

Comportamento:
- **Cabeçalho:** escudo, nome, `liga_nome`, `posicao`, `campanha` e `botaoFavorito(..., {comTexto: true})`. O objeto de favorito é o mesmo de hoje em `desenharElenco`.
- **Abas:** `abasDetalhe([{id:"jogos",nome:"Jogos"},{id:"elenco",nome:"Elenco"},{id:"detalhes",nome:"Detalhes"},{id:"classificacao",nome:"Classificação"},{id:"estatisticas",nome:"Estatísticas"}], atual, escolher)`. Começa em "jogos". Cada aba busca só quando é aberta, guarda o resultado na própria chamada de `desenharTime` e, se der erro, mostra `caixaErro` dentro da aba.
- **Jogos:** seções "Últimos jogos" e "Próximos jogos", com `linhaPartida(esporteObj(esporte), j, () => abrirJogoDoTime(...))`. Nos encerrados, um selo `.selo-resultado.v`, `.e` ou `.d` com V, E ou D, vindo de `resultadoDoTime`. Lista vazia mostra `vazio("Nenhum jogo encontrado.")`.
- **Elenco:** um `secao` por grupo, com a tabela atual (#, Atleta, Idade, País). Se houver `tecnico`, a última seção é "Técnico".
- **Detalhes:** `dl.fatos` com Estádio, Cidade, Técnico, Liga e Campanha. Campo vazio é omitido.
- **Classificação:** `cartoesClassificacao(..., timeId)`. Sem grupos, mostra `vazio("A classificação desta competição ainda não saiu.")`.
- **Estatísticas:** um `secao` por grupo, com `.numeros` e `.numero-caixa` (o mesmo visual do resumo do atleta). Sem grupos, mostra `vazio("A ESPN não tem estatísticas deste time nesta competição.")`.
- **Sem `window.MODO_CELULAR`** (site pelo `uvicorn`): não desenha as abas. Mostra o cabeçalho com nome e escudo vindos do `/elenco`, o aviso `h("p", {class: "nota"}, "A página completa do time está no app e na pasta docs/.")` e a aba Elenco.
- **CSS:**
  - `.selo-resultado` tem 20×20 px, cantos de 4 px, peso 700 e cor branca; o fundo é `.v` `var(--vitoria, #1f9d55)`, `.e` `var(--texto-3)` e `.d` `var(--derrota, #d64545)`;
  - `tr.destaque` usa `background: var(--superficie-2)` e peso 600. Em `cartoesClassificacao`, a classe entra pela opção `classeLinha` da `tabela()`, que já existe;
  - `.abas-detalhe` dentro do `#painel` fica fixa no topo (`position: sticky; top: 0`), com o fundo do painel.

- [ ] **Passo 1:** extrair `cartoesClassificacao` e conferir que a aba Classificação do Futebol continua igual no navegador, antes e depois.
- [ ] **Passo 2:** implementar `abrirTime`, `desenharTime` e `abrirJogoDoTime`, e trocar as cinco chamadas de `abrirElenco`.
- [ ] **Passo 3:** fazer o CSS, rodar `node --check static/esportes.js static/inicio.js` e `python gerar_celular.py`.
- [ ] **Passo 4: conferir no navegador (375×812, dados reais).**
  - Abrir um jogo do Brasileirão e tocar no Flamengo: as cinco abas abrem sem erro.
  - Os selos V/E/D batem com os placares.
  - Tocar num jogo da aba Jogos fecha o painel e abre o jogo.
  - O botão "‹" do painel volta do atleta para o time.
  - Fazer o mesmo com um time da NBA e um da NFL, abrindo pela classificação.
- [ ] **Passo 5: conferir o site do PC.** Rodar `python -m uvicorn api:app` e tocar num time: aparece só o Elenco, com o aviso, sem erro.
- [ ] **Passo 6: commit**

```bash
git add static/esportes.js static/inicio.js static/style.css docs
git commit -m "Página do time no estilo Sofascore: jogos, elenco por posição, detalhes, classificação e estatísticas"
```

---

### Tarefa 5: conferência final e README

**Arquivos:**
- Modificar: `README.md`, nas seções do app e da estrutura.

- [ ] **Passo 1:** `node --test testes/`, todos `ok`; `node --check` em `static/*.js` e `celular/*.js`.
- [ ] **Passo 2: percorrer em 375×812, com dados reais.**
  - Times: Flamengo, a seleção brasileira (pelos Amistosos de seleções), Knicks e Chiefs.
  - Em cada um, abrir as cinco abas; nas seleções, a aba Estatísticas mostra o aviso, sem erro.
  - Com `zoom = 1.15`: nada cortado no cabeçalho, nas abas, nos selos ou na faixa de dias.
  - `read_console_messages` com `onlyErrors` vazio.
- [ ] **Passo 3: README.**
  - Uma linha sobre a página do time.
  - Uma linha sobre `node --test testes/`.
  - `static/fontes/` e `celular/time_dados.js` na árvore de arquivos.
- [ ] **Passo 4: commit**

```bash
git add README.md docs
git commit -m "README: página do time, testes e fonte embutida"
```

O push e a conferência do APK no celular ficam para o usuário, depois do Actions.
