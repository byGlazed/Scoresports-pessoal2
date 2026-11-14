"use strict";

/* =========================================================================
   Regras puras de MLB e NHL: texto do jogo ao vivo, nota do jogo (série nos
   playoffs) e nomes das categorias de líderes. Não faz pedidos à internet.
   No navegador vira um conjunto de funções globais (carregado antes do
   direto.js); no Node é um módulo, para os testes em testes/.
   ========================================================================= */

/** Texto do jogo em andamento no beisebol e no hóquei. Para outros esportes, null (quem chama usa o texto padrão). */
function statusAoVivo(esporteEspn, status) {
  if (!status || (esporteEspn !== "baseball" && esporteEspn !== "hockey")) return null;
  const tipo = status.type || {};
  const periodo = Number(status.period) || 0;
  if (esporteEspn === "baseball") {
    if (!periodo) return null;
    const detalhe = `${tipo.shortDetail || ""} ${tipo.detail || ""}`.toLowerCase();
    if (/\b(top|cima)\b/.test(detalhe)) return `▲ ${periodo}ª entrada`;
    if (/\b(bot|bottom|baixo)\b/.test(detalhe)) return `▼ ${periodo}ª entrada`;
    if (/\bmid\b/.test(detalhe)) return `Intervalo da ${periodo}ª`;
    if (/\bend\b/.test(detalhe)) return `Fim da ${periodo}ª`;
    return `${periodo}ª entrada`;
  }
  // hóquei
  if (!periodo) return null;
  const relogio = status.displayClock && status.displayClock !== "0:00" ? status.displayClock : "";
  const comRelogio = (texto) => (relogio ? `${texto} · ${relogio}` : texto);
  if (periodo <= 3) {
    if (String(tipo.name || "").toUpperCase().includes("END_PERIOD")) return `Fim do ${periodo}º período`;
    return comRelogio(`${periodo}º período`);
  }
  if (periodo === 4) return comRelogio("Prorrogação");
  // período 5: pênaltis na temporada regular; nos playoffs (tipo 3) a prorrogação continua
  if (Number(status._tipoTemporada) === 3) return comRelogio(`${periodo - 3}ª prorrogação`);
  return "Pênaltis";
}

/**
 * "World Series - Game 5 · MIL ganhou a série 4-1": o nome do jogo e a situação da série, quando há.
 * Na lista de jogos a ESPN manda "series" como objeto; no resumo do jogo, como lista (current, season,
 * playoff), e o nome do jogo vem em header.gameNote. Só a série dos playoffs interessa.
 */
function notaDoJogo(comp, gameNote = null) {
  if (!comp) return null;
  const titulo = ((comp.notes || []).find((n) => n && n.headline) || {}).headline || gameNote || null;
  let serie = null;
  if (Array.isArray(comp.series)) serie = (comp.series.find((s) => s && s.type === "playoff") || {}).summary || null;
  else if (comp.series) serie = comp.series.summary || null;
  return [titulo, serie].filter(Boolean).join(" · ") || null;
}

const DIA_MS = 86400000;

/**
 * Dias (AAAA-MM-DD) da competição a partir do "calendar" da ESPN. Em geral ele lista os dias com jogo;
 * na MLB (calendarIsWhitelist false) lista os dias SEM jogo, entre calendarStartDate e calendarEndDate.
 */
function diasDoCalendario(liga) {
  liga = liga || {};
  const dia = (iso) => new Date(Date.parse(iso)).toISOString().slice(0, 10);
  const listados = (liga.calendar || []).filter((c) => typeof c === "string" && !Number.isNaN(Date.parse(c))).map(dia);
  if (liga.calendarIsWhitelist !== false) return [...new Set(listados)].sort();
  const ini = Date.parse(liga.calendarStartDate);
  const fim = Date.parse(liga.calendarEndDate) - DIA_MS / 2; // o fim vem às 07:59Z do dia seguinte
  if (Number.isNaN(ini) || Number.isNaN(fim)) return [];
  const sem = new Set(listados);
  const dias = [];
  for (let t = Date.parse(dia(new Date(ini).toISOString()) + "T12:00:00Z"); t <= fim + DIA_MS / 2; t += DIA_MS) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d <= dia(new Date(fim).toISOString()) && !sem.has(d)) dias.push(d);
  }
  return dias;
}

