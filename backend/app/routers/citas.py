from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auditoria import hora_local_taller, registrar as registrar_auditoria, offset_valido, TOLERANCIA_RELOJ
from ..database import get_db
from ..push_notifications import enviar_push
from ..vehiculo_utils import orden_abierta_del_vehiculo
from ..security import require_permission

router = APIRouter(prefix="/api/citas", tags=["citas"])


class CitaAgendaIn(BaseModel):
    """Cita agendada por el taller desde el calendario (el título va en `descripcion`)."""
    id_cliente: int
    id_vehiculo: Optional[int] = None
    descripcion: str = Field(min_length=1, max_length=300)
    fecha_propuesta: datetime
    fecha_fin: Optional[datetime] = None
    retroactiva: bool = False                 # el usuario confirmó que la cita es en el pasado
    zona_offset_min: Optional[int] = None     # desfase del equipo respecto a UTC (se valida entre UTC-8 y UTC-5)


def _validar_fecha_cita(db: Session, user, data: "CitaAgendaIn", id_cita=None):
    """La hora que cuenta es la del SERVIDOR. Una cita en el pasado solo se acepta
    si se marca como retroactiva, y queda en la bitácora como sospechosa."""
    ahora_local = hora_local_taller(data.zona_offset_min)
    fecha = data.fecha_propuesta
    if fecha.tzinfo is not None:  # llegó con zona: se pasa a la hora local del taller
        fecha = fecha.astimezone(timezone.utc).replace(tzinfo=None) - (datetime.utcnow() - ahora_local)
    if fecha < ahora_local - TOLERANCIA_RELOJ:
        if not data.retroactiva:
            raise HTTPException(status_code=422, detail="La cita está en el pasado según la hora del servidor. Si es un registro retroactivo, confírmalo.")
        return ("Cita retroactiva (fecha anterior a la hora actual del servidor).", ahora_local)
    return None


def _validar_vehiculo_libre(db: Session, id_vehiculo: int):
    """No se agenda cita para un vehículo que ya está en el taller con una orden abierta."""
    orden = orden_abierta_del_vehiculo(db, id_vehiculo)  # incluye registros duplicados con las mismas placas
    if orden:
        raise HTTPException(
            status_code=409,
            detail=f"Este vehículo ya está en el taller con la orden #{orden.id_servicio} abierta ({orden.nombre_servicio}). "
                   "Cierra o cancela esa orden antes de agendar otra cita.",
        )


@router.get("/", response_model=list[schemas.CitaOut])
def listar(estado: str = "pendiente", db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    query = db.query(models.CitaSolicitada).options(
        joinedload(models.CitaSolicitada.cliente), joinedload(models.CitaSolicitada.vehiculo),
    )
    if estado != "todas":
        query = query.filter(models.CitaSolicitada.estado == estado)
    return query.order_by(models.CitaSolicitada.fecha_creacion.desc()).all()


@router.post("/", response_model=schemas.CitaOut)
def agendar(data: CitaAgendaIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    """El taller agenda una cita directamente (queda confirmada: ya la vio y decidió él)."""
    if not data.descripcion.strip():
        raise HTTPException(status_code=422, detail="Escribe un título para la cita.")
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == data.id_cliente).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if data.fecha_fin is not None and data.fecha_fin <= data.fecha_propuesta:
        raise HTTPException(status_code=422, detail="La hora de fin debe ser posterior a la de inicio.")
    if data.id_vehiculo is not None:
        vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == data.id_vehiculo).first()
        if not vehiculo:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        if vehiculo.id_cliente and vehiculo.id_cliente != data.id_cliente:
            raise HTTPException(status_code=422, detail="Ese vehículo no pertenece al cliente elegido.")
        _validar_vehiculo_libre(db, data.id_vehiculo)
    retro = _validar_fecha_cita(db, user, data)
    cita = models.CitaSolicitada(
        id_cliente=data.id_cliente, id_vehiculo=data.id_vehiculo, descripcion=data.descripcion.strip(),
        fecha_propuesta=data.fecha_propuesta, fecha_fin=data.fecha_fin, estado="confirmada", confirmada_por=user.username,
    )
    db.add(cita)
    db.flush()
    if retro:
        registrar_auditoria(db, user, "cita", cita.id_cita, "cita_retroactiva", "fecha_propuesta", None, data.fecha_propuesta,
                            f"Hora local del servidor: {retro[1].strftime('%Y-%m-%d %H:%M')}", retro[0])
    db.commit()
    db.refresh(cita)
    return cita


