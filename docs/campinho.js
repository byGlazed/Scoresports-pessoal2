"use strict";

/* =========================================================================
   Escalação do futebol no campinho, com a nota do Scoresports de cada jogador.
   As regras (onde cada um fica, minutos, nota) vêm de campinho_regras.js e notas_regras.js;
   aqui só o desenho. Sem formação conhecida, cai na lista de sempre (escalacoesFutebol).
   ========================================================================= */

/** "Jørgen Strand Larsen" → "J. Larsen"; nome de uma palavra fica como está. */
function nomeCurtoJogador(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return partes[0] || "";
  return `${partes[0][0]}. ${partes[partes.length - 1]}`;
}

/** O minuto até onde o jogo foi: 90 (ou 120 na prorrogação) no fim, o relógio ao vivo, null antes. */
function minutoFinalDoJogo(jogo) {
  if (jogo.estado === 3) return /prorroga/i.test(jogo.status || "") ? 120 : 90;
  if (jogo.estado === 2) return Campinho.minutoDoTexto(jogo.relogio);
  return null;
}

/** Os jogadores do time com minutos e nota calculados. */
function comNotas(e, jogo) {
  const minutoFinal = minutoFinalDoJogo(jogo);
  const pro = e.gols_pro;
  const contra = e.gols_contra_time;
  const resultado = pro === null || pro === undefined || contra === null || contra === undefined ? null : pro > contra ? "vitoria" : pro < contra ? "derrota" : "empate";
  const ctx = { resultado, sofridos_do_time: contra };
  const preparar = (j) => {
    const minutos = Campinho.minutosJogados(j, minutoFinal);
    return { ...j, minutos, nota: Notas.notaFutebol({ ...j, minutos }, ctx) };
  };
  return { titulares: e.titulares.map(preparar), reservas: e.reservas.map(preparar) };
}

/** Foto do jogador: a da ESPN quando vem no roster; senão a do TheSportsDB (chega depois); sem nenhuma, o número da camisa. */
function fotoJogador(j, time, classe = "campo-foto", classeNumero = "campo-numero") {
  const numero = () => h("span", { class: classeNumero, "aria-hidden": "true" }, j.camisa || "");
  if (j.foto) return h("img", { class: classe, src: Visual.imagemPequena(j.foto, 96, 70), alt: "", loading: "lazy", onerror: (ev) => ev.target.replaceWith(numero()) });
  const caixa = numero();
  FotoJogador.aplicar(caixa, j.nome, time, classe);
  return caixa;
}

function iconesJogador(j) {
  const icones = [];
  const gols = Number(j.gols) || 0;
  if (gols > 0) icones.push(h("span", { class: "icone-gol", title: gols > 1 ? `${gols} gols` : "Gol" }, "⚽", gols > 1 ? h("sub", null, gols) : null));
  if (Number(j.assistencias) > 0) icones.push(h("span", { class: "icone-assistencia", title: "Assistência" }, "A"));
  if (Number(j.gols_contra) > 0) icones.push(h("span", { class: "icone-gol-contra", title: "Gol contra" }, "⚽"));
  if (Number(j.vermelhos) > 0) icones.push(h("span", { class: "cartao-vermelho", title: "Cartão vermelho" }));
  else if (Number(j.amarelos) > 0) icones.push(h("span", { class: "cartao-amarelo", title: "Cartão amarelo" }));
  return icones;
}

/** A folha do jogador de futebol no jogo (como no Sofascore): foto, nota, "Ver perfil" (a carreira fica lá),
    os números do jogo e o carrossel com os outros que jogaram pelo time. */
