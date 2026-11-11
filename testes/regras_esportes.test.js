"use strict";

// Testes das regras de MLB e NHL. Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../celular/regras_esportes.js");

const amostra = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", `${nome}.json`), "utf8"));

const beisebol = (period, shortDetail) => ({ period, type: { state: "in", name: "STATUS_IN_PROGRESS", shortDetail } });
const hoquei = (period, displayClock, extra = {}) => ({ period, displayClock, type: { state: "in", name: extra.name || "STATUS_IN_PROGRESS" }, _tipoTemporada: extra.tipo });

test("statusAoVivo beisebol: parte de cima, de baixo, intervalo e fim da entrada", () => {
  assert.equal(R.statusAoVivo("baseball", beisebol(5, "Top 5th")), "▲ 5ª entrada");
  assert.equal(R.statusAoVivo("baseball", beisebol(9, "Bot 9th")), "▼ 9ª entrada");
  assert.equal(R.statusAoVivo("baseball", beisebol(7, "Mid 7th")), "Intervalo da 7ª");
  assert.equal(R.statusAoVivo("baseball", beisebol(3, "End 3rd")), "Fim da 3ª");
});

test("statusAoVivo beisebol: sem a parte da entrada não inventa", () => {
  assert.equal(R.statusAoVivo("baseball", beisebol(6, "6ª")), "6ª entrada");
  assert.equal(R.statusAoVivo("baseball", { period: 2, type: { state: "in" } }), "2ª entrada");
});

test("statusAoVivo hóquei: período com relógio e fim de período", () => {
  assert.equal(R.statusAoVivo("hockey", hoquei(2, "12:34")), "2º período · 12:34");
  assert.equal(R.statusAoVivo("hockey", hoquei(3, "")), "3º período");
  assert.equal(R.statusAoVivo("hockey", hoquei(1, "0:00", { name: "STATUS_END_PERIOD" })), "Fim do 1º período");
});

test("statusAoVivo hóquei: prorrogação, pênaltis e várias prorrogações nos playoffs", () => {
  assert.equal(R.statusAoVivo("hockey", hoquei(4, "3:10")), "Prorrogação · 3:10");
  assert.equal(R.statusAoVivo("hockey", hoquei(5, "0:00", { tipo: 2 })), "Pênaltis");
  assert.equal(R.statusAoVivo("hockey", hoquei(5, "0:00")), "Pênaltis");
  assert.equal(R.statusAoVivo("hockey", hoquei(6, "15:00", { tipo: 3 })), "3ª prorrogação · 15:00");
  assert.equal(R.statusAoVivo("hockey", hoquei(5, "", { tipo: 3 })), "2ª prorrogação");
});

test("statusAoVivo de outro esporte devolve null", () => {
  assert.equal(R.statusAoVivo("basketball", { period: 2, type: { state: "in" } }), null);
  assert.equal(R.statusAoVivo("hockey", null), null);
});

test("notaDoJogo junta o nome do jogo e a situação da série", () => {
  assert.equal(R.notaDoJogo(amostra("mlb_ws_jogo5")), "World Series - Game 5 · MIL ganhou a série 4-1");
  assert.equal(R.notaDoJogo({ notes: [{ headline: "Rodada 12" }] }), "Rodada 12");
  assert.equal(R.notaDoJogo({ series: { summary: "Série empatada 1-1" } }), "Série empatada 1-1");
  assert.equal(R.notaDoJogo({}), null);
  assert.equal(R.notaDoJogo(null), null);
});

test("nomeLiderEsporte traduz por esporte", () => {
  assert.equal(R.nomeLiderEsporte("nhl", "goals"), "Gols");
  assert.equal(R.nomeLiderEsporte("mlb", "wins"), "Vitórias (arremessador)");
  assert.equal(R.nomeLiderEsporte("nhl", "wins"), "Vitórias (goleiro)");
  assert.equal(R.nomeLiderEsporte("mlb", "ERA"), "ERA");
  assert.equal(R.nomeLiderEsporte("nba", "goals"), null);
  assert.equal(R.nomeLiderEsporte("mlb", "naoExiste"), null);
});

test("lancesPontuacao hóquei: só os gols, com período, relógio e placar", () => {
  const l = R.lancesPontuacao("hockey", amostra("nhl_jogadas").plays);
  assert.equal(l.length, 9);
  assert.equal(l[0].tempo, "1º P 3:33");
  assert.equal(l[0].placar, "0 x 1");
  assert.equal(l[0].time_id, "21");
  assert.equal(l[0].tipo, "Gol");
  assert.ok(l[0].texto.includes("Raddysh"));
});

test("lancesPontuacao beisebol: corridas com a parte da entrada", () => {
  const l = R.lancesPontuacao("baseball", amostra("mlb_jogadas").plays);
  assert.equal(l.length, 5);
  assert.equal(l[0].tempo, "▲ 2ª");
  assert.equal(l[0].placar, "1 x 0");
  assert.equal(l[0].tipo, "Corrida");
});

test("lancesPontuacao de outro esporte ou sem jogadas devolve null", () => {
  assert.equal(R.lancesPontuacao("football", []), null);
  assert.deepEqual(R.lancesPontuacao("hockey", undefined), []);
});
