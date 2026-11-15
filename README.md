# Scoresports

App pessoal de placares, feito para treinar programação. Cobre NBA, futebol, NFL, Fórmula 1, UFC e boxe, com horários no fuso de Brasília e a informação de onde cada jogo passa no Brasil.

> Projeto de estudo, para uso pessoal. Não é afiliado à NBA, à ESPN nem a nenhuma liga, e não tem fins comerciais.

## Funcionalidades

### Interface
- No estilo do Sofascore e do Flashscore: uma **barra embaixo** com **Jogos**, **Favoritos** e **Pesquisa**, e cada coisa que você abre (partida, time, competição, atleta, boxeador, evento) vira uma **página com voltar**.
- **Jogos:** a tela inicial mostra só os jogos do dia. Os **chips** no topo escolhem o esporte (Todos, Futebol, NBA, NFL, MLB, NHL, F1, UFC, Boxe). Em "Todos", os jogos de todos os esportes aparecem juntos, agrupados por competição, com os que estão **ao vivo primeiro**. Se um esporte não carregar, só ele mostra o aviso, com um botão para tentar de novo.
- **Competição:** tocar no nome dela abre a página da liga, com as abas **Classificação**, Jogos e Líderes (no futebol, Artilharia e cartões). Na F1 são Calendário e Classificação; no UFC, Eventos e Ranking.
- **Voltar:** cada aba guarda as suas páginas. Trocar de aba e voltar mantém onde você estava; tocar na aba de novo volta ao começo dela. No Android, o botão voltar volta uma página por vez e só sai do app no começo da aba Jogos. Cada página tem um endereço próprio (por exemplo `#/liga/futebol/bra.1/classificacao`), então recarregar mantém a página aberta.
- **Faixa de dias** com ontem, hoje e amanhã, setas e calendário. Na NBA e numa competição escolhida, os dias sem jogo ficam apagados.
- **Filtros** Todos, Ao vivo, Encerrados e Próximos, com a contagem de cada um.
- Busca sempre à mão: a lupa no topo e a aba Pesquisa (atalho no PC: tecla `/`).
- Fonte **Inter** embutida no app (`static/fontes/`), igual com ou sem internet. No Android, o app acompanha o tamanho de letra do celular até +15%.
- No PC, o app ocupa uma coluna central, como no celular.

### Favoritos e Pesquisa
- **Favoritos:** a estrela ☆ ao lado de times, jogadores e competições guarda o favorito no navegador. A aba **Favoritos** junta, no dia escolhido, os jogos de todos os favoritos (de qualquer esporte), com placar ao vivo e onde assistir. Os chips mostram só os esportes em que você tem favorito, e embaixo fica a lista **Seus favoritos**, com atalho para cada um e o × para tirar.
- **Pesquisa:** procura jogadores (inclusive aposentados da NBA), times, seleções, lutadores do UFC, boxeadores (pela Wikipédia), pilotos e competições, com o nome certo primeiro. Filtros Todos, Times, Atletas e Competições; com o campo vazio aparecem as **buscas recentes** (com × para apagar). Cada competição mostra atalhos para jogos, classificação e estatísticas, e os **últimos campeões**.

### NBA
- **Jogos por dia:** navegação por setas ou calendário, da primeira rodada ao fim da temporada.
- **Placar ao vivo:** a página se atualiza sozinha a cada 20 segundos enquanto há jogo em andamento.
- **Box score completo:** titulares e reservas separados, linha de totais do time.
- **Pré-jogo:** prováveis titulares, últimos jogos, maiores médias, lesionados e confronto direto.
- **Página do jogador:**
  - *Temporada:* médias, recordes, gráfico de pontos por jogo e lista de jogos.
  - *Carreira:* perfil (idade, altura, peso, draft, país), prêmios, números de cada temporada (médias ou totais, temporada regular ou playoffs) e recordes da carreira.
  - *Arremessos no jogo:* mapa de acertos e erros na quadra.
