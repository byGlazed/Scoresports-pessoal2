"""Cache em SQLite com tempo de validade.

cache.obter(chave, ttl, buscar):
  - se há um dado salvo com menos de `ttl` segundos, devolve ele na hora;
  - senão chama `buscar()`, salva o resultado e devolve;
  - se `buscar()` falhar e existir um dado antigo, devolve o antigo (a página continua funcionando);
  - se falhar e não existir nada salvo, repassa o erro.
"""

import json
import sqlite3
import time
from pathlib import Path

ARQUIVO = Path(__file__).parent / "cache.db"


def _conectar():
    # uma conexão por chamada: o FastAPI atende pedidos em várias threads
    con = sqlite3.connect(ARQUIVO, timeout=10)
    con.execute(
        "CREATE TABLE IF NOT EXISTS cache ("
        "chave TEXT PRIMARY KEY, valor TEXT NOT NULL, criado REAL NOT NULL)"
    )
    return con


def _ler(chave):
    """Devolve (valor, criado_em) ou None. Qualquer problema no banco vira 'sem cache'."""
    try:
        con = _conectar()
        try:
            linha = con.execute("SELECT valor, criado FROM cache WHERE chave = ?", (chave,)).fetchone()
        finally:
            con.close()
        if linha is None:
            return None
        return json.loads(linha[0]), linha[1]
    except (sqlite3.Error, ValueError):
        return None


def _gravar(chave, valor):
    try:
        con = _conectar()
        try:
            con.execute(
                "INSERT OR REPLACE INTO cache (chave, valor, criado) VALUES (?, ?, ?)",
                (chave, json.dumps(valor, ensure_ascii=False), time.time()),
            )
            con.commit()
        finally:
            con.close()
    except (sqlite3.Error, TypeError, ValueError):
        # cache é só um acelerador: se não der para salvar, o app segue sem ele
        pass


def obter(chave, ttl, buscar):
    salvo = _ler(chave)
    if salvo is not None and time.time() - salvo[1] < ttl:
        return salvo[0]
    try:
        valor = buscar()
    except Exception:
        if salvo is not None:
            return salvo[0]
        raise
    _gravar(chave, valor)
    return valor


def limpar():
    """Apaga tudo (útil para testar). Também dá para simplesmente apagar o arquivo cache.db."""
    try:
        con = _conectar()
        try:
            con.execute("DELETE FROM cache")
            con.commit()
        finally:
            con.close()
    except sqlite3.Error:
        pass
