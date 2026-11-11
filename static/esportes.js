"use strict";

/* =========================================================================
   Futebol, NFL, Fórmula 1, UFC e boxe.
   Usa as funções da base (h, api, cartao, tabela, Painel...) definidas em app.js.
   ========================================================================= */

const ESTADO_ESPORTE = {};

function estadoDe(esporteId) {
  if (!ESTADO_ESPORTE[esporteId]) ESTADO_ESPORTE[esporteId] = { liga: null, data: null, semana: null, datas: {}, eventoAtual: null, jogoAtual: null, eventos: null };
  return ESTADO_ESPORTE[esporteId];
}

/* ---------- Atleta e elenco (todos os esportes da ESPN) ---------- */

function abrirAtleta(esporte, liga, id, nome) {
  if (!id) return;
  Painel.abrir(nome || "Atleta", (corpo, ativo) => desenharAtleta(corpo, ativo, esporte, liga, id));
}

function empilharAtleta(esporte, liga, id, nome) {
  if (!id) return;
  Painel.empilhar(nome || "Atleta", (corpo, ativo) => desenharAtleta(corpo, ativo, esporte, liga, id));
}

function abrirElenco(esporte, liga, timeId, nome) {
  if (!timeId) return;
  Painel.abrir(nome || "Elenco", (corpo, ativo) => desenharElenco(corpo, ativo, esporte, liga, timeId));
}

async function desenharElenco(corpo, ativo, esporte, liga, timeId) {
  const e = await api(`/e/${esporte}/${liga}/times/${timeId}/elenco`);
  if (!ativo()) return;
  const grupos = e.grupos.filter((g) => g.atletas.length);
  const favTime = { tipo: "time", esporte, liga, id: String(e.time.id || timeId), nome: e.time.nome || "Time", logo: e.time.logo };
  corpo.replaceChildren(
    h(
      "div",
      { class: "perfil" },
      imgLogo(e.time.logo, "perfil-foto"),
      h("div", null, h("h3", { class: "perfil-nome" }, e.time.nome || "Elenco"), h("div", { class: "perfil-sub" }, "Clique num atleta para ver a carreira."), h("div", { class: "perfil-acoes" }, botaoFavorito(favTime, { comTexto: true })))
    ),
    ...(grupos.length
      ? grupos.map((g) =>
          secao(
            g.nome,
            tabela(
              [
                { nome: "#", valor: (a) => a.camisa || "" },
                {
                  nome: "Atleta",
                  esq: true,
                  valor: (a) => h("button", { class: "botao-link", type: "button", onclick: () => empilharAtleta(esporte, liga, a.id, a.nome) }, a.nome),
                },
                { nome: "Posição", valor: (a) => a.posicao || "" },
                { nome: "Idade", valor: (a) => a.idade ?? "" },
                { nome: "País", valor: (a) => a.pais || "" },
              ],
              g.atletas
            )
          )
        )
      : [vazio("A ESPN não tem o elenco deste time.")])
  );
}

async function desenharAtleta(corpo, ativo, esporte, liga, id) {
  const a = await api(`/e/${esporte}/${liga}/atletas/${id}`);
  if (!ativo()) return;
  const p = a.perfil;
  $("#painel-titulo").textContent = p.nome || "Atleta";
  const fatos = [
    ["Posição", p.posicao],
    ["Time", p.time],
    ["Camisa", p.camisa ? `#${p.camisa}` : null],
    ["Idade", p.idade ? `${p.idade} anos` : null],
    ["Nascimento", p.nascimento],
    ["Local de nascimento", p.local_nascimento],
    ["Nacionalidade", p.pais],
    ["Altura", p.altura],
    ["Peso", p.peso],
    ...p.extras.map((x) => [x.rotulo, x.valor]),
  ].filter(([, v]) => v);

  const favAtleta = { tipo: "jogador", esporte, liga, id: String(p.id || id), nome: p.nome || "Atleta", time_id: p.time_id ? String(p.time_id) : null };
  const blocos = [
    h(
      "div",
      { class: "perfil" },
      p.foto ? h("img", { class: "perfil-foto", src: p.foto, alt: "" }) : imgLogo(null, "perfil-foto"),
      h(
        "div",
        null,
        h("h3", { class: "perfil-nome" }, p.nome),
        h("div", { class: "perfil-sub" }, imgBandeira(p.bandeira, p.pais), [p.time, p.posicao].filter(Boolean).join(", ")),
        h("div", { class: "perfil-acoes" }, botaoFavorito(favAtleta, { comTexto: true }))
      )
    ),
  ];
  if (fatos.length) blocos.push(h("dl", { class: "fatos" }, fatos.map(([r, v]) => h("div", { class: "fato" }, h("dt", null, r), h("dd", null, v)))));
  if (p.resumo.length) {
    blocos.push(
      secao(
        p.resumo_titulo || "Resumo",
        h("div", { class: "numeros" }, p.resumo.map((r) => h("div", { class: "numero-caixa" }, h("strong", null, r.valor), h("span", null, r.rotulo))))
      )
    );
  }
  if (a.carreira.length) {
    for (const cat of a.carreira) {
      const colunas = [
        { chave: "temporada", nome: "Temporada", esq: true, valor: (l) => l.temporada },
        ...(cat.temporadas.some((l) => l.time) ? [{ chave: "time", nome: "Time", esq: true, valor: (l) => l.time || "" }] : []),
        ...cat.rotulos.map((rotulo, i) => ({ chave: `c${i}`, nome: rotulo, titulo: cat.descricoes[i] || null, valor: (l) => l.valores[i] ?? "" })),
      ];
      const rodape = cat.totais.length ? { temporada: "Carreira", ...Object.fromEntries(cat.totais.map((v, i) => [`c${i}`, v])) } : null;
      blocos.push(secao(cat.nome, tabela(colunas, cat.temporadas, { rodape })));
    }
  }
  const historico = h("div");
  const temHistorico = esporte === "futebol" || esporte === "ufc";
  if (temHistorico) {
    blocos.push(historico);
    historico.replaceChildren(secao(esporte === "ufc" ? "Histórico de lutas" : "Carreira por temporada", carregando("Montando o histórico…")));
  } else if (!a.carreira.length) {
    blocos.push(h("p", { class: "nota", style: { padding: "0 16px" } }, "A ESPN não publica estatísticas de carreira para este atleta."));
  }
  corpo.replaceChildren(...blocos);
  if (!temHistorico) return;
  try {
    const hist = await api(`/e/${esporte}/${liga}/atletas/${p.id || id}/historico`);
    if (!ativo()) return;
    historico.replaceChildren(hist.tipo === "lutas" ? secaoLutas(hist, esporte, liga) : secaoCarreiraFutebol(hist));
  } catch (erro) {
    if (ativo()) historico.replaceChildren(secao(esporte === "ufc" ? "Histórico de lutas" : "Carreira por temporada", h("p", { class: "nota" }, `Não carregou agora. ${erro.message}`)));
  }
}

