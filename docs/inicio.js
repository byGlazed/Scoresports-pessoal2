"use strict";

/* =========================================================================
   Favoritos (jogos dos favoritos e a lista deles) e Pesquisa (jogadores, times e competições).
   Usa a base de app.js e as telas de esportes.js.
   ========================================================================= */

const NOME_ESPORTE = { nba: "NBA", futebol: "Futebol", nfl: "NFL", mlb: "MLB", nhl: "NHL", f1: "Fórmula 1", ufc: "UFC", boxe: "Boxe", esports: "E-sports" };

const esporteObj = (id) => S.esportes.find((e) => e.id === id);

/** Abre a página de uma competição (sem aba: a primeira, como no Sofascore). */
function abrirLiga(esporte, liga, aba) {
  irPara(esporte, aba, liga);
}

/* ---------- Aba Favoritos ---------- */

const INICIO = { data: null, chip: "todos" };

/** Os favoritos do chip escolhido ("todos" = todos). */
function favoritosDoChip() {
  const favs = Favoritos.lista();
  return INICIO.chip === "todos" ? favs : favs.filter((f) => f.esporte === INICIO.chip);
}

/** Chips: "Todos" e só os esportes em que há favorito. */
function chipsFavoritos() {
  const esportes = new Set(Favoritos.lista().map((f) => f.esporte));
  return Rotas.CHIPS_ESPORTE.filter(([id]) => id === "todos" || esportes.has(id));
}

function paginaFavoritos(corpo, p) {
  const area = h("div", { class: "area-favoritos" });
  p.alvo = area;
  const chips = chipsFavoritos();
  if (!chips.some(([id]) => id === INICIO.chip)) INICIO.chip = "todos";
  const barra = h("div", { class: "chips-esporte", role: "group", "aria-label": "Esportes dos favoritos" });
  const pintar = () =>
    barra.replaceChildren(
      ...chips.map(([id, nome]) =>
        h(
          "button",
          {
            class: "chip-esporte",
            type: "button",
            "aria-pressed": String(id === INICIO.chip),
            onclick: () => {
              if (id === INICIO.chip) return;
              INICIO.chip = id;
              pintar();
              cancelarTudo();
              inicioDesenhar(false);
            },
          },
          nome
        )
      )
    );
  pintar();
  // sem favoritos não há chips: só o convite
  corpo.replaceChildren(...(Favoritos.lista().length ? [barra] : []), area);
  return inicioDesenhar(false);
}

/** "Seus favoritos": a lista agrupada, com atalho e botão de tirar. */
function listaFavoritos(favs) {
  const grupos = [
    ["time", "Times"],
    ["jogador", "Jogadores"],
    ["liga", "Competições"],
  ];
  return h(
    "section",
    { class: "cartao seus-favoritos" },
    h("div", { class: "cartao-cabeca" }, h("h2", null, "Seus favoritos")),
    grupos
      .filter(([tipo]) => favs.some((f) => f.tipo === tipo))
      .map(([tipo, titulo]) =>
        h(
          "div",
          { class: "lateral-secao" },
          h("div", { class: "lateral-rotulo" }, titulo),
          favs
            .filter((f) => f.tipo === tipo)
            .map((f) =>
              h(
                "div",
                { class: "item-liga" },
                h(
                  "button",
                  { class: "item-lateral", type: "button", onclick: () => abrirFavorito(f) },
                  f.logo ? imgLogo(f.logo) : null,
                  h("span", { class: "item-nome" }, f.nome),
                  h("span", { class: "item-esporte" }, NOME_ESPORTE[f.esporte] || f.esporte)
                ),
                h(
                  "button",
                  {
                    class: "remover",
                    type: "button",
                    "aria-label": `Tirar ${f.nome} dos favoritos`,
                    title: "Tirar dos favoritos",
                    onclick: () => {
                      Favoritos.remover(f);
                      Navegacao.redesenhar();
                    },
                  },
                  "×"
                )
              )
            )
        )
      )
  );
}

function inicioVazio() {
  return h(
    "section",
    { class: "cartao boas-vindas" },
    h("div", { class: "cartao-corpo" },
      h("h2", null, "Seus favoritos aparecem aqui"),
      h(
        "p",
        null,
        "Toque na estrela ☆ ao lado de um time, jogador ou competição. Os jogos deles aparecem aqui, no dia que você escolher, com placar ao vivo e onde assistir."
      ),
      h(
        "div",
        { class: "controles" },
        h("button", { class: "botao botao-principal", type: "button", onclick: () => Navegacao.trocarAba("pesquisa") }, "Procurar time ou jogador"),
        h("button", { class: "botao", type: "button", onclick: () => Navegacao.trocarAba("jogos") }, "Ver os jogos de hoje")
      )
    )
  );
}

