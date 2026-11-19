"""NFL, futebol, Fórmula 1 e UFC pela API pública (não oficial) da ESPN.

São os mesmos endpoints em JSON que o site e o app da ESPN usam. Não precisam de chave,
mas podem mudar sem aviso: por isso todo campo é lido com .get() e um dado faltando
vira None em vez de derrubar a página.
"""

import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

import indice
import transmissoes

FUSO_BRASILIA = ZoneInfo("America/Sao_Paulo")
BASE = "https://site.api.espn.com/apis/site/v2/sports"
BASE_CLASSIFICACAO = "https://site.api.espn.com/apis/v2/sports"
BASE_ATLETA = "https://site.web.api.espn.com/apis/common/v3/sports"
BASE_CORE = "https://sports.core.api.espn.com/v2/sports"
IDIOMA = {"lang": "pt", "region": "br"}
CABECALHOS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

# id do app -> esporte na ESPN, tipo de tela e ligas disponíveis
ESPORTES = {
    "futebol": {
        "nome": "Futebol",
        "esporte": "soccer",
        "tipo": "partidas",
        "ligas": [
            {"id": "bra.1", "nome": "Brasileirão Série A"},
            {"id": "bra.2", "nome": "Brasileirão Série B"},
            {"id": "bra.copa_do_brazil", "nome": "Copa do Brasil"},
            {"id": "conmebol.libertadores", "nome": "Libertadores"},
            {"id": "conmebol.sudamericana", "nome": "Sul-Americana"},
            {"id": "uefa.champions", "nome": "Champions League"},
            {"id": "uefa.europa", "nome": "Liga Europa"},
            {"id": "eng.1", "nome": "Premier League"},
            {"id": "esp.1", "nome": "La Liga"},
            {"id": "ita.1", "nome": "Serie A (Itália)"},
            {"id": "ger.1", "nome": "Bundesliga"},
            {"id": "fra.1", "nome": "Ligue 1"},
            {"id": "por.1", "nome": "Liga Portugal"},
            {"id": "usa.1", "nome": "MLS"},
            {"id": "fifa.friendly", "nome": "Amistosos de seleções", "selecao": True},
            {"id": "fifa.worldq.conmebol", "nome": "Eliminatórias (América do Sul)", "selecao": True},
            {"id": "fifa.worldq.uefa", "nome": "Eliminatórias (Europa)", "selecao": True},
            {"id": "uefa.nations", "nome": "Liga das Nações", "selecao": True},
            {"id": "fifa.world", "nome": "Copa do Mundo", "selecao": True},
            {"id": "conmebol.america", "nome": "Copa América", "selecao": True},
            {"id": "uefa.euro", "nome": "Eurocopa", "selecao": True},
        ],
    },
    "nfl": {
        "nome": "NFL",
        "esporte": "football",
        "tipo": "partidas",
        "ligas": [{"id": "nfl", "nome": "NFL"}],
    },
    "f1": {
        "nome": "Fórmula 1",
        "esporte": "racing",
        "tipo": "corrida",
        "ligas": [{"id": "f1", "nome": "Fórmula 1"}],
    },
    "ufc": {
        "nome": "UFC",
        "esporte": "mma",
        "tipo": "luta",
        "ligas": [{"id": "ufc", "nome": "UFC"}],
    },
}


_LIGA_VALIDA = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$")


def config(esporte, liga):
    """Devolve (esporte, liga) da configuração ou levanta KeyError.

    No futebol, uma liga fora da lista também é aceita (a busca pode achar um jogador
    da liga saudita, por exemplo): ela entra com o próprio código como nome.
    """
    cfg = ESPORTES[esporte]
    for l in cfg["ligas"]:
        if l["id"] == liga:
            return cfg, l
    if esporte == "futebol" and _LIGA_VALIDA.match(str(liga or "")):
        return cfg, {"id": liga, "nome": liga}
    raise KeyError(liga)


def nome_da_liga(liga):
    for cfg in ESPORTES.values():
        for l in cfg["ligas"]:
            if l["id"] == liga:
                return l["nome"]
    return liga


def lista_esportes():
    return [
        {"id": k, "nome": v["nome"], "tipo": v["tipo"], "ligas": v["ligas"]}
        for k, v in ESPORTES.items()
    ]


class ErroESPN(RuntimeError):
    """Falha ao falar com a ESPN, com uma mensagem curta que aparece na página."""


def _pedir(url, params):
    try:
        return requests.get(url, params=params, headers=CABECALHOS, timeout=20)
    except requests.exceptions.SSLError as erro:
        raise ErroESPN("erro de certificado (SSL) ao acessar a ESPN; redes com filtro ou proxy costumam causar isso") from erro
    except requests.exceptions.ConnectionError as erro:
        raise ErroESPN("sem conexão com site.api.espn.com; a internet ou o firewall desta rede pode estar bloqueando a ESPN") from erro
    except requests.exceptions.Timeout as erro:
        raise ErroESPN("a ESPN demorou demais para responder") from erro


def _get(url, params=None):
    extra = params or {}
    resp = _pedir(url, {**IDIOMA, **extra})
    if 400 <= resp.status_code < 500:
        # alguns endpoints recusam idioma e região: tenta de novo sem eles
        resp = _pedir(url, extra)
    if resp.status_code >= 400:
        raise ErroESPN(f"a ESPN respondeu com erro {resp.status_code} em {url.split('/sports/')[-1]}")
    try:
        return resp.json()
    except ValueError as erro:
        raise ErroESPN("a resposta da ESPN não veio em JSON; algum filtro de rede pode estar trocando a página") from erro


# ---------- Datas e horários ----------

