"""Valida que cada llamada api.* / fetch(API_URL…) de las DOS apps (mobile/src y
mobile-cliente/src) exista en el backend real (backend/app/routers/*.py,
prefijo del APIRouter + decorador @router.<método>).
Uso:  python qa/contrato_api.py   (desde mobile/)"""
import re, os, sys, glob

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
routers = glob.glob(os.path.join(RAIZ, "backend", "app", "routers", "*.py")) + [os.path.join(RAIZ, "backend", "app", "ws_router.py")]
rutas = set()
for f in routers:
    if not os.path.exists(f): continue
    t = open(f, encoding="utf-8").read()
    m = re.search(r'APIRouter\(\s*prefix\s*=\s*"([^"]*)"', t)
    prefijo = m.group(1) if m else ""
    for metodo, ruta in re.findall(r'@router\.(get|post|put|delete|patch)\(\s*"([^"]*)"', t):
        completa = (prefijo + ruta).replace("/api", "", 1) if (prefijo + ruta).startswith("/api") else prefijo + ruta
        rutas.add((metodo.upper(), re.sub(r"\{[^}]+\}", "{}", completa.rstrip("/") or "/")))
# routers genéricos creados con crud_factory (catálogos)
for f in routers + [os.path.join(RAIZ, "backend", "app", "main.py")]:
    t = open(f, encoding="utf-8").read() if os.path.exists(f) else ""
    for pref in re.findall(r'crear_router_crud\([^)]*prefix\s*=\s*"([^"]+)"', t) + re.findall(r'make_crud_router\([^)]*"(/api/[^"]+)"', t):
        base = pref.replace("/api", "", 1).rstrip("/")
        for metodo, sufijo in [("GET", ""), ("POST", ""), ("GET", "/{}"), ("PUT", "/{}"), ("DELETE", "/{}")]:
            rutas.add((metodo, base + sufijo))

llamadas = []
patron = re.compile(r'api\.(get|post|put|del|postForm)\(\s*(`[^`]*`|"[^"]*")')
patron_fetch = re.compile(r'fetch\(\s*`\$\{API_URL\}([^`]*)`\s*(?:,\s*\{([^}]*)\})?')
archivos = [(app, f) for app in ("mobile", "mobile-cliente", "mobile-superadmin")
            for f in glob.glob(os.path.join(RAIZ, app, "src", "**", "*.js"), recursive=True)]
for app, f in archivos:
    if "apiLocal" in f: continue
    t = open(f, encoding="utf-8").read()
    encontrados = list(patron.findall(t))
    for ruta, opciones in patron_fetch.findall(t):
        mm = re.search(r'method:\s*"(\w+)"', opciones or "")
        encontrados.append(((mm.group(1).lower() if mm else "get"), "`" + ruta + "`"))
    for metodo, ruta in encontrados:
        r = re.sub(r"\$\{[^}]*\?.*$", "", ruta[1:-1]).split("?")[0]  # plantillas anidadas con query
        if not r.startswith("/"): continue
        r = re.sub(r"\$\{[^}]+\}", "{}", r).rstrip("/") or "/"
        m = {"del": "DELETE", "postForm": "POST"}.get(metodo, metodo.upper())
        llamadas.append((m, r, f"{app}/{os.path.basename(f)}"))

vistas, faltan = set(), []
for m, r, f in llamadas:
    if (m, r, f.split("/")[0]) in vistas: continue
    vistas.add((m, r, f.split("/")[0]))
    def coincide(app, back):
        a, b = app.split("/"), back.split("/")
        return len(a) == len(b) and all(x == y or x == "{}" for x, y in zip(a, b))
    if (m, r) not in rutas and not any(mm == m and coincide(r, rr) for mm, rr in rutas):
        faltan.append(f"{m} {r}   ({f})")
por_app = {a: sum(1 for v in vistas if v[2] == a) for a in ("mobile", "mobile-cliente", "mobile-superadmin")}
print(f"Rutas del backend: {len(rutas)} · Llamadas únicas — taller: {por_app['mobile']} · cliente: {por_app['mobile-cliente']} · súper admin: {por_app['mobile-superadmin']}")
print(f"Sin ruta en el backend ({len(faltan)}):")
for x in sorted(faltan): print("  -", x)
sys.exit(1 if faltan else 0)
