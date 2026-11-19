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

  function autoresDosGols(lances, ladoDe) {
    const saida = { casa: [], fora: [] };
    for (const l of lances || []) {
      if (!GOLS.includes(l.tipo)) continue;
      const nome = (l.jogadores || [])[0] || "Gol";
      const extra = l.tipo === "gol_contra" ? " (contra)" : /p[eê]nalt|penalty/i.test(l.texto || "") ? " (pên.)" : "";
      saida[ladoDoGol(l, ladoDe)].push(`${nome}${l.tempo ? ` ${l.tempo}` : ""}${extra}`);
    }
    return saida;
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

  /** O time e `vizinhos` de cada lado (5 linhas, encostando no topo ou no fim da tabela). */
  function miniClassificacao(linhas, timeId, vizinhos = 2) {
    const i = (linhas || []).findIndex((l) => String(l.id) === String(timeId));
    if (i < 0) return [];
    const tamanho = vizinhos * 2 + 1;
    const ini = Math.max(0, Math.min(i - vizinhos, linhas.length - tamanho));
    return linhas.slice(ini, ini + tamanho);
  }

  /** Quanto da temporada já passou (0 a 100), com as datas de início e fim. */
  function progressoTemporada(inicio, fim, agora = new Date()) {
    const a = Date.parse(inicio || "");
    const b = Date.parse(fim || "");
    if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
    const pct = Math.round(Math.min(100, Math.max(0, ((agora.getTime() - a) / (b - a)) * 100)));
    return { pct, inicio, fim };
  }

  return { autoresDosGols, placarCorrido, formaRecente, proximoJogo, miniClassificacao, progressoTemporada };
})();

if (typeof module !== "undefined") module.exports = Visual;
