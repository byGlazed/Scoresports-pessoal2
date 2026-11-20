"use strict";

/* Regras puras das telas inspiradas no Sofascore, sem DOM: tudo no objeto Visual.
   - os autores dos gols embaixo de cada time no placar;
   - o placar corrido nos gols da linha do tempo;
   - a forma recente (V/E/D) e o próximo jogo na "Visão geral" do time;
   - a mini-classificação (o time e os vizinhos);
   - o progresso da temporada na página do campeonato.
   Testadas no Node (testes/visual.test.js). */

const Visual = (() => {
  const GOLS = ["gol", "gol_contra"];

  /** De que lado é o gol: o gol contra conta para o outro time. */
  function ladoDoGol(l, ladoDe) {
    const lado = ladoDe(l.time_id);
    return l.tipo === "gol_contra" ? (lado === "casa" ? "fora" : "casa") : lado;
  }

  /** Os autores dos gols de cada lado; o mesmo jogador numa linha só, como no Sofascore ("Kaio 28', 60' (pên.), 67'"). */
  function autoresDosGols(lances, ladoDe) {
    const lados = { casa: new Map(), fora: new Map() };
    for (const l of lances || []) {
      if (!GOLS.includes(l.tipo)) continue;
      const nome = (l.jogadores || [])[0] || "Gol";
      const extra = l.tipo === "gol_contra" ? " (contra)" : /p[eê]nalt|penalty/i.test(l.texto || "") ? " (pên.)" : "";
      const mapa = lados[ladoDoGol(l, ladoDe)];
      if (!mapa.has(nome)) mapa.set(nome, []);
      mapa.get(nome).push(`${l.tempo || ""}${extra}`.trim());
    }
    const texto = (mapa) => [...mapa.entries()].map(([nome, marcas]) => [nome, marcas.filter(Boolean).join(", ")].filter(Boolean).join(" "));
    return { casa: texto(lados.casa), fora: texto(lados.fora) };
  }

  /** Para cada lance, o placar "casa - fora" depois dele, se for gol (null nos outros). */
  function placarCorrido(lances, ladoDe) {
    let casa = 0;
    let fora = 0;
    return (lances || []).map((l) => {
      if (!GOLS.includes(l.tipo)) return null;
      if (ladoDoGol(l, ladoDe) === "casa") casa++;
      else fora++;
      return `${casa} - ${fora}`;
    });
  }

  const SEM_RESULTADO = ["Adiado", "Cancelado", "Suspenso", "Abandonado"];

  function resultado(jogo, timeId) {
    if (!jogo || jogo.estado !== 3 || SEM_RESULTADO.includes(jogo.status)) return null;
    const id = String(timeId);
    const [meu, outro] = String(jogo.casa.id) === id ? [jogo.casa, jogo.fora] : String(jogo.fora.id) === id ? [jogo.fora, jogo.casa] : [null, null];
    if (!meu || meu.placar === null || meu.placar === undefined || outro.placar === null || outro.placar === undefined) return null;
    const a = Number(meu.placar);
    const b = Number(outro.placar);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    const r = a === b && (meu.vencedor || outro.vencedor) ? (meu.vencedor ? "V" : "D") : a > b ? "V" : a < b ? "D" : "E";
    return { resultado: r, placar: `${a}-${b}`, adversario: outro };
  }

  const quando = (j) => j.inicio || j.data || "";

  /** Os últimos `n` jogos encerrados do time, do mais antigo ao mais novo. */
  function formaRecente(jogos, timeId, n = 5) {
    return (jogos || [])
      .map((j) => ({ j, r: resultado(j, timeId) }))
      .filter((x) => x.r)
      .sort((a, b) => quando(a.j).localeCompare(quando(b.j)))
      .slice(-n)
      .map(({ j, r }) => ({ ...r, id: j.id, jogo: j }));
  }

  /** O próximo jogo (a jogar ou ao vivo) a partir de hoje. */
  function proximoJogo(jogos, hojeYmd) {
    return (jogos || [])
      .filter((j) => j.estado !== 3 && (j.data || quando(j).slice(0, 10)) >= hojeYmd)
      .sort((a, b) => quando(a).localeCompare(quando(b)))[0] || null;
  }

  /** O time e `vizinhos` de cada lado (5 linhas, encostando no topo ou no fim da tabela).
      Cada linha leva a posição na tabela inteira (rank), para o pedaço não recomeçar do 1. */
  function miniClassificacao(linhas, timeId, vizinhos = 2) {
    const i = (linhas || []).findIndex((l) => String(l.id) === String(timeId));
    if (i < 0) return [];
    const tamanho = vizinhos * 2 + 1;
    const ini = Math.max(0, Math.min(i - vizinhos, linhas.length - tamanho));
    return linhas.slice(ini, ini + tamanho).map((l, k) => ({ ...l, rank: l.rank ?? ini + k + 1 }));
  }

  /** A imagem da ESPN no tamanho em que aparece (o redimensionador dela): um escudo de 500 px tem ~110 KB,
      o de 64 px tem ~5 KB. Imagem de outro site, ou já redimensionada, fica como está. */
  function imagemPequena(url, largura, altura = largura) {
    const m = /^https?:\/\/a\d?\.espncdn\.com(\/i\/[^?#]+\.png)$/i.exec(String(url || ""));
    if (!m) return url || null;
    return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${largura}&h=${altura}`;
  }

  /** Quanto da temporada já passou (0 a 100), com as datas de início e fim. */
  function progressoTemporada(inicio, fim, agora = new Date()) {
    const a = Date.parse(inicio || "");
    const b = Date.parse(fim || "");
    if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
    const pct = Math.round(Math.min(100, Math.max(0, ((agora.getTime() - a) / (b - a)) * 100)));
    return { pct, inicio, fim };
  }

  return { autoresDosGols, placarCorrido, formaRecente, proximoJogo, miniClassificacao, imagemPequena, progressoTemporada };
})();

if (typeof module !== "undefined") module.exports = Visual;
