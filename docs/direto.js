"use strict";

/* =========================================================================
   Modo celular: o app funciona sozinho no navegador, sem o servidor Python.

   Este arquivo faz no próprio celular o que api.py, espn_dados.py, espn_extra.py,
   transmissoes.py, boxe.py e cache.py fazem no PC:
   - pede os dados direto à ESPN (e à Wikipédia, para o boxe);
   - guarda tudo no banco do navegador (IndexedDB), que não se apaga sozinho;
   - responde às mesmas rotas (/e/futebol/bra.1/jogos...), então as telas são as mesmas.

   A NBA, aqui, vem da ESPN (como futebol e NFL), porque os servidores da NBA não aceitam
   pedidos de navegador. Ficam de fora só o mapa de arremessos e as corridas pelo MVP.
   ========================================================================= */

const DIRETO = {
  // Se a ESPN bloquear o acesso direto, configure um repasse (veja o README) e guarde o
  // endereço com: localStorage.setItem("ss:proxy", "https://SEU-REPASSE.workers.dev/?url=")
  proxy: (() => {
    try {
      return (localStorage.getItem("ss:proxy") || "").trim();
    } catch (_) {
      return "";
    }
  })(),
};

const D_FUSO = "America/Sao_Paulo";
const D_IDIOMA = { lang: "pt", region: "br" };
const D_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const D_BASE_CLASS = "https://site.api.espn.com/apis/v2/sports";
const D_BASE_ATLETA = "https://site.web.api.espn.com/apis/common/v3/sports";
const D_CORE = "https://sports.core.api.espn.com/v2/sports";

class ErroESPN extends Error {}

/* ---------- Pedidos ---------- */

function montarUrl(url, params) {
  const u = new URL(String(url).replace(".espn.pvt", ".espn.com").replace("http://", "https://"));
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) u.searchParams.set(k, v);
  }
  return u.toString();
}

async function pedirUrl(url) {
  try {
    return await fetch(url);
  } catch (erro) {
    if (DIRETO.proxy) {
      try {
        return await fetch(DIRETO.proxy + encodeURIComponent(url));
      } catch (_) {
        /* cai no erro abaixo */
      }
    }
    if (!navigator.onLine) throw new ErroESPN("sem internet agora; o app mostra o que já estava guardado no celular");
    throw new ErroESPN("o navegador não conseguiu falar com a ESPN (acesso bloqueado). Configure o repasse explicado no README");
  }
}

async function espnGet(url, params) {
  let r = await pedirUrl(montarUrl(url, { ...D_IDIOMA, ...(params || {}) }));
  if (r.status >= 400 && r.status < 500) r = await pedirUrl(montarUrl(url, params || {}));
  if (!r.ok) throw new ErroESPN(`a ESPN respondeu com erro ${r.status} em ${String(url).split("/sports/").pop()}`);
  try {
    return await r.json();
  } catch (_) {
    throw new ErroESPN("a resposta da ESPN não veio em JSON");
  }
}

async function jsonLocal(caminho) {
  const r = await fetch(caminho, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Não foi possível ler ${caminho}`);
  return r.json();
}

/* ---------- Banco do celular (IndexedDB) ---------- */

const Banco = {
  _db: null,
  _memoria: new Map(),
  abrir() {
    if (!this._db) {
      this._db = new Promise((ok) => {
        try {
          const req = indexedDB.open("scoresports", 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("dados")) db.createObjectStore("dados", { keyPath: "chave" });
            if (!db.objectStoreNames.contains("indice")) db.createObjectStore("indice", { keyPath: "chave" });
          };
          req.onsuccess = () => ok(req.result);
          req.onerror = () => ok(null);
        } catch (_) {
          ok(null);
        }
      });
    }
    return this._db;
  },
  async _transacao(loja, modo, fazer) {
    const db = await this.abrir();
    if (!db) return fazer(null);
    return new Promise((ok) => {
      const tx = db.transaction(loja, modo);
      const resultado = fazer(tx.objectStore(loja));
      tx.oncomplete = () => ok(resultado && resultado.result !== undefined ? resultado.result : resultado);
      tx.onerror = () => ok(null);
      tx.onabort = () => ok(null);
    });
  },
  async ler(loja, chave) {
    const db = await this.abrir();
    if (!db) return this._memoria.get(`${loja}:${chave}`) || null;
    return new Promise((ok) => {
      const req = db.transaction(loja).objectStore(loja).get(chave);
      req.onsuccess = () => ok(req.result || null);
      req.onerror = () => ok(null);
    });
  },
  async gravar(loja, itens) {
    const lista = Array.isArray(itens) ? itens : [itens];
    const db = await this.abrir();
    if (!db) {
      lista.forEach((i) => this._memoria.set(`${loja}:${i.chave}`, i));
      return;
    }
    await this._transacao(loja, "readwrite", (store) => lista.forEach((i) => store.put(i)));
  },
  async todos(loja) {
    const db = await this.abrir();
    if (!db) return [...this._memoria.entries()].filter(([k]) => k.startsWith(`${loja}:`)).map(([, v]) => v);
    return new Promise((ok) => {
      const req = db.transaction(loja).objectStore(loja).getAll();
      req.onsuccess = () => ok(req.result || []);
      req.onerror = () => ok([]);
    });
  },
  async contar(loja) {
    const db = await this.abrir();
    if (!db) return 0;
    return new Promise((ok) => {
      const req = db.transaction(loja).objectStore(loja).count();
      req.onsuccess = () => ok(req.result || 0);
      req.onerror = () => ok(0);
    });
  },
};

// pedir o armazenamento "persistente": o navegador não apaga os dados quando falta espaço
try {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
} catch (_) {
  /* sem suporte: segue normal */
}

const TRINTA_DIAS = 30 * 86400;

/** Igual ao cache.obter do Python: guarda tudo, só pergunta de novo quando vence. */
// Dado vencido mas recente (até 6 h) é entregue na hora, e o novo é buscado em segundo plano
// (stale-while-revalidate): a tela aparece sem "Carregando…" e se redesenha quando o novo chega.
// A decisão fica em cache_regras.js. Um pedido igual que já está em andamento é reaproveitado.
const emAndamento = new Map();
let avisoDadosNovos = null;
let ultimoAviso = null;

function avisarDadosNovos() {
  if (avisoDadosNovos) return; // já tem um aviso marcado
  const espera = Math.max(300, CacheRegras.esperaParaAvisar(ultimoAviso, Date.now()));
  avisoDadosNovos = setTimeout(() => {
    avisoDadosNovos = null;
    ultimoAviso = Date.now();
    window.dispatchEvent(new CustomEvent("ss:dados-novos"));
  }, espera);
}

function buscarUmaVez(chave, ttl, buscar, estavel, salvo) {
  if (!emAndamento.has(chave)) {
    emAndamento.set(chave, buscarEGuardar(chave, ttl, buscar, estavel, salvo).finally(() => emAndamento.delete(chave)));
  }
  return emAndamento.get(chave);
}

/** opcoes.semVelho: nunca entrega dado vencido (o ao vivo dos e-sports, que corrige outras listas). */
async function obter(chave, ttl, buscar, estavel, opcoes = {}) {
  const salvo = await Banco.ler("dados", chave);
  const decisao = CacheRegras.decidir(salvo, Date.now() / 1000, opcoes);
  if (decisao === "valido") return salvo.valor;
  if (decisao === "velho") {
    if (!emAndamento.has(chave)) {
      const antes = JSON.stringify(salvo.valor);
      buscarUmaVez(chave, ttl, buscar, estavel, salvo)
        .then((novo) => {
          if (JSON.stringify(novo) !== antes) avisarDadosNovos();
        })
        .catch(() => {});
    }
    return salvo.valor;
  }
  return buscarUmaVez(chave, ttl, buscar, estavel, salvo);
}

async function buscarEGuardar(chave, ttl, buscar, estavel, salvo) {
  const agora = Date.now() / 1000;
  let valor;
  try {
    valor = await buscar();
  } catch (erro) {
    if (salvo) return salvo.valor;
    throw erro;
  }
  let validade = ttl;
  try {
    if (estavel && estavel(valor)) validade = Math.max(ttl, TRINTA_DIAS);
  } catch (_) {
    /* ignora */
  }
  await Banco.gravar("dados", { chave, valor, salvo_em: agora, vale_ate: agora + validade });
  return valor;
}

/* ---------- Links ($ref) do Core API ---------- */

const memoRef = new Map();

function validadeRef(url) {
  return /\/statistics|\/eventlog|\/status|\/rankings/.test(url) ? 6 * 3600 : 7 * 86400;
}

async function ref(url) {
  const u = String(url).replace(".espn.pvt", ".espn.com").replace("http://", "https://");
  if (memoRef.has(u)) return memoRef.get(u);
  const promessa = obter(`ref:${u}`, validadeRef(u), () => espnGet(u)).catch(() => null);
  memoRef.set(u, promessa);
  if (memoRef.size > 6000) memoRef.clear();
  return promessa;
}

function soRef(obj) {
  return obj && typeof obj === "object" && obj.$ref && Object.keys(obj).length <= 2 ? obj.$ref : null;
}

async function resolver(refs) {
  const unicos = [...new Set(refs.filter(Boolean))];
  const resultado = {};
  // de 12 em 12, para não abrir conexões demais no celular
  for (let i = 0; i < unicos.length; i += 12) {
    const lote = unicos.slice(i, i + 12);
    const respostas = await Promise.all(lote.map((u) => ref(u)));
    lote.forEach((u, k) => (resultado[u] = respostas[k]));
  }
  return resultado;
}

function expandir(obj, resolvidos) {
  const r = soRef(obj);
  if (r) return resolvidos[r] || {};
  return obj && typeof obj === "object" ? obj : {};
}

/* ---------- Texto ---------- */

function semAcento(texto) {
  return String(texto || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- Índice da busca ---------- */

const Indice = {
  async registrar(itens) {
    const agora = Date.now();
    const linhas = (itens || [])
      .filter((i) => i && i.id && i.nome)
      .map((i) => {
        const tipo = i.tipo === "time" ? "time" : "jogador";
        return {
          chave: `${tipo}:${i.esporte}:${i.id}`,
          tipo,
          esporte: i.esporte,
          liga: i.liga || null,
          id: String(i.id),
          nome: i.nome,
          busca: semAcento(i.nome),
          descricao: i.descricao || null,
          imagem: i.imagem || null,
          visto_em: agora,
        };
      });
    if (linhas.length) await Banco.gravar("indice", linhas);
  },
  async procurar(texto, limite = 40) {
    const palavras = semAcento(texto).split(" ").filter(Boolean);
    if (!palavras.length || palavras.join("").length < 2) return [];
    const todos = await Banco.todos("indice");
    const achados = todos.filter((i) => palavras.every((p) => i.busca.includes(p)));
    const comeco = (i) => (i.busca.startsWith(palavras[0]) ? 0 : i.busca.includes(` ${palavras[0]}`) ? 1 : 2);
    achados.sort((a, b) => comeco(a) - comeco(b) || a.nome.length - b.nome.length);
    return achados.slice(0, limite);
  },
  contar: () => Banco.contar("indice"),
};

/* ---------- Datas no fuso de Brasília ---------- */

const formatoPartes = new Intl.DateTimeFormat("en-CA", {
  timeZone: D_FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const DIA_SEMANA = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function lerData(texto) {
  if (!texto) return null;
  const d = new Date(String(texto).replace(/Z$/, "+00:00").replace(/(\d\d:\d\d)\+/, "$1:00+"));
  if (Number.isNaN(d.getTime())) {
    const d2 = new Date(texto);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return d;
}

function partesBR(data) {
  if (!data) return null;
  const p = Object.fromEntries(formatoPartes.formatToParts(data).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, dia: DIA_SEMANA[p.weekday] };
}

function dataBrDe(data) {
  const p = partesBR(data);
  return p ? p.data : null;
}

function hojeEmBR() {
  return dataBrDe(new Date());
}

function somarDiasIso(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const yyyymmdd = (ymd) => ymd.replace(/-/g, "");

/* ---------- Kings League (kings.json, montado pelo robô a partir do kingsleague.pro) ---------- */

const KINGS_LIGAS = [
  { id: "brazil", nome: "Kings League Brasil" },
  { id: "world-cup", nome: "Mundial da Kings" },
  { id: "kwc-nations", nome: "Mundial de Seleções da Kings" },
];
let KINGS_GUARDADO = null;

/** O que o repasse da Cloudflare lê agora na página da competição (ao vivo), ou null se ele não responder. */
async function kingsAoVivo(slug) {
  if (!REPASSE_ESPORTS) return null;
  try {
    const r = await fetch(`${REPASSE_ESPORTS}/kings/${slug}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  }
}

/** As competições da Kings League (na ordem de KINGS_LIGAS). O robô grava kings.json a cada 20 min nas noites
    de jogo; com jogo perto da hora, o placar vem do repasse (30 s). Sem repasse, fica o do robô. */
async function kingsCompeticoes() {
  if (KINGS_GUARDADO && KINGS_GUARDADO.ate > Date.now()) return KINGS_GUARDADO.valor;
  const d = await jsonLocal("dados/kings.json");
  const comps = d.competicoes || {};
  let aoVivo = false;
  const valor = await Promise.all(
    KINGS_LIGAS.filter((l) => comps[l.id]).map(async (l) => {
      let comp = { ...comps[l.id], id: l.id, nome: l.nome };
      if (Kings.temJogoPerto(comp, Date.now())) {
        aoVivo = true;
        comp = Kings.juntarAoVivo(comp, await kingsAoVivo(l.id));
      }
      return comp;
    })
  );
  KINGS_GUARDADO = { valor, ate: Date.now() + (aoVivo ? 30000 : 60000) };
  return valor;
}

/* ---------- Onde assistir (transmissoes.json) ---------- */

let TRANSMISSOES = null;
const DIAS_PT = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5, sáb: 5, dom: 6 };

async function carregarTransmissoes() {
  if (!TRANSMISSOES) {
    try {
      TRANSMISSOES = await jsonLocal("dados/transmissoes.json");
    } catch (_) {
      TRANSMISSOES = {};
    }
  }
  return TRANSMISSOES;
}

// a ESPN e a NBA usam siglas diferentes para alguns times da NBA
const SIGLAS_EQUIVALENTES = { wsh: "was", gs: "gsw", ny: "nyk", sa: "sas", no: "nop", utah: "uta", pho: "phx" };
const siglaNormal = (t) => {
  const n = semAcento(t);
  return SIGLAS_EQUIVALENTES[n] || n;
};

function bateTime(chave, candidatos) {
  const k = siglaNormal(chave);
  if (!k) return false;
  return candidatos.some((c) => {
    const n = siglaNormal(c);
    return n && (k === n || (k.length > 4 && n.includes(k)));
  });
}

function timesBatem(item, times) {
  let chaves = item.times || [];
  if (!chaves.length && (item.fora || item.casa)) chaves = [item.fora, item.casa];
  chaves = chaves.filter(Boolean);
  if (!chaves.length || times.length < chaves.length) return false;
  const usados = new Set();
  return chaves.every((chave) => {
    const i = times.findIndex((cands, idx) => !usados.has(idx) && bateTime(chave, cands));
    if (i < 0) return false;
    usados.add(i);
    return true;
  });
}

function regraVale(regra, br, sessao) {
  if (regra.sessoes && regra.sessoes.length) {
    if (!sessao || !regra.sessoes.map(semAcento).includes(semAcento(sessao))) return false;
  }
  if ((regra.dias && regra.dias.length) || regra.de || regra.ate) {
    if (!br) return false;
    if (regra.dias && regra.dias.length && !regra.dias.map((d) => DIAS_PT[semAcento(d).slice(0, 3)]).includes(br.dia)) return false;
    if (regra.de && br.hora < regra.de) return false;
    if (regra.ate && br.hora > regra.ate) return false;
  }
  return true;
}

/** Igual a transmissoes.onde_assistir do Python. */
function ondeAssistir(esporte, { liga = null, data = null, inicio = null, times = [], evento = null, sessao = null } = {}) {
  const dados = TRANSMISSOES || {};
  const br = inicio ? partesBR(inicio instanceof Date ? inicio : lerData(inicio)) : null;
  if (!data && br) data = br.data;
  // item escrito à mão vem antes do item do robô dos canais (fonte "guia de TV")
  const itens = [...(dados.jogos || [])].sort((a, b) => (a.fonte === "guia de TV") - (b.fonte === "guia de TV"));
  for (const item of itens) {
    if ((item.esporte || "nba") !== esporte) continue;
    if (item.liga && liga && item.liga !== liga) continue;
    if (item.data !== data) continue;
    if (item.sessao && (!sessao || semAcento(item.sessao) !== semAcento(sessao))) continue;
    if (item.evento) {
      if (!evento || !semAcento(evento).includes(semAcento(item.evento))) continue;
    } else if (!timesBatem(item, times)) continue;
    return { canais: [...new Set(item.canais || [])], confirmado: true, observacao: item.observacao || null, conferido_em: item.conferido_em || null, fonte: item.fonte || null };
  }
  const padroes = dados.padroes || {};
  const padrao = (liga && padroes[`${esporte}:${liga}`]) || padroes[esporte];
  if (!padrao) return null;
  let canais = [...(padrao.canais || [])];
  let observacao = padrao.observacao || null;
  for (const regra of padrao.regras || []) {
    if (regraVale(regra, br, sessao)) {
      canais = regra.na_frente === false ? [...canais, ...(regra.canais || [])] : [...(regra.canais || []), ...canais];
      observacao = regra.observacao || observacao;
    }
  }
  canais = [...new Set(canais.filter(Boolean))];
  if (!canais.length && !observacao) return null;
  return { canais, confirmado: false, observacao, conferido_em: padrao.conferido_em || null, fonte: padrao.fonte || null };
}

