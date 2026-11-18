"use strict";

/* Regras puras da nota do Scoresports, sem DOM: tudo no objeto Notas.
   A nota é calculada pelo próprio app a partir das estatísticas do jogo (não é a do Sofascore),
   numa escala de 3 a 10, com as mesmas faixas de cor em todo o app.
   Testadas no Node (testes/notas.test.js); a NBA é calibrada no jogo do print do dono. */

const Notas = (() => {
  const MINIMA = 3;
  const MAXIMA = 10;

  // do maior para o menor: a primeira faixa cujo piso a nota alcança
  const FAIXAS = [
    [9, "azul"],
    [8, "verde-azulado"],
    [7, "verde"],
    [6.5, "amarelo"],
    [6, "laranja"],
    [-Infinity, "vermelho"],
  ];

  const TEXTO_INFO = "Nota do Scoresports, calculada pelo app a partir das estatísticas do jogo. Não é a nota do Sofascore.";

  const num = (v) => Number(v) || 0;
  const limitar = (n) => Math.min(MAXIMA, Math.max(MINIMA, n));
  const umaCasa = (n) => Math.round(n * 10) / 10;

  function corDaNota(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
    return FAIXAS.find(([piso]) => Number(n) >= piso)[1];
  }

  function formatar(n, casas = 1) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "–";
    return Number(n).toFixed(casas);
  }

  /* ---------- NBA ---------- */

  /** Game Score de John Hollinger, com a linha no formato de linhaBox (nba_quadra.js). */
  function gameScore(l) {
    const fg = l.fg || {};
    const ft = l.ft || {};
    return (
      num(l.pts) +
      0.4 * num(fg.f) -
      0.7 * num(fg.t) -
      0.4 * (num(ft.t) - num(ft.f)) +
      0.7 * num(l.oreb) +
      0.3 * num(l.dreb) +
      num(l.stl) +
      0.7 * num(l.ast) +
      0.7 * num(l.blk) -
      0.4 * num(l.pf) -
      num(l.to)
    );
  }

  // conversão calibrada nas 10 notas do print (LAC x UTAH, 17/11/2026): erro máximo de 0,3
  const NBA_BASE = 5.9;
  const NBA_PASSO = 0.095;

  function notaNba(l) {
    if (!l || l.minutos === null || l.minutos === undefined || num(l.minutos) < 5) return null;
    return umaCasa(limitar(NBA_BASE + NBA_PASSO * gameScore(l)));
  }

  /* ---------- Futebol ---------- */

  function papel(posicao) {
    const p = String(posicao || "").toUpperCase();
    if (p === "G" || p === "GK") return "goleiro";
    // inglês (PC): CD, CD-L, LB, RB, SW, LWB...; português (celular, lang=pt): ZC, ZE, ZCD (zagueiros). "DM" é volante, não defensor.
    if (/^(CD|CB|SW|LB|RB|LWB|RWB|WB|D)(-[LR])?$/.test(p) || /^Z[A-Z]*$/.test(p)) return "defensor";
    return "linha";
  }

  const RESULTADO = { vitoria: 0.3, empate: 0, derrota: -0.3 };
  const GOL = { goleiro: 1.5, defensor: 1.3, linha: 1.0 };

  /** Nota de um jogador de futebol. ctx = { resultado: "vitoria"|"empate"|"derrota", sofridos_do_time }. */
  function notaFutebol(j, ctx = {}) {
    if (!j || j.minutos === null || j.minutos === undefined || num(j.minutos) < 10) return null;
    const quem = papel(j.posicao);
    let n = 6.5;
    n += RESULTADO[ctx.resultado] || 0;
    n += GOL[quem] * num(j.gols);
    n += 0.6 * num(j.assistencias);
    n += 0.1 * num(j.chutes_no_gol);
    n += 0.05 * num(j.faltas_sofridas);
    n -= 0.08 * num(j.faltas_cometidas);
    n -= 0.3 * num(j.amarelos);
    n -= 1.5 * num(j.vermelhos);
    n -= 1.0 * num(j.gols_contra);
    const semSofrer = ctx.sofridos_do_time !== null && ctx.sofridos_do_time !== undefined && num(ctx.sofridos_do_time) === 0 && num(j.minutos) >= 60;
    if (quem === "goleiro") {
      n += 0.2 * num(j.defesas);
      n -= 0.3 * num(j.gols_sofridos);
      if (semSofrer) n += 0.5;
    } else if (quem === "defensor") {
      n -= 0.05 * num(ctx.sofridos_do_time);
      if (semSofrer) n += 0.3;
    }
    return umaCasa(limitar(n));
  }

  /** Média das notas que existem, com duas casas (a do time no cabeçalho do campinho). */
  function media(notas) {
    const validas = (notas || []).filter((n) => n !== null && n !== undefined && !Number.isNaN(Number(n)));
    if (!validas.length) return null;
    return Math.round((validas.reduce((s, n) => s + Number(n), 0) / validas.length) * 100) / 100;
  }

  return { FAIXAS, TEXTO_INFO, corDaNota, formatar, gameScore, notaNba, notaFutebol, media, papel };
})();

if (typeof module !== "undefined") module.exports = Notas;
