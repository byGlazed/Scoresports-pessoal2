"""Lutas grandes de boxe pela Wikipédia (em inglês), para o boxe_eventos.json.

A fonte são os artigos das categorias "AAAA boxing matches" (ano atual e o seguinte): cada um tem
uma ficha ({{Infobox boxing match}}) com data, local, cinturões e, depois da luta, o resultado.
O cartel dos lutadores não serve: a Wikipédia não deixa pôr lutas futuras nele.

- Luta futura que não está no arquivo: entra (sem horário e sem canal; o dono completa se quiser).
- Luta do arquivo que já aconteceu e está sem resultado: ganha vencedor e resultado.
- Nada que já está escrito é trocado.

    python -m robo.boxe --seco   # mostra o que mudaria, sem gravar
"""

import json
import re
import sys
import unicodedata
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

from robo.rede import aviso, pegar_json

API = "https://en.wikipedia.org/w/api.php?"
ARQUIVO = Path(__file__).resolve().parent.parent / "boxe_eventos.json"
FRASE_ROBO = "O robô acrescenta as lutas grandes que têm artigo na Wikipédia e completa os resultados."

FORMATOS_DATA = ("%B %d, %Y", "%d %B %Y", "%B %d %Y", "%d %b %Y", "%b %d, %Y")

METODOS = [
    (r"unanimous decision|\bUD\b", "Decisão unânime"),
    (r"split decision|\bSD\b", "Decisão dividida"),
    (r"majority decision|\bMD\b", "Decisão majoritária"),
    (r"technical decision|\bTD\b", "Decisão técnica"),
    (r"technical knockout|\bTKO\b|corner retirement|\bRTD\b", "Nocaute técnico"),
    (r"knockout|\bKO\b", "Nocaute"),
    (r"disqualification|\bDQ\b", "Desclassificação"),
]


