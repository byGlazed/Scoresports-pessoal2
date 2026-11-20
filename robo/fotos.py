"""Robô das fotos: monta fotos.json com a foto (recortada) do TheSportsDB de cada jogador dos times
brasileiros (Série A e Série B), para o campinho e o elenco mostrarem a foto na hora, sem esperar a
fila de buscas do celular (o plano gratuito do TheSportsDB aceita cerca de 30 buscas por minuto).

- Os jogadores vêm dos elencos da ESPN, com o nome do time como o resumo do jogo traz
  ("Athletico Paranaense", e não "Athletico-PR" da lista de times).
- A escolha é a mesma do app (static/fotos_regras.js): o time tem de bater; sem o time, só nome
  completo e único. Na dúvida, null ("não tem"), e o app mostra o número.
- Quem tem foto na ESPN fica de fora (o app usa a da ESPN).
- Por rodada, no máximo MAXIMO buscas, uma a cada 2,1 s; as que nunca foram feitas vão primeiro.
  As fotos são conferidas de novo depois de 60 dias, e o "não tem", depois de 20.
"""

import re
import time
import unicodedata
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

from robo import rede

ARQUIVO = Path(__file__).resolve().parent.parent / "fotos.json"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
API = "https://www.thesportsdb.com/api/v1/json/123"
LIGAS = ("bra.1", "bra.2")
MAXIMO = 240  # buscas por rodada (~8,5 min)
INTERVALO = 2.1  # segundos entre buscas no TheSportsDB
REVER_FOTO = 60  # dias
REVER_SEM_FOTO = 20  # dias
TEMPO_MAXIMO = 20 * 60  # segundos por rodada: o Actions corta o job inteiro em 6 h, e aí nada é publicado
SEM_RESPOSTA_SEGUIDAS = 5  # o TheSportsDB parou de responder (429 em sequência): fica para a próxima


def normalizar(texto):
    """Igual a Fotos.normalizar do app: sem acento, minúsculas, só letras e números separados por espaço."""
    sem = "".join(c for c in unicodedata.normalize("NFKD", str(texto or "")) if not ("̀" <= c <= "ͯ"))
    return re.sub(r"[^a-z0-9]+", " ", sem.lower()).strip()


def chave(nome, time_):
    return f"{normalizar(nome)}|{normalizar(time_)}"


# a ESPN usa a sigla do estado; o TheSportsDB, o nome do clube (igual no app, static/fotos_regras.js)
APELIDOS = {
    "atletico mg": "atletico mineiro",
    "america mg": "america mineiro",
    "atletico go": "atletico goianiense",
    "athletico pr": "athletico paranaense",
    "operario pr": "operario ferroviario",
    "remo": "clube do remo",
}


def mesmo_time(a, b):
    """Igual a Fotos.mesmoTime: iguais, ou um é uma palavra inteira do outro (5 letras ou mais)."""
    x, y = normalizar(a), normalizar(b)
    x, y = APELIDOS.get(x, x), APELIDOS.get(y, y)
    if not x or not y:
        return False
    if x == y:
        return True
    curto, longo = (x, y) if len(x) <= len(y) else (y, x)
    return len(curto) >= 5 and re.search(rf"\b{re.escape(curto)}\b", longo) is not None


def url_pequena(url):
    if not url:
        return None
    if "thesportsdb.com/" in url and not re.search(r"/(small|tiny|medium|preview)$", url):
        return f"{url}/small"
    return url