/* =========================================================================
   Equivalente ao espn_dados.py
   ========================================================================= */

const D_ESPORTES = {
  nba: { nome: "NBA", esporte: "basketball", tipo: "partidas", ligas: [{ id: "nba", nome: "NBA" }] },
  futebol: {
    nome: "Futebol",
    esporte: "soccer",
    tipo: "partidas",
    ligas: [
      { id: "bra.1", nome: "Brasileirão Série A" },
      { id: "bra.2", nome: "Brasileirão Série B" },
      { id: "bra.copa_do_brazil", nome: "Copa do Brasil" },
      { id: "conmebol.libertadores", nome: "Libertadores" },
      { id: "conmebol.sudamericana", nome: "Sul-Americana" },
      { id: "uefa.champions", nome: "Champions League" },
      { id: "uefa.europa", nome: "Liga Europa" },
      { id: "eng.1", nome: "Premier League" },
      { id: "esp.1", nome: "La Liga" },
      { id: "ita.1", nome: "Serie A (Itália)" },
      { id: "ger.1", nome: "Bundesliga" },
      { id: "fra.1", nome: "Ligue 1" },
      { id: "por.1", nome: "Liga Portugal" },
      { id: "ned.1", nome: "Eredivisie" },
      { id: "usa.1", nome: "MLS" },
      { id: "esp.copa_del_rey", nome: "Copa del Rey" },
      { id: "esp.super_cup", nome: "Supercopa da Espanha" },
      { id: "eng.fa", nome: "FA Cup" },
      { id: "eng.league_cup", nome: "Copa da Liga Inglesa" },
      { id: "eng.charity", nome: "Community Shield" },
      { id: "ger.dfb_pokal", nome: "Copa da Alemanha" },
      { id: "ger.super_cup", nome: "Supercopa da Alemanha" },
      { id: "ita.coppa_italia", nome: "Coppa Italia" },
      { id: "ita.super_cup", nome: "Supercopa da Itália" },
      { id: "fra.coupe_de_france", nome: "Copa da França" },
      { id: "fra.super_cup", nome: "Supercopa da França" },
      { id: "por.taca.portugal", nome: "Taça de Portugal" },
      { id: "ned.cup", nome: "Copa da Holanda" },
      { id: "bra.supercopa_do_brazil", nome: "Supercopa do Brasil" },
      { id: "conmebol.recopa", nome: "Recopa Sul-Americana" },
      { id: "uefa.super_cup", nome: "Supercopa da UEFA" },
      { id: "fifa.cwc", nome: "Mundial de Clubes" },
      { id: "fifa.friendly", nome: "Amistosos de seleções", selecao: true },
      { id: "fifa.worldq.conmebol", nome: "Eliminatórias (América do Sul)", selecao: true },
      { id: "fifa.worldq.uefa", nome: "Eliminatórias (Europa)", selecao: true },
      { id: "uefa.nations", nome: "Liga das Nações", selecao: true },
      { id: "fifa.world", nome: "Copa do Mundo", selecao: true },
      { id: "conmebol.america", nome: "Copa América", selecao: true },
      { id: "uefa.euro", nome: "Eurocopa", selecao: true },
    ],
  },
  nfl: { nome: "NFL", esporte: "football", tipo: "partidas", ligas: [{ id: "nfl", nome: "NFL" }] },
  mlb: { nome: "MLB", esporte: "baseball", tipo: "partidas", ligas: [{ id: "mlb", nome: "MLB" }] },
  nhl: { nome: "NHL", esporte: "hockey", tipo: "partidas", ligas: [{ id: "nhl", nome: "NHL" }] },
  f1: { nome: "Fórmula 1", esporte: "racing", tipo: "corrida", ligas: [{ id: "f1", nome: "Fórmula 1" }] },
  ufc: { nome: "UFC", esporte: "mma", tipo: "luta", ligas: [{ id: "ufc", nome: "UFC" }] },
};

function dConfig(esporte, liga) {
  const cfg = D_ESPORTES[esporte];
  if (!cfg) throw new ErroRota(404, "Esporte ou liga desconhecidos.");
  const l = cfg.ligas.find((x) => x.id === liga);
  if (l) return [cfg, l];
  if (esporte === "futebol" && /^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$/.test(liga || "")) return [cfg, { id: liga, nome: liga }];
  throw new ErroRota(404, "Esporte ou liga desconhecidos.");
}

function nomeDaLiga(liga) {
  for (const cfg of Object.values(D_ESPORTES)) {
    const l = cfg.ligas.find((x) => x.id === liga);
    if (l) return l.nome;
  }
  return liga;
}

/* ---------- Traduções ---------- */

const ESTATISTICAS_PT = {
  possession: "Posse de bola", possessionpct: "Posse de bola", shots: "Finalizações", "total shots": "Finalizações",
  "shots on target": "Finalizações no gol", "on goal": "Finalizações no gol", "shots on goal": "Finalizações no gol",
  "corner kicks": "Escanteios", corners: "Escanteios", fouls: "Faltas", "fouls committed": "Faltas",
  "yellow cards": "Cartões amarelos", "red cards": "Cartões vermelhos", offsides: "Impedimentos", saves: "Defesas",
  passes: "Passes", "accurate passes": "Passes certos", "pass completion %": "Precisão dos passes", crosses: "Cruzamentos",
  "accurate crosses": "Cruzamentos certos", "long balls": "Bolas longas", tackles: "Desarmes", "effective tackles": "Desarmes certos",
  interceptions: "Interceptações", clearances: "Cortes", "blocked shots": "Finalizações bloqueadas",
  "first downs": "Primeiras descidas", "1st downs": "Primeiras descidas", "total yards": "Jardas totais", passing: "Jardas aéreas",
  rushing: "Jardas terrestres", turnovers: "Perdas de posse", penalties: "Penalidades (jardas)",
  "3rd down efficiency": "Conversões na 3ª descida", "4th down efficiency": "Conversões na 4ª descida",
  "possession time": "Tempo de posse", "time of possession": "Tempo de posse", "sacks-yards lost": "Sacks (jardas perdidas)",
  "red zone (made-att)": "Zona vermelha (convertidas)", "total plays": "Jogadas", "total drives": "Campanhas",
  "yards per play": "Jardas por jogada", "comp-att": "Passes completos", "yards per pass": "Jardas por passe",
  "interceptions thrown": "Interceptações sofridas", "rushing attempts": "Corridas", "yards per rush": "Jardas por corrida",
  "fumbles lost": "Fumbles perdidos", rebounds: "Rebotes", assists: "Assistências", "field goal %": "Arremessos (%)",
  "three point %": "Bolas de três (%)", "free throw %": "Lances livres (%)", steals: "Roubos de bola", blocks: "Tocos",
  "fast break points": "Pontos em contra-ataque", "points in paint": "Pontos no garrafão", "largest lead": "Maior vantagem",
};
const GRUPOS_NFL_PT = {
  passing: "Passe", rushing: "Corrida", receiving: "Recepção", fumbles: "Fumbles", defensive: "Defesa",
  interceptions: "Interceptações", kickreturns: "Retornos de kickoff", puntreturns: "Retornos de punt",
  kicking: "Chutes (field goals)", punting: "Punts",
};
const STATUS_LESAO_PT = {
  out: "Fora", questionable: "Dúvida", doubtful: "Improvável", probable: "Provável", "day-to-day": "Dia a dia",
  "injured reserve": "Lista de lesionados", suspension: "Suspenso", suspended: "Suspenso",
};
const CATEGORIAS_PESO = [
  ["light heavyweight", "Peso-meio-pesado"], ["heavyweight", "Peso-pesado"], ["middleweight", "Peso-médio"],
  ["welterweight", "Peso-meio-médio"], ["lightweight", "Peso-leve"], ["featherweight", "Peso-pena"],
  ["bantamweight", "Peso-galo"], ["flyweight", "Peso-mosca"], ["strawweight", "Peso-palha"], ["catchweight", "Peso combinado"],
];
const RESULTADOS_LUTA = [
  ["ko/tko", "Nocaute"], ["tko", "Nocaute técnico"], ["ko", "Nocaute"], ["submission", "Finalização"],
  ["unanimous", "Decisão unânime"], ["split", "Decisão dividida"], ["majority", "Decisão majoritária"],
  ["decision", "Decisão"], ["no contest", "Sem resultado"], ["draw", "Empate"], ["disqualification", "Desclassificação"], ["dq", "Desclassificação"],
];
const SESSOES_F1 = [
  ["fp1", "Treino livre 1", "treino"], ["practice 1", "Treino livre 1", "treino"], ["fp2", "Treino livre 2", "treino"],
  ["practice 2", "Treino livre 2", "treino"], ["fp3", "Treino livre 3", "treino"], ["practice 3", "Treino livre 3", "treino"],
  ["sprint shootout", "Classificação sprint", "classificacao"], ["sprint qual", "Classificação sprint", "classificacao"],
  ["ss", "Classificação sprint", "classificacao"], ["sq", "Classificação sprint", "classificacao"], ["sprint", "Sprint", "sprint"],
  ["qual", "Classificação", "classificacao"], ["race", "Corrida", "corrida"], ["corrida", "Corrida", "corrida"],
];
const BASES_LUTA = {
  orthodox: "Destro (ortodoxo)", ortodoxo: "Destro (ortodoxo)", destro: "Destro", detro: "Destro",
  southpaw: "Canhoto", canhoto: "Canhoto", switch: "Troca de base", "open stance": "Base aberta",
};

const traduzEstatistica = (r) => ESTATISTICAS_PT[String(r || "").trim().toLowerCase()] || r;
function traduzPeso(t) {
  const x = String(t || "").toLowerCase();
  for (const [k, nome] of CATEGORIAS_PESO) if (x.includes(k)) return nome + (x.includes("women") ? " feminino" : "");
  return t || null;
}
function traduzResultado(t) {
  const x = String(t || "").toLowerCase();
  if (!x) return null;
  for (const [k, nome] of RESULTADOS_LUTA) if (x.includes(k)) return nome;
  return t;
}
function nomeSessaoF1(abrev) {
  const t = String(abrev || "").trim().toLowerCase();
  for (const [k, nome, tipo] of SESSOES_F1) if (t === k || t.startsWith(k)) return [nome, tipo];
  return [abrev || "Sessão", null];
}
const traduzBase = (t) => (t ? BASES_LUTA[String(t).trim().toLowerCase()] || t : null);

/* ---------- Status ---------- */

function estadoEspn(status) {
  const tipo = (status || {}).type || {};
  return [{ pre: 1, in: 2, post: 3 }[tipo.state] || 1, String(tipo.name || "").toUpperCase()];
}

function statusTexto(esporteEspn, status, tipoTemporada = null) {
  const [estado, nome] = estadoEspn(status);
  status = status || {};
  const periodo = status.period || 0;
  const relogio = status.displayClock || "";
  for (const [chave, texto] of [["POSTPONED", "Adiado"], ["CANCELED", "Cancelado"], ["CANCELLED", "Cancelado"], ["SUSPENDED", "Suspenso"], ["ABANDONED", "Abandonado"], ["DELAYED", "Atrasado"], ["FORFEIT", "W.O."]]) {
    if (nome.includes(chave)) return texto;
  }
  if (estado === 3) {
    if (nome.includes("PEN")) return "Encerrado (pênaltis)";
    if (nome.includes("AET") || nome.includes("OVERTIME") || nome.includes("_OT")) return "Encerrado (prorrogação)";
    return "Encerrado";
  }
  if (estado === 2) {
    const especifico = statusAoVivo(esporteEspn, { ...status, _tipoTemporada: tipoTemporada }); // beisebol e hóquei
    if (especifico) return especifico;
    if (nome.includes("HALFTIME")) return "Intervalo";
    if (esporteEspn === "soccer") {
      if (nome.includes("END_PERIOD") || nome.includes("END_OF_PERIOD")) return periodo >= 2 ? "Fim do tempo normal" : "Intervalo";
      if (nome.includes("SHOOTOUT")) return "Pênaltis";
      return relogio || "Ao vivo";
    }
    if (esporteEspn === "football" || esporteEspn === "basketball") {
      if (nome.includes("END_PERIOD")) return `Fim do ${periodo}º quarto`;
      const quarto = periodo > 4 ? "Prorrogação" : `${periodo}º quarto`;
      return relogio ? `${quarto}, ${relogio}` : quarto;
    }
    return (status.type || {}).shortDetail || "Ao vivo";
  }
  return null;
}

/* ---------- Partidas ---------- */

function logoDe(time) {
  if (!time || typeof time !== "object") return null;
  if (time.logo) return time.logo;
  const logos = time.logos || [];
  return logos[0] && logos[0].href ? logos[0].href : null;
}

function placarDe(v) {
  if (v && typeof v === "object") v = v.displayValue ?? v.value;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : Math.trunc(n);
}

function campanhaDe(c) {
  const r = c.records || c.record || [];
  return Array.isArray(r) && r[0] ? r[0].summary || r[0].displayValue || null : null;
}

function competidor(c, estado) {
  c = c || {};
  const t = c.team || {};
  return {
    id: t.id || c.id || null,
    sigla: t.abbreviation || null,
    nome: t.displayName || t.name || null,
    nome_curto: t.shortDisplayName || t.displayName || null,
    logo: logoDe(t),
    placar: estado >= 2 ? placarDe(c.score) : null,
    penaltis: placarDe(c.shootoutScore),
    vencedor: Boolean(c.winner),
    campanha: campanhaDe(c),
  };
}

function localDe(venue) {
  venue = venue || {};
  return [venue.fullName, (venue.address || {}).city].filter(Boolean).join(", ") || null;
}

function partida(ev, esporte, liga, comp) {
  const [cfg, ligaCfg] = dConfig(esporte, liga);
  comp = comp || (ev.competitions || [{}])[0];
  const status = comp.status || ev.status || {};
  const [estado] = estadoEspn(status);
  const cs = comp.competitors || [];
  const casa = cs.find((c) => c.homeAway === "home") || cs[0] || {};
  const fora = cs.find((c) => c.homeAway === "away") || cs[1] || {};
  const inicio = lerData(comp.date || ev.date);
  const notas = (comp.notes || []).map((n) => n && n.headline).filter(Boolean);
  const jogo = {
    id: String(ev.id || comp.id || ""),
    esporte,
    liga,
    liga_nome: ligaCfg.nome,
    inicio: inicio ? inicio.toISOString() : null,
    data: dataBrDe(inicio),
    estado,
    status: statusTexto(cfg.esporte, status, (ev.season || {}).type ?? (ev.seasonType || {}).type),
    relogio: status.displayClock || null,
    periodo: status.period || null,
    casa: competidor(casa, estado),
    fora: competidor(fora, estado),
    local: localDe(comp.venue),
    semana: (ev.week || {}).number || null,
    nota: notaDoJogo(comp) || notas[0] || null,
  };
  jogo.transmissao = ondeAssistir(esporte, {
    liga,
    data: jogo.data,
    inicio,
    times: [jogo.casa, jogo.fora].map((t) => [t.sigla, t.nome, t.nome_curto]),
  });
  return jogo;
}

// o scoreboard de um dia, guardado na memória por pouco tempo: o "dia anterior" que a lista de um dia
// pede é o mesmo dia que a lista anterior já pediu (trocar de dia não pede tudo de novo)
const SCOREBOARDS = new Map();
function scoreboardDoDia(url, chave) {
  const k = `${url}|${chave}`;
  const salvo = SCOREBOARDS.get(k);
  if (salvo && salvo.ate > Date.now()) return salvo.p;
  const passado = chave.length === 8 && chave < yyyymmdd(somarDiasIso(hojeEmBR(), -1));
  const p = espnGet(url, { dates: chave, limit: 1000 });
  SCOREBOARDS.set(k, { p, ate: Date.now() + (passado ? 30 * 60000 : 45000) });
  p.catch(() => SCOREBOARDS.delete(k));
  if (SCOREBOARDS.size > 300) SCOREBOARDS.delete(SCOREBOARDS.keys().next().value);
  return p;
}

