# Parte 2: MLB, NHL, copas e Eredivisie

Data: 2026-11-11. Segunda de quatro partes (1. fonte e página do time ✔; 2. novas competições; 3. atualização automática; 4. Kings League).

## Objetivo

Colocar no app:
- a **MLB** e a **NHL**, no mesmo nível da NBA e da NFL;
- as **copas nacionais e supercopas** pedidas, num grupo próprio;
- a **Eredivisie**, a liga da Holanda.

## Decisões já tomadas

- **Onde entra:** só no app (`celular/`, `static/`, `gerar_celular.py`). O servidor Python não muda, como na parte 1.
- **Liga Portugal e Ligue 1:** já estão no app; só a Eredivisie (`ned.1`) é nova.
- **Campeões:**
  - **MLB e NHL:** as 5 últimas World Series e Stanley Cups entram no `campeoes.json`, conferidas.
  - **Copas:** ficam para a parte 3, que traz os campeões automaticamente.
- **Onde assistir nas copas:** só entra o canal confirmado em fonte. O que não for confirmado fica sem canal, em vez de um palpite.

## 1. MLB e NHL

Novas entradas em `D_ESPORTES` (`celular/direto.js`):

| id | nome | esporte ESPN | liga |
|---|---|---|---|
| `mlb` | MLB | `baseball` | `mlb` |
| `nhl` | NHL | `hockey` | `nhl` |

Os dois são `tipo: "partidas"`, com navegação dia a dia (a mesma da NBA no app) e as abas Jogos, Classificação e Líderes. Na barra de cima aparecem depois da NFL.

**Placar e status:**
- **Ordem:** visitante primeiro, como na NBA e na NFL (`ordemTimes`).
- **Ao vivo:**
  - beisebol mostra a entrada, com ▲ (parte de cima) ou ▼ (parte de baixo), por exemplo "▲ 5ª entrada";
  - hóquei mostra período e relógio, por exemplo "2º período · 12:34". Prorrogação vira "Prorrogação" e disputa de pênaltis vira "Pênaltis".
- **Encerrado e agendado:** seguem o padrão atual ("Encerrado", horário de Brasília).
- **Playoffs:** a situação da série (`competitions[0].series.summary`, por exemplo "MIL ganhou a série 4-1") aparece como nota do jogo, no mesmo lugar onde o futebol mostra a rodada.

**Detalhe do jogo:** usa o que já existe para a NFL:
- pontuações (corridas e gols);
- estatísticas comparadas dos times;
- números dos jogadores.

Esporte sem algum desses dados simplesmente não mostra a seção.

**Classificação:** grupos como a ESPN manda (MLB por liga e divisão; NHL por conferência e divisão). Colunas (`COLUNAS_CLASSIFICACAO`), na forma chave ESPN, sigla e nome:

| Esporte | Colunas |
|---|---|
| MLB | `wins` V Vitórias; `losses` D Derrotas; `winPercent` % Aproveitamento; `gamesBehind` Atrás Jogos atrás do líder; `streak` Seq. Sequência |
| NHL | `gamesPlayed` J Jogos; `wins` V Vitórias; `losses` D Derrotas; `otLosses` DP Derrotas na prorrogação; `points` Pts Pontos; `pointsFor` GP Gols pró; `pointsAgainst` GC Gols contra; `differential` SG Saldo de gols |

**Líderes:** top 10, nas categorias que a ESPN publica, traduzidas:

| Esporte | Categorias |
|---|---|
| MLB | `avg` Média de rebatidas; `homeRuns` Home runs; `RBIs` Corridas impulsionadas; `hits` Rebatidas; `stolenBases` Bases roubadas; `wins` Vitórias (arremessador); `ERA` ERA; `strikeouts` Strikeouts; `saves` Saves |
| NHL | `goals` Gols; `assists` Assistências; `points` Pontos; `plusMinus` +/−; `wins` Vitórias (goleiro); `savePct` Defesas (%); `avgGoalsAgainst` Gols sofridos por jogo; `shutouts` Jogos sem sofrer gol |

Os líderes usam sempre a temporada regular (tipo 2), como a NBA e a NFL.

