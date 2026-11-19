"""Robô dos canais: lê a grade dos canais esportivos no guia de TV meuguia.tv e marca, em
transmissoes.json > jogos, onde passa cada jogo do app (NBA, NFL, NHL, MLB e futebol).

- Só programas "Ao Vivo" (as reprises vêm como "VT - ...").
- Cada programa é cruzado com os jogos do dia da ESPN (a mesma fonte do app), pelos dois times e pela hora.
  Na dúvida (nenhum jogo ou mais de um), o programa é ignorado: melhor sem canal do que canal errado.
- Nunca mexe em item escrito à mão (qualquer item sem fonte "guia de TV"), e apaga os próprios com mais de 3 dias.
- Se o guia estiver fora do ar, não muda nada.
"""

import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path

from robo import rede

ARQUIVO = Path(__file__).resolve().parent.parent / "transmissoes.json"
FONTE = "guia de TV"
BASE = "https://meuguia.tv"
ESPN = "https://site.api.espn.com/apis/site/v2/sports"
BRASILIA = timezone(timedelta(hours=-3))
DIAS_GUARDADOS = 3
TOLERANCIA_MIN = 75  # o guia marca 21:12 para um jogo das 21:00, e às vezes o pré-jogo atrasa o início

# código do canal no guia -> nome mostrado no app (na ordem em que aparecem no app)
CANAIS = {
    "GRD": "Globo",
    "BAN": "Band",
    "REC": "Record",
    "SBT": "SBT",
    "CUL": "TV Cultura",
    "ESP": "ESPN",
    "ES2": "ESPN 2",
    "ES3": "ESPN 3",
    "ES4": "ESPN 4",
    "ES5": "ESPN 5",
    "SPO": "SporTV",
    "SP2": "SporTV 2",
    "SP3": "SporTV 3",
    "121": "Premiere",
    "BSP": "BandSports",
    "135": "Combate",
}

PREFIXOS = {"NBA": "nba", "NFL": "nfl", "NHL": "nhl", "MLB": "mlb"}
CAMINHO_ESPN = {"nba": "basketball/nba", "nfl": "football/nfl", "nhl": "hockey/nhl", "mlb": "baseball/mlb", "futebol": "soccer/all"}
SIGLAS = {"nba", "nfl", "nhl", "mlb"}  # nos americanos o app casa pela sigla; no futebol, pelo nome

_PROGRAMA = re.compile(
    r'<li class="subheader[^"]*">\s*([^<]+?)\s*</li>'
    r"|<div class=.lileft time.>(\d\d:\d\d)</div>\s*<div class=\"licontent\">\s*<h2>([^<]*)</h2>\s*<h3>([^<]*)</h3>"
)


def data_do_dia(cabecalho, hoje):
    """ "terça-feira, 1/12" -> "2026-12-01" (o ano vem de hoje, com a virada de dezembro para janeiro)."""
    m = re.search(r"(\d{1,2})/(\d{1,2})", cabecalho)
    dia, mes = int(m.group(1)), int(m.group(2))
    ano = hoje.year
    if mes < hoje.month - 6:
        ano += 1
    elif mes > hoje.month + 6:
        ano -= 1
    return date(ano, mes, dia).isoformat()


def ler_guia(html, hoje):
    """Os programas da página de um canal: data e hora de Brasília, título e categoria."""
    programas = []
    data = None
    for m in _PROGRAMA.finditer(html or ""):
        if m.group(1):
            data = data_do_dia(m.group(1), hoje) if re.search(r"\d{1,2}/\d{1,2}", m.group(1)) else data
            continue
        if data:
            programas.append({"data": data, "hora": m.group(2), "titulo": unescape(m.group(3)).strip(), "categoria": unescape(m.group(4)).strip()})
    return programas


