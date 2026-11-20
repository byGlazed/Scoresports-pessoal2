# Scoresports

App pessoal de placares, feito para treinar programação. Cobre NBA, futebol, NFL, MLB, NHL, Fórmula 1, UFC, boxe e e-sports (CS2, Valorant e LoL), com horários no fuso de Brasília e a informação de onde cada jogo passa no Brasil.

> Projeto de estudo, para uso pessoal. Não é afiliado à NBA, à ESPN nem a nenhuma liga, e não tem fins comerciais.

## Funcionalidades

### Interface
- No estilo do Sofascore e do Flashscore: uma **barra embaixo** com **Jogos**, **Favoritos** e **Pesquisa**, e cada coisa que você abre (partida, time, competição, atleta, boxeador, evento) vira uma **página com voltar**.
- **Jogos:** a tela inicial mostra só os jogos do dia. Os **chips** no topo escolhem o esporte (Todos, Futebol, NBA, NFL, MLB, NHL, F1, UFC, Boxe). Em "Todos", os jogos de todos os esportes aparecem juntos, agrupados por competição, com os que estão **ao vivo primeiro**. Se um esporte não carregar, só ele mostra o aviso, com um botão para tentar de novo.
- **Competição (como a página de torneio do Sofascore):** tocar no nome dela, ou nela na Pesquisa, abre a página da liga. No topo ficam o escudo, o nome, "país · temporada" e a barra da temporada (do primeiro ao último dia com jogo). Embaixo vêm as abas **Classificação**, **Detalhes**, Jogos e **Estatísticas** (artilharia, assistências, cartões ou os líderes do esporte). **Detalhes** (no app) junta os jogos ao vivo, os próximos e os últimos resultados, os 3 primeiros da artilharia (ou da principal estatística) com "Ver tudo", os números da temporada no futebol (gols, média de gols, jogos, empates e times), os títulos com o maior campeão da lista e a divisão de cima ou de baixo (Série A ↔ Série B). Na F1 as abas são Calendário e Classificação; no UFC, Eventos e Ranking.
- **Chaveamento (no app):** nas copas e competições com mata-mata (Copa do Brasil, Libertadores, Champions, FA Cup, Copa do Mundo…) a página da liga ganha a aba **Mata-mata**, e na NBA, NFL, MLB, NHL e MLS a aba **Playoffs**: a chave em colunas, arrastando para os lados, com as linhas ligando quem passa, o agregado da ida e volta, os pênaltis, as vitórias na série e quem está ao vivo. Tocar num confronto abre o jogo (ou os jogos de ida e volta e da série). As fases preliminares e o Play-In da NBA ficam numa lista acima da chave. Se o mata-mata desta temporada ainda não começou, aparece o da anterior, com um botão para trocar.
- **Voltar:** cada aba guarda as suas páginas. Trocar de aba e voltar mantém onde você estava; tocar na aba de novo volta ao começo dela. No Android, o botão voltar volta uma página por vez e só sai do app no começo da aba Jogos. Cada página tem um endereço próprio (por exemplo `#/liga/futebol/bra.1/classificacao`), então recarregar mantém a página aberta.
- **Faixa de dias** com ontem, hoje e amanhã, setas e calendário. Na NBA e numa competição escolhida, os dias sem jogo ficam apagados.
- **Filtros** Todos, Ao vivo, Encerrados e Próximos, com a contagem de cada um.
- Busca sempre à mão: a lupa no topo e a aba Pesquisa (atalho no PC: tecla `/`).
- **Tema:** o botão do topo alterna entre automático (o do aparelho), claro (branco com laranja) e escuro (preto com laranja), e a escolha fica guardada. No app Android o tema automático segue o do app, que o Android informa como escuro: para o claro, toque no botão.
- Fonte **Inter** embutida no app (`static/fontes/`), igual com ou sem internet. No Android, o app acompanha o tamanho de letra do celular até +15%.
- No PC, o app ocupa uma coluna central, como no celular.