function secaoCarreiraFutebol(hist) {
  if (!hist.temporadas.length) return secao("Carreira por temporada", h("p", { class: "nota" }, "A ESPN não tem o histórico deste jogador."));
  const goleiro = hist.temporadas.some((l) => l.defesas);
  const colunas = [
    { chave: "temporada", nome: "Temporada", esq: true, valor: (l) => l.temporada },
    { chave: "time", nome: "Time", esq: true, valor: (l) => h("span", { class: "time-celula" }, imgLogo(l.time_logo), l.time || "") },
    { chave: "competicao", nome: "Competição", esq: true, valor: (l) => l.competicao || "" },
    { chave: "jogos", nome: "J", titulo: "Jogos", valor: (l) => l.jogos ?? "" },
    { chave: "gols", nome: "G", titulo: "Gols", destaque: true, valor: (l) => l.gols ?? "" },
    { chave: "assistencias", nome: "A", titulo: "Assistências", valor: (l) => l.assistencias ?? "" },
    { chave: "amarelos", nome: "CA", titulo: "Cartões amarelos", valor: (l) => l.amarelos ?? "" },
    { chave: "vermelhos", nome: "CV", titulo: "Cartões vermelhos", valor: (l) => l.vermelhos ?? "" },
    ...(goleiro ? [{ chave: "defesas", nome: "DEF", titulo: "Defesas", valor: (l) => l.defesas ?? "" }] : []),
  ];
  const t = hist.totais;
  return secao(
    "Carreira por temporada",
    tabela(colunas, hist.temporadas, { rodape: { temporada: "Total", jogos: t.jogos, gols: t.gols, assistencias: t.assistencias, amarelos: t.amarelos, vermelhos: t.vermelhos, defesas: t.defesas } }),
    h("p", { class: "nota" }, "Inclui todas as competições que a ESPN registra para o jogador.")
  );
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function secaoLutas(hist, esporte, liga) {
  if (!hist.lutas.length) return secao("Histórico de lutas", h("p", { class: "nota" }, "A ESPN não tem lutas registradas para este atleta."));
  const c = hist.cartel_ufc;
  return secao(
    "Histórico de lutas",
    h(
      "p",
      { class: "nota", style: { marginTop: 0 } },
      `No UFC (lutas registradas pela ESPN): ${plural(c.vitorias, "vitória", "vitórias")}, ${plural(c.derrotas, "derrota", "derrotas")}${c.empates ? `, ${plural(c.empates, "empate", "empates")}` : ""}.`
    ),
    tabela(
      [
        { nome: "", valor: (l) => h("span", { class: "forma" }, h("span", { class: l.resultado || "" }, l.resultado || "–")) },
        {
          nome: "Adversário",
          esq: true,
          valor: (l) => (l.adversario_id ? h("button", { class: "botao-link", type: "button", onclick: () => empilharAtleta(esporte, liga, l.adversario_id, l.adversario) }, l.adversario) : l.adversario),
        },
        { nome: "Método", esq: true, valor: (l) => [l.metodo, l.round ? `${l.round}º round` : null, l.tempo].filter(Boolean).join(", ") },
        { nome: "Evento", esq: true, valor: (l) => l.evento || "" },
        { nome: "Data", valor: (l) => (l.data ? dataCurta(l.data) : "") },
      ],
      hist.lutas
    )
  );
}

/* ---------- Partidas: futebol e NFL ---------- */

const COLUNAS_CLASSIFICACAO = {
  futebol: [
    ["gamesPlayed", "J", "Jogos"],
    ["wins", "V", "Vitórias"],
    ["ties", "E", "Empates"],
    ["losses", "D", "Derrotas"],
    ["pointsFor", "GP", "Gols pró"],
    ["pointsAgainst", "GC", "Gols contra"],
    ["pointDifferential", "SG", "Saldo de gols"],
    ["points", "Pts", "Pontos"],
  ],
  nfl: [
    ["wins", "V", "Vitórias"],
    ["losses", "D", "Derrotas"],
    ["ties", "E", "Empates"],
    ["winPercent", "%", "Aproveitamento"],
    ["pointsFor", "PP", "Pontos pró"],
    ["pointsAgainst", "PC", "Pontos contra"],
    ["differential", "Saldo", "Saldo de pontos"],
    ["streak", "Seq.", "Sequência"],
  ],
  f1: [["championshipPts", "Pts", "Pontos"]],
};

/** Ordem dos times em cada esporte: no futebol o mandante vem primeiro; na NFL, o visitante. */
function ordemTimes(esporteId, jogo) {
  return esporteId === "nfl" ? [jogo.fora, jogo.casa] : [jogo.casa, jogo.fora];
}

function statusPartidaLista(j) {
  if (j.estado === 1) return j.status ? [j.status] : [hora(j.inicio) || "A definir"];
  if (j.estado === 2) return [j.status || "Ao vivo"];
  if (j.status && j.status.includes("pênaltis")) return ["Fim", "pên."];
  if (j.status && j.status.includes("prorrogação")) return ["Fim", "prorr."];
  return [j.status === "Encerrado" ? "Fim" : j.status || "Fim"];
}

function placarComPenaltis(t) {
  if (t.placar === null || t.placar === undefined) return null;
  return t.penaltis !== null && t.penaltis !== undefined ? `${t.placar} (${t.penaltis})` : t.placar;
}

function linhaPartida(esp, j, aoClicar) {
  const st = estadoDe(esp.id);
  const terminou = j.estado === 3;
  const algumVenceu = j.casa.vencedor || j.fora.vencedor;
  return botaoJogo({
    id: j.id,
    estado: j.estado,
    status: statusPartidaLista(j),
    atual: j.id === st.jogoAtual,
    transmissao: j.transmissao,
    mostrarPadrao: true,
    aoClicar,
    times: ordemTimes(esp.id, j).map((t) => ({
      nome: t.nome_curto || t.nome,
      logo: t.logo,
      placar: j.estado >= 2 ? placarComPenaltis(t) : null,
      perdeu: terminou && algumVenceu && !t.vencedor,
    })),
  });
}

const GRUPOS_LIGAS = {
  "bra.1": "Brasil",
  "bra.2": "Brasil",
  "bra.copa_do_brazil": "Brasil",
  "conmebol.libertadores": "América do Sul",
  "conmebol.sudamericana": "América do Sul",
  "uefa.champions": "Europa",
  "uefa.europa": "Europa",
  "eng.1": "Europa",
  "esp.1": "Europa",
  "ita.1": "Europa",
  "ger.1": "Europa",
  "fra.1": "Europa",
  "por.1": "Europa",
  "usa.1": "América do Norte",
};
const ORDEM_GRUPOS = ["Brasil", "América do Sul", "Europa", "América do Norte", "Seleções", "Outras"];

function grupoDaLiga(l) {
  return l.selecao ? "Seleções" : GRUPOS_LIGAS[l.id] || "Outras";
}

function favLiga(esp, ligaId) {
  const liga = esp.ligas.find((l) => l.id === ligaId) || esp.ligas[0];
  if (!liga) return null;
  return { tipo: "liga", esporte: esp.id, liga: liga.id, id: liga.id, nome: liga.nome };
}

const ModuloPartidas = {
  abas: (esp) => [
    { id: "jogos", nome: "Jogos" },
    { id: "classificacao", nome: "Classificação" },
    { id: "lideres", nome: esp.id === "futebol" ? "Artilharia e cartões" : "Líderes" },
  ],

  lateral(esp, aba) {
    const st = estadoDe(esp.id);
    if (esp.ligas.length < 2) {
      return h("div", { class: "lateral-secao" }, h("div", { class: "lateral-acao" }, botaoFavorito(favLiga(esp, esp.ligas[0].id), { comTexto: true })));
    }
    if (!st.liga) st.liga = lembrar(`liga:${esp.id}`) || "todas";
    if (aba !== "jogos" && st.liga === "todas") st.liga = esp.ligas[0].id;
    const escolher = (id) => {
      st.liga = id;
      guardar(`liga:${esp.id}`, id);
      irPara(esp.id, S.aba);
    };
    const item = (l) =>
      h(
        "div",
        { class: "item-liga" },
        h("button", { class: "item-lateral", type: "button", "aria-current": String(l.id === st.liga), onclick: () => escolher(l.id) }, l.nome),
        l.id !== "todas" ? botaoFavorito(favLiga(esp, l.id)) : null
      );
    const grupos = {};
    esp.ligas.forEach((l) => (grupos[grupoDaLiga(l)] = grupos[grupoDaLiga(l)] || []).push(l));
    const favoritas = Favoritos.lista().filter((f) => f.tipo === "liga" && f.esporte === esp.id);
    return h(
      "div",
      null,
      favoritas.length
        ? h("div", { class: "lateral-secao" }, h("div", { class: "lateral-rotulo" }, "Suas competições"), favoritas.map((f) => item({ id: f.liga, nome: f.nome })))
        : null,
      h(
        "div",
        { class: "lateral-secao" },
        h("div", { class: "lateral-rotulo" }, "Competições"),
        aba === "jogos" ? item({ id: "todas", nome: "Todos os jogos do dia" }) : null,
        ORDEM_GRUPOS.filter((g) => grupos[g]).map((g) => [h("div", { class: "lateral-subrotulo" }, g), grupos[g].map(item)])
      )
    );
  },

  desenhar(esp, aba) {
    const st = estadoDe(esp.id);
    if (!st.liga) st.liga = esp.ligas.length > 1 ? lembrar(`liga:${esp.id}`) || "todas" : esp.ligas[0].id;
    const ligaEscolhida = st.liga === "todas" ? esp.ligas[0].id : st.liga;
    if (aba === "classificacao") {
      layoutLargo(true);
      return classificacaoEspn(esp, ligaEscolhida);
    }
    if (aba === "lideres") {
      layoutLargo(true);
      return lideresEspn(esp, ligaEscolhida);
    }
    return partidasLista(esp);
  },
};

registrarModulo("partidas", ModuloPartidas);

async function partidasLista(esp) {
  const st = estadoDe(esp.id);
  const hoje = hojeBR();
  if (!st.data) st.data = hoje;

  // NFL: navegação por semana da temporada
  if (esp.id === "nfl") {
    const tk = novoTokenLista();
    if (!st.datas.nfl) {
      try {
        st.datas.nfl = await api(`/e/nfl/nfl/datas`);
      } catch (_) {
        st.datas.nfl = { semanas: [], datas: [], atual: null };
      }
    }
    if (tk !== S.tkLista) return;
    const semanas = st.datas.nfl.semanas || [];
    if (semanas.length) {
      if (st.semana === null || st.semana === undefined) st.semana = st.datas.nfl.atual ?? semanas.length - 1;
      return partidasSemana(esp, false);
    }
  }
  return partidasDia(esp, false);
}

async function partidasSemana(esp, silencioso) {
  const st = estadoDe(esp.id);
  const semanas = st.datas.nfl.semanas;
  const semana = semanas[st.semana];
  const tk = silencioso ? S.tkLista : novoTokenLista();
  const escolha = h(
    "select",
    {
      class: "campo-data",
      "aria-label": "Semana da temporada",
      onchange: (e) => {
        st.semana = Number(e.target.value);
        cancelar("lista");
        partidasSemana(esp, false);
      },
    },
    semanas.map((w, i) => h("option", { value: i, selected: i === st.semana }, `${w.rotulo} (${dataCurta(w.de)} a ${dataCurta(w.ate)})`))
  );
  const barra = h(
    "div",
    { class: "barra-data" },
    h("button", { class: "botao-icone", type: "button", "aria-label": "Semana anterior", disabled: st.semana <= 0, onclick: () => { st.semana--; cancelar("lista"); partidasSemana(esp, false); } }, "‹"),
    escolha,
    h("button", { class: "botao-icone", type: "button", "aria-label": "Próxima semana", disabled: st.semana >= semanas.length - 1, onclick: () => { st.semana++; cancelar("lista"); partidasSemana(esp, false); } }, "›")
  );
  if (!silencioso) lista().replaceChildren(barra, carregando());
  let jogos;
  try {
    jogos = await api(`/e/nfl/nfl/jogos?de=${semana.de}&ate=${semana.ate}`);
  } catch (erro) {
    if (tk === S.tkLista && !silencioso) lista().replaceChildren(barra, caixaErro(erro, () => partidasSemana(esp, false)));
    return;
  }
  if (tk !== S.tkLista) return;
  const desenhar = () => {
    const porDia = {};
    jogos.filter(passaFiltro).forEach((j) => (porDia[j.data] = porDia[j.data] || []).push(j));
    const conteudo = Object.keys(porDia)
      .sort()
      .map((dia) =>
        h(
          "section",
          { class: "cartao grupo-liga" },
          cabecaGrupo({ titulo: dataLonga(dia), logo: porDia[dia][0].liga_logo || null }),
          porDia[dia].map((j) => linhaPartida(esp, j, () => abrirPartida(esp, "nfl", j)))
        )
      );
    lista().replaceChildren(
      barra,
      barraFiltro(jogos, desenhar),
      ...(conteudo.length ? conteudo : [vazio(jogos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo nesta semana.")])
    );
    marcarAtual(lista(), st.jogoAtual);
  };
  desenhar();
  if (jogos.some((j) => j.estado === 2)) agendar("lista", () => partidasSemana(esp, true), 20000);
}

async function partidasDia(esp, silencioso) {
  const st = estadoDe(esp.id);
  const hoje = hojeBR();
  const ligaUnica = st.liga !== "todas";
  const ligas = ligaUnica ? esp.ligas.filter((l) => l.id === st.liga) : esp.ligas;
  const tk = silencioso ? S.tkLista : novoTokenLista();

  // com uma competição escolhida, as setas pulam direto para o próximo dia com jogos
  let datasComJogos = [];
  if (ligaUnica) {
    if (!st.datas[st.liga]) {
      try {
        st.datas[st.liga] = (await api(`/e/${esp.id}/${st.liga}/datas`)).datas || [];
      } catch (_) {
        st.datas[st.liga] = [];
      }
    }
    datasComJogos = st.datas[st.liga];
  }
  if (tk !== S.tkLista) return;
  const anterior = [...datasComJogos].reverse().find((d) => d < st.data) || somarDias(st.data, -1);
  const proximo = datasComJogos.find((d) => d > st.data) || somarDias(st.data, 1);

  const conjunto = new Set(datasComJogos);
  const barra = barraData({
    data: st.data,
    anterior,
    proximo,
    hoje,
    temJogo: ligaUnica && conjunto.size ? (d) => conjunto.has(d) : null,
    aoMudar: (d) => {
      st.data = d;
      cancelar("lista");
      partidasDia(esp, false);
    },
  });
  if (!silencioso) lista().replaceChildren(barra, carregando());

  const respostas = await Promise.allSettled(ligas.map((l) => api(`/e/${esp.id}/${l.id}/jogos?de=${st.data}`)));
  if (tk !== S.tkLista) return;

  const falhas = [];
  const porLiga = [];
  let todosJogos = [];
  respostas.forEach((r, i) => {
    const liga = ligas[i];
    if (r.status === "rejected") {
      falhas.push(liga.nome);
      return;
    }
    if (!r.value.length) return;
    todosJogos = todosJogos.concat(r.value);
    porLiga.push({ liga, jogos: r.value });
  });

  const desenhar = () => {
    const grupos = porLiga
      .map(({ liga, jogos }) => ({ liga, jogos: jogos.filter(passaFiltro) }))
      .filter((g) => g.jogos.length)
      .map(({ liga, jogos }) =>
        h(
          "section",
          { class: "cartao grupo-liga" },
          cabecaGrupo({
            titulo: liga.nome,
            logo: jogos[0].liga_logo || null,
            sub: ligaUnica ? null : grupoDaLiga(liga),
            aoClicar: ligaUnica
              ? null
              : () => {
                  st.liga = liga.id;
                  guardar(`liga:${esp.id}`, liga.id);
                  irPara(esp.id, "jogos");
                },
            favorito: favLiga(esp, liga.id),
          }),
          jogos.map((j) => linhaPartida(esp, j, () => abrirPartida(esp, liga.id, j)))
        )
      );
    const partes = [barra, barraFiltro(todosJogos, desenhar)];
    if (grupos.length) partes.push(...grupos);
    else if (falhas.length === ligas.length) partes.push(caixaErro(new Error("Não foi possível falar com a ESPN agora."), () => partidasDia(esp, false)));
    else if (todosJogos.length) partes.push(vazio("Nenhum jogo com esse filtro."));
    else partes.push(vazio(ligaUnica ? "Nenhum jogo desta competição nesta data. Use as setas para ir ao próximo dia com jogos." : "Nenhum jogo nesta data."));
    if (falhas.length && falhas.length < ligas.length) partes.push(h("p", { class: "nota" }, `Não carregou agora: ${falhas.join(", ")}.`));
    lista().replaceChildren(...partes);
    marcarAtual(lista(), st.jogoAtual);
  };
  desenhar();

  if (todosJogos.some((j) => j.estado === 2)) agendar("lista", () => partidasDia(esp, true), 20000);
  else if (st.data === hoje && todosJogos.some((j) => j.estado === 1)) agendar("lista", () => partidasDia(esp, true), 60000);
}

function abrirPartida(esp, liga, jogo) {
  const st = estadoDe(esp.id);
  st.jogoAtual = jogo.id;
  marcarAtual(lista(), jogo.id);
  mostrarDetalhe();
  cancelar("detalhe");
  partidaDetalhe(esp, liga, jogo, false);
}

async function partidaDetalhe(esp, liga, jogoLista, silencioso) {
  const tk = silencioso ? S.tkDetalhe : novoTokenDetalhe();
  if (!silencioso) detalhe().replaceChildren(botaoVoltarMobile(), carregando());
  let r;
  try {
    r = await api(`/e/${esp.id}/${liga}/jogos/${jogoLista.id}`);
  } catch (erro) {
    if (tk === S.tkDetalhe && !silencioso) detalhe().replaceChildren(botaoVoltarMobile(), caixaErro(erro, () => partidaDetalhe(esp, liga, jogoLista, false)));
    return;
  }
  if (tk !== S.tkDetalhe) return;

  const j = r.jogo;
  const futebol = esp.id === "futebol";
  const [esq, dir] = ordemTimes(esp.id, j);
  const ladoDe = (timeId) => (String(timeId) === String(j.casa.id) ? "casa" : "fora");

  const abas = [{ id: "resumo", nome: "Resumo" }];
  if (r.estatisticas.length) abas.push({ id: "estatisticas", nome: "Estatísticas" });
  if (r.escalacoes.some((e) => e.titulares.length || e.reservas.length)) abas.push({ id: "escalacoes", nome: "Escalações" });
  if (r.jogadores.some((t) => t.grupos.length)) abas.push({ id: "jogadores", nome: "Jogadores" });
  const temPre = r.forma.length || r.confronto || r.lesionados.length || r.lideres.length;
  if (temPre) abas.push({ id: "pre", nome: j.estado === 1 ? "Pré-jogo" : "Retrospecto" });

  const chaveAba = `${esp.id}:${j.id}`;
  let aba = S.abaDetalhe[chaveAba];
  if (!abas.some((a) => a.id === aba)) aba = j.estado === 1 && temPre ? "pre" : "resumo";
  const area = h("div");
  let barra = abasDetalhe(abas, aba, trocar);

  function trocar(nova) {
    aba = nova;
    S.abaDetalhe[chaveAba] = nova;
    const nb = abasDetalhe(abas, aba, trocar);
    barra.replaceWith(nb);
    barra = nb;
    area.replaceChildren(...conteudoAba(nova));
  }

  function conteudoAba(id) {
    if (id === "estatisticas") return [secao(null, comparacaoEstatisticas(r.estatisticas, j, futebol))];
    if (id === "escalacoes") return escalacoesFutebol(esp, liga, r.escalacoes);
    if (id === "jogadores") return jogadoresNFL(esp, liga, r.jogadores);
    if (id === "pre") return preJogoEspn(esp, liga, r);
    const blocos = [];
    if (r.lances.length) blocos.push(secao(futebol ? "Lances" : "Pontuações", listaLances(r.lances, ladoDe, futebol, esp.id === "nfl")));
    else if (j.estado === 1) blocos.push(secao(null, h("p", { class: "nota" }, "Os lances aparecem aqui quando o jogo começar.")));
    blocos.push(secao("Onde assistir no Brasil", blocoTransmissao(j.transmissao)));
    const info = [
      ["Local", r.info.local],
      ["Público", r.info.publico ? Number(r.info.publico).toLocaleString("pt-BR") : null],
      ["Arbitragem", r.info.arbitragem.join(", ")],
      ["Rodada", j.nota || (j.semana ? `Semana ${j.semana}` : null)],
    ].filter(([, v]) => v);
    if (info.length) blocos.push(secao("Informações", h("ul", { class: "lista-simples" }, info.map(([k, v]) => h("li", null, h("span", { class: "sub" }, k), h("span", null, v))))));
    return blocos;
  }

  area.replaceChildren(...conteudoAba(aba));
  const favTime = (t) => (t.id ? { tipo: "time", esporte: esp.id, liga, id: String(t.id), nome: t.nome, logo: t.logo } : null);
  const placar = placarGrande({
    esquerda: { nome: esq.nome, logo: esq.logo, placar: placarComPenaltis(esq), sub: esq.campanha, aoClicar: () => abrirElenco(esp.id, liga, esq.id, esq.nome), favorito: favTime(esq) },
    direita: { nome: dir.nome, logo: dir.logo, placar: placarComPenaltis(dir), sub: dir.campanha, aoClicar: () => abrirElenco(esp.id, liga, dir.id, dir.nome), favorito: favTime(dir) },
    estado: j.estado,
    status: j.estado === 1 ? j.status || hora(j.inicio) || "A definir" : j.status,
    info: [j.liga_nome, diaHora(j.inicio)].filter(Boolean).join(", "),
  });
  detalhe().replaceChildren(botaoVoltarMobile(), h("section", { class: "cartao" }, placar, barra, area));

  if (j.estado === 2) agendar("detalhe", () => partidaDetalhe(esp, liga, jogoLista, true), 20000);
}

function numeroDe(texto) {
  const m = String(texto ?? "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function comparacaoEstatisticas(linhas, j, futebol) {
  const [esq, dir] = futebol ? ["casa", "fora"] : ["fora", "casa"];
  return h(
    "div",
    { class: "comparacao" },
    h("div", { class: "comparacao-topo", style: { fontWeight: 700 } }, h("span", null, j[esq].nome_curto || j[esq].nome), h("span", null, j[dir].nome_curto || j[dir].nome)),
    linhas.map((l) => {
      const a = numeroDe(l[esq]);
      const b = numeroDe(l[dir]);
      const total = (a || 0) + (b || 0);
      const pa = total ? ((a || 0) / total) * 100 : 0;
      const pb = total ? ((b || 0) / total) * 100 : 0;
      return h(
        "div",
        { class: "comparacao-linha" },
        h("div", { class: "comparacao-topo" }, h("strong", null, l[esq] ?? "–"), h("span", { class: "rotulo" }, l.rotulo), h("strong", null, l[dir] ?? "–")),
        a !== null && b !== null && total
          ? h("div", { class: "comparacao-barras" }, h("div", { class: "barra casa" }, h("i", { style: { width: `${pa}%` } })), h("div", { class: "barra fora" }, h("i", { style: { width: `${pb}%` } })))
          : null
      );
    })
  );
}

function iconeLance(tipo, futebol) {
  if (!futebol) return h("strong", null, tipo || "");
  const mapa = {
    gol: "⚽",
    gol_contra: "⚽",
    penalti_perdido: "✕",
    substituicao: "⇄",
    var: "VAR",
  };
  if (tipo === "amarelo") return h("span", { class: "cartao-amarelo", title: "Cartão amarelo" });
  if (tipo === "vermelho") return h("span", { class: "cartao-vermelho", title: "Cartão vermelho" });
  return h("span", { title: tipo }, mapa[tipo] || "•");
}

function listaLances(lances, ladoDe, futebol, foraPrimeiro) {
  return h(
    "ol",
    { class: "lances" },
    lances.map((l) => {
      let lado = ladoDe(l.time_id);
      if (foraPrimeiro) lado = lado === "casa" ? "fora" : "casa";
      const principal = futebol ? l.jogadores[0] || l.texto : l.texto;
      const detalheTexto = futebol
        ? l.tipo === "substituicao" && l.jogadores.length > 1
          ? `Entra ${l.jogadores[0]}, sai ${l.jogadores[1]}`
          : l.tipo === "gol" && l.jogadores[1]
            ? `Assistência de ${l.jogadores[1]}`
            : l.tipo === "gol_contra"
              ? "Gol contra"
              : null
        : l.placar;
      return h(
        "li",
        { class: `lance${lado === "fora" ? " fora" : ""}` },
        h("span", { class: "lance-tempo" }, l.tempo || ""),
        h("span", { class: "lance-icone" }, iconeLance(l.tipo, futebol)),
        h("span", { class: "lance-texto" }, futebol && l.tipo === "substituicao" ? "Substituição" : principal, detalheTexto ? h("span", { class: "sub" }, detalheTexto) : null)
      );
    })
  );
}

function escalacoesFutebol(esp, liga, escalacoes) {
  const ordenadas = [...escalacoes].sort((a, b) => (a.lado === "casa" ? -1 : b.lado === "casa" ? 1 : 0));
  const jogador = (p) =>
    h(
      "div",
      { class: "escalacao-jogador" },
      h("span", { class: "camisa" }, p.camisa || ""),
      h(
        "span",
        null,
        h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, p.id, p.nome) }, p.nome),
        p.posicao ? h("span", { class: "nota", style: { marginLeft: "6px" } }, p.posicao) : null
      ),
      h(
        "span",
        { class: "icones" },
        Number(p.gols) > 0 ? `⚽${Number(p.gols) > 1 ? `×${p.gols}` : ""} ` : null,
        Number(p.amarelos) > 0 ? h("span", { class: "cartao-amarelo", title: "Cartão amarelo" }) : null,
        Number(p.vermelhos) > 0 ? h("span", { class: "cartao-vermelho", title: "Cartão vermelho" }) : null,
        p.titular && p.saiu ? h("span", { title: "Substituído" }, " ↓") : null,
        !p.titular && p.entrou ? h("span", { title: "Entrou" }, " ↑") : null
      )
    );
  return [
    h(
      "div",
      { class: "secao duas-colunas" },
      ordenadas.map((e) =>
        h(
          "div",
          null,
          h("h3", null, e.time.nome, e.formacao ? h("span", { class: "nota", style: { marginLeft: "8px" } }, e.formacao) : null),
          e.titulares.length ? h("div", { class: "escalacao" }, e.titulares.map(jogador)) : h("p", { class: "nota" }, "Escalação ainda não divulgada."),
          e.reservas.length ? [h("p", { class: "nota", style: { fontWeight: 600 } }, "Reservas"), h("div", { class: "escalacao" }, e.reservas.map(jogador))] : null
        )
      )
    ),
  ];
}

function jogadoresNFL(esp, liga, times) {
  return times.map((t) =>
    secao(
      t.time.nome,
      t.grupos
        .filter((g) => g.atletas.length)
        .map((g) =>
          h(
            "div",
            { style: { marginBottom: "14px" } },
            h("p", { class: "nota", style: { fontWeight: 700, color: "var(--texto)" } }, g.nome),
            tabela(
              [
                { chave: "nome", nome: "Atleta", esq: true, valor: (a) => h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, a.id, a.nome) }, a.nome) },
                ...g.rotulos.map((r, i) => ({ chave: `c${i}`, nome: r, titulo: g.descricoes[i] || null, valor: (a) => a.valores[i] ?? "" })),
              ],
              g.atletas,
              { rodape: g.totais.length ? { nome: "Time", ...Object.fromEntries(g.totais.map((v, i) => [`c${i}`, v])) } : null }
            )
          )
        )
    )
  );
}

