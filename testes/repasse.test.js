"use strict";

// Testes do repasse da Cloudflare (repasse_cloudflare.js): ESPN por ?url= e PandaScore por /pandascore/.
// O worker é um módulo ES; aqui ele é carregado de novo em cada teste, com um fetch falso.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FONTE = fs.readFileSync(path.join(__dirname, "..", "repasse_cloudflare.js"), "utf8");
let carga = 0;

/** Carrega um worker novo (memória limpa) e troca o fetch global por um falso que guarda os pedidos. */
async function novoWorker(responder = () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json; charset=utf-8", "x-rate-limit-remaining": "999" } })) {
  const pedidos = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    pedidos.push({ url: String(url), opcoes });
    return responder(String(url), opcoes);
  };
  // um comentário diferente em cada carga: o Node não reaproveita o módulo
  const mod = await import("data:text/javascript," + encodeURIComponent(`${FONTE}\n// carga ${++carga}`));
  return { mod, worker: mod.default, pedidos };
}

const ENV = { PANDASCORE_TOKEN: "TESTE" };

test("?url= da ESPN continua igual", async () => {
  const { worker, pedidos } = await novoWorker();
  const alvo = "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard";
  const r = await worker.fetch(new Request(`https://x.workers.dev/?url=${encodeURIComponent(alvo)}`), ENV);
  assert.equal(r.status, 200);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, alvo);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
});

test("/pandascore/ pede com a chave do segredo", async () => {
  const { worker, pedidos } = await novoWorker();
  const r = await worker.fetch(new Request("https://x.workers.dev/pandascore/csgo/matches/running?per_page=50"), ENV);
  assert.equal(r.status, 200);
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "https://api.pandascore.co/csgo/matches/running?per_page=50");
  assert.equal(new Headers(pedidos[0].opcoes.headers).get("Authorization"), "Bearer TESTE");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(r.headers.get("content-type"), /json/);
  for (const [nome, valor] of r.headers) assert.ok(!valor.includes("TESTE"), `o cabeçalho ${nome} tem a chave`);
  assert.equal(r.headers.get("x-rate-limit-remaining"), null);
  assert.deepEqual(await r.json(), { ok: true });
});

test("caminho fora da lista é recusado", async () => {
  const { worker, pedidos } = await novoWorker();
  for (const caminho of ["/pandascore/users", "/pandascore/../x", "/pandascore/", "/pandascore/csgo/../../users", "/pandascore/teams/1?x=1&url=https://evil"]) {
    const r = await worker.fetch(new Request(`https://x.workers.dev${caminho}`), ENV);
    if (caminho.startsWith("/pandascore/teams/1")) continue; // query livre num caminho permitido: aceito
    assert.equal(r.status, 400, caminho);
  }
  // só o caminho permitido chegou à PandaScore
  assert.deepEqual(pedidos.map((p) => new URL(p.url).hostname), ["api.pandascore.co"]);
});

