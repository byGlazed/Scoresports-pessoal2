"""Monta a versão do celular em dois lugares:

- docs/: o site que o GitHub Pages publica de graça (instalável pelo navegador);
- android/app/src/main/assets/www/: as telas que vão dentro do APK.

Rode sempre que mudar alguma tela (static/) ou os arquivos de dados
(transmissoes.json, boxe_eventos.json, campeoes.json):

    python gerar_celular.py

Depois é só fazer commit e push: o GitHub monta o APK novo sozinho (veja o README).
"""

import shutil
import time
from pathlib import Path

RAIZ = Path(__file__).parent
DOCS = RAIZ / "docs"
APK_WWW = RAIZ / "android" / "app" / "src" / "main" / "assets" / "www"
TELAS = ("app.js", "esportes.js", "inicio.js", "style.css")
DADOS = ("transmissoes.json", "boxe_eventos.json", "campeoes.json")

CABECA_CELULAR = """  <link rel="manifest" href="./manifest.webmanifest">
  <meta name="theme-color" content="#151a24">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Scoresports">
  <link rel="apple-touch-icon" href="./apple-touch-icon.png">
"""


def main():
    if DOCS.exists():
        shutil.rmtree(DOCS)
    (DOCS / "dados").mkdir(parents=True)

    for nome in TELAS:
        shutil.copy(RAIZ / "static" / nome, DOCS / nome)
    shutil.copytree(RAIZ / "static" / "fontes", DOCS / "fontes")  # fonte Inter embutida
    for arquivo in (RAIZ / "celular").iterdir():
        if arquivo.is_file() and arquivo.name != "android.js":
            shutil.copy(arquivo, DOCS / arquivo.name)
    for nome in DADOS:
        shutil.copy(RAIZ / nome, DOCS / "dados" / nome)

    html = (RAIZ / "static" / "index.html").read_text(encoding="utf-8")
    html = html.replace('href="/static/', 'href="./').replace('src="/static/', 'src="./').replace('href="/"', 'href="./"')
    html = html.replace("</head>", CABECA_CELULAR + "</head>")
    html = html.replace(
        '<script src="./inicio.js"></script>',
        '<script src="./inicio.js"></script>\n  <script src="./regras_esportes.js"></script>\n  <script src="./time_dados.js"></script>\n  <script src="./direto.js"></script>\n  <script src="./registrar.js"></script>',
    )
    (DOCS / "index.html").write_text(html, encoding="utf-8")

    sw = (DOCS / "sw.js").read_text(encoding="utf-8").replace("__VERSAO__", time.strftime("%Y%m%d-%H%M%S"))
    (DOCS / "sw.js").write_text(sw, encoding="utf-8")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")  # o GitHub Pages publica os arquivos como estão

    # cópia para dentro do APK, com o script do botão voltar do Android
    if APK_WWW.exists():
        shutil.rmtree(APK_WWW)
    shutil.copytree(DOCS, APK_WWW)
    (APK_WWW / "android.js").write_text((RAIZ / "celular" / "android.js").read_text(encoding="utf-8"), encoding="utf-8")
    html_apk = (APK_WWW / "index.html").read_text(encoding="utf-8").replace(
        '<script src="./registrar.js"></script>', '<script src="./registrar.js"></script>\n  <script src="./android.js"></script>'
    )
    (APK_WWW / "index.html").write_text(html_apk, encoding="utf-8")

    print(f"Versão do celular gerada em {DOCS} ({sum(1 for _ in DOCS.rglob('*') if _.is_file())} arquivos).")
    print(f"Telas do APK copiadas para {APK_WWW}.")
    print("Agora faça commit e push: o GitHub monta o APK sozinho.")


if __name__ == "__main__":
    main()
