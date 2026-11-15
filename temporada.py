"""Temporada da NBA pela data: a nova começa em outubro (ex.: novembro de 2026 → "2026-27")."""

from datetime import date


def temporada_nba(hoje: date) -> str:
    inicio = hoje.year if hoje.month >= 10 else hoje.year - 1
    return f"{inicio}-{(inicio + 1) % 100:02d}"
