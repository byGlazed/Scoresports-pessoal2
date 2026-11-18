// Repasse (proxy) gratuito na Cloudflare. Faz duas coisas:
//
// 1. ESPN e Wikipédia por ?url= (para o caso de a ESPN bloquear o navegador do celular).
//    Ex.: https://SEU-WORKER.workers.dev/?url=https://site.api.espn.com/...
// 2. E-sports pela PandaScore por /pandascore/<caminho>, com a chave guardada como SEGREDO do worker.
//    Ex.: https://SEU-WORKER.workers.dev/pandascore/csgo/matches/running
//    A chave nunca fica neste arquivo, no app nem no GitHub: só no segredo PANDASCORE_TOKEN.
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

    const alvo = url.searchParams.get("url");
    if (!alvo || !PERMITIDOS.test(alvo)) return texto("Endereço não permitido.", 400);
    const resposta = await fetch(alvo, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    const cabecalhos = new Headers(resposta.headers);
    cabecalhos.set("Access-Control-Allow-Origin", "*");
    cabecalhos.set("Cache-Control", "public, max-age=15");
    return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
  },
};
