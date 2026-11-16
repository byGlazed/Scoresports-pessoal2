"use strict";

/* Regras puras da chave (mata-mata e playoffs), sem DOM: tudo no objeto Chave.
   Recebem os jogos no formato do scoreboard da ESPN e devolvem colunas, confrontos e posições.
   Testadas no Node (testes/chave.test.js) com jogos reais guardados em testes/amostras/. */

const Chave = (() => {
  const COMPETICOES_FUTEBOL = [
    "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana", "uefa.champions", "uefa.europa",
    "esp.copa_del_rey", "esp.super_cup", "eng.fa", "eng.league_cup", "eng.charity", "ger.dfb_pokal", "ger.super_cup",
    "ita.coppa_italia", "ita.super_cup", "fra.coupe_de_france", "fra.super_cup", "por.taca.portugal", "ned.cup",
    "bra.supercopa_do_brazil", "conmebol.recopa", "uefa.super_cup", "fifa.cwc", "fifa.world", "conmebol.america",
    "uefa.euro", "uefa.nations", "usa.1",
  ];
  const AMERICANOS = ["nba", "nfl", "mlb", "nhl"];
  const COM_CHAVE = { futebol: COMPETICOES_FUTEBOL, nba: ["nba"], nfl: ["nfl"], mlb: ["mlb"], nhl: ["nhl"] };

  // quantos confrontos tem cada fase quando ela não corta a anterior pela metade
  const FORMATOS = {
    futebol: { "knockout-round-playoffs": 8, "round-of-32": 16, "round-of-16": 8 },
    // na FA Cup os clubes da Premier League entram na 3ª rodada: 64 times
    "eng.fa": { "third-round": 32, "fourth-round": 16, "fifth-round": 8 },
    nba: { 1: 8, 2: 4, 3: 2, 4: 1 },
    nhl: { 1: 8, 2: 4, 3: 2, 4: 1 },
    nfl: { 1: 6, 2: 4, 3: 2, 4: 1 },
    mlb: { 1: 4, 2: 4, 3: 2, 4: 1 },
    mls: { 0: 2, 1: 8, 2: 4, 3: 2, 4: 1 },
  };

  // nome de cada fase dos playoffs (a ordem 0 é o Wild Card da MLS)
  const NOMES_PLAYOFFS = {
    nba: { 1: "1ª rodada", 2: "Semifinais de conferência", 3: "Finais de conferência", 4: "Finais da NBA" },
    nhl: { 1: "1ª rodada", 2: "2ª rodada", 3: "Finais de conferência", 4: "Final da Stanley Cup" },
    nfl: { 1: "Wild Card", 2: "Divisional", 3: "Finais de conferência", 4: "Super Bowl" },
    mlb: { 1: "Wild Card", 2: "Division Series", 3: "Championship Series", 4: "World Series" },
    mls: { 0: "Wild Card", 1: "1ª rodada", 2: "Semifinais de conferência", 3: "Finais de conferência", 4: "MLS Cup" },
  };

  // padrões da nota (ou do slug, na MLS) para a ordem da fase, do mais específico para o mais geral
  const PADROES_PLAYOFFS = {
    nba: [[/NBA Finals|Finais da NBA/i, 4], [/(East|West|Leste|Oeste)\s+Finals?|Finais? d[ae] conferência/i, 3], [/Semifinals|Semifinais|2ª rodada|2nd Round/i, 2], [/1ª rodada|1st Round/i, 1]],
    nhl: [[/Stanley Cup Final/i, 4], [/(East|West|Leste|Oeste)\s+Finals?|Finais? d[ae] conferência/i, 3], [/2ª rodada|2nd Round|Semifinals/i, 2], [/1ª rodada|1st Round/i, 1]],
    nfl: [[/Super Bowl/i, 4], [/Championship/i, 3], [/Divisional/i, 2], [/Wild Card/i, 1]],
    mlb: [[/World Series/i, 4], [/\b(AL|NL)CS\b/i, 3], [/\b(AL|NL)DS\b/i, 2], [/\b(AL|NL)WC\b|Wild Card/i, 1]],
    mls: [[/mls-cup|MLS Cup/i, 4], [/---final$|conference-final|Conference.*Final$/i, 3], [/semifinal/i, 2], [/round-one|Round One/i, 1], [/wild-card|Wild Card/i, 0]],
  };
  const FORA_DOS_PLAYOFFS = /Pro Bowl|Play-In|NBA Cup|All-Star/i;

  const NOMES_FASE = [
    [/knockout-round-playoffs|playoff/i, "Playoff"],
    [/round-of-32|16avos|round of 32/i, "16-avos de final"],
    [/round-of-16|oitavas|round of 16/i, "Oitavas de final"],
    [/quarter|quartas/i, "Quartas de final"],
    [/semi/i, "Semifinal"],
    [/third-place|3rd-place|3rd place|terceiro/i, "Disputa do 3º lugar"],
    [/^final|finals?$|final de jogo/i, "Final"],
    [/first-stage|first stage|1ª fase/i, "1ª fase"],
    [/second-stage|second stage|2ª fase/i, "2ª fase"],
    [/third-stage|third stage|3ª fase/i, "3ª fase"],
    [/first[- ]round|primeira rodada|1a\s+rodada/i, "1ª rodada"],
    [/second[- ]round|segunda rodada|2a\s+rodada/i, "2ª rodada"],
    [/third[- ]round|3a\s+rodada/i, "3ª rodada"],
    [/fourth[- ]round|4a\s+rodada/i, "4ª rodada"],
    [/fifth[- ]round|5a\s+rodada/i, "5ª rodada"],
  ];

  const SLUG_PELO_NOME = [
    [/3rd[- ]place|third[- ]place|terceiro/i, "3rd-place-match"],
    [/round of 32|16-?avos/i, "round-of-32"],
    [/first[- ]round|primeira rodada|1a\s+rodada/i, "first-round"],
    [/second[- ]round|segunda rodada|2a\s+rodada/i, "second-round"],
    [/third[- ]round|3a\s+rodada/i, "third-round"],
    [/fourth[- ]round|4a\s+rodada/i, "fourth-round"],
    [/fifth[- ]round|5a\s+rodada/i, "fifth-round"],
    [/playoff/i, "knockout-round-playoffs"],
    [/oitavas|round of 16/i, "round-of-16"],
    [/quartas|quarter/i, "quarterfinals"],
    [/semi/i, "semifinals"],
    [/final/i, "final"],
  ];

  const ehGrupo = (tipo) => /group|grupo|league phase|fase de liga/i.test(`${tipo.name || ""} ${tipo.abbreviation || ""} ${tipo.slug || ""}`);

  function nomeDaFase(slug, nome) {
    for (const [padrao, pt] of NOMES_FASE) if (padrao.test(slug || "")) return pt;
    for (const [padrao, pt] of NOMES_FASE) if (padrao.test(nome || "")) return pt;
    return nome || slug || "";
  }

  /** O formato das fases que não cortam pela metade, juntando o geral do futebol e o da competição. */
  function formatoDe(liga) {
    return { ...FORMATOS.futebol, ...(FORMATOS[liga] || {}) };
  }

  function temChave(esporte, liga) {
    return (COM_CHAVE[esporte] || []).includes(liga);
  }

  function nomeDaAba(esporte, liga) {
    return AMERICANOS.includes(esporte) || liga === "usa.1" ? "Playoffs" : "Mata-mata";
  }

  /** As fases da temporada em ordem, com o slug (dos jogos ou, sem jogo ainda, pelo nome) e o nome em português. */
  function fasesDoFutebol(tipos, jogos) {
    const slugDoTipo = {};
    for (const j of jogos || []) {
      const s = j.season || {};
      if (s.type !== undefined && s.slug) slugDoTipo[s.type] = s.slug;
    }
    const fases = [...(tipos || [])]
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
      .map((t) => {
        let slug = slugDoTipo[t.type];
        if (!slug) slug = (SLUG_PELO_NOME.find(([p]) => p.test(t.name || "")) || [])[1] || null;
        return { type: t.type, slug, nome: nomeDaFase(slug, t.name), inicio: t.startDate || null, fim: t.endDate || null, grupo: ehGrupo({ ...t, slug }) };
      });
    // a disputa do 3º lugar não é uma fase da chave: fica à parte (embaixo da chave)
    const ehTerceiro = (f) => /3rd-place|third-place/i.test(f.slug || "") || /3rd[- ]place|third[- ]place|terceiro/i.test(f.nome || "");
    const terceiro = fases.find(ehTerceiro) || null;
    const semTerceiro = fases.filter((f) => !ehTerceiro(f));
    const ultimoGrupo = semTerceiro.map((f) => f.grupo).lastIndexOf(true);
    const limpa = ({ grupo, ...f }) => f;
    return {
      preliminares: semTerceiro.slice(0, Math.max(ultimoGrupo, 0)).filter((f) => !f.grupo).map(limpa),
      eliminatorias: semTerceiro.slice(ultimoGrupo + 1).filter((f) => !f.grupo).map(limpa),
      terceiro: terceiro ? { ...limpa(terceiro), nome: "Disputa do 3º lugar" } : null,
    };
  }

  /* ---------- Confrontos ---------- */

  const competicao = (j) => (j.competitions || [{}])[0];
  const estadoDoJogo = (j) => {
    const tipo = (competicao(j).status || {}).type || {};
    if (tipo.state === "in") return 2;
    // "post" com completed false é adiado ou cancelado: não foi jogado
    return tipo.state === "post" && tipo.completed !== false ? 3 : 1;
  };
  const adiadoOuCancelado = (j) => {
    const tipo = (competicao(j).status || {}).type || {};
    return /POSTPONED|CANCELED|CANCELLED|SUSPENDED/i.test(tipo.name || "") || (tipo.state === "post" && tipo.completed === false);
  };
  const num = (v) => {
    const n = Number(typeof v === "object" && v !== null ? v.value ?? v.displayValue : v);
    return Number.isFinite(n) ? n : null;
  };
  const time = (c) => {
    const t = c.team || {};
    const id = String(t.id ?? c.id);
    // vaga ainda sem time (a ESPN escreve "TBD Away", "TBD Home")
    if (/^TBD\b/i.test(t.displayName || "")) return { id: `tbd:${id}`, nome: "A definir", curto: "A definir", sigla: "", logo: null, aDefinir: true };
    return { id, nome: t.displayName || "", curto: t.shortDisplayName || t.displayName || "", sigla: t.abbreviation || "", logo: t.logo || null };
  };

  /** Os jogos da mesma fase entre os mesmos dois times viram um confronto (ida e volta, série ou jogo único). */
  function confrontos(jogos, faseDe = (j) => (j.season || {}).type, opcoes = {}) {
    const grupos = new Map();
    for (const j of jogos || []) {
      const cs = competicao(j).competitors || [];
      if (cs.length !== 2) continue;
      const fase = faseDe(j);
      if (fase === null || fase === undefined || adiadoOuCancelado(j)) continue;
      // a vaga "TBD" pode vir com um id diferente em cada jogo da mesma série: conta como um lado só;
      // mas dois lados "TBD" são jogos diferentes (cada um é um confronto)
      const tbds = cs.filter((c) => time(c).aDefinir).length;
      const ids = cs.map((c) => (time(c).aDefinir ? "tbd" : time(c).id)).sort();
      const grupo = opcoes.grupoDe ? opcoes.grupoDe(j) || "" : "";
      const chave = tbds === 2 ? `${fase}|jogo:${j.id}` : `${fase}|${grupo}|${ids.join("|")}`;
      if (!grupos.has(chave)) grupos.set(chave, { fase, jogos: [] });
      grupos.get(chave).jogos.push(j);
    }
    return [...grupos.values()].map(({ fase, jogos: lista }) => {
      const c = montarConfronto(fase, lista, opcoes);
      if (opcoes.grupoDe) c.conferencia = opcoes.grupoDe(lista[0]) || null;
      return c;
    });
  }

  function montarConfronto(fase, jogos, opcoes = {}) {
    jogos = [...jogos].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const primeiro = competicao(jogos[0]);
    const ordem = [...primeiro.competitors].sort((a, b) => (a.homeAway === "home" ? -1 : 0) - (b.homeAway === "home" ? -1 : 0));
    const lados = ordem.map((c) => ({ ...time(c), placar: 0, vitorias: 0, penaltis: null, passou: false }));
    const lado = (c) => {
      const t = time(c);
      return lados.find((l) => l.id === t.id) || (t.aDefinir ? lados.find((l) => l.aDefinir) : undefined);
    };
    let comPlacar = false;
    let serie = null;
    for (const j of jogos) {
      const comp = competicao(j);
      // a ESPN às vezes pendura num jogo a série de outra competição entre os mesmos times (Copa NBA x Finais)
      if (comp.series && !opcoes.ignorarSerie) serie = comp.series;
      const encerrado = estadoDoJogo(j) === 3;
      for (const c of comp.competitors || []) {
        const l = lado(c);
        if (!l) continue;
        const gols = num(c.score);
        if (gols !== null && estadoDoJogo(j) !== 1) {
          l.placar += gols;
          comPlacar = true;
        }
        if (encerrado && c.winner) l.vitorias += 1;
        const pen = num(c.shootoutScore);
        if (pen !== null && encerrado) l.penaltis = pen;
      }
    }
    const estados = jogos.map(estadoDoJogo);
    // série de verdade (melhor de N): o placar é de vitórias; jogo único (Copa NBA, NFL) mostra o placar do jogo
    const serieOpcao = typeof opcoes.serie === "function" ? opcoes.serie(fase) : opcoes.serie;
    const americano = (serie && serie.type === "playoff" && (serie.totalCompetitions || 0) > 1) || Boolean(serieOpcao);
    // série melhor de N sem o resumo da ESPN (1ª rodada da MLS): passa quem chegou às vitórias
    const precisa = opcoes.vitoriasPara ? opcoes.vitoriasPara(fase) : null;

    // quem passou: o confronto inteiro (agregado ou série) pela ESPN; senão, o jogo único encerrado
    let passouId = null;
    if (serie && serie.completed) {
      const venc = (serie.competitors || []).filter((c) => c.winner);
      if (venc.length === 1) passouId = String(venc[0].id);
      else if (americano) {
        const ultimo = competicao(jogos[jogos.length - 1]).competitors.find((c) => c.winner);
        if (ultimo) passouId = time(ultimo).id;
      }
    } else if (precisa && lados.some((l) => l.vitorias >= precisa)) {
      passouId = lados.find((l) => l.vitorias >= precisa).id;
    } else if (jogos.length === 1 && estados[0] === 3 && (!serie || (serie.totalCompetitions || 1) <= 1)) {
      const venc = primeiro.competitors.find((c) => c.winner);
      if (venc) passouId = time(venc).id;
    }
    for (const l of lados) l.passou = passouId !== null && l.id === passouId;
    if (americano) for (const l of lados) l.placar = l.vitorias;

    const acabou = passouId !== null;
    const estado = estados.includes(2) ? 2 : acabou || (estados.every((e) => e === 3) && !serie) ? 3 : 1;

    // o texto pequeno embaixo do cartão
    const [a, b] = acabou ? [...lados].sort((x, y) => (y.passou ? 1 : 0) - (x.passou ? 1 : 0)) : lados;
    let resumo = null;
    // a ESPN manda shootoutScore 0 mesmo sem pênaltis: só conta quando alguém converteu
    if (a.penaltis !== null && b.penaltis !== null && a.penaltis + b.penaltis > 0) resumo = `pên. ${a.penaltis}-${b.penaltis}`;
    else if (americano && (a.vitorias || b.vitorias)) resumo = `${a.vitorias}-${b.vitorias} na série`;
    else if (jogos.length > 1 && comPlacar) resumo = `agregado ${a.placar}-${b.placar}`;

    return {
      id: `${fase}:${lados.map((l) => l.id).sort().join("-")}`,
      fase,
      lados: lados.map(({ vitorias, penaltis, ...l }) => l),
      jogos: jogos.map((j) => String(j.id)),
      estado,
      resumo,
      primeiraData: jogos[0].date || null,
    };
  }

  /* ---------- Colunas ---------- */

  const timesQuePodemSair = (c) => (c.lados.some((l) => l.passou) ? c.lados.filter((l) => l.passou) : c.lados).map((l) => l.id);

  /**
   * As colunas da chave, uma por fase. A ordem vem de trás para a frente: a final ordena a semifinal
   * (os confrontos de onde vieram seus lados), e assim por diante. Vagas (null) completam as fases futuras.
   */
  function montar({ fases, confrontos: lista, formato = {} }) {
    // em cada fase: por conferência (Leste antes de Oeste), depois pela data do primeiro jogo
    const porFase = fases.map((f) =>
      (lista || [])
        .filter((c) => c.fase === f.type)
        .sort((a, b) => (a.conferencia || "").localeCompare(b.conferencia || "") || (a.primeiraData || "").localeCompare(b.primeiraData || ""))
    );

    // quantidade de cada coluna: o formato conhecido, senão metade da anterior
    const tamanhos = [];
    fases.forEach((f, k) => {
      const real = porFase[k].length;
      const esperado = formato[f.slug] ?? (k === 0 ? real : Math.ceil(tamanhos[k - 1] / 2));
      tamanhos.push(Math.max(real, esperado || 0));
    });

    // de trás para a frente: cada fase em ordem dos confrontos da seguinte
    const ordenadas = porFase.map((c) => c.slice());
    for (let k = fases.length - 2; k >= 0; k--) {
      const seguinte = ordenadas[k + 1];
      const restantes = ordenadas[k].slice();
      const nova = [];
      for (const c of seguinte) {
        if (!c) continue;
        for (const lado of c.lados) {
          const i = restantes.findIndex((f) => timesQuePodemSair(f).includes(lado.id));
          if (i >= 0) nova.push(restantes.splice(i, 1)[0]);
        }
      }
      ordenadas[k] = nova.concat(restantes);
    }

    const colunas = fases.map((fase, k) => {
      const confrontosDaColuna = ordenadas[k].slice();
      while (confrontosDaColuna.length < tamanhos[k]) confrontosDaColuna.push(null);
      // ligado: a linha só é desenhada quando o confronto existe (com vaga, ninguém sabe quem enfrenta quem)
      return { fase, nome: fase.nome, confrontos: confrontosDaColuna, alimenta: confrontosDaColuna.map(() => []), ligado: confrontosDaColuna.map((c) => Boolean(c)) };
    });

    // quem alimenta quem: confrontos reais pelos times; vagas pelos que sobraram, de dois em dois (ou um a um)
    for (let k = 1; k < colunas.length; k++) {
      const anterior = colunas[k - 1].confrontos;
      const usados = new Set();
      colunas[k].confrontos.forEach((c, i) => {
        if (!c) return;
        for (const lado of c.lados) {
          const j = anterior.findIndex((f, idx) => f && !usados.has(idx) && timesQuePodemSair(f).includes(lado.id));
          if (j >= 0) {
            usados.add(j);
            colunas[k].alimenta[i].push(j);
          }
        }
      });
      const livres = anterior.map((_, idx) => idx).filter((idx) => !usados.has(idx));
      const porVaga = colunas[k].confrontos.length * 2 <= anterior.length + 1 ? 2 : 1;
      colunas[k].confrontos.forEach((c, i) => {
        if (c) return;
        colunas[k].alimenta[i] = livres.splice(0, porVaga);
      });
    }
    return colunas;
  }

  /** A posição vertical de cada confronto: no meio dos que o alimentam; sem alimentador, logo abaixo do último. */
  function posicoes(colunas) {
    const pos = [];
    colunas.forEach((col, k) => {
      const ys = [];
      let ultimo = -1;
      col.confrontos.forEach((_, i) => {
        const feeders = k === 0 ? [] : col.alimenta[i];
        let y;
        if (k === 0) y = i;
        else if (feeders.length) y = feeders.reduce((s, j) => s + pos[k - 1][j], 0) / feeders.length;
        else y = ultimo + 1;
        if (y <= ultimo) y = ultimo + 1;
        ys.push(y);
        ultimo = y;
      });
      pos.push(ys);
    });
    return pos;
  }

  /**
   * Onde a chave começa: a primeira coluna a partir da qual todas têm até 16 confrontos e
   * nenhuma cresce em relação à anterior (crescer = times novos entrando, como os grandes na Copa do Brasil).
   * As colunas antes dela ficam na lista simples acima da chave.
   */
  function colunaInicial(colunas) {
    const n = colunas.map((c) => c.confrontos.length);
    let inicio = 0;
    n.forEach((qtd, i) => {
      if (qtd > 16 || (i > 0 && qtd > n[i - 1])) inicio = qtd > 16 ? i + 1 : i;
    });
    return Math.min(inicio, Math.max(colunas.length - 1, 0));
  }

  /* ---------- Playoffs americanos ---------- */

  /** A fase dos playoffs pela nota do jogo (ou pelo slug, na MLS); null para o que não é playoff. */
  function faseAmericana(esporte, nota, slug) {
    const texto = esporte === "mls" ? `${slug || ""} ${nota || ""}` : nota || "";
    if (!texto.trim() || FORA_DOS_PLAYOFFS.test(texto)) return null;
    for (const [padrao, ordem] of PADROES_PLAYOFFS[esporte] || []) {
      if (padrao.test(texto)) {
        const conf = /Leste|East|eastern|AFC|\bAL/i.test(texto) ? (/AFC/.test(texto) ? "AFC" : /\bAL/.test(texto) ? "AL" : "Leste")
          : /Oeste|West|western|NFC|\bNL/i.test(texto) ? (/NFC/.test(texto) ? "NFC" : /\bNL/.test(texto) ? "NL" : "Oeste") : null;
        return { ordem, nome: NOMES_PLAYOFFS[esporte][ordem], conferencia: ordem === 4 ? null : conf };
      }
    }
    return null;
  }

  const notaDe = (j) => ((competicao(j).notes || [])[0] || {}).headline || null;

  /** A chave dos playoffs (NBA, NFL, MLB, NHL, MLS) e, na NBA, os jogos do Play-In à parte. */
  function playoffs(esporte, jogos) {
    const ehPlayIn = (j) => esporte === "nba" && (j.season || {}).type === 5;
    const playIn = confrontos((jogos || []).filter(ehPlayIn), () => "play-in", { serie: false });
    const faseDe = (j) => {
      if (ehPlayIn(j)) return null;
      const f = faseAmericana(esporte, notaDe(j), (j.season || {}).slug);
      return f ? f.ordem : null;
    };
    const lista = confrontos(jogos, faseDe, {
      // na MLS só a 1ª rodada é série (melhor de 3); o resto é jogo único
      serie: esporte === "mls" ? (ordem) => ordem === 1 : undefined,
      vitoriasPara: esporte === "mls" ? (ordem) => (ordem === 1 ? 2 : null) : null,
      grupoDe: (j) => {
        const f = faseAmericana(esporte, notaDe(j), (j.season || {}).slug);
        return f ? f.conferencia : null;
      },
    });
    const formato = FORMATOS[esporte] || {};
    const fases = Object.keys(formato)
      .map(Number)
      .sort((a, b) => a - b)
      .map((ordem) => ({ type: ordem, slug: String(ordem), nome: NOMES_PLAYOFFS[esporte][ordem] }));
    return { playIn, colunas: montar({ fases, confrontos: lista, formato }) };
  }

  /* ---------- Copa NBA ---------- */

  const FASES_COPA_NBA = [
    [/Championship|Final$/i, 3, "Final"],
    [/Semifinal/i, 2, "Semifinal"],
    [/Quarterfinal|Quartas/i, 1, "Quartas de final"],
  ];

  /**
   * A Copa NBA: os grupos saem dos confrontos da fase de grupos (cada time só enfrenta os do próprio grupo),
   * com V-D, saldo e pontos; e a chave das quartas até a final.
   */
  function copaNba(jogos, conferenciaDe = () => null) {
    const daCopa = (jogos || []).filter((j) => /NBA Cup/i.test(notaDe(j) || ""));
    const deGrupo = daCopa.filter((j) => /Group/i.test(notaDe(j) || ""));

    // grupos: componentes conexos dos confrontos
    const pai = {};
    const raiz = (x) => (pai[x] === x ? x : (pai[x] = raiz(pai[x])));
    const times = {};
    for (const j of deGrupo) {
      const ids = (competicao(j).competitors || []).map((c) => {
        const t = time(c);
        times[t.id] = t;
        if (!(t.id in pai)) pai[t.id] = t.id;
        return t.id;
      });
      if (ids.length === 2) pai[raiz(ids[0])] = raiz(ids[1]);
    }
    const porRaiz = {};
    for (const id of Object.keys(pai)) (porRaiz[raiz(id)] = porRaiz[raiz(id)] || []).push(id);

    const linhaDe = {};
    for (const id of Object.keys(times)) linhaDe[id] = { time: times[id], v: 0, d: 0, saldo: 0, pontos: 0 };
    for (const j of deGrupo) {
      if (estadoDoJogo(j) !== 3) continue;
      const cs = competicao(j).competitors || [];
      if (cs.length !== 2) continue;
      const [a, b] = cs.map((c) => ({ id: time(c).id, pts: num(c.score) || 0, venceu: Boolean(c.winner) }));
      for (const [x, y] of [[a, b], [b, a]]) {
        const l = linhaDe[x.id];
        l.pontos += x.pts;
        l.saldo += x.pts - y.pts;
        if (x.venceu) l.v += 1;
        else l.d += 1;
      }
    }
    const menor = (ids) => Math.min(...ids.map(Number).filter(Number.isFinite));
    let grupos = Object.values(porRaiz).map((ids) => {
      const confs = ids.map((id) => conferenciaDe(id)).filter(Boolean);
      const conferencia = confs.length ? confs.sort((x, y) => confs.filter((c) => c === y).length - confs.filter((c) => c === x).length)[0] : null;
      const linhas = ids.map((id) => linhaDe[id]).sort((x, y) => y.v - x.v || y.saldo - x.saldo || y.pontos - x.pontos);
      return { conferencia, menor: menor(ids), linhas };
    });
    grupos.sort((x, y) => (x.conferencia || "~").localeCompare(y.conferencia || "~") || x.menor - y.menor);
    const letras = {};
    grupos = grupos.map((g, i) => {
      let nome;
      if (g.conferencia) {
        letras[g.conferencia] = (letras[g.conferencia] || 0) + 1;
        nome = `${g.conferencia} ${String.fromCharCode(64 + letras[g.conferencia])}`;
      } else {
        nome = `Grupo ${i + 1}`;
      }
      return { nome, conferencia: g.conferencia, linhas: g.linhas };
    });

    // a chave: quartas, semifinal e final
    const faseDe = (j) => {
      const n = notaDe(j) || "";
      if (/Group/i.test(n)) return null;
      const f = FASES_COPA_NBA.find(([p]) => p.test(n));
      return f ? f[1] : null;
    };
    const fases = [...FASES_COPA_NBA].reverse().map(([, ordem, nome]) => ({ type: ordem, slug: String(ordem), nome }));
    const colunas = montar({ fases, confrontos: confrontos(daCopa, faseDe, { ignorarSerie: true }), formato: { 1: 4, 2: 2, 3: 1 } });
    return { grupos, colunas };
  }

  return {
    copaNba,
    faseAmericana,
    playoffs,
    COM_CHAVE,
    FORMATOS,
    formatoDe,
    temChave,
    nomeDaAba,
    nomeDaFase,
    fasesDoFutebol,
    confrontos,
    montar,
    posicoes,
    colunaInicial,
  };
})();

if (typeof module !== "undefined") module.exports = Chave;
