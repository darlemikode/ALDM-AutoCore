from datetime import datetime, timedelta
from calendar import month_abbr

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/resumen")
def resumen(db: Session = Depends(get_db), user=Depends(get_current_user)):
    hoy = datetime.utcnow()
    inicio_mes = hoy.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_clientes = db.query(func.count(models.Cliente.id_cliente)).filter(models.Cliente.status_cliente == 1).scalar()
    total_vehiculos = db.query(func.count(models.Vehiculo.id_vehiculo)).scalar()
    servicios_abiertos = db.query(func.count(models.Servicio.id_servicio)).filter(models.Servicio.status == "abierto").scalar()
    servicios_mes = db.query(func.count(models.Servicio.id_servicio)).filter(models.Servicio.fecha_entrada_servicio >= inicio_mes).scalar()
    refacciones_bajo_stock = db.query(func.count(models.Refaccion.id_refaccion)).filter(models.Refaccion.cantidad_refaccion <= models.Refaccion.umbral_rojo).scalar()

    servicios_sin_pagar = (
        db.query(models.Servicio)
        .options(selectinload(models.Servicio.detalles), selectinload(models.Servicio.abonos))
        .filter(models.Servicio.pagado == False)
        .all()
    )
    saldo_pendiente_total = 0.0
    for s in servicios_sin_pagar:
        subtotal = sum((d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0) for d in s.detalles)
        total = subtotal * (1 + (s.iva_porcentaje or 0) / 100)
        abonado = sum(a.monto_abono or 0 for a in s.abonos)
        saldo_pendiente_total += max(total - abonado, 0)

    deuda_proveedores = db.query(func.coalesce(func.sum(models.ProveedorDeuda.saldo_total), 0)).scalar()

    solicitudes_recuperacion_pendientes = 0
    if user.tiene_permiso("usuarios.ver"):
        solicitudes_recuperacion_pendientes = (
            db.query(func.count(models.SolicitudRecuperacion.id_solicitud))
            .filter(models.SolicitudRecuperacion.atendida == False)
            .scalar()
        )

    return {
        "total_clientes": total_clientes or 0,
        "total_vehiculos": total_vehiculos or 0,
        "servicios_abiertos": servicios_abiertos or 0,
        "servicios_este_mes": servicios_mes or 0,
        "solicitudes_recuperacion_pendientes": solicitudes_recuperacion_pendientes or 0,
        "refacciones_bajo_stock": refacciones_bajo_stock or 0,
        # Montos solo para quien tiene permiso (no basta con esconderlos en pantalla)
        "saldo_pendiente_clientes": round(saldo_pendiente_total, 2) if user.tiene_permiso("dashboard.ver_por_cobrar") else 0,
        "deuda_con_proveedores": round(float(deuda_proveedores or 0), 2) if user.tiene_permiso("proveedores.ver") else 0,
    }


