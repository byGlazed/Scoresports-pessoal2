"use strict";

// Testes das regras dos e-sports (PandaScore grátis), com respostas reais guardadas em testes/amostras/pandascore_*.json
// (pegas pelo repasse do dono em 18/11/2026). FURIA x Vitality é a partida do print do Sofascore.
// Rode com: node --test testes/*.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Esports = require("../static/esports_regras.js");

const amostra = (nome) => JSON.parse(fs.readFileSync(path.join(__dirname, "amostras", `pandascore_${nome}.json`), "utf8"));
const CS = amostra("cs2_passadas");
const FURIA_VIT = CS.find((m) => m.id === 1762453); // Winners Match: FURIA vs VIT, BLAST Rivals, Grupo A
const FURIA = 124530;
const VITALITY = 3455;

test("jogos cobertos", () => {
  assert.deepEqual(Esports.JOGOS.map((j) => j.id), ["cs2", "valorant", "lol"]);
  assert.deepEqual(Esports.JOGOS.map((j) => j.slug), ["cs-go", "valorant", "league-of-legends"]);
  assert.equal(Esports.jogoDoSlug("league-of-legends").id, "lol");
  assert.equal(Esports.jogoDoSlug("dota-2"), null);
});

test("traduz uma partida encerrada (a do print)", () => {
  const p = Esports.partida(FURIA_VIT);
  assert.equal(p.id, 1762453);
  assert.equal(p.jogo, "cs2");
  assert.equal(p.estado, 3);
  assert.equal(p.status, "Encerrado");
  assert.equal(p.melhor_de, 3);
  assert.deepEqual(p.lados.map((l) => l.nome), ["FURIA", "Vitality"]);
  assert.equal(p.lados[0].pais, "BR");
  assert.equal(p.lados[0].sigla, "FURIA");
  assert.deepEqual(p.placar, [2, 1]);
  assert.equal(p.torneio.tier, "s");
  assert.equal(p.torneio.liga, "BLAST Rivals");
  assert.equal(p.inicio, "2026-11-12T04:07:32Z");
  // os mapas: Vitality, FURIA, FURIA, com 40, 52 e 26 minutos (como no Sofascore); o nome do mapa não vem no grátis
  assert.deepEqual(p.mapas.map((m) => [m.numero, m.vencedor, m.duracao_min, m.nome, m.estado]), [
    [1, 1, 40, null, 3],
    [2, 0, 52, null, 3],
    [3, 0, 26, null, 3],
  ]);
});

test("toda partida das amostras é traduzida sem quebrar", () => {
  for (const nome of ["cs2_passadas", "valorant_passadas", "lol_passadas", "running"]) {
    for (const m of amostra(nome)) {
      const p = Esports.partida(m);
      assert.equal(p.lados.length, 2, `${nome} ${m.id}`);
      assert.ok([1, 2, 3].includes(p.estado), `${nome} ${m.id}`);
      assert.equal(p.placar.length, 2);
      assert.ok(p.mapas.every((mapa) => [0, 1, null].includes(mapa.vencedor)));
    }
  }
  assert.ok(amostra("running").map((m) => Esports.partida(m)).every((p) => p.estado === 2 && p.status === "Ao vivo"));
});

test("intervalo do dia em Brasília", () => {
  assert.deepEqual(Esports.intervaloDoDia("2026-11-18"), ["2026-11-18T03:00:00Z", "2026-11-19T02:59:59Z"]);
  assert.deepEqual(Esports.intervaloDoDia("2026-12-31"), ["2026-12-31T03:00:00Z", "2027-01-01T02:59:59Z"]);
});

test("filtro do dia: grandes, brasileiros e favoritos", () => {
  const base = Esports.partida(FURIA_VIT);
  const com = (tier, paises) => ({ ...base, torneio: { ...base.torneio, tier }, lados: base.lados.map((l, i) => ({ ...l, pais: paises[i] })) });
  assert.equal(Esports.entraNoDia(com("a", ["FR", "FR"]), new Set()), true);
  assert.equal(Esports.entraNoDia(com("s", ["FR", "FR"]), new Set()), true);
  assert.equal(Esports.entraNoDia(com("c", ["FR", "BR"]), new Set()), true);
  assert.equal(Esports.entraNoDia(com("c", ["FR", "FR"]), new Set()), false);
  assert.equal(Esports.entraNoDia(com("c", ["FR", "FR"]), new Set([String(VITALITY)])), true);
  assert.equal(Esports.entraNoDia(com(null, [null, null]), new Set()), false);
});

