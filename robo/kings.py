"""Robô da Kings League: lê a página de cada competição no site oficial (kingsleague.pro/pt/...) e grava
kings.json com a temporada atual, os times (nome, sigla, escudo) e os jogos (data, estado, placar,
placar de cada tempo, pênaltis e o vídeo no YouTube).

- A página da liga traz os dados embutidos (o "payload" do Nuxt); o robô só decodifica. As páginas de
  cada jogo ficam de fora (o robots.txt do site não deixa: */jogos/, */matches/...).
- A classificação o app calcula pelos jogos (static/kings_regras.js): a página de classificação do site
  monta a tabela no navegador.
- Se uma página não vier, a competição fica como estava.
"""

import json
import re
from pathlib import Path
from urllib.parse import quote

from robo import rede
from robo.transmissoes import permitido

ARQUIVO = Path(__file__).resolve().parent.parent / "kings.json"
BASE = "https://kingsleague.pro"
# página no site -> nome no app
COMPETICOES = {
    "brazil": "Kings League Brasil",
    "world-cup": "Mundial da Kings",
    "kwc-nations": "Mundial de Seleções da Kings",
}
# as estatísticas da página /estatisticas (o site mostra os 3 primeiros de cada uma)
ESTATISTICAS = {"GOL": "Gols", "ASS-V": "Assistências", "PRT": "Defesas", "MVP": "MVP", "DRB": "Dribles"}
_PAYLOAD = re.compile(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', re.S)
_EMBRULHOS = ("Reactive", "ShallowReactive", "Ref", "ShallowRef", "NuxtError")


def decodificar(html):
    """O payload do Nuxt (uma lista em que cada valor aponta para outros pelo índice) como dicionário."""
    m = _PAYLOAD.search(html or "")
    if not m:
        return None
    lista = json.loads(m.group(1))

    def valor(i, profundidade=0):
        if profundidade > 60 or not isinstance(i, int) or not 0 <= i < len(lista):
            return None
        v = lista[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str):
                if v[0] in _EMBRULHOS:
                    return valor(v[1], profundidade + 1) if len(v) > 1 else None
                if v[0] in ("EmptyRef", "EmptyShallowRef"):
                    return None
                if v[0] == "Date":
                    return v[1]
                if v[0] in ("Set", "Map"):
                    return [valor(x, profundidade + 1) for x in v[1:]]
            return [valor(x, profundidade + 1) for x in v]
        if isinstance(v, dict):
            return {k: valor(x, profundidade + 1) for k, x in v.items()}
        return v

    return valor(0)


def _par(placar, casa, fora):
    a, b = placar.get(casa), placar.get(fora)
    return [a, b] if a is not None or b is not None else None


def extrair(dados):
    """A temporada atual, os times e os jogos de uma página de competição já decodificada."""
    loja = (((dados or {}).get("pinia") or {}).get("competitionStore")) or {}
    temporada = loja.get("currentSeason") or {}
    times = {}
    for t in loja.get("currentSeasonTeams") or []:
        if t and t.get("id") is not None:
            times[str(t["id"])] = {"nome": t.get("name"), "sigla": t.get("shortName"), "logo": (t.get("logo") or {}).get("url")}
    turnos = next(
        (v for v in ((dados or {}).get("data") or {}).values() if isinstance(v, list) and v and isinstance(v[0], dict) and "matches" in v[0]),
        [],
    )
    jogos = []
    for turno in turnos:
        for m in turno.get("matches") or []:
            placar = m.get("scores") or {}
            lados = m.get("participants") or {}
            meta = m.get("metaInformation") or {}
            jogos.append({
                "id": m.get("id"),
                "rodada": turno.get("turnName"),
                "grupo": m.get("groupName"),
                "inicio": m.get("date"),
                "status": m.get("status"),
                "minuto": m.get("currentMinute"),
                "casa": str(lados.get("homeTeamId")),
                "fora": str(lados.get("awayTeamId")),
                "placar": _par(placar, "homeScore", "awayScore"),
                "tempos": [p for p in (_par(placar, "homeScore1T", "awayScore1T"), _par(placar, "homeScore2T", "awayScore2T")) if p],
                "penaltis": _par(placar, "homeScoreP", "awayScoreP"),
                "video": meta.get("youtube_url") or None,
            })
    jogos.sort(key=lambda j: (j["inicio"] or "", j["id"] or 0))
    competicao = temporada.get("competition") or {}
    return {
        "temporada": temporada.get("name"),
        "inicio": temporada.get("start"),
        "fim": temporada.get("finish"),
        "encerrada": bool(temporada.get("finished")),
        "logo": ((temporada.get("image") or {}).get("url")) or ((competicao.get("image") or {}).get("url")),
        "times": times,
        "jogos": jogos,
    }


# os autores dos gols dos Mundiais: as súmulas da Wikipédia em inglês (o site só os mostra na página de cada
# jogo, que o robots.txt proíbe). A Kings League Brasil atual não tem artigo com súmulas.
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
ARTIGOS_WIKIPEDIA = {"world-cup": "{ano} Kings World Cup Clubs", "kwc-nations": "{ano} Kings World Cup Nations"}
# os dois formatos de súmula: {{#invoke:football box|main ...}} e {{football box ...}}
_CAIXA_WIKI = re.compile(r"\{\{(?:#invoke:football box\|main|football box)\s*\n(.*?)\n\}\}", re.S)
NOTAS_GOL = {"pen.": "p", "pen": "p", "o.g.": "contra", "og": "contra"}


def _sem_marcacao(texto):
    """O nome sem os templates ({{flagicon|ITA}}) e com o texto dos links ([[Vlad Marin|Marin]] -> Marin)."""
    t = re.sub(r"\{\{[^{}]*\}\}", "", texto or "")
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


def _templates(texto, nome):
    """O miolo de cada {{nome|...}}, com os templates de dentro ({{abbr|pp|...}}) inteiros."""
    saida = []
    marca = "{{" + nome + "|"
    i = texto.find(marca)
    while i >= 0:
        pos, prof = i, 0
        while pos < len(texto):
            if texto.startswith("{{", pos):
                prof, pos = prof + 1, pos + 2
            elif texto.startswith("}}", pos):
                prof, pos = prof - 1, pos + 2
                if prof == 0:
                    break
            else:
                pos += 1
        saida.append(texto[i + len(marca):pos - 2])
        i = texto.find(marca, pos)
    return saida


def _parametros(texto):
    """Os parâmetros de um template, separados pelos | de fora."""
    partes, atual, prof, i = [], "", 0, 0
    while i < len(texto):
        if texto.startswith("{{", i):
            prof, atual, i = prof + 1, atual + "{{", i + 2
        elif texto.startswith("}}", i):
            prof, atual, i = prof - 1, atual + "}}", i + 2
        elif texto[i] == "|" and prof == 0:
            partes.append(atual)
            atual, i = "", i + 1
        else:
            atual, i = atual + texto[i], i + 1
    partes.append(atual)
    return partes


def _gols_do_lado(texto):
    """[{nome, minuto, tipo}] de um "goals1=" da súmula; o tipo é a nota do minuto (p, pp, x2...)."""
    gols = []
    for item in re.split(r"<br\s*/?>", texto or ""):
        nome = _sem_marcacao(item.split("{{", 1)[0])
        for miolo in _templates(item, "goal"):
            p = _parametros(miolo)
            for k in range(0, len(p), 2):
                minuto = p[k].strip()
                if not minuto.isdigit():
                    continue
                nota = p[k + 1] if k + 1 < len(p) else ""
                nota = re.sub(r"\{\{abbr\|([^|}]*)\|[^{}]*\}\}", r"\1", nota).strip().lower()
                nota = NOTAS_GOL.get(nota, nota)
                gols.append({"nome": nome, "minuto": int(minuto), "tipo": nota or None})
    return gols


def sumulas(wikitext):
    """As súmulas de um artigo: o número do jogo no site (do link oficial), os dois times e os gols de cada lado."""
    saida = []
    for m in _CAIXA_WIKI.finditer(wikitext or ""):
        campos = {k: v.strip() for k, v in re.findall(r"^\|\s*(\w+)\s*=(.*)$", m.group(1), re.M)}
        link = re.search(r"/(\d+)-[a-z0-9]+-vs-[a-z0-9]+", campos.get("report", ""))
        saida.append({
            "id": int(link.group(1)) if link else None,
            "times": [_sem_marcacao(campos.get("team1")), _sem_marcacao(campos.get("team2"))],
            "gols": [_gols_do_lado(campos.get("goals1")), _gols_do_lado(campos.get("goals2"))],
        })
    return saida


def _mesmo_nome(a, b):
    n = lambda x: re.sub(r"[^a-z0-9]+", " ", (x or "").lower()).strip()  # noqa: E731
    return n(a) == n(b)


def juntar_gols(comp, lista):
    """Põe em cada jogo da competição os gols da súmula com o mesmo número, do lado certo (casa 0, fora 1)."""
    por_id = {s["id"]: s for s in lista if s["id"] is not None}
    times = comp.get("times") or {}
    for jogo in comp.get("jogos") or []:
        s = por_id.get(jogo.get("id"))
        if not s:
            continue
        casa = (times.get(str(jogo.get("casa"))) or {}).get("nome")
        invertido = _mesmo_nome(s["times"][1], casa) and not _mesmo_nome(s["times"][0], casa)
        gols = []
        for lado_sumula, lista_gols in enumerate(s["gols"]):
            lado = 1 - lado_sumula if invertido else lado_sumula
            gols.extend({"lado": lado, **g} for g in lista_gols)
        if gols:
            jogo["gols"] = sorted(gols, key=lambda g: (g["minuto"], g["lado"]))


def destaques(dados):
    """Os 3 primeiros de cada estatística (gols, assistências, defesas, MVP, dribles) da página /estatisticas."""
    por_codigo = {}
    for v in ((dados or {}).get("data") or {}).values():
        if not (isinstance(v, list) and v and isinstance(v[0], dict) and v[0].get("parameterCode") in ESTATISTICAS):
            continue
        codigo = v[0]["parameterCode"]
        lideres = []
        for e in sorted(v, key=lambda x: x.get("ranking") or 99):
            jogador = e.get("player") or {}
            lideres.append({
                "nome": jogador.get("shortName") or jogador.get("displayName"),
                "foto": (jogador.get("image") or {}).get("url"),
                "time": str((e.get("team") or {}).get("id")),
                "total": e.get("total"),
                "jogos": e.get("matchesPlayed"),
            })
        por_codigo[codigo] = {"codigo": codigo, "nome": ESTATISTICAS[codigo], "lideres": lideres}
    return [por_codigo[c] for c in ESTATISTICAS if c in por_codigo]


def atualizar(arquivo, hoje=None, pegar_texto=None, competicoes=None, pegar_json=None):
    """Lê a página de cada competição e grava em arquivo["competicoes"]; devolve a lista do que mudou."""
    pegar_texto = pegar_texto or rede.pegar_texto
    pegar_json = pegar_json or rede.pegar_json
    competicoes = competicoes or COMPETICOES
    robots = pegar_texto(f"{BASE}/robots.txt")
    guardadas = arquivo.setdefault("competicoes", {})
    mudancas = []
    for slug, nome in competicoes.items():
        caminho = f"/pt/{slug}"
        if not permitido(robots, caminho):
            rede.aviso(f"o robots.txt da Kings League não deixa ler {caminho}")
            continue
        html = pegar_texto(f"{BASE}{caminho}")
        try:
            dados = extrair(decodificar(html)) if html else None
        except (ValueError, TypeError, KeyError) as erro:
            rede.aviso(f"não deu para ler {caminho}: {erro}")
            dados = None
        if not dados or not dados["jogos"]:
            continue  # página fora do ar ou mudou de formato: fica como estava
        dados = {"nome": nome, **dados}
        # os destaques (artilharia e companhia): sem a página, ficam os que já estavam
        caminho_est = f"{caminho}/estatisticas"
        html_est = pegar_texto(f"{BASE}{caminho_est}") if permitido(robots, caminho_est) else None
        try:
            lista = destaques(decodificar(html_est)) if html_est else []
        except (ValueError, TypeError, KeyError):
            lista = []
        dados["destaques"] = lista or (guardadas.get(slug) or {}).get("destaques", [])
        # os autores dos gols dos Mundiais (Wikipédia); sem o artigo, os gols que já estavam ficam
        if slug in ARTIGOS_WIKIPEDIA and dados.get("fim"):
            titulo = ARTIGOS_WIKIPEDIA[slug].format(ano=dados["fim"][:4])
            r = pegar_json(f"{WIKIPEDIA}?action=parse&page={quote(titulo)}&prop=wikitext&format=json&formatversion=2")
            texto = ((r or {}).get("parse") or {}).get("wikitext")
            if texto:
                juntar_gols(dados, sumulas(texto))
        antigos = {j["id"]: j.get("gols") for j in (guardadas.get(slug) or {}).get("jogos", [])}
        for j in dados["jogos"]:
            if "gols" not in j and antigos.get(j["id"]):
                j["gols"] = antigos[j["id"]]
        if guardadas.get(slug) != dados:
            antes = {j["id"]: (j["status"], j["placar"]) for j in (guardadas.get(slug) or {}).get("jogos", [])}
            novos = sum(1 for j in dados["jogos"] if antes.get(j["id"]) != (j["status"], j["placar"]))
            guardadas[slug] = dados
            mudancas.append(f"kings: {nome} ({dados['temporada']}): {novos} jogo(s) novo(s) ou atualizado(s)")
    return mudancas


def main():
    """python -m robo.kings: só a Kings League (o workflow das noites de jogo usa)."""
    texto = ARQUIVO.read_text(encoding="utf-8") if ARQUIVO.exists() else "{}"
    arquivo = json.loads(texto)
    mudancas = atualizar(arquivo)
    for m in mudancas:
        print(m)
    if mudancas:
        ARQUIVO.write_text(json.dumps(arquivo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        print("kings: nada novo")


if __name__ == "__main__":
    main()
