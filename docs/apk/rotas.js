"use strict";

/* Regras puras da navegação: endereços das páginas, pilha de páginas de cada aba,
   o que o voltar faz e a ordem dos grupos da lista "Todos".
   Sem DOM: tudo fica no objeto Rotas, que também é testado no Node (testes/rotas.test.js). */

const Rotas = (() => {
  const ABAS = ["jogos", "favoritos", "pesquisa"];

  // os segmentos de cada tipo de página, na ordem do endereço
  const SEGMENTOS = {
    jogos: [],
    favoritos: [],
    pesquisa: [],
    liga: ["esporte", "liga", "aba"],
    jogo: ["esporte", "liga", "id"],
    time: ["esporte", "liga", "id"],
    atleta: ["esporte", "liga", "id"],
    boxeador: ["nome"],
    evento: ["esporte", "liga", "id"],
  };

  const ORDEM_ESPORTES = ["futebol", "nba", "nfl", "mlb", "nhl", "f1", "ufc", "boxe", "esports", "kings"];
  const CHIPS_ESPORTE = [
    ["todos", "Todos"],
    ["futebol", "Futebol"],
    ["nba", "NBA"],
    ["nfl", "NFL"],
    ["mlb", "MLB"],
    ["nhl", "NHL"],
    ["f1", "F1"],
    ["ufc", "UFC"],
    ["boxe", "Boxe"],
    ["esports", "E-sports"],
    ["kings", "Kings League"],
  ];

  const raiz = (aba) => ({ tipo: aba, params: {} });

  function lerEndereco(hash) {
    const partes = String(hash || "").replace(/^#\/?/, "").split("/").filter((p) => p !== "");
    const tipo = partes[0];
    const nomes = SEGMENTOS[tipo];
    if (!nomes || partes.length - 1 !== nomes.length) return raiz("jogos");
    const params = {};
    nomes.forEach((n, i) => {
      try {
        params[n] = decodeURIComponent(partes[i + 1]);
      } catch (_) {
        params[n] = partes[i + 1];
      }
    });
    return { tipo, params };
  }

  function montarEndereco(pagina) {
    const nomes = SEGMENTOS[pagina && pagina.tipo];
    if (!nomes) return null;
    const params = pagina.params || {};
    return "#/" + [pagina.tipo, ...nomes.map((n) => encodeURIComponent(String(params[n] ?? "")))].join("/");
  }

  function novasPilhas() {
    return { atual: "jogos", jogos: [raiz("jogos")], favoritos: [raiz("favoritos")], pesquisa: [raiz("pesquisa")] };
  }

  const copiar = (p) => ({ atual: p.atual, jogos: p.jogos.slice(), favoritos: p.favoritos.slice(), pesquisa: p.pesquisa.slice() });

  const topo = (p) => p[p.atual][p[p.atual].length - 1];

  function empilhar(p, pagina) {
    const q = copiar(p);
    q[q.atual].push(pagina);
    return q;
  }

  function trocarAba(p, aba) {
    if (!ABAS.includes(aba)) return copiar(p);
    const q = copiar(p);
    q.atual = aba;
    return q;
  }

  function tocarAbaAtiva(p) {
    const q = copiar(p);
    q[q.atual] = q[q.atual].slice(0, 1);
    return q;
  }

  function acaoVoltar(p) {
    if (p[p.atual].length > 1) return "desempilhar";
    return p.atual === "jogos" ? "sair" : "irParaJogos";
  }

  function voltar(p) {
    const acao = acaoVoltar(p);
    const q = copiar(p);
    if (acao === "desempilhar") q[q.atual] = q[q.atual].slice(0, -1);
    else if (acao === "irParaJogos") q.atual = "jogos";
    return q;
  }

  function pilhasDeEndereco(hash) {
    const pagina = lerEndereco(hash);
    const p = novasPilhas();
    if (ABAS.includes(pagina.tipo)) {
      p.atual = pagina.tipo;
      return p;
    }
    p.jogos.push(pagina);
    return p;
  }

  function ordenarGrupos(grupos) {
    const posEsporte = (e) => {
      const i = ORDEM_ESPORTES.indexOf(e);
      return i < 0 ? ORDEM_ESPORTES.length : i;
    };
    return grupos
      .map((g, i) => ({ g, i }))
      .sort(
        (a, b) =>
          (b.g.aoVivo ? 1 : 0) - (a.g.aoVivo ? 1 : 0) ||
          posEsporte(a.g.esporte) - posEsporte(b.g.esporte) ||
          (a.g.ordem ?? 0) - (b.g.ordem ?? 0) ||
          a.i - b.i
      )
      .map((x) => x.g);
  }

  /* Histórico do navegador: só duas entradas, a "base" e a do app por cima dela.
     O voltar do navegador sempre cai na base; o app faz o próprio voltar e arma a entrada de novo.
     Assim o histórico nunca sai de passo com as pilhas (recarregar, trocar de aba, avançar). */
  function iniciarHistorico(estado) {
    return estado && estado.app ? "manter" : "armar";
  }

  function passoHistorico(estado) {
    if (!estado) return { acao: "abrir", rearmar: false }; // endereço digitado ou link com #
    return { acao: "voltar", rearmar: Boolean(estado.base) };
  }

  /** Um evento (fim de semana de F1, noite de lutas) acontece no dia `data`? paraDia converte o horário no dia de Brasília. */
  function eventoNoDia(ev, data, paraDia) {
    const inicio = ev.inicio ? paraDia(ev.inicio) : ev.data;
    const fim = ev.fim ? paraDia(ev.fim) : inicio;
    return Boolean(inicio) && inicio <= data && data <= fim;
  }

  return {
    iniciarHistorico,
    passoHistorico,
    eventoNoDia,
    ABAS,
    ORDEM_ESPORTES,
    CHIPS_ESPORTE,
    lerEndereco,
    montarEndereco,
    novasPilhas,
    topo,
    empilhar,
    trocarAba,
    tocarAbaAtiva,
    acaoVoltar,
    voltar,
    pilhasDeEndereco,
    ordenarGrupos,
  };
})();

if (typeof module !== "undefined") module.exports = Rotas;
