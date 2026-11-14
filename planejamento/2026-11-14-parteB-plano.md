# Parte B (navegação no estilo Sofascore): plano de implementação

> **Para quem for executar:** use superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o andamento.

**Objetivo:** trocar a moldura do app (barra de cima, barra lateral, três colunas e painel sobreposto) por uma barra de baixo (Jogos, Favoritos, Pesquisa), uma tela inicial só de jogos com chips de esporte e páginas com voltar (partida, time, liga, atleta, boxeador, evento).

**Arquitetura:**
- **Regras puras** em `static/rotas.js`, com testes: endereços, pilhas por aba, regra do voltar e ordem dos grupos.
- **Navegação** em `static/navegacao.js`: as pilhas na tela, o `history` e a moldura.
- **Desenhos atuais aproveitados:** eles escrevem em `lista()` e `detalhe()` e abrem coisas com `Painel.abrir` e `Painel.empilhar`. O plano faz `lista()` e `detalhe()` devolverem o corpo da página do topo, e o `Painel` empilhar páginas. Assim os desenhos funcionam dentro das páginas sem reescrita.

**Tecnologia:** JavaScript puro, CSS e Node 24 para os testes.

**Spec:** `planejamento/2026-11-14-parteB-navegacao.md`

## Regras globais

- **Tecnologia:** JavaScript puro, sem dependências, em scripts comuns com um só escopo global. Antes de criar um nome no topo de um arquivo, conferir com `grep -w` em `static/*.js` e `celular/*.js`.
- **Onde fica:** as telas ficam em `static/`. Arquivo novo de tela entra em `TELAS` do `gerar_celular.py`, em `ARQUIVOS` do `celular/sw.js` e em `static/index.html`.
- **Gerar e commitar:** depois de mudar `static/` ou `celular/`, rodar `python gerar_celular.py` e fazer o commit junto com o `docs/`.
- **Testes:** `node --test testes/*.test.js`, tudo verde ao fim de cada tarefa.
- **Barra de baixo:** Jogos, Favoritos e Pesquisa.
- **Chips, nesta ordem:** Todos, Futebol, NBA, NFL, MLB, NHL, F1, UFC, Boxe.
- **Toques e coluna:** alvos de toque de pelo menos 44 px; no PC, coluna centralizada de no máximo 600 px.
- **Endereços:**
  - `#/jogos`, `#/favoritos` e `#/pesquisa`;
  - `#/liga/<esporte>/<liga>/<aba>`;
  - `#/jogo/<esporte>/<liga>/<id>`;
  - `#/time/<esporte>/<liga>/<id>`;
  - `#/atleta/<esporte>/<liga>/<id>`;
  - `#/boxeador/<nome>`;
  - `#/evento/<esporte>/<liga>/<id>`.
  
  Os segmentos são codificados com `encodeURIComponent`.
- **Voltar, por aba:**
  - em página interna, desempilha;
  - na raiz de Favoritos ou de Pesquisa, vai para Jogos;
  - na raiz de Jogos, o app sai no Android e não faz nada no navegador.
- **Nada se perde:** nenhuma função que existe hoje pode sumir. A lista está nos anti-objetivos da spec.
- **Conferência no navegador:** servir `docs/` sem cache, em 375×812. Antes de cada rodada, apagar o service worker, os caches e o IndexedDB.

## Pontos de atenção na revisão

1. **Abrir um endereço interno direto ou recarregar numa página interna** (`#/jogo/...` sem passar pela lista): a página abre e o voltar leva à raiz de Jogos. Teste na Tarefa 1 (`pilhasDeEndereco`) e conferência na Tarefa 5.
2. **Jogo ao vivo:** a atualização a cada 20 s para quando a página da partida sai do topo (outra página empilhada, troca de aba ou voltar). Conferência na Tarefa 5, olhando `S.timers`.
3. **Um esporte que falha na lista "Todos":** os outros aparecem e há um aviso só para o que falhou. Teste na Tarefa 1 (`ordenarGrupos` com grupo de erro) e conferência na Tarefa 3, forçando o erro de uma rota.
4. **Botão voltar do Android:** o app sai só na raiz de Jogos, e o `voltarAndroid` nunca devolve `false` fora dela. Teste na Tarefa 1 (`acaoVoltar`) e conferência na Tarefa 2, chamando `voltarAndroid()` no navegador.
5. **Site do PC pelo `uvicorn`:** a NBA (módulo próprio) aparece no chip NBA e na liga NBA, com MVP e calouro e Jogadores, e o jogo e o jogador da NBA abrem as telas próprias. Conferência na Tarefa 4.

