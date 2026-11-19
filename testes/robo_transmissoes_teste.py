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
        # a lista do dia do futebolnatv: vazia aqui (os testes dela ficam em TesteFutebolNaTV)
        self.paginas.update({"jogos-hoje": "<html></html>", "jogos-amanha": "<html></html>"})

        def pegar_texto(url):
            if url.endswith("/robots.txt"):
                return "<!DOCTYPE html><html>página inicial</html>"
            codigo = url.rstrip("/").rsplit("/", 1)[-1]
            if codigo in self.paginas:
                return self.paginas[codigo]
            # páginas das ligas do futebolnatv e lista do mês da NBA: vazias, a não ser que o teste mude
            if "/liga/" in url or "gameoverdrive" in url:
                return "<html></html>"
            return None

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


class TesteRevisao(unittest.TestCase):
    """Correções da revisão final da parte I."""

    def setUp(self):
        base = TesteAtualizar()
        base.setUp()
        self.pegar_texto, self.pegar_json = base.pegar_texto, base.pegar_json
        self.canais = {"ES2": "ESPN 2", "SPO": "SporTV", "GRD": "Globo"}

    def rodar(self, arquivo, pegar_texto=None):
        return T.atualizar(arquivo, HOJE, pegar_texto=pegar_texto or self.pegar_texto, pegar_json=self.pegar_json, canais=self.canais, dias=1)

    def test_grade_que_mudou_sai_quando_todas_as_paginas_vieram(self):
        sumiu = {"esporte": "nba", "data": "2026-11-19", "times": ["LAL", "BOS"], "canais": ["ESPN 2"], "conferido_em": "2026-11-18", "fonte": T.FONTE}
        arquivo = {"jogos": [dict(sumiu)]}
        self.rodar(arquivo)
        self.assertNotIn(sumiu, arquivo["jogos"])

    def test_pagina_que_falhou_so_acrescenta(self):
        sumiu = {"esporte": "nba", "data": "2026-11-19", "times": ["LAL", "BOS"], "canais": ["ESPN 2"], "conferido_em": "2026-11-18", "fonte": T.FONTE}
        sp = {"esporte": "futebol", "data": "2026-11-19", "times": ["São Paulo", "Fluminense"], "canais": ["Globo", "Premiere"], "conferido_em": "2026-11-18", "fonte": T.FONTE}
        arquivo = {"jogos": [dict(sumiu), dict(sp)]}
        sem_globo = lambda url: None if url.endswith("/GRD") else self.pegar_texto(url)
        self.rodar(arquivo, sem_globo)
        self.assertIn(sumiu, arquivo["jogos"])
        sp_depois = next(j for j in arquivo["jogos"] if "São Paulo" in j["times"])
        self.assertEqual(sp_depois["canais"], ["Globo", "Premiere"])

    def test_item_a_mao_tira_o_do_robo(self):
        do_robo = {"esporte": "futebol", "data": "2026-11-19", "times": ["São Paulo", "Fluminense"], "canais": ["Globo"], "conferido_em": "2026-11-18", "fonte": T.FONTE}
        a_mao = {"esporte": "futebol", "data": "2026-11-19", "times": ["Fluminense", "São Paulo"], "canais": ["Globo", "Premiere"], "conferido_em": "2026-11-19", "fonte": "grade da Globo"}
        arquivo = {"jogos": [dict(do_robo), dict(a_mao)]}
        self.rodar(arquivo)
        self.assertEqual(arquivo["jogos"].count(a_mao), 1)
        self.assertFalse(any(j.get("fonte") == T.FONTE and "São Paulo" in j["times"] for j in arquivo["jogos"]))

    def test_siglas_equivalentes(self):
        self.assertTrue(T.mesmo_time("NYK", ["NY", "New York Knicks"]))
        self.assertTrue(T.mesmo_time("GS", ["GSW"]))
        self.assertFalse(T.mesmo_time("NY", ["NO", "New Orleans Pelicans"]))


class TesteOndeAssistirNoPC(unittest.TestCase):
    def test_item_a_mao_tem_preferencia(self):
        import transmissoes
        dados = {"padroes": {}, "jogos": [
            {"esporte": "nba", "data": "2026-11-21", "times": ["NY", "POR"], "canais": ["ESPN 2"], "fonte": T.FONTE},
            {"esporte": "nba", "data": "2026-11-21", "times": ["NYK", "POR"], "canais": ["Prime Video"], "fonte": "grade do Prime"},
        ]}
        original = transmissoes._carregar
        transmissoes._carregar = lambda: dados
        try:
            r = transmissoes.onde_assistir("nba", data="2026-11-21", times=[["NY", "New York Knicks"], ["POR", "Portland Trail Blazers"]])
        finally:
            transmissoes._carregar = original
        self.assertEqual(r["canais"], ["Prime Video"])


