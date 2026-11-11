"use strict";

/* Só no app Android: o botão voltar do celular fecha o que estiver aberto antes de sair. */
window.voltarAndroid = function () {
  const painel = document.getElementById("painel");
  if (painel && painel.open) {
    if (!document.getElementById("painel-voltar").hidden) Painel.voltar();
    else Painel.fechar();
    return true;
  }
  if (document.body.classList.contains("lateral-aberta")) {
    abrirLateral(false);
    return true;
  }
  if (document.body.classList.contains("mostrando-detalhe")) {
    voltarParaLista();
    return true;
  }
  if (S.esporte && S.esporte !== "inicio") {
    irPara("inicio");
    return true;
  }
  return false;
};
