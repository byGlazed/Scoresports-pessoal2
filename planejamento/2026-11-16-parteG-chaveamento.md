# Parte G: chaveamento (mata-mata e playoffs) e Copa NBA

## Por quê

O dono quer ver o caminho até a final em toda competição com mata-mata, "pra todos os esportes que tem uma copa", como no Sofascore. Também quer a Copa NBA (Emirates NBA Cup), que o app não tem. Ele escolheu a **chave em colunas**: o desenho de chave com linhas ligando quem passa, rolando para os lados no celular.

**Sucesso:**
- na página de qualquer copa ou liga com playoffs, uma aba mostra a chave da temporada, com os placares e quem passou, atualizada logo depois dos jogos;
- tocar num confronto abre os jogos dele;
- a NBA ganha a Copa NBA, com a tabela dos grupos e a chave.

## Fatos que moldam a solução (ESPN, conferidos em 16/11/2026)

- **Sem endereço pronto:** a ESPN não tem um endereço de chave; todos os que testei deram 404. A chave tem de ser montada a partir dos jogos.
- **Fases do futebol:**
  - as fases são tipos de temporada no Core API: `…/seasons/{ano}/types`, com nome e intervalo de datas. Exemplos: Champions 2025, "Knockout Round Playoffs", "Oitavas", "Quartas", "Semi Final", "Final"; Copa do Brasil 2025, da "1ª rodada" até "Finals";
  - cada jogo do scoreboard traz `season.type` (o id da fase) e `season.slug` (`round-of-16`);
  - a ida e a volta vêm marcadas (`leg`, nota "Ida"/"Volta");
  - `series` traz o agregado e quem passou (`competitors[].winner`, `aggregateScore`).
- **Playoffs americanos:**
  - os jogos de pós-temporada têm `season.type` 3, e a nota diz a fase, em português no scoreboard com `lang=pt` ("Leste 1ª rodada - Jogo 1", "East Semifinals");
  - `series` traz o resumo ("CLE lidera 1-0", "NY ganhou a série 4-1") e se acabou;
  - a NBA ainda tem o Play-In (tipo 5). Na NFL, cada fase é um jogo só.
- **Copa NBA:**
  - os jogos vêm com as notas "NBA Cup - Group Play", "NBA Cup - Quarterfinals", "NBA Cup - Semifinals" e "NBA Cup Championship";
  - o nome do grupo não vem. Os grupos (6 de 5 times, 3 por conferência) saem dos confrontos, porque cada time só joga contra os do próprio grupo. A fase de grupos de 2026 está acontecendo agora.
- **Busca de jogos:** o app já pede jogos à ESPN por mês (`dates=AAAAMM&limit=1000`, `eventosPeriodo` no `direto.js`), com o banco do celular como cache.
- **O site do PC:** usa o servidor Python, que não muda. Esta parte é do app e do `docs/`, como a página do time.

## Abordagens consideradas

1. **O app monta a chave na hora, no celular, com os jogos da ESPN (escolhida).** As regras ficam num arquivo puro, com testes sobre respostas reais, como em `rotas.js` e `nba_quadra.js`. Atualiza junto com os jogos.
2. **O robô diário monta a chave e publica.** Descartada: a chave só mudaria uma vez por dia.
3. **Arquivo à mão.** Descartada: volta a depender do dono.

## Objetivos

### 1. Regras da chave (arquivo puro, com testes)

- **Entrada:** as fases da temporada (nome, ordem, datas) e os jogos de mata-mata. **Saída:** as colunas da chave (uma por fase), cada uma com os confrontos em ordem. Cada confronto traz:
  - os dois lados (time, logo, seed quando houver);
  - o placar do confronto: agregado na ida e volta, vitórias na série ou placar do jogo único;
  - os jogos (para abrir ao tocar);
  - quem passou (ou nada, se ainda não acabou);
  - o estado: a jogar, ao vivo ou encerrado.
- **Confronto:** os jogos da mesma fase entre os mesmos dois times. Quem passou vem do `series` da ESPN quando houver, depois da nota, depois do vencedor do jogo único. Pênaltis contam.
- **Ordem das colunas:** a posição de cada confronto vem da fase seguinte. Os confrontos cujos vencedores se enfrentam ficam juntos e alimentam aquele confronto. Sem a fase seguinte (ainda não sorteada ou não jogada), a ordem é a da data do primeiro jogo.
- **Fases que não cortam pela metade (decisão do construtor, o dono pode mudar):** nem toda fase alimenta a seguinte de dois em dois. Exemplos:
  - o playoff da Champions, da Liga Europa e da Sul-Americana: 8 confrontos que levam a oitavas de 8, cada vencedor contra um time que pulou essa fase;
  - o Wild Card da NFL (6 jogos para 4) e da MLB (4 séries para 4);
  - o Wild Card da MLS;
  - as copas nacionais, em que os grandes entram depois.

  Essas fases são colunas da chave como as outras. O confronto da fase seguinte pode ter **uma, duas ou nenhuma** linha chegando: o time que pulou a fase aparece direto, sem linha (como no Sofascore). Um confronto com um só lado vindo da fase anterior desenha só aquela linha.