function preJogoEspn(esp, liga, r) {
  const blocos = [];
  if (r.forma.length) {
    blocos.push(
      secao(
        "Últimos jogos",
        h(
          "div",
          { class: "duas-colunas" },
          r.forma.map((f) =>
            h(
              "div",
              null,
              h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } }, h("strong", null, f.time.nome),
                h("div", { class: "forma" }, f.jogos.map((g) => h("span", { class: g.resultado || "" }, g.resultado || "?")))),
              h(
                "ul",
                { class: "lista-simples" },
                f.jogos.map((g) =>
                  h("li", null, h("span", { class: "sub" }, `${dataCurta(g.data)} ${g.local === "casa" ? "vs." : "@"} ${g.adversario || ""}`), h("span", { class: "numero" }, g.placar || ""))
                )
              )
            )
          )
        )
      )
    );
  }
  if (r.confronto && r.confronto.jogos.length) {
    blocos.push(
      secao(
        "Confronto direto",
        h("p", { class: "nota", style: { marginTop: 0 } }, `Resultados do ponto de vista de ${r.confronto.time.nome}.`),
        h(
          "ul",
          { class: "lista-simples" },
          r.confronto.jogos.map((g) =>
            h(
              "li",
              null,
              h("span", { class: "sub" }, [dataCurta(g.data), g.competicao].filter(Boolean).join(", ")),
              h("span", null, h("span", { class: "forma", style: { display: "inline-flex", marginRight: "6px" } }, h("span", { class: g.resultado || "" }, g.resultado || "?")), g.placar || "")
            )
          )
        )
      )
    );
  }
  if (r.lideres.length) {
    blocos.push(
      secao(
        "Destaques da temporada",
        h(
          "div",
          { class: "duas-colunas" },
          r.lideres.map((t) =>
            h(
              "div",
              null,
              h("strong", null, t.time.nome),
              h(
                "ul",
                { class: "lista-simples", style: { marginTop: "8px" } },
                t.categorias.map((c) =>
                  h(
                    "li",
                    null,
                    h("span", null, h("span", { class: "sub" }, `${c.nome}: `), h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, c.id, c.atleta) }, c.atleta)),
                    h("strong", { class: "numero" }, c.valor)
                  )
                )
              )
            )
          )
        )
      )
    );
  }
  if (r.lesionados.length) {
    blocos.push(
      secao(
        "Desfalques",
        h(
          "div",
          { class: "duas-colunas" },
          r.lesionados.map((t) =>
            h(
              "div",
              null,
              h("strong", null, t.time.nome),
              h(
                "ul",
                { class: "lista-simples", style: { marginTop: "8px" } },
                t.lista.map((l) => h("li", null, h("span", null, l.nome, l.posicao ? h("span", { class: "sub" }, ` ${l.posicao}`) : null), h("span", { class: "sub" }, [l.status, l.motivo].filter(Boolean).join(", "))))
              )
            )
          )
        )
      )
    );
  }
  blocos.push(secao("Onde assistir no Brasil", blocoTransmissao(r.jogo.transmissao)));
  return blocos;
}

