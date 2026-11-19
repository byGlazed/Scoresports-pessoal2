"use strict";

/* =========================================================================
   E-sports (CS2, Valorant e LoL) no estilo do Sofascore: a lista do dia (chip E-sports e "Todos"),
   a página da partida ("Melhor de N", mapas, elencos, onde assistir) e a página do time.
   Os dados vêm das rotas /esports/* do celular (direto.js) e as regras de esports_regras.js.
   O plano grátis da PandaScore não traz o nome do mapa, o placar de rounds nem o KDA.
   ========================================================================= */

const AVISO_GRATIS_ESPORTS = "O nome do mapa, o placar de rounds e o KDA não vêm na versão grátis dos dados.";

const favTimeEsports = (jogo, l) => (l && l.id !== null && l.id !== undefined ? { tipo: "time", esporte: "esports", liga: jogo, id: String(l.id), nome: l.nome, logo: l.logo || null } : null);

/** Os ids dos times de e-sports favoritos (para o filtro do dia). */
function favoritosEsports() {
  return Favoritos.lista()
    .filter((f) => f.esporte === "esports" && f.tipo === "time")
    .map((f) => String(f.id));
}

function abrirPartidaEsports(p) {
  const st = estadoDe("esports");
  st.jogoAtual = p.id;
  marcarAtual(lista(), p.id);
  Navegacao.abrir({ tipo: "jogo", params: { esporte: "esports", liga: p.jogo, id: String(p.id) }, jogo: p });
}

function abrirTimeEsports(jogo, l) {
  if (!l || l.id === null || l.id === undefined) return;
  Navegacao.abrir({ tipo: "time", params: { esporte: "esports", liga: jogo, id: String(l.id) }, nome: l.nome });
}

/** O mapa em andamento numa partida ao vivo ("Mapa 2"), se der para saber. */
function mapaAtual(p) {
  const m = p.mapas.find((x) => x.estado === 2);
  return m ? `Mapa ${m.numero}` : null;
}

function statusEsportsLista(p) {
  const md = p.melhor_de ? `MD${p.melhor_de}` : null;
  if (p.estado === 1) return [hora(p.inicio) || "A definir", md].filter(Boolean);
  if (p.estado === 2) return ["Ao vivo", mapaAtual(p) || md].filter(Boolean);
  if (p.status === "Encerrado") return ["Fim", md].filter(Boolean);
  return [p.status];
}

/** Linha da partida na lista: os dois times, o placar da série e o estado (com "MD3"). */
function linhaPartidaEsports(p, aoClicar) {
  const comPlacar = p.estado >= 2 && !["Cancelada", "Adiada"].includes(p.status);
  return botaoJogo({
    id: p.id,
    estado: p.estado,
    status: statusEsportsLista(p),
    atual: p.id === estadoDe("esports").jogoAtual,
    transmissao: null,
    mostrarPadrao: false,
    aoClicar,
    times: p.lados.map((l, i) => ({
      nome: l.nome,
      logo: l.logo || null,
      placar: comPlacar ? p.placar[i] ?? "" : null,
      perdeu: p.estado === 3 && p.vencedor !== null && p.vencedor !== i,
    })),
  });
}

function grupoEsports(g, partidas) {
  return h(
    "section",
    { class: "cartao grupo-liga" },
    cabecaGrupo({ titulo: g.titulo, chave: `esports:${g.titulo}`, logo: g.partidas[0].torneio.logo || null, jogos: partidas }),
    partidas.map((p) => linhaPartidaEsports(p, () => abrirPartidaEsports(p)))
  );
}

/** Os grupos dos e-sports para a lista "Todos" (no formato de gruposDoEsporte). */
async function gruposEsports(data) {
  const partidas = await api(`/esports/jogos?de=${data}&favoritos=${favoritosEsports().join(",")}`);
  return Esports.grupos(partidas).map((g, i) => ({
    chave: `esports:${g.chave}`,
    esporte: "esports",
    ordem: i,
    aoVivo: g.aoVivo,
    jogos: g.partidas,
    desenhar: (visiveis) => grupoEsports(g, visiveis),
  }));
}

