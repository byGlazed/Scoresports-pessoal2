# Parte B: navegação no estilo Sofascore

Data: 2026-11-14. Terceira parte da rodada: C (busca) ✔, A (box score e mapa) ✔, **B**, D (atualização automática), E (Kings League), F (e-sports).

## Por que e o que é

O usuário usa o app principalmente no celular (APK) e quer navegar como no Sofascore. Os prints mandados mostram:

- a busca em tela cheia;
- a lista de jogos agrupada por liga, com estrela e sino;
- a aba Favoritos com chips de esporte;
- a página do time com abas.

Nas palavras dele:
- **Barra de favoritos e de esportes:** "menuzinho de favoritos e dos esportes em geral, mostrando apenas os jogos dependendo do que vc escolhe".
- **Tela inicial:** "na tela inicial tem q mostrar so os jogos, ai se vc clicar na liga ver a classificacao".
- **Partida e time:** tocar no jogo abre a partida, e tocar no time abre a página do time.

**Sucesso:** abrir o app e ver os jogos do dia de todos os esportes; chegar à classificação de uma liga tocando no nome dela; ir e voltar entre jogo, time, liga e atleta como num app nativo (o voltar do Android volta uma tela por vez); nada do que existe hoje se perde.

**Anti-objetivos** (seria fracasso mesmo funcionando):
- perder alguma função que existe hoje: classificação, líderes, ranking do UFC, calendário da F1, boxe, busca, box score e mapa, página do time, transmissões, favoritos ou modo ao vivo;
- deixar o voltar do Android inconsistente, por exemplo sair do app de dentro de uma partida;
- tornar o app mais lento para abrir.

## Decisões do usuário

- **Tela inicial:** jogos do dia de **todos os esportes**, agrupados por liga, com **chips** no topo para filtrar (Todos, Futebol, NBA, NFL, MLB, NHL, F1, UFC, Boxe). **Favoritos** é outra aba, com os mesmos chips.
- **Abordagem: páginas com histórico.** Cada tela (início, favoritos, pesquisa, partida, time, liga, atleta, boxeador, evento) é uma página com endereço próprio (`#/...`). "Voltar" (seta do app ou botão do Android) volta uma página. Os desenhos atuais da partida, do time, da classificação, dos líderes e do box score são aproveitados; muda a moldura em volta deles.
- **Desenho aprovado em 14/11**, conforme o esboço mostrado na conversa (início, liga, partida e favoritos com barra de baixo), com os pontos abaixo.

## Abordagens consideradas

1. **Páginas com histórico (escolhida).** Um roteador por `location.hash` com uma pilha de páginas, e os desenhadores atuais renderizando dentro da página. O voltar funciona igual em toda parte (`history.back()`); cada tela tem endereço, que serve para atalhos e para o voltar do Android. O custo é mexer na moldura inteira (`irPara`, `Painel`, a barra lateral e o `index.html`).
2. **Moldura nova, painéis como hoje.** Troca só a barra de cima, a lateral e o Início. Partida, time e atleta continuam no `<dialog>` sobreposto. É mais rápido, mas o voltar fica com duas lógicas (painel e lista) e a partida não ganha endereço. Descartada.
3. **Reescrever as telas.** Fidelidade visual máxima, mas joga fora código testado e funcionando (partida, box score, mapa, página do time). Mais lento e mais arriscado. Descartada.

## Como fica

### Moldura

- **Topo** de cada página:
  - nas abas principais (Jogos, Favoritos, Pesquisa): o título e o botão de busca;
  - nas páginas internas: seta de voltar, título e, quando couber, a estrela de favoritar.
- **Barra de baixo**, fixa e sempre visível, com três abas:
  - **Jogos** (ícone de calendário), que é a tela inicial;
  - **Favoritos** (estrela);
  - **Pesquisa** (lupa).
  
  Tocar na aba já ativa volta ao topo dela. Cada aba guarda a própria posição (dia, chip, rolagem) ao trocar de aba.
- **Sai:** barra lateral, ☰, fileira de esportes no topo e o `<dialog>` do painel.
- **Telas largas (PC e `docs/` no navegador):** a mesma moldura, numa coluna centralizada de no máximo 600 px. Não há mais três colunas.
- **Visual** (skill mobile-ios-design):
  - alvos de toque com pelo menos 44 px;
  - cores pelos tokens de tema, para claro e escuro;
  - tamanhos de texto em `rem`, acompanhando o tamanho de letra do celular, dentro do limite de +15% da parte 1;
  - respeito à área segura (`env(safe-area-inset-bottom)`) na barra de baixo.

### Aba Jogos (tela inicial)

