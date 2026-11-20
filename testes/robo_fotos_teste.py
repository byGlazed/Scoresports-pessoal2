"""Testes do robô das fotos (robo/fotos.py): a escolha igual à do app, com as buscas reais do TheSportsDB
guardadas em testes/amostras/thesportsdb_busca.json, e o índice que ele monta.

    python -m unittest discover -s testes -p "*_teste.py"
"""

import json
import sys
import unittest
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from robo import fotos as F  # noqa: E402

BUSCAS = json.loads((RAIZ / "testes" / "amostras" / "thesportsdb_busca.json").read_text(encoding="utf-8"))
HOJE = date(2026, 11, 19)


class TesteEscolhaIgualAoApp(unittest.TestCase):
    def test_time_bate(self):
        url = F.escolher(BUSCAS["Dean Henderson"], "Dean Henderson", "Crystal Palace")
        self.assertRegex(url, r"^https://r2\.thesportsdb\.com/images/media/player/cutout/.+\.png/small$")
        self.assertTrue(F.escolher(BUSCAS["Gustavo Gómez"], "Gustavo Gomez", "Palmeiras"))

    def test_homonimo_nao(self):
        self.assertIsNone(F.escolher(BUSCAS["Pedro"], "Pedro", "Flamengo"))
        self.assertTrue(F.escolher(BUSCAS["Pedro"], "Pedro", "Lazio"))
        self.assertTrue(F.escolher(BUSCAS["Jérémy Jacquet"], "Jérémy Jacquet", "Liverpool"))

    def test_chave_igual_a_do_app(self):
        # a mesma de Fotos.chave em static/fotos_regras.js
        self.assertEqual(F.chave("Gustavo Gómez", "Athletico Paranaense"), "gustavo gomez|athletico paranaense")
        self.assertEqual(F.chave(" Kaio  Jorge ", "Atlético-MG"), "kaio jorge|atletico mg")


class TesteIndice(unittest.TestCase):
    def setUp(self):
        self.pedidos = []

        def pegar_json(url):
            self.pedidos.append(url)
            if url.endswith("/bra.1/teams?lang=pt&region=br"):
                return {"sports": [{"leagues": [{"teams": [{"team": {"id": "2029", "displayName": "Palmeiras"}}]}]}]}
            if "/teams/2029/roster" in url:
                return {"team": {"displayName": "Palmeiras"}, "athletes": [
                    {"id": "1", "displayName": "Gustavo Gómez"},
                    {"id": "2", "displayName": "Pedro"},
                    {"id": "3", "displayName": "Com Foto", "headshot": {"href": "https://a.espncdn.com/x.png"}},
                ]}
            if "searchplayers.php?p=Gustavo%20G%C3%B3mez" in url:
                return {"player": BUSCAS["Gustavo Gómez"]}
            if "searchplayers.php?p=Pedro" in url:
                return {"player": BUSCAS["Pedro"]}
            return None

        self.pegar_json = pegar_json

    def rodar(self, arquivo, hoje=HOJE, maximo=10):
        return F.atualizar(arquivo, hoje, pegar_json=self.pegar_json, esperar=lambda s: None, maximo=maximo, ligas=("bra.1",))

    def test_monta_o_indice_com_foto_e_sem_foto(self):
        arquivo = {}
        mudancas = self.rodar(arquivo)
        self.assertTrue(mudancas)
        self.assertTrue(arquivo["fotos"]["gustavo gomez|palmeiras"].endswith("/small"))
        self.assertIsNone(arquivo["fotos"]["pedro|palmeiras"])  # o Pedro do TheSportsDB é o da Lazio
        self.assertNotIn("com foto|palmeiras", arquivo["fotos"])  # tem foto na ESPN
        self.assertEqual(arquivo["conferidas"]["pedro|palmeiras"], "2026-11-19")

    def test_nao_busca_de_novo_antes_do_prazo(self):
        arquivo = {}
        self.rodar(arquivo)
        buscas = len([u for u in self.pedidos if "searchplayers" in u])
        self.assertEqual(self.rodar(arquivo, date(2026, 11, 25)), [])
        self.assertEqual(len([u for u in self.pedidos if "searchplayers" in u]), buscas)
        # o "não tem" volta a ser conferido depois de 20 dias; a foto achada, só depois de 60
        self.rodar(arquivo, date(2026, 12, 10))
        refeitas = [u for u in self.pedidos if "searchplayers" in u][buscas:]
        self.assertEqual(len(refeitas), 1)
        self.assertIn("Pedro", refeitas[0])

    def test_limite_por_rodada_e_espn_fora_do_ar(self):
        arquivo = {}
        self.rodar(arquivo, maximo=1)
        self.assertEqual(len(arquivo["fotos"]), 1)
        self.assertEqual(F.atualizar({}, HOJE, pegar_json=lambda url: None, esperar=lambda s: None), [])

    def test_busca_que_falhou_fica_para_a_proxima(self):
        arquivo = {}
        F.atualizar(arquivo, HOJE, pegar_json=lambda url: None if "searchplayers" in url else self.pegar_json(url), esperar=lambda s: None, ligas=("bra.1",))
        self.assertEqual(arquivo.get("fotos"), {})


