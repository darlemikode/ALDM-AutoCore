from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..push_notifications import enviar_push
from ..security import require_permission

router = APIRouter(prefix="/api/citas", tags=["citas"])


@router.get("/", response_model=list[schemas.CitaOut])
def listar(estado: str = "pendiente", db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    query = db.query(models.CitaSolicitada).options(
        joinedload(models.CitaSolicitada.cliente), joinedload(models.CitaSolicitada.vehiculo),
    )
    if estado != "todas":
        query = query.filter(models.CitaSolicitada.estado == estado)
    return query.order_by(models.CitaSolicitada.fecha_creacion.desc()).all()


@router.put("/{cita_id}/confirmar", response_model=schemas.CitaOut)
async def confirmar(cita_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    """Confirmar NO crea la orden de servicio sola — el taller la crea
    manualmente cuando el cliente llega (así lo pediste: nada se agenda sin
    que el admin lo vea y decida). Esto solo le avisa al cliente que sí."""
    cita = db.query(models.CitaSolicitada).options(joinedload(models.CitaSolicitada.cliente)).filter(models.CitaSolicitada.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    cita.estado = "confirmada"
    cita.confirmada_por = user.username
    db.commit()
    db.refresh(cita)
    if cita.cliente and cita.cliente.push_token:
        await enviar_push(cita.cliente.push_token, "Tu cita fue confirmada ✅",
                           "El taller confirmó tu cita. Te esperamos.", {"id_cita": cita_id, "tipo": "cita_confirmada"})
    return cita


@router.put("/{cita_id}/rechazar", response_model=schemas.CitaOut)
async def rechazar(cita_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    cita = db.query(models.CitaSolicitada).options(joinedload(models.CitaSolicitada.cliente)).filter(models.CitaSolicitada.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    cita.estado = "rechazada"
    cita.confirmada_por = user.username
    db.commit()
    db.refresh(cita)
    if cita.cliente and cita.cliente.push_token:
        await enviar_push(cita.cliente.push_token, "Tu cita no pudo confirmarse",
                           "El taller no pudo agendar esa cita. Contáctalo para proponer otra fecha.", {"id_cita": cita_id, "tipo": "cita_rechazada"})
    return cita
