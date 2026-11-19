"use strict";

/* Regras puras do campinho do futebol, sem DOM: tudo no objeto Campinho.
   - Onde cada titular fica, pela formação e pelo formationPlace (padrão Opta, que a ESPN usa).
   - O campo é visto de cima, com o goleiro em cima e o time atacando para baixo:
     o lado esquerdo do time aparece à DIREITA da tela (como no Sofascore).
   - Minutos jogados a partir das substituições dos lances.
   Testadas no Node (testes/campinho.test.js) com escalações reais em testes/amostras/. */

const Campinho = (() => {
  // as linhas do goleiro ao ataque; em cada linha, os lugares da esquerda para a direita DO TIME.
  // Só entra formação conferida numa escalação real (testes/amostras/espn_formacoes.json).
  const LINHAS = {
    "3-4-1-2": [[1], [4, 5, 6], [3, 8, 7, 2], [9], [11, 10]],
    "3-4-2-1": [[1], [4, 5, 6], [3, 8, 7, 2], [11, 10], [9]],
    "3-4-3": [[1], [4, 5, 6], [3, 8, 7, 2], [11, 9, 10]],
    "3-5-2": [[1], [4, 5, 6], [3, 8, 11, 7, 2], [9, 10]],
    "4-1-4-1": [[1], [3, 6, 5, 2], [4], [11, 10, 8, 7], [9]],
    "4-2-2-2": [[1], [3, 6, 5, 2], [8, 4], [11, 7], [9, 10]],
    "4-2-3-1": [[1], [3, 6, 5, 2], [4, 8], [11, 10, 7], [9]],
    "4-3-2-1": [[1], [3, 6, 5, 2], [7, 4, 8], [11, 10], [9]],
    "4-3-3": [[1], [3, 6, 5, 2], [8, 4, 7], [11, 9, 10]],
    "4-4-2": [[1], [3, 6, 5, 2], [11, 8, 4, 7], [9, 10]],
    "4-5-1": [[1], [3, 6, 5, 2], [11, 8, 10, 4, 7], [9]],
    "5-3-2": [[1], [3, 4, 5, 6, 2], [11, 8, 7], [9, 10]],
    "5-4-1": [[1], [3, 4, 5, 6, 2], [11, 10, 8, 7], [9]],
  };

  const Y_TOPO = 0.08;
  const Y_FUNDO = 0.9;

  /** Onde cada titular fica na tela (x e y de 0 a 1), ou null para cair na lista. */
  function posicoes(formacao, titulares) {
    const linhas = LINHAS[String(formacao || "").trim()];
    if (!linhas || !Array.isArray(titulares) || titulares.length !== 11) return null;
    const porLugar = new Map(titulares.map((j) => [Number(j.lugar), j]));
    if (porLugar.size !== 11) return null;
    const saida = [];
    linhas.forEach((lugares, linha) => {
      const y = Y_TOPO + ((Y_FUNDO - Y_TOPO) * linha) / (linhas.length - 1);
      lugares.forEach((lugar, i) => {
        const jogador = porLugar.get(lugar);
        // espelhado: o primeiro da esquerda do time fica na direita da tela
        if (jogador) saida.push({ jogador, linha, x: 1 - (i + 0.5) / lugares.length, y });
      });
    });
    return saida.length === 11 ? saida : null;
  }

  /** "67'" → 67, "90'+3'" → 93. */
  function minutoDoTexto(texto) {
    const m = /^\s*(\d+)'?(?:\s*\+\s*(\d+)'?)?/.exec(String(texto ?? ""));
    return m ? Number(m[1]) + Number(m[2] || 0) : null;
  }

  /** Quem entrou e quem saiu, e quando: nos lances da ESPN, participants[0] entra e participants[1] sai. */
  function substituicoes(keyEvents) {
    const saida = {};
    for (const e of keyEvents || []) {
      const tipo = String(((e || {}).type || {}).type || ((e || {}).type || {}).text || "").toLowerCase();
      if (!tipo.includes("substitution")) continue;
      const minuto = minutoDoTexto((e.clock || {}).displayValue);
      const [entra, sai] = (e.participants || []).map((p) => String(((p || {}).athlete || {}).id || ""));
      if (entra) saida[entra] = { ...saida[entra], entrou_aos: minuto, ...(sai ? { no_lugar_de: sai } : {}) };
      if (sai) saida[sai] = { ...saida[sai], saiu_aos: minuto, ...(entra ? { saiu_para: entra } : {}) };
    }
    return saida;
  }

  /** Minutos em campo. minutoFinal = 90 no jogo encerrado, o relógio no ao vivo, null antes do jogo. */
  function minutosJogados(j, minutoFinal) {
    if (minutoFinal === null || minutoFinal === undefined || !j) return null;
    const ate = j.saiu_aos ?? minutoFinal;
    if (j.titular) return Math.max(0, ate);
    if (j.entrou_aos === null || j.entrou_aos === undefined) return null;
    return Math.max(0, ate - j.entrou_aos);
  }

  return { LINHAS, posicoes, minutoDoTexto, substituicoes, minutosJogados };
})();

if (typeof module !== "undefined") module.exports = Campinho;
