import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/vehiculos", tags=["vehículos"])


@router.get("/", response_model=list[schemas.VehiculoConClienteOut])
def listar(
    id_cliente: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("vehiculos.ver")),
):
    query = db.query(models.Vehiculo).options(joinedload(models.Vehiculo.cliente))
    if id_cliente:
        query = query.filter(models.Vehiculo.id_cliente == id_cliente)
    if q:
        query = query.filter(models.Vehiculo.placas_vehiculo.ilike(f"%{q}%"))
    return query.order_by(models.Vehiculo.id_vehiculo.desc()).all()


@router.get("/{vehiculo_id}", response_model=schemas.VehiculoConClienteOut)
def obtener(vehiculo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.ver"))):
    vehiculo = (
        db.query(models.Vehiculo)
        .options(joinedload(models.Vehiculo.cliente))
        .filter(models.Vehiculo.id_vehiculo == vehiculo_id)
        .first()
    )
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return vehiculo


def _generar_numero_cuenta_vehiculo(db: Session, cliente: models.Cliente) -> str:
    """Cuenta del vehículo, casada 1 a 1 con la cuenta del cliente:
    <cuenta-del-cliente>-<consecutivo de 2 dígitos>, ej. CTE-000001-01."""
    total_previos = (
        db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente.id_cliente).count()
    )
    sub_indice = total_previos + 1
    numero_cuenta = f"{cliente.numero_cuenta}-{sub_indice:02d}"
    # Salvaguarda ante huecos por vehículos eliminados previamente
    while db.query(models.Vehiculo).filter(models.Vehiculo.numero_cuenta == numero_cuenta).first():
        sub_indice += 1
        numero_cuenta = f"{cliente.numero_cuenta}-{sub_indice:02d}"
    return numero_cuenta


@router.post("/", response_model=schemas.VehiculoOut, status_code=201)
def crear(payload: schemas.VehiculoIn, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.crear"))):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == payload.id_cliente).first()
    if not cliente:
        raise HTTPException(status_code=400, detail="El cliente indicado no existe")
    numero_cuenta = _generar_numero_cuenta_vehiculo(db, cliente)
    vehiculo = models.Vehiculo(numero_cuenta=numero_cuenta, **payload.model_dump())
    db.add(vehiculo)
    db.commit()
    db.refresh(vehiculo)
    return vehiculo


@router.put("/{vehiculo_id}", response_model=schemas.VehiculoOut)
def actualizar(vehiculo_id: int, payload: schemas.VehiculoIn, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.editar"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == vehiculo_id).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    if payload.id_cliente != vehiculo.id_cliente:
        raise HTTPException(
            status_code=400,
            detail="No se puede reasignar el vehículo a otro cliente: su cuenta única quedaría inconsistente. Da de baja este vehículo y créalo de nuevo bajo el otro cliente.",
        )
    for key, value in payload.model_dump().items():
        setattr(vehiculo, key, value)
    db.commit()
    db.refresh(vehiculo)
    return vehiculo


@router.delete("/{vehiculo_id}", status_code=204)
def eliminar(vehiculo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.eliminar"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == vehiculo_id).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    tiene_servicios = db.query(models.Servicio).filter(models.Servicio.id_vehiculo == vehiculo_id).first()
    if tiene_servicios:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: el vehículo tiene órdenes de servicio en su historial.",
        )
    db.delete(vehiculo)
    db.commit()
    return None
