"""
Comisiones por tipo de pago — un % por cada tipo (efectivo/tarjeta/mixto),
usado para mostrar la comisión estimada en cada nota/recibo finalizado.
Cualquiera puede leerla; solo quien tiene "configuracion.editar" la cambia.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/comisiones", tags=["comisiones"])

TIPOS_PAGO_VALIDOS = ["efectivo", "tarjeta", "mixto"]


def _sembrar_si_falta(db: Session):
    existentes = {c.tipo_pago for c in db.query(models.ConfiguracionComision).all()}
    faltantes = [t for t in TIPOS_PAGO_VALIDOS if t not in existentes]
    for tipo in faltantes:
        db.add(models.ConfiguracionComision(tipo_pago=tipo, porcentaje=3.5 if tipo == "tarjeta" else 0))
    if faltantes:
        db.commit()


@router.get("/", response_model=list[schemas.ConfiguracionComisionOut])
def listar(db: Session = Depends(get_db), user=Depends(get_current_user)):
    _sembrar_si_falta(db)
    return db.query(models.ConfiguracionComision).all()


@router.put("/{tipo_pago}", response_model=schemas.ConfiguracionComisionOut)
def actualizar(tipo_pago: str, payload: schemas.ConfiguracionComisionIn, db: Session = Depends(get_db), user=Depends(require_permission("configuracion.editar"))):
    _sembrar_si_falta(db)
    config = db.query(models.ConfiguracionComision).filter(models.ConfiguracionComision.tipo_pago == tipo_pago).first()
    if not config:
        return None
    config.porcentaje = payload.porcentaje
    db.commit()
    db.refresh(config)
    return config
