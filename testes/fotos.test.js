"use strict";

// Testes da escolha da foto do jogador (fotos_regras.js), com buscas reais do TheSportsDB em testes/amostras/thesportsdb_busca.json.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Fotos = require("../static/fotos_regras.js");

const BUSCAS = JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", "thesportsdb_busca.json"), "utf8"));

test("acha a foto quando o time bate", () => {
  const url = Fotos.escolher(BUSCAS["Dean Henderson"], "Dean Henderson", "Crystal Palace");
  assert.match(url, /^https:\/\/r2\.thesportsdb\.com\/images\/media\/player\/cutout\/.+\.png\/small$/);
  assert.ok(Fotos.escolher(BUSCAS["Gustavo Gómez"], "Gustavo Gomez", "Palmeiras"), "sem acento também");
});

test("nome completo e único vale mesmo com o time diferente (seleção no lugar do clube)", () => {
  assert.ok(Fotos.escolher(BUSCAS["Jérémy Jacquet"], "Jérémy Jacquet", "Liverpool"));
});

test("nome de uma palavra só com outro time não vale (o Pedro da Lazio não é o do Flamengo)", () => {
  assert.equal(Fotos.escolher(BUSCAS["Pedro"], "Pedro", "Flamengo"), null);
  assert.ok(Fotos.escolher(BUSCAS["Pedro"], "Pedro", "Lazio"));
});

test("outro esporte, outro nome ou nada", () => {
  const rugby = [{ strPlayer: "Loïc Jacquet", strTeam: "ASM Clermont Auvergne", strSport: "Rugby", strCutout: "https://r2.thesportsdb.com/x.png" }];
  assert.equal(Fotos.escolher(rugby, "Loïc Jacquet", "ASM Clermont Auvergne"), null);
  assert.equal(Fotos.escolher(BUSCAS["Daichi Kamada"], "Adam Wharton", "Crystal Palace"), null);
  assert.equal(Fotos.escolher(null, "Dean Henderson", "Crystal Palace"), null);
  assert.equal(Fotos.escolher([{ strPlayer: "Dean Henderson", strTeam: "Crystal Palace", strSport: "Soccer" }], "Dean Henderson", "Crystal Palace"), null); // sem imagem
});

test("miniatura quando não há recorte, e endereços", () => {
  const so = [{ strPlayer: "Dean Henderson", strTeam: "Crystal Palace", strSport: "Soccer", strCutout: null, strThumb: "https://r2.thesportsdb.com/images/media/player/thumb/a.jpg" }];
  assert.equal(Fotos.escolher(so, "Dean Henderson", "Crystal Palace"), "https://r2.thesportsdb.com/images/media/player/thumb/a.jpg/small");
  assert.equal(Fotos.espnNba("3934672"), "https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/3934672.png&w=120&h=88");
  assert.equal(Fotos.urlBusca("Dean Henderson"), "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=Dean%20Henderson");
  assert.equal(Fotos.chave("Jérémy Jacquet", "Liverpool"), "jeremy jacquet|liverpool");
});

test("nome completo com outro clube não vale (homônimo); só a seleção do próprio jogador", () => {
  const outroClube = [{ strPlayer: "Dean Henderson", strTeam: "Manchester United", strNationality: "England", strSport: "Soccer", strCutout: "https://r2.thesportsdb.com/a.png" }];
  assert.equal(Fotos.escolher(outroClube, "Dean Henderson", "Crystal Palace"), null);
  // o Jacquet aparece com a seleção da França (time = nacionalidade): vale
  assert.ok(Fotos.escolher(BUSCAS["Jérémy Jacquet"], "Jérémy Jacquet", "Liverpool"));
});

test("limpeza do cache das fotos: vencidas e as mais antigas além do limite", () => {
  const agora = 1000;
  const entradas = [
    { chave: "a", ate: 500 }, // vencida
    { chave: "b", ate: 2000 },
    { chave: "c", ate: 3000 },
    { chave: "d", ate: 4000 },
  ];
  assert.deepEqual(Fotos.chavesParaApagar(entradas, agora, 10), ["a"]);
  assert.deepEqual(Fotos.chavesParaApagar(entradas, agora, 2).sort(), ["a", "b"]);
});

test("pausa das buscas quando o TheSportsDB limita (429): 1 min, dobrando até 8 min", () => {
  assert.equal(Fotos.proximaPausa(0), 60000);
  assert.equal(Fotos.proximaPausa(60000), 120000);
  assert.equal(Fotos.proximaPausa(240000), 480000);
  assert.equal(Fotos.proximaPausa(480000), 480000);
});

test("buscas de foto em rajada: até 25 por minuto saem na hora, a 26ª espera a janela abrir", () => {
  assert.equal(Fotos.esperaParaBuscar([], 1000), 0);
  const vinteQuatro = Array.from({ length: 24 }, (_, i) => i * 100);
  assert.equal(Fotos.esperaParaBuscar(vinteQuatro, 5000), 0);
  const vinteCinco = Array.from({ length: 25 }, (_, i) => i * 100);
  assert.equal(Fotos.esperaParaBuscar(vinteCinco, 5000), 55000); // a mais antiga (0) sai da janela aos 60 s
  // as que já saíram da janela não contam
  const velhas = Array.from({ length: 25 }, (_, i) => i * 100 - 120000);
  assert.equal(Fotos.esperaParaBuscar(velhas, 5000), 0);
});

test("nome curto da ESPN vale quando o time bate (Warleson -> Warleson Oliveira, do Botafogo)", () => {
  assert.match(Fotos.escolher(BUSCAS["Warleson"], "Warleson", "Botafogo") || "", /\/small$/);
  // outro time, mesmo com o nome curto contido: não (o Rhyan do Sydney FC não é o do Botafogo)
  assert.equal(Fotos.escolher(BUSCAS["Rhyan"], "Rhyan", "Botafogo"), null);
  assert.equal(Fotos.escolher(BUSCAS["Pedro"], "Pedro", "Flamengo"), null);
});

test("times com a sigla do estado: Atlético-MG é o Atlético Mineiro", () => {
  assert.ok(Fotos.mesmoTime("Atlético-MG", "Atlético Mineiro"));
  assert.ok(Fotos.mesmoTime("América-MG", "América Mineiro"));
  assert.ok(Fotos.mesmoTime("Atlético-GO", "Atlético Goianiense"));
  assert.ok(Fotos.mesmoTime("Remo", "Clube do Remo"));
  assert.ok(Fotos.mesmoTime("Operário PR", "Operário Ferroviário"));
  assert.equal(Fotos.mesmoTime("Atlético-MG", "Atlético Goianiense"), false);
  assert.equal(Fotos.mesmoTime("Atlético-MG", "Atlético Madrid"), false);
  assert.ok(Fotos.escolher(BUSCAS["Gustavo Scarpa"], "Gustavo Scarpa", "Atlético-MG"));
});