class TesteFutebolNaTV(unittest.TestCase):
    """Parte J: os streamings e os canais que o guia de TV não tem, pela lista do dia do futebolnatv."""

    def setUp(self):
        base = TesteAtualizar()
        base.setUp()
        base.paginas["jogos-hoje"] = (AMOSTRAS / "futebolnatv_hoje.html").read_text(encoding="utf-8")
        self.base = base
        self.canais = {"ES2": "ESPN 2", "SPO": "SporTV", "GRD": "Globo"}

    def rodar(self, arquivo):
        return T.atualizar(arquivo, HOJE, pegar_texto=self.base.pegar_texto, pegar_json=self.base.pegar_json, canais=self.canais, dias=1)

    def test_le_a_lista_do_dia(self):
        jogos = T.ler_futebolnatv((AMOSTRAS / "futebolnatv_hoje.html").read_text(encoding="utf-8"))
        self.assertEqual(len(jogos), 3)  # o jogo sem canal fica de fora
        sp = jogos[1]
        self.assertEqual(sp["times"], ["São Paulo", "Fluminense"])
        self.assertEqual((sp["data"], sp["hora"]), ("2026-11-19", "21:30"))  # data-ts em UTC -> Brasília
        self.assertEqual(sp["canais"], ["Globo", "Premiere 2", "ge tv"])
        self.assertEqual(jogos[0]["canais"], ["SporTV", "Premiere"])
        self.assertEqual(jogos[2]["canais"], ["ESPN", "Disney+ Premium"])

    def test_nomes_dos_canais(self):
        casos = {
            "GLOBO": "Globo", "SPORTV": "SporTV", "SPORTV 2": "SporTV 2", "SPORTV 3": "SporTV 3", "SPORTV 1": "SporTV",
            "PREMIERE FC": "Premiere", "PREMIERE 4": "Premiere 4", "GE TV": "ge tv", "CAZÉTV": "CazéTV", "CAZE TV": "CazéTV",
            "PRIME VIDEO": "Prime Video", "AMAZON PRIME VIDEO": "Prime Video", "HBO MAX": "HBO Max", "MAX": "HBO Max",
            "DISNEY+": "Disney+ Premium", "XSPORTS": "Xsports", "SPORTYNET": "SportyNet", "PARAMOUNT+": "Paramount+",
            "APPLE TV": "Apple TV", "ESPN 4": "ESPN 4", "CANAL GOAT": "GOAT", "PPV ONEFOOTBALL": "OneFootball", "BAND": "Band", "TNT": "TNT", "YOUTUBE NBA BRASIL": "YouTube NBA Brasil",
        }
        for bruto, nome in casos.items():
            self.assertEqual(T.nome_do_canal(bruto), nome, bruto)

    def test_junta_o_guia_e_a_lista_do_dia(self):
        arquivo = {"jogos": []}
        self.rodar(arquivo)
        sp = [j for j in arquivo["jogos"] if "São Paulo" in j["times"]]
        self.assertEqual(len(sp), 1)
        self.assertEqual(sp[0]["canais"], ["Globo", "Premiere 2", "ge tv"])
        vasco = [j for j in arquivo["jogos"] if "Vasco da Gama" in j["times"]]
        self.assertEqual(vasco[0]["canais"], ["SporTV", "Premiere"])

    def test_premiere_numerado_tira_o_premiere_generico(self):
        self.assertEqual(T.canais_do_jogo("futebol", ["Premiere", "Premiere 2"]), ["Premiere 2"])
        self.assertEqual(T.canais_do_jogo("futebol", ["ESPN", "Disney+ Premium"]), ["ESPN", "Disney+ Premium"])

    def test_lista_do_dia_fora_do_ar_so_acrescenta(self):
        antigo = {"esporte": "futebol", "data": "2026-11-19", "times": ["São Paulo", "Fluminense"], "canais": ["Globo", "Premiere 2", "ge tv"], "conferido_em": "2026-11-19", "fonte": T.FONTE}
        arquivo = {"jogos": [dict(antigo)]}
        self.base.paginas["jogos-hoje"] = None
        self.rodar(arquivo)
        self.assertEqual(arquivo["jogos"][0]["canais"], ["Globo", "Premiere 2", "ge tv"])


