"""Compila e roda os testes Java das regras de atualização do app (sem Android).

    python testes/rodar_java.py

Usa o javac/java da máquina (ou do GitHub Actions). Sai com o código do teste.
"""

import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTES = [RAIZ / "android" / "app" / "src" / "main" / "java" / "com" / "byglazed" / "scoresports" / "Atualizacao.java"]
TESTES = sorted((RAIZ / "testes" / "java").glob("*.java"))
SAIDA = RAIZ / "build" / "java-testes"


def main():
    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    SAIDA.mkdir(parents=True)
    compilar = ["javac", "-encoding", "UTF-8", "-d", str(SAIDA), *map(str, FONTES), *map(str, TESTES)]
    r = subprocess.run(compilar)
    if r.returncode != 0:
        return r.returncode
    return subprocess.run(["java", "-cp", str(SAIDA), "AtualizacaoTeste"]).returncode


if __name__ == "__main__":
    sys.exit(main())
