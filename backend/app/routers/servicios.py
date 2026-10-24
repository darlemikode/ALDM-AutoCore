import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..vehiculo_utils import orden_abierta_del_vehiculo
from .. import models, schemas
from ..auditoria import alerta_cambio_fecha, alerta_cierre_repetido, registrar as registrar_auditoria
from ..database import get_db
from ..security import get_current_user, require_permission
from ..ws_manager import manager
from ..push_notifications import enviar_push

router = APIRouter(prefix="/api/servicios", tags=["servicios"])

# Etapas dentro de una orden abierta — el progreso día a día del trabajo en
# el vehículo. `status` (abierto/cerrado/cancelado) sigue mandando si la
# orden se puede editar; `etapa` es informativa y es la base del
# seguimiento que verá el cliente más adelante.
# Catálogo unificado con los estatus del panel (oct-2026): ya no son solo
# los pasos de trabajo — también incluye Abierto/Cerrado/Cancelado/Garantía,
# para que exista un solo catálogo de estatus en todo el sistema.
ETAPAS_SERVICIO = [
    ("en_proceso", "Recibido"),
    ("abierto", "En piso"),
    ("pendiente", "Confirmación del cliente"),
    ("espera_refacciones", "Espera refacciones"),
    ("en_reparacion", "En reparación"),
    ("listo_entrega", "Listo para entrega"),
    ("cerrado", "Órdenes finalizadas"),
    ("garantia", "Garantía"),
    ("cancelado", "Cancelado"),
]
CLAVES_ETAPAS_VALIDAS = {clave for clave, _ in ETAPAS_SERVICIO}


@router.get("/etapas-disponibles")
def listar_etapas_disponibles(user=Depends(get_current_user)):
    """Catálogo fijo de etapas — lo consume el selector en el panel/app.
    Se registra ANTES de las rutas '/{servicio_id}' para que no choque con
    ellas (si no, FastAPI intentaría interpretar 'etapas-disponibles' como
    un id de servicio)."""
    return [{"clave": clave, "etiqueta": etiqueta} for clave, etiqueta in ETAPAS_SERVICIO]


def _calcular_costos(servicio: models.Servicio) -> schemas.ServicioCostos:
    subtotal = sum(
        (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        for d in servicio.detalles
    )
    iva = subtotal * (servicio.iva_porcentaje or 0) / 100
    total = subtotal + iva
    total_abonado = sum(a.monto_abono or 0 for a in servicio.abonos)
    return schemas.ServicioCostos(
        subtotal=round(subtotal, 2),
        iva=round(iva, 2),
        total=round(total, 2),
        total_abonado=round(total_abonado, 2),
        saldo_pendiente=round(total - total_abonado, 2),
    )


def _con_costos(servicio: models.Servicio) -> schemas.ServicioCompletoOut:
    out = schemas.ServicioCompletoOut.model_validate(servicio)
    out.costos = _calcular_costos(servicio)
    return out


def _adjuntar_foto_vehiculo(db: Session, servicios: list[models.Servicio]):
    """Deja en servicio.vehiculo.foto_principal la ruta de la foto más
    reciente de cada vehículo (o None) — una sola consulta para toda la
    lista, en vez de que el front pida /fotos/ por cada tarjeta."""
    ids_vehiculo = {s.id_vehiculo for s in servicios if s.vehiculo}
    if not ids_vehiculo:
        return
    fotos = (
        db.query(models.Foto)
        .filter(models.Foto.entidad_tipo == "vehiculo", models.Foto.entidad_id.in_(ids_vehiculo))
        .order_by(models.Foto.fecha.desc())
        .all()
    )
    mas_reciente = {}
    for foto in fotos:
        mas_reciente.setdefault(foto.entidad_id, foto.ruta_archivo)
    for s in servicios:
        if s.vehiculo:
            s.vehiculo.foto_principal = f"/uploads/{mas_reciente[s.id_vehiculo]}" if s.id_vehiculo in mas_reciente else None


def _para(user, out: schemas.ServicioCompletoOut) -> schemas.ServicioCompletoOut:
    """Sin el permiso «Ver precios» (p. ej. el Técnico) la API no entrega
    montos: no basta con esconderlos en la pantalla."""
    if user.tiene_permiso("servicios.ver_precios"):
        return out
    out.costos = schemas.ServicioCostos(subtotal=0, iva=0, total=0, total_abonado=0, saldo_pendiente=0)
    for d in out.detalles:
        d.costo_mano_obra = 0
        d.costo_refaccion = 0
        d.costo_extra = 0
    out.abonos = []
    return out


def _calcular_alertas_stock(servicio: models.Servicio, db: Session) -> list[dict]:
    """Refacciones usadas en este servicio que quedaron en nivel bajo o
    crítico de stock — se calcula al cerrar la orden, para avisarle al
    taller justo cuando termina de armar la nota, no antes."""
    alertas = []
    vistas = set()
    for detalle in servicio.detalles:
        if not detalle.id_refaccion or detalle.id_refaccion in vistas:
            continue
        vistas.add(detalle.id_refaccion)
        refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == detalle.id_refaccion).first()
        if not refaccion or refaccion.cantidad_refaccion > refaccion.umbral_naranja:
            continue
        nivel = "critico" if refaccion.cantidad_refaccion <= refaccion.umbral_rojo else "bajo"
        proveedor = None
        if refaccion.id_proveedor:
            p = db.query(models.Proveedor).filter(models.Proveedor.id_proveedor == refaccion.id_proveedor).first()
            if p:
                proveedor = {"nombre": p.nombre_proveedor, "telefono": p.telefono1_proveedor}
        alertas.append({
            "id_refaccion": refaccion.id_refaccion,
            "nombre_refaccion": refaccion.nombre_refaccion,
            "numero_refaccion": refaccion.numero_refaccion,
            "cantidad_actual": refaccion.cantidad_refaccion,
            "nivel": nivel,
            "proveedor": proveedor,
        })
    return alertas