function abrirFavorito(f) {
  if (f.tipo === "liga") return abrirLiga(f.esporte, f.liga, undefined);
  if (f.tipo === "jogador") {
    if (f.esporte === "boxe") return abrirBoxeador(f.nome);
    if (f.esporte === "nba" && esporteObj("nba") && esporteObj("nba").tipo === "nba") return abrirJogadorNBA(Number(f.id), f.nome, { time_id: f.time_id });
    return abrirAtleta(f.esporte, f.liga, f.id, f.nome);
  }
  if (f.esporte === "nba" && esporteObj("nba") && esporteObj("nba").tipo === "nba") return irPara("nba", "jogos");
  return abrirTime(f.esporte, f.liga, f.id, f.nome);
}

/** Junta, por esporte, o que precisa ser buscado e como filtrar os jogos. */
function planoDeBusca(favs) {
  const plano = {};
  for (const f of favs) {
    const p = (plano[f.esporte] = plano[f.esporte] || { ligasInteiras: new Set(), times: new Set(), ligasDosTimes: new Set() });
    if (f.tipo === "liga") p.ligasInteiras.add(f.liga);
    else if (f.tipo === "time") {
      p.times.add(String(f.id));
      p.ligasDosTimes.add(f.liga);
    } else if (f.tipo === "jogador") {
      if (f.time_id) p.times.add(String(f.time_id));
      p.ligasDosTimes.add(f.liga);
      p.temJogador = true;
    }
  }
  return plano;
}

