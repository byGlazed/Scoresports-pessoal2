# Parte 1: fonte e página do time

Data: 2026-11-11. Primeira de quatro partes (1. fonte e página do time; 2. MLB e NHL; 3. atualização automática; 4. Kings League).

## Objetivo

Deixar o app mais prático no dia a dia, no estilo do Sofascore:

1. A faixa de dias para de cortar a data no celular, e o app usa uma fonte própria (Inter) que aparece igual com ou sem internet.
2. Clicar num time, em qualquer esporte, abre uma página do time com abas: Jogos, Elenco por posição, Detalhes, Classificação e Estatísticas.

## Decisões já tomadas

- **Fonte:** Inter, embutida no app (sem Google Fonts).
- **Página do time:** vale para todos os esportes da ESPN, e já fica preparada para a MLB e a NHL (parte 2).
- **Onde entram as novidades:** só na camada do app (`celular/direto.js` mais as telas em `static/`). O servidor Python (`api.py`, `espn_dados.py`, `espn_extra.py`) fica como está: continua funcionando, mas não ganha a página nova. No PC, a versão completa é a pasta `docs/` aberta no navegador.
- **Seguidores (do Sofascore):** fora, porque não existe em fonte aberta.

## 1. Fonte e faixa de dias

**Problema observado** (print do APK): na faixa de dias, a segunda linha (`09/11`, `10/11`...) aparece cortada pela metade dentro do botão.

**Causas prováveis:**
- O WebView do Android aplica o tamanho de letra do sistema (textZoom), mas o CSS usa tamanhos fixos em px.
- A fonte Barlow vem da internet, e a fonte de reserva tem outras medidas.

**Mudanças:**
- **Fonte própria.** Os arquivos `Inter` (woff2 variável, pesos 400 a 700, licença SIL OFL, com o arquivo da licença junto) ficam em `static/fontes/`, ao lado do `style.css`. Assim o caminho relativo `fontes/...` funciona no PC (`/static/fontes/`), no `docs/` e no APK. Hoje o `gerar_celular.py` só copia arquivos soltos; ele passa a copiar também `static/fontes/` para `docs/fontes/`. O APK recebe a pasta porque copia o `docs/` inteiro. O `celular/sw.js` inclui a fonte na lista do que guarda para abrir sem internet.
- **CSS da fonte.** Em `static/style.css`, um `@font-face` aponta para `fontes/`. As variáveis `--fonte` e `--fonte-placar` passam a usar Inter, e o placar usa `font-variant-numeric: tabular-nums`.
- **Google Fonts sai.** Os `<link>` do Google Fonts saem de `static/index.html` e do `index.html` gerado. A regra de fontes do Google no `celular/sw.js` deixa de ser necessária.
- **Faixa de dias:**
  - `.dia` vira `display: flex; flex-direction: column; align-items: center;`, sem altura fixa, com `line-height` suficiente para as duas linhas.
  - `.faixa-datas` alinha as setas e o calendário ao centro.
  - Some o conflito de nome com `.evento-data .dia`, que passa a ser `.evento-data .dia-evento`.
- **Tamanho de letra do Android.** Em `MainActivity.java`: `setTextZoom(min(round(fontScale * 100), 115))`. O app respeita o tamanho de letra do celular até +15%.
- **Varredura.** As outras telas com altura fixa e texto (filtros, chips, placar) são conferidas com a letra aumentada.

## 2. Página do time

Ela abre no `Painel` atual, então o botão voltar do Android e o empilhamento já funcionam. Todos os lugares que hoje chamam `abrirElenco(...)` passam a chamar `abrirTime(...)`:
- placar do jogo;
- classificação;
- Início;
- pesquisa;
- favoritos.

**Cabeçalho:** escudo, nome, liga, resumo da posição (o número do `standingSummary` da ESPN, mostrado como "1º lugar · Brasileirão Série A"), campanha (V-E-D) e a estrela de favoritar (`botaoFavorito`).

**Abas** (com `abasDetalhe`, que já existe em `app.js`). Cada aba carrega só quando é aberta e mostra o próprio erro sem derrubar as outras.

