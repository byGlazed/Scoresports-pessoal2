"use strict";

/* Regras puras do cache do celular (banco do navegador), sem DOM: tudo no objeto CacheRegras.
   - Dado válido: usa. Vencido mas recente (até 6 h): entrega na hora e busca o novo em segundo plano.
     Mais velho que isso, ou marcado "semVelho" (o ao vivo dos e-sports, que corrige outras listas): espera a rede.
   - Os avisos de "dado novo" (que redesenham a tela aberta) ficam espaçados, para a tela não piscar
     nem disparar pedidos em cadeia numa rede lenta.
   Testadas no Node (testes/cache_regras.test.js). */

const CacheRegras = (() => {
  const VELHO_MAXIMO = 6 * 3600; // segundos
  const INTERVALO_AVISOS = 10000; // milissegundos

  /** "valido", "velho" (entrega e atualiza em segundo plano) ou "buscar" (espera a rede). Tempos em segundos. */
  function decidir(salvo, agora, opcoes = {}) {
    if (!salvo) return "buscar";
    if (agora < salvo.vale_ate) return "valido";
    if (!opcoes.semVelho && agora - salvo.salvo_em < VELHO_MAXIMO) return "velho";
    return "buscar";
  }

  /** Quantos ms esperar antes do próximo aviso (0 = pode avisar já). */
  function esperaParaAvisar(ultimoAviso, agora, intervalo = INTERVALO_AVISOS) {
    if (ultimoAviso === null || ultimoAviso === undefined) return 0;
    return Math.max(0, intervalo - (agora - ultimoAviso));
  }

  return { VELHO_MAXIMO, decidir, esperaParaAvisar };
})();

if (typeof module !== "undefined") module.exports = CacheRegras;
