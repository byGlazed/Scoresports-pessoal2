"use strict";

// Testes das regras da página da liga (liga_regras.js), inspirada na página de torneio do Sofascore.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Liga = require("../static/liga_regras.js");

test("rótulo da temporada: um ano ou a virada (2025/26)", () => {
  assert.equal(Liga.temporadaRotulo("2026-01-28T03:00Z", "2026-12-02T03:00Z"), "2026");
  assert.equal(Liga.temporadaRotulo("2025-08-15T03:00Z", "2026-05-25T03:00Z"), "2025/26");
  assert.equal(Liga.temporadaRotulo(null, "2026-05-25T03:00Z"), null);
});

test("dados da liga no scoreboard da ESPN (escudo claro, datas do calendário)", () => {
  const liga0 = {
    name: "Campeonato Brasileiro Série A",
    logos: [
      { href: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/85.png", rel: ["full", "dark"] },
      { href: "https://a.espncdn.com/i/leaguelogos/soccer/500/85.png", rel: ["full", "default"] },
    ],
    calendarStartDate: "2026-01-28T03:00Z",
    calendarEndDate: "2026-12-03T02:59Z",
    season: { year: 2026, startDate: "2026-01-01T05:05Z", endDate: "2026-12-31T04:59Z" },
  };
  assert.deepEqual(Liga.infoDaLiga(liga0), {
    nome: "Campeonato Brasileiro Série A",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/85.png",
    inicio: "2026-01-28T03:00Z",
    fim: "2026-12-03T02:59Z",
    temporada: "2026",
  });
  // sem calendário, as datas da temporada
  const semCal = Liga.infoDaLiga({ name: "X", logos: [], season: { startDate: "2025-08-01T00:00Z", endDate: "2026-06-01T00:00Z" } });
  assert.equal(semCal.temporada, "2025/26");
  assert.equal(semCal.logo, null);
  assert.equal(Liga.infoDaLiga(null), null);
});

test("números da temporada pela classificação (futebol)", () => {
  const dados = JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", "espn_classificacao_eng1_2025.json"), "utf8"));
  // monta os grupos como o direto.js faz: stats por nome
  const grupos = [];
  (function andar(no) {
    const entradas = ((no.standings || {}).entries) || [];
    if (entradas.length) grupos.push({ linhas: entradas.map((e) => ({ stats: Object.fromEntries(e.stats.map((s) => [s.name, s.displayValue])) })) });
    (no.children || []).forEach(andar);
  })(dados);
  const r = Liga.resumoTemporada(grupos);
  assert.equal(r.equipes, 20);
  assert.ok(r.jogos > 0 && Number.isInteger(r.jogos));
  assert.ok(r.gols > r.jogos); // mais de um gol por jogo
  assert.equal(r.media, Math.round((r.gols / r.jogos) * 100) / 100);
  assert.ok(r.empatesPct >= 0 && r.empatesPct <= 100);
  // sem jogo nenhum, nada a mostrar
  assert.equal(Liga.resumoTemporada([{ linhas: [{ stats: { gamesPlayed: "0", pointsFor: "0", ties: "0" } }] }]), null);
  assert.equal(Liga.resumoTemporada([]), null);
});

test("maior campeão da lista de campeões", () => {
  const lista = [
    { temporada: "2025", campeao: "Flamengo" },
    { temporada: "2024", campeao: "Botafogo" },
    { temporada: "2023", campeao: "Palmeiras" },
    { temporada: "2022", campeao: "Palmeiras" },
    { temporada: "2021", campeao: "Atlético-MG" },
  ];
  assert.deepEqual(Liga.maisTitulos(lista), { nome: "Palmeiras", titulos: 2 });
  // ninguém repete: não há "maior campeão" a mostrar
  assert.equal(Liga.maisTitulos(lista.slice(0, 2)), null);
  assert.equal(Liga.maisTitulos([]), null);
});

test("destaques: ao vivo, próximos e últimos resultados", () => {
  const j = (id, estado, inicio) => ({ id, estado, inicio });
  const jogos = [j("1", 3, "2026-11-18T22:00Z"), j("2", 3, "2026-11-18T23:30Z"), j("3", 2, "2026-11-19T22:30Z"), j("4", 1, "2026-11-20T00:30Z"), j("5", 1, "2026-11-19T23:00Z")];
  const d = Liga.destaques(jogos, 3);
  assert.deepEqual(d.aoVivo.map((x) => x.id), ["3"]);
  assert.deepEqual(d.proximos.map((x) => x.id), ["5", "4"]); // pela hora
  assert.deepEqual(d.ultimos.map((x) => x.id), ["2", "1"]); // o mais recente primeiro
  assert.deepEqual(Liga.destaques([], 3), { aoVivo: [], proximos: [], ultimos: [] });
});

test("datas a buscar para os destaques: o próximo dia com jogo e o último", () => {
  const datas = ["2026-11-14", "2026-11-18", "2026-11-19", "2026-11-22", "2026-11-23"];
  assert.deepEqual(Liga.datasDosDestaques(datas, "2026-11-19"), { proxima: "2026-11-19", anterior: "2026-11-18" });
  assert.deepEqual(Liga.datasDosDestaques(datas, "2026-11-20"), { proxima: "2026-11-22", anterior: "2026-11-19" });
  assert.deepEqual(Liga.datasDosDestaques(datas, "2026-12-30"), { proxima: null, anterior: "2026-11-23" });
  assert.deepEqual(Liga.datasDosDestaques([], "2026-11-19"), { proxima: null, anterior: null });
});

test("divisão de cima e de baixo", () => {
  assert.deepEqual(Liga.divisoes("futebol", "bra.1"), { inferior: "bra.2" });
  assert.deepEqual(Liga.divisoes("futebol", "bra.2"), { superior: "bra.1" });
  assert.deepEqual(Liga.divisoes("futebol", "eng.1"), {});
  assert.deepEqual(Liga.divisoes("nba", "nba"), {});
});
