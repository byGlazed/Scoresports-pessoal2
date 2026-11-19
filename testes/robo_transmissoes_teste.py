"""Testes do robô dos canais (robo/transmissoes.py), com páginas reais do guia de TV meuguia.tv
(ESPN 2, SporTV e Globo, pegas em 19/11/2026) e os jogos do dia da ESPN guardados em testes/amostras/.

    python -m unittest discover -s testes -p "*_teste.py"
"""

import copy
import json
import sys
import unittest
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robo import transmissoes as T  # noqa: E402

AMOSTRAS = RAIZ / "testes" / "amostras"
HOJE = date(2026, 11, 19)


def guia(codigo):
    return (AMOSTRAS / f"guiatv_{codigo}.html").read_text(encoding="utf-8")


def espn(nome):
    return json.loads((AMOSTRAS / f"guiatv_espn_{nome}_20261119.json").read_text(encoding="utf-8"))


class TesteLeituraDoGuia(unittest.TestCase):
    def test_dias_e_programas(self):
        programas = T.ler_guia(guia("ES2"), HOJE)
        nhl = [p for p in programas if p["titulo"].startswith("NHL: Edmonton Oilers x Tampa Bay Lightning")]
        self.assertEqual(nhl[0]["data"], "2026-11-19")
        self.assertEqual(nhl[0]["hora"], "21:30")
        self.assertEqual(nhl[0]["categoria"], "Esporte/Hóquei")
        nba = [p for p in programas if "Portland Trail Blazers x New York Knicks - Ao Vivo" in p["titulo"]]
        self.assertEqual(nba[0]["data"], "2026-11-21")
        # a virada do mês ("terça-feira, 1/12") cai em dezembro do mesmo ano
        self.assertTrue(any(p["data"] == "2026-12-01" for p in programas))

    def test_virada_do_ano(self):
        self.assertEqual(T.data_do_dia("quinta-feira, 2/1", date(2026, 12, 30)), "2027-01-02")
        self.assertEqual(T.data_do_dia("quarta-feira, 30/12", date(2026, 12, 30)), "2026-12-30")


class TesteProgramaAoVivo(unittest.TestCase):
    def prog(self, titulo, categoria):
        return T.jogo_do_programa({"data": "2026-11-19", "hora": "21:30", "titulo": titulo, "categoria": categoria})

    def test_esportes_com_prefixo(self):
        j = self.prog("NBA: Portland Trail Blazers x New York Knicks - Ao Vivo", "Esporte/Basquete")
        self.assertEqual((j["esporte"], j["times"]), ("nba", ["Portland Trail Blazers", "New York Knicks"]))
        self.assertEqual(self.prog("NFL: Las Vegas Raiders x Denver Broncos - Ao Vivo", "Esporte/Futebol Americano")["esporte"], "nfl")
        self.assertEqual(self.prog("NHL: Edmonton Oilers x Tampa Bay Lightning - Ao Vivo", "Esporte/Hóquei")["esporte"], "nhl")

    def test_futebol_pela_categoria(self):
        j = self.prog("Vasco x Internacional - Ao Vivo", "Esporte/Futebol")
        self.assertEqual((j["esporte"], j["times"]), ("futebol", ["Vasco", "Internacional"]))
        j = self.prog("Copa do Brasil: Vasco x Internacional - Ao Vivo", "Esporte/Futebol")
        self.assertEqual(j["times"], ["Vasco", "Internacional"])

    def test_o_que_nao_e_jogo_do_app(self):
        for titulo, categoria in [
            ("VT - NBA: Milwaukee Bucks x Miami Heat", "Esporte/Basquete"),
            ("Pré-Jogo - Athletico-PR x Remo - Ao Vivo", "Esporte/Futebol"),
            ("NBA - Ao Vivo", "Esporte/Diversos"),
            ("Rugby Nations Championship: Irlanda x África do Sul - Ao Vivo", "Esporte/Rugby"),
            ("Futebol Americano Universitário: Clemson x Duke - Ao Vivo", "Esporte/Futebol Americano"),
            ("Tênis: Nitto ATP Finals - Ao Vivo", "Esporte/Tênis"),
            ("Vasco x Internacional", "Esporte/Futebol"),  # sem "Ao Vivo"
        ]:
            self.assertIsNone(self.prog(titulo, categoria), titulo)


