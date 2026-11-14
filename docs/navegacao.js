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
    // a página "painel" não tem endereço próprio: fica com o da página de baixo
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
    $("#titulo-pagina").textContent = p.titulo || (def.titulo ? def.titulo(p.params, p) : TITULO_ABA[p.tipo] || "");
    $("#acoes-pagina").replaceChildren(...[def.acoes ? def.acoes(p.params, p) : null].filter(Boolean));
    $("#busca-pagina").hidden = this.pilhas.atual === "pesquisa";
    document.title = raiz && p.tipo === "jogos" ? "Scoresports" : `${$("#titulo-pagina").textContent} · Scoresports`;
  },

  desenharBarra() {
    document.querySelectorAll("#barra-baixo [data-aba]").forEach((b) => {
      if (b.dataset.aba === this.pilhas.atual) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  },
};

/** Troca o título de uma página (o nome do time chega depois do carregamento, por exemplo). */
function definirTitulo(corpo, texto) {
  const p = Rotas.ABAS.flatMap((aba) => Navegacao.pilhas[aba]).find((x) => x.corpo === corpo) || Navegacao.topo();
  p.titulo = texto;
  if (p === Navegacao.topo()) {
    $("#titulo-pagina").textContent = texto;
    document.title = `${texto} · Scoresports`;
  }
}

/* ---------- Páginas ---------- */

/** Página sem endereço próprio, aberta pelo Painel (jogador da NBA no PC, por exemplo). */
registrarPagina("painel", {
  titulo: (params) => params.titulo || "",
  desenhar: (corpo, params, ativo, p) => p.construir(corpo, ativo),
});

registrarPagina("jogos", {
  titulo: () => TITULO_ABA.jogos,
  desenhar: () => {
    const esp = esporteObj("futebol");
    estadoDe("futebol").liga = "todas";
    return partidasLista(esp);
  },
  aoMostrar: () => {
    estadoDe("futebol").liga = "todas";
    return partidasDia(esporteObj("futebol"), true);
  },
});

registrarPagina("favoritos", {
  titulo: () => TITULO_ABA.favoritos,
  desenhar: () => inicioDesenhar(false),
  aoMostrar: () => inicioDesenhar(true),
});

registrarPagina("pesquisa", {
  titulo: () => TITULO_ABA.pesquisa,
  desenhar: () => pesquisaDesenhar(),
});

/** Partida: com o jogo da lista em memória abre na hora; pelo endereço, busca o jogo pelo id. */
registrarPagina("jogo", {
  titulo: (params) => {
    const esp = esporteObj(params.esporte);
    const l = esp && esp.ligas.find((x) => x.id === params.liga);
    return (l && l.nome) || (esp && esp.nome) || "Jogo";
  },
  desenhar: (corpo, params, ativo, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo === "nba") return nbaMostrarJogo(p.jogo);
    return partidaDetalhe(esp, params.liga, p.jogo || { id: params.id }, false);
  },
  aoMostrar: (corpo, params, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo === "nba") return nbaMostrarJogo(p.jogo, true);
    return partidaDetalhe(esp, params.liga, p.jogo || { id: params.id }, true);
  },
});

/** Evento da F1, do UFC ou noite de boxe. */
registrarPagina("evento", {
  titulo: (params) => (esporteObj(params.esporte) || {}).nome || "Evento",
  desenhar: (corpo, params, ativo, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo === "boxe") return boxeEventoDetalhe(esp, p.evento);
    return eventoDetalhe(esp, params.liga, p.evento, false);
  },
  aoMostrar: (corpo, params, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo !== "boxe") eventoDetalhe(esp, params.liga, p.evento, true);
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
