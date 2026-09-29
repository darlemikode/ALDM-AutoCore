from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import os

from .rate_limit import limiter

from .routers import auth, catalogos, clientes, vehiculos, proveedores, refacciones, herramientas, servicios, dashboard, codigos_postales, fotos, portal_cliente, citas, chatbot, inspecciones, promociones, empleados, configuracion_taller, comisiones, roles, usuarios, cotizaciones, superadmin, facturacion, notificaciones, nomina, pagos_en_linea, contacto
from . import seed
from . import seed_codigos_postales
from . import seed_marcas_modelos
from . import ws_router
from .ws_manager import REDIS_URL, escuchar_bus, manager_global

app = FastAPI(
    title="ALDM AutoCore - API",
    description="API de administración para taller mecánico (clientes, vehículos, servicios, refacciones, proveedores, herramientas).",
    version="1.0.0",
)

# Dominios que pueden llamar a esta API — en .env, ALLOWED_ORIGINS separado
# por comas (ej. https://tu-panel.azurestaticapps.net). Por defecto, solo
# los puertos locales de desarrollo del panel web.
_origenes_permitidos = [
    o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or "http://localhost:5173,http://localhost:5174").split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origenes_permitidos,
    allow_credentials=False,  # usamos JWT Bearer, no cookies — no se necesitan credenciales de CORS
    allow_methods=["*"],
    allow_headers=["*"],
)

# Límite de peticiones por IP (fuerza bruta / saturación) — límite global
# aquí, y uno más estricto directo en /auth/login (ver routers/auth.py).
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda request, exc: JSONResponse(status_code=429, content={"detail": "Demasiadas peticiones desde esta IP. Espera un momento e intenta de nuevo."}),
)
app.add_middleware(SlowAPIMiddleware)


# Métodos que cambian datos — cuando uno de estos responde 2xx, algo en la
# base de datos cambió y se avisa por el canal global (ver ws_manager.py)
# para que web/mobile/mobile-cliente se refresquen solas, sin tener que
# instrumentar cada endpoint uno por uno.
_METODOS_QUE_CAMBIAN = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def avisar_cambios_globales(request: Request, call_next):
    response = await call_next(request)
    try:
        if (
            request.method in _METODOS_QUE_CAMBIAN
            and 200 <= response.status_code < 300
            and (manager_global.conexiones or REDIS_URL)
        ):
            partes = [p for p in request.url.path.split("/") if p]
            # primer segmento útil del path como "tabla" (saltando el
            # prefijo /api que usan algunos routers)
            tabla = partes[1] if partes and partes[0] == "api" and len(partes) > 1 else (partes[0] if partes else "")
            if tabla and tabla not in ("ws", "notificaciones", "uploads", "superadmin"):
                await manager_global.difundir(
                    {"tipo": "cambio", "tabla": tabla, "metodo": request.method},
                    getattr(request.state, "id_taller", None),
                )
    except Exception:
        # el aviso de refresco nunca debe tronar la respuesta real
        pass
    return response


@app.exception_handler(IntegrityError)
def integrity_error_handler(request: Request, exc: IntegrityError):
    """Convierte violaciones de la base de datos (llaves foráneas, valores
    duplicados en columnas únicas, campos obligatorios vacíos, etc.) en una
    respuesta 400 legible, en vez de un 500 genérico con el traceback de SQL."""
    detalle = str(getattr(exc, "orig", exc)).lower()
    if "unique" in detalle or "duplicate" in detalle:
        mensaje = "Ya existe un registro con ese mismo valor único (por ejemplo, VIN o nombre de usuario)."
    elif "foreign key" in detalle or "violates foreign key" in detalle:
        mensaje = "No se puede completar la acción porque hay registros relacionados que dependen de este."
    elif "not null" in detalle:
        mensaje = "Falta un campo obligatorio para poder guardar este registro."
    else:
        # No es un caso que ya identifiquemos — se manda el detalle real de
        # SQL en vez de un mensaje genérico que no ayuda a saber qué pasó.
        mensaje = f"No se pudo completar la acción: {detalle}"
    return JSONResponse(status_code=400, content={"detail": mensaje})