- **Busca de jogadores:** toda a história da NBA, aposentados incluídos.
- **Classificação, líderes da temporada e corridas pelo MVP e pelo calouro do ano.**
- **No app e na pasta `docs/`:** box score com titulares, reservas e totais, **ordenável por qualquer estatística** (toque no nome da coluna), e **mapa de arremessos** de cada time e de cada jogador, em escala real, com os dados da ESPN.

### Futebol e NFL
- **Futebol:** 15 ligas e copas de clubes (Brasileirão A e B, Copa do Brasil, Libertadores, Sul-Americana, Champions, Liga Europa, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie e MLS), 17 copas nacionais e supercopas no grupo **Copas** (Copa del Rey, FA Cup, Copa da Liga Inglesa, Community Shield, Copa da Alemanha, Coppa Italia, Copa da França, Taça de Portugal, Copa da Holanda, as supercopas da Espanha, Alemanha, Itália, França e Brasil, Recopa, Supercopa da UEFA e Mundial de Clubes) e 7 de seleções (amistosos, Eliminatórias da América do Sul e da Europa, Liga das Nações, Copa do Mundo, Copa América e Eurocopa). Dá para ver todos os jogos do dia juntos ou uma competição só.
- **Artilharia e cartões (futebol) e Líderes (NFL):** top 10 de cada estatística da temporada atual. Torneios fora de época (Eurocopa, Copa América) mostram a última edição que tiver números, ou um aviso.
- **Carreira de jogadores de futebol:** temporada por temporada, em todas as competições que a ESPN registra (jogos, gols, assistências, cartões).
- **NFL:** navegação por semana da temporada.
- **Detalhe da partida:** lances, estatísticas comparadas, escalações (futebol), estatísticas individuais (NFL), retrospecto, desfalques e onde assistir.
- **Classificação** com as zonas de classificação e rebaixamento.
- **Página do time** (no app e na pasta `docs/`): clicar num time abre, como no Sofascore, as abas **Jogos** (últimos, com V/E/D, e próximos), **Elenco** por posição (goleiros, defensores, meias e atacantes no futebol; armadores, alas e pivôs na NBA; ataque, defesa e times especiais na NFL) com o técnico, **Detalhes** (estádio, cidade, técnico, posição e campanha), **Classificação** com o time destacado e **Estatísticas** da temporada. No site do PC pelo servidor Python, clicar num time mostra só o elenco.
- **Carreira:** clicar num atleta abre a carreira temporada por temporada.

### MLB e NHL (no app e na pasta `docs/`)
- **Jogos dia a dia**, com o visitante primeiro, como nos EUA. Ao vivo, o beisebol mostra a entrada ("▲ 5ª entrada") e o hóquei, o período e o relógio ("2º período · 12:34"). Nos playoffs aparece a situação da série ("World Series - Game 5 · MIL ganhou a série 4-1").
- **Detalhe do jogo:** corridas ou gols em ordem, estatísticas comparadas dos times e números dos jogadores.
- **Classificação** por liga, conferência e divisão; **Líderes** (média de rebatidas, home runs, ERA, strikeouts; gols, pontos, +/−, defesas...).
- **Página do time** com elenco por posição (arremessadores, receptores, defensores internos e externos; goleiros, defensores e atacantes) e o técnico.
- Onde assistir: ESPN e Disney+ Premium. Últimos campeões da World Series e da Stanley Cup.

### Fórmula 1, UFC e boxe
- **F1:** calendário da temporada, horários e resultados de cada sessão, classificação de pilotos.
- **UFC:** eventos da temporada com o card completo, cartel dos lutadores e resultado de cada luta; **ranking** de cada categoria de peso (e o peso por peso) e o **histórico de lutas** de cada lutador.
- **Boxe:** agenda das principais noites de luta, lida do arquivo `boxe_eventos.json`.