@router.get("/servicios-por-estado")
def servicios_por_estado(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Conteo de órdenes agrupadas por estado, para la gráfica de pastel/barras."""
    filas = (
        db.query(models.Servicio.status, func.count(models.Servicio.id_servicio))
        .group_by(models.Servicio.status)
        .all()
    )
    conteo = {status: cantidad for status, cantidad in filas}
    return [
        {"estado": "Abierto", "cantidad": conteo.get("abierto", 0)},
        {"estado": "Cerrado", "cantidad": conteo.get("cerrado", 0)},
        {"estado": "Cancelado", "cantidad": conteo.get("cancelado", 0)},
    ]


@router.get("/servicios-mensuales")
def servicios_mensuales(meses: int = 6, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Órdenes e ingresos (subtotal + IVA) por mes, para la gráfica de tendencia."""
    hoy = datetime.utcnow()
    # Construye la lista de los últimos N meses en orden cronológico (mes, año)
    periodos = []
    cursor = hoy.replace(day=1)
    for _ in range(meses):
        periodos.append((cursor.year, cursor.month))
        cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
    periodos.reverse()

    desde = datetime(periodos[0][0], periodos[0][1], 1)
    servicios = (
        db.query(models.Servicio)
        .options(joinedload(models.Servicio.detalles))
        .filter(models.Servicio.fecha_entrada_servicio >= desde)
        .all()
    )

    ver_montos = user.tiene_permiso("dashboard.ver_por_cobrar")
    resumen = {p: {"cantidad": 0, "ingresos": 0.0} for p in periodos}
    for s in servicios:
        clave = (s.fecha_entrada_servicio.year, s.fecha_entrada_servicio.month)
        if clave not in resumen:
            continue
        subtotal = sum((d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0) for d in s.detalles)
        total = subtotal * (1 + (s.iva_porcentaje or 0) / 100)
        resumen[clave]["cantidad"] += 1
        resumen[clave]["ingresos"] += total

    return [
        {
            "mes": f"{month_abbr[mes].capitalize()} {anio}",
            "cantidad": resumen[(anio, mes)]["cantidad"],
            "ingresos": round(resumen[(anio, mes)]["ingresos"], 2) if ver_montos else 0,
        }
        for (anio, mes) in periodos
    ]


@router.get("/refacciones-bajo-stock-top")
def refacciones_bajo_stock_top(limite: int = 8, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Las N refacciones con menor stock, para la gráfica de barras de inventario."""
    filas = (
        db.query(models.Refaccion)
        .order_by(models.Refaccion.cantidad_refaccion.asc())
        .limit(limite)
        .all()
    )
    return [{"nombre": r.nombre_refaccion, "stock": r.cantidad_refaccion} for r in filas]


# --- Recordatorios de servicio recurrente ------------------------------------
@router.get("/proximos-servicios", response_model=list[schemas.ProximoServicioOut])
def proximos_servicios(dias_umbral: int = 150, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Clientes que ya llevan `dias_umbral` días o más sin volver desde su
    último servicio entregado — candidatos a un recordatorio de "ya te toca
    tu próximo servicio". Se excluyen los que ya tienen una orden abierta
    (ya están en el taller) y los que ya se marcaron como contactados para
    ese mismo ciclo (mismo `fecha_base`)."""
    hoy = datetime.utcnow()
    vehiculos = (
        db.query(models.Vehiculo)
        .options(joinedload(models.Vehiculo.cliente), joinedload(models.Vehiculo.servicios))
        .all()
    )
    contactados = {(r.id_vehiculo, r.fecha_base) for r in db.query(models.RecordatorioContactado).all()}

    resultado = []
    for v in vehiculos:
        if not v.cliente or v.cliente.status_cliente != 1:
            continue
        cerrados = [s for s in v.servicios if s.status == "cerrado" and s.fecha_salida_servicio]
        if not cerrados:
            continue
        if any(s.status == "abierto" for s in v.servicios):
            continue  # ya está en el taller, no hace falta recordarle nada

        ultimo = max(cerrados, key=lambda s: s.fecha_salida_servicio)
        dias = (hoy - ultimo.fecha_salida_servicio).days
        if dias < dias_umbral:
            continue
        if (v.id_vehiculo, ultimo.fecha_salida_servicio) in contactados:
            continue

        resultado.append(schemas.ProximoServicioOut(
            id_cliente=v.cliente.id_cliente,
            id_vehiculo=v.id_vehiculo,
            nombre_cliente=f"{v.cliente.nombre_cliente} {v.cliente.paterno_cliente or ''}".strip(),
            telefono1=v.cliente.telefono1,
            placas_vehiculo=v.placas_vehiculo,
            numero_cuenta_vehiculo=v.numero_cuenta,
            fecha_ultimo_servicio=ultimo.fecha_salida_servicio,
            dias_desde_ultimo_servicio=dias,
            km_proximo_servicio=ultimo.km_proximo_servicio,
        ))

    resultado.sort(key=lambda r: r.dias_desde_ultimo_servicio, reverse=True)
    return resultado


class MarcarContactadoIn(BaseModel):
    fecha_base: datetime


@router.post("/proximos-servicios/{id_vehiculo}/contactado")
def marcar_contactado(id_vehiculo: int, payload: MarcarContactadoIn, db: Session = Depends(get_db), user=Depends(require_permission("clientes.editar"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == id_vehiculo).first()
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    db.add(models.RecordatorioContactado(
        id_cliente=vehiculo.id_cliente, id_vehiculo=id_vehiculo, fecha_base=payload.fecha_base, contactado_por=user.username,
    ))
    db.commit()
    return {"status": "ok"}
