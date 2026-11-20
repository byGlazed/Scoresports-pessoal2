"use strict";

/* =========================================================================
   Kings League (Kings League Brasil e os Mundiais): a lista do dia (chip "Kings League" e "Todos"),
   a página do jogo (placar de cada tempo, pênaltis e o vídeo no YouTube) e a página da liga
   (jogos por rodada e a classificação dos grupos).
   Os dados vêm de dados/kings.json (o robô lê o kingsleague.pro: robo/kings.py), pela rota /kings
   do celular; as regras ficam em kings_regras.js.
   ========================================================================= */

const KINGS_TRANSMISSAO = "YouTube";

function abrirPartidaKings(j) {
  const st = estadoDe("kings");
  st.jogoAtual = j.id;
  marcarAtual(lista(), j.id);
  Navegacao.abrir({ tipo: "jogo", params: { esporte: "kings", liga: j.competicao, id: String(j.id) }, jogo: j });
}

function linhaPartidaKings(j, aoClicar) {
  return botaoJogo({
    id: j.id,
    estado: j.estado,
    status: j.estado === 1 ? [hora(j.inicio) || "A definir"] : [j.status],
    atual: j.id === estadoDe("kings").jogoAtual,
    transmissao: j.video || j.estado === 1 ? { canais: [KINGS_TRANSMISSAO], confirmado: Boolean(j.video) } : null,
    mostrarPadrao: true,
    aoClicar,
    times: [j.casa, j.fora].map((t, i) => ({ nome: t.nome, logo: t.logo, placar: j.estado >= 2 ? t.placar : null, perdeu: j.estado === 3 && j.vencedor !== null && j.vencedor !== i })),
  });
}

function grupoKings(comp, jogos) {
  return h(
    "section",
    { class: "cartao grupo-liga" },
    cabecaGrupo({ titulo: comp.nome, chave: `kings:${comp.id}`, logo: comp.logo || null, aoClicar: () => irPara("kings", "jogos", comp.id), jogos }),
    jogos.map((j) => linhaPartidaKings(j, () => abrirPartidaKings(j)))
  );
}

/** Os grupos da Kings League para a lista "Todos" (no formato de gruposDoEsporte). */
async function gruposKings(data) {
  const comps = await api("/kings");
  return Kings.doDia(comps, data).map((g, i) => ({
    chave: `kings:${g.competicao.id}`,
    esporte: "kings",
    ordem: i,
    aoVivo: g.jogos.some((j) => j.estado === 2),
    jogos: g.jogos,
    desenhar: (visiveis) => grupoKings(g.competicao, visiveis),
  }));
}

/** O chip Kings League: o dia escolhido (os dias sem jogo ficam apagados) e os jogos por competição. */
async function kingsLista(silencioso) {
  const st = estadoDe("kings");
  const hoje = hojeBR();
  if (!st.data) st.data = JOGOS.data || hoje;
  const tk = silencioso ? S.tkLista : novoTokenLista();
  if (!silencioso) lista().replaceChildren(carregando());
  let comps;
  try {
    comps = await api("/kings");
  } catch (erro) {
    if (tk === S.tkLista && !silencioso) lista().replaceChildren(caixaErro(erro, () => kingsLista(false)));
    return;
  }
  if (tk !== S.tkLista) return;
  const diasComJogo = new Set(comps.flatMap((c) => (c.jogos || []).map((j) => Kings.dataBR(j.inicio))));
  const barra = barraData({
    data: st.data,
    anterior: somarDias(st.data, -1),
    proximo: somarDias(st.data, 1),
    hoje,
    temJogo: (d) => diasComJogo.has(d),
    aoMudar: (d) => {
      st.data = d;
      cancelar("lista");
      kingsLista(false);
    },
  });
  const grupos = Kings.doDia(comps, st.data);
  const todos = grupos.flatMap((g) => g.jogos);
  const desenhar = () => {
    const cartoes = grupos.map((g) => ({ g, visiveis: g.jogos.filter(passaFiltro) })).filter((x) => x.visiveis.length).map(({ g, visiveis }) => grupoKings(g.competicao, visiveis));
    const partes = [barra, barraFiltro(todos, desenhar)];
    if (cartoes.length) partes.push(...cartoes);
    else partes.push(vazio(todos.length ? "Nenhum jogo com esse filtro." : "Nenhum jogo da Kings League nesta data."));
    // o próximo jogo de cada competição em andamento, para achar o dia
    if (!todos.length) {
      for (const c of comps) {
        const p = Kings.proximoJogo(c, new Date().toISOString());
        if (p) partes.push(h("p", { class: "nota" }, `${c.nome}: próximo jogo ${p.rodada.toLowerCase()}, ${diaHora(p.inicio)}.`));
      }
    }
    lista().replaceChildren(...partes);
    marcarAtual(lista(), st.jogoAtual);
  };
  desenhar();
  // com jogo ao vivo o placar vem do repasse (30 s); perto da hora, confere a cada minuto
  if (todos.some((j) => j.estado === 2)) agendar("lista", () => kingsLista(true), 30000);
  else if (comps.some((c) => Kings.temJogoPerto(c, Date.now()))) agendar("lista", () => kingsLista(true), 60000);
}

