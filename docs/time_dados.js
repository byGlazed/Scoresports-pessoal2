"use strict";

/* =========================================================================
   Regras puras da página do time: agrupar o elenco por posição, separar os
   jogos, escolher as estatísticas e achar o técnico no Wikidata.
   Não faz pedidos à internet: recebe o que a ESPN e o Wikidata devolveram.
   No navegador vira um conjunto de funções globais (carregado antes do
   direto.js); no Node é um módulo, para os testes em testes/.
   ========================================================================= */

/* ---------- Elenco ---------- */

/** Grupo de cada posição, por esporte. A chave é o nome ou a sigla da ESPN, em minúsculas. */
const GRUPOS_POSICAO = {
  futebol: { goalkeeper: "Goleiros", defender: "Defensores", midfielder: "Meias", forward: "Atacantes" },
  nba: { guard: "Armadores", g: "Armadores", forward: "Alas", f: "Alas", center: "Pivôs", c: "Pivôs" },
  nfl: {
    offense: "Ataque",
    defense: "Defesa",
    specialteam: "Times especiais",
    "special teams": "Times especiais",
    injuredreserveorout: "Lesionados",
    suspended: "Suspensos",
    practicesquad: "Elenco de treino",
  },
  mlb: {
    sp: "Arremessadores", rp: "Arremessadores", p: "Arremessadores",
    c: "Receptores",
    "1b": "Defensores internos", "2b": "Defensores internos", "3b": "Defensores internos", ss: "Defensores internos", if: "Defensores internos",
    lf: "Defensores externos", cf: "Defensores externos", rf: "Defensores externos", of: "Defensores externos",
    dh: "Rebatedor designado",
  },
  nhl: { g: "Goleiros", d: "Defensores", c: "Atacantes", lw: "Atacantes", rw: "Atacantes", f: "Atacantes" },
};

/** Ordem em que os grupos aparecem. "Outros" vem sempre por último. */
const ORDEM_GRUPOS_ELENCO = {
  futebol: ["Goleiros", "Defensores", "Meias", "Atacantes"],
  nba: ["Armadores", "Alas", "Pivôs"],
  nfl: ["Ataque", "Defesa", "Times especiais", "Lesionados", "Suspensos", "Elenco de treino"],
  mlb: ["Arremessadores", "Receptores", "Defensores internos", "Defensores externos", "Rebatedor designado"],
  nhl: ["Goleiros", "Defensores", "Atacantes"],
};

function atletaCurto(a) {
  return {
    id: a.id,
    nome: a.displayName || a.fullName,
    camisa: a.jersey || null,
    posicao: (a.position || {}).abbreviation || (a.position || {}).name || null,
    idade: a.age ?? null,
    foto: (a.headshot || {}).href || null,
    pais: a.citizenship || (a.flag || {}).alt || null,
  };
}

/** Em que grupo do elenco fica uma posição (aceita o objeto da ESPN ou só o texto). */
function grupoDaPosicao(esporte, posicao) {
  const mapa = GRUPOS_POSICAO[esporte] || {};
  const p = typeof posicao === "string" ? { name: posicao } : posicao || {};
  for (const chave of [p.name, p.abbreviation]) {
    const g = chave && mapa[String(chave).toLowerCase()];
    if (g) return g;
  }
  return "Outros";
}

function ordenarGrupos(esporte, grupos) {
  const ordem = (ORDEM_GRUPOS_ELENCO[esporte] || []).concat("Outros");
  const pos = (nome) => (ordem.includes(nome) ? ordem.indexOf(nome) : ordem.length);
  return grupos.filter((g) => g.atletas.length).sort((a, b) => pos(a.nome) - pos(b.nome));
}

function nomeTecnico(roster) {
  const c = (roster.coach || [])[0];
  if (!c) return null;
  const nome = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return nome || null;
}

