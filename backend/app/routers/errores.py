from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..errores import MENSAJE_SOPORTE, registrar_error
from ..rate_limit import limiter
from ..security import require_permission

router = APIRouter(prefix="/api/errores", tags=["errores"])


class ErrorClienteIn(BaseModel):
    mensaje: str
    pantalla: str | None = None
    origen: str = "app_movil"  # app_movil | web
    detalle: str | None = None


@router.post("/cliente")
@limiter.limit("30/minute")
def reportar_desde_app(request: Request, payload: ErrorClienteIn, db: Session = Depends(get_db)):
    """Las apps reportan aquí los errores que atrapan (se guardan en el log del taller)."""
    codigo = registrar_error(
        request, None, status=0, origen=payload.origen if payload.origen in ("app_movil", "web") else "app_movil",
        mensaje=f"[{payload.pantalla or '-'}] {payload.mensaje}"[:500], detalle=(payload.detalle or "")[:4000],
    )
    return {"codigo": codigo, "detail": MENSAJE_SOPORTE.format(codigo=codigo)}


@router.get("/")
def listar(limit: int = 100, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    filas = db.query(models.ErrorSistema).order_by(models.ErrorSistema.fecha.desc()).limit(min(limit, 500)).all()
    return [
        {"id_error": e.id_error, "codigo": e.codigo, "fecha": e.fecha, "origen": e.origen, "metodo": e.metodo,
         "ruta": e.ruta, "status": e.status, "usuario": e.usuario, "mensaje": e.mensaje, "detalle": e.detalle}
        for e in filas
    ]