def _get_servicio_o_404(db: Session, servicio_id: int) -> models.Servicio:
    servicio = (
        db.query(models.Servicio)
        .options(
            joinedload(models.Servicio.detalles),
            joinedload(models.Servicio.abonos),
            joinedload(models.Servicio.cliente),
            joinedload(models.Servicio.vehiculo),
            joinedload(models.Servicio.historial_etapas),
            joinedload(models.Servicio.tipos_mantenimiento),
        )
        .filter(models.Servicio.id_servicio == servicio_id)
        .first()
    )
    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return servicio


def _exigir_orden_abierta(servicio: models.Servicio) -> None:
    """Las refacciones y abonos solo se pueden modificar mientras la orden
    sigue abierta. Si ya se cerró o canceló, hay que reabrirla primero
    (PUT /servicios/{id} con status='abierto') para volver a editarla."""
    if servicio.status != "abierto":
        raise HTTPException(
            status_code=400,
            detail=f"La orden está '{servicio.status}'; reábrela antes de modificar refacciones o abonos.",
        )


def _sincronizar_pagado(db: Session, servicio_id: int) -> None:
    """Recalcula el saldo pendiente y ajusta el flag `pagado` en consecuencia.
    Se llama después de cualquier cambio a refacciones o abonos, para que el
    estado de pago nunca quede desincronizado del total real."""
    servicio = _get_servicio_o_404(db, servicio_id)
    costos = _calcular_costos(servicio)
    servicio.pagado = costos.saldo_pendiente <= 0
    db.commit()


@router.get("/", response_model=list[schemas.ServicioCompletoOut])
def listar(
    status: Optional[str] = None,
    id_cliente: Optional[int] = None,
    solo_sin_pagar: bool = False,
    db: Session = Depends(get_db),
    user=Depends(require_permission("servicios.ver")),
):
    query = db.query(models.Servicio).options(
        joinedload(models.Servicio.detalles),
        joinedload(models.Servicio.abonos),
        joinedload(models.Servicio.cliente),
        joinedload(models.Servicio.vehiculo),
    )
    if status:
        query = query.filter(models.Servicio.status == status)
    if id_cliente:
        query = query.filter(models.Servicio.id_cliente == id_cliente)
    if solo_sin_pagar:
        query = query.filter(models.Servicio.pagado == False)
    servicios = query.order_by(models.Servicio.fecha_entrada_servicio.desc()).all()
    _adjuntar_foto_vehiculo(db, servicios)
    return [_para(user, _con_costos(s)) for s in servicios]


@router.get("/{servicio_id}", response_model=schemas.ServicioCompletoOut)
def obtener(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _adjuntar_foto_vehiculo(db, [servicio])
    return _para(user, _con_costos(servicio))


def _validar_cliente_vehiculo(db: Session, id_cliente, id_vehiculo, exigir_ambos=False):
    if exigir_ambos and (id_cliente is None or id_vehiculo is None):
        raise HTTPException(status_code=400, detail="Elige el cliente y el vehículo.")
    if id_cliente is not None and not db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first():
        raise HTTPException(status_code=400, detail="El cliente indicado no existe")
    if id_vehiculo is not None:
        vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == id_vehiculo).first()
        if not vehiculo:
            raise HTTPException(status_code=400, detail="El vehículo indicado no existe")
        if id_cliente is not None and vehiculo.id_cliente != id_cliente:
            raise HTTPException(status_code=400, detail="El vehículo no pertenece a ese cliente")


def _validar_vehiculo_sin_orden_abierta(db: Session, id_vehiculo, excepto_servicio=None):
    """Un vehículo no puede tener dos órdenes abiertas a la vez (ya está en el taller)."""
    if id_vehiculo is None:
        return
    orden = orden_abierta_del_vehiculo(db, id_vehiculo, excepto_servicio)  # incluye registros duplicados con las mismas placas
    if orden:
        raise HTTPException(
            status_code=409,
            detail=f"Este vehículo ya está en el taller con la orden #{orden.id_servicio} abierta ({orden.nombre_servicio}). "
                   "Ábrela o ciérrala antes de crear otra.",
        )


def _exigir_cliente_y_vehiculo(servicio):
    if servicio.id_cliente is None or servicio.id_vehiculo is None:
        raise HTTPException(status_code=400, detail="Elige el cliente y el vehículo de la orden antes de continuar.")


