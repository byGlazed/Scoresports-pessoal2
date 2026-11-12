/* Service worker: guarda o app no celular para ele abrir rápido e até sem internet.
   Os dados das partidas ficam no banco do navegador (IndexedDB), cuidado pelo direto.js. */

const VERSAO = "__VERSAO__"; // o gerar_celular.py troca por data e hora a cada geração
const CACHE = `scoresports-${VERSAO}`;
const ARQUIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./fontes/inter.woff2",
  "./nba_quadra.js",
  "./app.js",
  "./esportes.js",
  "./inicio.js",
  "./busca_regras.js",
  "./regras_esportes.js",
  "./time_dados.js",
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
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

  // arquivos de dados (transmissões, boxe, campeões): tenta a rede primeiro para pegar a versão nova
  if (url.pathname.includes("/dados/")) {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // o resto do app: usa o guardado (rápido e funciona sem internet)
  e.respondWith(caches.match(e.request).then((guardado) => guardado || fetch(e.request)));
});