/** Elenco da ESPN agrupado por posição, mais o técnico quando a ESPN informa. */
function agruparElenco(esporte, roster) {
  roster = roster || {};
  const atletas = roster.athletes || [];
  const porNome = new Map();
  const juntar = (nome, lista) => {
    if (!porNome.has(nome)) porNome.set(nome, []);
    porNome.get(nome).push(...lista);
  };
  if (atletas.length && atletas[0] && "items" in atletas[0]) {
    // NFL (e outros): a ESPN já manda os grupos prontos
    for (const g of atletas) juntar(grupoDaPosicao(esporte, String(g.position || "")), (g.items || []).map(atletaCurto));
  } else {
    for (const a of atletas) juntar(grupoDaPosicao(esporte, a.position), [atletaCurto(a)]);
  }
  const grupos = [...porNome].map(([nome, lista]) => ({ nome, atletas: lista }));
  return { grupos: ordenarGrupos(esporte, grupos), tecnico: nomeTecnico(roster) };
}

/* ---------- Jogos ---------- */

/** V, E ou D do ponto de vista do time, ou null se o jogo não terminou ou o time não jogou. */
function resultadoDoTime(jogo, timeId) {
  if (!jogo || jogo.estado !== 3) return null;
  const id = String(timeId);
  const [meu, outro] = String(jogo.casa.id) === id ? [jogo.casa, jogo.fora] : String(jogo.fora.id) === id ? [jogo.fora, jogo.casa] : [null, null];
  if (!meu) return null;
  const a = Number(meu.placar);
  const b = Number(outro.placar);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a > b ? "V" : a < b ? "D" : "E";
}

const QUATRO_HORAS = 4 * 3600 * 1000;
const SEM_DATA = ["Adiado", "Cancelado"];

/** Últimos jogos (mais recente primeiro) e próximos (mais cedo primeiro). Adiados e cancelados ficam de fora. */
function separarJogos(jogos, agoraIso, limite = 10) {
  const agora = Date.parse(agoraIso);
  const quando = (j) => Date.parse(j.inicio) || 0;
  const ultimos = jogos.filter((j) => j.estado === 3).sort((a, b) => quando(b) - quando(a)).slice(0, limite);
  const proximos = jogos
    .filter((j) => j.estado < 3 && !SEM_DATA.includes(j.status) && quando(j) >= agora - QUATRO_HORAS)
    .sort((a, b) => quando(a) - quando(b))
    .slice(0, limite);
  return { ultimos, proximos };
}

/* ---------- Estatísticas ---------- */

/** O que mostrar em cada esporte: [grupo, [["categoria.nome", "rótulo"], ...]]. */
const STATS_TIME = {
  futebol: [
    ["Ataque", [["offensive.totalGoals", "Gols"], ["offensive.avgGoals", "Gols por jogo"], ["offensive.totalShots", "Finalizações"], ["offensive.shotsOnTarget", "No alvo"], ["offensive.possessionPct", "Posse de bola (%)"], ["general.passPct", "Acerto de passe (%)"]]],
    ["Defesa", [["goalKeeping.goalsConceded", "Gols sofridos"], ["goalKeeping.cleanSheet", "Jogos sem sofrer gol"], ["goalKeeping.saves", "Defesas do goleiro"], ["defensive.totalTackles", "Desarmes"], ["defensive.interceptions", "Interceptações"]]],
    ["Geral", [["general.wins", "Vitórias"], ["general.draws", "Empates"], ["general.losses", "Derrotas"], ["general.goalDifference", "Saldo de gols"], ["general.yellowCards", "Cartões amarelos"], ["general.redCards", "Cartões vermelhos"]]],
  ],
  nba: [
    ["Ataque", [["offensive.avgPoints", "Pontos por jogo"], ["offensive.avgAssists", "Assistências por jogo"], ["offensive.fieldGoalPct", "Arremessos (%)"], ["offensive.threePointPct", "Bolas de 3 (%)"], ["offensive.freeThrowPct", "Lances livres (%)"]]],
    ["Defesa", [["defensive.avgDefensiveRebounds", "Rebotes defensivos por jogo"], ["defensive.avgSteals", "Roubos por jogo"], ["defensive.avgBlocks", "Tocos por jogo"]]],
    ["Geral", [["general.avgRebounds", "Rebotes por jogo"], ["offensive.avgTurnovers", "Erros por jogo"], ["general.gamesPlayed", "Jogos"]]],
  ],
  nfl: [
    ["Ataque", [["scoring.totalPointsPerGame", "Pontos por jogo"], ["passing.yardsPerGame", "Jardas por jogo"], ["passing.passingYardsPerGame", "Jardas de passe por jogo"], ["rushing.rushingYardsPerGame", "Jardas corridas por jogo"], ["scoring.totalTouchdowns", "Touchdowns"]]],
    ["Defesa", [["defensive.pointsAllowed", "Pontos sofridos"], ["defensive.yardsAllowed", "Jardas cedidas"], ["defensive.sacks", "Sacks"], ["defensiveInterceptions.interceptions", "Interceptações"], ["defensive.totalTackles", "Tackles"]]],
    ["Geral", [["miscellaneous.turnOverDifferential", "Saldo de turnovers"], ["miscellaneous.thirdDownConvPct", "3ª descida convertida (%)"], ["miscellaneous.redzoneScoringPct", "Aproveitamento na red zone (%)"], ["general.totalPenalties", "Faltas"]]],
  ],
};