/** calendario: os dias com jogo da liga (AAAA-MM-DD), para pedir só esses (null = pede todos). */
async function eventosPeriodo(url, d0, d1, info, calendario = null) {
  const dias = Math.round((new Date(`${d1}T12:00:00Z`) - new Date(`${d0}T12:00:00Z`)) / 86400000) + 1;
  let chaves;
  if (dias <= 4) {
    const isos = Array.from({ length: dias }, (_, i) => somarDiasIso(d0, i));
    chaves = diasParaPedir(isos, calendario).map(yyyymmdd);
  } else chaves = [...new Set(Array.from({ length: dias }, (_, i) => yyyymmdd(somarDiasIso(d0, i)).slice(0, 6)))].sort();
  const vistos = new Set();
  const eventos = [];
  const respostas = await Promise.all(chaves.map((chave) => scoreboardDoDia(url, chave)));
  for (const dados of respostas) {
    if (info && !info.logo) {
      const logos = ((dados.leagues || [{}])[0] || {}).logos || [];
      info.logo = logos[0] ? logos[0].href : null;
    }
    for (const ev of dados.events || []) {
      const id = String(ev.id);
      if (!vistos.has(id)) {
        vistos.add(id);
        eventos.push(ev);
      }
    }
  }
  return eventos;
}

/** Os dias com jogo da liga, do calendário já guardado (sem esperar a rede). Sem ele, busca em segundo
    plano (a próxima troca de dia já usa) e devolve null: aí a lista pede todos os dias, como antes. */
async function calendarioGuardado(esporte, liga) {
  const chave = `espn_datas_v3:${esporte}:${liga}`;
  try {
    const salvo = await Banco.ler("dados", chave);
    const v = salvo && salvo.valor;
    if (v && v.tipo === "dias" && v.datas && v.datas.length && Date.now() / 1000 - salvo.salvo_em < 2 * 86400) {
      if (Date.now() / 1000 >= salvo.vale_ate) obter(chave, 21600, () => buscarDatas(esporte, liga)).catch(() => {});
      return v.datas;
    }
  } catch (_) {
    /* sem banco: segue sem calendário */
  }
  // um pouco depois, para não disputar a rede com a lista que está abrindo
  setTimeout(() => obter(chave, 21600, () => buscarDatas(esporte, liga)).catch(() => {}), 4000);
  return null;
}

async function buscarPartidas(esporte, liga, de, ate) {
  const [cfg] = dConfig(esporte, liga);
  ate = ate || de;
  const info = {};
  // só os dias em que a liga joga (o calendário guardado): num dia comum, poucas das ~40 ligas jogam
  const calendario = await calendarioGuardado(esporte, liga);
  const eventos = await eventosPeriodo(`${D_BASE}/${cfg.esporte}/${liga}/scoreboard`, somarDiasIso(de, -1), ate, info, calendario);
  const jogos = [];
  for (const ev of eventos) {
    let j;
    try {
      j = partida(ev, esporte, liga);
    } catch (_) {
      continue;
    }
    j.liga_logo = info.logo || null;
    if (j.data && j.data >= de && j.data <= ate) jogos.push(j);
  }
  jogos.sort((a, b) => (a.inicio || "").localeCompare(b.inicio || "") || a.id.localeCompare(b.id));
  Indice.registrar(jogos.flatMap((j) => [j.casa, j.fora].map((t) => ({ tipo: "time", esporte, liga, id: t.id, nome: t.nome, descricao: cfg.nome, imagem: t.logo }))));
  return jogos;
}

function rotuloSemana(r) {
  const m = /week\s+(\d+)/i.exec(String(r || ""));
  if (m) return `Semana ${m[1]}`;
  return { "wild card": "Wild Card", "divisional round": "Semifinais de divisão", "conference championship": "Finais de conferência", "pro bowl": "Pro Bowl", "super bowl": "Super Bowl" }[String(r || "").toLowerCase()] || r;
}

async function buscarDatas(esporte, liga) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE}/${cfg.esporte}/${liga}/scoreboard`);
  const cal = ((dados.leagues || [{}])[0] || {}).calendar || [];
  const datas = new Set();
  const semanas = [];
  let atual = null;
  const agora = new Date();
  for (const item of cal) {
    if (typeof item === "string") {
      const d = lerData(item);
      if (d) datas.add(d.toISOString().slice(0, 10));
      continue;
    }
    if (String(item.label || "").toLowerCase().includes("pre")) continue;
    for (const e of item.entries || []) {
      const ini = lerData(e.startDate);
      const fim = lerData(e.endDate);
      if (!ini || !fim) continue;
      semanas.push({ rotulo: rotuloSemana(e.label), de: dataBrDe(ini), ate: dataBrDe(new Date(fim.getTime() - 1000)) });
      if (atual === null && fim >= agora) atual = semanas.length - 1;
    }
  }
  const liga0 = (dados.leagues || [{}])[0] || {};
  // na MLB o calendário lista os dias SEM jogo
  const dias = liga0.calendarIsWhitelist === false ? diasDoCalendario(liga0) : [...datas].sort();
  // o cabeçalho da página da liga (escudo, temporada e datas) vem do mesmo pedido; a barra vai
  // do primeiro ao último dia com jogo (como no Sofascore), não de 1/1 a 31/12
  const info = Liga.infoDaLiga(liga0);
  const primeiro = semanas.length ? semanas[0].de : dias[0];
  const ultimo = semanas.length ? semanas[semanas.length - 1].ate : dias[dias.length - 1];
  if (info && primeiro && ultimo && primeiro < ultimo) Object.assign(info, { inicio: `${primeiro}T12:00:00Z`, fim: `${ultimo}T12:00:00Z` });
  return { tipo: semanas.length ? "semanas" : "dias", datas: dias, semanas, atual, liga: info };
}

function estatisticasTimes(dados, jogo) {
  const times = (dados.boxscore || {}).teams || [];
  const porLado = {};
  for (const t of times) {
    const time = t.team || {};
    const lado = t.homeAway ? (t.homeAway === "home" ? "casa" : "fora") : String(time.id) === String(jogo.casa.id) ? "casa" : "fora";
    porLado[lado] = estatisticasJogoBeisebol(t.statistics) || t.statistics || []; // beisebol vem em grupos
  }
  const linhas = [];
  const vistos = {};
  for (const lado of ["casa", "fora"]) {
    for (const st of porLado[lado] || []) {
      const chave = st.name || st.label;
      if (!vistos[chave]) {
        vistos[chave] = { rotulo: traduzEstatistica(st.label || st.name), casa: null, fora: null };
        linhas.push(vistos[chave]);
      }
      vistos[chave][lado] = st.displayValue ?? null;
    }
  }
  return linhas.filter((l) => l.casa !== null || l.fora !== null);
}

function jogadoresBox(dados) {
  return ((dados.boxscore || {}).players || []).map((t) => {
    const time = t.team || {};
    return {
      time: { id: time.id, nome: time.displayName, logo: logoDe(time) },
      grupos: (t.statistics || []).map((g) => {
        const nome = g.name || g.text || "";
        return {
          nome: GRUPOS_NFL_PT[nome.toLowerCase()] || g.text || nome || "Estatísticas",
          rotulos: g.labels || g.names || [],
          descricoes: g.descriptions || [],
          atletas: (g.athletes || []).map((a) => {
            const at = a.athlete || {};
            return { id: at.id, nome: at.displayName || at.shortName, camisa: at.jersey, posicao: (at.position || {}).abbreviation, valores: a.stats || [] };
          }),
          totais: g.totals || [],
        };
      }),
    };
  });
}

function statDe(stats, ...nomes) {
  for (const s of stats || []) {
    if (nomes.includes(s.name) || nomes.includes(s.abbreviation)) return s.displayValue !== undefined && s.displayValue !== "" ? s.displayValue : s.value;
  }
  return null;
}

/** O número de uma estatística do jogador (0 quando não vem). */
function numeroStat(stats, ...nomes) {
  const n = Math.trunc(Number(statDe(stats, ...nomes)));
  return Number.isFinite(n) ? n : 0;
}

/** Escalações do futebol: titulares com o lugar no campo, reservas, minutos das trocas e o placar do time.
    Os nomes dos campos são os mesmos de espn_dados._escalacoes (PC). */
function escalacoes(dados) {
  const subs = Campinho.substituicoes(dados.keyEvents);
  const competidores = ((((dados.header || {}).competitions) || [{}])[0] || {}).competitors || [];
  const placar = new Map(competidores.map((c) => [String((c.team || {}).id || c.id), placarDe(c.score)]));
  return (dados.rosters || []).map((r) => {
    const time = r.team || {};
    const tid = String(time.id);
    const jogadores = (r.roster || []).map((p) => {
      const at = p.athlete || {};
      const st = p.stats || [];
      const troca = subs[String(at.id || "")] || {};
      const lugar = Number(p.formationPlace);
      return {
        id: at.id,
        nome: at.displayName || at.shortName,
        camisa: p.jersey || at.jersey,
        posicao: (p.position || {}).abbreviation,
        titular: Boolean(p.starter),
        entrou: Boolean(p.subbedIn),
        saiu: Boolean(p.subbedOut),
        lugar: Number.isInteger(lugar) && lugar > 0 ? lugar : null,
        foto: (at.headshot || {}).href || null,
        entrou_aos: troca.entrou_aos ?? null,
        saiu_aos: troca.saiu_aos ?? null,
        no_lugar_de: troca.no_lugar_de ?? null,
        gols: numeroStat(st, "totalGoals", "G"),
        assistencias: numeroStat(st, "goalAssists", "A"),
        amarelos: numeroStat(st, "yellowCards", "YC"),
        vermelhos: numeroStat(st, "redCards", "RC"),
        chutes_no_gol: numeroStat(st, "shotsOnTarget", "SOG"),
        faltas_cometidas: numeroStat(st, "foulsCommitted", "FC"),
        faltas_sofridas: numeroStat(st, "foulsSuffered", "FA"),
        gols_contra: numeroStat(st, "ownGoals", "OG"),
        defesas: numeroStat(st, "saves", "SV"),
        gols_sofridos: numeroStat(st, "goalsConceded", "GA"),
        stats: {},
      };
    });
    const pro = placar.get(tid);
    const contra = [...placar].find(([k]) => k !== tid);
    const inteiro = (v) => (Number.isInteger(v) ? v : null);
    return {
      lado: r.homeAway === "home" ? "casa" : "fora",
      time: { id: time.id, nome: time.displayName, logo: logoDe(time) },
      formacao: r.formation || null,
      gols_pro: inteiro(pro),
      gols_contra_time: inteiro(contra ? contra[1] : null),
      titulares: jogadores.filter((j) => j.titular),
      reservas: jogadores.filter((j) => !j.titular),
    };
  });
}

function tipoLance(texto, gol) {
  const t = String(texto || "").toLowerCase();
  if (t.includes("own goal") || t.includes("gol contra")) return "gol_contra";
  if (gol || t.includes("goal") || t.includes("gol")) return "gol";
  if (t.includes("penalty") && (t.includes("miss") || t.includes("saved"))) return "penalti_perdido";
  if (t.includes("yellow") || t.includes("amarelo")) return "amarelo";
  if (t.includes("red") || t.includes("vermelho")) return "vermelho";
  if (t.includes("substitution") || t.includes("substitui")) return "substituicao";
  if (t.includes("var")) return "var";
  return null;
}

function lances(dados, esporteEspn) {
  if (esporteEspn === "soccer") {
    return (dados.keyEvents || [])
      .filter((e) => !e.shootout) // cobrança da disputa de pênaltis não é gol do jogo
      .map((e) => {
        const tipo = tipoLance((e.type || {}).text || (e.type || {}).type, e.scoringPlay);
        if (!tipo) return null;
        return {
          tempo: (e.clock || {}).displayValue || null,
          tipo,
          texto: e.shortText || e.text,
          time_id: (e.team || {}).id,
          jogadores: (e.participants || []).map((p) => (p.athlete || {}).displayName).filter(Boolean),
        };
      })
      .filter(Boolean);
  }
  const pontuacoes = lancesPontuacao(esporteEspn, dados.plays); // MLB e NHL vêm em "plays"
  if (pontuacoes) return pontuacoes;
  return (dados.scoringPlays || []).map((p) => {
    const periodo = (p.period || {}).number;
    const relogio = (p.clock || {}).displayValue;
    return {
      tempo: periodo ? `${periodo}º Q ${relogio || ""}` : relogio,
      tipo: (p.type || {}).abbreviation || (p.type || {}).text,
      texto: p.text,
      time_id: (p.team || {}).id,
      placar: p.homeScore !== undefined && p.homeScore !== null ? `${p.awayScore} x ${p.homeScore}` : null,
      jogadores: [],
    };
  });
}

/** Um jogo do histórico do time (o mando e o resultado saem do placar: em português a ESPN manda x/em e V/E/D). */
function jogoHistorico(e, timeId) {
  const adv = e.opponent || {};
  const { local, resultado } = resultadoDoJogo(e, timeId);
  return {
    id: e.id,
    data: dataBrDe(lerData(e.gameDate)),
    adversario: adv.displayName || adv.abbreviation,
    adversario_logo: logoDe(adv),
    local,
    placar: e.score,
    resultado,
    competicao: e.leagueName || e.leagueAbbreviation,
  };
}

/** A provável escalação de um time: os titulares do jogo `eventoId` (o último dele), de qualquer competição. */
async function buscarEscalacaoAnterior(eventoId, timeId) {
  const dados = await espnGet(`${D_BASE}/soccer/all/summary`, { event: eventoId });
  const e = escalacoes(dados).find((x) => String(x.time.id) === String(timeId));
  const provavel = provavelDoTime(e);
  if (!provavel) return null;
  const comp = (((dados.header || {}).competitions) || [{}])[0] || {};
  const adversario = (comp.competitors || []).find((c) => String((c.team || {}).id) !== String(timeId));
  return { ...provavel, base: { data: dataBrDe(lerData(comp.date)), adversario: adversario ? (adversario.team || {}).displayName : null } };
}

async function buscarResumo(esporte, liga, eventoId) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE}/${cfg.esporte}/${liga}/summary`, { event: eventoId });
  if (cfg.esporte === "hockey" && !(dados.plays || []).length) {
    // em português a ESPN manda o jogo de hóquei sem as jogadas; sem o idioma elas vêm
    try {
      const r = await pedirUrl(montarUrl(`${D_BASE}/${cfg.esporte}/${liga}/summary`, { event: eventoId }));
      if (r.ok) dados.plays = (await r.json()).plays || [];
    } catch (_) {
      /* fica sem os gols */
    }
  }
  const header = dados.header || {};
  const comp = (header.competitions || [{}])[0];
  const jogo = partida({ id: eventoId, week: header.week, season: header.season }, esporte, liga, comp);
  jogo.nota = notaDoJogo(comp, header.gameNote) || jogo.nota; // no resumo, a série vem em lista e o nome em gameNote
  const info = dados.gameInfo || {};
  if (!jogo.local) jogo.local = localDe(info.venue);
  const esc = escalacoes(dados);
  const box = jogadoresBox(dados);
  Indice.registrar(
    esc.flatMap((e) => [...e.titulares, ...e.reservas].map((p) => ({ esporte, liga, id: p.id, nome: p.nome, descricao: e.time.nome })))
      .concat(box.flatMap((t) => t.grupos.flatMap((g) => g.atletas.map((a) => ({ esporte, liga, id: a.id, nome: a.nome, descricao: t.time.nome })))))
  );
  return {
    jogo,
    info: {
      local: jogo.local,
      publico: info.attendance || null,
      arbitragem: (info.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean).slice(0, 4),
    },
    estatisticas: estatisticasTimes(dados, jogo),
    jogadores: box,
    escalacoes: esc,
    lances: lances(dados, cfg.esporte),
    // NBA: box score completo e arremessos com posição (para o mapa)
    nba:
      cfg.esporte === "basketball" && ((dados.boxscore || {}).players || []).length
        ? { box: dados.boxscore.players.map(boxScoreDoTime), ...arremessosDoJogo(dados.plays) }
        : null,
    forma: (dados.lastFiveGames || []).map((t) => ({ time: { id: (t.team || {}).id, nome: (t.team || {}).displayName, logo: logoDe(t.team) }, jogos: (t.events || []).map((e) => jogoHistorico(e, (t.team || {}).id)) })),
    confronto: (() => {
      for (const t of dados.headToHeadGames || []) {
        const jogos = (t.events || []).map((e) => jogoHistorico(e, (t.team || {}).id));
        if (jogos.length) return { time: { id: (t.team || {}).id, nome: (t.team || {}).displayName }, jogos: jogos.slice(0, 10) };
      }
      return null;
    })(),
    lesionados: (dados.injuries || [])
      .map((t) => ({
        time: { id: (t.team || {}).id, nome: (t.team || {}).displayName },
        lista: (t.injuries || []).map((i) => {
          const at = i.athlete || {};
          const det = i.details || {};
          const st = String(i.status || (i.type || {}).description || "");
          return { nome: at.displayName, posicao: (at.position || {}).abbreviation, status: STATUS_LESAO_PT[st.toLowerCase()] || st, motivo: [det.type, det.detail].filter(Boolean).join(" ") || null };
        }),
      }))
      .filter((t) => t.lista.length),
    lideres: (dados.leaders || [])
      .map((t) => ({
        time: { id: (t.team || {}).id, nome: (t.team || {}).displayName, logo: logoDe(t.team) },
        categorias: (t.leaders || [])
          .map((c) => {
            const topo = (c.leaders || [{}])[0] || {};
            const at = topo.athlete || {};
            // "Partidas: 32, Gols: 10" vira 10 (e "32 jogos" embaixo); o nome da categoria pela tabela do app
            const { valor, detalhe } = valorDoLider(topo.displayValue ?? topo.value);
            return at.id ? { nome: nomeCategoria(c, esporte), id: at.id, atleta: at.displayName || at.shortName, valor, detalhe } : null;
          })
          .filter(Boolean),
      }))
      .filter((t) => t.categorias.length),
  };
}