**Página do time:** os grupos de posição de MLB e NHL já existem desde a parte 1. Entra só a tabela `STATS_TIME` dos dois esportes, com nomes conferidos numa amostra real do Core API:
- **MLB:** rebatidas, home runs, média, ERA, strikeouts e vitórias.
- **NHL:** gols, gols sofridos, % de defesas, power play e pênaltis.

**Busca, favoritos e Início:**
- `UID_ESPORTE`, `SEGMENTO_ESPORTE`, `LIGA_PADRAO`, `APELIDOS` ("beisebol", "baseball", "hóquei", "hockey"), `NOME_ESPORTE` e `ABAS_POR_ESPORTE` ganham `mlb` e `nhl`.
- Favoritos e o Início passam a contar os dois.

**Onde assistir (`transmissoes.json`):** padrão "ESPN / Disney+ Premium" para `mlb` e `nhl`, com a observação "confira a grade da ESPN". É o padrão das últimas temporadas no Brasil (World Series 2026 e NHL 2024/25 na ESPN e Disney+).

**Campeões (`campeoes.json`):** chaves `mlb` (World Series) e `nhl` (Stanley Cup), com as 5 últimas edições, conferidas na implementação.

## 2. Copas e Eredivisie

Novas competições de futebol em `D_ESPORTES.futebol.ligas`:

| id ESPN | Nome no app | Grupo na barra lateral |
|---|---|---|
| `ned.1` | Eredivisie | Europa |
| `esp.copa_del_rey` | Copa del Rey | Copas |
| `esp.super_cup` | Supercopa da Espanha | Copas |
| `eng.fa` | FA Cup | Copas |
| `eng.league_cup` | Copa da Liga Inglesa | Copas |
| `eng.charity` | Community Shield | Copas |
| `ger.dfb_pokal` | Copa da Alemanha | Copas |
| `ger.super_cup` | Supercopa da Alemanha | Copas |
| `ita.coppa_italia` | Coppa Italia | Copas |
| `ita.super_cup` | Supercopa da Itália | Copas |
| `fra.coupe_de_france` | Copa da França | Copas |
| `fra.super_cup` | Supercopa da França | Copas |
| `por.taca.portugal` | Taça de Portugal | Copas |
| `ned.cup` | Copa da Holanda | Copas |
| `bra.supercopa_do_brazil` | Supercopa do Brasil | Copas |
| `conmebol.recopa` | Recopa Sul-Americana | Copas |
| `uefa.super_cup` | Supercopa da UEFA | Copas |
| `fifa.cwc` | Mundial de Clubes | Copas |

- **Barra lateral:** o grupo "Copas" entra em `ORDEM_GRUPOS` logo depois de "Europa" e antes de "América do Norte". A Copa do Brasil continua no grupo Brasil.
- **Busca:** cada uma ganha apelidos em `APELIDOS`, por exemplo "copa do rei", "fa cup", "copa da inglaterra", "copa da alemanha", "pokal", "copa da italia", "copa da franca", "taca de portugal", "eredivisie", "holanda", "mundial de clubes".
- **Abas:** as mesmas do futebol (Jogos, Classificação, Artilharia e cartões). Copa sem classificação ou sem números mostra o aviso que já existe.
- **Onde assistir:** canal só quando confirmado em fonte; o resto fica sem.

## 3. Testes e conferência

- **Regras puras novas** (texto do status de beisebol e hóquei, nota de série) num arquivo novo, `celular/regras_esportes.js`, carregado antes do `direto.js`. Testes em `testes/regras_esportes.test.js`, com amostras reais da ESPN: o jogo 5 da World Series 2026 e um jogo da NHL, ao vivo ou encerrado.
- **`STATS_TIME` de MLB e NHL:** testes com amostras reais do Core API.
- **Navegador**, em 375×812, com dados reais:
  - MLB: a World Series de outubro;
  - NHL: os jogos de hoje;
  - as copas: FA Cup, Copa del Rey e Copa da Alemanha;
  - a Eredivisie;
  - a página de um time da MLB e de um da NHL.
- **Sintaxe:** `node --check` em todos os `.js`, e `node --test testes/*.test.js` todo verde.

## Fora desta parte

- campeões das copas e atualização automática da grade de TV (parte 3);
- Kings League (parte 4);
- mudanças no servidor Python.
