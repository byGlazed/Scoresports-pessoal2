"use strict";

// Testes das regras puras da página do time. Rode com: node --test testes/

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const T = require("../celular/time_dados.js");

const amostra = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", `${nome}.json`), "utf8"));
const nomes = (grupos) => grupos.map((g) => g.nome);
const total = (grupos) => grupos.reduce((n, g) => n + g.atletas.length, 0);

/* ---------- Elenco ---------- */

test("agruparElenco futebol: grupos na ordem Goleiros, Defensores, Meias, Atacantes", () => {
  const roster = amostra("roster_futebol");
  const r = T.agruparElenco("futebol", roster);
  const ordem = ["Goleiros", "Defensores", "Meias", "Atacantes", "Outros"];
  const vistos = nomes(r.grupos);
  assert.deepEqual(vistos, ordem.filter((n) => vistos.includes(n)));
  assert.equal(vistos[0], "Goleiros");
  assert.equal(total(r.grupos), roster.athletes.length);
  assert.equal(r.tecnico, null);
});

test("agruparElenco nba: armadores, alas e pivôs, com o técnico", () => {
  const roster = amostra("roster_nba");
  const r = T.agruparElenco("nba", roster);
  for (const n of nomes(r.grupos)) assert.ok(["Armadores", "Alas", "Pivôs", "Outros"].includes(n), n);
  assert.equal(total(r.grupos), roster.athletes.length);
  assert.equal(r.tecnico, "Mike Brown");
});

test("agruparElenco nfl: usa os grupos da ESPN traduzidos, com o técnico", () => {
  const r = T.agruparElenco("nfl", amostra("roster_nfl"));
  assert.equal(r.grupos[0].nome, "Ataque");
  assert.ok(nomes(r.grupos).includes("Times especiais"));
  assert.ok(nomes(r.grupos).includes("Lesionados"));
  assert.equal(r.tecnico, "Andy Reid");
});

test("agruparElenco sem atletas devolve lista vazia", () => {
  assert.deepEqual(T.agruparElenco("futebol", {}), { grupos: [], tecnico: null });
});

test("grupoDaPosicao: posição desconhecida vai para Outros", () => {
  assert.equal(T.grupoDaPosicao("futebol", { name: "Sweeper" }), "Outros");
  assert.equal(T.grupoDaPosicao("futebol", null), "Outros");
});

test("grupoDaPosicao: MLB e NHL já previstos", () => {
  assert.equal(T.grupoDaPosicao("mlb", { abbreviation: "SS" }), "Defensores internos");
  assert.equal(T.grupoDaPosicao("mlb", { abbreviation: "SP" }), "Arremessadores");
  assert.equal(T.grupoDaPosicao("nhl", { abbreviation: "LW" }), "Atacantes");
  assert.equal(T.grupoDaPosicao("nhl", { abbreviation: "G" }), "Goleiros");
});

/* ---------- Jogos ---------- */

const jogo = (id, inicio, estado, casaPlacar, foraPlacar, extra = {}) => ({
  id: String(id),
  inicio,
  estado,
  status: extra.status || (estado === 3 ? "Encerrado" : "Agendado"),
  casa: { id: "1", placar: casaPlacar },
  fora: { id: "2", placar: foraPlacar },
});

test("resultadoDoTime: vitória, derrota, empate e jogo sem resultado", () => {
  const j = jogo(1, "2026-11-01T20:00:00Z", 3, "2", "1");
  assert.equal(T.resultadoDoTime(j, "1"), "V");
  assert.equal(T.resultadoDoTime(j, "2"), "D");
  assert.equal(T.resultadoDoTime(jogo(2, "2026-11-01T20:00:00Z", 3, "1", "1"), "1"), "E");
  assert.equal(T.resultadoDoTime(jogo(3, "2026-11-20T20:00:00Z", 1, null, null), "1"), null);
  assert.equal(T.resultadoDoTime(j, "999"), null);
});

test("separarJogos vazio", () => {
  assert.deepEqual(T.separarJogos([], "2026-11-11T12:00:00Z"), { ultimos: [], proximos: [] });
});

test("separarJogos: ordem e limite", () => {
  const encerrados = Array.from({ length: 12 }, (_, i) => jogo(`e${i}`, `2026-10-${String(10 + i).padStart(2, "0")}T20:00:00Z`, 3, "1", "0"));
  const agendados = [jogo("a3", "2026-11-30T20:00:00Z", 1), jogo("a1", "2026-11-15T20:00:00Z", 1), jogo("a2", "2026-11-20T20:00:00Z", 1)];
  const r = T.separarJogos([...agendados, ...encerrados], "2026-11-11T12:00:00Z");
  assert.equal(r.ultimos.length, 10);
  assert.equal(r.ultimos[0].id, "e11");
  assert.deepEqual(r.proximos.map((j) => j.id), ["a1", "a2", "a3"]);
});