if __name__ == "__main__":
    unittest.main()


class TesteRegrasNovas(unittest.TestCase):
    """As mesmas regras de static/fotos_regras.js (testes/fotos.test.js)."""

    def test_nome_curto_no_mesmo_time(self):
        self.assertRegex(F.escolher(BUSCAS["Warleson"], "Warleson", "Botafogo") or "", r"/small$")
        self.assertIsNone(F.escolher(BUSCAS["Rhyan"], "Rhyan", "Botafogo"))
        self.assertIsNone(F.escolher(BUSCAS["Pedro"], "Pedro", "Flamengo"))

    def test_sigla_do_estado(self):
        self.assertTrue(F.mesmo_time("Atlético-MG", "Atlético Mineiro"))
        self.assertTrue(F.mesmo_time("América-MG", "América Mineiro"))
        self.assertTrue(F.mesmo_time("Atlético-GO", "Atlético Goianiense"))
        self.assertTrue(F.mesmo_time("Remo", "Clube do Remo"))
        self.assertTrue(F.mesmo_time("Operário PR", "Operário Ferroviário"))
        self.assertFalse(F.mesmo_time("Atlético-MG", "Atlético Goianiense"))
        self.assertFalse(F.mesmo_time("Atlético-MG", "Atlético Madrid"))
        self.assertTrue(F.escolher(BUSCAS["Gustavo Scarpa"], "Gustavo Scarpa", "Atlético-MG"))


class TesteTempo(unittest.TestCase):
    """A rodada das fotos não pode segurar o robô inteiro (o Actions corta o job em 6 h e aí nada é publicado)."""

    def setUp(self):
        base = TesteIndice()
        base.setUp()
        self.base = base

    def test_para_quando_o_tempo_acaba(self):
        relogio = iter([0, 0, 2000, 2000, 2000])  # começa, 1ª busca, depois já passou do limite
        arquivo = {}
        F.atualizar(arquivo, HOJE, pegar_json=self.base.pegar_json, esperar=lambda s: None, ligas=("bra.1",), tempo_maximo=1200, relogio=lambda: next(relogio))
        self.assertEqual(len(arquivo["fotos"]), 1)

    def test_para_depois_de_5_buscas_seguidas_sem_resposta(self):
        muitos = {"team": {"displayName": "Palmeiras"}, "athletes": [{"id": str(i), "displayName": f"Jogador {i}"} for i in range(20)]}
        buscas = []

        def pegar_json(url):
            if "searchplayers" in url:
                buscas.append(url)
                return None  # o TheSportsDB não responde (429 seguidos)
            if "/roster" in url:
                return muitos
            return self.base.pegar_json(url)

        F.atualizar({}, HOJE, pegar_json=pegar_json, esperar=lambda s: None, ligas=("bra.1",))
        self.assertEqual(len(buscas), 5)