---

### Tarefa 1: regras puras da navegação (`static/rotas.js`)

**Arquivos:**
- Criar: `static/rotas.js`, `testes/rotas.test.js`.
- Modificar: `static/index.html`, `gerar_celular.py` (`TELAS`, antes de `app.js`) e `celular/sw.js`.

**Interfaces** (globais no navegador, `module.exports` no Node):
- `lerEndereco(hash: string) -> {tipo, params}`.
  - `tipo` é um de `"jogos" | "favoritos" | "pesquisa" | "liga" | "jogo" | "time" | "atleta" | "boxeador" | "evento"`.
  - `params` traz `{esporte, liga, id, aba, nome}` conforme o tipo.
  - Endereço vazio ou desconhecido dá `{tipo: "jogos", params: {}}`.
- `montarEndereco(pagina: {tipo, params}) -> string`, o inverso de `lerEndereco`.
- `ABA_DA_PAGINA`: as raízes. `jogos` → `"jogos"`, `favoritos` → `"favoritos"`, `pesquisa` → `"pesquisa"`. As páginas internas pertencem à aba em que foram abertas.
- `novasPilhas() -> {atual: "jogos", jogos: [raiz], favoritos: [raiz], pesquisa: [raiz]}`, com raiz = `{tipo: <aba>, params: {}}`.
- Funções puras que devolvem `pilhas` novas, sem alterar as recebidas:
  - `empilhar(pilhas, pagina)`;
  - `trocarAba(pilhas, aba)`;
  - `tocarAbaAtiva(pilhas)`, que corta a pilha da aba atual na raiz;
  - `voltar(pilhas)`.
- `acaoVoltar(pilhas) -> "desempilhar" | "irParaJogos" | "sair"`.
- `topo(pilhas) -> pagina`.
- `pilhasDeEndereco(hash) -> pilhas`.
  - Raiz de aba: só ela, com aquela aba atual.
  - Página interna: aba Jogos atual com `[raiz, pagina]`.
- `ordenarGrupos(grupos: [{chave, esporte, ordem, aoVivo, erro?}]) -> grupos`. Ordem:
  1. ao vivo primeiro;
  2. depois a posição do esporte em `ORDEM_ESPORTES` (`["futebol","nba","nfl","mlb","nhl","f1","ufc","boxe"]`);
  3. depois `ordem` (a posição da competição no esporte);
  4. empate mantém a ordem recebida.
  
  Grupos com `erro` seguem a mesma regra.
- `ORDEM_ESPORTES`, `CHIPS_ESPORTE` = `[["todos","Todos"],["futebol","Futebol"],["nba","NBA"],["nfl","NFL"],["mlb","MLB"],["nhl","NHL"],["f1","F1"],["ufc","UFC"],["boxe","Boxe"]]`.

**Passos:**

- [ ] **Passo 1: escrever os testes** em `testes/rotas.test.js`:
  - `lerEndereco` e `montarEndereco` vão e voltam para os 10 tipos, inclusive `#/boxeador/Oleksandr%20Usyk` e uma liga com ponto (`eng.fa`). `""` e `"#/qualquer"` dão jogos.
  - Pilhas, na sequência: empilhar liga, empilhar jogo, `trocarAba("favoritos")`, `trocarAba("jogos")`: o topo é o jogo.
  - `tocarAbaAtiva` com a pilha `[raiz, liga, jogo]` deixa `[raiz]`.
  - `acaoVoltar`: com 2 páginas, "desempilhar"; na raiz de favoritos, "irParaJogos"; na raiz de pesquisa, "irParaJogos"; na raiz de jogos, "sair" (ponto de atenção 4).
  - `voltar` na raiz de favoritos dá a aba atual "jogos", com a pilha de jogos intacta.
  - `pilhasDeEndereco("#/jogo/nba/nba/123")`: aba "jogos", pilha `[raiz, jogo]` (ponto de atenção 1). `pilhasDeEndereco("#/favoritos")`: aba "favoritos".
  - `ordenarGrupos`:
    - um grupo de NBA ao vivo vem antes de um grupo de futebol sem jogo ao vivo;
    - sem ao vivo, futebol (ordem 3) vem antes de NBA (ordem 0);
    - entre dois de futebol, vence a menor `ordem`;
    - um grupo com `erro` de NFL fica entre NBA e MLB (ponto de atenção 3);
    - a lista recebida não muda.