### Onde assistir no Brasil
Cada jogo mostra os canais. A informação vem do `transmissoes.json`, em duas camadas:
1. **Grade confirmada:** jogos anotados um a um, a partir das grades que as emissoras divulgam (aparece com o selo "Grade confirmada").
2. **Padrão da competição:** quando o jogo não está na grade, vale o padrão (por exemplo, todo jogo da NBA está no League Pass e todo evento do UFC está no Paramount+). As regras do padrão podem depender do dia da semana e do horário (na NFL, quinta e domingo à noite no SporTV, segunda na ESPN).

## App Android (APK)

A pasta `android/` é um app Android que leva as telas dentro dele e busca os dados da ESPN e da Wikipédia direto pelo celular. Funciona com o PC desligado, abre sem internet (mostrando o que já estava guardado) e não sofre bloqueio de acesso, porque os pedidos saem do Android, não do navegador.

### Gerar o APK (o GitHub monta para você)
Não precisa instalar Android Studio. O arquivo `.github/workflows/apk.yml` faz o GitHub montar o APK na nuvem, de graça, a cada push:

1. Faça commit e push do projeto inteiro (inclusive as pastas `android/`, `celular/`, `docs/` e `.github/`).
2. No GitHub, abra a aba **Actions**. Vai aparecer **Gerar APK** rodando; leva uns 5 minutos.
3. Quando ficar verde, o APK está publicado em **Releases**, com um link fixo:
   `https://github.com/byGlazed/Scoresports-pessoal2/releases/latest/download/Scoresports.apk`

Se quiser gerar sem mudar nada, em **Actions > Gerar APK** clique em **Run workflow**.

### Instalar no celular
1. No celular, abra o link acima e baixe o `Scoresports.apk`.
2. Abra o arquivo baixado. Na primeira vez o Android pede para **permitir instalar apps desta fonte** (do navegador ou do app de arquivos): permita.
3. Se o Play Protect avisar que o app não é conhecido, toque em **Mais detalhes > Instalar mesmo assim**. O aviso aparece porque o app não veio da Play Store.

### Atualizar
O app se atualiza sozinho: a cada abertura ele confere no GitHub Pages se há telas ou dados novos, baixa só o que mudou e passa a usar na abertura seguinte. Os favoritos continuam, e sem internet ele abre com a última versão baixada.

Mudou alguma tela? Rode `python gerar_celular.py`, faça commit e push na `main`: o celular pega sozinho. Só mudanças no Java (a pasta `android/`) pedem um APK novo; nesse caso aumente o número em `celular/apk_minimo.txt` para o `versionCode` do APK novo, e o app mostra o aviso "Nova versão do app" com o link para baixar e instalar por cima.

### Se o Actions falhar
- **Erro 403 ao publicar:** em **Settings > Actions > General > Workflow permissions**, marque **Read and write permissions** e rode de novo.
- **Outro erro:** abra a execução que falhou, copie as últimas linhas do passo vermelho e me mande.

A chave que assina o APK (`android/scoresports.keystore`) fica no repositório para todo APK novo ter a mesma assinatura e instalar por cima do anterior. Para um app pessoal, fora da Play Store, isso é o suficiente.

## Versão do celular pelo navegador (alternativa ao APK)

A pasta `docs/` é uma versão do app que roda inteira no navegador do celular: ela pede os dados direto à ESPN (e à Wikipédia, para o boxe), guarda tudo no banco do próprio celular e pode ser instalada na tela inicial como um app. Não precisa do Python nem do PC ligado.

### Publicar (uma vez só)
1. Faça commit e push do projeto, com a pasta `docs/`, para o GitHub.
2. No repositório, abra **Settings > Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, branch `main`, pasta `/docs`, e clique em **Save**.
4. Em um ou dois minutos o endereço aparece no topo da página, algo como `https://byglazed.github.io/Scoresports-pessoal2/` (com o seu usuário).

