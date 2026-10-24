from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..auditoria import ahora_utc
from ..database import get_db
from ..schemas import ORMBase
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/auditoria", tags=["auditoría"])


class RegistroAuditoriaOut(ORMBase):
    id_registro: int
    fecha: datetime
    usuario: Optional[str] = None
    entidad: str
    id_entidad: Optional[int] = None
    accion: str
    campo: Optional[str] = None
    valor_anterior: Optional[str] = None
    valor_nuevo: Optional[str] = None
    motivo: Optional[str] = None
    sospechosa: bool = False
    alerta: Optional[str] = None


class HoraServidorOut(BaseModel):
    utc: str


@router.get("/hora", response_model=HoraServidorOut)
def hora_servidor(user=Depends(get_current_user)):
    """Hora oficial (UTC) del servidor: el calendario la usa para detectar relojes desfasados."""
    return {"utc": ahora_utc().strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"}


@router.get("/", response_model=list[RegistroAuditoriaOut])
def listar(
    solo_sospechosas: bool = False,
    entidad: Optional[str] = None,
    id_entidad: Optional[int] = None,
    limite: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    user=Depends(require_permission("auditoria.ver")),
):
    """Reporte de excepciones para el dueño. Solo lectura: la bitácora no se edita ni se borra."""
    q = db.query(models.BitacoraAuditoria)
    if solo_sospechosas:
        q = q.filter(models.BitacoraAuditoria.sospechosa == True)  # noqa: E712
    if entidad:
        q = q.filter(models.BitacoraAuditoria.entidad == entidad)
    if id_entidad is not None:
        q = q.filter(models.BitacoraAuditoria.id_entidad == id_entidad)
    return q.order_by(models.BitacoraAuditoria.id_registro.desc()).limit(limite).all()


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), user=Depends(require_permission("auditoria.ver"))):
    """Conteo de alertas para el aviso en el panel."""
    total = db.query(models.BitacoraAuditoria).filter(models.BitacoraAuditoria.sospechosa == True).count()  # noqa: E712
    return {"sospechosas": total}
