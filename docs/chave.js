"use strict";

/* =========================================================================
   A chave em colunas (mata-mata e playoffs) e a Copa NBA, na página da liga.
   Só no app e no docs/ (window.MODO_CELULAR): os dados vêm das rotas do direto.js,
   montados pelas regras de chave_regras.js.
   ========================================================================= */

const ESTADO_CHAVE = {}; // temporada escolhida por competição ("futebol:uefa.champions" -> ano)

const MEDIDAS_CHAVE = { cartao: 72, espaco: 12, coluna: 168, vao: 28, cabeca: 26 };

/** Completa o escudo dos times que vieram sem logo, com o dos jogos já convertidos pelo app. */
function completarLogos(listas, jogos) {
  const logos = {};
  for (const j of Object.values(jogos || {})) {
    for (const t of [j.casa, j.fora]) if (t && t.id && t.logo) logos[String(t.id)] = t.logo;
  }
  for (const lista of listas) {
    for (const c of lista || []) {
      if (!c) continue;
      for (const l of c.lados) if (!l.logo && logos[l.id]) l.logo = logos[l.id];
    }
  }
}

/** Abre o confronto: jogo único vai direto para a partida; ida e volta ou série abre a lista dos jogos. */
function abrirConfronto(esporte, liga, c, jogos) {
  if (!c) return;
  const doConfronto = c.jogos.map((id) => jogos[id]).filter(Boolean);
  if (doConfronto.length === 1) {
    Navegacao.abrir({ tipo: "jogo", params: { esporte, liga, id: String(doConfronto[0].id) }, jogo: doConfronto[0] });
    return;
  }
  const [a, b] = c.lados.map((l) => l.curto || l.nome);
  Navegacao.abrir({ tipo: "confronto", params: {}, titulo: `${a} x ${b}`, esporte, liga, confronto: c, jogos: doConfronto });
}

registrarPagina("confronto", {
  titulo: (params, p) => p.titulo || "Confronto",
  desenhar: (corpo, params, ativo, p) => {
    const esp = esporteObj(p.esporte);
    const c = p.confronto;
    corpo.replaceChildren(
      h(
        "section",
        { class: "cartao grupo-liga" },
        cabecaGrupo({ titulo: c.resumo ? `${p.titulo} · ${c.resumo}` : p.titulo }),
        p.jogos.map((j) => linhaPartida(esp, j, () => abrirPartida(esp, p.liga, j)))
      )
    );
  },
});

function textoDaData(iso) {
  if (!iso) return "A definir";
  const d = dataBR(iso);
  return `${dataCurta(d)} ${hora(iso) || ""}`.trim();
}

/** O cartão de um confronto (ou de uma vaga ainda sem times). */
function cartaoConfronto(c, { aoTocar, estilo }) {
  if (!c) return h("div", { class: "confronto-chave vaga", style: estilo, "aria-label": "Confronto a definir" }, "A definir");
  const comecou = c.estado !== 1 || c.lados.some((l) => l.placar);
  const algumPassou = c.lados.some((l) => l.passou);
  const lados = c.lados.map((l) =>
    h(
      "span",
      { class: `chave-lado${l.passou ? " passou" : algumPassou ? " saiu" : ""}` },
      l.logo ? h("img", { src: l.logo, alt: "", loading: "lazy", width: 20, height: 20 }) : h("span"),
      h("span", { class: "nome" }, l.aDefinir ? "A definir" : l.curto || l.nome),
      h("span", { class: "placar" }, comecou ? String(l.placar) : "")
    )
  );
  const rodape = c.estado === 2 ? "Ao vivo" : c.resumo || (comecou ? "" : textoDaData(c.primeiraData));
  return h(
    "button",
    {
      class: `confronto-chave${c.estado === 2 ? " ao-vivo" : ""}`,
      type: "button",
      style: estilo,
      onclick: () => aoTocar(c),
      "aria-label": c.lados.map((l) => `${l.nome} ${comecou ? l.placar : ""}`).join(" x ") + (c.resumo ? `, ${c.resumo}` : ""),
    },
    ...lados,
    rodape ? h("span", { class: "chave-resumo" }, rodape) : null
  );
}