/** A página do jogo: o placar, o de cada tempo, os pênaltis, a rodada e o vídeo no YouTube. */
async function kingsPartida(liga, id, silencioso, jogoLista) {
  const tk = silencioso ? S.tkDetalhe : novoTokenDetalhe();
  let j = jogoLista && String(jogoLista.id) === String(id) ? jogoLista : null;
  let comp = null;
  try {
    const comps = await api("/kings");
    comp = comps.find((c) => c.id === liga) || null;
    const bruto = comp && (comp.jogos || []).find((x) => String(x.id) === String(id));
    if (bruto) j = Kings.jogoDoApp(comp, bruto);
  } catch (erro) {
    if (!j) {
      if (tk === S.tkDetalhe) detalhe().replaceChildren(caixaErro(erro, () => kingsPartida(liga, id, false)));
      return;
    }
  }
  if (tk !== S.tkDetalhe) return;
  if (!j) {
    detalhe().replaceChildren(vazio("Jogo não encontrado."));
    return;
  }
  const info = [j.competicao_nome || (comp && comp.nome), j.rodada, j.grupo && /^[A-Z]$/.test(j.grupo) ? `Grupo ${j.grupo}` : null].filter(Boolean).join(" · ");
  // os autores dos gols (nos Mundiais, das súmulas da Wikipédia): embaixo de cada time, como no futebol
  const autores = Kings.autoresDosGols(j);
  const placar = placarGrande({
    esquerda: { nome: j.casa.nome, logo: j.casa.logo, placar: j.casa.placar, gols: autores.casa, aoClicar: j.casa.id ? () => abrirTimeKings(liga, j.casa) : null },
    direita: { nome: j.fora.nome, logo: j.fora.logo, placar: j.fora.placar, gols: autores.fora, aoClicar: j.fora.id ? () => abrirTimeKings(liga, j.fora) : null },
    estado: j.estado,
    status: j.estado === 1 ? hora(j.inicio) || "A definir" : j.status,
    info,
  });
  const pilula = diaHora(j.inicio) ? h("div", { class: "pilula-data" }, h("span", null, diaHora(j.inicio))) : null;
  const partes = [h("section", { class: "cartao" }, pilula, placar)];
  const linhas = [
    ...j.tempos.map((t, i) => [`${i + 1}º tempo`, `${t[0]} – ${t[1]}`]),
    j.penaltis ? ["Pênaltis (Shootouts)", `${j.penaltis[0]} – ${j.penaltis[1]}`] : null,
  ].filter(Boolean);
  if (linhas.length) {
    partes.push(cartao("Placar por tempo", h("ul", { class: "lista-simples" }, linhas.map(([r, v]) => h("li", null, h("span", { class: "sub" }, r), h("strong", null, v))))));
  }
  partes.push(
    cartao(
      "Onde assistir",
      j.video
        ? h("a", { class: "botao botao-principal", href: j.video, target: "_blank", rel: "noopener" }, "Assistir no YouTube")
        : h("p", { class: "nota", style: { margin: 0 } }, "A Kings League passa ao vivo no YouTube da liga e nos canais dos presidentes dos times. O link do jogo aparece aqui quando a liga publicar.")
    )
  );
  if (j.estado === 3 && j.penaltis) partes.push(h("p", { class: "nota" }, "Na Kings League o empate vai para os pênaltis (Shootouts), e os gols da disputa não entram no placar."));
  if (j.estado === 3 && !j.gols.length && j.competicao === "brazil") {
    partes.push(h("p", { class: "nota" }, "Os autores dos gols da Kings League Brasil só aparecem na página de cada jogo do site da liga, que ele não deixa ler automaticamente."));
  }
  if (j.gols.length) partes.push(h("p", { class: "nota" }, "Autores dos gols: súmulas da Wikipédia em inglês."));
  detalhe().replaceChildren(...partes);
  if (j.estado === 2) agendar("detalhe", () => kingsPartida(liga, id, true, j), 30000);
}

