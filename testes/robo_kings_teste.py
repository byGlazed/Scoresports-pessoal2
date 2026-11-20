"""Testes do robô da Kings League (robo/kings.py): o payload do Nuxt (no mesmo formato da página do
kingsleague.pro, montado aqui) e o que vai para kings.json.

    python -m unittest discover -s testes -p "*_teste.py"
"""

import json
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robo import kings as K  # noqa: E402


def achatar(valor):
    """Monta o payload como o Nuxt faz: uma lista, e cada objeto aponta para os valores pelo índice."""
    lista = []

    def guardar(v):
        i = len(lista)
        lista.append(None)
        if isinstance(v, dict):
            lista[i] = {k: guardar(x) for k, x in v.items()}
        elif isinstance(v, list):
            lista[i] = [guardar(x) for x in v]
        else:
            lista[i] = v
        return i

    raiz = guardar(valor)
    # como na página: a raiz embrulhada num "ShallowReactive"
    lista.append(["ShallowReactive", raiz])
    lista.insert(0, lista.pop())
    # os índices andaram uma casa
    def mover(v):
        if isinstance(v, dict):
            return {k: x + 1 for k, x in v.items()}
        if isinstance(v, list) and not (v and isinstance(v[0], str) and v[0] == "ShallowReactive"):
            return [x + 1 for x in v]
        if isinstance(v, list):
            return [v[0], v[1] + 1]
        return v
    return [mover(v) for v in lista]


JOGO = {
    "id": 2851, "date": "2026-10-19T20:00:00.000Z", "status": "ended", "currentMinute": 39, "groupName": "A",
    "participants": {"homeTeamId": 164, "awayTeamId": 163},
    "scores": {"homeScore": 10, "awayScore": 3, "homeScore1T": 3, "awayScore1T": 0, "homeScore2T": 7, "awayScore2T": 3, "homeScoreP": None, "awayScoreP": None},
    "metaInformation": {"youtube_url": "https://www.youtube.com/watch?v=gUFs6nxE7p0"},
}
FUTURO = {
    "id": 2890, "date": "2026-11-23T21:00:00.000Z", "status": None, "currentMinute": None, "groupName": "Playoffs",
    "participants": {"homeTeamId": 164, "awayTeamId": 168}, "scores": {}, "metaInformation": {},
}
PAGINA = {
    "data": {"$fturnos": [{"id": 681, "turnName": "Matchday 1", "matches": [JOGO]}, {"id": 699, "turnName": "Quarter-Finals", "matches": [FUTURO]}]},
    "pinia": {"competitionStore": {
        "currentSeason": {"name": "Kings Cup Brazil 2026/27", "start": "2026-10-14T00:00:00.000Z", "finish": "2026-12-29T00:00:00.000Z", "finished": False,
                          "competition": {"image": {"url": "https://cdn/kl.png"}}},
        "currentSeasonTeams": [
            {"id": 164, "name": "Podpah Funkbol Clube", "shortName": "FNK", "logo": {"url": "https://cdn/fnk.png"}},
            {"id": 163, "name": "Nyvelados FC", "shortName": "NYV", "logo": {"url": "https://cdn/nyv.png"}},
            {"id": 168, "name": "DesimpaiN", "shortName": "DEP", "logo": None},
        ],
    }},
}


def html_da_pagina(pagina=PAGINA):
    return f'<html><body><script type="application/json" id="__NUXT_DATA__" data-ssr="true">{json.dumps(achatar(pagina))}</script></body></html>'