/** O chip E-sports: o dia escolhido, os filtros e as partidas agrupadas por torneio. */
async function esportsLista(silencioso) {
  const st = estadoDe("esports");
  const hoje = hojeBR();
  if (!st.data) st.data = JOGOS.data || hoje;
  const tk = silencioso ? S.tkLista : novoTokenLista();
  const barra = barraData({
    data: st.data,
    anterior: somarDias(st.data, -1),
    proximo: somarDias(st.data, 1),
    hoje,
    aoMudar: (d) => {
      st.data = d;
      cancelar("lista");
      esportsLista(false);
    },
  });
  if (!silencioso) lista().replaceChildren(barra, carregando());
  let partidas;
  try {
    partidas = await api(`/esports/jogos?de=${st.data}&favoritos=${favoritosEsports().join(",")}`);
  } catch (erro) {
    if (tk === S.tkLista && !silencioso) lista().replaceChildren(barra, caixaErro(erro, () => esportsLista(false)));
    return;
  }
  if (tk !== S.tkLista) return;
  const grupos = Esports.grupos(partidas);
  const desenhar = () => {
    const cartoes = grupos.map((g) => ({ g, visiveis: g.partidas.filter(passaFiltro) })).filter((x) => x.visiveis.length).map(({ g, visiveis }) => grupoEsports(g, visiveis));
    const partes = [barra, barraFiltro(partidas, desenhar)];
    if (cartoes.length) partes.push(...cartoes);
    else partes.push(vazio(partidas.length ? "Nenhuma partida com esse filtro." : "Nenhuma partida de torneio grande ou de time brasileiro nesta data."));
    partes.push(h("p", { class: "nota" }, "Aparecem os torneios grandes (nível S e A), os times brasileiros e os seus times favoritos. Dados da PandaScore."));
    lista().replaceChildren(...partes);
    marcarAtual(lista(), st.jogoAtual);
  };
  desenhar();
  // ao vivo: a cada 30 s (o limite grátis da PandaScore é de cerca de 1.000 pedidos por hora)
  if (partidas.some((p) => p.estado === 2)) agendar("lista", () => esportsLista(true), 30000);
}

/* ---------- Página da partida ---------- */

function bolinhasDe(lista, lado) {
  return h(
    "div",
    { class: `bolinhas bolinhas-${lado}`, "aria-hidden": "true" },
    (lado === "direita" ? [...lista].reverse() : lista).map((cheia) => h("span", { class: `bolinha${cheia ? " cheia" : ""}` }))
  );
}

function blocoMelhorDe(p) {
  const b = Esports.bolinhas(p);
  if (!b) return null;
  const texto = `Melhor de ${p.melhor_de}`;
  return h(
    "div",
    { class: "melhor-de", role: "img", "aria-label": `${texto}: ${p.lados[0].nome} ${p.placar[0] ?? 0}, ${p.lados[1].nome} ${p.placar[1] ?? 0}` },
    bolinhasDe(b.esquerda, "esquerda"),
    h("strong", null, texto),
    bolinhasDe(b.direita, "direita")
  );
}

function cartaoMapa(p, m) {
  const venceu = m.vencedor === null ? null : p.lados[m.vencedor];
  const meio =
    m.estado === 2
      ? h("span", { class: "mapa-resultado ao-vivo" }, "Em andamento")
      : venceu
        ? h("span", { class: "mapa-resultado" }, imgLogo(venceu.logo), h("span", null, `Vitória de ${venceu.sigla || venceu.nome}`))
        : h("span", { class: "mapa-resultado a-jogar" }, m.estado === 3 ? "Encerrado" : "A jogar");
  return h(
    "li",
    { class: `mapa${m.estado === 2 ? " ao-vivo" : ""}${venceu ? ` venceu-${m.vencedor === 0 ? "esquerda" : "direita"}` : ""}` },
    h("span", { class: "mapa-hora" }, m.inicio ? hora(m.inicio) : ""),
    h("span", { class: "mapa-meio" }, meio, m.duracao_min ? h("span", { class: "mapa-duracao" }, `${m.duracao_min} min`) : null),
    h("span", { class: "mapa-nome" }, h("strong", null, `Mapa ${m.numero}`), m.nome ? h("span", null, m.nome) : null)
  );
}

