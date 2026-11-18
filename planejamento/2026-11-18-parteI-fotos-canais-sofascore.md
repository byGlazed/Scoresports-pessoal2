# Parte I: canais automáticos, fotos dos jogadores e visual inspirado no Sofascore

Data: 2026-11-18, logo depois das partes F e H.

## Por quê

O dono pediu três coisas:
1. **Canais automáticos:** "onde vai passar" se atualizando sozinho, em todos os esportes. Por exemplo, um jogo da NBA no ESPN 2 aparecia só com "NBA League Pass".
2. **Fotos:** a foto de cada jogador no campinho e nas estatísticas dos jogadores.
3. **Visual:** inspirar-se nas telas do Sofascore para melhorar o app. Ele escolheu quatro áreas: lista de jogos, partida, jogador e time, e campeonato.

## Fatos (conferidos hoje)

### Canais de TV
- **A ESPN não serve:** a ESPN não tem a grade do Brasil. O site da ESPN, mesmo com `region=br`, só traz canais dos EUA ("ESPN", "CBS", "DAZN CLE"…). O calendário da ESPN Brasil vem com os canais vazios.
- **O guia de TV serve:** o **guia de TV meuguia.tv** tem a programação de cada canal, com dia, horário, título e categoria. Exemplo do ESPN 2 hoje: "21:12 · NBA: Milwaukee Bucks x Miami Heat - Ao Vivo · Esporte/Basquete". Também lista NFL, NHL, NBB, rugby e futebol, com reprises marcadas como "VT -".
- **Escolha do dono:** o robô diário lê esse guia.

### Fotos
- **Futebol:** a ESPN tem foto de só 4 dos 22 titulares de Crystal Palace x Liverpool.
- **TheSportsDB (gratuito, CORS aberto, chave de teste `123`):** tem foto recortada (`strCutout`) e miniatura (`strThumb`) de quase todos os que testei (Henderson, Wharton, Kamada, Gustavo Gómez, Pedro, Arrascaeta). A busca é pelo nome e pode trazer homônimos; por isso o time ajuda a escolher.
- **NBA:** a ESPN tem foto de todos os jogadores (`a.espncdn.com/i/headshots/nba/players/full/{id}.png`).

### Sofascore (telas vistas no site, em 375 px)
- **Lista do dia:** cada campeonato tem bandeira e país, um contador de jogos ("6", ou "4/6" em vermelho quando há jogos ao vivo) e pode ser recolhido.
- **Partida:**
  - a data numa "pílula" no topo;
  - os autores dos gols embaixo de cada time ("Alexander Isak 89'", "(Pên.)");
  - uma linha do tempo com o placar em destaque nos gols e as substituições com setas;
  - um bloco "Informações" (data, campeonato, público, árbitro, estádio).
- **Escalação:** o técnico e a lista "Substituições" com "60' Saiu: Q. Timber".
- **Time:** uma aba "Visão geral" com o próximo jogo em destaque, a forma recente (os últimos 5 em placas coloridas V/E/D) e uma mini-classificação com o time e os vizinhos.
- **Campeonato:** uma barra de progresso da temporada (início e fim), a classificação com faixas coloridas por zona e uma legenda.
- **Jogador:** a foto redonda, um cartão do clube e "Informações gerais" em blocos (nacionalidade com bandeira, idade, altura, posição, camisa).
- **Nota do futebol:**
  - no mesmo Crystal Palace 1 x 3 Liverpool, o Sofascore dá média de 7,02 ao Palace e 6,70 ao Liverpool, e 8,1 ao goleiro Henderson (5 defesas);
  - a nossa conta deu 6,23, 7,09 e 6,3. A nossa pesa demais o resultado e de menos as defesas.

## Decisões

### 1. Canais automáticos (robô)
- **`robo/transmissoes.py`,** no padrão dos robôs dos campeões e do boxe:
  - `atualizar(arquivo, hoje)` lê o guia de TV de hoje e dos próximos dias dos canais esportivos: ESPN, ESPN 2, ESPN 4, SporTV, SporTV 2, SporTV 3, Premiere, Band, BandSports, Globo e outros que o guia tiver;
  - fica só com os programas "Ao Vivo" (nada de "VT -").
- **Como acha o jogo:** pelo título e pela categoria.
  - "NBA: A x B" vira NBA; o mesmo vale para NFL, NHL, MLB e NBB;
  - "A x B" com categoria Esporte/Futebol vira futebol.
  - Os times são cruzados com os jogos do dia da ESPN (a mesma fonte do app), pelo nome e pela hora (com tolerância). O jogo que não bate com nenhum é ignorado.
- **Grava em `transmissoes.json` > `jogos`:** `fonte: "guia de TV"`, `conferido_em` e `canais`.
  - Canal da ESPN ganha também "Disney+ Premium", que transmite o que passa na ESPN.
  - O robô **nunca mexe** num item escrito à mão.
  - Os itens dele com mais de 3 dias saem.
- **Quando roda:** o `robo.yml` passa a rodar também à tarde (às 7h e às 15h de Brasília), porque a grade da noite às vezes sai no mesmo dia.
- **Bom vizinho:**
  - um pedido por canal e por dia, com pausa, e com o User-Agent do robô;
  - antes de começar, o robô confere o `robots.txt` e não lê o que for proibido;
  - se o guia falhar, não muda nada.
