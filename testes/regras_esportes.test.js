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

/* ---------- Correções da revisão final ---------- */

test("diasDoCalendario: na MLB o calendário é a lista de dias SEM jogo", () => {
  const dias = R.diasDoCalendario(amostra("mlb_calendario"));
  assert.ok(dias.includes("2026-10-28"), "jogo 5 da World Series");
  assert.ok(dias.includes("2026-10-23"), "jogo 1 da World Series");
  assert.ok(!dias.includes("2026-10-20"), "dia sem jogo");
  assert.ok(!dias.includes("2026-10-29"), "depois do fim");
  assert.ok(!dias.includes("2026-07-13"), "folga do All-Star");
  assert.equal(dias[0], "2026-02-20");
  assert.deepEqual(dias, [...dias].sort());
});

test("diasDoCalendario: lista normal (NHL, NBA) devolve os próprios dias", () => {
  const liga = { calendarIsWhitelist: true, calendar: ["2026-11-12T07:00Z", "2026-11-11T07:00Z", "2026-11-11T08:00Z"] };
  assert.deepEqual(R.diasDoCalendario(liga), ["2026-11-11", "2026-11-12"]);
  assert.deepEqual(R.diasDoCalendario({}), []);
});

test("notaDoJogo no formato do resumo do jogo: gameNote e a série dos playoffs", () => {
  const h = amostra("mlb_ws_jogo5_resumo");
  assert.equal(R.notaDoJogo(h.competitions[0], h.gameNote), "World Series - Game 5 · MIL ganhou a série 4-1");
  const soTemporada = { series: [{ type: "current", summary: "TB ganhou a série 3-2" }, { type: "season", summary: "MIL ganhou a série 2-1" }] };
  assert.equal(R.notaDoJogo(soTemporada), null, "fora dos playoffs não mostra série");
});

test("estatisticasJogoBeisebol: achata os grupos da ESPN e traduz os números principais", () => {
  const time = amostra("mlb_ws_jogo5_boxscore").teams[0];
  const l = R.estatisticasJogoBeisebol(time.statistics);
  const rotulos = l.map((x) => x.label);
  assert.ok(rotulos.includes("Rebatidas"));
  assert.ok(rotulos.includes("Erros"));
  const rebatidas = time.statistics.find((g) => g.name === "batting").stats.find((s) => s.name === "hits").displayValue;
  assert.equal(l.find((x) => x.label === "Rebatidas").displayValue, rebatidas);
  assert.ok(l.every((x) => x.name && x.displayValue !== undefined));
});

test("estatisticasJogoBeisebol: lista sem grupos aninhados devolve null", () => {
  assert.equal(R.estatisticasJogoBeisebol([{ name: "goals", displayValue: "3" }]), null);
  assert.equal(R.estatisticasJogoBeisebol(undefined), null);
});

test("dias a pedir à ESPN: só os que o calendário da liga tem jogo", () => {
  const cal = ["2026-11-14", "2026-11-18", "2026-11-19", "2026-11-22", "2026-11-23"];
  assert.deepEqual(R.diasParaPedir(["2026-11-18", "2026-11-19"], cal), ["2026-11-18", "2026-11-19"]);
  assert.deepEqual(R.diasParaPedir(["2026-11-19", "2026-11-20"], cal), ["2026-11-19"]); // o dia 20 não tem jogo
  assert.deepEqual(R.diasParaPedir(["2026-11-20", "2026-11-21"], cal), []); // nenhum: nem pede
  // sem calendário, ou fora dele (outra temporada): pede tudo, como antes
  assert.deepEqual(R.diasParaPedir(["2026-11-20", "2026-11-21"], null), ["2026-11-20", "2026-11-21"]);
  assert.deepEqual(R.diasParaPedir(["2026-11-20", "2026-11-21"], []), ["2026-11-20", "2026-11-21"]);
  assert.deepEqual(R.diasParaPedir(["2027-01-30", "2027-01-31"], cal), ["2027-01-30", "2027-01-31"]);
  assert.deepEqual(R.diasParaPedir(["2026-11-01", "2026-11-02"], cal), ["2026-11-01", "2026-11-02"]);
});

test("resultado nos últimos jogos pelo placar e pelo mando (a ESPN em português manda V/E/D e x/em)", () => {
  const casa = { homeTeamId: "2029", awayTeamId: "6086", homeTeamScore: "1", awayTeamScore: "0", atVs: "x", gameResult: "V" };
  assert.deepEqual(R.resultadoDoJogo(casa, "2029"), { local: "casa", resultado: "V" });
  const fora = { homeTeamId: "6086", awayTeamId: "2029", homeTeamScore: "2", awayTeamScore: "1", atVs: "em", gameResult: "D" };
  assert.deepEqual(R.resultadoDoJogo(fora, "2029"), { local: "fora", resultado: "D" });
  const empate = { homeTeamId: "1", awayTeamId: "2029", homeTeamScore: "0", awayTeamScore: "0", atVs: "em", gameResult: "E" };
  assert.deepEqual(R.resultadoDoJogo(empate, "2029"), { local: "fora", resultado: "E" });
  // sem placar: a letra (em português, D é derrota; em inglês, W/L/T)
  assert.equal(R.resultadoDoJogo({ atVs: "vs", gameResult: "W" }, "9").resultado, "V");
  assert.equal(R.resultadoDoJogo({ atVs: "x", gameResult: "D" }, "9").resultado, "D");
  assert.equal(R.resultadoDoJogo({ atVs: "@", gameResult: "T" }, "9").resultado, "E");
  assert.equal(R.resultadoDoJogo({ atVs: "x" }, "9").resultado, null);
});

