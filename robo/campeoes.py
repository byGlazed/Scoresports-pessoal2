"""Campeões novos pela ESPN, para o campeoes.json.

Quando a temporada de uma competição termina (pela data de fim que a ESPN dá), o campeão é:
- nos pontos corridos, o 1º da classificação final;
- nas copas e nas ligas com final (NBA, NFL, MLB, NHL, MLS...), o vencedor do último jogo;
  numa final de ida e volta, quem a nota do jogo diz que levou (agregado ou pênaltis);
- na F1, o líder do mundial de pilotos (e o de construtores no "extra").

Só acrescenta a temporada se ela ainda não está no arquivo. Na dúvida, não escreve.

    python -m robo.campeoes --seco   # mostra o que mudaria, sem gravar
"""

import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from robo.rede import aviso, pegar_json

SITE = "https://site.api.espn.com/apis/site/v2/sports"
CLASS = "https://site.api.espn.com/apis/v2/sports"
CORE = "https://sports.core.api.espn.com/v2/sports"
IDIOMA = "lang=pt&region=br"
ARQUIVO = Path(__file__).resolve().parent.parent / "campeoes.json"

PONTOS = ["bra.1", "bra.2", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "por.1", "ned.1"]
FINAL = [
    "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana", "uefa.champions", "uefa.europa", "usa.1",
    "esp.copa_del_rey", "esp.super_cup", "eng.fa", "eng.league_cup", "eng.charity", "ger.dfb_pokal", "ger.super_cup",
    "ita.coppa_italia", "ita.super_cup", "fra.coupe_de_france", "fra.super_cup", "por.taca.portugal", "ned.cup",
    "bra.supercopa_do_brazil", "conmebol.recopa", "uefa.super_cup", "fifa.cwc", "uefa.nations", "fifa.world",
    "conmebol.america", "uefa.euro",
]
# competições do app que não têm um campeão (amistosos e eliminatórias)
SEM_CAMPEAO = {"fifa.friendly", "fifa.worldq.conmebol", "fifa.worldq.uefa"}

COMPETICOES = (
    [{"chave": f"futebol:{l}", "esporte": "soccer", "liga": l, "tipo": "pontos"} for l in PONTOS]
    + [{"chave": f"futebol:{l}", "esporte": "soccer", "liga": l, "tipo": "final"} for l in FINAL]
    + [
        {"chave": "nba", "esporte": "basketball", "liga": "nba", "tipo": "final"},
        {"chave": "nfl", "esporte": "football", "liga": "nfl", "tipo": "final"},
        {"chave": "mlb", "esporte": "baseball", "liga": "mlb", "tipo": "final"},
        {"chave": "nhl", "esporte": "hockey", "liga": "nhl", "tipo": "final"},
        {"chave": "f1", "esporte": "racing", "liga": "f1", "tipo": "f1"},
    ]
)

ROMANOS = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def romano(n):
    saida = ""
    for valor, letras in ROMANOS:
        while n >= valor:
            saida += letras
            n -= valor
    return saida


def rotulo_temporada(display_name, chave):
    """'2025-26' ou '2025', no formato do campeoes.json; a NFL leva o número do Super Bowl."""
    m = re.match(r"\s*(\d{4})(-\d{2})?", display_name or "")
    if not m:
        return None
    rotulo = m.group(1) + (m.group(2) or "")
    if chave == "nfl":
        rotulo += f" (Super Bowl {romano(int(m.group(1)) - 1965)})"
    return rotulo


def _data(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).date() if iso else None


def temporada_encerrada(temporada, hoje):
    fim = _data(temporada.get("endDate"))
    return bool(fim) and fim < hoje


def _entradas(no):
    """Todas as listas de classificação (a raiz e os filhos)."""
    saida = []
    if (no.get("standings") or {}).get("entries"):
        saida.append((no.get("name"), no["standings"]["entries"]))
    for filho in no.get("children") or []:
        saida.extend(_entradas(filho))
    return saida


def _rank(entrada):
    for s in entrada.get("stats") or []:
        if s.get("name") == "rank" and s.get("value") is not None:
            return s["value"]
    return None


def _primeiro(entradas):
    com_rank = [e for e in entradas if _rank(e) is not None]
    if not com_rank:
        return None
    primeiro = min(com_rank, key=_rank)
    return primeiro if _rank(primeiro) == 1 else None


def campeao_pontos(classificacao):
    grupos = _entradas(classificacao or {})
    if len(grupos) != 1:  # mais de um grupo (conferências, fases): não dá para dizer quem é o campeão
        return None
    primeiro = _primeiro(grupos[0][1])
    nome = ((primeiro or {}).get("team") or {}).get("displayName")
    return {"campeao": nome} if nome else None


def _quando(evento):
    try:
        return datetime.fromisoformat((evento.get("date") or "").replace("Z", "+00:00"))
    except ValueError:
        return None


