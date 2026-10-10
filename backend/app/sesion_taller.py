"""
Decide de qué taller es cada petición y prepara la sesión de base de datos
para que solo vea ese taller (ver tenancy.py).

Orden de prioridad:
  1. El token (claim `tid`). Si el token trae taller, SIEMPRE manda ese —
     nunca un encabezado — para que nadie pueda "asomarse" a otro taller.
  2. Token sin `tid` (tokens viejos): el último/primer taller del usuario
     (o el taller del cliente, para la app de clientes).
  3. Sin token: el código de taller del QR (encabezado X-Taller o ?taller=).
  4. Si en todo el sistema hay un solo taller, ese (instalación de un solo
     taller: las apps viejas siguen funcionando igual).
"""
import os

from fastapi import HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import models
from .tenancy import MODO_NINGUNO, MODO_SUPERADMIN, MODO_TALLER, fijar_tenant

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
# Con la clave por defecto cualquiera puede firmar tokens (incluso de súper
# administrador). En Azure no se permite arrancar así; en local solo se avisa.
_CLAVES_INSEGURAS = {"", "dev-secret-change-me", "e2e-solo-pruebas", "changeme", "secret"}
if SECRET_KEY in _CLAVES_INSEGURAS or len(SECRET_KEY) < 32:
    if os.getenv("WEBSITE_SITE_NAME") and SECRET_KEY in _CLAVES_INSEGURAS:
        raise RuntimeError("SECRET_KEY no está configurada en el servidor: define una clave larga y aleatoria.")
    import logging
    logging.getLogger("uvicorn.error").warning("SECRET_KEY es la de desarrollo o muy corta: usa una clave larga y aleatoria en producción.")
ALGORITHM = "HS256"

# Rutas que deben funcionar aunque la suscripción esté vencida o en gracia
# (entrar, ver el aviso, cambiar de taller o de contraseña).
RUTAS_SIEMPRE_PERMITIDAS = (
    "/api/auth/login", "/api/auth/me", "/api/auth/talleres", "/api/auth/seleccionar-taller",
    "/api/auth/password", "/api/auth/push-token", "/api/auth/recuperar-password", "/api/auth/tutoriales",
    "/api/auth/estado-suscripcion", "/api/portal-cliente/taller",
)
METODOS_LECTURA = {"GET", "HEAD", "OPTIONS"}


def token_de_request(request: Request | None) -> str | None:
    if request is None:
        return None
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return request.query_params.get("token")


def codigo_de_request(request: Request | None) -> str | None:
    if request is None:
        return None
    return (request.headers.get("x-taller") or request.query_params.get("taller") or "").strip() or None


def buscar_taller_por_codigo(db: Session, codigo: str):
    return db.query(models.Taller).filter(models.Taller.codigo == codigo.strip().upper()).first()


def membresia_preferida(usuario: models.Usuario):
    activas = [m for m in usuario.membresias if m.activo and m.taller and m.taller.activo]
    if not activas:
        return None
    for m in activas:
        if m.id_taller == usuario.id_ultimo_taller:
            return m
    return sorted(activas, key=lambda m: m.id_taller)[0]


def resolver_tenant(db: Session, token: str | None, codigo: str | None) -> tuple:
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            payload = None
        if payload:
            tid = payload.get("tid")
            sub = payload.get("sub", "") or ""
            if tid is not None:
                return (MODO_TALLER, int(tid))
            if sub.startswith("cliente:") or sub.startswith("chatbot:"):
                try:
                    id_cliente = int(sub.split(":", 1)[1])
                except ValueError:
                    id_cliente = None
                cliente = (
                    db.query(models.Cliente).execution_options(sin_filtro_taller=True)
                    .filter(models.Cliente.id_cliente == id_cliente).first()
                ) if id_cliente else None
                if cliente and cliente.id_taller:
                    return (MODO_TALLER, cliente.id_taller)
            else:
                usuario = db.query(models.Usuario).filter(models.Usuario.username == sub).first()
                if usuario:
                    m = membresia_preferida(usuario)
                    if m:
                        return (MODO_TALLER, m.id_taller)
                    if usuario.es_superadmin:
                        return (MODO_SUPERADMIN, None)
    if codigo:
        taller = buscar_taller_por_codigo(db, codigo)
        if taller:
            return (MODO_TALLER, taller.id_taller)
        raise HTTPException(status_code=404, detail="No encontramos un taller con ese código. Revisa el QR o pide uno nuevo al taller.")
    ids = [t for (t,) in db.query(models.Taller.id_taller).limit(2).all()]
    if len(ids) == 1:
        return (MODO_TALLER, ids[0])
    return (MODO_NINGUNO, None)


def preparar_sesion(db: Session, request: Request | None):
    """Fija el taller de la sesión y aplica las reglas de la suscripción."""
    fijar_tenant(db, MODO_SUPERADMIN)  # para leer las tablas globales al resolver
    modo, tid = resolver_tenant(db, token_de_request(request), codigo_de_request(request))
    fijar_tenant(db, modo, tid)
    db.info["estado_suscripcion"] = None
    if request is not None:
        request.state.id_taller = tid if modo == MODO_TALLER else None
    if modo != MODO_TALLER:
        return
    from .suscripciones import estado_taller

    info = estado_taller(db, tid)
    db.info["estado_suscripcion"] = info
    if info is None or request is None:
        return
    ruta = request.url.path
    if any(ruta.startswith(r) for r in RUTAS_SIEMPRE_PERMITIDAS):
        return
    if info["bloqueado"]:
        raise HTTPException(status_code=402, detail=info["mensaje"] or "Suscripción suspendida.")
    if info["solo_lectura"] and request.method not in METODOS_LECTURA:
        raise HTTPException(status_code=402, detail=info["mensaje"] or "Suscripción vencida: solo consulta.")
    if ruta.startswith("/api/portal-cliente") and info["modulos"] is not None and "app_movil" not in info["modulos"]:
        raise HTTPException(status_code=403, detail="Este taller no tiene habilitada la app de clientes.")


def sesion_desde_token(token: str | None, codigo: str | None = None):
    """Para los WebSockets (no pasan por get_db)."""
    from .database import SessionLocal

    db = SessionLocal()
    fijar_tenant(db, MODO_SUPERADMIN)
    try:
        modo, tid = resolver_tenant(db, token, codigo)
    except HTTPException:
        modo, tid = MODO_NINGUNO, None
    fijar_tenant(db, modo, tid)
    return db, (tid if modo == MODO_TALLER else None)