def _dt(texto):
    """'2026-11-15T18:00Z' -> datetime com fuso (UTC)."""
    if not texto or not isinstance(texto, str):
        return None
    try:
        dt = datetime.fromisoformat(texto.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _iso(dt):
    return dt.isoformat() if dt else None


def _data_br(dt):
    return dt.astimezone(FUSO_BRASILIA).strftime("%Y-%m-%d") if dt else None


def _yyyymmdd(d):
    return d.strftime("%Y%m%d")


# ---------- Traduções ----------

_ESTATISTICAS_PT = {
    # futebol
    "possession": "Posse de bola",
    "possessionpct": "Posse de bola",
    "shots": "Finalizações",
    "total shots": "Finalizações",
    "shots on target": "Finalizações no gol",
    "on goal": "Finalizações no gol",
    "shots on goal": "Finalizações no gol",
    "corner kicks": "Escanteios",
    "corners": "Escanteios",
    "fouls": "Faltas",
    "fouls committed": "Faltas",
    "yellow cards": "Cartões amarelos",
    "red cards": "Cartões vermelhos",
    "offsides": "Impedimentos",
    "saves": "Defesas",
    "passes": "Passes",
    "accurate passes": "Passes certos",
    "pass completion %": "Precisão dos passes",
    "crosses": "Cruzamentos",
    "accurate crosses": "Cruzamentos certos",
    "long balls": "Bolas longas",
    "tackles": "Desarmes",
    "effective tackles": "Desarmes certos",
    "interceptions": "Interceptações",
    "clearances": "Cortes",
    "blocked shots": "Finalizações bloqueadas",
    # NFL
    "first downs": "Primeiras descidas",
    "1st downs": "Primeiras descidas",
    "total yards": "Jardas totais",
    "passing": "Jardas aéreas",
    "rushing": "Jardas terrestres",
    "turnovers": "Perdas de posse",
    "penalties": "Penalidades (jardas)",
    "3rd down efficiency": "Conversões na 3ª descida",
    "4th down efficiency": "Conversões na 4ª descida",
    "possession time": "Tempo de posse",
    "time of possession": "Tempo de posse",
    "sacks-yards lost": "Sacks (jardas perdidas)",
    "red zone (made-att)": "Zona vermelha (convertidas)",
    "total plays": "Jogadas",
    "total drives": "Campanhas",
    "yards per play": "Jardas por jogada",
    "comp-att": "Passes completos",
    "yards per pass": "Jardas por passe",
    "interceptions thrown": "Interceptações sofridas",
    "rushing attempts": "Corridas",
    "yards per rush": "Jardas por corrida",
    "fumbles lost": "Fumbles perdidos",
    "defensive / special teams tds": "TDs de defesa/especiais",
}

_GRUPOS_NFL_PT = {
    "passing": "Passe",
    "rushing": "Corrida",
    "receiving": "Recepção",
    "fumbles": "Fumbles",
    "defensive": "Defesa",
    "interceptions": "Interceptações",
    "kickreturns": "Retornos de kickoff",
    "puntreturns": "Retornos de punt",
    "kicking": "Chutes (field goals)",
    "punting": "Punts",
}

_STATUS_LESAO_PT = {
    "out": "Fora",
    "questionable": "Dúvida",
    "doubtful": "Improvável",
    "probable": "Provável",
    "day-to-day": "Dia a dia",
    "injured reserve": "Lista de lesionados",
    "suspension": "Suspenso",
    "suspended": "Suspenso",
    "physically unable to perform": "Fora (PUP)",
}

_CATEGORIAS_PESO = [
    ("light heavyweight", "Peso-meio-pesado"),
    ("heavyweight", "Peso-pesado"),
    ("middleweight", "Peso-médio"),
    ("welterweight", "Peso-meio-médio"),
    ("lightweight", "Peso-leve"),
    ("featherweight", "Peso-pena"),
    ("bantamweight", "Peso-galo"),
    ("flyweight", "Peso-mosca"),
    ("strawweight", "Peso-palha"),
    ("catchweight", "Peso combinado"),
]

_RESULTADOS_LUTA = [
    ("ko/tko", "Nocaute"),
    ("tko", "Nocaute técnico"),
    ("ko", "Nocaute"),
    ("submission", "Finalização"),
    ("unanimous", "Decisão unânime"),
    ("split", "Decisão dividida"),
    ("majority", "Decisão majoritária"),
    ("decision", "Decisão"),
    ("no contest", "Sem resultado"),
    ("draw", "Empate"),
    ("disqualification", "Desclassificação"),
    ("dq", "Desclassificação"),
]

_SESSOES_F1 = [
    ("fp1", "Treino livre 1", "treino"),
    ("practice 1", "Treino livre 1", "treino"),
    ("fp2", "Treino livre 2", "treino"),
    ("practice 2", "Treino livre 2", "treino"),
    ("fp3", "Treino livre 3", "treino"),
    ("practice 3", "Treino livre 3", "treino"),
    ("sprint shootout", "Classificação sprint", "classificacao"),
    ("sprint qual", "Classificação sprint", "classificacao"),
    ("ss", "Classificação sprint", "classificacao"),
    ("sq", "Classificação sprint", "classificacao"),
    ("sprint", "Sprint", "sprint"),
    ("qual", "Classificação", "classificacao"),
    ("race", "Corrida", "corrida"),
    ("corrida", "Corrida", "corrida"),
]


def _traduz_estatistica(rotulo):
    return _ESTATISTICAS_PT.get(str(rotulo or "").strip().lower(), rotulo)


def _traduz_peso(texto):
    t = str(texto or "").lower()
    for chave, nome in _CATEGORIAS_PESO:
        if chave in t:
            return nome + (" feminino" if "women" in t else "")
    return texto or None


_BASES = {
    "orthodox": "Destro (ortodoxo)",
    "ortodoxo": "Destro (ortodoxo)",
    "destro": "Destro",
    "detro": "Destro",  # a ESPN em português escreve assim
    "southpaw": "Canhoto",
    "canhoto": "Canhoto",
    "switch": "Troca de base",
    "open stance": "Base aberta",
    "sideways": "Lateral",
}


def _traduz_base(texto):
    t = str(texto or "").strip().lower()
    return _BASES.get(t, texto) if t else None


def _traduz_resultado(texto):
    t = str(texto or "").lower()
    if not t:
        return None
    for chave, nome in _RESULTADOS_LUTA:
        if chave in t:
            return nome
    return texto


def _sessao_f1(abreviacao):
    t = str(abreviacao or "").strip().lower()
    for chave, nome, tipo in _SESSOES_F1:
        if t == chave or t.startswith(chave):
            return nome, tipo
    return (abreviacao or "Sessão"), None


# ---------- Status ----------

def _estado(status):
    tipo = (status or {}).get("type") or {}
    estado = {"pre": 1, "in": 2, "post": 3}.get(tipo.get("state"), 1)
    return estado, str(tipo.get("name") or "").upper()


def _status_texto(esporte_espn, status):
    estado, nome = _estado(status)
    status = status or {}
    periodo = status.get("period") or 0
    relogio = status.get("displayClock") or ""
    for chave, texto in (
        ("POSTPONED", "Adiado"),
        ("CANCELED", "Cancelado"),
        ("CANCELLED", "Cancelado"),
        ("SUSPENDED", "Suspenso"),
        ("ABANDONED", "Abandonado"),
        ("DELAYED", "Atrasado"),
        ("FORFEIT", "W.O."),
    ):
        if chave in nome:
            return texto
    if estado == 3:
        if "PEN" in nome:
            return "Encerrado (pênaltis)"
        if "AET" in nome or "OVERTIME" in nome or "_OT" in nome:
            return "Encerrado (prorrogação)"
        return "Encerrado"
    if estado == 2:
        if "HALFTIME" in nome:
            return "Intervalo"
        if esporte_espn == "soccer":
            if "END_PERIOD" in nome or "END_OF_PERIOD" in nome:
                return "Fim do tempo normal" if periodo >= 2 else "Intervalo"
            if "SHOOTOUT" in nome:
                return "Pênaltis"
            return relogio or "Ao vivo"
        if esporte_espn == "football":
            if "END_PERIOD" in nome:
                return f"Fim do {periodo}º quarto"
            quarto = "Prorrogação" if periodo > 4 else f"{periodo}º quarto"
            return f"{quarto}, {relogio}" if relogio else quarto
        return (status.get("type") or {}).get("shortDetail") or "Ao vivo"
    return None


# ---------- Partidas (futebol e NFL) ----------

def _logo(time):
    if not isinstance(time, dict):
        return None
    if time.get("logo"):
        return time["logo"]
    logos = time.get("logos") or []
    return logos[0].get("href") if logos and isinstance(logos[0], dict) else None


def _placar(valor):
    if isinstance(valor, dict):
        valor = valor.get("displayValue", valor.get("value"))
    if valor in (None, ""):
        return None
    try:
        return int(float(valor))
    except (TypeError, ValueError):
        return valor


def _campanha(c):
    registros = c.get("records") or c.get("record") or []
    if isinstance(registros, list) and registros and isinstance(registros[0], dict):
        return registros[0].get("summary") or registros[0].get("displayValue")
    return None


def _competidor(c, estado):
    c = c or {}
    time = c.get("team") or {}
    return {
        "id": time.get("id") or c.get("id"),
        "sigla": time.get("abbreviation"),
        "nome": time.get("displayName") or time.get("name"),
        "nome_curto": time.get("shortDisplayName") or time.get("displayName"),
        "logo": _logo(time),
        "placar": _placar(c.get("score")) if estado >= 2 else None,
        "penaltis": _placar(c.get("shootoutScore")),
        "vencedor": bool(c.get("winner")),
        "campanha": _campanha(c),
    }


def _local(venue):
    venue = venue or {}
    endereco = venue.get("address") or {}
    partes = [venue.get("fullName"), endereco.get("city")]
    return ", ".join(p for p in partes if p) or None


def _partida(ev, esporte, liga, comp=None):
    cfg, liga_cfg = config(esporte, liga)
    comp = comp or (ev.get("competitions") or [{}])[0]
    status = comp.get("status") or ev.get("status") or {}
    estado, _ = _estado(status)
    competidores = comp.get("competitors") or []
    casa = next((c for c in competidores if c.get("homeAway") == "home"), competidores[0] if competidores else {})
    fora = next(
        (c for c in competidores if c.get("homeAway") == "away"),
        competidores[1] if len(competidores) > 1 else {},
    )
    inicio = _dt(comp.get("date") or ev.get("date"))
    notas = [n.get("headline") for n in (comp.get("notes") or []) if isinstance(n, dict) and n.get("headline")]
    semana = (ev.get("week") or {}).get("number")
    jogo = {
        "id": str(ev.get("id") or comp.get("id") or ""),
        "esporte": esporte,
        "liga": liga,
        "liga_nome": liga_cfg["nome"],
        "inicio": _iso(inicio),
        "data": _data_br(inicio),
        "estado": estado,
        "status": _status_texto(cfg["esporte"], status),
        "relogio": status.get("displayClock"),
        "periodo": status.get("period"),
        "casa": _competidor(casa, estado),
        "fora": _competidor(fora, estado),
        "local": _local(comp.get("venue")),
        "semana": semana,
        "nota": notas[0] if notas else None,
    }
    jogo["transmissao"] = transmissoes.onde_assistir(
        esporte,
        liga=liga,
        data=jogo["data"],
        inicio=inicio,
        times=[[t.get("sigla"), t.get("nome"), t.get("nome_curto")] for t in (jogo["casa"], jogo["fora"])],
    )
    return jogo


def _eventos_periodo(url, d0, d1, info=None):
    """Eventos do placar da ESPN entre os dias d0 e d1 (datas dos EUA), sem repetir.

    A ESPN não aceita mais intervalo ('20261109-20261111'): responde erro 400. Ela aceita
    um dia ('20261110'), um mês ('202611') ou um ano. Períodos curtos vão dia a dia
    (respostas pequenas, boas para o placar ao vivo); os longos vão mês a mês.
    """
    dias = (d1 - d0).days + 1
    if dias <= 4:
        chaves = [_yyyymmdd(d0 + timedelta(days=i)) for i in range(dias)]
    else:
        chaves = sorted({(d0 + timedelta(days=i)).strftime("%Y%m") for i in range(dias)})
    eventos, vistos = [], set()
    for chave in chaves:
        dados = _get(url, {"dates": chave, "limit": 1000})
        if info is not None and not info.get("logo"):
            logos = ((dados.get("leagues") or [{}])[0]).get("logos") or []
            info["logo"] = logos[0].get("href") if logos and isinstance(logos[0], dict) else None
        for ev in dados.get("events") or []:
            ident = str(ev.get("id"))
            if ident not in vistos:
                vistos.add(ident)
                eventos.append(ev)
    return eventos


def buscar_partidas(esporte, liga, de, ate=None):
    """Jogos entre as datas `de` e `ate` (AAAA-MM-DD, dias de Brasília)."""
    cfg, _ = config(esporte, liga)
    ate = ate or de
    d0, d1 = date.fromisoformat(de), date.fromisoformat(ate)
    # a ESPN agrupa os dias pelo horário dos EUA, que está atrás do de Brasília:
    # um jogo à 0h30 de Brasília aparece no dia anterior de lá, por isso entra o dia antes
    info = {}
    eventos = _eventos_periodo(f"{BASE}/{cfg['esporte']}/{liga}/scoreboard", d0 - timedelta(days=1), d1, info)
    jogos = []
    for ev in eventos:
        try:
            jogo = _partida(ev, esporte, liga)
        except Exception:
            continue
        jogo["liga_logo"] = info.get("logo")
        if jogo["data"] and de <= jogo["data"] <= ate:
            jogos.append(jogo)
    jogos.sort(key=lambda j: (j["inicio"] or "", j["id"]))
    indice.registrar(
        [
            {"tipo": "time", "esporte": esporte, "liga": liga, "id": t["id"], "nome": t["nome"], "descricao": cfg["nome"], "imagem": t["logo"]}
            for j in jogos
            for t in (j["casa"], j["fora"])
        ]
    )
    return jogos


_SEMANAS_NFL = {
    "wild card": "Wild Card",
    "divisional round": "Semifinais de divisão",
    "conference championship": "Finais de conferência",
    "pro bowl": "Pro Bowl",
    "super bowl": "Super Bowl",
}


def _rotulo_semana(rotulo):
    t = str(rotulo or "")
    m = re.match(r"(?i)week\s+(\d+)", t)
    if m:
        return f"Semana {m.group(1)}"
    return _SEMANAS_NFL.get(t.lower(), t)


def buscar_datas(esporte, liga):
    """Dias com jogos (futebol) ou semanas da temporada (NFL), lidos do calendário da ESPN."""
    cfg, _ = config(esporte, liga)
    dados = _get(f"{BASE}/{cfg['esporte']}/{liga}/scoreboard")
    calendario = ((dados.get("leagues") or [{}])[0]).get("calendar") or []
    datas, semanas = set(), []
    agora = datetime.now(timezone.utc)
    atual = None
    for item in calendario:
        if isinstance(item, str):
            dt = _dt(item)
            if dt:
                datas.add(dt.strftime("%Y-%m-%d"))
            continue
        fase = item.get("label") or ""
        for e in item.get("entries") or []:
            ini, fim = _dt(e.get("startDate")), _dt(e.get("endDate"))
            if not ini or not fim:
                continue
            if "pre" in fase.lower():
                continue  # pré-temporada fica de fora
            semana = {
                "rotulo": _rotulo_semana(e.get("label")),
                "de": _data_br(ini),
                "ate": _data_br(fim - timedelta(seconds=1)),
            }
            semanas.append(semana)
            if atual is None and fim >= agora:
                atual = len(semanas) - 1
    return {
        "tipo": "semanas" if semanas else "dias",
        "datas": sorted(datas),
        "semanas": semanas,
        "atual": atual,
    }


def _estatisticas_times(dados, jogo):
    times = ((dados.get("boxscore") or {}).get("teams")) or []
    por_lado = {}
    for t in times:
        time = t.get("team") or {}
        lado = t.get("homeAway")
        if not lado:
            lado = "casa" if str(time.get("id")) == str(jogo["casa"].get("id")) else "fora"
        else:
            lado = "casa" if lado == "home" else "fora"
        por_lado[lado] = t.get("statistics") or []
    if not por_lado:
        return []
    linhas, vistos = [], {}
    for lado in ("casa", "fora"):
        for s in por_lado.get(lado, []):
            chave = s.get("name") or s.get("label")
            if chave not in vistos:
                vistos[chave] = {"rotulo": _traduz_estatistica(s.get("label") or s.get("name")), "casa": None, "fora": None}
                linhas.append(vistos[chave])
            vistos[chave][lado] = s.get("displayValue")
    return linhas


def _atleta_box(a):
    atleta = a.get("athlete") or {}
    return {
        "id": atleta.get("id"),
        "nome": atleta.get("displayName") or atleta.get("shortName"),
        "camisa": atleta.get("jersey"),
        "posicao": (atleta.get("position") or {}).get("abbreviation"),
        "valores": a.get("stats") or [],
    }


def _jogadores_box(dados):
    """Estatísticas individuais por grupo (passe, corrida, recepção...). Usado na NFL."""
    saida = []
    for t in ((dados.get("boxscore") or {}).get("players")) or []:
        time = t.get("team") or {}
        grupos = []
        for g in t.get("statistics") or []:
            nome = g.get("name") or g.get("text") or ""
            grupos.append(
                {
                    "nome": _GRUPOS_NFL_PT.get(nome.lower(), g.get("text") or nome),
                    "rotulos": g.get("labels") or [],
                    "descricoes": g.get("descriptions") or [],
                    "atletas": [_atleta_box(a) for a in g.get("athletes") or []],
                    "totais": g.get("totals") or [],
                }
            )
        saida.append({"time": {"id": time.get("id"), "nome": time.get("displayName"), "logo": _logo(time)}, "grupos": grupos})
    return saida


def _stat(stats, *nomes):
    for s in stats or []:
        if s.get("name") in nomes or s.get("abbreviation") in nomes:
            return s.get("displayValue") if s.get("displayValue") not in (None, "") else s.get("value")
    return None


def _numero_stat(stats, *nomes):
    """O número de uma estatística do jogador (0 quando não vem)."""
    try:
        return int(float(_stat(stats, *nomes)))
    except (TypeError, ValueError):
        return 0


def _minuto_do_texto(texto):
    """ "67'" -> 67, "90'+3'" -> 93 (igual ao Campinho.minutoDoTexto do app)."""
    m = re.match(r"^\s*(\d+)'?(?:\s*\+\s*(\d+)'?)?", str(texto or ""))
    return int(m.group(1)) + int(m.group(2) or 0) if m else None


def _substituicoes(lances):
    """Quem entrou e quem saiu, e quando: nos lances da ESPN, participants[0] entra e participants[1] sai."""
    saida = {}
    for e in lances or []:
        tipo = str((e.get("type") or {}).get("type") or (e.get("type") or {}).get("text") or "").lower()
        if "substitution" not in tipo:
            continue
        minuto = _minuto_do_texto((e.get("clock") or {}).get("displayValue"))
        ids = [str((p.get("athlete") or {}).get("id") or "") for p in e.get("participants") or []]
        entra = ids[0] if len(ids) > 0 else ""
        sai = ids[1] if len(ids) > 1 else ""
        if entra:
            saida.setdefault(entra, {})["entrou_aos"] = minuto
            if sai:
                saida[entra]["no_lugar_de"] = sai
        if sai:
            saida.setdefault(sai, {})["saiu_aos"] = minuto
            if entra:
                saida[sai]["saiu_para"] = entra
    return saida


def _jogador_escalacao(p, subs=None):
    atleta = p.get("athlete") or {}
    stats = p.get("stats") or []
    troca = (subs or {}).get(str(atleta.get("id") or ""), {})
    try:
        lugar = int(p.get("formationPlace")) or None
    except (TypeError, ValueError):
        lugar = None
    return {
        "id": atleta.get("id"),
        "nome": atleta.get("displayName") or atleta.get("shortName"),
        "camisa": p.get("jersey") or atleta.get("jersey"),
        "posicao": (p.get("position") or {}).get("abbreviation"),
        "titular": bool(p.get("starter")),
        "entrou": bool(p.get("subbedIn")),
        "saiu": bool(p.get("subbedOut")),
        "lugar": lugar,
        "foto": (atleta.get("headshot") or {}).get("href"),
        "entrou_aos": troca.get("entrou_aos"),
        "saiu_aos": troca.get("saiu_aos"),
        "no_lugar_de": troca.get("no_lugar_de"),
        "gols": _numero_stat(stats, "totalGoals", "G"),
        "assistencias": _numero_stat(stats, "goalAssists", "A"),
        "amarelos": _numero_stat(stats, "yellowCards", "YC"),
        "vermelhos": _numero_stat(stats, "redCards", "RC"),
        "chutes_no_gol": _numero_stat(stats, "shotsOnTarget", "SOG"),
        "faltas_cometidas": _numero_stat(stats, "foulsCommitted", "FC"),
        "faltas_sofridas": _numero_stat(stats, "foulsSuffered", "FA"),
        "gols_contra": _numero_stat(stats, "ownGoals", "OG"),
        "defesas": _numero_stat(stats, "saves", "SV"),
        "gols_sofridos": _numero_stat(stats, "goalsConceded", "GA"),
        "stats": {
            (s.get("abbreviation") or s.get("name")): s.get("displayValue")
            for s in stats
            if s.get("displayValue") not in (None, "", "0")
        },
    }


def _escalacoes(dados):
    """Escalações do futebol: titulares com o lugar no campo, reservas, minutos das trocas e o placar do time."""
    subs = _substituicoes(dados.get("keyEvents"))
    competidores = (((dados.get("header") or {}).get("competitions") or [{}])[0]).get("competitors") or []
    placar = {str((c.get("team") or {}).get("id") or c.get("id")): _placar(c.get("score")) for c in competidores}
    saida = []
    for r in dados.get("rosters") or []:
        time = r.get("team") or {}
        tid = str(time.get("id"))
        jogadores = [_jogador_escalacao(p, subs) for p in r.get("roster") or []]
        pro = placar.get(tid)
        contra = next((v for k, v in placar.items() if k != tid), None)
        saida.append(
            {
                "lado": "casa" if r.get("homeAway") == "home" else "fora",
                "time": {"id": time.get("id"), "nome": time.get("displayName"), "logo": _logo(time)},
                "formacao": r.get("formation"),
                "gols_pro": pro if isinstance(pro, int) else None,
                "gols_contra_time": contra if isinstance(contra, int) else None,
                "titulares": [j for j in jogadores if j["titular"]],
                "reservas": [j for j in jogadores if not j["titular"]],
            }
        )
    return saida


def _tipo_lance(texto, gol):
    t = str(texto or "").lower()
    if "own goal" in t or "gol contra" in t:
        return "gol_contra"
    if gol or "goal" in t or "gol" in t:
        return "gol"
    if "penalty" in t and ("miss" in t or "saved" in t):
        return "penalti_perdido"
    if "yellow" in t or "amarelo" in t:
        return "amarelo"
    if "red" in t or "vermelho" in t:
        return "vermelho"
    if "substitution" in t or "substitui" in t:
        return "substituicao"
    if "var" in t:
        return "var"
    return None


def _lances(dados, esporte_espn):
    lances = []
    if esporte_espn == "soccer":
        for e in dados.get("keyEvents") or []:
            tipo = _tipo_lance((e.get("type") or {}).get("text") or (e.get("type") or {}).get("type"), e.get("scoringPlay"))
            if not tipo:
                continue
            participantes = [
                (p.get("athlete") or {}).get("displayName")
                for p in e.get("participants") or []
                if (p.get("athlete") or {}).get("displayName")
            ]
            lances.append(
                {
                    "tempo": (e.get("clock") or {}).get("displayValue"),
                    "tipo": tipo,
                    "texto": e.get("shortText") or e.get("text"),
                    "time_id": (e.get("team") or {}).get("id"),
                    "jogadores": participantes,
                }
            )
        return lances
    for p in dados.get("scoringPlays") or []:
        periodo = (p.get("period") or {}).get("number")
        relogio = (p.get("clock") or {}).get("displayValue")
        lances.append(
            {
                "tempo": f"{periodo}º Q {relogio}" if periodo else relogio,
                "tipo": (p.get("type") or {}).get("abbreviation") or (p.get("type") or {}).get("text"),
                "texto": p.get("text"),
                "time_id": (p.get("team") or {}).get("id"),
                "placar": f"{p.get('awayScore')} x {p.get('homeScore')}" if p.get("homeScore") is not None else None,
                "jogadores": [],
            }
        )
    return lances


def _jogo_historico(e):
    resultado = {"W": "V", "L": "D", "D": "E", "T": "E"}.get(str(e.get("gameResult") or "").upper())
    adversario = e.get("opponent") or {}
    return {
        "id": e.get("id"),
        "data": _data_br(_dt(e.get("gameDate"))),
        "adversario": adversario.get("displayName") or adversario.get("abbreviation"),
        "adversario_logo": _logo(adversario),
        "local": "casa" if e.get("atVs") == "vs" else "fora",
        "placar": e.get("score"),
        "resultado": resultado,
        "competicao": e.get("leagueName") or e.get("leagueAbbreviation"),
    }


def _forma(dados):
    saida = []
    for t in dados.get("lastFiveGames") or []:
        time = t.get("team") or {}
        saida.append(
            {
                "time": {"id": time.get("id"), "nome": time.get("displayName"), "logo": _logo(time)},
                "jogos": [_jogo_historico(e) for e in t.get("events") or []],
            }
        )
    return saida


def _confronto(dados):
    for t in dados.get("headToHeadGames") or []:
        time = t.get("team") or {}
        jogos = [_jogo_historico(e) for e in t.get("events") or []]
        if jogos:
            return {"time": {"id": time.get("id"), "nome": time.get("displayName")}, "jogos": jogos[:10]}
    return None


def _lesoes(dados):
    saida = []
    for t in dados.get("injuries") or []:
        time = t.get("team") or {}
        lista = []
        for i in t.get("injuries") or []:
            atleta = i.get("athlete") or {}
            detalhes = i.get("details") or {}
            status = str(i.get("status") or (i.get("type") or {}).get("description") or "")
            lista.append(
                {
                    "nome": atleta.get("displayName"),
                    "posicao": (atleta.get("position") or {}).get("abbreviation"),
                    "status": _STATUS_LESAO_PT.get(status.lower(), status),
                    "motivo": " ".join(x for x in (detalhes.get("type"), detalhes.get("detail")) if x) or None,
                }
            )
        if lista:
            saida.append({"time": {"id": time.get("id"), "nome": time.get("displayName")}, "lista": lista})
    return saida


def _lideres(dados):
    saida = []
    for t in dados.get("leaders") or []:
        time = t.get("team") or {}
        categorias = []
        for c in t.get("leaders") or []:
            topo = (c.get("leaders") or [{}])[0]
            atleta = topo.get("athlete") or {}
            if not atleta:
                continue
            categorias.append(
                {
                    "nome": _traduz_estatistica(c.get("displayName") or c.get("name")),
                    "id": atleta.get("id"),
                    "atleta": atleta.get("displayName") or atleta.get("shortName"),
                    "valor": topo.get("displayValue"),
                }
            )
        if categorias:
            saida.append({"time": {"id": time.get("id"), "nome": time.get("displayName"), "logo": _logo(time)}, "categorias": categorias})
    return saida


def buscar_resumo(esporte, liga, evento_id):
    """Tudo de uma partida: placar, lances, estatísticas, escalações e o pré-jogo."""
    cfg, _ = config(esporte, liga)
    dados = _get(f"{BASE}/{cfg['esporte']}/{liga}/summary", {"event": evento_id})
    header = dados.get("header") or {}
    comp = (header.get("competitions") or [{}])[0]
    jogo = _partida({"id": evento_id, "week": header.get("week")}, esporte, liga, comp)
    info = dados.get("gameInfo") or {}
    if not jogo["local"]:
        jogo["local"] = _local(info.get("venue"))
    arbitragem = [
        o.get("displayName") or o.get("fullName")
        for o in info.get("officials") or []
        if o.get("displayName") or o.get("fullName")
    ]
    escalacoes = _escalacoes(dados)
    jogadores_box = _jogadores_box(dados)
    indice.registrar(
        [
            {"esporte": esporte, "liga": liga, "id": p["id"], "nome": p["nome"], "descricao": e["time"]["nome"]}
            for e in escalacoes
            for p in e["titulares"] + e["reservas"]
        ]
        + [
            {"esporte": esporte, "liga": liga, "id": a["id"], "nome": a["nome"], "descricao": t["time"]["nome"]}
            for t in jogadores_box
            for g in t["grupos"]
            for a in g["atletas"]
        ]
    )
    return {
        "jogo": jogo,
        "info": {
            "local": jogo["local"],
            "publico": info.get("attendance"),
            "arbitragem": arbitragem[:4],
        },
        "estatisticas": _estatisticas_times(dados, jogo),
        "jogadores": jogadores_box,
        "escalacoes": escalacoes,
        "lances": _lances(dados, cfg["esporte"]),
        "forma": _forma(dados),
        "confronto": _confronto(dados),
        "lesionados": _lesoes(dados),
        "lideres": _lideres(dados),
    }


# ---------- Classificação ----------

def _grupos_classificacao(no, nome_pai=""):
    entradas = ((no.get("standings") or {}).get("entries")) or []
    if entradas:
        # a chave é o nome interno da ESPN ('wins', 'points'...), que não muda com o idioma;
        # a sigla ('V', 'PTS'...) vai junto só para exibir
        colunas, chaves = [], set()
        for s in entradas[0].get("stats") or []:
            chave = s.get("name") or s.get("abbreviation")
            if not chave or chave in chaves:
                continue
            chaves.add(chave)
            colunas.append(
                {
                    "chave": chave,
                    "sigla": s.get("abbreviation") or s.get("shortDisplayName") or chave,
                    "nome": s.get("displayName") or chave,
                }
            )
        linhas = []
        for e in entradas:
            time = e.get("team") or {}
            atleta = e.get("athlete") or {}
            stats, rank, seed = {}, None, None
            for s in e.get("stats") or []:
                chave = s.get("name") or s.get("abbreviation")
                if not chave or chave in stats:
                    continue
                stats[chave] = s.get("displayValue") if s.get("displayValue") is not None else s.get("value")
                if chave == "rank" and s.get("value") is not None:
                    rank = s.get("value")
                if chave == "playoffSeed" and s.get("value") is not None:
                    seed = s.get("value")
            rank = rank if rank is not None else seed
            nota = e.get("note") or {}
            linhas.append(
                {
                    "id": time.get("id") or atleta.get("id"),
                    "tipo": "atleta" if atleta and not time else "time",
                    "nome": time.get("displayName") or atleta.get("displayName") or "",
                    "sigla": time.get("abbreviation") or atleta.get("shortName"),
                    "logo": _logo(time) or (atleta.get("flag") or {}).get("href"),
                    "stats": stats,
                    "rank": rank,
                    "nota": nota.get("description"),
                    "cor_nota": nota.get("color"),
                }
            )
        if any(l["rank"] is not None for l in linhas):
            linhas.sort(key=lambda l: (l["rank"] is None, l["rank"] or 0))
        yield {"nome": no.get("name") or nome_pai, "colunas": colunas, "linhas": linhas}
    for filho in no.get("children") or []:
        yield from _grupos_classificacao(filho, no.get("name") or nome_pai)


def buscar_classificacao(esporte, liga):
    cfg, _ = config(esporte, liga)
    dados = _get(f"{BASE_CLASSIFICACAO}/{cfg['esporte']}/{liga}/standings")
    grupos = list(_grupos_classificacao(dados))
    indice.registrar(
        [
            {"tipo": l["tipo"], "esporte": esporte, "liga": liga, "id": l["id"], "nome": l["nome"], "descricao": cfg["nome"], "imagem": l["logo"] if l["tipo"] == "time" else None}
            for g in grupos
            for l in g["linhas"]
        ]
    )
    return {"grupos": grupos}


# ---------- Elenco e atletas ----------

def _atleta_curto(a):
    return {
        "id": a.get("id"),
        "nome": a.get("displayName") or a.get("fullName"),
        "camisa": a.get("jersey"),
        "posicao": (a.get("position") or {}).get("abbreviation") or (a.get("position") or {}).get("name"),
        "idade": a.get("age"),
        "foto": (a.get("headshot") or {}).get("href"),
        "pais": a.get("citizenship") or (a.get("flag") or {}).get("alt"),
    }


_GRUPOS_ELENCO_PT = {
    "offense": "Ataque",
    "defense": "Defesa",
    "specialteam": "Times especiais",
    "special teams": "Times especiais",
    "goalkeeper": "Goleiros",
    "defender": "Defensores",
    "midfielder": "Meio-campistas",
    "forward": "Atacantes",
}


def buscar_elenco(esporte, liga, time_id):
    cfg, _ = config(esporte, liga)
    dados = _get(f"{BASE}/{cfg['esporte']}/{liga}/teams/{time_id}/roster")
    atletas = dados.get("athletes") or []
    grupos = []
    if atletas and isinstance(atletas[0], dict) and "items" in atletas[0]:
        for g in atletas:
            nome = str(g.get("position") or "")
            grupos.append({"nome": _GRUPOS_ELENCO_PT.get(nome.lower(), nome.title()), "atletas": [_atleta_curto(a) for a in g.get("items") or []]})
    else:
        grupos.append({"nome": "Elenco", "atletas": [_atleta_curto(a) for a in atletas]})
    time = dados.get("team") or {}
    resultado = {"time": {"id": time.get("id") or time_id, "nome": time.get("displayName"), "logo": _logo(time)}, "grupos": grupos}
    indice.registrar(
        [{"tipo": "time", "esporte": esporte, "liga": liga, "id": resultado["time"]["id"], "nome": resultado["time"]["nome"], "imagem": resultado["time"]["logo"]}]
        + [
            {"esporte": esporte, "liga": liga, "id": a["id"], "nome": a["nome"], "descricao": resultado["time"]["nome"], "imagem": a["foto"]}
            for g in grupos
            for a in g["atletas"]
        ]
    )
    return resultado


def _texto(v):
    if isinstance(v, dict):
        return v.get("displayName") or v.get("text") or v.get("name") or v.get("abbreviation")
    return v


def _perfil_atleta(a):
    nascimento = a.get("displayDOB") or (a.get("dateOfBirth") or "")[:10] or None
    local = a.get("birthPlace") or {}
    local_txt = ", ".join(x for x in (local.get("city"), local.get("state"), local.get("country")) if x) or None
    extras = []
    for rotulo, valor in (
        ("Categoria", _traduz_peso(_texto(a.get("weightClass")))),
        ("Equipe", _texto(a.get("association"))),
        ("Envergadura", a.get("displayReach")),
        ("Base", _traduz_base(_texto(a.get("stance")))),
        ("Draft", a.get("displayDraft")),
        ("Experiência", a.get("displayExperience")),
        ("Faculdade", _texto(a.get("college"))),
    ):
        if valor:
            extras.append({"rotulo": rotulo, "valor": valor})
    resumo = []
    sumario = a.get("statsSummary") or {}
    for s in sumario.get("statistics") or []:
        resumo.append({"rotulo": _traduz_estatistica(s.get("displayName") or s.get("name")), "valor": s.get("displayValue")})
    return {
        "id": a.get("id"),
        "nome": a.get("displayName") or a.get("fullName"),
        "foto": (a.get("headshot") or {}).get("href"),
        "bandeira": (a.get("flag") or {}).get("href"),
        "pais": a.get("citizenship") or (a.get("flag") or {}).get("alt"),
        "posicao": _texto(a.get("position")),
        "time": _texto(a.get("team")),
        "time_id": (a.get("team") or {}).get("id") if isinstance(a.get("team"), dict) else None,
        "camisa": a.get("jersey"),
        "idade": a.get("age"),
        "nascimento": nascimento,
        "local_nascimento": local_txt,
        "altura": a.get("displayHeight"),
        "peso": a.get("displayWeight"),
        "extras": extras,
        "resumo_titulo": sumario.get("displayName"),
        "resumo": resumo,
    }


def _times_por_id(st):
    times = st.get("teams") or {}
    if isinstance(times, dict):
        return {str(k): v for k, v in times.items() if isinstance(v, dict)}
    if isinstance(times, list):
        return {str(t.get("id")): t for t in times if isinstance(t, dict)}
    return {}


def _categorias_stats(st):
    times = _times_por_id(st)
    categorias = []
    for cat in st.get("categories") or []:
        linhas = []
        for s in cat.get("statistics") or []:
            temporada = s.get("season") or {}
            time = times.get(str(s.get("teamId"))) or {}
            linhas.append(
                {
                    "temporada": str(temporada.get("displayName") or temporada.get("year") or ""),
                    "time": time.get("abbreviation") or time.get("displayName") or s.get("teamSlug"),
                    "valores": s.get("stats") or [],
                }
            )
        if not linhas and not cat.get("totals"):
            continue
        categorias.append(
            {
                "nome": cat.get("displayName") or cat.get("name") or "",
                "rotulos": cat.get("labels") or [],
                "descricoes": cat.get("displayNames") or cat.get("names") or [],
                "temporadas": linhas,
                "totais": cat.get("totals") or [],
            }
        )
    return categorias


def _categorias_overview(ov):
    est = ov.get("statistics") or {}
    divisoes = est.get("splits") or []
    if not divisoes:
        return []
    return [
        {
            "nome": est.get("displayName") or "Resumo",
            "rotulos": est.get("labels") or [],
            "descricoes": est.get("displayNames") or est.get("names") or [],
            "temporadas": [{"temporada": d.get("displayName"), "time": None, "valores": d.get("stats") or []} for d in divisoes],
            "totais": [],
        }
    ]


def buscar_atleta(esporte, liga, atleta_id):
    """Perfil e estatísticas da carreira, temporada por temporada, de qualquer atleta da ESPN."""
    cfg, _ = config(esporte, liga)
    base = f"{BASE_ATLETA}/{cfg['esporte']}/{liga}/athletes/{atleta_id}"
    try:
        bio = _get(base).get("athlete") or {}
    except ErroESPN:
        # o perfil comum não existe para alguns esportes (UFC): usa o Core API
        bio = _get(f"{BASE_CORE}/{cfg['esporte']}/leagues/{liga}/athletes/{atleta_id}")
    carreira, falhas = [], []
    perfil = _perfil_atleta(bio)
    indice.registrar([{"esporte": esporte, "liga": liga, "id": perfil["id"] or atleta_id, "nome": perfil["nome"], "descricao": perfil["time"], "imagem": perfil["foto"]}])
    if cfg["tipo"] in ("luta", "corrida") or cfg["esporte"] == "soccer":
        # sem estatísticas por temporada no formato comum: o histórico vem de /historico
        return {"perfil": perfil, "carreira": [], "falhas": []}
    try:
        carreira = _categorias_stats(_get(f"{base}/stats"))
    except Exception:
        falhas.append("stats")
    if not carreira:
        try:
            carreira = _categorias_overview(_get(f"{base}/overview"))
        except Exception:
            falhas.append("overview")
    return {"perfil": perfil, "carreira": carreira, "falhas": falhas}


# ---------- Fórmula 1 e UFC: eventos da temporada ----------

def buscar_eventos(esporte, liga, ano=None):
    """Calendário da temporada (GPs da F1 ou eventos do UFC), do primeiro ao último."""
    cfg, _ = config(esporte, liga)
    params = {"dates": str(ano)} if ano else None
    dados = _get(f"{BASE}/{cfg['esporte']}/{liga}/scoreboard", params)
    calendario = ((dados.get("leagues") or [{}])[0]).get("calendar") or []
    agora = datetime.now(timezone.utc)
    eventos = []
    for c in calendario:
        if not isinstance(c, dict):
            continue
        ref = str((c.get("event") or {}).get("$ref") or "")
        m = re.search(r"events/(\d+)", ref)
        ini, fim = _dt(c.get("startDate")), _dt(c.get("endDate"))
        if not m or not ini:
            continue
        fim = fim or ini
        eventos.append(
            {
                "id": m.group(1),
                "nome": c.get("label") or "",
                "inicio": _iso(ini),
                "fim": _iso(fim),
                "data": _data_br(ini),
                "estado": 3 if fim < agora else (2 if ini <= agora else 1),
            }
        )
    if not eventos:
        # plano B: os eventos que vieram no próprio placar
        for ev in dados.get("events") or []:
            ini = _dt(ev.get("date"))
            fim = _dt(ev.get("endDate")) or ini
            estado, _ = _estado(ev.get("status"))
            eventos.append({"id": str(ev.get("id")), "nome": ev.get("name"), "inicio": _iso(ini), "fim": _iso(fim), "data": _data_br(ini), "estado": estado})
    eventos.sort(key=lambda e: e["inicio"] or "")
    atual = next((i for i, e in enumerate(eventos) if e["estado"] != 3), len(eventos) - 1 if eventos else None)
    return {"eventos": eventos, "atual": atual}


def _estatisticas_competidor(c):
    saida = {}
    for s in c.get("statistics") or []:
        if isinstance(s, dict) and s.get("name"):
            saida[s["name"]] = s.get("displayValue")
    return saida


def _sessao(comp, nome_evento, liga):
    tipo = comp.get("type") or {}
    nome, chave = _sessao_f1(tipo.get("abbreviation") or tipo.get("text") or tipo.get("name"))
    status = comp.get("status") or {}
    estado, _ = _estado(status)
    inicio = _dt(comp.get("date") or comp.get("startDate"))
    competidores = sorted(comp.get("competitors") or [], key=lambda c: c.get("order") or 999)
    resultados = []
    for c in competidores:
        a = c.get("athlete") or {}
        bandeira = a.get("flag") or {}
        resultados.append(
            {
                "posicao": c.get("order"),
                "id": a.get("id") or c.get("id"),
                "nome": a.get("displayName") or a.get("fullName"),
                "abreviacao": a.get("shortName"),
                "bandeira": bandeira.get("href"),
                "pais": bandeira.get("alt"),
                "equipe": _texto(c.get("team")) or _texto((c.get("vehicle") or {}).get("manufacturer")),
                "vencedor": bool(c.get("winner")),
                "info": _estatisticas_competidor(c),
            }
        )
    return {
        "id": comp.get("id"),
        "nome": nome,
        "tipo": chave,
        "inicio": _iso(inicio),
        "data": _data_br(inicio),
        "estado": estado,
        "status": _status_texto("racing", status),
        "resultados": resultados,
        "transmissao": transmissoes.onde_assistir("f1", liga=liga, inicio=inicio, evento=nome_evento, sessao=chave),
    }


def _luta(comp):
    status = comp.get("status") or {}
    estado, _ = _estado(status)
    tipo = comp.get("type") or {}
    lutadores = []
    for c in sorted(comp.get("competitors") or [], key=lambda c: c.get("order") or 0):
        a = c.get("athlete") or {}
        bandeira = a.get("flag") or {}
        lutadores.append(
            {
                # no MMA a ESPN usa o id do competidor como id do lutador
                "id": c.get("id") or a.get("id"),
                "nome": a.get("displayName") or a.get("fullName"),
                "foto": (a.get("headshot") or {}).get("href"),
                "bandeira": bandeira.get("href"),
                "pais": bandeira.get("alt"),
                "cartel": _campanha(c),
                "vencedor": bool(c.get("winner")),
            }
        )
    resultado = status.get("result") or {}
    notas = [n.get("headline") or n.get("text") for n in comp.get("notes") or [] if isinstance(n, dict)]
    categoria = tipo.get("text") or tipo.get("abbreviation") or next((n for n in notas if n), None)
    inicio = _dt(comp.get("date") or comp.get("startDate"))
    return {
        "id": comp.get("id"),
        "inicio": _iso(inicio),
        "estado": estado,
        "categoria": _traduz_peso(categoria),
        "card": ((comp.get("cardSegment") or {}).get("description")) or None,
        "lutadores": lutadores,
        "resultado": _traduz_resultado(resultado.get("displayName") or resultado.get("name")) if estado == 3 else None,
        "round": status.get("period") if estado == 3 else None,
        "tempo": status.get("displayClock") if estado == 3 else None,
        "status": _status_texto("mma", status),
    }


def buscar_evento(esporte, liga, evento_id, data=None):
    """Detalhes de um GP (sessões e resultados) ou de um evento do UFC (todas as lutas)."""
    cfg, _ = config(esporte, liga)
    if data:
        d = date.fromisoformat(data)
    else:
        cal = buscar_eventos(esporte, liga)
        achado = next((e for e in cal["eventos"] if e["id"] == str(evento_id)), None)
        d = date.fromisoformat(achado["data"]) if achado and achado["data"] else date.today()
    eventos = _eventos_periodo(f"{BASE}/{cfg['esporte']}/{liga}/scoreboard", d - timedelta(days=2), d + timedelta(days=5))
    ev = next((e for e in eventos if str(e.get("id")) == str(evento_id)), None)
    if ev is None:
        raise LookupError("Evento não encontrado nessas datas.")
    nome = ev.get("name") or ev.get("shortName") or ""
    ini = _dt(ev.get("date"))
    fim = _dt(ev.get("endDate")) or ini
    circuito = ev.get("circuit") or {}
    local = _local(circuito) or _local(((ev.get("competitions") or [{}])[0]).get("venue"))
    base = {"id": str(evento_id), "nome": nome, "local": local, "inicio": _iso(ini), "fim": _iso(fim), "data": _data_br(ini)}
    if cfg["tipo"] == "corrida":
        sessoes = [_sessao(c, nome, liga) for c in ev.get("competitions") or []]
        sessoes.sort(key=lambda s: s["inicio"] or "")
        indice.registrar(
            [{"esporte": esporte, "liga": liga, "id": r["id"], "nome": r["nome"], "descricao": r["equipe"] or "Fórmula 1"} for x in sessoes for r in x["resultados"]]
        )
        return {**base, "sessoes": sessoes}
    lutas = [(i, _luta(c)) for i, c in enumerate(ev.get("competitions") or [])]
    indice.registrar(
        [
            {"esporte": esporte, "liga": liga, "id": p["id"], "nome": p["nome"], "descricao": " ".join(x for x in ("UFC", l["categoria"] or "") if x), "imagem": p["foto"]}
            for _, l in lutas
            for p in l["lutadores"]
        ]
    )
    # a luta principal é a última da noite: mostra do fim para o começo
    lutas.sort(key=lambda x: (x[1]["inicio"] or "", x[0]), reverse=True)
    inicio_card = min((l["inicio"] for _, l in lutas if l["inicio"]), default=_iso(ini))
    return {
        **base,
        "lutas": [l for _, l in lutas],
        "transmissao": transmissoes.onde_assistir(esporte, liga=liga, inicio=inicio_card, evento=nome),
    }
