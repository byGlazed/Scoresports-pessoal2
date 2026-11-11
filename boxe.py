"""Boxe: agenda (boxe_eventos.json) e perfil dos lutadores (Wikipédia).

O boxe não tem uma fonte de dados aberta e única. A agenda fica no arquivo editável e o
perfil de cada lutador vem da Wikipédia: o quadro de informações da página em inglês
(cartel, nocautes, base, altura, envergadura) e o resumo em português, quando existir.
"""

import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

import indice
import transmissoes

ARQUIVO = Path(__file__).parent / "boxe_eventos.json"
WIKI_EN = "https://en.wikipedia.org"
WIKI_PT = "https://pt.wikipedia.org"
CABECALHOS = {"User-Agent": "Scoresports-pessoal/1.0 (projeto pessoal de estudo)"}


def _ler_arquivo():
    try:
        return json.loads(ARQUIVO.read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        raise RuntimeError(f"Não foi possível ler boxe_eventos.json: {erro}") from erro


def id_lutador(nome):
    """O boxe não tem id oficial: o id é o nome sem acento, com hífens."""
    return re.sub(r"[^a-z0-9]+", "-", indice.normalizar(nome)).strip("-")


def buscar_eventos():
    conteudo = _ler_arquivo()
    agora = datetime.now(timezone.utc)
    eventos = []
    for e in conteudo.get("eventos", []):
        inicio = transmissoes.para_brasilia(e.get("inicio"))
        lutas = e.get("lutas") or []
        terminou = any(l.get("vencedor") or l.get("resultado") for l in lutas)
        if inicio is not None:
            if terminou or inicio + timedelta(hours=5) < agora:
                estado = 3
            elif inicio <= agora:
                estado = 2
            else:
                estado = 1
        else:
            estado = 3 if terminou or (e.get("data") or "9999") < agora.strftime("%Y-%m-%d") else 1
        canais = list(e.get("canais") or [])
        if canais:
            transmissao = {"canais": canais, "confirmado": True, "observacao": e.get("observacao"), "conferido_em": e.get("conferido_em"), "fonte": e.get("fonte")}
        else:
            transmissao = transmissoes.onde_assistir("boxe", data=e.get("data"), inicio=inicio, evento=e.get("nome"))
        eventos.append(
            {
                "id": e.get("id") or e.get("nome"),
                "nome": e.get("nome") or "",
                "data": e.get("data") or (inicio.strftime("%Y-%m-%d") if inicio else None),
                "inicio": inicio.isoformat() if inicio else None,
                "local": e.get("local") or None,
                "estado": estado,
                "lutas": [
                    {
                        "lutadores": list(l.get("lutadores") or []),
                        "ids": [id_lutador(n) for n in l.get("lutadores") or []],
                        "categoria": l.get("categoria") or None,
                        "titulo": l.get("titulo") or None,
                        "vencedor": l.get("vencedor"),
                        "resultado": l.get("resultado"),
                    }
                    for l in lutas
                ],
                "transmissao": transmissao,
            }
        )
    eventos.sort(key=lambda e: (e["data"] or "", e["inicio"] or ""))
    indice.registrar(
        [
            {"esporte": "boxe", "liga": "boxe", "id": id_lutador(n), "nome": n, "descricao": f"Boxe, {l['categoria']}" if l["categoria"] else "Boxe"}
            for e in eventos
            for l in e["lutas"]
            for n in l["lutadores"]
        ]
    )
    return eventos


# ---------- Perfil pela Wikipédia ----------

_BASES = {"orthodox": "Destro (ortodoxo)", "southpaw": "Canhoto", "switch": "Troca de base"}
_PESOS = {
    "heavyweight": "Pesado",
    "cruiserweight": "Cruzador",
    "bridgerweight": "Bridger",
    "light heavyweight": "Meio-pesado",
    "super middleweight": "Supermédio",
    "middleweight": "Médio",
    "light middleweight": "Superwelter",
    "super welterweight": "Superwelter",
    "welterweight": "Meio-médio",
    "light welterweight": "Superleve",
    "super lightweight": "Superleve",
    "lightweight": "Leve",
    "super featherweight": "Superpena",
    "featherweight": "Pena",
    "super bantamweight": "Supergalo",
    "bantamweight": "Galo",
    "super flyweight": "Supermosca",
    "flyweight": "Mosca",
    "light flyweight": "Minimosca",
    "minimumweight": "Palha",
}


def _wiki(base, params):
    resp = requests.get(f"{base}/w/api.php", params={**params, "format": "json", "formatversion": 2}, headers=CABECALHOS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def _modelo(texto):
    """Converte os modelos mais comuns da Wikipédia ({{...}}) em texto."""
    partes = [p.strip() for p in texto.strip("{}").split("|")]
    nome = partes[0].lower() if partes else ""
    posicionais = [p for p in partes[1:] if "=" not in p]
    nomeados = dict(p.split("=", 1) for p in partes[1:] if "=" in p)
    nomeados = {k.strip().lower(): v.strip() for k, v in nomeados.items()}
    if nome.startswith("birth date"):
        try:
            a, m, d = (int(x) for x in posicionais[:3])
            nascimento = date(a, m, d)
            hoje = date.today()
            idade = hoje.year - a - ((hoje.month, hoje.day) < (m, d))
            return f"{nascimento.strftime('%d/%m/%Y')} ({idade} anos)"
        except (ValueError, IndexError):
            return ""
    if nome == "height":
        if "m" in nomeados:
            return f"{float(nomeados['m']):.2f} m".replace(".", ",")
        if "cm" in nomeados:
            return f"{nomeados['cm']} cm"
        try:
            pes, pol = float(nomeados.get("ft", 0)), float(nomeados.get("in", 0))
            return f"{(pes * 12 + pol) * 2.54 / 100:.2f} m".replace(".", ",")
        except ValueError:
            return ""
    if nome == "convert" and len(posicionais) >= 2:
        valor, unidade = posicionais[0], posicionais[1]
        try:
            if unidade == "in":
                return f"{float(valor) * 2.54:.0f} cm"
            if unidade == "cm":
                return f"{valor} cm"
        except ValueError:
            return ""
        return f"{valor} {unidade}"
    if nome in ("flag", "flagcountry", "flagicon", "flagu") and posicionais:
        return posicionais[0]
    if nome in ("nowrap", "small") and posicionais:
        return posicionais[0]
    return ""


def _limpar(valor):
    v = re.sub(r"<ref[^>]*/>", "", valor)
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"<br\s*/?>", ", ", v)
    for _ in range(3):  # modelos dentro de modelos
        v = re.sub(r"\{\{[^{}]*\}\}", lambda m: _modelo(m.group(0)), v)
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", v)
    v = re.sub(r"'''?", "", v)
    v = re.sub(r"<[^>]+>", "", v)
    return " ".join(v.split()).strip(" ,")


def _quadro(wikitexto):
    """Campos do quadro de informações ({{Infobox boxer ...}})."""
    campos = {}
    for linha in wikitexto.splitlines():
        m = re.match(r"\s*\|\s*([A-Za-z_ ]+?)\s*=\s*(.*)$", linha)
        if m:
            campos[m.group(1).strip().lower().replace(" ", "_")] = _limpar(m.group(2))
    return campos


def _numero(texto):
    m = re.search(r"\d+", texto or "")
    return int(m.group(0)) if m else None


def _traduzir_peso(texto):
    t = (texto or "").lower()
    achados = []
    # do nome mais longo para o mais curto: "light heavyweight" sai antes de "heavyweight"
    for en, pt in sorted(_PESOS.items(), key=lambda x: -len(x[0])):
        if en in t:
            achados.append((t.index(en), pt))
            t = t.replace(en, " " * len(en))
    achados.sort()
    return ", ".join(dict.fromkeys(pt for _, pt in achados)) or texto or None


_NACIONALIDADES = {
    "northern irish": "Norte-irlandês", "puerto rican": "Porto-riquenho", "british": "Britânico", "english": "Inglês",
    "american": "Americano", "mexican": "Mexicano", "german": "Alemão", "brazilian": "Brasileiro", "ukrainian": "Ucraniano",
    "japanese": "Japonês", "australian": "Australiano", "irish": "Irlandês", "canadian": "Canadense", "cuban": "Cubano",
    "polish": "Polonês", "kazakh": "Cazaque", "kazakhstani": "Cazaque", "uzbek": "Uzbeque", "filipino": "Filipino",
    "russian": "Russo", "french": "Francês", "italian": "Italiano", "spanish": "Espanhol", "argentine": "Argentino",
    "venezuelan": "Venezuelano", "colombian": "Colombiano", "dominican": "Dominicano", "albanian": "Albanês",
    "nigerian": "Nigeriano", "ghanaian": "Ganês", "welsh": "Galês", "scottish": "Escocês", "new zealander": "Neozelandês",
    "turkish": "Turco", "swedish": "Sueco", "chinese": "Chinês", "korean": "Coreano", "nicaraguan": "Nicaraguense",
}


def _traduzir_nacionalidade(texto):
    if not texto:
        return None
    saida = texto
    for en, pt in sorted(_NACIONALIDADES.items(), key=lambda x: -len(x[0])):
        saida = re.sub(rf"\b{en}\b", pt, saida, flags=re.I)
    return saida


def buscar_lutador(nome):
    """Perfil de um boxeador: cartel, dados físicos, resumo e lutas da agenda."""
    nome = (nome or "").strip()
    if not nome:
        raise LookupError("Nome vazio.")
    achados = _wiki(WIKI_EN, {"action": "query", "list": "search", "srsearch": f"{nome} boxer", "srlimit": 5})
    resultados = (achados.get("query") or {}).get("search") or []
    sobrenome = indice.normalizar(nome).split()[-1]
    titulo = next((r["title"] for r in resultados if sobrenome in indice.normalizar(r["title"])), None)

    perfil = {"id": id_lutador(nome), "nome": nome, "encontrado": False, "fonte": None, "lutas_agenda": []}
    if titulo:
        pagina = _wiki(
            WIKI_EN,
            {"action": "query", "prop": "revisions|pageimages|langlinks|extracts", "rvprop": "content", "rvslots": "main", "rvsection": 0,
             "titles": titulo, "pithumbsize": 400, "lllang": "pt", "exintro": 1, "explaintext": 1, "exsentences": 3},
        )
        paginas = (pagina.get("query") or {}).get("pages") or [{}]
        p = paginas[0]
        texto = (((p.get("revisions") or [{}])[0].get("slots") or {}).get("main") or {}).get("content") or ""
        campos = _quadro(texto)
        resumo = p.get("extract")
        resumo_pt = None
        links_pt = p.get("langlinks") or []
        titulo_pt = links_pt[0].get("title") if links_pt else None
        if titulo_pt:
            try:
                pt = _wiki(WIKI_PT, {"action": "query", "prop": "extracts", "titles": titulo_pt, "exintro": 1, "explaintext": 1, "exsentences": 3})
                resumo_pt = (((pt.get("query") or {}).get("pages") or [{}])[0]).get("extract")
            except Exception:
                resumo_pt = None
        vitorias, derrotas, empates = _numero(campos.get("wins")), _numero(campos.get("losses")), _numero(campos.get("draws"))
        perfil.update(
            {
                "encontrado": True,
                "nome": campos.get("name") or titulo,
                "apelido": campos.get("nickname") or None,
                "foto": (p.get("thumbnail") or {}).get("source"),
                "resumo": resumo_pt or resumo,
                "resumo_idioma": "pt" if resumo_pt else "en",
                "nacionalidade": _traduzir_nacionalidade(campos.get("nationality")),
                "nascimento": campos.get("birth_date") or None,
                "categoria": _traduzir_peso(campos.get("weight") or campos.get("weight_class") or campos.get("division")),
                "altura": campos.get("height") or None,
                "envergadura": campos.get("reach") or None,
                "base": _BASES.get((campos.get("stance") or "").strip().lower(), campos.get("stance") or None),
                "cartel": {
                    "lutas": _numero(campos.get("total")),
                    "vitorias": vitorias,
                    "nocautes": _numero(campos.get("ko")),
                    "derrotas": derrotas,
                    "empates": empates,
                    "sem_resultado": _numero(campos.get("no_contests")),
                }
                if vitorias is not None
                else None,
                "fonte": f"{WIKI_PT}/wiki/{titulo_pt.replace(' ', '_')}" if titulo_pt else f"{WIKI_EN}/wiki/{titulo.replace(' ', '_')}",
            }
        )

    # lutas desse lutador que estão na agenda
    alvo = indice.normalizar(nome)
    try:
        eventos = buscar_eventos()
    except RuntimeError:
        eventos = []
    for e in eventos:
        for l in e["lutas"]:
            if any(indice.normalizar(n) == alvo for n in l["lutadores"]):
                adversario = next((n for n in l["lutadores"] if indice.normalizar(n) != alvo), "")
                perfil["lutas_agenda"].append(
                    {"evento": e["nome"], "data": e["data"], "adversario": adversario, "categoria": l["categoria"], "titulo": l["titulo"], "vencedor": l["vencedor"], "resultado": l["resultado"], "estado": e["estado"]}
                )
    return perfil
