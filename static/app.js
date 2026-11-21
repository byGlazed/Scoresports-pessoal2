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
  filtro: "todos",
  timers: {},
  abaDetalhe: {},
};

const MODULOS = {};

function registrarModulo(tipo, modulo) {
  MODULOS[tipo] = modulo;
}

// as telas desenham na página do topo (navegacao.js)
const lista = () => Navegacao.alvo();
const detalhe = () => Navegacao.alvo();

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

function marcarAtual(raiz, id) {
  raiz.querySelectorAll("[data-id]").forEach((el) => {
    if (el.dataset.id === String(id)) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
}

/* ---------- Favoritos (guardados no navegador) ---------- */

const Favoritos = {
  lista() {
    try {
      const l = JSON.parse(lembrar("favoritos") || "[]");
      return Array.isArray(l) ? l : [];
    } catch (_) {
      return [];
    }
  },
  chave(f) {
    return `${f.tipo}:${f.esporte}:${f.id}`;
  },
  tem(f) {
    const k = this.chave(f);
    return this.lista().some((x) => this.chave(x) === k);
  },
  alternar(f) {
    const k = this.chave(f);
    const atual = this.lista();
    const novo = atual.some((x) => this.chave(x) === k) ? atual.filter((x) => this.chave(x) !== k) : [...atual, { ...f, salvo_em: Date.now() }];
    guardar("favoritos", JSON.stringify(novo));
    this.avisar();
    return novo.some((x) => this.chave(x) === k);
  },
  remover(f) {
    const k = this.chave(f);
    guardar("favoritos", JSON.stringify(this.lista().filter((x) => this.chave(x) !== k)));
    this.avisar();
  },
  avisar() {
    // a aba Favoritos mostra os favoritos: desenha de novo quando ela reaparecer
    if (typeof Navegacao !== "undefined" && Navegacao.pilhas) Navegacao.invalidar("favoritos");
  },
};

const ROTULO_FAVORITO = { time: "time", jogador: "jogador", liga: "competição" };

const CAMINHO_ESTRELA = "M12 2.6l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.41l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94z";

function iconeEstrela() {
  return s("svg", { class: "estrela-icone", viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: CAMINHO_ESTRELA }));
}

/** Estrela para favoritar. `item` = {tipo: 'time'|'jogador'|'liga', esporte, liga, id, nome, logo?, time_id?}. */
function botaoFavorito(item, { comTexto = false } = {}) {
  if (!item || item.id === undefined || item.id === null || item.id === "") return null;
  const rotulo = ROTULO_FAVORITO[item.tipo] || "item";
  const texto = h("span", { class: "estrela-texto" });
  const botao = h("button", { class: `estrela${comTexto ? " com-texto" : ""}`, type: "button" }, iconeEstrela(), comTexto ? texto : null);
  const pintar = () => {
    const ativo = Favoritos.tem(item);
    botao.setAttribute("aria-pressed", String(ativo));
    botao.setAttribute("aria-label", `${ativo ? "Tirar dos" : "Pôr nos"} favoritos: ${item.nome}`);
    botao.title = ativo ? `Tirar ${rotulo} dos favoritos` : `Favoritar ${rotulo}`;
    texto.textContent = ativo ? "Favorito" : "Favoritar";
  };
  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    const ativo = Favoritos.alternar(item);
    pintar();
    if (ativo) {
      // pequena animação ao marcar (reinicia se clicar de novo)
      botao.classList.remove("acabou-de-marcar");
      void botao.offsetWidth;
      botao.classList.add("acabou-de-marcar");
    }
  });
  pintar();
  return botao;
}

/* ---------- Nota do Scoresports (notas_regras.js) ---------- */

/** Selo colorido da nota; nada quando o jogador não tem nota. */
function seloNota(n, casas = 1) {
  const cor = Notas.corDaNota(n);
  if (!cor) return null;
  return h("span", { class: `selo-nota nota-${cor}`, title: "Nota do Scoresports" }, Notas.formatar(n, casas));
}