- [ ] **Passo 2:** rodar e ver falhar ("Cannot find module").
- [ ] **Passo 3: implementar.** Ligar o arquivo antes de `app.js` em `static/index.html`, `TELAS` e `sw.js`.
- [ ] **Passo 4:** suite verde; `python gerar_celular.py`. Commit: "Regras puras da navegação: endereços, pilhas por aba, voltar e ordem dos grupos".

---

### Tarefa 2: moldura nova (barra de baixo, páginas e voltar)

**Arquivos:**
- Criar: `static/navegacao.js`.
- Modificar:
  - `static/index.html`: o `<body>` inteiro;
  - `static/app.js`: `lista`, `detalhe`, `Painel`, `irPara`, `desenharEsportes`, `desenharLateral`, `abrirLateral`, `mostrarDetalhe`, `voltarParaLista`, `layoutLargo` e `iniciar`;
  - `static/style.css`: moldura nova; apagar `.coluna-lateral`, `.fundo-lateral`, `.esportes`, `.palco` em três colunas e `.painel`;
  - `celular/android.js`;
  - `gerar_celular.py` e `celular/sw.js`, para o arquivo novo.

**`index.html`**, dentro do `<body>`:
- `<div class="app">` com:
  - `<header class="topo-pagina" id="topo-pagina">`: seta de voltar (`#voltar-pagina`), título (`#titulo-pagina`), área de ações (`#acoes-pagina`) e botão de busca;
  - `<main class="pagina" id="pagina" aria-live="polite">`;
  - `<nav class="barra-baixo" id="barra-baixo" aria-label="Seções">`, com 3 botões (`data-aba="jogos|favoritos|pesquisa"`, ícone SVG inline e rótulo, `aria-current` no ativo).
- Sem `#lateral`, `#esportes`, `#lista`, `#detalhe` nem `<dialog>`.

**Interfaces:**
- Consome, da Tarefa 1: tudo de `rotas.js`.
- Produz, em `static/navegacao.js`:
  - `Navegacao.iniciar()`: lê `location.hash` com `pilhasDeEndereco`, ouve `popstate` e os toques na barra de baixo, e desenha o topo.
  - `Navegacao.abrir(pagina)`: empilha e faz `history.pushState`.
  - `Navegacao.trocarAba(aba)`: com `replaceState`; se a aba já está ativa, `tocarAbaAtiva` e rola para o topo.
  - `Navegacao.voltar()`: usa `acaoVoltar`. Em "desempilhar" ou "irParaJogos", atualiza e faz `replaceState`. Em "sair", devolve `false`.
  - `Navegacao.redesenhar()`.
  - `registrarPagina(tipo, {titulo(params) -> string, desenhar(corpo, params, ativo) -> void|Promise})`.
- **A página do topo** é desenhada num `div.corpo-pagina` novo dentro de `#pagina`.
  - Cada página guarda o próprio corpo enquanto está na pilha. Voltar mostra o corpo guardado, sem desenhar de novo, e a rolagem é restaurada.
  - Ao sair do topo, chama `cancelarTudo()` (para os timers do ao vivo; ponto de atenção 2).
  - Ao voltar ao topo, chama `pagina.aoMostrar?.()`, que as páginas com ao vivo usam para reagendar.
- **`app.js` adaptado:**
  - `lista()` e `detalhe()` devolvem o `.corpo-pagina` do topo;
  - `Painel.abrir(titulo, construir)` e `Painel.empilhar(titulo, construir)` chamam `Navegacao.abrir({tipo: "painel", params: {titulo}, construir})`. O tipo "painel" não tem endereço próprio e fica com o endereço da página de baixo;
  - `Painel.fechar()` chama `Navegacao.voltar()` quando o topo é um painel;
  - `$("#painel-titulo")` é trocado por `#titulo-pagina`;
  - `mostrarDetalhe()` e `voltarParaLista()` deixam de existir; quem os chama passa a usar `Navegacao.abrir` (Tarefa 5);
  - `irPara(esporteId, aba)` vira atalho para `Navegacao.abrir({tipo: "liga", params: {esporte, liga: <liga padrão do esporte>, aba}})`;
  - `layoutLargo`, `desenharEsportes`, `desenharLateral`, `abrirLateral` e `redesenharLateral` saem, junto com as chamadas a eles.