def jogo_do_programa(p):
    """O jogo que o programa transmite ao vivo ({esporte, times, data, hora}), ou None."""
    titulo = p["titulo"]
    if not titulo.endswith("- Ao Vivo") or titulo.startswith("VT") or re.search(r"(Pr[ée]|P[óo]s)-Jogo", titulo, re.I):
        return None
    base = titulo[: -len("- Ao Vivo")].strip()
    esporte = None
    resto = base
    if ":" in base:
        prefixo, depois = base.split(":", 1)
        if prefixo.strip() in PREFIXOS:
            esporte, resto = PREFIXOS[prefixo.strip()], depois
        elif p["categoria"] == "Esporte/Futebol":
            esporte, resto = "futebol", base.rsplit(":", 1)[1]
    elif p["categoria"] == "Esporte/Futebol":
        esporte = "futebol"
    if not esporte:
        return None
    times = [t.strip() for t in resto.split(" x ")]
    if len(times) != 2 or not all(times):
        return None
    return {"esporte": esporte, "times": times, "data": p["data"], "hora": p["hora"]}


def normalizar(texto):
    sem = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", sem.lower())).strip()


def mesmo_time(nome, candidatos):
    """O nome do guia é o time: igual a um dos nomes da ESPN, ou uma palavra inteira dele (com 5 letras ou mais)."""
    g = normalizar(nome)
    for c in candidatos:
        n = normalizar(c)
        if not n or not g:
            continue
        if g == n:
            return True
        curto, longo = (g, n) if len(g) <= len(n) else (n, g)
        if len(curto) >= 5 and re.search(rf"\b{re.escape(curto)}\b", longo):
            return True
    return False


def eventos_espn(dados):
    """Os jogos de um scoreboard da ESPN: hora de Brasília e os nomes de cada time."""
    saida = []
    for ev in (dados or {}).get("events") or []:
        try:
            quando = datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(BRASILIA)
        except (KeyError, ValueError):
            continue
        times = []
        for c in ((ev.get("competitions") or [{}])[0].get("competitors") or []):
            t = c.get("team") or {}
            times.append({"sigla": t.get("abbreviation"), "nome": t.get("displayName"), "nomes": [t.get(k) for k in ("displayName", "shortDisplayName", "name", "location", "abbreviation") if t.get(k)]})
        if len(times) == 2:
            saida.append({"quando": quando, "times": times})
    return saida


def casar(jogo, eventos):
    """O jogo da ESPN que o programa transmite ({esporte, data, times}), ou None se não houver um só."""
    hora = datetime.fromisoformat(f"{jogo['data']}T{jogo['hora']}:00").replace(tzinfo=BRASILIA)
    achados = []
    for ev in eventos:
        if abs((ev["quando"] - hora).total_seconds()) > TOLERANCIA_MIN * 60:
            continue
        a, b = jogo["times"]
        t1, t2 = ev["times"]
        if (mesmo_time(a, t1["nomes"]) and mesmo_time(b, t2["nomes"])) or (mesmo_time(a, t2["nomes"]) and mesmo_time(b, t1["nomes"])):
            achados.append(ev)
    if len(achados) != 1:
        return None
    ev = achados[0]
    chave = "sigla" if jogo["esporte"] in SIGLAS else "nome"
    return {"esporte": jogo["esporte"], "data": ev["quando"].date().isoformat(), "times": [t[chave] for t in ev["times"]]}


def canais_do_jogo(esporte, canais):
    """Os canais do guia, mais o Disney+ Premium (que transmite o que passa na ESPN) e o League Pass na NBA."""
    lista = list(dict.fromkeys(canais))
    if any(c.startswith("ESPN") for c in lista):
        lista.append("Disney+ Premium")
    if esporte == "nba":
        lista.append("NBA League Pass")
    return lista


def permitido(robots, caminho):
    """O robots.txt deixa ler o caminho? Sem robots.txt de verdade (o guia redireciona para uma página HTML), deixa."""
    if not robots or "<html" in robots.lower():
        return True
    vale = False
    for linha in robots.splitlines():
        linha = linha.split("#", 1)[0].strip()
        if ":" not in linha:
            continue
        campo, valor = (x.strip() for x in linha.split(":", 1))
        campo = campo.lower()
        if campo == "user-agent":
            vale = valor == "*" or valor.lower().startswith("scoresports")
        elif campo == "disallow" and vale and valor:
            padrao = "^" + re.escape(valor).replace(r"\*", ".*").replace(r"\$", "$")
            if re.match(padrao, caminho):
                return False
    return True