@router.post("/", response_model=schemas.ServicioCompletoOut, status_code=201)
def crear(payload: schemas.ServicioIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    if payload.id_vehiculo is not None or payload.id_cliente is not None or payload.es_garantia:
        _validar_cliente_vehiculo(db, payload.id_cliente, payload.id_vehiculo, exigir_ambos=payload.es_garantia)
        if not payload.es_garantia:
            _validar_vehiculo_sin_orden_abierta(db, payload.id_vehiculo)
    # La autorización del cliente (con código) es OPCIONAL — depende del
    # interruptor "Verificación en 2 pasos" en Datos del taller. Antes esto
    # era obligatorio siempre, lo cual hacía inútil ese interruptor.

    if payload.es_garantia:
        if not payload.id_servicio_original:
            raise HTTPException(status_code=400, detail="Selecciona a qué servicio original corresponde esta garantía.")
        original = db.query(models.Servicio).filter(models.Servicio.id_servicio == payload.id_servicio_original).first()
        if not original:
            raise HTTPException(status_code=400, detail="El servicio original indicado no existe.")
        if original.id_vehiculo != payload.id_vehiculo:
            raise HTTPException(status_code=400, detail="El servicio original es de otro vehículo.")

    datos = payload.model_dump()
    tipos_ids = datos.pop("tipos_mantenimiento_ids", [])
    datos["fecha_autorizacion"] = datetime.utcnow()
    servicio = models.Servicio(**datos)
    db.add(servicio)
    db.flush()
    if tipos_ids:
        tipos_validos = db.query(models.TipoServicio).filter(models.TipoServicio.id_tipo_servicio.in_(tipos_ids)).all()
        servicio.tipos_mantenimiento = tipos_validos
    etapa_inicial = "garantia" if payload.es_garantia else "en_proceso"
    servicio.etapa = etapa_inicial
    db.add(models.ServicioEtapaHistorial(id_servicio=servicio.id_servicio, etapa=etapa_inicial, actualizado_por=user.username))
    db.commit()
    return _con_costos(_get_servicio_o_404(db, servicio.id_servicio))


@router.get("/{servicio_id}/reclamaciones", response_model=list[schemas.ServicioCompletoOut])
def listar_reclamaciones(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    """Las órdenes de garantía que se abrieron a partir de esta — para ver
    de un vistazo si un vehículo ha regresado por lo mismo más de una vez."""
    filas = (
        db.query(models.Servicio)
        .options(joinedload(models.Servicio.detalles), joinedload(models.Servicio.abonos))
        .filter(models.Servicio.id_servicio_original == servicio_id)
        .order_by(models.Servicio.fecha_entrada_servicio.desc())
        .all()
    )
    return [_para(user, _con_costos(s)) for s in filas]


@router.put("/{servicio_id}", response_model=schemas.ServicioCompletoOut)
def actualizar(servicio_id: int, payload: schemas.ServicioUpdate, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    updates = payload.model_dump(exclude_unset=True)
    tipos_ids = updates.pop("tipos_mantenimiento_ids", None)
    motivo_fecha = (updates.pop("motivo_cambio_fecha", None) or "").strip()
    # Fechas de entrada/salida: solo con permiso especial y con motivo; queda en la bitácora
    cambios_fecha = []
    for campo in ("fecha_entrada_servicio", "fecha_salida_servicio"):
        if campo in updates:
            anterior = getattr(servicio, campo)
            nuevo = updates[campo]
            if anterior == nuevo:
                updates.pop(campo)
                continue
            cambios_fecha.append((campo, anterior, nuevo))
    if cambios_fecha:
        if not user.tiene_permiso("servicios.editar_fechas"):
            raise HTTPException(status_code=403, detail="Tu rol no puede cambiar las fechas de una orden. Pídele al administrador que lo haga.")
        if len(motivo_fecha) < 5:
            raise HTTPException(status_code=422, detail="Escribe el motivo del cambio de fecha (mínimo 5 caracteres).")
    if updates.get("status") == "cancelado" and servicio.status != "cancelado":
        costos = _calcular_costos(servicio)
        if servicio.status == "cerrado" or (costos.total_abonado > 0 and costos.saldo_pendiente <= 0):
            raise HTTPException(status_code=400, detail="Una orden finalizada y pagada no se puede cancelar.")
    if "id_cliente" in updates or "id_vehiculo" in updates:
        nuevo_cliente = updates.get("id_cliente", servicio.id_cliente)
        nuevo_vehiculo = updates.get("id_vehiculo", servicio.id_vehiculo)
        if "id_cliente" in updates and "id_vehiculo" not in updates and nuevo_cliente != servicio.id_cliente:
            nuevo_vehiculo = None  # cambió el cliente: el vehículo anterior ya no aplica
            updates["id_vehiculo"] = None
        _validar_cliente_vehiculo(db, nuevo_cliente, nuevo_vehiculo)
        if "id_vehiculo" in updates and nuevo_vehiculo != servicio.id_vehiculo and servicio.status == "abierto" and not servicio.es_garantia:
            _validar_vehiculo_sin_orden_abierta(db, nuevo_vehiculo, excepto_servicio=servicio_id)
        if nuevo_vehiculo and not servicio.km_llegada and "km_llegada" not in updates:
            veh = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == nuevo_vehiculo).first()
            if veh and veh.km_vehiculo:
                updates["km_llegada"] = str(veh.km_vehiculo)
    se_esta_cerrando = updates.get("status") == "cerrado" and servicio.status != "cerrado"
    if se_esta_cerrando:
        _exigir_cliente_y_vehiculo(servicio)
    if updates.get("status") == "cerrado" and not servicio.fecha_salida_servicio and "fecha_salida_servicio" not in updates:
        updates["fecha_salida_servicio"] = datetime.utcnow()
    entrada = updates.get("fecha_entrada_servicio", servicio.fecha_entrada_servicio)
    salida = updates.get("fecha_salida_servicio", servicio.fecha_salida_servicio)
    if entrada and salida and ("fecha_entrada_servicio" in updates or "fecha_salida_servicio" in updates) and salida.date() < entrada.date():
        raise HTTPException(status_code=400, detail="La fecha de salida no puede ser anterior a la de entrada.")
    for campo, anterior, nuevo in cambios_fecha:
        registrar_auditoria(db, user, "servicio", servicio_id, "cambio_fecha", campo, anterior, nuevo, motivo_fecha,
                            alerta_cambio_fecha(campo, anterior, nuevo))
    if se_esta_cerrando:
        momento = datetime.utcnow()
        registrar_auditoria(db, user, "servicio", servicio_id, "cierre", "status", servicio.status, "cerrado", None, alerta_cierre_repetido(db, momento))
    if updates.get("status") == "cancelado" and servicio.status != "cancelado":
        registrar_auditoria(db, user, "servicio", servicio_id, "cancelacion", "status", servicio.status, "cancelado")
    for key, value in updates.items():
        setattr(servicio, key, value)
    if tipos_ids is not None:
        servicio.tipos_mantenimiento = db.query(models.TipoServicio).filter(models.TipoServicio.id_tipo_servicio.in_(tipos_ids)).all()
    db.commit()
    servicio_actualizado = _get_servicio_o_404(db, servicio_id)
    salida = _con_costos(servicio_actualizado)
    if se_esta_cerrando:
        salida.alertas_stock = _calcular_alertas_stock(servicio_actualizado, db)
    return salida


@router.delete("/{servicio_id}", status_code=204)
def eliminar(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.eliminar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    # Solo se eliminan borradores: sin vehículo, sin cambio de estatus y sin movimientos. Lo demás se cancela (queda historial).
    motivos = []
    if servicio.id_vehiculo is not None:
        motivos.append("ya tiene vehículo")
    if servicio.status != "abierto" or (servicio.etapa or "en_proceso") not in ("en_proceso",) or len(servicio.historial_etapas or []) > 1:
        motivos.append("ya cambió de estatus")
    if servicio.detalles or servicio.abonos:
        motivos.append("tiene refacciones o abonos")
    if motivos:
        raise HTTPException(status_code=400, detail="No se puede eliminar esta orden: " + " y ".join(motivos) + ". Cancélala en lugar de eliminarla (así queda historial).")
    registrar_auditoria(db, user, "servicio", servicio_id, "eliminacion_orden", "orden", f"#{servicio_id} {servicio.nombre_servicio}", "eliminada")
    db.delete(servicio)
    db.commit()
    return None


# --- Detalles (mano de obra / refacciones / extras usados en el servicio) --
def consolidar_refacciones_repetidas(db: Session, servicio_id: int) -> None:
    """Una misma refacción no se repite en la orden: si ya estaba, se suman
    cantidad e importes en el renglón que ya existía y se borra el nuevo.
    (El stock ya se descontó al agregarla, así que aquí no se toca.)"""
    detalles = (
        db.query(models.ServicioDetalle)
        .filter(models.ServicioDetalle.id_servicio == servicio_id, models.ServicioDetalle.id_refaccion.isnot(None))
        .order_by(models.ServicioDetalle.id_servicio_detalle)
        .all()
    )
    vistos = {}
    for d in detalles:
        clave = (d.id_refaccion, d.id_inventario_refaccion)
        base = vistos.get(clave)
        if base is None:
            vistos[clave] = d
            continue
        base.cantidad = (base.cantidad or 1) + (d.cantidad or 1)
        base.costo_mano_obra = (base.costo_mano_obra or 0) + (d.costo_mano_obra or 0)
        base.costo_refaccion = (base.costo_refaccion or 0) + (d.costo_refaccion or 0)
        base.costo_extra = (base.costo_extra or 0) + (d.costo_extra or 0)
        db.delete(d)
    db.flush()


@router.post("/{servicio_id}/detalles", response_model=schemas.ServicioCompletoOut, status_code=201)
def agregar_detalle(servicio_id: int, payload: schemas.ServicioDetalleIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)

    cantidad = max(payload.cantidad or 1, 1)
    id_inventario_encontrado = None

    if payload.id_refaccion:
        refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == payload.id_refaccion).first()
        if not refaccion:
            raise HTTPException(status_code=400, detail="La refacción indicada no existe")
        # Se busca primero un registro de Inventario para esta refacción que
        # sea compatible EXACTO con la marca+modelo del vehículo de esta
        # orden — si existe, se descuenta de ahí. Si no existe esa
        # combinación, se agrega el concepto igual (no se bloquea la orden)
        # pero no se descuenta ningún inventario.
        vehiculo = servicio.vehiculo
        inventario = None
        if vehiculo and vehiculo.id_marca_vehiculo:
            inventario = (
                db.query(models.InventarioRefaccion)
                .join(models.InventarioRefaccionCompatibilidad)
                .filter(
                    models.InventarioRefaccion.id_refaccion == payload.id_refaccion,
                    models.InventarioRefaccionCompatibilidad.id_marca_vehiculo == vehiculo.id_marca_vehiculo,
                    models.InventarioRefaccionCompatibilidad.id_modelo_vehiculo == vehiculo.id_modelo_vehiculo,
                )
                .first()
            )
        if inventario:
            inventario.cantidad = max(inventario.cantidad - cantidad, 0)
            id_inventario_encontrado = inventario.id_inventario_refaccion
        else:
            # Sin inventario específico para este vehículo — se permite
            # agregarla igual, descontando del stock plano de la refacción
            # (comportamiento de respaldo, nunca deja el inventario negativo).
            refaccion.cantidad_refaccion = max(refaccion.cantidad_refaccion - cantidad, 0)

    orden_maximo = db.query(func.max(models.ServicioDetalle.orden)).filter(models.ServicioDetalle.id_servicio == servicio_id).scalar() or 0
    data = payload.model_dump()
    data["cantidad"] = cantidad
    data["id_inventario_refaccion"] = id_inventario_encontrado
    data["orden"] = orden_maximo + 1
    detalle = models.ServicioDetalle(id_servicio=servicio_id, **data)
    db.add(detalle)
    db.flush()
    consolidar_refacciones_repetidas(db, servicio_id)
    db.commit()
    _sincronizar_pagado(db, servicio_id)
    servicio_actualizado = _get_servicio_o_404(db, servicio_id)
    salida = _con_costos(servicio_actualizado)
    salida.alertas_stock = _calcular_alertas_stock(servicio_actualizado, db)
    return salida


@router.put("/{servicio_id}/detalles/{detalle_id}", response_model=schemas.ServicioCompletoOut)
def actualizar_detalle(servicio_id: int, detalle_id: int, payload: schemas.ServicioDetalleUpdate, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)
    detalle = (
        db.query(models.ServicioDetalle)
        .filter(models.ServicioDetalle.id_servicio_detalle == detalle_id, models.ServicioDetalle.id_servicio == servicio_id)
        .first()
    )
    if not detalle:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")
    datos = payload.model_dump(exclude_unset=True)
    # Si solo cambia la cantidad (los botones +/- de piezas) sin que también
    # manden un nuevo costo_refaccion, se reescala el importe de refacción
    # en proporción a la cantidad anterior — si no, el total/saldo se queda
    # congelado en el precio de cuando había menos (o más) piezas.
    if "cantidad" in datos and "costo_refaccion" not in datos:
        cantidad_anterior = detalle.cantidad or 1
        nueva_cantidad = max(datos["cantidad"] or 1, 1)
        if cantidad_anterior and detalle.costo_refaccion:
            precio_unitario = detalle.costo_refaccion / cantidad_anterior
            datos["costo_refaccion"] = round(precio_unitario * nueva_cantidad, 2)
        datos["cantidad"] = nueva_cantidad
    for key, value in datos.items():
        setattr(detalle, key, value)
    db.commit()
    _sincronizar_pagado(db, servicio_id)
    return _con_costos(_get_servicio_o_404(db, servicio_id))


@router.delete("/{servicio_id}/detalles", response_model=schemas.ServicioCompletoOut)
def eliminar_todos_los_detalles(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    """Quita todas las refacciones de la orden y regresa al inventario lo que se había descontado."""
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)
    detalles = db.query(models.ServicioDetalle).filter(models.ServicioDetalle.id_servicio == servicio_id).all()
    for detalle in detalles:
        if detalle.id_refaccion and not detalle.id_inventario_refaccion:
            refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == detalle.id_refaccion).first()
            if refaccion:
                refaccion.cantidad_refaccion += detalle.cantidad or 1
        if detalle.id_inventario_refaccion:
            inventario = db.query(models.InventarioRefaccion).filter(models.InventarioRefaccion.id_inventario_refaccion == detalle.id_inventario_refaccion).first()
            if inventario:
                inventario.cantidad += detalle.cantidad or 1
        db.delete(detalle)
    db.commit()
    _sincronizar_pagado(db, servicio_id)
    return _con_costos(_get_servicio_o_404(db, servicio_id))


@router.delete("/{servicio_id}/detalles/{detalle_id}", response_model=schemas.ServicioCompletoOut)
def eliminar_detalle(servicio_id: int, detalle_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)
    detalle = (
        db.query(models.ServicioDetalle)
        .filter(models.ServicioDetalle.id_servicio_detalle == detalle_id, models.ServicioDetalle.id_servicio == servicio_id)
        .first()
    )
    if not detalle:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")
    if detalle.id_refaccion and not detalle.id_inventario_refaccion:
        refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == detalle.id_refaccion).first()
        if refaccion:
            refaccion.cantidad_refaccion += detalle.cantidad or 1  # regresa al stock general
    if detalle.id_inventario_refaccion:
        inventario = db.query(models.InventarioRefaccion).filter(models.InventarioRefaccion.id_inventario_refaccion == detalle.id_inventario_refaccion).first()
        if inventario:
            inventario.cantidad += detalle.cantidad or 1  # regresa al inventario
    db.delete(detalle)
    db.commit()
    _sincronizar_pagado(db, servicio_id)
    return _con_costos(_get_servicio_o_404(db, servicio_id))


