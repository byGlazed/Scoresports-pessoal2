"use strict";

// Testes das regras das telas inspiradas no Sofascore (visual_regras.js).
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const Visual = require("../static/visual_regras.js");

const ladoDe = (id) => (id === "1" ? "casa" : "fora");
const LANCES = [
  { tempo: "24'", tipo: "amarelo", time_id: "1", jogadores: ["R. Araújo"], texto: "" },
  { tempo: "40'", tipo: "gol", time_id: "2", jogadores: ["Alexis Mac Allister", "Dominik Szoboszlai"], texto: "Goal!" },
  { tempo: "54'", tipo: "gol", time_id: "2", jogadores: ["Florian Wirtz"], texto: "Goal!" },
  { tempo: "60'", tipo: "substituicao", time_id: "1", jogadores: ["Darío Osorio", "Quinten Timber"], texto: "" },
  { tempo: "89'", tipo: "gol", time_id: "2", jogadores: ["Alexander Isak"], texto: "Goal!" },
  { tempo: "90'+5'", tipo: "gol", time_id: "1", jogadores: ["Eddie Nketiah"], texto: "Goal! Penalty converted" },
];

test("autores dos gols embaixo de cada time", () => {
  assert.deepEqual(Visual.autoresDosGols(LANCES, ladoDe), {
    casa: ["Eddie Nketiah 90'+5' (pên.)"],
    fora: ["Alexis Mac Allister 40'", "Florian Wirtz 54'", "Alexander Isak 89'"],
  });
  // gol contra conta para o outro lado
  const contra = [{ tempo: "10'", tipo: "gol_contra", time_id: "1", jogadores: ["Zagueiro"], texto: "Own goal" }];
  assert.deepEqual(Visual.autoresDosGols(contra, ladoDe), { casa: [], fora: ["Zagueiro 10' (contra)"] });
  assert.deepEqual(Visual.autoresDosGols(null, ladoDe), { casa: [], fora: [] });
});

test("placar corrido nos gols da linha do tempo", () => {
  assert.deepEqual(Visual.placarCorrido(LANCES, ladoDe), [null, "0 - 1", "0 - 2", null, "0 - 3", "1 - 3"]);
});

test("forma recente: os 5 últimos encerrados, do mais antigo ao mais novo", () => {
  const j = (id, data, casa, fora, pc, pf, estado = 3) => ({ id, data, inicio: `${data}T20:00Z`, estado, status: "Encerrado", casa: { id: casa, nome: casa, placar: pc }, fora: { id: fora, nome: fora, placar: pf } });
  const jogos = [
    j("a", "2026-10-01", "LIV", "ARS", 1, 0),
    j("b", "2026-10-08", "CHE", "LIV", 1, 1),
    j("c", "2026-10-15", "LIV", "MUN", 0, 2),
    j("d", "2026-10-22", "BHA", "LIV", 0, 2),
    j("e", "2026-10-29", "LIV", "TOT", 3, 1),
    j("f", "2026-11-08", "CRY", "LIV", 1, 3),
    j("g", "2026-11-22", "LIV", "MUN", null, null, 1),
  ];
  const forma = Visual.formaRecente(jogos, "LIV");
  assert.deepEqual(forma.map((x) => [x.resultado, x.placar, x.adversario.nome]), [
    ["E", "1-1", "CHE"],
    ["D", "0-2", "MUN"],
    ["V", "2-0", "BHA"],
    ["V", "3-1", "TOT"],
    ["V", "3-1", "CRY"],
  ]);
  assert.equal(Visual.proximoJogo(jogos, "2026-11-19").id, "g");
});

test("mini-classificação: o time e dois vizinhos de cada lado", () => {
  const linhas = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), nome: `T${i + 1}` }));
  assert.deepEqual(Visual.miniClassificacao(linhas, "10").map((l) => l.id), ["8", "9", "10", "11", "12"]);
  assert.deepEqual(Visual.miniClassificacao(linhas, "1").map((l) => l.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(Visual.miniClassificacao(linhas, "20").map((l) => l.id), ["16", "17", "18", "19", "20"]);
  assert.deepEqual(Visual.miniClassificacao(linhas, "99"), []);
});

test("progresso da temporada", () => {
  const p = Visual.progressoTemporada("2026-01-28T03:00Z", "2026-12-02T03:00Z", new Date("2026-11-19T12:00Z"));
  assert.equal(p.pct, 96); // 295 de 308 dias
  assert.equal(Visual.progressoTemporada("2026-01-28", "2026-12-02", new Date("2025-12-01")).pct, 0);
  assert.equal(Visual.progressoTemporada("2026-01-28", "2026-12-02", new Date("2027-01-01")).pct, 100);
  assert.equal(Visual.progressoTemporada(null, "2026-12-02", new Date()), null);
});
