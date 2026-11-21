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
  // gol contra: a ESPN já manda o time que ganhou o gol (Tenaglia, do Alavés, contra no 3 x 1 sobre o
  // Deportivo de 21/11/2026 vem com o time do Deportivo), então fica embaixo dele, como no Sofascore
  const contra = [{ tempo: "41'", tipo: "gol_contra", time_id: "2", jogadores: ["Nahuel Tenaglia"], texto: "Own Goal by Nahuel Tenaglia, Alaves." }];
  assert.deepEqual(Visual.autoresDosGols(contra, ladoDe), { casa: [], fora: ["Nahuel Tenaglia 41' (contra)"] });
  assert.deepEqual(Visual.placarCorrido(contra, ladoDe), ["0 - 1"]);
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

test("F1 na lista do dia: a sessão, e não o fim de semana inteiro 'em andamento'", () => {
  const sessoes = [
    { nome: "Treino livre 1", inicio: "2026-11-20T16:30:00Z", estado: 3 },
    { nome: "Classificação sprint", inicio: "2026-11-20T20:30:00Z", estado: 3 },
    { nome: "Sprint", inicio: "2026-11-21T16:00:00Z", estado: 3 },
    { nome: "Classificação", inicio: "2026-11-21T20:00:00Z", estado: 1 },
    { nome: "Corrida", inicio: "2026-11-22T18:00:00Z", estado: 1 },
  ];
  const entre = Visual.situacaoCorrida(sessoes); // sábado, depois da sprint
  assert.equal(entre.estado, 1);
  assert.equal(entre.ultima.nome, "Sprint");
  assert.equal(entre.proxima.nome, "Classificação");
  const vivo = Visual.situacaoCorrida(sessoes.map((x) => (x.nome === "Classificação" ? { ...x, estado: 2 } : x)));
  assert.equal(vivo.estado, 2);
  assert.equal(vivo.aoVivo.nome, "Classificação");
  const fim = Visual.situacaoCorrida(sessoes.map((x) => ({ ...x, estado: 3 })));
  assert.equal(fim.estado, 3);
  assert.equal(fim.ultima.nome, "Corrida");
  assert.equal(Visual.situacaoCorrida([]), null);
});

test("posição do futebol por extenso (siglas da ESPN em português e em inglês)", () => {
  // as do Alavés x Deportivo de 21/11/2026 (lang=pt) e as mesmas em inglês
  const casos = { G: "Goleiro", ZC: "Zagueiro", ZCD: "Zagueiro", ZE: "Zagueiro", L: "Zagueiro", "CD-R": "Zagueiro", RB: "Lateral", LB: "Lateral",
    MD: "Meio-campista", ME: "Meio-campista", MC: "Meio-campista", MCE: "Meio-campista", MA: "Meio-campista", AM: "Meio-campista", "CM-L": "Meio-campista",
    DM: "Volante", A: "Atacante", ACI: "Atacante", ATCD: "Atacante", "CF-R": "Atacante", F: "Atacante" };
  for (const [sigla, nome] of Object.entries(casos)) assert.equal(Visual.posicaoPorExtenso(sigla), nome, sigla);
  assert.equal(Visual.posicaoPorExtenso(""), null);
  assert.equal(Visual.posicaoPorExtenso("XYZ1"), "XYZ1");
});

