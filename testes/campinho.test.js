"use strict";

// Testes das regras do campinho: linhas por formação, lado espelhado (como no print do dono) e minutos jogados.
// Amostras reais da ESPN: testes/amostras/espn_formacoes.json (uma escalação por formação)
// e testes/amostras/espn_futebol_resumo.json (Crystal Palace 1 x 3 Liverpool, 08/11/2026).
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Campinho = require("../static/campinho_regras.js");

const amostra = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", nome), "utf8"));
const FORMACOES = amostra("espn_formacoes.json");
const RESUMO = amostra("espn_futebol_resumo.json");

const ladoEsquerdo = (p) => /-L$/.test(p) || /^L(B|M|F|WB)$/.test(p);
const ladoDireito = (p) => /-R$/.test(p) || /^R(B|M|F|WB)$/.test(p);

test("as formações mais comuns estão na tabela", () => {
  for (const f of ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-2-1", "5-3-2", "4-1-4-1"]) assert.ok(Campinho.LINHAS[f], f);
  // toda formação da tabela tem os 11 lugares, uma vez cada
  for (const [f, linhas] of Object.entries(Campinho.LINHAS)) {
    assert.deepEqual(linhas.flat().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], f);
    assert.equal(linhas.length, f.split("-").length + 1, f);
  }
});

test("cada formação da amostra tem linhas certas", () => {
  for (const [f, titulares] of Object.entries(FORMACOES)) {
    if (!Campinho.LINHAS[f]) continue;
    const pos = Campinho.posicoes(f, titulares);
    assert.ok(pos, f);
    assert.equal(pos.length, 11, f);
    assert.equal(new Set(pos.map((p) => p.linha)).size, f.split("-").length + 1, f);
    const goleiro = pos.find((p) => p.jogador.posicao === "G");
    assert.ok(pos.every((p) => p === goleiro || p.y > goleiro.y), `${f}: o goleiro fica em cima`);
    for (const a of pos) for (const b of pos) if (a.linha < b.linha) assert.ok(a.y < b.y, `${f}: o y cresce com a linha`);
    assert.ok(pos.every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1), `${f}: dentro do campo`);
  }
});

test("lado espelhado como no print", () => {
  let conferidos = 0;
  for (const [f, titulares] of Object.entries(FORMACOES)) {
    const pos = Campinho.posicoes(f, titulares);
    if (!pos) continue;
    for (const p of pos) {
      if (ladoEsquerdo(p.jogador.posicao)) {
        assert.ok(p.x > 0.5, `${f}: ${p.jogador.posicao} (lugar ${p.jogador.lugar}) devia ficar à direita da tela`);
        conferidos++;
      }
      if (ladoDireito(p.jogador.posicao)) {
        assert.ok(p.x < 0.5, `${f}: ${p.jogador.posicao} (lugar ${p.jogador.lugar}) devia ficar à esquerda da tela`);
        conferidos++;
      }
    }
  }
  assert.ok(conferidos > 40, `poucos jogadores com lado conferidos: ${conferidos}`);
});

test("formação desconhecida ou incompleta", () => {
  const onze = FORMACOES["4-4-2"];
  assert.equal(Campinho.posicoes("4-6-0", onze), null);
  assert.equal(Campinho.posicoes("4-4-2", onze.slice(0, 10)), null);
  assert.equal(Campinho.posicoes("4-4-2", onze.map((p, i) => (i === 0 ? { ...p, lugar: 0 } : p))), null);
  assert.equal(Campinho.posicoes(null, onze), null);
});

test("minutos", () => {
  assert.equal(Campinho.minutoDoTexto("67'"), 67);
  assert.equal(Campinho.minutoDoTexto("90'+3'"), 93);
  assert.equal(Campinho.minutoDoTexto("45'+2'"), 47);
  assert.equal(Campinho.minutoDoTexto(""), null);
  assert.equal(Campinho.minutoDoTexto(null), null);
  assert.equal(Campinho.minutosJogados({ titular: true, saiu_aos: 67 }, 90), 67);
  assert.equal(Campinho.minutosJogados({ titular: true }, 90), 90);
  assert.equal(Campinho.minutosJogados({ titular: false, entrou_aos: 80 }, 90), 10);
  assert.equal(Campinho.minutosJogados({ titular: false, entrou_aos: 60, saiu_aos: 85 }, 90), 25);
  assert.equal(Campinho.minutosJogados({ titular: false }, 90), null);
  assert.equal(Campinho.minutosJogados({ titular: true }, null), null);
});

test("substituições da amostra", () => {
  const subs = Campinho.substituicoes(RESUMO.keyEvents);
  // Darío Osorio (315668) entra no lugar de Quinten Timber (282230) aos 60'
  assert.equal(subs["282230"].saiu_aos, 60);
  assert.equal(subs["315668"].entrou_aos, 60);
  // quem entrou no lugar de quem (para o "Saiu: Q. Timber" dos reservas)
  assert.equal(subs["315668"].no_lugar_de, "282230");
  assert.equal(subs["282230"].saiu_para, "315668");
  // Joe Gomez entra aos 90'+1'
  assert.equal(subs["102053"].entrou_aos, 91);
  assert.deepEqual(Campinho.substituicoes(null), {});
});