def _mesmo_jogo(item, esporte, data_jogo, times):
    if item.get("esporte") != esporte or item.get("data") != data_jogo:
        return False
    chaves = item.get("times") or []
    return len(chaves) == 2 and all(any(mesmo_time(k, [t]) for t in times) for k in chaves)


def atualizar(arquivo, hoje, pegar_texto=None, pegar_json=None, canais=None, dias=7):
    """Marca os canais dos próximos `dias` dias em arquivo["jogos"]; devolve a lista do que mudou."""
    pegar_texto = pegar_texto or rede.pegar_texto
    pegar_json = pegar_json or rede.pegar_json
    canais = canais or CANAIS
    robots = pegar_texto(f"{BASE}/robots.txt")
    limite = (hoje + timedelta(days=dias)).isoformat()

    programas = []  # (jogo do programa, nome do canal)
    lidas = 0
    for codigo, nome in canais.items():
        caminho = f"/programacao/canal/{codigo}"
        if not permitido(robots, caminho):
            rede.aviso(f"o robots.txt do guia não deixa ler {caminho}")
            continue
        html = pegar_texto(f"{BASE}{caminho}")
        if html is None:
            continue
        lidas += 1
        for p in ler_guia(html, hoje):
            if hoje.isoformat() <= p["data"] < limite:
                jogo = jogo_do_programa(p)
                if jogo:
                    programas.append((jogo, nome))
    if not lidas:
        return []  # guia fora do ar: fica tudo como estava

    cache = {}

    def eventos(esporte, data_txt):
        if (esporte, data_txt) not in cache:
            extra = "&limit=1000" if esporte == "futebol" else ""
            url = f"{ESPN}/{CAMINHO_ESPN[esporte]}/scoreboard?dates={data_txt.replace('-', '')}&lang=pt&region=br{extra}"
            cache[(esporte, data_txt)] = eventos_espn(pegar_json(url))
        return cache[(esporte, data_txt)]

    achados = {}  # (esporte, data, times em ordem) -> canais
    for jogo, canal in programas:
        jogo_espn = casar(jogo, eventos(jogo["esporte"], jogo["data"]))
        if not jogo_espn:
            continue
        chave = (jogo_espn["esporte"], jogo_espn["data"], tuple(jogo_espn["times"]))
        achados.setdefault(chave, []).append(canal)

    mudancas = []
    jogos = arquivo.setdefault("jogos", [])
    corte = (hoje - timedelta(days=DIAS_GUARDADOS)).isoformat()
    for item in list(jogos):
        if item.get("fonte") == FONTE and item.get("data", "") < corte:
            jogos.remove(item)
            mudancas.append(f"canais: saiu {item['esporte']} {item['data']} {' x '.join(item['times'])} (antigo)")

    ordem = list(canais.values())
    for (esporte, data_jogo, times), lista in achados.items():
        lista = canais_do_jogo(esporte, sorted(set(lista), key=lambda c: ordem.index(c) if c in ordem else 99))
        if any(item.get("fonte") != FONTE and _mesmo_jogo(item, esporte, data_jogo, times) for item in jogos):
            continue  # já tem item escrito à mão: ele manda
        meu = next((item for item in jogos if item.get("fonte") == FONTE and _mesmo_jogo(item, esporte, data_jogo, times)), None)
        if meu is None:
            jogos.append({"esporte": esporte, "data": data_jogo, "times": list(times), "canais": lista, "conferido_em": hoje.isoformat(), "fonte": FONTE})
            mudancas.append(f"canais: {esporte} {data_jogo} {' x '.join(times)} -> {', '.join(lista)}")
        elif meu["canais"] != lista:
            meu["canais"] = lista
            meu["conferido_em"] = hoje.isoformat()
            mudancas.append(f"canais: {esporte} {data_jogo} {' x '.join(times)} agora em {', '.join(lista)}")
    return mudancas
