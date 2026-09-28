from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/herramientas", tags=["herramientas"])


@router.get("/", response_model=list[schemas.HerramientaInventarioOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("herramientas.ver"))):
    return db.query(models.HerramientaInventario).order_by(models.HerramientaInventario.nombre_herramienta).all()


@router.get("/{herramienta_id}", response_model=schemas.HerramientaInventarioOut)
def obtener(herramienta_id: int, db: Session = Depends(get_db), user=Depends(require_permission("herramientas.ver"))):
    item = db.query(models.HerramientaInventario).filter(models.HerramientaInventario.id_herramienta == herramienta_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    return item


@router.post("/", response_model=schemas.HerramientaInventarioOut, status_code=201)
def crear(payload: schemas.HerramientaInventarioIn, db: Session = Depends(get_db), user=Depends(require_permission("herramientas.crear"))):
    item = models.HerramientaInventario(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{herramienta_id}", response_model=schemas.HerramientaInventarioOut)
def actualizar(herramienta_id: int, payload: schemas.HerramientaInventarioIn, db: Session = Depends(get_db), user=Depends(require_permission("herramientas.editar"))):
    item = db.query(models.HerramientaInventario).filter(models.HerramientaInventario.id_herramienta == herramienta_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{herramienta_id}", status_code=204)
def eliminar(herramienta_id: int, db: Session = Depends(get_db), user=Depends(require_permission("herramientas.eliminar"))):
    item = db.query(models.HerramientaInventario).filter(models.HerramientaInventario.id_herramienta == herramienta_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    db.delete(item)
    db.commit()
    return None