# --- Abonos (pagos parciales) ------------------------------------------------
@router.post("/{servicio_id}/abonos", response_model=schemas.ServicioCompletoOut, status_code=201)
def agregar_abono(servicio_id: int, payload: schemas.ServicioAbonoIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)
    siguiente_numero = len(servicio.abonos) + 1

    # Si el monto es mayor al saldo pendiente, se acepta igual (el cliente
    # pagó con un billete grande, por ejemplo) — solo se aplica hasta cubrir
    # el saldo, y el resto queda registrado como cambio a devolver. Si la
    # orden ya estaba pagada (saldo en $0 o menos), todo el monto es cambio
    # — no se aplica nada, para no dejar el saldo en negativo.
    saldo_actual = _calcular_costos(servicio).saldo_pendiente
    datos = payload.model_dump()
    monto_solicitado = datos["monto_abono"]
    if saldo_actual <= 0:
        datos["cambio"] = round(monto_solicitado, 2)
        datos["monto_abono"] = 0.0
    elif monto_solicitado > saldo_actual:
        datos["cambio"] = round(monto_solicitado - saldo_actual, 2)
        datos["monto_abono"] = saldo_actual
    else:
        datos["cambio"] = 0.0

    abono = models.ServicioAbono(id_servicio=servicio_id, numero_abono=siguiente_numero, **datos)
    db.add(abono)
    db.commit()
    _sincronizar_pagado(db, servicio_id)
    return _con_costos(_get_servicio_o_404(db, servicio_id))