test("time a definir", () => {
  const vazia = Esports.partida({ ...FURIA_VIT, opponents: [], results: [] });
  assert.deepEqual(vazia.lados, [{ id: null, nome: "A definir" }, { id: null, nome: "A definir" }]);
  assert.deepEqual(vazia.placar, [null, null]);
  const um = Esports.partida({ ...FURIA_VIT, opponents: FURIA_VIT.opponents.slice(0, 1) });
  assert.equal(um.lados[0].nome, "FURIA");
  assert.deepEqual(um.lados[1], { id: null, nome: "A definir" });
  // a amostra real de LoL tem uma partida sem oponentes
  const lol = amostra("lol_passadas").find((m) => !m.opponents.length);
  assert.ok(lol);
  assert.equal(Esports.partida(lol).lados[0].nome, "A definir");
});

test("cancelada, adiada e W.O.", () => {
  const cancelada = Esports.partida({ ...FURIA_VIT, status: "canceled", forfeit: false, winner_id: null, winner: null });
  assert.equal(cancelada.estado, 3);
  assert.equal(cancelada.status, "Cancelada");
  assert.equal(Esports.bolinhas(cancelada), null);
  const wo = Esports.partida({ ...FURIA_VIT, status: "finished", forfeit: true, winner_id: FURIA });
  assert.equal(wo.status, "W.O.");
  assert.equal(Esports.bolinhas(wo), null);
  assert.equal(Esports.partida({ ...FURIA_VIT, status: "postponed" }).status, "Adiada");
  // as canceladas reais não inventam mapas
  for (const m of CS.filter((x) => x.status === "canceled")) assert.deepEqual(Esports.partida(m).mapas, []);
});

test("bolinhas do 'Melhor de 3'", () => {
  assert.deepEqual(Esports.bolinhas(Esports.partida(FURIA_VIT)), { esquerda: [true, true], direita: [true, false] });
  const md5 = Esports.partida({ ...FURIA_VIT, number_of_games: 5, results: [{ team_id: FURIA, score: 1 }, { team_id: VITALITY, score: 3 }] });
  assert.deepEqual(Esports.bolinhas(md5), { esquerda: [true, false, false], direita: [true, true, true] });
  assert.equal(Esports.bolinhas({ ...Esports.partida(FURIA_VIT), melhor_de: null }), null);
});

test("grupos por torneio, ao vivo primeiro", () => {
  const encerradas = CS.filter((m) => m.status === "finished").map((m) => Esports.partida(m));
  const grupos = Esports.grupos(encerradas);
  const grupoA = grupos.find((g) => g.partidas.some((p) => p.id === 1762453));
  assert.equal(grupoA.titulo, "CS2 · BLAST Rivals · Group A");
  assert.equal(grupoA.partidas.length, 2); // FURIA x VIT e LGC x FURIA
  assert.deepEqual(grupoA.partidas.map((p) => p.id), [1762450, 1762453]); // pela hora
  const vivo = Esports.partida(amostra("running")[0]);
  assert.equal(Esports.grupos([...encerradas, vivo])[0].aoVivo, true);
});

test("transmissões: português primeiro, depois a oficial", () => {
  const t = Esports.transmissoes([
    { language: "en", official: true, main: true, raw_url: "https://www.twitch.tv/blast" },
    { language: "pt", official: false, main: false, raw_url: "https://www.twitch.tv/gaules" },
    { language: "ru", official: false, main: false, raw_url: "https://www.twitch.tv/ru" },
    { language: "pt", official: false, main: false, raw_url: "https://www.twitch.tv/gaules" },
  ]);
  assert.deepEqual(t.map((x) => x.url), ["https://www.twitch.tv/gaules", "https://www.twitch.tv/blast", "https://www.twitch.tv/ru"]);
  assert.equal(t[0].nome, "twitch.tv/gaules");
  assert.equal(t[0].idioma, "pt");
  assert.deepEqual(Esports.transmissoes(null), []);
});

