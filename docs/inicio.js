"use strict";

/* =========================================================================
   Início (jogos dos favoritos) e Pesquisa (jogadores, times e competições).
   Usa a base de app.js e as telas de esportes.js.
   ========================================================================= */

const NOME_ESPORTE = { nba: "NBA", futebol: "Futebol", nfl: "NFL", mlb: "MLB", nhl: "NHL", f1: "Fórmula 1", ufc: "UFC", boxe: "Boxe" };

const esporteObj = (id) => S.esportes.find((e) => e.id === id);

/** Abre uma competição numa aba do esporte (jogos, classificação, líderes...). */
function abrirLiga(esporte, liga, aba) {
  if (esporte === "futebol") {
    estadoDe("futebol").liga = liga;
    guardar("liga:futebol", liga);
  }
  irPara(esporte, aba);
}

/* ---------- Início ---------- */

const INICIO = { data: null };

registrarModulo("inicio", {
  abas: () => [{ id: "jogos", nome: "Seus jogos" }],
  textoVazio: () => "Escolha um jogo para ver os detalhes.",
  lateral: () => lateralFavoritos(),
  desenhar: () => inicioDesenhar(false),
});

/** Favoritos na barra lateral, agrupados, com atalho e botão de tirar. */
function lateralFavoritos() {
  const favs = Favoritos.lista();
  if (!favs.length) {
    return h("div", { class: "lateral-secao" }, h("p", { class: "nota" }, "Toque na estrela ☆ de um time, jogador ou competição para ele aparecer aqui."));
  }
  const grupos = [
    ["time", "Times"],
    ["jogador", "Jogadores"],
    ["liga", "Competições"],
  ];
  return h(
    "div",
    null,
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
                      inicioDesenhar(false);
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
      h("h2", null, "Monte a sua página inicial"),
      h(
        "p",
        null,
        "Toque na estrela ☆ ao lado de um time, jogador ou competição. Os jogos deles aparecem aqui, no dia que você escolher, com placar ao vivo e onde assistir."
      ),
      h(
        "div",
        { class: "controles" },
        h("button", { class: "botao botao-principal", type: "button", onclick: () => irPara("pesquisa") }, "Procurar time ou jogador"),
        h("button", { class: "botao", type: "button", onclick: () => irPara("futebol") }, "Ver o futebol de hoje")
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
  const favs = Favoritos.lista();
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
        return { titulo: "NBA", jogos: escolhidos, linha: (j) => nbaLinhaJogo(j) };
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
          const nome = (esp.ligas.find((l) => l.id === liga) || {}).nome || liga;
          return {
            titulo: esp.ligas.length === 1 ? esp.nome : nome,
            logo: escolhidos.length ? escolhidos[0].liga_logo || null : null,
            jogos: escolhidos,
            linha: (j) => linhaPartida(esp, j, () => abrirPartida(esp, liga, j)),
          };
        })
      );
    }
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
                estadoDe(esporte).eventoAtual = ev.id;
                irPara(esporte, "calendario");
              },
            },
            caixaData(ev.inicio),
            h("div", null, h("div", { class: "evento-nome" }, ev.nome), h("div", { class: "evento-sub" }, rotuloEstadoEvento(ev.estado))),
            h("span")
          );
        return {
          titulo: NOME_ESPORTE[esporte],
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
          eventos: noDia.map((ev) =>
            h(
              "button",
              { class: "evento", type: "button", onclick: () => { estadoDe("boxe").eventoAtual = ev.id; irPara("boxe"); } },
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
        if (visiveis.length) blocos.push(h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo: g.titulo, logo: g.logo }), visiveis.map(g.linha)));
      } else if (g.eventos && g.eventos.length) {
        blocos.push(h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo: g.titulo }), g.eventos));
      } else if (g.rodape) {
        notas.push(h("p", { class: "nota" }, `${g.titulo}: ${g.rodape}`));
      }
    }
    const partes = [barra, barraFiltro(todosJogos, desenhar)];
    if (blocos.length) partes.push(...blocos);
    else partes.push(vazio(todosJogos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo dos seus favoritos nesta data. Use as setas para ver outros dias."));
    partes.push(...notas);
    if (falhas) partes.push(h("p", { class: "nota" }, "Parte dos jogos não carregou agora; tente atualizar em alguns segundos."));
    lista().replaceChildren(...partes);
  };
  desenhar();

  if (aoVivo) agendar("lista", () => inicioDesenhar(true), 20000);
  else if (data === hoje) agendar("lista", () => inicioDesenhar(true), 60000);
}

/* ---------- Pesquisa ---------- */

const PESQUISA = { texto: "" };

registrarModulo("pesquisa", {
  abas: () => [{ id: "buscar", nome: "Jogadores, times e competições" }],
  desenhar: () => {
    layoutLargo(true);
    pesquisaDesenhar();
  },
});

