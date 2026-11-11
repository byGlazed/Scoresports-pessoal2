// Repasse (proxy) gratuito na Cloudflare, para o caso de a ESPN bloquear o acesso direto
// pelo navegador do celular. Só repassa endereços da ESPN e da Wikipédia.
//
// Como criar (5 minutos, sem cartão):
// 1. Crie uma conta em https://dash.cloudflare.com e vá em Workers & Pages > Create > Worker.
// 2. Apague o código de exemplo, cole este arquivo inteiro e clique em Deploy.
// 3. Copie o endereço do worker (algo como https://scoresports.SEU-NOME.workers.dev).
// 4. No celular, abra uma vez o app com ?repasse= no fim do link, assim:
//    https://SEU-USUARIO.github.io/Scoresports-pessoal2/?repasse=https://scoresports.SEU-NOME.workers.dev/?url=

const PERMITIDOS = /^https:\/\/([a-z0-9-]+\.)*(espn\.com|wikipedia\.org)\//;

export default {
  async fetch(pedido) {
    if (pedido.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" } });
    }
    const alvo = new URL(pedido.url).searchParams.get("url");
    if (!alvo || !PERMITIDOS.test(alvo)) {
      return new Response("Endereço não permitido.", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    const resposta = await fetch(alvo, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    const cabecalhos = new Headers(resposta.headers);
    cabecalhos.set("Access-Control-Allow-Origin", "*");
    cabecalhos.set("Cache-Control", "public, max-age=15");
    return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
  },
};
