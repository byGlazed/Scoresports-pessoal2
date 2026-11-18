# Parte F (e-sports pela PandaScore) e parte H (campinho e notas)

Data: 2026-11-18. A parte E (Kings League) continua para depois. O dono pediu as duas desta folha juntas, a partir de três prints do Sofascore:
1. box score da NBA com as duas equipes juntas e a coluna de nota;
2. escalação do futebol no campinho, com a nota de cada jogador;
3. partida de CS2 com "Melhor de 3", os mapas com o placar e os elencos.

## Por quê

O dono quer o app mais perto do Sofascore, que é o que ele usa para comparar. Também quer acompanhar e-sports, principalmente os times brasileiros (o print é FURIA x Vitality na BLAST).

**Sucesso:**
- a aba Jogos mostra as partidas de CS2, Valorant e LoL do dia, com placar ao vivo;
- a página da partida de e-sports parece com o print 3 até onde os dados grátis deixam;
- a escalação do futebol aparece no campinho, com uma nota colorida por jogador e a média do time;
- o box score da NBA tem a nota e a visão com os dois times juntos.

## Fatos que moldam a solução (conferidos em 18/11/2026)

### PandaScore
- **Plano grátis ("Fixtures"):** listas de partidas por jogo, `/{jogo}/matches/upcoming`, `/past` e `/running` (o prefixo do CS2 é `csgo`). Também vêm times com elenco, jogadores, ligas, torneios e séries. São cerca de 1.000 pedidos por hora.
- **Só nos planos pagos:** o detalhe da partida por jogo (`/csgo/matches/{id}` é "Historical"), os jogos (mapas) de uma partida, o nome do mapa, o placar de rounds e as estatísticas por jogador (KDA). O Valorant pede o plano "Valorant Historical", separado. Fonte: https://developers.pandascore.co/docs/plan-reference.
- **Conferido com a chave de verdade em 18/11/2026, pelo repasse do dono (amostras em `testes/amostras/pandascore_*.json`):**
  - **Mapas:** as listas e o `/matches/{id}` trazem `games[]`, com `position`, `status`, `winner.id`, `length` (em segundos), `begin_at`, `finished` e `forfeit`. **O nome do mapa e o placar de rounds não vêm.** Exemplo: FURIA x Vitality (BLAST Rivals, Grupo A) tem os mapas 1 (VIT, 2413 s), 2 (FURIA, 3134 s) e 3 (FURIA, 1578 s), os mesmos 40/52/26 min do print do Sofascore;
  - **Endpoints:**
    - `/matches/{id}` funciona no grátis;
    - `/csgo/matches/{id}` e `/csgo/games/{id}` dão 403 (plano pago);
    - `/matches?filter[videogame]=cs-go,valorant,league-of-legends&range[begin_at]=…` traz o dia dos três jogos num pedido só (71 partidas em 17/11, uma página de 100);
    - `/matches/running?filter[videogame]=…` traz o ao vivo dos três num pedido só;
    - `filter[id]`, `filter[opponent_id]` e `filter[status]` funcionam;
  - **Valores reais:**
    - `videogame.slug`: `cs-go`, `valorant`, `league-of-legends`;
    - `tournament.tier`: de `s` a `d`;
    - `opponent.location`: país ISO, "BR" para FURIA;
    - `status`: `not_started`, `running`, `finished`, `canceled`, `postponed`, além de `forfeit`;
    - `results`: `[{team_id, score}]`;
    - `streams_list`: `[{language, raw_url, official, main}]`;
  - **Time:** `/teams/{id}` traz `players` com `name` (nick), `first_name`, `last_name`, `nationality` e `image_url` (às vezes nulo).

  O que não vem (nome do mapa, placar de rounds, KDA) não aparece.
- **A chave não pode ir no código nem no APK:** o repositório é público (decisão da parte D).

### GRID Open Access (para depois)
Oficial e grátis para fãs. Tem dados históricos de CS2 e Dota 2 com estatísticas de jogador, de torneios selecionados e depois do jogo, sem ao vivo. Precisa de inscrição e aprovação. O dono vai se inscrever. Quando aprovar, uma parte F2 liga os mapas e o KDA do CS2. https://grid.gg/open-access/

