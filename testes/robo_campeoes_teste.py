"""Testes do robô dos campeões, com respostas reais da ESPN guardadas em testes/amostras/.

    python -m unittest discover -s testes -p "*_teste.py"
"""

import copy
import json
import re
import sys
import unittest
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from robo import campeoes  # noqa: E402

AMOSTRAS = RAIZ / "testes" / "amostras"


def amostra(nome):
    return json.loads((AMOSTRAS / nome).read_text(encoding="utf-8"))


class TesteRegras(unittest.TestCase):
    def test_rotulo(self):
        self.assertEqual(campeoes.rotulo_temporada("2025-26 English Premier League", "futebol:eng.1"), "2025-26")
        self.assertEqual(campeoes.rotulo_temporada("2025 Copa do Brasil", "futebol:bra.copa_do_brazil"), "2025")
        self.assertEqual(campeoes.rotulo_temporada("2025-26", "nba"), "2025-26")
        self.assertEqual(campeoes.rotulo_temporada("2025", "nfl"), "2025 (Super Bowl LX)")
        self.assertEqual(campeoes.rotulo_temporada("2026 NFL", "nfl"), "2026 (Super Bowl LXI)")
        self.assertIsNone(campeoes.rotulo_temporada("Temporada", "nba"))

    def test_temporada_encerrada(self):
        t = amostra("espn_temporada_eng1_2025.json")  # termina em 2026-06-01
        self.assertTrue(campeoes.temporada_encerrada(t, date(2026, 11, 14)))
        self.assertFalse(campeoes.temporada_encerrada(t, date(2026, 5, 20)))

    def test_campeao_pontos(self):
        self.assertEqual(campeoes.campeao_pontos(amostra("espn_classificacao_eng1_2025.json")), {"campeao": "Arsenal"})

    def test_campeao_final_ida_e_volta(self):
        eventos = amostra("espn_jogos_copa_do_brasil_2025.json")["events"]
        self.assertEqual(campeoes.campeao_final(eventos), {"campeao": "Corinthians", "vice": "Vasco da Gama"})

    def test_campeao_final_pela_nota_mesmo_perdendo_a_volta(self):
        # quem perde o jogo de volta mas leva no agregado é o campeão: vale a nota
        eventos = copy.deepcopy(amostra("espn_jogos_copa_do_brasil_2025.json")["events"])
        ultimo = eventos[-1]["competitions"][0]
        for c in ultimo["competitors"]:
            c["winner"] = c["team"]["displayName"] == "Vasco da Gama"
        ultimo["notes"] = [{"headline": "Volta - Corinthians vence 3-2 no agregado"}]
        self.assertEqual(campeoes.campeao_final(eventos), {"campeao": "Corinthians", "vice": "Vasco da Gama"})

    def test_final_de_ida_e_volta_sem_nota_nao_escreve(self):
        # jogo de volta sem nota dizendo quem levou: o vencedor da volta pode não ser o do agregado
        eventos = copy.deepcopy(amostra("espn_jogos_copa_do_brasil_2025.json")["events"])
        ultimo = eventos[-1]["competitions"][0]
        ultimo["notes"] = [{"headline": "Vasco win 4-3 on aggregate"}]  # nome curto: não cita ninguém
        del ultimo["series"]  # sem o placar agregado da ESPN
        self.assertIsNone(campeoes.campeao_final(eventos))

    def test_final_de_ida_e_volta_pelo_agregado_da_espn(self):
        # a ESPN dá o vencedor do agregado em "series": vale mais que o vencedor do jogo e que a nota
        eventos = copy.deepcopy(amostra("espn_jogos_copa_do_brasil_2025.json")["events"])
        ultimo = eventos[-1]["competitions"][0]
        ultimo["notes"] = []
        for c in ultimo["competitors"]:
            c["winner"] = c["team"]["displayName"] == "Vasco da Gama"  # Vasco venceu a volta...
        self.assertEqual(campeoes.campeao_final(eventos), {"campeao": "Corinthians", "vice": "Vasco da Gama"})  # ...mas o título é do Corinthians

    def test_campeao_final_serie(self):
        eventos = amostra("espn_jogos_nba_final_2026.json")["events"]
        self.assertEqual(campeoes.campeao_final(eventos), {"campeao": "New York Knicks", "vice": "San Antonio Spurs"})

    def test_campeao_final_sem_vencedor(self):
        eventos = copy.deepcopy(amostra("espn_jogos_nba_final_2026.json")["events"])
        ultimo = eventos[-1]["competitions"][0]
        for c in ultimo["competitors"]:
            c["winner"] = False
        ultimo["notes"] = []
        self.assertIsNone(campeoes.campeao_final(eventos))

    def test_ultimo_jogo_com_outro_ao_mesmo_tempo_nao_e_final(self):
        # fim de fase de grupos (Liga das Nações 2024 na ESPN): vários jogos no mesmo horário; não é final
        eventos = copy.deepcopy(amostra("espn_jogos_copa_do_brasil_2025.json")["events"])
        outro = copy.deepcopy(eventos[-2])
        outro["id"] = "outro"
        outro["date"] = "2025-12-21T19:00Z"  # duas horas antes do último jogo
        self.assertIsNone(campeoes.campeao_final(eventos + [outro]))
        # um dia antes (disputa do 3º lugar na Copa do Mundo) não atrapalha
        outro["date"] = "2025-12-20T19:00Z"
        self.assertEqual(campeoes.campeao_final(eventos + [outro])["campeao"], "Corinthians")

    def test_temporada_com_mesmo_ano_ja_conta(self):
        # a ESPN chama de "2024" a Liga das Nações que o arquivo tem como "2024-25"
        lista = [{"temporada": "2024-25", "campeao": "Portugal"}]
        self.assertTrue(campeoes.ja_tem(lista, "2024"))
        self.assertTrue(campeoes.ja_tem(lista, "2024-25"))
        self.assertFalse(campeoes.ja_tem(lista, "2025-26"))
        self.assertTrue(campeoes.ja_tem([{"temporada": "2025 (Super Bowl LX)"}], "2025 (Super Bowl LX)"))
        arquivo = {"futebol:uefa.nations": copy.deepcopy(lista)}
        self.assertFalse(campeoes.juntar(arquivo, "futebol:uefa.nations", {"temporada": "2024", "campeao": "Luxemburgo"}))
        self.assertEqual(arquivo["futebol:uefa.nations"], lista)

    def test_campeao_f1(self):
        self.assertEqual(campeoes.campeao_f1(amostra("espn_f1_2025.json")), {"campeao": "Lando Norris", "extra": "Construtores: McLaren"})

    def test_nao_duplica(self):
        arquivo = {"nba": [{"temporada": "2025-26", "campeao": "New York Knicks"}]}
        antes = copy.deepcopy(arquivo)
        self.assertFalse(campeoes.juntar(arquivo, "nba", {"temporada": "2025-26", "campeao": "Outro"}))
        self.assertEqual(arquivo, antes)
        self.assertTrue(campeoes.juntar(arquivo, "nba", {"temporada": "2026-27", "campeao": "Novo"}))
        self.assertEqual(arquivo["nba"][0]["campeao"], "Novo")
        self.assertTrue(campeoes.juntar(arquivo, "futebol:bra.2", {"temporada": "2025", "campeao": "Coritiba"}))
        self.assertEqual(arquivo["futebol:bra.2"], [{"temporada": "2025", "campeao": "Coritiba"}])

    def test_fonte_fora_nao_muda(self):
        arquivo = json.loads((RAIZ / "campeoes.json").read_text(encoding="utf-8"))
        antes = copy.deepcopy(arquivo)
        self.assertEqual(campeoes.atualizar(arquivo, date(2026, 11, 14), buscar=lambda url: None), [])
        self.assertEqual(arquivo, antes)

    def test_atualizar_ponta_a_ponta(self):
        # a ESPN diz que a Premier League 2025-26 acabou e o Arsenal foi campeão; o arquivo já tem: nada muda
        respostas = {
            "seasons?": {"items": [{"$ref": "http://sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/seasons/2025?lang=en&region=us"}]},
            "seasons/2025": amostra("espn_temporada_eng1_2025.json"),
            "standings": amostra("espn_classificacao_eng1_2025.json"),
        }

        def buscar(url):
            if "/eng.1" not in url:
                return None
            for trecho, dados in respostas.items():
                if trecho in url:
                    return dados
            return None

        arquivo = {"futebol:eng.1": [{"temporada": "2024-25", "campeao": "Liverpool"}]}
        mudancas = campeoes.atualizar(arquivo, date(2026, 11, 14), buscar=buscar)
        self.assertEqual(arquivo["futebol:eng.1"][0], {"temporada": "2025-26", "campeao": "Arsenal"})
        self.assertEqual(len(mudancas), 1)
        self.assertEqual(campeoes.atualizar(arquivo, date(2026, 11, 14), buscar=buscar), [])

    def test_competicoes_batem_com_o_app(self):
        direto = (RAIZ / "celular" / "direto.js").read_text(encoding="utf-8")
        trecho = direto[direto.index("  futebol: {"): direto.index("  nfl: {")]
        ligas = re.findall(r'id: "([^"]+)"', trecho)
        self.assertGreater(len(ligas), 30)
        cuidadas = {c["liga"] for c in campeoes.COMPETICOES if c["chave"].startswith("futebol:")}
        faltando = [l for l in ligas if l not in cuidadas and l not in campeoes.SEM_CAMPEAO]
        self.assertEqual(faltando, [])


if __name__ == "__main__":
    unittest.main()
