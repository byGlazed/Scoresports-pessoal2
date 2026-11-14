"use strict";

/* Só no app Android. O botão voltar do celular volta uma página por vez (navegacao.js);
   na raiz de Jogos devolve false e o app sai. Sem histórico do navegador no app:
   assim o WebView não tem para onde "voltar" sozinho. */
window.APP_ANDROID = true;

window.voltarAndroid = function () {
  return Navegacao.voltar();
};
