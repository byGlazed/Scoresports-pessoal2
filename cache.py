"""Banco de dados local (SQLite) com tudo o que veio das APIs.

cache.obter(chave, ttl, buscar, estavel=None, ttl_estavel=...):
  - se o dado salvo ainda vale, devolve na hora, sem chamar API nenhuma;
  - senão chama `buscar()`, guarda e devolve;
  - `estavel(valor)` diz se o dado não vai mais mudar (jogo encerrado, dia que já passou).
    Nesse caso ele fica guardado por `ttl_estavel` (30 dias), em vez de `ttl`;
  - se `buscar()` falhar e houver um dado antigo, devolve o antigo (a página continua funcionando);
  - se falhar e não houver nada salvo, repassa o erro.

Dados vencidos há mais de 60 dias são apagados quando o servidor liga.
"""

import json
import sqlite3
import threading
import time
from pathlib import Path

ARQUIVO = Path(__file__).parent / "cache.db"
TRINTA_DIAS = 30 * 86400
LIMPAR_APOS = 60 * 86400

_preparado = False
_trava = threading.Lock()


def _conectar():
    global _preparado
    con = sqlite3.connect(ARQUIVO, timeout=15)
    if not _preparado:
        with _trava:
            if not _preparado:
                # WAL deixa várias leituras e uma escrita acontecerem ao mesmo tempo
                con.execute("PRAGMA journal_mode=WAL")
                con.execute(
                    "CREATE TABLE IF NOT EXISTS dados ("
                    "chave TEXT PRIMARY KEY, valor TEXT NOT NULL, "
                    "salvo_em REAL NOT NULL, vale_ate REAL NOT NULL)"
                )
                con.execute("CREATE INDEX IF NOT EXISTS dados_vale_ate ON dados (vale_ate)")
                con.execute("DELETE FROM dados WHERE vale_ate < ?", (time.time() - LIMPAR_APOS,))
                con.execute("DROP TABLE IF EXISTS cache")  # tabela da versão anterior
                con.commit()
                _preparado = True
    return con


def _ler(chave):
    """Devolve (valor, vale_ate) ou None. Qualquer problema no banco vira 'sem dado'."""
    try:
        con = _conectar()
        try:
            linha = con.execute("SELECT valor, vale_ate FROM dados WHERE chave = ?", (chave,)).fetchone()
        finally:
            con.close()
        if linha is None:
            return None
        return json.loads(linha[0]), linha[1]
    except (sqlite3.Error, ValueError):
        return None


def _gravar(chave, valor, validade):
    agora = time.time()
    try:
        con = _conectar()
        try:
            con.execute(
                "INSERT OR REPLACE INTO dados (chave, valor, salvo_em, vale_ate) VALUES (?, ?, ?, ?)",
                (chave, json.dumps(valor, ensure_ascii=False), agora, agora + validade),
            )
            con.commit()
        finally:
            con.close()
    except (sqlite3.Error, TypeError, ValueError):
        # o banco é um acelerador: se não der para salvar, o app segue sem ele
        pass


def obter(chave, ttl, buscar, estavel=None, ttl_estavel=TRINTA_DIAS):
    salvo = _ler(chave)
    if salvo is not None and time.time() < salvo[1]:
        return salvo[0]
    try:
        valor = buscar()
    except Exception:
        if salvo is not None:
            return salvo[0]
        raise
    validade = ttl
    if estavel is not None:
        try:
            if estavel(valor):
                validade = max(ttl, ttl_estavel)
        except Exception:
            pass
    _gravar(chave, valor, validade)
    return valor


def estatisticas():
    """Quantos dados estão guardados e quanto o arquivo ocupa (para a rota /banco)."""
    try:
        con = _conectar()
        try:
            total, validos = con.execute(
                "SELECT COUNT(*), SUM(CASE WHEN vale_ate > ? THEN 1 ELSE 0 END) FROM dados", (time.time(),)
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        total, validos = 0, 0
    tamanho = ARQUIVO.stat().st_size if ARQUIVO.exists() else 0
    return {"registros": total or 0, "validos": validos or 0, "tamanho_mb": round(tamanho / 1_048_576, 2)}


def limpar():
    """Apaga tudo. Também dá para simplesmente apagar o arquivo cache.db com o servidor desligado."""
    try:
        con = _conectar()
        try:
            con.execute("DELETE FROM dados")
            con.commit()
        finally:
            con.close()
    except sqlite3.Error:
        pass