@router.delete("/{servicio_id}/abonos/{abono_id}", response_model=schemas.ServicioCompletoOut)
def eliminar_abono(servicio_id: int, abono_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)
    abono = (
        db.query(models.ServicioAbono)
        .filter(models.ServicioAbono.id_abono == abono_id, models.ServicioAbono.id_servicio == servicio_id)
        .first()
    )
    if not abono:
        raise HTTPException(status_code=404, detail="Abono no encontrado")
    db.delete(abono)
    db.commit()
    _sincronizar_pagado(db, servicio_id)
    return _con_costos(_get_servicio_o_404(db, servicio_id))


def _nombre_pdf(servicio, prefijo: str) -> str:
    """Nombre de archivo: «Nota - Cliente - Marca Modelo Año.pdf» (sin caracteres raros)."""
    import re
    import unicodedata
    c, v = servicio.cliente, servicio.vehiculo
    cliente = " ".join(filter(None, [getattr(c, "nombre_cliente", None), getattr(c, "paterno_cliente", None)])) or f"orden {servicio.id_servicio}"
    veh = " ".join(str(x) for x in [
        getattr(v.marca, "nombre_marca", None) if v and v.marca else None,
        getattr(v.modelo, "nombre_modelo", None) if v and v.modelo else None,
        getattr(v, "id_year_vehiculo", None) if v else None,
    ] if x)
    crudo = " - ".join(filter(None, [prefijo, cliente, veh]))
    ascii_ = unicodedata.normalize("NFKD", crudo).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9 _.\-]", "", ascii_).strip() + ".pdf"


