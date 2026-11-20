# Parte K: Kings League (Brasil e os Mundiais) e a troca de dia mais rápida

Pedido do dono (20/11): "dá para melhorar o tempo de resposta de quando clico num dia ou volto um dia? Tá muito
lento ainda, e adicione a Kings League Brasil e o Mundial da KL no app, crie um robô se necessário."
O dono deu permissão permanente para seguir sem pedir aprovação; as escolhas de como fazer são minhas.

## 1. Troca de dia

Medido no navegador do PC: com o dia já guardado, 0,1 a 0,2 s; um dia nunca aberto, 0,9 s. No APK cada pedido à
ESPN passa pelo Android, um por um, e a lista de um dia de futebol pedia cerca de 80 scoreboards (as ~40 ligas,
cada uma no dia e no dia anterior, por causa dos jogos depois da meia-noite). A ESPN não aceita intervalo de datas
(responde 400).

- Cada liga só é pedida nos dias em que o calendário dela (rota /datas, guardada 6 h) tem jogo. Sem calendário
  guardado, ou com o dia fora dele (outra temporada), pede tudo, como antes. Regra pura: diasParaPedir
  (celular/regras_esportes.js), com teste. Conferido em 4 dias: o mesmo número de jogos com e sem o filtro.
- Cada scoreboard de um dia fica na memória por 45 s (30 min para dias passados): o dia anterior que a lista
  de um dia pede é o dia que a lista anterior já pediu.
- Resultado: um dia nunca aberto pediu 37 scoreboards (antes, mais de 80 só no futebol); o seguinte, 11.

## 2. Kings League

Fonte: o site oficial kingsleague.pro. A página de cada competição (/pt/brazil, /pt/world-cup, /pt/kwc-nations,
liberadas no robots.txt) traz os dados embutidos (o payload do Nuxt): temporada atual, times (nome, sigla,
escudo) e jogos (data, estado, placar, placar de cada tempo, pênaltis, vídeo no YouTube). As páginas de cada jogo
(*/jogos/, */matches/...) o robots.txt proíbe, e ficam de fora. A página de classificação monta a tabela no
navegador, então o app calcula pelos jogos.

- **Robô** robo/kings.py → kings.json, junto com o robô diário e, nas noites de jogo, a cada 20 min pelo
  workflow kings.yml (segunda 17h–21h40 e domingo 11h–17h40, horário de Brasília). Sem página, fica como estava.
- **Regras** (static/kings_regras.js): estado do jogo, vencedor nos pênaltis, rodadas em português e a
  classificação pelo regulamento oficial (notícia "o que cada time precisa na Rodada 5"): cada vitória vale
  um ponto, inclusive nos Shootouts, e os gols da disputa não entram no placar; os jogos do Challenger não
  contam; desempate pelo confronto direto (vitórias, saldo, gols), depois saldo e gols no total. Teste com os
  jogos reais: a ordem calculada bate com a das quartas (LSC, FNK, FLX, FUR, DIB no A; CAP, DDL, DEP no B).
- **App** (static/kings.js): esporte novo "Kings League" (chip e "Todos"), com as ligas Kings League Brasil,
  Mundial da Kings e Mundial de Seleções da Kings; página do jogo (placar por tempo, pênaltis, YouTube);
  página da liga com Jogos (por rodada, abre na atual) e Classificação. Só no app (o PC não tem a rota).
- **Fora:** placar ao vivo minuto a minuto (só com um repasse que leia o site, o que pede mexer no worker da
  Cloudflare) e as estatísticas de jogador.
