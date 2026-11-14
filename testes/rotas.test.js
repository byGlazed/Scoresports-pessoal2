"use strict";

// Testes das regras da navegação (endereços, pilhas por aba, voltar e ordem dos grupos).
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../static/rotas.js");

const pag = (tipo, params = {}) => ({ tipo, params });

test("lerEndereco e montarEndereco vão e voltam para todos os tipos", () => {
  const casos = [
    pag("jogos"),
    pag("favoritos"),
    pag("pesquisa"),
    pag("liga", { esporte: "futebol", liga: "eng.fa", aba: "jogos" }),
    pag("jogo", { esporte: "nba", liga: "nba", id: "401" }),
    pag("time", { esporte: "futebol", liga: "bra.1", id: "819" }),
    pag("atleta", { esporte: "nba", liga: "nba", id: "3112335" }),
    pag("boxeador", { nome: "Oleksandr Usyk" }),
    pag("evento", { esporte: "mma", liga: "ufc", id: "600" }),
  ];
  for (const p of casos) {
    const hash = R.montarEndereco(p);
    assert.deepEqual(R.lerEndereco(hash), p, hash);
  }
  assert.equal(R.montarEndereco(pag("boxeador", { nome: "Oleksandr Usyk" })), "#/boxeador/Oleksandr%20Usyk");
  assert.equal(R.montarEndereco(pag("liga", { esporte: "futebol", liga: "eng.fa", aba: "jogos" })), "#/liga/futebol/eng.fa/jogos");
  assert.deepEqual(R.lerEndereco("#/boxeador/Oleksandr%20Usyk"), pag("boxeador", { nome: "Oleksandr Usyk" }));
});

test("lerEndereco: vazio, desconhecido ou incompleto dá jogos", () => {
  assert.deepEqual(R.lerEndereco(""), pag("jogos"));
  assert.deepEqual(R.lerEndereco("#/qualquer"), pag("jogos"));
  assert.deepEqual(R.lerEndereco("#/jogo/nba"), pag("jogos"));
  assert.deepEqual(R.lerEndereco(undefined), pag("jogos"));
});

test("pilhas: trocar de aba e voltar mantém a pilha de cada aba", () => {
  let p = R.novasPilhas();
  assert.equal(p.atual, "jogos");
  assert.deepEqual(R.topo(p), pag("jogos"));
  const liga = pag("liga", { esporte: "futebol", liga: "bra.1", aba: "classificacao" });
  const jogo = pag("jogo", { esporte: "futebol", liga: "bra.1", id: "1" });
  p = R.empilhar(p, liga);
  p = R.empilhar(p, jogo);
  p = R.trocarAba(p, "favoritos");
  assert.deepEqual(R.topo(p), pag("favoritos"));
  p = R.trocarAba(p, "jogos");
  assert.deepEqual(R.topo(p), jogo);
  assert.equal(p.jogos.length, 3);
});

test("pilhas: funções puras não alteram o que recebem", () => {
  const p = R.novasPilhas();
  const q = R.empilhar(p, pag("liga", { esporte: "nba", liga: "nba", aba: "jogos" }));
  assert.equal(p.jogos.length, 1);
  assert.equal(q.jogos.length, 2);
  R.voltar(q);
  R.trocarAba(q, "pesquisa");
  R.tocarAbaAtiva(q);
  assert.equal(q.jogos.length, 2);
  assert.equal(q.atual, "jogos");
});

test("tocarAbaAtiva corta a pilha da aba atual na raiz", () => {
  let p = R.empilhar(R.novasPilhas(), pag("liga", { esporte: "nba", liga: "nba", aba: "jogos" }));
  p = R.empilhar(p, pag("jogo", { esporte: "nba", liga: "nba", id: "9" }));
  const q = R.tocarAbaAtiva(p);
  assert.deepEqual(q.jogos, [pag("jogos")]);
});

test("acaoVoltar: desempilha, vai para Jogos nas outras raízes e sai na raiz de Jogos", () => {
  const raiz = R.novasPilhas();
  assert.equal(R.acaoVoltar(raiz), "sair");
  assert.equal(R.acaoVoltar(R.empilhar(raiz, pag("time", { esporte: "nba", liga: "nba", id: "1" }))), "desempilhar");
  assert.equal(R.acaoVoltar(R.trocarAba(raiz, "favoritos")), "irParaJogos");
  assert.equal(R.acaoVoltar(R.trocarAba(raiz, "pesquisa")), "irParaJogos");
  const fav = R.empilhar(R.trocarAba(raiz, "favoritos"), pag("time", { esporte: "nba", liga: "nba", id: "1" }));
  assert.equal(R.acaoVoltar(fav), "desempilhar");
});

test("voltar: desempilha, e na raiz de Favoritos vai para Jogos sem mexer na pilha de Jogos", () => {
  const jogo = pag("jogo", { esporte: "nba", liga: "nba", id: "9" });
  let p = R.empilhar(R.novasPilhas(), jogo);
  p = R.trocarAba(p, "favoritos");
  const q = R.voltar(p);
  assert.equal(q.atual, "jogos");
  assert.deepEqual(R.topo(q), jogo);
  const r = R.voltar(q);
  assert.deepEqual(r.jogos, [pag("jogos")]);
  // na raiz de Jogos, voltar não muda nada
  assert.deepEqual(R.voltar(r), r);
});

