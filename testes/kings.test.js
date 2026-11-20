"use strict";

// Testes das regras da Kings League (kings_regras.js), com os jogos reais da Kings Cup Brazil 2026/27
// (testes/amostras/kings_brazil_2026.json, no formato que o robô grava).
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Kings = require("../static/kings_regras.js");

const BRASIL = JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", "kings_brazil_2026.json"), "utf8"));
const comp = { id: "brazil", ...BRASIL };

test("jogo encerrado: placar, tempos, vencedor e o vídeo", () => {
  const j = Kings.jogoDoApp(comp, BRASIL.jogos.find((x) => x.id === 2851));
  assert.equal(j.estado, 3);
  assert.equal(j.status, "Fim");
  assert.deepEqual([j.casa.sigla, j.casa.placar, j.fora.sigla, j.fora.placar], ["FNK", 10, "NYV", 3]);
  assert.equal(j.vencedor, 0);
  assert.equal(j.rodada, "Rodada 1");
  assert.equal(j.data, "2026-10-19"); // 17h de Brasília
  assert.match(j.video, /^https:\/\/www\.youtube\.com\//);
});

test("jogo a jogar e times ainda a definir", () => {
  const quartas = Kings.jogoDoApp(comp, BRASIL.jogos.find((x) => x.rodada === "Quarter-Finals"));
  assert.equal(quartas.estado, 1);
  assert.equal(quartas.rodada, "Quartas de final");
  assert.equal(quartas.casa.placar, null);
  const final = Kings.jogoDoApp(comp, BRASIL.jogos.find((x) => x.rodada === "Final"));
  assert.equal(final.casa.nome, "A definir");
});

test("empate decidido nos pênaltis: o vencedor sai dos pênaltis", () => {
  const j = Kings.jogoDoApp(comp, { id: 1, rodada: "Matchday 1", grupo: "A", inicio: "2026-10-19T20:00:00.000Z", status: "ended", casa: "164", fora: "163", placar: [3, 3], tempos: [[1, 1], [2, 2]], penaltis: [1, 2], video: null });
  assert.equal(j.vencedor, 1);
  assert.equal(j.status, "Fim (pên.)");
});

test("ao vivo: o minuto", () => {
  const j = Kings.jogoDoApp(comp, { id: 2, rodada: "Matchday 1", grupo: "A", inicio: "2026-10-19T20:00:00.000Z", status: "live", minuto: 23, casa: "164", fora: "163", placar: [2, 1], tempos: [], penaltis: null });
  assert.equal(j.estado, 2);
  assert.equal(j.status, "23'");
});

test("classificação da fase de grupos: cada vitória vale 1 (pênaltis também), sem o Challenger", () => {
  const grupos = Kings.classificacao(comp);
  assert.deepEqual(grupos.map((g) => g.nome), ["Grupo A", "Grupo B"]);
  // a ordem oficial sai das quartas: LOUD direto na semifinal; FNK, FLX e FUR nas quartas; DIB fora
  assert.deepEqual(grupos[0].linhas.map((l) => l.sigla), ["LSC", "FNK", "FLX", "FUR", "DIB"]);
  assert.deepEqual(grupos[1].linhas.slice(0, 3).map((l) => l.sigla), ["CAP", "DDL", "DEP"]);
  const cap = grupos[1].linhas[0];
  assert.equal(cap.j, 4);
  assert.equal(cap.v, 4); // "100% no Grupo B"
  assert.equal(cap.sg, cap.gp - cap.gc);
});

test("jogos do dia (horário de Brasília) e o próximo jogo", () => {
  const dia = Kings.doDia([comp], "2026-11-16");
  assert.equal(dia.length, 1);
  assert.equal(dia[0].jogos.length, 5);
  assert.equal(Kings.doDia([comp], "2026-11-17").length, 0);
  const prox = Kings.proximoJogo(comp, "2026-11-20T12:00:00Z");
  assert.equal(prox.rodada, "Quartas de final");
});
