"""Testes da escalação do futebol no PC (espn_dados._escalacoes), com o jogo real
Crystal Palace 1 x 3 Liverpool (08/11/2026) guardado em testes/amostras/espn_futebol_resumo.json.

    python -m unittest discover -s testes -p "*_teste.py"
"""

import json
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

import espn_dados  # noqa: E402

RESUMO = json.loads((RAIZ / "testes" / "amostras" / "espn_futebol_resumo.json").read_text(encoding="utf-8"))


class TesteEscalacoes(unittest.TestCase):
    def setUp(self):
        self.escalacoes = espn_dados._escalacoes(RESUMO)
        self.palace = next(e for e in self.escalacoes if e["time"]["nome"] == "Crystal Palace")

    def jogador(self, nome):
        return next(j for j in self.palace["titulares"] + self.palace["reservas"] if j["nome"] == nome)

    def test_formacao_e_lugares(self):
        self.assertEqual(self.palace["formacao"], "3-4-2-1")
        self.assertEqual(sorted(j["lugar"] for j in self.palace["titulares"]), list(range(1, 12)))

    def test_numeros_do_goleiro(self):
        henderson = self.jogador("Dean Henderson")
        self.assertEqual(henderson["defesas"], 5)
        self.assertEqual(henderson["gols_sofridos"], 3)
        self.assertEqual(henderson["gols"], 0)

    def test_substituicao(self):
        self.assertEqual(self.jogador("Quinten Timber")["saiu_aos"], 60)
        self.assertEqual(self.jogador("Darío Osorio")["entrou_aos"], 60)
        self.assertIsNone(self.jogador("Dean Henderson")["saiu_aos"])

    def test_placar_do_time(self):
        self.assertEqual(self.palace["gols_pro"], 1)
        self.assertEqual(self.palace["gols_contra_time"], 3)
        liverpool = next(e for e in self.escalacoes if e["time"]["nome"] != "Crystal Palace")
        self.assertEqual((liverpool["gols_pro"], liverpool["gols_contra_time"]), (3, 1))

    def test_campos_para_a_nota(self):
        for campo in ("chutes_no_gol", "faltas_cometidas", "faltas_sofridas", "gols_contra", "foto", "lugar"):
            self.assertIn(campo, self.jogador("Jørgen Strand Larsen"))
        self.assertEqual(self.jogador("Jørgen Strand Larsen")["faltas_sofridas"], 2)

    def test_minuto_do_texto(self):
        self.assertEqual(espn_dados._minuto_do_texto("90'+3'"), 93)
        self.assertEqual(espn_dados._minuto_do_texto("67'"), 67)
        self.assertIsNone(espn_dados._minuto_do_texto(""))


if __name__ == "__main__":
    unittest.main()