test("pilhasDeEndereco: página interna fica em Jogos sobre a raiz; raiz de aba fica sozinha", () => {
  const p = R.pilhasDeEndereco("#/jogo/nba/nba/123");
  assert.equal(p.atual, "jogos");
  assert.deepEqual(p.jogos, [pag("jogos"), pag("jogo", { esporte: "nba", liga: "nba", id: "123" })]);
  assert.equal(R.acaoVoltar(p), "desempilhar");
  const f = R.pilhasDeEndereco("#/favoritos");
  assert.equal(f.atual, "favoritos");
  assert.deepEqual(R.topo(f), pag("favoritos"));
  assert.equal(R.pilhasDeEndereco("").atual, "jogos");
});

test("ordenarGrupos: ao vivo primeiro, depois esporte, depois ordem da competição", () => {
  const g = (chave, esporte, ordem, aoVivo = false, erro) => ({ chave, esporte, ordem, aoVivo, ...(erro ? { erro } : {}) });
  const entrada = [
    g("nba", "nba", 0),
    g("bra", "futebol", 3),
    g("eng", "futebol", 1),
    g("mlb", "mlb", 0),
    g("nfl", "nfl", 0, false, "falhou"),
    g("nhl", "nhl", 0, true),
  ];
  const copia = JSON.parse(JSON.stringify(entrada));
  const saida = R.ordenarGrupos(entrada).map((x) => x.chave);
  assert.deepEqual(saida, ["nhl", "eng", "bra", "nba", "nfl", "mlb"]);
  assert.deepEqual(entrada, copia);
  // NBA ao vivo vem antes de futebol sem jogo ao vivo
  assert.deepEqual(R.ordenarGrupos([g("bra", "futebol", 0), g("nba", "nba", 0, true)]).map((x) => x.chave), ["nba", "bra"]);
  // empate mantém a ordem recebida
  assert.deepEqual(R.ordenarGrupos([g("a", "f1", 0), g("b", "f1", 0)]).map((x) => x.chave), ["a", "b"]);
});

/* ---------- Correções da revisão final ---------- */

test("historico: ao abrir, arma uma entrada do app sobre a base só se ainda não está nela (recarregar não empilha)", () => {
  assert.equal(R.iniciarHistorico(null), "armar");
  assert.equal(R.iniciarHistorico({ base: true }), "armar");
  assert.equal(R.iniciarHistorico({ app: true }), "manter");
  // estados antigos (versão com contador n) também são rearmados
  assert.equal(R.iniciarHistorico({ n: 2 }), "armar");
});

test("historico: voltar do navegador vira o voltar do app; na base, rearma; endereço digitado abre a página", () => {
  assert.deepEqual(R.passoHistorico({ base: true }), { acao: "voltar", rearmar: true });
  assert.deepEqual(R.passoHistorico({ app: true }), { acao: "voltar", rearmar: false });
  assert.deepEqual(R.passoHistorico(null), { acao: "abrir", rearmar: false });
});

test("historico: recarregar numa página interna e voltar pelo navegador chega à raiz de Jogos", () => {
  // simula: abriu #/jogo/..., recarregou (estado app), apertou voltar do navegador (cai na base)
  let p = R.pilhasDeEndereco("#/jogo/nba/nba/1");
  assert.equal(R.iniciarHistorico({ app: true }), "manter");
  const passo = R.passoHistorico({ base: true });
  assert.equal(passo.acao, "voltar");
  p = R.voltar(p);
  assert.deepEqual(R.topo(p), { tipo: "jogos", params: {} });
  assert.equal(passo.rearmar, true);
});

test("eventoNoDia: um fim de semana de F1 aparece em todos os dias dele", () => {
  const gp = { inicio: "2026-11-06T15:30:00Z", fim: "2026-11-08T19:00:00Z", data: "2026-11-06" };
  const dia = (iso) => iso.slice(0, 10);
  assert.equal(R.eventoNoDia(gp, "2026-11-06", dia), true);
  assert.equal(R.eventoNoDia(gp, "2026-11-08", dia), true);
  assert.equal(R.eventoNoDia(gp, "2026-11-09", dia), false);
  assert.equal(R.eventoNoDia(gp, "2026-11-05", dia), false);
  // sem início e fim (boxe): vale a data
  assert.equal(R.eventoNoDia({ data: "2026-11-14" }, "2026-11-14", dia), true);
});

test("CHIPS_ESPORTE e ORDEM_ESPORTES na ordem da spec", () => {
  assert.deepEqual(R.CHIPS_ESPORTE.map((c) => c[0]), ["todos", "futebol", "nba", "nfl", "mlb", "nhl", "f1", "ufc", "boxe"]);
  assert.deepEqual(R.ORDEM_ESPORTES, ["futebol", "nba", "nfl", "mlb", "nhl", "f1", "ufc", "boxe"]);
});
