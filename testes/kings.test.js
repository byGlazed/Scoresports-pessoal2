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

test("ao vivo: só pergunta ao repasse com jogo perto da hora, e junta sem perder os destaques", () => {
  const c = { jogos: [{ id: 1, inicio: "2026-11-23T21:00:00.000Z", status: null }, { id: 2, inicio: "2026-11-16T20:00:00.000Z", status: "ended" }] };
  assert.equal(Kings.temJogoPerto(c, Date.parse("2026-11-23T20:55:00Z")), true); // começa em 5 min
  assert.equal(Kings.temJogoPerto(c, Date.parse("2026-11-23T23:30:00Z")), true); // começou há 2 h 30 e não acabou
  assert.equal(Kings.temJogoPerto(c, Date.parse("2026-11-23T19:00:00Z")), false); // falta muito
  assert.equal(Kings.temJogoPerto(c, Date.parse("2026-11-24T03:00:00Z")), false); // passou demais
  const robo = { nome: "Kings League Brasil", logo: "l.png", destaques: [{ nome: "Gols" }], times: { 1: { nome: "A" } }, jogos: c.jogos, temporada: "T" };
  const vivo = { temporada: "T", encerrada: false, times: { 2: { nome: "B" } }, jogos: [{ id: 1, status: "live", placar: [2, 1] }] };
  const junto = Kings.juntarAoVivo(robo, vivo);
  assert.equal(junto.destaques[0].nome, "Gols");
  assert.equal(junto.logo, "l.png");
  assert.deepEqual(Object.keys(junto.times).sort(), ["1", "2"]);
  assert.equal(junto.jogos[0].status, "live");
  assert.equal(Kings.juntarAoVivo(robo, { jogos: [] }).jogos, robo.jogos); // repasse sem jogos: fica o do robô
  const comGols = { ...robo, jogos: [{ id: 1, status: "ended", gols: [{ lado: 0, nome: "X", minuto: 3 }] }] };
  assert.equal(Kings.juntarAoVivo(comGols, vivo).jogos[0].gols[0].nome, "X"); // o gol da súmula fica
});

test("autores dos gols embaixo de cada time, juntando os minutos do mesmo jogador", () => {
  const j = { gols: [
    { lado: 0, nome: "Gilli", minuto: 1, tipo: null }, { lado: 0, nome: "Gilli", minuto: 3, tipo: null },
    { lado: 0, nome: "Frenezy", minuto: 9, tipo: "pp" }, { lado: 1, nome: "Günay", minuto: 20, tipo: "x2" },
    { lado: 0, nome: "Marin", minuto: 34, tipo: "p" }, { lado: 1, nome: "Pérez", minuto: 12, tipo: "contra" },
  ] };
  assert.deepEqual(Kings.autoresDosGols(j), {
    casa: ["Gilli 1', 3'", "Frenezy 9' (pên. do presidente)", "Marin 34' (pên.)"],
    fora: ["Günay 20' (gol duplo)", "Pérez 12' (contra)"],
  });
  assert.deepEqual(Kings.autoresDosGols({}), { casa: [], fora: [] });
});

test("pesquisa: os times da Kings pelo nome ou pela sigla, sem os 'a definir'", () => {
  const comps = [comp, { id: "world-cup", nome: "Mundial da Kings", times: { 50: { nome: "Furia FC", sigla: "FUR", logo: "f.png" }, 58: { nome: "TBD", sigla: "TBD" } }, jogos: [] }];
  const r = Kings.timesDaBusca(comps, "furia");
  assert.deepEqual(r.map((t) => [t.liga, t.id, t.nome, t.descricao]), [["brazil", "50", "Furia FC", "Kings League Brasil"], ["world-cup", "50", "Furia FC", "Mundial da Kings"]]);
  assert.equal(Kings.timesDaBusca(comps, "dep")[0].nome, "DesimpaiN"); // pela sigla
  assert.deepEqual(Kings.timesDaBusca(comps, "tbd"), []);
  assert.deepEqual(Kings.timesDaBusca(comps, "x"), []); // curto demais
});

test("os jogos de um time, na ordem", () => {
  const jogos = Kings.jogosDoTime(comp, "164");
  assert.ok(jogos.length >= 5);
  assert.ok(jogos.every((j) => j.casa.id === "164" || j.fora.id === "164"));
  assert.deepEqual(jogos.map((j) => j.inicio), [...jogos.map((j) => j.inicio)].sort());
});