### Favoritos e Pesquisa
- **Favoritos:** a estrela ☆ ao lado de times, jogadores e competições guarda o favorito no navegador. A aba **Favoritos** junta, no dia escolhido, os jogos de todos os favoritos (de qualquer esporte), com placar ao vivo e onde assistir. Os chips mostram só os esportes em que você tem favorito, e embaixo fica a lista **Seus favoritos**, com atalho para cada um e o × para tirar.
- **Pesquisa:** procura jogadores (inclusive aposentados da NBA), times, seleções, lutadores do UFC, boxeadores (pela Wikipédia), pilotos e competições, com o nome certo primeiro. Filtros Todos, Times, Atletas e Competições; com o campo vazio aparecem as **buscas recentes** (com × para apagar). Cada competição é uma linha, como os times e os jogadores, e o toque abre a página dela.

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
- **Copa NBA (no app):** os 6 grupos com vitórias, derrotas e saldo, e a chave das quartas até a final.
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

### Nota do Scoresports e escalação no campinho
- **Campinho (futebol, no app e no PC):** a aba Escalações desenha os titulares no campo, pela formação ("4-2-3-1") e pelo lugar de cada um que a ESPN informa. O campo é visto de cima com o time atacando para baixo, então o lado esquerdo do time fica à direita da tela, como no Sofascore. Cada jogador tem foto (ou o número), a nota colorida, os ícones de gol, assistência, cartão e substituição; embaixo vêm os reservas, com o minuto em que entraram. Formação desconhecida mostra a lista de sempre.
- **Nota do Scoresports:** de 3,0 a 10,0, calculada pelo próprio app a partir das estatísticas do jogo. **Não é a nota do Sofascore**, que não sai em fonte aberta; o ⓘ ao lado da média explica isso. Cores: abaixo de 6,0 vermelho, até 6,4 laranja, até 6,9 amarelo, até 7,9 verde, até 8,9 verde-azulado, 9,0 ou mais azul.
  - *Futebol:* parte de 6,6 e soma ou tira por gols, assistências, chutes no gol, faltas, cartões, gol contra, defesas e gols sofridos (goleiro) e jogo sem sofrer gol; o resultado quase não pesa. Calibrada num jogo real (Crystal Palace 1 x 3 Liverpool): as médias dos times ficam a até 0,35 das do Sofascore e o goleiro com 5 defesas passa de 7,3. Quem jogou menos de 10 minutos fica sem nota. O cabeçalho mostra a média do time.
  - *NBA:* sai do Game Score de John Hollinger, calibrado nas notas de um jogo real (Jazz 132 x 107 Clippers, 17/11/2026): fica a até 0,3 delas. Menos de 5 minutos: sem nota.
- **Box score da NBA (no app):** o seletor [time] [Os dois] [time] junta os jogadores dos dois times numa tabela só, ordenada por pontos, com a coluna **Nota**.

