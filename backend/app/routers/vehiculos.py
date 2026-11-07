import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/vehiculos", tags=["vehículos"])


def _con_ultimo_servicio(db: Session, vehiculos: list[models.Vehiculo]) -> list[models.Vehiculo]:
    """Le pega a cada vehículo los datos de su orden más reciente — lo usa
    la vista "Por cliente" para ordenar por a quién le hicieron servicio
    hace menos tiempo. Todo se calcula en la base de datos (una fila por
    vehículo), sin traer cada orden al servidor."""
    ids = [v.id_vehiculo for v in vehiculos]
    if not ids:
        return vehiculos
    S = models.Servicio
    ultimos = {}
    conteos: dict[int, int] = {}
    # Por trozos: SQL Server admite ~2100 parámetros por consulta.
    for i in range(0, len(ids), 800):
        trozo = ids[i:i + 800]
        for id_veh, n in db.query(S.id_vehiculo, func.count(S.id_servicio)).filter(S.id_vehiculo.in_(trozo)).group_by(S.id_vehiculo).all():
            conteos[id_veh] = n
        orden = func.row_number().over(partition_by=S.id_vehiculo, order_by=S.fecha_entrada_servicio.desc()).label("orden")
        sub = (
            db.query(S.id_vehiculo.label("id_vehiculo"), S.fecha_entrada_servicio.label("fecha"), S.etapa.label("etapa"), S.status.label("status"), orden)
            .filter(S.id_vehiculo.in_(trozo)).subquery()
        )
        for f in db.query(sub.c.id_vehiculo, sub.c.fecha, sub.c.etapa, sub.c.status).filter(sub.c.orden == 1).all():
            ultimos[f.id_vehiculo] = f
    for v in vehiculos:
        s = ultimos.get(v.id_vehiculo)
        v.fecha_ultimo_servicio = s.fecha if s else None
        v.etapa_ultimo_servicio = s.etapa if s else None
        v.status_ultimo_servicio = s.status if s else None
        v.total_servicios = conteos.get(v.id_vehiculo, 0)
    return vehiculos


def _con_foto_principal(db: Session, vehiculos: list[models.Vehiculo]) -> list[models.Vehiculo]:
    """Deja en vehiculo.foto_principal la ruta de su foto más reciente (o
    None) — una sola consulta para toda la lista, para que la vista en
    cuadros pueda mostrarla sin pedir /fotos/ por cada tarjeta. La base de
    datos devuelve solo la última foto de cada vehículo (no todas)."""
    ids = [v.id_vehiculo for v in vehiculos]
    if not ids:
        return vehiculos
    F = models.Foto
    mas_reciente: dict[int, str] = {}
    for i in range(0, len(ids), 800):
        trozo = ids[i:i + 800]
        orden = func.row_number().over(partition_by=F.entidad_id, order_by=F.fecha.desc()).label("orden")
        sub = (
            db.query(F.entidad_id.label("entidad_id"), F.ruta_archivo.label("ruta"), orden)
            .filter(F.entidad_tipo == "vehiculo", F.entidad_id.in_(trozo)).subquery()
        )
        for f in db.query(sub.c.entidad_id, sub.c.ruta).filter(sub.c.orden == 1).all():
            mas_reciente[f.entidad_id] = f.ruta
    for v in vehiculos:
        v.foto_principal = f"/uploads/{mas_reciente[v.id_vehiculo]}" if v.id_vehiculo in mas_reciente else None
    return vehiculos


@router.get("/", response_model=list[schemas.VehiculoConClienteOut])
def listar(
    id_cliente: Optional[int] = None,
    q: Optional[str] = None,
    limite: Optional[int] = Query(None, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("vehiculos.ver")),
):
    query = db.query(models.Vehiculo).options(joinedload(models.Vehiculo.cliente))
    if id_cliente:
        query = query.filter(models.Vehiculo.id_cliente == id_cliente)
    if q:
        query = query.filter(models.Vehiculo.placas_vehiculo.ilike(f"%{q}%"))
    query = query.order_by(models.Vehiculo.id_vehiculo.desc())
    if limite:
        query = query.offset(offset).limit(limite)
    vehiculos = query.all()
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


def _generar_numero_cuenta_vehiculo(db: Session, cliente: models.Cliente | None) -> str:
    """Cuenta del vehículo, casada 1 a 1 con la cuenta del cliente:
    <cuenta-del-cliente>-<consecutivo de 2 dígitos>, ej. CTE-000001-01.
    Sin cliente (vehículo de cotización): SIN-CLIENTE-<consecutivo>."""
    if cliente:
        total_previos = db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente == cliente.id_cliente).count()
        sub_indice = total_previos + 1
        numero_cuenta = f"{cliente.numero_cuenta}-{sub_indice:02d}"
    else:
        total_previos = db.query(models.Vehiculo).filter(models.Vehiculo.id_cliente.is_(None)).count()
        sub_indice = total_previos + 1
        numero_cuenta = f"SIN-CLIENTE-{sub_indice:04d}"
    # Salvaguarda ante huecos por vehículos eliminados previamente
    while db.query(models.Vehiculo).filter(models.Vehiculo.numero_cuenta == numero_cuenta).first():
        sub_indice += 1
        numero_cuenta = f"{cliente.numero_cuenta}-{sub_indice:02d}" if cliente else f"SIN-CLIENTE-{sub_indice:04d}"
    return numero_cuenta


@router.post("/", response_model=schemas.VehiculoOut, status_code=201)
def crear(payload: schemas.VehiculoIn, db: Session = Depends(get_db), user=Depends(require_permission("vehiculos.crear"))):
    cliente = None
    if payload.id_cliente:
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