@router.put("/{cita_id}/", response_model=schemas.CitaOut)
def editar(cita_id: int, data: CitaAgendaIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    """El taller edita una cita (título, cliente, vehículo, día y horario)."""
    cita = db.query(models.CitaSolicitada).filter(models.CitaSolicitada.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if not data.descripcion.strip():
        raise HTTPException(status_code=422, detail="Escribe un título para la cita.")
    if not db.query(models.Cliente).filter(models.Cliente.id_cliente == data.id_cliente).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if data.fecha_fin is not None and data.fecha_fin <= data.fecha_propuesta:
        raise HTTPException(status_code=422, detail="La hora de fin debe ser posterior a la de inicio.")
    if data.id_vehiculo is not None:
        vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == data.id_vehiculo).first()
        if not vehiculo:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        if vehiculo.id_cliente and vehiculo.id_cliente != data.id_cliente:
            raise HTTPException(status_code=422, detail="Ese vehículo no pertenece al cliente elegido.")
        if cita.id_vehiculo != data.id_vehiculo:
            _validar_vehiculo_libre(db, data.id_vehiculo)
    if cita.fecha_propuesta != data.fecha_propuesta:  # solo se valida si cambió la fecha
        retro = _validar_fecha_cita(db, user, data, cita_id)
        if retro:
            registrar_auditoria(db, user, "cita", cita_id, "cita_retroactiva", "fecha_propuesta", cita.fecha_propuesta, data.fecha_propuesta,
                                f"Hora local del servidor: {retro[1].strftime('%Y-%m-%d %H:%M')}", retro[0])
    cita.id_cliente = data.id_cliente
    cita.id_vehiculo = data.id_vehiculo
    cita.descripcion = data.descripcion.strip()
    cita.fecha_propuesta = data.fecha_propuesta
    cita.fecha_fin = data.fecha_fin
    db.commit()
    db.refresh(cita)
    return cita


@router.put("/{cita_id}/atender", response_model=schemas.CitaOut)
def atender(cita_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    """La cita ya se convirtió en orden de servicio: deja de ocupar el calendario."""
    cita = db.query(models.CitaSolicitada).filter(models.CitaSolicitada.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if cita.estado in ("cancelada", "rechazada", "atendida"):
        raise HTTPException(status_code=409, detail=f"Esta cita ya está {cita.estado}; no se puede generar otra orden desde ella.")
    cita.estado = "atendida"
    cita.confirmada_por = cita.confirmada_por or user.username
    db.commit()
    db.refresh(cita)
    return cita


@router.put("/{cita_id}/cancelar", response_model=schemas.CitaOut)
async def cancelar(cita_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    cita = db.query(models.CitaSolicitada).options(joinedload(models.CitaSolicitada.cliente)).filter(models.CitaSolicitada.id_cita == cita_id).first()
    if not cita:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    registrar_auditoria(db, user, "cita", cita_id, "cancelacion", "estado", cita.estado, "cancelada")
    cita.estado = "cancelada"
    cita.confirmada_por = user.username
    db.commit()
    db.refresh(cita)
    if cita.cliente and cita.cliente.push_token:
        await enviar_push(cita.cliente.push_token, "Tu cita fue cancelada",
                           "El taller canceló tu cita. Contáctalo para agendar otra fecha.", {"id_cita": cita_id, "tipo": "cita_cancelada"})
    return cita


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
