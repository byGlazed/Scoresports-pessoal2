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

  /** De que lado é o gol. No gol contra a ESPN já marca o time que ganhou o gol (conferido em 7 jogos de
      5 ligas, novembro de 2026: Tenaglia, do Alavés, contra no Alavés x Deportivo vem com o time do Deportivo). */
  function ladoDoGol(l, ladoDe) {
    return ladoDe(l.time_id);
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

  /** Onde entra o "Intervalo" na linha do tempo do futebol (antes do 1º lance do 2º tempo; "45'+2'" ainda é do 1º)
      e o placar dele. Sem lance no 2º tempo, só no jogo encerrado (aí fica no fim). → { antesDe, placar } ou null. */
  function intervaloDoJogo(lances, ladoDe, encerrado) {
    const lista = lances || [];
    const minuto = (t) => {
      const m = /^\s*(\d+)/.exec(String(t || ""));
      return m ? Number(m[1]) : 0;
    };
    let i = lista.findIndex((l) => minuto(l.tempo) > 45);
    if (i < 0) {
      if (!encerrado) return null;
      i = lista.length;
    }
    let casa = 0;
    let fora = 0;
    for (const l of lista.slice(0, i)) {
      if (!GOLS.includes(l.tipo)) continue;
      if (ladoDoGol(l, ladoDe) === "casa") casa++;
      else fora++;
    }
    return { antesDe: i, placar: `${casa} - ${fora}` };
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

  /** Fim de semana de corrida na lista do dia: a sessão ao vivo, senão a próxima (e a última que acabou),
      senão encerrado. O estado do fim de semana inteiro (sexta a domingo) deixava "em andamento" o dia todo.
      → { estado: 1|2|3, aoVivo, proxima, ultima } ou null sem sessões com horário. */
  function situacaoCorrida(sessoes) {
    const lista = (sessoes || []).filter((x) => x && x.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (!lista.length) return null;
    const aoVivo = lista.find((x) => x.estado === 2) || null;
    const ultima = [...lista].reverse().find((x) => x.estado === 3) || null;
    const proxima = lista.find((x) => x.estado === 1) || null;
    if (aoVivo) return { estado: 2, aoVivo, proxima: null, ultima };
    if (proxima) return { estado: 1, aoVivo: null, proxima, ultima };
    return { estado: 3, aoVivo: null, proxima: null, ultima };
  }

  // as siglas de posição da ESPN no futebol (em português: G, ZC, ZCD, LD, MC, MCE, MA, ACI, ATCD...; às
  // vezes em inglês mesmo com lang=pt: RB, LB, CD-L, DM, AM, CF-R...) por extenso, como no Sofascore
  const POSICOES = [
    [/^(G|GK|GOL)$/, "Goleiro"],
    [/^(LD|LE|RB|LB|RWB|LWB|WB|AL[DE]?)(-[LR])?$/, "Lateral"],
    [/^(Z[A-Z]*|CD|CB|SW|L)(-[LR])?$/, "Zagueiro"],
    [/^(V[A-Z]*|DM|CDM)(-[LR])?$/, "Volante"],
    [/^(M[A-Z]*|CM|LM|RM|AM|CAM)(-[LR])?$/, "Meio-campista"],
    [/^(A[A-Z]*|F|CF|ST|SS|LF|RF|LW|RW)(-[LR])?$/, "Atacante"],
  ];
  function posicaoPorExtenso(sigla) {
    const p = String(sigla || "").trim().toUpperCase();
    if (!p) return null;
    for (const [re, nome] of POSICOES) if (re.test(p)) return nome;
    return sigla;
  }

  /* Estatísticas do jogo de futebol como no Sofascore: seções, rótulos em português e porcentagens de verdade.
     A ESPN manda rótulos meio em inglês ("On Target %", "Tackle %"), as porcentagens como fração arredondada
     (0.4) e dois "Desarmes" (o segundo são os cortes). Aqui tudo sai dos nomes fixos (possessionPct, totalShots...)
     e as porcentagens saem das contagens. → [{ secao, rotulo, casa, fora }] ou null se não for futebol. */
  function estatisticasFutebol(casa, fora) {
    const mapa = (lista) => Object.fromEntries((lista || []).filter((x) => x && x.name).map((x) => [x.name, Number(x.value ?? x.displayValue)]));
    const lados = [mapa(casa), mapa(fora)];
    if (!lados.some((m) => "possessionPct" in m || "totalShots" in m)) return null;
    const n = (m, k) => (Number.isFinite(m[k]) ? m[k] : null);
    const pct = (a, b) => (a !== null && b ? `${Math.round((100 * a) / b)}%` : null);
    const certos = (m, ok, total) => {
      const a = n(m, ok);
      const b = n(m, total);
      return a === null || b === null ? null : `${a}/${b}${b ? ` (${Math.round((100 * a) / b)}%)` : ""}`;
    };
    const fora_ = (m) => {
      const t = n(m, "totalShots");
      const g = n(m, "shotsOnTarget");
      const bl = n(m, "blockedShots");
      return t === null || g === null ? null : Math.max(0, t - g - (bl || 0));
    };
    const LINHAS = [
      ["Visão geral", "Posse de bola", (m) => (n(m, "possessionPct") === null ? null : `${Math.round(n(m, "possessionPct"))}%`)],
      ["Visão geral", "Finalizações", (m) => n(m, "totalShots")],
      ["Visão geral", "Finalizações no gol", (m) => n(m, "shotsOnTarget")],
      ["Visão geral", "Escanteios", (m) => n(m, "wonCorners")],
      ["Visão geral", "Faltas", (m) => n(m, "foulsCommitted")],
      ["Visão geral", "Impedimentos", (m) => n(m, "offsides")],
      ["Visão geral", "Cartões amarelos", (m) => n(m, "yellowCards")],
      ["Visão geral", "Cartões vermelhos", (m) => n(m, "redCards")],
      ["Finalizações", "No gol", (m) => n(m, "shotsOnTarget")],
      ["Finalizações", "Para fora", fora_],
      ["Finalizações", "Bloqueadas", (m) => n(m, "blockedShots")],
      ["Finalizações", "Pontaria", (m) => pct(n(m, "shotsOnTarget"), n(m, "totalShots"))],
      ["Finalizações", "Pênaltis", (m) => (n(m, "penaltyKickShots") ? `${n(m, "penaltyKickGoals") ?? 0}/${n(m, "penaltyKickShots")}` : null)],
      ["Passes", "Passes certos", (m) => certos(m, "accuratePasses", "totalPasses")],
      ["Passes", "Cruzamentos certos", (m) => certos(m, "accurateCrosses", "totalCrosses")],
      ["Passes", "Bolas longas certas", (m) => certos(m, "accurateLongBalls", "totalLongBalls")],
      ["Defesa", "Desarmes certos", (m) => certos(m, "effectiveTackles", "totalTackles")],
      ["Defesa", "Interceptações", (m) => n(m, "interceptions")],
      ["Defesa", "Cortes", (m) => n(m, "totalClearance")],
      ["Goleiro", "Defesas", (m) => n(m, "saves")],
    ];
    return LINHAS.map(([secao, rotulo, f]) => ({ secao, rotulo, casa: f(lados[0]), fora: f(lados[1]) }))
      .filter((l) => l.casa !== null || l.fora !== null)
      .map((l) => ({ ...l, casa: l.casa === null ? null : String(l.casa), fora: l.fora === null ? null : String(l.fora) }));
  }

  return { autoresDosGols, placarCorrido, intervaloDoJogo, formaRecente, proximoJogo, miniClassificacao, imagemPequena, progressoTemporada, situacaoCorrida, posicaoPorExtenso, estatisticasFutebol };
})();

if (typeof module !== "undefined") module.exports = Visual;
