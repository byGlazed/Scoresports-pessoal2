"use strict";

/* Regras puras dos e-sports (PandaScore, plano grátis), sem DOM: tudo no objeto Esports.
   Traduzem as partidas da PandaScore para o formato do app, filtram as do dia (torneios grandes,
   times brasileiros e favoritos), agrupam por torneio e montam as bolinhas do "Melhor de N".
   O plano grátis não traz o nome do mapa, o placar de rounds nem o KDA: o que não vem não aparece.
   Testadas no Node (testes/esports.test.js) com respostas reais em testes/amostras/pandascore_*.json. */

const Esports = (() => {
  const JOGOS = [
    { id: "cs2", nome: "Counter-Strike 2", sigla: "CS2", caminho: "csgo", slug: "cs-go" },
    { id: "valorant", nome: "Valorant", sigla: "VAL", caminho: "valorant", slug: "valorant" },
    { id: "lol", nome: "League of Legends", sigla: "LoL", caminho: "lol", slug: "league-of-legends" },
  ];
  const TIERS_GRANDES = ["s", "a"];
  const A_DEFINIR = () => ({ id: null, nome: "A definir" });

  const jogoDoSlug = (slug) => JOGOS.find((j) => j.slug === slug) || null;
  const jogoDoId = (id) => JOGOS.find((j) => j.id === id) || null;

  /** O dia de Brasília (UTC-3, sem horário de verão) em UTC, para o range[begin_at] da PandaScore. */
  function intervaloDoDia(ymd) {
    const [a, m, d] = ymd.split("-").map(Number);
    const inicio = new Date(Date.UTC(a, m - 1, d, 3, 0, 0));
    const fim = new Date(inicio.getTime() + 86400000 - 1000);
    const iso = (x) => x.toISOString().replace(".000Z", "Z");
    return [iso(inicio), iso(fim)];
  }

  function lado(o) {
    const t = (o && o.opponent) || null;
    if (!t || t.id === undefined || t.id === null) return A_DEFINIR();
    return { id: t.id, nome: t.name || "A definir", sigla: t.acronym || null, logo: t.image_url || null, pais: t.location || null };
  }

  function estadoDe(m) {
    if (m.status === "running") return [2, "Ao vivo"];
    if (m.forfeit && (m.winner_id !== null && m.winner_id !== undefined)) return [3, "W.O."];
    if (m.status === "canceled") return [3, "Cancelada"];
    if (m.status === "postponed") return [3, "Adiada"];
    if (m.status === "finished") return [3, "Encerrado"];
    return [1, "A jogar"];
  }

  function mapas(m, lados, estado) {
    const jogos = [...(m.games || [])].sort((a, b) => a.position - b.position);
    // nada de mapa em partida cancelada ou por W.O.; numa partida encerrada, só os mapas jogados
    if (m.status === "canceled" || m.status === "postponed" || m.forfeit) return [];
    return jogos
      .filter((g) => !(estado === 3 && g.status === "not_started"))
      .map((g) => {
        const vencedorId = ((g.winner || {}).id ?? null);
        const vencedor = vencedorId === null ? null : vencedorId === lados[0].id ? 0 : vencedorId === lados[1].id ? 1 : null;
        return {
          numero: g.position,
          nome: null, // o plano grátis não diz qual foi o mapa
          vencedor,
          duracao_min: g.length ? Math.round(g.length / 60) : null,
          estado: g.status === "finished" || g.finished ? 3 : g.status === "running" ? 2 : 1,
          inicio: g.begin_at || null,
        };
      });
  }

  /** A partida da PandaScore no formato do app. */
  function partida(m, jogoId) {
    const jogo = jogoId || (jogoDoSlug((m.videogame || {}).slug) || {}).id || null;
    const lados = [lado((m.opponents || [])[0]), lado((m.opponents || [])[1])];
    const [estado, status] = estadoDe(m);
    const placarDe = (l) => {
      if (l.id === null) return null;
      const r = (m.results || []).find((x) => x.team_id === l.id);
      return r ? r.score : null;
    };
    const t = m.tournament || {};
    const liga = m.league || {};
    const serie = m.serie || {};
    return {
      id: m.id,
      jogo,
      nome: m.name || null,
      inicio: m.begin_at || m.scheduled_at || null,
      estado,
      status,
      melhor_de: m.number_of_games || null,
      tipo: m.match_type || null, // best_of; all_games_played (MD2 pode empatar); first_to...
      torneio: { id: t.id ?? null, nome: t.name || null, tier: t.tier || null, liga: liga.name || null, serie: serie.full_name || serie.name || null, logo: liga.image_url || null },
      lados,
      placar: [placarDe(lados[0]), placarDe(lados[1])],
      vencedor: m.winner_id === null || m.winner_id === undefined ? null : m.winner_id === lados[0].id ? 0 : m.winner_id === lados[1].id ? 1 : null,
      mapas: mapas(m, lados, estado),
      transmissoes: transmissoes(m.streams_list),
    };
  }

  /** Entra na lista do dia: torneio grande (S ou A), time brasileiro ou time favorito. */
  function entraNoDia(p, favoritos) {
    if (TIERS_GRANDES.includes(p.torneio.tier)) return true;
    return p.lados.some((l) => l.id !== null && (l.pais === "BR" || (favoritos && favoritos.has(String(l.id)))));
  }

  /** Uma lista por torneio, os ao vivo primeiro, depois pela hora da primeira partida. */
  function grupos(partidas) {
    const porChave = new Map();
    for (const p of partidas) {
      const chave = `${p.jogo}:${p.torneio.id}`;
      if (!porChave.has(chave)) {
        const jogo = jogoDoId(p.jogo);
        const partes = [jogo ? jogo.sigla : null, p.torneio.liga, p.torneio.nome].filter(Boolean);
        const titulo = partes.filter((x, i) => partes.indexOf(x) === i).join(" · ");
        porChave.set(chave, { chave, jogo: p.jogo, titulo, torneioId: p.torneio.id, aoVivo: false, partidas: [] });
      }
      porChave.get(chave).partidas.push(p);
    }
    const hora = (p) => (p.inicio ? Date.parse(p.inicio) : Infinity);
    const lista = [...porChave.values()];
    for (const g of lista) {
      g.partidas.sort((a, b) => hora(a) - hora(b));
      g.aoVivo = g.partidas.some((p) => p.estado === 2);
    }
    return lista.sort((a, b) => (b.aoVivo ? 1 : 0) - (a.aoVivo ? 1 : 0) || hora(a.partidas[0]) - hora(b.partidas[0]));
  }

  /** As bolinhas do "Melhor de N": quantos mapas cada lado precisa vencer, cheias as que venceu. */
  function bolinhas(p) {
    if (!p.melhor_de || ["Cancelada", "Adiada", "W.O."].includes(p.status)) return null;
    // só no "melhor de N": numa MD2 (todos os mapas jogados) os dois podem vencer um mapa
    if (p.tipo && p.tipo !== "best_of") return null;
    const precisa = Math.ceil(p.melhor_de / 2);
    const cheias = (n) => Array.from({ length: precisa }, (_, i) => i < (Number(n) || 0));
    return { esquerda: cheias(p.placar[0]), direita: cheias(p.placar[1]) };
  }

  /** Onde assistir: as em português primeiro, depois a oficial, depois as outras (sem repetir). */
  function transmissoes(lista) {
    const vistas = new Set();
    const itens = [];
    for (const s of lista || []) {
      const url = s && s.raw_url;
      // só links da web: nada de javascript: ou outro esquema vindo dos dados
      if (!url || !/^https?:\/\//i.test(url) || vistas.has(url)) continue;
      vistas.add(url);
      let nome = url;
      try {
        const u = new URL(url);
        nome = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
      } catch (_) {
        /* fica o endereço como veio */
      }
      itens.push({ nome, url, idioma: s.language || null, oficial: Boolean(s.official) });
    }
    const peso = (t) => (String(t.idioma || "").startsWith("pt") ? 0 : t.oficial ? 1 : 2);
    return itens.map((t, i) => ({ t, i })).sort((a, b) => peso(a.t) - peso(b.t) || a.i - b.i).map(({ t }) => ({ nome: t.nome, url: t.url, idioma: t.idioma }));
  }

  /** Encerrada de vez (pode ficar guardada por muito tempo): encerrada, cancelada ou W.O. Adiada ainda volta. */
  function encerradaDeVez(p) {
    return p.estado === 3 && p.status !== "Adiada";
  }

  /** A lista do dia com as partidas ao vivo trocadas pela versão mais nova (de /matches/running), na mesma ordem. */
  function juntarAoVivo(partidas, aoVivo) {
    const novas = new Map((aoVivo || []).map((p) => [p.id, p]));
    return partidas.map((p) => (novas.has(p.id) ? { ...novas.get(p.id), jogo: p.jogo || novas.get(p.id).jogo } : p));
  }

  /** Um jogador do elenco (/teams/{id}). */
  function jogador(p) {
    return {
      id: p.id,
      nick: p.name || "?",
      nome: [p.first_name, p.last_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ") || null,
      foto: p.image_url || null,
      pais: p.nationality || null,
    };
  }

  /** Os jogadores dos dois times em pares (o maior elenco manda; o outro lado fica vazio). */
  function elencoLadoALado(a, b) {
    const n = Math.max((a || []).length, (b || []).length);
    return Array.from({ length: n }, (_, i) => [(a || [])[i] ?? null, (b || [])[i] ?? null]);
  }

  /** Os times da busca da PandaScore (/teams?search[name]=) que são dos três jogos do app. */
  function timesDaBusca(lista) {
    const saida = [];
    for (const t of lista || []) {
      const jogo = jogoDoSlug(((t && t.current_videogame) || {}).slug);
      if (!jogo || !t.name) continue;
      saida.push({ esporte: "esports", liga: jogo.id, id: String(t.id), nome: t.name, descricao: [jogo.nome, t.location].filter(Boolean).join(" · "), imagem: t.image_url || null });
    }
    return saida;
  }

  return { timesDaBusca, JOGOS, jogoDoSlug, jogoDoId, intervaloDoDia, partida, entraNoDia, grupos, bolinhas, transmissoes, jogador, elencoLadoALado, encerradaDeVez, juntarAoVivo };
})();

if (typeof module !== "undefined") module.exports = Esports;