function blocoMapas(p) {
  if (!p.mapas.length) {
    if (p.estado === 1 || ["Cancelada", "Adiada", "W.O."].includes(p.status)) return null;
    return secao("Mapas", h("p", { class: "nota" }, "Os mapas desta partida não vêm na versão grátis dos dados."));
  }
  // o mapa mais recente primeiro, como no Sofascore
  const mapas = [...p.mapas].sort((a, b) => b.numero - a.numero);
  return secao("Mapas", h("ol", { class: "mapas" }, mapas.map((m) => cartaoMapa(p, m))), h("p", { class: "nota" }, AVISO_GRATIS_ESPORTS));
}

function blocoTransmissoes(p) {
  if (!p.transmissoes.length) return null;
  const idioma = (x) => (x ? String(x).slice(0, 2).toUpperCase() : "");
  return secao(
    "Onde assistir",
    h(
      "ul",
      { class: "lista-transmissoes" },
      p.transmissoes.slice(0, 6).map((t) =>
        h("li", null, h("a", { href: t.url, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "idioma" }, idioma(t.idioma)), t.nome))
      )
    )
  );
}

function fotoJogadorEsports(j) {
  const iniciais = h("span", { class: "foto-esports vazia", "aria-hidden": "true" }, String(j.nick || "?").slice(0, 2).toUpperCase());
  if (!j.foto) return iniciais;
  return h("img", { class: "foto-esports", src: j.foto, alt: "", loading: "lazy", onerror: (e) => e.target.replaceWith(iniciais) });
}

function jogadorEsports(j, lado) {
  if (!j) return h("div", { class: `jogador-esports ${lado}` });
  return h(
    "div",
    { class: `jogador-esports ${lado}` },
    fotoJogadorEsports(j),
    h("span", { class: "jogador-esports-texto" }, h("strong", null, j.nick), j.nome ? h("span", { class: "sub" }, j.nome) : null)
  );
}

function blocoElencos(p, elencos) {
  const pares = Esports.elencoLadoALado(elencos[0], elencos[1]);
  if (!pares.length) return [secao(null, vazio("Os elencos não vieram agora."))];
  return [
    secao(
      "Jogadores",
      h("div", { class: "elencos-cabeca" }, h("span", null, p.lados[0].nome), h("span", null, p.lados[1].nome)),
      h("div", { class: "elencos" }, pares.map(([a, b]) => h("div", { class: "elencos-linha" }, jogadorEsports(a, "esquerda"), jogadorEsports(b, "direita"))))
    ),
  ];
}