/** A aba Jogos da liga: todos os jogos da temporada, por rodada; abre na rodada atual. */
async function kingsJogosDaLiga(liga) {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando());
  let comps;
  try {
    comps = await api("/kings");
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => kingsJogosDaLiga(liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  const comp = comps.find((c) => c.id === liga);
  if (!comp) {
    lista().replaceChildren(vazio("Competição não encontrada."));
    return;
  }
  const porRodada = new Map();
  for (const j of (comp.jogos || []).map((x) => Kings.jogoDoApp(comp, x))) {
    if (!porRodada.has(j.rodada)) porRodada.set(j.rodada, []);
    porRodada.get(j.rodada).push(j);
  }
  const secoes = [...porRodada.entries()].map(([rodada, jogos]) =>
    h(
      "section",
      { class: "cartao grupo-liga", dataset: { aberta: String(jogos.some((j) => j.estado !== 3)) } },
      cabecaGrupo({ titulo: rodada, sub: dataCurta(jogos[0].data) }),
      jogos.map((j) => linhaPartidaKings(j, () => abrirPartidaKings(j)))
    )
  );
  lista().replaceChildren(
    h("p", { class: "nota" }, `${comp.temporada || comp.nome}${comp.encerrada ? " (encerrada)" : ""}`),
    ...(secoes.length ? secoes : [vazio("Ainda não há jogos nesta temporada.")])
  );
  // abre na rodada que ainda tem jogo a disputar
  const atual = secoes.find((s) => s.dataset.aberta === "true");
  if (atual) requestAnimationFrame(() => atual.scrollIntoView({ block: "start" }));
}

function abrirTimeKings(liga, t) {
  if (!t || !t.id) return;
  Navegacao.abrir({ tipo: "time", params: { esporte: "kings", liga, id: String(t.id) }, nome: t.nome });
}

/** A tabela de um grupo (destaque: o time da página do time). O nome do time abre a página dele. */
function tabelaGrupoKings(liga, g, destaqueId = null) {
  return tabela(
    [
      { nome: "#", valor: (l, i) => h("span", { class: "posicao" }, i + 1) },
      { nome: "Time", esq: true, valor: (l) => h("span", { class: "time-celula" }, imgLogo(l.logo), h("button", { class: "botao-link", type: "button", onclick: () => abrirTimeKings(liga, l) }, l.nome)) },
      { nome: "J", valor: (l) => l.j },
      { nome: "V", valor: (l) => h("strong", null, l.v), titulo: "Vitórias (cada uma vale um ponto, inclusive nos pênaltis)" },
      { nome: "D", valor: (l) => l.d },
      { nome: "SG", valor: (l) => (l.sg > 0 ? `+${l.sg}` : l.sg) },
      { nome: "GP", valor: (l) => l.gp },
    ],
    g.linhas,
    { classeLinha: (l) => (destaqueId && l.id === String(destaqueId) ? "linha-destaque" : null) }
  );
}

/** A página de um time da Kings League: o grupo dele e os jogos da temporada. */
async function desenharTimeKings(corpo, ativo, liga, id, nomeInicial) {
  const comps = await api("/kings");
  if (!ativo()) return;
  const comp = comps.find((c) => c.id === liga);
  const t = comp && (comp.times || {})[String(id)];
  if (!t) {
    corpo.replaceChildren(vazio("Time não encontrado."));
    return;
  }
  if (!nomeInicial) definirTitulo(corpo, t.nome);
  const jogos = Kings.jogosDoTime(comp, id);
  const grupo = Kings.classificacao(comp).find((g) => g.linhas.some((l) => l.id === String(id)));
  corpo.replaceChildren(
    h(
      "div",
      { class: "perfil" },
      imgLogo(t.logo, "perfil-foto"),
      h("div", null, h("h3", { class: "perfil-nome" }, t.nome), h("div", { class: "perfil-sub" }, [t.sigla, comp.nome].filter(Boolean).join(" · ")))
    ),
    grupo ? cartao(grupo.nome, tabelaGrupoKings(liga, grupo, id)) : null,
    jogos.length
      ? h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo: "Jogos", sub: comp.temporada || null }), jogos.map((j) => linhaPartidaKings(j, () => abrirPartidaKings(j))))
      : vazio("Sem jogos deste time na temporada.")
  );
}