/* ---------- Classificação ---------- */

function gruposClassificacao(no, nomePai, saida) {
  const entradas = ((no.standings || {}).entries) || [];
  if (entradas.length) {
    const colunas = [];
    const chaves = new Set();
    for (const st of entradas[0].stats || []) {
      const chave = st.name || st.abbreviation;
      if (!chave || chaves.has(chave)) continue;
      chaves.add(chave);
      colunas.push({ chave, sigla: st.abbreviation || st.shortDisplayName || chave, nome: st.displayName || chave });
    }
    let linhas = entradas.map((e) => {
      const time = e.team || {};
      const at = e.athlete || {};
      const stats = {};
      let rank = null;
      let seed = null;
      for (const st of e.stats || []) {
        const chave = st.name || st.abbreviation;
        if (!chave || chave in stats) continue;
        stats[chave] = st.displayValue ?? st.value;
        if (chave === "rank" && st.value !== undefined) rank = st.value;
        if (chave === "playoffSeed" && st.value !== undefined) seed = st.value;
      }
      const nota = e.note || {};
      return {
        id: time.id || at.id,
        tipo: at.id && !time.id ? "atleta" : "time",
        nome: time.displayName || at.displayName || "",
        sigla: time.abbreviation || at.shortName,
        logo: logoDe(time) || (at.flag || {}).href || null,
        stats,
        rank: rank ?? seed,
        nota: nota.description || null,
        cor_nota: nota.color || null,
      };
    });
    if (linhas.some((l) => l.rank !== null && l.rank !== undefined)) linhas = linhas.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    saida.push({ nome: no.name || nomePai, pai: no.name ? nomePai : "", colunas, linhas });
  }
  for (const filho of no.children || []) gruposClassificacao(filho, no.name || nomePai, saida);
  return saida;
}

async function buscarClassificacao(esporte, liga) {
  const [cfg] = dConfig(esporte, liga);
  // MLB e NHL: até o nível das divisões
  const dados = await espnGet(`${D_BASE_CLASS}/${cfg.esporte}/${liga}/standings`, ["mlb", "nhl"].includes(esporte) ? { level: 3 } : {});
  const grupos = gruposClassificacao(dados, "", []);
  // nomes repetidos ("Leste" nas duas ligas da MLB) levam o nome do grupo de cima
  const repetidos = new Set(grupos.map((g) => g.nome).filter((n, i, todos) => todos.indexOf(n) !== i));
  for (const g of grupos) if (repetidos.has(g.nome) && g.pai) g.nome = `${g.pai} · ${g.nome}`;
  Indice.registrar(grupos.flatMap((g) => g.linhas.map((l) => ({ tipo: l.tipo, esporte, liga, id: l.id, nome: l.nome, descricao: cfg.nome, imagem: l.tipo === "time" ? l.logo : null }))));
  const temp = dados.season || {};
  return { grupos, temporada: temp.startDate && temp.endDate ? { inicio: temp.startDate, fim: temp.endDate, nome: temp.displayName || null } : null };
}

/* ---------- Elenco e atleta ---------- */

// atletaCurto, agruparElenco e as outras regras da página do time ficam em time_dados.js

async function buscarElenco(esporte, liga, timeId) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE}/${cfg.esporte}/${liga}/teams/${timeId}/roster`);
  const { grupos, tecnico } = agruparElenco(esporte, dados);
  const time = dados.team || {};
  const resultado = { time: { id: time.id || timeId, nome: time.displayName, logo: logoDe(time) }, grupos, tecnico };
  Indice.registrar(
    [{ tipo: "time", esporte, liga, id: resultado.time.id, nome: resultado.time.nome, imagem: resultado.time.logo }].concat(
      grupos.flatMap((g) => g.atletas.map((a) => ({ esporte, liga, id: a.id, nome: a.nome, descricao: resultado.time.nome, imagem: a.foto })))
    )
  );
  return resultado;
}

/* ---------- Página do time ---------- */

const WIKIDATA = "https://www.wikidata.org";

/** País (item do Wikidata) de cada liga nacional, para não confundir clubes de mesmo nome. */
const PAIS_DA_LIGA = { bra: "Q155", eng: "Q145", esp: "Q29", ita: "Q38", ger: "Q183", fra: "Q142", por: "Q45", usa: "Q30", ned: "Q55" };

/** Item do clube no Wikidata: primeiro pelo ID da ESPN (P13590); senão pelo nome exato, no país da liga. */
async function clubeNoWikidata(nomeTime, timeId, liga) {
  const porId = await wiki(WIKIDATA, { action: "query", list: "search", srsearch: `haswbstatement:P13590=${timeId}`, srlimit: 1 });
  const achado = (((porId.query || {}).search || [])[0] || {}).title;
  if (achado) return achado;
  const pais = PAIS_DA_LIGA[String(liga).split(".")[0]];
  if (!pais || !nomeTime) return null; // torneio internacional: sem o ID da ESPN, não arrisca
  const busca = await wiki(WIKIDATA, { action: "wbsearchentities", search: nomeTime, language: "pt", uselang: "pt", type: "item", limit: 10 });
  const ids = candidatosExatos(busca, nomeTime);
  if (!ids.length) return null;
  const ents = await wiki(WIKIDATA, { action: "wbgetentities", ids: ids.join("|"), props: "claims" });
  const ordenadas = { entities: Object.fromEntries(ids.filter((id) => (ents.entities || {})[id]).map((id) => [id, ents.entities[id]])) };
  return escolherClube(ordenadas, pais);
}

/** Técnico atual de um time de futebol pelo Wikidata (a ESPN não informa). null quando não acha com segurança. */
async function tecnicoFutebol(nomeTime, timeId, liga) {
  try {
    return await obter(`wikidata_tecnico_v2:${liga}:${timeId}`, 7 * 86400, async () => {
      const clube = await clubeNoWikidata(nomeTime, timeId, liga);
      if (!clube) return null;
      const ent = await wiki(WIKIDATA, { action: "wbgetentities", ids: clube, props: "claims" });
      const idTecnico = idTecnicoAtual((ent.entities || {})[clube]);
      if (!idTecnico) return null;
      const t = await wiki(WIKIDATA, { action: "wbgetentities", ids: idTecnico, props: "labels", languages: "pt|en" });
      const rotulos = ((t.entities || {})[idTecnico] || {}).labels || {};
      return (rotulos.pt || rotulos.en || {}).value || null;
    });
  } catch (_) {
    return null;
  }
}

/** "1° no Campeonato Brasileiro" (ou "1st in ...") → "1º lugar · Brasileirão Série A"; "3° no Divisão Atlântico" → "3º lugar · Divisão Atlântico". */
function posicaoNaLiga(resumo, liga, futebol) {
  const m = /^(\d+)\S*\s+(?:in|no|na|em)\s+(.+)$/.exec(String(resumo || "").trim());
  if (!m) return null;
  let onde = futebol ? nomeDaLiga(liga) : m[2];
  onde = onde.replace(/^(.+) Division$/, "Divisão $1").replace(/^(.+) Conference$/, "Conferência $1");
  return `${m[1]}º lugar · ${onde}`;
}

async function buscarTime(esporte, liga, timeId) {
  const [cfg] = dConfig(esporte, liga);
  const futebol = cfg.esporte === "soccer";
  // os pedidos independentes saem juntos; o /schedule traz o resumo do time e, ao contrário
  // do /teams/{id}, aceita pedidos do navegador
  const [d, venue, elenco] = await Promise.all([
    espnGet(`${D_BASE}/${cfg.esporte}/${liga}/teams/${timeId}/schedule`),
    (async () => {
      try {
        const [ano] = await temporadaAtual(cfg.esporte, liga);
        const core = await espnGet(`${D_CORE}/${cfg.esporte}/leagues/${liga}/seasons/${ano}/teams/${timeId}`);
        return (core.venue && core.venue.$ref ? await ref(core.venue.$ref) : core.venue) || {};
      } catch (_) {
        return {}; // sem estádio
      }
    })(),
    obter(`espn_elenco_v2:${esporte}:${liga}:${timeId}`, 21600, () => buscarElenco(esporte, liga, timeId)).catch(() => null),
  ]);
  const time = d.team || {};
  // técnico: o do elenco da ESPN nos esportes em que ele é confiável; no futebol, só o Wikidata
  // (o elenco da ESPN no futebol traz técnicos de anos atrás)
  let tecnico = (elenco && elenco.tecnico) || null;
  // a Wikidata leva de 1 a 2 s na primeira vez: a página do time não espera mais que 0,6 s. A busca
  // continua e fica guardada; a aba Detalhes e o campinho pedem o técnico pela rota /tecnico
  if (!tecnico && futebol) tecnico = await Promise.race([tecnicoFutebol(time.displayName, timeId, liga), new Promise((ok) => setTimeout(() => ok(null), 600))]);
  return {
    id: String(time.id || timeId),
    nome: time.displayName || null,
    logo: logoDe(time),
    liga_nome: nomeDaLiga(liga),
    posicao: posicaoNaLiga(time.standingSummary, liga, futebol),
    campanha: time.recordSummary || null,
    estadio: venue.fullName || null,
    cidade: (venue.address || {}).city || null,
    tecnico,
  };
}

async function buscarJogosTime(esporte, liga, timeId) {
  const [cfg] = dConfig(esporte, liga);
  const futebol = cfg.esporte === "soccer";
  // no futebol, "all" traz os jogos de todas as competições do time (liga, copas, continentais)
  const url = `${D_BASE}/${cfg.esporte}/${futebol ? "all" : liga}/teams/${timeId}/schedule`;
  const pedidos = [espnGet(url)];
  if (futebol) pedidos.push(espnGet(url, { fixture: true }).catch(() => ({ events: [] }))); // o futebol só manda os próximos assim
  const respostas = await Promise.all(pedidos);
  const vistos = new Set();
  const jogos = [];
  for (const ev of respostas.flatMap((r) => r.events || [])) {
    const id = String(ev.id || "");
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const ligaDoJogo = (futebol && ev.league && ev.league.slug) || liga;
    let j;
    try {
      j = partida(ev, esporte, ligaDoJogo);
    } catch (_) {
      continue; // competição com código que o app não entende
    }
    if (futebol && ev.league && ev.league.name && j.liga_nome === ligaDoJogo) j.liga_nome = ev.league.name;
    jogos.push(j);
  }
  return separarJogos(jogos, new Date().toISOString());
}

async function buscarEstatisticasTime(esporte, liga, timeId) {
  const [cfg] = dConfig(esporte, liga);
  const [ano, tipo, nome] = await temporadaAtual(cfg.esporte, liga);
  // no futebol a ESPN informa um código interno de temporada; as estatísticas de time ficam no tipo 1
  const t = cfg.esporte === "soccer" ? 1 : tipo || 2;
  try {
    const d = await espnGet(`${D_CORE}/${cfg.esporte}/leagues/${liga}/seasons/${ano}/types/${t}/teams/${timeId}/statistics`);
    return { temporada: nome, grupos: estatisticasDoTime(esporte, ((d.splits || {}).categories) || []) };
  } catch (erro) {
    if (/erro (400|404)/.test(String(erro.message))) return { temporada: nome, grupos: [] }; // competição sem estatística de time
    throw erro;
  }
}

const texto = (v) => (v && typeof v === "object" ? v.displayName || v.text || v.name || v.abbreviation || null : v || null);

function perfilAtleta(a) {
  const local = a.birthPlace || {};
  const extras = [
    ["Categoria", traduzPeso(texto(a.weightClass))],
    ["Equipe", texto(a.association)],
    ["Envergadura", a.displayReach],
    ["Base", traduzBase(texto(a.stance))],
    ["Draft", a.displayDraft],
    ["Experiência", a.displayExperience],
    ["Faculdade", texto(a.college)],
  ]
    .filter(([, v]) => v)
    .map(([rotulo, valor]) => ({ rotulo, valor }));
  const sumario = a.statsSummary || {};
  return {
    id: a.id,
    nome: a.displayName || a.fullName,
    foto: (a.headshot || {}).href || null,
    bandeira: (a.flag || {}).href || null,
    pais: a.citizenship || (a.flag || {}).alt || null,
    posicao: texto(a.position),
    time: texto(a.team),
    time_id: a.team && typeof a.team === "object" ? a.team.id || null : null,
    time_logo: a.team && typeof a.team === "object" ? logoDe(a.team) : null,
    camisa: a.jersey || null,
    idade: a.age ?? null,
    nascimento: a.displayDOB || (a.dateOfBirth || "").slice(0, 10) || null,
    local_nascimento: [local.city, local.state, local.country].filter(Boolean).join(", ") || null,
    altura: a.displayHeight || null,
    peso: a.displayWeight || null,
    extras,
    resumo_titulo: sumario.displayName || null,
    resumo: (sumario.statistics || []).map((st) => ({ rotulo: traduzEstatistica(st.displayName || st.name), valor: st.displayValue })),
  };
}

function categoriasStats(st) {
  return categoriasCarreira(st); // regras_esportes.js (com teste)
}

async function buscarAtleta(esporte, liga, atletaId) {
  const [cfg] = dConfig(esporte, liga);
  const base = `${D_BASE_ATLETA}/${cfg.esporte}/${liga}/athletes/${atletaId}`;
  let bio;
  try {
    bio = (await espnGet(base)).athlete || {};
  } catch (_) {
    bio = await espnGet(`${D_CORE}/${cfg.esporte}/leagues/${liga}/athletes/${atletaId}`);
  }
  const perfil = perfilAtleta(bio);
  Indice.registrar([{ esporte, liga, id: perfil.id || atletaId, nome: perfil.nome, descricao: perfil.time, imagem: perfil.foto }]);
  if (cfg.tipo === "luta" || cfg.tipo === "corrida" || cfg.esporte === "soccer") return { perfil, carreira: [], falhas: [] };
  let carreira = [];
  const falhas = [];
  try {
    carreira = categoriasStats(await espnGet(`${base}/stats`));
  } catch (_) {
    falhas.push("stats");
  }
  return { perfil, carreira, falhas };
}

/* ---------- F1 e UFC ---------- */

async function buscarEventos(esporte, liga) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE}/${cfg.esporte}/${liga}/scoreboard`);
  const cal = ((dados.leagues || [{}])[0] || {}).calendar || [];
  const agora = new Date();
  let eventos = [];
  for (const c of cal) {
    if (!c || typeof c !== "object") continue;
    const m = /events\/(\d+)/.exec(String((c.event || {}).$ref || ""));
    const ini = lerData(c.startDate);
    if (!m || !ini) continue;
    const fim = lerData(c.endDate) || ini;
    eventos.push({ id: m[1], nome: c.label || "", inicio: ini.toISOString(), fim: fim.toISOString(), data: dataBrDe(ini), estado: fim < agora ? 3 : ini <= agora ? 2 : 1 });
  }
  if (!eventos.length) {
    eventos = (dados.events || []).map((ev) => {
      const ini = lerData(ev.date);
      const fim = lerData(ev.endDate) || ini;
      return { id: String(ev.id), nome: ev.name, inicio: ini ? ini.toISOString() : null, fim: fim ? fim.toISOString() : null, data: dataBrDe(ini), estado: estadoEspn(ev.status)[0] };
    });
  }
  eventos.sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));
  let atual = eventos.findIndex((e) => e.estado !== 3);
  if (atual < 0) atual = eventos.length ? eventos.length - 1 : null;
  return { eventos, atual };
}

function sessao(comp, nomeEvento, liga) {
  const tipo = comp.type || {};
  const [nome, chave] = nomeSessaoF1(tipo.abbreviation || tipo.text || tipo.name);
  const status = comp.status || {};
  const [estado] = estadoEspn(status);
  const inicio = lerData(comp.date || comp.startDate);
  const resultados = [...(comp.competitors || [])]
    .sort((a, b) => (a.order || 999) - (b.order || 999))
    .map((c) => {
      const a = c.athlete || {};
      const bandeira = a.flag || {};
      return {
        posicao: c.order ?? null,
        id: a.id || c.id,
        nome: a.displayName || a.fullName,
        abreviacao: a.shortName || null,
        bandeira: bandeira.href || null,
        pais: bandeira.alt || null,
        equipe: texto(c.team) || texto((c.vehicle || {}).manufacturer),
        vencedor: Boolean(c.winner),
        info: Object.fromEntries((c.statistics || []).filter((s) => s && s.name).map((s) => [s.name, s.displayValue])),
      };
    });
  return {
    id: comp.id,
    nome,
    tipo: chave,
    inicio: inicio ? inicio.toISOString() : null,
    data: dataBrDe(inicio),
    estado,
    status: statusTexto("racing", status),
    resultados,
    transmissao: ondeAssistir("f1", { liga, inicio, evento: nomeEvento, sessao: chave }),
  };
}