- **No app:**
  - toda linha de jogo de qualquer esporte mostra o canal quando há grade confirmada;
  - a página da partida mostra "Onde assistir no Brasil" em todos os esportes;
  - nos e-sports, a transmissão em português aparece na linha.

### 2. Fotos
- **Futebol:** a foto vem, nessa ordem:
  1. da ESPN, quando vem no roster;
  2. do **TheSportsDB**, pelo nome, escolhendo o resultado do mesmo time (ou o único do futebol);
  3. senão, o número da camisa.

  A busca fica guardada no banco do celular por 30 dias, vai uma de cada vez e as fotos entram aos poucos, depois que o campinho já está na tela.
- **Onde aparece:** no campinho, nos reservas, no cabeçalho da página do jogador e nos elencos da página do time.
- **NBA:** a foto da ESPN em cada linha do box score (como no print 1) e no cabeçalho do jogador.
- **README:** dá o crédito ao TheSportsDB.

### 3. Visual (escolhas do construtor, dentro do que os dados permitem)
- **Lista do dia:**
  - o contador no cabeçalho de cada campeonato ("6", ou "2/6" em vermelho com ao vivo);
  - o grupo pode ser recolhido, e isso fica guardado;
  - o minuto ao vivo aparece em vermelho.
- **Partida:**
  - a data em pílula no topo;
  - os autores dos gols embaixo de cada time no placar;
  - na linha do tempo, o placar em pílula nos gols e as setas verde e vermelha nas substituições;
  - na escalação, o técnico quando vier e as substituições com "Saiu: X".
- **Time:** uma aba "Visão geral", primeiro, com o próximo jogo em destaque, a forma recente (5 placas V/E/D com o placar) e a mini-classificação (o time e dois vizinhos de cada lado).
- **Campeonato:**
  - a barra de progresso da temporada (pelas datas da ESPN);
  - na classificação, as zonas com uma faixa colorida e o nome da zona, mais uma legenda.
- **Jogador:** o cabeçalho com foto redonda e o cartão do clube, e "Informações gerais" em blocos (com o que a ESPN der: país, idade, altura, peso, posição, camisa).
- **Nota do futebol recalibrada,** com teste no jogo real Palace x Liverpool que já está em `testes/amostras/`:
  - a média dos dois times fica a até 0,35 da do Sofascore (7,02 e 6,70);
  - o goleiro com 5 defesas fica com 7,3 ou mais.

  As âncoras antigas do goleiro mudam para isso, porque a do desenho era um palpite e esta é real.

### 4. Carregamento rápido (adendo do dono, 18/11)
O dono pediu: "os jogos demoram para carregar, e trocando de página e voltando demora de novo; deixar o tempo de resposta mínimo, como no Sofascore".

Primeiro **medir** onde o tempo vai: os pedidos à ESPN, o banco do celular e o desenho. Depois:
- **Mostrar o que já tem na hora:** a tela desenha o que está guardado no banco do celular e atualiza em segundo plano (*stale-while-revalidate*). Ao voltar para uma página, ela aparece como estava, sem "Carregando…".
- **Não refazer o que já está pronto:** a página que fica na pilha guarda o desenho, e voltar não pede tudo de novo se os dados ainda valem.
- **Menos pedidos:** em "Todos", juntar ou adiantar os pedidos das ligas, e priorizar as que têm jogo no dia ou ao vivo.
- **Abrir mais rápido:** o service worker serve as telas na hora, sem esperar a rede.

**Meta:** a lista do dia e a volta de página aparecem em menos de 300 ms quando já há dado guardado. Na primeira vez, aparecem assim que a primeira liga responde.

## Ordem de construção (para quem continuar)
1. Robô dos canais (`robo/transmissoes.py`, com testes sobre amostras salvas do guia de TV), mais o `robo.yml` às 7h e às 15h.
2. Fotos: o TheSportsDB no `direto.js` com cache, no campinho, no jogador e no elenco; a ESPN no box score da NBA.
3. Nota do futebol recalibrada (teste com Palace x Liverpool).
4. Carregamento rápido (medir antes e depois).
5. Visual: lista, partida, time, campeonato e jogador.
6. `python gerar_celular.py`, testes, conferência no navegador em 375 px, README, commit sem coautor e push na `main`.

## Fora desta parte
- O gráfico de "momento" e o mapa de calor (não há dado aberto).
- As notas por jogo no histórico do jogador.
- O radar de atributos.
- O valor de mercado.
- O streaming que não passa na TV (Prime Video, CazéTV, Max): continua no padrão da competição.

## Anti-objetivos
- O robô apagar ou trocar um item escrito à mão em `transmissoes.json`.
- Canal errado num jogo, por cruzar times parecidos ("Atlético" x "Athletico"). Na dúvida, o jogo fica sem a grade.
- A foto de outro jogador com o mesmo nome. Na dúvida, fica o número.
- Estourar o limite do TheSportsDB: as buscas vão uma de cada vez e ficam guardadas.
- Nada pode exigir APK novo.
