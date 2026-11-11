"use strict";

/* =========================================================================
   Scoresports — base do site e módulo da NBA.
   Os outros esportes (futebol, NFL, F1, UFC e boxe) ficam em esportes.js.
   ========================================================================= */

const FUSO = "America/Sao_Paulo";
const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

/* ---------- Criação de elementos ---------- */

function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  aplicarProps(el, props);
  anexar(el, filhos);
  return el;
}

function s(tag, props, ...filhos) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  aplicarProps(el, props);
  anexar(el, filhos);
  return el;
}

function aplicarProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
}

function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

/* ---------- Dados ---------- */

async function api(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    let detalhe = "";
    try {
      detalhe = (await resposta.json()).detail;
    } catch (_) {
      /* resposta sem JSON */
    }
    throw new Error(typeof detalhe === "string" && detalhe ? detalhe : `Erro ${resposta.status} ao buscar os dados.`);
  }
  return resposta.json();
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(`ss:${chave}`, valor);
  } catch (_) {
    /* navegador sem armazenamento: só não lembra a escolha */
  }
}

function lembrar(chave) {
  try {
    return localStorage.getItem(`ss:${chave}`);
  } catch (_) {
    return null;
  }
}

/* ---------- Datas e números ---------- */

const formatoHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const formatoDiaHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const formatoIsoBR = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

function hora(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatoHora.format(d);
}

function diaHora(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatoDiaHora.format(d);
}

function hojeBR() {
  return formatoIsoBR.format(new Date());
}

function dataBR(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatoIsoBR.format(d);
}

function meioDia(ymd) {
  return new Date(`${ymd}T12:00:00Z`);
}