async function inicioDesenhar(silencioso) {
  const favs = favoritosDoChip();
  const hoje = hojeBR();
  if (!INICIO.data) INICIO.data = hoje;
  const tk = silencioso ? S.tkLista : novoTokenLista();
  if (!favs.length) {
    lista().replaceChildren(inicioVazio());
    return;
  }
  const barra = barraData({
    data: INICIO.data,
    anterior: somarDias(INICIO.data, -1),
    proximo: somarDias(INICIO.data, 1),
    hoje,
    aoMudar: (d) => {
      INICIO.data = d;
      cancelar("lista");
      inicioDesenhar(false);
    },
  });
  if (!silencioso) lista().replaceChildren(barra, carregando("Juntando os jogos dos seus favoritos…"));

  const plano = planoDeBusca(favs);
  const data = INICIO.data;
  const tarefas = [];

  // NBA (no modo servidor; no celular a NBA entra junto com os outros esportes de partidas)
  if (plano.nba && esporteObj("nba") && esporteObj("nba").tipo === "nba") {
    const p = plano.nba;
    tarefas.push(
      api(`/jogos?data=${data}`).then((jogos) => {
        const todos = p.ligasInteiras.has("nba");
        const escolhidos = jogos.filter((j) => todos || p.times.has(String(j.fora.time_id)) || p.times.has(String(j.casa.time_id)));
        return {
          jogos: escolhidos,
          desenhar: (visiveis) =>
            h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo: "NBA", aoClicar: () => irPara("nba", "classificacao") }), visiveis.map((j) => nbaLinhaJogo(j))),
        };
      })
    );
  }

  // futebol e NFL: busca as competições necessárias e filtra pelos favoritos
  for (const esporte of S.esportes.filter((e) => e.tipo === "partidas").map((e) => e.id)) {
    const p = plano[esporte];
    const esp = esporteObj(esporte);
    if (!p || !esp) continue;
    const ligas = new Set(p.ligasInteiras);
    if (p.times.size || p.temJogador) {
      // um time joga várias competições (Brasileirão, Copa do Brasil, Libertadores...)
      esp.ligas.forEach((l) => ligas.add(l.id));
      p.ligasDosTimes.forEach((l) => ligas.add(l));
    }
    for (const liga of ligas) {
      tarefas.push(
        api(`/e/${esporte}/${liga}/jogos?de=${data}`).then((jogos) => {
          const inteira = p.ligasInteiras.has(liga);
          const escolhidos = jogos.filter((j) => inteira || p.times.has(String(j.casa.id)) || p.times.has(String(j.fora.id)));
          const ligaObj = esp.ligas.find((l) => l.id === liga) || { id: liga, nome: liga };
          return {
            jogos: escolhidos,
            desenhar: (visiveis) =>
              grupoDeJogos(esp, ligaObj, visiveis, {
                aoTocarLiga: () => irPara(esp.id, "classificacao", liga),
                aoTocarJogo: (j) => abrirPartida(esp, liga, j),
              }),
          };
        })
      );
    }
  }

  // e-sports: as partidas do dia dos times favoritos (pelo repasse da PandaScore)
  if (plano.esports && plano.esports.times.size && esporteObj("esports")) {
    tarefas.push(
      api(`/esports/jogos?de=${data}&favoritos=${[...plano.esports.times].join(",")}&so_favoritos=1`).then((partidas) => ({
        jogos: partidas,
        desenhar: (visiveis) =>
          h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo: "E-sports" }), visiveis.map((p) => linhaPartidaEsports(p, () => abrirPartidaEsports(p)))),
      }))
    );
  }

  // F1 e UFC: eventos no dia (ou o próximo)
  for (const esporte of ["f1", "ufc"]) {
    const p = plano[esporte];
    const esp = esporteObj(esporte);
    if (!p || !esp) continue;
    const liga = esp.ligas[0].id;
    tarefas.push(
      api(`/e/${esporte}/${liga}/eventos`).then((cal) => {
        const noDia = cal.eventos.filter((e) => (dataBR(e.inicio) || e.data) <= data && (dataBR(e.fim) || e.data) >= data);
        const proximo = cal.eventos.find((e) => (dataBR(e.inicio) || e.data) > data);
        const alvo = noDia.length ? noDia : [];
        const linha = (ev) =>
          h(
            "button",
            {
              class: "evento",
              type: "button",
              onclick: () => {
                const esp = esporteObj(esporte);
                abrirEvento(esp, esp.ligas[0].id, ev);
              },
            },
            caixaData(ev.inicio),
            h("div", null, h("div", { class: "evento-nome" }, ev.nome), h("div", { class: "evento-sub" }, rotuloEstadoEvento(ev.estado))),
            h("span")
          );
        return {
          titulo: NOME_ESPORTE[esporte],
          esporte,
          eventos: alvo.map(linha),
          aoVivo: alvo.some((e) => e.estado === 2),
          rodape: !alvo.length && proximo ? `Próximo: ${proximo.nome}, ${diaHora(proximo.inicio)}` : null,
        };
      })
    );
  }

  // boxe
  if (plano.boxe) {
    tarefas.push(
      api("/boxe/eventos").then((eventos) => {
        const noDia = eventos.filter((e) => e.data === data);
        const proximo = eventos.find((e) => e.data > data);
        const esp = esporteObj("boxe");
        return {
          titulo: "Boxe",
          esporte: "boxe",
          eventos: noDia.map((ev) =>
            h(
              "button",
              { class: "evento", type: "button", onclick: () => boxeAbrir(esp, ev) },
              caixaData(ev.inicio || `${ev.data}T15:00:00Z`),
              h("div", null, h("div", { class: "evento-nome" }, ev.nome), h("div", { class: "evento-sub" }, ev.local || "")),
              canalNaLista(ev.transmissao, true)
            )
          ),
          aoVivo: false,
          rodape: !noDia.length && proximo && esp ? `Próximo: ${proximo.nome}, ${dataCurta(proximo.data)}` : null,
        };
      })
    );
  }

  const respostas = await Promise.allSettled(tarefas);
  if (tk !== S.tkLista) return;

  const grupos = respostas.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const falhas = respostas.length - grupos.length;
  const todosJogos = grupos.flatMap((g) => g.jogos || []);
  const aoVivo = todosJogos.some((j) => j.estado === 2) || grupos.some((g) => g.aoVivo);

  const desenhar = () => {
    const blocos = [];
    const notas = [];
    for (const g of grupos) {
      if (g.jogos) {
        const visiveis = g.jogos.filter(passaFiltro);
        if (visiveis.length) blocos.push(g.desenhar(visiveis));
      } else if (g.eventos && g.eventos.length) {
        blocos.push(h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo: g.titulo, aoClicar: () => irPara(g.esporte) }), g.eventos));
      } else if (g.rodape) {
        notas.push(h("p", { class: "nota" }, `${g.titulo}: ${g.rodape}`));
      }
    }
    const partes = [barra, barraFiltro(todosJogos, desenhar)];
    if (blocos.length) partes.push(...blocos);
    else partes.push(vazio(todosJogos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo dos seus favoritos nesta data. Use as setas para ver outros dias."));
    partes.push(...notas);
    if (falhas) partes.push(h("p", { class: "nota" }, "Parte dos jogos não carregou agora; tente atualizar em alguns segundos."));
    partes.push(listaFavoritos(favs));
    lista().replaceChildren(...partes);
  };
  desenhar();

  if (aoVivo) agendar("lista", () => inicioDesenhar(true), 20000);
  else if (data === hoje) agendar("lista", () => inicioDesenhar(true), 60000);
}

