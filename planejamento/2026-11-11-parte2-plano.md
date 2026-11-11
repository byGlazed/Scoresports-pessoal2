# Parte 2 (MLB, NHL, copas e Eredivisie): plano de implementação

> **Para quem for executar:** use superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o andamento.

**Objetivo:** pôr MLB e NHL no app com jogos, detalhe, classificação, líderes e página do time; pôr 17 copas num grupo "Copas" e a Eredivisie no grupo Europa.

**Arquitetura:**
- As regras puras novas (status ao vivo de beisebol e hóquei, nota do jogo, nomes dos líderes por esporte) ficam num arquivo novo, `celular/regras_esportes.js`. Ele é carregado antes do `direto.js` e testado com `node --test`.
- As tabelas de estatísticas de time vão para `celular/time_dados.js`.
- Os cadastros e as ligações ficam em `celular/direto.js`, `static/esportes.js`, `static/inicio.js` e nos JSON de dados.

**Tecnologia:** JavaScript puro (navegador e Node 24 para os testes) e JSON.

**Spec:** `planejamento/2026-11-11-parte2-mlb-nhl-copas.md`

## Regras globais

- **Servidor Python:** não muda. Tudo entra no app.
- **Nomes globais:** os scripts dividem um só espaço global no navegador. Antes de criar um nome no topo de um arquivo, conferir com `grep -w` que ele não existe em `static/*.js` e `celular/*.js`.
- **Depois de mudar `static/`, `celular/` ou os JSON:** rodar `python gerar_celular.py` e fazer o commit junto com o `docs/` gerado.
- **Testes:** `node --test testes/*.test.js`. Tudo verde ao fim de cada tarefa.
- **Conferência no navegador:** servir `docs/` sem cache (como na parte 1), em 375×812. Antes de cada rodada, apagar o service worker, os caches e o IndexedDB `scoresports`.
- **Onde assistir e campeões:** só dado confirmado em fonte. Na dúvida, fica sem.

## Pontos de atenção na revisão

1. **MLB fora de temporada (hoje):** a aba Jogos da MLB num dia sem jogo mostra o aviso de sempre, e as setas e o calendário levam até a World Series. Conferência na Tarefa 2.
2. **Status de beisebol sem a parte da entrada** (quando a ESPN não diz se é parte de cima ou de baixo): mostra só "5ª entrada", sem inventar. Teste na Tarefa 1.
3. **Prorrogação e pênaltis no hóquei:** período 4 vira "Prorrogação" e período 5 vira "Pênaltis" na temporada regular; nos playoffs, período 5 ou mais é "2ª prorrogação" e assim por diante. Teste na Tarefa 1.
4. **Categoria de líder com o mesmo nome em esportes diferentes** (`wins`, `goals`, `points`): cada esporte usa a própria tradução. "goals" na NHL é "Gols", não "Artilharia". Teste na Tarefa 1.
5. **Copa sem classificação ou sem números de artilharia:** mostra o aviso que já existe, sem erro. Conferência na Tarefa 3.

---

### Tarefa 1: regras puras de MLB e NHL

**Arquivos:**
- Criar: `celular/regras_esportes.js`, `testes/regras_esportes.test.js`, e as amostras `testes/amostras/mlb_ws_jogo5.json`, `stats_mlb.json` e `stats_nhl.json`
- Modificar:
  - `celular/time_dados.js`: `STATS_TIME` ganha `mlb` e `nhl`;
  - `testes/time_dados.test.js`: o teste `estatisticasDoTime sem dados ou esporte sem tabela` passa a usar um esporte sem tabela (`"f1"`) no lugar de `"mlb"`;
  - `gerar_celular.py` e `celular/sw.js`: carregar e guardar `regras_esportes.js` antes do `direto.js`.

**Interfaces** (globais no navegador; `module.exports` no Node, no mesmo padrão do `time_dados.js`):
- `statusAoVivo(esporteEspn: string, status: object) -> string|null`. Só trata `"baseball"` e `"hockey"`; para os outros devolve `null` (quem chama cai no texto atual).
- `notaDoJogo(comp: object) -> string|null`. Junta `comp.notes[0].headline` e `comp.series.summary` com " · ". Sem nenhum dos dois, devolve `null`.
- `nomeLiderEsporte(esporte: string, nomeEspn: string) -> string|null`. A tradução da categoria de líder para `"mlb"` e `"nhl"`; `null` se não houver.

