// Repasse (proxy) gratuito na Cloudflare. Faz três coisas:
//
// 1. ESPN e Wikipédia por ?url= (para o caso de a ESPN bloquear o navegador do celular).
//    Ex.: https://SEU-WORKER.workers.dev/?url=https://site.api.espn.com/...
// 2. E-sports pela PandaScore por /pandascore/<caminho>, com a chave guardada como SEGREDO do worker.
//    Ex.: https://SEU-WORKER.workers.dev/pandascore/csgo/matches/running
//    A chave nunca fica neste arquivo, no app nem no GitHub: só no segredo PANDASCORE_TOKEN.
// 3. Kings League ao vivo por /kings/<competição> (brazil, world-cup ou kwc-nations): lê a página da
//    competição no kingsleague.pro e devolve só os jogos e os times. Ex.: https://SEU-WORKER.workers.dev/kings/brazil
//
// Como configurar (uma vez só, sem cartão):
// 1. Em https://dash.cloudflare.com, abra Workers & Pages e o seu worker (ou Create > Worker).
// 2. Clique em Edit code, apague o código que estiver lá, cole este arquivo inteiro e clique em Deploy.
// 3. Volte ao worker, abra Settings > Variables and Secrets > Add.
//    Em Type escolha "Secret", em Variable name escreva PANDASCORE_TOKEN e em Value cole a sua chave
//    da PandaScore (a do painel https://app.pandascore.co). Clique em Deploy.
// 4. O endereço do worker (algo como https://scoresports.SEU-NOME.workers.dev) é o que o app usa.
//
// Se a ESPN bloquear o celular, abra o app uma vez com ?repasse= no fim do link, assim:
//    https://SEU-USUARIO.github.io/Scoresports-pessoal2/?repasse=https://scoresports.SEU-NOME.workers.dev/?url=

const PERMITIDOS = /^https:\/\/([a-z0-9-]+\.)*(espn\.com|wikipedia\.org)\//;

// só estes caminhos da PandaScore passam (nada de "..", nada fora da lista)
export const CAMINHOS_PANDASCORE = /^(csgo|valorant|lol)\/[a-z0-9_\/-]*$|^(matches|teams|players|tournaments|leagues|series)(\/[a-z0-9_-]+)*$/;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

/** Quantos segundos uma resposta da PandaScore fica guardada na memória do worker. */
export function ttlPandascore(caminho) {
  if (/\/running$/.test(caminho)) return 30;
  if (/\/past$/.test(caminho)) return 3600;
  if (/^(teams|players)\//.test(caminho)) return 86400;
  return 120;
}

// A Cache API da Cloudflare não funciona em *.workers.dev: a memória é um Map do próprio worker.
// Vale enquanto a mesma instância estiver de pé (minutos a horas), o que já poupa o limite grátis.
const MEMORIA = new Map();
const MAXIMO_NA_MEMORIA = 200;

function texto(corpo, status) {
  return new Response(corpo, { status, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });
}

function respostaGuardada(item, ttl) {
  return new Response(item.corpo, {
    status: item.status,
    headers: { ...CORS, "content-type": item.tipo, "Cache-Control": `public, max-age=${ttl}` },
  });
}

/* ---------- Kings League ao vivo: /kings/<competição> ---------- */
// O robô do GitHub lê o site oficial a cada 20 min nas noites de jogo; o app, durante um jogo, pede aqui.
// Só a página da competição (liberada no robots.txt do site), nunca a de cada jogo, e guardada 30 s.

export const COMPETICOES_KINGS = /^(brazil|world-cup|kwc-nations)$/;
const EMBRULHOS_NUXT = ["Reactive", "ShallowReactive", "Ref", "ShallowRef", "NuxtError"];

/** O payload do Nuxt (uma lista em que cada valor aponta para outros pelo índice) como objeto. Igual ao robo/kings.py. */
export function decodificarNuxt(html) {
  const m = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html || "");
  if (!m) return null;
  const lista = JSON.parse(m[1]);
  const valor = (i, prof = 0) => {
    if (prof > 60 || !Number.isInteger(i) || i < 0 || i >= lista.length) return null;
    const v = lista[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === "string") {
        if (EMBRULHOS_NUXT.includes(v[0])) return v.length > 1 ? valor(v[1], prof + 1) : null;
        if (v[0] === "EmptyRef" || v[0] === "EmptyShallowRef") return null;
        if (v[0] === "Date") return v[1];
        if (v[0] === "Set" || v[0] === "Map") return v.slice(1).map((x) => valor(x, prof + 1));
      }
      return v.map((x) => valor(x, prof + 1));
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x, prof + 1)]));
    return v;
  };
  return valor(0);
}

