# Scoresports

App pessoal de placares, feito para treinar programação. Cobre NBA, futebol, NFL, Fórmula 1, UFC e boxe, com horários no fuso de Brasília e a informação de onde cada jogo passa no Brasil.

> Projeto de estudo, para uso pessoal. Não é afiliado à NBA, à ESPN nem a nenhuma liga, e não tem fins comerciais.

## Funcionalidades

### Interface
- Três colunas, no estilo do Sofascore e do Flashscore: **barra lateral** com as seções do esporte e as competições agrupadas (Brasil, América do Sul, Europa, Seleções), **lista de jogos** e **detalhe** do jogo escolhido.
- **Faixa de dias** com ontem, hoje e amanhã, setas e calendário. Na NBA e numa competição escolhida, os dias sem jogo ficam apagados.
- **Filtros** Todos, Ao vivo, Encerrados e Próximos, com a contagem de cada um.
- Busca sempre à mão no topo (atalho: tecla `/`).
- Em telas menores a barra lateral vira uma gaveta (botão ☰); no celular a lista e o detalhe ocupam a tela inteira.

### Início e Pesquisa
- **Favoritos:** a estrela ☆ ao lado de times, jogadores e competições guarda o favorito no navegador. A aba **Início** junta, no dia escolhido, os jogos de todos os favoritos (de qualquer esporte), com placar ao vivo e onde assistir.
- **Pesquisa:** procura jogadores (inclusive aposentados da NBA), times, seleções, lutadores, pilotos e competições. Cada competição mostra atalhos para jogos, classificação e estatísticas, e os **últimos campeões**.

### NBA
- **Jogos por dia:** navegação por setas ou calendário, da primeira rodada ao fim da temporada.
- **Placar ao vivo:** a página se atualiza sozinha a cada 20 segundos enquanto há jogo em andamento.
- **Box score completo:** titulares e reservas separados, linha de totais do time.
- **Pré-jogo:** prováveis titulares, últimos jogos, maiores médias, lesionados e confronto direto.
- **Painel do jogador:**
  - *Temporada:* médias, recordes, gráfico de pontos por jogo e lista de jogos.
  - *Carreira:* perfil (idade, altura, peso, draft, país), prêmios, números de cada temporada (médias ou totais, temporada regular ou playoffs) e recordes da carreira.
  - *Arremessos no jogo:* mapa de acertos e erros na quadra.
- **Busca de jogadores:** toda a história da NBA, aposentados incluídos.
- **Classificação, líderes da temporada e corridas pelo MVP e pelo calouro do ano.**

### Futebol e NFL
- **Futebol:** 14 competições de clubes (Brasileirão A e B, Copa do Brasil, Libertadores, Sul-Americana, Champions, Liga Europa, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Portugal e MLS) e 7 de seleções (amistosos, Eliminatórias da América do Sul e da Europa, Liga das Nações, Copa do Mundo, Copa América e Eurocopa). Dá para ver todos os jogos do dia juntos ou uma competição só.
- **Artilharia e cartões (futebol) e Líderes (NFL):** top 10 de cada estatística da temporada atual. Torneios fora de época (Eurocopa, Copa América) mostram a última edição que tiver números, ou um aviso.
- **Carreira de jogadores de futebol:** temporada por temporada, em todas as competições que a ESPN registra (jogos, gols, assistências, cartões).
- **NFL:** navegação por semana da temporada.
- **Detalhe da partida:** lances, estatísticas comparadas, escalações (futebol), estatísticas individuais (NFL), retrospecto, desfalques e onde assistir.
- **Classificação** com as zonas de classificação e rebaixamento.
- **Elenco e carreira:** clicar num time abre o elenco; clicar num atleta abre a carreira temporada por temporada.

### Fórmula 1, UFC e boxe
- **F1:** calendário da temporada, horários e resultados de cada sessão, classificação de pilotos.
- **UFC:** eventos da temporada com o card completo, cartel dos lutadores e resultado de cada luta; **ranking** de cada categoria de peso (e o peso por peso) e o **histórico de lutas** de cada lutador.
- **Boxe:** agenda das principais noites de luta, lida do arquivo `boxe_eventos.json`.

### Onde assistir no Brasil
Cada jogo mostra os canais. A informação vem do `transmissoes.json`, em duas camadas:
1. **Grade confirmada:** jogos anotados um a um, a partir das grades que as emissoras divulgam (aparece com o selo "Grade confirmada").
2. **Padrão da competição:** quando o jogo não está na grade, vale o padrão (por exemplo, todo jogo da NBA está no League Pass e todo evento do UFC está no Paramount+). As regras do padrão podem depender do dia da semana e do horário (na NFL, quinta e domingo à noite no SporTV, segunda na ESPN).

## Tecnologias

