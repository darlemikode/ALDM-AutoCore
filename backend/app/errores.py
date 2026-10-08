"""Errores estándar: el usuario ve un mensaje único con un código de
soporte, y el detalle técnico queda en la bitácora de su taller."""
import traceback
import uuid

from fastapi import Request

from . import models
from .database import sesion_global

MENSAJE_SOPORTE = (
    "Ocurrió un problema en el sistema. Comunícate con soporte de ALDM AutoCore "
    "y menciona el código {codigo}."
)


def _usuario(request: Request | None) -> str | None:
    try:
        from jose import jwt

        from .security import ALGORITHM, SECRET_KEY

        auth = request.headers.get("authorization", "") if request else ""
        if auth.lower().startswith("bearer "):
            return str(jwt.decode(auth[7:], SECRET_KEY, algorithms=[ALGORITHM]).get("sub", ""))[:50] or None
    except Exception:  # noqa: BLE001
        pass
    return None


def registrar_error(request: Request | None, exc: BaseException | None, status: int = 500, origen: str = "servidor",
                    mensaje: str | None = None, detalle: str | None = None, id_taller: int | None = None) -> str:
    """Guarda el error y regresa su código (ERR-XXXXXXXX). Nunca lanza."""
    codigo = "ERR-" + uuid.uuid4().hex[:8].upper()
    try:
        if detalle is None and exc is not None:
            detalle = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-4000:]
        db = sesion_global()
        try:
            db.add(models.ErrorSistema(
                codigo=codigo, origen=origen, status=status,
                id_taller=id_taller if id_taller is not None else getattr(getattr(request, "state", None), "id_taller", None),
                metodo=request.method if request else None,
                ruta=(request.url.path if request else None),
                usuario=_usuario(request),
                mensaje=(mensaje or (f"{type(exc).__name__}: {exc}" if exc else None) or "")[:500],
                detalle=detalle,
            ))
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — la bitácora nunca debe causar otro error
        pass
    return codigo
