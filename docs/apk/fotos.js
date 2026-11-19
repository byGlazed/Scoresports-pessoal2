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
  let pausa = 0; // depois de um 429, a fila espera (1 min, dobrando até 8 min)
  let pausaAte = 0;

  function lerGuardada(chave) {
    try {
      const v = JSON.parse(localStorage.getItem(`ss:foto:${chave}`) || "null");
      return v && v.ate > Date.now() ? v : null;
    } catch (_) {
      return null;
    }
  }

  const MAXIMO = 800; // fotos guardadas no aparelho (cada uma é só um endereço)
  let limpo = false;

  /** Apaga as vencidas e, além do limite, as mais antigas (para não tomar o espaço dos favoritos). */
  function limpar(maximo = MAXIMO) {
    try {
      const entradas = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("ss:foto:")) continue;
        let ate = 0;
        try {
          ate = JSON.parse(localStorage.getItem(k) || "{}").ate || 0;
        } catch (_) {
          /* entrada quebrada: sai */
        }
        entradas.push({ chave: k, ate });
      }
      Fotos.chavesParaApagar(entradas, Date.now(), maximo).forEach((k) => localStorage.removeItem(k));
    } catch (_) {
      /* sem localStorage */
    }
  }

  function guardar(chave, url) {
    const valor = JSON.stringify({ u: url, ate: Date.now() + PRAZO_MS });
    try {
      localStorage.setItem(`ss:foto:${chave}`, valor);
    } catch (_) {
      // sem espaço: libera metade das fotos e tenta uma vez mais
      limpar(Math.floor(MAXIMO / 2));
      try {
        localStorage.setItem(`ss:foto:${chave}`, valor);
      } catch (__) {
        /* só não guarda */
      }
    }
  }

  /** A foto do jogador do time (ou null). Sem internet, não guarda o "não achei". */
  function buscar(nome, time) {
    if (!limpo) {
      limpo = true;
      limpar();
    }
    const chave = Fotos.chave(nome, time);
    if (memoria.has(chave)) return memoria.get(chave);
    const guardada = lerGuardada(chave);
    if (guardada) {
      const p = Promise.resolve(guardada.u);
      memoria.set(chave, p);
      return p;
    }
    const p = (fila = fila.then(async () => {
      const espera = Math.max(INTERVALO_MS - (Date.now() - ultimo), pausaAte - Date.now());
      if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
      ultimo = Date.now();
      try {
        const r = await fetch(Fotos.urlBusca(nome));
        if (r.status === 429) {
          // limite do plano gratuito: a fila para um pouco, e a foto pode vir numa próxima vez
          pausa = Fotos.proximaPausa(pausa);
          pausaAte = Date.now() + pausa;
          memoria.delete(chave);
          return null;
        }
        pausa = 0;
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
