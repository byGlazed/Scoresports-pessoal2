import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import boxe
import cache
import espn_dados
import nba_dados

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Scoresports pessoal")

PASTA_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=PASTA_STATIC), name="static")

# Tempo de validade do cache (em segundos) dos dados que mudam durante o jogo.
# Fica um pouco abaixo do intervalo de atualização da página (20 s).
TTL_AO_VIVO = 15


@app.get("/", include_in_schema=False)
def raiz():
    return FileResponse(PASTA_STATIC / "index.html")


def _obter(chave, ttl, buscar, fonte="NBA"):
    try:
        return cache.obter(chave, ttl, buscar)
    except Exception:
        logger.exception("Falha ao obter '%s'", chave)
        raise HTTPException(status_code=502, detail=f"Não foi possível obter dados da {fonte} agora.")


def _opcional(chave, ttl, buscar):
    """Como _obter, mas devolve None em caso de erro (usado onde uma falha não pode derrubar a tela)."""
    try:
        return cache.obter(chave, ttl, buscar)
    except Exception:
        logger.exception("Falha ao obter '%s'", chave)
        return None


def _hoje():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d")


def _validar_data(texto):
    try:
        return date.fromisoformat(texto).isoformat()
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Data inválida. Use o formato AAAA-MM-DD.")


# ---------- Esportes disponíveis ----------

@app.get("/esportes")
def esportes():
    return [
        {"id": "nba", "nome": "NBA", "tipo": "nba", "ligas": [{"id": "nba", "nome": "NBA"}]},
        *espn_dados.lista_esportes(),
        {"id": "boxe", "nome": "Boxe", "tipo": "boxe", "ligas": [{"id": "boxe", "nome": "Boxe"}]},
    ]


# ---------- NBA ----------

def _calendario():
    return _obter("calendario_v4", 600, nba_dados.buscar_calendario)


def _ao_vivo():
    try:
        return {j["id"]: j for j in cache.obter("jogos_v2", TTL_AO_VIVO, nba_dados.buscar_jogos)}
    except Exception:
        return {}


@app.get("/datas")
def datas():
    agenda = _calendario()
    return {"datas": sorted({j["data"] for j in agenda}), "hoje": _hoje()}


@app.get("/jogos")
def jogos(data: str | None = None):
    agenda = _calendario()
    data = data or _hoje()
    ao_vivo = _ao_vivo()
    do_dia = [j for j in agenda if j["data"] == data]
    resultado = []
    for j in do_dia:
        # se o jogo está no placar ao vivo, usa essa versão (mais atual e com líderes)
        jogo = {**j, **ao_vivo.get(j["id"], {})}
        jogo["transmissao"] = nba_dados.buscar_transmissao(j["data"], j["fora"], j["casa"], j.get("inicio"))
        resultado.append(jogo)
    return resultado


@app.get("/jogos/{game_id}/boxscore")
def boxscore(game_id: str):
    return _obter(f"boxscore_v5:{game_id}", TTL_AO_VIVO, lambda: nba_dados.buscar_boxscore(game_id))


@app.get("/jogos/{game_id}/arremessos/{player_id}")
def arremessos(game_id: str, player_id: int):
    # um único play-by-play por jogo serve para todos os jogadores
    todos = _obter(f"arremessos_v1:{game_id}", TTL_AO_VIVO, lambda: nba_dados.buscar_arremessos(game_id))
    return {
        "jogo": game_id,
        "jogador": player_id,
        "arremessos": [a for a in todos if a["jogador"] == player_id],
    }


@app.get("/jogos/{game_id}/pre-jogo")
def pre_jogo(game_id: str):
    agenda = _calendario()
    jogo = next((j for j in agenda if j["id"] == game_id), None)
    if jogo is None:
        raise HTTPException(status_code=404, detail="Jogo não encontrado no calendário.")
    return nba_dados.montar_pre_jogo(jogo, agenda, _opcional)


# a busca vem antes de /jogadores/{player_id} para "busca" não ser lida como um id
@app.get("/jogadores/busca")
def jogadores_busca(q: str = Query("", min_length=0, max_length=60)):
    lista = _obter("lista_jogadores_v1", 86400, nba_dados.buscar_jogadores_lista)
    return nba_dados.procurar_jogadores(lista, q)


@app.get("/jogadores/{player_id}")
def jogador(player_id: int):
    return _obter(f"jogador_v2:{player_id}", 600, lambda: nba_dados.buscar_jogador(player_id))


@app.get("/jogadores/{player_id}/carreira")
def jogador_carreira(player_id: int):
    """Perfil, prêmios, números de cada temporada e recordes da carreira."""
    carreira = _obter(f"carreira_v1:{player_id}", 21600, lambda: nba_dados.buscar_carreira(player_id))
    perfil = _opcional(f"perfil_v1:{player_id}", 86400, lambda: nba_dados.buscar_perfil(player_id))
    premios = _opcional(f"premios_v1:{player_id}", 86400, lambda: nba_dados.buscar_premios(player_id))
    recordes = _opcional(f"recordes_carreira_v1:{player_id}", 21600, lambda: nba_dados.buscar_recordes_carreira(player_id))
    return {
        "id": player_id,
        "perfil": perfil,
        "premios": premios,
        "carreira": carreira,
        "recordes": recordes,
        "falhas": [nome for nome, valor in (("perfil", perfil), ("premios", premios), ("recordes", recordes)) if valor is None],
    }


