"""
Avisos para el personal del taller (ver Notificacion en models.py). Hoy la
única fuente es el chat del cliente (portal_cliente.py crea el registro ahí
mismo cuando llega un mensaje o alerta); este router solo expone lectura.

No hay tabla de "leído por usuario" — se compara la fecha de cada aviso
contra `notificaciones_vistas_hasta` de quien pregunta (se actualiza con
POST /marcar-vistas), y es compartido por todo el taller: si alguien ya
las vio, se marcan vistas para todos. Suficiente para un equipo chico que
comparte el mismo panel de órdenes; si hace falta lectura por persona más
adelante, aquí es donde se agregaría una tabla intermedia.
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user

router = APIRouter(prefix="/api/notificaciones", tags=["notificaciones"])


@router.get("/", response_model=list[schemas.NotificacionOut])
def listar(limit: int = 30, db: Session = Depends(get_db), user=Depends(get_current_user)):
    vistas_hasta = user.membresia().notificaciones_vistas_hasta
    notificaciones = (
        db.query(models.Notificacion)
        .order_by(models.Notificacion.fecha.desc())
        .limit(min(limit, 100))
        .all()
    )
    salida = []
    for n in notificaciones:
        item = schemas.NotificacionOut.model_validate(n)
        item.leida = bool(vistas_hasta and n.fecha <= vistas_hasta)
        salida.append(item)
    return salida


@router.get("/conteo", response_model=schemas.ConteoNotificacionesOut)
def conteo(db: Session = Depends(get_db), user=Depends(get_current_user)):
    query = db.query(models.Notificacion)
    vistas_hasta = user.membresia().notificaciones_vistas_hasta
    if vistas_hasta:
        query = query.filter(models.Notificacion.fecha > vistas_hasta)
    return schemas.ConteoNotificacionesOut(no_leidas=query.count())


@router.post("/marcar-vistas", response_model=schemas.ConteoNotificacionesOut)
def marcar_vistas(db: Session = Depends(get_db), user=Depends(get_current_user)):
    user.membresia().notificaciones_vistas_hasta = datetime.utcnow()
    db.commit()
    return schemas.ConteoNotificacionesOut(no_leidas=0)
