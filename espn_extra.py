"""Dados extras da ESPN: líderes de estatísticas, ranking do UFC, histórico de lutas,
carreira de jogadores de futebol, busca e últimos campeões.

Boa parte disso vem do "Core API" da ESPN (sports.core.api.espn.com), que responde com
links ($ref) em vez dos dados completos: um atleta aparece como {"$ref": ".../athletes/123"}.
O resolvedor abaixo segue esses links em paralelo e guarda as respostas em memória por
algumas horas, para não repetir pedidos.
"""

import json
import re
import threading
import time
from datetime import date
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cache
import espn_dados
import indice

CORE = "https://sports.core.api.espn.com/v2/sports"
ARQUIVO_CAMPEOES = Path(__file__).parent / "campeoes.json"

# ---------- Seguir links ($ref) do Core API ----------

_MEMO = {}
_TRAVA = threading.Lock()
VALIDADE_REF = 6 * 3600


def _url(ref):
    # alguns links apontam para o domínio interno da ESPN (.pvt), que não abre de fora
    return str(ref).replace(".espn.pvt", ".espn.com").replace("http://", "https://")


def _validade_ref(url):
    """Atleta, time e temporada quase não mudam; estatísticas mudam a cada rodada."""
    if "/statistics" in url or "/eventlog" in url or "/status" in url or "/rankings" in url:
        return 6 * 3600
    return 7 * 86400


def _ref(url):
    url = _url(url)
    agora = time.time()
    with _TRAVA:
        item = _MEMO.get(url)
        if item and agora - item[0] < VALIDADE_REF:
            return item[1]
    # o banco guarda as respostas entre reinícios do servidor
    dados = cache.obter(f"ref:{url}", _validade_ref(url), lambda: espn_dados._get(url))
    with _TRAVA:
        if len(_MEMO) > 6000:
            _MEMO.clear()
        _MEMO[url] = (agora, dados)
    return dados


def _ref_seguro(url):
    try:
        return _ref(url)
    except Exception:
        return None


def _so_ref(obj):
    """{"$ref": "..."} sem mais nada -> o link; qualquer outra coisa -> None."""
    if isinstance(obj, dict) and obj.get("$ref") and len(obj) <= 2:
        return obj["$ref"]
    return None