/** A chave em colunas: uma por fase, com linhas ligando quem alimenta cada confronto. */
function desenharChave(colunas, { aoTocar }) {
  const M = MEDIDAS_CHAVE;
  const pos = Chave.posicoes(colunas);
  const maxY = Math.max(0, ...pos.flat());
  const passo = M.cartao + M.espaco;
  const largura = colunas.length * M.coluna + (colunas.length - 1) * M.vao;
  const altura = M.cabeca + (maxY + 1) * passo;
  const topo = (k, i) => M.cabeca + pos[k][i] * passo;
  const esquerda = (k) => k * (M.coluna + M.vao);

  const linhas = s("svg", { class: "chave-linhas", width: largura, height: altura, "aria-hidden": "true" });
  colunas.forEach((col, k) => {
    if (k === 0) return;
    col.alimenta.forEach((feeders, i) => {
      if (col.ligado && !col.ligado[i]) return; // vaga: ainda não se sabe quem enfrenta quem
      const y2 = topo(k, i) + M.cartao / 2;
      const x2 = esquerda(k);
      for (const j of feeders) {
        const x1 = esquerda(k - 1) + M.coluna;
        const y1 = topo(k - 1, j) + M.cartao / 2;
        const meio = x1 + M.vao / 2;
        linhas.append(s("path", { d: `M${x1} ${y1} H${meio} V${y2} H${x2}` }));
      }
    });
  });

  const chave = h("div", { class: "chave", style: { width: `${largura}px`, height: `${altura}px` } }, linhas);
  colunas.forEach((col, k) => {
    chave.append(h("div", { class: "chave-fase", style: { left: `${esquerda(k)}px` } }, col.nome));
    col.confrontos.forEach((c, i) => {
      chave.append(cartaoConfronto(c, { aoTocar, estilo: { left: `${esquerda(k)}px`, top: `${topo(k, i)}px` } }));
    });
  });
  const rolagem = h("div", { class: "chave-rolagem", role: "region", "aria-label": "Chave, arraste para os lados" }, chave);
  // começa na primeira fase com confronto a jogar ou ao vivo
  const atual = colunas.findIndex((c) => c.confrontos.some((x) => !x || x.estado !== 3));
  rolagem.dataset.inicio = String(atual > 0 ? esquerda(atual) - 8 : 0);
  return rolagem;
}

/** Uma fase fora da chave (Play-In, fases preliminares), numa lista que abre e fecha. */
function listaDeFase(nome, confrontos, aoTocar) {
  return h(
    "details",
    { class: "cartao chave-lista" },
    h("summary", null, h("span", null, nome), h("span", { class: "nota", style: { margin: 0 } }, `${confrontos.length} confronto${confrontos.length === 1 ? "" : "s"}`)),
    confrontos.map((c) => {
      const algumPassou = c.lados.some((l) => l.passou);
      const comecou = c.estado !== 1 || c.lados.some((l) => l.placar);
      return h(
        "button",
        { class: "linha-confronto", type: "button", onclick: () => aoTocar(c) },
        c.lados.map((l) =>
          h(
            "span",
            { class: `chave-lado${l.passou ? " passou" : algumPassou ? " saiu" : ""}` },
            l.logo ? h("img", { src: l.logo, alt: "", loading: "lazy", width: 20, height: 20 }) : h("span"),
            h("span", { class: "nome" }, l.aDefinir ? "A definir" : l.nome),
            h("span", { class: "placar" }, comecou ? String(l.placar) : "")
          )
        ),
        h("span", { class: "chave-resumo" }, c.estado === 2 ? "Ao vivo" : c.resumo || (comecou ? "" : textoDaData(c.primeiraData)))
      );
    })
  );
}

function linhaTemporada(r, trocar) {
  return h(
    "div",
    { class: "chave-cabeca" },
    h("strong", null, `Temporada ${r.temporada.rotulo}`),
    r.outra ? h("button", { class: "botao", type: "button", onclick: () => trocar(r.outra.ano) }, `Ver ${r.outra.rotulo}`) : null
  );
}

const temAoVivo = (listas) => listas.some((l) => (l || []).some((c) => c && c.estado === 2));

/** Põe a chave na tela mantendo a rolagem lateral de antes (na atualização ao vivo). */
function trocarConteudo(partes) {
  const antes = lista().querySelector(".chave-rolagem");
  const rolagemAntes = antes ? antes.scrollLeft : null;
  lista().replaceChildren(...partes);
  const nova = lista().querySelector(".chave-rolagem");
  if (nova) nova.scrollLeft = rolagemAntes !== null ? rolagemAntes : Number(nova.dataset.inicio || 0);
}