/* ---------- Classificação (futebol, NFL, F1) ---------- */

async function classificacaoEspn(esp, liga) {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando());
  let c;
  try {
    c = await api(`/e/${esp.id}/${liga}/classificacao`);
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => classificacaoEspn(esp, liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  if (!c.grupos.length) {
    lista().replaceChildren(vazio("A classificação desta competição ainda não saiu."));
    return;
  }
  const preferidas = COLUNAS_CLASSIFICACAO[esp.id] || [];
  const cartoes = c.grupos.map((g) => {
    const existentes = new Set(g.colunas.map((col) => col.chave));
    let colunas = preferidas.filter(([chave]) => existentes.has(chave)).map(([chave, nome, titulo]) => ({ chave, nome, titulo }));
    if (colunas.length < 2) {
      colunas = g.colunas.filter((col) => !["rank", "rankChange"].includes(col.chave)).slice(0, 7).map((col) => ({ chave: col.chave, nome: col.sigla, titulo: col.nome }));
    }
    const zonas = new Map();
    g.linhas.forEach((l) => l.nota && l.cor_nota && zonas.set(l.nota, l.cor_nota));
    const linhas = g.linhas.map((l, i) => ({ ...l, _pos: l.rank ?? i + 1, _cor: l.cor_nota ? (l.cor_nota.startsWith("#") ? l.cor_nota : `#${l.cor_nota}`) : null }));
    // pilotos e times abrem o perfil ou o elenco; equipes da F1 não têm elenco na ESPN
    const clicavel = (l) =>
      l.tipo === "atleta" ? () => abrirAtleta(esp.id, liga, l.id, l.nome) : esp.tipo === "corrida" ? null : () => abrirElenco(esp.id, liga, l.id, l.nome);
    const nomeCelula = (l) => {
      const acao = clicavel(l);
      return acao ? h("button", { class: "botao-link", type: "button", onclick: acao }, l.nome) : h("span", null, l.nome);
    };
    return cartao(
      g.nome || "Classificação",
      tabela(
        [
          { nome: "#", valor: (l) => h("span", { class: "posicao" }, l._pos) },
          {
            nome: esp.tipo === "corrida" ? "Nome" : "Time",
            esq: true,
            valor: (l) =>
              h(
                "span",
                { class: "time-celula" },
                l.tipo === "atleta" ? imgBandeira(l.logo) : imgLogo(l.logo),
                nomeCelula(l),
                l.tipo === "time" && esp.tipo !== "corrida" ? botaoFavorito({ tipo: "time", esporte: esp.id, liga, id: String(l.id), nome: l.nome, logo: l.logo }) : null
              ),
          },
          ...colunas.map((col) => ({ nome: col.nome, titulo: col.titulo, destaque: ["points", "championshipPts"].includes(col.chave), valor: (l) => l.stats[col.chave] ?? "" })),
        ],
        linhas,
        { classeLinha: (l) => (l._cor ? "zona" : null) }
      ),
      zonas.size
        ? h("div", { class: "legenda" }, [...zonas].map(([nota, cor]) => h("span", { style: { "--cor-zona": cor.startsWith("#") ? cor : `#${cor}` } }, h("i"), nota)))
        : null
    );
  });
  const chaveCampeoes = esp.id === "futebol" ? `futebol:${liga}` : esp.id;
  lista().replaceChildren(h("div", { class: "grade-classificacao" }, h("div", null, ...cartoes), cartaoCampeoes(chaveCampeoes)));
}

/* ---------- Líderes: artilharia, assistências, cartões (futebol) e estatísticas da NFL ---------- */

async function lideresEspn(esp, liga) {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando("Somando os líderes da temporada…"));
  let l;
  try {
    l = await api(`/e/${esp.id}/${liga}/lideres`);
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => lideresEspn(esp, liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  const nomeLiga = (esp.ligas.find((x) => x.id === liga) || {}).nome || liga;
  const partes = [
    h(
      "div",
      { class: "cabeca-pagina" },
      h("h2", null, nomeLiga),
      l.temporada ? h("span", { class: "selo" }, `Temporada ${l.temporada}`) : null,
      l.temporada_anterior ? h("span", { class: "nota", style: { margin: 0 } }, "A temporada atual ainda não tem números; mostrando a última.") : null
    ),
  ];
  if (!l.categorias.length) {
    partes.push(vazio(l.aviso || "A ESPN ainda não publicou os líderes desta competição."));
  } else {
    partes.push(
      h(
        "div",
        { class: "grade-cartoes" },
        l.categorias.map((cat) =>
          cartao(
            cat.nome,
            h(
              "ol",
              { class: "ranking" },
              cat.lideres.map((j) =>
                h(
                  "li",
                  null,
                  h("span", { class: "lugar" }, j.posicao),
                  h(
                    "span",
                    null,
                    j.id ? h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, j.id, j.nome) }, j.nome) : j.nome,
                    j.time ? h("div", { class: "sub" }, h("span", { class: "time-celula" }, imgLogo(j.time_logo), j.time)) : null
                  ),
                  h("span", { class: "valor" }, j.valor ?? "")
                )
              )
            )
          )
        )
      )
    );
  }
  if (l.faltando && l.faltando.length && l.categorias.length) {
    partes.push(h("p", { class: "nota" }, `A ESPN não publica nesta competição: ${l.faltando.join(", ").toLowerCase()}.`));
  }
  lista().replaceChildren(...partes);
}