# --- Recibo en PDF ------------------------------------------------------------
@router.get("/{servicio_id}/recibo")
def descargar_recibo(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver_precios"))):
    from ..recibo_pdf import generar_recibo_pdf  # import diferido: evita cargar reportlab si no se usa

    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_cliente_y_vehiculo(servicio)
    costos = _calcular_costos(servicio)
    taller = db.query(models.ConfiguracionTaller).first()
    from ..inspeccion_pdf import inspeccion_de_servicio
    pdf_bytes = generar_recibo_pdf(servicio, costos, taller, inspeccion_de_servicio(db, models, servicio_id))
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_nombre_pdf(servicio, "Orden")}"'},
    )


@router.get("/{servicio_id}/nota-remision")
def descargar_nota_remision(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver_precios"))):
    """El documento que se le entrega al cliente al recoger su vehículo —
    diagnóstico, trabajos realizados, kilometraje, y espacio de firma de
    conformidad. Distinto del recibo de pago (ver /recibo arriba)."""
    from ..nota_remision_pdf import generar_nota_remision_pdf

    servicio = _get_servicio_o_404(db, servicio_id)
    if servicio.status != "cerrado":
        raise HTTPException(status_code=400, detail="La nota de remisión solo se genera cuando la orden ya está cerrada (entregada).")
    costos = _calcular_costos(servicio)
    taller = db.query(models.ConfiguracionTaller).first()
    from ..inspeccion_pdf import inspeccion_de_servicio
    pdf_bytes = generar_nota_remision_pdf(servicio, costos, taller, inspeccion_de_servicio(db, models, servicio_id))
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_nombre_pdf(servicio, "Nota")}"'},
    )


