"use strict";

// Testes da nota do Scoresports (futebol e NBA). A NBA é calibrada no jogo do print do dono:
// LAC 107 x 132 UTAH, 17/11/2026 (evento 401910006 da ESPN), guardado em testes/amostras/espn_nba_jogo_print.json.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Notas = require("../static/notas_regras.js");
const { boxScoreDoTime } = require("../static/nba_quadra.js");

const entre = (n, min, max, rotulo) => assert.ok(n >= min && n <= max, `${rotulo}: ${n} fora de [${min}, ${max}]`);

test("cores por faixa", () => {
  assert.equal(Notas.corDaNota(9.4), "azul");
  assert.equal(Notas.corDaNota(9.0), "azul");
  assert.equal(Notas.corDaNota(8.4), "verde-azulado");
  assert.equal(Notas.corDaNota(8.0), "verde-azulado");
  assert.equal(Notas.corDaNota(7.0), "verde");
  assert.equal(Notas.corDaNota(6.9), "amarelo");
  assert.equal(Notas.corDaNota(6.5), "amarelo");
  assert.equal(Notas.corDaNota(6.4), "laranja");
  assert.equal(Notas.corDaNota(6.0), "laranja");
  assert.equal(Notas.corDaNota(5.9), "vermelho");
  assert.equal(Notas.corDaNota(null), null);
  assert.equal(Notas.formatar(7.4), "7.4");
  assert.equal(Notas.formatar(7.4, 2), "7.40");
  assert.equal(Notas.formatar(null), "–");
  assert.equal(Notas.TEXTO_INFO, "Nota do Scoresports, calculada pelo app a partir das estatísticas do jogo. Não é a nota do Sofascore.");
});

test("NBA: as notas do print", () => {
  const amostra = JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", "espn_nba_jogo_print.json"), "utf8"));
  const jogadores = amostra.boxscore.players.flatMap((t) => {
    const b = boxScoreDoTime(t);
    return [...b.titulares, ...b.reservas];
  });
  const doPrint = {
    "Brice Sensabaugh": 9.4,
    "Keyonte George": 8.4,
    "Brook Lopez": 7.5,
    "Rui Hachimura": 7.4,
    "Darius Garland": 7.3,
    "Mo Bamba": 7.5,
    "Josh Okogie": 7.2,
    "Keaton Wagler": 6.8,
    "Darryn Peterson": 6.6,
    "Josh Green": 6.3,
  };
  for (const [nome, esperado] of Object.entries(doPrint)) {
    const j = jogadores.find((x) => x.nome === nome);
    assert.ok(j, `${nome} não está na amostra`);
    const nota = Notas.notaNba(j);
    assert.ok(Math.abs(nota - esperado) <= 0.4, `${nome}: nota ${nota}, print ${esperado}`);
  }
});

test("NBA: pouco tempo ou não jogou", () => {
  assert.equal(Notas.notaNba({ minutos: 4, pts: 10 }), null);
  assert.equal(Notas.notaNba({ minutos: null }), null);
  assert.ok(Notas.notaNba({ minutos: 10, pts: 0, fg: { f: 0, t: 4 }, to: 2 }) <= 5.8);
});

test("NBA: game score de Hollinger", () => {
  // 40 pts, 16-21 FG, 6-7 LL, 1 OREB, 10 DREB, 0 STL, 5 AST, 0 BLK, 2 PF, 2 TO
  const l = { pts: 40, fg: { f: 16, t: 21 }, ft: { f: 6, t: 7 }, oreb: 1, dreb: 10, stl: 0, ast: 5, blk: 0, pf: 2, to: 2 };
  // 40 + 6.4 - 14.7 - 0.4 + 0.7 + 3.0 + 0 + 3.5 + 0 - 0.8 - 2 = 35.7
  assert.equal(Math.round(Notas.gameScore(l) * 10) / 10, 35.7);
  assert.equal(Notas.gameScore({}), 0);
});

const empate = { resultado: "empate", sofridos_do_time: 1 };

test("futebol: âncoras", () => {
  entre(Notas.notaFutebol({ posicao: "CM", minutos: 90 }, empate), 6.3, 6.8, "titular sem nada num empate");
  entre(Notas.notaFutebol({ posicao: "F", minutos: 90, gols: 1, chutes_no_gol: 2 }, { resultado: "vitoria", sofridos_do_time: 0 }), 7.4, 8.2, "atacante com 1 gol numa vitória");
  assert.ok(Notas.notaFutebol({ posicao: "F", minutos: 90, gols: 3, chutes_no_gol: 4 }, { resultado: "vitoria", sofridos_do_time: 1 }) >= 9.0, "três gols");
  assert.ok(Notas.notaFutebol({ posicao: "CM", minutos: 60, vermelhos: 1 }, empate) <= 5.5, "expulso");
  entre(Notas.notaFutebol({ posicao: "G", minutos: 90, defesas: 5, gols_sofridos: 3 }, { resultado: "derrota", sofridos_do_time: 3 }), 5.8, 6.8, "goleiro com 5 defesas e 3 gols sofridos");
});

test("futebol: sem números não dá NaN", () => {
  const n = Notas.notaFutebol({ posicao: "CD", minutos: 90 }, { resultado: "empate", sofridos_do_time: 0 });
  assert.ok(Number.isFinite(n));
  assert.ok(Number.isFinite(Notas.notaFutebol({ posicao: null, minutos: 45, gols: null, amarelos: "1" }, { resultado: null, sofridos_do_time: null })));
  assert.equal(Notas.notaFutebol({ posicao: "F", minutos: 9 }, empate), null);
  assert.equal(Notas.notaFutebol({ posicao: "F", minutos: null }, empate), null);
});

test("futebol: a nota fica entre 3 e 10", () => {
  assert.equal(Notas.notaFutebol({ posicao: "F", minutos: 90, gols: 8, chutes_no_gol: 10, assistencias: 3 }, { resultado: "vitoria", sofridos_do_time: 0 }), 10);
  assert.ok(Notas.notaFutebol({ posicao: "CD", minutos: 30, vermelhos: 1, gols_contra: 3, amarelos: 1, faltas_cometidas: 8 }, { resultado: "derrota", sofridos_do_time: 7 }) >= 3);
});

test("futebol: papel pela posição, em inglês (PC) e em português (celular)", () => {
  for (const p of ["G"]) assert.equal(Notas.papel(p), "goleiro", p);
  for (const p of ["CD", "CD-L", "CD-R", "LB", "RB", "SW", "LWB", "RWB", "ZC", "ZE", "ZCD", "ZD"]) assert.equal(Notas.papel(p), "defensor", p);
  for (const p of ["DM", "CM", "AM", "F", "MD", "ME", "MA", "A", "ACI", "ATCD", "MC", "MCE", null]) assert.equal(Notas.papel(p), "linha", String(p));
});

test("média do time", () => {
  assert.equal(Notas.media([7.8, 6.7, null, 6.5]), 7.0);
  assert.equal(Notas.media([]), null);
  assert.equal(Notas.media([null]), null);
});