- **Páginas registradas nesta tarefa** (as definitivas vêm nas Tarefas 3 a 6):
  - `jogos`: chama `partidasLista(esporteObj("futebol"))` como provisório;
  - `favoritos`: chama `inicioDesenhar(false)`;
  - `pesquisa`: chama `pesquisaDesenhar()`.
- **`celular/android.js`:** `window.voltarAndroid = () => Navegacao.voltar()`, que devolve `false` só em "sair".
- **CSS:**
  - `.app`: coluna com `max-width: 600px; margin: 0 auto; min-height: 100dvh`;
  - `.topo-pagina`: `position: sticky; top: 0`;
  - `.barra-baixo`: `position: fixed; bottom: 0`, largura da `.app`, `padding-bottom: env(safe-area-inset-bottom)`, botões com altura de pelo menos 52 px;
  - `.pagina`: `padding-bottom` igual à altura da barra.

**Passos:**

- [ ] **Passo 1: implementar.** Conferir com grep se sobrou alguma referência a `#lateral`, `#esportes`, `#lista`, `#detalhe`, `#painel-` ou às funções que saíram. `node --check` em `static/*.js` e `celular/*.js`; `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812):
  - as três abas da barra de baixo trocam de tela;
  - abrir um jogo do futebol (provisório) e um time: o voltar volta um por vez;
  - trocar de aba e voltar mantém a pilha;
  - tocar na aba ativa volta à raiz;
  - no console, `voltarAndroid()` devolve `true` até a raiz de Jogos e `false` nela (ponto de atenção 4);
  - recarregar em `#/favoritos` abre Favoritos;
  - console sem erro.
- [ ] **Passo 3:** commit com a mensagem "Moldura nova: barra de baixo, páginas empilhadas por aba e voltar".

---

### Tarefa 3: aba Jogos com "Todos" e chips de esporte

**Arquivos:**
- Modificar: `static/navegacao.js` (página `jogos`), `static/esportes.js` (extrair o desenho de um grupo da lista do dia) e `static/style.css` (chips e cabeçalho do grupo clicável).

**Interfaces:**
- Consome, da Tarefa 1: `CHIPS_ESPORTE` e `ordenarGrupos`.
- Consome, do código atual: as rotas `/e/<esp>/<liga>/jogos?de=&ate=` (futebol com liga `todas`, como `partidasDia` já faz), `/e/<esp>/<liga>/eventos` (F1 e UFC) e `/boxe/eventos`; e `linhaPartida`, `cabecaGrupo`, `barraData`, os filtros (Todos, Ao vivo, Encerrados e Próximos) e `cartaoLuta`.
- Produz:
  - `paginaJogos(corpo, estado)`, com `estado = {chip, data, filtro}`, guardado em `lembrar("jogos:estado")`;
  - `grupoDeJogos(esp, liga, jogos, {aoTocarLiga, aoTocarJogo}) -> Node`, extraído do desenho atual da lista do dia, com o cabeçalho clicável (`aoTocarLiga`) e a estrela da liga.

**Comportamento:**
- **Chip "Todos":**
  - pede os jogos do dia de cada esporte de partidas, em paralelo: futebol `todas`, `nba` `nba`, `nfl` `nfl`, `mlb` `mlb` e `nhl` `nhl`;
  - pede os eventos da F1, do UFC e do boxe que caem no dia;
  - cada esporte que chega vira grupos (uma competição por grupo; os eventos do dia formam um grupo por esporte), com `ordem` igual à posição da liga em `esp.ligas` (no futebol, a ordem das regiões de `ORDEM_GRUPOS` e depois a da liga);
  - a tela é redesenhada com `ordenarGrupos` a cada chegada, para o que chega depois entrar no lugar certo;
  - esporte que falha vira um grupo com `erro` e o aviso "Não foi possível carregar a NBA agora." (com o nome do esporte), com botão "Tentar de novo" (ponto de atenção 3).