test("separarJogos: adiado com data passada não aparece", () => {
  const adiado = jogo("x", "2026-11-10T20:00:00Z", 1, null, null, { status: "Adiado" });
  const cancelado = jogo("y", "2026-11-20T20:00:00Z", 1, null, null, { status: "Cancelado" });
  const r = T.separarJogos([adiado, cancelado], "2026-11-11T12:00:00Z");
  assert.deepEqual(r, { ultimos: [], proximos: [] });
});

test("separarJogos: jogo ao vivo que começou há pouco fica em próximos", () => {
  const aoVivo = jogo("v", "2026-11-11T11:00:00Z", 2, "0", "0");
  assert.deepEqual(T.separarJogos([aoVivo], "2026-11-11T12:00:00Z").proximos.map((j) => j.id), ["v"]);
});

/* ---------- Estatísticas ---------- */

test("estatisticasDoTime futebol: Ataque, Defesa e Geral com os valores da ESPN", () => {
  const cats = amostra("stats_futebol").splits.categories;
  const r = T.estatisticasDoTime("futebol", cats);
  assert.deepEqual(r.map((g) => g.grupo), ["Ataque", "Defesa", "Geral"]);
  const vitorias = cats.find((c) => c.name === "general").stats.find((s) => s.name === "wins").displayValue;
  assert.equal(r[2].itens.find((i) => i.rotulo === "Vitórias").valor, vitorias);
  assert.equal(r[0].itens[0].rotulo, "Gols");
});

test("estatisticasDoTime nba e nfl: primeiro item é Pontos por jogo", () => {
  assert.equal(T.estatisticasDoTime("nba", amostra("stats_nba").splits.categories)[0].itens[0].rotulo, "Pontos por jogo");
  assert.equal(T.estatisticasDoTime("nfl", amostra("stats_nfl").splits.categories)[0].itens[0].rotulo, "Pontos por jogo");
});

test("estatisticasDoTime sem dados ou esporte sem tabela devolve lista vazia", () => {
  assert.deepEqual(T.estatisticasDoTime("futebol", []), []);
  assert.deepEqual(T.estatisticasDoTime("mlb", amostra("stats_nba").splits.categories), []);
});

test("estatisticasDoTime pula estatística ausente e grupo vazio", () => {
  const r = T.estatisticasDoTime("futebol", [{ name: "general", stats: [{ name: "wins", displayValue: "7" }] }]);
  assert.deepEqual(r, [{ grupo: "Geral", itens: [{ rotulo: "Vitórias", valor: "7" }] }]);
});

/* ---------- Wikidata ---------- */

const p31 = (id) => ({ mainsnak: { snaktype: "value", datavalue: { value: { id } } }, rank: "normal" });

test("escolherClube: pega o primeiro clube ou seleção de futebol", () => {
  const fla = amostra("wikidata_flamengo").entities.Q17479;
  assert.equal(T.escolherClube({ entities: { Q1: { claims: { P31: [p31("Q5")] } }, Q17479: fla } }), "Q17479");
  assert.equal(T.escolherClube({ entities: { Q9: { claims: { P31: [p31("Q6979593")] } } } }), "Q9");
  assert.equal(T.escolherClube({ entities: { Q1: { claims: { P31: [p31("Q5")] } } } }), null);
  assert.equal(T.escolherClube({}), null);
});

test("idTecnicoAtual: ignora técnicos com data de fim e 'sem valor'", () => {
  assert.equal(T.idTecnicoAtual(amostra("wikidata_flamengo").entities.Q17479), null);
});

test("idTecnicoAtual: prefere o rank preferred e o técnico sem data de fim", () => {
  const tecnico = (id, rank, fim) => ({ mainsnak: { snaktype: "value", datavalue: { value: { id } } }, rank, qualifiers: fim ? { P582: [{}] } : {} });
  const entidade = { claims: { P286: [tecnico("Q10", "normal", true), tecnico("Q20", "normal", false), tecnico("Q30", "preferred", false)] } };
  assert.equal(T.idTecnicoAtual(entidade), "Q30");
  assert.equal(T.idTecnicoAtual({ claims: { P286: [tecnico("Q10", "normal", true)] } }), null);
  assert.equal(T.idTecnicoAtual({}), null);
});
