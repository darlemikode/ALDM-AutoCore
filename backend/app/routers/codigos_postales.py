from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user

router = APIRouter(prefix="/api/codigos-postales", tags=["códigos postales"])


@router.get("/{cp}", response_model=schemas.ConsultaCodigoPostal)
def consultar_cp(cp: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Dado un CP, regresa estado/municipio/ciudad y la lista de colonias
    (asentamientos) para autollenar el formulario de dirección.

    Nota de alcance: el catálogo cargado por ahora solo cubre León,
    Guanajuato (prueba piloto) — ver `models.CodigoPostal` para más detalle.
    """
    filas = db.query(models.CodigoPostal).filter(models.CodigoPostal.cp == cp).all()
    if not filas:
        raise HTTPException(status_code=404, detail="No se encontró ese código postal en el catálogo cargado (por ahora solo León, GTO).")

    primera = filas[0]
    return schemas.ConsultaCodigoPostal(
        cp=cp,
        estado=primera.estado,
        municipio=primera.municipio,
        ciudad=primera.ciudad,
        colonias=sorted({f.asentamiento for f in filas}),
    )
