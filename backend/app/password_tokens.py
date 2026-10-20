"""
Enlaces de "crear tu contraseña" (alta de usuario) y "restablecer
contraseña" (self-service, por correo) para Usuario — personal del taller
y súper administradores. Los clientes finales (app móvil de clientes) no
usan esto.

Son JWT firmados (no cifrados) reutilizando el mismo SECRET_KEY/ALGORITHM
que ya usa el resto del sistema para las sesiones — así no se agrega una
dependencia nueva. No se guardan en base de datos: un enlace se invalida
solo por tres vías, sin tener que recordar nada:
  - se vence (72h para "crear tu contraseña", 24h para "restablecer")
  - la contraseña del usuario ya cambió desde que se mandó (la "huella",
    un pedazo del hash, ya no coincide)
  - el usuario quedó desactivado
"""
import hashlib
import os
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from . import models
from .sesion_taller import SECRET_KEY, ALGORITHM

SETUP_TOKEN_HOURS = int(os.getenv("SETUP_TOKEN_HOURS", "72"))
RESET_TOKEN_HOURS = int(os.getenv("RESET_TOKEN_HOURS", "24"))

TIPO_SETUP = "setup"
TIPO_RESET = "reset"


def _huella(hashed_password: str) -> str:
    return hashlib.sha256((hashed_password or "").encode()).hexdigest()[:16]


def generar_token(usuario: models.Usuario, tipo: str) -> str:
    horas = SETUP_TOKEN_HOURS if tipo == TIPO_SETUP else RESET_TOKEN_HOURS
    datos = {
        "sub": f"pwd:{usuario.id_usuario}",
        "tipo": tipo,
        "h": _huella(usuario.hashed_password),
        "exp": datetime.now(timezone.utc) + timedelta(hours=horas),
    }
    return jwt.encode(datos, SECRET_KEY, algorithm=ALGORITHM)


def leer_token(db: Session, token: str):
    """Devuelve (usuario, tipo) si el enlace sigue siendo válido, o
    (None, None) si ya venció, ya se usó (la contraseña cambió) o el
    usuario está desactivado. Nunca lanza excepción."""
    try:
        datos = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = datos.get("sub", "")
        if not sub.startswith("pwd:"):
            return None, None
        id_usuario = int(sub.split(":", 1)[1])
        tipo = datos.get("tipo")
    except (JWTError, ValueError):
        return None, None

    usuario = db.query(models.Usuario).filter(models.Usuario.id_usuario == id_usuario).first()
    if not usuario or not usuario.activo:
        return None, None
    if _huella(usuario.hashed_password) != datos.get("h"):
        return None, None
    return usuario, tipo


def horas_de(tipo: str) -> int:
    return SETUP_TOKEN_HOURS if tipo == TIPO_SETUP else RESET_TOKEN_HOURS
