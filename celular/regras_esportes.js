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

/** O mando e o resultado de um jogo do histórico (lastFiveGames da ESPN) para o time: pelo placar, que não
    depende da língua; sem placar, pela letra (em português V/E/D, em inglês W/L/T; o D português é derrota). */
function resultadoDoJogo(e, timeId) {
  const id = String(timeId || "");
  let local = ["vs", "x"].includes(String(e.atVs || "").trim().toLowerCase()) ? "casa" : "fora";
  if (id && String(e.homeTeamId || "") === id) local = "casa";
  else if (id && String(e.awayTeamId || "") === id) local = "fora";
  const casa = Number.parseInt(e.homeTeamScore, 10);
  const fora = Number.parseInt(e.awayTeamScore, 10);
  if (Number.isFinite(casa) && Number.isFinite(fora) && (String(e.homeTeamId || "") === id || String(e.awayTeamId || "") === id)) {
    const meu = local === "casa" ? casa : fora;
    const dele = local === "casa" ? fora : casa;
    return { local, resultado: meu > dele ? "V" : meu < dele ? "D" : "E" };
  }
  const letra = String(e.gameResult || "").trim().toUpperCase();
  const resultado = { W: "V", V: "V", L: "D", D: "D", T: "E", E: "E" }[letra] || null;
  return { local, resultado };
}

/** "Partidas: 32, Gols: 10" -> { valor: "10", detalhe: "32 jogos" }; um número só fica como está. */
function valorDoLider(texto) {
  const t = String(texto ?? "").trim();
  const m = /^(?:partidas|jogos|matches|games|apps?)\s*:\s*(\d+)\s*,\s*[^:]+:\s*([\d.,]+)/i.exec(t);
  return m ? { valor: m[2], detalhe: `${m[1]} jogos` } : { valor: t, detalhe: null };
}

/** A provável escalação a partir da escalação do último jogo: só os titulares, sem os números daquele jogo. */
function provavelDoTime(e) {
  if (!e || !(e.titulares || []).length) return null;
  return {
    lado: e.lado,
    time: e.time,
    formacao: e.formacao,
    gols_pro: null,
    gols_contra_time: null,
    titulares: e.titulares.map((j) => ({ id: j.id, nome: j.nome, camisa: j.camisa, posicao: j.posicao, lugar: j.lugar, foto: j.foto })),
    reservas: [],
  };
}

/** As tabelas da carreira de um atleta (o /stats da ESPN). Os times vêm indexados pelo código ("cleveland-cavaliers")
    ou numa lista: a temporada leva a sigla do time (CLE), achada pelo id ou pelo código. */
function categoriasCarreira(st) {
  const lista = Array.isArray(st.teams) ? st.teams : Object.entries(st.teams || {}).map(([codigo, t]) => ({ slug: codigo, ...t }));
  const porId = new Map(lista.filter((t) => t.id !== undefined).map((t) => [String(t.id), t]));
  const porCodigo = new Map(lista.filter((t) => t.slug).map((t) => [String(t.slug), t]));
  const NOMES = [[/^Misc Total/i, "Outros números"], [/^Misc/i, "Outros números"]];
  return (st.categories || [])
    .map((cat) => ({
      nome: NOMES.reduce((n, [re, pt]) => n.replace(re, pt), cat.displayName || cat.name || ""),
      rotulos: cat.labels || [],
      descricoes: cat.displayNames || cat.names || [],
      temporadas: (cat.statistics || []).map((s) => {
        const temp = s.season || {};
        const t = porId.get(String(s.teamId)) || porCodigo.get(String(s.teamSlug)) || {};
        return { temporada: String(temp.displayName || temp.year || ""), time: t.abbreviation || t.shortDisplayName || t.displayName || null, valores: s.stats || [] };
      }),
      totais: cat.totals || [],
    }))
    .filter((c) => c.temporadas.length || c.totais.length);
}

/** Os dias (AAAA-MM-DD, os da ESPN) que vale pedir: só os que o calendário da liga tem jogo. Sem calendário,
    ou com algum dia fora dele (outra temporada), pede todos, como antes: na dúvida, pede. */
function diasParaPedir(dias, calendario) {
  if (!calendario || !calendario.length) return dias;
  const primeiro = calendario[0];
  const ultimo = calendario[calendario.length - 1];
  if (dias.some((d) => d < primeiro || d > ultimo)) return dias;
  const tem = new Set(calendario);
  return dias.filter((d) => tem.has(d));
}

if (typeof module !== "undefined") {
  module.exports = { statusAoVivo, notaDoJogo, nomeLiderEsporte, LIDERES_POR_ESPORTE, lancesPontuacao, diasDoCalendario, estatisticasJogoBeisebol, diasParaPedir, resultadoDoJogo, valorDoLider, provavelDoTime, categoriasCarreira };
}