test("elenco: jogador e lado a lado", () => {
  const time = amostra("time");
  const fallen = Esports.jogador(time.players.find((p) => p.name === "FalleN"));
  assert.deepEqual({ nick: fallen.nick, nome: fallen.nome, pais: fallen.pais }, { nick: "FalleN", nome: "Gabriel Toledo", pais: "BR" });
  const pares = Esports.elencoLadoALado([1, 2, 3], ["a"]);
  assert.deepEqual(pares, [[1, "a"], [2, null], [3, null]]);
});

/* ---------- Revisão final ---------- */

test("melhor de 2 (todos os mapas jogados) não tem bolinhas", () => {
  const md2 = Esports.partida({ ...FURIA_VIT, match_type: "all_games_played", number_of_games: 2, results: [{ team_id: FURIA, score: 1 }, { team_id: VITALITY, score: 1 }] });
  assert.equal(md2.tipo, "all_games_played");
  assert.equal(Esports.bolinhas(md2), null);
  assert.equal(Esports.partida(FURIA_VIT).tipo, "best_of");
});

test("adiada não fica guardada como encerrada de vez", () => {
  const com = (extra) => Esports.encerradaDeVez(Esports.partida({ ...FURIA_VIT, ...extra }));
  assert.equal(com({ status: "postponed" }), false);
  assert.equal(com({ status: "running" }), false);
  assert.equal(com({ status: "not_started" }), false);
  assert.equal(com({ status: "finished" }), true);
  assert.equal(com({ status: "canceled", forfeit: false, winner_id: null }), true);
  assert.equal(com({ status: "finished", forfeit: true, winner_id: FURIA }), true);
});

test("junta o ao vivo na lista do dia", () => {
  const vivo = amostra("running").map((m) => Esports.partida(m));
  const antiga = { ...vivo[0], placar: [0, 0], mapas: [] };
  const outra = Esports.partida(FURIA_VIT);
  const juntas = Esports.juntarAoVivo([outra, antiga], vivo);
  assert.deepEqual(juntas.map((p) => p.id), [outra.id, antiga.id]); // a ordem fica
  assert.equal(juntas[0], outra);
  assert.deepEqual(juntas[1].placar, vivo[0].placar);
  assert.deepEqual(juntas[1].mapas, vivo[0].mapas);
  assert.deepEqual(Esports.juntarAoVivo([outra], []), [outra]);
});

test("transmissões só com endereço http(s)", () => {
  const t = Esports.transmissoes([
    { language: "pt", raw_url: "javascript:alert(1)" },
    { language: "pt", raw_url: "ftp://exemplo.com/x" },
    { language: "en", raw_url: "https://www.twitch.tv/blast" },
  ]);
  assert.deepEqual(t.map((x) => x.url), ["https://www.twitch.tv/blast"]);
});

test("pesquisa: times da PandaScore só dos três jogos do app, com o jogo e o país na descrição", () => {
  const lista = [
    { id: 124530, name: "FURIA", acronym: "FURIA", location: "BR", image_url: "f.png", current_videogame: { slug: "cs-go" } },
    { id: 128477, name: "FURIA Esports", acronym: "FUR", location: "BR", image_url: null, current_videogame: { slug: "valorant" } },
    { id: 127596, name: "FURIA Esports", acronym: "FURIA", location: "BR", current_videogame: { slug: "r6-siege" } },
  ];
  const r = Esports.timesDaBusca(lista);
  assert.deepEqual(r.map((t) => [t.liga, t.id, t.nome, t.descricao]), [["cs2", "124530", "FURIA", "Counter-Strike 2 · BR"], ["valorant", "128477", "FURIA Esports", "Valorant · BR"]]);
  assert.equal(r[0].imagem, "f.png");
  assert.deepEqual(Esports.timesDaBusca(null), []);
});
