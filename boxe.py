"""Agenda de boxe, lida de boxe_eventos.json (o boxe não tem uma fonte de dados aberta e única)."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import transmissoes

ARQUIVO = Path(__file__).parent / "boxe_eventos.json"


def buscar_eventos():
    try:
        conteudo = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        raise RuntimeError(f"Não foi possível ler boxe_eventos.json: {erro}") from erro
    agora = datetime.now(timezone.utc)
    eventos = []
    for e in conteudo.get("eventos", []):
        inicio = transmissoes.para_brasilia(e.get("inicio"))
        lutas = e.get("lutas") or []
        terminou = any(l.get("vencedor") or l.get("resultado") for l in lutas)
        if inicio is not None:
            if terminou or inicio + timedelta(hours=5) < agora:
                estado = 3
            elif inicio <= agora:
                estado = 2
            else:
                estado = 1
        else:
            estado = 3 if terminou or (e.get("data") or "9999") < agora.strftime("%Y-%m-%d") else 1
        canais = list(e.get("canais") or [])
        if canais:
            transmissao = {"canais": canais, "confirmado": True, "observacao": e.get("observacao"), "conferido_em": e.get("conferido_em"), "fonte": e.get("fonte")}
        else:
            transmissao = transmissoes.onde_assistir("boxe", data=e.get("data"), inicio=inicio, evento=e.get("nome"))
        eventos.append(
            {
                "id": e.get("id") or e.get("nome"),
                "nome": e.get("nome") or "",
                "data": e.get("data") or (inicio.strftime("%Y-%m-%d") if inicio else None),
                "inicio": inicio.isoformat() if inicio else None,
                "local": e.get("local") or None,
                "estado": estado,
                "lutas": [
                    {
                        "lutadores": list(l.get("lutadores") or []),
                        "categoria": l.get("categoria") or None,
                        "titulo": l.get("titulo") or None,
                        "vencedor": l.get("vencedor"),
                        "resultado": l.get("resultado"),
                    }
                    for l in lutas
                ],
                "transmissao": transmissao,
            }
        )
    eventos.sort(key=lambda e: (e["data"] or "", e["inicio"] or ""))
    return eventos