### Instalar no celular
- **Android (Chrome):** abra o endereço, toque nos três pontinhos e em **Instalar app** (ou **Adicionar à tela inicial**).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**.

### Atualizar
Mudou alguma tela ou um arquivo de dados (`transmissoes.json`, `boxe_eventos.json`, `campeoes.json`)? Rode `python gerar_celular.py`, faça commit e push. O app do celular pega a versão nova sozinho na próxima vez que abrir com internet.

### O que muda em relação ao PC
- A NBA vem da ESPN, como os outros esportes. Ficam de fora só o mapa de arremessos, o pré-jogo próprio da NBA e as corridas pelo MVP e pelo calouro (os servidores da NBA não aceitam pedidos de navegador).
- A página do time (jogos, elenco por posição, detalhes, classificação e estatísticas) só existe aqui, no app e na pasta `docs/`. O técnico vem do elenco da ESPN e, nos clubes de futebol, do Wikidata. Quando o nome do clube é ambíguo, o técnico não aparece, para não mostrar o técnico de outro time.
- Os favoritos e o banco de dados ficam no celular, separados dos do PC.
- Sem internet, o app abre e mostra o que já estava guardado.

### Se aparecer "acesso bloqueado"
Se a ESPN recusar os pedidos vindos do navegador, crie um repasse gratuito na Cloudflare com o arquivo `repasse_cloudflare.js` (o passo a passo está no começo do arquivo) e abra o app uma vez com `?repasse=ENDEREÇO-DO-REPASSE/?url=` no fim do link. O endereço fica guardado no celular.

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
git clone https://github.com/byGlazed/Scoresports-pessoal2.git
cd Scoresports-pessoal2

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
Scoresports-pessoal2/
├── api.py              # rotas da API (FastAPI) e entrega da página
├── nba_dados.py        # busca e formata os dados da NBA (inclui carreira e busca de jogadores)
├── espn_dados.py       # futebol, NFL, F1 e UFC pela API pública da ESPN
├── espn_extra.py      # líderes, ranking do UFC, lutas, carreira no futebol e busca
├── indice.py          # índice local da busca (todo atleta e time que o app viu)
├── gerar_celular.py   # monta a versão do celular em docs/ e as telas do APK
├── repasse_cloudflare.js  # repasse gratuito, só se a ESPN bloquear o celular
├── boxe.py             # lê a agenda de boxe
├── transmissoes.py     # decide onde cada jogo passa no Brasil
├── cache.py            # cache em SQLite com tempo de validade
├── transmissoes.json   # grade de transmissões (editável)
├── boxe_eventos.json   # agenda de boxe (editável)
├── campeoes.json      # últimos campeões de cada competição (editável)
├── placar_nba.py       # script de terminal: placar do dia
├── box_score.py        # script de terminal: box score de um jogo
├── classificacao.py    # script de terminal: classificação das conferências
├── temporada.py       # temporada da NBA pela data
├── robo/              # robô diário: campeões (ESPN) e lutas de boxe (Wikipédia)
├── requirements.txt
└── static/
    ├── index.html
    ├── style.css
    ├── rotas.js        # regras da navegação: endereços, pilhas de páginas, voltar e ordem dos grupos
    ├── app.js          # base do site e módulo da NBA
    ├── esportes.js     # futebol, NFL, F1, UFC, boxe e a página do time
    ├── busca_regras.js # regras da busca (relevância, boxeadores da Wikipédia, recentes)
    ├── nba_quadra.js   # NBA: box score, arremessos e desenho da quadra (PC e app)
    ├── inicio.js       # abas Favoritos e Pesquisa
    ├── navegacao.js    # barra de baixo, páginas com voltar, aba Jogos e página da liga
    └── fontes/         # fonte Inter (licença SIL OFL)
