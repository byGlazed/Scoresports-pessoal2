# Parte C: busca universal

Data: 2026-11-12. Primeira da nova rodada, na ordem combinada:
1. C, busca universal (esta);
2. A, box score da NBA com mapa de arremessos;
3. B, redesenho no estilo Sofascore;
4. D, atualização automática;
5. E, Kings League;
6. F, e-sports pela PandaScore.

## Objetivo

A busca deve achar qualquer atleta, time ou competição do app, inclusive boxeadores e lutadores do UFC, e mostrar o resultado certo primeiro.

## O que existe hoje (testado em 2026-11-12)

- **UFC:** a busca já acha lutadores pela ESPN (Alex Pereira, Jon Jones), mas a ordem é ruim. Em "Jon Jones", o boxeador "Amari Jones", que vem do índice, aparece antes.
- **Boxe:** "Usyk", "Canelo" e "Popó" não acham nada. A busca de boxe só conhece quem está no `boxe_eventos.json`.

## Decisões

- **Onde muda:** só o app (`celular/`, `static/`), como nas partes anteriores.
- **Fora desta parte:** busca de jogos (o filtro "Match" do Sofascore), que entra na parte B, e o número de seguidores, que não existe em fonte aberta.

## 1. Boxeadores pela Wikipédia

Quando a busca tem 3 letras ou mais:
1. Procura na Wikipédia em inglês: `list=search`, com `srsearch` = texto + " boxer" e `srlimit` 5.
2. Pede as categorias desses títulos: `prop=categories`, `cllimit=50`.
3. Aceita só páginas com alguma categoria cujo nome tenha "boxers". Exemplo: "Canelo" acha "Canelo Álvarez" e descarta "Canelo Álvarez vs. John Ryder"; "Jon Jones" não acha boxeador nenhum.

Isso foi conferido na Wikipédia real: Usyk → Oleksandr Usyk; Canelo → Canelo Álvarez; Popó → Acelino Freitas; Jon Jones → nenhum.

Detalhes:
- **No resultado:** cada boxeador aceito vira um atleta com `esporte: "boxe"`, `liga: "boxe"`, `id` = título da página e `nome` = título. Ao tocar, abre o perfil de boxeador que já existe (`abrirBoxeador(nome)`).
- **Índice:** os aceitos entram no índice da busca, com a descrição "Boxe".
- **Validade:** 7 dias no banco do celular, por texto buscado.
- **Erros:** se a Wikipédia falhar, a busca segue com o resto e acrescenta "Wikipédia" em `falhas`.

## 2. Ordem dos resultados

Antes de devolver, atletas e times passam por uma pontuação de relevância contra o texto digitado. A comparação ignora acentos e maiúsculas, e a ordem é:

| Prioridade | Quando |
|---|---|
| 0 | o nome é exatamente o texto |
| 1 | o nome começa com o texto |
| 2 | uma das palavras do nome começa com o texto |
| 3 | o nome contém o texto |
| 4 | o resto, na ordem em que veio |

Empate fica na ordem de chegada.

Cada resultado mostra a descrição com o esporte:
- **UFC:** "Lutador · UFC";
- **boxe:** "Boxe";
- **outros esportes:** a descrição que já existe (o time) mais o nome do esporte.

## 3. Tela de busca

- **Filtros:** chips **Todos**, **Times**, **Atletas** e **Competições** acima dos resultados. O filtro escolhido vale até a busca ser fechada.
- **Buscas recentes:** com o campo vazio, a tela mostra as últimas 10 coisas abertas pela busca (atleta, time ou competição), da mais recente para a mais antiga, cada uma com um **×** para tirar da lista.
  - Ficam no `localStorage`, na chave `ss:busca_recentes`.
  - Abrir de novo um item já listado o leva para o topo, sem repetir.
- **Busca vazia sem recentes:** aparece o texto atual de ajuda.

## 4. Testes

**Regras puras**, num arquivo novo `celular/busca_regras.js`, com testes em `testes/busca_regras.test.js`:
- `ordenarPorRelevancia(itens, texto)`;
- `boxeadoresDaWikipedia(respostaCategorias)`, com amostras reais das respostas da Wikipédia de Usyk, Canelo e Jon Jones;
- `lembrarRecente(lista, item, limite)`.

**Conferência no navegador**, em 375×812:
- Usyk, Canelo e Popó acham o boxeador, e tocar abre o perfil;
- Jon Jones aparece em 1º;
- Alex Pereira aparece em 1º, como "Lutador · UFC";
- Flamengo e Champions continuam achando;
- os filtros funcionam;
- os recentes aparecem, a ordem atualiza e o × apaga.