test("estatísticas do futebol como no Sofascore: seções, português e porcentagens das contagens", () => {
  // Alavés 3 x 1 Deportivo (21/11/2026), boxscore.teams da ESPN com lang=pt
  const amostra = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "amostras", "espn_estatisticas_futebol.json"), "utf8"));
  const linhas = Visual.estatisticasFutebol(amostra.home, amostra.away);
  const de = (rotulo) => linhas.find((l) => l.rotulo === rotulo);
  assert.deepEqual([...new Set(linhas.map((l) => l.secao))], ["Visão geral", "Finalizações", "Passes", "Defesa", "Goleiro"]);
  assert.deepEqual([de("Posse de bola").casa, de("Posse de bola").fora], ["48%", "52%"]);
  assert.deepEqual([de("Finalizações").casa, de("Finalizações no gol").casa, de("Para fora").casa], ["21", "8", "8"]); // 21 - 8 no gol - 5 bloqueadas
  assert.equal(de("Pontaria").casa, "38%"); // 8 de 21 (a ESPN manda 0.4)
  assert.equal(de("Passes certos").casa, "292/358 (82%)");
  assert.equal(de("Cortes").fora, "32");
  assert.equal(de("Pênaltis").casa, "0/1");
  assert.equal(de("Pênaltis").fora, null); // o Deportivo não bateu pênalti
  // nada em inglês nem repetido
  assert.ok(linhas.every((l) => !/[A-Z][a-z]+ [A-Z]|%$|Tackle|Cross|Long|Target|Penalty/.test(l.rotulo)), linhas.map((l) => l.rotulo).join(", "));
  const chaves = linhas.map((l) => `${l.secao}:${l.rotulo}`);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.equal(Visual.estatisticasFutebol([{ name: "points", value: 100 }], []), null); // NBA etc. ficam como estão
});

test("intervalo na linha do tempo: antes do 1º lance do 2º tempo, com o placar do 1º tempo", () => {
  const i = Visual.intervaloDoJogo(LANCES, ladoDe, true);
  assert.equal(LANCES[i.antesDe].tempo, "54'");
  assert.equal(i.placar, "0 - 1");
  const acrescimo = [{ tempo: "45'+2'", tipo: "gol", time_id: "1", jogadores: ["A"] }, { tempo: "46'", tipo: "amarelo", time_id: "2", jogadores: ["B"] }];
  assert.deepEqual(Visual.intervaloDoJogo(acrescimo, ladoDe, false), { antesDe: 1, placar: "1 - 0" }); // 45'+2' ainda é do 1º tempo
  assert.equal(Visual.intervaloDoJogo(acrescimo.slice(0, 1), ladoDe, false), null); // ainda no 1º tempo
  assert.deepEqual(Visual.intervaloDoJogo(acrescimo.slice(0, 1), ladoDe, true), { antesDe: 1, placar: "1 - 0" }); // acabou sem lance no 2º
});

test("estado curto na coluna da lista: nada de palavra que não cabe nos 50 px", () => {
  const casos = {
    Intervalo: ["Int."], // o do print: Nice x PSG saía da coluna
    "Intervalo da 5ª": ["Int.", "5ª"],
    "Fim do tempo normal": ["Fim", "90'"],
    "3º quarto, 5:12": ["3ºQ", "5:12"],
    "Fim do 2º quarto": ["Fim", "2ºQ"],
    "1º período · 12:30": ["1ºP", "12:30"],
    "Fim do 1º período": ["Fim", "1ºP"],
    "Prorrogação, 2:10": ["Prorr.", "2:10"],
    "Prorrogação · 3:00": ["Prorr.", "3:00"],
    Prorrogação: ["Prorr."],
    "2ª prorrogação · 4:00": ["2ª pr.", "4:00"],
    "▲ 5ª entrada": ["▲ 5ª"],
    "Fim da 7ª": ["Fim", "7ª"],
    Pênaltis: ["Pên."],
    "Fim (pên.)": ["Fim", "pên."],
    Cancelado: ["Canc."],
    Suspenso: ["Susp."],
    Abandonado: ["Aband."],
    "Ao vivo": ["Ao", "vivo"],
    "83'": ["83'"],
    "45'+2'": ["45'+2'"],
  };
  for (const [texto, linhas] of Object.entries(casos)) assert.deepEqual(Visual.statusCurto(texto), linhas, texto);
  // cada linha cabe: no máximo 6 caracteres (ou um minuto com acréscimo)
  for (const linhas of Object.values(casos)) for (const l of linhas) assert.ok(l.length <= 6, l);
});