function luta(comp) {
  const status = comp.status || {};
  const [estado] = estadoEspn(status);
  const tipo = comp.type || {};
  const lutadores = [...(comp.competitors || [])]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((c) => {
      const a = c.athlete || {};
      const bandeira = a.flag || {};
      return { id: c.id || a.id, nome: a.displayName || a.fullName, foto: (a.headshot || {}).href || null, bandeira: bandeira.href || null, pais: bandeira.alt || null, cartel: campanhaDe(c), vencedor: Boolean(c.winner) };
    });
  const resultado = status.result || {};
  const notas = (comp.notes || []).map((n) => n && (n.headline || n.text)).filter(Boolean);
  const inicio = lerData(comp.date || comp.startDate);
  return {
    id: comp.id,
    inicio: inicio ? inicio.toISOString() : null,
    estado,
    categoria: traduzPeso(tipo.text || tipo.abbreviation || notas[0]),
    card: (comp.cardSegment || {}).description || null,
    lutadores,
    resultado: estado === 3 ? traduzResultado(resultado.displayName || resultado.name) : null,
    round: estado === 3 ? status.period || null : null,
    tempo: estado === 3 ? status.displayClock || null : null,
    status: statusTexto("mma", status),
  };
}

async function buscarEvento(esporte, liga, eventoId, data) {
  const [cfg] = dConfig(esporte, liga);
  if (!data) {
    const cal = await buscarEventos(esporte, liga);
    const achado = cal.eventos.find((e) => e.id === String(eventoId));
    data = achado && achado.data ? achado.data : hojeEmBR();
  }
  const eventos = await eventosPeriodo(`${D_BASE}/${cfg.esporte}/${liga}/scoreboard`, somarDiasIso(data, -2), somarDiasIso(data, 5));
  const ev = eventos.find((e) => String(e.id) === String(eventoId));
  if (!ev) throw new ErroRota(404, "Evento não encontrado nessas datas.");
  const nome = ev.name || ev.shortName || "";
  const ini = lerData(ev.date);
  const fim = lerData(ev.endDate) || ini;
  const base = { id: String(eventoId), nome, local: localDe(ev.circuit) || localDe(((ev.competitions || [{}])[0] || {}).venue), inicio: ini ? ini.toISOString() : null, fim: fim ? fim.toISOString() : null, data: dataBrDe(ini) };
  if (cfg.tipo === "corrida") {
    const sessoes = (ev.competitions || []).map((c) => sessao(c, nome, liga)).sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));
    Indice.registrar(sessoes.flatMap((x) => x.resultados.map((r) => ({ esporte, liga, id: r.id, nome: r.nome, descricao: r.equipe || "Fórmula 1" }))));
    return { ...base, sessoes };
  }
  const lutas = (ev.competitions || []).map((c, i) => [i, luta(c)]).sort((a, b) => (b[1].inicio || "").localeCompare(a[1].inicio || "") || b[0] - a[0]).map(([, l]) => l);
  Indice.registrar(lutas.flatMap((l) => l.lutadores.map((p) => ({ esporte, liga, id: p.id, nome: p.nome, descricao: ["UFC", l.categoria].filter(Boolean).join(" "), imagem: p.foto }))));
  const inicioCard = lutas.map((l) => l.inicio).filter(Boolean).sort()[0] || base.inicio;
  return { ...base, lutas, transmissao: ondeAssistir(esporte, { liga, inicio: inicioCard, evento: nome }) };
}

/* =========================================================================
   Equivalente ao espn_extra.py
   ========================================================================= */

const CATEGORIAS_LIDERES_PT = {
  goals: "Artilharia", goalsleaders: "Artilharia", totalgoals: "Artilharia", assists: "Assistências", assistsleaders: "Assistências",
  goalassists: "Assistências", yellowcards: "Cartões amarelos", redcards: "Cartões vermelhos", shotsontarget: "Finalizações no gol",
  totalshots: "Finalizações", saves: "Defesas", cleansheet: "Jogos sem sofrer gol", cleansheets: "Jogos sem sofrer gol",
  passingyards: "Jardas de passe", passingtouchdowns: "Touchdowns de passe", quarterbackrating: "Rating de quarterback",
  rushingyards: "Jardas de corrida", rushingtouchdowns: "Touchdowns de corrida", receivingyards: "Jardas recebidas",
  receivingtouchdowns: "Touchdowns recebidos", receptions: "Recepções", totaltackles: "Tackles", tackles: "Tackles", sacks: "Sacks",
  interceptions: "Interceptações", passesdefended: "Passes defendidos", points: "Pontos", pointspergame: "Pontos por jogo",
  rebounds: "Rebotes", reboundspergame: "Rebotes por jogo", assistspergame: "Assistências por jogo", steals: "Roubos de bola",
  stealspergame: "Roubos por jogo", blocks: "Tocos", blockspergame: "Tocos por jogo", fieldgoalpercentage: "Aproveitamento (FG%)",
  threepointfieldgoalsmade: "Bolas de três", threepointfieldgoalpercentage: "Bolas de três (%)",
  foulssuffered: "Faltas sofridas", foulscommitted: "Faltas cometidas", accuratepasses: "Passes certos",
};
const ORDEM_LIDERES = ["Artilharia", "Assistências", "Cartões amarelos", "Cartões vermelhos", "Pontos por jogo", "Rebotes por jogo", "Assistências por jogo",
  "Jardas de passe", "Touchdowns de passe", "Rating de quarterback", "Jardas de corrida", "Touchdowns de corrida", "Jardas recebidas", "Recepções",
  "Touchdowns recebidos", "Tackles", "Sacks", "Interceptações"];
const ESPERADOS = { futebol: ["Artilharia", "Assistências", "Cartões amarelos", "Cartões vermelhos"], nfl: ["Jardas de passe", "Jardas de corrida", "Jardas recebidas", "Tackles", "Sacks", "Interceptações"],
  mlb: ["Média de rebatidas", "Home runs", "Corridas impulsionadas", "ERA", "Strikeouts"], nhl: ["Gols", "Assistências", "Pontos", "Defesas (%)"] };

function nomeCategoria(c, esporte) {
  const proprio = nomeLiderEsporte(esporte, c.name); // MLB e NHL: "wins" e "goals" mudam de sentido
  if (proprio) return proprio;
  const interno = semAcento(c.name).replace(/ /g, "");
  if (CATEGORIAS_LIDERES_PT[interno]) return CATEGORIAS_LIDERES_PT[interno];
  const exibido = c.displayName || c.shortDisplayName || c.name || "";
  return CATEGORIAS_LIDERES_PT[semAcento(exibido).replace(/ /g, "")] || traduzEstatistica(exibido);
}

function categoriasLideres(d) {
  if (d.leaders && !Array.isArray(d.leaders)) return d.leaders.categories || [];
  if (Array.isArray(d.leaders)) return d.leaders;
  return d.categories || [];
}

async function temporadaAtual(sport, liga) {
  try {
    const d = await espnGet(`${D_BASE}/${sport}/${liga}/scoreboard`);
    const t = ((d.leagues || [{}])[0] || {}).season || {};
    let tipo = t.type;
    if (tipo && typeof tipo === "object") tipo = tipo.type || tipo.id;
    return [Number(t.year) || new Date().getFullYear(), /^\d+$/.test(String(tipo || "")) ? Number(tipo) : null, t.displayName || null];
  } catch (_) {
    return [new Date().getFullYear(), null, null];
  }
}

/** Futebol: artilharia e assistências pelo /statistics da ESPN. Um pedido só, com nome e time de cada um
    (o Core API pede um por atleta e leva de 3 a 5 s), e vale para as copas, que o Core API guarda por fase.
    Sem números ali, cai no caminho completo. Os cartões vêm depois, pela rota com ?completo=1. */
async function buscarLideresFutebolRapido(liga, limite = 10) {
  let r = { categorias: [] };
  try {
    r = Liga.lideresDoSite(await espnGet(`${D_BASE}/soccer/${liga}/statistics`), limite);
  } catch (_) {
    /* sem a rota: o caminho completo */
  }
  if (!r.categorias.length) return buscarLideres("futebol", liga, limite);
  Indice.registrar(r.categorias.flatMap((c) => c.lideres.map((j) => ({ esporte: "futebol", liga, id: j.id, nome: j.nome, descricao: j.time }))));
  return { categorias: r.categorias, faltando: [], temporada: r.temporada, temporada_anterior: false, parcial: true };
}

async function buscarLideres(esporte, liga, limite = 10) {
  const [cfg] = dConfig(esporte, liga);
  const [ano, tipo, nomeTemporada] = await temporadaAtual(cfg.esporte, liga);
  const americano = ["nfl", "nba", "mlb", "nhl"].includes(esporte); // sempre a temporada regular
  const anos = americano ? [ano, ano - 1] : [ano, ano - 1, ano - 2];
  // no futebol o "tipo" do scoreboard é um código interno (13907): os líderes ficam no tipo 1
  const tipos = americano ? [2] : [...new Set([1, tipo, null].filter((t) => t !== undefined))];
  let cats = [];
  let anoAchado = null;
  for (const a of anos) {
    for (const t of tipos) {
      const caminho = t ? `seasons/${a}/types/${t}/leaders` : `seasons/${a}/leaders`;
      try {
        cats = categoriasLideres(await espnGet(`${D_CORE}/${cfg.esporte}/leagues/${liga}/${caminho}`, { limit: limite }));
      } catch (_) {
        cats = [];
      }
      if (cats.length) {
        anoAchado = a;
        break;
      }
    }
    if (cats.length) break;
  }
  if (!cats.length) {
    return { categorias: [], faltando: ESPERADOS[esporte] || [], temporada: null, aviso: "A ESPN não tem líderes desta competição agora. Torneios como Eurocopa e Copa América só têm números enquanto estão sendo disputados." };
  }
  const refs = cats.flatMap((c) => (c.leaders || []).slice(0, limite).flatMap((l) => [soRef(l.athlete), soRef(l.team)]));
  const resolvidos = await resolver(refs);
  const refs2 = cats.flatMap((c) => (c.leaders || []).slice(0, limite).map((l) => (!l.team ? soRef(expandir(l.athlete, resolvidos).team) : null)));
  Object.assign(resolvidos, await resolver(refs2));
  const saida = [];
  const vistos = new Set();
  for (const c of cats) {
    // MLB e NHL: só as categorias traduzidas na tabela do esporte
    if (LIDERES_POR_ESPORTE[esporte] && !nomeLiderEsporte(esporte, c.name)) continue;
    const nome = nomeCategoria(c, esporte);
    if (vistos.has(nome)) continue;
    const lideres = (c.leaders || []).slice(0, limite).map((l, i) => {
      const at = expandir(l.athlete, resolvidos);
      const t = expandir(l.team || at.team, resolvidos);
      return { posicao: i + 1, id: at.id, nome: at.displayName || at.fullName || "?", time: t.abbreviation || t.shortDisplayName || t.displayName || null, time_logo: logoDe(t), valor: l.displayValue ?? l.value };
    });
    if (lideres.length) {
      vistos.add(nome);
      saida.push({ chave: c.name, nome, lideres });
    }
  }
  const ordem = LIDERES_POR_ESPORTE[esporte] ? Object.values(LIDERES_POR_ESPORTE[esporte]) : ORDEM_LIDERES;
  saida.sort((a, b) => (ordem.indexOf(a.nome) + 1 || 99) - (ordem.indexOf(b.nome) + 1 || 99));
  Indice.registrar(saida.flatMap((c) => c.lideres.map((j) => ({ esporte, liga, id: j.id, nome: j.nome, descricao: j.time }))));
  return {
    categorias: saida,
    faltando: (ESPERADOS[esporte] || []).filter((x) => !vistos.has(x)),
    temporada: anoAchado === ano && nomeTemporada ? nomeTemporada : String(anoAchado),
    temporada_anterior: anoAchado !== ano,
  };
}

function nomeRanking(nome) {
  const t = semAcento(nome);
  if (t.includes("pound")) return `Peso por peso (${t.includes("women") ? "feminino" : "masculino"})`;
  return traduzPeso(nome) || nome;
}

async function buscarRankingUfc() {
  const d = await espnGet(`${D_CORE}/mma/leagues/ufc/rankings`);
  const itens = d.items || d.rankings || [];
  const r1 = await resolver(itens.map(soRef));
  const rankings = itens.map((i) => expandir(i, r1));
  const atletas = await resolver(rankings.flatMap((r) => (r.ranks || []).map((rk) => soRef(rk.athlete))));
  const categorias = [];
  for (const r of rankings) {
    const lutadores = [];
    for (const rk of r.ranks || []) {
      const a = expandir(rk.athlete, atletas);
      const pos = rk.current ?? null;
      const m = /athletes\/(\d+)/.exec(soRef(rk.athlete) || "");
      lutadores.push({
        posicao: pos,
        campeao: (pos === 0 || pos === null) && !lutadores.length,
        anterior: rk.previous ?? null,
        id: a.id || (m ? m[1] : null),
        nome: a.displayName || a.fullName || "?",
        bandeira: (a.flag || {}).href || null,
        pais: (a.flag || {}).alt || a.citizenship || null,
        cartel: rk.record && rk.record.summary ? rk.record.summary : null,
      });
    }
    const nome = r.name || r.displayName || r.shortName || "";
    if (lutadores.length) categorias.push({ nome: nomeRanking(nome), original: nome, lutadores });
  }
  Indice.registrar(categorias.filter((c) => !/peso por peso/i.test(c.nome)).flatMap((c) => c.lutadores.map((l) => ({ esporte: "ufc", liga: "ufc", id: l.id, nome: l.nome, descricao: `UFC, ${c.nome}` }))));
  return { categorias };
}

async function buscarLutas(atletaId, limite = 30) {
  const base = `${D_CORE}/mma/leagues/ufc/athletes/${atletaId}`;
  const d = await espnGet(`${base}/eventlog`, { limit: 100 });
  const eventos = d.events;
  let itens = eventos && !Array.isArray(eventos) ? eventos.items : eventos;
  itens = (itens || d.items || []).filter((i) => i && i.played !== false);
  const r1 = await resolver(itens.flatMap((i) => [soRef(i.competition), soRef(i.event)]));
  let lutas = itens.map((i) => [expandir(i.competition, r1), expandir(i.event, r1)]).filter(([c]) => Object.keys(c).length);
  lutas.sort((a, b) => (b[0].date || b[1].date || "").localeCompare(a[0].date || a[1].date || ""));
  lutas = lutas.slice(0, limite);
  const r2 = await resolver(lutas.flatMap(([c]) => [soRef(c.status), ...(c.competitors || []).flatMap((x) => [soRef(x.athlete), soRef(x)])]));
  const saida = lutas.map(([comp, ev]) => {
    const cs = (comp.competitors || []).map((x) => (soRef(x) ? expandir(x, r2) : x));
    let eu = cs.find((c) => String(c.id) === String(atletaId));
    let outro = cs.find((c) => c !== eu) || {};
    if (!eu && cs.length) {
      eu = cs.find((c) => String(soRef(c.athlete) || "").includes(String(atletaId))) || cs[0];
      outro = cs.find((c) => c !== eu) || {};
    }
    const adv = expandir(outro.athlete, r2);
    const st = expandir(comp.status, r2);
    const res = st.result || {};
    const resultado = eu && eu.winner ? "V" : outro.winner ? "D" : (st.type || {}).completed ? "E" : null;
    const metodo = res.displayName || res.name || (st.type || {}).detail || null;
    return {
      data: (comp.date || ev.date || "").slice(0, 10) || null,
      evento: ev.name || ev.shortName || null,
      adversario: adv.displayName || adv.fullName || "?",
      adversario_id: outro.id || adv.id || null,
      resultado,
      metodo: resultado === "V" || resultado === "D" ? traduzResultado(metodo) : metodo,
      round: st.period || null,
      tempo: st.displayClock || null,
    };
  });
  Indice.registrar(saida.map((l) => ({ esporte: "ufc", liga: "ufc", id: l.adversario_id, nome: l.adversario, descricao: "UFC" })));
  return {
    tipo: "lutas",
    lutas: saida,
    cartel_ufc: { vitorias: saida.filter((l) => l.resultado === "V").length, derrotas: saida.filter((l) => l.resultado === "D").length, empates: saida.filter((l) => l.resultado === "E").length },
  };
}

const STATS_FUTEBOL = [
  ["jogos", ["appearances", "gamesPlayed"]], ["titular", ["starts"]], ["gols", ["totalGoals", "goals"]], ["assistencias", ["goalAssists", "assists"]],
  ["amarelos", ["yellowCards"]], ["vermelhos", ["redCards"]], ["defesas", ["saves"]], ["gols_sofridos", ["goalsConceded"]],
];

