"""
Inspección digital: checklist con fotos (las fotos usan el mismo sistema
genérico de /api/fotos, con entidad_tipo="inspeccion") antes o durante el
servicio. Cada punto marcado "mal" se puede ligar a una refacción sugerida,
para no tener que volver a buscarla al armar los conceptos de la orden.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/inspecciones", tags=["inspecciones"])


@router.get("/items", response_model=list[schemas.InspeccionItemOut])
def listar_items(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """El catálogo de puntos a revisar, agrupado por categoría — lo
    consume la pantalla de captura para armar el checklist."""
    return (
        db.query(models.InspeccionItem)
        .filter(models.InspeccionItem.activo == True)
        .order_by(models.InspeccionItem.categoria, models.InspeccionItem.orden)
        .all()
    )


@router.get("/", response_model=list[schemas.InspeccionOut])
def listar(id_vehiculo: int = None, id_servicio: int = None, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    query = db.query(models.Inspeccion).options(
        joinedload(models.Inspeccion.resultados).joinedload(models.InspeccionResultado.item),
        joinedload(models.Inspeccion.vehiculo),
    )
    if id_vehiculo:
        query = query.filter(models.Inspeccion.id_vehiculo == id_vehiculo)
    if id_servicio:
        query = query.filter(models.Inspeccion.id_servicio == id_servicio)
    return query.order_by(models.Inspeccion.fecha.desc()).all()


@router.get("/{inspeccion_id}", response_model=schemas.InspeccionOut)
def obtener(inspeccion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    inspeccion = (
        db.query(models.Inspeccion)
        .options(
            joinedload(models.Inspeccion.resultados).joinedload(models.InspeccionResultado.item),
            joinedload(models.Inspeccion.vehiculo),
        )
        .filter(models.Inspeccion.id_inspeccion == inspeccion_id)
        .first()
    )
    if not inspeccion:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return inspeccion


@router.post("/", response_model=schemas.InspeccionOut, status_code=201)
def crear(payload: schemas.InspeccionIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == payload.id_vehiculo).first()
    if not vehiculo:
        raise HTTPException(status_code=400, detail="El vehículo indicado no existe")

    inspeccion = models.Inspeccion(
        id_vehiculo=payload.id_vehiculo,
        id_servicio=payload.id_servicio,
        comentario_general=payload.comentario_general,
        realizada_por=user.username,
    )
    db.add(inspeccion)
    db.flush()

    for r in payload.resultados:
        db.add(models.InspeccionResultado(
            id_inspeccion=inspeccion.id_inspeccion,
            id_item=r.id_item,
            estado=r.estado,
            comentario=r.comentario,
            id_refaccion_sugerida=r.id_refaccion_sugerida,
        ))
    db.commit()

    return obtener(inspeccion.id_inspeccion, db, user)


@router.put("/{inspeccion_id}", response_model=schemas.InspeccionOut)
def actualizar(inspeccion_id: int, payload: schemas.InspeccionIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    """Reemplaza los resultados de la inspección (más simple que hacer un
    diff punto por punto — una inspección se corrige completa, no a medias)."""
    inspeccion = db.query(models.Inspeccion).filter(models.Inspeccion.id_inspeccion == inspeccion_id).first()
    if not inspeccion:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    inspeccion.comentario_general = payload.comentario_general
    if payload.id_servicio:
        inspeccion.id_servicio = payload.id_servicio

    db.query(models.InspeccionResultado).filter(models.InspeccionResultado.id_inspeccion == inspeccion_id).delete()
    for r in payload.resultados:
        db.add(models.InspeccionResultado(
            id_inspeccion=inspeccion_id, id_item=r.id_item, estado=r.estado,
            comentario=r.comentario, id_refaccion_sugerida=r.id_refaccion_sugerida,
        ))
    db.commit()
    return obtener(inspeccion_id, db, user)
