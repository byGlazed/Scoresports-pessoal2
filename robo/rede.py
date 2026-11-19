"""Pedidos HTTP do robô: um de cada vez, identificados, e com paciência quando o site pede calma."""

import json
import sys
import time
import urllib.error
import urllib.request

USER_AGENT = "Scoresports/1.0 (+https://github.com/byGlazed/Scoresports-pessoal2)"
INTERVALO = 1.0  # segundos entre pedidos
ESPERA_429 = 30  # segundos antes de tentar de novo quando o site responde 429 ou 5xx
TENTATIVAS = 3

_ultimo = 0.0


def aviso(texto):
    print(f"aviso: {texto}", file=sys.stderr)


def _pegar(url, aceitar, ler):
    """A resposta lida por `ler`, ou None (com aviso no log) se não der depois de algumas tentativas."""
    global _ultimo
    for tentativa in range(1, TENTATIVAS + 1):
        espera = INTERVALO - (time.monotonic() - _ultimo)
        if espera > 0:
            time.sleep(espera)
        _ultimo = time.monotonic()
        try:
            pedido = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": aceitar})
            with urllib.request.urlopen(pedido, timeout=60) as resposta:
                return ler(resposta)
        except urllib.error.HTTPError as erro:
            if (erro.code == 429 or erro.code >= 500) and tentativa < TENTATIVAS:
                aviso(f"{erro.code} em {url}; tentando de novo em {ESPERA_429}s")
                time.sleep(ESPERA_429)
                continue
            aviso(f"{erro.code} em {url}")
            return None
        except Exception as erro:  # sem rede, tempo esgotado, resposta quebrada
            aviso(f"{erro} em {url}")
            return None
    return None


def pegar_json(url):
    """O JSON da resposta, ou None."""
    return _pegar(url, "application/json", json.load)


def pegar_texto(url):
    """O texto (HTML) da resposta, ou None."""
    return _pegar(url, "text/html,text/plain", lambda r: r.read().decode(r.headers.get_content_charset() or "utf-8", "replace"))
