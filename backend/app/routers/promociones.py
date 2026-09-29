"""
Promociones — el taller las crea desde el panel/app, y aparecen en el
inicio de la app de clientes. La imagen se sube igual que las fotos (mismo
directorio `app/uploads/`, sin depender de ningún servicio externo).
"""
import os
import shutil
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..subida_archivos import leer_y_validar_imagen, nombre_unico, guardar
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/promociones", tags=["promociones"])

CARPETA_UPLOADS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
EXTENSIONES_VALIDAS = {".jpg", ".jpeg", ".png", ".webp"}


@router.get("/", response_model=list[schemas.PromocionOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("promociones.ver"))):
    """Todas las promociones (activas e inactivas) — para administrarlas.
    Lo que ve el cliente es un endpoint aparte (ver portal_cliente.py)."""
    return db.query(models.Promocion).order_by(models.Promocion.orden, models.Promocion.fecha_creacion.desc()).all()


@router.post("/", response_model=schemas.PromocionOut, status_code=201)
def crear(payload: schemas.PromocionIn, db: Session = Depends(get_db), user=Depends(require_permission("promociones.crear"))):
    promo = models.Promocion(**payload.model_dump(), creada_por=user.username)
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return promo


@router.put("/{promocion_id}", response_model=schemas.PromocionOut)
def actualizar(promocion_id: int, payload: schemas.PromocionIn, db: Session = Depends(get_db), user=Depends(require_permission("promociones.editar"))):
    promo = db.query(models.Promocion).filter(models.Promocion.id_promocion == promocion_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")
    for key, value in payload.model_dump().items():
        setattr(promo, key, value)
    db.commit()
    db.refresh(promo)
    return promo


@router.delete("/{promocion_id}", status_code=204)
def eliminar(promocion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("promociones.eliminar"))):
    promo = db.query(models.Promocion).filter(models.Promocion.id_promocion == promocion_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")
    if promo.ruta_imagen:
        ruta = os.path.join(CARPETA_UPLOADS, promo.ruta_imagen)
        if os.path.exists(ruta):
            os.remove(ruta)
    db.delete(promo)
    db.commit()
    return None


@router.post("/{promocion_id}/imagen", response_model=schemas.PromocionOut)
async def subir_imagen(promocion_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db), user=Depends(require_permission("promociones.editar"))):
    promo = db.query(models.Promocion).filter(models.Promocion.id_promocion == promocion_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")

    contenido, extension = await leer_y_validar_imagen(archivo)

    if promo.ruta_imagen:
        ruta_vieja = os.path.join(CARPETA_UPLOADS, promo.ruta_imagen)
        if os.path.exists(ruta_vieja):
            os.remove(ruta_vieja)

    nombre_archivo = nombre_unico(f"promocion_{promocion_id}", extension)
    guardar(CARPETA_UPLOADS, nombre_archivo, contenido)

    promo.ruta_imagen = nombre_archivo
    db.commit()
    db.refresh(promo)
    return promo