def _resolver(refs):
    """Abre vários links em paralelo e devolve {link: resposta (ou None)}."""
    refs = [r for r in dict.fromkeys(refs) if r]
    if not refs:
        return {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        return dict(zip(refs, ex.map(_ref_seguro, refs)))


def _expandir(obj, resolvidos):
    ref = _so_ref(obj)
    if ref:
        return resolvidos.get(ref) or {}
    return obj if isinstance(obj, dict) else {}


def _sem_acento(texto):
    base = unicodedata.normalize("NFKD", str(texto or ""))
    return "".join(c for c in base if not unicodedata.combining(c)).lower().strip()


# ---------- Líderes de estatísticas (NFL e futebol) ----------

CATEGORIAS_PT = {
    # futebol
    "goals": "Artilharia",
    "goalsleaders": "Artilharia",
    "totalgoals": "Artilharia",
    "assists": "Assistências",
    "assistsleaders": "Assistências",
    "goalassists": "Assistências",
    "yellowcards": "Cartões amarelos",
    "redcards": "Cartões vermelhos",
    "shotsontarget": "Finalizações no gol",
    "totalshots": "Finalizações",
    "saves": "Defesas",
    "cleansheet": "Jogos sem sofrer gol",
    "cleansheets": "Jogos sem sofrer gol",
    "foulscommitted": "Faltas cometidas",
    "appearances": "Jogos",
    # NFL
    "passingyards": "Jardas de passe",
    "passingtouchdowns": "Touchdowns de passe",
    "passingleader": "Passe",
    "quarterbackrating": "Rating de quarterback",
    "qbrating": "Rating de quarterback",
    "rushingyards": "Jardas de corrida",
    "rushingtouchdowns": "Touchdowns de corrida",
    "rushingleader": "Corrida",
    "receivingyards": "Jardas recebidas",
    "receivingtouchdowns": "Touchdowns recebidos",
    "receivingleader": "Recepção",
    "receptions": "Recepções",
    "totaltackles": "Tackles",
    "tackles": "Tackles",
    "sacks": "Sacks",
    "interceptions": "Interceptações",
    "passesdefended": "Passes defendidos",
    "fumblesforced": "Fumbles forçados",
    "kickreturnyards": "Jardas em retorno de kickoff",
    "puntreturnyards": "Jardas em retorno de punt",
    "totalpoints": "Pontos",
    "fieldgoals": "Field goals",
    "fieldgoalsmade": "Field goals",
    "totaltouchdowns": "Touchdowns",
}

# ordem de exibição: o que importa mais aparece primeiro
_ORDEM = [
    "Artilharia", "Assistências", "Cartões amarelos", "Cartões vermelhos",
    "Jardas de passe", "Touchdowns de passe", "Rating de quarterback",
    "Jardas de corrida", "Touchdowns de corrida", "Jardas recebidas", "Recepções",
    "Touchdowns recebidos", "Tackles", "Sacks", "Interceptações",
]

# o que se espera ver em cada esporte (para avisar quando a ESPN não publica)
ESPERADOS = {
    "futebol": ["Artilharia", "Assistências", "Cartões amarelos", "Cartões vermelhos"],
    "nfl": ["Jardas de passe", "Jardas de corrida", "Jardas recebidas", "Tackles", "Sacks", "Interceptações"],
}


def _nome_categoria(c):
    interno = _sem_acento(c.get("name") or "").replace(" ", "")
    if interno in CATEGORIAS_PT:
        return CATEGORIAS_PT[interno]
    exibido = c.get("displayName") or c.get("shortDisplayName") or c.get("name") or ""
    chave = _sem_acento(exibido).replace(" ", "")
    return CATEGORIAS_PT.get(chave) or espn_dados._traduz_estatistica(exibido)


def _categorias(dados):
    lideres = dados.get("leaders")
    if isinstance(lideres, dict):
        return lideres.get("categories") or []
    if isinstance(lideres, list):
        return lideres
    return dados.get("categories") or []


def _temporada_atual(sport, liga):
    """Ano, tipo e nome da temporada atual, lidos do placar da ESPN."""
    try:
        dados = espn_dados._get(f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{liga}/scoreboard")
    except Exception:
        return date.today().year, None, None
    temporada = ((dados.get("leagues") or [{}])[0]).get("season") or {}
    tipo = temporada.get("type")
    if isinstance(tipo, dict):
        tipo = tipo.get("type") or tipo.get("id")
    try:
        ano = int(temporada.get("year"))
    except (TypeError, ValueError):
        ano = date.today().year
    return ano, (int(tipo) if str(tipo or "").isdigit() else None), temporada.get("displayName")


def buscar_lideres(esporte, liga, limite=10):
    """Top 10 de cada estatística da temporada atual (ou da última que teve jogos).

    O endereço sem temporada devolve números de carreira (a NFL mostrava os líderes de
    todos os tempos) ou erro 400 (torneios sem edição em andamento, como a Eurocopa).
    Por isso a temporada vai sempre no endereço.
    """
    cfg, _ = espn_dados.config(esporte, liga)
    sport = cfg["esporte"]
    ano, tipo, nome_temporada = _temporada_atual(sport, liga)
    if esporte == "nfl":
        anos, tipos = [ano, ano - 1], [2]  # 2 = temporada regular
    else:
        anos, tipos = [ano, ano - 1, ano - 2], [tipo or 1, None]

    cats, ano_achado, erros_conexao, tentativas = [], None, 0, 0
    for a in anos:
        for t in dict.fromkeys(tipos):
            caminho = f"seasons/{a}/types/{t}/leaders" if t else f"seasons/{a}/leaders"
            tentativas += 1
            try:
                cats = _categorias(espn_dados._get(f"{CORE}/{sport}/leagues/{liga}/{caminho}", {"limit": limite}))
            except espn_dados.ErroESPN as e:
                if "conexão" in str(e) or "demorou" in str(e):
                    erros_conexao += 1
                cats = []
            if cats:
                ano_achado = a
                break
        if cats:
            break
    if not cats:
        if erros_conexao == tentativas:
            raise espn_dados.ErroESPN("sem conexão com a ESPN para buscar os líderes")
        return {
            "categorias": [],
            "faltando": ESPERADOS.get(esporte, []),
            "temporada": None,
            "aviso": "A ESPN não tem líderes desta competição agora. Torneios como Eurocopa e Copa América só têm números enquanto estão sendo disputados.",
        }
    temporada_rotulo = nome_temporada if ano_achado == ano and nome_temporada else str(ano_achado)

    # 1ª rodada: atletas e times que vieram só como link
    refs = []
    for c in cats:
        for l in (c.get("leaders") or [])[:limite]:
            refs += [_so_ref(l.get("athlete")), _so_ref(l.get("team"))]
    resolvidos = _resolver(refs)
    # 2ª rodada: time do atleta, quando o líder não traz o time
    refs2 = []
    for c in cats:
        for l in (c.get("leaders") or [])[:limite]:
            atleta = _expandir(l.get("athlete"), resolvidos)
            if not l.get("team"):
                refs2.append(_so_ref(atleta.get("team")))
    resolvidos.update(_resolver(refs2))

    saida, vistos = [], set()
    for c in cats:
        nome = _nome_categoria(c)
        if nome in vistos:
            continue
        lideres = []
        for i, l in enumerate((c.get("leaders") or [])[:limite], start=1):
            atleta = _expandir(l.get("athlete"), resolvidos)
            time_ = _expandir(l.get("team") or atleta.get("team"), resolvidos)
            valor = l.get("displayValue") if l.get("displayValue") not in (None, "") else l.get("value")
            if isinstance(valor, float) and valor.is_integer():
                valor = int(valor)
            lideres.append(
                {
                    "posicao": i,
                    "id": atleta.get("id"),
                    "nome": atleta.get("displayName") or atleta.get("fullName") or "?",
                    "time": time_.get("abbreviation") or time_.get("shortDisplayName") or time_.get("displayName"),
                    "time_logo": espn_dados._logo(time_),
                    "valor": valor,
                }
            )
        if lideres:
            vistos.add(nome)
            saida.append({"chave": c.get("name"), "nome": nome, "lideres": lideres})
    saida.sort(key=lambda c: _ORDEM.index(c["nome"]) if c["nome"] in _ORDEM else 99)
    indice.registrar(
        [{"esporte": esporte, "liga": liga, "id": j["id"], "nome": j["nome"], "descricao": j["time"]} for c in saida for j in c["lideres"]]
    )
    return {
        "categorias": saida,
        "faltando": [x for x in ESPERADOS.get(esporte, []) if x not in vistos],
        "temporada": temporada_rotulo,
        "temporada_anterior": ano_achado != ano,
    }


# ---------- Ranking das categorias do UFC ----------

def _nome_ranking(nome):
    t = _sem_acento(nome)
    if "pound" in t:
        return "Peso por peso" + (" (feminino)" if "women" in t else " (masculino)")
    return espn_dados._traduz_peso(nome) or nome


def buscar_ranking_ufc():
    dados = espn_dados._get(f"{CORE}/mma/leagues/ufc/rankings")
    itens = dados.get("items") or dados.get("rankings") or []
    resolvidos = _resolver([_so_ref(i) for i in itens])
    rankings = [_expandir(i, resolvidos) for i in itens]

    refs = []
    for r in rankings:
        for rk in r.get("ranks") or []:
            refs.append(_so_ref(rk.get("athlete")))
    atletas = _resolver(refs)

    categorias = []
    for r in rankings:
        lutadores = []
        for rk in r.get("ranks") or []:
            a = _expandir(rk.get("athlete"), atletas)
            posicao = rk.get("current")
            registro = rk.get("record") or {}
            lutadores.append(
                {
                    "posicao": posicao,
                    "campeao": posicao in (0, None) and not lutadores,
                    "anterior": rk.get("previous"),
                    "id": a.get("id") or (re.search(r"athletes/(\d+)", _so_ref(rk.get("athlete")) or "") or [None, None])[1],
                    "nome": a.get("displayName") or a.get("fullName") or "?",
                    "bandeira": (a.get("flag") or {}).get("href"),
                    "pais": (a.get("flag") or {}).get("alt") or a.get("citizenship"),
                    "cartel": registro.get("summary") if isinstance(registro, dict) else None,
                }
            )
        nome = r.get("name") or r.get("displayName") or r.get("shortName") or ""
        if lutadores:
            categorias.append({"nome": _nome_ranking(nome), "original": nome, "lutadores": lutadores})
    indice.registrar(
        [
            {"esporte": "ufc", "liga": "ufc", "id": l["id"], "nome": l["nome"], "descricao": f"UFC, {c['nome']}"}
            for c in categorias
            for l in c["lutadores"]
            if "peso por peso" not in c["nome"].lower()
        ]
    )
    return {"categorias": categorias}


# ---------- Histórico de lutas (UFC) ----------

def buscar_lutas(atleta_id, limite=30):
    base = f"{CORE}/mma/leagues/ufc/athletes/{atleta_id}"
    dados = espn_dados._get(f"{base}/eventlog", {"limit": 100})
    eventos = dados.get("events")
    itens = eventos.get("items") if isinstance(eventos, dict) else eventos
    itens = [i for i in (itens or dados.get("items") or []) if isinstance(i, dict) and i.get("played", True)]

    # 1ª rodada: lutas e eventos
    resolvidos = _resolver([_so_ref(i.get("competition")) for i in itens] + [_so_ref(i.get("event")) for i in itens])
    lutas = []
    for i in itens:
        comp = _expandir(i.get("competition"), resolvidos)
        evento = _expandir(i.get("event"), resolvidos)
        if comp:
            lutas.append((comp, evento))
    lutas.sort(key=lambda x: x[0].get("date") or x[1].get("date") or "", reverse=True)
    lutas = lutas[:limite]

    # 2ª rodada: adversários e resultado de cada luta
    refs = []
    for comp, _ in lutas:
        refs.append(_so_ref(comp.get("status")))
        for c in comp.get("competitors") or []:
            refs.append(_so_ref(c.get("athlete")))
            if _so_ref(c):
                refs.append(_so_ref(c))
    resolvidos2 = _resolver(refs)

    saida = []
    for comp, evento in lutas:
        competidores = [_expandir(c, resolvidos2) if _so_ref(c) else c for c in comp.get("competitors") or []]
        eu = next((c for c in competidores if str(c.get("id")) == str(atleta_id)), None)
        outro = next((c for c in competidores if c is not eu), {}) if competidores else {}
        if eu is None and competidores:
            # o id do competidor pode diferir: tenta pelo link do atleta
            eu = next((c for c in competidores if str(atleta_id) in str(_so_ref(c.get("athlete")) or "")), competidores[0])
            outro = next((c for c in competidores if c is not eu), {})
        adversario = _expandir(outro.get("athlete"), resolvidos2) if outro else {}
        status = _expandir(comp.get("status"), resolvidos2)
        resultado_obj = status.get("result") or {}
        if eu and eu.get("winner"):
            resultado = "V"
        elif outro and outro.get("winner"):
            resultado = "D"
        elif (status.get("type") or {}).get("completed"):
            resultado = "E"
        else:
            resultado = None
        metodo = resultado_obj.get("displayName") or resultado_obj.get("name") or (status.get("type") or {}).get("detail")
        saida.append(
            {
                "data": (comp.get("date") or evento.get("date") or "")[:10] or None,
                "evento": evento.get("name") or evento.get("shortName"),
                "adversario": adversario.get("displayName") or adversario.get("fullName") or "?",
                "adversario_id": outro.get("id") or adversario.get("id"),
                "resultado": resultado,
                "metodo": espn_dados._traduz_resultado(metodo) if resultado in ("V", "D") else metodo,
                "round": status.get("period"),
                "tempo": status.get("displayClock"),
            }
        )
    indice.registrar([{"esporte": "ufc", "liga": "ufc", "id": l["adversario_id"], "nome": l["adversario"], "descricao": "UFC"} for l in saida])
    cartel = {
        "vitorias": sum(1 for l in saida if l["resultado"] == "V"),
        "derrotas": sum(1 for l in saida if l["resultado"] == "D"),
        "empates": sum(1 for l in saida if l["resultado"] == "E"),
    }
    return {"tipo": "lutas", "lutas": saida, "cartel_ufc": cartel}


# ---------- Carreira de jogador de futebol (temporada por temporada) ----------

_STATS_FUTEBOL = [
    ("jogos", ("appearances", "gamesPlayed")),
    ("titular", ("starts",)),
    ("gols", ("totalGoals", "goals")),
    ("assistencias", ("goalAssists", "assists")),
    ("amarelos", ("yellowCards",)),
    ("vermelhos", ("redCards",)),
    ("defesas", ("saves",)),
    ("gols_sofridos", ("goalsConceded",)),
]


def _achatar_stats(st):
    valores = {}
    divisoes = st.get("splits") or {}
    for cat in divisoes.get("categories") or []:
        for s in cat.get("stats") or []:
            if s.get("name") and s["name"] not in valores:
                valores[s["name"]] = s.get("displayValue") if s.get("displayValue") not in (None, "") else s.get("value")
    return valores


def buscar_carreira_futebol(liga, atleta_id, limite=20):
    base = f"{CORE}/soccer/leagues/{liga}/athletes/{atleta_id}"
    dados = espn_dados._get(f"{base}/statisticslog")
    entradas = dados.get("entries") or dados.get("items") or []
    brutas = []
    for e in entradas:
        temporada_ref = _so_ref(e.get("season"))
        estatisticas = e.get("statistics") or []
        por_time = [s for s in estatisticas if s.get("type") != "total"]
        for s in por_time or estatisticas:
            st_ref = _so_ref(s.get("statistics"))
            if st_ref:
                brutas.append({"temporada": temporada_ref, "stats": st_ref, "time": _so_ref(s.get("team"))})
    brutas = brutas[: limite * 3]
    resolvidos = _resolver([b["temporada"] for b in brutas] + [b["stats"] for b in brutas] + [b["time"] for b in brutas])

    linhas = []
    for b in brutas:
        temporada = resolvidos.get(b["temporada"]) or {}
        stats = _achatar_stats(resolvidos.get(b["stats"]) or {})
        time_ = resolvidos.get(b["time"]) or {}
        m = re.search(r"/leagues/([^/?]+)/", b["stats"])
        slug = m.group(1) if m else None
        ano = temporada.get("year") or (re.search(r"/seasons/(\d{4})", b["stats"] or "") or [None, None])[1]
        linha = {
            "temporada": temporada.get("displayName") or (str(ano) if ano else "?"),
            "ano": int(ano) if str(ano or "").isdigit() else 0,
            "competicao": espn_dados.nome_da_liga(slug) if slug else None,
            "time": time_.get("displayName") or time_.get("shortDisplayName"),
            "time_logo": espn_dados._logo(time_),
        }
        for chave, nomes in _STATS_FUTEBOL:
            linha[chave] = next((stats[n] for n in nomes if n in stats), None)
        if any(linha[c] not in (None, "", "0", 0) for c, _ in _STATS_FUTEBOL):
            linhas.append(linha)
    linhas.sort(key=lambda l: (l["ano"], l["competicao"] or ""), reverse=True)
    linhas = linhas[:limite]

    def soma(campo):
        total = 0
        for l in linhas:
            try:
                total += int(float(str(l[campo]).replace(",", "")))
            except (TypeError, ValueError):
                pass
        return total

    totais = {c: soma(c) for c, _ in _STATS_FUTEBOL}
    return {"tipo": "temporadas", "temporadas": linhas, "totais": totais}


# ---------- Busca (jogadores, times e competições) ----------

_SEGMENTO_ESPORTE = {
    "soccer": "futebol",
    "futebol": "futebol",
    "football": "futebol",
    "nfl": "nfl",
    "mma": "ufc",
    "ufc": "ufc",
    "f1": "f1",
    "racing": "f1",
}
# o "uid" da ESPN começa com o id do esporte: s:600 futebol, s:20 futebol americano...
_UID_ESPORTE = {"600": "futebol", "20": "nfl", "3301": "ufc", "2000": "f1"}
_LIGA_PADRAO = {"futebol": "bra.1", "nfl": "nfl", "ufc": "ufc", "f1": "f1"}


def _esporte_do_resultado(c):
    uid = c.get("uid") or ""
    m = re.match(r"s:(\d+)", uid)
    if m and m.group(1) in _UID_ESPORTE:
        return _UID_ESPORTE[m.group(1)]
    link = ((c.get("link") or {}).get("web")) or c.get("href") or ""
    m = re.search(r"espn\.[a-z.]+/([a-z0-9-]+)/", link)
    if m and m.group(1) in _SEGMENTO_ESPORTE:
        return _SEGMENTO_ESPORTE[m.group(1)]
    texto = _sem_acento(" ".join(str(c.get(k) or "") for k in ("sport", "defaultSport", "league", "description", "subtitle")))
    for chave, valor in (("soccer", "futebol"), ("nfl", "nfl"), ("mma", "ufc"), ("ufc", "ufc"), ("formula 1", "f1"), ("f1", "f1")):
        if chave in texto:
            return valor
    return None


def _conteudos(dados):
    """A busca da ESPN agrupa por tipo; cada grupo tem 'contents' (ou 'items')."""
    for grupo in dados.get("results") or dados.get("items") or []:
        tipo = _sem_acento(grupo.get("type") or grupo.get("displayName") or "")
        for c in grupo.get("contents") or grupo.get("items") or []:
            yield tipo, c


def buscar_espn(texto, limite=12):
    """Jogadores e times de futebol, NFL, UFC e F1 pela busca da ESPN."""
    jogadores, times = [], []
    vistos = set()
    # em inglês a busca da ESPN acha mais atletas; em português, os times com nome local
    for idioma in ({"lang": "en", "region": "us"}, {"lang": "pt", "region": "br"}):
        try:
            dados = espn_dados._get("https://site.web.api.espn.com/apis/search/v2", {"query": texto, "limit": limite, **idioma})
        except espn_dados.ErroESPN:
            continue
        for tipo, c in _conteudos(dados):
            esporte = _esporte_do_resultado(c)
            if not esporte:
                continue
            uid = c.get("uid") or ""
            liga = c.get("defaultLeagueSlug") or c.get("leagueSlug") or _LIGA_PADRAO.get(esporte)
            if esporte != "futebol":
                liga = _LIGA_PADRAO.get(esporte)
            imagem = c.get("image") or {}
            item = {
                "esporte": esporte,
                "liga": liga,
                "nome": c.get("displayName") or c.get("name"),
                "descricao": c.get("subtitle") or c.get("description"),
                "imagem": imagem.get("default") if isinstance(imagem, dict) else (imagem if isinstance(imagem, str) else None),
            }
            m_atleta = re.search(r"~a:(\d+)", uid) or (re.search(r"/id/(\d+)", str((c.get("link") or {}).get("web") or "")) if tipo in ("player", "athlete") else None)
            m_time = re.search(r"~t:(\d+)", uid)
            if m_atleta and (tipo in ("player", "athlete", "") or "~a:" in uid):
                chave = ("jogador", esporte, m_atleta.group(1))
                if chave not in vistos:
                    vistos.add(chave)
                    jogadores.append({**item, "id": m_atleta.group(1)})
            elif m_time:
                chave = ("time", esporte, m_time.group(1))
                if chave not in vistos:
                    vistos.add(chave)
                    times.append({**item, "id": m_time.group(1)})
    indice.registrar([{**j} for j in jogadores] + [{**t, "tipo": "time"} for t in times])
    return {"jogadores": jogadores[:limite], "times": times[:limite]}


def semear():
    """Enche o índice da busca: times de todas as competições, elencos e ranking do UFC."""
    tarefas = []
    for esporte, cfg in espn_dados.ESPORTES.items():
        if cfg["tipo"] != "partidas":
            continue
        for l in cfg["ligas"]:
            tarefas.append(("times", esporte, l["id"]))
    tarefas.append(("ufc", None, None))
    tarefas.append(("f1", None, None))

    def times_da_liga(esporte, liga):
        cfg, _ = espn_dados.config(esporte, liga)
        dados = espn_dados._get(f"https://site.api.espn.com/apis/site/v2/sports/{cfg['esporte']}/{liga}/teams", {"limit": 500})
        achados = []
        for sp in dados.get("sports") or []:
            for lg in sp.get("leagues") or []:
                for t in lg.get("teams") or []:
                    time_ = t.get("team") or t
                    achados.append(
                        {"tipo": "time", "esporte": esporte, "liga": liga, "id": time_.get("id"), "nome": time_.get("displayName"), "descricao": espn_dados.nome_da_liga(liga), "imagem": espn_dados._logo(time_)}
                    )
        indice.registrar(achados)
        return achados

    def rodar(tarefa):
        tipo, esporte, liga = tarefa
        try:
            if tipo == "times":
                achados = times_da_liga(esporte, liga)
                # elencos completos das ligas mais procuradas
                if liga in ("nfl", "bra.1", "eng.1"):
                    for t in achados:
                        try:
                            espn_dados.buscar_elenco(esporte, liga, t["id"])
                        except Exception:
                            pass
            elif tipo == "ufc":
                buscar_ranking_ufc()
            elif tipo == "f1":
                espn_dados.buscar_classificacao("f1", "f1")
        except Exception:
            pass

    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(rodar, tarefas))


_APELIDOS = {
    "bra.1": ["brasileirao", "serie a brasil", "campeonato brasileiro"],
    "bra.2": ["serie b"],
    "bra.copa_do_brazil": ["copa do brasil"],
    "conmebol.libertadores": ["libertadores"],
    "conmebol.sudamericana": ["sul-americana", "sulamericana", "sudamericana"],
    "uefa.champions": ["champions", "liga dos campeoes"],
    "uefa.europa": ["liga europa", "europa league"],
    "eng.1": ["premier league", "inglaterra", "campeonato ingles"],
    "esp.1": ["la liga", "laliga", "espanha", "campeonato espanhol"],
    "ita.1": ["serie a", "italia", "calcio", "campeonato italiano"],
    "ger.1": ["bundesliga", "alemanha", "campeonato alemao"],
    "fra.1": ["ligue 1", "franca", "campeonato frances"],
    "por.1": ["liga portugal", "portugal", "campeonato portugues"],
    "usa.1": ["mls", "estados unidos"],
    "fifa.world": ["copa do mundo", "mundial"],
    "conmebol.america": ["copa america"],
    "uefa.euro": ["eurocopa", "euro"],
    "uefa.nations": ["liga das nacoes", "nations league"],
    "fifa.friendly": ["amistosos", "selecoes"],
}


def procurar_ligas(texto, extras=()):
    """Competições configuradas no app cujo nome (ou apelido) contém o texto."""
    alvo = _sem_acento(texto)
    if len(alvo) < 2:
        return []
    achadas = []
    candidatas = list(extras)
    for esp_id, cfg in espn_dados.ESPORTES.items():
        for l in cfg["ligas"]:
            candidatas.append({"esporte": esp_id, "liga": l["id"], "nome": l["nome"], "tipo_esporte": cfg["tipo"]})
    for c in candidatas:
        nomes = [c["nome"], *_APELIDOS.get(c["liga"], [])]
        if any(alvo in _sem_acento(n) for n in nomes):
            achadas.append(c)
    return achadas


# ---------- Últimos campeões (arquivo campeoes.json) ----------

def campeoes():
    try:
        return json.loads(ARQUIVO_CAMPEOES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