class TesteKings(unittest.TestCase):
    def test_decodifica_o_payload(self):
        self.assertEqual(K.decodificar(html_da_pagina()), PAGINA)
        self.assertIsNone(K.decodificar("<html>sem payload</html>"))

    def test_extrai_times_e_jogos(self):
        d = K.extrair(PAGINA)
        self.assertEqual(d["temporada"], "Kings Cup Brazil 2026/27")
        self.assertFalse(d["encerrada"])
        self.assertEqual(d["logo"], "https://cdn/kl.png")
        self.assertEqual(d["times"]["164"], {"nome": "Podpah Funkbol Clube", "sigla": "FNK", "logo": "https://cdn/fnk.png"})
        j = d["jogos"][0]
        self.assertEqual((j["id"], j["rodada"], j["grupo"], j["status"], j["casa"], j["fora"]), (2851, "Matchday 1", "A", "ended", "164", "163"))
        self.assertEqual(j["placar"], [10, 3])
        self.assertEqual(j["tempos"], [[3, 0], [7, 3]])
        self.assertIsNone(j["penaltis"])
        self.assertEqual(j["video"], "https://www.youtube.com/watch?v=gUFs6nxE7p0")
        futuro = d["jogos"][1]
        self.assertIsNone(futuro["placar"])
        self.assertEqual(futuro["tempos"], [])

    def test_atualizar(self):
        def pegar_texto(url):
            if url.endswith("/robots.txt"):
                return "User-agent: *\nDisallow: */jogos/\nDisallow: */matches/"
            return html_da_pagina() if url.endswith("/pt/brazil") else None

        arquivo = {}
        mudancas = K.atualizar(arquivo, pegar_texto=pegar_texto, competicoes={"brazil": "Kings League Brasil", "world-cup": "Kings World Cup"})
        self.assertEqual(len(mudancas), 1)  # o Mundial não veio: fica de fora, sem erro
        self.assertEqual(arquivo["competicoes"]["brazil"]["nome"], "Kings League Brasil")
        self.assertNotIn("world-cup", arquivo["competicoes"])
        # de novo, sem nada novo
        self.assertEqual(K.atualizar(arquivo, pegar_texto=pegar_texto, competicoes={"brazil": "Kings League Brasil"}), [])

    def test_robots_que_proibe_a_pagina(self):
        arquivo = {}
        K.atualizar(arquivo, pegar_texto=lambda url: "User-agent: *\nDisallow: /pt/" if url.endswith("robots.txt") else html_da_pagina(),
                    competicoes={"brazil": "Kings League Brasil"})
        self.assertEqual(arquivo["competicoes"], {})


if __name__ == "__main__":
    unittest.main()


ESTATISTICAS = {"data": {
    "$fgol": [
        {"id": "KL_GOL_69_161_86914", "parameterCode": "GOL", "total": 11, "matchesPlayed": 5, "ranking": 1,
         "team": {"id": 161}, "player": {"id": 86914, "shortName": "Lucas 'L7'", "displayName": "L SETE", "image": {"url": "https://cdn/l7.png"}}},
        {"id": "KL_GOL_69_50_33932", "parameterCode": "GOL", "total": 9, "matchesPlayed": 5, "ranking": 2,
         "team": {"id": 50}, "player": {"id": 33932, "shortName": "Leleti Garcia", "displayName": "LELETI", "image": None}},
    ],
    "$fass": [{"id": "KL_ASS-V_69_50_33918", "parameterCode": "ASS-V", "total": 5, "matchesPlayed": 5, "ranking": 1,
               "team": {"id": 50}, "player": {"id": 33918, "shortName": "Fulano", "image": {"url": "https://cdn/f.png"}}}],
    "$foutro": [{"playerId": 68215, "rankingData": []}],
}}


class TesteDestaques(unittest.TestCase):
    def test_os_3_primeiros_de_cada_estatistica(self):
        d = K.destaques(ESTATISTICAS)
        self.assertEqual([c["nome"] for c in d], ["Gols", "Assistências"])
        gols = d[0]["lideres"]
        self.assertEqual(gols[0], {"nome": "Lucas 'L7'", "foto": "https://cdn/l7.png", "time": "161", "total": 11, "jogos": 5})
        self.assertIsNone(gols[1]["foto"])
        self.assertEqual(K.destaques({"data": {}}), [])

    def test_atualizar_le_tambem_as_estatisticas(self):
        def pegar_texto(url):
            if url.endswith("/robots.txt"):
                return "User-agent: *\nDisallow: */jogos/"
            if url.endswith("/pt/brazil"):
                return html_da_pagina()
            if url.endswith("/pt/brazil/estatisticas"):
                return html_da_pagina(ESTATISTICAS)
            return None

        arquivo = {}
        K.atualizar(arquivo, pegar_texto=pegar_texto, competicoes={"brazil": "Kings League Brasil"})
        self.assertEqual(arquivo["competicoes"]["brazil"]["destaques"][0]["lideres"][0]["total"], 11)


