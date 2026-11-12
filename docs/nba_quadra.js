"use strict";

/* =========================================================================
   NBA: box score e mapa de arremessos. Comum ao site do PC e ao app.
   As regras são puras (testadas em testes/nba_quadra.test.js); só o
   quadraSVG desenha, usando o helper s() do app.js na hora de chamar.
   Coordenadas do desenho: décimos de pé, aro em (0, 0), linha de fundo
   em Y = -47,5 — o mesmo sistema dos dados da NBA no PC.
   ========================================================================= */

/** Coordenada da ESPN (pés, x 0-50, aro em 25,1) para o desenho; null se inválida (lance livre). */
function converterCoordenada(c) {
  if (!c || typeof c.x !== "number" || typeof c.y !== "number") return null;
  if (c.x < -5 || c.x > 55 || c.y < -5 || c.y > 55) return null;
  return { x: Math.round((c.x - 25) * 10), y: Math.round((c.y - 1) * 10) };
}

/** Arremessos de quadra do jogo, prontos para o mapa. Lances livres ficam de fora. */
function arremessosDoJogo(plays) {
  const lista = [];
  const semPosicao = { total: 0, porTime: {} };
  for (const p of plays || []) {
    if (!p || !p.shootingPlay) continue;
    const texto = String(p.text || "");
    // lance livre: o tipo vem em inglês mesmo com o texto em português ("anota lance livre")
    if (/free throw/i.test(`${(p.type || {}).text || ""} ${texto}`) || /lance livre/i.test(texto)) continue;
    const time = String((p.team || {}).id || "");
    const pos = converterCoordenada(p.coordinate);
    if (!pos) {
      semPosicao.total++;
      semPosicao.porTime[time] = (semPosicao.porTime[time] || 0) + 1;
      continue;
    }
    const cx = p.coordinate.x;
    const cy = p.coordinate.y;
    const distancia = Math.round(Math.hypot(cx - 25, cy - 1));
    const canto = Math.abs(cx - 25) >= 22 && cy <= 13;
    const tres = /three point|de 3 pontos|de três/i.test(texto) || (canto && distancia >= 22) || Math.hypot(cx - 25, cy - 1) >= 23.75;
    lista.push({
      x: pos.x,
      y: pos.y,
      feito: Boolean(p.scoringPlay),
      tres,
      distancia,
      time_id: time,
      atleta_id: String(((((p.participants || [])[0] || {}).athlete) || {}).id || ""),
      periodo: (p.period || {}).number || null,
      relogio: (p.clock || {}).displayValue || null,
      texto,
    });
  }
  return { lista, semPosicao };
}

const umaCasa = (f, t) => (t ? Math.round((f / t) * 1000) / 10 : null);

function resumoArremessos(lista) {
  const l = lista || [];
  const feitos = l.filter((a) => a.feito).length;
  const de3 = l.filter((a) => a.tres);
  const feitos3 = de3.filter((a) => a.feito).length;
  return { feitos, tentados: l.length, pct: umaCasa(feitos, l.length), feitos3, tentados3: de3.length, pct3: umaCasa(feitos3, de3.length) };
}

/* ---------- Box score ---------- */

const numeroBox = (v) => {
  if (v === null || v === undefined || v === "" || v === "--") return null;
  const n = Number(String(v).replace("+", ""));
  return Number.isNaN(n) ? null : n;
};

const parBox = (v) => {
  const m = /^(\d+)-(\d+)$/.exec(String(v || ""));
  return m ? { f: Number(m[1]), t: Number(m[2]) } : { f: null, t: null };
};

/** Linha do box score a partir dos textos da ESPN, na ordem de "names". */
function linhaBox(nomes, valores) {
  const v = {};
  (nomes || []).forEach((n, i) => (v[n] = (valores || [])[i]));
  return {
    minutos: numeroBox(v.MIN),
    pts: numeroBox(v.PTS),
    reb: numeroBox(v.REB),
    ast: numeroBox(v.AST),
    stl: numeroBox(v.STL),
    blk: numeroBox(v.BLK),
    to: numeroBox(v.TO),
    pf: numeroBox(v.PF),
    mais_menos: numeroBox(v["+/-"]),
    fg: parBox(v.FG),
    tres: parBox(v["3PT"]),
    ft: parBox(v.FT),
  };
}