### ESPN (futebol e NBA)
- **Escalação do futebol:** o `summary` traz `rosters[].formation` ("3-4-2-1") e, por titular:
  - `formationPlace` (1 a 11);
  - a posição com o lado (`G`, `CD-L`, `CD-R`, `CM-L`, `LM`, `RM`, `CF-L`, `F`…);
  - `starter`, `subbedIn` e `subbedOut`.
- **Números por jogador no futebol:** gols, assistências, chutes, chutes no gol, faltas cometidas e sofridas, impedimentos, cartões e gol contra. O goleiro ainda tem defesas (`saves`) e gols sofridos (`goalsConceded`). Não vêm minutos jogados, mas os lances (`keyEvents`) dão o minuto de cada substituição.
- **Box score da NBA:** a ESPN dá MIN, PTS, FG, 3PT, FT, OREB, DREB, REB, AST, STL, BLK, TO, PF e +/-. Hoje o app (`linhaBox` em `nba_quadra.js`) guarda tudo menos OREB e DREB.
- **Nota:** nenhuma fonte grátis dá a nota do Sofascore, que é deles. A nota do app é calculada pelo próprio app.

### O app hoje
- **Onde ficam as telas:** são as mesmas para o PC e para o app (`static/`). O app responde às rotas no próprio celular (`celular/direto.js`). `gerar_celular.py` copia tudo para `docs/` e para o pacote do APK.
- **O APK:** desvia para o Android só os pedidos à ESPN, à Wikipédia e ao Wikidata. Um pedido ao repasse da Cloudflare (`*.workers.dev`) sai pela WebView normal. Basta o repasse responder com `Access-Control-Allow-Origin: *`, então **não precisa de APK novo**.
- **O repasse:** `repasse_cloudflare.js` já existe. Ele repassa ESPN e Wikipédia por `?url=` e é configurado no celular com `?repasse=`.

## Abordagens consideradas (e-sports)

1. **O app pede ao repasse da Cloudflare, e o repasse pede à PandaScore com a chave guardada como segredo do worker (escolhida).** É ao vivo e grátis, e a chave nunca sai da Cloudflare. O dono já criou a conta.
2. **O robô diário do GitHub, com a chave nos *secrets*, publica um JSON no Pages.** Descartada: sem placar ao vivo, e um commit a cada poucos minutos.
3. **A chave dentro do app.** Descartada: o repositório é público e a chave vazaria.

Para os mapas e o KDA, o dono escolheu: **PandaScore grátis agora + GRID para o CS2 quando aprovar** (e não o plano pago).

---

## Parte F: e-sports

### Decisões do dono
- **Jogos:** Counter-Strike 2, Valorant e League of Legends.
- **Quais partidas aparecem:** torneios de nível S e A; mais as partidas de **times brasileiros** em qualquer torneio; mais as dos **times favoritos**.
- **Mapas e KDA:** só o que o plano grátis dá. O KDA do CS2 entra na F2, pelo GRID.

### 1. O repasse (Cloudflare)
- **O que já existe continua igual:** o mesmo `repasse_cloudflare.js` repassa ESPN e Wikipédia por `?url=`.
- **Caminho novo `/pandascore/<caminho>?<parâmetros>`:**
  - pede `https://api.pandascore.co/<caminho>` com `Authorization: Bearer` e a chave tirada de `env.PANDASCORE_TOKEN` (segredo do worker);
  - aceita só GET, e só caminhos que começam por `csgo/`, `valorant/`, `lol/`, `matches`, `teams`, `players`, `tournaments`, `leagues` ou `series`;
  - devolve só o corpo e o status, sem repassar cabeçalhos da PandaScore que revelem a chave.
