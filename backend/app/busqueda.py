"""Búsqueda sin importar mayúsculas ni acentos (ej. "rotula" encuentra "Rótula")."""
import unicodedata


def sin_acentos(texto) -> str:
    t = unicodedata.normalize("NFD", str(texto or ""))
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower().strip()


def coincide(q, *valores) -> bool:
    buscado = sin_acentos(q)
    return not buscado or any(buscado in sin_acentos(v) for v in valores)