- **Chips de esporte** na ordem Todos, Futebol, NBA, NFL, MLB, NHL, F1, UFC, Boxe. Os chips rolam para o lado e o escolhido fica guardado no aparelho.
- **Abaixo dos chips:**
  - a faixa de dias atual (‹ dias › e calendário);
  - os filtros Todos, Ao vivo, Encerrados e Próximos, com contagem.
- **Lista:** jogos do dia agrupados por liga (cabeçalho com logo, nome e país ou região, estrela da liga e uma seta). Cada jogo mostra horário ou status, times, placar e transmissão, como hoje.
  - **Tocar no cabeçalho da liga** abre a **página da liga**.
  - **Tocar no jogo** abre a **página da partida**.
- **"Todos":**
  - junta os esportes de partidas (futebol, NBA, NFL, MLB e NHL, com todas as competições cadastradas de cada um) e os eventos do dia de F1, UFC e boxe;
  - cada evento aparece como um item da lista ("GP de São Paulo · Corrida 14:00", "UFC 310 · card principal 23:00") e, ao tocar, abre a **página do evento** (a tela de calendário ou de card que já existe);
  - **ordem dos grupos** (decisão do construtor, pensada para a lista não "pular" enquanto carrega):
    - cada competição é um grupo;
    - primeiro, os grupos com jogo ao vivo;
    - depois, os demais, numa ordem fixa: esporte na ordem dos chips (Futebol, NBA, NFL, MLB, NHL, F1, UFC, Boxe) e, dentro do futebol, a ordem atual das regiões e competições (Brasil, América do Sul, Europa, Copas, América do Norte, Seleções);
    - um grupo só muda de lugar quando entra ou sai do "ao vivo";
    - esportes que chegam depois entram na posição fixa deles, sem empurrar o que já está na tela;
    - dentro do grupo, os jogos vão por horário;
    - os eventos da F1, do UFC e do boxe são grupos como os outros, na posição do seu esporte.
- **Chip de um esporte de partidas:** mostra só aquele esporte. No futebol, os jogos de todas as competições, agrupados como hoje.
- **Chip F1, UFC ou Boxe:** a lista de eventos daquele esporte (próximos e recentes), como as telas atuais desses esportes.
- **Carregamento:** cada esporte carrega à parte, e o que chega primeiro aparece primeiro. Se um esporte falhar, aparece um aviso pequeno no lugar dele, e o resto continua.

### Página da liga (nova)

- **Topo:** voltar, logo, nome e estrela de favoritar.
- **Abas**, conforme o esporte:

| Esporte | Abas |
|---|---|
| Futebol | Classificação, Jogos, Artilharia e cartões |
| NBA, NFL, MLB, NHL | Classificação, Jogos, Líderes |
| F1 | Calendário, Classificação |
| UFC | Eventos, Ranking |
| Boxe | Eventos |

- **Conteúdo:** cada aba usa o desenhador que já existe para aquela seção: `classificacaoEspn` com os campeões, `lideresEspn`, `rankingUfc`, a lista de jogos da competição com a faixa de dias e o calendário da F1. A aba Jogos mostra só aquela competição.
- **Endereço:** `#/liga/<esporte>/<liga>/<aba>`. A busca, os cartões de competição e os favoritos de liga passam a abrir esta página.

### Página da partida

- **O que mostra:** o detalhe atual (`partidaDetalhe`) numa página inteira, com o placar no topo e as abas atuais (Resumo, Estatísticas, Jogadores, Arremessos...).
- **Topo:** voltar, e a liga e a rodada como título. Tocar na liga abre a página da liga.
- **Endereço:** `#/jogo/<esporte>/<liga>/<id>`.
- **Ao vivo:** a atualização automática (a cada 20 s) continua só enquanto a página está à vista, e para ao sair dela.
- **Abertura direta:** se a página for aberta pelo endereço, sem vir da lista, busca o jogo pela rota do resumo.

### Páginas de time, atleta, boxeador e evento

- **O que mostram:** a página do time (`desenharTime`), o atleta (`desenharAtleta`, com o contexto de arremessos da parte A), o boxeador e o evento da F1 ou do UFC passam do painel para páginas inteiras, sem mudar o conteúdo.
- **Endereços:**
  - `#/time/<esporte>/<liga>/<id>`;
  - `#/atleta/<esporte>/<liga>/<id>`;
  - `#/boxeador/<nome>`;
  - `#/evento/<esporte>/<liga>/<id>`.
- **Arremessos do jogo no atleta:** o contexto não cabe no endereço. Quando o atleta é aberto pelo box score, o contexto vai em memória junto da entrada do histórico. Se a página for recarregada, a seção "Arremessos no jogo" simplesmente não aparece.
- **Aba interna:** a aba escolhida dentro do time (Jogos, Elenco...) continua guardada ao voltar, como hoje.

### Aba Favoritos