function dataCurta(ymd) {
  if (!ymd) return "";
  return meioDia(ymd.slice(0, 10)).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

function dataLonga(ymd) {
  if (!ymd) return "";
  const texto = meioDia(ymd).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function somarDias(ymd, n) {
  const d = meioDia(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function num(valor, casas = 1) {
  if (valor === null || valor === undefined || valor === "" || Number.isNaN(Number(valor))) return "–";
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function pct(feitos, tentados) {
  return tentados ? num((100 * feitos) / tentados, 1) : "–";
}

function separarArremesso(texto) {
  const [f, t] = String(texto || "0/0").split("/").map(Number);
  return [f || 0, t || 0];
}

/* ---------- Estado da página ---------- */

const S = {
  esportes: [],
  esporte: null,
  aba: null,
  tkLista: 0,
  tkDetalhe: 0,
  timers: {},
  abaDetalhe: {},
};

const MODULOS = {};

function registrarModulo(tipo, modulo) {
  MODULOS[tipo] = modulo;
}

const lista = () => $("#lista");
const detalhe = () => $("#detalhe");

function novoTokenLista() {
  return ++S.tkLista;
}

function novoTokenDetalhe() {
  return ++S.tkDetalhe;
}

function agendar(nome, funcao, ms = 20000) {
  clearTimeout(S.timers[nome]);
  S.timers[nome] = setTimeout(() => {
    if (document.hidden) {
      agendar(nome, funcao, ms);
      return;
    }
    funcao();
  }, ms);
}

function cancelar(nome) {
  clearTimeout(S.timers[nome]);
  delete S.timers[nome];
}

function cancelarTudo() {
  Object.keys(S.timers).forEach(cancelar);
}

function layoutLargo(largo) {
  $(".palco").classList.toggle("largo", Boolean(largo));
}

function mostrarDetalhe() {
  document.body.classList.add("mostrando-detalhe");
  if (window.matchMedia("(max-width: 860px)").matches) window.scrollTo({ top: 0 });
}

function voltarParaLista() {
  document.body.classList.remove("mostrando-detalhe");
  cancelar("detalhe");
}

function detalheVazio(texto = "Escolha um jogo para ver os detalhes.") {
  detalhe().replaceChildren(h("div", { class: "vazio-detalhe" }, texto));
}

function marcarAtual(raiz, id) {
  raiz.querySelectorAll("[data-id]").forEach((el) => {
    if (el.dataset.id === String(id)) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
}

/* ---------- Pedaços de interface ---------- */

function carregando(texto = "Carregando…") {
  return h("div", { class: "carregando" }, texto);
}

function vazio(texto) {
  return h("div", { class: "vazio" }, texto);
}

function caixaErro(erro, tentar) {
  return h(
    "div",
    { class: "erro" },
    h("div", null, erro && erro.message ? erro.message : String(erro)),
    tentar ? h("button", { class: "botao", type: "button", onclick: tentar }, "Tentar de novo") : null
  );
}

function cartao(titulo, ...conteudo) {
  return h(
    "section",
    { class: "cartao" },
    titulo ? h("div", { class: "cartao-cabeca" }, typeof titulo === "string" ? h("h3", null, titulo) : titulo) : null,
    h("div", { class: "cartao-corpo" }, ...conteudo)
  );
}

function secao(titulo, ...conteudo) {
  return h("div", { class: "secao" }, titulo ? h("h3", null, titulo) : null, ...conteudo);
}

function imgLogo(src, classe = "logo") {
  if (!src) return h("span", { class: "logo-vazio", "aria-hidden": "true" });
  return h("img", {
    class: classe,
    src,
    alt: "",
    loading: "lazy",
    onerror: (e) => e.target.replaceWith(h("span", { class: "logo-vazio", "aria-hidden": "true" })),
  });
}

function imgBandeira(src, pais) {
  return src ? h("img", { class: "bandeira", src, alt: pais || "", title: pais || null, loading: "lazy" }) : null;
}

function botaoVoltarMobile() {
  return h("button", { class: "botao voltar-mobile", type: "button", onclick: voltarParaLista }, "‹ Voltar");
}

function alternar(opcoes, atual, aoEscolher, rotulo) {
  return h(
    "div",
    { class: "alternar", role: "group", "aria-label": rotulo || null },
    opcoes.map(([valor, texto]) =>
      h("button", { type: "button", "aria-pressed": String(valor === atual), onclick: () => aoEscolher(valor) }, texto)
    )
  );
}

function abasDetalhe(abas, atual, aoEscolher) {
  return h(
    "div",
    { class: "abas-detalhe", role: "group", "aria-label": "Seções" },
    abas.map((a) =>
      h("button", { class: "aba-detalhe", type: "button", "aria-pressed": String(a.id === atual), onclick: () => aoEscolher(a.id) }, a.nome)
    )
  );
}

function barraData({ data, anterior, proximo, hoje, min, max, aoMudar }) {
  return h(
    "div",
    { class: "barra-data" },
    h("button", { class: "botao-icone", type: "button", "aria-label": "Dia anterior", disabled: !anterior, onclick: () => aoMudar(anterior) }, "‹"),
    h("input", {
      class: "campo-data",
      type: "date",
      value: data,
      min: min || null,
      max: max || null,
      "aria-label": "Escolher a data",
      onchange: (e) => e.target.value && aoMudar(e.target.value),
    }),
    h("button", { class: "botao-icone", type: "button", "aria-label": "Próximo dia", disabled: !proximo, onclick: () => aoMudar(proximo) }, "›"),
    h("button", { class: "botao", type: "button", disabled: data === hoje, onclick: () => aoMudar(hoje) }, "Hoje")
  );
}

function blocoTransmissao(t) {
  if (!t) {
    return h(
      "p",
      { class: "nota" },
      "Sem informação de transmissão para esta competição. Dá para anotar a grade em transmissoes.json."
    );
  }
  return h(
    "div",
    { class: "transmissao" },
    t.canais && t.canais.length ? h("div", { class: "canais" }, t.canais.map((c) => h("span", { class: "canal" }, c))) : null,
    h(
      "div",
      null,
      h("span", { class: `selo${t.confirmado ? " confirmado" : ""}` }, t.confirmado ? "Grade confirmada" : "Padrão da competição"),
      t.conferido_em ? h("span", { class: "nota", style: { marginLeft: "8px" } }, `conferido em ${dataCurta(t.conferido_em)}`) : null
    ),
    t.observacao ? h("p", { class: "nota" }, t.observacao) : null
  );
}

function canalNaLista(t, mostrarPadrao = true) {
  if (!t || !t.canais || !t.canais.length) return h("span");
  if (!t.confirmado && !mostrarPadrao) return h("span");
  const extra = t.canais.length > 1 ? `+${t.canais.length - 1}` : null;
  return h(
    "div",
    { class: "jogo-canal", title: `${t.confirmado ? "Grade confirmada" : "Padrão da competição"}: ${t.canais.join(", ")}` },
    t.confirmado ? h("strong", null, t.canais[0]) : h("span", null, t.canais[0]),
    extra
  );
}

/** Uma linha de jogo na lista. `times` vem na ordem em que deve aparecer. */
function botaoJogo({ id, estado, status, times, transmissao, mostrarPadrao, aoClicar, atual }) {
  const aoVivo = estado === 2;
  return h(
    "button",
    {
      class: `jogo${aoVivo ? " ao-vivo" : ""}`,
      type: "button",
      dataset: { id: String(id) },
      "aria-current": atual ? "true" : null,
      onclick: aoClicar,
    },
    h(
      "div",
      { class: `jogo-status${aoVivo ? " ao-vivo" : ""}` },
      status.map((linha, i) => h("div", { class: i === 0 && estado === 1 ? "hora" : null }, linha))
    ),
    h(
      "div",
      { class: "jogo-times" },
      times.map((t) =>
        h(
          "div",
          { class: `linha-time${t.perdeu ? " perdeu" : ""}` },
          imgLogo(t.logo),
          h("span", { class: "nome" }, t.nome),
          h("span", { class: "placar" }, t.placar ?? "")
        )
      )
    ),
    canalNaLista(transmissao, mostrarPadrao)
  );
}

/** Placar grande do topo do detalhe. */
function placarGrande({ esquerda, direita, estado, status, info, centro }) {
  const aoVivo = estado === 2;
  const ladoTime = (t) =>
    h(
      "div",
      { class: "placar-time" },
      t.logo !== undefined ? imgLogo(t.logo) : null,
      t.aoClicar ? h("button", { class: "botao-link nome", type: "button", onclick: t.aoClicar }, t.nome) : h("div", { class: "nome" }, t.nome),
      t.sub ? h("div", { class: "sub" }, t.sub) : null
    );
  const temPlacar = estado >= 2 && esquerda.placar !== null && esquerda.placar !== undefined;
  return h(
    "div",
    { class: "placar-grande" },
    ladoTime(esquerda),
    h(
      "div",
      { class: "placar-centro" },
      centro ||
        (temPlacar
          ? h(
              "div",
              { class: `placar-numeros${aoVivo ? " ao-vivo" : ""}` },
              String(esquerda.placar),
              h("span", { class: "separador" }, "–"),
              String(direita.placar ?? "")
            )
          : h("div", { class: "placar-numeros" }, status || "–")),
      temPlacar || centro ? h("div", { class: `placar-status${aoVivo ? " ao-vivo" : ""}` }, status || "") : null,
      info ? h("div", { class: "placar-info" }, info) : null
    ),
    ladoTime(direita)
  );
}

function tabela(colunas, linhas, { rodape, classeLinha } = {}) {
  return h(
    "div",
    { class: "rolagem" },
    h(
      "table",
      { class: "tabela" },
      h("thead", null, h("tr", null, colunas.map((c) => h("th", { title: c.titulo || null, class: c.esq ? "esq" : null }, c.nome)))),
      h(
        "tbody",
        null,
        linhas.map((l, i) =>
          l && l.separador
            ? h("tr", { class: "separador-linha" }, h("td", { colspan: colunas.length }, l.separador))
            : h(
                "tr",
                { class: classeLinha ? classeLinha(l, i) : null, style: l && l._cor ? { "--cor-zona": l._cor } : null },
                colunas.map((c) => h("td", { class: [c.esq ? "esq" : "", c.destaque ? "destaque" : ""].join(" ").trim() || null }, c.valor(l, i)))
              )
        )
      ),
      rodape ? h("tfoot", null, h("tr", null, colunas.map((c) => h("td", { class: c.esq ? "esq" : null }, rodape[c.chave] ?? "")))) : null
    )
  );
}

/* ---------- Painel (jogador, atleta, elenco) ---------- */

const Painel = {
  pilha: [],
  atual: null,
  token: 0,

  abrir(titulo, construir) {
    this.pilha = [];
    this.mostrar(titulo, construir);
    const dialogo = $("#painel");
    if (!dialogo.open) dialogo.showModal();
  },

  empilhar(titulo, construir) {
    if (this.atual) this.pilha.push(this.atual);
    this.mostrar(titulo, construir);
  },

  mostrar(titulo, construir) {
    this.atual = { titulo, construir };
    $("#painel-titulo").textContent = titulo;
    $("#painel-voltar").hidden = this.pilha.length === 0;
    const corpo = $("#painel-corpo");
    corpo.replaceChildren(carregando());
    corpo.scrollTop = 0;
    const tk = ++this.token;
    const ativo = () => tk === this.token && $("#painel").open;
    Promise.resolve()
      .then(() => construir(corpo, ativo))
      .catch((erro) => {
        if (tk === this.token) corpo.replaceChildren(caixaErro(erro, () => this.mostrar(titulo, construir)));
      });
  },

  voltar() {
    const anterior = this.pilha.pop();
    if (anterior) this.mostrar(anterior.titulo, anterior.construir);
  },

  fechar() {
    this.token++;
    $("#painel").close();
  },
};

/* ---------- Navegação entre esportes ---------- */

function desenharEsportes() {
  $("#esportes").replaceChildren(
    ...S.esportes.map((e) =>
      h("button", { class: "esporte", type: "button", "aria-current": String(e.id === S.esporte), onclick: () => irPara(e.id) }, e.nome)
    )
  );
}

function desenharSubnav(esp, modulo, abas) {
  const partes = [];
  if (abas.length > 1) {
    partes.push(
      h(
        "div",
        { class: "abas", role: "group", "aria-label": "Seções" },
        abas.map((a) =>
          h("button", { class: "aba", type: "button", "aria-pressed": String(a.id === S.aba), onclick: () => irPara(esp.id, a.id) }, a.nome)
        )
      )
    );
  }
  if (modulo.subnavExtra) {
    const extra = modulo.subnavExtra(esp, S.aba);
    if (extra) partes.push(extra);
  }
  $("#subnav").replaceChildren(...partes);
}

function irPara(esporteId, aba) {
  const esp = S.esportes.find((e) => e.id === esporteId) || S.esportes[0];
  const modulo = MODULOS[esp.tipo];
  const abas = modulo.abas(esp);
  const pedida = aba || lembrar(`aba:${esp.id}`);
  S.esporte = esp.id;
  S.aba = abas.some((a) => a.id === pedida) ? pedida : abas[0].id;
  guardar("esporte", esp.id);
  guardar(`aba:${esp.id}`, S.aba);

  cancelarTudo();
  novoTokenLista();
  novoTokenDetalhe();
  document.body.classList.remove("mostrando-detalhe");
  layoutLargo(false);
  detalheVazio(modulo.textoVazio ? modulo.textoVazio(S.aba) : undefined);
  desenharEsportes();
  desenharSubnav(esp, modulo, abas);
  lista().replaceChildren(carregando());
  modulo.desenhar(esp, S.aba);
}

function redesenharSubnav() {
  const esp = S.esportes.find((e) => e.id === S.esporte);
  const modulo = MODULOS[esp.tipo];
  desenharSubnav(esp, modulo, modulo.abas(esp));
}

async function iniciar() {
  $("#painel-fechar").addEventListener("click", () => Painel.fechar());
  $("#painel-voltar").addEventListener("click", () => Painel.voltar());
  $("#painel").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) Painel.fechar();
  });
  $("#painel").addEventListener("close", () => Painel.token++);

  try {
    S.esportes = await api("/esportes");
  } catch (erro) {
    lista().replaceChildren(caixaErro(erro, iniciar));
    return;
  }
  S.esportes = S.esportes.filter((e) => MODULOS[e.tipo]);
  irPara(lembrar("esporte") || S.esportes[0].id);
}

window.addEventListener("DOMContentLoaded", iniciar);

/* =========================================================================
   NBA
   ========================================================================= */

const NBA = {
  datas: null,
  hoje: null,
  data: null,
  jogoAtual: null,
  modoLideres: "media",
  listaJogadores: [],
  busca: "",
};

const nbaLogo = (id) => (id ? `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg` : null);
const nbaFoto = (id) => `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;

registrarModulo("nba", {
  abas: () => [
    { id: "jogos", nome: "Jogos" },
    { id: "classificacao", nome: "Classificação" },
    { id: "lideres", nome: "Líderes" },
    { id: "corridas", nome: "MVP e calouro" },
    { id: "jogadores", nome: "Jogadores" },
  ],
  desenhar(esp, aba) {
    if (aba === "jogos") return nbaJogos();
    layoutLargo(true);
    if (aba === "classificacao") return nbaClassificacao();
    if (aba === "lideres") return nbaLideres();
    if (aba === "corridas") return nbaCorridas();
    if (aba === "jogadores") return nbaJogadores();
  },
});

/* ---------- Jogos ---------- */

async function nbaJogos() {
  const tk = novoTokenLista();
  if (!NBA.datas) {
    try {
      const resposta = await api("/datas");
      NBA.datas = resposta.datas;
      NBA.hoje = resposta.hoje;
    } catch (erro) {
      if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, nbaJogos));
      return;
    }
  }
  if (tk !== S.tkLista) return;
  if (!NBA.data) {
    const d = NBA.datas;
    NBA.data = d.includes(NBA.hoje) ? NBA.hoje : d.find((x) => x > NBA.hoje) || d[d.length - 1] || NBA.hoje;
  }
  nbaDia(false);
}

async function nbaDia(silencioso) {
  const tk = silencioso ? S.tkLista : novoTokenLista();
  const datas = NBA.datas;
  const anterior = [...datas].reverse().find((d) => d < NBA.data) || null;
  const proximo = datas.find((d) => d > NBA.data) || null;
  const barra = barraData({
    data: NBA.data,
    anterior,
    proximo,
    hoje: NBA.hoje,
    min: datas[0],
    max: datas[datas.length - 1],
    aoMudar: (d) => {
      NBA.data = d;
      cancelar("lista");
      nbaDia(false);
    },
  });
  if (!silencioso) lista().replaceChildren(barra, carregando());

  let jogos;
  try {
    jogos = await api(`/jogos?data=${NBA.data}`);
  } catch (erro) {
    if (tk === S.tkLista && !silencioso) lista().replaceChildren(barra, caixaErro(erro, () => nbaDia(false)));
    return;
  }
  if (tk !== S.tkLista) return;

  const linhas = jogos.map((j) => nbaLinhaJogo(j));
  lista().replaceChildren(
    barra,
    h("p", { class: "titulo-dia" }, dataLonga(NBA.data)),
    jogos.length ? h("div", { class: "cartao" }, linhas) : vazio("Nenhum jogo nesta data.")
  );

  const temAoVivo = jogos.some((j) => j.estado === 2);
  const hojeComJogo = NBA.data === NBA.hoje && jogos.some((j) => j.estado === 1);
  if (temAoVivo || hojeComJogo) agendar("lista", () => nbaDia(true), temAoVivo ? 20000 : 60000);
}

function nbaStatusLista(j) {
  if (j.estado === 1) return [hora(j.inicio) || "A definir"];
  if (j.estado === 2) return [j.status || "Ao vivo"];
  return ["Fim"];
}

function nbaLinhaJogo(j) {
  const terminou = j.estado === 3;
  const pf = Number(j.fora.placar);
  const pc = Number(j.casa.placar);
  return botaoJogo({
    id: j.id,
    estado: j.estado,
    status: nbaStatusLista(j),
    atual: j.id === NBA.jogoAtual,
    transmissao: j.transmissao,
    mostrarPadrao: false,
    aoClicar: () => nbaAbrirJogo(j),
    times: [
      { nome: j.fora.nome, logo: nbaLogo(j.fora.time_id), placar: j.estado >= 2 ? j.fora.placar : null, perdeu: terminou && pf < pc },
      { nome: j.casa.nome, logo: nbaLogo(j.casa.time_id), placar: j.estado >= 2 ? j.casa.placar : null, perdeu: terminou && pc < pf },
    ],
  });
}

function nbaAbrirJogo(jogo) {
  NBA.jogoAtual = jogo.id;
  marcarAtual(lista(), jogo.id);
  mostrarDetalhe();
  cancelar("detalhe");
  if (jogo.estado === 1) nbaPreJogo(jogo);
  else nbaBoxScore(jogo, false);
}

/* ---------- Pré-jogo ---------- */

async function nbaPreJogo(jogo) {
  const tk = novoTokenDetalhe();
  detalhe().replaceChildren(botaoVoltarMobile(), carregando("Montando o pré-jogo…"));
  let pre;
  try {
    pre = await api(`/jogos/${jogo.id}/pre-jogo`);
  } catch (erro) {
    if (tk === S.tkDetalhe) detalhe().replaceChildren(botaoVoltarMobile(), caixaErro(erro, () => nbaPreJogo(jogo)));
    return;
  }
  if (tk !== S.tkDetalhe) return;

  const { fora, casa } = pre.jogo;
  const topo = h(
    "section",
    { class: "cartao" },
    placarGrande({
      esquerda: { nome: fora.nome, logo: nbaLogo(fora.time_id), sub: "Visitante" },
      direita: { nome: casa.nome, logo: nbaLogo(casa.time_id), sub: "Mandante" },
      estado: 1,
      status: hora(pre.jogo.inicio) || "A definir",
      info: [dataLonga(pre.jogo.data), pre.jogo.fase].filter(Boolean).join(", "),
    }),
    secao("Onde assistir no Brasil", blocoTransmissao(jogo.transmissao || pre.transmissao))
  );

  const t = pre.times;
  const blocos = [topo];

  blocos.push(
    cartao(
      "Últimos jogos",
      h("div", { class: "duas-colunas" }, nbaForma(fora, t.fora.forma), nbaForma(casa, t.casa.forma))
    )
  );

  blocos.push(
    cartao(
      "Prováveis titulares",
      h("div", { class: "duas-colunas" }, nbaEscalacao(fora, t.fora.escalacao), nbaEscalacao(casa, t.casa.escalacao)),
      h("p", { class: "nota" }, "Quem mais começou jogando nos últimos jogos, sem os jogadores fora por lesão.")
    )
  );

  blocos.push(
    cartao("Maiores médias", h("div", { class: "duas-colunas" }, nbaLideresTime(fora, t.fora.lideres), nbaLideresTime(casa, t.casa.lideres)))
  );

  blocos.push(
    cartao("Lesionados", h("div", { class: "duas-colunas" }, nbaLesionados(fora, t.fora.lesionados), nbaLesionados(casa, t.casa.lesionados)))
  );

  if (pre.confronto && pre.confronto.jogos.length) {
    const c = pre.confronto;
    blocos.push(
      cartao(
        `Confronto direto: ${fora.sigla} ${c.vitorias_fora} x ${c.vitorias_casa} ${casa.sigla}`,
        h(
          "ul",
          { class: "lista-simples" },
          c.jogos.map((g) =>
            h(
              "li",
              null,
              h("span", { class: "sub" }, dataCurta(g.data)),
              h("span", { class: "numero" }, `${g.visitante} ${g.pontos_visitante} x ${g.pontos_mandante} ${g.mandante}`)
            )
          )
        )
      )
    );
  }

  if (pre.falhas && pre.falhas.length) {
    blocos.push(h("p", { class: "nota" }, `Algumas partes não carregaram agora (${pre.falhas.join(", ")}). Elas voltam na próxima atualização.`));
  }
  detalhe().replaceChildren(botaoVoltarMobile(), ...blocos);
}

function nbaForma(time, forma) {
  if (!forma.length) return h("div", null, h("strong", null, time.sigla), h("p", { class: "nota" }, "Ainda sem jogos na temporada."));
  return h(
    "div",
    null,
    h("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px" } }, h("strong", null, time.sigla),
      h("div", { class: "forma" }, forma.map((f) => h("span", { class: f.resultado, title: `${f.local === "casa" ? "vs." : "@"} ${f.adversario}` }, f.resultado)))),
    h(
      "ul",
      { class: "lista-simples" },
      forma.map((f) =>
        h(
          "li",
          null,
          h("span", { class: "sub" }, `${dataCurta(f.data)} ${f.local === "casa" ? "vs." : "@"} ${f.adversario}`),
          h("span", { class: "numero" }, `${f.pontos} x ${f.pontos_adv}`)
        )
      )
    )
  );
}

function nbaEscalacao(time, esc) {
  if (!esc.quinteto.length) return h("div", null, h("strong", null, time.sigla), h("p", { class: "nota" }, "Sem jogos suficientes para estimar."));
  return h(
    "div",
    null,
    h("strong", null, time.sigla),
    h(
      "ul",
      { class: "lista-simples", style: { marginTop: "8px" } },
      esc.quinteto.map((p) =>
        h(
          "li",
          null,
          h("button", { class: "botao-link", type: "button", onclick: () => abrirJogadorNBA(p.id, p.nome, { sigla: time.sigla }) }, p.nome),
          h("span", { class: "sub" }, [p.posicao, `${num(p.min_medio)} min`].filter(Boolean).join(", "))
        )
      )
    )
  );
}

function nbaLideresTime(time, lideres) {
  if (!lideres.length) return h("div", null, h("strong", null, time.sigla), h("p", { class: "nota" }, "Sem estatísticas ainda."));
  return h(
    "div",
    null,
    h("strong", null, time.sigla),
    h(
      "ul",
      { class: "lista-simples", style: { marginTop: "8px" } },
      lideres.map((l) =>
        h(
          "li",
          null,
          h(
            "span",
            null,
            h("span", { class: "sub" }, `${l.rotulo}: `),
            h("button", { class: "botao-link", type: "button", onclick: () => abrirJogadorNBA(l.id, l.nome, { sigla: time.sigla }) }, l.nome)
          ),
          h("strong", { class: "numero" }, num(l.valor))
        )
      )
    )
  );
}

function nbaLesionados(time, lesionados) {
  return h(
    "div",
    null,
    h("strong", null, time.sigla),
    lesionados.length
      ? h(
          "ul",
          { class: "lista-simples", style: { marginTop: "8px" } },
          lesionados.map((l) =>
            h("li", null, h("span", null, l.nome, l.motivo ? h("span", { class: "sub" }, ` (${l.motivo})`) : null), h("span", { class: "sub" }, traduzirStatusLesao(l.status)))
          )
        )
      : h("p", { class: "nota" }, "Ninguém na lista.")
  );
}

function traduzirStatusLesao(status) {
  const mapa = { out: "Fora", questionable: "Dúvida", doubtful: "Improvável", probable: "Provável", "day-to-day": "Dia a dia" };
  return mapa[String(status || "").toLowerCase()] || status || "";
}

/* ---------- Box score ---------- */

async function nbaBoxScore(jogo, silencioso) {
  const tk = silencioso ? S.tkDetalhe : novoTokenDetalhe();
  if (!silencioso) detalhe().replaceChildren(botaoVoltarMobile(), carregando());
  let box;
  try {
    box = await api(`/jogos/${jogo.id}/boxscore`);
  } catch (erro) {
    if (tk === S.tkDetalhe && !silencioso) detalhe().replaceChildren(botaoVoltarMobile(), caixaErro(erro, () => nbaBoxScore(jogo, false)));
    return;
  }
  if (tk !== S.tkDetalhe) return;

  const estado = box.estado || jogo.estado;
  const aba = S.abaDetalhe.nba && [box.fora.sigla, box.casa.sigla].includes(S.abaDetalhe.nba) ? S.abaDetalhe.nba : box.fora.sigla;
  const area = h("div");
  const trocar = (sigla) => {
    S.abaDetalhe.nba = sigla;
    abas.replaceWith((abas = abasDetalhe(opcoes, sigla, trocar)));
    area.replaceChildren(nbaTabelaBox(sigla === box.casa.sigla ? box.casa : box.fora, box.id));
  };
  const opcoes = [
    { id: box.fora.sigla, nome: box.fora.nome },
    { id: box.casa.sigla, nome: box.casa.nome },
  ];
  let abas = abasDetalhe(opcoes, aba, trocar);
  area.replaceChildren(nbaTabelaBox(aba === box.casa.sigla ? box.casa : box.fora, box.id));

  const topo = h(
    "section",
    { class: "cartao" },
    placarGrande({
      esquerda: { nome: box.fora.nome, logo: nbaLogo(box.fora.time_id), placar: box.fora.placar },
      direita: { nome: box.casa.nome, logo: nbaLogo(box.casa.time_id), placar: box.casa.placar },
      estado,
      status: estado === 3 ? "Encerrado" : box.status,
      info: dataLonga(jogo.data || NBA.data),
    }),
    abas,
    area
  );
  const blocos = [topo];
  if (estado === 2 && jogo.transmissao) blocos.push(cartao("Onde assistir no Brasil", blocoTransmissao(jogo.transmissao)));
  blocos.push(h("p", { class: "nota" }, "Clique no nome de um jogador para ver a temporada, a carreira e o mapa de arremessos deste jogo."));
  detalhe().replaceChildren(botaoVoltarMobile(), ...blocos);

  if (estado === 2) agendar("detalhe", () => nbaBoxScore(jogo, true), 20000);
}

function nbaTabelaBox(time, gameId) {
  const titulares = time.jogadores.filter((j) => j.titular);
  const reservas = time.jogadores.filter((j) => !j.titular);
  const linhas = titulares.length ? [...titulares, { separador: "Reservas" }, ...reservas] : time.jogadores;
  const soma = (campo) => time.jogadores.reduce((total, j) => total + (Number(j[campo]) || 0), 0);
  const somaArremessos = (campo) => {
    const [f, t] = time.jogadores.reduce(
      (acc, j) => {
        const [a, b] = separarArremesso(j[campo]);
        return [acc[0] + a, acc[1] + b];
      },
      [0, 0]
    );
    return `${f}/${t} (${pct(f, t)}%)`;
  };
  const colunas = [
    {
      chave: "nome",
      nome: "Jogador",
      esq: true,
      valor: (j) =>
        h(
          "span",
          null,
          h("button", { class: "botao-link", type: "button", onclick: () => abrirJogadorNBA(j.id, j.nome, { jogo: gameId, sigla: time.sigla }) }, j.nome),
          j.posicao ? h("span", { class: "nota", style: { marginLeft: "6px" } }, j.posicao) : null
        ),
    },
    { chave: "min", nome: "MIN", valor: (j) => j.min },
    { chave: "pts", nome: "PTS", destaque: true, valor: (j) => j.pts },
    { chave: "reb", nome: "REB", valor: (j) => j.reb },
    { chave: "ast", nome: "AST", valor: (j) => j.ast },
    { chave: "fg", nome: "FG", titulo: "Arremessos de quadra (feitos/tentados)", valor: (j) => j.fg },
    { chave: "tres", nome: "3PT", titulo: "Bolas de três (feitas/tentadas)", valor: (j) => j.tres },
    { chave: "ll", nome: "LL", titulo: "Lances livres (feitos/tentados)", valor: (j) => j.ll },
    { chave: "reb_of", nome: "RO", titulo: "Rebotes ofensivos", valor: (j) => j.reb_of },
    { chave: "reb_def", nome: "RD", titulo: "Rebotes defensivos", valor: (j) => j.reb_def },
    { chave: "stl", nome: "ROB", titulo: "Roubos de bola", valor: (j) => j.stl },
    { chave: "blk", nome: "TOC", titulo: "Tocos", valor: (j) => j.blk },
    { chave: "to", nome: "TO", titulo: "Turnovers", valor: (j) => j.to },
    { chave: "faltas", nome: "FAL", titulo: "Faltas", valor: (j) => j.faltas },
    { chave: "mm", nome: "+/-", valor: (j) => (j.mm > 0 ? `+${j.mm}` : j.mm) },
  ];
  if (!time.jogadores.length) return h("div", { class: "secao" }, vazio("O box score aparece quando o jogo começar."));
  return h(
    "div",
    { class: "secao" },
    tabela(colunas, linhas, {
      rodape: {
        nome: "Total do time",
        pts: soma("pts"),
        reb: soma("reb"),
        ast: soma("ast"),
        fg: somaArremessos("fg"),
        tres: somaArremessos("tres"),
        ll: somaArremessos("ll"),
        reb_of: soma("reb_of"),
        reb_def: soma("reb_def"),
        stl: soma("stl"),
        blk: soma("blk"),
        to: soma("to"),
        faltas: soma("faltas"),
      },
    })
  );
}

/* ---------- Painel do jogador ---------- */

function abrirJogadorNBA(id, nome, contexto = {}) {
  Painel.abrir(nome, (corpo, ativo) => desenharJogadorNBA(corpo, ativo, id, nome, contexto));
}

async function abrirJogadorPorNome(nome) {
  try {
    const achados = await api(`/jogadores/busca?q=${encodeURIComponent(nome)}`);
    const exato = achados.find((p) => p.nome.toLowerCase() === nome.toLowerCase()) || achados[0];
    if (exato) abrirJogadorNBA(exato.id, exato.nome);
  } catch (_) {
    /* sem resultado: não abre nada */
  }
}

function desenharJogadorNBA(corpo, ativo, id, nome, contexto) {
  const abas = [
    { id: "temporada", nome: "Temporada" },
    { id: "carreira", nome: "Carreira" },
  ];
  if (contexto.jogo) abas.push({ id: "arremessos", nome: "Arremessos no jogo" });
  let aba = contexto.aba || "temporada";
  const sub = h("div", { class: "perfil-sub" }, contexto.sigla || "");
  const cabeca = h(
    "div",
    { class: "perfil" },
    h("img", { class: "perfil-foto", src: nbaFoto(id), alt: "", onerror: (e) => (e.target.style.visibility = "hidden") }),
    h("div", null, h("h3", { class: "perfil-nome" }, nome), sub)
  );
  const area = h("div");
  let barra = abasDetalhe(abas, aba, trocar);

  function trocar(nova) {
    aba = nova;
    const novaBarra = abasDetalhe(abas, aba, trocar);
    barra.replaceWith(novaBarra);
    barra = novaBarra;
    area.replaceChildren(carregando());
    const funcoes = { temporada: nbaPainelTemporada, carreira: nbaPainelCarreira, arremessos: nbaPainelArremessos };
    funcoes[aba](area, ativo, id, contexto, sub).catch((erro) => {
      if (ativo()) area.replaceChildren(caixaErro(erro, () => trocar(aba)));
    });
  }

  corpo.replaceChildren(cabeca, barra, area);
  trocar(aba);
}

async function nbaPainelTemporada(area, ativo, id) {
  const j = await api(`/jogadores/${id}`);
  if (!ativo()) return;
  if (!j.jogos_disputados) {
    area.replaceChildren(vazio(`Sem jogos na temporada regular ${j.temporada}. Veja a aba Carreira.`));
    return;
  }
  const m = j.medias;
  const caixa = (valor, rotulo) => h("div", { class: "numero-caixa" }, h("strong", null, valor), h("span", null, rotulo));
  const rotulosRecorde = { pts: "Pontos", reb: "Rebotes", ast: "Assistências", stl: "Roubos", blk: "Tocos", tres: "Bolas de três" };
  const cronologico = [...j.jogos].reverse();

  area.replaceChildren(
    secao(
      `Médias em ${j.temporada} (${j.jogos_disputados} jogos)`,
      h(
        "div",
        { class: "numeros" },
        caixa(num(m.pts), "Pontos"),
        caixa(num(m.reb), "Rebotes"),
        caixa(num(m.ast), "Assistências"),
        caixa(num(m.stl), "Roubos"),
        caixa(num(m.blk), "Tocos"),
        caixa(num(m.to), "Turnovers"),
        caixa(num(m.min), "Minutos"),
        caixa(m.fg_pct === null ? "–" : `${num(m.fg_pct)}%`, "FG"),
        caixa(m.tres_pct === null ? "–" : `${num(m.tres_pct)}%`, "3PT"),
        caixa(m.ll_pct === null ? "–" : `${num(m.ll_pct)}%`, "Lances livres")
      )
    ),
    secao("Pontos por jogo", graficoPontos(cronologico, m.pts)),
    secao("Recordes da temporada", listaRecordes(j.recordes, rotulosRecorde)),
    secao(
      "Jogo a jogo",
      tabela(
        [
          { nome: "Data", esq: true, valor: (g) => dataCurta(g.data) },
          { nome: "Jogo", esq: true, valor: (g) => g.confronto },
          { nome: "", valor: (g) => g.resultado || "" },
          { nome: "MIN", valor: (g) => g.min },
          { nome: "PTS", destaque: true, valor: (g) => g.pts },
          { nome: "REB", valor: (g) => g.reb },
          { nome: "AST", valor: (g) => g.ast },
          { nome: "ROB", valor: (g) => g.stl ?? "" },
          { nome: "TOC", valor: (g) => g.blk ?? "" },
          { nome: "FG", valor: (g) => g.fg },
          { nome: "3PT", valor: (g) => g.tres },
          { nome: "+/-", valor: (g) => (g.mm > 0 ? `+${g.mm}` : g.mm ?? "") },
        ],
        j.jogos
      )
    )
  );
}

function listaRecordes(recordes, rotulos) {
  const itens = Object.entries(rotulos)
    .filter(([chave]) => recordes && recordes[chave])
    .map(([chave, rotulo]) => {
      const r = recordes[chave];
      return h(
        "li",
        null,
        h("span", null, h("strong", { class: "numero" }, r.valor), ` ${rotulo.toLowerCase()}`),
        h("span", { class: "sub" }, [r.jogo.confronto, dataCurta(r.jogo.data)].filter(Boolean).join(", "))
      );
    });
  return itens.length ? h("ul", { class: "lista-simples" }, itens) : h("p", { class: "nota" }, "Sem recordes para mostrar.");
}

function graficoPontos(jogos, media) {
  const largura = 600;
  const altura = 140;
  const topo = 12;
  const base = altura - 18;
  const maximo = Math.max(10, ...jogos.map((g) => g.pts));
  const passo = largura / Math.max(jogos.length, 1);
  const barra = Math.max(3, passo * 0.7);
  const y = (v) => base - ((base - topo) * v) / maximo;
  const svg = s("svg", { class: "grafico", viewBox: `0 0 ${largura} ${altura}`, role: "img", "aria-label": `Pontos em cada um dos ${jogos.length} jogos` });
  jogos.forEach((g, i) => {
    const x = i * passo + (passo - barra) / 2;
    svg.append(
      s(
        "rect",
        { class: `barra-pts${g.resultado === "L" ? " derrota" : ""}`, x, y: y(g.pts), width: barra, height: Math.max(1, base - y(g.pts)), rx: 2 },
        s("title", null, `${dataCurta(g.data)} ${g.confronto}: ${g.pts} pontos`)
      )
    );
  });
  if (media) svg.append(s("line", { class: "linha-media", x1: 0, x2: largura, y1: y(media), y2: y(media) }));
  svg.append(s("text", { x: 0, y: altura - 4 }, jogos.length ? dataCurta(jogos[0].data) : ""));
  svg.append(s("text", { x: largura, y: altura - 4, "text-anchor": "end" }, jogos.length ? dataCurta(jogos[jogos.length - 1].data) : ""));
  svg.append(s("text", { x: largura, y: Math.max(10, y(media) - 4), "text-anchor": "end" }, `média ${num(media)}`));
  return h("div", null, svg, h("p", { class: "nota" }, "Barras cinza são derrotas do time. A linha tracejada é a média."));
}

const COLUNAS_CARREIRA = [
  ["min", "MIN"],
  ["pts", "PTS"],
  ["reb", "REB"],
  ["ast", "AST"],
  ["stl", "ROB"],
  ["blk", "TOC"],
  ["tov", "TO"],
];

async function nbaPainelCarreira(area, ativo, id, contexto, sub) {
  const c = await api(`/jogadores/${id}/carreira`);
  if (!ativo()) return;
  const p = c.perfil;
  if (p && sub) sub.textContent = [p.time, p.posicao, p.camisa ? `#${p.camisa}` : null].filter(Boolean).join(", ") || sub.textContent;

  let fase = "regular";
  let modo = "media";
  const tabelaArea = h("div");

  function desenharTabela() {
    const dados = c.carreira[fase];
    if (!dados.temporadas.length) {
      tabelaArea.replaceChildren(h("p", { class: "nota" }, fase === "playoffs" ? "Nunca jogou playoffs." : "Sem temporadas registradas."));
      return;
    }
    const valor = (l, campo) => (modo === "media" ? num(l.gp ? l[campo] / l.gp : 0) : (l[campo] ?? 0).toLocaleString("pt-BR"));
    const colunas = [
      { chave: "temporada", nome: "Temporada", esq: true, valor: (l) => l.temporada },
      { chave: "times", nome: "Time", esq: true, valor: (l) => (l.times || []).join(", ") },
      { chave: "idade", nome: "Idade", valor: (l) => l.idade ?? "" },
      { chave: "gp", nome: "J", titulo: "Jogos", valor: (l) => l.gp },
      { chave: "gs", nome: "JT", titulo: "Jogos como titular", valor: (l) => l.gs },
      ...COLUNAS_CARREIRA.map(([campo, nome]) => ({ chave: campo, nome, destaque: campo === "pts", valor: (l) => valor(l, campo) })),
      { chave: "fg", nome: "FG%", valor: (l) => pct(l.fgm, l.fga) },
      { chave: "tres", nome: "3P%", valor: (l) => pct(l.fg3m, l.fg3a) },
      { chave: "ll", nome: "LL%", valor: (l) => pct(l.ftm, l.fta) },
    ];
    const t = dados.total;
    const rodape = t
      ? {
          temporada: "Carreira",
          gp: t.gp,
          gs: t.gs,
          ...Object.fromEntries(COLUNAS_CARREIRA.map(([campo]) => [campo, valor(t, campo)])),
          fg: pct(t.fgm, t.fga),
          tres: pct(t.fg3m, t.fg3a),
          ll: pct(t.ftm, t.fta),
        }
      : null;
    tabelaArea.replaceChildren(tabela(colunas, dados.temporadas, { rodape }));
  }

  const controles = h("div", { class: "controles" });
  function desenharControles() {
    controles.replaceChildren(
      alternar(
        [
          ["regular", "Temporada regular"],
          ["playoffs", "Playoffs"],
        ],
        fase,
        (v) => {
          fase = v;
          desenharControles();
          desenharTabela();
        },
        "Fase"
      ),
      alternar(
        [
          ["media", "Médias"],
          ["total", "Totais"],
        ],
        modo,
        (v) => {
          modo = v;
          desenharControles();
          desenharTabela();
        },
        "Mostrar"
      )
    );
  }
  desenharControles();
  desenharTabela();

  const blocos = [];
  if (p) {
    const fatos = [
      ["Idade", p.idade ? `${p.idade} anos` : null],
      ["Nascimento", p.nascimento ? dataCurta(p.nascimento) : null],
      ["Altura", p.altura_cm ? `${num(p.altura_cm / 100, 2)} m` : null],
      ["Peso", p.peso_kg ? `${p.peso_kg} kg` : null],
      ["País", p.pais],
      ["Posição", p.posicao],
      ["Draft", p.draft],
      ["Formação", p.formacao],
      ["Na NBA", p.desde ? `${p.desde} a ${p.ativo ? "hoje" : p.ate}` : null],
    ].filter(([, v]) => v);
    blocos.push(
      h(
        "dl",
        { class: "fatos" },
        fatos.map(([rotulo, valor]) => h("div", { class: "fato" }, h("dt", null, rotulo), h("dd", null, valor))),
        p.lista_75 ? h("div", { class: "fato" }, h("dt", null, "Homenagem"), h("dd", null, "Entre os 75 maiores da NBA")) : null
      )
    );
  }
  if (c.premios && c.premios.length) {
    blocos.push(
      secao(
        "Prêmios",
        h(
          "div",
          { class: "premios" },
          c.premios.map((pr) =>
            h("span", { class: "premio", title: pr.temporadas.join(", ") }, pr.vezes > 1 ? h("strong", null, `${pr.vezes}×`) : null, pr.nome)
          )
        )
      )
    );
  }
  blocos.push(secao("Números da carreira", controles, tabelaArea));
  if (c.recordes && c.recordes.recordes) {
    blocos.push(
      secao(
        "Recordes da carreira (temporada regular)",
        listaRecordes(c.recordes.recordes, {
          pts: "Pontos",
          reb: "Rebotes",
          ast: "Assistências",
          stl: "Roubos",
          blk: "Tocos",
          tres: "Bolas de três",
          fgm: "Arremessos de quadra",
          ftm: "Lances livres",
        })
      )
    );
  }
  if (c.falhas && c.falhas.length) blocos.push(h("p", { class: "nota", style: { padding: "0 14px" } }, "Parte do perfil não carregou agora. Tente de novo em alguns minutos."));
  area.replaceChildren(...blocos);
}

async function nbaPainelArremessos(area, ativo, id, contexto) {
  const r = await api(`/jogos/${contexto.jogo}/arremessos/${id}`);
  if (!ativo()) return;
  const lista = r.arremessos;
  if (!lista.length) {
    area.replaceChildren(vazio("Nenhum arremesso de quadra neste jogo."));
    return;
  }
  const feitos = lista.filter((a) => a.feito).length;
  const de3 = lista.filter((a) => a.tipo === "3pt");
  const feitos3 = de3.filter((a) => a.feito).length;
  area.replaceChildren(
    secao(
      `${feitos} de ${lista.length} arremessos (${pct(feitos, lista.length)}%)`,
      h("p", { class: "nota" }, `Bolas de três: ${feitos3} de ${de3.length}. Bolinha verde é acerto, X vermelho é erro.`),
      quadraSVG(lista)
    )
  );
}

function quadraSVG(arremessos) {
  const svg = s("svg", { class: "quadra", viewBox: "-250 -52.5 500 470", role: "img", "aria-label": `Mapa com ${arremessos.length} arremessos` });
  svg.append(
    s(
      "g",
      { class: "linhas" },
      s("rect", { x: -250, y: -47.5, width: 500, height: 470 }),
      s("rect", { x: -80, y: -47.5, width: 160, height: 190 }),
      s("rect", { x: -60, y: -47.5, width: 120, height: 190 }),
      s("circle", { cx: 0, cy: 142.5, r: 60 }),
      s("line", { x1: -30, y1: -7.5, x2: 30, y2: -7.5 }),
      s("circle", { cx: 0, cy: 0, r: 7.5 }),
      s("path", { d: "M -40 0 A 40 40 0 0 0 40 0" }),
      s("line", { x1: -220, y1: -47.5, x2: -220, y2: 92.5 }),
      s("line", { x1: 220, y1: -47.5, x2: 220, y2: 92.5 }),
      s("path", { d: "M -220 92.5 A 237.5 237.5 0 0 0 220 92.5" })
    )
  );
  for (const a of arremessos) {
    const titulo = s(
      "title",
      null,
      `${a.feito ? "Acerto" : "Erro"}, ${a.tipo === "3pt" ? "3 pontos" : "2 pontos"}, ${a.distancia ?? "?"} pés, ${a.periodo}º quarto ${a.relogio || ""}`
    );
    if (a.feito) svg.append(s("circle", { class: "acerto", cx: a.x, cy: a.y, r: 7 }, titulo));
    else svg.append(s("path", { class: "erro-arremesso", d: `M ${a.x - 6} ${a.y - 6} L ${a.x + 6} ${a.y + 6} M ${a.x + 6} ${a.y - 6} L ${a.x - 6} ${a.y + 6}` }, titulo));
  }
  return svg;
}

/* ---------- Classificação ---------- */

async function nbaClassificacao() {
  const tk = novoTokenLista();
  let c;
  try {
    c = await api("/classificacao");
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, nbaClassificacao));
    return;
  }
  if (tk !== S.tkLista) return;
  const corZona = (pos) => (pos <= 6 ? "var(--vitoria)" : pos <= 10 ? "var(--empate)" : null);
  const tabelaConf = (nome, times) =>
    cartao(
      `Conferência ${nome}`,
      tabela(
        [
          { nome: "#", valor: (t) => h("span", { class: "posicao" }, t.posicao) },
          { nome: "Time", esq: true, valor: (t) => h("span", { class: "time-celula" }, imgLogo(nbaLogo(t.time_id)), t.time) },
          { nome: "V", valor: (t) => t.vitorias },
          { nome: "D", valor: (t) => t.derrotas },
          { nome: "%", valor: (t) => num(t.aproveitamento * 100, 1) },
          { nome: "Atrás", titulo: "Jogos atrás do líder", valor: (t) => (t.atras ? num(t.atras, 1) : "–") },
          { nome: "Casa", valor: (t) => t.casa || "" },
          { nome: "Fora", valor: (t) => t.fora || "" },
          { nome: "Últ. 10", valor: (t) => t.ultimos10 || "" },
          { nome: "Seq.", titulo: "Sequência atual", valor: (t) => (t.sequencia || "").replace("W", "V ").replace("L", "D ") },
        ],
        times.map((t) => ({ ...t, _cor: corZona(t.posicao) })),
        { classeLinha: (t) => (t._cor ? "zona" : null) }
      ),
      h(
        "div",
        { class: "legenda" },
        h("span", { style: { "--cor-zona": "var(--vitoria)" } }, h("i"), "Playoffs"),
        h("span", { style: { "--cor-zona": "var(--empate)" } }, h("i"), "Play-in")
      )
    );
  lista().replaceChildren(h("div", { class: "grade-cartoes", style: { gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))" } }, tabelaConf("Leste", c.Leste), tabelaConf("Oeste", c.Oeste)));
}

/* ---------- Líderes ---------- */

async function nbaLideres() {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando());
  let l;
  try {
    l = await api(`/lideres?modo=${NBA.modoLideres}`);
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, nbaLideres));
    return;
  }
  if (tk !== S.tkLista) return;
  const controles = h(
    "div",
    { class: "controles" },
    alternar(
      [
        ["media", "Por jogo"],
        ["total", "Total na temporada"],
      ],
      NBA.modoLideres,
      (v) => {
        NBA.modoLideres = v;
        nbaLideres();
      },
      "Mostrar"
    ),
    h(
      "span",
      { class: "nota", style: { margin: 0 } },
      l.modo === "media"
        ? `Por jogo: mínimo de ${l.minimo_jogos} jogos (70% dos ${l.jogos_da_liga} da liga). Percentuais usam o mínimo de acertos da NBA.`
        : "Totais: todos os jogadores. Percentuais usam o mínimo de acertos da NBA."
    )
  );
  const cartoes = l.categorias.map((cat) =>
    cartao(
      cat.rotulo,
      cat.jogadores.length
        ? h(
            "ol",
            { class: "ranking" },
            cat.jogadores.map((j) =>
              h(
                "li",
                null,
                h("span", { class: "lugar" }, j.posicao),
                h(
                  "span",
                  null,
                  h("button", { class: "botao-link", type: "button", onclick: () => abrirJogadorNBA(j.id, j.nome, { sigla: j.time }) }, j.nome),
                  h("div", { class: "sub" }, [j.time, `${j.jogos} jogos`, j.extra].filter(Boolean).join(", "))
                ),
                h("span", { class: "valor" }, cat.percentual ? `${num(j.valor)}%` : l.modo === "media" ? num(j.valor) : j.valor.toLocaleString("pt-BR"))
              )
            )
          )
        : h("p", { class: "nota" }, "Ninguém atingiu o mínimo ainda.")
    )
  );
  lista().replaceChildren(controles, h("div", { class: "grade-cartoes" }, cartoes));
}