| Aba | Conteúdo | Fonte |
|---|---|---|
| Jogos | Até 10 últimos jogos (data, adversário, placar, selo V/E/D) e os próximos jogos. Clicar abre o detalhe do jogo, como já acontece nas listas. | `site.api.espn.com/.../teams/{id}/schedule` e `.../schedule?fixture=true` (o futebol precisa do `fixture=true` para trazer os próximos) |
| Elenco | Grupos por posição. Cada linha tem camisa, nome (abre o atleta), idade e país com bandeira. | `.../teams/{id}/roster` |
| Detalhes | Estádio, cidade, técnico, campanha e liga | `sports.core.api.espn.com/.../seasons/{ano}/teams/{id}` (estádio). Técnico: no roster para NBA, NFL, MLB e NHL; no Wikidata (propriedade P286) para o futebol |
| Classificação | A tabela da liga, com a linha do time destacada | Mesma rota de classificação que já existe |
| Estatísticas | Números da temporada em grupos (Ataque, Defesa, Geral) e os líderes do time | `sports.core.api.espn.com/.../seasons/{ano}/types/{tipo}/teams/{id}/statistics` |

**Grupos do elenco por esporte:**
- **Futebol:** Goleiros, Defensores, Meias, Atacantes e Técnico. A posição vem em inglês (Goalkeeper, Defender, Midfielder, Forward).
- **NBA:** Armadores, Alas, Pivôs e Técnico. Vem como Guard, Forward, Center.
- **NFL:** Ataque, Defesa, Times especiais, Lesionados, Suspensos, Elenco de treino e Técnico. São os grupos que a ESPN já manda: `offense`, `defense`, `specialTeam` etc.
- **MLB (parte 2):** Arremessadores, Receptores, Defensores internos, Defensores externos, Rebatedor designado e Técnico.
- **NHL (parte 2):** Goleiros, Defensores, Atacantes e Técnico.
- **Posição desconhecida:** vai para "Outros".

**Estatísticas mostradas:** uma lista curta e traduzida por esporte, por exemplo:
- **Futebol:** gols, gols sofridos, saldo, chutes, posse, desarmes, interceptações e cartões.
- **NBA:** pontos, rebotes, assistências, aproveitamento de arremesso e de 3.
- **NFL:** jardas por jogo, pontos por jogo, turnovers e sacks.

Estatística que a ESPN não mandar simplesmente não aparece. Se a liga não tiver nenhuma, a aba mostra um aviso.

## 3. Dados (camada do app)

Arquivo: `celular/direto.js`.

- **Rotas novas:**
  - `GET /e/{esporte}/{liga}/times/{id}` para cabeçalho e detalhes;
  - `/jogos`, `/elenco` (a rota que já existe, ampliada com grupos e técnico) e `/estatisticas`.
- **Classificação:** usa a rota que já existe.
- **Validade no banco do celular:**
  - cabeçalho, elenco e estatísticas: 6 horas;
  - jogos do time: 15 minutos;
  - técnico vindo do Wikidata: 7 dias.
- **Técnico do futebol:**
  1. busca `wbsearchentities` pelo nome do time e pega o primeiro resultado que seja um clube de futebol;
  2. lê a P286 sem data de fim.
  
  Se não achar, o campo não aparece.
- **Android.** O `MainActivity.shouldInterceptRequest` passa a encaminhar também `wikidata.org`, além de `espn.com` e `wikipedia.org`. No navegador (`docs/`), o Wikidata aceita pedidos de outro site com `origin=*`.
- **Busca.** Os atletas vistos no elenco continuam indo para o índice da busca, como hoje.

## 4. Erros

- Cada aba trata o próprio erro. A mensagem segue o padrão atual ("Não foi possível obter dados da ESPN agora. Motivo: ...").
- Sem internet, o app mostra o que estiver guardado no banco, como já faz hoje.
- **Site do PC pelo servidor Python** (`uvicorn`): as telas são as mesmas, mas o servidor não tem as rotas novas. Quando a rota responder 404, a página do time mostra só a aba Elenco (pela rota `/elenco`, que o servidor já tem), com o aviso "A página completa do time está no app e na pasta docs/". Nada quebra.

## 5. Testes

- **App no navegador:** sirvo `docs/` (gerado com `python gerar_celular.py`) e abro no navegador em 375×812, com dados reais da ESPN. Confiro a página de um time de cada esporte com times: Flamengo (futebol), uma seleção, Knicks (NBA) e Chiefs (NFL). F1 e UFC não têm times e continuam como hoje: piloto e lutador abrem o perfil, e equipe da F1 não abre nada.
- **Letra aumentada:** simulo com `html { zoom: 1.15 }` e confiro a faixa de dias, os filtros e o placar.
- **Sintaxe:** `node --check` nos `.js` alterados.
- **APK:** só no seu celular, depois do push, porque o Actions monta o APK.

## Fora desta parte

MLB e NHL (só ficam previstas nos grupos), atualização automática, Kings League e mudanças no servidor Python.