- **Fases futuras:** aparecem com vagas "A definir". A quantidade vem do formato conhecido da competição: uma tabela pequena no código diz quantos confrontos tem cada fase de cada competição com formato fixo (Champions, NFL, MLB, NHL, NBA, MLS, Copa do Mundo…). Sem formato conhecido, vale metade da fase anterior.
- **Play-In da NBA (decisão do construtor):** não entra na chave. Aparece na lista simples acima dela ("Play-In"), com os jogos e quem passou. Na chave, os 7º e 8º colocados aparecem quando o Play-In termina.
- **Fases eliminatórias antes da fase de grupos (decisão do construtor):** as fases preliminares da Libertadores (1ª, 2ª e 3ª fase) e da Sul-Americana (1ª fase) são de ida e volta, mas vêm antes dos grupos e não levam às oitavas. Ficam na lista simples acima da chave, com o título "Fases preliminares". A chave começa na primeira fase eliminatória **depois** dos grupos.
- **Fases de grupos e de liga:** o "League Phase" da Champions, os grupos da Libertadores e os da Copa do Mundo **não** entram na chave. Ela começa na primeira fase eliminatória depois deles. A classificação continua na aba de sempre.
- **Mata-mata enorme:** nas fases iniciais com muitos times (1ª rodada da Copa do Brasil, FA Cup), a chave começa só na fase com até 16 confrontos (32 times), para continuar legível. As fases anteriores ficam numa lista simples, fase por fase, acima da chave.

### 2. Onde aparece

- **Página da liga:** uma aba nova.
  - "Mata-mata" nas copas e competições de futebol com eliminatória: copas nacionais, supercopas, Champions, Liga Europa, Libertadores, Sul-Americana, Recopa, Mundial de Clubes, Copa do Mundo, Eurocopa, Copa América e Liga das Nações;
  - "Playoffs" na NBA, NFL, MLB, NHL e MLS.
  
  A aba só aparece onde a competição tem mata-mata. Ligas de pontos corridos (Brasileirão, Premier League…) não ganham a aba.
- **Qual temporada:**
  - a chave é da temporada em andamento, se o mata-mata dela já começou;
  - senão, é a da temporada anterior, completa, com o ano escrito em cima ("Chave de 2025-26");
  - um seletor simples permite ver a outra.
- **Copa NBA:**
  - fica numa aba "Copa NBA" na página da NBA (no app; no PC a NBA usa o módulo próprio, que não muda);
  - **grupos:** cada grupo com V-D e saldo de pontos, na ordem V-D, depois saldo e depois pontos marcados. É uma aproximação dos critérios oficiais, avisada numa nota;
  - **chave:** quartas, semi e final.
- **Jogos da Copa NBA na lista do dia:** continuam como estão (são jogos da NBA). Se for fácil, mostram o selo "Copa NBA".

### 3. A chave em colunas

- **Colunas:** uma por fase, rolando para os lados. No celular (375 px) cabem cerca de 2 colunas, e a coluna da fase atual é a que aparece primeiro.
- **Linhas:** ligam cada par de confrontos ao confronto da fase seguinte que ele alimenta.
- **Cada confronto é um cartão compacto com:**
  - os dois times, com logo e nome curto;
  - o placar do confronto;
  - quem passou em destaque, com o perdedor apagado;
  - o selo "ao vivo" se algum jogo dele estiver em andamento.
- **Ao tocar:** num jogo único, abre a página do jogo. Em ida e volta ou série, abre uma lista curta dos jogos do confronto (como a página do time lista jogos), e dali a página de cada jogo.
- **Ao vivo:** se houver jogo ao vivo, a aba se atualiza a cada 20 s, como as listas de hoje.
- **Mesmo estilo do app:** tema claro e escuro, alvos de toque de 44 px e nenhuma rolagem lateral da página inteira (só a da chave).

## Fora desta parte

- E-sports (parte F, depois desta).
- O site do PC (servidor Python).
- Critérios oficiais completos de desempate da Copa NBA.
- Fases de grupos desenhadas como chave.

## Anti-objetivos

- Chave com confronto errado: o time errado passando, ou a ida e volta somada errado.
- A página da liga ficar lenta: a chave só busca os meses das fases eliminatórias, com o cache do banco do celular.
- A aba aparecer vazia em competição sem mata-mata.
- Quebrar o que já existe nas abas Classificação, Jogos e Líderes.

## Fica a cargo de quem constrói

- Nomes de arquivos e funções.
- Como desenhar as linhas (SVG ou CSS).
- O texto exato das fases em português ("Oitavas de final"…), a partir do nome da ESPN.
- Como achar a fase seguinte de cada confronto, quando a ESPN não deixa claro.
- Quais competições ganham a aba: lista fixa conferida com os tipos de temporada da ESPN.
