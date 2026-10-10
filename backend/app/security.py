import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .database import get_db, get_db_global
from . import models
from .sesion_taller import SECRET_KEY, ALGORITHM
from .tenancy import MODO_TALLER, tenant_de
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_user(db: Session, username: str, password: str) -> Optional[models.Usuario]:
    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if not user or not user.activo:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def _decodificar_usuario(token: str, db: Session) -> models.Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar la sesión, inicia sesión de nuevo",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        version = int(payload.get("ver", 0) or 0)
        if username is None or username.startswith("cliente:") or username.startswith("chatbot:"):
            # Es un token de la app de clientes o del chatbot, no de un
            # usuario del taller
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if user is None or not user.activo:
        raise credentials_exception
    if version != (user.version_token or 0):
        # Token emitido antes de un cambio de contraseña: ya no vale
        raise credentials_exception
    return user


def get_current_user_sin_taller(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Usuario:
    """Usuario del taller activo, o súper administrador sin taller (solo
    para /auth/me, /auth/talleres y cambiar contraseña)."""
    user = _decodificar_usuario(token, db)
    modo, tid = tenant_de(db)
    if modo == MODO_TALLER:
        membresia = user.membresia(tid)
        if membresia is None or not membresia.activo:
            raise HTTPException(status_code=403, detail="Tu usuario no tiene acceso a este taller.")
        info = db.info.get("estado_suscripcion")
        user._modulos_activos = info["modulos"] if info else None
    elif not user.es_superadmin:
        raise HTTPException(status_code=403, detail="Tu usuario no tiene ningún taller asignado.")
    return user


def get_current_user(user: models.Usuario = Depends(get_current_user_sin_taller), db: Session = Depends(get_db)) -> models.Usuario:
    """Usuario trabajando DENTRO de un taller (todo lo operativo)."""
    modo, _ = tenant_de(db)
    if modo != MODO_TALLER:
        raise HTTPException(status_code=403, detail="Elige un taller para continuar.")
    return user


def get_current_superadmin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db_global)) -> models.Usuario:
    user = _decodificar_usuario(token, db)
    if not user.es_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta sección es solo para el súper administrador.")
    return user


def invalidar_tokens(user: models.Usuario) -> None:
    """Cierra todas las sesiones abiertas del usuario (web y apps): los
    tokens que ya tenía dejan de servir en su siguiente petición."""
    user.version_token = (user.version_token or 0) + 1


def token_usuario(user: models.Usuario, id_taller: int | None) -> str:
    datos = {"sub": user.username, "ver": user.version_token or 0}
    if id_taller is not None:
        datos["tid"] = id_taller
    return create_access_token(datos)


def generar_codigo_invitacion(longitud: int = 6) -> str:
    """Código numérico corto para que el cliente active su cuenta en la
    app — fácil de dictar por teléfono o mandar por WhatsApp."""
    return "".join(secrets.choice("0123456789") for _ in range(longitud))


def create_client_access_token(id_cliente: int, id_taller: int | None = None) -> str:
    """El 'sub' lleva el prefijo 'cliente:' para que get_current_user (el
    de usuarios del taller) lo rechace de inmediato — son dos mundos de
    acceso completamente separados, aunque compartan el mismo backend."""
    datos = {"sub": f"cliente:{id_cliente}"}
    if id_taller is not None:
        datos["tid"] = id_taller
    return create_access_token(datos)


def create_chatbot_session_token(id_cliente: int, id_taller: int | None = None) -> str:
    """Sesión de solo 20 minutos, exclusiva del chatbot — no sirve para
    entrar a la app de clientes ni al panel del taller. Se emite después de
    verificar identidad con número de cuenta + VIN (sin contraseña), así
    que se mantiene corta a propósito."""
    datos = {"sub": f"chatbot:{id_cliente}"}
    if id_taller is not None:
        datos["tid"] = id_taller
    return create_access_token(datos, expires_delta=timedelta(minutes=20))


def get_current_cliente(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Cliente:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar la sesión, inicia sesión de nuevo",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub: str = payload.get("sub", "")
        if not sub.startswith("cliente:"):
            raise credentials_exception
        id_cliente = int(sub.split(":", 1)[1])
    except (JWTError, ValueError):
        raise credentials_exception

    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first()
    if cliente is None or not cliente.cuenta_activada or cliente.status_cliente != 1:
        raise credentials_exception
    return cliente


def require_permission(clave: str):
    """Fábrica de dependencias: `Depends(require_permission("clientes.eliminar"))`.
    Reemplaza al antiguo `require_admin` — ahora cualquier permiso del
    catálogo puede exigirse punto por punto, según lo que el rol del
    usuario (Dueño/Hijo/Ayudante/o uno personalizado) tenga asignado."""
    def dependencia(user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
        if not user.tiene_permiso(clave):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Este módulo no está incluido en el paquete contratado por el taller."
                    if user.rol is not None and user.rol.tiene_permiso(clave)
                    else f"Tu rol ({user.rol.nombre if user.rol else '—'}) no tiene permiso para esta acción."
                ),
            )
        return user
    return dependencia


def require_superadmin(user: models.Usuario = Depends(get_current_superadmin)) -> models.Usuario:
    """Para la app de súper administración: exige es_superadmin y trabaja
    con una sesión sin filtro de taller (ve todos los talleres)."""
    return user


def generar_password_temporal(longitud: int = 10) -> str:
    """Contraseña temporal legible (sin caracteres ambiguos como 0/O, 1/l),
    para que el admin la pueda dictar o escribir a mano sin confusiones."""
    alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alfabeto) for _ in range(longitud))