/** A aba "Mata-mata" / "Playoffs" da página da liga. */
async function chaveLista(esp, liga, silencioso) {
  const tk = silencioso ? S.tkLista : novoTokenLista();
  const chaveEstado = `${esp.id}:${liga}`;
  const ano = ESTADO_CHAVE[chaveEstado];
  if (!silencioso) lista().replaceChildren(carregando("Montando a chave…"));
  let r;
  try {
    r = await api(`/e/${esp.id}/${liga}/chave${ano ? `?temporada=${ano}` : ""}`);
  } catch (erro) {
    if (tk === S.tkLista && !silencioso) lista().replaceChildren(caixaErro(erro, () => chaveLista(esp, liga)));
    return;
  }
  if (tk !== S.tkLista) return;
  const abrir = (c) => abrirConfronto(esp.id, liga, c, r.jogos);
  completarLogos([...r.colunas.map((c) => c.confrontos), r.playIn, ...r.preliminares.map((p) => p.confrontos)], r.jogos);
  const partes = [
    linhaTemporada(r, (novo) => {
      ESTADO_CHAVE[chaveEstado] = novo;
      cancelar("lista");
      chaveLista(esp, liga);
    }),
  ];
  if (r.playIn.length) partes.push(listaDeFase("Play-In", r.playIn, abrir));
  for (const p of r.preliminares) partes.push(listaDeFase(p.nome, p.confrontos, abrir));
  if (r.colunas.length) partes.push(desenharChave(r.colunas, { aoTocar: abrir }));
  else partes.push(vazio("A ESPN ainda não tem o mata-mata desta temporada."));
  for (const p of r.depois || []) partes.push(listaDeFase(p.nome, p.confrontos, abrir));
  trocarConteudo(partes);
  const listas = [...r.colunas.map((c) => c.confrontos), r.playIn, ...r.preliminares.map((p) => p.confrontos), ...(r.depois || []).map((p) => p.confrontos)];
  if (temAoVivo(listas)) agendar("lista", () => chaveLista(esp, liga, true), 20000);
}


/* ---------- Copa NBA ---------- */

/** A aba "Copa NBA": os 6 grupos (V-D e saldo) e a chave das quartas até a final. */
async function copaNbaLista(esp, silencioso) {
  const tk = silencioso ? S.tkLista : novoTokenLista();
  const ano = ESTADO_CHAVE["copa-nba"];
  if (!silencioso) lista().replaceChildren(carregando("Montando a Copa NBA…"));
  let r;
  try {
    r = await api(`/e/nba/nba/copa${ano ? `?temporada=${ano}` : ""}`);
  } catch (erro) {
    if (tk === S.tkLista && !silencioso) lista().replaceChildren(caixaErro(erro, () => copaNbaLista(esp)));
    return;
  }
  if (tk !== S.tkLista) return;
  const abrir = (c) => abrirConfronto("nba", "nba", c, r.jogos);
  completarLogos(r.colunas.map((c) => c.confrontos), r.jogos);
  const logos = {};
  for (const j of Object.values(r.jogos || {})) for (const t of [j.casa, j.fora]) if (t && t.id && t.logo) logos[String(t.id)] = t.logo;
  const partes = [
    linhaTemporada(r, (novo) => {
      ESTADO_CHAVE["copa-nba"] = novo;
      cancelar("lista");
      copaNbaLista(esp);
    }),
  ];
  if (!r.grupos.length) partes.push(vazio("A Copa NBA desta temporada ainda não começou."));
  else {
    partes.push(
      h(
        "div",
        { class: "grade-cartoes grupos-copa" },
        r.grupos.map((g) =>
          h(
            "section",
            { class: "cartao" },
            h("div", { class: "cartao-cabeca" }, h("h3", null, g.nome)),
            tabela(
              [
                { nome: "#", valor: (l, i) => i + 1 },
                {
                  nome: "Time",
                  esq: true,
                  valor: (l) =>
                    h(
                      "span",
                      { class: "time-celula" },
                      imgLogo(l.time.logo || logos[l.time.id] || null),
                      h("button", { class: "botao-link", type: "button", onclick: () => abrirTime("nba", "nba", l.time.id, l.time.nome) }, l.time.curto || l.time.nome)
                    ),
                },
                { nome: "V", valor: (l) => l.v },
                { nome: "D", valor: (l) => l.d },
                { nome: "Saldo", valor: (l) => (l.saldo > 0 ? `+${l.saldo}` : String(l.saldo)) },
              ],
              g.linhas,
              { classeLinha: (l, i) => (i === 0 ? "linha-destaque" : null) }
            )
          )
        )
      ),
      h("p", { class: "nota" }, "Desempate aproximado: vitórias, saldo e pontos marcados. O 1º de cada grupo e o melhor 2º de cada conferência vão às quartas.")
    );
  }
  partes.push(h("p", { class: "titulo-dia", style: { marginTop: "16px" } }, "Mata-mata"));
  partes.push(desenharChave(r.colunas, { aoTocar: abrir }));
  trocarConteudo(partes);
  if (temAoVivo(r.colunas.map((c) => c.confrontos))) agendar("lista", () => copaNbaLista(esp, true), 20000);
}
