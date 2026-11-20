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

test("mini-classificação guarda a posição da tabela inteira quando a ESPN não manda o rank", () => {
  const linhas = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1) }));
  const mini = Visual.miniClassificacao(linhas, "10");
  assert.deepEqual(mini.map((l) => l.rank), [8, 9, 10, 11, 12]);
  // o rank que a ESPN manda (empate na posição, por exemplo) fica como está
  const comRank = linhas.map((l, i) => ({ ...l, rank: i === 9 ? 9 : i + 1 }));
  assert.equal(Visual.miniClassificacao(comRank, "10")[2].rank, 9);
  // não muda a lista original
  assert.equal(linhas[9].rank, undefined);
});

test("imagem pequena pelo redimensionador da ESPN", () => {
  assert.equal(
    Visual.imagemPequena("https://a.espncdn.com/i/teamlogos/soccer/500/2029.png", 64),
    "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/2029.png&w=64&h=64"
  );
  assert.equal(
    Visual.imagemPequena("https://a.espncdn.com/i/headshots/nba/players/full/1966.png", 120, 88),
    "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/1966.png&w=120&h=88"
  );
  // a1, a2... da ESPN também
  assert.equal(Visual.imagemPequena("https://a1.espncdn.com/i/teamlogos/nba/500/bos.png", 40), "https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/bos.png&w=40&h=40");
  // já redimensionada, de outro site, ou vazia: fica como está
  const ja = "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/2029.png&w=64&h=64";
  assert.equal(Visual.imagemPequena(ja, 32), ja);
  assert.equal(Visual.imagemPequena("https://cdn.nba.com/logos/nba/1610612738/global/L/logo.svg", 64), "https://cdn.nba.com/logos/nba/1610612738/global/L/logo.svg");
  assert.equal(Visual.imagemPequena(null, 64), null);
});

test("autores dos gols: o mesmo jogador numa linha só (Kaio 28', 60', 67')", () => {
  const lances = [
    { tempo: "28'", tipo: "gol", time_id: "1", jogadores: ["Kaio"], texto: "" },
    { tempo: "34'", tipo: "gol", time_id: "1", jogadores: ["Memphis Depay"], texto: "" },
    { tempo: "60'", tipo: "gol", time_id: "1", jogadores: ["Kaio"], texto: "Penalty" },
    { tempo: "67'", tipo: "gol", time_id: "1", jogadores: ["Kaio"], texto: "" },
  ];
  assert.deepEqual(Visual.autoresDosGols(lances, ladoDe), { casa: ["Kaio 28', 60' (pên.), 67'", "Memphis Depay 34'"], fora: [] });
});