**Regras:**
- **Beisebol, ao vivo:**
  - `status.period` é a entrada;
  - a parte vem de `status.type.shortDetail` ou `detail`, sem diferenciar maiúsculas: "top" ou "cima" dá "▲"; "bot" ou "baixo" dá "▼"; "mid" dá "Intervalo da {n}ª"; "end" dá "Fim da {n}ª";
  - sem parte reconhecida: "{n}ª entrada".
  - Exemplos: `{period: 5, type: {state: "in", shortDetail: "Top 5th"}}` dá "▲ 5ª entrada"; `"Mid 7th"` dá "Intervalo da 7ª".
- **Hóquei, ao vivo:**
  - período de 1 a 3: "{p}º período" mais " · {relógio}", quando há relógio;
  - `type.name` com "END_PERIOD": "Fim do {p}º período";
  - período 4: "Prorrogação";
  - período 5 na temporada regular (`season.type` diferente de 3, passado em `status._tipoTemporada`, ou sem informação): "Pênaltis";
  - nos playoffs, período ≥ 5: "{p−3}ª prorrogação".
- **Líderes:**

| Esporte | Traduções |
|---|---|
| MLB | `avg` Média de rebatidas; `homeRuns` Home runs; `RBIs` Corridas impulsionadas; `hits` Rebatidas; `stolenBases` Bases roubadas; `wins` Vitórias (arremessador); `ERA` ERA; `strikeouts` Strikeouts; `saves` Saves |
| NHL | `goals` Gols; `assists` Assistências; `points` Pontos; `plusMinus` +/−; `wins` Vitórias (goleiro); `savePct` Defesas (%); `avgGoalsAgainst` Gols sofridos por jogo; `shutouts` Jogos sem sofrer gol |

- **`STATS_TIME`** (no formato da parte 1):

| Esporte | Grupo | Itens |
|---|---|---|
| `mlb` | Ataque | `batting.runs` Corridas; `batting.hits` Rebatidas; `batting.homeRuns` Home runs; `batting.avg` Média de rebatidas; `batting.OPS` OPS; `batting.stolenBases` Bases roubadas |
| `mlb` | Arremesso | `pitching.wins` Vitórias; `pitching.losses` Derrotas; `pitching.ERA` ERA; `pitching.strikeouts` Strikeouts; `pitching.saves` Saves |
| `mlb` | Defesa | `fielding.errors` Erros; `fielding.fieldingPct` Aproveitamento na defesa |
| `nhl` | Ataque | `offensive.goals` Gols; `offensive.avgGoals` Gols por jogo; `offensive.shotsTotal` Chutes; `offensive.powerPlayPct` Power play (%); `offensive.shootingPct` Aproveitamento dos chutes (%) |
| `nhl` | Defesa | `defensive.goalsAgainst` Gols sofridos; `defensive.avgGoalsAgainst` Gols sofridos por jogo; `defensive.savePct` Defesas (%); `defensive.penaltyKillPct` Penalty kill (%); `defensive.shutouts` Jogos sem sofrer gol |
| `nhl` | Geral | `general.wins` Vitórias; `general.losses` Derrotas; `defensive.overtimeLosses` Derrotas na prorrogação; `general.plusMinus` +/−; `penalties.penaltyMinutes` Minutos de penalidade |

**Passos:**

- [ ] **Passo 1: salvar as amostras reais**, enxugadas como na parte 1:
  - a competição do jogo 5 da World Series: `site.api.espn.com/.../baseball/mlb/scoreboard?dates=20261029&lang=pt&region=br`, guardando `events[0].competitions[0]`;
  - o `splits.categories` de `sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/teams/8/statistics`;
  - o `splits.categories` de `.../hockey/leagues/nhl/seasons/2027/types/2/teams/2/statistics`.