/** Botão ⓘ que explica de onde vem a nota (abre e fecha um balão). */
function botaoInfoNota() {
  const balao = h("span", { class: "info-nota-balao", role: "note", hidden: true }, Notas.TEXTO_INFO);
  const botao = h(
    "button",
    {
      class: "info-nota-botao",
      type: "button",
      "aria-label": "Sobre a nota",
      "aria-expanded": "false",
      onclick: (e) => {
        e.stopPropagation();
        balao.hidden = !balao.hidden;
        botao.setAttribute("aria-expanded", String(!balao.hidden));
      },
    },
    h("span", { class: "info-nota-i", "aria-hidden": "true" }, "i")
  );
  return h("span", { class: "info-nota" }, botao, balao);
}

/* ---------- Últimos campeões (campeoes.json) ---------- */

let CAMPEOES = null;

async function campeoesDe(chave) {
  if (!CAMPEOES) {
    try {
      CAMPEOES = await api("/campeoes");
    } catch (_) {
      CAMPEOES = {};
    }
  }
  return CAMPEOES[chave] || [];
}

/** Lista dos últimos campeões; some sozinha se a competição não tiver dados. */
function listaCampeoes(chave) {
  const caixa = h("div", { class: "campeoes" }, carregando());
  campeoesDe(chave).then((lista) => {
    if (!lista.length) {
      caixa.remove();
      return;
    }
    caixa.replaceChildren(
      h("p", { class: "nota", style: { fontWeight: 600, marginTop: "4px" } }, "Últimos campeões"),
      h(
        "ul",
        { class: "lista-simples" },
        lista.map((c) =>
          h(
            "li",
            null,
            h("span", { class: "sub" }, c.temporada),
            h("span", { style: { textAlign: "right" } }, h("strong", null, c.campeao), c.vice ? h("span", { class: "sub" }, ` sobre ${c.vice}`) : c.extra ? h("span", { class: "sub" }, `, ${c.extra}`) : null)
          )
        )
      )
    );
  });
  return caixa;
}

function cartaoCampeoes(chave) {
  const corpo = listaCampeoes(chave);
  const card = cartao(null, corpo);
  // se não houver campeões, o cartão inteiro some
  new MutationObserver((_, obs) => {
    if (!card.contains(corpo)) {
      card.remove();
      obs.disconnect();
    }
  }).observe(card, { childList: true, subtree: true });
  return card;
}

/* ---------- Pedaços de interface ---------- */

/** O esqueleto (skeleton) no lugar do "Carregando…": blocos no formato do que vai chegar (lista de jogos, placar
    da partida, perfil, linhas, campinho). Só aparece depois de 150 ms (CSS): com o dado guardado, nada pisca.
    O texto fica para o leitor de tela. */
