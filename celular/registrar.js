"use strict";

/* Liga o service worker e guarda o endereço do repasse, se vier no link.
   Ex.: https://SEU-USUARIO.github.io/Scoresports-pessoal2/?repasse=https://seu-repasse.workers.dev/?url= */

(function () {
  try {
    const parametros = new URLSearchParams(location.search);
    const repasse = parametros.get("repasse");
    if (repasse !== null) {
      if (repasse) localStorage.setItem("ss:proxy", repasse);
      else localStorage.removeItem("ss:proxy");
      history.replaceState(null, "", location.pathname);
      location.reload();
      return;
    }
  } catch (_) {
    /* navegador sem armazenamento */
  }
  // no app Android as telas já estão dentro do APK: o service worker não é necessário
  const dentroDoApk = location.hostname === "appassets.androidplatform.net";
  if ("serviceWorker" in navigator && !dentroDoApk) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
