"""Paquetes de servicio: plantillas reutilizables (Afinación, Frenos, etc.).

Un paquete es una lista de conceptos (refacciones del catálogo y/o mano de
obra / conceptos libres) que se agrega de golpe a una orden. Los precios de las
refacciones NO se guardan: se toman del catálogo/inventario al aplicar el
paquete, así el paquete nunca queda con precios viejos. La mano de obra sí
guarda su precio unitario.
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..security import require_permission

router = APIRouter(prefix="/api/paquetes-servicio", tags=["paquetes-servicio"])


class ConceptoPaquete(BaseModel):
    id_refaccion: Optional[int] = None
    descripcion: Optional[str] = Field(None, max_length=255)
    cantidad: int = Field(1, ge=1, le=999)
    costo_mano_obra: float = Field(0, ge=0, le=1_000_000)  # unitario
    costo_refaccion: float = Field(0, ge=0, le=1_000_000)  # unitario, solo para conceptos libres


class PaqueteIn(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=255)
    conceptos: List[ConceptoPaquete] = Field(..., min_length=1, max_length=60)


def _salida(p: models.PaqueteServicio) -> dict:
    try:
        conceptos = json.loads(p.conceptos or "[]")
    except ValueError:
        conceptos = []
    return {
        "id_paquete": p.id_paquete,
        "nombre": p.nombre,
        "descripcion": p.descripcion,
        "conceptos": conceptos,
        "creado_en": p.creado_en,
    }


def _validar(db: Session, datos: PaqueteIn) -> str:
    ids = {c.id_refaccion for c in datos.conceptos if c.id_refaccion}
    if ids:
        existentes = {r[0] for r in db.query(models.Refaccion.id_refaccion).filter(models.Refaccion.id_refaccion.in_(ids)).all()}
        faltan = ids - existentes
        if faltan:
            raise HTTPException(status_code=400, detail="Alguna refacción del paquete ya no existe en el catálogo.")
    return json.dumps([c.model_dump() for c in datos.conceptos], ensure_ascii=False)


def _duplicado(db: Session, nombre: str, excepto: Optional[int] = None) -> bool:
    q = db.query(models.PaqueteServicio).filter(models.PaqueteServicio.nombre.ilike(nombre.strip()))
    if excepto:
        q = q.filter(models.PaqueteServicio.id_paquete != excepto)
    return q.first() is not None


@router.get("/")
def listar(db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    filas = db.query(models.PaqueteServicio).order_by(models.PaqueteServicio.nombre).all()
    return [_salida(p) for p in filas]


@router.post("/", status_code=201)
def crear(datos: PaqueteIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    nombre = datos.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Ponle un nombre al paquete.")
    if _duplicado(db, nombre):
        raise HTTPException(status_code=409, detail=f"Ya existe un paquete llamado «{nombre}».")
    p = models.PaqueteServicio(nombre=nombre, descripcion=(datos.descripcion or "").strip() or None,
                               conceptos=_validar(db, datos), creado_por=user.username)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _salida(p)


@router.put("/{id_paquete}")
def actualizar(id_paquete: int, datos: PaqueteIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    p = db.query(models.PaqueteServicio).filter(models.PaqueteServicio.id_paquete == id_paquete).first()
    if not p:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    nombre = datos.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Ponle un nombre al paquete.")
    if _duplicado(db, nombre, excepto=id_paquete):
        raise HTTPException(status_code=409, detail=f"Ya existe un paquete llamado «{nombre}».")
    p.nombre = nombre
    p.descripcion = (datos.descripcion or "").strip() or None
    p.conceptos = _validar(db, datos)
    db.commit()
    db.refresh(p)
    return _salida(p)


@router.delete("/{id_paquete}")
def borrar(id_paquete: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    p = db.query(models.PaqueteServicio).filter(models.PaqueteServicio.id_paquete == id_paquete).first()
    if not p:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    db.delete(p)
    db.commit()
    return {"ok": True}