- **Chip de esporte de partidas:** só aquele esporte, com a mesma faixa de dias e filtros.
- **Chip F1, UFC ou Boxe:** a lista de eventos atual daquele esporte (`eventosLista` e `boxeLista`).
- **Toques:** no cabeçalho da liga, `Navegacao.abrir({tipo: "liga", params: {esporte, liga, aba: <primeira aba>}})`; no jogo, `Navegacao.abrir({tipo: "jogo", params: {esporte, liga, id}, jogo})`, com o objeto do jogo levado junto, em memória, para abrir sem esperar.
- **Ao vivo:** com algum jogo ao vivo, a lista se atualiza a cada 20 s com `agendar("lista", ...)`, como hoje.
- **No PC** (`esporteObj("nba").tipo === "nba"`): a NBA da lista "Todos" e do chip NBA vem do módulo próprio (`/jogos?data=`, como `nbaDia`), e tocar no jogo abre `#/jogo/nba/nba/<id>` com a tela própria (Tarefa 5).

**Passos:**

- [ ] **Passo 1: implementar.** Depois, `node --check` e `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812, dados reais):
  - "Todos" de hoje mostra grupos de vários esportes, com os ao vivo primeiro;
  - os chips filtram;
  - F1 e UFC mostram os eventos;
  - o filtro "Ao vivo" funciona;
  - a troca de dia funciona;
  - forçar o erro de um esporte (no console, trocar temporariamente `api` para rejeitar `/e/nfl/`) mostra só o aviso dele;
  - tocar no cabeçalho do Brasileirão abre a página da liga (provisória até a Tarefa 4);
  - o chip escolhido fica guardado ao recarregar.
- [ ] **Passo 3:** commit com a mensagem "Aba Jogos: todos os esportes do dia com chips, agrupados por liga".

---

### Tarefa 4: página da liga

**Arquivos:**
- Modificar: `static/navegacao.js` (página `liga`), `static/inicio.js` (`abrirLiga`, cartões de competição da busca e favoritos de liga) e `static/app.js` (abas extras da NBA no PC).

**Interfaces:**
- Produz `registrarPagina("liga", ...)`:
  - **título:** nome da liga;
  - **ações:** `botaoFavorito(favLiga(...))`;
  - **corpo:** as abas (com `abasDetalhe`) e o conteúdo da aba;
  - **endereço:** `#/liga/<esporte>/<liga>/<aba>`. Trocar de aba usa `replaceState`.
- **Abas por esporte**, conforme a tabela da spec: Futebol (classificacao, jogos, lideres "Artilharia e cartões"); NBA, NFL, MLB e NHL (classificacao, jogos, lideres); F1 (calendario, classificacao); UFC (eventos, ranking); Boxe (eventos).
- **Conteúdo de cada aba**, com `lista()` apontando para o corpo da aba:
  - `classificacao` → `classificacaoEspn(esp, liga)`;
  - `lideres` → `lideresEspn(esp, liga)`;
  - `jogos` → a lista do dia daquela competição (`partidasDia(esp)` com `estadoDe(esp.id).liga = liga`);
  - `calendario` e `eventos` → `eventosLista(esp, liga)` ou `boxeLista(esp)`;
  - `ranking` → `rankingUfc(esp, liga)`.
- **No PC, liga `nba`:** abas classificacao (`nbaClassificacao`), jogos (`nbaDia`), lideres (`nbaLideres`), corridas "MVP e calouro" (`nbaCorridas`) e jogadores "Jogadores" (`nbaJogadores`).
- **`abrirLiga(esporte, liga, aba)`** passa a chamar `Navegacao.abrir({tipo: "liga", ...})`. Quem chama hoje: a busca (`cartaoLiga`) e o Início (favoritos de liga).

**Passos:**