/* ---------- Eventos: F1 e UFC ---------- */

const ModuloEventos = {
  abas: (esp) =>
    esp.tipo === "corrida"
      ? [
          { id: "calendario", nome: "Calendário" },
          { id: "classificacao", nome: "Classificação" },
        ]
      : [
          { id: "calendario", nome: "Eventos" },
          { id: "ranking", nome: "Ranking" },
        ],

  lateral: (esp) => h("div", { class: "lateral-secao" }, h("div", { class: "lateral-acao" }, botaoFavorito(favLiga(esp, esp.ligas[0].id), { comTexto: true }))),

  textoVazio: () => "Escolha um evento para ver os detalhes.",

  desenhar(esp, aba) {
    const liga = esp.ligas[0].id;
    if (aba === "classificacao") {
      layoutLargo(true);
      return classificacaoEspn(esp, liga);
    }
    if (aba === "ranking") {
      layoutLargo(true);
      return rankingUfc(esp, liga);
    }
    return eventosLista(esp, liga);
  },
};

async function rankingUfc(esp, liga) {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando("Buscando o ranking de cada categoria…"));
  let r;
  try {
    r = await api(`/e/${esp.id}/${liga}/ranking`);
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => rankingUfc(esp, liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  if (!r.categorias.length) {
    lista().replaceChildren(vazio("A ESPN não publicou o ranking agora."));
    return;
  }
  const movimento = (l) => {
    if (l.anterior === null || l.anterior === undefined || l.posicao === null || l.posicao === undefined || l.campeao) return h("span");
    if (l.anterior > l.posicao) return h("span", { class: "movimento subiu", title: `Antes: ${l.anterior}º` }, `▲ ${l.anterior}º`);
    if (l.anterior < l.posicao) return h("span", { class: "movimento desceu", title: `Antes: ${l.anterior}º` }, `▼ ${l.anterior}º`);
    return h("span", { class: "movimento" }, "=");
  };
  lista().replaceChildren(
    h(
      "div",
      { class: "grade-cartoes" },
      r.categorias.map((cat) =>
        cartao(
          cat.nome,
          h(
            "ol",
            { class: "ranking" },
            cat.lutadores.map((l) =>
              h(
                "li",
                { class: l.campeao ? "campeao" : null },
                h("span", { class: "lugar" }, l.campeao ? "C" : l.posicao ?? ""),
                h(
                  "span",
                  null,
                  imgBandeira(l.bandeira, l.pais),
                  l.id ? h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, l.id, l.nome) }, l.nome) : l.nome,
                  l.campeao ? h("div", { class: "sub" }, "Campeão") : l.cartel ? h("div", { class: "sub" }, `Cartel ${l.cartel}`) : null
                ),
                movimento(l)
              )
            )
          )
        )
      )
    )
  );
}