class TesteCruzamento(unittest.TestCase):
    def test_acha_o_jogo_da_espn(self):
        eventos = T.eventos_espn(espn("bra1"))
        j = T.jogo_do_programa({"data": "2026-11-19", "hora": "19:30", "titulo": "Vasco x Internacional - Ao Vivo", "categoria": "Esporte/Futebol"})
        achado = T.casar(j, eventos)
        self.assertIsNotNone(achado)
        self.assertEqual(achado["data"], "2026-11-19")
        self.assertEqual(sorted(achado["times"]), sorted(["Vasco da Gama", "Internacional"]))

    def test_hora_longe_ou_time_errado_nao_casa(self):
        eventos = T.eventos_espn(espn("bra1"))
        longe = T.jogo_do_programa({"data": "2026-11-19", "hora": "13:00", "titulo": "Vasco x Internacional - Ao Vivo", "categoria": "Esporte/Futebol"})
        self.assertIsNone(T.casar(longe, eventos))
        errado = T.jogo_do_programa({"data": "2026-11-19", "hora": "19:30", "titulo": "Vasco x Grêmio - Ao Vivo", "categoria": "Esporte/Futebol"})
        self.assertIsNone(T.casar(errado, eventos))

    def test_nba_usa_as_siglas(self):
        eventos = T.eventos_espn(espn("nba"))
        j = T.jogo_do_programa({"data": "2026-11-19", "hora": "22:00", "titulo": "NBA: Portland Trail Blazers x Milwaukee Bucks - Ao Vivo", "categoria": "Esporte/Basquete"})
        achado = T.casar(j, eventos)
        self.assertEqual(sorted(achado["times"]), ["MIL", "POR"])

    def test_nome_do_time(self):
        self.assertTrue(T.mesmo_time("Vasco", ["Vasco da Gama", "Vasco", "VAS"]))
        self.assertTrue(T.mesmo_time("São Paulo", ["São Paulo", "SAO"]))
        self.assertTrue(T.mesmo_time("Athletico-PR", ["Athletico-PR", "Athletico Paranaense"]))
        self.assertFalse(T.mesmo_time("Atlético-MG", ["Athletico-PR", "Athletico Paranaense"]))
        self.assertFalse(T.mesmo_time("Inter", ["Internacional"]))  # curto demais para "estar contido"


class TesteAtualizar(unittest.TestCase):
    def setUp(self):
        self.paginas = {c: guia(c) for c in ("ES2", "SPO", "GRD")}

        def pegar_texto(url):
            if url.endswith("/robots.txt"):
                return "<!DOCTYPE html><html>página inicial</html>"
            codigo = url.rsplit("/", 1)[-1]
            return self.paginas.get(codigo)

        def pegar_json(url):
            if "dates=20261119" not in url:
                return {"events": []}
            if "basketball/nba" in url:
                return espn("nba")
            if "soccer/" in url:
                return espn("bra1")
            return {"events": []}

        self.pegar_texto = pegar_texto
        self.pegar_json = pegar_json
        self.manual = {"esporte": "futebol", "data": "2026-11-19", "times": ["Vasco", "Internacional"], "canais": ["Premiere"], "conferido_em": "2026-11-18", "fonte": "grade do Premiere"}
        self.velho = {"esporte": "nba", "data": "2026-11-10", "times": ["PHI", "BOS"], "canais": ["ESPN 2"], "conferido_em": "2026-11-10", "fonte": T.FONTE}
        self.arquivo = {"padroes": {}, "jogos": [copy.deepcopy(self.manual), copy.deepcopy(self.velho)]}

    def rodar(self):
        return T.atualizar(self.arquivo, HOJE, pegar_texto=self.pegar_texto, pegar_json=self.pegar_json, canais={"ES2": "ESPN 2", "SPO": "SporTV", "GRD": "Globo"}, dias=1)

    def test_grava_sem_mexer_no_que_e_a_mao(self):
        mudancas = self.rodar()
        self.assertTrue(mudancas)
        jogos = self.arquivo["jogos"]
        self.assertIn(self.manual, jogos)  # intocado (e o Vasco x Inter, que já tem item à mão, não ganha outro)
        do_robo = [j for j in jogos if j.get("fonte") == T.FONTE]
        sp = [j for j in do_robo if "São Paulo" in j["times"]]
        self.assertEqual(len(sp), 1)
        self.assertEqual(sp[0]["canais"], ["Globo"])
        self.assertEqual(sp[0]["data"], "2026-11-19")
        self.assertEqual(sp[0]["conferido_em"], "2026-11-19")
        self.assertFalse(any("Vasco da Gama" in j["times"] for j in do_robo))
        # o item velho do próprio robô (mais de 3 dias) saiu
        self.assertNotIn(self.velho, jogos)

    def test_segunda_rodada_nao_muda_nada(self):
        self.rodar()
        antes = copy.deepcopy(self.arquivo)
        self.assertEqual(self.rodar(), [])
        self.assertEqual(self.arquivo, antes)

    def test_canal_da_espn_ganha_disney_e_nba_ganha_league_pass(self):
        self.assertEqual(T.canais_do_jogo("nba", ["ESPN 2"]), ["ESPN 2", "Disney+ Premium", "NBA League Pass"])
        self.assertEqual(T.canais_do_jogo("futebol", ["Globo", "SporTV"]), ["Globo", "SporTV"])
        self.assertEqual(T.canais_do_jogo("nfl", ["ESPN", "ESPN 2"]), ["ESPN", "ESPN 2", "Disney+ Premium"])

    def test_guia_fora_do_ar_nao_muda_nada(self):
        self.pegar_texto = lambda url: None
        antes = copy.deepcopy(self.arquivo)
        self.assertEqual(T.atualizar(self.arquivo, HOJE, pegar_texto=self.pegar_texto, pegar_json=self.pegar_json, canais={"ES2": "ESPN 2"}, dias=1), [])
        self.assertEqual(self.arquivo, antes)


class TesteRobots(unittest.TestCase):
    def test_robots(self):
        self.assertTrue(T.permitido("<!DOCTYPE html><html></html>", "/programacao/canal/ES2"))
        self.assertTrue(T.permitido("User-agent: *\nDisallow: /*/pesquisar", "/programacao/canal/ES2"))
        self.assertFalse(T.permitido("User-agent: *\nDisallow: /programacao", "/programacao/canal/ES2"))
        self.assertTrue(T.permitido(None, "/programacao/canal/ES2"))


if __name__ == "__main__":
    unittest.main()
