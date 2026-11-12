# Parte C (busca universal): plano de implementação

> **Para quem for executar:** use superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar o andamento.

**Objetivo:** a busca acha boxeadores (pela Wikipédia), põe o resultado certo primeiro e ganha filtros e buscas recentes, no estilo do Sofascore.

**Arquitetura:** três peças.
- **Regras puras** em `celular/busca_regras.js`: ordem por relevância, validação de boxeador e lista de recentes. Testadas com `node --test`.
- **Rota `/busca`** do `celular/direto.js`: passa a consultar a Wikipédia e a ordenar o resultado.
- **Tela da busca** em `static/inicio.js`: ganha os chips de filtro e os recentes.

**Tecnologia:** JavaScript puro, com Node 24 para os testes.

**Spec:** `planejamento/2026-11-12-parteC-busca-universal.md`

## Regras globais

- **Onde muda:** só o app. O servidor Python não muda.
- **Nomes globais:** antes de criar um nome no topo de um arquivo, conferir com `grep -w` em `static/*.js` e `celular/*.js` que ele não existe.
- **Depois de mudar `static/` ou `celular/`:** rodar `python gerar_celular.py` e fazer o commit junto com o `docs/` gerado.
- **Testes:** `node --test testes/*.test.js`, tudo verde ao fim de cada tarefa.
- **Wikipédia:** a função `wiki(base, params)` já existe em `direto.js` (põe `format=json`, `formatversion=2` e `origin=*`).

## Pontos de atenção na revisão

1. **Nome de lutador que também é de boxeador** (Jon Jones): o lutador do UFC aparece em 1º e nenhum "boxeador" falso entra na lista. Teste na Tarefa 1, com a amostra de "Jon Jones".
2. **Texto curto (2 letras):** a Wikipédia não é consultada abaixo de 3 letras. Teste na Tarefa 2, com conferência no navegador.
3. **Wikipédia fora do ar:** a busca devolve o resto e diz "a Wikipédia não respondeu". Conferência na Tarefa 2, forçando o erro.
4. **Recentes com o mesmo item aberto duas vezes:** ele não se repete e sobe para o topo. Teste na Tarefa 1.
5. **Filtro escolhido sem resultado** (por exemplo, Times numa busca de boxeador): mostra "Nada encontrado nesse filtro.", sem erro. Conferência na Tarefa 3.

---

### Tarefa 1: regras puras da busca

**Arquivos:**
- Criar: `celular/busca_regras.js`, `testes/busca_regras.test.js` e as amostras `testes/amostras/wiki_boxe_usyk.json`, `wiki_boxe_canelo.json` e `wiki_boxe_jonjones.json`. Cada amostra é a resposta enxugada de `prop=categories` para os títulos que `list=search` devolveu com o texto + " boxer".
- Modificar: `gerar_celular.py` (carregar `busca_regras.js` antes de `regras_esportes.js`) e `celular/sw.js` (`ARQUIVOS`).

**Interfaces:** globais no navegador, `module.exports` no Node, no mesmo padrão do `time_dados.js`.

- `ordenarPorRelevancia(itens: {nome}[], texto: string) -> {nome}[]`
  - Ordem: 0 nome exato; 1 começa com o texto; 2 uma das palavras começa com o texto; 3 contém o texto; 4 o resto.
  - A comparação ignora acentos e maiúsculas.
  - Empate fica na ordem original (ordenação estável).
- `boxeadoresDaWikipedia(resposta: object) -> {titulo: string}[]`
  - Recebe a resposta de `prop=categories` (`formatversion=2`, ou seja, `query.pages` em lista).
  - Devolve só as páginas com alguma categoria cujo título, em minúsculas, contenha "boxers", na ordem em que vieram.
- `lembrarRecente(lista: object[], item: object, limite = 10) -> object[]`
  - Põe o item no topo, tira a versão anterior dele (mesma chave `tipo:esporte:id`) e corta no limite.
  - Não altera a lista recebida.

**Passos:**

- [ ] **Passo 1: salvar as 3 amostras reais.** Primeiro `list=search` (`srlimit` 5) e depois `prop=categories` (`cllimit` 50, `formatversion` 2) na `https://en.wikipedia.org/w/api.php`, com o User-Agent "Scoresports-pessoal/1.0". Guardar só `query.pages[].title` e `categories[].title`.
- [ ] **Passo 2: escrever os testes.**
  - `boxeadoresDaWikipedia`:
    - Usyk dá `[{titulo: "Oleksandr Usyk"}]`, e as páginas de lutas ficam de fora;
    - Canelo dá "Canelo Álvarez";
    - Jon Jones dá `[]`;
    - `{}` dá `[]`.
  - `ordenarPorRelevancia`:
    - `[{nome:"Amari Jones"},{nome:"Jon Jones"},{nome:"Jones Neto"}]` com "jon jones" dá Jon Jones primeiro;
    - "pere" com `[{nome:"Alex Pereira"},{nome:"Pereira Lopes"}]` dá "Pereira Lopes" primeiro (começa com) e "Alex Pereira" depois (palavra começa com);
    - "popo" acha "Popó" como nome exato;
    - empates mantêm a ordem;
    - lista vazia dá `[]`.
  - `lembrarRecente`:
    - item novo vai para o topo;
    - repetido sobe sem duplicar;
    - limite 10 corta o mais antigo;
    - a lista original não muda.
