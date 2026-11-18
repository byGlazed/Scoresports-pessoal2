# Partes F e H: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** e-sports (CS2, Valorant e LoL) pela PandaScore grátis, por meio do repasse da Cloudflare. Também o campinho com notas no futebol e a nota com a visão "os dois times" no box score da NBA.

**Architecture:**
- As regras puras ficam em arquivos `*_regras.js` em `static/`, sem DOM, exportadas por `module.exports` e testadas com `node --test`. É o padrão de `chave_regras.js`.
- As telas ficam em arquivos de tela, com o `h()` de `app.js`.
- Os dados do celular são rotas novas em `celular/direto.js`.
- O repasse da Cloudflare ganha o caminho `/pandascore/`, com a chave guardada como segredo do worker.

**Tech Stack:** HTML, CSS e JS puros, Node 18+ (`node --test`), Python 3.10+ (`unittest`) e Cloudflare Workers (módulo ES).

**Spec:** `planejamento/2026-11-18-parteF-esports-e-parteH-campinho.md`

## Global Constraints

- **Sem chave no código:** a chave da PandaScore nunca aparece em arquivo do repositório, no APK, numa resposta do repasse nem no chat. Ela só existe como `env.PANDASCORE_TOKEN` no worker, colada pelo dono.
- **Sem APK novo:** nada em `android/` muda.
- **E-sports só no app e em `docs/`:** a rota `/esportes` do PC (`api.py`) não ganha e-sports, então o chip some sozinho no PC.
- **Formato e texto da nota:**
  - uma casa decimal e média do time com duas, com ponto como no print: "7.4" e "7.40";
  - escala de 3,0 a 10,0;
  - faixas: < 6,0 vermelho; 6,0 a 6,4 laranja; 6,5 a 6,9 amarelo; 7,0 a 7,9 verde; 8,0 a 8,9 verde-azulado; ≥ 9,0 azul;
  - texto do ⓘ, exato: "Nota do Scoresports, calculada pelo app a partir das estatísticas do jogo. Não é a nota do Sofascore."
- **Atualização ao vivo:** e-sports a cada 30 s (só `running`); futebol e NBA a cada 20 s, como hoje.
- **Quais partidas de e-sports aparecem:** tier `s` ou `a`; ou algum time com `location` "BR"; ou algum time favorito.
- **Aparência e destino:**
  - tema claro e escuro;
  - alvos de toque de 44 px;
  - nenhuma rolagem lateral da página inteira em 375 px;
  - tudo na branch `main` (pedido do dono).
- **Commits:** em português e **sem nenhuma linha de coautor ou menção a Claude** (pedido do dono, desde a parte D).
- **Telas novas:** toda tela nova entra em três lugares:
  - `static/index.html` (tag `<script>`);
  - `TELAS` em `gerar_celular.py`;
  - `ARQUIVOS` em `celular/sw.js`.

## Review Focus

1. **Partida de e-sports com time "A definir"** (`opponents` com 0 ou 1 item, comum nas chaves): a linha e a página mostram "A definir" no lugar do time, sem quebrar. O teste fica na Tarefa 8.
2. **Partida cancelada, adiada ou por W.O.** (`status` "canceled", "postponed" ou `forfeit`): mostra o texto do estado, sem bolinhas nem mapas inventados. O teste fica na Tarefa 8.
3. **Escalação antes do jogo ou ao vivo,** com estatísticas vazias ou nulas: sem `NaN`. Antes do jogo, nenhuma nota; ao vivo, os minutos vêm do relógio. Os testes ficam nas Tarefas 2 e 3.
4. **Jogador da NBA que não jogou ou com "--"** nos números: sem nota, e a ordenação pela nota põe esses por último. O teste fica na Tarefa 2.
5. **Repasse com problema** (sem endereço, 401/403, 429 ou fora do ar): o erro fica só no chip E-sports, e "Todos" continua mostrando os outros esportes. Os testes ficam nas Tarefas 1 e 9.

---

### Task 1: Repasse com o caminho `/pandascore/`

**Files:**
- Modify: `repasse_cloudflare.js` (o arquivo inteiro: cabeçalho com o passo a passo e o `fetch` novo)
- Test: `testes/repasse.test.js`
- Commit também: `planejamento/2026-11-18-parteF-esports-e-parteH-campinho.md` e este plano

**Interfaces:**
- **Produz:**
  - `export default { fetch(pedido, env) }`;
  - `export function ttlPandascore(caminho: string): number` (segundos);
  - `export const CAMINHOS_PANDASCORE: RegExp`.
- **O que o app chama:**
  - `GET {repasse}/pandascore/{caminho}?{query}`, que vai para `https://api.pandascore.co/{caminho}?{query}`;
  - `GET {repasse}/?url=...`, que continua igual ao de hoje.

- [ ] **Step 1: Commitar o desenho e o plano**

```bash
git add planejamento/2026-11-18-parteF-esports-e-parteH-campinho.md planejamento/2026-11-18-parteF-parteH-plano.md
git commit -m "Desenho e plano das partes F (e-sports) e H (campinho e notas)"
```

- [ ] **Step 2: Escrever os testes**

O worker é um módulo ES. O teste carrega o arquivo por `import("data:text/javascript," + encodeURIComponent(fonte))` e troca `globalThis.fetch` por um falso que guarda os pedidos.

