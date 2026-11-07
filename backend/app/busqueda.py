"""Búsqueda sin importar mayúsculas ni acentos (ej. "rotula" encuentra "Rótula").

Además es flexible: varias palabras en cualquier orden ("aceite 5w30" encuentra
"Aceite 5W-30 sintético") y tolera errores de dedo ("sitetico" → "sintético").
"""
import re
import unicodedata
from difflib import SequenceMatcher


def sin_acentos(texto) -> str:
    t = unicodedata.normalize("NFD", str(texto or ""))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower().strip()


def _compacto(texto: str) -> str:
    """Sin espacios ni signos: «5w-30» y «5w30» quedan iguales."""
    return re.sub(r"[^a-z0-9]", "", texto)


def _palabras(texto: str) -> list[str]:
    return [p for p in re.split(r"[^a-z0-9]+", texto) if p]


def _token_coincide(tok: str, pajar: str, compacto: str, palabras: list[str]) -> bool:
    if tok in pajar or _compacto(tok) in compacto:
        return True
    if len(tok) < 4:
        return False
    for p in palabras:
        if abs(len(p) - len(tok)) > 2:
            continue
        if SequenceMatcher(None, tok, p).ratio() >= 0.8:
            return True
    return False


def coincide(q, *valores) -> bool:
    buscado = sin_acentos(q)
    if not buscado:
        return True
    pajar = " ".join(sin_acentos(v) for v in valores if v is not None)
    compacto = _compacto(pajar)
    palabras = _palabras(pajar)
    tokens = [t for t in re.split(r"\s+", buscado) if t]
    return all(_token_coincide(t, pajar, compacto, palabras) for t in tokens)
