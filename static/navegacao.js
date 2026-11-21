"use strict";

/* =========================================================================
   Navegação: barra de baixo (Jogos, Favoritos, Pesquisa), páginas empilhadas
   por aba e voltar. As regras puras (endereços, pilhas, voltar) ficam em rotas.js.

   Cada página da pilha guarda o próprio corpo: ao voltar, ele reaparece como
   estava, sem carregar de novo. As telas antigas desenham em lista() e
   detalhe(), que apontam para o corpo (ou a área marcada) da página do topo.
   ========================================================================= */

const PAGINAS = {};

/* ---------- Tema: automático (o do aparelho), claro ou escuro ---------- */
// No APK o Android diz "escuro" para a página mesmo com o celular no modo claro: o botão do topo escolhe.
const Tema = {
  ORDEM: ["auto", "claro", "escuro"],
  NOMES: { auto: "automático", claro: "claro", escuro: "escuro" },
  ICONES: {
    auto: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    claro: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    escuro: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
  atual() {
    try {
      const t = localStorage.getItem("ss:tema");
      return this.ORDEM.includes(t) ? t : "auto";
    } catch (_) {
      return "auto";
    }
  },
  aplicar(t, botao) {
    if (t === "auto") document.documentElement.removeAttribute("data-tema");
    else document.documentElement.setAttribute("data-tema", t);
    if (botao) {
      botao.innerHTML = this.ICONES[t];
      botao.setAttribute("aria-label", `Tema: ${this.NOMES[t]}. Tocar para trocar`);
      botao.title = `Tema ${this.NOMES[t]}`;
    }
    // a barra de status do celular acompanha o fundo
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--fundo").trim() || "#0f0f11");
  },
  iniciar(botao) {
    if (!botao) return;
    this.aplicar(this.atual(), botao);
    botao.addEventListener("click", () => {
      const prox = this.ORDEM[(this.ORDEM.indexOf(this.atual()) + 1) % this.ORDEM.length];
      try {
        if (prox === "auto") localStorage.removeItem("ss:tema");
        else localStorage.setItem("ss:tema", prox);
      } catch (_) {
        /* sem armazenamento: vale só agora */
      }
      this.aplicar(prox, botao);
    });
  },
};

/** def: { titulo(params, pagina) -> string, acoes?(params, pagina) -> Node, desenhar(corpo, params, ativo, pagina), aoMostrar?(corpo, params, pagina) } */
function registrarPagina(tipo, def) {
  PAGINAS[tipo] = def;
}

// o esqueleto que cada página mostra enquanto o dado chega
const ESQUELETO_DA_PAGINA = { jogo: "partida", evento: "partida", time: "perfil", atleta: "perfil", boxeador: "perfil" };

const TITULO_ABA = { jogos: "Scoresports", favoritos: "Favoritos", pesquisa: "Pesquisa" };

const Navegacao = {
  pilhas: null,
  mostrada: null,

  iniciar() {
    this.semHistorico = Boolean(window.APP_ANDROID);
    this.pilhas = Rotas.pilhasDeEndereco(location.hash);
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (this.semHistorico) {
      // no app Android o botão voltar chama voltarAndroid; o WebView não tem histórico para onde ir
      history.replaceState({ app: true }, "", this.endereco());
    } else if (Rotas.iniciarHistorico(history.state) === "armar") {
      // duas entradas: a base e a do app por cima (rotas.js explica)
      history.replaceState({ base: true }, "", this.endereco());
      history.pushState({ app: true }, "", this.endereco());
    } else {
      history.replaceState({ app: true }, "", this.endereco());
    }
    window.addEventListener("popstate", (e) => this.aoVoltarNoNavegador(e));
    $("#barra-baixo").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aba]");
      if (b) this.trocarAba(b.dataset.aba);
    });
    $("#voltar-pagina").addEventListener("click", () => this.voltar());
    $("#busca-pagina").addEventListener("click", () => this.trocarAba("pesquisa"));
    Tema.iniciar($("#tema-pagina"));
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

  /** Põe o endereço da página do topo na entrada atual do histórico. */
  marcarEndereco() {
    history.replaceState({ app: true }, "", this.endereco());
  },

  /** pagina: { tipo, params, ...dados em memória (o jogo da lista, o contexto do atleta) } */
  abrir(pagina) {
    if (!PAGINAS[pagina.tipo]) return;
    pagina.params = pagina.params || {};
    // toque duplo: a mesma página por cima dela mesma não abre de novo
    const topo = this.topo();
    if (topo && topo.tipo === pagina.tipo && Rotas.montarEndereco(topo) === Rotas.montarEndereco(pagina) && Rotas.montarEndereco(pagina)) return;
    this.pilhas = Rotas.empilhar(this.pilhas, pagina);
    this.marcarEndereco();
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
    this.marcarEndereco();
    this.mostrar();
  },

  /** Voltar do topo da página, do navegador ou do Android. Devolve false só na raiz de Jogos (o app pode sair). */
  voltar() {
    if (Folha.fechar()) return true; // a folha do jogador aberta: o voltar fecha só ela
    const acao = Rotas.acaoVoltar(this.pilhas);
    if (acao === "sair") return false;
    this.pilhas = Rotas.voltar(this.pilhas);
    this.marcarEndereco();
    this.mostrar();
    return true;
  },

  aoVoltarNoNavegador(e) {
    const passo = Rotas.passoHistorico(e.state);
    if (passo.acao === "voltar" && Folha.fechar()) {
      // o voltar fechou a folha do jogador: a página fica, e o histórico é rearmado
      if (passo.rearmar) history.replaceState({ base: true }, "", this.endereco());
      history.pushState({ app: true }, "", this.endereco()); // o endereço volta a ser o da página que ficou
      return;
    }
    if (passo.acao === "abrir") {
      // endereço digitado ou link com #: abre aquela página
      const pagina = Rotas.lerEndereco(location.hash);
      this.pilhas = Rotas.ABAS.includes(pagina.tipo) ? Rotas.trocarAba(this.pilhas, pagina.tipo) : Rotas.empilhar(this.pilhas, pagina);
      this.marcarEndereco();
      this.mostrar();
      return;
    }
    // na raiz de Jogos o navegador não faz nada (a spec): só rearma
    if (Rotas.acaoVoltar(this.pilhas) !== "sair") {
      this.pilhas = Rotas.voltar(this.pilhas);
      this.mostrar();
    }
    if (passo.rearmar) {
      history.replaceState({ base: true }, "", this.endereco());
      history.pushState({ app: true }, "", this.endereco());
    } else {
      this.marcarEndereco();
    }
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
    Folha.fechar(); // trocar de página (aba de baixo, "Ver perfil") fecha a folha do jogador
    const p = this.topo();
    const def = PAGINAS[p.tipo] || PAGINAS.jogos;
    const anterior = this.mostrada;
    if (anterior && anterior !== p) {
      anterior.rolagem = window.scrollY;
      const defAnterior = PAGINAS[anterior.tipo];
      if (defAnterior && defAnterior.aoSair) defAnterior.aoSair(anterior.corpo, anterior.params, anterior);
      // saiu antes de terminar de carregar: desenha de novo quando voltar
      if (anterior.pronta === null) anterior.pronta = false;
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
    area.replaceChildren(corpo);
    window.scrollTo({ top: 0 });
    const ativo = () => p.corpo === corpo && this.estaNaPilha(p);
    corpo.replaceChildren(esqueleto(ESQUELETO_DA_PAGINA[p.tipo] || "lista", undefined, { nome: p.nome || (p.params && p.params.nome) || null }));
    this.acompanhar(
      p,
      Promise.resolve().then(() => def.desenhar(corpo, p.params, ativo, p)),
      (erro) => {
        if (p.corpo === corpo) corpo.replaceChildren(caixaErro(erro, () => this.redesenhar()));
      }
    );
  },

  /** Marca a página como carregando até o desenho terminar. Se a pessoa sair antes, ela é desenhada de novo ao voltar.
      Serve para o primeiro desenho e para os de troca de aba (liga) ou de chip (Jogos). */
  acompanhar(p, promessa, aoFalhar) {
    const vez = (p.desenho = (p.desenho || 0) + 1);
    p.pronta = null;
    Promise.resolve(promessa)
      .then(() => {
        if (p.desenho === vez && p.pronta === null) p.pronta = this.topo() === p;
      })
      .catch((erro) => {
        if (p.desenho === vez && p.pronta === null) p.pronta = this.topo() === p;
        if (aoFalhar) aoFalhar(erro);
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
      def.aoTocarTitulo && !raiz && !(def.tituloSemLiga && def.tituloSemLiga(p.params))
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

/** O dia (e a semana da NFL) que a tela de um esporte está mostrando. A aba Jogos e a página da liga
    usam o mesmo estado do esporte: cada página guarda o seu ao sair e devolve ao voltar. */
function guardarDia(esp) {
  if (!esp) return null;
  if (esp.tipo === "nba") return { nba: NBA.data };
  const st = estadoDe(esp.id);
  return { data: st.data, semana: st.semana };
}

function restaurarDia(esp, dia) {
  if (!esp || !dia) return;
  if (esp.tipo === "nba") {
    if (dia.nba) NBA.data = dia.nba;
    return;
  }
  const st = estadoDe(esp.id);
  if (dia.data) st.data = dia.data;
  if (dia.semana !== undefined) st.semana = dia.semana;
}

registrarPagina("jogos", {
  titulo: () => TITULO_ABA.jogos,
  desenhar: (corpo, params, ativo, p) => paginaJogos(corpo, p),
  aoSair: (corpo, params, p) => {
    JOGOS.data = dataDoChip(JOGOS.chip) || JOGOS.data;
    p.dia = { chip: JOGOS.chip, ...(guardarDia(esporteObj(JOGOS.chip)) || {}) };
  },
  aoMostrar: (corpo, params, p) => {
    if (p.dia && p.dia.chip === JOGOS.chip) restaurarDia(esporteObj(JOGOS.chip), p.dia);
    return desenharChipJogos(true);
  },
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
    if (params.esporte === "esports") return desenharTimeEsports(corpo, ativo, params.liga, params.id, p.nome);
    if (params.esporte === "kings") return desenharTimeKings(corpo, ativo, params.liga, params.id, p.nome);
    p.lembrar = p.lembrar || { aba: "geral" };
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
  tituloSemLiga: (params) => params.esporte === "esports",
  desenhar: (corpo, params, ativo, p) => {
    const esp = esporteObj(params.esporte);
    if (!esp) return corpo.replaceChildren(vazio("Jogo não encontrado."));
    if (esp.tipo === "nba") return p.jogo ? nbaMostrarJogo(p.jogo) : nbaJogoPeloId(params.id, p);
    if (esp.tipo === "esports") return esportsPartida(params.liga, params.id, false, p.jogo);
    if (esp.tipo === "kings") return kingsPartida(params.liga, params.id, false, p.jogo);
    return partidaDetalhe(esp, params.liga, p.jogo || { id: params.id }, false);
  },
  aoMostrar: (corpo, params, p) => {
    const esp = esporteObj(params.esporte);
    if (esp.tipo === "nba") return p.jogo ? nbaMostrarJogo(p.jogo, true) : null;
    if (esp.tipo === "esports") return esportsPartida(params.liga, params.id, true, p.jogo);
    if (esp.tipo === "kings") return kingsPartida(params.liga, params.id, true, p.jogo);
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

/** Competição (como a página de torneio do Sofascore): o cabeçalho da liga e as abas do esporte
    (classificação, detalhes, jogos, estatísticas...). */
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
  aoSair: (corpo, params, p) => {
    p.dia = guardarDia(esporteObj(params.esporte));
  },
  // de volta à página (vindo de um jogo, por exemplo): a liga e o dia voltam a ser os desta página e o jogo ao vivo se atualiza
  aoMostrar: (corpo, params, p) => {
    const esp = esporteObj(params.esporte);
    if (!esp) return null;
    if (esp.ligas.length) estadoDe(esp.id).liga = params.liga;
    restaurarDia(esp, p.dia);
    if (params.aba === "chave" && esp.tipo === "partidas") return chaveLista(esp, params.liga, true);
    if (params.aba === "copa" && esp.tipo === "partidas") return copaNbaLista(esp, true);
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
    const abas = modulo.abas(esp, params.liga);
    if (!abas.some((a) => a.id === params.aba)) params.aba = abas[0].id;
    const area = h("div", { class: "area-liga" });
    p.alvo = area;
    // a primeira vez, a aba Jogos da liga abre no dia que a aba Jogos do app está mostrando
    if (!p.dia && esp.tipo === "partidas") p.dia = { data: JOGOS.data || hojeBR() };
    const desenharAba = () => {
      if (esp.ligas.length) estadoDe(esp.id).liga = params.liga;
      restaurarDia(esp, p.dia);
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
      p.dia = guardarDia(esp);
      Navegacao.acompanhar(p, desenharAba());
    }
    // o "Ver tudo" da aba Detalhes troca de aba por aqui
    p.trocarAba = (nova) => abas.some((a) => a.id === nova) && trocar(nova);
    corpo.replaceChildren(cabecaLiga(esp, params.liga), abas.length > 1 ? barra : h("span"), area);
    return desenharAba();
  },
});

/* ---------- Aba Jogos: chips de esporte e "Todos" ---------- */

const JOGOS = { chip: lembrar("jogos:chip") || "todos", data: null };

const ARTIGO_ESPORTE = { futebol: "o futebol", nba: "a NBA", nfl: "a NFL", mlb: "a MLB", nhl: "a NHL", f1: "a Fórmula 1", ufc: "o UFC", boxe: "o boxe", esports: "os e-sports", kings: "a Kings League" };

function chipsDisponiveis() {
  return Rotas.CHIPS_ESPORTE.filter(([id]) => id === "todos" || esporteObj(id));
}

/** A data que a tela de um esporte usa (cada uma guarda a sua): para manter o mesmo dia ao trocar de chip. */
function dataDoChip(chip) {
  if (chip === "todos") return JOGOS.data;
  const esp = esporteObj(chip);
  if (!esp) return null;
  if (esp.tipo === "nba") return NBA.data;
  if (esp.tipo === "partidas" || esp.tipo === "esports" || esp.tipo === "kings") return estadoDe(esp.id).data;
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
    Navegacao.acompanhar(p, desenharChipJogos(false));
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
  if (esp.tipo === "esports") {
    if (!silencioso) estadoDe(esp.id).data = JOGOS.data || estadoDe(esp.id).data;
    return esportsLista(silencioso);
  }
  if (esp.tipo === "kings") {
    if (!silencioso) estadoDe(esp.id).data = JOGOS.data || estadoDe(esp.id).data;
    return kingsLista(silencioso);
  }
  if (silencioso) return null;
  if (esp.tipo === "boxe") return boxeLista(esp);
  return eventosLista(esp, esp.ligas[0].id);
}

/** Linha de um evento (corrida, noite de lutas) na lista do dia. */
function linhaEventoDoDia(esp, ev, abrir) {
  const sit = ev.situacao;
  return h(
    "button",
    { class: `evento${ev.estado === 3 ? " passado" : ""}`, type: "button", dataset: { id: ev.id }, onclick: abrir },
    caixaData(ev.inicio || `${ev.data}T15:00:00Z`),
    h(
      "div",
      null,
      h("div", { class: "evento-nome" }, ev.nome),
      sit ? h("div", { class: `evento-sub${sit.estado === 2 ? " ao-vivo" : ""}` }, textoSituacaoCorrida(sit)) : h("div", { class: "evento-sub" }, ev.local || rotuloEstadoEvento(ev.estado))
    ),
    canalNaLista(ev.transmissao, true)
  );
}

/** "Sprint: fim · Classificação às 17:00", "Classificação ao vivo", "Corrida: fim". */
function textoSituacaoCorrida(sit) {
  if (sit.estado === 2) return `${sit.aoVivo.nome} ao vivo`;
  const hoje = hojeBR();
  const fim = sit.ultima && (sit.estado === 3 || dataBR(sit.ultima.inicio) === hoje) ? `${sit.ultima.nome}: fim` : null;
  const prox = sit.proxima ? `${sit.proxima.nome} ${dataBR(sit.proxima.inicio) === hoje ? `às ${hora(sit.proxima.inicio)}` : diaHora(sit.proxima.inicio)}` : null;
  return [fim, prox].filter(Boolean).join(" · ") || "Encerrado";
}

/** Os fins de semana de corrida do dia com o estado das sessões (a lista não espera mais que 1,2 s por isso). */
async function comSituacaoCorrida(esp, liga, eventos) {
  return Promise.all(
    eventos.map(async (ev) => {
      try {
        const det = await Promise.race([api(`/e/${esp.id}/${liga}/eventos/${ev.id}?data=${ev.data}`), new Promise((_, nao) => setTimeout(() => nao(new Error("demorou")), 1200))]);
        const sit = Visual.situacaoCorrida(det.sessoes);
        return sit ? { ...ev, estado: sit.estado, situacao: sit } : ev;
      } catch (_) {
        return ev;
      }
    })
  );
}

/** Os grupos de um esporte no dia (uma competição por grupo). Rejeita se o esporte inteiro falhar.
    aoParcial(grupos): no futebol, chamado a cada liga que chega (a lista não espera a mais lenta). */
async function gruposDoEsporte(esp, data, aoParcial) {
  if (esp.tipo === "esports") return gruposEsports(data);
  if (esp.tipo === "kings") return gruposKings(data);
  const vivo = (itens) => itens.some((x) => x.estado === 2);
  if (esp.tipo === "partidas") {
    const respostas = new Array(esp.ligas.length);
    await Promise.all(
      esp.ligas.map((l, i) =>
        api(`/e/${esp.id}/${l.id}/jogos?de=${data}`).then(
          (value) => {
            respostas[i] = { status: "fulfilled", value };
            if (aoParcial && value.length) aoParcial(gruposDasLigas(esp, respostas, false));
          },
          (reason) => {
            respostas[i] = { status: "rejected", reason };
          }
        )
      )
    );
    if (respostas.every((r) => r.status === "rejected")) throw respostas[0].reason;
    return gruposDasLigas(esp, respostas, true);
  }
  return gruposDeEventos(esp, data, vivo);
}

/** Os grupos das ligas que já responderam (final: inclui a nota das que falharam). */
function gruposDasLigas(esp, respostas, final) {
  const vivo = (itens) => itens.some((x) => x.estado === 2);
  {
    const grupos = [];
    const falhas = [];
    respostas.forEach((r, i) => {
      if (!r) return; // ainda não chegou
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
    if (final && falhas.length) grupos.push({ chave: `${esp.id}:falhas`, esporte: esp.id, ordem: 1e6, aoVivo: false, jogos: [], nota: `Não carregou agora: ${falhas.join(", ")}.` });
    return grupos;
  }
}

/** NBA (do PC), F1, UFC e boxe: os eventos do dia. */
async function gruposDeEventos(esp, data, vivo) {
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
            cabecaGrupo({ titulo: "NBA", chave: "nba:nba", aoClicar: () => irPara("nba", "classificacao"), favorito: { tipo: "liga", esporte: "nba", liga: "nba", id: "nba", nome: "NBA" }, jogos: visiveis }),
            visiveis.map((j) => nbaLinhaJogo(j))
          ),
      },
    ];
  }
  let eventos;
  let abrir;
  if (esp.tipo === "boxe") {
    eventos = (await api("/boxe/eventos")).filter((ev) => Rotas.eventoNoDia(ev, data, dataBR));
    abrir = (ev) => boxeAbrir(esp, ev);
  } else {
    const liga = esp.ligas[0].id;
    const cal = await api(`/e/${esp.id}/${liga}/eventos`);
    eventos = cal.eventos.filter((ev) => Rotas.eventoNoDia(ev, data, dataBR));
    if (esp.tipo === "corrida") eventos = await comSituacaoCorrida(esp, liga, eventos);
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
    if (pendentes.size) partes.push(algum ? esqueleto("grupo", "Carregando mais jogos…") : esqueleto("lista"));
    else if (!algum) partes.push(vazio(jogos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo nesta data."));
    lista().replaceChildren(...partes);
  }

  function carregar(esp, redesenharJa) {
    pendentes.add(esp.id);
    if (redesenharJa) {
      porEsporte.delete(esp.id);
      desenhar();
    }
    // no futebol cada liga aparece quando chega (só na primeira pintura: a atualização silenciosa desenha no fim)
    let pintura = null;
    const aoParcial = silencioso
      ? null
      : (parciais) => {
          if (porEsporte.has(esp.id) && !Array.isArray(porEsporte.get(esp.id))) return;
          porEsporte.set(esp.id, parciais);
          if (!pintura) pintura = requestAnimationFrame(() => ((pintura = null), desenhar()));
        };
    return gruposDoEsporte(esp, data, aoParcial)
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
  if (!silencioso) adiantarDias(esportes, data);
  if (todos.some((j) => j.estado === 2)) agendar("lista", () => jogosTodos(true), 20000);
  else if (data === hoje && todos.some((j) => j.estado === 1)) agendar("lista", () => jogosTodos(true), 60000);
}

/** Com o aparelho ocioso, busca os jogos do dia anterior e do seguinte: trocar de dia sai na hora
    (o dado fica guardado). Não faz isso com economia de dados ligada nem em rede 2G. */
function adiantarDias(esportes, data) {
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
  const ocioso = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1500);
  ocioso(() => {
    for (const d of [somarDias(data, 1), somarDias(data, -1)]) {
      for (const esp of esportes) gruposDoEsporte(esp, d).catch(() => {});
    }
  });
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

/* ---------- Aviso de APK novo (chamado pelo app Android) ---------- */

/** As telas atuais pedem um APK mais novo: mostra uma faixa acima da barra de baixo com o link do release. */
window.mostrarAvisoApk = function (link) {
  if (document.getElementById("aviso-apk")) return;
  const faixa = h(
    "div",
    { class: "aviso-apk", id: "aviso-apk", role: "status" },
    h("span", { class: "aviso-apk-texto" }, "Nova versão do app disponível"),
    h("a", { class: "botao botao-principal aviso-apk-baixar", href: link }, "Baixar"),
    h("button", { class: "aviso-apk-fechar", type: "button", "aria-label": "Fechar o aviso", onclick: () => faixa.remove() }, "×")
  );
  document.querySelector(".app").append(faixa);
};

/* ---------- Dado guardado na hora, dado novo depois ---------- */
// No celular, o direto.js entrega o que está guardado e busca o novo em segundo plano; quando o novo
// é diferente, ele avisa e a página aberta se redesenha em silêncio (sem "Carregando…").
window.addEventListener("ss:dados-novos", () => {
  const p = Navegacao.topo();
  if (!p || document.hidden) return;
  if (p.pronta === null) return; // o primeiro desenho ainda não terminou: ele já traz o dado novo
  const def = PAGINAS[p.tipo];
  try {
    // na aba Jogos, o aoMostrar devolveria o dia guardado ao sair: aqui só redesenha a lista
    if (p.tipo === "jogos") desenharChipJogos(true);
    else if (def && def.aoMostrar) def.aoMostrar(p.corpo, p.params, p);
  } catch (_) {
    /* a próxima atualização tenta de novo */
  }
});
