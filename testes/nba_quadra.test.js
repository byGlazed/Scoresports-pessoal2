"use strict";

// Testes do box score e do mapa de arremessos da NBA. Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Q = require("../static/nba_quadra.js");

const jogo = JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", "nba_jogo.json"), "utf8"));
const times = jogo.boxscore.players;

test("converterCoordenada: aro na origem e coordenada inválida dá null", () => {
  // o aro da ESPN fica em (25, 0): conferido com enterradas e bandejas de 12 jogos
  assert.deepEqual(Q.converterCoordenada({ x: 25, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(Q.converterCoordenada({ x: 49, y: -1 }), { x: 240, y: -10 });
  assert.equal(Q.converterCoordenada({ x: -214748340, y: -214748365 }), null);
  assert.equal(Q.converterCoordenada(null), null);
});

test("arremessosDoJogo: sem lances livres, e os números batem com o FG tentado do box score", () => {
  const { lista, semPosicao } = Q.arremessosDoJogo(jogo.plays);
  assert.ok(lista.length > 50);
  assert.ok(lista.every((a) => !/free throw/i.test(a.texto)));
  for (const t of times) {
    const fg = Q.boxScoreDoTime(t).totais.fg;
    const doTime = lista.filter((a) => String(a.time_id) === String(t.team.id)).length;
    const semPos = semPosicao.porTime[String(t.team.id)] || 0;
    assert.equal(doTime + semPos, fg.t, `time ${t.team.displayName}`);
    const feitos = lista.filter((a) => String(a.time_id) === String(t.team.id) && a.feito).length;
    assert.ok(feitos <= fg.f);
  }
  assert.ok(lista.filter((a) => a.tres).every((a) => a.distancia >= 22));
  assert.ok(lista.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y) && a.atleta_id));
});

test("resumoArremessos", () => {
  assert.deepEqual(Q.resumoArremessos([]), { feitos: 0, tentados: 0, pct: null, feitos3: 0, tentados3: 0, pct3: null });
  const r = Q.resumoArremessos([
    { feito: true, tres: true },
    { feito: true, tres: false },
    { feito: true, tres: false },
    { feito: false, tres: true },
  ]);
  assert.deepEqual(r, { feitos: 3, tentados: 4, pct: 75, feitos3: 1, tentados3: 2, pct3: 50 });
});

test("boxScoreDoTime: titulares, reservas, quem não jogou e totais", () => {
  const b = Q.boxScoreDoTime(times[0]);
  assert.equal(b.time_id, String(times[0].team.id));
  assert.equal(b.titulares.length, 5);
  assert.equal(b.naoJogaram.length, 1);
  const todos = [...b.titulares, ...b.reservas];
  assert.equal(todos.reduce((n, j) => n + (j.pts || 0), 0), b.totais.pts);
  const fg = todos.reduce((n, j) => n + j.fg.t, 0);
  assert.equal(fg, b.totais.fg.t);
  assert.equal(typeof b.titulares[0].nome, "string");
  assert.equal(b.naoJogaram[0].pts, null);
});

test("ordenarBox: por pontos, sentido inverso, desempate em FG e nulos no fim", () => {
  const b = Q.boxScoreDoTime(times[1]);
  const jogadores = [...b.titulares, ...b.reservas];
  const desc = Q.ordenarBox(jogadores, "pts", "desc");
  assert.equal(desc[0].pts, Math.max(...jogadores.map((j) => j.pts)));
  const asc = Q.ordenarBox(jogadores, "pts", "asc");
  assert.equal(asc[0].pts, Math.min(...jogadores.map((j) => j.pts)));
  const base = [
    { nome: "A", fg: { f: 5, t: 10 }, mais_menos: null },
    { nome: "B", fg: { f: 5, t: 8 }, mais_menos: 3 },
    { nome: "C", fg: { f: 7, t: 15 }, mais_menos: -2 },
  ];
  assert.deepEqual(Q.ordenarBox(base, "fg", "desc").map((j) => j.nome), ["C", "A", "B"]);
  assert.deepEqual(Q.ordenarBox(base, "mais_menos", "desc").map((j) => j.nome), ["B", "C", "A"]);
  assert.deepEqual(Q.ordenarBox(base, "mais_menos", "asc").map((j) => j.nome), ["C", "B", "A"]);
  assert.deepEqual(base.map((j) => j.nome), ["A", "B", "C"]);
});

test("arremessosDoJogo em português: lance livre pelo tipo, e 3 pontos pelo texto", () => {
  const inv = { x: -214748340, y: -214748365 };
  const plays = [
    { shootingPlay: true, text: "Gui Santos anota lance livre 1 de 2", type: { text: "Free Throw - 1 of 2" }, coordinate: inv, team: { id: "9" } },
    { shootingPlay: true, text: "Fulano erra lance livre", type: { text: "Free Throw - Technical" }, coordinate: inv, team: { id: "9" } },
    { shootingPlay: true, scoringPlay: true, text: "Jeremiah Fears anota 20pés arremesso de 3 pontos", type: { text: "Jump Shot" }, coordinate: { x: 25, y: 21 }, team: { id: "9" }, participants: [{ athlete: { id: "1" } }] },
  ];
  const r = Q.arremessosDoJogo(plays);
  assert.equal(r.semPosicao.total, 0);
  assert.equal(r.lista.length, 1);
  assert.equal(r.lista[0].tres, true);
});

/* ---------- Correções da revisão final ---------- */

test("arremessosDoJogo: arremesso de desespero errado fica fora; o que entra conta", () => {
  const base = { shootingPlay: true, team: { id: "1" }, participants: [{ athlete: { id: "9" } }] };
  const r = Q.arremessosDoJogo([
    { ...base, text: "Trae Young erra heave jump shot", type: { text: "Heave Jump Shot" }, coordinate: { x: 25, y: 40 }, scoringPlay: false },
    { ...base, text: "Trae Young anota heave jump shot", type: { text: "Heave Jump Shot" }, coordinate: { x: 25, y: 40 }, scoringPlay: true, scoreValue: 3 },
  ]);
  assert.equal(r.lista.length, 1);
  assert.equal(r.lista[0].feito, true);
});

test("arremessosDoJogo: três de 23,7 pés pelo valor da cesta, e erro a 23,6 pés conta como três", () => {
  const base = { shootingPlay: true, team: { id: "1" }, participants: [{ athlete: { id: "9" } }], type: { text: "Running Jump Shot" } };
  const r = Q.arremessosDoJogo([
    { ...base, text: "OG Anunoby anota 24pés running jump shot", coordinate: { x: 36, y: 22 }, scoringPlay: true, scoreValue: 3 },
    { ...base, text: "De'Aaron Fox erra 24pés jump shot", coordinate: { x: 11, y: 20 }, scoringPlay: false, scoreValue: 0 },
    { ...base, text: "Fulano anota 23pés jump shot", coordinate: { x: 36, y: 22 }, scoringPlay: true, scoreValue: 2 },
  ]);
  assert.deepEqual(r.lista.map((a) => a.tres), [true, true, false]);
});

test("arremessosDoJogo com o jogo real: arremessos do mapa e de três batem com o box score", () => {
  const { lista, semPosicao } = Q.arremessosDoJogo(jogo.plays);
  for (const t of times) {
    const b = Q.boxScoreDoTime(t).totais;
    const doTime = lista.filter((a) => String(a.time_id) === String(t.team.id));
    assert.equal(doTime.length + (semPosicao.porTime[String(t.team.id)] || 0), b.fg.t);
    assert.equal(doTime.filter((a) => a.tres).length, b.tres.t, `3PT ${t.team.displayName}`);
  }
});

/* ---------- Correção do mapa: proporção e lado certo da linha de três ---------- */

const foraDaLinha = (a) => Math.abs(a.x) >= 220 || Math.hypot(a.x, a.y) >= 237.5;

test("mapa do jogo real: toda bola de três desenhada fica fora da linha e toda de dois, dentro", () => {
  const { lista } = Q.arremessosDoJogo(jogo.plays);
  const tres = lista.filter((a) => a.tres);
  const dois = lista.filter((a) => !a.tres);
  assert.ok(tres.length > 20 && dois.length > 20);
  const tresDentro = tres.filter((a) => !foraDaLinha(a) || (Math.abs(a.x) >= 219 && Math.abs(a.x) <= 221 && Math.hypot(a.x, a.y) < 237.5));
  assert.deepEqual(tresDentro.map((a) => [a.x, a.y, a.texto.slice(0, 30)]), [], "três sobre ou dentro da linha");
  assert.deepEqual(dois.filter(foraDaLinha).map((a) => [a.x, a.y, a.texto.slice(0, 30)]), [], "dois fora da linha");
});

test("posicaoNoDesenho: empurra para o lado certo da linha só dentro da margem do arredondamento", () => {
  // três no canto, em cima da linha (x = 3 → X = -220): vai para fora
  const canto = Q.posicaoNoDesenho({ x: 3, y: 2 }, true);
  assert.ok(Math.abs(canto.x) > 220);
  // três de frente a 23 pés (dentro): vai para atrás da linha
  const frente = Q.posicaoNoDesenho({ x: 25, y: 23 }, true);
  assert.ok(Math.hypot(frente.x, frente.y) > 237.5);
  // dois logo atrás da linha (24 pés): volta para dentro
  const dois = Q.posicaoNoDesenho({ x: 25, y: 24 }, false);
  assert.ok(Math.hypot(dois.x, dois.y) < 237.5);
  // longe demais para ser arredondamento (dois a 30 pés): não mexe
  assert.deepEqual(Q.posicaoNoDesenho({ x: 25, y: 30 }, false), { x: 0, y: 300 });
});

test("ordenar pela nota: quem não tem nota fica por último", () => {
  const jogadores = [{ nota: null }, { nota: 7 }, { nota: 8 }];
  assert.deepEqual(Q.ordenarBox(jogadores, "nota", "desc").map((j) => j.nota), [8, 7, null]);
  assert.deepEqual(Q.ordenarBox(jogadores, "nota", "asc").map((j) => j.nota), [7, 8, null]);
});
