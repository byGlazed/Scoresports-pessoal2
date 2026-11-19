"use strict";

/* Regras puras da página da liga (como a página de torneio do Sofascore), sem DOM: tudo no objeto Liga.
   - O cabeçalho: escudo, temporada ("2026" ou "2025/26") e as datas do calendário da ESPN.
   - A aba Detalhes: os jogos em destaque, os números da temporada pela classificação,
     o maior campeão da lista e a divisão de cima ou de baixo.
   Testadas no Node (testes/liga.test.js). */

const Liga = (() => {
  const ano = (iso) => {
    const t = Date.parse(iso || "");
    return Number.isNaN(t) ? null : new Date(t).getUTCFullYear();
  };

  /** "2026" quando a temporada cabe num ano; "2025/26" quando vira o ano. */
  function temporadaRotulo(inicio, fim) {
    const a = ano(inicio);
    const b = ano(fim);
    if (!a || !b) return null;
    return a === b ? String(a) : `${a}/${String(b).slice(-2)}`;
  }

  /** O que o cabeçalho usa, tirado do leagues[0] do scoreboard da ESPN. */
  function infoDaLiga(liga0) {
    if (!liga0) return null;
    const logos = liga0.logos || [];
    const claro = logos.find((l) => !(l.rel || []).includes("dark")) || null;
    const temp = liga0.season || {};
    const inicio = liga0.calendarStartDate || temp.startDate || null;
    const fim = liga0.calendarEndDate || temp.endDate || null;
    return { nome: liga0.name || null, logo: claro ? claro.href : null, inicio, fim, temporada: temporadaRotulo(inicio, fim) };
  }

  const numero = (v) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  /** Gols, jogos, média de gols, empates e times da temporada (futebol), somando as linhas da classificação. */
  function resumoTemporada(grupos) {
    let partidas = 0;
    let gols = 0;
    let empates = 0;
    let equipes = 0;
    for (const g of grupos || []) {
      for (const l of g.linhas || []) {
        const st = l.stats || {};
        equipes += 1;
        partidas += numero(st.gamesPlayed);
        gols += numero(st.pointsFor);
        empates += numero(st.ties);
      }
    }
    const jogos = Math.round(partidas / 2); // cada jogo conta para os dois times
    if (!jogos) return null;
    return {
      jogos,
      gols,
      media: Math.round((gols / jogos) * 100) / 100,
      empatesPct: Math.round((empates / 2 / jogos) * 100),
      equipes,
    };
  }

  /** O time que mais aparece na lista de campeões (só se tiver mais de um título nela). */
  function maisTitulos(campeoes) {
    const conta = new Map();
    for (const c of campeoes || []) if (c.campeao) conta.set(c.campeao, (conta.get(c.campeao) || 0) + 1);
    let melhor = null;
    conta.forEach((titulos, nome) => {
      if (!melhor || titulos > melhor.titulos) melhor = { nome, titulos };
    });
    return melhor && melhor.titulos > 1 ? melhor : null;
  }

  const quando = (j) => j.inicio || j.data || "";

  /** Os jogos em destaque: ao vivo, os próximos (pela hora) e os últimos resultados (o mais recente primeiro). */
  function destaques(jogos, maximo = 3) {
    const lista = jogos || [];
    return {
      aoVivo: lista.filter((j) => j.estado === 2),
      proximos: lista.filter((j) => j.estado === 1).sort((a, b) => quando(a).localeCompare(quando(b))).slice(0, maximo),
      ultimos: lista.filter((j) => j.estado === 3).sort((a, b) => quando(b).localeCompare(quando(a))).slice(0, maximo),
    };
  }

  /** O dia com jogo de hoje em diante e o último dia com jogo antes de hoje (datas AAAA-MM-DD ordenadas). */
  function datasDosDestaques(datas, hoje) {
    const ordenadas = [...(datas || [])].sort();
    return {
      proxima: ordenadas.find((d) => d >= hoje) || null,
      anterior: [...ordenadas].reverse().find((d) => d < hoje) || null,
    };
  }

  const DIVISOES = { futebol: [["bra.1", "bra.2"]] };

  /** A divisão de cima e a de baixo da liga, quando o app tem as duas. */
  function divisoes(esporte, liga) {
    const r = {};
    for (const [cima, baixo] of DIVISOES[esporte] || []) {
      if (liga === cima) r.inferior = baixo;
      if (liga === baixo) r.superior = cima;
    }
    return r;
  }

  const NOMES_LIDERES = { goalsLeaders: "Artilharia", assistsLeaders: "Assistências" };

  /** Os líderes do /statistics da ESPN (um pedido só, com nome e time de cada um, e que vale para as copas):
      artilharia e assistências do torneio inteiro. */
  function lideresDoSite(dados, limite = 10) {
    const categorias = ((dados && dados.stats) || [])
      .map((c) => ({
        chave: c.name,
        nome: NOMES_LIDERES[c.name] || c.displayName || c.name,
        lideres: (c.leaders || []).slice(0, limite).map((l, i) => {
          const a = l.athlete || {};
          const t = a.team || {};
          const logos = t.logos || [];
          const logo = logos.find((x) => !(x.rel || []).includes("dark")) || logos[0] || null;
          const jogos = /(\d+)/.exec(l.shortDisplayValue || l.displayValue || "");
          return {
            posicao: i + 1,
            id: a.id || null,
            nome: a.displayName || a.shortName || "?",
            time: t.abbreviation || t.displayName || null,
            time_logo: logo ? logo.href : null,
            valor: Number.isFinite(l.value) ? String(Math.round(l.value)) : l.displayValue || "",
            jogos: jogos ? Number(jogos[1]) : null,
          };
        }),
      }))
      .filter((c) => c.lideres.length);
    return { categorias, temporada: ((dados && dados.season) || {}).displayName || null };
  }

  /** As categorias rápidas primeiro; das completas, só as que faltam (os cartões). */
  function juntarLideres(rapidas, completas) {
    const nomes = new Set((rapidas || []).map((c) => c.nome));
    return [...(rapidas || []), ...(completas || []).filter((c) => !nomes.has(c.nome))];
  }

  return { temporadaRotulo, infoDaLiga, resumoTemporada, maisTitulos, destaques, datasDosDestaques, divisoes, lideresDoSite, juntarLideres };
})();

if (typeof module !== "undefined") module.exports = Liga;
