"""Testes do robô do boxe, com fichas reais da Wikipédia guardadas em testes/amostras/.

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
from robo import boxe  # noqa: E402

AMOSTRAS = RAIZ / "testes" / "amostras"


def wikitexto(nome):
    return json.loads((AMOSTRAS / nome).read_text(encoding="utf-8"))["parse"]["wikitext"]


def evento(id_, data, a, b, vencedor=None, resultado=None, canais=None, inicio=None):
    return {
        "id": id_, "data": data, "inicio": inicio, "nome": f"{a} x {b}", "local": "", "canais": canais or [],
        "lutas": [{"lutadores": [a, b], "categoria": "", "titulo": "", "vencedor": vencedor, "resultado": resultado}],
    }


class TesteFicha(unittest.TestCase):
    def test_ficha_futura(self):
        f = boxe.ficha_da_luta(wikitexto("wiki_luta_tszyu.json"))
        self.assertEqual(f["data"], "2026-12-13")
        self.assertEqual(f["lutadores"], ["Tim Tszyu", "Erislandy Lara"])
        self.assertEqual(f["local"], "Cbus Super Stadium, Gold Coast, Queensland, Australia")
        self.assertIsNone(f["vencedor"])
        self.assertIsNone(f["resultado"])

    def test_ficha_com_resultado(self):
        f = boxe.ficha_da_luta(wikitexto("wiki_luta_inoue.json"))
        self.assertEqual(f["data"], "2026-05-02")
        self.assertEqual(f["lutadores"], ["Naoya Inoue", "Junto Nakatani"])
        self.assertEqual(f["vencedor"], "Naoya Inoue")
        self.assertEqual(f["resultado"], "Decisão unânime")
        g = boxe.ficha_da_luta(wikitexto("wiki_luta_garcia.json"))
        self.assertEqual((g["vencedor"], g["resultado"]), ("Ryan Garcia", "Nocaute técnico no 2º round"))
        h = boxe.ficha_da_luta(wikitexto("wiki_luta_lopez.json"))
        self.assertEqual((h["vencedor"], h["resultado"]), ("Shakur Stevenson", "Decisão unânime"))

    def test_pagina_sem_ficha_de_luta(self):
        # "Viddal Riley vs. Seydi Coupe" redireciona para a página do ano da Misfits: não é uma ficha de luta
        self.assertIsNone(boxe.ficha_da_luta(wikitexto("wiki_luta_riley.json")))

    def test_id_da_luta(self):
        self.assertEqual(boxe.id_da_luta("2026-12-13", ["Tim Tszyu", "Erislandy Lara"]), "2026-12-13-tszyu-lara")
        self.assertEqual(boxe.id_da_luta("2026-05-01", ["Teófimo López", "Shakur Stevenson"]), "2026-05-01-lopez-stevenson")


class TesteJuntar(unittest.TestCase):
    def setUp(self):
        self.futura = boxe.ficha_da_luta(wikitexto("wiki_luta_tszyu.json"))
        self.feita = boxe.ficha_da_luta(wikitexto("wiki_luta_inoue.json"))

    def test_mesma_luta(self):
        self.assertTrue(boxe.mesma_luta(evento("x", "2026-12-14", "Tim Tszyu", "Erislandy Lara"), self.futura))
        self.assertTrue(boxe.mesma_luta(evento("x", "2026-12-13", "Erislandy Lara", "T. Tszyu"), self.futura))
        self.assertFalse(boxe.mesma_luta(evento("x", "2026-12-20", "Tim Tszyu", "Erislandy Lara"), self.futura))
        self.assertFalse(boxe.mesma_luta(evento("x", "2026-12-13", "Tim Tszyu", "Outro Lutador"), self.futura))

    def test_acrescenta_luta_futura(self):
        arquivo = {"eventos": [evento("2026-11-20-a-b", "2026-11-20", "Aaa Aaa", "Bbb Bbb")]}
        mudanca = boxe.juntar_luta(arquivo, self.futura, date(2026, 11, 15))
        self.assertIsNotNone(mudanca)
        novo = arquivo["eventos"][-1]
        self.assertEqual(novo["id"], "2026-12-13-tszyu-lara")
        self.assertEqual(novo["nome"], "Tim Tszyu x Erislandy Lara")
        self.assertIsNone(novo["inicio"])
        self.assertEqual(novo["canais"], [])
        self.assertEqual(novo["lutas"][0]["lutadores"], ["Tim Tszyu", "Erislandy Lara"])
        self.assertEqual([e["data"] for e in arquivo["eventos"]], ["2026-11-20", "2026-12-13"])

    def test_nao_duplica(self):
        arquivo = {"eventos": [evento("ja-estava", "2026-12-13", "Tim Tszyu", "Erislandy Lara")]}
        antes = copy.deepcopy(arquivo)
        self.assertIsNone(boxe.juntar_luta(arquivo, self.futura, date(2026, 11, 15)))
        self.assertEqual(arquivo, antes)

    def test_luta_passada_que_nao_estava_fica_de_fora(self):
        arquivo = {"eventos": []}
        self.assertIsNone(boxe.juntar_luta(arquivo, self.feita, date(2026, 11, 15)))
        self.assertEqual(arquivo["eventos"], [])

    def test_completa_resultado(self):
        arquivo = {"eventos": [evento("x", "2026-05-02", "Naoya Inoue", "Junto Nakatani", canais=["Prime Video"])]}
        mudanca = boxe.juntar_luta(arquivo, self.feita, date(2026, 11, 15))
        self.assertIsNotNone(mudanca)
        luta = arquivo["eventos"][0]["lutas"][0]
        self.assertEqual((luta["vencedor"], luta["resultado"]), ("Naoya Inoue", "Decisão unânime"))
        self.assertEqual(arquivo["eventos"][0]["canais"], ["Prime Video"])

    def test_nao_troca_o_que_e_manual(self):
        manual = evento("x", "2026-05-02", "Naoya Inoue", "Junto Nakatani", vencedor="Junto Nakatani", resultado="Escrito à mão",
                        canais=["ESPN"], inicio="2026-05-02T07:00:00-03:00")
        arquivo = {"eventos": [manual]}
        antes = copy.deepcopy(arquivo)
        self.assertIsNone(boxe.juntar_luta(arquivo, self.feita, date(2026, 11, 15)))
        self.assertEqual(arquivo, antes)

    def test_fonte_fora_nao_muda(self):
        arquivo = json.loads((RAIZ / "boxe_eventos.json").read_text(encoding="utf-8"))
        antes = copy.deepcopy(arquivo)
        self.assertEqual(boxe.atualizar(arquivo, date(2026, 11, 15), buscar=lambda url: None), [])
        self.assertEqual(arquivo, antes)

    def test_atualizar_ponta_a_ponta(self):
        categoria = {"query": {"categorymembers": [{"title": "Tim Tszyu vs. Erislandy Lara"}, {"title": "Naoya Inoue vs. Junto Nakatani"}]}}
        paginas = {
            "Tszyu": json.loads((AMOSTRAS / "wiki_luta_tszyu.json").read_text(encoding="utf-8")),
            "Inoue": json.loads((AMOSTRAS / "wiki_luta_inoue.json").read_text(encoding="utf-8")),
        }

        def buscar(url):
            if "categorymembers" in url:
                return categoria if "2026" in url else {"query": {"categorymembers": []}}
            for chave, dados in paginas.items():
                if chave in url:
                    return dados
            return None

        arquivo = {"eventos": [evento("x", "2026-05-02", "Naoya Inoue", "Junto Nakatani")]}
        mudancas = boxe.atualizar(arquivo, date(2026, 11, 15), buscar=buscar)
        self.assertEqual(len(mudancas), 2)
        self.assertEqual(arquivo["eventos"][0]["lutas"][0]["vencedor"], "Naoya Inoue")
        self.assertEqual(arquivo["eventos"][1]["id"], "2026-12-13-tszyu-lara")
        self.assertEqual(boxe.atualizar(arquivo, date(2026, 11, 15), buscar=buscar), [])


if __name__ == "__main__":
    unittest.main()
