"use strict";

/* Regras puras da Kings League, sem DOM: tudo no objeto Kings.
   - Os dados vêm de dados/kings.json, que o robô monta com as páginas do kingsleague.pro (robo/kings.py).
   - Estado do jogo, placar (com pênaltis, os "Shootouts"), rodadas em português.
   - Classificação da fase de grupos como o regulamento: cada vitória vale um ponto, inclusive nos
     pênaltis (os gols da disputa não entram no placar), e os jogos do Challenger não contam. Desempate:
     o confronto direto (vitórias, saldo e gols entre os empatados), depois o saldo e os gols no total.
   Testadas no Node (testes/kings.test.js) com os jogos reais da Kings Cup Brazil 2026/27. */

const Kings = (() => {
  const RODADAS = [
    [/^(matchday|round|rodada|jornada)\s*(\d+)/i, (m) => `Rodada ${m[2]}`],
    [/^last chance/i, () => "Última chance"],
    [/^(quarter|quartas)/i, () => "Quartas de final"],
    [/^(semi)/i, () => "Semifinais"],
    [/^(final)$/i, () => "Final"],
    [/^(third|3rd)/i, () => "Disputa de 3º lugar"],
  ];
  const MATA_MATA = /^(quartas|semifinais|final|última chance|disputa)/i;
  const FORA_DA_TABELA = /^(challenger|playoffs?)$/i;

  function rodadaPt(nome) {
    for (const [re, f] of RODADAS) {
      const m = re.exec(String(nome || "").trim());
      if (m) return f(m);
    }
    return nome || "";
  }

  /** A data de Brasília (AAAA-MM-DD) de um horário ISO. */
  const dataBR = (iso) => {
    const t = Date.parse(iso || "");
    return Number.isNaN(t) ? null : new Date(t - 3 * 3600000).toISOString().slice(0, 10);
  };

  const aDefinir = (t) => !t || !t.nome || /^(tbd|winner\b)/i.test(t.nome);

  function lado(comp, id, placar) {
    const t = (comp.times || {})[String(id)] || null;
    const indefinido = aDefinir(t);
    return {
      id: indefinido ? null : String(id),
      nome: indefinido ? "A definir" : t.nome,
      sigla: indefinido ? null : t.sigla || null,
      logo: indefinido ? null : t.logo || null,
      placar,
    };
  }

  /** O jogo no formato do app: estado (1 a jogar, 2 ao vivo, 3 encerrado), status, lados e vencedor (0, 1 ou null). */
  function jogoDoApp(comp, j) {
    const estado = j.status === "ended" ? 3 : j.status ? 2 : 1;
    const placar = j.placar || [null, null];
    const pen = j.penaltis && j.penaltis[0] !== null && j.penaltis[1] !== null ? j.penaltis : null;
    let vencedor = null;
    if (estado === 3 && placar[0] !== null && placar[1] !== null) {
      if (placar[0] !== placar[1]) vencedor = placar[0] > placar[1] ? 0 : 1;
      else if (pen && pen[0] !== pen[1]) vencedor = pen[0] > pen[1] ? 0 : 1;
    }
    const decididoNosPenaltis = estado === 3 && pen && placar[0] === placar[1];
    return {
      id: String(j.id),
      competicao: comp.id,
      competicao_nome: comp.nome,
      rodada: rodadaPt(j.rodada),
      grupo: j.grupo || null,
      inicio: j.inicio,
      data: dataBR(j.inicio),
      estado,
      status: estado === 3 ? (decididoNosPenaltis ? "Fim (pên.)" : "Fim") : estado === 2 ? (j.minuto ? `${j.minuto}'` : "Ao vivo") : null,
      casa: lado(comp, j.casa, estado >= 2 ? placar[0] : null),
      fora: lado(comp, j.fora, estado >= 2 ? placar[1] : null),
      tempos: j.tempos || [],
      penaltis: pen,
      vencedor,
      video: j.video || null,
    };
  }

  /** Os jogos de cada competição numa data de Brasília: [{ competicao, jogos }], só as que têm jogo. */
  function doDia(competicoes, data) {
    return (competicoes || [])
      .map((comp) => ({ competicao: comp, jogos: (comp.jogos || []).map((j) => jogoDoApp(comp, j)).filter((j) => j.data === data) }))
      .filter((g) => g.jogos.length);
  }

  /** O próximo jogo da competição a partir de agora (ou null). */
  function proximoJogo(comp, agoraIso) {
    const agora = Date.parse(agoraIso);
    const j = (comp.jogos || []).filter((x) => x.status !== "ended" && Date.parse(x.inicio) >= agora - 3 * 3600000).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
    return j ? jogoDoApp(comp, j) : null;
  }

  function ordenar(linhas, jogos) {
    const chave = (l) => [l.v, l.sg, l.gp];
    const porVitorias = new Map();
    for (const l of linhas) {
      if (!porVitorias.has(l.v)) porVitorias.set(l.v, []);
      porVitorias.get(l.v).push(l);
    }
    const saida = [];
    for (const v of [...porVitorias.keys()].sort((a, b) => b - a)) {
      const empatados = porVitorias.get(v);
      if (empatados.length === 1) {
        saida.push(empatados[0]);
        continue;
      }
      // confronto direto entre os empatados
      const ids = new Set(empatados.map((l) => l.id));
      const mini = new Map(empatados.map((l) => [l.id, { v: 0, sg: 0, gp: 0 }]));
      for (const j of jogos) {
        if (!ids.has(j.casa.id) || !ids.has(j.fora.id)) continue;
        const [a, b] = [j.casa.placar, j.fora.placar];
        mini.get(j.casa.id).gp += a;
        mini.get(j.fora.id).gp += b;
        mini.get(j.casa.id).sg += a - b;
        mini.get(j.fora.id).sg += b - a;
        if (j.vencedor === 0) mini.get(j.casa.id).v += 1;
        if (j.vencedor === 1) mini.get(j.fora.id).v += 1;
      }
      empatados.sort((x, y) => {
        const mx = mini.get(x.id);
        const my = mini.get(y.id);
        return my.v - mx.v || my.sg - mx.sg || my.gp - mx.gp || y.sg - x.sg || y.gp - x.gp || x.nome.localeCompare(y.nome);
      });
      saida.push(...empatados);
    }
    void chave;
    return saida;
  }

  /** A classificação da fase de grupos: [{ nome: "Grupo A", linhas: [{ id, nome, sigla, logo, j, v, d, vp, gp, gc, sg }] }]. */
  function classificacao(comp) {
    const jogos = (comp.jogos || [])
      .filter((j) => j.status === "ended" && j.grupo && !FORA_DA_TABELA.test(j.grupo) && !MATA_MATA.test(rodadaPt(j.rodada)))
      .map((j) => ({ bruto: j, app: jogoDoApp(comp, j) }))
      .filter(({ app }) => app.casa.id && app.fora.id && app.casa.placar !== null && app.fora.placar !== null);
    const grupos = new Map();
    for (const { bruto, app } of jogos) {
      if (!grupos.has(bruto.grupo)) grupos.set(bruto.grupo, { linhas: new Map(), jogos: [] });
      const g = grupos.get(bruto.grupo);
      g.jogos.push(app);
      for (const [i, t] of [[0, app.casa], [1, app.fora]]) {
        if (!g.linhas.has(t.id)) g.linhas.set(t.id, { id: t.id, nome: t.nome, sigla: t.sigla, logo: t.logo, j: 0, v: 0, vp: 0, d: 0, gp: 0, gc: 0, sg: 0 });
        const l = g.linhas.get(t.id);
        const pro = i === 0 ? app.casa.placar : app.fora.placar;
        const contra = i === 0 ? app.fora.placar : app.casa.placar;
        l.j += 1;
        l.gp += pro;
        l.gc += contra;
        l.sg = l.gp - l.gc;
        if (app.vencedor === i) {
          l.v += 1;
          if (pro === contra) l.vp += 1;
        } else l.d += 1;
      }
    }
    return [...grupos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nome, g]) => ({ nome: /^[A-Z]$/.test(nome) ? `Grupo ${nome}` : nome, linhas: ordenar([...g.linhas.values()], g.jogos) }));
  }

  return { rodadaPt, dataBR, jogoDoApp, doDia, proximoJogo, classificacao };
})();

if (typeof module !== "undefined") module.exports = Kings;