def campeao_final(eventos):
    encerrados = [e for e in eventos if ((e.get("competitions") or [{}])[0].get("status") or {}).get("type", {}).get("state") == "post"]
    if not encerrados:
        return None
    ultimo_evento = sorted(encerrados, key=lambda e: e.get("date", ""))[-1]
    # uma final é jogada sozinha: outro jogo da competição nas 12 horas antes dela é sinal de
    # fim de fase de grupos (vários jogos ao mesmo tempo), e aí não há campeão para escrever
    quando = _quando(ultimo_evento)
    if quando is None:
        return None
    for e in eventos:
        outro = _quando(e)
        if e is not ultimo_evento and outro and quando - timedelta(hours=12) < outro <= quando:
            return None
    ultimo = ultimo_evento["competitions"][0]
    times = [((c.get("team") or {}).get("displayName"), bool(c.get("winner"))) for c in ultimo.get("competitors") or []]
    if len(times) != 2 or not all(n for n, _ in times):
        return None
    notas = " ".join(n.get("headline") or "" for n in ultimo.get("notes") or [])
    citados = [n for n, _ in times if n in notas]
    if len(citados) == 1:  # a nota diz quem levou (agregado, pênaltis)
        campeao = citados[0]
    else:
        vencedores = [n for n, venceu in times if venceu]
        if len(vencedores) != 1:
            return None
        campeao = vencedores[0]
    vice = [n for n, _ in times if n != campeao][0]
    return {"campeao": campeao, "vice": vice}


def campeao_f1(classificacao):
    pilotos = construtores = None
    for nome, entradas in _entradas(classificacao or {}):
        primeiro = _primeiro(entradas)
        if not primeiro:
            continue
        if primeiro.get("athlete"):
            pilotos = primeiro["athlete"].get("displayName")
        elif primeiro.get("team") and "onstrut" in (nome or ""):
            construtores = primeiro["team"].get("displayName")
    if not pilotos:
        return None
    item = {"campeao": pilotos}
    if construtores:
        item["extra"] = f"Construtores: {construtores}"
    return item


def ja_tem(lista, rotulo):
    """A temporada já está na lista? "2024" e "2024-25" contam como a mesma (começam no mesmo ano)."""
    ano = rotulo[:4]
    return any(x.get("temporada") == rotulo or (x.get("temporada") or "")[:4] == ano for x in lista)


def juntar(arquivo, chave, item):
    """Põe o campeão no topo da lista da competição. Não mexe se a temporada já está lá."""
    lista = arquivo.setdefault(chave, [])
    if ja_tem(lista, item["temporada"]):
        return False
    lista.insert(0, item)
    return True


def _com_idioma(url):
    base = url.split("?")[0].replace("http://", "https://")
    return f"{base}?{IDIOMA}"


def _ultima_temporada_encerrada(comp, hoje, buscar):
    lista = buscar(f"{CORE}/{comp['esporte']}/leagues/{comp['liga']}/seasons?limit=4&{IDIOMA}")
    for ref in (lista or {}).get("items") or []:
        temporada = buscar(_com_idioma(ref.get("$ref", "")))
        if temporada and temporada_encerrada(temporada, hoje):
            return temporada
    return None


def _meses_para_tras(fim, quantos):
    ano, mes = fim.year, fim.month
    for _ in range(quantos):
        yield f"{ano}{mes:02d}"
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12


def _jogos_do_fim(comp, temporada, buscar):
    """Os jogos encerrados do último mês da temporada que teve jogo (até 6 meses para trás)."""
    inicio, fim = _data(temporada.get("startDate")), _data(temporada.get("endDate"))
    for mes in _meses_para_tras(fim, 6):
        dados = buscar(f"{SITE}/{comp['esporte']}/{comp['liga']}/scoreboard?dates={mes}&limit=1000&{IDIOMA}")
        if dados is None:
            return None
        eventos = [e for e in dados.get("events") or [] if inicio <= (_data(e.get("date")) or inicio) <= fim]
        if any(((e.get("competitions") or [{}])[0].get("status") or {}).get("type", {}).get("state") == "post" for e in eventos):
            return eventos
    return None


def atualizar(arquivo, hoje, buscar=pegar_json):
    """Acrescenta os campeões que faltam. Devolve a lista de mudanças (vazia se nada mudou)."""
    mudancas = []
    for comp in COMPETICOES:
        try:
            temporada = _ultima_temporada_encerrada(comp, hoje, buscar)
            if not temporada:
                continue
            rotulo = rotulo_temporada(temporada.get("displayName"), comp["chave"])
            if not rotulo or ja_tem(arquivo.get(comp["chave"], []), rotulo):
                continue
            if comp["tipo"] == "pontos":
                achado = campeao_pontos(buscar(f"{CLASS}/{comp['esporte']}/{comp['liga']}/standings?season={temporada.get('year')}&{IDIOMA}"))
            elif comp["tipo"] == "f1":
                achado = campeao_f1(buscar(f"{CLASS}/racing/f1/standings?season={temporada.get('year')}&{IDIOMA}"))
            else:
                eventos = _jogos_do_fim(comp, temporada, buscar)
                achado = campeao_final(eventos) if eventos else None
            if not achado:
                continue
            item = {"temporada": rotulo, **achado}
            if juntar(arquivo, comp["chave"], item):
                mudancas.append(f"campeões {comp['chave']} {rotulo}: {item['campeao']}")
        except Exception as erro:  # uma competição com dado estranho não derruba as outras
            aviso(f"campeões {comp['chave']}: {erro}")
    return mudancas


def main():
    seco = "--seco" in sys.argv
    arquivo = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    mudancas = atualizar(arquivo, date.today())
    for m in mudancas:
        print(m)
    if not mudancas:
        print("campeões: nada novo")
    elif not seco:
        ARQUIVO.write_text(json.dumps(arquivo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
