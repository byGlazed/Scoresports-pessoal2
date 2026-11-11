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
async function obter(chave, ttl, buscar, estavel) {
  const salvo = await Banco.ler("dados", chave);
  const agora = Date.now() / 1000;
  if (salvo && agora < salvo.vale_ate) return salvo.valor;
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
  for (const item of dados.jogos || []) {
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
      { id: "usa.1", nome: "MLS" },
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

function statusTexto(esporteEspn, status) {
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
    status: statusTexto(cfg.esporte, status),
    relogio: status.displayClock || null,
    periodo: status.period || null,
    casa: competidor(casa, estado),
    fora: competidor(fora, estado),
    local: localDe(comp.venue),
    semana: (ev.week || {}).number || null,
    nota: notas[0] || null,
  };
  jogo.transmissao = ondeAssistir(esporte, {
    liga,
    data: jogo.data,
    inicio,
    times: [jogo.casa, jogo.fora].map((t) => [t.sigla, t.nome, t.nome_curto]),
  });
  return jogo;
}

async function eventosPeriodo(url, d0, d1, info) {
  const dias = Math.round((new Date(`${d1}T12:00:00Z`) - new Date(`${d0}T12:00:00Z`)) / 86400000) + 1;
  let chaves;
  if (dias <= 4) chaves = Array.from({ length: dias }, (_, i) => yyyymmdd(somarDiasIso(d0, i)));
  else chaves = [...new Set(Array.from({ length: dias }, (_, i) => yyyymmdd(somarDiasIso(d0, i)).slice(0, 6)))].sort();
  const vistos = new Set();
  const eventos = [];
  const respostas = await Promise.all(chaves.map((chave) => espnGet(url, { dates: chave, limit: 1000 })));
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

async function buscarPartidas(esporte, liga, de, ate) {
  const [cfg] = dConfig(esporte, liga);
  ate = ate || de;
  const info = {};
  const eventos = await eventosPeriodo(`${D_BASE}/${cfg.esporte}/${liga}/scoreboard`, somarDiasIso(de, -1), ate, info);
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
  return { tipo: semanas.length ? "semanas" : "dias", datas: [...datas].sort(), semanas, atual };
}

function estatisticasTimes(dados, jogo) {
  const times = (dados.boxscore || {}).teams || [];
  const porLado = {};
  for (const t of times) {
    const time = t.team || {};
    const lado = t.homeAway ? (t.homeAway === "home" ? "casa" : "fora") : String(time.id) === String(jogo.casa.id) ? "casa" : "fora";
    porLado[lado] = t.statistics || [];
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
  return linhas;
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

function escalacoes(dados) {
  return (dados.rosters || []).map((r) => {
    const time = r.team || {};
    const jogadores = (r.roster || []).map((p) => {
      const at = p.athlete || {};
      const st = p.stats || [];
      return {
        id: at.id,
        nome: at.displayName || at.shortName,
        camisa: p.jersey || at.jersey,
        posicao: (p.position || {}).abbreviation,
        titular: Boolean(p.starter),
        entrou: Boolean(p.subbedIn),
        saiu: Boolean(p.subbedOut),
        gols: statDe(st, "totalGoals", "G"),
        assistencias: statDe(st, "goalAssists", "A"),
        amarelos: statDe(st, "yellowCards", "YC"),
        vermelhos: statDe(st, "redCards", "RC"),
        stats: {},
      };
    });
    return {
      lado: r.homeAway === "home" ? "casa" : "fora",
      time: { id: time.id, nome: time.displayName, logo: logoDe(time) },
      formacao: r.formation || null,
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

function jogoHistorico(e) {
  const adv = e.opponent || {};
  return {
    id: e.id,
    data: dataBrDe(lerData(e.gameDate)),
    adversario: adv.displayName || adv.abbreviation,
    adversario_logo: logoDe(adv),
    local: e.atVs === "vs" ? "casa" : "fora",
    placar: e.score,
    resultado: { W: "V", L: "D", D: "E", T: "E" }[String(e.gameResult || "").toUpperCase()] || null,
    competicao: e.leagueName || e.leagueAbbreviation,
  };
}

async function buscarResumo(esporte, liga, eventoId) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE}/${cfg.esporte}/${liga}/summary`, { event: eventoId });
  const header = dados.header || {};
  const comp = (header.competitions || [{}])[0];
  const jogo = partida({ id: eventoId, week: header.week }, esporte, liga, comp);
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
    forma: (dados.lastFiveGames || []).map((t) => ({ time: { id: (t.team || {}).id, nome: (t.team || {}).displayName, logo: logoDe(t.team) }, jogos: (t.events || []).map(jogoHistorico) })),
    confronto: (() => {
      for (const t of dados.headToHeadGames || []) {
        const jogos = (t.events || []).map(jogoHistorico);
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
            return at.id ? { nome: traduzEstatistica(c.displayName || c.name), id: at.id, atleta: at.displayName || at.shortName, valor: topo.displayValue } : null;
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
    saida.push({ nome: no.name || nomePai, colunas, linhas });
  }
  for (const filho of no.children || []) gruposClassificacao(filho, no.name || nomePai, saida);
  return saida;
}

async function buscarClassificacao(esporte, liga) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE_CLASS}/${cfg.esporte}/${liga}/standings`);
  const grupos = gruposClassificacao(dados, "", []);
  Indice.registrar(grupos.flatMap((g) => g.linhas.map((l) => ({ tipo: l.tipo, esporte, liga, id: l.id, nome: l.nome, descricao: cfg.nome, imagem: l.tipo === "time" ? l.logo : null }))));
  return { grupos };
}

/* ---------- Elenco e atleta ---------- */

const GRUPOS_ELENCO_PT = { offense: "Ataque", defense: "Defesa", specialteam: "Times especiais", "special teams": "Times especiais", goalkeeper: "Goleiros", defender: "Defensores", midfielder: "Meio-campistas", forward: "Atacantes" };

// atletaCurto fica em time_dados.js (carregado antes deste arquivo)

async function buscarElenco(esporte, liga, timeId) {
  const [cfg] = dConfig(esporte, liga);
  const dados = await espnGet(`${D_BASE}/${cfg.esporte}/${liga}/teams/${timeId}/roster`);
  const atletas = dados.athletes || [];
  let grupos;
  if (atletas.length && atletas[0] && "items" in atletas[0]) {
    grupos = atletas.map((g) => {
      const nome = String(g.position || "");
      return { nome: GRUPOS_ELENCO_PT[nome.toLowerCase()] || nome.charAt(0).toUpperCase() + nome.slice(1), atletas: (g.items || []).map(atletaCurto) };
    });
  } else grupos = [{ nome: "Elenco", atletas: atletas.map(atletaCurto) }];
  const time = dados.team || {};
  const resultado = { time: { id: time.id || timeId, nome: time.displayName, logo: logoDe(time) }, grupos };
  Indice.registrar(
    [{ tipo: "time", esporte, liga, id: resultado.time.id, nome: resultado.time.nome, imagem: resultado.time.logo }].concat(
      grupos.flatMap((g) => g.atletas.map((a) => ({ esporte, liga, id: a.id, nome: a.nome, descricao: resultado.time.nome, imagem: a.foto })))
    )
  );
  return resultado;
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
  let times = st.teams || {};
  if (Array.isArray(times)) times = Object.fromEntries(times.map((t) => [String(t.id), t]));
  return (st.categories || [])
    .map((cat) => ({
      nome: cat.displayName || cat.name || "",
      rotulos: cat.labels || [],
      descricoes: cat.displayNames || cat.names || [],
      temporadas: (cat.statistics || []).map((s) => {
        const temp = s.season || {};
        const t = times[String(s.teamId)] || {};
        return { temporada: String(temp.displayName || temp.year || ""), time: t.abbreviation || t.displayName || s.teamSlug || null, valores: s.stats || [] };
      }),
      totais: cat.totals || [],
    }))
    .filter((c) => c.temporadas.length || c.totais.length);
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
};
const ORDEM_LIDERES = ["Artilharia", "Assistências", "Cartões amarelos", "Cartões vermelhos", "Pontos por jogo", "Rebotes por jogo", "Assistências por jogo",
  "Jardas de passe", "Touchdowns de passe", "Rating de quarterback", "Jardas de corrida", "Touchdowns de corrida", "Jardas recebidas", "Recepções",
  "Touchdowns recebidos", "Tackles", "Sacks", "Interceptações"];
const ESPERADOS = { futebol: ["Artilharia", "Assistências", "Cartões amarelos", "Cartões vermelhos"], nfl: ["Jardas de passe", "Jardas de corrida", "Jardas recebidas", "Tackles", "Sacks", "Interceptações"] };

function nomeCategoria(c) {
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

async function buscarLideres(esporte, liga, limite = 10) {
  const [cfg] = dConfig(esporte, liga);
  const [ano, tipo, nomeTemporada] = await temporadaAtual(cfg.esporte, liga);
  const anos = esporte === "nfl" || esporte === "nba" ? [ano, ano - 1] : [ano, ano - 1, ano - 2];
  const tipos = esporte === "nfl" || esporte === "nba" ? [2] : [...new Set([tipo || 1, null])];
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
    const nome = nomeCategoria(c);
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
  saida.sort((a, b) => (ORDEM_LIDERES.indexOf(a.nome) + 1 || 99) - (ORDEM_LIDERES.indexOf(b.nome) + 1 || 99));
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

const UID_ESPORTE = { 600: "futebol", 20: "nfl", 40: "nba", 3301: "ufc", 2000: "f1" };
const SEGMENTO_ESPORTE = { soccer: "futebol", futebol: "futebol", football: "futebol", nfl: "nfl", nba: "nba", mma: "ufc", ufc: "ufc", f1: "f1", racing: "f1" };
const LIGA_PADRAO = { futebol: "bra.1", nfl: "nfl", nba: "nba", ufc: "ufc", f1: "f1" };

function esporteDoResultado(c) {
  const m = /^s:(\d+)/.exec(c.uid || "");
  if (m && UID_ESPORTE[m[1]]) return UID_ESPORTE[m[1]];
  const link = ((c.link || {}).web) || c.href || "";
  const m2 = /espn\.[a-z.]+\/([a-z0-9-]+)\//.exec(link);
  if (m2 && SEGMENTO_ESPORTE[m2[1]]) return SEGMENTO_ESPORTE[m2[1]];
  const t = semAcento(["sport", "defaultSport", "league", "description", "subtitle"].map((k) => c[k] || "").join(" "));
  for (const [k, v] of [["soccer", "futebol"], ["nfl", "nfl"], ["nba", "nba"], ["mma", "ufc"], ["ufc", "ufc"], ["formula 1", "f1"]]) if (t.includes(k)) return v;
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

async function wiki(base, params) {
  const u = new URL(`${base}/w/api.php`);
  for (const [k, v] of Object.entries({ ...params, format: "json", formatversion: 2, origin: "*" })) u.searchParams.set(k, v);
  const r = await fetch(u.toString());
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

const ROTAS = [
  [/^\/esportes$/, () => [
    ...Object.entries(D_ESPORTES).map(([id, v]) => ({ id, nome: v.nome, tipo: v.tipo, ligas: v.ligas })),
    { id: "boxe", nome: "Boxe", tipo: "boxe", ligas: [{ id: "boxe", nome: "Boxe" }] },
  ]],
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
      r = await obter(`espn_datas_v1:${m[1]}:${m[2]}`, 21600, () => buscarDatas(m[1], m[2]));
    } catch (_) {
      r = { tipo: "dias", datas: [], semanas: [], atual: null };
    }
    return { ...r, hoje: hojeEmBR() };
  }],
  [/^\/e\/([^/]+)\/([^/]+)\/jogos\/([^/]+)$/, (m) => viaEspn(`espn_resumo_v1:${m[1]}:${m[2]}:${m[3]}`, TTL_AO_VIVO, () => buscarResumo(m[1], m[2], m[3]), (r) => r.jogo.estado === 3)],
  [/^\/e\/([^/]+)\/([^/]+)\/classificacao$/, (m) => viaEspn(`espn_classificacao_v1:${m[1]}:${m[2]}`, 1800, () => buscarClassificacao(m[1], m[2]))],
  [/^\/e\/([^/]+)\/([^/]+)\/times\/([^/]+)\/elenco$/, (m) => viaEspn(`espn_elenco_v1:${m[1]}:${m[2]}:${m[3]}`, 43200, () => buscarElenco(m[1], m[2], m[3]))],
  [/^\/e\/([^/]+)\/([^/]+)\/atletas\/([^/]+)\/historico$/, (m) => {
    const [cfg] = dConfig(m[1], m[2]);
    if (cfg.tipo === "luta") return viaEspn(`ufc_lutas_v1:${m[3]}`, 6 * 3600, () => buscarLutas(m[3]));
    if (cfg.esporte === "soccer") return viaEspn(`futebol_carreira_v1:${m[2]}:${m[3]}`, 12 * 3600, () => buscarCarreiraFutebol(m[2], m[3]));
    return { tipo: "nenhum" };
  }],
  [/^\/e\/([^/]+)\/([^/]+)\/atletas\/([^/]+)$/, (m) => viaEspn(`espn_atleta_v1:${m[1]}:${m[2]}:${m[3]}`, 86400, () => buscarAtleta(m[1], m[2], m[3]))],
  [/^\/e\/([^/]+)\/([^/]+)\/eventos$/, (m) => viaEspn(`espn_eventos_v1:${m[1]}:${m[2]}:atual`, 3600, () => buscarEventos(m[1], m[2]))],
  [/^\/e\/([^/]+)\/([^/]+)\/eventos\/([^/]+)$/, (m, q) => viaEspn(`espn_evento_v1:${m[1]}:${m[2]}:${m[3]}`, 30, () => buscarEvento(m[1], m[2], m[3], q.data))],
  [/^\/e\/([^/]+)\/([^/]+)\/lideres$/, (m) => viaEspn(`espn_lideres_v1:${m[1]}:${m[2]}`, 3 * 3600, () => buscarLideres(m[1], m[2]))],
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
      const k = `${tipo}:${item.esporte}:${item.id}`;
      if (vistos.has(k)) return;
      vistos.add(k);
      (tipo === "time" ? times : jogadores).push(item);
    };
    for (const i of await Indice.procurar(textoBusca)) juntar({ esporte: i.esporte, liga: i.liga, id: i.id, nome: i.nome, descricao: i.descricao, imagem: i.imagem }, i.tipo);
    const falhas = [];
    try {
      const espn = await obter(`busca_espn_v2:${semAcento(textoBusca)}`, 6 * 3600, () => buscarEspn(textoBusca));
      espn.jogadores.forEach((j) => juntar(j, "jogador"));
      espn.times.forEach((t) => juntar(t, "time"));
    } catch (_) {
      falhas.push("ESPN");
    }
    return { ligas: procurarLigas(textoBusca), jogadores: jogadores.slice(0, 40), times: times.slice(0, 30), falhas, indice: await Indice.contar(), semeando };
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
