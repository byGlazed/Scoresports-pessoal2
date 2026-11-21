"use strict";

// Testes da regra do cache do celular (cache_regras.js): quando usar o dado guardado e quando avisar a tela.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../celular/cache_regras.js");

test("dado válido, vencido mas recente, ou buscar", () => {
  const agora = 100000;
  assert.equal(C.decidir({ salvo_em: agora - 10, vale_ate: agora + 5 }, agora), "valido");
  assert.equal(C.decidir({ salvo_em: agora - 60, vale_ate: agora - 30 }, agora), "velho");
  assert.equal(C.decidir({ salvo_em: agora - 7 * 3600, vale_ate: agora - 3600 }, agora), "buscar"); // mais de 6 h
  assert.equal(C.decidir(null, agora), "buscar");
});

test("o ao vivo dos e-sports nunca é servido velho", () => {
  const agora = 100000;
  assert.equal(C.decidir({ salvo_em: agora - 60, vale_ate: agora - 30 }, agora, { semVelho: true }), "buscar");
  assert.equal(C.decidir({ salvo_em: agora - 10, vale_ate: agora + 5 }, agora, { semVelho: true }), "valido");
});

test("avisos de dado novo espaçados", () => {
  assert.equal(C.esperaParaAvisar(null, 50000), 0);
  assert.equal(C.esperaParaAvisar(45000, 50000), 5000); // o último foi há 5 s: espera mais 5
  assert.equal(C.esperaParaAvisar(30000, 50000), 0);
});

test("jogo guardado que já devia ter começado não passa por 'vai começar'", () => {
  const agora = Date.parse("2026-11-21T20:00:00Z");
  const jogos = [
    { id: 1, estado: 1, inicio: "2026-11-21T19:30:00Z" }, // devia ter começado há 30 min
    { id: 2, estado: 1, inicio: "2026-11-21T22:00:00Z" }, // ainda vai começar
    { id: 3, estado: 2, inicio: "2026-11-21T19:00:00Z", status: "2º tempo" }, // estava ao vivo
    { id: 4, estado: 3, inicio: "2026-11-21T15:00:00Z" }, // acabou: não muda mais
    { id: 5, estado: 1, inicio: "2026-11-21T18:00:00Z", status: "Adiado" }, // adiado
    { id: 6, estado: 1, inicio: "2026-11-20T18:00:00Z" }, // "a jogar" desde ontem: adiado sem aviso
  ];
  assert.deepEqual(jogos.filter((j) => C.jogoTalvezMudou(j, agora)).map((j) => j.id), [1, 3]);
  const marcados = C.marcarAtualizando(jogos, agora);
  assert.deepEqual(marcados.filter((j) => j.atualizando).map((j) => j.id), [1, 3]);
  assert.equal(marcados[1], jogos[1]); // o que não muda é o mesmo objeto

  const salvo = { salvo_em: agora / 1000 - 600, vale_ate: agora / 1000 - 585, valor: jogos };
  const duvidoso = (lista, ms) => lista.some((j) => C.jogoTalvezMudou(j, ms));
  assert.equal(C.decidir(salvo, agora / 1000, { duvidoso }), "conferir");
  assert.equal(C.decidir({ ...salvo, valor: [jogos[1], jogos[3]] }, agora / 1000, { duvidoso }), "velho");
  assert.equal(C.decidir({ ...salvo, vale_ate: agora / 1000 + 5 }, agora / 1000, { duvidoso }), "valido");
});