`testes/repasse.test.js`:
- `"?url= da ESPN continua igual"`: `fetch` foi chamado com o endereço da ESPN, e a resposta tem `Access-Control-Allow-Origin: *`.
- `"/pandascore/ pede com a chave do segredo"`:
  - pedido: `https://x.workers.dev/pandascore/csgo/matches/running?per_page=50` com `env = { PANDASCORE_TOKEN: "TESTE" }`;
  - o falso recebeu `https://api.pandascore.co/csgo/matches/running?per_page=50`, com `Authorization: Bearer TESTE`;
  - a resposta tem `Access-Control-Allow-Origin: *` e `content-type` JSON;
  - nenhum cabeçalho da resposta contém "TESTE".
- `"caminho fora da lista é recusado"`: `/pandascore/users`, `/pandascore/../x` e `/pandascore/` dão 400, sem chamar o `fetch`.
- `"só GET"`: POST dá 405, e OPTIONS dá 204 com os cabeçalhos CORS.
- `"sem segredo"`: sem `env.PANDASCORE_TOKEN` dá 500, com o corpo `"Falta o segredo PANDASCORE_TOKEN no worker."`
- `"memória curta"`: dois pedidos iguais a `.../running` seguidos chamam o falso uma vez só. Um 401 ou 429 da PandaScore passa com o mesmo status e não é guardado (o segundo pedido chama de novo).
- `"tempos"`:
  - `ttlPandascore("csgo/matches/running") === 30`;
  - `ttlPandascore("lol/matches/past") === 3600`;
  - `ttlPandascore("teams/123") === 86400`;
  - `ttlPandascore("players/9") === 86400`;
  - `ttlPandascore("valorant/matches/upcoming") === 120`;
  - `ttlPandascore("csgo/matches") === 120`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test testes/repasse.test.js`. Expected: FAIL (`ttlPandascore` não existe).

- [ ] **Step 4: Implementar no `repasse_cloudflare.js`**

- **Lista de caminhos:** `CAMINHOS_PANDASCORE = /^(csgo|valorant|lol)\/[a-z0-9_\/-]*$|^(matches|teams|players|tournaments|leagues|series)(\/[a-z0-9_-]+)*$/`. A recusa de `..` vem disso.
- **Memória:** um `Map` global (chave = caminho + query, valor = `{ ate, corpo, status }`) com até 200 itens. O mais velho sai primeiro.
- **Resposta:** só `content-type`, `Access-Control-Allow-Origin: *` e `Cache-Control: public, max-age=<ttl>`.
- **Cabeçalho do arquivo:** o passo a passo do desenho (Workers & Pages → worker → Edit code → colar → Deploy; Settings → Variables and Secrets → Add → **Secret**, `PANDASCORE_TOKEN`; Deploy). Também explica que o `?url=` e o `?repasse=` continuam valendo.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test testes/*.test.js`. Expected: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add repasse_cloudflare.js testes/repasse.test.js
git commit -m "Repasse: caminho /pandascore/ com a chave como segredo do worker"
```

- [ ] **Step 7: Pedir ao dono**

O dono cola o arquivo no worker, cria o segredo `PANDASCORE_TOKEN` e manda o endereço `https://….workers.dev`. As Tarefas 2 a 6 não dependem disso. A Tarefa 7 depende.

---

### Task 2: Regras da nota

**Files:**
- Create: `static/notas_regras.js`
- Create: `testes/amostras/espn_nba_jogo_print.json` (o `summary` do evento `401910006`, só `boxscore.players`)
- Modify: `static/nba_quadra.js` (`linhaBox`: mais `oreb: numeroBox(v.OREB)` e `dreb: numeroBox(v.DREB)`)
- Test: `testes/notas.test.js`

**Interfaces:**
- **Produz o objeto `Notas`:**
  - `FAIXAS: [number, string][]` (do maior para o menor: `[9,"azul"]`, `[8,"verde-azulado"]`, `[7,"verde"]`, `[6.5,"amarelo"]`, `[6,"laranja"]`, `[-Infinity,"vermelho"]`);
  - `corDaNota(n: number|null): string|null`;
  - `formatar(n: number|null, casas = 1): string` (`"7.4"`, ou `"–"` para null);
  - `TEXTO_INFO: string` (a frase exata das Global Constraints);
  - `gameScore(l): number`, com `l` no formato de `linhaBox`: `{ pts, fg:{f,t}, ft:{f,t}, oreb, dreb, ast, stl, blk, pf, to }`; números nulos contam como 0;
  - `notaNba(l): number|null`: null se `l.minutos` for null ou menor que 5. Senão, arredonda a uma casa `5.85 + 0.1 × gameScore`, limitado entre 3 e 10. O construtor pode ajustar os dois números, desde que os testes passem;
  - `notaFutebol(j, ctx): number|null`:
    - `j = { posicao, minutos, gols, assistencias, chutes_no_gol, faltas_cometidas, faltas_sofridas, amarelos, vermelhos, gols_contra, defesas, gols_sofridos }`;
    - `ctx = { resultado: "vitoria"|"empate"|"derrota", sofridos_do_time: number }`;
    - null se `minutos` for null ou menor que 10;
    - campos ausentes ou nulos contam como 0;
    - o papel vem da `posicao`: "G" é goleiro; começa com CD, CB, LB, RB, SW, LWB, RWB ou D é defensor; o resto é linha;
  - `media(notas: (number|null)[]): number|null` (média dos não nulos, duas casas).
- `module.exports = Notas`.