async function esportsPartida(jogo, id, silencioso, jogoLista) {
  const tk = silencioso ? S.tkDetalhe : novoTokenDetalhe();
  if (!silencioso) detalhe().replaceChildren(carregando());
  let r;
  try {
    r = await api(`/esports/jogos/${jogo}/${id}`);
  } catch (erro) {
    if (tk === S.tkDetalhe && !silencioso) detalhe().replaceChildren(caixaErro(erro, () => esportsPartida(jogo, id, false, jogoLista)));
    return;
  }
  if (tk !== S.tkDetalhe) return;
  const p = r.partida;
  const jogoObj = Esports.jogoDoId(jogo) || { nome: "E-sports", sigla: "" };

  const abas = [{ id: "detalhes", nome: "Detalhes" }];
  if (r.elencos.some((e) => e.length)) abas.push({ id: "elencos", nome: "Elencos" });
  const chaveAba = `esports:${p.id}`;
  let aba = abas.some((a) => a.id === S.abaDetalhe[chaveAba]) ? S.abaDetalhe[chaveAba] : "detalhes";
  const area = h("div");
  let barra = abasDetalhe(abas, aba, trocar);
  function trocar(nova) {
    aba = nova;
    S.abaDetalhe[chaveAba] = nova;
    const nb = abasDetalhe(abas, aba, trocar);
    barra.replaceWith(nb);
    barra = nb;
    area.replaceChildren(...conteudo(nova));
  }
  function conteudo(qual) {
    if (qual === "elencos") return blocoElencos(p, r.elencos);
    const linhaTorneio = [jogoObj.nome, p.torneio.liga, p.torneio.nome].filter(Boolean).join(" · ");
    return [secao(null, h("p", { class: "linha-torneio" }, linhaTorneio), blocoMelhorDe(p)), blocoMapas(p), blocoTransmissoes(p)].filter(Boolean);
  }
  area.replaceChildren(...conteudo(aba));

  if (!silencioso) definirTitulo(null, jogoObj.nome, p.torneio.liga);
  const comPlacar = p.estado >= 2 && !["Cancelada", "Adiada"].includes(p.status);
  const ladoPlacar = (i) => {
    const l = p.lados[i];
    return { nome: l.nome, logo: l.logo || null, placar: comPlacar ? p.placar[i] ?? 0 : null, aoClicar: l.id !== null ? () => abrirTimeEsports(jogo, l) : null, favorito: favTimeEsports(jogo, l) };
  };
  const placar = placarGrande({
    esquerda: ladoPlacar(0),
    direita: ladoPlacar(1),
    estado: p.estado,
    status: p.estado === 1 ? hora(p.inicio) || "A definir" : p.estado === 2 ? ["Ao vivo", mapaAtual(p)].filter(Boolean).join(" · ") : p.status,
    info: [p.torneio.liga, diaHora(p.inicio)].filter(Boolean).join(", "),
  });
  detalhe().replaceChildren(h("section", { class: "cartao" }, placar, barra, area));
  if (p.estado === 2) agendar("detalhe", () => esportsPartida(jogo, id, true, jogoLista), 30000);
}

/* ---------- Página do time ---------- */

async function desenharTimeEsports(corpo, ativo, jogo, id, nomeInicial) {
  corpo.replaceChildren(carregando());
  let r;
  try {
    r = await api(`/esports/times/${jogo}/${id}`);
  } catch (erro) {
    if (ativo()) corpo.replaceChildren(caixaErro(erro, () => desenharTimeEsports(corpo, ativo, jogo, id, nomeInicial)));
    return;
  }
  if (!ativo()) return;
  const t = r.time;
  const jogoObj = Esports.jogoDoId(jogo) || { nome: "E-sports" };
  definirTitulo(corpo, t.nome || nomeInicial || "Time", jogoObj.nome);
  const cabecalho = h(
    "section",
    { class: "cartao cabecalho-time-esports" },
    imgLogo(t.logo),
    h("div", null, h("h2", null, t.nome), h("p", { class: "sub" }, [jogoObj.nome, t.pais].filter(Boolean).join(" · "))),
    botaoFavorito(favTimeEsports(jogo, t))
  );
  const listaPartidas = (titulo, partidas) =>
    partidas.length ? h("section", { class: "cartao grupo-liga" }, cabecaGrupo({ titulo }), partidas.map((p) => linhaPartidaEsports(p, () => abrirPartidaEsports(p)))) : null;
  const elenco = r.elenco.length
    ? h("section", { class: "cartao" }, h("div", { class: "secao" }, h("h3", null, "Elenco"), h("div", { class: "elenco-esports" }, r.elenco.map((j) => jogadorEsports(j, "esquerda")))))
    : null;
  corpo.replaceChildren(
    ...[cabecalho, listaPartidas("Próximas partidas", r.proximas), elenco, listaPartidas("Últimas partidas", r.ultimas)].filter(Boolean),
    ...(r.proximas.length || r.ultimas.length || r.elenco.length ? [] : [vazio("Sem partidas nem elenco por enquanto.")])
  );
}

// o tipo "esports" precisa de um módulo para entrar na lista de esportes do app (S.esportes);
// a página de liga, se for aberta, mostra só as partidas do dia
registrarModulo("esports", {
  abas: () => [{ id: "jogos", nome: "Partidas" }],
  desenhar: () => esportsLista(false),
});