### E-sports (no app e na pasta `docs/`)
- **Chip E-sports** na aba Jogos (e o grupo dos e-sports em "Todos"): as partidas do dia de **CS2, Valorant e League of Legends**, agrupadas por torneio, as ao vivo primeiro (com o mapa em andamento). Aparecem os torneios grandes (nível S e A da PandaScore), as partidas de **times brasileiros** em qualquer torneio e as dos seus **times favoritos**.
- **Página da partida:** placar da série, "Melhor de N" com as bolinhas, os **mapas** (quem venceu cada um, a hora de início e a duração), os **elencos** lado a lado (nick, nome e foto) e onde assistir (as transmissões em português primeiro).
- **Página do time:** elenco, próximas e últimas partidas e a estrela de favorito. Os times de e-sports favoritos aparecem na aba Favoritos.
- **De onde vem:** da [PandaScore](https://pandascore.co), plano grátis, por meio do repasse da Cloudflare (a chave fica só lá, veja abaixo). O plano grátis **não traz o nome do mapa, o placar de rounds nem o KDA** dos jogadores; a página avisa isso. O KDA do CS2 pode entrar depois pelo [GRID Open Access](https://grid.gg/open-access/), se a inscrição for aprovada.
- **Ao vivo:** a lista e a partida se atualizam a cada 30 s, para caber no limite grátis da PandaScore (cerca de 1.000 pedidos por hora).

### Fotos, visual e velocidade
- **Fotos dos jogadores:** no futebol, a foto da ESPN quando existe e, senão, a foto recortada do [TheSportsDB](https://www.thesportsdb.com) (API gratuita), com zoom no rosto. A foto só entra se o time bater (ou se o nome completo for único), para não mostrar um homônimo; sem foto, fica o número da camisa. As buscas vão uma de cada vez e ficam guardadas no aparelho por 30 dias. Aparecem no campinho, nos reservas, no elenco e na página do jogador. Na NBA, a foto da ESPN em cada linha do box score. Nos times brasileiros a foto sai na hora, pelo índice que o robô monta (`fotos.json`); nos outros, as buscas saem em rajada (até 4 ao mesmo tempo e 25 por minuto, os titulares primeiro). Se o TheSportsDB pedir para esperar (limite do plano grátis), as buscas param 1 minuto, dobrando até 8.
- **Como no Sofascore:**
  - *Lista do dia:* contador em cada campeonato ("6", ou "2/6" em vermelho com jogo ao vivo) e grupo que recolhe (a escolha fica guardada).
  - *Partida:* a data em pílula no topo; no pré-jogo, as **prováveis escalações** no campinho (os titulares do último jogo de cada time, até a ESPN divulgar a oficial), os últimos jogos com V/E/D e os destaques da temporada; autores dos gols embaixo de cada time; na linha do tempo, o placar em pílula nos gols e as substituições com ↑ e ↓; nos reservas, "60' · Saiu: Q. Timber"; o técnico embaixo do campinho.
  - *Time:* aba **Visão geral** (abre primeiro) com o próximo jogo, a forma recente (5 placas V/E/D com o placar) e a mini-classificação.
  - *Campeonato:* a página da liga com cabeçalho, barra da temporada e a aba Detalhes.
  - *Jogador:* foto redonda, o cartão do clube (toque para abrir o time) e "Informações gerais" em blocos.
- **Carregamento:** no lugar do "Carregando…", um esqueleto (skeleton) no formato do que vai chegar (lista de jogos, placar da partida, perfil), que só aparece se a espera passar de 150 ms. Ao tocar num jogo, a página dele começa a ser buscada quando o dedo encosta. Em "Todos", cada liga de futebol aparece assim que chega.
- **Velocidade:** o que já está guardado no aparelho aparece na hora (até 6 h de idade), e o dado novo chega em segundo plano e redesenha a tela sozinho. Medido no navegador: a lista do dia com dado guardado em cerca de 0,15 s, e voltar da partida para a lista em 0,02 s. Os escudos e as fotos da ESPN vêm no tamanho em que aparecem (um escudo cai de ~110 KB para ~5 KB), a conexão com a ESPN abre enquanto o app carrega, e o dia anterior e o seguinte são buscados quando o celular fica ocioso (não com economia de dados ligada).

### Kings League (no app e na pasta `docs/`)
- **Kings League Brasil**, o **Mundial da Kings** (Kings World Cup de clubes) e o **Mundial de Seleções**, no chip **Kings League** e na lista "Todos".
- **Jogo:** o placar, o de cada tempo, os pênaltis (Shootouts), a rodada e o grupo, e o botão **Assistir no YouTube** quando a liga publica o vídeo. Nos Mundiais, os **autores dos gols** embaixo de cada time (pênalti, pênalti do presidente e gol duplo marcados), das súmulas da Wikipédia em inglês. Na Kings League Brasil eles só existem na página de cada jogo do site, que o robots.txt dele proíbe.
- **Página da liga:** os jogos por rodada (abre na rodada atual), a **artilharia** (os 3 primeiros em gols, assistências, defesas, MVP e dribles, que é o que a página de estatísticas do site mostra) e a **classificação** dos grupos, calculada pelo regulamento: cada vitória vale um ponto, inclusive nos pênaltis; os jogos do Challenger não contam; desempate pelo confronto direto, depois saldo e gols.
- **De onde vem:** o robô (`robo/kings.py`) lê a página de cada competição no site oficial ([kingsleague.pro](https://kingsleague.pro)), que traz os dados embutidos, e grava `kings.json`. As páginas de cada jogo ficam de fora (o robots.txt do site não deixa). Ele roda junto com o robô diário e, nas noites de jogo (segunda, 17h às 21h40, e domingo à tarde, nas finais), a cada 20 minutos pelo workflow `kings.yml`. Com jogo perto da hora, o app pega o placar **ao vivo** pelo repasse da Cloudflare (`/kings/<competição>`, guardado 30 s); sem o repasse atualizado, fica o do robô, com esse atraso.

### Onde assistir no Brasil
Cada jogo mostra os canais. A informação vem do `transmissoes.json`, em duas camadas:
1. **Grade confirmada:** jogos anotados um a um, a partir das grades que as emissoras divulgam (aparece com o selo "Grade confirmada").
   O **robô dos canais** (`robo/transmissoes.py`) preenche a grade sozinho duas vezes por dia (7h e 15h de Brasília), com duas fontes:
   - o guia de TV [meuguia.tv](https://meuguia.tv) (ESPN 1 a 5, SporTV 1 a 3, Premiere, BandSports, Combate, Globo, Band, Record, SBT e TV Cultura), só os programas "Ao Vivo";
   - o [futebolnatv.com.br](https://www.futebolnatv.com.br): a lista do dia (hoje e amanhã) e a página de cada liga (a rodada inteira), com os streamings e os canais que o guia não tem: ge tv, CazéTV, Prime Video, HBO Max, Disney+, Premiere 2 a 7, Xsports, SportyNet, Paramount+, Apple TV… O robô lê só a hora, os dois times e os canais (os termos do site pedem para não copiar o conteúdo; o dono aprovou o uso pessoal);
   - na NBA, a lista do mês do [gameoverdrive.com.br](https://gameoverdrive.com.br) (League Pass, ESPN 2/Disney+ e **Prime Video**), uma página por mês.

   Cada jogo é cruzado com os jogos da ESPN pelos dois times e pela hora (no futebol, a ESPN em português e em inglês, que traz todas as ligas; depois da meia-noite, também o dia anterior da ESPN). Na dúvida, não marca. Os canais das duas fontes se juntam; canal da ESPN ganha também o Disney+ Premium, e a NBA, o League Pass. Item escrito à mão nunca é alterado.
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

### O repasse da Cloudflare (e-sports e "acesso bloqueado")
O arquivo `repasse_cloudflare.js` é um worker gratuito da Cloudflare com duas funções (o passo a passo para criar está no começo do arquivo):

1. **E-sports:** o app pede `ENDEREÇO-DO-REPASSE/pandascore/...` e o repasse pede à PandaScore com a chave guardada como **segredo** do worker (`PANDASCORE_TOKEN`, em Settings > Variables and Secrets, tipo Secret). A chave nunca fica no código, no APK nem no GitHub. O repasse só aceita GET, só caminhos da PandaScore de CS2, Valorant e LoL (partidas, times, jogadores, torneios), e guarda cada resposta na memória para poupar o limite grátis (30 s para as partidas ao vivo, 2 min para as listas e as partidas, 1 h para as passadas e 1 dia para times e jogadores); o placar ao vivo do app vem das partidas ao vivo, então muda a cada 30 s. O endereço do repasse fica em `REPASSE_ESPORTS_PADRAO`, no `celular/direto.js`; para usar outro no celular, guarde-o em `localStorage["ss:esports"]`.
2. **"Acesso bloqueado" da ESPN:** se a ESPN recusar os pedidos vindos do navegador, abra o app uma vez com `?repasse=ENDEREÇO-DO-REPASSE/?url=` no fim do link. O endereço fica guardado no celular.

Mudou o `repasse_cloudflare.js`? Cole a versão nova no worker (Edit code > Deploy): o segredo continua lá.

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
├── fotos.json         # índice de fotos dos jogadores brasileiros (o robô monta)
├── kings.json         # Kings League: temporadas, times e jogos (o robô monta)
├── placar_nba.py       # script de terminal: placar do dia
├── box_score.py        # script de terminal: box score de um jogo
├── classificacao.py    # script de terminal: classificação das conferências
├── temporada.py       # temporada da NBA pela data
├── robo/              # robô diário: campeões (ESPN), lutas de boxe (Wikipédia), canais (guia de TV, futebolnatv, lista da NBA) e fotos (TheSportsDB)
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
    ├── chave_regras.js # regras da chave: fases, confrontos (ida e volta, séries), ordem e posições, Copa NBA
    ├── chave.js        # a chave em colunas, a aba Mata-mata/Playoffs e a aba Copa NBA (só no app)
    ├── notas_regras.js # regras da nota do Scoresports (futebol e NBA) e das cores
    ├── campinho_regras.js # regras do campinho: linhas de cada formação, lado espelhado, minutos jogados
    ├── campinho.js     # a escalação no campinho, com as notas
    ├── esports_regras.js # regras dos e-sports: partida da PandaScore, filtro do dia, grupos, bolinhas
    ├── esports.js      # telas dos e-sports: lista do dia, partida e time (só no app)
    ├── fotos_regras.js # regras das fotos dos jogadores (ESPN e TheSportsDB, sem homônimo)
    ├── fotos.js        # busca das fotos uma por vez, guardadas por 30 dias
    ├── visual_regras.js # regras das telas inspiradas no Sofascore (autores dos gols, forma, mini-classificação, temporada)
    ├── liga_regras.js   # regras da página da liga (temporada, destaques, números da temporada, maior campeão, divisões)
    ├── liga.js          # página da liga: cabeçalho e aba Detalhes
    ├── kings_regras.js  # regras da Kings League (estado do jogo, pênaltis, classificação pelo regulamento)
    ├── kings.js         # Kings League: lista do dia, jogo e página da liga
    └── fontes/         # fonte Inter (licença SIL OFL)
celular/
├── direto.js          # faz no celular o que o Python faz no PC
├── time_dados.js      # regras da página do time (elenco por posição, jogos, estatísticas, técnico)
├── regras_esportes.js # regras de MLB e NHL (placar ao vivo, série, pontuações, líderes)
├── sw.js, registrar.js, manifest.webmanifest, ícones
├── android.js         # botão voltar do Android (só no APK)
testes/                # testes das regras (time, busca, NBA, navegação, notas, campinho, e-sports, repasse), com amostras reais da ESPN, do Wikidata e da PandaScore
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

As regras do app (página do time, busca, chave, NBA, navegação, nota, campinho, e-sports e o repasse da Cloudflare) têm testes automáticos. Com o Node 18 ou superior instalado, rode na pasta do projeto:

```
node --test testes/*.test.js
```

Os testes do Python (robô e escalação do PC) rodam com o ambiente virtual ativado:

```
python -m unittest discover -s testes -p "*_teste.py"
```

## Configuração

A temporada da NBA é definida pela constante `TEMPORADA` (por exemplo, `"2026-27"`) no início do `nba_dados.py`. O `classificacao.py` tem a sua própria. Quando uma nova temporada começar, é só atualizar esse valor. Os outros esportes acompanham a temporada atual da ESPN sozinhos.

## O que se atualiza sozinho

| O quê | Como |
|-------|------|
| Jogos, placares, classificações, elencos | direto da ESPN, sempre |
| E-sports (partidas, mapas, elencos) | da PandaScore, pelo repasse da Cloudflare |
| Telas e dados no APK | o app baixa do GitHub Pages ao abrir e usa na próxima abertura |
| Campeões (`campeoes.json`) | o robô diário lê na ESPN quem ganhou cada temporada encerrada |
| Canais de TV e streaming (`transmissoes.json` > `jogos`) | o robô lê o guia de TV, o futebolnatv (dia e ligas) e a lista do mês da NBA, às 7h e às 15h |
| Kings League (`kings.json`) | o robô lê o kingsleague.pro duas vezes por dia e a cada 20 min nas noites de jogo |
| Fotos dos jogadores brasileiros (`fotos.json`) | o robô procura no TheSportsDB a foto de cada jogador da Série A e da Série B (até 240 por rodada; revê a cada 60 dias) |
| Lutas grandes de boxe (`boxe_eventos.json`) | o robô diário lê as fichas das lutas na Wikipédia (categorias "AAAA boxing matches"): acrescenta as lutas marcadas e completa os resultados |
| Temporada da NBA no PC | calculada pela data (`temporada.py`) |

O robô (`robo/`, `.github/workflows/robo.yml`) roda todo dia às 7h de Brasília. Para rodar na hora: aba **Actions > Robô diário > Run workflow**. Ele não apaga nem troca o que foi escrito à mão (só os próprios itens antigos ou que saíram da grade), e se a ESPN ou a Wikipédia estiverem fora do ar, não muda nada. As lutas novas entram sem horário e sem canal: complete à mão se quiser, e o robô não mexe no que você escreveu.

Ainda é à mão: o YouTube da NBA Brasil, que não tem fonte aberta, e as lutas de boxe que não têm artigo na Wikipédia.

Para testar o robô sem gravar nada: `python -m robo --seco`.

## Limitações conhecidas

- Os dados vêm de endpoints **não oficiais** da NBA e da ESPN. Eles podem mudar, ficar lentos ou bloquear consultas sem aviso. O cache ameniza isso, mas não elimina.
- Os recordes da temporada consideram apenas a **temporada regular**. Na carreira, há números de temporada regular e de playoffs.
- A ESPN não publica estatísticas de carreira de todos os atletas; quando falta, a página avisa.
- A Globo transmite só 15 dos 24 GPs de F1 em TV aberta, e quais são varia. O padrão aponta SporTV e Globoplay, que passam todos.
- A agenda de boxe fica no arquivo `boxe_eventos.json`. O robô acrescenta as lutas grandes que têm artigo na Wikipédia; as menores continuam à mão. O perfil dos lutadores depende de a Wikipédia ter uma página sobre eles.
- Os favoritos ficam guardados no navegador: em outro navegador ou celular eles começam vazios.
- Troca de dia: cada liga só é pedida à ESPN nos dias em que o calendário dela tem jogo (o calendário fica guardado 6 h), e cada dia já pedido fica na memória por um tempo curto. Num dia que nunca foi aberto, a lista pede cerca de metade do que pedia antes.
- Versão nova: o app Android baixa as telas novas ao abrir e, quando você sai e volta para ele, recarrega na versão nova (na mesma página). Na versão do navegador, o mesmo acontece quando o service worker novo assume.
- O técnico do time vem da Wikidata, e alguns clubes não são achados lá com segurança: aí ele não aparece.
- No futebol, a artilharia e as assistências vêm num pedido só (e valem para as copas, como a Libertadores); os cartões e as outras categorias chegam logo depois, pelo Core API.
- Líderes dos outros esportes, ranking do UFC, lutas e carreira no futebol usam o Core API da ESPN, que entrega os dados em vários pedaços. A primeira abertura de cada tela pode levar alguns segundos; depois fica no cache.
- Em algumas competições a ESPN não publica cartões entre os líderes; a página avisa quando isso acontece.
- A pré-temporada não aparece no calendário.
- A nota do Scoresports é uma conta do próprio app com as estatísticas que a ESPN publica (no futebol não há passes, desarmes nem minutos jogados, que saem das substituições). Ela se parece com a do Sofascore, mas não é igual.
- E-sports: o plano grátis da PandaScore não tem o nome do mapa, o placar de rounds nem o KDA. Um jogo ao vivo que começou antes da meia-noite aparece no dia em que começou.

## Próximos passos

- [ ] Opção de ver playoffs no calendário da NBA
- [ ] Mais esportes da ESPN (NHL, MLB, tênis)

A grade de transmissões automática saiu da lista: o robô dos canais lê o guia de TV e a lista do dia do futebolnatv (a ESPN não informa os canais do Brasil).

Sobre o CS: a HLTV não tem API oficial, e o site fica atrás do Cloudflare (as bibliotecas que existem raspam as páginas e levam bloqueio de IP), então fica de fora, como o Sofascore. O KDA do CS2 depende do GRID Open Access (parte F2).

## Aviso

Este projeto é de uso pessoal e educacional. Os dados pertencem às ligas, à ESPN e aos respectivos detentores, e o app não os redistribui nem os usa comercialmente.
