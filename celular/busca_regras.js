"use strict";

/* =========================================================================
   Regras puras da busca: ordem por relevância, quais páginas da Wikipédia
   são de boxeadores e a lista de buscas recentes. Não faz pedidos à internet.
   No navegador vira um conjunto de funções globais; no Node é um módulo,
   para os testes em testes/.
   ========================================================================= */

const semAcentoBusca = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** 0 nome exato; 1 começa com o texto; 2 uma palavra começa com o texto; 3 contém; 4 o resto. */
function nivelRelevancia(nome, texto) {
  const n = semAcentoBusca(nome);
  const t = semAcentoBusca(texto);
  if (!t) return 4;
  if (n === t) return 0;
  if (n.startsWith(t)) return 1;
  if (n.split(/[\s\-.']+/).some((p) => p.startsWith(t))) return 2;
  if (n.includes(t)) return 3;
  return 4;
}

/** Itens ({nome}) do mais ao menos relevante para o texto; empates ficam na ordem original. */
function ordenarPorRelevancia(itens, texto) {
  return (itens || [])
    .map((item, i) => ({ item, i, nivel: nivelRelevancia(item && item.nome, texto) }))
    .sort((a, b) => a.nivel - b.nivel || a.i - b.i)
    .map((x) => x.item);
}

/** Na resposta de prop=categories da Wikipédia, as páginas de boxeadores (categoria com "boxers"). */
function boxeadoresDaWikipedia(resposta) {
  let paginas = ((resposta || {}).query || {}).pages || [];
  if (!Array.isArray(paginas)) paginas = Object.values(paginas);
  return paginas
    .filter((p) => p && (p.categories || []).some((c) => String(c.title || "").toLowerCase().includes("boxers")))
    .map((p) => ({ titulo: p.title }));
}

/**
 * Dos boxeadores achados, fica quem tem o nome parecido com o texto, mais o 1º boxeador na ordem da busca da
 * Wikipédia (que cobre apelidos, como "Popó" → Acelino Freitas). Resultado na ordem da busca.
 */
function filtrarBoxeadores(boxeadores, ordemDaBusca, texto) {
  const posicao = (t) => {
    const i = (ordemDaBusca || []).indexOf(t);
    return i < 0 ? 999 : i;
  };
  const ordenados = [...(boxeadores || [])].sort((a, b) => posicao(a.titulo) - posicao(b.titulo));
  // o 1º boxeador da busca só vale para uma palavra (apelido); nome completo precisa bater
  const umaPalavra = semAcentoBusca(texto).split(/\s+/).filter(Boolean).length === 1;
  const primeiro = umaPalavra && ordenados.length ? ordenados[0].titulo : null;
  return ordenados.filter((b) => b.titulo === primeiro || nivelRelevancia(b.titulo, texto) <= 3);
}

const chaveRecente =(x) => `${x.tipo}:${x.esporte}:${x.id}`;

/** Lista de recentes com o item no topo, sem repetição e com no máximo `limite` itens. Não altera a lista recebida. */
function lembrarRecente(lista, item, limite = 10) {
  const chave = chaveRecente(item);
  return [item, ...(lista || []).filter((x) => chaveRecente(x) !== chave)].slice(0, limite);
}

if (typeof module !== "undefined") {
  module.exports = { ordenarPorRelevancia, boxeadoresDaWikipedia, filtrarBoxeadores, lembrarRecente, nivelRelevancia };
}