async function buscarCarreiraFutebol(liga, atletaId, limite = 20) {
  const d = await espnGet(`${D_CORE}/soccer/leagues/${liga}/athletes/${atletaId}/statisticslog`);
  const brutas = [];
  for (const e of d.entries || d.items || []) {
    const est = e.statistics || [];
    const porTime = est.filter((x) => x.type !== "total");
    for (const x of porTime.length ? porTime : est) {
      const st = soRef(x.statistics);
      if (st) brutas.push({ temporada: soRef(e.season), stats: st, time: soRef(x.team) });
    }
  }
  const lista = brutas.slice(0, limite * 3);
  const r = await resolver(lista.flatMap((b) => [b.temporada, b.stats, b.time]));
  let linhas = lista.map((b) => {
    const temp = r[b.temporada] || {};
    const stats = {};
    for (const cat of ((r[b.stats] || {}).splits || {}).categories || []) {
      for (const st of cat.stats || []) if (st.name && !(st.name in stats)) stats[st.name] = st.displayValue !== undefined && st.displayValue !== "" ? st.displayValue : st.value;
    }
    const t = r[b.time] || {};
    const m = /\/leagues\/([^/?]+)\//.exec(b.stats);
    const ano = temp.year || (/\/seasons\/(\d{4})/.exec(b.stats) || [])[1];
    const linha = {
      temporada: temp.displayName || (ano ? String(ano) : "?"),
      ano: Number(ano) || 0,
      competicao: m ? nomeDaLiga(m[1]) : null,
      time: t.displayName || t.shortDisplayName || null,
      time_logo: logoDe(t),
    };
    for (const [chave, nomes] of STATS_FUTEBOL) {
      const n = nomes.find((x) => x in stats);
      linha[chave] = n ? stats[n] : null;
    }
    return linha;
  });
  linhas = linhas.filter((l) => STATS_FUTEBOL.some(([c]) => l[c] !== null && l[c] !== "" && l[c] !== "0" && l[c] !== 0));
  linhas.sort((a, b) => b.ano - a.ano || String(b.competicao || "").localeCompare(String(a.competicao || "")));
  linhas = linhas.slice(0, limite);
  const totais = {};
  for (const [c] of STATS_FUTEBOL) totais[c] = linhas.reduce((s, l) => s + (parseInt(String(l[c] || "0").replace(/,/g, ""), 10) || 0), 0);
  return { tipo: "temporadas", temporadas: linhas, totais };
}

/* ---------- Busca ---------- */

const UID_ESPORTE = { 600: "futebol", 20: "nfl", 40: "nba", 1: "mlb", 70: "nhl", 3301: "ufc", 2000: "f1" };
const SEGMENTO_ESPORTE = { soccer: "futebol", futebol: "futebol", football: "futebol", nfl: "nfl", nba: "nba", baseball: "mlb", mlb: "mlb", hockey: "nhl", nhl: "nhl", mma: "ufc", ufc: "ufc", f1: "f1", racing: "f1" };
const LIGA_PADRAO = { futebol: "bra.1", nfl: "nfl", nba: "nba", mlb: "mlb", nhl: "nhl", ufc: "ufc", f1: "f1" };

function esporteDoResultado(c) {
  const m = /^s:(\d+)/.exec(c.uid || "");
  if (m && UID_ESPORTE[m[1]]) return UID_ESPORTE[m[1]];
  const link = ((c.link || {}).web) || c.href || "";
  const m2 = /espn\.[a-z.]+\/([a-z0-9-]+)\//.exec(link);
  if (m2 && SEGMENTO_ESPORTE[m2[1]]) return SEGMENTO_ESPORTE[m2[1]];
  const t = semAcento(["sport", "defaultSport", "league", "description", "subtitle"].map((k) => c[k] || "").join(" "));
  for (const [k, v] of [["soccer", "futebol"], ["nfl", "nfl"], ["nba", "nba"], ["mlb", "mlb"], ["baseball", "mlb"], ["nhl", "nhl"], ["hockey", "nhl"], ["mma", "ufc"], ["ufc", "ufc"], ["formula 1", "f1"]]) if (t.includes(k)) return v;
  return null;
}

async function buscarEspn(texto, limite = 12) {
  const jogadores = [];
  const times = [];
  const vistos = new Set();
  for (const idioma of [{ lang: "en", region: "us" }, { lang: "pt", region: "br" }]) {
    let d;
    try {
      d = await espnGet("https://site.web.api.espn.com/apis/search/v2", { query: texto, limit: limite, ...idioma });
    } catch (_) {
      continue;
    }
    for (const g of d.results || d.items || []) {
      const tipo = semAcento(g.type || g.displayName || "");
      for (const c of g.contents || g.items || []) {
        const esporte = esporteDoResultado(c);
        if (!esporte) continue;
        const uid = c.uid || "";
        const liga = esporte === "futebol" ? c.defaultLeagueSlug || c.leagueSlug || LIGA_PADRAO.futebol : LIGA_PADRAO[esporte];
        const img = c.image;
        const item = { esporte, liga, nome: c.displayName || c.name, descricao: c.subtitle || c.description || null, imagem: img && typeof img === "object" ? img.default || null : typeof img === "string" ? img : null };
        const mA = /~a:(\d+)/.exec(uid) || (["player", "athlete"].includes(tipo) ? /\/id\/(\d+)/.exec(String((c.link || {}).web || "")) : null);
        const mT = /~t:(\d+)/.exec(uid);
        if (mA) {
          const k = `j:${esporte}:${mA[1]}`;
          if (!vistos.has(k)) {
            vistos.add(k);
            jogadores.push({ ...item, id: mA[1] });
          }
        } else if (mT) {
          const k = `t:${esporte}:${mT[1]}`;
          if (!vistos.has(k)) {
            vistos.add(k);
            times.push({ ...item, id: mT[1] });
          }
        }
      }
    }
  }
  Indice.registrar(jogadores.concat(times.map((t) => ({ ...t, tipo: "time" }))));
  return { jogadores: jogadores.slice(0, limite), times: times.slice(0, limite) };
}

const APELIDOS = {
  "bra.1": ["brasileirao", "serie a brasil", "campeonato brasileiro"], "bra.2": ["serie b"], "bra.copa_do_brazil": ["copa do brasil"],
  "conmebol.libertadores": ["libertadores"], "conmebol.sudamericana": ["sul-americana", "sulamericana", "sudamericana"],
  "uefa.champions": ["champions", "liga dos campeoes"], "uefa.europa": ["liga europa", "europa league"], "eng.1": ["premier league", "inglaterra", "campeonato ingles"],
  "esp.1": ["la liga", "laliga", "espanha", "campeonato espanhol"], "ita.1": ["serie a", "italia", "calcio", "campeonato italiano"],
  "ger.1": ["bundesliga", "alemanha", "campeonato alemao"], "fra.1": ["ligue 1", "franca", "campeonato frances"], "por.1": ["liga portugal", "portugal"],
  "usa.1": ["mls", "estados unidos"], "fifa.world": ["copa do mundo", "mundial"], "conmebol.america": ["copa america"], "uefa.euro": ["eurocopa", "euro"],
  "uefa.nations": ["liga das nacoes", "nations league"], "fifa.friendly": ["amistosos", "selecoes"], nba: ["basquete"], nfl: ["futebol americano"],
  mlb: ["beisebol", "baseball", "liga de beisebol"], nhl: ["hoquei", "hockey", "hoquei no gelo"],
  "ned.1": ["eredivisie", "holanda", "campeonato holandes"],
  "esp.copa_del_rey": ["copa do rei", "copa del rey", "copa da espanha"],
  "esp.super_cup": ["supercopa da espanha", "supercopa espanhola"],
  "eng.fa": ["fa cup", "copa da inglaterra"],
  "eng.league_cup": ["copa da liga inglesa", "carabao cup", "league cup", "efl cup"],
  "eng.charity": ["community shield", "supercopa da inglaterra"],
  "ger.dfb_pokal": ["copa da alemanha", "dfb pokal", "pokal"],
  "ger.super_cup": ["supercopa da alemanha"],
  "ita.coppa_italia": ["coppa italia", "copa da italia"],
  "ita.super_cup": ["supercopa da italia", "supercoppa"],
  "fra.coupe_de_france": ["copa da franca", "coupe de france"],
  "fra.super_cup": ["supercopa da franca", "trophee des champions"],
  "por.taca.portugal": ["taca de portugal", "copa de portugal"],
  "ned.cup": ["copa da holanda", "knvb beker"],
  "bra.supercopa_do_brazil": ["supercopa do brasil", "supercopa rei"],
  "conmebol.recopa": ["recopa", "recopa sul-americana"],
  "uefa.super_cup": ["supercopa da uefa", "supercopa europeia"],
  "fifa.cwc": ["mundial de clubes", "copa do mundo de clubes"],
};

function procurarLigas(texto) {
  const alvo = semAcento(texto);
  if (alvo.length < 2) return [];
  const candidatas = [{ esporte: "boxe", liga: "boxe", nome: "Boxe", tipo_esporte: "boxe" }];
  for (const [id, cfg] of Object.entries(D_ESPORTES)) for (const l of cfg.ligas) candidatas.push({ esporte: id, liga: l.id, nome: l.nome, tipo_esporte: cfg.tipo });
  return candidatas.filter((c) => [c.nome, ...(APELIDOS[c.liga] || [])].some((n) => semAcento(n).includes(alvo)));
}

let semeando = false;

async function semearSePreciso() {
  if (semeando) return;
  const marca = await Banco.ler("dados", "indice_semente_v1");
  if (marca && Date.now() / 1000 < marca.vale_ate) return;
  semeando = true;
  await Banco.gravar("dados", { chave: "indice_semente_v1", valor: true, salvo_em: Date.now() / 1000, vale_ate: Date.now() / 1000 + 7 * 86400 });
  // em segundo plano: times de todas as competições e o ranking do UFC
  (async () => {
    try {
      const tarefas = [];
      for (const [esporte, cfg] of Object.entries(D_ESPORTES)) {
        if (cfg.tipo !== "partidas") continue;
        for (const l of cfg.ligas) tarefas.push([esporte, cfg, l]);
      }
      for (let i = 0; i < tarefas.length; i += 4) {
        await Promise.all(
          tarefas.slice(i, i + 4).map(async ([esporte, cfg, l]) => {
            try {
              const d = await espnGet(`${D_BASE}/${cfg.esporte}/${l.id}/teams`, { limit: 500 });
              const achados = [];
              for (const sp of d.sports || []) for (const lg of sp.leagues || []) for (const t of lg.teams || []) {
                const time = t.team || t;
                achados.push({ tipo: "time", esporte, liga: l.id, id: time.id, nome: time.displayName, descricao: l.nome, imagem: logoDe(time) });
              }
              await Indice.registrar(achados);
            } catch (_) {
              /* segue com as outras */
            }
          })
        );
      }
      try {
        await obter("ufc_ranking_v1", 6 * 3600, buscarRankingUfc);
      } catch (_) {
        /* ignora */
      }
    } finally {
      semeando = false;
    }
  })();
}

/* =========================================================================
   Boxe (boxe_eventos.json e Wikipédia)
   ========================================================================= */

const idLutador = (nome) => semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function boxeEventos() {
  const conteudo = await jsonLocal("dados/boxe_eventos.json");
  const agora = new Date();
  const eventos = (conteudo.eventos || []).map((e) => {
    const inicio = lerData(e.inicio);
    const lutas = e.lutas || [];
    const terminou = lutas.some((l) => l.vencedor || l.resultado);
    let estado;
    if (inicio) estado = terminou || inicio.getTime() + 5 * 3600000 < agora.getTime() ? 3 : inicio <= agora ? 2 : 1;
    else estado = terminou || (e.data || "9999") < hojeEmBR() ? 3 : 1;
    const canais = e.canais || [];
    return {
      id: e.id || e.nome,
      nome: e.nome || "",
      data: e.data || dataBrDe(inicio),
      inicio: inicio ? inicio.toISOString() : null,
      local: e.local || null,
      estado,
      lutas: lutas.map((l) => ({ lutadores: l.lutadores || [], ids: (l.lutadores || []).map(idLutador), categoria: l.categoria || null, titulo: l.titulo || null, vencedor: l.vencedor || null, resultado: l.resultado || null })),
      transmissao: canais.length
        ? { canais, confirmado: true, observacao: e.observacao || null, conferido_em: e.conferido_em || null, fonte: e.fonte || null }
        : ondeAssistir("boxe", { data: e.data, inicio, evento: e.nome }),
    };
  });
  eventos.sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.inicio || "").localeCompare(b.inicio || ""));
  Indice.registrar(eventos.flatMap((e) => e.lutas.flatMap((l) => l.lutadores.map((n) => ({ esporte: "boxe", liga: "boxe", id: idLutador(n), nome: n, descricao: l.categoria ? `Boxe, ${l.categoria}` : "Boxe" })))));
  return eventos;
}

async function wiki(base, params, limiteMs = 6000) {
  const u = new URL(`${base}/w/api.php`);
  for (const [k, v] of Object.entries({ ...params, format: "json", formatversion: 2, origin: "*" })) u.searchParams.set(k, v);
  // Wikipédia lenta vira falha em vez de travar a tela
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), limiteMs);
  let r;
  try {
    r = await fetch(u.toString(), { signal: controle.signal });
  } catch (erro) {
    throw new Error(controle.signal.aborted ? "a Wikipédia demorou demais para responder" : `a Wikipédia não respondeu (${erro.message})`);
  } finally {
    clearTimeout(relogio);
  }
  if (!r.ok) throw new Error(`a Wikipédia respondeu com erro ${r.status}`);
  return r.json();
}

const PESOS_BOXE = [
  ["light heavyweight", "Meio-pesado"], ["super middleweight", "Supermédio"], ["light middleweight", "Superwelter"], ["super welterweight", "Superwelter"],
  ["light welterweight", "Superleve"], ["super lightweight", "Superleve"], ["super featherweight", "Superpena"], ["super bantamweight", "Supergalo"],
  ["super flyweight", "Supermosca"], ["light flyweight", "Minimosca"], ["cruiserweight", "Cruzador"], ["bridgerweight", "Bridger"],
  ["heavyweight", "Pesado"], ["middleweight", "Médio"], ["welterweight", "Meio-médio"], ["lightweight", "Leve"], ["featherweight", "Pena"],
  ["bantamweight", "Galo"], ["flyweight", "Mosca"], ["minimumweight", "Palha"],
];
const NACIONALIDADES = {
  "northern irish": "Norte-irlandês", "puerto rican": "Porto-riquenho", british: "Britânico", english: "Inglês", american: "Americano", mexican: "Mexicano",
  german: "Alemão", brazilian: "Brasileiro", ukrainian: "Ucraniano", japanese: "Japonês", australian: "Australiano", irish: "Irlandês", canadian: "Canadense",
  cuban: "Cubano", polish: "Polonês", kazakh: "Cazaque", uzbek: "Uzbeque", filipino: "Filipino", russian: "Russo", french: "Francês", italian: "Italiano",
  spanish: "Espanhol", argentine: "Argentino", venezuelan: "Venezuelano", colombian: "Colombiano", dominican: "Dominicano", albanian: "Albanês",
  nigerian: "Nigeriano", ghanaian: "Ganês", welsh: "Galês", scottish: "Escocês", turkish: "Turco", swedish: "Sueco", chinese: "Chinês", korean: "Coreano",
};

