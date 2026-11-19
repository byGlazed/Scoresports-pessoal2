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
  assert.equal(Fotos.espnNba("3934672"), "https://a.espncdn.com/i/headshots/nba/players/full/3934672.png");
  assert.equal(Fotos.urlBusca("Dean Henderson"), "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=Dean%20Henderson");
  assert.equal(Fotos.chave("Jérémy Jacquet", "Liverpool"), "jeremy jacquet|liverpool");
});