function esqueleto(tipo = "lista", texto = "Carregando…", conhecido = null) {
  const barra = (classe) => h("i", { class: `esq-barra ${classe}` });
  const linhaJogo = () => h("div", { class: "esq-jogo" }, barra("esq-hora"), h("div", { class: "esq-times" }, barra("esq-linha"), barra("esq-linha esq-curta")), barra("esq-placar"));
  const cartaoJogos = (n) => h("div", { class: "esq-cartao" }, h("div", { class: "esq-cabeca" }, barra("esq-escudo-p"), barra("esq-titulo")), ...Array.from({ length: n }, linhaJogo));
  const linhas = (n) => h("div", { class: "esq-cartao esq-linhas" }, ...Array.from({ length: n }, (_, i) => barra(i % 3 === 2 ? "esq-linha esq-curta" : "esq-linha")));
  let miolo;
  if (tipo === "partida") {
    miolo = [
      h("div", { class: "esq-cartao esq-placar-grande" }, h("div", { class: "esq-lado" }, barra("esq-escudo"), barra("esq-linha esq-curta")), barra("esq-numero"), h("div", { class: "esq-lado" }, barra("esq-escudo"), barra("esq-linha esq-curta"))),
      h("div", { class: "esq-abas" }, barra("esq-aba"), barra("esq-aba"), barra("esq-aba")),
      linhas(5),
    ];
  } else if (tipo === "perfil") {
    // com o nome conhecido (veio da lista, do campinho, da pesquisa), ele aparece na hora no lugar da barra
    const nome = conhecido && conhecido.nome ? h("strong", { class: "esq-nome" }, conhecido.nome) : barra("esq-linha");
    miolo = [h("div", { class: "esq-cartao esq-perfil" }, barra("esq-escudo esq-grande"), h("div", { class: "esq-times" }, nome, barra("esq-linha esq-curta"))), h("div", { class: "esq-abas" }, barra("esq-aba"), barra("esq-aba"), barra("esq-aba")), linhas(6)];
  } else if (tipo === "linhas") miolo = linhas(3);
  else if (tipo === "grupo") miolo = cartaoJogos(2);
  else if (tipo === "campinho") miolo = h("div", { class: "esq-barra esq-campo" });
  else miolo = [cartaoJogos(3), cartaoJogos(2)];
  return h("div", { class: `esqueleto esqueleto-${tipo}`, role: "status" }, h("span", { class: "visualmente-oculto" }, texto), miolo);
}

/** Compatível com as telas antigas: o esqueleto de uma lista; com um texto próprio ("Procurando…"), o de linhas. */
function carregando(texto = "Carregando…") {
  return esqueleto(texto === "Carregando…" ? "lista" : "linhas", texto);
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
    // o escudo da ESPN no tamanho em que aparece (o original tem 500 px e ~110 KB)
    src: Visual.imagemPequena(src, /perfil-foto/.test(classe) ? 160 : 64),
    alt: "",
    loading: "lazy",
    onerror: (e) => e.target.replaceWith(h("span", { class: "logo-vazio", "aria-hidden": "true" })),
  });
}

function imgBandeira(src, pais) {
  return src ? h("img", { class: "bandeira", src, alt: pais || "", title: pais || null, loading: "lazy" }) : null;
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

const formatoSemana = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });

