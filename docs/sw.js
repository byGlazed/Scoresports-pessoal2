/* Service worker: guarda o app no celular para ele abrir rápido e até sem internet.
   Os dados das partidas ficam no banco do navegador (IndexedDB), cuidado pelo direto.js. */

const VERSAO = "20261120-130755"; // o gerar_celular.py troca por data e hora a cada geração
const CACHE = `scoresports-${VERSAO}`;
const ARQUIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./fontes/inter.woff2",
  "./nba_quadra.js",
  "./notas_regras.js",
  "./campinho_regras.js",
  "./esports_regras.js",
  "./fotos_regras.js",
  "./visual_regras.js",
  "./liga_regras.js",
  "./liga.js",
  "./kings_regras.js",
  "./kings.js",
  "./rotas.js",
  "./app.js",
  "./esportes.js",
  "./fotos.js",
  "./campinho.js",
  "./esports.js",
  "./inicio.js",
  "./chave_regras.js",
  "./navegacao.js",
  "./chave.js",
  "./busca_regras.js",
  "./regras_esportes.js",
  "./time_dados.js",
  "./cache_regras.js",
  "./direto.js",
  "./registrar.js",
  "./manifest.webmanifest",
  "./icone-192.png",
  "./icone-512.png",
  "./apple-touch-icon.png",
  "./dados/transmissoes.json",
  "./dados/boxe_eventos.json",
  "./dados/campeoes.json",
];

self.addEventListener("install", (e) => {
  // cache: "reload" pula o cache HTTP do navegador (o GitHub Pages manda guardar por 10 min):
  // sem isso, a versão nova podia ser montada com arquivos da versão anterior
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("scoresports-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  if (url.origin !== self.location.origin) return; // ESPN e Wikipédia: o direto.js cuida

  // arquivos de dados (transmissões, boxe, campeões): a versão nova pela rede, mas sem segurar a abertura:
  // se a rede não responder em 1,5 s, entrega o guardado (e a nova fica guardada para a próxima vez)
  if (url.pathname.includes("/dados/")) {
    const daRede = fetch(e.request).then((r) => {
      if (r.ok) {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
      }
      return r;
    });
    const prazo = new Promise((ok) => setTimeout(ok, 1500)).then(() => caches.match(e.request));
    e.respondWith(
      Promise.race([daRede.catch(() => caches.match(e.request)), prazo]).then((r) => r || daRede)
    );
    e.waitUntil(daRede.catch(() => {}));
    return;
  }

  // o resto do app: usa o guardado (rápido e funciona sem internet)
  e.respondWith(caches.match(e.request).then((guardado) => guardado || fetch(e.request)));
});