- [ ] **Passo 1: implementar.** Depois, `node --check` e `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812):
  - Brasileirão: as três abas e a classificação com os campeões;
  - NBA: os líderes;
  - UFC: o ranking;
  - F1: o calendário;
  - FA Cup: o aviso de sem classificação;
  - a estrela no topo favorita;
  - a busca ("Champions") abre a página da liga;
  - o voltar volta.
- [ ] **Passo 3: conferir o site do PC** (`uvicorn`): a liga NBA tem as 5 abas, inclusive MVP e calouro e Jogadores (ponto de atenção 5).
- [ ] **Passo 4:** commit com a mensagem "Página da liga com classificação, jogos e líderes".

---

### Tarefa 5: partida, time, atleta, boxeador e evento como páginas

**Arquivos:**
- Modificar:
  - `static/esportes.js`: `abrirPartida`, `abrirJogoDoTime`, `partidaDetalhe` (não chama mais `mostrarDetalhe`), `abrirTime`, `abrirAtleta`, `empilharAtleta`, `abrirEvento`, `abrirBoxeador`, `botaoVoltarMobile` e quem chama;
  - `static/app.js`: `nbaAbrirJogo` e `abrirJogadorNBA`, no PC;
  - `static/navegacao.js`: o registro das páginas.

**Interfaces:**
- **Páginas registradas:**
  - `jogo`: params `{esporte, liga, id}`;
    - com o jogo da lista em memória, chama `partidaDetalhe(esporteObj(esporte), liga, jogo, false)`;
    - sem ele (endereço direto), busca `/e/<esporte>/<liga>/jogos/<id>` e usa `r.jogo`;
    - no PC com a NBA própria, chama `nbaAbrirJogo({id})`;
    - `aoMostrar` reagenda o ao vivo.
  - `time`: `desenharTime`, como hoje, com a aba guardada;
  - `atleta`: `desenharAtleta`; o contexto de arremessos vai em memória, como diz a spec;
  - `boxeador`: `desenharBoxeador(corpo, ativo, nome)`;
  - `evento`: o desenho atual de `abrirEvento`.
- **Abrir:** `abrirTime`, `abrirAtleta`, `empilharAtleta`, `abrirBoxeador`, `abrirEvento` e `abrirPartida` passam a chamar `Navegacao.abrir` com o tipo e os params.
- **Título da partida:** liga e rodada. O topo ganha um botão com o nome da liga, que abre a página da liga.
- **Sai:** `botaoVoltarMobile()`, porque o topo da página já tem o voltar.

**Passos:**

- [ ] **Passo 1: implementar.** Depois, `node --check` e `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812):
  - jogo do futebol → time → atleta → voltar, voltar, voltar;
  - na partida da NBA, as abas Jogadores e Arremessos e o atleta pelo box score com "Arremessos no jogo";
  - boxeador pela busca;
  - evento do UFC;
  - recarregar em `#/jogo/futebol/bra.1/<id>` abre a partida, e o voltar vai para Jogos (ponto de atenção 1);
  - jogo ao vivo, se houver: ao empilhar o time, `S.timers` fica sem o timer do detalhe, e ao voltar ele volta (ponto de atenção 2); sem jogo ao vivo, conferir isso numa partida encerrada com `aoMostrar`, registrando no relatório.
- [ ] **Passo 3: conferir o site do PC:** o jogo e o jogador da NBA abrem as telas próprias (ponto de atenção 5).
- [ ] **Passo 4:** commit com a mensagem "Partida, time, atleta, boxeador e evento como páginas com voltar".

---

### Tarefa 6: aba Favoritos com chips, README e conferência final

**Arquivos:**
- Modificar: `static/inicio.js` (`inicioDesenhar` vira o desenho da aba Favoritos; `lateralFavoritos` vira a seção "Seus favoritos" abaixo dos jogos), `static/navegacao.js` e `README.md`.

**Comportamento:**
- **Chips:** iguais aos da aba Jogos, mas só com "Todos" e os esportes em que há favorito.
- **Jogos:** os jogos do dia dos favoritos, com o `grupoDeJogos` da Tarefa 3; os toques abrem a liga ou a partida.
- **"Seus favoritos":** a lista dos favoritos abaixo dos jogos. Tocar abre o time, o atleta ou a liga.
- **Sem favoritos:** o convite atual.

**Passos:**

- [ ] **Passo 1: implementar.** Depois, `node --check` e `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812):
  - favoritar o Flamengo, a NBA e o Usyk;
  - a aba Favoritos mostra os chips Todos, Futebol, NBA e Boxe, e os jogos;
  - "Seus favoritos" abre cada um;
  - sem favoritos, o convite.
- [ ] **Passo 3: README.**
  - Trocar a descrição da "Interface" (três colunas e barra lateral) pela moldura nova: barra de baixo, chips, páginas com voltar.
  - Acrescentar `static/rotas.js` e `static/navegacao.js` na árvore.
  - Corrigir a árvore: `busca_regras.js` e `nba_quadra.js` ficam em `static/`.
- [ ] **Passo 4: conferência final.**
  - `node --test` verde e `node --check` em tudo.
  - **375×812, claro e escuro:** percorrer as três abas, uma liga de cada tipo, uma partida de cada esporte, time, atleta e boxeador.
  - **PC (`uvicorn`), largura de desktop:** a coluna centralizada e a NBA própria.
  - Console sem erro.
- [ ] **Passo 5:** commit com a mensagem "Aba Favoritos com chips; README da navegação nova".