@app.get("/lideres")
def lideres(modo: Literal["media", "total"] = "media"):
    # uma única consulta (totais de todos os jogadores) serve para as duas visões
    jogadores = _obter("stats_jogadores_v1", 1800, nba_dados.buscar_stats_jogadores)
    return nba_dados.montar_lideres(jogadores, modo)


@app.get("/corridas")
def corridas():
    # os rankings da NBA saem uma vez por semana, então 2 horas de cache bastam
    return _obter("corridas_v1", 7200, nba_dados.buscar_corridas)


@app.get("/classificacao")
def classificacao():
    return _obter("classificacao_v3", 3600, nba_dados.buscar_classificacao)


# ---------- NFL, futebol, F1 e UFC (dados da ESPN) ----------

def _config(esporte, liga):
    try:
        return espn_dados.config(esporte, liga)
    except KeyError:
        raise HTTPException(status_code=404, detail="Esporte ou liga desconhecidos.")


def _ttl_por_data(de, ate):
    """Dias perto de hoje mudam a cada minuto; dias passados quase nunca."""
    hoje = date.fromisoformat(_hoje())
    d0, d1 = date.fromisoformat(de), date.fromisoformat(ate)
    if d0 <= hoje + timedelta(days=1) and d1 >= hoje - timedelta(days=1):
        return TTL_AO_VIVO
    return 600 if d0 > hoje else 3600


@app.get("/e/{esporte}/{liga}/jogos")
def espn_jogos(esporte: str, liga: str, de: str | None = None, ate: str | None = None):
    _config(esporte, liga)
    de = _validar_data(de or _hoje())
    ate = _validar_data(ate or de)
    if ate < de:
        de, ate = ate, de
    if (date.fromisoformat(ate) - date.fromisoformat(de)).days > 14:
        raise HTTPException(status_code=400, detail="Escolha um período de até 15 dias.")
    return _obter(
        f"espn_jogos_v1:{esporte}:{liga}:{de}:{ate}",
        _ttl_por_data(de, ate),
        lambda: espn_dados.buscar_partidas(esporte, liga, de, ate),
        "ESPN",
    )


@app.get("/e/{esporte}/{liga}/datas")
def espn_datas(esporte: str, liga: str):
    _config(esporte, liga)
    resultado = _opcional(f"espn_datas_v1:{esporte}:{liga}", 21600, lambda: espn_dados.buscar_datas(esporte, liga))
    return {**(resultado or {"tipo": "dias", "datas": [], "semanas": [], "atual": None}), "hoje": _hoje()}


@app.get("/e/{esporte}/{liga}/jogos/{evento_id}")
def espn_resumo(esporte: str, liga: str, evento_id: str):
    _config(esporte, liga)
    return _obter(
        f"espn_resumo_v1:{esporte}:{liga}:{evento_id}",
        TTL_AO_VIVO,
        lambda: espn_dados.buscar_resumo(esporte, liga, evento_id),
        "ESPN",
    )


@app.get("/e/{esporte}/{liga}/classificacao")
def espn_classificacao(esporte: str, liga: str):
    _config(esporte, liga)
    return _obter(
        f"espn_classificacao_v1:{esporte}:{liga}", 1800, lambda: espn_dados.buscar_classificacao(esporte, liga), "ESPN"
    )


@app.get("/e/{esporte}/{liga}/times/{time_id}/elenco")
def espn_elenco(esporte: str, liga: str, time_id: str):
    _config(esporte, liga)
    return _obter(
        f"espn_elenco_v1:{esporte}:{liga}:{time_id}", 43200, lambda: espn_dados.buscar_elenco(esporte, liga, time_id), "ESPN"
    )


@app.get("/e/{esporte}/{liga}/atletas/{atleta_id}")
def espn_atleta(esporte: str, liga: str, atleta_id: str):
    _config(esporte, liga)
    return _obter(
        f"espn_atleta_v1:{esporte}:{liga}:{atleta_id}", 21600, lambda: espn_dados.buscar_atleta(esporte, liga, atleta_id), "ESPN"
    )


@app.get("/e/{esporte}/{liga}/eventos")
def espn_eventos(esporte: str, liga: str, ano: int | None = None):
    _config(esporte, liga)
    return _obter(
        f"espn_eventos_v1:{esporte}:{liga}:{ano or 'atual'}", 3600, lambda: espn_dados.buscar_eventos(esporte, liga, ano), "ESPN"
    )


@app.get("/e/{esporte}/{liga}/eventos/{evento_id}")
def espn_evento(esporte: str, liga: str, evento_id: str, data: str | None = None):
    _config(esporte, liga)
    if data:
        data = _validar_data(data)
    try:
        return cache.obter(
            f"espn_evento_v1:{esporte}:{liga}:{evento_id}",
            30,
            lambda: espn_dados.buscar_evento(esporte, liga, evento_id, data),
        )
    except LookupError as erro:
        raise HTTPException(status_code=404, detail=str(erro))
    except Exception:
        logger.exception("Falha ao obter evento %s", evento_id)
        raise HTTPException(status_code=502, detail="Não foi possível obter dados da ESPN agora.")


# ---------- Boxe (arquivo boxe_eventos.json) ----------

@app.get("/boxe/eventos")
def boxe_eventos():
    try:
        return boxe.buscar_eventos()
    except RuntimeError as erro:
        raise HTTPException(status_code=500, detail=str(erro))