/* ---------- Corridas do MVP e do calouro ---------- */

async function nbaCorridas() {
  const tk = novoTokenLista();
  let c;
  try {
    c = await api("/corridas");
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, nbaCorridas));
    return;
  }
  if (tk !== S.tkLista) return;
  const seta = { subiu: "▲", desceu: "▼", igual: "=", novo: "novo" };
  const bloco = (titulo, ladder) =>
    cartao(
      titulo,
      ladder.ranking.length
        ? [
            h("p", { class: "nota", style: { marginTop: 0 } }, `Edição de ${dataCurta(ladder.data)}`),
            h(
              "ol",
              { class: "ranking" },
              ladder.ranking.map((r) =>
                h(
                  "li",
                  null,
                  h("span", { class: "lugar" }, r.posicao),
                  h(
                    "span",
                    null,
                    h("button", { class: "botao-link", type: "button", onclick: () => abrirJogadorPorNome(r.nome) }, r.nome),
                    h("div", { class: "sub" }, [r.time, r.stats].filter(Boolean).join(", "))
                  ),
                  r.movimento
                    ? h(
                        "span",
                        { class: `movimento ${r.movimento}`, title: r.anterior ? `Na semana passada: ${r.anterior}º` : "Estreia no ranking" },
                        seta[r.movimento],
                        r.anterior && r.movimento !== "igual" ? ` ${r.anterior}º` : ""
                      )
                    : h("span")
                )
              )
            ),
            h("p", { class: "nota" }, h("a", { href: ladder.url, target: "_blank", rel: "noopener" }, "Ler a análise completa no NBA.com")),
          ]
        : [
            h("p", { class: "nota" }, "O ranking desta temporada ainda não saiu."),
            h("p", { class: "nota" }, h("a", { href: ladder.pagina, target: "_blank", rel: "noopener" }, "Ver a página no NBA.com")),
          ]
    );
  lista().replaceChildren(
    h("div", { class: "grade-cartoes", style: { gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" } }, bloco("Corrida pelo MVP", c.mvp), bloco("Corrida pelo calouro do ano", c.roy))
  );
}

/* ---------- Busca de jogadores ---------- */

function nbaJogadores() {
  novoTokenLista();
  const resultados = h("div");
  const campo = h("input", {
    class: "busca",
    type: "search",
    placeholder: "Nome do jogador (atuais e aposentados)",
    "aria-label": "Procurar jogador",
    value: NBA.busca,
    autocomplete: "off",
  });
  let espera;
  const procurar = async () => {
    const texto = campo.value.trim();
    NBA.busca = texto;
    if (texto.length < 2) {
      resultados.replaceChildren(h("p", { class: "nota" }, "Digite pelo menos duas letras. A busca cobre toda a história da NBA."));
      return;
    }
    const tk = novoTokenLista();
    resultados.replaceChildren(carregando("Procurando…"));
    try {
      const achados = await api(`/jogadores/busca?q=${encodeURIComponent(texto)}`);
      if (tk !== S.tkLista) return;
      resultados.replaceChildren(
        achados.length
          ? h(
              "div",
              { class: "cartao" },
              achados.map((p) =>
                h(
                  "button",
                  { class: "resultado-busca", type: "button", onclick: () => abrirJogadorNBA(p.id, p.nome, { aba: p.ativo ? "temporada" : "carreira" }) },
                  h("span", { style: { fontWeight: 600 } }, p.nome),
                  h("span", { class: "selo" }, p.ativo ? "Em atividade" : "Aposentado")
                )
              )
            )
          : vazio("Nenhum jogador com esse nome.")
      );
    } catch (erro) {
      if (tk === S.tkLista) resultados.replaceChildren(caixaErro(erro, procurar));
    }
  };
  campo.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(procurar, 250);
  });
  lista().replaceChildren(h("div", { style: { maxWidth: "680px" } }, campo, h("div", { style: { marginTop: "12px" } }, resultados)));
  procurar();
  campo.focus();
}