- **Chips** de esporte iguais aos da aba Jogos, mas só com os esportes em que há favorito.
- **O que mostra:** os jogos do dia dos times, jogadores e ligas favoritos (a lógica atual do Início), agrupados por liga, com a mesma faixa de dias e o mesmo jeito de tocar (liga abre a página da liga, jogo abre a partida).
- **Lista de favoritos:** abaixo dos jogos, a lista dos favoritos (hoje na barra lateral). Tocar abre a página do time, do atleta ou da liga.
- **Sem favoritos:** o convite atual para favoritar.

### Aba Pesquisa

A tela da parte C (busca, chips Todos, Times, Atletas e Competições, e recentes), agora como aba. Abrir um resultado empilha a página correspondente.

### Voltar e histórico (decisão do construtor, seguindo o modelo do Sofascore e do iOS)

- **Uma pilha por aba.** Jogos, Favoritos e Pesquisa têm cada uma a própria pilha de páginas, guardada em memória pelo roteador.
  - Abrir uma página interna empilha na aba atual.
  - Trocar de aba mostra a pilha daquela aba como estava. Exemplo: em Jogos → liga → partida, tocar em Favoritos e depois em Jogos volta para a partida.
  - A aba da barra de baixo que fica acesa é a dona da pilha atual, inclusive nas páginas internas.
- **Tocar na aba já ativa:** em página interna, volta para a raiz da aba (descarta as páginas internas); já na raiz, rola para o topo.
- **Voltar** (seta do app, botão do Android ou voltar do navegador): desempilha uma página da aba atual.
  - Na raiz de Favoritos ou de Pesquisa, vai para a aba Jogos.
  - Na raiz de Jogos, no Android o app sai; no navegador, não faz nada.
  - É uma função pura, com testes.
- **Endereço:** o `location.hash` sempre mostra a página do topo da aba atual, para dar para recarregar e para o voltar do navegador.
  - Cada página nova usa `pushState`; trocar de aba e voltar ao topo usam `replaceState`.
  - O evento `popstate` (voltar do navegador) é traduzido para "voltar" na pilha.
- **`celular/android.js`:** passa a chamar o voltar da pilha e devolve `true` em qualquer lugar menos na raiz de Jogos. Assim o `web.goBack()` do `MainActivity` nunca é usado para navegar, e o app só sai na raiz de Jogos. Sem `Painel` nem barra lateral.

## O que não muda

- **Dados:** rotas do `direto.js`, cache, banco do celular e índice da busca.
- **Desenhadores atuais**, reaproveitados: partida, box score e mapa, time, classificação, líderes, ranking, calendário, boxe, busca e cartões de jogo.
- **Funções:** favoritos (`Favoritos`, estrela), transmissões, campeões e o modo ao vivo.
- **Servidor Python e site do PC pelo `uvicorn`:** as telas são as mesmas e passam a ter a moldura nova. No PC, a NBA continua usando o módulo próprio (`MODULOS.nba`, dados do servidor), que entra na nova moldura (aba Jogos e chip NBA). Decisões do construtor, para nada se perder no PC:
  - **Abas extras:** a página da liga NBA, só no PC, ganha as abas **MVP e calouro** (`nbaCorridas`) e **Jogadores** (`nbaJogadores`, busca na história da NBA), além de Classificação, Jogos e Líderes.
  - **Endereços:** `#/jogo/nba/...` e `#/atleta/nba/...` abrem as telas próprias da NBA no PC (`nbaAbrirJogo`, `desenharJogadorNBA`, com os ids da NBA.com) e as telas da ESPN no app e no `docs/`. A escolha segue o que já existe: `esporteObj("nba").tipo === "nba"` no PC e `"partidas"` no app.
- **Sem sino de notificação:** o app não tem notificações, e o cabeçalho da liga é só o que está listado acima.

## Restrições técnicas

- **JavaScript puro**, sem framework e sem dependência nova, como o resto do app.
- **Scripts comuns** (`<script>`) dividindo um escopo global: nomes novos não podem colidir.
- **Telas em `static/`**, que valem para o PC, o `docs/` e o APK. O `gerar_celular.py` copia para o celular, e o `celular/android.js` é só do APK.
- **APK:** abre `index.html` dentro de um WebView (`appassets.androidplatform.net`); o hash funciona lá.
- **Regras puras** que dê para isolar (montar e ler endereços, regra do voltar, agrupar e ordenar a lista "Todos") ficam em arquivo próprio, com testes `node --test`, como nas partes anteriores.

## Fica para quem construir

- Nomes de arquivos e funções novas, e como dividir o `app.js`, que tem 1.822 linhas, se for preciso.
- O desenho exato dos ícones da barra de baixo, usando SVG inline, como os outros ícones do app.
- O quanto pedir em paralelo na lista "Todos", desde que respeite o carregamento progressivo e o cache que já existe.
- Animação de troca de página: opcional e curta, sem atrasar a navegação.