function folhaJogadorFutebol(esp, liga, lista, indice, time) {
  const j = lista[indice];
  const goleiro = Notas.papel(j.posicao) === "goleiro";
  const seTem = (n) => (Number(n) > 0 ? n : null);
  const cartoes = [Number(j.amarelos) > 0 ? `${j.amarelos} amarelo${j.amarelos > 1 ? "s" : ""}` : null, Number(j.vermelhos) > 0 ? "vermelho" : null].filter(Boolean).join(", ");
  const troca = j.entrou_aos !== null && j.entrou_aos !== undefined ? `Entrou aos ${j.entrou_aos}'` : j.saiu_aos !== null && j.saiu_aos !== undefined ? `Saiu aos ${j.saiu_aos}'` : null;
  const conteudo = conteudoFolhaJogador({
    jogador: {
      foto: fotoJogador(j, time.nome, "folha-foto-img", "folha-foto-img numero"),
      nome: j.nome,
      sub: h("span", { class: "folha-time" }, imgLogo(time.logo, "logo logo-folha"), [time.nome, Visual.posicaoPorExtenso(j.posicao), j.camisa ? `nº ${j.camisa}` : null].filter(Boolean).join(" · ")),
      nota: j.nota,
      aoVerPerfil: () => {
        Folha.fechar();
        empilharAtleta(esp.id, liga, j.id, j.nome);
      },
    },
    linhas: [
      ["Minutos jogados", j.minutos !== null && j.minutos !== undefined ? `${j.minutos}'` : null],
      ["Substituição", troca],
      ["Gols", j.gols ?? 0],
      ["Assistências", j.assistencias ?? 0],
      ["Chutes no gol", j.chutes_no_gol ?? 0],
      ["Defesas", goleiro ? j.defesas ?? 0 : seTem(j.defesas)],
      ["Gols sofridos", goleiro ? j.gols_sofridos ?? 0 : null],
      ["Faltas sofridas", j.faltas_sofridas ?? 0],
      ["Faltas cometidas", j.faltas_cometidas ?? 0],
      ["Cartões", cartoes || null],
      ["Gols contra", seTem(j.gols_contra)],
    ],
    outros: lista.map((x, i) => ({
      foto: fotoJogador(x, time.nome, "folha-outro-img", "folha-outro-img numero"),
      nome: nomeCurtoJogador(x.nome),
      nota: x.nota,
      atual: i === indice,
      aoTocar: () => folhaJogadorFutebol(esp, liga, lista, i, time),
    })),
  });
  Folha.abrir(conteudo, `${j.nome} no jogo`);
}

/** Quem jogou pelo time, na ordem da folha do jogador: titulares na ordem do campo e quem entrou, pela hora. */
function jogaramPeloTime(e, titulares, reservas) {
  const posicoes = Campinho.posicoes(e.formacao, titulares);
  const entraram = reservas.filter((j) => j.entrou_aos !== null && j.entrou_aos !== undefined).sort((a, b) => a.entrou_aos - b.entrou_aos);
  return [...(posicoes ? posicoes.map((p) => p.jogador) : titulares), ...entraram];
}

/** O melhor em campo (a maior nota dos dois times), como o "Jogador da partida" do Sofascore. O toque abre a folha dele. */
function melhorEmCampo(esp, liga, escalacoes, jogo) {
  let melhor = null;
  for (const e of escalacoes || []) {
    if (!e.titulares.length) continue;
    const { titulares, reservas } = comNotas(e, jogo);
    const jogaram = jogaramPeloTime(e, titulares, reservas);
    for (const j of jogaram) if (j.nota !== null && j.nota !== undefined && (!melhor || j.nota > melhor.j.nota)) melhor = { j, e, jogaram };
  }
  if (!melhor) return null;
  const { j, e, jogaram } = melhor;
  return h(
    "button",
    { class: "melhor-em-campo", type: "button", onclick: () => folhaJogadorFutebol(esp, liga, jogaram, jogaram.indexOf(j), e.time) },
    fotoJogador(j, e.time.nome, "melhor-foto", "melhor-foto numero"),
    h("span", { class: "melhor-quem" }, h("strong", null, j.nome), h("span", { class: "sub" }, imgLogo(e.time.logo, "logo logo-folha"), [e.time.nome, Visual.posicaoPorExtenso(j.posicao)].filter(Boolean).join(" · "))),
    seloNota(j.nota)
  );
}

