"use strict";

/* Regras puras do cache do celular (banco do navegador), sem DOM: tudo no objeto CacheRegras.
   - Dado válido: usa. Vencido mas recente (até 6 h): entrega na hora e busca o novo em segundo plano.
     Mais velho que isso, ou marcado "semVelho" (o ao vivo dos e-sports, que corrige outras listas): espera a rede.
   - Jogo guardado que já devia ter começado (ou estava ao vivo) não é mostrado como "vai começar": a tela
     espera a rede um pouco ("conferir") e, se ela demorar, o jogo aparece como "atualizando".
   - Os avisos de "dado novo" (que redesenham a tela aberta) ficam espaçados, para a tela não piscar
     nem disparar pedidos em cadeia numa rede lenta.
   Testadas no Node (testes/cache_regras.test.js). */

const CacheRegras = (() => {
  const VELHO_MAXIMO = 6 * 3600; // segundos
  const INTERVALO_AVISOS = 10000; // milissegundos
  const ESPERA_CONFERIR = 2500; // milissegundos: quanto a tela espera a rede antes de mostrar "atualizando"
  const JANELA_JOGO = 12 * 3600000; // jogo "a jogar" com horário passado há mais que isso é adiado, não atrasado
  const PARADO = /adiad|cancel|suspens|interromp|a definir/i;

  /** Este jogo guardado pode ter mudado desde que foi salvo? (ao vivo, ou com o horário de início já passado). */
  function jogoTalvezMudou(j, agoraMs) {
    if (!j || PARADO.test(j.status || "")) return false;
    if (j.estado === 2) return true;
    if (j.estado !== 1) return false;
    const t = Date.parse(j.inicio || "");
    return !Number.isNaN(t) && t <= agoraMs && agoraMs - t < JANELA_JOGO;
  }

  /** Os jogos que podem ter mudado ficam marcados "atualizando" (a tela não mostra o horário nem o placar velho). */
  function marcarAtualizando(jogos, agoraMs) {
    return (jogos || []).map((j) => (jogoTalvezMudou(j, agoraMs) ? { ...j, atualizando: true } : j));
  }

  /** "valido", "velho" (entrega e atualiza em segundo plano), "conferir" (vencido e com jogo que pode ter
      mudado: espera a rede um pouco) ou "buscar" (espera a rede). Tempos em segundos.
      opcoes.duvidoso(valor, agoraMs): o dado guardado tem algo que pode estar errado agora? */
  function decidir(salvo, agora, opcoes = {}) {
    if (!salvo) return "buscar";
    if (agora < salvo.vale_ate) return "valido";
    if (!opcoes.semVelho && agora - salvo.salvo_em < VELHO_MAXIMO) {
      return opcoes.duvidoso && opcoes.duvidoso(salvo.valor, agora * 1000) ? "conferir" : "velho";
    }
    return "buscar";
  }

  /** Quantos ms esperar antes do próximo aviso (0 = pode avisar já). */
  function esperaParaAvisar(ultimoAviso, agora, intervalo = INTERVALO_AVISOS) {
    if (ultimoAviso === null || ultimoAviso === undefined) return 0;
    return Math.max(0, intervalo - (agora - ultimoAviso));
  }

  return { VELHO_MAXIMO, ESPERA_CONFERIR, decidir, esperaParaAvisar, jogoTalvezMudou, marcarAtualizando };
})();

if (typeof module !== "undefined") module.exports = CacheRegras;