- [ ] **Step 1: Salvar a amostra**

`curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401910006"`. Guardar só `{ "boxscore": { "players": … } }` em `testes/amostras/espn_nba_jogo_print.json`.

- [ ] **Step 2: Escrever os testes**

`testes/notas.test.js`:
- **`"cores por faixa"`:**
  - `corDaNota(9.4)` dá `"azul"`; `8.4` e `8.0` dão `"verde-azulado"`; `7.0` dá `"verde"`; `6.9` e `6.5` dão `"amarelo"`; `6.4` e `6.0` dão `"laranja"`; `5.9` dá `"vermelho"`; `null` dá `null`;
  - `formatar(7.4)` dá `"7.4"`; `formatar(7.4, 2)` dá `"7.40"`; `formatar(null)` dá `"–"`.
- **`"NBA: as notas do print"`:**
  - carrega a amostra e monta as linhas com `require("../static/nba_quadra.js").boxScoreDoTime`;
  - para cada par a nota fica a no máximo 0,4: Brice Sensabaugh 9.4, Keyonte George 8.4, Brook Lopez 7.5, Rui Hachimura 7.4, Darius Garland 7.3, Mo Bamba 7.5, Josh Okogie 7.2, Keaton Wagler 6.8, Darryn Peterson 6.6, Josh Green 6.3.
- **`"NBA: pouco tempo ou não jogou"`:** `notaNba({ minutos: 4, pts: 10 })` dá `null`; `notaNba({ minutos: null })` dá `null`; `notaNba({ minutos: 10, pts: 0, fg:{f:0,t:4}, to: 2 })` dá `<= 5.8`.
- **`"futebol: âncoras"`** (com `minutos: 90`, salvo outro valor):
  - `{posicao:"CM"}` com `{resultado:"empate", sofridos_do_time:1}`: entre 6.3 e 6.8;
  - `{posicao:"F", gols:1, chutes_no_gol:2}` numa vitória por 1-0: entre 7.4 e 8.2;
  - `{posicao:"F", gols:3, chutes_no_gol:4}` numa vitória: `>= 9.0`;
  - `{posicao:"CM", minutos:60, vermelhos:1}` num empate: `<= 5.5`;
  - `{posicao:"G", defesas:5, gols_sofridos:3}` numa derrota por 3: entre 5.8 e 6.8.
- **`"futebol: sem números não dá NaN"`:**
  - `notaFutebol({ posicao: "CD", minutos: 90 }, { resultado: "empate", sofridos_do_time: 0 })` é um número finito;
  - `notaFutebol({ posicao: "F", minutos: 9 }, …)` dá `null`;
  - `notaFutebol({ posicao: "F", minutos: null }, …)` dá `null`.
- **`"média do time"`:** `media([7.8, 6.7, null, 6.5])` dá `7.0`, e `media([])` dá `null`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test testes/notas.test.js`. Expected: FAIL (o módulo não existe).

- [ ] **Step 4: Implementar `static/notas_regras.js` e os campos novos em `linhaBox`**

Os pesos do futebol ficam com o construtor (a lista do que soma e do que tira está no desenho). Limite entre 3 e 10, uma casa.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test testes/*.test.js`. Expected: todos PASS, inclusive o `nba_quadra.test.js` de antes.

- [ ] **Step 6: Commit**

```bash
git add static/notas_regras.js static/nba_quadra.js testes/notas.test.js testes/amostras/espn_nba_jogo_print.json
git commit -m "Regras da nota do Scoresports (futebol e NBA), calibrada no jogo do print"
```

---

### Task 3: Regras do campinho

**Files:**
- Create: `static/campinho_regras.js`
- Create: `testes/amostras/espn_formacoes.json` (`{ "<formação>": [{ "lugar": n, "posicao": "CD-L" }, …11] }`, de escalações reais)
- Create: `testes/amostras/espn_futebol_resumo.json` (o `summary` do evento `401879243`: `rosters`, `keyEvents`, `header`)
- Test: `testes/campinho.test.js`

**Interfaces:**
- **Produz o objeto `Campinho`:**
  - `LINHAS: { [formacao: string]: number[][] }`: as linhas do goleiro ao ataque, cada uma com os `lugar` (formationPlace) da esquerda para a direita **do time**;
  - `posicoes(formacao: string, titulares: {lugar:number}[]): {jogador, linha:number, x:number, y:number}[] | null`:
    - `x` e `y` vão de 0 a 1, na tela;
    - `x` é espelhado: a esquerda do time fica à direita da tela;
    - `y` cresce do goleiro (em cima) ao ataque;
    - devolve null se a formação não estiver em `LINHAS`, se não houver 11 titulares ou se algum `lugar` não estiver na tabela;
  - `minutoDoTexto(texto): number|null`: `"67'"` dá 67, `"90'+3'"` dá 93, `"45'+2'"` dá 47, `""` e `null` dão null;
  - `substituicoes(keyEvents): { [atletaId: string]: { entrou_aos?: number, saiu_aos?: number } }`: nos eventos de substituição, `participants[0]` entra e `participants[1]` sai. Conferir na amostra;
  - `minutosJogados({titular, entrou_aos, saiu_aos}, minutoFinal: number|null): number|null`:
    - titular: `(saiu_aos ?? minutoFinal)`;
    - reserva que entrou: `(saiu_aos ?? minutoFinal) - entrou_aos`;
    - reserva que não entrou, ou `minutoFinal` null: null.