registrarModulo("corrida", ModuloEventos);
registrarModulo("luta", ModuloEventos);

function caixaData(iso) {
  const ymd = dataBR(iso);
  if (!ymd) return h("div", { class: "evento-data" }, "?");
  const d = meioDia(ymd);
  return h(
    "div",
    { class: "evento-data" },
    h("div", { class: "dia" }, d.getUTCDate()),
    h("div", { class: "mes" }, d.toLocaleDateString("pt-BR", { timeZone: "UTC", month: "short" }).replace(".", ""))
  );
}

function rotuloEstadoEvento(estado) {
  return estado === 3 ? "Encerrado" : estado === 2 ? "Acontecendo agora" : "Próximo";
}

async function eventosLista(esp, liga) {
  const st = estadoDe(esp.id);
  const tk = novoTokenLista();
  let cal;
  try {
    cal = await api(`/e/${esp.id}/${liga}/eventos`);
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => eventosLista(esp, liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  if (!cal.eventos.length) {
    lista().replaceChildren(vazio("O calendário da temporada ainda não saiu."));
    return;
  }
  st.eventos = cal.eventos;
  const linhas = cal.eventos.map((ev, i) =>
    h(
      "button",
      {
        class: `evento${ev.estado === 3 ? " passado" : ""}`,
        type: "button",
        dataset: { id: ev.id },
        "aria-current": ev.id === st.eventoAtual ? "true" : null,
        onclick: () => abrirEvento(esp, liga, ev),
      },
      caixaData(ev.inicio),
      h("div", null, h("div", { class: "evento-nome" }, ev.nome), h("div", { class: "evento-sub" }, rotuloEstadoEvento(ev.estado))),
      esp.tipo === "corrida" ? h("span", { class: "nota", style: { margin: 0 } }, `${i + 1}ª etapa`) : h("span")
    )
  );
  lista().replaceChildren(h("div", { class: "cartao" }, linhas));

  const atual = cal.eventos[cal.atual] || cal.eventos[cal.eventos.length - 1];
  const linhaAtual = lista().querySelector(`[data-id="${atual.id}"]`);
  if (linhaAtual) linhaAtual.scrollIntoView({ block: "center" });
  if (!st.eventoAtual && window.matchMedia("(min-width: 861px)").matches) abrirEvento(esp, liga, atual);
  else if (st.eventoAtual && window.matchMedia("(min-width: 861px)").matches) {
    const anterior = cal.eventos.find((e) => e.id === st.eventoAtual);
    if (anterior) abrirEvento(esp, liga, anterior);
  }
}

function abrirEvento(esp, liga, ev) {
  const st = estadoDe(esp.id);
  st.eventoAtual = ev.id;
  marcarAtual(lista(), ev.id);
  mostrarDetalhe();
  cancelar("detalhe");
  eventoDetalhe(esp, liga, ev, false);
}

async function eventoDetalhe(esp, liga, ev, silencioso) {
  const tk = silencioso ? S.tkDetalhe : novoTokenDetalhe();
  if (!silencioso) detalhe().replaceChildren(botaoVoltarMobile(), carregando());
  let e;
  try {
    e = await api(`/e/${esp.id}/${liga}/eventos/${ev.id}?data=${ev.data}`);
  } catch (erro) {
    if (tk === S.tkDetalhe && !silencioso) detalhe().replaceChildren(botaoVoltarMobile(), caixaErro(erro, () => eventoDetalhe(esp, liga, ev, false)));
    return;
  }
  if (tk !== S.tkDetalhe) return;

  const cabeca = h(
    "div",
    { class: "secao" },
    h("h2", { class: "perfil-nome", style: { fontSize: "28px" } }, e.nome),
    h("p", { class: "nota" }, [e.local, diaHora(e.inicio)].filter(Boolean).join(", "))
  );
  let corpo;
  let aoVivo = false;
  if (esp.tipo === "corrida") {
    aoVivo = e.sessoes.some((x) => x.estado === 2);
    corpo = e.sessoes.length ? e.sessoes.map((x) => sessaoF1(esp, liga, x)) : [secao(null, h("p", { class: "nota" }, "Os horários das sessões ainda não saíram."))];
  } else {
    aoVivo = e.lutas.some((x) => x.estado === 2);
    corpo = [
      secao("Onde assistir no Brasil", blocoTransmissao(e.transmissao)),
      ...(e.lutas.length ? e.lutas.map((l) => cartaoLuta(l, (id, nome) => abrirAtleta(esp.id, liga, id, nome))) : [secao(null, h("p", { class: "nota" }, "O card ainda não saiu."))]),
    ];
  }
  detalhe().replaceChildren(botaoVoltarMobile(), h("section", { class: "cartao" }, cabeca, ...corpo));
  if (aoVivo) agendar("detalhe", () => eventoDetalhe(esp, liga, ev, true), 30000);
}

function sessaoF1(esp, liga, x) {
  const tempo = (r) => r.info.totalTime || r.info.behindTime || r.info.time || r.info.lapTime || r.info.Q3 || r.info.Q2 || r.info.Q1 || "";
  return h(
    "div",
    { class: "sessao" },
    h(
      "div",
      { class: "sessao-topo" },
      h("div", null, h("h3", null, x.nome), h("div", { class: "sub" }, diaHora(x.inicio) || "Horário a definir")),
      h("span", { class: `selo${x.estado === 2 ? " confirmado" : ""}` }, x.estado === 3 ? "Encerrada" : x.estado === 2 ? "Ao vivo" : "Programada")
    ),
    h(
      "div",
      { class: "sessao-corpo" },
      x.estado !== 3 ? blocoTransmissao(x.transmissao) : null,
      x.resultados.length && x.estado >= 2
        ? tabela(
            [
              { nome: "Pos.", valor: (r) => r.posicao ?? "" },
              { nome: "Piloto", esq: true, valor: (r) => h("span", null, imgBandeira(r.bandeira, r.pais), h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, r.id, r.nome) }, r.nome)) },
              { nome: "Equipe", esq: true, valor: (r) => r.equipe || "" },
              { nome: "Tempo", valor: (r) => tempo(r) },
            ],
            x.resultados.slice(0, 22)
          )
        : null
    )
  );
}