# --- Finalizar orden: cobro + cierre + nota de remisión + aviso al cliente -----
@router.post("/{servicio_id}/finalizar", response_model=schemas.FinalizarServicioOut)
async def finalizar_orden(servicio_id: int, payload: schemas.FinalizarServicioIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    """Todo el cierre en un solo paso, para que no se quede nada a medias:
    1) si hay saldo, registra el pago (forma de pago, monto recibido y cambio),
    2) cierra la orden (status 'cerrado', fecha de entrega, etapa final),
    3) avisa al cliente por el chat de la orden, push a su app y, si hay SMTP,
       por correo con la nota de remisión adjunta."""
    from fastapi.concurrency import run_in_threadpool
    from ..notifications import enviar_nota_al_cliente

    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)
    _exigir_cliente_y_vehiculo(servicio)
    if not servicio.detalles:
        raise HTTPException(status_code=400, detail="La orden no tiene refacciones. Agrega al menos una antes de finalizarla.")

    saldo = _calcular_costos(servicio).saldo_pendiente
    cambio = 0.0
    if saldo > 0.005:
        tipo = payload.tipo_pago or "efectivo"
        if tipo not in ("efectivo", "tarjeta", "mixto"):
            raise HTTPException(status_code=400, detail="Forma de pago no válida.")
        efectivo = tarjeta = None
        if tipo == "mixto":
            efectivo = round(payload.desglose_mixto_efectivo or 0, 2)
            tarjeta = round(payload.desglose_mixto_tarjeta or 0, 2)
            if tarjeta > saldo + 0.005:
                raise HTTPException(status_code=400, detail="La parte con tarjeta no puede ser mayor al saldo pendiente.")
            recibido = efectivo + tarjeta
        elif tipo == "tarjeta":
            recibido = round(payload.monto_recibido if payload.monto_recibido is not None else saldo, 2)
            if recibido > saldo + 0.005:
                raise HTTPException(status_code=400, detail="El cargo a tarjeta no puede ser mayor al saldo pendiente.")
        else:
            recibido = round(payload.monto_recibido or 0, 2)
        if recibido + 0.005 < saldo:
            raise HTTPException(
                status_code=400,
                detail=f"El pago (${recibido:,.2f}) no cubre el saldo pendiente (${saldo:,.2f}). Registra un abono si solo deja una parte.",
            )
        cambio = round(max(recibido - saldo, 0), 2)
        db.add(models.ServicioAbono(
            id_servicio=servicio_id, numero_abono=len(servicio.abonos) + 1, monto_abono=round(saldo, 2),
            tipo_pago=tipo, desglose_mixto_efectivo=efectivo, desglose_mixto_tarjeta=tarjeta,
            cambio=cambio, comentario="Pago al finalizar la orden",
        ))

    if payload.comentarios_finales is not None:
        servicio.comentarios_finales = payload.comentarios_finales.strip() or None
    servicio.status = "cerrado"
    servicio.pagado = True
    servicio.etapa = "cerrado"  # pasa a la columna "Órdenes finalizadas" del kanban
    if not servicio.fecha_salida_servicio:
        servicio.fecha_salida_servicio = datetime.utcnow()
    db.add(models.ServicioEtapaHistorial(
        id_servicio=servicio_id, etapa="cerrado",
        comentario="Orden finalizada — nota de remisión generada", actualizado_por=user.username,
    ))
    db.commit()

    servicio = _get_servicio_o_404(db, servicio_id)
    costos = _calcular_costos(servicio)
    salida = _con_costos(servicio)
    salida.alertas_stock = _calcular_alertas_stock(servicio, db)

    notificaciones = {"chat": False, "push": False, "correo": False}
    cliente = servicio.cliente
    if payload.notificar_cliente and cliente:
        taller = db.query(models.ConfiguracionTaller).first()
        nombre_taller = (taller.nombre_taller if taller else None) or "Tu taller"
        vehiculo = servicio.vehiculo
        desc_vehiculo = " ".join(filter(None, [
            vehiculo.marca.nombre_marca if vehiculo and vehiculo.marca else None,
            vehiculo.modelo.nombre_modelo if vehiculo and vehiculo.modelo else None,
        ])) or "Tu vehículo"

        correo_enviado = False
        if cliente.correo_cliente:
            from ..nota_remision_pdf import generar_nota_remision_pdf
            from ..inspeccion_pdf import inspeccion_de_servicio
            pdf = generar_nota_remision_pdf(servicio, costos, taller, inspeccion_de_servicio(db, models, servicio_id))
            correo_enviado = await run_in_threadpool(
                enviar_nota_al_cliente, cliente.correo_cliente, cliente.nombre_cliente, nombre_taller, servicio_id, costos.total, pdf,
            )
        notificaciones["correo"] = correo_enviado

        texto = (
            f"✅ ¡{desc_vehiculo} está listo! Finalizamos tu orden #{servicio_id}. "
            f"Total: ${costos.total:,.2f}. Tu nota de remisión ya está disponible en la app"
            + (" y te la enviamos por correo" if correo_enviado else "") + ". ¡Gracias por tu preferencia!"
        )
        mensaje = models.MensajeChat(id_servicio=servicio_id, autor_tipo="taller", autor_nombre=nombre_taller, tipo="mensaje", texto=texto)
        db.add(mensaje)
        db.commit()
        db.refresh(mensaje)
        notificaciones["chat"] = True
        await manager.difundir(servicio_id, {
            "tipo": "chat", "id_mensaje": mensaje.id_mensaje, "autor_tipo": "taller", "autor_nombre": mensaje.autor_nombre,
            "mensaje_tipo": mensaje.tipo, "texto": mensaje.texto, "fecha": mensaje.fecha.isoformat(),
        })
        await manager.difundir(servicio_id, {"tipo": "etapa", "etapa": "cerrado", "comentario": "Orden finalizada", "actualizado_por": user.username})

        if cliente.push_token:
            await enviar_push(
                cliente.push_token, f"{desc_vehiculo} está listo 🚗",
                f"Orden #{servicio_id} finalizada · Total ${costos.total:,.2f}. Tu nota de remisión ya está disponible.",
                {"id_servicio": servicio_id, "tipo": "finalizada"},
            )
            notificaciones["push"] = True

    return schemas.FinalizarServicioOut(servicio=salida, cambio=cambio, notificaciones=notificaciones)


