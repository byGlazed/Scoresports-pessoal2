"""Onde assistir no Brasil.

Lê o arquivo transmissoes.json e decide os canais de cada jogo ou evento, em duas etapas:

1. Grade confirmada: se o jogo está na lista "jogos" do arquivo (data + times, ou data + nome do
   evento), usa exatamente os canais anotados ali. É aqui que entram as grades semanais que
   ESPN, Prime Video, SporTV etc. divulgam.
2. Padrão da competição: se o jogo não está na lista, usa o bloco "padroes" (por exemplo, todo
   jogo da NBA está no League Pass, todo evento do UFC está no Paramount+). As "regras" de cada
   padrão acrescentam canais por dia da semana, horário ou tipo de sessão.

O arquivo é relido sozinho quando muda, então não precisa reiniciar o servidor.
"""

import json
import logging
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ARQUIVO = Path(__file__).parent / "transmissoes.json"
FUSO_BRASILIA = ZoneInfo("America/Sao_Paulo")
DIAS = {"seg": 0, "ter": 1, "qua": 2, "qui": 3, "sex": 4, "sab": 5, "sáb": 5, "dom": 6}

logger = logging.getLogger("uvicorn.error")
_memoria = {"mtime": None, "dados": {}}


def _carregar():
    try:
        mtime = ARQUIVO.stat().st_mtime
    except OSError:
        return {}
    if _memoria["mtime"] != mtime:
        try:
            _memoria["dados"] = json.loads(ARQUIVO.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            logger.exception("transmissoes.json está com erro de formatação; usando arquivo vazio")
            _memoria["dados"] = {}
        _memoria["mtime"] = mtime
    return _memoria["dados"]


def normalizar(texto):
    """'São Paulo FC' -> 'sao paulo fc'."""
    base = unicodedata.normalize("NFKD", str(texto or ""))
    return " ".join("".join(c for c in base if not unicodedata.combining(c)).lower().split())


def para_brasilia(inicio):
    """Aceita datetime ou texto ISO ('2026-11-15T18:00Z') e devolve datetime no fuso de Brasília."""
    if not inicio:
        return None
    if isinstance(inicio, str):
        texto = inicio.strip().replace("Z", "+00:00")
        try:
            inicio = datetime.fromisoformat(texto)
        except ValueError:
            return None
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=timezone.utc)
    return inicio.astimezone(FUSO_BRASILIA)


# a ESPN e a NBA usam siglas diferentes para alguns times da NBA
SIGLAS_EQUIVALENTES = {"wsh": "was", "gs": "gsw", "ny": "nyk", "sa": "sas", "no": "nop", "utah": "uta", "pho": "phx"}


def _sigla(texto):
    t = normalizar(texto)
    return SIGLAS_EQUIVALENTES.get(t, t)


def _bate_time(chave, candidatos):
    """A chave do arquivo ('DET', 'Palmeiras') bate com algum nome/sigla do time?"""
    k = _sigla(chave)
    if not k:
        return False
    for c in candidatos:
        c = _sigla(c)
        if not c:
            continue
        if k == c:
            return True
        # nomes (não siglas) podem ser parte do nome completo: 'palmeiras' em 'se palmeiras'
        if len(k) > 4 and k in c:
            return True
    return False


def _times_batem(item, times):
    chaves = list(item.get("times") or [])
    if not chaves and (item.get("fora") or item.get("casa")):
        chaves = [item.get("fora"), item.get("casa")]  # formato antigo do arquivo
    chaves = [c for c in chaves if c]
    if not chaves or len(times) < len(chaves):
        return False
    usados = set()
    for chave in chaves:
        achou = False
        for i, candidatos in enumerate(times):
            if i not in usados and _bate_time(chave, candidatos):
                usados.add(i)
                achou = True
                break
        if not achou:
            return False
    return True


def _evento_bate(item, evento):
    nome = normalizar(item.get("evento"))
    return bool(nome) and nome in normalizar(evento)


def _sem_repetir(lista):
    vistos, saida = set(), []
    for x in lista:
        if x and x not in vistos:
            vistos.add(x)
            saida.append(x)
    return saida


def _regra_vale(regra, inicio_br, sessao):
    if regra.get("sessoes"):
        if not sessao or normalizar(sessao) not in {normalizar(s) for s in regra["sessoes"]}:
            return False
    if regra.get("dias") or regra.get("de") or regra.get("ate"):
        if inicio_br is None:
            return False
        if regra.get("dias") and inicio_br.weekday() not in {DIAS.get(normalizar(d)[:3], -1) for d in regra["dias"]}:
            return False
        hora = inicio_br.strftime("%H:%M")
        if regra.get("de") and hora < regra["de"]:
            return False
        if regra.get("ate") and hora > regra["ate"]:
            return False
    return True


def onde_assistir(esporte, liga=None, data=None, inicio=None, times=(), evento=None, sessao=None):
    """Canais no Brasil para um jogo, sessão ou evento.

    times: lista com os nomes possíveis de cada time, por exemplo
           [["DET", "Detroit Pistons"], ["WAS", "Washington Wizards"]] (a ordem não importa).
    Devolve None quando não há nenhuma informação para essa competição.
    """
    dados = _carregar()
    inicio_br = para_brasilia(inicio)
    if data is None and inicio_br is not None:
        data = inicio_br.strftime("%Y-%m-%d")

    # item escrito à mão vem antes do item do robô dos canais (fonte "guia de TV")
    for item in sorted(dados.get("jogos", []), key=lambda i: i.get("fonte") == "guia de TV"):
        if (item.get("esporte") or "nba") != esporte:
            continue
        if item.get("liga") and liga and item["liga"] != liga:
            continue
        if item.get("data") != data:
            continue
        if item.get("sessao") and (not sessao or normalizar(item["sessao"]) != normalizar(sessao)):
            continue
        if item.get("evento"):
            if not evento or not _evento_bate(item, evento):
                continue
        elif not _times_batem(item, list(times)):
            continue
        return {
            "canais": _sem_repetir(item.get("canais") or []),
            "confirmado": True,
            "observacao": item.get("observacao") or None,
            "conferido_em": item.get("conferido_em"),
            "fonte": item.get("fonte"),
        }

    padroes = dados.get("padroes", {})
    padrao = padroes.get(f"{esporte}:{liga}") if liga else None
    if padrao is None:
        padrao = padroes.get(esporte)
    if not padrao:
        return None

    canais = list(padrao.get("canais") or [])
    observacao = padrao.get("observacao")
    for regra in padrao.get("regras", []):
        if _regra_vale(regra, inicio_br, sessao):
            canais = (regra.get("canais") or []) + canais if regra.get("na_frente", True) else canais + (regra.get("canais") or [])
            observacao = regra.get("observacao") or observacao
    canais = _sem_repetir(canais)
    if not canais and not observacao:
        return None
    return {
        "canais": canais,
        "confirmado": False,
        "observacao": observacao,
        "conferido_em": padrao.get("conferido_em"),
        "fonte": padrao.get("fonte"),
    }
