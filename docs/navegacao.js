"use strict";

/* =========================================================================
   Navegação: barra de baixo (Jogos, Favoritos, Pesquisa), páginas empilhadas
   por aba e voltar. As regras puras (endereços, pilhas, voltar) ficam em rotas.js.

   Cada página da pilha guarda o próprio corpo: ao voltar, ele reaparece como
   estava, sem carregar de novo. As telas antigas desenham em lista() e
   detalhe(), que apontam para o corpo (ou a área marcada) da página do topo.
   ========================================================================= */

const PAGINAS = {};

/** def: { titulo(params, pagina) -> string, acoes?(params, pagina) -> Node, desenhar(corpo, params, ativo, pagina), aoMostrar?(corpo, params, pagina) } */
function registrarPagina(tipo, def) {
  PAGINAS[tipo] = def;
}

const TITULO_ABA = { jogos: "Scoresports", favoritos: "Favoritos", pesquisa: "Pesquisa" };

const Navegacao = {
  pilhas: null,
  n: 0, // quantas entradas este app empilhou no histórico do navegador
  ignorarPop: false,
  mostrada: null,

  iniciar() {
    this.semHistorico = Boolean(window.APP_ANDROID);
    this.pilhas = Rotas.pilhasDeEndereco(location.hash);
    history.replaceState({ n: 0 }, "", this.endereco());
    window.addEventListener("popstate", (e) => this.aoVoltarNoNavegador(e));
    $("#barra-baixo").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aba]");
      if (b) this.trocarAba(b.dataset.aba);
    });
    $("#voltar-pagina").addEventListener("click", () => this.voltar());
    $("#busca-pagina").addEventListener("click", () => this.trocarAba("pesquisa"));
    this.mostrar();
  },

  topo() {
    return Rotas.topo(this.pilhas);
  },

  /** O lugar onde as telas antigas desenham: a área marcada da página do topo, ou o corpo dela. */
  alvo() {
    const p = this.topo();
    return (p && (p.alvo || p.corpo)) || $("#pagina");
  },

  endereco() {
    // uma página sem endereço próprio fica com o da página de baixo
    const pilha = this.pilhas[this.pilhas.atual];
    for (let i = pilha.length - 1; i >= 0; i--) {
      const e = Rotas.montarEndereco(pilha[i]);
      if (e) return e;
    }
    return "#/jogos";
  },

  /** pagina: { tipo, params, ...dados em memória (o jogo da lista, o contexto do atleta) } */
  abrir(pagina) {
    if (!PAGINAS[pagina.tipo]) return;
    pagina.params = pagina.params || {};
    this.pilhas = Rotas.empilhar(this.pilhas, pagina);
    if (this.semHistorico) history.replaceState({ n: 0 }, "", this.endereco());
    else {
      this.n += 1;
      history.pushState({ n: this.n }, "", this.endereco());
    }
    this.mostrar();
  },

  trocarAba(aba) {
    if (aba === this.pilhas.atual) {
      const pilha = this.pilhas[aba];
      if (pilha.length === 1) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      this.pilhas = Rotas.tocarAbaAtiva(this.pilhas);
    } else {
      this.pilhas = Rotas.trocarAba(this.pilhas, aba);
    }
    history.replaceState({ n: this.n }, "", this.endereco());
    this.mostrar();
  },

  /** Voltar do topo da página ou do Android. Devolve false só na raiz de Jogos (o app pode sair). */
  voltar() {
    const acao = Rotas.acaoVoltar(this.pilhas);
    if (acao === "sair") return false;
    this.pilhas = Rotas.voltar(this.pilhas);
    if (acao === "desempilhar" && this.n > 0 && !this.semHistorico) {
      // tira a entrada do histórico também, para o voltar do navegador não repetir este passo
      this.ignorarPop = true;
      history.back();
    } else {
      history.replaceState({ n: this.n }, "", this.endereco());
    }
    this.mostrar();
    return true;
  },

  aoVoltarNoNavegador(e) {
    if (!e.state) {
      // endereço digitado ou link com # : abre aquela página como uma entrada nova
      const pagina = Rotas.lerEndereco(location.hash);
      this.pilhas = Rotas.ABAS.includes(pagina.tipo) ? Rotas.trocarAba(this.pilhas, pagina.tipo) : Rotas.empilhar(this.pilhas, pagina);
      this.n += 1;
      history.replaceState({ n: this.n }, "", this.endereco());
      this.mostrar();
      return;
    }
    const n = e.state.n || 0;
    if (this.ignorarPop) {
      this.ignorarPop = false;
    } else if (n < this.n) {
      for (let i = n; i < this.n; i++) {
        if (Rotas.acaoVoltar(this.pilhas) !== "sair") this.pilhas = Rotas.voltar(this.pilhas);
      }
      this.mostrar();
    } else if (n > this.n) {
      // avançar do navegador: abre a página do endereço por cima
      const pagina = Rotas.lerEndereco(location.hash);
      if (!Rotas.ABAS.includes(pagina.tipo)) this.pilhas = Rotas.empilhar(this.pilhas, pagina);
      this.mostrar();
    }
    this.n = n;
    history.replaceState({ n: this.n }, "", this.endereco());
  },

  /** Desenha de novo a página do topo, do zero. */
  redesenhar() {
    const p = this.topo();
    p.corpo = null;
    this.mostrar();
  },

  /** Marca páginas guardadas de um tipo para serem desenhadas de novo quando reaparecerem. */
  invalidar(tipo) {
    Rotas.ABAS.forEach((aba) =>
      this.pilhas[aba].forEach((p) => {
        if (p.tipo === tipo) p.pronta = false;
      })
    );
  },

  mostrar() {
    const p = this.topo();
    const def = PAGINAS[p.tipo] || PAGINAS.jogos;
    const anterior = this.mostrada;
    if (anterior && anterior !== p) {
      anterior.rolagem = window.scrollY;
      if (anterior.aoSair) anterior.aoSair();
    }
    // o que estava na tela para de se atualizar e de desenhar
    cancelarTudo();
    novoTokenLista();
    novoTokenDetalhe();
    this.mostrada = p;

    this.desenharTopo(p, def);
    this.desenharBarra();

    const area = $("#pagina");
    if (p.corpo && p.pronta !== false) {
      area.replaceChildren(p.corpo);
      window.scrollTo({ top: p.rolagem || 0 });
      if (def.aoMostrar) def.aoMostrar(p.corpo, p.params, p);
      return;
    }
    const corpo = h("div", { class: "corpo-pagina" });
    p.corpo = corpo;
    p.alvo = null;
    p.pronta = null;
    area.replaceChildren(corpo);
    window.scrollTo({ top: 0 });
    const ativo = () => p.corpo === corpo && this.estaNaPilha(p);
    corpo.replaceChildren(carregando());
    Promise.resolve()
      .then(() => def.desenhar(corpo, p.params, ativo, p))
      .then(() => {
        // se a pessoa saiu antes de terminar, desenha de novo quando voltar
        if (p.corpo === corpo && p.pronta === null) p.pronta = this.topo() === p ? true : false;
      })
      .catch((erro) => {
        if (p.corpo === corpo) corpo.replaceChildren(caixaErro(erro, () => this.redesenhar()));
      });
  },

  estaNaPilha(p) {
    return Rotas.ABAS.some((aba) => this.pilhas[aba].includes(p));
  },

  desenharTopo(p, def) {
    const raiz = this.pilhas[this.pilhas.atual].length === 1;
    $("#voltar-pagina").hidden = raiz;
    $("#topo-pagina").classList.toggle("na-raiz", raiz);
    const texto = p.titulo || (def.titulo ? def.titulo(p.params, p) : TITULO_ABA[p.tipo] || "");
    const partes = [h("span", { class: "titulo-texto" }, texto), p.subtitulo ? h("span", { class: "subtitulo-pagina" }, p.subtitulo) : null];
    // na partida, o título (a liga) é um botão que abre a página da liga
    $("#titulo-pagina").replaceChildren(
      def.aoTocarTitulo && !raiz
        ? h("button", { class: "titulo-botao", type: "button", onclick: () => def.aoTocarTitulo(p.params, p) }, h("span", { class: "titulo-bloco" }, ...partes), s("svg", { viewBox: "0 0 24 24", width: "14", height: "14", "aria-hidden": "true" }, s("path", { d: "M9 5l7 7-7 7", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" })))
        : h("span", { class: "titulo-bloco" }, ...partes)
    );
    $("#acoes-pagina").replaceChildren(...[def.acoes ? def.acoes(p.params, p) : null].filter(Boolean));
    $("#busca-pagina").hidden = this.pilhas.atual === "pesquisa";
    document.title = raiz && p.tipo === "jogos" ? "Scoresports" : `${texto} · Scoresports`;
  },

  desenharBarra() {
    document.querySelectorAll("#barra-baixo [data-aba]").forEach((b) => {
      if (b.dataset.aba === this.pilhas.atual) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  },
};

function paginaDoCorpo(corpo) {
  return Rotas.ABAS.flatMap((aba) => Navegacao.pilhas[aba]).find((x) => x.corpo === corpo) || Navegacao.topo();
}

/** Troca o título de uma página (o nome do time chega depois do carregamento, por exemplo). corpo null = a página do topo. */
function definirTitulo(corpo, texto, subtitulo) {
  const p = paginaDoCorpo(corpo);
  p.titulo = texto;
  if (subtitulo !== undefined) p.subtitulo = subtitulo;
  if (p === Navegacao.topo()) Navegacao.desenharTopo(p, PAGINAS[p.tipo]);
}

/* ---------- Páginas ---------- */

registrarPagina("jogos", {
  titulo: () => TITULO_ABA.jogos,
  desenhar: (corpo, params, ativo, p) => paginaJogos(corpo, p),
  aoMostrar: () => desenharChipJogos(true),
});

registrarPagina("favoritos", {
  titulo: () => TITULO_ABA.favoritos,
  desenhar: (corpo, params, ativo, p) => paginaFavoritos(corpo, p),
  aoMostrar: () => inicioDesenhar(true),
});

registrarPagina("pesquisa", {
  titulo: () => TITULO_ABA.pesquisa,
  desenhar: () => pesquisaDesenhar(),
});

/** Time: a aba escolhida fica guardada na própria página (ao voltar de um atleta, reabre na mesma aba). */
registrarPagina("time", {
  titulo: (params, p) => p.nome || "Time",
  desenhar: (corpo, params, ativo, p) => {
    p.lembrar = p.lembrar || { aba: "jogos" };
    return desenharTime(corpo, ativo, params.esporte, params.liga, params.id, p.nome, p.lembrar);
  },
});

/** Atleta da ESPN; no site do PC, o jogador da NBA abre a tela própria (ids da NBA.com). */
registrarPagina("atleta", {
  titulo: (params, p) => p.nome || "Atleta",
  desenhar: (corpo, params, ativo, p) => {
    const nba = esporteObj("nba");
    if (params.esporte === "nba" && nba && nba.tipo === "nba") return desenharJogadorNBA(corpo, ativo, Number(params.id), p.nome || "", p.contexto || {});
    return desenharAtleta(corpo, ativo, params.esporte, params.liga, params.id, p.contexto || null);
  },
});

registrarPagina("boxeador", {
  titulo: (params) => params.nome,
  desenhar: (corpo, params, ativo) => desenharBoxeador(corpo, ativo, params.nome),
});

/** Partida: com o jogo da lista em memória abre na hora; pelo endereço, busca o jogo pelo id. */
registrarPagina("jogo", {
  titulo: (params) => {
    const esp = esporteObj(params.esporte);
    const l = esp && esp.ligas.find((x) => x.id === params.liga);
    return (l && l.nome) || (esp && esp.nome) || "Jogo";
  },
  aoTocarTitulo: (params) => irPara(params.esporte, "classificacao", params.liga),
  desenhar: (corpo, params, ativo, p) => {
    const esp = esporteObj(params.esporte);
    if (!esp) return corpo.replaceChildren(vazio("Jogo não encontrado."));
    if (esp.tipo === "nba") return p.jogo ? nbaMostrarJogo(p.jogo) : nbaJogoPeloId(params.id, p);
    return partidaDetalhe(esp, params.liga, p.jogo || { id: params.id }, false);
  },
  aoMostrar: (corpo, params, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo === "nba") return p.jogo ? nbaMostrarJogo(p.jogo, true) : null;
    return partidaDetalhe(esp, params.liga, p.jogo || { id: params.id }, true);
  },
});

/** Evento da F1, do UFC ou noite de boxe. */
registrarPagina("evento", {
  titulo: (params) => (esporteObj(params.esporte) || {}).nome || "Evento",
  desenhar: async (corpo, params, ativo, p) => {
    const esp = esporteObj(params.esporte);
    if (!esp) return corpo.replaceChildren(vazio("Evento não encontrado."));
    if (!p.evento) {
      // aberto pelo endereço: acha o evento no calendário pelo id
      const lista = esp.tipo === "boxe" ? await api("/boxe/eventos") : (await api(`/e/${esp.id}/${params.liga}/eventos`)).eventos;
      p.evento = lista.find((ev) => String(ev.id) === String(params.id));
      if (!p.evento) return corpo.replaceChildren(vazio("Evento não encontrado."));
    }
    if (esp.tipo === "boxe") return boxeEventoDetalhe(esp, p.evento);
    return eventoDetalhe(esp, params.liga, p.evento, false);
  },
  aoMostrar: (corpo, params, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo !== "boxe" && p.evento) eventoDetalhe(esp, params.liga, p.evento, true);
  },
});

/** Competição: as abas do esporte (jogos, classificação, líderes...) para uma liga. */
registrarPagina("liga", {
  titulo: (params) => {
    const esp = esporteObj(params.esporte);
    const l = esp && esp.ligas.find((x) => x.id === params.liga);
    return (l && l.nome) || (esp && esp.nome) || "Competição";
  },
  acoes: (params) => {
    const esp = esporteObj(params.esporte);
    const fav = esp && esp.ligas.length ? favLiga(esp, params.liga) : null;
    return fav ? botaoFavorito(fav) : null;
  },
  // de volta à página (vindo de um jogo, por exemplo): a liga volta a ser a desta página e o jogo ao vivo se atualiza
  aoMostrar: (corpo, params) => {
    const esp = esporteObj(params.esporte);
    if (!esp) return null;
    if (esp.ligas.length) estadoDe(esp.id).liga = params.liga;
    if (params.aba !== "jogos") return null;
    if (esp.tipo === "nba") return NBA.datas ? nbaDia(true) : null;
    if (esp.tipo !== "partidas") return null;
    const st = estadoDe(esp.id);
    const semanas = esp.id === "nfl" && st.datas.nfl && st.datas.nfl.semanas;
    return semanas && semanas.length ? partidasSemana(esp, true) : partidasDia(esp, true);
  },
  desenhar: (corpo, params, ativo, p) => {
    const esp = esporteObj(params.esporte);
    if (!esp) {
      corpo.replaceChildren(vazio("Competição não encontrada."));
      return;
    }
    const modulo = MODULOS[esp.tipo];
    const abas = modulo.abas(esp);
    if (!abas.some((a) => a.id === params.aba)) params.aba = abas[0].id;
    const area = h("div", { class: "area-liga" });
    p.alvo = area;
    const desenharAba = () => {
      if (esp.ligas.length) estadoDe(esp.id).liga = params.liga;
      cancelarTudo();
      novoTokenLista();
      novoTokenDetalhe();
      area.replaceChildren(carregando());
      return modulo.desenhar(esp, params.aba);
    };
    let barra = abasDetalhe(abas, params.aba, trocar);
    function trocar(nova) {
      params.aba = nova;
      history.replaceState(history.state, "", Navegacao.endereco());
      const nb = abasDetalhe(abas, nova, trocar);
      barra.replaceWith(nb);
      barra = nb;
      desenharAba();
    }
    corpo.replaceChildren(abas.length > 1 ? barra : h("span"), area);
    return desenharAba();
  },
});

/* ---------- Aba Jogos: chips de esporte e "Todos" ---------- */

const JOGOS = { chip: lembrar("jogos:chip") || "todos", data: null };

const ARTIGO_ESPORTE = { futebol: "o futebol", nba: "a NBA", nfl: "a NFL", mlb: "a MLB", nhl: "a NHL", f1: "a Fórmula 1", ufc: "o UFC", boxe: "o boxe" };

function chipsDisponiveis() {
  return Rotas.CHIPS_ESPORTE.filter(([id]) => id === "todos" || esporteObj(id));
}

/** A data que a tela de um esporte usa (cada uma guarda a sua): para manter o mesmo dia ao trocar de chip. */
function dataDoChip(chip) {
  if (chip === "todos") return JOGOS.data;
  const esp = esporteObj(chip);
  if (!esp) return null;
  if (esp.tipo === "nba") return NBA.data;
  if (esp.tipo === "partidas") return estadoDe(esp.id).data;
  return null;
}

function paginaJogos(corpo, p) {
  if (!chipsDisponiveis().some(([id]) => id === JOGOS.chip)) JOGOS.chip = "todos";
  if (!JOGOS.data) JOGOS.data = hojeBR();
  const area = h("div", { class: "area-jogos" });
  p.alvo = area;
  const barra = h("div", { class: "chips-esporte", role: "group", "aria-label": "Esportes" });
  const pintar = () =>
    barra.replaceChildren(
      ...chipsDisponiveis().map(([id, nome]) =>
        h("button", { class: "chip-esporte", type: "button", "aria-pressed": String(id === JOGOS.chip), onclick: () => escolher(id) }, nome)
      )
    );
  const escolher = (id) => {
    if (id === JOGOS.chip) return;
    JOGOS.data = dataDoChip(JOGOS.chip) || JOGOS.data;
    JOGOS.chip = id;
    guardar("jogos:chip", id);
    pintar();
    window.scrollTo({ top: 0 });
    desenharChipJogos(false);
  };
  pintar();
  corpo.replaceChildren(barra, area);
  return desenharChipJogos(false);
}

/** Desenha a lista do chip escolhido; silencioso = só atualiza o que já está na tela. */
function desenharChipJogos(silencioso) {
  cancelarTudo();
  const chip = JOGOS.chip;
  const esp = chip === "todos" ? null : esporteObj(chip);
  if (!esp) return jogosTodos(silencioso);
  if (!silencioso) {
    novoTokenLista();
    lista().replaceChildren(carregando());
  }
  if (esp.tipo === "partidas") {
    const st = estadoDe(esp.id);
    st.liga = esp.ligas.length > 1 ? "todas" : esp.ligas[0].id;
    if (!silencioso) {
      st.data = JOGOS.data;
      return partidasLista(esp);
    }
    const semanas = esp.id === "nfl" && st.datas.nfl && st.datas.nfl.semanas;
    return semanas && semanas.length ? partidasSemana(esp, true) : partidasDia(esp, true);
  }
  if (esp.tipo === "nba") {
    if (!silencioso && NBA.datas && NBA.conjuntoDatas.has(JOGOS.data)) NBA.data = JOGOS.data;
    return silencioso && NBA.datas ? nbaDia(true) : nbaJogos();
  }
  if (silencioso) return null;
  if (esp.tipo === "boxe") return boxeLista(esp);
  return eventosLista(esp, esp.ligas[0].id);
}

/** Linha de um evento (corrida, noite de lutas) na lista do dia. */
function linhaEventoDoDia(esp, ev, abrir) {
  return h(
    "button",
    { class: `evento${ev.estado === 3 ? " passado" : ""}`, type: "button", dataset: { id: ev.id }, onclick: abrir },
    caixaData(ev.inicio || `${ev.data}T15:00:00Z`),
    h("div", null, h("div", { class: "evento-nome" }, ev.nome), h("div", { class: "evento-sub" }, ev.local || rotuloEstadoEvento(ev.estado))),
    canalNaLista(ev.transmissao, true)
  );
}

/** Os grupos de um esporte no dia (uma competição por grupo). Rejeita se o esporte inteiro falhar. */
async function gruposDoEsporte(esp, data) {
  const vivo = (itens) => itens.some((x) => x.estado === 2);
  if (esp.tipo === "partidas") {
    const respostas = await Promise.allSettled(esp.ligas.map((l) => api(`/e/${esp.id}/${l.id}/jogos?de=${data}`)));
    if (respostas.every((r) => r.status === "rejected")) throw respostas[0].reason;
    const grupos = [];
    const falhas = [];
    respostas.forEach((r, i) => {
      const liga = esp.ligas[i];
      if (r.status === "rejected") {
        falhas.push(liga.nome);
        return;
      }
      const jogos = r.value;
      if (!jogos.length) return;
      const variasLigas = esp.ligas.length > 1;
      grupos.push({
        chave: `${esp.id}:${liga.id}`,
        esporte: esp.id,
        ordem: variasLigas ? ORDEM_GRUPOS.indexOf(grupoDaLiga(liga)) * 1000 + i : 0,
        aoVivo: vivo(jogos),
        jogos,
        desenhar: (visiveis) =>
          grupoDeJogos(esp, liga, visiveis, {
            sub: variasLigas ? grupoDaLiga(liga) : null,
            aoTocarLiga: () => irPara(esp.id, "classificacao", liga.id),
            aoTocarJogo: (j) => abrirPartida(esp, liga.id, j),
          }),
      });
    });
    if (falhas.length) grupos.push({ chave: `${esp.id}:falhas`, esporte: esp.id, ordem: 1e6, aoVivo: false, jogos: [], nota: `Não carregou agora: ${falhas.join(", ")}.` });
    return grupos;
  }
  if (esp.tipo === "nba") {
    const jogos = await api(`/jogos?data=${data}`);
    if (!jogos.length) return [];
    return [
      {
        chave: "nba",
        esporte: "nba",
        ordem: 0,
        aoVivo: vivo(jogos),
        jogos,
        desenhar: (visiveis) =>
          h(
            "section",
            { class: "cartao grupo-liga" },
            cabecaGrupo({ titulo: "NBA", aoClicar: () => irPara("nba", "classificacao"), favorito: { tipo: "liga", esporte: "nba", liga: "nba", id: "nba", nome: "NBA" } }),
            visiveis.map((j) => nbaLinhaJogo(j))
          ),
      },
    ];
  }
  let eventos;
  let abrir;
  if (esp.tipo === "boxe") {
    eventos = (await api("/boxe/eventos")).filter((ev) => ev.data === data);
    abrir = (ev) => boxeAbrir(esp, ev);
  } else {
    const liga = esp.ligas[0].id;
    const cal = await api(`/e/${esp.id}/${liga}/eventos`);
    eventos = cal.eventos.filter((ev) => (dataBR(ev.inicio) || ev.data) === data);
    abrir = (ev) => abrirEvento(esp, liga, ev);
  }
  if (!eventos.length) return [];
  return [
    {
      chave: esp.id,
      esporte: esp.id,
      ordem: 0,
      aoVivo: vivo(eventos),
      jogos: eventos,
      desenhar: (visiveis) =>
        h(
          "section",
          { class: "cartao grupo-liga" },
          cabecaGrupo({ titulo: esp.nome, aoClicar: () => irPara(esp.id), favorito: esp.ligas.length ? favLiga(esp, esp.ligas[0].id) : null }),
          visiveis.map((ev) => linhaEventoDoDia(esp, ev, () => abrir(ev)))
        ),
    },
  ];
}

/** "Todos": os jogos e eventos do dia de todos os esportes, uma competição por grupo, os ao vivo primeiro. */
async function jogosTodos(silencioso) {
  const tk = silencioso ? S.tkLista : novoTokenLista();
  const data = JOGOS.data || (JOGOS.data = hojeBR());
  const hoje = hojeBR();
  const barra = barraData({
    data,
    anterior: somarDias(data, -1),
    proximo: somarDias(data, 1),
    hoje,
    aoMudar: (d) => {
      JOGOS.data = d;
      cancelar("lista");
      window.scrollTo({ top: 0 });
      jogosTodos(false);
    },
  });
  const esportes = Rotas.ORDEM_ESPORTES.map(esporteObj).filter(Boolean);
  const porEsporte = new Map(); // id do esporte -> lista de grupos, ou { erro }
  const pendentes = new Set();

  const avisoEsporte = (id) => {
    const esp = esporteObj(id);
    return h(
      "section",
      { class: "cartao grupo-liga" },
      cabecaGrupo({ titulo: esp.nome }),
      h(
        "div",
        { class: "secao" },
        h("p", { class: "nota", style: { marginTop: 0 } }, `Não foi possível carregar ${ARTIGO_ESPORTE[id] || esp.nome} agora.`),
        h("button", { class: "botao", type: "button", onclick: () => carregar(esp, true) }, "Tentar de novo")
      )
    );
  };

  function desenhar() {
    if (tk !== S.tkLista) return;
    const grupos = [];
    porEsporte.forEach((valor, id) => {
      if (Array.isArray(valor)) grupos.push(...valor);
      else grupos.push({ chave: `${id}:erro`, esporte: id, ordem: 0, aoVivo: false, erro: valor.erro, jogos: [] });
    });
    const jogos = grupos.flatMap((g) => g.jogos);
    const partes = [barra, barraFiltro(jogos, desenhar)];
    let algum = false;
    for (const g of Rotas.ordenarGrupos(grupos)) {
      if (g.erro) {
        partes.push(avisoEsporte(g.esporte));
        continue;
      }
      if (g.nota) {
        partes.push(h("p", { class: "nota nota-grupo" }, g.nota));
        continue;
      }
      const visiveis = g.jogos.filter(passaFiltro);
      if (!visiveis.length) continue;
      algum = true;
      partes.push(g.desenhar(visiveis));
    }
    if (pendentes.size) partes.push(carregando(algum ? "Carregando mais jogos…" : "Carregando…"));
    else if (!algum) partes.push(vazio(jogos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo nesta data."));
    lista().replaceChildren(...partes);
  }

  function carregar(esp, redesenharJa) {
    pendentes.add(esp.id);
    if (redesenharJa) {
      porEsporte.delete(esp.id);
      desenhar();
    }
    return gruposDoEsporte(esp, data)
      .then((grupos) => porEsporte.set(esp.id, grupos))
      .catch((erro) => porEsporte.set(esp.id, { erro }))
      .finally(() => {
        pendentes.delete(esp.id);
        // na atualização silenciosa desenha uma vez só, no fim, para a tela não piscar
        if (!silencioso || !pendentes.size) desenhar();
      });
  }

  if (!silencioso) lista().replaceChildren(barra, carregando());
  esportes.forEach((e) => pendentes.add(e.id));
  await Promise.all(esportes.map((esp) => carregar(esp, false)));
  if (tk !== S.tkLista) return;

  const todos = [...porEsporte.values()].filter(Array.isArray).flat().flatMap((g) => g.jogos);
  if (todos.some((j) => j.estado === 2)) agendar("lista", () => jogosTodos(true), 20000);
  else if (data === hoje && todos.some((j) => j.estado === 1)) agendar("lista", () => jogosTodos(true), 60000);
}

/* ---------- Atalhos usados pelas telas ---------- */

/** Abre a página de um esporte numa aba (a competição padrão dele). */
function irPara(esporteId, aba, liga) {
  const esp = esporteObj(esporteId);
  if (!esp) return;
  const st = estadoDe(esp.id);
  const ligaId = liga || (st.liga && st.liga !== "todas" ? st.liga : null) || (esp.ligas[0] && esp.ligas[0].id) || esp.id;
  const abas = MODULOS[esp.tipo].abas(esp);
  const abaId = abas.some((a) => a.id === aba) ? aba : abas[0].id;
  Navegacao.abrir({ tipo: "liga", params: { esporte: esp.id, liga: ligaId, aba: abaId } });
}