- [ ] **Passo 3:** `node --test testes/*.test.js`. Esperado: falha com "Cannot find module '../celular/busca_regras.js'".
- [ ] **Passo 4: implementar.** Depois, ligar o arquivo no `gerar_celular.py` e no `sw.js`, e rodar `python gerar_celular.py`.
- [ ] **Passo 5:** suite verde; `docs/index.html` traz `busca_regras.js` antes de `regras_esportes.js`. Commit: "Regras da busca: relevância, boxeadores da Wikipédia e recentes".

---

### Tarefa 2: rota `/busca` com boxeadores e ordem

**Arquivos:**
- Modificar: `celular/direto.js`, na rota `/busca` (dentro de `ROTAS`) e com uma função nova antes de `ROTAS`;
- Modificar: `static/inicio.js`, na mensagem de `r.falhas`.

**Interfaces:**
- Consome, da Tarefa 1: `ordenarPorRelevancia`, `boxeadoresDaWikipedia`.
- Produz `async function buscarBoxeadoresWiki(texto: string) -> {esporte:"boxe", liga:"boxe", id, nome, descricao:"Boxe", imagem:null}[]`. Usa `obter("wiki_boxe_v1:" + semAcento(texto), 7 * 86400, ...)` e `wiki("https://en.wikipedia.org", ...)`, nos dois passos da spec.
- Na rota `/busca`:
  - **boxeadores:** com `textoBusca.length >= 3`, chama `buscarBoxeadoresWiki`, junta com `juntar(item, "jogador")` e registra no `Indice`. Se falhar, `falhas.push("Wikipédia")`;
  - **descrição:** jogador de `esporte === "ufc"` passa a ter `descricao` "Lutador · UFC" (e "Lutador · UFC · {descrição antiga}", quando havia uma);
  - **ordem:** `jogadores` e `times` passam por `ordenarPorRelevancia(lista, textoBusca)` antes do `slice`.
- Em `inicio.js`, a nota de falhas vira `` `${r.falhas.join(" e ")} não respondeu agora: aparecem só os outros resultados.` ``.

**Passos:**

- [ ] **Passo 1: fazer as mudanças**; `node --check celular/direto.js static/inicio.js`; `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (`docs/` sem cache, 375×812, banco apagado), pelo console:
  - `api('/busca?q=Usyk')`, `Canelo` e `Popó`: um jogador `esporte: "boxe"` com o nome do boxeador;
  - `Jon Jones` e `Alex Pereira`: `jogadores[0]` é o lutador, com descrição "Lutador · UFC";
  - `Flamengo` e `Champions`: os resultados continuam;
  - `po` (2 letras): nenhum pedido à `en.wikipedia.org` na aba de rede (ponto de atenção 2).
- [ ] **Passo 3: forçar a falha da Wikipédia.** No console, trocar temporariamente `wiki` por uma função que lança erro e buscar "Usyk": a resposta traz `falhas` com "Wikipédia" e não dá erro (ponto de atenção 3).
- [ ] **Passo 4: commit** com a mensagem "Busca acha boxeadores pela Wikipédia e põe o nome certo primeiro".

---

### Tarefa 3: tela da busca com filtros e recentes

**Arquivos:**
- Modificar: `static/inicio.js` (`pesquisaDesenhar` e `pesquisaProcurar`, mais uma função nova `pesquisaRecentes(resultados)`) e `static/style.css` (estilos dos chips no fim).

**Interfaces:**
- Consome, da Tarefa 1: `lembrarRecente`.
- `PESQUISA` ganha `filtro: "todos"`, com os valores `"todos"`, `"times"`, `"atletas"` e `"competicoes"`.
- **Chips:**
  - acima de `resultados`, um `div.chips-busca` com 4 botões ("Todos", "Times", "Atletas", "Competições"), com `aria-pressed` no escolhido;
  - trocar o chip redesenha com o último resultado, sem pedir de novo;
  - filtro sem nada para mostrar: `vazio("Nada encontrado nesse filtro.")`.
- **Recentes:**
  - `guardar("busca_recentes", JSON.stringify(...))` e `lembrar("busca_recentes")`, funções que já existem;
  - cada item é `{tipo: "jogador"|"time"|"liga", esporte, liga, id, nome, descricao, imagem}`;
  - todo `aoClicar` da busca chama primeiro `PESQUISA_lembrar(item)`, que aplica `lembrarRecente` e guarda;
  - com o texto abaixo de 2 letras, `pesquisaRecentes` mostra a seção "Recentes" com uma linha por item (`linhaResultado` mais um botão "×" com `aria-label` "Tirar dos recentes"). Tocar abre o item como na busca; o × tira e redesenha;
  - sem recentes, fica o texto de ajuda que já existe.

**Passos:**

- [ ] **Passo 1: fazer as mudanças**, conferindo antes que `PESQUISA_lembrar` e `pesquisaRecentes` não existem em outro arquivo. Depois `node --check` e `python gerar_celular.py`.
- [ ] **Passo 2: conferir no navegador** (375×812):
  - buscar "Usyk" e abrir; voltar, abrir "Flamengo"; apagar o campo: os recentes mostram Flamengo e depois Usyk;
  - abrir Usyk de novo: ele sobe sem repetir;
  - o × apaga;
  - os chips filtram;
  - Times numa busca de "Usyk" mostra "Nada encontrado nesse filtro." (ponto de atenção 5);
  - console sem erro.
- [ ] **Passo 3: README**, com uma linha na seção "Início e Pesquisa" sobre boxeadores pela Wikipédia, filtros e recentes. Commit: "Tela de busca com filtros e buscas recentes".
