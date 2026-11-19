# Parte J: página da liga como no Sofascore, canais com streaming, mais velocidade e os pequenos da parte I

Pedido do dono (19/11): corrigir os pequenos que ficaram para depois; ao pesquisar uma liga, ir direto para
a página dela com um menu igual ao do Sofascore; deixar o carregamento ainda mais rápido; e mostrar onde
passa cada jogo também na Globo, Prime Video, Xsports, HBO Max, Disney+, CazéTV, SportyNet, SporTV 1/2/3,
ge tv e o YouTube da NBA Brasil. Perguntou também se dá para usar a API da HLTV no CS.

O dono deu permissão permanente para seguir sem pedir aprovação (18/11), e aprovou o uso do futebolnatv
(19/11, depois de saber dos termos de uso).

## 1. Página da liga (Sofascore)

Referência: a página de torneio do Sofascore no celular (vista em 19/11 no Brasileirão 2026):
- cabeçalho com o escudo, o nome, o país, a temporada e a barra de progresso com as datas de início e fim;
- abas sublinhadas que rolam para o lado: Classificação, Detalhes, Partidas, Estatísticas, Mídia;
- Detalhes: jogo em destaque, os melhores jogadores, títulos (últimos campeões e quem tem mais),
  divisão inferior e números da temporada (gols, média de gols, empates).

No app:
- **Pesquisa:** uma competição vira uma linha igual às de times e jogadores. O toque abre a página da liga,
  sem os botões de classificação e líderes no meio.
- **Cabeçalho da liga** em toda página de liga: escudo, nome, "país · temporada" e a barra da temporada.
  O escudo e as datas vêm do scoreboard da ESPN (`leagues[0]`), que a rota `/datas` já busca; ela passa a
  devolver também `liga: {nome, logo, temporada, inicio, fim}`. Sem esses dados (PC, F1, UFC, boxe), fica só o nome.
- **Abas:** Classificação, Detalhes, Jogos, Estatísticas (antes "Líderes" ou "Artilharia e cartões"),
  Mata-mata/Playoffs e Copa NBA quando houver. A barra da temporada sai da aba Classificação e vai para o cabeçalho.
- **Detalhes:** ao vivo ou próximos jogos e os últimos resultados; os 3 primeiros da primeira categoria de
  líderes, com "Ver tudo"; números da temporada (só no futebol, pela classificação); títulos (campeoes.json,
  com o maior campeão da lista); divisão superior ou inferior (Série A ↔ Série B).
- Mídia fica de fora: não há fonte aberta de vídeos.

## 2. Onde passa (streaming)

Causa: o guia de TV (meuguia.tv) tem só 12 canais esportivos e nenhum streaming. São Paulo x Fluminense
aparecia só com "Globo", e o futebolnatv mostra Globo, Premiere 2 e ge tv.

- O robô dos canais passa a ler também a lista do dia do futebolnatv.com.br (hoje e amanhã). O robots.txt
  libera tudo. Lê só o horário (`data-ts`), os dois times e os canais. Os termos pedem para não copiar
  o conteúdo, e o dono aprovou mesmo assim.
- Os canais das duas fontes se juntam no mesmo item (fonte "guia de TV"), com os nomes padronizados:
  Globo, SporTV 1/2/3 (SporTV vira "SporTV"), Premiere (Premiere 2…7 entram como estão), ge tv, CazéTV,
  Prime Video, HBO Max, Disney+, Xsports, SportyNet, Paramount+, Apple TV…
- O casamento com a ESPN continua igual: mesmo par de times, a até 75 min, e só se houver um jogo.
- NBA: o guia continua marcando a ESPN; o padrão da NBA passa a citar Prime Video e o YouTube da NBA Brasil
  na observação. Não há fonte aberta da grade deles.

## 3. Velocidade

- **Escudos pequenos:** os escudos da ESPN vêm com 500 px (cerca de 110 KB cada). Uma lista com 100 times
  baixava cerca de 11 MB. Pelo redimensionador da própria ESPN (`a.espncdn.com/combiner/i?img=…&w=&h=`),
  cada um cai para cerca de 5 KB. O mesmo vale para as fotos da NBA.
- `preconnect` para a API e para as imagens da ESPN no index.html.
- Ao mostrar um dia na aba Jogos, o dia seguinte e o anterior são buscados quando o celular fica ocioso,
  e trocar de dia sai na hora.

## 4. Os pequenos da parte I

1. Pausa nas buscas de fotos quando o TheSportsDB responde 429 (1 min, dobrando até 8 min).
2. Grupo recolhido guardado por esporte e liga, não só pelo título.
3. Fotos da NBA no tamanho da tela (redimensionador da ESPN).
4. Robô: a data de hoje em Brasília, mesmo rodando de madrugada no UTC, e os jogos depois da meia-noite
   procurados também no dia anterior da ESPN.
5. README: o robô não apaga o que foi escrito à mão (no lugar de "nunca apaga").
6. Mini-classificação: a posição vem da tabela inteira, mesmo quando a ESPN não manda o rank.
7. Chaves novas no cache (resumo, classificação, datas), para os resumos antigos sem "Saiu:" sumirem.
8. Contraste: o texto da vitória no tema escuro.
9. Faltas da parte I: a data em pílula no topo da partida, o técnico na escalação, as fotos no elenco
   e o cartão do clube no cabeçalho do jogador.

## HLTV

Não tem API oficial. As bibliotecas que existem raspam o site, que fica atrás do Cloudflare e bane IPs.
É o mesmo caso do Sofascore, então fica de fora. O KDA do CS continua dependendo do GRID (parte F2).

## Rodada 2 (19/11, à noite): o que o dono achou ao usar

- **Prime Video na NBA:** a ESPN só informa os canais dos EUA. A fonte é a lista do mês do gameoverdrive.com.br
  (tabelas por dia, robots.txt liberado), que confirma, por exemplo, Clippers x Spurs no Prime Video.
- **CazéTV na LaLiga:** a lista do dia só cobria hoje e amanhã, e o resto caía no padrão (ESPN). O robô lê também
  a página de cada liga do futebolnatv (a rodada inteira), e o padrão da LaLiga passa a ser a CazéTV.
- **Artilharia vazia:** o celular estava na versão antiga (o APK só troca a versão quando o Android fecha o app).
  A página agora confere a versão ao voltar para o app e recarrega. Nas copas (Libertadores, Copa da Liga,
  Copa do Rei) o Core API só tem números por fase: a artilharia e as assistências vêm do /statistics da ESPN,
  num pedido só (antes, de 3 a 5 s), e os cartões chegam depois.
- **Fotos demorando:** uma busca a cada 2,1 s (46 jogadores, cerca de 90 s). Agora as buscas saem em rajada
  (até 4 ao mesmo tempo, 25 por minuto) e o robô monta um índice das fotos da Série A e da Série B (fotos.json).
- **Página do time:** não espera mais a Wikidata (o técnico vem à parte).
