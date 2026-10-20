import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/vehiculos", tags=["vehículos"])


def _con_ultimo_servicio(db: Session, vehiculos: list[models.Vehiculo]) -> list[models.Vehiculo]:
    """Le pega a cada vehículo los datos de su orden más reciente — lo usa
    la vista "Por cliente" para ordenar por a quién le hicieron servicio
    hace menos tiempo."""
    ids = [v.id_vehiculo for v in vehiculos]
    if not ids:
        return vehiculos
    servicios = (
        db.query(models.Servicio)
        .filter(models.Servicio.id_vehiculo.in_(ids))
        .order_by(models.Servicio.id_vehiculo, models.Servicio.fecha_entrada_servicio.desc())
        .all()
    )
    ultimos: dict[int, models.Servicio] = {}
    conteos: dict[int, int] = {}
    for s in servicios:
        conteos[s.id_vehiculo] = conteos.get(s.id_vehiculo, 0) + 1
        if s.id_vehiculo not in ultimos:
            ultimos[s.id_vehiculo] = s
    for v in vehiculos:
        s = ultimos.get(v.id_vehiculo)
        v.fecha_ultimo_servicio = s.fecha_entrada_servicio if s else None
        v.etapa_ultimo_servicio = s.etapa if s else None
        v.status_ultimo_servicio = s.status if s else None
        v.total_servicios = conteos.get(v.id_vehiculo, 0)
    return vehiculos


def _con_foto_principal(db: Session, vehiculos: list[models.Vehiculo]) -> list[models.Vehiculo]:
    """Deja en vehiculo.foto_principal la ruta de su foto más reciente (o
    None) — una sola consulta para toda la lista, para que la vista en
    cuadros pueda mostrarla sin pedir /fotos/ por cada tarjeta."""
    ids = [v.id_vehiculo for v in vehiculos]
    if not ids:
        return vehiculos
    fotos = (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == "vehiculo", models.Foto.entidad_id.in_(ids))
        .order_by(models.Foto.fecha.desc())
        .all()
    )
    mas_reciente: dict[int, str] = {}
    for foto in fotos:
        mas_reciente.setdefault(foto.entidad_id, foto.ruta_archivo)
    for v in vehiculos:
        v.foto_principal = f"/uploads/{mas_reciente[v.id_vehiculo]}" if v.id_vehiculo in mas_reciente else None
    return vehiculos


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
    vehiculos = query.order_by(models.Vehiculo.id_vehiculo.desc()).all()
    vehiculos = _con_ultimo_servicio(db, vehiculos)
    return _con_foto_principal(db, vehiculos)


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
    _con_foto_principal(db, [vehiculo])
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