const ABAS_POR_ESPORTE = {
  nba: [
    ["jogos", "Jogos"],
    ["classificacao", "Classificação"],
    ["lideres", "Líderes"],
  ],
  futebol: [
    ["jogos", "Jogos"],
    ["classificacao", "Classificação"],
    ["lideres", "Artilharia e cartões"],
  ],
  nfl: [
    ["jogos", "Jogos"],
    ["classificacao", "Classificação"],
    ["lideres", "Líderes"],
  ],
  mlb: [
    ["jogos", "Jogos"],
    ["classificacao", "Classificação"],
    ["lideres", "Líderes"],
  ],
  nhl: [
    ["jogos", "Jogos"],
    ["classificacao", "Classificação"],
    ["lideres", "Líderes"],
  ],
  f1: [
    ["calendario", "Calendário"],
    ["classificacao", "Classificação"],
  ],
  ufc: [
    ["calendario", "Eventos"],
    ["ranking", "Ranking"],
  ],
  boxe: [["eventos", "Eventos"]],
};

function pesquisaDesenhar() {
  novoTokenLista();
  const resultados = h("div", { class: "resultados-pesquisa" });
  const campo = h("input", {
    class: "busca",
    type: "search",
    placeholder: "Ex.: Vini Jr., Flamengo, Libertadores, Mahomes, Pereira",
    "aria-label": "Procurar jogador, time ou competição",
    value: PESQUISA.texto,
    autocomplete: "off",
  });
  let espera;
  campo.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => pesquisaProcurar(campo.value.trim(), resultados), 350);
  });
  lista().replaceChildren(h("div", { class: "pesquisa" }, campo, resultados));
  pesquisaProcurar(PESQUISA.texto, resultados);
  campo.focus();
}

function cartaoLiga(l) {
  const chave = l.esporte === "futebol" ? `futebol:${l.liga}` : l.esporte;
  const fav = { tipo: "liga", esporte: l.esporte, liga: l.liga, id: l.liga, nome: l.nome };
  return h(
    "section",
    { class: "cartao" },
    h("div", { class: "cartao-cabeca" }, h("h3", null, l.nome, " ", h("span", { class: "selo" }, NOME_ESPORTE[l.esporte] || l.esporte)), botaoFavorito(fav, { comTexto: true })),
    h(
      "div",
      { class: "cartao-corpo" },
      h(
        "div",
        { class: "controles" },
        (ABAS_POR_ESPORTE[l.esporte] || []).map(([aba, nome]) => h("button", { class: "botao", type: "button", onclick: () => abrirLiga(l.esporte, l.liga, aba) }, nome))
      ),
      listaCampeoes(chave)
    )
  );
}

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

async function pesquisaProcurar(texto, resultados) {
  PESQUISA.texto = texto;
  if (texto.length < 2) {
    resultados.replaceChildren(
      h(
        "p",
        { class: "nota" },
        "Procure em todos os esportes: jogadores da NBA (inclusive aposentados), jogadores e times de futebol e NFL, lutadores do UFC, pilotos e competições. Nas competições aparecem os últimos campeões."
      )
    );
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

  const partes = [];
  if (r.ligas.length) {
    partes.push(h("p", { class: "titulo-dia" }, "Competições"), h("div", { class: "grade-cartoes" }, r.ligas.map(cartaoLiga)));
  }
  if (r.jogadores.length) {
    partes.push(
      h("p", { class: "titulo-dia", style: { marginTop: "16px" } }, "Jogadores e atletas"),
      h(
        "div",
        { class: "cartao" },
        r.jogadores.map((p) =>
          linhaResultado({
            nome: p.nome,
            descricao: p.descricao,
            esporte: p.esporte,
            imagem: p.imagem,
            aoClicar: () =>
              p.esporte === "boxe"
                ? abrirBoxeador(p.nome)
                : p.esporte === "nba" && esporteObj("nba").tipo === "nba"
                  ? abrirJogadorNBA(Number(p.id), p.nome, { aba: p.ativo === false ? "carreira" : "temporada" })
                  : abrirAtleta(p.esporte, p.liga, p.id, p.nome),
            favorito: { tipo: "jogador", esporte: p.esporte, liga: p.liga, id: String(p.id), nome: p.nome },
          })
        )
      )
    );
  }
  if (r.times.length) {
    partes.push(
      h("p", { class: "titulo-dia", style: { marginTop: "16px" } }, "Times e seleções"),
      h(
        "div",
        { class: "cartao" },
        r.times.map((t) =>
          linhaResultado({
            nome: t.nome,
            descricao: t.descricao,
            esporte: t.esporte,
            imagem: t.imagem,
            aoClicar: () => abrirTime(t.esporte, t.liga, t.id, t.nome),
            favorito: { tipo: "time", esporte: t.esporte, liga: t.liga, id: String(t.id), nome: t.nome, logo: t.imagem },
          })
        )
      )
    );
  }
  if (!partes.length) partes.push(vazio("Nada encontrado com esse nome."));
  if (r.falhas && r.falhas.length) partes.push(h("p", { class: "nota" }, "A busca da ESPN não respondeu agora: aparecem só os resultados do índice local."));
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