/** Nomes das categorias de líderes que mudam de sentido conforme o esporte ("wins", "goals", "points"). */
const LIDERES_POR_ESPORTE = {
  mlb: {
    avg: "Média de rebatidas",
    homeRuns: "Home runs",
    RBIs: "Corridas impulsionadas",
    hits: "Rebatidas",
    stolenBases: "Bases roubadas",
    wins: "Vitórias (arremessador)",
    ERA: "ERA",
    strikeouts: "Strikeouts",
    saves: "Saves",
  },
  nhl: {
    goals: "Gols",
    assists: "Assistências",
    points: "Pontos",
    plusMinus: "+/−",
    wins: "Vitórias (goleiro)",
    savePct: "Defesas (%)",
    avgGoalsAgainst: "Gols sofridos por jogo",
    shutouts: "Jogos sem sofrer gol",
  },
};

function nomeLiderEsporte(esporte, nomeEspn) {
  const mapa = LIDERES_POR_ESPORTE[esporte];
  return (mapa && mapa[nomeEspn]) || null;
}

/**
 * Pontuações do jogo (gols no hóquei, corridas no beisebol), no formato dos "lances" das outras telas.
 * A ESPN manda tudo em "plays" e marca as que valem ponto com scoringPlay. Outros esportes: null.
 */
function lancesPontuacao(esporteEspn, jogadas) {
  if (esporteEspn !== "baseball" && esporteEspn !== "hockey") return null;
  return (jogadas || [])
    .filter((p) => p && p.scoringPlay)
    .map((p) => {
      const periodo = (p.period || {}).number;
      let tempo = null;
      if (esporteEspn === "hockey") {
        const relogio = (p.clock || {}).displayValue;
        tempo = periodo ? `${periodo}º P${relogio ? ` ${relogio}` : ""}` : relogio || null;
      } else if (periodo) {
        const parte = String((p.period || {}).type || "").toLowerCase();
        tempo = `${parte.startsWith("top") ? "▲ " : parte.startsWith("bot") ? "▼ " : ""}${periodo}ª`;
      }
      const temPlacar = p.homeScore !== undefined && p.homeScore !== null;
      return {
        tempo,
        tipo: esporteEspn === "hockey" ? "Gol" : "Corrida",
        texto: p.text || "",
        time_id: (p.team || {}).id || null,
        placar: temPlacar ? `${p.awayScore} x ${p.homeScore}` : null,
        jogadores: [],
      };
    });
}

/** Números do jogo de beisebol que entram na comparação dos times: [grupo da ESPN, nome, rótulo]. */
const ESTATISTICAS_JOGO_BEISEBOL = [
  ["batting", "runs", "Corridas"],
  ["batting", "hits", "Rebatidas"],
  ["batting", "homeRuns", "Home runs"],
  ["batting", "RBIs", "Corridas impulsionadas"],
  ["batting", "walks", "Bases por bolas"],
  ["batting", "strikeouts", "Strikeouts sofridos"],
  ["batting", "stolenBases", "Bases roubadas"],
  ["batting", "runnersLeftOnBase", "Corredores deixados em base"],
  ["pitching", "strikeouts", "Strikeouts dos arremessadores"],
  ["pitching", "pitches", "Arremessos"],
  ["fielding", "errors", "Erros"],
];

/**
 * No beisebol a ESPN manda as estatísticas do time em grupos (batting, pitching, fielding), cada um com
 * a própria lista. Achata nos números principais, no formato plano dos outros esportes ({name, label,
 * displayValue}). Lista que não é agrupada: null (quem chama usa a lista como está).
 */
function estatisticasJogoBeisebol(grupos) {
  if (!Array.isArray(grupos) || !grupos.some((g) => g && Array.isArray(g.stats))) return null;
  const saida = [];
  for (const [grupo, nome, rotulo] of ESTATISTICAS_JOGO_BEISEBOL) {
    const g = grupos.find((x) => x && x.name === grupo);
    const s = g && (g.stats || []).find((x) => x && x.name === nome);
    if (s && s.displayValue != null && s.displayValue !== "") saida.push({ name: `${grupo}.${nome}`, label: rotulo, displayValue: s.displayValue });
  }
  return saida;
}

if (typeof module !== "undefined") {
  module.exports = { statusAoVivo, notaDoJogo, nomeLiderEsporte, LIDERES_POR_ESPORTE, lancesPontuacao, diasDoCalendario, estatisticasJogoBeisebol };
}
