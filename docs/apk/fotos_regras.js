"use strict";

/* Regras puras das fotos dos jogadores, sem DOM: tudo no objeto Fotos.
   - NBA: a foto da ESPN existe para todos (pelo id do atleta).
   - Futebol: quando a ESPN não tem, a foto recortada do TheSportsDB (API gratuita), escolhida com cuidado:
     o time tem de bater; sem o time, só um nome completo e único. Na dúvida, nenhuma foto (fica o número).
   Testadas no Node (testes/fotos.test.js) com buscas reais em testes/amostras/thesportsdb_busca.json. */

const Fotos = (() => {
  const API = "https://www.thesportsdb.com/api/v1/json/123";

  const normalizar = (texto) =>
    String(texto || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  /** Os dois nomes são o mesmo time: iguais, ou um é uma palavra inteira do outro (5 letras ou mais). */
  function mesmoTime(a, b) {
    const x = normalizar(a);
    const y = normalizar(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
    return curto.length >= 5 && new RegExp(`\\b${curto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(longo);
  }

  /** A versão pequena da imagem (o TheSportsDB serve /small). */
  function urlPequena(url) {
    if (!url) return null;
    return /thesportsdb\.com\//.test(url) && !/\/(small|tiny|medium|preview)$/.test(url) ? `${url}/small` : url;
  }

  /** A foto do jogador entre os resultados da busca, ou null. */
  function escolher(resultados, nome, time) {
    const alvo = normalizar(nome);
    const candidatos = (resultados || []).filter((p) => p && p.strSport === "Soccer" && normalizar(p.strPlayer) === alvo && (p.strCutout || p.strThumb));
    if (!candidatos.length) return null;
    const doTime = candidatos.filter((p) => mesmoTime(p.strTeam, time));
    let escolhido = null;
    if (doTime.length === 1) escolhido = doTime[0];
    // sem o time: só se o "time" do resultado for a seleção do próprio jogador (o TheSportsDB às vezes guarda
    // a seleção no lugar do clube), com nome completo e um só resultado; outro clube pode ser um homônimo
    else if (!doTime.length && candidatos.length === 1 && alvo.split(" ").length >= 2) {
      const c = candidatos[0];
      if (!c.strTeam || (c.strNationality && normalizar(c.strTeam) === normalizar(c.strNationality))) escolhido = c;
    }
    return escolhido ? urlPequena(escolhido.strCutout || escolhido.strThumb) : null;
  }

  /** As chaves do cache a apagar: as vencidas e, além do limite, as que vencem primeiro. */
  function chavesParaApagar(entradas, agora, maximo) {
    const vencidas = entradas.filter((e) => !(e.ate > agora)).map((e) => e.chave);
    const validas = entradas.filter((e) => e.ate > agora).sort((a, b) => a.ate - b.ate);
    const excesso = validas.slice(0, Math.max(0, validas.length - maximo)).map((e) => e.chave);
    return [...vencidas, ...excesso];
  }

  const espnNba = (id) => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
  const urlBusca = (nome) => `${API}/searchplayers.php?p=${encodeURIComponent(String(nome || "").trim())}`;
  const chave = (nome, time) => `${normalizar(nome)}|${normalizar(time)}`;

  return { normalizar, mesmoTime, urlPequena, escolher, chavesParaApagar, espnNba, urlBusca, chave };
})();

if (typeof module !== "undefined") module.exports = Fotos;