function jogadorNoCampo(esp, liga, p, time, abrir) {
  const j = p.jogador;
  return h(
    "button",
    {
      class: "campo-jogador",
      type: "button",
      style: { left: `${(p.x * 100).toFixed(2)}%`, top: `${(p.y * 100).toFixed(2)}%` },
      "aria-label": [j.camisa, j.nome, j.nota !== null ? `nota ${Notas.formatar(j.nota)}` : null].filter(Boolean).join(", "),
      onclick: () => (abrir ? abrir(j) : abrirAtleta(esp.id, liga, j.id, j.nome)),
    },
    h(
      "span",
      { class: "campo-foto-caixa" },
      fotoJogador(j, time),
      j.saiu_aos !== null && j.saiu_aos !== undefined ? h("span", { class: "campo-saiu", title: `Saiu aos ${j.saiu_aos}'` }, "⇄") : null,
      h("span", { class: "campo-icones" }, iconesJogador(j))
    ),
    seloNota(j.nota),
    // o número da camisa fica no círculo (sem foto) e no rótulo de leitura: no nome ele cortava os nomes
    h("span", { class: "campo-nome" }, nomeCurtoJogador(j.nome))
  );
}

function linhaReserva(esp, liga, j, time, nomes, abrir) {
  const entrou = j.entrou_aos !== null && j.entrou_aos !== undefined;
  return h(
    "li",
    { class: `reserva${entrou ? " entrou" : ""}` },
    fotoJogador(j, time, "reserva-foto", "reserva-foto numero"),
    h(
      "span",
      { class: "reserva-nome" },
      h("button", { class: "botao-link", type: "button", onclick: () => (abrir ? abrir(j) : abrirAtleta(esp.id, liga, j.id, j.nome)) }, j.nome),
      entrou
        ? h("span", { class: "sub reserva-troca" }, `${j.entrou_aos}'`, j.no_lugar_de && nomes.get(String(j.no_lugar_de)) ? ` · Saiu: ${nomes.get(String(j.no_lugar_de))}` : "")
        : j.posicao
          ? h("span", { class: "sub" }, ` ${j.posicao}`)
          : null
    ),
    h("span", { class: "icones" }, iconesJogador(j)),
    h("span", { class: "reserva-nota" }, seloNota(j.nota))
  );
}

/** O técnico embaixo do campinho, quando a página do time traz (ESPN ou Wikidata). Aparece depois, sem segurar o campinho. */
function linhaTecnico(esp, liga, time) {
  const linha = h("p", { class: "campinho-tecnico", hidden: true });
  if (!time || !time.id) return linha;
  const rota = esp.id === "futebol" ? `/e/futebol/${liga}/times/${time.id}/tecnico?nome=${encodeURIComponent(time.nome || "")}` : `/e/${esp.id}/${liga}/times/${time.id}`;
  api(rota)
    .then((t) => {
      if (!t || !t.tecnico) return;
      linha.replaceChildren(h("span", { class: "nota" }, "Técnico"), h("strong", null, t.tecnico));
      linha.hidden = false;
    })
    .catch(() => {});
  return linha;
}

/** Um cartão por time: cabeçalho (média e formação), o campinho e os reservas.
    provavel: a provável escalação (titulares do último jogo), sem notas nem reservas. */
