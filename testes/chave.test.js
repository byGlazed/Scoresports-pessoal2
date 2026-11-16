"use strict";

// Testes das regras da chave (mata-mata e playoffs), com jogos reais da ESPN em testes/amostras/chave_*.json.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Chave = require("../static/chave_regras.js");

const amostra = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", `chave_${nome}.json`), "utf8"));
const nomes = (c) => c.lados.map((l) => l.nome);

/** Monta a chave do futebol como a rota do app vai montar. */
function chaveFutebol(nome, ate) {
  const { tipos, jogos } = amostra(nome);
  const usados = ate ? jogos.filter((j) => j.date <= ate) : jogos;
  const fases = Chave.fasesDoFutebol(tipos, jogos);
  const confrontos = Chave.confrontos(usados);
  return { fases, colunas: Chave.montar({ fases: fases.eliminatorias, confrontos, formato: Chave.FORMATOS.futebol }) };
}

/* ---------- Futebol ---------- */

test("fasesDoFutebol: preliminares antes dos grupos ficam de fora da chave", () => {
  const lib = Chave.fasesDoFutebol(amostra("libertadores_2025").tipos, amostra("libertadores_2025").jogos);
  assert.deepEqual(lib.preliminares.map((f) => f.slug), ["first-stage", "second-stage", "third-stage"]);
  assert.deepEqual(lib.eliminatorias.map((f) => f.slug), ["round-of-16", "quarterfinals", "semifinals", "final"]);
  const ucl = Chave.fasesDoFutebol(amostra("champions_2025").tipos, amostra("champions_2025").jogos);
  assert.deepEqual(ucl.preliminares, []);
  assert.deepEqual(ucl.eliminatorias.map((f) => f.slug), ["knockout-round-playoffs", "round-of-16", "quarterfinals", "semifinals", "final"]);
  assert.equal(ucl.eliminatorias[1].nome, "Oitavas de final");
  const cdb = Chave.fasesDoFutebol(amostra("copa_do_brasil_2025").tipos, amostra("copa_do_brasil_2025").jogos);
  assert.equal(cdb.eliminatorias.length, 7);
});

test("confrontos: final de ida e volta pelo agregado da ESPN", () => {
  const { jogos } = amostra("copa_do_brasil_2025");
  const final = Chave.confrontos(jogos).find((c) => c.fase === 13261);
  assert.equal(final.jogos.length, 2);
  const corinthians = final.lados.find((l) => l.nome === "Corinthians");
  const vasco = final.lados.find((l) => l.nome === "Vasco da Gama");
  assert.equal(corinthians.placar, 2);
  assert.equal(vasco.placar, 1);
  assert.equal(corinthians.passou, true);
  assert.equal(vasco.passou, false);
  assert.equal(final.resumo, "agregado 2-1");
  assert.equal(final.estado, 3);
});

test("confrontos: final em jogo único decidida nos pênaltis", () => {
  const final = Chave.confrontos(amostra("champions_2025").jogos).find((c) => c.fase === 13677);
  assert.deepEqual(nomes(final).sort(), ["Arsenal", "Paris Saint-Germain"]);
  assert.equal(final.lados.find((l) => l.nome === "Paris Saint-Germain").passou, true);
  assert.equal(final.resumo, "pên. 4-3");
});

test("montar: Champions com playoff que não corta pela metade", () => {
  const { colunas } = chaveFutebol("champions_2025");
  assert.deepEqual(colunas.map((c) => c.confrontos.length), [8, 8, 4, 2, 1]);
  assert.ok(colunas[1].alimenta.every((a) => a.length <= 1), "cada confronto das oitavas recebe no máximo um da fase de playoff");
  assert.ok(colunas[2].alimenta.every((a) => a.length === 2), "cada confronto das quartas recebe dois das oitavas");
  const final = colunas[4].confrontos[0];
  const semis = colunas[4].alimenta[0].map((i) => colunas[3].confrontos[i]);
  assert.equal(semis.length, 2);
  for (const lado of final.lados) assert.ok(semis.some((s) => s.lados.some((l) => l.id === lado.id && l.passou)), `${lado.nome} veio de uma semifinal`);
});

test("montar: as copas nacionais começam a chave na fase com até 16 confrontos", () => {
  const { colunas } = chaveFutebol("copa_do_brasil_2025");
  const inicio = Chave.colunaInicial(colunas);
  assert.equal(colunas[inicio].fase.slug, "third-round");
  assert.equal(colunas[inicio].confrontos.length, 16);
  assert.deepEqual(colunas.slice(inicio).map((c) => c.confrontos.length), [16, 8, 4, 2, 1]);
});

test("montar: fases ainda não jogadas aparecem com vagas", () => {
  // só os jogos até o fim das oitavas
  const { colunas } = chaveFutebol("champions_2025", "2026-03-19");
  assert.deepEqual(colunas.map((c) => c.confrontos.length), [8, 8, 4, 2, 1]);
  assert.ok(colunas[2].confrontos.every((c) => c === null));
  assert.ok(colunas[3].confrontos.every((c) => c === null));
  assert.equal(colunas[4].confrontos[0], null);
  // as vagas das quartas recebem as oitavas de dois em dois
  assert.deepEqual(colunas[2].alimenta.map((a) => a.length), [2, 2, 2, 2]);
});

test("posicoes: cada confronto fica no meio dos que o alimentam, sem repetir posição", () => {
  const { colunas } = chaveFutebol("champions_2025");
  const pos = Chave.posicoes(colunas);
  colunas[2].alimenta.forEach((a, k) => {
    const meio = (pos[1][a[0]] + pos[1][a[1]]) / 2;
    assert.equal(pos[2][k], meio);
  });
  for (const coluna of pos) assert.equal(new Set(coluna).size, coluna.length);
});

test("temChave e nomeDaAba", () => {
  assert.equal(Chave.temChave("futebol", "eng.1"), false);
  assert.equal(Chave.temChave("futebol", "bra.1"), false);
  assert.equal(Chave.temChave("futebol", "eng.fa"), true);
  assert.equal(Chave.temChave("nba", "nba"), true);
  assert.equal(Chave.nomeDaAba("futebol", "uefa.champions"), "Mata-mata");
  assert.equal(Chave.nomeDaAba("nfl", "nfl"), "Playoffs");
  assert.equal(Chave.nomeDaAba("futebol", "usa.1"), "Playoffs");
});
