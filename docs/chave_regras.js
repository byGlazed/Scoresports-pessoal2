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
    futebol: { "knockout-round-playoffs": 8, "round-of-16": 8 },
  };

  const NOMES_FASE = [
    [/knockout-round-playoffs|playoff/i, "Playoff"],
    [/round-of-32|16avos|round of 32/i, "16-avos de final"],
    [/round-of-16|oitavas|round of 16/i, "Oitavas de final"],
    [/quarter|quartas/i, "Quartas de final"],
    [/semi/i, "Semifinal"],
    [/third-place|terceiro/i, "Disputa do 3º lugar"],
    [/^final|finals?$|final de jogo/i, "Final"],
    [/first-stage|first stage|1ª fase/i, "1ª fase"],
    [/second-stage|second stage|2ª fase/i, "2ª fase"],
    [/third-stage|third stage|3ª fase/i, "3ª fase"],
    [/first-round|primeira rodada|1a\s+rodada/i, "1ª rodada"],
    [/second-round|segunda rodada|2a\s+rodada/i, "2ª rodada"],
    [/third-round|3a\s+rodada/i, "3ª rodada"],
    [/fourth-round|4a\s+rodada/i, "4ª rodada"],
    [/fifth-round|5a\s+rodada/i, "5ª rodada"],
  ];

  const SLUG_PELO_NOME = [
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
    const ultimoGrupo = fases.map((f) => f.grupo).lastIndexOf(true);
    const limpa = ({ grupo, ...f }) => f;
    return {
      preliminares: fases.slice(0, Math.max(ultimoGrupo, 0)).filter((f) => !f.grupo).map(limpa),
      eliminatorias: fases.slice(ultimoGrupo + 1).filter((f) => !f.grupo).map(limpa),
    };
  }

  /* ---------- Confrontos ---------- */

  const competicao = (j) => (j.competitions || [{}])[0];
  const estadoDoJogo = (j) => {
    const s = ((competicao(j).status || {}).type || {}).state;
    return s === "in" ? 2 : s === "post" ? 3 : 1;
  };
  const num = (v) => {
    const n = Number(typeof v === "object" && v !== null ? v.value ?? v.displayValue : v);
    return Number.isFinite(n) ? n : null;
  };
  const time = (c) => {
    const t = c.team || {};
    return { id: String(t.id ?? c.id), nome: t.displayName || "", curto: t.shortDisplayName || t.displayName || "", sigla: t.abbreviation || "", logo: t.logo || null };
  };

  /** Os jogos da mesma fase entre os mesmos dois times viram um confronto (ida e volta, série ou jogo único). */
  function confrontos(jogos, faseDe = (j) => (j.season || {}).type) {
    const grupos = new Map();
    for (const j of jogos || []) {
      const cs = competicao(j).competitors || [];
      if (cs.length !== 2) continue;
      const fase = faseDe(j);
      if (fase === null || fase === undefined) continue;
      const ids = cs.map((c) => time(c).id).sort();
      const chave = `${fase}|${ids.join("|")}`;
      if (!grupos.has(chave)) grupos.set(chave, { fase, jogos: [] });
      grupos.get(chave).jogos.push(j);
    }
    return [...grupos.values()].map(({ fase, jogos: lista }) => montarConfronto(fase, lista));
  }

  function montarConfronto(fase, jogos) {
    jogos = [...jogos].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const primeiro = competicao(jogos[0]);
    const ordem = [...primeiro.competitors].sort((a, b) => (a.homeAway === "home" ? -1 : 0) - (b.homeAway === "home" ? -1 : 0));
    const lados = ordem.map((c) => ({ ...time(c), placar: 0, vitorias: 0, penaltis: null, passou: false }));
    const lado = (c) => lados.find((l) => l.id === time(c).id);
    let comPlacar = false;
    let serie = null;
    for (const j of jogos) {
      const comp = competicao(j);
      if (comp.series) serie = comp.series;
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
    const americano = serie && serie.type === "playoff";

    // quem passou: o confronto inteiro (agregado ou série) pela ESPN; senão, o jogo único encerrado
    let passouId = null;
    if (serie && serie.completed) {
      const venc = (serie.competitors || []).filter((c) => c.winner);
      if (venc.length === 1) passouId = String(venc[0].id);
      else if (americano) {
        const ultimo = competicao(jogos[jogos.length - 1]).competitors.find((c) => c.winner);
        if (ultimo) passouId = time(ultimo).id;
      }
    } else if (jogos.length === 1 && estados[0] === 3) {
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
    const porFase = fases.map((f) => (lista || []).filter((c) => c.fase === f.type).sort((a, b) => (a.primeiraData || "").localeCompare(b.primeiraData || "")));

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
      return { fase, nome: fase.nome, confrontos: confrontosDaColuna, alimenta: confrontosDaColuna.map(() => []) };
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

  /** A primeira coluna com até 16 confrontos: as anteriores ficam na lista simples acima da chave. */
  function colunaInicial(colunas) {
    const i = colunas.findIndex((c) => c.confrontos.length <= 16);
    return i < 0 ? colunas.length - 1 : i;
  }

  return {
    COM_CHAVE,
    FORMATOS,
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
