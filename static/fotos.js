"use strict";

/* =========================================================================
   Fotos dos jogadores de futebol pelo TheSportsDB (quando a ESPN não tem): uma busca por vez
   (o plano gratuito aceita cerca de 30 por minuto), na ordem em que a tela pede (titulares primeiro),
   guardadas no aparelho por 30 dias. A tela desenha o número da camisa e troca pela foto quando ela chega.
   A escolha da foto (time certo, nada de homônimo) fica em fotos_regras.js.
   ========================================================================= */

const FotoJogador = (() => {
  const PRAZO_MS = 30 * 86400 * 1000;
  const INTERVALO_MS = 2100;
  const memoria = new Map(); // chave -> Promise<url|null>
  let fila = Promise.resolve();
  let ultimo = 0;

  function lerGuardada(chave) {
    try {
      const v = JSON.parse(localStorage.getItem(`ss:foto:${chave}`) || "null");
      return v && v.ate > Date.now() ? v : null;
    } catch (_) {
      return null;
    }
  }

  function guardar(chave, url) {
    try {
      localStorage.setItem(`ss:foto:${chave}`, JSON.stringify({ u: url, ate: Date.now() + PRAZO_MS }));
    } catch (_) {
      /* sem espaço ou sem localStorage: só não guarda */
    }
  }

  /** A foto do jogador do time (ou null). Sem internet, não guarda o "não achei". */
  function buscar(nome, time) {
    const chave = Fotos.chave(nome, time);
    if (memoria.has(chave)) return memoria.get(chave);
    const guardada = lerGuardada(chave);
    if (guardada) {
      const p = Promise.resolve(guardada.u);
      memoria.set(chave, p);
      return p;
    }
    const p = (fila = fila.then(async () => {
      const espera = INTERVALO_MS - (Date.now() - ultimo);
      if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
      ultimo = Date.now();
      try {
        const r = await fetch(Fotos.urlBusca(nome));
        if (!r.ok) return null;
        const url = Fotos.escolher((await r.json()).player, nome, time);
        guardar(chave, url);
        return url;
      } catch (_) {
        return null;
      }
    }));
    memoria.set(chave, p);
    return p;
  }

  /** Troca `alvo` (o círculo com o número) pela foto quando ela chegar, se ele ainda estiver na tela. */
  function aplicar(alvo, nome, time, classe) {
    if (!nome || !time) return;
    buscar(nome, time).then((url) => {
      if (!url || !alvo.isConnected) return;
      // o recorte do TheSportsDB é de meio corpo: um círculo com zoom no rosto
      const moldura = h("span", { class: `${classe} recorte` });
      moldura.append(h("img", { src: url, alt: "", loading: "lazy", onerror: () => moldura.replaceWith(alvo) }));
      alvo.replaceWith(moldura);
    });
  }

  return { buscar, aplicar };
})();