- **Python 3.10 ou superior**
- **[FastAPI](https://fastapi.tiangolo.com/)** e **Uvicorn** para a API
- **[nba_api](https://github.com/swar/nba_api)** para os dados da NBA
- **API pública da ESPN** (não oficial, sem chave) para futebol, NFL, F1 e UFC
- **requests** para as chamadas HTTP
- **SQLite** (módulo `sqlite3` do Python) para o cache
- **HTML, CSS e JavaScript** puros no front-end, sem frameworks

## Como rodar

```
git clone https://github.com/byGlazed/Scoresports-pessoal.git
cd Scoresports-pessoal

python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
uvicorn api:app --reload
```

Depois abra **http://127.0.0.1:8000** no navegador. A documentação interativa da API fica em **http://127.0.0.1:8000/docs**.

No PowerShell, se a ativação do ambiente virtual for bloqueada, rode uma vez:

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Estrutura do projeto

```
Scoresports-pessoal/
├── api.py              # rotas da API (FastAPI) e entrega da página
├── nba_dados.py        # busca e formata os dados da NBA (inclui carreira e busca de jogadores)
├── espn_dados.py       # futebol, NFL, F1 e UFC pela API pública da ESPN
├── espn_extra.py      # líderes, ranking do UFC, lutas, carreira no futebol e busca
├── boxe.py             # lê a agenda de boxe
├── transmissoes.py     # decide onde cada jogo passa no Brasil
├── cache.py            # cache em SQLite com tempo de validade
├── transmissoes.json   # grade de transmissões (editável)
├── boxe_eventos.json   # agenda de boxe (editável)
├── campeoes.json      # últimos campeões de cada competição (editável)
├── placar_nba.py       # script de terminal: placar do dia
├── box_score.py        # script de terminal: box score de um jogo
├── classificacao.py    # script de terminal: classificação das conferências
├── requirements.txt
└── static/
    ├── index.html
    ├── style.css
    ├── app.js          # base do site e módulo da NBA
    ├── esportes.js     # futebol, NFL, F1, UFC e boxe
    └── inicio.js       # aba Início (favoritos) e Pesquisa
```

## Rotas da API

### NBA

| Rota | O que devolve | Cache |
| --- | --- | --- |
| `GET /datas` | Dias com jogos na temporada e o dia de hoje (Brasília) | 10 min |
| `GET /jogos?data=AAAA-MM-DD` | Jogos do dia, com placar ao vivo e transmissão | calendário: 10 min; ao vivo: 15 s |
| `GET /jogos/{id}/boxscore` | Box score completo | 15 s |
| `GET /jogos/{id}/pre-jogo` | Escalações prováveis, forma, líderes, lesões e confronto direto | varia por parte |
| `GET /jogos/{id}/arremessos/{jogador}` | Arremessos de um jogador no jogo | 15 s |
| `GET /jogadores/busca?q=nome` | Jogadores de toda a história com esse nome | 1 dia |
| `GET /jogadores/{id}` | Médias, recordes e jogos da temporada | 10 min |
| `GET /jogadores/{id}/carreira` | Perfil, prêmios, temporadas e recordes da carreira | 6 h a 1 dia |
| `GET /lideres?modo=media\|total` | Top 10 de cada estatística | 30 min |
| `GET /corridas` | Rankings do MVP e do calouro do ano (NBA.com) | 2 h |
| `GET /classificacao` | Leste e Oeste | 1 h |

### Futebol, NFL, F1 e UFC

`{esporte}` é `futebol`, `nfl`, `f1` ou `ufc`. `{liga}` é o código da ESPN (`bra.1`, `eng.1`, `nfl`, `f1`, `ufc`...). A lista completa sai em `GET /esportes`.

| Rota | O que devolve | Cache |
| --- | --- | --- |
| `GET /esportes` | Esportes e competições disponíveis | n/a |
| `GET /e/{esporte}/{liga}/jogos?de=&ate=` | Jogos entre duas datas (até 15 dias) | 15 s perto de hoje; 10 min a 1 h nos outros dias |
| `GET /e/{esporte}/{liga}/datas` | Dias com jogos (futebol) ou semanas (NFL) | 6 h |
| `GET /e/{esporte}/{liga}/jogos/{id}` | Detalhe da partida | 15 s |
| `GET /e/{esporte}/{liga}/classificacao` | Tabela da competição | 30 min |
| `GET /e/{esporte}/{liga}/times/{id}/elenco` | Elenco de um time | 12 h |
| `GET /e/{esporte}/{liga}/atletas/{id}` | Perfil e carreira de um atleta | 6 h |
| `GET /e/{esporte}/{liga}/eventos` | Calendário de GPs (F1) ou eventos (UFC) | 1 h |
| `GET /e/{esporte}/{liga}/eventos/{id}?data=` | Sessões e resultados (F1) ou card completo (UFC) | 30 s |
| `GET /e/{esporte}/{liga}/lideres` | Top 10 de cada estatística (futebol e NFL) | 3 h |
| `GET /e/{esporte}/{liga}/ranking` | Ranking das categorias de peso (UFC) | 6 h |
| `GET /e/{esporte}/{liga}/atletas/{id}/historico` | Carreira por temporada (futebol) ou histórico de lutas (UFC) | 6 a 12 h |
| `GET /busca?q=` | Jogadores, times e competições de todos os esportes | 6 h (parte da ESPN) |
| `GET /campeoes` | Últimos campeões de cada competição | sem cache |
| `GET /banco` | Quantos registros o banco local guarda e o tamanho do arquivo | sem cache |
| `GET /boxe/eventos` | Agenda de boxe | sem cache |

## Como funciona

```
navegador  ->  API (FastAPI)  ->  banco local (SQLite, cache.db)  ->  NBA (nba_api) / ESPN / arquivos JSON
```

1. O navegador só conversa com a API do próprio projeto.
2. A API pede os dados ao `cache.py`, que guarda tudo num banco SQLite (`cache.db`). Se o dado guardado ainda vale, ele volta na hora, sem chamar API nenhuma.
3. Cada dado tem uma validade de acordo com o quanto ele muda: placar ao vivo, 15 segundos; classificação, 30 minutos; perfil de atleta, 1 dia; dados de atleta e time do Core API da ESPN, 7 dias.
4. **O que não muda mais fica guardado de vez (30 dias):** jogo encerrado, dia que já passou com todos os jogos encerrados. Abrir de novo um jogo de ontem não chama API nenhuma.
5. Se a fonte falhar e houver um dado guardado, mesmo vencido, ele é usado no lugar e a página continua funcionando.
6. Dados vencidos há mais de 60 dias são apagados quando o servidor liga, para o arquivo não crescer sem parar. `GET /banco` mostra quantos registros estão guardados.

## Mantendo as transmissões em dia

As emissoras divulgam a grade semana a semana. Para anotar um jogo, acrescente um item na lista `jogos` do `transmissoes.json`:

```json
{"esporte": "nba", "data": "2026-11-20", "times": ["LAL", "BOS"], "canais": ["Prime Video", "NBA League Pass"], "conferido_em": "2026-11-16", "fonte": "grade do Prime Video"}
```

- `data` é o dia em Brasília (um jogo à 1h da madrugada de quarta entra como quarta).
- `times` aceita siglas ou nomes, em qualquer ordem.
- Para F1, UFC e boxe, use `"evento": "UFC 335"` no lugar de `times`.

Salve e atualize a página. Não precisa reiniciar o servidor.

## Mantendo o boxe em dia

Cada noite de lutas é um item em `boxe_eventos.json`. Depois da luta, preencha `vencedor` (com o nome do lutador, igual ao da lista `lutadores`) e `resultado` (por exemplo, "Nocaute técnico no 7º round").

## Mantendo os campeões em dia

Quando uma competição terminar, acrescente o novo campeão no topo da lista dela em `campeoes.json`, por exemplo `{"temporada": "2026", "campeao": "Palmeiras"}`.

## Configuração

A temporada da NBA é definida pela constante `TEMPORADA` (por exemplo, `"2026-27"`) no início do `nba_dados.py`. O `classificacao.py` tem a sua própria. Quando uma nova temporada começar, é só atualizar esse valor. Os outros esportes acompanham a temporada atual da ESPN sozinhos.

## Limitações conhecidas

- Os dados vêm de endpoints **não oficiais** da NBA e da ESPN. Eles podem mudar, ficar lentos ou bloquear consultas sem aviso. O cache ameniza isso, mas não elimina.
- Os recordes da temporada consideram apenas a **temporada regular**. Na carreira, há números de temporada regular e de playoffs.
- A ESPN não publica estatísticas de carreira de todos os atletas; quando falta, o painel avisa.
- A Globo transmite só 15 dos 24 GPs de F1 em TV aberta, e quais são varia. O padrão aponta SporTV e Globoplay, que passam todos.
- O boxe depende do arquivo `boxe_eventos.json`, atualizado à mão.
- Os favoritos ficam guardados no navegador: em outro navegador ou celular eles começam vazios.
- Líderes, ranking do UFC, lutas e carreira no futebol usam o Core API da ESPN, que entrega os dados em vários pedaços. A primeira abertura de cada tela pode levar alguns segundos; depois fica no cache.
- Em algumas competições a ESPN não publica cartões entre os líderes; a página avisa quando isso acontece.
- A pré-temporada não aparece no calendário.

## Próximos passos

- [ ] Opção de ver playoffs no calendário da NBA
- [ ] Atualizar a grade de transmissões automaticamente a partir das páginas das emissoras
- [ ] Mais esportes da ESPN (NHL, MLB, tênis)

## Aviso

Este projeto é de uso pessoal e educacional. Os dados pertencem às ligas, à ESPN e aos respectivos detentores, e o app não os redistribui nem os usa comercialmente.