/** Faixa de dias (como no Sofascore): dois dias para cada lado, setas e calendário. */
function barraData({ data, anterior, proximo, hoje, min, max, aoMudar, temJogo }) {
  const dias = [-2, -1, 0, 1, 2].map((n) => somarDias(data, n));
  const rotulo = (d) => {
    if (d === hoje) return "Hoje";
    if (d === somarDias(hoje, -1)) return "Ontem";
    // amanhã aparece pelo dia da semana: "Amanhã" não cabe na coluna com a letra do celular aumentada
    return formatoSemana.format(meioDia(d)).replace(".", "");
  };
  const calendario = h("input", {
    type: "date",
    value: data,
    min: min || null,
    max: max || null,
    "aria-label": "Escolher a data no calendário",
    onchange: (e) => e.target.value && aoMudar(e.target.value),
    onclick: (e) => {
      // abre o calendário do navegador direto, sem precisar acertar o ícone
      try {
        e.target.showPicker();
      } catch (_) {
        /* navegador sem showPicker: o clique normal já serve */
      }
    },
  });
  return h(
    "div",
    { class: "faixa-datas" },
    h("button", { class: "seta", type: "button", "aria-label": "Dia anterior", disabled: !anterior, onclick: () => aoMudar(anterior) }, "‹"),
    h(
      "div",
      { class: "dias", role: "group", "aria-label": "Dias" },
      dias.map((d) =>
        h(
          "button",
          {
            class: `dia${d === data ? " ativo" : ""}${temJogo && !temJogo(d) ? " sem-jogo" : ""}`,
            type: "button",
            "aria-pressed": String(d === data),
            disabled: (min && d < min) || (max && d > max) ? true : null,
            onclick: () => aoMudar(d),
          },
          h("span", { class: "dia-semana" }, rotulo(d)),
          h("span", { class: "dia-num" }, `${d.slice(8, 10)}/${d.slice(5, 7)}`)
        )
      )
    ),
    h("button", { class: "seta", type: "button", "aria-label": "Próximo dia", disabled: !proximo, onclick: () => aoMudar(proximo) }, "›"),
    h(
      "label",
      { class: "calendario", title: "Escolher no calendário" },
      s("svg", { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": "true" },
        s("rect", { x: 3, y: 5, width: 18, height: 16, rx: 2, fill: "none", stroke: "currentColor", "stroke-width": 2 }),
        s("path", { d: "M3 10h18M8 3v4M16 3v4", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" })
      ),
      calendario
    )
  );
}

/* ---------- Filtro de jogos (como no Flashscore) ---------- */

const FILTROS = [
  ["todos", "Todos"],
  ["ao-vivo", "Ao vivo"],
  ["encerrados", "Encerrados"],
  ["proximos", "Próximos"],
];

function passaFiltro(jogo) {
  const f = S.filtro || "todos";
  if (f === "ao-vivo") return jogo.estado === 2;
  if (f === "encerrados") return jogo.estado === 3;
  if (f === "proximos") return jogo.estado === 1;
  return true;
}

/** Abas Todos / Ao vivo / Encerrados / Próximos com a contagem de cada uma. */
function barraFiltro(jogos, aoMudar) {
  const conta = {
    todos: jogos.length,
    "ao-vivo": jogos.filter((j) => j.estado === 2).length,
    encerrados: jogos.filter((j) => j.estado === 3).length,
    proximos: jogos.filter((j) => j.estado === 1).length,
  };
  return h(
    "div",
    { class: "filtro-jogos", role: "group", "aria-label": "Filtrar jogos" },
    FILTROS.map(([id, nome]) =>
      h(
        "button",
        {
          class: `filtro${id === "ao-vivo" && conta[id] ? " com-ao-vivo" : ""}`,
          type: "button",
          "aria-pressed": String((S.filtro || "todos") === id),
          onclick: () => {
            S.filtro = id;
            aoMudar();
          },
        },
        nome,
        h("span", { class: "contagem" }, conta[id])
      )
    )
  );
}

/** Cabeçalho de um grupo de jogos (competição), com logo, atalho e estrela. */
/** Grupos recolhidos na lista do dia (a escolha fica guardada no aparelho, pelo título). */
function gruposRecolhidos() {
  try {
    return new Set(JSON.parse(localStorage.getItem("ss:recolhidos") || "[]"));
  } catch (_) {
    return new Set();
  }
}

/** chave: o que identifica o grupo entre esportes ("futebol:bra.1"); o título só aparece no rótulo. */
function botaoRecolher(titulo, chave = titulo) {
  const seta = s("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true" }, s("path", { d: "M6 15l6-6 6 6", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" }));
  const botao = h("button", { class: "recolher-grupo", type: "button", "aria-label": `Recolher ${titulo}`, "aria-expanded": "true" }, seta);
  const aplicar = (recolhido) => {
    const secaoGrupo = botao.closest("section");
    if (secaoGrupo) secaoGrupo.classList.toggle("recolhido", recolhido);
    botao.setAttribute("aria-expanded", String(!recolhido));
    botao.setAttribute("aria-label", `${recolhido ? "Mostrar" : "Recolher"} ${titulo}`);
  };
  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    const conjunto = gruposRecolhidos();
    if (conjunto.has(chave)) conjunto.delete(chave);
    else conjunto.add(chave);
    try {
      localStorage.setItem("ss:recolhidos", JSON.stringify([...conjunto]));
    } catch (_) {
      /* sem localStorage: vale só nesta tela */
    }
    aplicar(conjunto.has(chave));
  });
  queueMicrotask(() => aplicar(gruposRecolhidos().has(chave)));
  return botao;
}

function cabecaGrupo({ titulo, logo, aoClicar, favorito, sub, jogos, chave }) {
  const vivos = jogos ? jogos.filter((j) => j.estado === 2).length : 0;
  const contador = jogos && jogos.length
    ? h("span", { class: `contador-grupo${vivos ? " ao-vivo" : ""}`, title: vivos ? `${vivos} ao vivo de ${jogos.length}` : `${jogos.length} jogos` }, vivos ? `${vivos}/${jogos.length}` : String(jogos.length))
    : null;
  return h(
    "div",
    { class: "grupo-liga-titulo" },
    logo !== undefined ? imgLogo(logo) : null,
    aoClicar
      ? h(
          "button",
          { class: "botao-link abre-liga", type: "button", onclick: aoClicar },
          titulo,
          s("svg", { viewBox: "0 0 24 24", width: "14", height: "14", "aria-hidden": "true" }, s("path", { d: "M9 5l7 7-7 7", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" }))
        )
      : h("span", null, titulo),
    sub ? h("span", { class: "nota", style: { margin: 0 } }, sub) : null,
    h("span", { style: { flex: 1 } }),
    contador,
    favorito ? botaoFavorito(favorito) : null,
    jogos && jogos.length ? botaoRecolher(titulo, chave || titulo) : null
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

function iconeTv() {
  return s(
    "svg",
    { viewBox: "0 0 24 24", width: 12, height: 12, "aria-hidden": "true" },
    s("rect", { x: 2, y: 5, width: 20, height: 13, rx: 2, fill: "none", stroke: "currentColor", "stroke-width": 2.2 }),
    s("path", { d: "M8 21h8", stroke: "currentColor", "stroke-width": 2.2, "stroke-linecap": "round" })
  );
}

function canalNaLista(t, mostrarPadrao = true) {
  if (!t || !t.canais || !t.canais.length) return null;
  if (!t.confirmado && !mostrarPadrao) return null;
  const visiveis = t.canais.slice(0, 2).join(", ");
  const extra = t.canais.length > 2 ? ` +${t.canais.length - 2}` : "";
  return h(
    "div",
    { class: `jogo-canal${t.confirmado ? " confirmado" : ""}`, title: `${t.confirmado ? "Grade confirmada" : "Padrão da competição"}: ${t.canais.join(", ")}` },
    iconeTv(),
    h("span", null, visiveis + extra)
  );
}

/* ---------- Folha que sobe de baixo (o jogador na partida, como no Sofascore) ----------
   Uma por vez: abrir de novo só troca o conteúdo (o carrossel dos outros jogadores). Fecha no ×, tocando
   fora, no Esc e no botão voltar (do celular e do navegador: navegacao.js pergunta antes de voltar a página). */
const Folha = {
  atual: null,

  abrir(conteudo, rotulo) {
    if (!this.atual) {
      const painel = h("section", { class: "folha", role: "dialog", "aria-modal": "true", tabindex: "-1" });
      const fundo = h("div", { class: "folha-fundo", onclick: (e) => e.target === fundo && this.fechar() }, painel);
      this.aoTecla = (e) => e.key === "Escape" && this.fechar();
      document.addEventListener("keydown", this.aoTecla);
      document.body.append(fundo);
      document.body.classList.add("com-folha");
      this.atual = { fundo, painel, foco: document.activeElement };
      requestAnimationFrame(() => fundo.classList.add("aberta"));
    }
    const { painel } = this.atual;
    painel.setAttribute("aria-label", rotulo);
    painel.replaceChildren(h("div", { class: "folha-alca", "aria-hidden": "true" }), h("button", { class: "folha-fechar", type: "button", "aria-label": "Fechar", onclick: () => this.fechar() }, "×"), conteudo);
    painel.scrollTop = 0;
    painel.focus({ preventScroll: true });
  },

  /** Fecha a folha aberta; devolve true se havia uma (o voltar para nela e não troca de página). */
  fechar() {
    if (!this.atual) return false;
    const { fundo, foco } = this.atual;
    this.atual = null;
    document.removeEventListener("keydown", this.aoTecla);
    document.body.classList.remove("com-folha");
    fundo.remove();
    if (foco && foco.isConnected && foco.focus) foco.focus({ preventScroll: true });
    return true;
  },
};

/** O conteúdo da folha de um jogador no jogo: topo (foto, nome, time, nota, "Ver perfil"), os números e o carrossel.
    jogador: { foto (elemento), nome, sub, nota, aoVerPerfil }; linhas: [rótulo, valor, recuada?]; outros: [{ foto, nome, nota, atual, aoTocar }]. */
function conteudoFolhaJogador({ jogador, linhas, extra, outros }) {
  const topo = h(
    "div",
    { class: "folha-topo" },
    h("div", { class: "folha-foto" }, jogador.foto),
    h("div", { class: "folha-quem" }, h("h2", { class: "folha-nome" }, jogador.nome), jogador.sub ? h("div", { class: "folha-sub" }, jogador.sub) : null),
    jogador.nota !== null && jogador.nota !== undefined ? h("div", { class: "folha-nota" }, seloNota(jogador.nota)) : null
  );
  const perfil = jogador.aoVerPerfil ? h("button", { class: "folha-perfil", type: "button", onclick: jogador.aoVerPerfil }, "Ver perfil") : null;
  const tabelaNumeros = h(
    "dl",
    { class: "folha-numeros" },
    linhas
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([rotulo, valor, recuada]) => h("div", { class: `folha-linha${recuada ? " recuada" : ""}` }, h("dt", null, rotulo), h("dd", null, String(valor))))
  );
  const carrossel = outros && outros.length > 1
    ? h(
        "div",
        { class: "folha-carrossel", role: "list", "aria-label": "Outros jogadores do jogo" },
        outros.map((o) =>
          h(
            "button",
            { class: "folha-outro", type: "button", role: "listitem", "aria-current": o.atual ? "true" : null, onclick: o.aoTocar },
            h("span", { class: "folha-outro-foto" }, o.foto),
            h("span", { class: "folha-outro-nome" }, o.nome),
            seloNota(o.nota)
          )
        )
      )
    : null;
  if (carrossel) requestAnimationFrame(() => { const a = carrossel.querySelector('[aria-current="true"]'); if (a) carrossel.scrollLeft = a.offsetLeft - (carrossel.clientWidth - a.offsetWidth) / 2; });
  return h("div", { class: "folha-conteudo" }, topo, perfil, h("h3", { class: "folha-titulo" }, "No jogo"), tabelaNumeros, extra || null, carrossel);
}

/** Uma linha de jogo na lista. `times` vem na ordem em que deve aparecer. */
function botaoJogo({ id, estado, status, statusCompleto, times, transmissao, mostrarPadrao, aoClicar, atual, aoPreparar, atualizando }) {
  // "atualizando": o jogo guardado já devia ter começado e o novo ainda não chegou — nem horário nem placar velho
  const aoVivo = estado === 2 && !atualizando;
  let preparado = false;
  return h(
    "button",
    {
      class: `jogo${aoVivo ? " ao-vivo" : ""}`,
      type: "button",
      dataset: { id: String(id) },
      "aria-current": atual ? "true" : null,
      onclick: aoClicar,
      // o pedido da página do jogo sai quando o dedo encosta, não quando ele solta (~100 ms antes)
      onpointerdown: aoPreparar
        ? () => {
            if (!preparado) {
              preparado = true;
              aoPreparar();
            }
          }
        : null,
    },
    atualizando
      ? h("div", { class: "jogo-status" }, h("span", { class: "esq-barra jogo-atualizando", role: "img", "aria-label": "Atualizando" }))
      : h(
          "div",
          { class: `jogo-status${aoVivo ? " ao-vivo" : ""}`, title: statusCompleto || null, "aria-label": statusCompleto || null },
          status.map((linha, i) => h("div", { class: i === 0 && estado === 1 && /^\d/.test(linha) ? "hora" : null }, linha))
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
          h("span", { class: "placar" }, atualizando ? "" : t.placar ?? "")
        )
      ),
      canalNaLista(transmissao, mostrarPadrao)
    )
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
      t.sub ? h("div", { class: "sub" }, t.sub) : null,
      t.gols && t.gols.length ? h("ul", { class: "placar-gols" }, t.gols.map((g) => h("li", null, g))) : null,
      t.favorito ? botaoFavorito(t.favorito) : null
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

/* ---------- Início ---------- */

async function iniciar() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      Navegacao.trocarAba("pesquisa");
    }
  });
  try {
    S.esportes = (await api("/esportes")).filter((e) => MODULOS[e.tipo]);
  } catch (erro) {
    $("#pagina").replaceChildren(caixaErro(erro, () => location.reload()));
    return;
  }
  Navegacao.iniciar();
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
const nbaFavTime = (t) => (t && t.time_id ? { tipo: "time", esporte: "nba", liga: "nba", id: String(t.time_id), nome: t.nome, logo: nbaLogo(t.time_id) } : null);
const nbaFoto = (id) => `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;

registrarModulo("nba", {
  abas: () => [
    { id: "classificacao", nome: "Classificação" },
    { id: "jogos", nome: "Jogos" },
    { id: "lideres", nome: "Líderes" },
    { id: "corridas", nome: "MVP e calouro" },
    { id: "jogadores", nome: "Jogadores" },
  ],
  desenhar(esp, aba) {
    if (aba === "jogos") return nbaJogos();
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
      NBA.conjuntoDatas = new Set(resposta.datas);
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
    temJogo: (d) => NBA.conjuntoDatas.has(d),
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

  const desenhar = () => {
    const visiveis = jogos.filter(passaFiltro);
    lista().replaceChildren(
      barra,
      barraFiltro(jogos, desenhar),
      visiveis.length
        ? h(
            "section",
            { class: "cartao grupo-liga" },
            cabecaGrupo({ titulo: "NBA", sub: dataLonga(NBA.data), favorito: { tipo: "liga", esporte: "nba", liga: "nba", id: "nba", nome: "NBA" } }),
            visiveis.map((j) => nbaLinhaJogo(j))
          )
        : vazio(jogos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo nesta data.")
    );
  };
  desenhar();

  const temAoVivo = jogos.some((j) => j.estado === 2);
  const hojeComJogo = NBA.data === NBA.hoje && jogos.some((j) => j.estado === 1);
  if (temAoVivo || hojeComJogo) agendar("lista", () => nbaDia(true), temAoVivo ? 20000 : 60000);
}

function nbaStatusLista(j) {
  if (j.estado === 1) return [hora(j.inicio) || "A definir"];
  if (j.estado === 2) return Visual.statusCurto(j.status || "Ao vivo");
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
  Navegacao.abrir({ tipo: "jogo", params: { esporte: "nba", liga: "nba", id: String(jogo.id) }, jogo });
}

/** Jogo da NBA aberto pelo endereço (sem o jogo da lista): o box score diz se já começou. */
async function nbaJogoPeloId(id, pagina) {
  let estado = 1;
  try {
    const box = await api(`/jogos/${id}/boxscore`);
    estado = box.estado || 1;
  } catch (_) {
    /* ainda sem box score: é pré-jogo */
  }
  pagina.jogo = { id, estado };
  return nbaMostrarJogo(pagina.jogo);
}

/** Desenha o jogo da NBA (site do PC) na página aberta: pré-jogo antes de começar, box score depois. */
function nbaMostrarJogo(jogo, silencioso = false) {
  if (jogo.estado === 1) return silencioso ? null : nbaPreJogo(jogo);
  return nbaBoxScore(jogo, silencioso);
}

/* ---------- Pré-jogo ---------- */

async function nbaPreJogo(jogo) {
  const tk = novoTokenDetalhe();
  detalhe().replaceChildren(esqueleto("partida", "Montando o pré-jogo…"));
  let pre;
  try {
    pre = await api(`/jogos/${jogo.id}/pre-jogo`);
  } catch (erro) {
    if (tk === S.tkDetalhe) detalhe().replaceChildren(caixaErro(erro, () => nbaPreJogo(jogo)));
    return;
  }
  if (tk !== S.tkDetalhe) return;

  const { fora, casa } = pre.jogo;
  const topo = h(
    "section",
    { class: "cartao" },
    placarGrande({
      esquerda: { nome: fora.nome, logo: nbaLogo(fora.time_id), sub: "Visitante", favorito: nbaFavTime(fora) },
      direita: { nome: casa.nome, logo: nbaLogo(casa.time_id), sub: "Mandante", favorito: nbaFavTime(casa) },
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
  detalhe().replaceChildren(...blocos);
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
  if (!silencioso) detalhe().replaceChildren(esqueleto("partida"));
  let box;
  try {
    box = await api(`/jogos/${jogo.id}/boxscore`);
  } catch (erro) {
    if (tk === S.tkDetalhe && !silencioso) detalhe().replaceChildren(caixaErro(erro, () => nbaBoxScore(jogo, false)));
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
      esquerda: { nome: box.fora.nome, logo: nbaLogo(box.fora.time_id), placar: box.fora.placar, favorito: nbaFavTime(box.fora) },
      direita: { nome: box.casa.nome, logo: nbaLogo(box.casa.time_id), placar: box.casa.placar, favorito: nbaFavTime(box.casa) },
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
  detalhe().replaceChildren(...blocos);

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
          h("button", { class: "botao-link", type: "button", onclick: () => abrirJogadorNBA(j.id, j.nome, { jogo: gameId, sigla: time.sigla, time_id: time.time_id }) }, j.nome),
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
  Navegacao.abrir({ tipo: "atleta", params: { esporte: "nba", liga: "nba", id: String(id) }, nome, contexto });
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
  const fav = { tipo: "jogador", esporte: "nba", liga: "nba", id: String(id), nome, time_id: contexto.time_id ? String(contexto.time_id) : null };
  const estrela = h("div", { class: "perfil-acoes" }, botaoFavorito(fav, { comTexto: true }));
  contexto.atualizarFavorito = (timeId) => {
    if (!timeId) return;
    fav.time_id = String(timeId);
    // se já é favorito, guarda o time para a aba Início achar os jogos dele
    if (Favoritos.tem(fav)) {
      Favoritos.remover(fav);
      Favoritos.alternar(fav);
    }
    estrela.replaceChildren(botaoFavorito(fav, { comTexto: true }));
  };
  const cabeca = h(
    "div",
    { class: "perfil" },
    h("img", { class: "perfil-foto", src: nbaFoto(id), alt: "", onerror: (e) => (e.target.style.visibility = "hidden") }),
    h("div", null, h("h3", { class: "perfil-nome" }, nome), sub, estrela)
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
  if (p && p.time_id && contexto.atualizarFavorito) contexto.atualizarFavorito(p.time_id);

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
      quadraSVG(lista.map((a) => ({ ...a, tres: a.tipo === "3pt" })))
    )
  );
}

// quadraSVG fica em nba_quadra.js (comum ao PC e ao app)

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
          {
            nome: "Time",
            esq: true,
            valor: (t) => h("span", { class: "time-celula" }, imgLogo(nbaLogo(t.time_id)), t.time, botaoFavorito(nbaFavTime({ time_id: t.time_id, nome: t.time }))),
          },
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
  lista().replaceChildren(
    h("div", { class: "grade-cartoes", style: { gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))" } }, tabelaConf("Leste", c.Leste), tabelaConf("Oeste", c.Oeste)),
    h("div", { style: { marginTop: "12px", maxWidth: "520px" } }, cartaoCampeoes("nba"))
  );
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
