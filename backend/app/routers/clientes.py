import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission, generar_codigo_invitacion
from datetime import datetime

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


def _consulta(db: Session, q: Optional[str], solo_activos: bool):
    query = db.query(models.Cliente)
    if solo_activos:
        query = query.filter(models.Cliente.status_cliente == 1)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                models.Cliente.nombre_cliente.ilike(like),
                models.Cliente.paterno_cliente.ilike(like),
                models.Cliente.materno_cliente.ilike(like),
                models.Cliente.empresa_cliente.ilike(like),
                models.Cliente.telefono1.ilike(like),
                models.Cliente.correo_cliente.ilike(like),
                models.Cliente.numero_cuenta.ilike(like),
            )
        )
    return query


@router.get("/conteo")
def conteo(
    q: Optional[str] = None,
    solo_activos: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_permission("clientes.ver")),
):
    """Totales para las tarjetas de la pantalla de clientes sin traer la lista completa."""
    sub = _consulta(db, q, solo_activos).with_entities(
        func.count(models.Cliente.id_cliente), func.sum(case((models.Cliente.cuenta_activada.is_(True), 1), else_=0))
    ).order_by(None).one()  # una sola consulta para ambos totales
    return {"total": int(sub[0] or 0), "activados": int(sub[1] or 0)}


@router.get("/", response_model=list[schemas.ClienteOut])
def listar(
    q: Optional[str] = None,
    solo_activos: bool = False,
    limite: Optional[int] = Query(None, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("clientes.ver")),
):
    query = _consulta(db, q, solo_activos)
    query = query.order_by(models.Cliente.nombre_cliente, models.Cliente.id_cliente)
    if limite:
        query = query.offset(offset).limit(limite)
    return query.all()


@router.get("/{cliente_id}", response_model=schemas.ClienteOut)
def obtener(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.ver"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return cliente


@router.get("/{cliente_id}/vehiculos", response_model=list[schemas.VehiculoOut])
def vehiculos_del_cliente(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.ver"))):
    return db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente_id).all()


def _validar_cliente_no_duplicado(db: Session, nombre_cliente: str, telefono1: Optional[str], excluir_id: Optional[int] = None):
    """La llave de un cliente es nombre + teléfono: evita dar de alta el
    mismo cliente dos veces (p.ej. por error de captura) si ya existe uno
    activo con ese mismo nombre y teléfono."""
    if not telefono1:
        return
    query = db.query(models.Cliente).filter(
        models.Cliente.nombre_cliente.ilike(nombre_cliente.strip()),
        models.Cliente.telefono1 == telefono1.strip(),
        models.Cliente.status_cliente == 1,
    )
    if excluir_id:
        query = query.filter(models.Cliente.id_cliente != excluir_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Ya existe un cliente con ese nombre y teléfono.")


@router.post("/", response_model=schemas.ClienteOut, status_code=201)
def crear(payload: schemas.ClienteIn, db: Session = Depends(get_db), user=Depends(require_permission("clientes.crear"))):
    _validar_cliente_no_duplicado(db, payload.nombre_cliente, payload.telefono1)
    # La cuenta única se arma a partir del id definitivo del cliente (CTE-000001),
    # así que se inserta primero con un valor temporal único y se corrige
    # dentro de la misma transacción antes de confirmar.
    cliente = models.Cliente(numero_cuenta=f"TMP-{uuid.uuid4().hex[:12]}", **payload.model_dump())
    db.add(cliente)
    db.flush()
    cliente.numero_cuenta = f"CTE-{cliente.id_cliente:06d}"
    db.commit()
    db.refresh(cliente)
    return cliente


@router.put("/{cliente_id}", response_model=schemas.ClienteOut)
def actualizar(cliente_id: int, payload: schemas.ClienteIn, db: Session = Depends(get_db), user=Depends(require_permission("clientes.editar"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    _validar_cliente_no_duplicado(db, payload.nombre_cliente, payload.telefono1, excluir_id=cliente_id)
    for key, value in payload.model_dump().items():
        setattr(cliente, key, value)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=204)
def eliminar(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.eliminar"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    # Baja lógica en vez de borrar, para no perder historial de servicios
    # ni invalidar la cuenta única (numero_cuenta) que pudiera estar citada
    # en recibos ya entregados.
    cliente.status_cliente = 0
    db.commit()
    return None


@router.post("/{cliente_id}/invitar", response_model=schemas.InvitacionOut)
def invitar_a_app(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("clientes.editar"))):
    """Genera (o regenera) el código de invitación para que el cliente
    active su cuenta en la app de clientes. El taller se lo comunica por
    su cuenta (llamada, WhatsApp) — no hay envío automático de SMS."""
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if not cliente.telefono1 and not cliente.correo_cliente:
        raise HTTPException(status_code=400, detail="El cliente necesita al menos un teléfono o correo registrado para poder activar su cuenta.")

    cliente.codigo_invitacion = generar_codigo_invitacion()
    cliente.fecha_invitacion = datetime.utcnow()
    cliente.cuenta_activada = False  # si ya tenía cuenta, un nuevo código la reinicia
    db.commit()
    return schemas.InvitacionOut(codigo_invitacion=cliente.codigo_invitacion, telefono1=cliente.telefono1, correo_cliente=cliente.correo_cliente)
