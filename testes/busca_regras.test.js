"use strict";

// Testes das regras da busca. Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const B = require("../static/busca_regras.js");

const amostra = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", `${nome}.json`), "utf8"));
const titulos = (l) => l.map((x) => x.titulo);

test("boxeadoresDaWikipedia: só páginas de boxeadores, sem as páginas de lutas", () => {
  const usyk = titulos(B.boxeadoresDaWikipedia(amostra("wiki_boxe_usyk")));
  assert.ok(usyk.includes("Oleksandr Usyk"));
  assert.ok(!usyk.some((t) => t.includes(" vs. ")));
  const canelo = titulos(B.boxeadoresDaWikipedia(amostra("wiki_boxe_canelo")));
  assert.ok(canelo.includes("Canelo Álvarez"));
  assert.ok(!canelo.some((t) => t.includes(" vs. ")));
});

test("boxeadoresDaWikipedia: Jon Jones não vira boxeador; resposta vazia dá lista vazia", () => {
  assert.deepEqual(B.boxeadoresDaWikipedia(amostra("wiki_boxe_jonjones")), []);
  assert.deepEqual(B.boxeadoresDaWikipedia({}), []);
});

test("ordenarPorRelevancia: nome exato primeiro", () => {
  const r = B.ordenarPorRelevancia([{ nome: "Amari Jones" }, { nome: "Jon Jones" }, { nome: "Jones Neto" }], "jon jones");
  assert.equal(r[0].nome, "Jon Jones");
});

test("ordenarPorRelevancia: começa com antes de palavra que começa com", () => {
  const r = B.ordenarPorRelevancia([{ nome: "Alex Pereira" }, { nome: "Pereira Lopes" }], "pere");
  assert.deepEqual(r.map((x) => x.nome), ["Pereira Lopes", "Alex Pereira"]);
});

test("ordenarPorRelevancia: ignora acentos e maiúsculas, empates mantêm a ordem", () => {
  const r = B.ordenarPorRelevancia([{ nome: "Werik Popó" }, { nome: "Popó" }, { nome: "Zé" }, { nome: "Ana" }], "popo");
  assert.deepEqual(r.map((x) => x.nome), ["Popó", "Werik Popó", "Zé", "Ana"]);
  assert.deepEqual(B.ordenarPorRelevancia([], "x"), []);
});

test("ordenarPorRelevancia com os boxeadores reais: o certo em 1º", () => {
  const nomes = (n) => B.boxeadoresDaWikipedia(amostra(`wiki_boxe_${n}`)).map((x) => ({ nome: x.titulo }));
  assert.equal(B.ordenarPorRelevancia(nomes("usyk"), "Usyk")[0].nome, "Oleksandr Usyk");
  assert.equal(B.ordenarPorRelevancia(nomes("canelo"), "Canelo")[0].nome, "Canelo Álvarez");
});

test("lembrarRecente: novo no topo, repetido sobe sem duplicar, limite e sem alterar a original", () => {
  const a = { tipo: "time", esporte: "futebol", id: "819", nome: "Flamengo" };
  const b = { tipo: "jogador", esporte: "boxe", id: "Oleksandr Usyk", nome: "Oleksandr Usyk" };
  const l1 = B.lembrarRecente([], a);
  const l2 = B.lembrarRecente(l1, b);
  assert.deepEqual(l2.map((x) => x.nome), ["Oleksandr Usyk", "Flamengo"]);
  const l3 = B.lembrarRecente(l2, { ...a });
  assert.deepEqual(l3.map((x) => x.nome), ["Flamengo", "Oleksandr Usyk"]);
  assert.deepEqual(l1.map((x) => x.nome), ["Flamengo"]);
  let l = [];
  for (let i = 0; i < 12; i++) l = B.lembrarRecente(l, { tipo: "time", esporte: "nba", id: String(i), nome: `T${i}` });
  assert.equal(l.length, 10);
  assert.equal(l[0].nome, "T11");
  assert.equal(l[9].nome, "T2");
});

test("filtrarBoxeadores: nome que bate, ou o 1º da busca da Wikipédia (apelidos como Popó)", () => {
  const ordem = ["Acelino Freitas", "Floyd Patterson", "Ricky Hatton", "Popo Ramos"];
  const boxeadores = [{ titulo: "Ricky Hatton" }, { titulo: "Popo Ramos" }, { titulo: "Acelino Freitas" }, { titulo: "Floyd Patterson" }];
  assert.deepEqual(titulos(B.filtrarBoxeadores(boxeadores, ordem, "Popó")), ["Acelino Freitas", "Popo Ramos"]);
  // o 1º da busca pode não ser boxeador (página de desambiguação): vale o 1º boxeador
  assert.deepEqual(titulos(B.filtrarBoxeadores([{ titulo: "Acelino Freitas" }], ["Popo", "Acelino Freitas"], "Popó")), ["Acelino Freitas"]);
  assert.deepEqual(titulos(B.filtrarBoxeadores([{ titulo: "Floyd Patterson" }, { titulo: "Ricky Hatton" }], ["Floyd Patterson", "Ricky Hatton"], "Champions")), ["Floyd Patterson"]);
  assert.deepEqual(B.filtrarBoxeadores([], [], "x"), []);
});

test("filtrarBoxeadores: com nome de mais de uma palavra, só quem tem o nome parecido", () => {
  const r = B.filtrarBoxeadores([{ titulo: "Tony Danza" }, { titulo: "Amari Jones" }], ["Tony Danza", "Amari Jones"], "Jon Jones");
  assert.deepEqual(titulos(r), []);
  const r2 = B.filtrarBoxeadores([{ titulo: "Tony Danza" }, { titulo: "Tyson Fury" }], ["Tony Danza", "Tyson Fury"], "Tyson Fury");
  assert.deepEqual(titulos(r2), ["Tyson Fury"]);
});

/* ---------- Correções da revisão final ---------- */

test("rotuloUfc: 'Lutador · UFC' sem repetir o UFC que já vinha na descrição", () => {
  assert.equal(B.rotuloUfc("UFC"), "Lutador · UFC");
  assert.equal(B.rotuloUfc("UFC, Peso meio-pesado"), "Lutador · UFC · Peso meio-pesado");
  assert.equal(B.rotuloUfc("UFC Peso-pena"), "Lutador · UFC · Peso-pena");
  assert.equal(B.rotuloUfc("MMA"), "Lutador · UFC · MMA");
  assert.equal(B.rotuloUfc(null), "Lutador · UFC");
  assert.equal(B.rotuloUfc("Lutador · UFC · MMA"), "Lutador · UFC · MMA");
});

test("lembrarRecente: boxeador é o mesmo pelo nome, mesmo com códigos diferentes", () => {
  const agenda = { tipo: "jogador", esporte: "boxe", id: "oleksandr-usyk", nome: "Oleksandr Usyk" };
  const wiki = { tipo: "jogador", esporte: "boxe", id: "Oleksandr Usyk", nome: "Oleksandr Usyk" };
  const l = B.lembrarRecente(B.lembrarRecente([], agenda), wiki);
  assert.equal(l.length, 1);
  assert.equal(B.chaveRecente(agenda), B.chaveRecente(wiki));
});
