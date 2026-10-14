"""
Consulta de topes de uso del plan Full Garage (Asistente IA, Agente
WhatsApp, CFDI) y su excedente — ver ../consumo.py.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import consumo
from ..database import get_db
from ..security import get_current_user, require_superadmin
from ..tenancy import taller_actual

router = APIRouter(prefix="/api/consumo", tags=["consumo"])


@router.get("/mes")
def mi_consumo(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Consumo del taller en sesión en el mes en curso, con su excedente."""
    id_taller = taller_actual(db)
    if not id_taller:
        return {"id_taller": None, "anio_mes": None, "detalle": {}, "costo_total": 0.0}
    return consumo.resumen_mes(db, id_taller)


@router.get("/superadmin/{id_taller}")
def consumo_de_taller(id_taller: int, anio_mes: str | None = None, db: Session = Depends(get_db), user=Depends(require_superadmin)):
    """Consumo de un taller en un mes dado (para el corte de excedente)."""
    return consumo.resumen_mes(db, id_taller, anio_mes)