/** A temporada, os times e os jogos da página (o mesmo formato do kings.json do robô, sem os destaques). */
export function competicaoKings(dados) {
  const loja = ((dados && dados.pinia) || {}).competitionStore || {};
  const temporada = loja.currentSeason || {};
  const times = {};
  for (const t of loja.currentSeasonTeams || []) {
    if (t && t.id !== null && t.id !== undefined) times[String(t.id)] = { nome: t.name ?? null, sigla: t.shortName ?? null, logo: (t.logo && t.logo.url) || null };
  }
  const turnos = Object.values((dados && dados.data) || {}).find((v) => Array.isArray(v) && v[0] && typeof v[0] === "object" && "matches" in v[0]) || [];
  const par = (p, a, b) => (p[a] !== null && p[a] !== undefined) || (p[b] !== null && p[b] !== undefined) ? [p[a] ?? null, p[b] ?? null] : null;
  const jogos = [];
  for (const turno of turnos) {
    for (const m of turno.matches || []) {
      const p = m.scores || {};
      const lados = m.participants || {};
      jogos.push({
        id: m.id,
        rodada: turno.turnName ?? null,
        grupo: m.groupName ?? null,
        inicio: m.date ?? null,
        status: m.status ?? null,
        minuto: m.currentMinute ?? null,
        casa: String(lados.homeTeamId),
        fora: String(lados.awayTeamId),
        placar: par(p, "homeScore", "awayScore"),
        tempos: [par(p, "homeScore1T", "awayScore1T"), par(p, "homeScore2T", "awayScore2T")].filter(Boolean),
        penaltis: par(p, "homeScoreP", "awayScoreP"),
        video: (m.metaInformation && m.metaInformation.youtube_url) || null,
      });
    }
  }
  return { temporada: temporada.name ?? null, encerrada: Boolean(temporada.finished), times, jogos };
}

async function kings(url) {
  const slug = url.pathname.slice("/kings/".length);
  if (!COMPETICOES_KINGS.test(slug)) return texto("Competição da Kings League não permitida.", 400);
  const chave = `kings:${slug}`;
  const guardado = MEMORIA.get(chave);
  if (guardado && guardado.ate > Date.now()) return respostaGuardada(guardado, 30);
  const resposta = await fetch(`https://kingsleague.pro/pt/${slug}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; scoresports-robo)", Accept: "text/html" } });
  if (!resposta.ok) return texto(`A Kings League respondeu ${resposta.status}.`, 502);
  let corpo;
  try {
    corpo = JSON.stringify(competicaoKings(decodificarNuxt(await resposta.text())));
  } catch (_) {
    return texto("A página da Kings League mudou de formato.", 502);
  }
  const item = { corpo, status: 200, tipo: "application/json; charset=utf-8" };
  if (MEMORIA.size >= MAXIMO_NA_MEMORIA) MEMORIA.delete(MEMORIA.keys().next().value);
  MEMORIA.set(chave, { ...item, ate: Date.now() + 30000 });
  return respostaGuardada(item, 30);
}

async function pandascore(url, env) {
  const caminho = url.pathname.slice("/pandascore/".length);
  if (!CAMINHOS_PANDASCORE.test(caminho)) return texto("Caminho da PandaScore não permitido.", 400);
  if (!env || !env.PANDASCORE_TOKEN) return texto("Falta o segredo PANDASCORE_TOKEN no worker.", 500);

  const chave = caminho + url.search;
  const ttl = ttlPandascore(caminho);
  const guardado = MEMORIA.get(chave);
  if (guardado && guardado.ate > Date.now()) return respostaGuardada(guardado, ttl);

  const resposta = await fetch(`https://api.pandascore.co/${caminho}${url.search}`, {
    headers: { Authorization: `Bearer ${env.PANDASCORE_TOKEN}`, Accept: "application/json" },
  });
  // só o corpo, o status e o tipo voltam para o app: nenhum cabeçalho da PandaScore passa
  const item = { corpo: await resposta.text(), status: resposta.status, tipo: resposta.headers.get("content-type") || "application/json" };
  if (resposta.ok) {
    if (MEMORIA.size >= MAXIMO_NA_MEMORIA) MEMORIA.delete(MEMORIA.keys().next().value); // sai o mais velho
    MEMORIA.set(chave, { ...item, ate: Date.now() + ttl * 1000 });
  }
  return respostaGuardada(item, resposta.ok ? ttl : 0);
}

export default {
  async fetch(pedido, env) {
    if (pedido.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (pedido.method !== "GET") return texto("Só GET.", 405);

    const url = new URL(pedido.url);
    if (url.pathname.startsWith("/pandascore/")) return pandascore(url, env);
    if (url.pathname.startsWith("/kings/")) return kings(url);

    const alvo = url.searchParams.get("url");
    if (!alvo || !PERMITIDOS.test(alvo)) return texto("Endereço não permitido.", 400);
    const resposta = await fetch(alvo, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    const cabecalhos = new Headers(resposta.headers);
    cabecalhos.set("Access-Control-Allow-Origin", "*");
    cabecalhos.set("Cache-Control", "public, max-age=15");
    return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
  },
};