function cartaoLuta(l, abrir) {
  const lutador = (p, direita) =>
    p
      ? h(
          "div",
          { class: `lutador${direita ? " direita" : ""}${p.vencedor ? " venceu" : ""}` },
          h("span", null, imgBandeira(p.bandeira, p.pais), p.id ? h("button", { class: "botao-link nome", type: "button", onclick: () => abrir(p.id, p.nome) }, p.nome) : h("span", { class: "nome" }, p.nome)),
          p.cartel ? h("span", { class: "sub" }, `Cartel ${p.cartel}`) : null
        )
      : h("div");
  const [a, b] = l.lutadores;
  const resultado = l.estado === 3 && l.resultado ? [l.resultado, l.round ? `${l.round}º round` : null, l.tempo].filter(Boolean).join(", ") : null;
  return h(
    "div",
    { class: "luta" },
    h("div", { class: "luta-topo" }, h("span", null, l.card || ""), h("span", null, [l.categoria, l.titulo].filter(Boolean).join(", "))),
    h("div", { class: "luta-lutadores" }, lutador(a, false), h("span", { class: "luta-x" }, "x"), lutador(b, true)),
    resultado ? h("div", { class: "luta-resultado" }, resultado) : l.estado === 2 ? h("div", { class: "luta-resultado", style: { color: "var(--ao-vivo)" } }, "Acontecendo agora") : null
  );
}

