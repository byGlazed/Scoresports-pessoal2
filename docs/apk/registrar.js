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
  const abertaEm = Date.now();

  if (dentroDoApk) {
    // O APK baixa a versão nova do Pages logo que abre, mas a página aberta continua a antiga até o
    // Android fechar o app de vez. Ao voltar para o app, se o versao.txt servido mudou, recarrega
    // (na mesma página: o endereço fica no #).
    const lerVersao = () =>
      fetch("versao.txt", { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((t) => (/^versao (\S+)/m.exec(t) || [])[1] || null)
        .catch(() => null);
    let carregada = null;
    lerVersao().then((v) => (carregada = v));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || !carregada) return;
      lerVersao().then((v) => {
        if (v && v !== carregada) location.reload();
      });
    });
    return;
  }

  if ("serviceWorker" in navigator) {
    // a versão nova do site: quem assume é o service worker novo. Logo depois de abrir, recarrega na hora;
    // com a página em uso, espera a pessoa sair e voltar para o app
    const tinhaControle = Boolean(navigator.serviceWorker.controller);
    let pendente = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!tinhaControle) return; // a primeira instalação não muda nada na tela
      if (Date.now() - abertaEm < 15000) location.reload();
      else pendente = true;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      if (pendente) {
        location.reload();
        return;
      }
      // ao voltar para o app, procura versão nova (o navegador só procura ao abrir a página)
      navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    });
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