function cartaoCampinho(esp, liga, e, jogo, provavel = false) {
  const { titulares, reservas } = provavel ? { titulares: e.titulares, reservas: [] } : comNotas(e, jogo);
  const posicoes = Campinho.posicoes(e.formacao, titulares);
  if (!posicoes) return null;
  const media = provavel ? null : Notas.media([...titulares, ...reservas].map((j) => j.nota));
  const reservasEmOrdem = [...reservas].sort((a, b) => (a.entrou_aos ?? 999) - (b.entrou_aos ?? 999));
  // tocar no jogador abre a folha dele no jogo (quem jogou: titulares na ordem do campo e quem entrou);
  // na provável escalação e para quem não entrou, abre o perfil
  const jogaram = jogaramPeloTime(e, titulares, reservas);
  const abrir = provavel
    ? null
    : (j) => {
        const i = jogaram.indexOf(j);
        if (i < 0) abrirAtleta(esp.id, liga, j.id, j.nome);
        else folhaJogadorFutebol(esp, liga, jogaram, i, e.time);
      };
  return h(
    "div",
    { class: "secao campinho-time" },
    h(
      "div",
      { class: "campinho-cabeca" },
      imgLogo(e.time.logo),
      h("strong", { class: "campinho-time-nome" }, e.time.nome),
      media !== null ? [seloNota(media, 2), botaoInfoNota()] : null,
      h("span", { class: "campinho-formacao" }, e.formacao)
    ),
    provavel && e.base
      ? h("p", { class: "nota campinho-base" }, `Titulares do último jogo${e.base.adversario ? `, contra o ${e.base.adversario}` : ""}${e.base.data ? ` (${dataCurta(e.base.data)})` : ""}.`)
      : null,
    h(
      "div",
      { class: "campo", role: "group", "aria-label": `Titulares de ${e.time.nome}, ${e.formacao}` },
      h("span", { class: "campo-area", "aria-hidden": "true" }),
      h("span", { class: "campo-pequena-area", "aria-hidden": "true" }),
      h("span", { class: "campo-meio", "aria-hidden": "true" }),
      posicoes.map((p) => jogadorNoCampo(esp, liga, p, e.time.nome, abrir))
    ),
    linhaTecnico(esp, liga, e.time),
    reservasEmOrdem.length ? [h("h3", { class: "campinho-reservas-titulo" }, "Reservas"), h("ul", { class: "campinho-reservas" }, reservasEmOrdem.map((j) => linhaReserva(esp, liga, j, e.time.nome, new Map([...titulares, ...reservas].map((t) => [String(t.id), nomeCurtoJogador(t.nome)])), abrir)))] : null
  );
}

/** As prováveis escalações (pré-jogo, antes de a ESPN divulgar): os titulares do último jogo de cada time,
    pedidos à parte (o histórico do resumo traz o id desse jogo). Desenha um campinho por time quando chega. */
function provaveisFutebol(esp, liga, jogo, forma) {
  const caixa = h("div", { class: "provaveis" }, esqueleto("campinho"));
  const ultimo = (t) => {
    const f = (forma || []).find((x) => String(x.time.id) === String(t.id));
    const jogos = ((f && f.jogos) || []).filter((x) => x.id).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    return jogos.length ? jogos[jogos.length - 1].id : null;
  };
  const lados = [jogo.casa, jogo.fora];
  Promise.all(lados.map((t) => (ultimo(t) ? api(`/e/futebol/escalacao-anterior/${ultimo(t)}/${t.id}`).catch(() => null) : Promise.resolve(null)))).then((lista) => {
    if (!caixa.isConnected && !caixa.parentNode) return;
    const cartoes = lista.filter(Boolean).map((e) => cartaoCampinho(esp, liga, e, jogo, true)).filter(Boolean);
    caixa.replaceChildren(
      h("p", { class: "nota" }, "Prováveis escalações: os titulares do último jogo de cada time. A escalação oficial aparece aqui perto do jogo."),
      ...(cartoes.length ? cartoes : [vazio("Ainda não dá para prever a escalação deste jogo.")])
    );
  });
  return [caixa];
}

/** A aba Escalações: o campinho de cada time (mandante primeiro), ou a lista se não der para desenhar. */
function campinhoFutebol(esp, liga, escalacoes, jogo) {
  const ordenadas = [...escalacoes].sort((a, b) => (a.lado === "casa" ? -1 : b.lado === "casa" ? 1 : 0));
  const cartoes = ordenadas.map((e) => cartaoCampinho(esp, liga, e, jogo));
  if (cartoes.some((c) => !c)) return escalacoesFutebol(esp, liga, escalacoes);
  return cartoes;
}