# --- Etapa / estatus del servicio ---------------------------------------------
@router.put("/{servicio_id}/etapa", response_model=schemas.ServicioCompletoOut)
async def actualizar_etapa(servicio_id: int, payload: schemas.ActualizarEtapaIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)

    if payload.etapa not in CLAVES_ETAPAS_VALIDAS:
        raise HTTPException(status_code=400, detail="Esa etapa no existe en el catálogo.")

    servicio.etapa = payload.etapa
    db.add(models.ServicioEtapaHistorial(
        id_servicio=servicio_id, etapa=payload.etapa, comentario=payload.comentario, actualizado_por=user.username,
    ))
    db.commit()
    resultado = _con_costos(_get_servicio_o_404(db, servicio_id))

    # Empuja el cambio en vivo a quien esté viendo esta orden (cliente y/o
    # taller) — así no hace falta refrescar para ver el avance.
    await manager.difundir(servicio_id, {
        "tipo": "etapa",
        "etapa": payload.etapa,
        "comentario": payload.comentario,
        "actualizado_por": user.username,
    })

    # Y aparte, un push al cliente aunque no tenga la app abierta en ese momento.
    etiqueta_etapa = dict(ETAPAS_SERVICIO).get(payload.etapa, payload.etapa)
    if servicio.cliente and servicio.cliente.push_token:
        await enviar_push(
            servicio.cliente.push_token,
            "Actualización de tu servicio",
            f"{servicio.vehiculo.placas_vehiculo if servicio.vehiculo else 'Tu vehículo'}: {etiqueta_etapa}",
            {"id_servicio": servicio_id, "tipo": "etapa"},
        )

    return resultado


# --- Chat en vivo por orden de servicio --------------------------------------
@router.get("/{servicio_id}/chat/mensajes", response_model=list[schemas.MensajeChatOut])
def listar_mensajes(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    return (
        db.query(models.MensajeChat)
        .filter(models.MensajeChat.id_servicio == servicio_id)
        .order_by(models.MensajeChat.fecha)
        .all()
    )


@router.post("/{servicio_id}/chat/mensajes", response_model=schemas.MensajeChatOut, status_code=201)
async def enviar_mensaje(servicio_id: int, payload: schemas.MensajeChatIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    mensaje = models.MensajeChat(
        id_servicio=servicio.id_servicio,
        autor_tipo="taller",
        autor_nombre=user.nombre_completo,
        tipo=payload.tipo,
        texto=payload.texto,
    )
    db.add(mensaje)
    db.commit()
    db.refresh(mensaje)

    await manager.difundir(servicio_id, {
        "tipo": "chat",
        "id_mensaje": mensaje.id_mensaje,
        "autor_tipo": "taller",
        "autor_nombre": mensaje.autor_nombre,
        "mensaje_tipo": mensaje.tipo,
        "texto": mensaje.texto,
        "ruta_foto": mensaje.ruta_foto,
        "fecha": mensaje.fecha.isoformat(),
    })
    return mensaje


EXTENSIONES_FOTO = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}


async def guardar_foto_chat(archivo: UploadFile) -> str:
    """Guarda la foto del chat en app/uploads/ y regresa el nombre del archivo."""
    import os

    from ..subida_archivos import leer_y_validar_imagen, nombre_unico, guardar

    contenido, extension = await leer_y_validar_imagen(archivo)
    carpeta = None
    nombre = nombre_unico("chat", extension)
    guardar(carpeta, nombre, contenido)
    return nombre


@router.post("/{servicio_id}/chat/foto", response_model=schemas.MensajeChatOut, status_code=201)
async def enviar_foto(
    servicio_id: int,
    archivo: UploadFile = File(...),
    texto: str = Form(None),
    db: Session = Depends(get_db),
    user=Depends(require_permission("servicios.ver")),
):
    """Foto en el chat de la orden (avance del trabajo, pieza dañada…)."""
    servicio = _get_servicio_o_404(db, servicio_id)
    nombre = await guardar_foto_chat(archivo)
    mensaje = models.MensajeChat(
        id_servicio=servicio.id_servicio, autor_tipo="taller", autor_nombre=user.nombre_completo,
        tipo="foto", texto=(texto or "").strip() or "📷 Foto", ruta_foto=nombre,
    )
    db.add(mensaje)
    db.commit()
    db.refresh(mensaje)
    await manager.difundir(servicio_id, {
        "tipo": "chat", "id_mensaje": mensaje.id_mensaje, "autor_tipo": "taller", "autor_nombre": mensaje.autor_nombre,
        "mensaje_tipo": mensaje.tipo, "texto": mensaje.texto, "ruta_foto": mensaje.ruta_foto, "fecha": mensaje.fecha.isoformat(),
    })
    if servicio.cliente and servicio.cliente.push_token:
        await enviar_push(servicio.cliente.push_token, "El taller te envió una foto 📷", mensaje.texto, {"id_servicio": servicio_id, "tipo": "chat"})
    return mensaje