celular/
├── direto.js          # faz no celular o que o Python faz no PC
├── time_dados.js      # regras da página do time (elenco por posição, jogos, estatísticas, técnico)
├── regras_esportes.js # regras de MLB e NHL (placar ao vivo, série, pontuações, líderes)
├── sw.js, registrar.js, manifest.webmanifest, ícones
├── android.js         # botão voltar do Android (só no APK)
testes/                # testes das regras (time, busca, NBA, navegação), com amostras reais da ESPN e do Wikidata
planejamento/          # especificações e planos de cada parte
docs/                  # versão do celular pronta (gerada pelo gerar_celular.py); docs/apk/ é o pacote que o app baixa
android/               # projeto do app Android (o GitHub Actions monta o APK)
.github/workflows/apk.yml  # automação que monta e publica o APK
.github/workflows/robo.yml # robô diário que atualiza os dados
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
| `GET /boxe/lutador?nome=` | Perfil de um boxeador (Wikipédia) e as lutas dele na agenda | 7 dias |

## Como funciona

```
navegador  ->  API (FastAPI)  ->  banco local (SQLite, cache.db)  ->  NBA (nba_api) / ESPN / arquivos JSON
```

1. O navegador só conversa com a API do próprio projeto.
2. A API pede os dados ao `cache.py`, que guarda tudo num banco SQLite (`cache.db`). Se o dado guardado ainda vale, ele volta na hora, sem chamar API nenhuma.
3. Cada dado tem uma validade de acordo com o quanto ele muda: placar ao vivo, 15 segundos; classificação, 30 minutos; perfil de atleta, 1 dia; dados de atleta e time do Core API da ESPN, 7 dias.
4. **O que não muda mais só é perguntado de novo depois de 30 dias:** jogo encerrado, dia que já passou com todos os jogos encerrados. Abrir de novo um jogo de ontem não chama API nenhuma.
5. **Nada é apagado.** Cada dado fica guardado e só é substituído quando a API traz uma versão mais nova. A "validade" diz quando vale a pena perguntar de novo, não quando jogar fora.
6. Se a fonte falhar, o dado guardado (mesmo antigo) é usado no lugar e a página continua funcionando.
7. `GET /banco` mostra quantos registros estão guardados e o tamanho do arquivo.

### Busca universal
Todo atleta, lutador, piloto e time que passa pelo app (elencos, escalações, líderes, rankings, cards do UFC, classificações, agenda de boxe) entra num índice no banco. A busca procura nesse índice, na lista completa da NBA e na busca da ESPN. Uma vez por semana o servidor também completa o índice em segundo plano: times de todas as competições, elencos da NFL, do Brasileirão e da Premier League, ranking do UFC e pilotos da F1.

### Boxe
O boxe não tem fonte aberta na ESPN. A agenda vem de `boxe_eventos.json` e o perfil de cada lutador vem da Wikipédia: cartel (vitórias, nocautes, derrotas, empates), categoria, altura, envergadura, base, nacionalidade, foto e um resumo em português quando existir.

## Mantendo as transmissões em dia

As emissoras divulgam a grade semana a semana. Para anotar um jogo, acrescente um item na lista `jogos` do `transmissoes.json`:

```json
{"esporte": "nba", "data": "2026-11-20", "times": ["LAL", "BOS"], "canais": ["Prime Video", "NBA League Pass"], "conferido_em": "2026-11-16", "fonte": "grade do Prime Video"}
```

- `esporte` pode ser `nba`, `nfl`, `mlb`, `nhl` ou `futebol` (no futebol, informe também a `liga`, por exemplo `eng.fa`).
- `data` é o dia em Brasília (um jogo à 1h da madrugada de quarta entra como quarta).
- `times` aceita siglas ou nomes, em qualquer ordem.
- Para F1, UFC e boxe, use `"evento": "UFC 335"` no lugar de `times`.

Salve e atualize a página. Não precisa reiniciar o servidor.

## Mantendo o boxe em dia

Cada noite de lutas é um item em `boxe_eventos.json`. Depois da luta, preencha `vencedor` (com o nome do lutador, igual ao da lista `lutadores`) e `resultado` (por exemplo, "Nocaute técnico no 7º round").

