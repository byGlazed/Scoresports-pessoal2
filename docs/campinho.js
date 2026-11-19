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
  if (j.foto) return h("img", { class: classe, src: j.foto, alt: "", loading: "lazy", onerror: (ev) => ev.target.replaceWith(numero()) });
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

function jogadorNoCampo(esp, liga, p, time) {
  const j = p.jogador;
  return h(
    "button",
    {
      class: "campo-jogador",
      type: "button",
      style: { left: `${(p.x * 100).toFixed(2)}%`, top: `${(p.y * 100).toFixed(2)}%` },
      "aria-label": [j.camisa, j.nome, j.nota !== null ? `nota ${Notas.formatar(j.nota)}` : null].filter(Boolean).join(", "),
      onclick: () => abrirAtleta(esp.id, liga, j.id, j.nome),
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

function linhaReserva(esp, liga, j, time, nomes) {
  const entrou = j.entrou_aos !== null && j.entrou_aos !== undefined;
  return h(
    "li",
    { class: `reserva${entrou ? " entrou" : ""}` },
    fotoJogador(j, time, "reserva-foto", "reserva-foto numero"),
    h(
      "span",
      { class: "reserva-nome" },
      h("button", { class: "botao-link", type: "button", onclick: () => abrirAtleta(esp.id, liga, j.id, j.nome) }, j.nome),
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

/** Um cartão por time: cabeçalho (média e formação), o campinho e os reservas. */
function cartaoCampinho(esp, liga, e, jogo) {
  const { titulares, reservas } = comNotas(e, jogo);
  const posicoes = Campinho.posicoes(e.formacao, titulares);
  if (!posicoes) return null;
  const media = Notas.media([...titulares, ...reservas].map((j) => j.nota));
  const reservasEmOrdem = [...reservas].sort((a, b) => (a.entrou_aos ?? 999) - (b.entrou_aos ?? 999));
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
    h(
      "div",
      { class: "campo", role: "group", "aria-label": `Titulares de ${e.time.nome}, ${e.formacao}` },
      h("span", { class: "campo-area", "aria-hidden": "true" }),
      h("span", { class: "campo-pequena-area", "aria-hidden": "true" }),
      h("span", { class: "campo-meio", "aria-hidden": "true" }),
      posicoes.map((p) => jogadorNoCampo(esp, liga, p, e.time.nome))
    ),
    reservasEmOrdem.length ? [h("h3", { class: "campinho-reservas-titulo" }, "Reservas"), h("ul", { class: "campinho-reservas" }, reservasEmOrdem.map((j) => linhaReserva(esp, liga, j, e.time.nome, new Map([...titulares, ...reservas].map((t) => [String(t.id), nomeCurtoJogador(t.nome)])))))] : null
  );
}

/** A aba Escalações: o campinho de cada time (mandante primeiro), ou a lista se não der para desenhar. */
function campinhoFutebol(esp, liga, escalacoes, jogo) {
  const ordenadas = [...escalacoes].sort((a, b) => (a.lado === "casa" ? -1 : b.lado === "casa" ? 1 : 0));
  const cartoes = ordenadas.map((e) => cartaoCampinho(esp, liga, e, jogo));
  if (cartoes.some((c) => !c)) return escalacoesFutebol(esp, liga, escalacoes);
  return cartoes;
}
