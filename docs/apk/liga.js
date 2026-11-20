"use strict";

/* =========================================================================
   Página da liga, como a página de torneio do Sofascore:
   - o cabeçalho (escudo, nome, "país · temporada" e a barra da temporada com as datas);
   - a aba Detalhes: jogos em destaque, os melhores da temporada, números da temporada,
     títulos e a divisão de cima ou de baixo.
   As regras (temporada, destaques, resumo) ficam em liga_regras.js. O escudo e as datas vêm da rota
   /datas do celular; no PC, sem esses dados, o cabeçalho fica só com o nome.
   ========================================================================= */

/** O cabeçalho da liga. Aparece na hora com o nome; o escudo, a temporada e a barra chegam depois. */
function cabecaLiga(esp, ligaId) {
  const liga = (esp.ligas || []).find((l) => l.id === ligaId) || { id: ligaId, nome: esp.nome };
  // no futebol, o país ou o grupo ("Brasil", "Europa"); nos outros, o nome do esporte já está no título
  const lugar = esp.id === "futebol" ? grupoDaLiga(liga) : null;
  const escudo = h("span", { class: "cabeca-liga-escudo logo-vazio", "aria-hidden": "true" });
  const sub = h("p", { class: "cabeca-liga-sub" }, lugar || esp.nome);
  const barra = h("div", { class: "cabeca-liga-barra", hidden: true });
  const caixa = h(
    "section",
    { class: "cabeca-liga" },
    h("div", { class: "cabeca-liga-linha" }, escudo, h("div", { class: "cabeca-liga-texto" }, h("h2", null, liga.nome), sub)),
    barra
  );
  let pedido = null;
  if (esp.tipo === "partidas") pedido = api(`/e/${esp.id}/${ligaId}/datas`).then((r) => r && r.liga);
  // Kings League: o escudo e a temporada vêm do kings.json
  else if (esp.tipo === "kings") {
    pedido = api("/kings").then((cs) => {
      const c = cs.find((x) => x.id === ligaId);
      return c ? { logo: c.logo, temporada: c.temporada, inicio: c.inicio, fim: c.fim } : null;
    });
  }
  if (!pedido) return caixa;
  pedido
    .then((info) => {
      if (!info) return;
      if (info.logo) escudo.replaceWith(h("img", { class: "cabeca-liga-escudo", src: Visual.imagemPequena(info.logo, 128), alt: "", onerror: (e) => e.target.remove() }));
      if (info.temporada) sub.textContent = lugar ? `${lugar} · ${info.temporada}` : `Temporada ${info.temporada}`;
      const p = Visual.progressoTemporada(info.inicio, info.fim);
      if (p) {
        const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: FUSO });
        barra.replaceChildren(
          h("div", { class: "barra-temporada-trilho", role: "img", "aria-label": `Temporada ${p.pct}% concluída` }, h("i", { style: { width: `${p.pct}%` } })),
          h("div", { class: "barra-temporada-datas" }, h("span", null, data(p.inicio)), h("span", null, data(p.fim)))
        );
        barra.hidden = false;
      }
    })
    .catch(() => {
      /* sem a rota (PC) ou sem rede: fica só o nome */
    });
  return caixa;
}

/** Troca a aba da página da liga aberta (o "Ver tudo" dos destaques leva para Estatísticas). */
function trocarAbaDaLiga(aba) {
  const p = Navegacao.topo();
  if (p && p.tipo === "liga" && p.trocarAba) p.trocarAba(aba);
}

/** Os dias de jogo a buscar para os destaques: o próximo e o último (ou a semana atual e a anterior, na NFL). */
function periodosDosDestaques(datas, hoje) {
  if (datas && datas.tipo === "semanas" && datas.semanas && datas.semanas.length) {
    const i = datas.atual ?? datas.semanas.length - 1;
    return [datas.semanas[i], datas.semanas[i - 1]].filter(Boolean).map((s) => ({ de: s.de, ate: s.ate }));
  }
  const { proxima, anterior } = Liga.datasDosDestaques((datas && datas.datas) || [], hoje);
  const dias = [...new Set([proxima, anterior].filter(Boolean))];
  return (dias.length ? dias : [hoje]).map((d) => ({ de: d, ate: d }));
}