/* ---------- Pesquisa ---------- */

const PESQUISA = { texto: "" };

function linhaResultado({ nome, descricao, esporte, imagem, aoClicar, favorito }) {
  return h(
    "div",
    { class: "resultado-busca" },
    h(
      "button",
      { class: "resultado-principal", type: "button", onclick: aoClicar },
      imagem ? h("img", { class: "logo", src: imagem, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null,
      h("span", null, h("span", { style: { fontWeight: 600 } }, nome), descricao ? h("span", { class: "nota", style: { margin: "0 0 0 8px" } }, descricao) : null)
    ),
    h("span", { class: "selo" }, NOME_ESPORTE[esporte] || esporte),
    botaoFavorito(favorito)
  );
}

const FILTROS_BUSCA = [
  ["todos", "Todos"],
  ["times", "Times"],
  ["atletas", "Atletas"],
  ["competicoes", "Competições"],
];

function pesquisaDesenhar() {
  novoTokenLista();
  if (!PESQUISA.filtro) PESQUISA.filtro = "todos";
  const resultados = h("div", { class: "resultados-pesquisa" });
  const campo = h("input", {
    class: "busca",
    type: "search",
    placeholder: "Ex.: Vini Jr., Flamengo, Libertadores, Mahomes, Usyk",
    "aria-label": "Procurar jogador, time ou competição",
    value: PESQUISA.texto,
    autocomplete: "off",
  });
  const chips = h("div", { class: "chips-busca", role: "group", "aria-label": "Filtrar resultados" });
  const desenharChips = () =>
    chips.replaceChildren(
      ...FILTROS_BUSCA.map(([id, nome]) =>
        h(
          "button",
          {
            class: "chip-busca",
            type: "button",
            "aria-pressed": String(PESQUISA.filtro === id),
            onclick: () => {
              PESQUISA.filtro = id;
              desenharChips();
              // troca de filtro não pede de novo: redesenha com o último resultado
              if (PESQUISA.texto.length >= 2 && PESQUISA.ultimo) pesquisaMostrar(PESQUISA.ultimo, resultados);
              else pesquisaRecentes(resultados);
            },
          },
          nome
        )
      )
    );
  desenharChips();
  let espera;
  campo.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => pesquisaProcurar(campo.value.trim(), resultados), 350);
  });
  lista().replaceChildren(h("div", { class: "pesquisa" }, campo, chips, resultados));
  pesquisaProcurar(PESQUISA.texto, resultados);
  campo.focus();
}

/* ---------- Buscas recentes (guardadas no aparelho) ---------- */

function pesquisaLerRecentes() {
  try {
    const l = JSON.parse(lembrar("busca_recentes") || "[]");
    return Array.isArray(l) ? l : [];
  } catch (_) {
    return [];
  }
}

function PESQUISA_lembrar(item) {
  guardar("busca_recentes", JSON.stringify(lembrarRecente(pesquisaLerRecentes(), item)));
}

function pesquisaEsquecer(item) {
  const chave = chaveRecente(item);
  guardar("busca_recentes", JSON.stringify(pesquisaLerRecentes().filter((x) => chaveRecente(x) !== chave)));
}

/** Abre um resultado (atleta, time ou competição) e o põe no topo dos recentes. */
function pesquisaAbrir(item) {
  PESQUISA_lembrar(item);
  if (item.tipo === "liga") return abrirLiga(item.esporte, item.liga);
  if (item.tipo === "time") return abrirTime(item.esporte, item.liga, item.id, item.nome);
  if (item.esporte === "boxe") return abrirBoxeador(item.nome);
  if (item.esporte === "nba" && esporteObj("nba") && esporteObj("nba").tipo === "nba")
    return abrirJogadorNBA(Number(item.id), item.nome, { aba: item.ativo === false ? "carreira" : "temporada" });
  return abrirAtleta(item.esporte, item.liga, item.id, item.nome);
}

function itemDeLiga(l) {
  const esp = esporteObj(l.esporte);
  const liga = esp && (esp.ligas || []).find((x) => x.id === l.liga);
  const descricao = l.esporte === "futebol" && liga ? grupoDaLiga(liga) : null;
  return { tipo: "liga", esporte: l.esporte, liga: l.liga, id: l.liga, nome: l.nome, descricao, imagem: null };
}

function itemDeBusca(tipo, x) {
  return { tipo, esporte: x.esporte, liga: x.liga, id: String(x.id), nome: x.nome, descricao: x.descricao || null, imagem: x.imagem || null, ativo: x.ativo };
}