/** Box score de um time (um item de summary.boxscore.players). */
function boxScoreDoTime(t) {
  const s = (((t || {}).statistics) || [])[0] || {};
  const nomes = s.names || s.labels || [];
  const titulares = [];
  const reservas = [];
  const naoJogaram = [];
  for (const a of s.athletes || []) {
    const at = a.athlete || {};
    const jogador = {
      id: String(at.id || ""),
      nome: at.displayName || at.shortName || "?",
      nome_curto: at.shortName || at.displayName || "?",
      posicao: ((at.position || {}).abbreviation) || null,
      ...linhaBox(nomes, a.didNotPlay ? [] : a.stats),
    };
    if (a.didNotPlay || !(a.stats || []).length) naoJogaram.push(jogador);
    else (a.starter ? titulares : reservas).push(jogador);
  }
  return { time_id: String(((t || {}).team || {}).id || ""), titulares, reservas, naoJogaram, totais: linhaBox(nomes, s.totals) };
}

const valorOrdem = (j, coluna) => {
  const v = j[coluna];
  if (v && typeof v === "object") return v.f === null ? null : [v.f, v.t];
  return v === null || v === undefined ? null : [v];
};

/** Jogadores ordenados pela coluna; nulos sempre no fim; empate mantém a ordem. Não altera a lista recebida. */
function ordenarBox(jogadores, coluna, direcao = "desc") {
  const sinal = direcao === "asc" ? 1 : -1;
  return (jogadores || [])
    .map((j, i) => ({ j, i, v: valorOrdem(j, coluna) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      for (let k = 0; k < Math.max(a.v.length, b.v.length); k++) {
        const d = (a.v[k] ?? 0) - (b.v[k] ?? 0);
        if (d) return d * sinal;
      }
      return a.i - b.i;
    })
    .map((x) => x.j);
}

/* ---------- Desenho da quadra ---------- */

/** Meia quadra em escala real com os arremessos. aoTocar(arremesso) é chamado ao tocar numa marca. */
function quadraSVG(arremessos, { aoTocar } = {}) {
  const svg = s("svg", { class: "quadra", viewBox: "-250 -52.5 500 470", role: "img", "aria-label": `Mapa com ${arremessos.length} arremessos` });
  svg.append(
    s(
      "g",
      { class: "linhas" },
      s("rect", { x: -250, y: -47.5, width: 500, height: 470 }),
      s("rect", { x: -80, y: -47.5, width: 160, height: 190 }),
      s("rect", { x: -60, y: -47.5, width: 120, height: 190 }),
      s("circle", { cx: 0, cy: 142.5, r: 60 }),
      s("line", { x1: -30, y1: -7.5, x2: 30, y2: -7.5 }),
      s("circle", { cx: 0, cy: 0, r: 7.5 }),
      s("path", { d: "M -40 0 A 40 40 0 0 0 40 0" }),
      s("line", { x1: -220, y1: -47.5, x2: -220, y2: 92.5 }),
      s("line", { x1: 220, y1: -47.5, x2: 220, y2: 92.5 }),
      s("path", { d: "M -220 92.5 A 237.5 237.5 0 0 0 220 92.5" })
    )
  );
  for (const a of arremessos) {
    const descricao = `${a.feito ? "Acerto" : "Erro"}, ${a.tres ? "3 pontos" : "2 pontos"}, ${a.distancia ?? "?"} pés${a.periodo ? `, ${a.periodo}º quarto` : ""} ${a.relogio || ""}`.trim();
    const titulo = s("title", null, descricao);
    const marca = a.feito
      ? s("circle", { class: "acerto", cx: a.x, cy: a.y, r: 5 }, titulo)
      : s("path", { class: "erro-arremesso", d: `M ${a.x - 4.5} ${a.y - 4.5} L ${a.x + 4.5} ${a.y + 4.5} M ${a.x + 4.5} ${a.y - 4.5} L ${a.x - 4.5} ${a.y + 4.5}` }, titulo);
    if (aoTocar) marca.addEventListener("click", () => aoTocar(a));
    svg.append(marca);
  }
  return svg;
}

if (typeof module !== "undefined") {
  module.exports = { converterCoordenada, arremessosDoJogo, resumoArremessos, boxScoreDoTime, ordenarBox, quadraSVG };
}