def limpar(texto):
    """Tira a marcação da Wikipédia: links, negrito, modelos, referências e quebras."""
    t = texto or ""
    t = re.sub(r"<ref[^>]*/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"<br\s*/?>", " ", t)
    t = re.sub(r"<[^>]+>", "", t)
    for _ in range(3):
        t = re.sub(r"\{\{(?:small|nowrap|flagicon[^|}]*)\|([^{}]*)\}\}", r"\1", t)
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", t)
    t = t.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", t).strip(" ,")


def _campos_da_ficha(wikitexto):
    """Os campos da ficha {{Infobox boxing match}} (o valor pode continuar nas linhas seguintes)."""
    inicio = wikitexto.find("{{Infobox boxing match")
    if inicio < 0:
        return None
    campos = {}
    atual = None
    for linha in wikitexto[inicio:].splitlines()[1:]:
        m = re.match(r"\s*\|\s*([^=|]+?)\s*=(.*)", linha)
        if m:
            atual = m.group(1).strip().lower()
            campos[atual] = m.group(2)
        elif linha.strip().startswith("}}"):
            break
        elif atual:
            campos[atual] += " " + linha
        # a ficha termina numa linha que acaba com "}}" fora de um modelo aberto
        if atual and campos[atual].count("{{") < campos[atual].count("}}"):
            campos[atual] = campos[atual][: campos[atual].rfind("}}")]
            break
    return campos


def _data(texto):
    t = limpar(texto)
    t = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", t)
    for formato in FORMATOS_DATA:
        try:
            return datetime.strptime(t, formato).date().isoformat()
        except ValueError:
            continue
    return None


def _sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn").lower()


def _sobrenome(nome):
    partes = re.findall(r"[a-z0-9]+", _sem_acento(nome))
    return partes[-1] if partes else ""


def _resultado(texto, lutadores):
    """(vencedor, resultado em português) a partir de 'Inoue wins by unanimous decision (...)'."""
    t = limpar(texto)
    if not t:
        return None, None
    if re.search(r"\bdraw\b", t, re.I):
        return None, "Empate"
    if re.search(r"no contest", t, re.I):
        return None, "Sem resultado (no contest)"
    m = re.search(r"\b(wins|won|def\.|defeats|defeated)\b", t, re.I)
    if not m:
        return None, None
    antes = _sem_acento(t[: m.start()])
    vencedores = [l for l in lutadores if _sobrenome(l) and _sobrenome(l) in antes]
    if len(vencedores) != 1:
        return None, None
    metodo = next((pt for padrao, pt in METODOS if re.search(padrao, t, re.I)), None)
    if not metodo:
        metodo = t[m.end():].strip()[:80] or None
    rodada = re.search(r"(\d+)(?:st|nd|rd|th)[- ]round|round (\d+)", t, re.I)
    if rodada and metodo and metodo.startswith(("Nocaute", "Desclassificação")):
        metodo += f" no {rodada.group(1) or rodada.group(2)}º round"
    return vencedores[0], metodo


def ficha_da_luta(wikitexto):
    campos = _campos_da_ficha(wikitexto or "")
    if not campos:
        return None
    lutadores = [limpar(campos.get("fighter1")), limpar(campos.get("fighter2"))]
    data = _data(campos.get("fight date", ""))
    if not data or not all(lutadores):
        return None
    vencedor, resultado = _resultado(campos.get("result", ""), lutadores)
    return {
        "data": data,
        "lutadores": lutadores,
        "local": limpar(campos.get("location")),
        "titulo": limpar(campos.get("titles"))[:160],
        "vencedor": vencedor,
        "resultado": resultado,
    }


def id_da_luta(data, lutadores):
    return f"{data}-" + "-".join(_sobrenome(l) for l in lutadores)


def mesma_luta(evento, ficha):
    try:
        dia = date.fromisoformat(evento.get("data", ""))
    except ValueError:
        return False
    if abs(dia - date.fromisoformat(ficha["data"])) > timedelta(days=1):
        return False
    principal = (evento.get("lutas") or [{}])[0].get("lutadores") or []
    sobrenomes = {_sobrenome(n) for n in principal}
    return all(_sobrenome(l) in sobrenomes for l in ficha["lutadores"])


def juntar_luta(arquivo, ficha, hoje):
    """Acrescenta a luta futura ou completa o resultado. Devolve o que mudou, ou None."""
    eventos = arquivo.setdefault("eventos", [])
    existente = next((e for e in eventos if mesma_luta(e, ficha)), None)
    nome = f"{ficha['lutadores'][0]} x {ficha['lutadores'][1]}"
    if existente:
        luta = existente["lutas"][0]
        if ficha["resultado"] and not luta.get("vencedor") and not luta.get("resultado"):
            luta["vencedor"] = ficha["vencedor"]
            luta["resultado"] = ficha["resultado"]
            return f"boxe {nome}: resultado {ficha['resultado']}"
        return None
    if date.fromisoformat(ficha["data"]) < hoje:
        return None  # luta passada que não estava no arquivo: fica de fora
    eventos.append({
        "id": id_da_luta(ficha["data"], ficha["lutadores"]),
        "data": ficha["data"],
        "inicio": None,
        "nome": nome,
        "local": ficha["local"],
        "canais": [],
        "lutas": [{"lutadores": ficha["lutadores"], "categoria": "", "titulo": ficha["titulo"], "vencedor": None, "resultado": None}],
    })
    eventos.sort(key=lambda e: e.get("data") or "")
    return f"boxe {nome}: luta nova em {ficha['data']}"


def _url(**parametros):
    return API + urllib.parse.urlencode({**parametros, "format": "json", "formatversion": 2})


def atualizar(arquivo, hoje, buscar=pegar_json):
    mudancas = []
    titulos = []
    for ano in (hoje.year, hoje.year + 1):
        dados = buscar(_url(action="query", list="categorymembers", cmtitle=f"Category:{ano} boxing matches", cmlimit=200, cmtype="page"))
        if dados is None:
            continue
        titulos += [m["title"] for m in (dados.get("query") or {}).get("categorymembers") or []]
    for titulo in titulos:
        try:
            dados = buscar(_url(action="parse", page=titulo, prop="wikitext", section=0, redirects=1))
            ficha = ficha_da_luta(((dados or {}).get("parse") or {}).get("wikitext"))
            if not ficha:
                continue
            mudanca = juntar_luta(arquivo, ficha, hoje)
            if mudanca:
                mudancas.append(mudanca)
        except Exception as erro:  # um artigo estranho não derruba os outros
            aviso(f"boxe {titulo}: {erro}")
    if mudancas and FRASE_ROBO not in arquivo.get("_como_usar", ""):
        arquivo["_como_usar"] = (arquivo.get("_como_usar", "") + " " + FRASE_ROBO).strip()
    return mudancas


def main():
    seco = "--seco" in sys.argv
    arquivo = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    mudancas = atualizar(arquivo, date.today())
    for m in mudancas:
        print(m)
    if not mudancas:
        print("boxe: nada novo")
    elif not seco:
        ARQUIVO.write_text(json.dumps(arquivo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
