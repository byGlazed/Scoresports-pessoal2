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

/** "World Series - Game 5 · MIL ganhou a série 4-1": o nome do jogo e a situação da série, quando há. */
function notaDoJogo(comp) {
  if (!comp) return null;
  const titulo = ((comp.notes || []).find((n) => n && n.headline) || {}).headline || null;
  const serie = (comp.series && comp.series.summary) || null;
  return [titulo, serie].filter(Boolean).join(" · ") || null;
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

if (typeof module !== "undefined") {
  module.exports = { statusAoVivo, notaDoJogo, nomeLiderEsporte, LIDERES_POR_ESPORTE };
}
