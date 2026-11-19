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
