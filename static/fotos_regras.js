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

  // a ESPN usa a sigla do estado; o TheSportsDB, o nome do clube (igual no robô, robo/fotos.py)
  const APELIDOS = {
    "atletico mg": "atletico mineiro",
    "america mg": "america mineiro",
    "atletico go": "atletico goianiense",
    "athletico pr": "athletico paranaense",
    "operario pr": "operario ferroviario",
    remo: "clube do remo",
  };
  const comApelido = (n) => APELIDOS[n] || n;

  /** Os dois nomes são o mesmo time: iguais, ou um é uma palavra inteira do outro (5 letras ou mais). */
  function mesmoTime(a, b) {
    const x = comApelido(normalizar(a));
    const y = comApelido(normalizar(b));
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
    const comFoto = (resultados || []).filter((p) => p && p.strSport === "Soccer" && (p.strCutout || p.strThumb));
    const candidatos = comFoto.filter((p) => normalizar(p.strPlayer) === alvo);
    const doTime = candidatos.filter((p) => mesmoTime(p.strTeam, time));
    let escolhido = null;
    if (doTime.length === 1) escolhido = doTime[0];
    // sem o time: só se o "time" do resultado for a seleção do próprio jogador (o TheSportsDB às vezes guarda
    // a seleção no lugar do clube), com nome completo e um só resultado; outro clube pode ser um homônimo
    else if (!doTime.length && candidatos.length === 1 && alvo.split(" ").length >= 2) {
      const c = candidatos[0];
      if (!c.strTeam || (c.strNationality && normalizar(c.strTeam) === normalizar(c.strNationality))) escolhido = c;
    }
    // a ESPN usa o nome curto ("Warleson"); o TheSportsDB, o completo ("Warleson Oliveira"): vale se o time
    // bate e todas as palavras do nome curto estão no completo, e só um jogador do time servir
    else if (!doTime.length && alvo) {
      const palavras = alvo.split(" ");
      const contidos = comFoto.filter((p) => mesmoTime(p.strTeam, time) && palavras.every((w) => normalizar(p.strPlayer).split(" ").includes(w)));
      if (contidos.length === 1) escolhido = contidos[0];
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

  // a foto da ESPN no tamanho da tela (o original tem 1040 x 760)
  const espnNba = (id) => `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=120&h=88`;

  /** Quantos ms esperar antes da próxima busca: até `maximo` buscas numa janela de 1 min saem na hora
      (o plano gratuito aceita cerca de 30 por minuto); passou disso, espera a mais antiga sair da janela. */
  function esperaParaBuscar(feitas, agora, maximo = 25, janela = 60000) {
    const naJanela = (feitas || []).filter((t) => agora - t < janela).sort((a, b) => a - b);
    if (naJanela.length < maximo) return 0;
    return naJanela[naJanela.length - maximo] + janela - agora;
  }

  /** Quanto esperar depois de um 429 do TheSportsDB: 1 min na primeira vez, dobrando até 8 min. */
  const proximaPausa = (atual) => Math.min(480000, atual ? atual * 2 : 60000);
  const urlBusca = (nome) => `${API}/searchplayers.php?p=${encodeURIComponent(String(nome || "").trim())}`;
  const chave = (nome, time) => `${normalizar(nome)}|${normalizar(time)}`;

  return { normalizar, mesmoTime, urlPequena, escolher, chavesParaApagar, espnNba, proximaPausa, esperaParaBuscar, urlBusca, chave };
})();

if (typeof module !== "undefined") module.exports = Fotos;