/** A aba Detalhes. Cada bloco aparece quando o dado dele chega (os líderes demoram mais). */
async function ligaDetalhes(esp, liga) {
  const tk = novoTokenLista();
  const vivo = () => tk === S.tkLista;
  const blocoJogos = h("div", null, carregando());
  const blocoMelhores = h("div");
  const blocoTemporada = h("div");
  const blocoTitulos = h("div");
  const blocoDivisoes = h("div");
  lista().replaceChildren(h("div", { class: "detalhes-liga" }, blocoJogos, blocoMelhores, blocoTemporada, blocoTitulos, blocoDivisoes));

  // divisões: sem pedido nenhum
  const div = Liga.divisoes(esp.id, liga);
  const nomeDe = (id) => ((esp.ligas || []).find((l) => l.id === id) || {}).nome || id;
  const botoesDivisao = [
    div.superior ? ["Divisão superior", div.superior] : null,
    div.inferior ? ["Divisão inferior", div.inferior] : null,
  ].filter(Boolean);
  if (botoesDivisao.length) {
    blocoDivisoes.replaceChildren(
      cartao(
        "Divisões",
        h(
          "div",
          { class: "divisoes-liga" },
          botoesDivisao.map(([rotulo, id]) =>
            h("button", { class: "divisao-liga", type: "button", onclick: () => irPara(esp.id, "classificacao", id) }, h("span", { class: "nota" }, rotulo), h("strong", null, nomeDe(id)))
          )
        )
      )
    );
  }

  // títulos (arquivo local, rápido)
  const chaveCampeoes = esp.id === "futebol" ? `futebol:${liga}` : esp.id;
  campeoesDe(chaveCampeoes)
    .then((campeoes) => {
      if (!vivo() || !campeoes.length) return;
      const maior = Liga.maisTitulos(campeoes);
      blocoTitulos.replaceChildren(
        cartao(
          "Títulos",
          h(
            "ul",
            { class: "lista-simples" },
            campeoes.slice(0, 5).map((c, i) =>
              h("li", null, h("span", { class: "sub" }, c.temporada), h("span", { style: { textAlign: "right" } }, h("strong", null, c.campeao), i === 0 ? h("span", { class: "sub" }, " · último campeão") : null))
            )
          ),
          maior ? h("p", { class: "nota" }, `Mais títulos nesta lista: ${maior.nome} (${maior.titulos})`) : null
        )
      );
    })
    .catch(() => {});

  // números da temporada (futebol, pela classificação)
  if (esp.id === "futebol") {
    api(`/e/${esp.id}/${liga}/classificacao`)
      .then((c) => {
        const r = vivo() && Liga.resumoTemporada(c.grupos);
        if (!r) return;
        const fato = (rotulo, valor) => h("div", { class: "fato" }, h("dt", null, rotulo), h("dd", null, valor));
        blocoTemporada.replaceChildren(
          cartao(
            "Números da temporada",
            h(
              "dl",
              { class: "fatos blocos" },
              fato("Gols", r.gols.toLocaleString("pt-BR")),
              fato("Média de gols", r.media.toLocaleString("pt-BR", { minimumFractionDigits: 2 })),
              fato("Jogos", r.jogos.toLocaleString("pt-BR")),
              fato("Empates", `${r.empatesPct}%`),
              fato("Times", r.equipes)
            )
          )
        );
      })
      .catch(() => {});
  }

  // os melhores: os 3 primeiros da primeira categoria de líderes
  api(`/e/${esp.id}/${liga}/lideres`)
    .then((l) => {
      const cat = vivo() && l.categorias && l.categorias[0];
      if (!cat || !cat.lideres.length) return;
      blocoMelhores.replaceChildren(
        cartao(
          h("div", { class: "cabeca-com-acao" }, h("h3", null, cat.nome), h("button", { class: "botao-link", type: "button", onclick: () => trocarAbaDaLiga("lideres") }, "Ver tudo")),
          h(
            "ol",
            { class: "ranking" },
            cat.lideres.slice(0, 3).map((j) =>
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
      );
    })
    .catch(() => {});

  // jogos em destaque: ao vivo, próximos e últimos resultados
  let datas = null;
  try {
    datas = await api(`/e/${esp.id}/${liga}/datas`);
  } catch (_) {
    /* sem calendário: só hoje */
  }
  if (!vivo()) return;
  const periodos = periodosDosDestaques(datas, hojeBR());
  const respostas = await Promise.all(periodos.map((p) => api(`/e/${esp.id}/${liga}/jogos?de=${p.de}${p.ate !== p.de ? `&ate=${p.ate}` : ""}`).catch(() => [])));
  if (!vivo()) return;
  const vistos = new Set();
  const jogos = respostas.flat().filter((j) => !vistos.has(j.id) && vistos.add(j.id));
  const d = Liga.destaques(jogos, 3);
  const grupo = (titulo, lista) =>
    lista.length
      ? h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo }), lista.map((j) => linhaPartida(esp, j, () => abrirPartida(esp, liga, j), liga)))
      : null;
  const partes = [grupo("Ao vivo", d.aoVivo), grupo("Próximos jogos", d.proximos), grupo("Últimos resultados", d.ultimos)].filter(Boolean);
  blocoJogos.replaceChildren(...(partes.length ? partes : [vazio("Sem jogos perto de hoje nesta competição.")]));
  if (d.aoVivo.length) agendar("lista", () => ligaDetalhesJogos(esp, liga, blocoJogos, periodos, tk), 30000);
}

/** Atualiza só os jogos em destaque (com jogo ao vivo), sem redesenhar o resto da aba. */
async function ligaDetalhesJogos(esp, liga, blocoJogos, periodos, tk) {
  if (tk !== S.tkLista || !blocoJogos.isConnected) return;
  const respostas = await Promise.all(periodos.map((p) => api(`/e/${esp.id}/${liga}/jogos?de=${p.de}${p.ate !== p.de ? `&ate=${p.ate}` : ""}`).catch(() => [])));
  if (tk !== S.tkLista || !blocoJogos.isConnected) return;
  const vistos = new Set();
  const d = Liga.destaques(respostas.flat().filter((j) => !vistos.has(j.id) && vistos.add(j.id)), 3);
  const grupo = (titulo, lista) =>
    lista.length ? h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo }), lista.map((j) => linhaPartida(esp, j, () => abrirPartida(esp, liga, j), liga))) : null;
  const partes = [grupo("Ao vivo", d.aoVivo), grupo("Próximos jogos", d.proximos), grupo("Últimos resultados", d.ultimos)].filter(Boolean);
  if (partes.length) blocoJogos.replaceChildren(...partes);
  if (d.aoVivo.length) agendar("lista", () => ligaDetalhesJogos(esp, liga, blocoJogos, periodos, tk), 30000);
}