function modeloWiki(txt) {
  const partes = txt.replace(/^\{\{|\}\}$/g, "").split("|").map((p) => p.trim());
  const nome = (partes[0] || "").toLowerCase();
  const pos = partes.slice(1).filter((p) => !p.includes("="));
  const nom = Object.fromEntries(partes.slice(1).filter((p) => p.includes("=")).map((p) => [p.split("=")[0].trim().toLowerCase(), p.split("=").slice(1).join("=").trim()]));
  if (nome.startsWith("birth date")) {
    const [a, m, d] = pos.slice(0, 3).map(Number);
    if (!a || !m || !d) return "";
    const hoje = new Date();
    const idade = hoje.getFullYear() - a - (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d) ? 1 : 0);
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a} (${idade} anos)`;
  }
  if (nome === "height") {
    if (nom.m) return `${Number(nom.m).toFixed(2).replace(".", ",")} m`;
    if (nom.cm) return `${nom.cm} cm`;
    const total = (Number(nom.ft || 0) * 12 + Number(nom.in || 0)) * 2.54;
    return total ? `${(total / 100).toFixed(2).replace(".", ",")} m` : "";
  }
  if (nome === "convert" && pos.length >= 2) {
    if (pos[1] === "in") return `${Math.round(Number(pos[0]) * 2.54)} cm`;
    return `${pos[0]} ${pos[1]}`;
  }
  if (["flag", "flagcountry", "flagicon", "flagu", "nowrap", "small"].includes(nome) && pos.length) return pos[0];
  return "";
}

function limparWiki(v) {
  let s = v.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/g, ", ");
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{[^{}]*\}\}/g, (m) => modeloWiki(m));
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1").replace(/'''?/g, "").replace(/<[^>]+>/g, "");
  return s.replace(/\s+/g, " ").trim().replace(/^[ ,]+|[ ,]+$/g, "");
}

function quadroWiki(w) {
  const campos = {};
  for (const linha of w.split("\n")) {
    const m = /^\s*\|\s*([A-Za-z_ ]+?)\s*=\s*(.*)$/.exec(linha);
    if (m) campos[m[1].trim().toLowerCase().replace(/ /g, "_")] = limparWiki(m[2]);
  }
  return campos;
}

const numeroDe2 = (t) => {
  const m = /\d+/.exec(t || "");
  return m ? Number(m[0]) : null;
};

function pesoBoxe(t) {
  let x = String(t || "").toLowerCase();
  const achados = [];
  for (const [en, pt] of PESOS_BOXE) {
    if (x.includes(en)) {
      achados.push([x.indexOf(en), pt]);
      x = x.replace(en, " ".repeat(en.length));
    }
  }
  achados.sort((a, b) => a[0] - b[0]);
  return [...new Set(achados.map(([, pt]) => pt))].join(", ") || t || null;
}

function nacionalidade(t) {
  if (!t) return null;
  let s = t;
  for (const [en, pt] of Object.entries(NACIONALIDADES).sort((a, b) => b[0].length - a[0].length)) s = s.replace(new RegExp(`\\b${en}\\b`, "gi"), pt);
  return s;
}

async function boxeLutador(nome) {
  nome = String(nome || "").trim();
  const perfil = { id: idLutador(nome), nome, encontrado: false, fonte: null, lutas_agenda: [] };
  const busca = await wiki("https://en.wikipedia.org", { action: "query", list: "search", srsearch: `${nome} boxer`, srlimit: 5 });
  const sobrenome = semAcento(nome).split(" ").pop();
  const titulo = ((busca.query || {}).search || []).map((r) => r.title).find((t) => semAcento(t).includes(sobrenome));
  if (titulo) {
    const pag = await wiki("https://en.wikipedia.org", {
      action: "query", prop: "revisions|pageimages|langlinks|extracts", rvprop: "content", rvslots: "main", rvsection: 0,
      titles: titulo, pithumbsize: 400, lllang: "pt", exintro: 1, explaintext: 1, exsentences: 3,
    });
    const p = ((pag.query || {}).pages || [{}])[0] || {};
    const conteudo = ((((p.revisions || [{}])[0] || {}).slots || {}).main || {}).content || "";
    const c = quadroWiki(conteudo);
    const tituloPt = ((p.langlinks || [])[0] || {}).title || null;
    let resumoPt = null;
    if (tituloPt) {
      try {
        const pt = await wiki("https://pt.wikipedia.org", { action: "query", prop: "extracts", titles: tituloPt, exintro: 1, explaintext: 1, exsentences: 3 });
        resumoPt = (((pt.query || {}).pages || [{}])[0] || {}).extract || null;
      } catch (_) {
        resumoPt = null;
      }
    }
    const v = numeroDe2(c.wins);
    Object.assign(perfil, {
      encontrado: true,
      nome: c.name || titulo,
      apelido: c.nickname || null,
      foto: (p.thumbnail || {}).source || null,
      resumo: resumoPt || p.extract || null,
      resumo_idioma: resumoPt ? "pt" : "en",
      nacionalidade: nacionalidade(c.nationality),
      nascimento: c.birth_date || null,
      categoria: pesoBoxe(c.weight || c.weight_class || c.division),
      altura: c.height || null,
      envergadura: c.reach || null,
      base: { orthodox: "Destro (ortodoxo)", southpaw: "Canhoto", switch: "Troca de base" }[String(c.stance || "").trim().toLowerCase()] || c.stance || null,
      cartel: v !== null ? { lutas: numeroDe2(c.total), vitorias: v, nocautes: numeroDe2(c.ko), derrotas: numeroDe2(c.losses), empates: numeroDe2(c.draws), sem_resultado: numeroDe2(c.no_contests) } : null,
      fonte: tituloPt ? `https://pt.wikipedia.org/wiki/${tituloPt.replace(/ /g, "_")}` : `https://en.wikipedia.org/wiki/${titulo.replace(/ /g, "_")}`,
    });
  }
  const alvo = semAcento(nome);
  try {
    for (const e of await boxeEventos()) {
      for (const l of e.lutas) {
        if (l.lutadores.some((n) => semAcento(n) === alvo)) {
          perfil.lutas_agenda.push({ evento: e.nome, data: e.data, adversario: l.lutadores.find((n) => semAcento(n) !== alvo) || "", categoria: l.categoria, titulo: l.titulo, vencedor: l.vencedor, resultado: l.resultado, estado: e.estado });
        }
      }
    }
  } catch (_) {
    /* agenda indisponível */
  }
  return perfil;
}

/* =========================================================================
   Rotas: as mesmas do api.py, respondidas aqui no celular
   ========================================================================= */

class ErroRota extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const TTL_AO_VIVO = 15;

function ttlPorData(de, ate) {
  const hoje = hojeEmBR();
  if (de <= somarDiasIso(hoje, 1) && ate >= somarDiasIso(hoje, -1)) return TTL_AO_VIVO;
  return de > hoje ? 600 : 3600;
}

function motivo(erro) {
  return erro instanceof ErroESPN ? erro.message : `${erro.name || "Erro"}: ${erro.message}`;
}

async function viaEspn(chave, ttl, buscar, estavel) {
  try {
    return await obter(chave, ttl, buscar, estavel);
  } catch (erro) {
    if (erro instanceof ErroRota) throw erro;
    throw new Error(`Não foi possível obter dados da ESPN agora. Motivo: ${motivo(erro)}`);
  }
}

/** Boxeadores pela Wikipédia em inglês: busca "texto boxer" e aceita só páginas da categoria de boxeadores. */
async function buscarBoxeadoresWiki(texto) {
  return obter(`wiki_boxe_v3:${semAcento(texto)}`, 7 * 86400, async () => {
    const base = "https://en.wikipedia.org";
    const busca = await wiki(base, { action: "query", list: "search", srsearch: `${texto} boxer`, srlimit: 5 });
    const titulos = ((busca.query || {}).search || []).map((s) => s.title);
    if (!titulos.length) return [];
    const cats = await wiki(base, { action: "query", prop: "categories", cllimit: "max", titles: titulos.join("|") });
    return filtrarBoxeadores(boxeadoresDaWikipedia(cats), titulos, texto).map((b) => ({ esporte: "boxe", liga: "boxe", id: b.titulo, nome: b.titulo, descricao: "Boxe", imagem: null }));
  });
}

/* ---------- Chave (mata-mata e playoffs) e Copa NBA ---------- */

// as regras de montagem ficam em chave_regras.js (objeto Chave), testadas no Node

const semConsulta = (url) => String(url).split("?")[0].replace("http://", "https://");

/** As temporadas mais recentes da competição, da mais nova para a mais velha (ex.: [2027, 2026]). */
async function anosDaCompeticao(cfgEsporte, liga) {
  const lista = await espnGet(`${D_CORE}/${cfgEsporte}/leagues/${liga}/seasons`, { limit: 3 });
  return ((lista || {}).items || [])
    .map((i) => Number((String(i.$ref || "").match(/seasons\/(\d{4})/) || [])[1]))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
}

async function rotuloDaTemporada(cfgEsporte, liga, ano) {
  try {
    const t = await espnGet(`${D_CORE}/${cfgEsporte}/leagues/${liga}/seasons/${ano}`);
    const m = String(t.displayName || "").match(/^\s*(\d{4}(-\d{2})?)/);
    return m ? m[1] : String(ano);
  } catch (_) {
    return String(ano);
  }
}

async function tiposDaTemporada(cfgEsporte, liga, ano) {
  const lista = await espnGet(`${D_CORE}/${cfgEsporte}/leagues/${liga}/seasons/${ano}/types`);
  const tipos = await Promise.all(((lista || {}).items || []).map((i) => espnGet(semConsulta(i.$ref)).catch(() => null)));
  return tipos.filter(Boolean).map((t) => ({ id: t.id, type: t.type, name: t.name, abbreviation: t.abbreviation, startDate: t.startDate, endDate: t.endDate }));
}

/** Os meses (AAAAMM) entre duas datas, sem passar do mês que vem (não adianta buscar jogos que ainda não existem). */
function mesesEntre(inicioIso, fimIso) {
  const limite = somarDiasIso(hojeEmBR(), 45).slice(0, 7).replace("-", "");
  const meses = [];
  let [a, m] = [Number(inicioIso.slice(0, 4)), Number(inicioIso.slice(5, 7))];
  const fim = fimIso.slice(0, 7).replace("-", "");
  for (let i = 0; i < 24; i++) {
    const chave = `${a}${String(m).padStart(2, "0")}`;
    if (chave > fim || chave > limite) break;
    meses.push(chave);
    m += 1;
    if (m === 13) [a, m] = [a + 1, 1];
  }
  return meses;
}

async function jogosDosMeses(cfgEsporte, liga, meses) {
  const vistos = new Set();
  const eventos = [];
  const respostas = await Promise.all(meses.map((mes) => espnGet(`${D_BASE}/${cfgEsporte}/${liga}/scoreboard`, { dates: mes, limit: 1000 })));
  for (const r of respostas) {
    for (const ev of r.events || []) {
      if (vistos.has(String(ev.id))) continue;
      vistos.add(String(ev.id));
      eventos.push(ev);
    }
  }
  return eventos;
}

const PLAYOFFS_POR_TIPO = { nba: [3, 5], nfl: [3], mlb: [3], nhl: [3] };

async function chaveDaTemporada(esporte, liga, ano) {
  const [cfg] = dConfig(esporte, liga);
  const tipos = await tiposDaTemporada(cfg.esporte, liga, ano);
  const mls = liga === "usa.1";
  let alvo;
  if (PLAYOFFS_POR_TIPO[esporte]) alvo = tipos.filter((t) => PLAYOFFS_POR_TIPO[esporte].includes(Number(t.type)));
  else if (mls) alvo = tipos.filter((t) => /playoff|wild card|mls cup/i.test(`${t.name} ${t.abbreviation}`));
  else {
    const f = Chave.fasesDoFutebol(tipos, []);
    alvo = [...f.preliminares, ...f.eliminatorias, ...(f.terceiro ? [f.terceiro] : [])].map((fase) => tipos.find((t) => t.type === fase.type)).filter(Boolean);
  }
  const vazio = { temporada: { ano, rotulo: await rotuloDaTemporada(cfg.esporte, liga, ano) }, comecou: false, preliminares: [], playIn: [], colunas: [], depois: [], jogos: {} };
  if (!alvo.length) return vazio;
  const inicio = alvo.map((t) => t.startDate).sort()[0];
  const fim = alvo.map((t) => t.endDate).sort().slice(-1)[0];
  const tiposAlvo = new Set(alvo.map((t) => Number(t.type)));
  const eventos = (await jogosDosMeses(cfg.esporte, liga, mesesEntre(inicio, fim))).filter((ev) => {
    const s = ev.season || {};
    return Number(s.year) === Number(ano) || !s.year ? tiposAlvo.has(Number(s.type)) : false;
  });

  let preliminares = [];
  let playIn = [];
  let depois = [];
  let colunas;
  if (PLAYOFFS_POR_TIPO[esporte] || mls) {
    const r = Chave.playoffs(mls ? "mls" : esporte, eventos);
    colunas = r.colunas;
    playIn = r.playIn;
  } else {
    const fases = Chave.fasesDoFutebol(tipos, eventos);
    const lista = Chave.confrontos(eventos);
    const todas = Chave.montar({ fases: fases.eliminatorias, confrontos: lista, formato: Chave.formatoDe(liga) });
    const ini = Chave.colunaInicial(todas);
    preliminares = [
      ...fases.preliminares.map((fase) => ({ nome: fase.nome, confrontos: lista.filter((c) => c.fase === fase.type) })),
      ...todas.slice(0, ini).map((c) => ({ nome: c.nome, confrontos: c.confrontos.filter(Boolean) })),
    ].filter((p) => p.confrontos.length);
    colunas = todas.slice(ini);
    if (colunas.length) colunas[0] = { ...colunas[0], alimenta: colunas[0].confrontos.map(() => []) };
    if (fases.terceiro) {
      const doTerceiro = lista.filter((c) => c.fase === fases.terceiro.type);
      if (doTerceiro.length) depois = [{ nome: fases.terceiro.nome, confrontos: doTerceiro }];
    }
  }
  const agora = new Date().toISOString();
  const jogos = {};
  for (const ev of eventos) {
    try {
      jogos[String(ev.id)] = partida(ev, esporte, liga);
    } catch (_) {
      /* jogo sem dados suficientes: fica só no cartão */
    }
  }
  return { ...vazio, comecou: eventos.some((ev) => (ev.date || "") <= agora), preliminares, playIn, colunas, depois, jogos };
}

/** A chave da temporada pedida; sem pedido, a atual se o mata-mata dela já começou, senão a anterior. */
async function buscarChave(esporte, liga, anoPedido) {
  const [cfg] = dConfig(esporte, liga);
  const anos = await anosDaCompeticao(cfg.esporte, liga);
  if (!anos.length) throw new ErroRota("A ESPN não tem temporadas desta competição.");
  let ano = anoPedido && anos.includes(anoPedido) ? anoPedido : anos[0];
  let r = await chaveDaTemporada(esporte, liga, ano);
  if (!anoPedido && !r.comecou && anos[1]) {
    ano = anos[1];
    r = await chaveDaTemporada(esporte, liga, ano);
  }
  const outroAno = anos.slice(0, 2).find((a) => a !== ano);
  r.outra = outroAno ? { ano: outroAno, rotulo: await rotuloDaTemporada(cfg.esporte, liga, outroAno) } : null;
  return r;
}

const chaveEstavel = (r) => r.colunas.length > 0 && r.colunas.every((c) => c.confrontos.every((x) => x && x.estado === 3));

/** A Copa NBA da temporada (grupos em novembro, mata-mata em dezembro do ano em que ela começa). */
async function copaNbaDaTemporada(ano, conferenciaDe) {
  const comeco = ano - 1; // a temporada 2026 (2025-26) começa em 2025
  const eventos = (await jogosDosMeses("basketball", "nba", [`${comeco}10`, `${comeco}11`, `${comeco}12`])).filter((ev) =>
    ((ev.competitions || [{}])[0].notes || []).some((n) => /NBA Cup/i.test((n && n.headline) || ""))
  );
  const { grupos, colunas } = Chave.copaNba(eventos, conferenciaDe);
  const jogos = {};
  for (const ev of eventos) {
    try {
      jogos[String(ev.id)] = partida(ev, "nba", "nba");
    } catch (_) {
      /* sem dados suficientes */
    }
  }
  return { temporada: { ano, rotulo: `${comeco}-${String(ano).slice(2)}` }, comecou: eventos.length > 0, grupos, colunas, jogos };
}

async function buscarCopaNba(anoPedido) {
  const anos = await anosDaCompeticao("basketball", "nba");
  const conferencias = {};
  try {
    const c = await buscarClassificacao("nba", "nba");
    for (const g of c.grupos || []) {
      const conf = /Leste|East/i.test(g.nome) ? "Leste" : /Oeste|West/i.test(g.nome) ? "Oeste" : null;
      for (const l of g.linhas || []) if (conf && l.id) conferencias[String(l.id)] = conf;
    }
  } catch (_) {
    /* sem a classificação, os grupos ficam "Grupo 1..6" */
  }
  const conferenciaDe = (id) => conferencias[String(id)] || null;
  let ano = anoPedido && anos.includes(anoPedido) ? anoPedido : anos[0];
  let r = await copaNbaDaTemporada(ano, conferenciaDe);
  if (!anoPedido && !r.comecou && anos[1]) {
    ano = anos[1];
    r = await copaNbaDaTemporada(ano, conferenciaDe);
  }
  const outroAno = anos.slice(0, 2).find((a) => a !== ano);
  r.outra = outroAno ? { ano: outroAno, rotulo: `${outroAno - 1}-${String(outroAno).slice(2)}` } : null;
  return r;
}

/* =========================================================================
   E-sports (CS2, Valorant e LoL) pela PandaScore, plano grátis, por meio do repasse da Cloudflare.
   A chave da PandaScore fica só no repasse, como segredo PANDASCORE_TOKEN: o app nunca vê a chave.
   As regras (tradução das partidas, filtro do dia, grupos) ficam em esports_regras.js.
   ========================================================================= */

// o endereço do repasse não é segredo; no celular dá para trocar com localStorage["ss:esports"]
const REPASSE_ESPORTS_PADRAO = "https://scoresports.sodpl258.workers.dev";
const REPASSE_ESPORTS = (() => {
  try {
    return ((localStorage.getItem("ss:esports") || "").trim() || REPASSE_ESPORTS_PADRAO).replace(/\/+$/, "");
  } catch (_) {
    return REPASSE_ESPORTS_PADRAO;
  }
})();