/** A aba Classificação: a tabela de cada grupo, pelo regulamento (cada vitória vale um ponto). */
async function kingsClassificacao(liga) {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando());
  let comps;
  try {
    comps = await api("/kings");
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => kingsClassificacao(liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  const comp = comps.find((c) => c.id === liga);
  const grupos = comp ? Kings.classificacao(comp) : [];
  if (!grupos.length) {
    lista().replaceChildren(vazio("Esta competição ainda não tem tabela de grupos."));
    return;
  }
  const cartoes = grupos.map((g) => cartao(g.nome, tabelaGrupoKings(liga, g)));
  lista().replaceChildren(
    ...cartoes,
    h("p", { class: "nota" }, "Cada vitória vale um ponto, inclusive nos pênaltis (Shootouts). Os jogos do Challenger não contam. Desempate: o confronto direto, depois o saldo e os gols marcados.")
  );
}

/** A aba Artilharia: os 3 primeiros em gols, assistências, defesas, MVP e dribles (o site da liga só mostra estes). */
async function kingsArtilharia(liga) {
  const tk = novoTokenLista();
  lista().replaceChildren(carregando());
  let comps;
  try {
    comps = await api("/kings");
  } catch (erro) {
    if (tk === S.tkLista) lista().replaceChildren(caixaErro(erro, () => kingsArtilharia(liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  const comp = comps.find((c) => c.id === liga);
  const categorias = (comp && comp.destaques) || [];
  if (!categorias.length) {
    lista().replaceChildren(vazio("A Kings League ainda não publicou as estatísticas desta temporada."));
    return;
  }
  const time = (id) => (comp.times || {})[id] || {};
  lista().replaceChildren(
    h(
      "div",
      { class: "grade-cartoes" },
      categorias.map((c) =>
        cartao(
          c.nome,
          h(
            "ol",
            { class: "ranking" },
            c.lideres.map((l, i) =>
              h(
                "li",
                null,
                h("span", { class: "lugar" }, i + 1),
                h(
                  "span",
                  { class: "kings-jogador" },
                  l.foto ? h("span", { class: "kings-foto recorte" }, h("img", { src: l.foto, alt: "", loading: "lazy" })) : h("span", { class: "kings-foto" }),
                  h("span", null, h("strong", null, l.nome), h("div", { class: "sub" }, h("span", { class: "time-celula" }, imgLogo(time(l.time).logo || null), time(l.time).nome || ""), l.jogos ? ` · ${l.jogos} jogos` : ""))
                ),
                h("span", { class: "valor" }, l.total ?? "")
              )
            )
          )
        )
      )
    ),
    h("p", { class: "nota" }, "O site da Kings League mostra os 3 primeiros de cada estatística.")
  );
}

registrarModulo("kings", {
  abas: () => [
    { id: "jogos", nome: "Jogos" },
    { id: "classificacao", nome: "Classificação" },
    { id: "artilharia", nome: "Artilharia" },
  ],
  desenhar(esp, aba) {
    const st = estadoDe("kings");
    const liga = st.liga && st.liga !== "todas" ? st.liga : esp.ligas[0].id;
    if (aba === "classificacao") return kingsClassificacao(liga);
    if (aba === "artilharia") return kingsArtilharia(liga);
    return kingsJogosDaLiga(liga);
  },
});