class TesteGolsDaWikipedia(unittest.TestCase):
    """Os autores dos gols dos Mundiais pelas súmulas da Wikipédia em inglês (amostra real do artigo
    "2026 Kings World Cup Clubs", CC BY-SA)."""

    def setUp(self):
        self.texto = (RAIZ / "testes" / "amostras" / "wikipedia_kwc_clubs_2026.txt").read_text(encoding="utf-8")

    def test_le_as_sumulas(self):
        s = K.sumulas(self.texto)
        self.assertEqual([x["id"] for x in s], [2699, 2701, 2714])  # o número do jogo no link oficial
        primeira = s[0]
        self.assertEqual(primeira["times"], ["Alpak FC", "No Rules FC"])
        gols_casa = primeira["gols"][0]
        self.assertEqual([(g["nome"], g["minuto"]) for g in gols_casa][:3], [("Gilli", 1), ("Gilli", 3), ("Martín", 4)])
        self.assertEqual(next(g for g in gols_casa if g["nome"] == "Frenezy")["tipo"], "pp")  # pênalti do presidente
        self.assertEqual(next(g for g in gols_casa if g["nome"] == "Marin")["tipo"], "p")  # o link [[Vlad Marin|Marin]]
        fora = primeira["gols"][1]
        self.assertEqual([(g["nome"], g["minuto"], g["tipo"]) for g in fora], [("Günay", 20, "x2"), ("Costa", 22, None), ("Imsak", 25, "x2")])  # o cartão fica de fora
        # três gols do mesmo jogador num template só
        self.assertEqual([g["minuto"] for g in s[1]["gols"][1] if g["nome"] == "Diop"], [2, 22, 22])
        # os pênaltis da disputa (Shootouts) não entram como gol
        self.assertNotIn("Baton", [g["nome"] for g in s[2]["gols"][1]])

    def test_junta_os_gols_nos_jogos_pelo_numero_e_pelo_lado(self):
        comp = {"times": {"1": {"nome": "No Rules FC"}, "2": {"nome": "Alpak FC"}},
                "jogos": [{"id": 2699, "casa": "2", "fora": "1"}, {"id": 1, "casa": "1", "fora": "2"}]}
        K.juntar_gols(comp, K.sumulas(self.texto))
        gols = comp["jogos"][0]["gols"]
        self.assertEqual(gols[0], {"lado": 0, "nome": "Gilli", "minuto": 1, "tipo": None})
        self.assertIn({"lado": 1, "nome": "Günay", "minuto": 20, "tipo": "x2"}, gols)
        self.assertEqual([g["minuto"] for g in gols], sorted(g["minuto"] for g in gols))  # na ordem do jogo
        self.assertNotIn("gols", comp["jogos"][1])  # sem súmula: nada


class TesteOutroFormatoDeSumula(unittest.TestCase):
    def test_football_box_com_espacos_e_pen(self):
        texto = """{{football box
| date = 3 January 2026
| score = 3–3
| report = https://kingsleague.pro/en/kwc-nations/matches/2205-chi-vs-ned
| team1 = Chile {{flagdeco|CHI}}
| goals1 = M. Herrera {{goal|2}} <br> [[Ignacio Herrera|N. Herrera]] {{goal|31|pen.}}
| team2 = {{flagdeco|NED}} Netherlands
| goals2 = Chatmo {{goal|24|{{abbr|pp|President's penalty}}}}
|penalties1 = Araya {{pengoal}}
}}"""
        s = K.sumulas(texto)
        self.assertEqual(s[0]["id"], 2205)
        self.assertEqual(s[0]["times"], ["Chile", "Netherlands"])
        self.assertEqual(s[0]["gols"][0], [{"nome": "M. Herrera", "minuto": 2, "tipo": None}, {"nome": "N. Herrera", "minuto": 31, "tipo": "p"}])
        self.assertEqual(s[0]["gols"][1][0]["tipo"], "pp")
