"""Robô dos canais: lê a grade dos canais esportivos no guia de TV meuguia.tv e a lista do dia do
futebolnatv.com.br (que traz também os streamings: ge tv, CazéTV, Prime Video, HBO Max, Disney+, Premiere 2…)
e marca, em transmissoes.json > jogos, onde passa cada jogo do app (NBA, NFL, NHL, MLB e futebol).

- Só programas "Ao Vivo" (as reprises vêm como "VT - ...").
- Do futebolnatv lê só a hora, os dois times e os canais de hoje e de amanhã (o robots.txt deixa;
  o dono aprovou o uso em 19/11/2026). Os canais das duas fontes se juntam no mesmo item.
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

FUTEBOLNATV = "https://www.futebolnatv.com.br"
PAGINAS_FUTEBOLNATV = ("/jogos-hoje", "/jogos-amanha")
# as páginas das ligas trazem a rodada inteira com os canais (a lista do dia só tem hoje e amanhã);
# as ligas que aparecem na lista do dia entram também (a Série A italiana, quando tem jogo, por exemplo)
LIGAS_FUTEBOLNATV = (
    "/liga/brasileirao-serie-a-ne9wa6elab", "/liga/brasileirao-serie-b-yphg5kufc2", "/liga/copa-do-brasil-ek15w9aq8d",
    "/liga/copa-libertadores-1npfagfslh", "/liga/champions-league-9gagii11da", "/liga/uefa-europa-league-9q40bjxdyw",
    "/liga/campeonato-ingles-diegw7eeiu", "/liga/campeonato-espanhol-u62s3h464c", "/liga/campeonato-alemao-x5kmzzp7ug",
    "/liga/campeonato-frances-5na39ifvp5", "/liga/mls-mb2vqejb8s",
)
# a lista do mês da NBA no Brasil (League Pass, ESPN 2/Disney+ e Prime Video), uma página por mês
GAMEOVERDRIVE = "https://gameoverdrive.com.br"
MESES = ("janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro")

# a ordem dos canais no app: TV aberta, TV fechada, depois os streamings
ORDEM_CANAIS = [
    "Globo", "Band", "Record", "SBT", "TV Cultura", "Xsports",
    "SporTV", "SporTV 2", "SporTV 3", "ESPN", "ESPN 2", "ESPN 3", "ESPN 4", "ESPN 5", "TNT", "Space",
    "Premiere", *[f"Premiere {n}" for n in range(2, 9)], "BandSports", "Combate",
    "ge tv", "Globoplay", "CazéTV", "Prime Video", "HBO Max", "Disney+ Premium", "Paramount+", "SportyNet", "GOAT",
    "Apple TV", "DAZN", "OneFootball", "RTP Internacional", "YouTube", "NBA League Pass",
]

# nome no futebolnatv (já normalizado: minúsculas, sem acento nem símbolo) -> nome no app
NOMES_CANAIS = {
    "globo": "Globo", "tv globo": "Globo", "band": "Band", "record": "Record", "sbt": "SBT", "tv cultura": "TV Cultura",
    "xsports": "Xsports", "x sports": "Xsports", "sportv": "SporTV", "premiere": "Premiere", "premiere fc": "Premiere",
    "premiere clubes": "Premiere", "bandsports": "BandSports", "band sports": "BandSports", "combate": "Combate",
    "ge tv": "ge tv", "getv": "ge tv", "globoplay": "Globoplay", "cazetv": "CazéTV", "caze tv": "CazéTV",
    "prime video": "Prime Video", "amazon prime video": "Prime Video", "amazon prime": "Prime Video",
    "hbo max": "HBO Max", "max": "HBO Max", "disney": "Disney+ Premium", "disney premium": "Disney+ Premium",
    "star": "Disney+ Premium", "paramount": "Paramount+", "sportynet": "SportyNet", "sporty net": "SportyNet",
    "goat": "GOAT", "apple tv": "Apple TV", "dazn": "DAZN", "tnt": "TNT", "tnt sports": "TNT", "space": "Space",
    "youtube": "YouTube", "canal goat": "GOAT", "onefootball": "OneFootball", "ppv onefootball": "OneFootball",
    "rtp internacional": "RTP Internacional", "rtp": "RTP Internacional",
}
SIGLAS_NO_NOME = {"tv", "nba", "nfl", "ufc", "tnt", "hbo", "espn", "sbt", "fc", "dazn"}

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


SIGLAS_EQUIVALENTES = {"wsh": "was", "gs": "gsw", "ny": "nyk", "sa": "sas", "no": "nop", "utah": "uta", "pho": "phx"}


def mesmo_time(nome, candidatos):
    """O nome do guia é o time: igual a um dos nomes da ESPN (siglas equivalentes valem, NY = NYK),
    ou uma palavra inteira dele (com 5 letras ou mais)."""
    g = normalizar(nome)
    for c in candidatos:
        n = normalizar(c)
        if not n or not g:
            continue
        if g == n or SIGLAS_EQUIVALENTES.get(g, g) == SIGLAS_EQUIVALENTES.get(n, n):
            return True
        curto, longo = (g, n) if len(g) <= len(n) else (n, g)
        if len(curto) >= 5 and re.search(rf"\b{re.escape(curto)}\b", longo):
            return True
    return False


def eventos_espn(dados):
    """Os jogos de um scoreboard da ESPN: hora de Brasília e os nomes de cada time.
    "chave" é como o item guarda o time: o nome (futebol) ou a sigla (americanos), como o app recebe."""
    saida = []
    for ev in (dados or {}).get("events") or []:
        try:
            quando = datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(BRASILIA)
        except (KeyError, ValueError):
            continue
        times = []
        for c in ((ev.get("competitions") or [{}])[0].get("competitors") or []):
            t = c.get("team") or {}
            times.append({
                "sigla": t.get("abbreviation"),
                "nome": t.get("displayName"),
                "chave": t.get("displayName") or t.get("abbreviation"),
                "nomes": [t.get(k) for k in ("displayName", "shortDisplayName", "name", "location", "abbreviation") if t.get(k)],
            })
        if len(times) == 2:
            saida.append({"id": str(ev.get("id") or ""), "quando": quando, "times": times})
    return saida


def juntar_eventos(em_portugues, em_ingles):
    """Futebol: a ESPN em português traz só as ligas principais (31 jogos num sábado), e sem língua traz
    todas (226). Junta as duas pelo id: o nome em português vale como chave e o inglês ajuda a casar.
    Jogo só em inglês fica com a sigla como chave (é a mesma nas duas línguas, e o app casa por ela)."""
    por_id = {}
    saida = []
    for ev in em_portugues:
        por_id[ev["id"]] = ev
        saida.append(ev)
    for ev in em_ingles:
        ja = por_id.get(ev["id"]) if ev["id"] else None
        if ja:
            for t_pt, t_en in zip(ja["times"], ev["times"]):
                t_pt["nomes"] = list(dict.fromkeys(t_pt["nomes"] + t_en["nomes"]))
            continue
        for t in ev["times"]:
            t["chave"] = t["sigla"] or t["nome"]
        saida.append(ev)
    return saida


def datas_da_espn(jogo):
    """As datas em que procurar o jogo na ESPN: a dela é a da costa leste dos EUA, então um jogo
    depois da meia-noite de Brasília está no dia anterior."""
    datas = [jogo["data"]]
    if jogo["hora"] < "06:00":
        datas.append((date.fromisoformat(jogo["data"]) - timedelta(days=1)).isoformat())
    return datas


def hoje_em_brasilia(agora=None):
    """A data de hoje em Brasília (o robô roda no UTC: às 22h de Brasília já é amanhã lá)."""
    return (agora or datetime.now(timezone.utc)).astimezone(BRASILIA).date()


def nome_do_canal(bruto):
    """O nome do canal como o app mostra ("PREMIERE 2" -> "Premiere 2", "DISNEY+" -> "Disney+ Premium")."""
    chave = normalizar(bruto)
    if chave in NOMES_CANAIS:
        return NOMES_CANAIS[chave]
    m = re.fullmatch(r"(sportv|premiere|espn) ?(\d)", chave)
    if m:
        base = {"sportv": "SporTV", "premiere": "Premiere", "espn": "ESPN"}[m.group(1)]
        return base if m.group(2) == "1" else f"{base} {m.group(2)}"
    # desconhecido: só a primeira letra maiúscula, menos as siglas (TV, NBA...)
    palavras = str(bruto).strip().split()
    if any(c.islower() for c in str(bruto)):
        return " ".join(palavras)
    return " ".join(p.upper() if normalizar(p) in SIGLAS_NO_NOME else ("YouTube" if normalizar(p) == "youtube" else p.capitalize()) for p in palavras)


def ligas_nas_paginas(htmls):
    """Os links de liga nas listas do dia, sem as de base nem as femininas (o app não tem)."""
    caminhos = []
    for html in htmls:
        for caminho in re.findall(r'href="(/liga/[a-z0-9-]+)"', html or ""):
            if not re.search(r"sub-\d|feminin|-f-", caminho):
                caminhos.append(caminho)
    return list(dict.fromkeys(caminhos))


def paginas_nba(hoje, dias):
    """As páginas do mês da NBA que cobrem de hoje até `dias` dias depois (o mês atual primeiro)."""
    caminhos = []
    for n in range(dias):
        d = hoje + timedelta(days=n)
        caminho = f"/nba-{MESES[d.month - 1]}-{d.year}-onde-assistir-jogos-horarios/"
        if caminho not in caminhos:
            caminhos.append(caminho)
    return caminhos


_DIA_GAMEOVERDRIVE = re.compile(r'<h2[^>]*\bid="(\d{2})-(\d{2})-(\d{4})"[^>]*>.*?</h2>\s*<figure[^>]*>\s*<table[^>]*>(.*?)</table>', re.S)
_LINHA_GAMEOVERDRIVE = re.compile(r"<tr>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*</tr>")


def ler_gameoverdrive(html):
    """Os jogos da NBA da lista do mês, com hora de Brasília e os canais; só os que têm algo além do
    League Pass (que o padrão da NBA já mostra para todos)."""
    jogos = []
    for m in _DIA_GAMEOVERDRIVE.finditer(html or ""):
        data = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
        for hora, partida, onde in _LINHA_GAMEOVERDRIVE.findall(m.group(4)):
            h = re.fullmatch(r"\s*(\d{1,2})h(\d{2})?\s*", unescape(hora))
            times = [t.strip() for t in unescape(partida).split(" x ")]
            canais = [nome_do_canal(c) for c in unescape(onde).split(",") if c.strip()]
            if not h or len(times) != 2 or not all(times) or not any(c != "NBA League Pass" for c in canais):
                continue
            jogos.append({"esporte": "nba", "times": times, "data": data, "hora": f"{int(h.group(1)):02d}:{h.group(2) or '00'}", "canais": canais})
    return jogos


_PARTIDA_FUTEBOLNATV = re.compile(r'<article\b[^>]*\bdata-ts="(\d+)"[^>]*>(.*?)</article>', re.S)


def ler_futebolnatv(html):
    """Os jogos da lista do dia do futebolnatv: data e hora de Brasília, os dois times e os canais."""
    jogos = []
    for m in _PARTIDA_FUTEBOLNATV.finditer(html or ""):
        corpo = m.group(2)
        nomes = [unescape(n).strip() for n in re.findall(r'class="m-name">([^<]*)<', corpo)]
        partes = corpo.split("m-channels", 1)
        canais = [unescape(c).strip() for c in re.findall(r"<b>([^<]+)</b>", partes[1])] if len(partes) == 2 else []
        if len(nomes) != 2 or not all(nomes) or not canais:
            continue
        quando = datetime.fromtimestamp(int(m.group(1)), timezone.utc).astimezone(BRASILIA)
        jogos.append({
            "esporte": "futebol",
            "times": nomes,
            "data": quando.date().isoformat(),
            "hora": quando.strftime("%H:%M"),
            "canais": list(dict.fromkeys(nome_do_canal(c) for c in canais)),
        })
    return jogos


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
    chave = "sigla" if jogo["esporte"] in SIGLAS else "chave"
    return {"esporte": jogo["esporte"], "data": ev["quando"].date().isoformat(), "times": [t[chave] for t in ev["times"]]}


def posicao_do_canal(canal):
    return ORDEM_CANAIS.index(canal) if canal in ORDEM_CANAIS else len(ORDEM_CANAIS)


def canais_do_jogo(esporte, canais):
    """Os canais das fontes, mais o Disney+ Premium (que transmite o que passa na ESPN) e o League Pass na NBA.
    Um Premiere numerado ("Premiere 2") tira o "Premiere" genérico do guia."""
    lista = sorted(dict.fromkeys(canais), key=posicao_do_canal)
    if any(re.fullmatch(r"Premiere \d", c) for c in lista):
        lista = [c for c in lista if c != "Premiere"]
    if any(c.startswith("ESPN") for c in lista) and "Disney+ Premium" not in lista:
        lista.append("Disney+ Premium")
    if esporte == "nba" and "NBA League Pass" not in lista:
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


def atualizar(arquivo, hoje, pegar_texto=None, pegar_json=None, canais=None, dias=7, futebolnatv=True):
    """Marca os canais dos próximos `dias` dias em arquivo["jogos"]; devolve a lista do que mudou."""
    pegar_texto = pegar_texto or rede.pegar_texto
    pegar_json = pegar_json or rede.pegar_json
    canais = canais or CANAIS
    robots = pegar_texto(f"{BASE}/robots.txt")
    limite = (hoje + timedelta(days=dias)).isoformat()

    programas = []  # (jogo do programa, nome do canal)
    lidas = 0
    permitidas = 0
    for codigo, nome in canais.items():
        caminho = f"/programacao/canal/{codigo}"
        if not permitido(robots, caminho):
            rede.aviso(f"o robots.txt do guia não deixa ler {caminho}")
            continue
        permitidas += 1
        html = pegar_texto(f"{BASE}{caminho}")
        if html is None:
            continue
        lidas += 1
        for p in ler_guia(html, hoje):
            if hoje.isoformat() <= p["data"] < limite:
                jogo = jogo_do_programa(p)
                if jogo:
                    programas.append((jogo, nome))

    def ler_paginas(base, robots, caminhos, ler, contar=True):
        """Lê as páginas de um site e junta os jogos delas; devolve o HTML de cada uma (para achar links)."""
        nonlocal permitidas, lidas
        htmls = []
        for caminho in caminhos:
            if not permitido(robots, caminho):
                rede.aviso(f"o robots.txt de {base} não deixa ler {caminho}")
                continue
            if contar:
                permitidas += 1
            html = pegar_texto(f"{base}{caminho}")
            if html is None:
                continue
            if contar:
                lidas += 1
            htmls.append(html)
            for jogo in ler(html):
                if hoje.isoformat() <= jogo["data"] < limite:
                    programas.extend((jogo, canal) for canal in jogo["canais"])
        return htmls

    if futebolnatv:
        # a lista do dia (hoje e amanhã) e a página de cada liga (a rodada inteira, com os streamings)
        robots_fntv = pegar_texto(f"{FUTEBOLNATV}/robots.txt")
        do_dia = ler_paginas(FUTEBOLNATV, robots_fntv, PAGINAS_FUTEBOLNATV, ler_futebolnatv)
        ligas = list(dict.fromkeys([*LIGAS_FUTEBOLNATV, *ligas_nas_paginas(do_dia)]))
        ler_paginas(FUTEBOLNATV, robots_fntv, ligas, ler_futebolnatv)
        # a lista do mês da NBA (Prime Video, ESPN 2/Disney+); a do mês seguinte pode ainda não ter saído
        robots_god = pegar_texto(f"{GAMEOVERDRIVE}/robots.txt")
        meses = paginas_nba(hoje, dias)
        ler_paginas(GAMEOVERDRIVE, robots_god, meses[:1], ler_gameoverdrive)
        ler_paginas(GAMEOVERDRIVE, robots_god, meses[1:], ler_gameoverdrive, contar=False)
    if not lidas:
        return []  # as fontes fora do ar: fica tudo como estava

    cache = {}

    def scoreboard(esporte, data_txt, lingua):
        url = f"{ESPN}/{CAMINHO_ESPN[esporte]}/scoreboard?dates={data_txt.replace('-', '')}{lingua}"
        return eventos_espn(pegar_json(url + ("&limit=1000" if esporte == "futebol" else "")))

    def eventos(esporte, data_txt):
        if (esporte, data_txt) not in cache:
            if esporte == "futebol":
                # em português a ESPN traz só as ligas principais; sem língua, todas
                cache[(esporte, data_txt)] = juntar_eventos(scoreboard(esporte, data_txt, "&lang=pt&region=br"), scoreboard(esporte, data_txt, ""))
            else:
                cache[(esporte, data_txt)] = scoreboard(esporte, data_txt, "&lang=pt&region=br")
        return cache[(esporte, data_txt)]

    def eventos_do_jogo(jogo):
        vistos = set()
        saida = []
        for d in datas_da_espn(jogo):
            for ev in eventos(jogo["esporte"], d):
                if ev["id"] and ev["id"] in vistos:
                    continue
                vistos.add(ev["id"])
                saida.append(ev)
        return saida

    achados = {}  # (esporte, data, times em ordem) -> canais
    for jogo, canal in programas:
        jogo_espn = casar(jogo, eventos_do_jogo(jogo))
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

    a_mao = [item for item in jogos if item.get("fonte") != FONTE]

    def tem_item_a_mao(item):
        return any(_mesmo_jogo(m, item["esporte"], item["data"], item.get("times") or []) for m in a_mao)

    # item escrito à mão manda: o do robô para o mesmo jogo sai
    for item in list(jogos):
        if item.get("fonte") == FONTE and tem_item_a_mao(item):
            jogos.remove(item)
            mudancas.append(f"canais: saiu {item['esporte']} {item['data']} {' x '.join(item['times'])} (há item à mão)")

    # com a grade inteira lida, o que o robô tinha marcado nestes dias e o guia não traz mais sai
    if lidas == permitidas:
        for item in list(jogos):
            if item.get("fonte") != FONTE or not (hoje.isoformat() <= item.get("data", "") < limite):
                continue
            if not any(_mesmo_jogo(item, e, d, t) for (e, d, t) in achados):
                jogos.remove(item)
                mudancas.append(f"canais: saiu {item['esporte']} {item['data']} {' x '.join(item['times'])} (não está mais no guia)")

    for (esporte, data_jogo, times), lista in achados.items():
        lista = canais_do_jogo(esporte, lista)
        if any(_mesmo_jogo(m, esporte, data_jogo, times) for m in a_mao):
            continue  # já tem item escrito à mão: ele manda
        meu = next((item for item in jogos if item.get("fonte") == FONTE and _mesmo_jogo(item, esporte, data_jogo, times)), None)
        if meu is not None and lidas < permitidas:
            # alguma página falhou: só acrescenta canais, nunca tira
            lista = canais_do_jogo(esporte, list(meu["canais"]) + lista)
        if meu is None:
            jogos.append({"esporte": esporte, "data": data_jogo, "times": list(times), "canais": lista, "conferido_em": hoje.isoformat(), "fonte": FONTE})
            mudancas.append(f"canais: {esporte} {data_jogo} {' x '.join(times)} -> {', '.join(lista)}")
        elif meu["canais"] != lista:
            meu["canais"] = lista
            meu["conferido_em"] = hoje.isoformat()
            mudancas.append(f"canais: {esporte} {data_jogo} {' x '.join(times)} agora em {', '.join(lista)}")
    return mudancas