test("valor curto dos destaques da temporada", () => {
  assert.deepEqual(R.valorDoLider("Partidas: 32, Gols: 10"), { valor: "10", detalhe: "32 jogos" });
  assert.deepEqual(R.valorDoLider("Jogos: 33, Assistencias: 10"), { valor: "10", detalhe: "33 jogos" });
  assert.deepEqual(R.valorDoLider("Matches: 12, Goals: 7"), { valor: "7", detalhe: "12 jogos" });
  assert.deepEqual(R.valorDoLider("1697"), { valor: "1697", detalhe: null });
  assert.deepEqual(R.valorDoLider(null), { valor: "", detalhe: null });
});

test("provável escalação: o time titular do último jogo, sem os gols e cartões dele", () => {
  const e = { lado: "fora", time: { id: "874", nome: "Corinthians" }, formacao: "4-2-3-1", gols_pro: 4, gols_contra_time: 0,
    titulares: [{ id: "1", nome: "Hugo Souza", camisa: "1", posicao: "G", lugar: 1, foto: null, gols: 0, amarelos: 1, entrou_aos: null, saiu_aos: 60 }],
    reservas: [{ id: "2", nome: "Reserva" }] };
  const p = R.provavelDoTime(e);
  assert.deepEqual(p.titulares, [{ id: "1", nome: "Hugo Souza", camisa: "1", posicao: "G", lugar: 1, foto: null }]);
  assert.equal(p.formacao, "4-2-3-1");
  assert.deepEqual(p.reservas, []);
  assert.equal(p.gols_pro, null);
  assert.equal(R.provavelDoTime(null), null);
  assert.equal(R.provavelDoTime({ ...e, titulares: [] }), null);
});

test("carreira: o time da temporada pela sigla (a ESPN indexa os times pelo código) e os nomes em português", () => {
  const st = {
    teams: { "cleveland-cavaliers": { id: "5", slug: "cleveland-cavaliers", abbreviation: "CLE", displayName: "Cleveland Cavaliers" } },
    categories: [
      { name: "averages", displayName: "Médias - Temporada regular", labels: ["J"], statistics: [{ teamId: "5", teamSlug: "cleveland-cavaliers", season: { displayName: "2003-04" }, stats: ["79"] }], totals: ["1634"] },
      { name: "miscellaneous", displayName: "Misc Total - Temporada regular", labels: ["DD2"], statistics: [{ teamSlug: "cleveland-cavaliers", season: { displayName: "2003-04" }, stats: ["12"] }], totals: [] },
    ],
  };
  const c = R.categoriasCarreira(st);
  assert.equal(c[0].temporadas[0].time, "CLE");
  assert.equal(c[1].temporadas[0].time, "CLE"); // só com o código, sem o id
  assert.equal(c[1].nome, "Outros números - Temporada regular");
  assert.equal(R.categoriasCarreira({ teams: [{ id: "5", abbreviation: "CLE" }], categories: [{ displayName: "Total", labels: [], statistics: [{ teamId: "5", season: { year: 2004 }, stats: [] }] }] })[0].temporadas[0].time, "CLE");
});

test("resumo da temporada no perfil: jogos e titular separados, título curto", () => {
  // Ángel Pérez (Alavés), statsSummary da ESPN com lang=pt em 21/11/2026
  const sumario = { displayName: "Estatísticas da Temporada 2026-27 Espanhol", statistics: [
    { name: "starts-subIns", displayName: "Titular-Substitute Appearances", displayValue: "10 (1)" },
    { name: "totalGoals", displayName: "Total de gols", displayValue: "0" },
    { name: "goalAssists", displayName: "Assistências", displayValue: "3" },
    { name: "totalTackles", displayName: "Tackles", displayValue: "13" },
    { name: "points", displayName: "Points", displayValue: "20.1" },
  ] };
  const r = R.resumoDoAtleta(sumario, (t) => (t === "Points" ? "Pontos" : t));
  assert.equal(r.titulo, "Temporada 2026-27");
  assert.deepEqual(r.itens.map((i) => `${i.rotulo}: ${i.valor}`), ["Jogos: 11", "Como titular: 10", "Gols: 0", "Assistências: 3", "Desarmes: 13", "Pontos: 20.1"]);
  assert.deepEqual(R.resumoDoAtleta({}), { titulo: null, itens: [] });
});