function linhaDeItem(item) {
  return linhaResultado({
    nome: item.nome,
    descricao: item.descricao,
    esporte: item.esporte,
    imagem: item.imagem,
    aoClicar: () => pesquisaAbrir(item),
    favorito:
      item.tipo === "time"
        ? { tipo: "time", esporte: item.esporte, liga: item.liga, id: item.id, nome: item.nome, logo: item.imagem }
        : item.tipo === "liga"
          ? { tipo: "liga", esporte: item.esporte, liga: item.liga, id: item.liga, nome: item.nome }
          : { tipo: "jogador", esporte: item.esporte, liga: item.liga, id: item.id, nome: item.nome },
  });
}

function pesquisaRecentes(resultados) {
  const recentes = pesquisaLerRecentes().filter((x) => {
    const f = PESQUISA.filtro;
    return f === "todos" || (f === "times" && x.tipo === "time") || (f === "atletas" && x.tipo === "jogador") || (f === "competicoes" && x.tipo === "liga");
  });
  if (!recentes.length) {
    resultados.replaceChildren(
      h(
        "p",
        { class: "nota" },
        "Procure em todos os esportes: jogadores da NBA (inclusive aposentados), jogadores e times de futebol, NFL, MLB e NHL, lutadores do UFC, boxeadores, pilotos e competições. As competições abrem a página delas."
      )
    );
    return;
  }
  resultados.replaceChildren(
    h("p", { class: "titulo-dia" }, "Recentes"),
    h(
      "div",
      { class: "cartao" },
      recentes.map((item) =>
        h(
          "div",
          { class: "recente" },
          linhaDeItem(item),
          h(
            "button",
            {
              class: "botao-icone tirar-recente",
              type: "button",
              "aria-label": "Tirar dos recentes",
              onclick: () => {
                pesquisaEsquecer(item);
                pesquisaRecentes(resultados);
              },
            },
            "×"
          )
        )
      )
    )
  );
}

/* ---------- Resultados ---------- */

async function pesquisaProcurar(texto, resultados) {
  PESQUISA.texto = texto;
  if (texto.length < 2) {
    PESQUISA.ultimo = null;
    pesquisaRecentes(resultados);
    return;
  }
  const tk = novoTokenLista();
  resultados.replaceChildren(carregando("Procurando…"));
  let r;
  try {
    r = await api(`/busca?q=${encodeURIComponent(texto)}`);
  } catch (erro) {
    if (tk === S.tkLista) resultados.replaceChildren(caixaErro(erro, () => pesquisaProcurar(texto, resultados)));
    return;
  }
  if (tk !== S.tkLista) return;
  PESQUISA.ultimo = r;
  pesquisaMostrar(r, resultados);
}

function pesquisaMostrar(r, resultados) {
  const f = PESQUISA.filtro || "todos";
  const ver = (qual) => f === "todos" || f === qual;
  const partes = [];
  if (ver("competicoes") && r.ligas.length) {
    // como no Sofascore: a competição é uma linha, e o toque abre a página dela
    partes.push(h("p", { class: "titulo-dia" }, "Competições"), h("div", { class: "cartao" }, r.ligas.map((l) => linhaDeItem(itemDeLiga(l)))));
  }
  if (ver("atletas") && r.jogadores.length) {
    partes.push(
      h("p", { class: "titulo-dia", style: { marginTop: "16px" } }, "Jogadores e atletas"),
      h("div", { class: "cartao" }, r.jogadores.map((p) => linhaDeItem(itemDeBusca("jogador", p))))
    );
  }
  if (ver("times") && r.times.length) {
    partes.push(
      h("p", { class: "titulo-dia", style: { marginTop: "16px" } }, "Times e seleções"),
      h("div", { class: "cartao" }, r.times.map((t) => linhaDeItem(itemDeBusca("time", t))))
    );
  }
  if (!partes.length) partes.push(vazio(f === "todos" ? "Nada encontrado com esse nome." : "Nada encontrado nesse filtro."));
  if (r.falhas && r.falhas.length) partes.push(h("p", { class: "nota" }, `${r.falhas.join(" e ")} não respondeu agora: aparecem só os outros resultados.`));
  if (r.indice !== undefined) {
    partes.push(
      h(
        "p",
        { class: "nota" },
        `O índice local tem ${Number(r.indice).toLocaleString("pt-BR")} atletas e times.`,
        r.semeando ? " Ele está sendo completado agora em segundo plano; procure de novo em alguns minutos se não achar alguém." : " Todo atleta e time que aparece no app entra nele."
      )
    );
  }
  resultados.replaceChildren(...partes);
}