def escolher(resultados, nome, time_):
    """Igual a Fotos.escolher: a foto do jogador entre os resultados da busca, ou None."""
    alvo = normalizar(nome)
    com_foto = [p for p in (resultados or []) if p and p.get("strSport") == "Soccer" and (p.get("strCutout") or p.get("strThumb"))]
    candidatos = [p for p in com_foto if normalizar(p.get("strPlayer")) == alvo]
    do_time = [p for p in candidatos if mesmo_time(p.get("strTeam"), time_)]
    escolhido = None
    if len(do_time) == 1:
        escolhido = do_time[0]
    elif not do_time and len(candidatos) == 1 and len(alvo.split(" ")) >= 2:
        c = candidatos[0]
        if not c.get("strTeam") or (c.get("strNationality") and normalizar(c["strTeam"]) == normalizar(c["strNationality"])):
            escolhido = c
    elif not do_time and alvo:
        # nome curto da ESPN ("Warleson") e completo no TheSportsDB ("Warleson Oliveira"): vale com o time
        # certo, todas as palavras do curto no completo, e só um jogador do time servindo
        palavras = alvo.split(" ")
        contidos = [p for p in com_foto if mesmo_time(p.get("strTeam"), time_) and all(w in normalizar(p.get("strPlayer")).split(" ") for w in palavras)]
        if len(contidos) == 1:
            escolhido = contidos[0]
    return url_pequena(escolhido.get("strCutout") or escolhido.get("strThumb")) if escolhido else None


def jogadores(pegar_json, ligas=LIGAS):
    """(nome do jogador, nome do time) de quem não tem foto na ESPN, nos elencos das ligas."""
    saida = []
    for liga in ligas:
        lista = pegar_json(f"{ESPN}/{liga}/teams?lang=pt&region=br") or {}
        times = [((t.get("team") or {}).get("id")) for t in (((lista.get("sports") or [{}])[0].get("leagues") or [{}])[0].get("teams") or [])]
        for tid in filter(None, times):
            elenco = pegar_json(f"{ESPN}/{liga}/teams/{tid}/roster?lang=pt&region=br") or {}
            nome_time = (elenco.get("team") or {}).get("displayName")
            if not nome_time:
                continue
            for a in elenco.get("athletes") or []:
                if a.get("displayName") and not (a.get("headshot") or {}).get("href"):
                    saida.append((a["displayName"], nome_time))
    return list(dict.fromkeys(saida))


def a_buscar(pares, arquivo, hoje):
    """As chaves que precisam de busca: as nunca buscadas primeiro, depois as mais antigas vencidas."""
    fotos = arquivo.get("fotos", {})
    conferidas = arquivo.get("conferidas", {})
    novas, vencidas = [], []
    for nome, time_ in pares:
        k = chave(nome, time_)
        if k not in conferidas:
            novas.append((nome, time_))
            continue
        prazo = REVER_FOTO if fotos.get(k) else REVER_SEM_FOTO
        if date.fromisoformat(conferidas[k]) + timedelta(days=prazo) <= hoje:
            vencidas.append((conferidas[k], nome, time_))
    vencidas.sort()
    return novas + [(n, t) for _, n, t in vencidas]


def atualizar(arquivo, hoje, pegar_json=None, esperar=None, maximo=MAXIMO, ligas=LIGAS, tempo_maximo=TEMPO_MAXIMO, relogio=None):
    """Busca as fotos que faltam (até `maximo`) e grava em arquivo["fotos"]; devolve a lista do que mudou."""
    pegar_json = pegar_json or rede.pegar_json
    esperar = esperar if esperar is not None else time.sleep
    relogio = relogio or time.monotonic
    inicio = relogio()
    arquivo.setdefault("fotos", {})
    arquivo.setdefault("conferidas", {})
    pares = jogadores(pegar_json, ligas)
    if not pares:
        return []  # ESPN fora do ar: fica tudo como estava
    achadas = 0
    feitas = 0
    sem_resposta = 0
    for nome, time_ in a_buscar(pares, arquivo, hoje)[:maximo]:
        if relogio() - inicio > tempo_maximo or sem_resposta >= SEM_RESPOSTA_SEGUIDAS:
            break
        if feitas:
            esperar(INTERVALO)
        feitas += 1
        r = pegar_json(f"{API}/searchplayers.php?p={quote(nome.strip())}")
        if r is None:
            sem_resposta += 1
            continue  # o TheSportsDB não respondeu: fica para a próxima rodada
        sem_resposta = 0
        k = chave(nome, time_)
        url = escolher(r.get("player"), nome, time_)
        arquivo["fotos"][k] = url
        arquivo["conferidas"][k] = hoje.isoformat()
        achadas += 1 if url else 0
    if not feitas:
        return []
    return [f"fotos: {feitas} jogador(es) procurado(s), {achadas} com foto; {len(arquivo['fotos'])} no índice"]