class TesteMadrugada(unittest.TestCase):
    def test_hoje_e_a_data_de_brasilia(self):
        from datetime import datetime, timezone
        self.assertEqual(T.hoje_em_brasilia(datetime(2026, 11, 20, 2, 0, tzinfo=timezone.utc)), date(2026, 11, 19))
        self.assertEqual(T.hoje_em_brasilia(datetime(2026, 11, 20, 4, 0, tzinfo=timezone.utc)), date(2026, 11, 20))

    def test_jogo_depois_da_meia_noite_procura_tambem_o_dia_anterior_da_espn(self):
        self.assertEqual(T.datas_da_espn({"data": "2026-11-20", "hora": "00:30"}), ["2026-11-20", "2026-11-19"])
        self.assertEqual(T.datas_da_espn({"data": "2026-11-20", "hora": "21:30"}), ["2026-11-20"])

    def test_futebol_junta_os_nomes_em_portugues_e_os_jogos_so_em_ingles(self):
        def ev(id_, quando, a, b):
            return {"id": id_, "date": quando, "competitions": [{"competitors": [{"team": a}, {"team": b}]}]}

        pt = {"events": [ev("1", "2026-11-21T18:00Z", {"abbreviation": "LAZ", "displayName": "Lázio"}, {"abbreviation": "LEC", "displayName": "Lecce"})]}
        en = {"events": [
            ev("1", "2026-11-21T18:00Z", {"abbreviation": "LAZ", "displayName": "Lazio"}, {"abbreviation": "LEC", "displayName": "Lecce"}),
            ev("2", "2026-11-21T15:00Z", {"abbreviation": "BAY", "displayName": "Bayern Munich"}, {"abbreviation": "STU", "displayName": "VfB Stuttgart"}),
        ]}
        eventos = T.juntar_eventos(T.eventos_espn(pt), T.eventos_espn(en))
        self.assertEqual(len(eventos), 2)
        lazio = eventos[0]["times"][0]
        self.assertEqual(lazio["chave"], "Lázio")  # o nome em português, como o app recebe
        self.assertIn("Lazio", lazio["nomes"])
        bayern = eventos[1]["times"][0]
        self.assertEqual(bayern["chave"], "BAY")  # só em inglês: a sigla, que é a mesma nas duas línguas



class TesteMaisFontes(unittest.TestCase):
    """As páginas das ligas do futebolnatv (a rodada inteira) e a lista do mês da NBA (Prime Video)."""

    def setUp(self):
        base = TesteAtualizar()
        base.setUp()
        self.base = base
        self.canais = {"ES2": "ESPN 2", "SPO": "SporTV", "GRD": "Globo"}

    def rodar(self, arquivo):
        return T.atualizar(arquivo, HOJE, pegar_texto=self.base.pegar_texto, pegar_json=self.base.pegar_json, canais=self.canais, dias=2)

    def test_le_a_lista_do_mes_da_nba(self):
        jogos = T.ler_gameoverdrive((AMOSTRAS / "gameoverdrive_nba_mes.html").read_text(encoding="utf-8"))
        # só os jogos com algo além do League Pass (que o padrão da NBA já mostra)
        self.assertEqual([(j["data"], j["hora"], j["times"]) for j in jogos], [
            ("2026-11-19", "22:00", ["Clippers", "Spurs"]),
            ("2026-11-20", "21:30", ["Raptors", "Pistons"]),
            ("2026-11-20", "23:30", ["Suns", "Jazz"]),
        ])
        self.assertEqual(jogos[0]["canais"], ["NBA League Pass", "Prime Video"])
        self.assertEqual(jogos[2]["canais"], ["NBA League Pass", "ESPN 2", "Disney+ Premium"])

    def test_paginas_da_nba_do_mes(self):
        self.assertEqual(T.paginas_nba(date(2026, 11, 19), 7), ["/nba-novembro-2026-onde-assistir-jogos-horarios/"])
        self.assertEqual(T.paginas_nba(date(2026, 11, 28), 7), ["/nba-novembro-2026-onde-assistir-jogos-horarios/", "/nba-dezembro-2026-onde-assistir-jogos-horarios/"])
        self.assertEqual(T.paginas_nba(date(2026, 12, 29), 7)[1], "/nba-janeiro-2027-onde-assistir-jogos-horarios/")

    def test_clippers_x_spurs_no_prime_video(self):
        self.base.paginas["nba-novembro-2026-onde-assistir-jogos-horarios"] = (AMOSTRAS / "gameoverdrive_nba_mes.html").read_text(encoding="utf-8")
        arquivo = {"jogos": []}
        self.rodar(arquivo)
        lac = [j for j in arquivo["jogos"] if j["esporte"] == "nba" and "LAC" in j["times"]]
        self.assertEqual(len(lac), 1)
        self.assertEqual(lac[0]["canais"], ["Prime Video", "NBA League Pass"])

    def test_pagina_da_liga_descoberta_na_lista_do_dia(self):
        self.base.paginas["jogos-hoje"] = '<a href="/liga/campeonato-espanhol-u62s3h464c">LaLiga</a><a href="/liga/brasileiro-sub-20-x">Sub-20</a>'
        self.base.paginas["campeonato-espanhol-u62s3h464c"] = (AMOSTRAS / "futebolnatv_hoje.html").read_text(encoding="utf-8")
        pedidas = []
        original = self.base.pegar_texto

        def anotar(url):
            pedidas.append(url)
            return original(url)

        T.atualizar({"jogos": []}, HOJE, pegar_texto=anotar, pegar_json=self.base.pegar_json, canais=self.canais, dias=2)
        self.assertTrue(any(u.endswith("/liga/campeonato-espanhol-u62s3h464c") for u in pedidas))
        self.assertFalse(any("sub-20" in u for u in pedidas))  # base e feminino ficam de fora
        self.assertTrue(any(u.endswith("/liga/brasileirao-serie-a-ne9wa6elab") for u in pedidas))  # as fixas sempre


if __name__ == "__main__":
    unittest.main()