- `module.exports = Campinho`.
- **Tabela inicial `LINHAS`,** dos jogos reais de 18/11/2026. O construtor confere com as amostras e acrescenta 4-1-4-1, 4-4-1-1 e 5-3-2 (e outras que aparecerem), cada uma só com amostra real:

| Formação | Linhas (esquerda → direita do time) |
|---|---|
| 3-4-1-2 | [1] [4,5,6] [3,8,7,2] [9] [11,10] |
| 3-4-2-1 | [1] [4,5,6] [3,8,7,2] [11,10] [9] |
| 3-4-3 | [1] [4,5,6] [3,8,7,2] [11,9,10] |
| 3-5-2 | [1] [4,5,6] [3,8,11,7,2] [9,10] |
| 4-1-3-2 | [1] [3,6,5,2] [4] [11,8,7] [10,9] |
| 4-2-3-1 | [1] [3,6,5,2] [4,8] [11,10,7] [9] |
| 4-3-3 | [1] [3,6,5,2] [8,4,7] [11,9,10] |
| 4-4-2 | [1] [3,6,5,2] [11,8,4,7] [9,10] |
| 5-4-1 | [1] [3,4,5,6,2] [11,10,8,7] [9] |

- [ ] **Step 1: Salvar as amostras**

Um script descartável no scratchpad percorre os scoreboards da ESPN (eng.1, esp.1, ita.1, ger.1, bra.1, fra.1, por.1, ned.1; últimas 4 semanas). Ele guarda uma escalação por formação em `espn_formacoes.json` e o `summary` do evento `401879243` em `espn_futebol_resumo.json`.

- [ ] **Step 2: Escrever os testes**

`testes/campinho.test.js`:
- **`"cada formação da amostra tem linhas certas"`:** para cada formação de `espn_formacoes.json` que está em `LINHAS`:
  - `posicoes` não é null;
  - há `formacao.split("-").length + 1` linhas;
  - quem tem `posicao` "G" tem o menor `y`;
  - o `y` cresce com a linha.
- **`"lado espelhado como no print"`:** para cada jogador da amostra:
  - posição terminada em `-L` ou que começa com `L` (LB, LM, LF, LWB) tem `x > 0.5`;
  - terminada em `-R` ou que começa com `R` tem `x < 0.5`.
- **`"formação desconhecida ou incompleta"`:** `posicoes("4-6-0", onze)` dá `null`; `posicoes("4-4-2", dez)` dá `null`.
- **`"minutos"`:**
  - `minutoDoTexto("90'+3'")` dá 93;
  - `minutosJogados({titular:true, saiu_aos:67}, 90)` dá 67;
  - `minutosJogados({titular:false, entrou_aos:80}, 90)` dá 10;
  - `minutosJogados({titular:false}, 90)` dá null;
  - `minutosJogados({titular:true}, null)` dá null.
