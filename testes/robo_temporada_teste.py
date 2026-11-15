"""Teste da temporada da NBA calculada pela data (PC).

    python -m unittest discover -s testes -p "*_teste.py"
"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from temporada import temporada_nba  # noqa: E402


class TesteTemporada(unittest.TestCase):
    def test_temporada_nba(self):
        self.assertEqual(temporada_nba(date(2026, 11, 14)), "2026-27")
        self.assertEqual(temporada_nba(date(2027, 3, 1)), "2026-27")
        self.assertEqual(temporada_nba(date(2027, 9, 30)), "2026-27")
        self.assertEqual(temporada_nba(date(2027, 10, 1)), "2027-28")
        self.assertEqual(temporada_nba(date(2099, 12, 1)), "2099-00")


if __name__ == "__main__":
    unittest.main()