/* ---------- Boxe ---------- */

registrarModulo("boxe", {
  abas: () => [{ id: "eventos", nome: "Eventos" }],
  textoVazio: () => "Escolha uma noite de lutas para ver o card.",
  desenhar: (esp) => boxeLista(esp),
});

async function boxeLista(esp) {
  const st = estadoDe(esp.id);
  const tk = novoTokenLista();
  let eventos;
  try {
    eventos = await api("/boxe/eventos");
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => boxeLista(esp)));
    return;
  }
  if (tk !== S.tkLista) return;
  if (!eventos.length) {
    lista().replaceChildren(vazio("Nenhuma luta cadastrada. Adicione os eventos em boxe_eventos.json."));
    return;
  }
  const proximos = eventos.filter((e) => e.estado !== 3);
  const passados = eventos.filter((e) => e.estado === 3).reverse();
  const linha = (ev) =>
    h(
      "button",
      { class: `evento${ev.estado === 3 ? " passado" : ""}`, type: "button", dataset: { id: ev.id }, onclick: () => boxeAbrir(esp, ev) },
      caixaData(ev.inicio || `${ev.data}T15:00:00Z`),
      h("div", null, h("div", { class: "evento-nome" }, ev.nome), h("div", { class: "evento-sub" }, [ev.local, ev.inicio ? hora(ev.inicio) : "Horário a definir"].filter(Boolean).join(", "))),
      canalNaLista(ev.transmissao, true)
    );
  // replaceChildren não aceita listas dentro de listas: monta tudo numa lista só
  const partes = [];
  if (proximos.length) partes.push(h("p", { class: "titulo-dia" }, "Próximas lutas"), h("div", { class: "cartao" }, proximos.map(linha)));
  if (passados.length) partes.push(h("p", { class: "titulo-dia", style: { marginTop: "16px" } }, "Já aconteceram"), h("div", { class: "cartao" }, passados.map(linha)));
  partes.push(h("p", { class: "nota" }, "A agenda de boxe vem do arquivo boxe_eventos.json. Depois de cada luta, anote o vencedor e o resultado nele."));
  lista().replaceChildren(...partes);
  const inicial = eventos.find((e) => e.id === st.eventoAtual) || proximos[0];
  if (inicial && window.matchMedia("(min-width: 861px)").matches) boxeAbrir(esp, inicial);
}

function boxeAbrir(esp, ev) {
  estadoDe(esp.id).eventoAtual = ev.id;
  marcarAtual(lista(), ev.id);
  mostrarDetalhe();
  const lutas = ev.lutas.map((l) => ({
    estado: ev.estado,
    card: null,
    categoria: l.categoria,
    titulo: l.titulo,
    resultado: l.resultado,
    lutadores: l.lutadores.map((nome) => ({ nome, vencedor: Boolean(l.vencedor) && l.vencedor === nome })),
  }));
  detalhe().replaceChildren(
    botaoVoltarMobile(),
    h(
      "section",
      { class: "cartao" },
      h("div", { class: "secao" }, h("h2", { class: "perfil-nome", style: { fontSize: "28px" } }, ev.nome), h("p", { class: "nota" }, [ev.local, ev.inicio ? diaHora(ev.inicio) : dataLonga(ev.data)].filter(Boolean).join(", "))),
      secao("Onde assistir no Brasil", blocoTransmissao(ev.transmissao)),
      ...lutas.map((l) => cartaoLuta(l, () => {}))
    )
  );
}