/** Estatísticas da temporada do time, já traduzidas. Recebe splits.categories do Core API da ESPN. */
function estatisticasDoTime(esporte, categorias) {
  const tabela = STATS_TIME[esporte];
  if (!tabela || !Array.isArray(categorias) || !categorias.length) return [];
  const valor = (chave) => {
    const [cat, nome] = chave.split(".");
    const c = categorias.find((x) => x.name === cat);
    const s = c && (c.stats || []).find((x) => x.name === nome);
    return s && s.displayValue != null && s.displayValue !== "" ? String(s.displayValue) : null;
  };
  return tabela
    .map(([grupo, itens]) => ({
      grupo,
      itens: itens.map(([chave, rotulo]) => ({ rotulo, valor: valor(chave) })).filter((i) => i.valor !== null),
    }))
    .filter((g) => g.itens.length);
}

/* ---------- Técnico pelo Wikidata (só futebol: a ESPN não informa) ---------- */

const CLUBE_OU_SELECAO = ["Q476028", "Q6979593"]; // clube de futebol, seleção de futebol

function idDoValor(afirmacao) {
  const snak = (afirmacao || {}).mainsnak || {};
  if (snak.snaktype && snak.snaktype !== "value") return null;
  const v = (snak.datavalue || {}).value;
  return v && typeof v === "object" && v.id ? v.id : null;
}

/** Na resposta do wbgetentities, o primeiro item que é clube ou seleção de futebol. */
function escolherClube(resposta) {
  for (const [qid, ent] of Object.entries((resposta || {}).entities || {})) {
    const tipos = (((ent || {}).claims || {}).P31 || []).map(idDoValor);
    if (tipos.some((t) => CLUBE_OU_SELECAO.includes(t))) return qid;
  }
  return null;
}

/** QID do técnico atual (P286 sem data de fim), preferindo o rank "preferred". */
function idTecnicoAtual(entidade) {
  const lista = (((entidade || {}).claims || {}).P286 || []).filter((a) => a.rank !== "deprecated" && !((a.qualifiers || {}).P582 || []).length);
  const ordem = [...lista.filter((a) => a.rank === "preferred"), ...lista.filter((a) => a.rank !== "preferred")];
  for (const a of ordem) {
    const id = idDoValor(a);
    if (id) return id;
  }
  return null;
}

if (typeof module !== "undefined") {
  module.exports = { atletaCurto, grupoDaPosicao, agruparElenco, resultadoDoTime, separarJogos, estatisticasDoTime, escolherClube, idTecnicoAtual };
}