- [ ] **Passo 2: escrever os testes** em `testes/regras_esportes.test.js`:
  - `statusAoVivo beisebol`: "Top 5th" dá "▲ 5ª entrada"; "Bot 9th" dá "▼ 9ª entrada"; "Mid 7th" dá "Intervalo da 7ª"; "End 3rd" dá "Fim da 3ª"; um detalhe desconhecido no período 6 dá "6ª entrada".
  - `statusAoVivo hóquei`: período 2 com relógio "12:34" dá "2º período · 12:34"; END_PERIOD no período 1 dá "Fim do 1º período"; período 4 dá "Prorrogação"; período 5 na temporada regular dá "Pênaltis"; período 6 nos playoffs dá "3ª prorrogação".
  - `statusAoVivo outros esportes`: `statusAoVivo("basketball", {...})` dá `null`.
  - `notaDoJogo`: com a amostra, dá "World Series - Game 5 · MIL ganhou a série 4-1"; `{}` dá `null`.
  - `nomeLiderEsporte`: `("nhl", "goals")` dá "Gols"; `("mlb", "wins")` dá "Vitórias (arremessador)"; `("nhl", "wins")` dá "Vitórias (goleiro)"; `("nba", "goals")` dá `null`.
  
  Em `testes/time_dados.test.js`, acrescentar:
  - `estatisticasDoTime mlb`: grupos `["Ataque","Arremesso","Defesa"]`, com o valor de `batting.homeRuns` da amostra;
  - `estatisticasDoTime nhl`: grupos `["Ataque","Defesa","Geral"]`.
- [ ] **Passo 3:** `node --test testes/*.test.js`. Esperado: os testes novos falham porque o módulo e as tabelas ainda não existem.
- [ ] **Passo 4:** implementar `regras_esportes.js` e as tabelas novas do `STATS_TIME`. Depois, ligar o arquivo no `gerar_celular.py` (entre `inicio.js` e `time_dados.js`) e no `ARQUIVOS` do `sw.js`.
- [ ] **Passo 5:** `node --test testes/*.test.js` todo verde e `node --check` nos arquivos novos. Rodar `python gerar_celular.py` e conferir que `docs/index.html` traz `regras_esportes.js` antes de `direto.js`.
- [ ] **Passo 6: commit** com a mensagem "Regras de MLB e NHL: status ao vivo, nota da série, líderes e estatísticas de time".

---

### Tarefa 2: MLB e NHL no app

**Arquivos:**
- Modificar:
  - `celular/direto.js`:
    - `D_ESPORTES`: `mlb` e `nhl` logo depois de `nfl`;
    - `statusTexto(esporteEspn, status, tipoTemporada = null)`: no ramo ao vivo, tentar primeiro `statusAoVivo(esporteEspn, {...status, _tipoTemporada: tipoTemporada})`. Na `partida`, passar `(ev.season || {}).type`;
    - `partida`: `nota` passa a vir de `notaDoJogo(comp)`;
    - `buscarLideres`: `anos` e `tipos` tratam `mlb` e `nhl` como a NBA e a NFL, ou seja `[2]`;
    - `nomeCategoria(c, esporte)`: usa `nomeLiderEsporte` primeiro, e quem chama passa o esporte;
    - `ESPERADOS`: ganha `mlb` e `nhl`; `ORDEM_LIDERES`: ganha as categorias novas no fim;
    - `UID_ESPORTE` ganha `1: "mlb"` e `70: "nhl"`; conferir os códigos na busca real;
    - `SEGMENTO_ESPORTE` ganha `baseball` e `mlb` para `mlb`, `hockey` e `nhl` para `nhl`;
    - `LIGA_PADRAO` e `APELIDOS` também.
  - `static/esportes.js`: `ordemTimes` (visitante primeiro também em `mlb` e `nhl`) e `COLUNAS_CLASSIFICACAO` (`mlb` e `nhl`, com as colunas da spec).
  - `static/inicio.js`: `NOME_ESPORTE` e `ABAS_POR_ESPORTE` (`mlb` e `nhl`, com as mesmas abas da NFL).
  - `transmissoes.json`: `padroes.mlb` e `padroes.nhl` com `canais: ["ESPN", "Disney+ Premium"]`, a observação "Confira a grade da ESPN: nem todo jogo passa na TV; o Disney+ Premium tem a maior parte." e `conferido_em: "2026-11-11"`.
  - `campeoes.json`: chaves `mlb` e `nhl` com as 5 últimas edições, no formato da `nba`. Cada campeão é conferido em fonte; os dados da ESPN servem de conferência quando houver jogo final.

