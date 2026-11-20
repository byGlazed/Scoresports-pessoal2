"use strict";

/* =========================================================================
   Fotos dos jogadores de futebol pelo TheSportsDB (quando a ESPN não tem).
   - Primeiro o índice que o robô monta (dados/fotos.json: os times brasileiros, com a foto ou a
     marca de "não tem"): sai na hora, sem pedido nenhum.
   - Fora do índice, a busca no TheSportsDB: até 4 ao mesmo tempo e até 25 por minuto (o plano
     gratuito aceita cerca de 30), na ordem em que a tela pede (titulares primeiro). Um 429 pausa a
     fila (1 min, dobrando até 8).
   - Tudo fica guardado no aparelho por 30 dias. A tela desenha o número e troca pela foto quando ela chega.
   A escolha da foto (time certo, nada de homônimo) e as contas de espera ficam em fotos_regras.js.
   ========================================================================= */

const FotoJogador = (() => {
  const PRAZO_MS = 30 * 86400 * 1000;
  // "ss:foto2:" desde a regra do nome curto (Warleson = Warleson Oliveira): os "não tem" da regra antiga saem
  const PREFIXO = "ss:foto2:";
  const SIMULTANEAS = 4;
  const memoria = new Map(); // chave -> Promise<url|null>
  const fila = []; // { nome, time, chave, ok }
  const feitas = []; // horários das buscas do último minuto
  let ativas = 0;
  let pausa = 0; // depois de um 429 (1 min, dobrando até 8 min)
  let pausaAte = 0;
  let relogio = null;

  function lerGuardada(chave) {
    try {
      const v = JSON.parse(localStorage.getItem(`${PREFIXO}${chave}`) || "null");
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
        if (k && k.startsWith("ss:foto:")) {
          localStorage.removeItem(k); // da regra antiga
          i--;
          continue;
        }
        if (!k || !k.startsWith(PREFIXO)) continue;
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
      localStorage.setItem(`${PREFIXO}${chave}`, valor);
    } catch (_) {
      // sem espaço: libera metade das fotos e tenta uma vez mais
      limpar(Math.floor(MAXIMO / 2));
      try {
        localStorage.setItem(`${PREFIXO}${chave}`, valor);
      } catch (__) {
        /* só não guarda */
      }
    }
  }

  // o índice do robô (dados/fotos.json): pedido uma vez; sem ele (PC, sem rede), tudo vai à busca
  let indice = null;
  function lerIndice() {
    if (!indice) {
      indice = fetch("dados/fotos.json")
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => (d && d.fotos) || {})
        .catch(() => ({}));
    }
    return indice;
  }

  async function buscarNoSite(item) {
    feitas.push(Date.now());
    try {
      const r = await fetch(Fotos.urlBusca(item.nome));
      if (r.status === 429) {
        // limite do plano gratuito: a fila para um pouco, e a foto pode vir numa próxima vez
        pausa = Fotos.proximaPausa(pausa);
        pausaAte = Date.now() + pausa;
        memoria.delete(item.chave);
        return null;
      }
      pausa = 0;
      if (!r.ok) return null;
      const url = Fotos.escolher((await r.json()).player, item.nome, item.time);
      guardar(item.chave, url);
      return url;
    } catch (_) {
      memoria.delete(item.chave); // sem internet: tenta de novo numa próxima vez
      return null;
    }
  }

  /** Começa as buscas que podem sair agora; as outras esperam a vez. */
  function andar() {
    clearTimeout(relogio);
    relogio = null;
    while (fila.length && ativas < SIMULTANEAS) {
      const agora = Date.now();
      while (feitas.length && agora - feitas[0] > 60000) feitas.shift();
      const espera = Math.max(Fotos.esperaParaBuscar(feitas, agora), pausaAte - agora);
      if (espera > 0) {
        relogio = setTimeout(andar, espera);
        return;
      }
      const item = fila.shift();
      ativas += 1;
      buscarNoSite(item)
        .then(item.ok)
        .finally(() => {
          ativas -= 1;
          andar();
        });
    }
  }

  /** A foto do jogador do time (ou null). */
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
    const p = lerIndice().then((fotos) => {
      if (Object.prototype.hasOwnProperty.call(fotos, chave)) {
        guardar(chave, fotos[chave]);
        return fotos[chave]; // o robô já procurou: a foto, ou null quando não tem
      }
      return new Promise((ok) => {
        fila.push({ nome, time, chave, ok });
        andar();
      });
    });
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
