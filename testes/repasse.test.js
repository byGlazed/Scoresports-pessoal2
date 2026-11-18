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
