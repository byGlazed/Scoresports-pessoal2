"""python -m robo: roda os robôs dos campeões, do boxe e dos canais e grava só o arquivo que mudou.

Sai sempre com 0 quando a fonte falha (fica tudo como estava); só um erro de programação para a execução.
    python -m robo --seco   # mostra o que mudaria, sem gravar
"""

import json
import sys
from robo import boxe, campeoes, transmissoes


def rodar(modulo, rotulo, seco):
    arquivo = json.loads(modulo.ARQUIVO.read_text(encoding="utf-8"))
    # a data de hoje em Brasília: o Actions roda no UTC, e às 22h de Brasília lá já é amanhã
    mudancas = modulo.atualizar(arquivo, transmissoes.hoje_em_brasilia())
    for m in mudancas:
        print(m)
    if not mudancas:
        print(f"{rotulo}: nada novo")
    elif not seco:
        modulo.ARQUIVO.write_text(json.dumps(arquivo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(mudancas)


def main():
    seco = "--seco" in sys.argv
    total = rodar(campeoes, "campeões", seco) + rodar(boxe, "boxe", seco) + rodar(transmissoes, "canais", seco)
    print(f"{total} mudança(s)" + (" (sem gravar)" if seco else ""))


if __name__ == "__main__":
    main()