**Passos:**

- [ ] **Passo 1: confirmar os campeões** de 2022 a 2026 da World Series e da Stanley Cup, com uma busca e com os dados da ESPN. Anotar no registro de progresso as fontes usadas.
- [ ] **Passo 2: fazer as mudanças**; depois, `node --check` e `python gerar_celular.py`.
- [ ] **Passo 3: conferir no navegador.**
  - **NHL hoje:**
    - lista com o visitante primeiro e horário de Brasília;
    - abrir um jogo (detalhe sem erro);
    - a Classificação mostra as colunas da spec por conferência;
    - os Líderes mostram "Gols", e não "Artilharia";
    - a página de um time abre as 5 abas e as Estatísticas mostram os grupos.
  - **MLB:**
    - ir até 29/10/2026: o jogo 5 mostra a nota "World Series - Game 5 · MIL ganhou a série 4-1";
    - Classificação e Líderes abrem;
    - a página dos Brewers abre;
    - hoje, sem jogos, aparece o aviso (ponto de atenção 1).
  - **Busca:** "Yankees" e "Bruins" acham os times, e "hóquei" acha a NHL.
  - **Console:** sem erro.
- [ ] **Passo 4:** `node --test` verde, e commit com a mensagem "MLB e NHL no app: jogos, detalhe, classificação, líderes, página do time e onde assistir".

---

### Tarefa 3: copas e Eredivisie

**Arquivos:**
- Modificar:
  - `celular/direto.js`: as 18 entradas da spec em `D_ESPORTES.futebol.ligas`, com a Eredivisie depois da Liga Portugal e as copas depois da MLS e antes das seleções; mais `APELIDOS`;
  - `static/esportes.js`: `GRUPOS_LIGAS` (Eredivisie em "Europa"; copas em "Copas") e `ORDEM_GRUPOS`, com "Copas" depois de "Europa";
  - `transmissoes.json`: `padroes["futebol:<id>"]` só para as competições com canal confirmado numa busca, incluindo a fonte em `observacao` e `conferido_em: "2026-11-11"`.

**Passos:**

- [ ] **Passo 1: pesquisar onde passam no Brasil** a FA Cup, a Copa da Liga Inglesa, a Copa del Rey, a Copa da Alemanha, a Coppa Italia, a Copa da França, a Taça de Portugal, a Eredivisie e o Mundial de Clubes. Anotar fonte e decisão no registro.
- [ ] **Passo 2: fazer as mudanças**; depois, `node --check` e `python gerar_celular.py`.
- [ ] **Passo 3: conferir no navegador.**
  - O grupo "Copas" aparece na barra lateral, na ordem certa.
  - FA Cup, Copa del Rey e Copa da Alemanha abrem a lista de jogos de algum dia com jogo. Abrir um jogo de cada.
  - Classificação e Artilharia de uma copa mostram dados ou o aviso, sem erro (ponto de atenção 5).
  - Eredivisie: jogos, Classificação e a página de um time.
  - Busca: "copa do rei", "fa cup" e "eredivisie" acham as competições.
  - Console sem erro.
- [ ] **Passo 4:** `node --test` verde, e commit com a mensagem "Copas nacionais e supercopas num grupo próprio, e a Eredivisie".

---

### Tarefa 4: README e conferência final

- [ ] **Passo 1: README.**
  - Em "Funcionalidades", uma seção "MLB e NHL".
  - Na lista de competições do futebol, as copas e a Eredivisie.
  - Na árvore de arquivos, `celular/regras_esportes.js`.
  - Em "Mantendo as transmissões em dia", lembrar das chaves novas.
- [ ] **Passo 2:** `node --test testes/*.test.js` verde, `node --check` em todos os `.js`, e `python gerar_celular.py`.
- [ ] **Passo 3:** commit com a mensagem "README: MLB, NHL, copas e Eredivisie".