test("só GET", async () => {
  const { worker, pedidos } = await novoWorker();
  const post = await worker.fetch(new Request("https://x.workers.dev/pandascore/csgo/matches/running", { method: "POST", body: "{}" }), ENV);
  assert.equal(post.status, 405);
  const opcoes = await worker.fetch(new Request("https://x.workers.dev/pandascore/csgo/matches/running", { method: "OPTIONS" }), ENV);
  assert.equal(opcoes.status, 204);
  assert.equal(opcoes.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(opcoes.headers.get("Access-Control-Allow-Methods"), /GET/);
  assert.equal(pedidos.length, 0);
});

test("sem segredo", async () => {
  const { worker, pedidos } = await novoWorker();
  const r = await worker.fetch(new Request("https://x.workers.dev/pandascore/csgo/matches/running"), {});
  assert.equal(r.status, 500);
  assert.equal(await r.text(), "Falta o segredo PANDASCORE_TOKEN no worker.");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(pedidos.length, 0);
});

test("memória curta: guarda o que deu certo, não guarda erro", async () => {
  const { worker, pedidos } = await novoWorker();
  const url = "https://x.workers.dev/pandascore/csgo/matches/running?per_page=50";
  await worker.fetch(new Request(url), ENV);
  const segunda = await worker.fetch(new Request(url), ENV);
  assert.equal(pedidos.length, 1);
  assert.deepEqual(await segunda.json(), { ok: true });

  for (const status of [401, 429]) {
    const erro = await novoWorker(() => new Response('{"error":"x"}', { status, headers: { "content-type": "application/json" } }));
    const r1 = await erro.worker.fetch(new Request(url), ENV);
    assert.equal(r1.status, status);
    assert.equal(r1.headers.get("Access-Control-Allow-Origin"), "*");
    await erro.worker.fetch(new Request(url), ENV);
    assert.equal(erro.pedidos.length, 2, `o ${status} não pode ficar guardado`);
  }
});

test("tempos da memória", async () => {
  const { mod } = await novoWorker();
  assert.equal(mod.ttlPandascore("csgo/matches/running"), 30);
  assert.equal(mod.ttlPandascore("lol/matches/past"), 3600);
  assert.equal(mod.ttlPandascore("teams/123"), 86400);
  assert.equal(mod.ttlPandascore("players/9"), 86400);
  assert.equal(mod.ttlPandascore("valorant/matches/upcoming"), 120);
  assert.equal(mod.ttlPandascore("csgo/matches"), 120);
});

// a página da competição como o kingsleague.pro manda: o payload do Nuxt (lista com índices)
function paginaKings() {
  const payload = [
    ["ShallowReactive", 1],
    { data: 2, pinia: 9 },
    { $fturnos: 3 },
    [4],
    { id: 5, turnName: 6, matches: 7 },
    681,
    "Matchday 1",
    [8],
    { id: 15, date: 16, status: 17, currentMinute: 18, groupName: 19, participants: 20, scores: 23, metaInformation: 27 },
    { competitionStore: 10 },
    { currentSeason: 11, currentSeasonTeams: 12 },
    { name: 29, finished: 30 },
    [13, 14],
    { id: 31, name: 32, shortName: 33, logo: -1 },
    { id: 34, name: 35, shortName: 36 },
    2851,
    "2026-11-23T21:00:00.000Z",
    "live",
    12,
    "Playoffs",
    { homeTeamId: 21, awayTeamId: 22 },
    164,
    168,
    { homeScore: 24, awayScore: 25, homeScore1T: 24, awayScore1T: 26 },
    3,
    1,
    0,
    { youtube_url: 28 },
    "https://www.youtube.com/watch?v=x",
    "Kings Cup Brazil 2026/27",
    false,
    164,
    "Podpah Funkbol Clube",
    "FNK",
    168,
    "DesimpaiN",
    "DEP",
  ];
  return `<html><script type="application/json" id="__NUXT_DATA__" data-ssr="true">${JSON.stringify(payload)}</script></html>`;
}

test("/kings/<competição> lê a página da liga e devolve só os jogos e os times (ao vivo)", async () => {
  const { worker, pedidos } = await novoWorker(() => new Response(paginaKings(), { status: 200, headers: { "content-type": "text/html" } }));
  const r = await worker.fetch(new Request("https://x.workers.dev/kings/brazil"), ENV);
  assert.equal(r.status, 200);
  assert.equal(pedidos[0].url, "https://kingsleague.pro/pt/brazil");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  const d = await r.json();
  assert.equal(d.temporada, "Kings Cup Brazil 2026/27");
  assert.deepEqual(d.times["164"], { nome: "Podpah Funkbol Clube", sigla: "FNK", logo: null });
  const j = d.jogos[0];
  assert.deepEqual([j.id, j.status, j.minuto, j.casa, j.fora, j.rodada, j.grupo], [2851, "live", 12, "164", "168", "Matchday 1", "Playoffs"]);
  assert.deepEqual(j.placar, [3, 1]);
  assert.deepEqual(j.tempos, [[3, 0]]);
  assert.equal(j.video, "https://www.youtube.com/watch?v=x");
  // de novo logo depois: vem da memória, sem novo pedido ao site
  await worker.fetch(new Request("https://x.workers.dev/kings/brazil"), ENV);
  assert.equal(pedidos.length, 1);
});

test("/kings/ só aceita as competições da lista (nada de página de jogo)", async () => {
  const { worker, pedidos } = await novoWorker();
  for (const caminho of ["/kings/brazil/jogos/2851-fnk-vs-nyv", "/kings/../pt", "/kings/espana", "/kings/"]) {
    const r = await worker.fetch(new Request(`https://x.workers.dev${caminho}`), ENV);
    assert.equal(r.status, 400, caminho);
  }
  assert.equal(pedidos.length, 0);
});
