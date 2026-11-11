"""Índice local da busca.

Todo atleta, lutador, piloto e time que passa pelo app (elencos, escalações, líderes,
rankings, cards do UFC, classificações, agenda de boxe) é anotado aqui. A busca procura
neste índice, além de perguntar à ESPN, então ela acha qualquer um que o app já tenha visto.

Uma vez por semana o servidor também "semeia" o índice em segundo plano: times de todas as
competições, elencos da NFL, do Brasileirão e da Premier League, ranking do UFC e pilotos da F1.
"""

import logging
import sqlite3
import threading
import time
import unicodedata

import cache

logger = logging.getLogger("uvicorn.error")
_preparado = False
_trava = threading.Lock()


def normalizar(texto):
    base = unicodedata.normalize("NFKD", str(texto or ""))
    return " ".join("".join(c for c in base if not unicodedata.combining(c)).lower().split())


def _conectar():
    global _preparado
    con = sqlite3.connect(cache.ARQUIVO, timeout=15)
    if not _preparado:
        with _trava:
            if not _preparado:
                con.execute(
                    "CREATE TABLE IF NOT EXISTS indice ("
                    "chave TEXT PRIMARY KEY, tipo TEXT, esporte TEXT, liga TEXT, id TEXT, "
                    "nome TEXT, busca TEXT, descricao TEXT, imagem TEXT, visto_em REAL)"
                )
                con.execute("CREATE INDEX IF NOT EXISTS indice_busca ON indice (busca)")
                con.commit()
                _preparado = True
    return con


def registrar(itens):
    """Anota (ou atualiza) atletas e times. Cada item: tipo, esporte, liga, id, nome, descricao?, imagem?"""
    linhas = []
    agora = time.time()
    for i in itens or []:
        if not i or not i.get("id") or not i.get("nome"):
            continue
        tipo = "time" if i.get("tipo") == "time" else "jogador"
        linhas.append(
            (
                f"{tipo}:{i['esporte']}:{i['id']}",
                tipo,
                i["esporte"],
                i.get("liga"),
                str(i["id"]),
                i["nome"],
                normalizar(i["nome"]),
                i.get("descricao"),
                i.get("imagem"),
                agora,
            )
        )
    if not linhas:
        return
    try:
        con = _conectar()
        try:
            # a descrição e a imagem antigas ficam se a nova vier vazia
            con.executemany(
                "INSERT INTO indice (chave, tipo, esporte, liga, id, nome, busca, descricao, imagem, visto_em) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(chave) DO UPDATE SET nome = excluded.nome, busca = excluded.busca, "
                "liga = COALESCE(excluded.liga, indice.liga), "
                "descricao = COALESCE(excluded.descricao, indice.descricao), "
                "imagem = COALESCE(excluded.imagem, indice.imagem), visto_em = excluded.visto_em",
                linhas,
            )
            con.commit()
        finally:
            con.close()
    except sqlite3.Error:
        logger.exception("Falha ao gravar no índice da busca")


def procurar(texto, limite=40):
    palavras = normalizar(texto).split()
    if not palavras or len("".join(palavras)) < 2:
        return []
    filtro = " AND ".join("busca LIKE ?" for _ in palavras)
    valores = [f"%{p}%" for p in palavras]
    try:
        con = _conectar()
        try:
            linhas = con.execute(
                f"SELECT tipo, esporte, liga, id, nome, descricao, imagem FROM indice WHERE {filtro} "
                "ORDER BY (busca LIKE ?) DESC, (busca LIKE ?) DESC, LENGTH(nome) LIMIT ?",
                [*valores, f"{palavras[0]}%", f"% {palavras[0]}%", limite],
            ).fetchall()
        finally:
            con.close()
    except sqlite3.Error:
        return []
    return [
        {"tipo": t, "esporte": e, "liga": l, "id": i, "nome": n, "descricao": d, "imagem": img}
        for t, e, l, i, n, d, img in linhas
    ]


def contar():
    try:
        con = _conectar()
        try:
            return con.execute("SELECT COUNT(*) FROM indice").fetchone()[0]
        finally:
            con.close()
    except sqlite3.Error:
        return 0


# ---------- Semente semanal ----------

_semeando = threading.Event()


def semear_se_preciso(semear):
    """Roda `semear()` em segundo plano se a última semente tiver mais de 7 dias."""
    if _semeando.is_set():
        return
    try:
        cache.obter("indice_semente_v1", 7 * 86400, lambda: _disparar(semear))
    except Exception:
        logger.exception("Falha ao semear o índice da busca")


def _disparar(semear):
    _semeando.set()

    def rodar():
        try:
            semear()
        except Exception:
            logger.exception("Falha ao semear o índice da busca")
        finally:
            _semeando.clear()

    threading.Thread(target=rodar, name="semente-indice", daemon=True).start()
    return {"iniciada_em": time.time()}


def semeando():
    return _semeando.is_set()
