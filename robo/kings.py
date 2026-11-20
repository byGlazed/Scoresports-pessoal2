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


def atualizar(arquivo, hoje=None, pegar_texto=None, competicoes=None):
    """Lê a página de cada competição e grava em arquivo["competicoes"]; devolve a lista do que mudou."""
    pegar_texto = pegar_texto or rede.pegar_texto
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