## Mantendo os campeões em dia

Quando uma competição terminar, acrescente o novo campeão no topo da lista dela em `campeoes.json`, por exemplo `{"temporada": "2026", "campeao": "Palmeiras"}`.

## Testes

As regras da página do time têm testes automáticos. Com o Node 18 ou superior instalado, rode na pasta do projeto:

```
node --test testes/*.test.js
```

## Configuração

A temporada da NBA é definida pela constante `TEMPORADA` (por exemplo, `"2026-27"`) no início do `nba_dados.py`. O `classificacao.py` tem a sua própria. Quando uma nova temporada começar, é só atualizar esse valor. Os outros esportes acompanham a temporada atual da ESPN sozinhos.

## O que se atualiza sozinho

| O quê | Como |
|-------|------|
| Jogos, placares, classificações, elencos | direto da ESPN, sempre |
| Telas e dados no APK | o app baixa do GitHub Pages ao abrir e usa na próxima abertura |
| Campeões (`campeoes.json`) | o robô diário lê na ESPN quem ganhou cada temporada encerrada |
| Lutas grandes de boxe (`boxe_eventos.json`) | o robô diário lê as fichas das lutas na Wikipédia (categorias "AAAA boxing matches"): acrescenta as lutas marcadas e completa os resultados |
| Temporada da NBA no PC | calculada pela data (`temporada.py`) |

O robô (`robo/`, `.github/workflows/robo.yml`) roda todo dia às 7h de Brasília. Para rodar na hora: aba **Actions > Robô diário > Run workflow**. Ele só acrescenta ou completa: nunca apaga nem troca o que foi escrito à mão, e se a ESPN ou a Wikipédia estiverem fora do ar, não muda nada. As lutas novas entram sem horário e sem canal: complete à mão se quiser, e o robô não mexe no que você escreveu.

Ainda é à mão: os canais de TV (`transmissoes.json`; não existe fonte aberta com a grade do Brasil) e as lutas de boxe que não têm artigo na Wikipédia.

Para testar o robô sem gravar nada: `python -m robo --seco`.

## Limitações conhecidas

- Os dados vêm de endpoints **não oficiais** da NBA e da ESPN. Eles podem mudar, ficar lentos ou bloquear consultas sem aviso. O cache ameniza isso, mas não elimina.
- Os recordes da temporada consideram apenas a **temporada regular**. Na carreira, há números de temporada regular e de playoffs.
- A ESPN não publica estatísticas de carreira de todos os atletas; quando falta, a página avisa.
- A Globo transmite só 15 dos 24 GPs de F1 em TV aberta, e quais são varia. O padrão aponta SporTV e Globoplay, que passam todos.
- A agenda de boxe fica no arquivo `boxe_eventos.json`. O robô acrescenta as lutas grandes que têm artigo na Wikipédia; as menores continuam à mão. O perfil dos lutadores depende de a Wikipédia ter uma página sobre eles.
- Os favoritos ficam guardados no navegador: em outro navegador ou celular eles começam vazios.
- Líderes, ranking do UFC, lutas e carreira no futebol usam o Core API da ESPN, que entrega os dados em vários pedaços. A primeira abertura de cada tela pode levar alguns segundos; depois fica no cache.
- Em algumas competições a ESPN não publica cartões entre os líderes; a página avisa quando isso acontece.
- A pré-temporada não aparece no calendário.

## Próximos passos

- [ ] Opção de ver playoffs no calendário da NBA
- [ ] Mais esportes da ESPN (NHL, MLB, tênis)

A grade de transmissões automática saiu da lista: a ESPN não informa os canais do Brasil e não existe uma fonte aberta com a programação das emissoras.

## Aviso

Este projeto é de uso pessoal e educacional. Os dados pertencem às ligas, à ESPN e aos respectivos detentores, e o app não os redistribui nem os usa comercialmente.