def _esperar_base_de_datos(intentos: int = 8, espera: int = 15):
    """Azure SQL Serverless se pausa cuando no se usa y tarda hasta ~1 minuto
    en despertar: el primer intento de conexión falla con "Login timeout".
    Reintenta en lugar de tumbar el arranque de la app."""
    import time
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError, DBAPIError
    from .database import engine

    for intento in range(1, intentos + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except (OperationalError, DBAPIError) as error:
            if intento == intentos:
                raise
            print(f"[arranque] base de datos no disponible (¿despertando?), reintento {intento}/{intentos - 1} en {espera}s: {error.__class__.__name__}")
            time.sleep(espera)


@app.on_event("startup")
async def iniciar_bus_ws():
    if REDIS_URL:
        import asyncio

        asyncio.create_task(escuchar_bus())


@app.on_event("startup")
def on_startup():
    _esperar_base_de_datos()
    seed.run()
    seed_codigos_postales.run()
    seed_marcas_modelos.run()


app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(clientes.router)
app.include_router(vehiculos.router)
app.include_router(proveedores.router)
app.include_router(refacciones.router)
app.include_router(herramientas.router)
app.include_router(servicios.router)
app.include_router(catalogos.router)
app.include_router(codigos_postales.router)
app.include_router(fotos.router)
app.include_router(portal_cliente.router)
app.include_router(citas.router)
app.include_router(chatbot.router)
app.include_router(inspecciones.router)
app.include_router(promociones.router)
app.include_router(empleados.router)
app.include_router(configuracion_taller.router)
app.include_router(comisiones.router)
app.include_router(roles.router)
app.include_router(usuarios.router)
app.include_router(cotizaciones.router)
app.include_router(superadmin.router)
app.include_router(facturacion.router)
app.include_router(notificaciones.router)
app.include_router(nomina.router)
app.include_router(pagos_en_linea.router)
app.include_router(contacto.router)
app.include_router(ws_router.router)

# Archivos subidos (fotos de vehículos/servicios) — se sirven directo desde
# disco, sin depender de ningún servicio externo de almacenamiento.
# En Azure se apunta a /home/uploads (almacenamiento persistente): la carpeta
# del código se reemplaza en cada despliegue y se perderían las fotos.
from . import almacenamiento
from .almacenamiento import UPLOADS_DIR


class UploadsSinSniffing(StaticFiles):
    """Le agrega X-Content-Type-Options: nosniff a cada archivo servido de
    /uploads — así el navegador nunca intenta "adivinar" el contenido y
    ejecutarlo como HTML/script, use el Content-Type que use."""

    async def get_response(self, path, scope):
        respuesta = await super().get_response(path, scope)
        respuesta.headers["X-Content-Type-Options"] = "nosniff"
        return respuesta


if almacenamiento.USA_BLOB:
    import mimetypes

    from fastapi import Response

    @app.get("/uploads/{ruta:path}", include_in_schema=False)
    def servir_upload(ruta: str):
        datos = almacenamiento.leer(ruta)
        if datos is None:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        return Response(
            content=datos,
            media_type=mimetypes.guess_type(ruta)[0] or "application/octet-stream",
            headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400"},
        )
else:
    app.mount("/uploads", UploadsSinSniffing(directory=UPLOADS_DIR), name="uploads")

# Página informativa (carpeta sitio-web del repo; el despliegue la copia a app/sitio).
# Se entrega en /sitio y su formulario manda las solicitudes a /api/contacto.
_repo_sitio = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "sitio-web")
SITIO_DIR = next((d for d in (os.getenv("SITIO_DIR"), os.path.join(os.path.dirname(__file__), "sitio"), _repo_sitio) if d and os.path.isdir(d)), None)
if SITIO_DIR:
    app.mount("/sitio", StaticFiles(directory=SITIO_DIR, html=True), name="sitio")


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Página web (web-admin compilada con `npm run build`). En producción el mismo
# servidor entrega la web y la API, así /api, /uploads y los WebSockets quedan
# en el mismo dominio. Si la carpeta no existe (desarrollo local con Vite),
# "/" solo responde el estado de la API.
WEB_DIR = os.getenv("WEB_DIR") or os.path.join(os.path.dirname(__file__), "web")
_WEB_INDEX = os.path.join(WEB_DIR, "index.html")

if os.path.isfile(_WEB_INDEX):
    from fastapi.responses import FileResponse

    _WEB_RAIZ = os.path.realpath(WEB_DIR)

    @app.get("/{ruta:path}", include_in_schema=False)
    def pagina_web(ruta: str):
        if ruta.startswith(("api/", "uploads/")):
            raise HTTPException(status_code=404)
        archivo = os.path.realpath(os.path.join(_WEB_RAIZ, ruta))
        # Nunca salir de la carpeta web (evita ../../ en la URL)
        if ruta and archivo.startswith(_WEB_RAIZ + os.sep) and os.path.isfile(archivo):
            return FileResponse(archivo)
        # Rutas de React Router (/clientes, /servicios/5...) -> index.html
        return FileResponse(_WEB_INDEX, headers={"Cache-Control": "no-cache"})
else:
    @app.get("/")
    def root():
        return {"status": "ok", "servicio": "ALDM AutoCore API"}