class ErroEsports extends Error {}

const SLUGS_ESPORTS = Esports.JOGOS.map((j) => j.slug).join(",");

/** Um pedido à PandaScore pelo repasse; os erros viram mensagens que a tela mostra. */
async function pandascore(caminho, params = {}) {
  if (!REPASSE_ESPORTS) throw new ErroEsports("O repasse dos e-sports não está configurado.");
  const u = new URL(`${REPASSE_ESPORTS}/pandascore/${caminho}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  let r;
  try {
    // sem o cache HTTP do navegador: quem decide quanto tempo guardar é o banco do celular (obter)
    r = await fetch(u.toString(), { cache: "no-store" });
  } catch (_) {
    throw new ErroEsports("Não foi possível falar com o repasse dos e-sports agora.");
  }
  // 500 é o repasse sem o segredo; 401 e 403, a PandaScore recusando a chave
  if ([401, 403, 500].includes(r.status)) throw new ErroEsports("A chave da PandaScore no repasse está errada ou faltando.");
  if (r.status === 429) throw new ErroEsports("Limite da PandaScore atingido. Volte em alguns minutos.");
  if (!r.ok) throw new ErroEsports(`A PandaScore respondeu com erro ${r.status}.`);
  try {
    return await r.json();
  } catch (_) {
    throw new ErroEsports("A resposta da PandaScore não veio em JSON.");
  }
}

async function viaEsports(chave, ttl, buscar, estavel, opcoes) {
  try {
    return await obter(chave, ttl, buscar, estavel, opcoes);
  } catch (erro) {
    if (erro instanceof ErroRota) throw erro;
    throw new Error(erro instanceof ErroEsports ? erro.message : `Não foi possível obter os e-sports agora. Motivo: ${motivo(erro)}`);
  }
}

function jogoEsportsOu404(id) {
  const jogo = Esports.jogoDoId(id);
  if (!jogo) throw new ErroRota(404, "Jogo de e-sports desconhecido.");
  return jogo;
}

/** Todas as partidas do dia (dia de Brasília) dos três jogos, sem filtro: uma página de 100 costuma bastar. */
async function esportsDoDia(de) {
  const [ini, fim] = Esports.intervaloDoDia(de);
  const todas = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const lote = await pandascore("matches", { "filter[videogame]": SLUGS_ESPORTS, "range[begin_at]": `${ini},${fim}`, sort: "begin_at", per_page: 100, page: pagina });
    todas.push(...lote);
    if (lote.length < 100) break;
  }
  return todas.map((m) => Esports.partida(m));
}

/** As partidas ao vivo dos três jogos: /matches/running fica só 30 s na memória do repasse (as listas, 2 min). */
function esportsAoVivo() {
  return viaEsports("esports_aovivo_v1", 25, async () => (await pandascore("matches/running", { "filter[videogame]": SLUGS_ESPORTS, per_page: 100 })).map((m) => Esports.partida(m)), undefined, { semVelho: true });
}

/** O elenco ativo de um time (não derruba a página se falhar). */
async function elencoEsports(timeId) {
  if (timeId === null || timeId === undefined) return [];
  try {
    const t = await obter(`esports_time_v1:${timeId}`, 86400, () => pandascore(`teams/${timeId}`));
    return (t.players || []).filter((p) => p.active !== false).map(Esports.jogador);
  } catch (_) {
    return [];
  }
}

const ROTAS = [
  [/^\/esportes$/, () => [
    ...Object.entries(D_ESPORTES).map(([id, v]) => ({ id, nome: v.nome, tipo: v.tipo, ligas: v.ligas })),
    { id: "boxe", nome: "Boxe", tipo: "boxe", ligas: [{ id: "boxe", nome: "Boxe" }] },
    { id: "esports", nome: "E-sports", tipo: "esports", ligas: Esports.JOGOS.map((j) => ({ id: j.id, nome: j.nome })) },
    { id: "kings", nome: "Kings League", tipo: "kings", ligas: KINGS_LIGAS },
  ]],
  [/^\/kings$/, () => kingsCompeticoes()],
  [/^\/esports\/jogos$/, async (m, q) => {
    const de = q.de || hojeEmBR();
    const hoje = hojeEmBR();
    const ttl = de === hoje ? 30 : de < hoje ? 3600 : 120;
    let todas = await viaEsports(`esports_dia_v1:${de}`, ttl, () => esportsDoDia(de), (lista) => de < hoje && lista.every(Esports.encerradaDeVez));
    // com partida ao vivo, o placar vem de /running (fresco a cada 30 s), também no dia anterior depois da meia-noite
    if (todas.some((p) => p.estado === 2)) {
      try {
        todas = Esports.juntarAoVivo(todas, await esportsAoVivo());
      } catch (_) {
        /* fica a lista como estava */
      }
    }
    const favoritos = new Set(String(q.favoritos || "").split(",").filter(Boolean));
    if (q.so_favoritos === "1") return todas.filter((p) => p.lados.some((l) => l.id !== null && favoritos.has(String(l.id))));
    return todas.filter((p) => Esports.entraNoDia(p, favoritos));
  }],
  [/^\/esports\/aovivo$/, () => esportsAoVivo()],
  [/^\/esports\/jogos\/([^/]+)\/([^/]+)$/, async (m) => {
    jogoEsportsOu404(m[1]);
    let bruta = await viaEsports(`esports_partida_v1:${m[2]}`, 30, () => pandascore(`matches/${m[2]}`), (x) => Esports.encerradaDeVez(Esports.partida(x)));
    // ao vivo: a versão de /matches/running (30 s no repasse) em vez da de /matches/{id} (2 min)
    if (Esports.partida(bruta).estado === 2) {
      try {
        const vivo = await obter(`esports_partida_vivo_v1:${m[2]}`, 25, () => pandascore("matches/running", { "filter[id]": m[2] }), undefined, { semVelho: true });
        if (vivo.length) bruta = vivo[0];
      } catch (_) {
        /* fica a versão que já veio */
      }
    }
    const partida = Esports.partida(bruta, m[1]);
    const elencos = await Promise.all(partida.lados.map((l) => elencoEsports(l.id)));
    return { partida, elencos };
  }],
  [/^\/esports\/times\/([^/]+)\/([^/]+)$/, async (m) => {
    const jogo = jogoEsportsOu404(m[1]);
    const id = m[2];
    const t = await viaEsports(`esports_time_v1:${id}`, 86400, () => pandascore(`teams/${id}`));
    const lista = (caminho, params, ttl) =>
      viaEsports(`esports_time_${caminho.replace(/\W/g, "_")}_v1:${id}`, ttl, () => pandascore(`${jogo.caminho}/matches/${caminho}`, { "filter[opponent_id]": id, ...params }))
        .then((ms) => ms.map((x) => Esports.partida(x, jogo.id)))
        .catch(() => []);
    const [ultimas, aoVivo, proximas] = await Promise.all([
      lista("past", { "filter[status]": "finished", sort: "-begin_at", per_page: 10 }, 900),
      lista("running", { per_page: 5 }, 30),
      lista("upcoming", { sort: "begin_at", per_page: 5 }, 900),
    ]);
    return {
      time: { id: t.id, nome: t.name, sigla: t.acronym || null, logo: t.image_url || null, pais: t.location || null, jogo: jogo.id },
      elenco: (t.players || []).filter((p) => p.active !== false).map(Esports.jogador),
      ultimas,
      proximas: [...aoVivo, ...proximas],
    };
  }],
  [/^\/e\/([^/]+)\/([^/]+)\/jogos$/, (m, q) => {
    dConfig(m[1], m[2]);
    const de = q.de || hojeEmBR();
    const ate = q.ate || de;
    const passado = ate < hojeEmBR();
    return viaEspn(`espn_jogos_v1:${m[1]}:${m[2]}:${de}:${ate}`, ttlPorData(de, ate), () => buscarPartidas(m[1], m[2], de, ate),
      (jogos) => passado && jogos.every((j) => j.estado === 3 || ["Adiado", "Cancelado"].includes(j.status)));
  }],
  [/^\/e\/([^/]+)\/([^/]+)\/datas$/, async (m) => {
    dConfig(m[1], m[2]);
    let r;
    try {
      r = await obter(`espn_datas_v3:${m[1]}:${m[2]}`, 21600, () => buscarDatas(m[1], m[2]));
    } catch (_) {
      r = { tipo: "dias", datas: [], semanas: [], atual: null };
    }
    return { ...r, hoje: hojeEmBR() };
  }],
  [/^\/e\/([^/]+)\/([^/]+)\/jogos\/([^/]+)$/, (m) => viaEspn(`espn_resumo_v3:${m[1]}:${m[2]}:${m[3]}`, TTL_AO_VIVO, () => buscarResumo(m[1], m[2], m[3]), (r) => r.jogo.estado === 3)],
  // a temporada "atual" nunca é guardada por muito tempo: quando o mata-mata novo começar, ela tem de trocar
  [/^\/e\/nba\/nba\/copa$/, (m, q) => viaEspn(`espn_copa_nba_v1:${q.temporada || "atual"}`, 120, () => buscarCopaNba(q.temporada ? Number(q.temporada) : null), q.temporada ? chaveEstavel : undefined)],
  [/^\/e\/([^/]+)\/([^/]+)\/chave$/, (m, q) => viaEspn(`espn_chave_v1:${m[1]}:${m[2]}:${q.temporada || "atual"}`, 120, () => buscarChave(m[1], m[2], q.temporada ? Number(q.temporada) : null), q.temporada ? chaveEstavel : undefined)],
  [/^\/e\/([^/]+)\/([^/]+)\/classificacao$/, (m) => viaEspn(`espn_classificacao_v2:${m[1]}:${m[2]}`, 1800, () => buscarClassificacao(m[1], m[2]))],
  [/^\/e\/([^/]+)\/([^/]+)\/times\/([^/]+)$/, (m) => viaEspn(`espn_time_v1:${m[1]}:${m[2]}:${m[3]}`, 21600, () => buscarTime(m[1], m[2], m[3]))],
  // a provável escalação (titulares do último jogo do time): o jogo já acabou, então guarda 30 dias
  [/^\/e\/futebol\/escalacao-anterior\/([^/]+)\/([^/]+)$/, (m) => viaEspn(`espn_escalacao_anterior_v1:${m[1]}:${m[2]}`, 30 * 86400, () => buscarEscalacaoAnterior(m[1], m[2]))],
  [/^\/e\/futebol\/([^/]+)\/times\/([^/]+)\/tecnico$/, async (m, q) => ({ tecnico: await tecnicoFutebol(q.nome || "", m[2], m[1]) })],
  [/^\/e\/([^/]+)\/([^/]+)\/times\/([^/]+)\/jogos$/, (m) => viaEspn(`espn_time_jogos_v1:${m[1]}:${m[2]}:${m[3]}`, 900, () => buscarJogosTime(m[1], m[2], m[3]))],
  [/^\/e\/([^/]+)\/([^/]+)\/times\/([^/]+)\/estatisticas$/, (m) => viaEspn(`espn_time_stats_v1:${m[1]}:${m[2]}:${m[3]}`, 21600, () => buscarEstatisticasTime(m[1], m[2], m[3]))],
  [/^\/e\/([^/]+)\/([^/]+)\/times\/([^/]+)\/elenco$/, (m) => viaEspn(`espn_elenco_v2:${m[1]}:${m[2]}:${m[3]}`, 21600, () => buscarElenco(m[1], m[2], m[3]))],
  [/^\/e\/([^/]+)\/([^/]+)\/atletas\/([^/]+)\/historico$/, (m) => {
    const [cfg] = dConfig(m[1], m[2]);
    if (cfg.tipo === "luta") return viaEspn(`ufc_lutas_v1:${m[3]}`, 6 * 3600, () => buscarLutas(m[3]));
    if (cfg.esporte === "soccer") return viaEspn(`futebol_carreira_v1:${m[2]}:${m[3]}`, 12 * 3600, () => buscarCarreiraFutebol(m[2], m[3]));
    return { tipo: "nenhum" };
  }],
  [/^\/e\/([^/]+)\/([^/]+)\/atletas\/([^/]+)$/, (m) => viaEspn(`espn_atleta_v3:${m[1]}:${m[2]}:${m[3]}`, 86400, () => buscarAtleta(m[1], m[2], m[3]))],
  [/^\/e\/([^/]+)\/([^/]+)\/eventos$/, (m) => viaEspn(`espn_eventos_v1:${m[1]}:${m[2]}:atual`, 3600, () => buscarEventos(m[1], m[2]))],
  [/^\/e\/([^/]+)\/([^/]+)\/eventos\/([^/]+)$/, (m, q) => viaEspn(`espn_evento_v1:${m[1]}:${m[2]}:${m[3]}`, 30, () => buscarEvento(m[1], m[2], m[3], q.data))],
  // futebol: primeiro a artilharia rápida (/statistics); ?completo=1 traz também os cartões (Core API)
  [/^\/e\/([^/]+)\/([^/]+)\/lideres$/, (m, q) =>
    m[1] === "futebol" && !q.completo
      ? viaEspn(`espn_lideres_rapido_v1:${m[2]}`, 3 * 3600, () => buscarLideresFutebolRapido(m[2]))
      : viaEspn(`espn_lideres_v2:${m[1]}:${m[2]}`, 3 * 3600, () => buscarLideres(m[1], m[2]))],
  [/^\/e\/([^/]+)\/([^/]+)\/ranking$/, () => viaEspn("ufc_ranking_v1", 6 * 3600, buscarRankingUfc)],
  [/^\/boxe\/eventos$/, () => boxeEventos()],
  [/^\/boxe\/lutador$/, async (m, q) => {
    try {
      return await obter(`boxe_lutador_v1:${semAcento(q.nome)}`, 7 * 86400, () => boxeLutador(q.nome));
    } catch (erro) {
      throw new Error(`Não foi possível buscar o perfil agora. Motivo: ${erro.message}`);
    }
  }],
  [/^\/campeoes$/, () => jsonLocal("dados/campeoes.json")],
  [/^\/banco$/, async () => ({ registros: await Banco.contar("dados"), atletas_e_times_no_indice: await Indice.contar() })],
  [/^\/busca$/, async (m, q) => {
    const textoBusca = String(q.q || "").trim();
    semearSePreciso();
    if (textoBusca.length < 2) return { ligas: [], jogadores: [], times: [], falhas: [], indice: await Indice.contar(), semeando };
    try {
      await boxeEventos();
    } catch (_) {
      /* agenda indisponível */
    }
    const jogadores = [];
    const times = [];
    const vistos = new Set();
    const juntar = (item, tipo) => {
      // no boxe o mesmo lutador vem da agenda e da Wikipédia com códigos diferentes: junta pelo nome
      const k = item.esporte === "boxe" ? `${tipo}:boxe:${semAcento(item.nome)}` : `${tipo}:${item.esporte}:${item.id}`;
      if (vistos.has(k)) return;
      vistos.add(k);
      (tipo === "time" ? times : jogadores).push(item);
    };
    for (const i of await Indice.procurar(textoBusca)) juntar({ esporte: i.esporte, liga: i.liga, id: i.id, nome: i.nome, descricao: i.descricao, imagem: i.imagem }, i.tipo);
    const falhas = [];
    // ESPN e Wikipédia ao mesmo tempo: uma lenta não segura a outra
    const [espn, boxe] = await Promise.allSettled([
      obter(`busca_espn_v2:${semAcento(textoBusca)}`, 6 * 3600, () => buscarEspn(textoBusca)),
      textoBusca.length >= 3 ? buscarBoxeadoresWiki(textoBusca) : Promise.resolve([]),
    ]);
    if (espn.status === "fulfilled") {
      espn.value.jogadores.forEach((j) => juntar(j, "jogador"));
      espn.value.times.forEach((t) => juntar(t, "time"));
    } else falhas.push("ESPN");
    if (boxe.status === "fulfilled") {
      boxe.value.forEach((b) => juntar(b, "jogador"));
      if (boxe.value.length) Indice.registrar(boxe.value).catch(() => {});
    } else falhas.push("Wikipédia");
    for (const j of jogadores) if (j.esporte === "ufc") j.descricao = rotuloUfc(j.descricao);
    return {
      ligas: procurarLigas(textoBusca),
      jogadores: ordenarPorRelevancia(jogadores, textoBusca).slice(0, 40),
      times: ordenarPorRelevancia(times, textoBusca).slice(0, 30),
      falhas,
      indice: await Indice.contar(),
      semeando,
    };
  }],
];

async function rotear(url) {
  await carregarTransmissoes();
  const [caminho, busca] = String(url).split("?");
  const q = Object.fromEntries(new URLSearchParams(busca || ""));
  for (const [padrao, fazer] of ROTAS) {
    const m = padrao.exec(caminho);
    if (m) return fazer(m, q);
  }
  throw new Error("Esta parte só funciona com o servidor no PC.");
}

// troca a função api() das telas: daqui em diante, tudo é respondido no próprio celular
window.api = api = async function apiDireta(url) {
  return rotear(url);
};
window.MODO_CELULAR = true;
