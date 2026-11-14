"""Testes do manifesto de versão gerado pelo gerar_celular.py.

    python -m unittest discover -s testes -p "*_teste.py"
"""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import gerar_celular  # noqa: E402


class TesteManifesto(unittest.TestCase):
    def test_manifesto(self):
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            (pasta / "dados").mkdir()
            (pasta / "index.html").write_bytes(b"<html></html>")
            (pasta / "dados" / "a.json").write_bytes(b"{}")
            (pasta / "versao.txt").write_text("antigo", encoding="utf-8")  # o próprio manifesto fica de fora
            texto = gerar_celular.montar_manifesto(pasta, "20260101-000000", 3)
            self.assertTrue(texto.startswith("versao 20260101-000000\napk_minimo 3\n"))
            linhas = [l for l in texto.splitlines() if l.startswith("arquivo ")]
            sha = lambda b: hashlib.sha256(b).hexdigest()
            self.assertEqual(
                linhas,
                [f"arquivo {sha(b'{}')} 2 dados/a.json", f"arquivo {sha(b'<html></html>')} 13 index.html"],
            )

    def test_quebra_de_linha_do_windows(self):
        # o Git guarda (e o Pages publica) texto com LF; o manifesto tem de bater com isso
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            (pasta / "a.js").write_bytes(b"linha 1\r\nlinha 2\r\n")
            (pasta / "b.png").write_bytes(b"\x89PNG\x00\r\n")  # binário fica como está
            texto = gerar_celular.montar_manifesto(pasta, "20260101-000000", 0)
            sha = lambda b: hashlib.sha256(b).hexdigest()
            self.assertIn(f"arquivo {sha(b'linha 1' + bytes([10]) + b'linha 2' + bytes([10]))} 16 a.js", texto)
            self.assertIn(f"arquivo {sha(bytes([137]) + b'PNG' + bytes([0, 13, 10]))} 7 b.png", texto)

    def test_caminho_com_espaco(self):
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            (pasta / "com espaço.js").write_bytes(b"x")
            with self.assertRaises(ValueError):
                gerar_celular.montar_manifesto(pasta, "20260101-000000", 0)


if __name__ == "__main__":
    unittest.main()