- **`"substituições da amostra"`:** em `espn_futebol_resumo.json`, Quinten Timber (titular com `subbedOut`) tem `saiu_aos` numérico. Quem entrou no lugar dele tem `entrou_aos` igual a esse minuto.

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test testes/campinho.test.js`. Expected: FAIL.

- [ ] **Step 4: Implementar `static/campinho_regras.js`**

O `x` de quem está na posição `i` (de `n`) na linha é `1 - (i + 0.5) / n`. O `y` sai de `linha / (total - 1)`, entre 0,08 e 0,90.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test testes/*.test.js`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add static/campinho_regras.js testes/campinho.test.js testes/amostras/espn_formacoes.json testes/amostras/espn_futebol_resumo.json
git commit -m "Regras do campinho: linhas por formação, lado espelhado e minutos jogados"
```

---

### Task 4: Dados da escalação (celular e PC)

**Files:**
- Modify: `celular/direto.js` (`escalacoes(dados)`, perto da linha 803)
- Modify: `espn_dados.py` (`_escalacoes` e `_jogador_escalacao`, perto da linha 682)
- Test: `testes/espn_escalacoes_teste.py`

**Interfaces:**
- **Consome:** `Campinho.substituicoes`, da Tarefa 3, só no `direto.js`. O Python tem a sua cópia de `minuto_do_texto`.
- **Produz:** cada jogador de `escalacoes[].titulares/reservas` ganha os campos abaixo, nos dois lados. Os nomes são exatamente estes:
  - `lugar` (int ou null);
  - `foto` (`athlete.headshot.href` ou null);
  - `entrou_aos` e `saiu_aos` (int ou null);
  - `chutes_no_gol` (SOG);
  - `faltas_cometidas` (FC);
  - `faltas_sofridas` (FA);
  - `gols_contra` (OG);
  - `defesas` (SV);
  - `gols_sofridos` (GA).

  `gols`, `assistencias`, `amarelos` e `vermelhos` continuam, agora como número. Cada `escalacoes[]` ganha `gols_pro` e `gols_contra_time` (o placar do time e o do adversário, do `header`).

- [ ] **Step 1: Escrever o teste em Python**

`testes/espn_escalacoes_teste.py` (unittest, no padrão de `robo_campeoes_teste.py`), sobre `espn_futebol_resumo.json`:
- o Crystal Palace tem `formacao == "3-4-2-1"` e 11 titulares com `lugar` de 1 a 11;
- Dean Henderson tem `defesas == 5` e `gols_sofridos == 3`;
- Quinten Timber tem `saiu_aos` inteiro;
- `gols_pro == 1` e `gols_contra_time == 3`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `python -m unittest discover -s testes -p "*_teste.py"`. Expected: FAIL no teste novo.

- [ ] **Step 3: Implementar em `espn_dados.py` e espelhar em `celular/direto.js`**

O `direto.js` não roda no Node. Os nomes dos campos têm de ser os mesmos do Python, conferidos a olho no Step 4.

- [ ] **Step 4: Rodar e ver passar; conferir o celular**

- Run: `python -m unittest discover -s testes -p "*_teste.py"` e `node --test testes/*.test.js`. Expected: PASS.
- No navegador, com `docs/` gerado (`python gerar_celular.py`), abrir o jogo `401879243` (eng.1). Num `console.log` temporário de `api(...)`, conferir que os campos novos aparecem. Tirar o log antes de commitar.

- [ ] **Step 5: Commit**

```bash
git add espn_dados.py celular/direto.js testes/espn_escalacoes_teste.py
git commit -m "Escalação com lugar no campo, minutos e números para a nota (celular e PC)"
```

---

### Task 5: Tela do campinho

**Files:**
- Create: `static/campinho.js`
- Modify:
  - `static/app.js` (helpers `seloNota` e `botaoInfoNota`, perto de `botaoFavorito`, linha 253);
  - `static/esportes.js` (`conteudoAba`, linha 879: a aba "escalacoes" chama `campinhoFutebol`; `escalacoesFutebol` fica como a lista de reserva);
  - `static/style.css`;
  - `static/index.html`;
  - `gerar_celular.py` (`TELAS`);
  - `celular/sw.js` (`ARQUIVOS`).

**Interfaces:**
- **Consome:** `Notas.notaFutebol`, `Notas.media`, `Notas.corDaNota`, `Notas.formatar`, `Notas.TEXTO_INFO`, `Campinho.posicoes` e `Campinho.minutosJogados` (Tarefas 2 e 3), mais os campos da Tarefa 4.
- **Produz:**
  - `seloNota(n: number|null, casas = 1): Node`: `<span class="selo-nota nota-{cor}">` com o texto formatado, ou nada para null;
  - `botaoInfoNota(): Node`: um botão ⓘ que mostra e esconde `Notas.TEXTO_INFO`;
  - `campinhoFutebol(esp, liga, escalacoes, jogo): Node[]`.
- **Ordem dos `<script>` no `index.html`:** `notas_regras.js` e `campinho_regras.js` logo depois de `nba_quadra.js`; `campinho.js` depois de `esportes.js`.

- [ ] **Step 1: Implementar `campinhoFutebol`**

- `minutoFinal = jogo.estado === 3 ? 90 : jogo.estado === 2 ? Campinho.minutoDoTexto(jogo.relogio) : null`.
- `resultado` vem de `gols_pro` e `gols_contra_time`. No ao vivo, o resultado parcial.
- Para cada time, o mandante primeiro:
  - **cartão com cabeçalho:** escudo, nome, `seloNota(media, 2)`, `botaoInfoNota()` e a formação;
  - **campo em CSS:** as linhas e a área desenhadas com bordas; os jogadores em `position:absolute` com `left: x*100%` e `top: y*100%`;
  - **jogador:** foto ou círculo com o número; selo da nota; ícones (⚽ por gol, cartão, ⇄ se saiu); "número nome curto"; o botão abre `abrirAtleta`;
  - **embaixo:** "Reservas" (os que entraram primeiro, com "entrou aos N'", a nota e o selo; depois os outros).
- Se `Campinho.posicoes` der null, usa a lista de hoje (`escalacoesFutebol`).
- Cores: `--nota-vermelho`, `--nota-laranja`, `--nota-amarelo`, `--nota-verde`, `--nota-verde-azulado` e `--nota-azul` em `:root` e no tema escuro. Texto branco ou escuro, o que tiver contraste ≥ 4,5:1 em cada cor.

- [ ] **Step 2: Gerar e conferir no navegador**

- Run: `python gerar_celular.py`, e depois servir `docs/` sem cache.
- Em 375×812, claro e escuro, abrir:
  - Crystal Palace x Liverpool (eng.1, 08/11/2026);
  - um jogo do Brasileirão do dia;
  - um jogo de hoje ainda não começado (campinho sem notas).
- Conferir:
  - o lado espelhado, como no print 2;
  - nenhuma rolagem lateral;
  - a média "7.xx" no cabeçalho;
  - o ⓘ abre o texto.
- No PC (`uvicorn api:app`), o mesmo jogo também mostra o campinho.

- [ ] **Step 3: Rodar os testes**

Run: `node --test testes/*.test.js` e `python -m unittest discover -s testes -p "*_teste.py"`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add static/campinho.js static/app.js static/esportes.js static/style.css static/index.html gerar_celular.py celular/sw.js docs
git commit -m "Escalação no campinho, com nota por jogador e média do time"
```

---

### Task 6: Box score da NBA com nota e "os dois"

**Files:**
- Modify:
  - `static/esportes.js` (`boxScoreNBA`, linha 238, e `COLUNAS_BOX_NBA`);
  - `static/nba_quadra.js` (`ordenarBox`: null sempre por último, nas duas direções);
  - `static/style.css`.
- Test: `testes/nba_quadra.test.js` (um teste novo)

**Interfaces:**
- **Consome:** `Notas.notaNba` e `seloNota`.
- **Produz:**
  - o estado guardado ganha `visao: "ambos" | <time_id>`; o padrão é `"ambos"`;
  - `COLUNAS_BOX_NBA` ganha `["nota", "Nota", "Nota do Scoresports"]` como primeira coluna.

- [ ] **Step 1: Escrever o teste**

`"ordenar pela nota: quem não tem nota fica por último"`: `ordenarBox([{nota:null},{nota:7},{nota:8}], "nota", "desc")` dá as notas `[8,7,null]`, e com `"asc"` dá `[7,8,null]`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/nba_quadra.test.js`. Expected: FAIL (se `ordenarBox` ainda não põe o null no fim nas duas direções; se já põe, o teste fica como proteção).

- [ ] **Step 3: Implementar**

- **Seletor:** três botões (logo do time da esquerda, "Os dois", logo do time da direita).
- **Visão "ambos":** uma tabela só com os jogadores dos dois times. Cada linha tem o logo pequeno do time. Abre ordenada por pontos, a não ser que a pessoa escolha outra coluna. Não tem linha de total; os "Não jogou" vão no fim.
- **Visão de um time:** a de hoje.
- **Coluna Nota:** em todas as linhas, com `seloNota`.
- O `nota` de cada jogador é calculado com `Notas.notaNba(j)` antes de ordenar.

- [ ] **Step 4: Rodar, gerar e conferir**

- Run: `node --test testes/*.test.js` e depois `python gerar_celular.py`.
- No navegador, abrir LAC x UTAH de 17/11/2026 e conferir as notas do print (±0,4) e as três visões.

- [ ] **Step 5: Commit**

```bash
git add static/esportes.js static/nba_quadra.js static/style.css testes/nba_quadra.test.js docs
git commit -m "Box score da NBA: coluna de nota e visão com os dois times"
```

---

### Task 7: Amostras reais da PandaScore (depende do endereço do repasse)

**Files:**
- Create: `testes/amostras/pandascore_cs2_passadas.json`, `pandascore_valorant_passadas.json`, `pandascore_lol_passadas.json`, `pandascore_running.json` (se houver partida ao vivo), `pandascore_time.json` e `pandascore_partida.json`
- Modify: a seção "A conferir com a chave de verdade" do desenho, com o que foi visto

**Interfaces:**
- **Produz:** as amostras que as Tarefas 8 a 10 usam, e as respostas para estas perguntas:
  - `games[]` vem nas listas? Com que campos?
  - o nome do mapa vem?
  - `/matches/{id}` responde no grátis?
  - `/{jogo}/matches?range[begin_at]=…` (sem past/upcoming) responde no grátis?
  - `filter[id]` e `filter[opponent_id]` funcionam?
  - `/matches/running?filter[videogame]=…` aceita os três jogos de uma vez?
  - quais são os valores reais de `tournament.tier`, de `opponent.location` e de `streams_list`?

- [ ] **Step 1: Confirmar o endereço**

Pedir ao dono o endereço do worker, se ele ainda não mandou. Sem ele, parar aqui.

- [ ] **Step 2: Salvar as amostras pelo repasse**

Usar `curl "{repasse}/pandascore/csgo/matches/past?per_page=20&sort=-begin_at"` e equivalentes. Tirar dos JSON qualquer campo que possa ter a chave (não deve haver).

- [ ] **Step 3: Registrar no desenho e commitar**

```bash
git add testes/amostras/pandascore_*.json planejamento/2026-11-18-parteF-esports-e-parteH-campinho.md
git commit -m "Amostras reais da PandaScore grátis e o que ela traz"
```

---

### Task 8: Regras dos e-sports

**Files:**
- Create: `static/esports_regras.js`
- Test: `testes/esports.test.js`

**Interfaces:**
- **Produz o objeto `Esports`:**
  - `JOGOS: { id: "cs2"|"valorant"|"lol", nome: string, sigla: string, caminho: "csgo"|"valorant"|"lol" }[]`, na ordem CS2, Valorant, LoL;
  - `intervaloDoDia(ymd): [string, string]`: o dia de Brasília em UTC. `"2026-11-18"` dá `["2026-11-18T03:00:00Z", "2026-11-19T02:59:59Z"]`;
  - `partida(m, jogoId): Partida`;
  - `entraNoDia(p: Partida, favoritos: Set<string>): boolean`: tier `s`/`a`, ou algum lado com `pais === "BR"`, ou algum `lado.id` em `favoritos`;
  - `grupos(partidas: Partida[]): { chave, jogo, titulo, torneioId, aoVivo, partidas }[]`: ordena com os ao vivo primeiro e depois pela hora da primeira partida. O título é `"CS2 · BLAST Rivals · Group A"`, no formato `sigla · liga · nome da série/torneio`, sem repetir partes iguais;
  - `bolinhas(p: Partida): { esquerda: boolean[], direita: boolean[] } | null`: o tamanho é a quantidade de mapas para vencer (`Math.ceil(melhor_de/2)`). null se `melhor_de` faltar ou se a partida foi cancelada;
  - `transmissoes(streams_list): { nome, url, idioma }[]`: as em português primeiro, depois a oficial (`official`), depois as outras;
  - `elencoLadoALado(jogadoresA, jogadoresB): [a|null, b|null][]`.
- **O formato `Partida`:**
  - `{ id, jogo, inicio, estado, status, melhor_de, torneio: { id, nome, tier, liga, serie, logo }, lados: [Lado, Lado], placar: [number, number], mapas, transmissoes }`;
  - `estado`: 1 a jogar, 2 ao vivo, 3 encerrado ou cancelado;
  - `status`: o texto, um de "A jogar", "Ao vivo", "Encerrado", "Cancelada", "Adiada" ou "W.O.";
  - `Lado`: `{ id, nome, sigla, logo, pais } | { id: null, nome: "A definir" }`;
  - `mapas`: `{ numero, nome|null, vencedor: 0|1|null, duracao_min|null, estado }[]`; fica vazio se a lista não trouxer `games`.

- [ ] **Step 1: Escrever os testes sobre as amostras da Tarefa 7**

`testes/esports.test.js`:
- `"traduz uma partida encerrada"`: a primeira partida encerrada de `pandascore_cs2_passadas.json` tem `estado === 3`, 2 lados com nome, `placar` igual a `results`, `melhor_de` igual a `number_of_games` e `torneio.tier` em "s", "a", "b", "c" ou "d".
- `"intervalo do dia em Brasília"`: o exemplo das Interfaces.
- `"filtro do dia"`:
  - tier "a" entra;
  - tier "c" com um lado `pais "BR"` entra;
  - tier "c" sem BR fica fora, mas entra com o id do lado em `favoritos`.
- `"time a definir"`: `partida({ ...m, opponents: [] })` tem os dois lados `{ id: null, nome: "A definir" }`. Com 1 oponente, o segundo é "A definir".
- `"cancelada e W.O."`:
  - `status: "canceled"` dá `estado 3`, o texto "Cancelada" e `bolinhas === null`;
  - `forfeit: true` dá o texto "W.O.";
  - `status: "postponed"` dá "Adiada".
- `"bolinhas"`: numa MD3 2-1, `esquerda` é `[true,true]` e `direita` é `[true,false]`.
- `"grupos"`: duas partidas do mesmo torneio ficam num grupo só, e um grupo com partida ao vivo vem antes.
- `"transmissões"`: com `[{language:"en", official:true}, {language:"pt"}]`, a de "pt" fica primeiro.
- `"mapas"`: se a amostra trouxer `games`, o `vencedor` de cada mapa bate com `winner.id`; senão, `mapas` fica vazio.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test testes/esports.test.js`. Expected: FAIL.

- [ ] **Step 3: Implementar `static/esports_regras.js`**

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test testes/*.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static/esports_regras.js testes/esports.test.js
git commit -m "Regras dos e-sports: partida, filtro do dia, grupos, bolinhas e transmissões"
```

---

### Task 9: Rotas dos e-sports no celular

**Files:**
- Modify: `celular/direto.js` (constante, função de pedido, rotas em `ROTAS` e a entrada em `/esportes`)

**Interfaces:**
- **Consome:** `Esports.*` (Tarefa 8).
- **Produz** (as rotas do `api()` no celular):
  - `/esportes`: inclui `{ id: "esports", nome: "E-sports", tipo: "esports", ligas: Esports.JOGOS.map(j => ({ id: j.id, nome: j.nome })) }`;
  - `/esports/jogos?de=YMD&favoritos=id1,id2&so_favoritos=1`: devolve `Partida[]`, já filtradas por `Esports.entraNoDia`. Com `so_favoritos=1`, só as dos favoritos;
  - `/esports/aovivo`: só as `running` dos três jogos, `Partida[]`;
  - `/esports/jogos/:jogo/:id`: devolve `{ partida: Partida, elencos: [Jogador[], Jogador[]] }`, com `Jogador = { id, nick, nome, foto, pais }`;
  - `/esports/times/:jogo/:id`: devolve `{ time: { id, nome, sigla, logo, pais, jogo }, elenco: Jogador[], ultimas: Partida[], proximas: Partida[] }`;
  - `const REPASSE_ESPORTS`: o endereço que o dono mandar, sem barra no fim. Pode ser trocado por `localStorage["ss:esports"]`;
  - `class ErroEsports extends Error`, com as mensagens:
    - sem endereço: "O repasse dos e-sports não está configurado.";
    - 401/403: "A chave da PandaScore no repasse está errada ou faltando.";
    - 429: "Limite da PandaScore atingido. Volte em alguns minutos.";
    - rede: "Não foi possível falar com o repasse dos e-sports agora."

- [ ] **Step 1: Implementar**

- **De onde vêm as listas do dia:** pela forma que a Tarefa 7 mostrou que funciona no grátis. A preferida é `/{caminho}/matches?range[begin_at]=…&per_page=100`. Se não funcionar, `past`, `running` e `upcoming`, cada uma com `range[begin_at]`.
- **Cache:** as listas e as partidas entram no banco do celular com `obter()`. TTL: hoje 30 s, passado 1 h, futuro 2 min. Times: 1 dia.
- **Partida:** `/matches/{id}` se a Tarefa 7 mostrou que funciona. Senão, `filter[id]`.
- **Elencos:** vêm de `/teams/{id}`.

- [ ] **Step 2: Conferir no navegador**

Gerar `docs/` e chamar no console:
- `api("/esports/jogos?de=<hoje>")`;
- `api("/esports/aovivo")`;
- `api("/esports/jogos/cs2/<id>")`;
- `api("/esports/times/cs2/<id da FURIA>")`.

Com `localStorage["ss:esports"]="https://invalido.example"`, o erro de rede aparece com a mensagem certa. Depois, tirar a chave de teste do `localStorage`.

- [ ] **Step 3: Commit**

```bash
git add celular/direto.js
git commit -m "Rotas dos e-sports no celular, pelo repasse da PandaScore"
```

---

### Task 10: Telas dos e-sports

**Files:**
- Create: `static/esports.js`
- Modify:
  - `static/rotas.js` (`ORDEM_ESPORTES` e `CHIPS_ESPORTE` com `"esports"`/`"E-sports"` no fim) e `testes/rotas.test.js`, se ele conferir essas listas;
  - `static/navegacao.js`: `desenharChipJogos` (linha ~476), `gruposDoEsporte` (~510), as páginas `jogo` e `time` (linhas ~290 e ~320) e o `ARTIGO_ESPORTE`;
  - `static/inicio.js`: `NOME_ESPORTE` e os jogos dos favoritos;
  - `static/style.css`, `static/index.html`, `gerar_celular.py`, `celular/sw.js`.

**Interfaces:**
- **Consome:** as rotas da Tarefa 9, `Esports.bolinhas`, `Esports.grupos`, `placarGrande`, `abasDetalhe`, `secao`, `cabecaGrupo`, `botaoFavorito` e `agendar(nome, fn, 30000)`.
- **Produz:**
  - `esportsLista(silencioso): Promise` (o chip);
  - `gruposEsports(data): Promise<Grupo[]>` (no formato de `gruposDoEsporte`, com `esporte: "esports"`);
  - `esportsPartida(jogo, id, silencioso): Promise`;
  - `desenharTimeEsports(corpo, ativo, jogo, id, nome): Promise`;
  - `linhaPartidaEsports(p: Partida): Node`.
- **Favorito de time:** `{ tipo: "time", esporte: "esports", liga: jogo, id, nome, logo }`.
- **Endereços:** `#/jogo/esports/{jogo}/{id}` e `#/time/esports/{jogo}/{id}`. O `aoTocarTitulo` da página `jogo` não faz nada nos e-sports.

- [ ] **Step 1: Implementar**

Seguir o desenho, itens 3 a 6 da parte F.
- **Linha da partida:** logo e nome de cada lado, o placar da série, o estado ou a hora, e o "MD3".
- **Página da partida:** abas Detalhes e Elencos. Os cartões de mapa não abrem nada. Sem mapas, o aviso exato: "Os mapas desta partida não vêm na versão grátis dos dados."
- **Atualização ao vivo:** com uma partida ao vivo na tela, `agendar(..., 30000)` chama `/esports/aovivo`.
- **Erros:**
  - o `ErroEsports` aparece só no chip ou no grupo dos e-sports, com "Tentar de novo";
  - em "Todos", a falha vira o aviso do esporte (o `avisoEsporte` de hoje), e os outros esportes continuam.
- **Favoritos:** a aba Favoritos chama `/esports/jogos?de=…&favoritos=…&so_favoritos=1`.

- [ ] **Step 2: Rodar os testes**

Run: `node --test testes/*.test.js`. Expected: PASS.

- [ ] **Step 3: Gerar e conferir no navegador (375×812, claro e escuro)**

- Run: `python gerar_celular.py`.
- **Conferir:**
  - o chip E-sports com as partidas de hoje agrupadas;
  - "Todos" com o grupo dos e-sports;
  - a página de uma partida encerrada de CS2 (bolinhas, mapas ou o aviso, elencos e onde assistir);
  - uma partida de LoL;
  - a página da FURIA (elenco, partidas e estrela);
  - a FURIA favoritada aparecendo em Favoritos;
  - nenhuma rolagem lateral.
- **Teste de erro:** com `ss:esports` inválido, só o chip E-sports mostra o erro, e "Todos" carrega o resto.
- **PC:** com `uvicorn api:app`, o chip E-sports não aparece.

- [ ] **Step 4: Commit**

```bash
git add static/esports.js static/rotas.js static/navegacao.js static/inicio.js static/style.css static/index.html gerar_celular.py celular/sw.js testes/rotas.test.js docs
git commit -m "Aba E-sports: lista do dia, página da partida e do time, favoritos"
```

---

### Task 11: README, conferência final e push

**Files:**
- Modify: `README.md`, com as seções:
  - **E-sports:** o que aparece e o que fica de fora no grátis (mapas e KDA), e o GRID;
  - **Nota do Scoresports e campinho;**
  - **Repasse:** o caminho `/pandascore/`, com o passo a passo do segredo;
  - **Estrutura:** os arquivos novos.

- [ ] **Step 1: Escrever o README**

- [ ] **Step 2: Rodar tudo**

Run: `node --test testes/*.test.js` e `python -m unittest discover -s testes -p "*_teste.py"`. Expected: tudo PASS.

- [ ] **Step 3: Conferir que a chave não está em nenhum lugar**

Run: `git grep -n -i "PANDASCORE_TOKEN"`. Expected: só `repasse_cloudflare.js`, `README.md`, os testes e o plano. Nenhum valor de chave.

- [ ] **Step 4: Gerar, commitar e enviar**

```bash
python gerar_celular.py
git add README.md docs
git commit -m "Partes F e H: README e versão do celular"
git push origin main
```

- [ ] **Step 5: Conferir o Pages e o Actions**

O Actions "Gerar APK" fica verde, e `https://byglazed.github.io/Scoresports-pessoal2/` abre com o chip E-sports.
