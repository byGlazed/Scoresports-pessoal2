"""Monta a versão do celular em dois lugares:

- docs/: o site que o GitHub Pages publica de graça (instalável pelo navegador);
- android/app/src/main/assets/www/: as telas que vão dentro do APK;
- docs/apk/: a mesma pasta do APK, publicada no Pages, com o manifesto versao.txt.
  O app Android baixa dali as telas e os dados novos (veja Atualizacao.java).

Rode sempre que mudar alguma tela (static/) ou os arquivos de dados
(transmissoes.json, boxe_eventos.json, campeoes.json):

    python gerar_celular.py

Depois é só fazer commit e push: o GitHub monta o APK novo sozinho (veja o README).
"""

import hashlib
import shutil
import time
from pathlib import Path

RAIZ = Path(__file__).parent
DOCS = RAIZ / "docs"
APK_WWW = RAIZ / "android" / "app" / "src" / "main" / "assets" / "www"
TELAS = ("nba_quadra.js", "rotas.js", "app.js", "esportes.js", "busca_regras.js", "inicio.js", "chave_regras.js", "navegacao.js", "style.css")
DADOS = ("transmissoes.json", "boxe_eventos.json", "campeoes.json")
APK_MINIMO = RAIZ / "celular" / "apk_minimo.txt"  # menor versionCode de APK que as telas atuais aceitam

CABECA_CELULAR = """  <link rel="manifest" href="./manifest.webmanifest">
  <meta name="theme-color" content="#151a24">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Scoresports">
  <link rel="apple-touch-icon" href="./apple-touch-icon.png">
"""


def carimbo(segundos=None) -> str:
    """A versão: data e hora em UTC (o PC em Brasília e o GitHub em UTC carimbam do mesmo jeito)."""
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime(segundos))


def como_no_git(conteudo: bytes) -> bytes:
    """O arquivo como o Git guarda e o Pages publica: texto com LF (o .gitattributes pede isso).
    No Windows a cópia de trabalho tem CRLF; sem isto o SHA do manifesto não bateria com o publicado.
    Binário (tem byte zero nos primeiros 8000, a mesma regra do Git) fica como está."""
    if b"\x00" in conteudo[:8000]:
        return conteudo
    return conteudo.replace(b"\r\n", b"\n")


def montar_manifesto(pasta: Path, versao: str, apk_minimo: int) -> str:
    """O versao.txt: a versão, o APK mínimo e o SHA-256 e o tamanho de cada arquivo da pasta."""
    linhas = [f"versao {versao}", f"apk_minimo {apk_minimo}"]
    arquivos = sorted(p for p in pasta.rglob("*") if p.is_file() and p.relative_to(pasta).as_posix() != "versao.txt")
    for arquivo in arquivos:
        caminho = arquivo.relative_to(pasta).as_posix()
        if " " in caminho:
            raise ValueError(f"caminho com espaço não cabe no manifesto: {caminho}")
        conteudo = como_no_git(arquivo.read_bytes())
        linhas.append(f"arquivo {hashlib.sha256(conteudo).hexdigest()} {len(conteudo)} {caminho}")
    return "\n".join(linhas) + "\n"


def main():
    versao = carimbo()
    if DOCS.exists():
        shutil.rmtree(DOCS)
    (DOCS / "dados").mkdir(parents=True)

    for nome in TELAS:
        shutil.copy(RAIZ / "static" / nome, DOCS / nome)
    shutil.copytree(RAIZ / "static" / "fontes", DOCS / "fontes")  # fonte Inter embutida
    for arquivo in (RAIZ / "celular").iterdir():
        if arquivo.is_file() and arquivo.name not in ("android.js", "apk_minimo.txt"):
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

    sw = (DOCS / "sw.js").read_text(encoding="utf-8").replace("__VERSAO__", versao)
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
    # o Android deixa de fora dos assets os arquivos que começam com ponto: o manifesto não pode contar com eles
    (APK_WWW / ".nojekyll").unlink()

    # manifesto de versão: vai dentro do APK e, com a pasta inteira, para o Pages (docs/apk/)
    apk_minimo = int(APK_MINIMO.read_text(encoding="utf-8").strip() or "0")
    manifesto = montar_manifesto(APK_WWW, versao, apk_minimo)
    (APK_WWW / "versao.txt").write_text(manifesto, encoding="utf-8", newline="\n")
    shutil.copytree(APK_WWW, DOCS / "apk")

    print(f"Versão do celular gerada em {DOCS} ({sum(1 for _ in DOCS.rglob('*') if _.is_file())} arquivos).")
    print(f"Telas do APK copiadas para {APK_WWW} e publicadas em docs/apk/ (versão {versao}).")
    print("Agora faça commit e push: o GitHub monta o APK sozinho.")


if __name__ == "__main__":
    main()
