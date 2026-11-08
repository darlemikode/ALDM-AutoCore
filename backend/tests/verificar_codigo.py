"""Revisión estática rápida del backend, sin dependencias: sintaxis de todos los .py y nombres usados sin definir.
Atrapa errores como un import o una función que quedó fuera al editar (NameError en producción).
   Uso (desde la raíz del repo):  python backend/tests/verificar_codigo.py
Sale con código 1 si encuentra algo; no sube nada a ningún lado."""
import ast
import builtins
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1] / "app"
EXTRA = {"__file__", "__name__", "__doc__", "__path__"}


def definidos(arbol):
    d = set(dir(builtins)) | EXTRA
    for n in ast.walk(arbol):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            d.add(n.name)
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                d.add((a.asname or a.name).split(".")[0])
        if isinstance(n, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)):
            d.add(n.id)
        if isinstance(n, ast.arg):
            d.add(n.arg)
        if isinstance(n, ast.ExceptHandler) and n.name:
            d.add(n.name)
        if isinstance(n, (ast.Global, ast.Nonlocal)):
            d.update(n.names)
        if isinstance(n, ast.MatchAs) and n.name:
            d.add(n.name)
    return d


def main() -> int:
    problemas = []
    archivos = sorted(p for p in RAIZ.rglob("*.py") if "__pycache__" not in p.parts)
    for ruta in archivos:
        try:
            arbol = ast.parse(ruta.read_text(encoding="utf-8"), filename=str(ruta))
        except SyntaxError as e:
            problemas.append(f"{ruta.relative_to(RAIZ.parent)}:{e.lineno}: error de sintaxis: {e.msg}")
            continue
        if any(isinstance(n, ast.ImportFrom) and any(a.name == "*" for a in n.names) for n in ast.walk(arbol)):
            continue  # con "import *" no se puede saber qué nombres llegan
        ok = definidos(arbol)
        vistos = set()
        for n in ast.walk(arbol):
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id not in ok and (n.id, n.lineno) not in vistos:
                vistos.add((n.id, n.lineno))
                problemas.append(f"{ruta.relative_to(RAIZ.parent)}:{n.lineno}: nombre sin definir «{n.id}»")
    print(f"Revisados {len(archivos)} archivos de backend/app.")
    for p in problemas:
        print("  ", p)
    if problemas:
        print(f"\n{len(problemas)} problema(s): NO subir a producción.")
        return 1
    print("Todo en verde.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