- **Poupar o limite (decisão do construtor):**
  - **O que não funciona:** a Cache API da Cloudflare não faz nada em endereços `*.workers.dev`; ela só vale com domínio próprio (https://developers.cloudflare.com/workers/runtime-apis/cache/). O dono não tem domínio.
  - **No repasse:** uma memória curta dentro do próprio worker (um `Map` global, por tentativa). Os tempos são:
    - `running`: 30 s;
    - listas do dia e próximas: 2 min;
    - listas passadas: 1 h;
    - times e jogadores: 1 dia.

    Se a "Workers Caching" nova da Cloudflare funcionar no `workers.dev` sem configuração, o construtor pode usar.
  - **No app:** a atualização ao vivo dos e-sports pede só as partidas em andamento (`running`), a cada **30 s**. Ela só roda com uma partida ao vivo na tela e o app aberto. As listas completas do dia são pedidas ao abrir a tela e guardadas no banco do celular.
  - **Conta:** 3 pedidos a cada 30 s dão cerca de 360 por hora num celular, abaixo dos ~1.000. Se `/matches/running` aceitar filtrar pelos três jogos de uma vez, cai para 1 pedido.
- **Passo a passo para o dono, no começo do arquivo:**
  1. Workers & Pages, abrir o worker (ou criar), Edit code, colar e Deploy.
  2. Settings > Variables and Secrets > Add, tipo **Secret**, nome `PANDASCORE_TOKEN`, valor = a chave. Deploy.
  3. Mandar o endereço do worker.

  Quem cola a chave é o dono. O Claude nunca vê nem digita a chave.
- **O endereço do worker** não é segredo. Ele fica numa constante do app, para funcionar no celular e no APK sem configurar nada. O `?repasse=` continua valendo para a ESPN.

### 2. Dados no app (`celular/direto.js`)
- **Rotas novas, no mesmo estilo das outras:**
  - `/esports/jogos?de=AAAA-MM-DD`: as partidas do dia, no fuso de Brasília, dos três jogos;
  - `/esports/jogos/<id>`: a partida;
  - `/esports/times/<id>`: o time, com o elenco e as últimas e próximas partidas.
- **A partida, já traduzida para o formato do app:**
  - os dois times (nome, sigla, logo, país);
  - o placar da série e o estado (a jogar, ao vivo, encerrado, adiado/cancelado);
  - "Melhor de N", o torneio, a liga, a fase e a hora;
  - a lista de mapas, se vier (posição, vencedor, duração, estado);
  - as transmissões (`streams_list`, com as em português primeiro).
- **Filtro do dia:** tier S ou A; ou algum dos times com país "BR"; ou algum time favorito. Os favoritos ficam no `localStorage`, e o construtor decide se o filtro deles fica na tela ou na rota.
- **Cache:** guarda no banco do celular como os outros esportes (o `viaEspn` ou um equivalente), com o mesmo TTL curto ao vivo. Sem internet, mostra o que estava guardado.
- **Mensagens de erro claras:**
  - repasse não configurado;
  - chave errada ou faltando (401/403);
  - limite estourado (429): "volte em alguns minutos".

### 3. Aba Jogos
- **Chip novo "E-sports"**, depois dos esportes atuais. O e-sports também entra em "Todos".
- **Agrupado por torneio,** no formato "CS2 · BLAST Rivals · Grupo A", com o ícone do jogo e as ao vivo primeiro.
- **Linha da partida:** logos e nomes dos times, placar da série, e o estado: ao vivo (com "Mapa 2" se der para saber), a hora, ou encerrado. Tem também "MD3".
- **Atualização:** a cada 30 s enquanto houver partida ao vivo; nos outros esportes são 20 s. É para caber no limite grátis (veja o item 1).
- **Onde aparece (decisão do construtor):** só no app e na pasta `docs/`, como a chave da parte G. No site do PC (servidor Python), o chip não aparece.

### 4. Página da partida (o print 3)
- **Topo:** logos, o placar da série (2-1) e o estado; tocar no time abre a página do time.
- **Aba Detalhes:**
  - a linha do torneio (jogo · torneio · fase);
  - "Melhor de 3", com uma bolinha por mapa vencido de cada lado, cheia ou vazia;
  - **mapas:** um cartão por mapa ("Mapa 1", ou o nome se vier), com quem venceu em destaque, a duração e a hora de início. Ainda **não abre nada ao tocar**; na F2 abre o KDA;
  - onde assistir: os canais da `streams_list`, como links.
- **Aba Elencos:** os jogadores dos dois times lado a lado, como no print: foto, nick e nome verdadeiro, vindos de `/teams/{id}`.
- **Se a PandaScore grátis não der os mapas:** a aba mostra só a série e o aviso "Os mapas desta partida não vêm na versão grátis dos dados." Nada é inventado.

### 5. Página do time de e-sports
Logo, nome, país e jogo, mais o elenco com foto, nick, nome e país. Também mostra as últimas e as próximas partidas, que abrem a partida. Tem a estrela de favorito.

### 6. Favoritos
- A estrela em times de e-sports.
- A aba Favoritos mostra, no dia, as partidas dos times de e-sports favoritos, e "Seus favoritos" lista o time.

---

## Parte H: campinho e notas

### 1. Notas (arquivo puro com testes, como `chave_regras.js`)
- **Escala de 3,0 a 10,0,** com uma casa decimal. A média do time tem duas casas, como "7.40" no print.
- **Cores por faixa, iguais em todo o app:**

  | Faixa | Cor |
  |---|---|
  | < 6,0 | vermelho |
  | 6,0 a 6,4 | laranja |
  | 6,5 a 6,9 | amarelo |
  | 7,0 a 7,9 | verde |
  | 8,0 a 8,9 | verde-azulado |
  | ≥ 9,0 | azul |

  O texto precisa ficar legível nos dois temas.
- **Explicação ao tocar no ⓘ:** "Nota do Scoresports, calculada pelo app a partir das estatísticas do jogo. Não é a nota do Sofascore."
- **Futebol:**
  - parte de 6,5;
  - soma:
    - gols (mais para goleiro e defensor);
    - assistências;
    - chutes no gol;
    - faltas sofridas;
    - vitória do time;
    - jogo sem sofrer gol (goleiro e defensor);
    - defesas do goleiro;
  - tira:
    - faltas cometidas;
    - cartões (o vermelho pesa muito);
    - gol contra;
    - gols sofridos (goleiro);
    - derrota.

  **Os pesos ficam com o construtor**, mas os testes precisam passar nestas âncoras:
  - titular sem nada de especial num empate: entre 6,3 e 6,8;
  - atacante com 1 gol numa vitória: entre 7,4 e 8,2;
  - três gols: 9,0 ou mais;
  - expulso: 5,5 ou menos;
  - goleiro com 5 defesas e 3 gols sofridos numa derrota: entre 5,8 e 6,8.

  Os minutos saem das substituições nos lances. Quem jogou menos de 10 minutos fica sem nota ("–"). A nota anda junto com o jogo ao vivo.
- **NBA:**
  - a nota vem do Game Score (Hollinger), convertido para a escala de 3 a 10;
  - por isso o app passa a guardar OREB e DREB;
  - **âncoras:** o jogo do print 1 está na ESPN (evento `401910006`, LAC 107 x 132 UTAH, 17/11/2026). O construtor salva o `summary` em `testes/amostras/` e testa os 10 jogadores do print, com tolerância de ±0,4:

    | Jogador | Game Score | Nota do print |
    |---|---|---|
    | Sensabaugh | 35,6 | 9,4 |
    | K. George | 29,0 | 8,4 |
    | Lopez | 19,3 | 7,5 |
    | Hachimura | 17,1 | 7,4 |
    | Garland | 16,8 | 7,3 |
    | Bamba | 16,5 | 7,5 |
    | Okogie | 10,4 | 7,2 |
    | Wagler | 10,3 | 6,8 |
    | Peterson | 8,1 | 6,6 |
    | J. Green | 4,6 | 6,3 |

  - **conversão:** nota = 5,9 + 0,095 × Game Score, entre 3 e 10. Ela acerta todos esses com erro de até 0,3 (5,85 + 0,1 errava o K. George por 0,4 depois do arredondamento);
  - menos de 5 minutos: sem nota.
- **Outros esportes (NFL, MLB, NHL):** sem nota nesta parte.

### 2. Campinho (futebol)
- **Um cartão por time,** o mandante primeiro. O cabeçalho tem o escudo, o nome, a média das notas com o ⓘ e a formação.
- **O campinho:** meio campo em pé, com o goleiro em cima e o ataque embaixo, como no print 2. Os titulares ficam em linhas, conforme a formação.
- **Lado:** o desenho é visto de cima, com o time atacando para baixo. Então **o lado esquerdo do time aparece à direita de quem olha**, como no print 2: lá o Pyrka, lateral direito, está à esquerda da tela, e o Zalewski, que joga pela esquerda, está à direita. Os dois cartões usam o mesmo sentido.
- **Cada jogador mostra:**
  - foto, se a ESPN tiver; senão, um círculo com o número;
  - a nota colorida;
  - "número + nome curto";
  - ícones de gol, assistência, cartão amarelo ou vermelho e substituído.

  Tocar abre a página do atleta, como hoje.
- **Onde cada um fica:**
  - pela formação e pelo `formationPlace`, no padrão da Opta, que a ESPN usa;
  - o lado (`-L`, `-R`, `LB`, `RM`…) confirma a esquerda e a direita;
  - o construtor salva amostras reais das formações mais comuns (4-3-3, 4-2-3-1, 4-4-2, 3-5-2, 3-4-2-1, 5-3-2, 4-1-4-1, 4-4-1-1) e testa a posição de cada uma;
  - formação desconhecida ou dado faltando: volta para a lista atual, em vez de desenhar errado.
- **Embaixo do campo:**
  - os reservas que entraram, com o minuto, quem saiu e a nota;
  - depois os que não entraram.
- **Antes do jogo:** com a escalação divulgada, o campinho aparece sem notas.
- **Onde vale:** o campinho aparece no app e também no site do PC. Para isso, `espn_dados.py` passa a mandar `formationPlace`, os minutos e as estatísticas que a nota usa, igual ao `direto.js`.

### 3. Box score da NBA (no app)
- **Seletor no topo:** [time da esquerda] [os dois] [time da direita], como no print 1. A visão "os dois" é a que abre.
- **Visão "os dois":** todos os jogadores numa tabela só, com o logo pequeno do time em cada um e a ordem por pontos. Continua ordenável por qualquer coluna.
- **Coluna "Nota"** antes de MIN, com o selo colorido. Ela também ordena.
- **Visão de um time:** a de hoje (titulares, reservas e total), com a coluna de nota.
- **Fora disto:** o módulo próprio da NBA no PC (`app.js` com `nba_api`) não muda.

---

## Ordem de construção
1. **Repasse:** o arquivo novo e o passo a passo. O dono configura a chave enquanto o resto anda.
2. **Parte H:** campinho, notas e box score. Não depende de nada de fora.
3. **Parte F:** começa conferindo as respostas reais da PandaScore pelo repasse do dono e salvando amostras em `testes/amostras/`; depois vêm as regras com testes e as telas.
4. `python gerar_celular.py`, conferência no navegador em 375×812 (claro e escuro), README e push na `main`.

## Fora desta parte
- O KDA e os nomes dos mapas pelo GRID (parte F2, quando a inscrição for aprovada).
- Dota 2 e outros jogos.
- A busca de times e jogadores de e-sports na aba Pesquisa.
- A página do torneio de e-sports (classificação e chave).
- Notas da NFL, MLB e NHL.
- O módulo NBA do PC.
- Kings League (parte E).

## Anti-objetivos (falhou, mesmo que funcione)
- A chave da PandaScore aparecer em qualquer arquivo do repositório, no APK, numa resposta do repasse ou no chat.
- O repasse virar um proxy aberto (qualquer endereço) ou deixar de repassar a ESPN como hoje.
- Mostrar dado inventado: nome de mapa, placar de rounds ou KDA que não vieram de uma fonte.
- A nota parecer a do Sofascore.
- Jogador no lugar errado do campinho, por exemplo o time inteiro espelhado em relação ao print 2. Na dúvida, mostrar a lista.
- O app estourar o limite da PandaScore com atualizações sem cache.
- Precisar de APK novo.
- Perder favoritos ou o banco do celular.
