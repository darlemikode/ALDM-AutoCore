import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission
from ..ws_manager import manager
from ..push_notifications import enviar_push

router = APIRouter(prefix="/api/servicios", tags=["servicios"])

# Etapas dentro de una orden abierta — el progreso día a día del trabajo en
# el vehículo. `status` (abierto/cerrado/cancelado) sigue mandando si la
# orden se puede editar; `etapa` es informativa y es la base del
# seguimiento que verá el cliente más adelante.
ETAPAS_SERVICIO = [
    ("recibido", "Recibido"),
    ("diagnostico", "En diagnóstico"),
    ("esperando_autorizacion", "Esperando autorización del cliente"),
    ("en_reparacion", "En reparación"),
    ("esperando_refacciones", "Esperando refacciones"),
    ("control_calidad", "Control de calidad"),
    ("listo_entrega", "Listo para entrega"),
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
    """Los conceptos y abonos solo se pueden modificar mientras la orden
    sigue abierta. Si ya se cerró o canceló, hay que reabrirla primero
    (PUT /servicios/{id} con status='abierto') para volver a editarla."""
    if servicio.status != "abierto":
        raise HTTPException(
            status_code=400,
            detail=f"La orden está '{servicio.status}'; reábrela antes de modificar conceptos o abonos.",
        )


def _sincronizar_pagado(db: Session, servicio_id: int) -> None:
    """Recalcula el saldo pendiente y ajusta el flag `pagado` en consecuencia.
    Se llama después de cualquier cambio a conceptos o abonos, para que el
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
        query = query.filter(models.Servicio.pagado.is_(False))
    servicios = query.order_by(models.Servicio.fecha_entrada_servicio.desc()).all()
    return [_con_costos(s) for s in servicios]


@router.get("/{servicio_id}", response_model=schemas.ServicioCompletoOut)
def obtener(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    return _con_costos(servicio)


@router.post("/", response_model=schemas.ServicioCompletoOut, status_code=201)
def crear(payload: schemas.ServicioIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.crear"))):
    vehiculo = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == payload.id_vehiculo).first()
    if not vehiculo:
        raise HTTPException(status_code=400, detail="El vehículo indicado no existe")
    if vehiculo.id_cliente != payload.id_cliente:
        raise HTTPException(status_code=400, detail="El vehículo no pertenece a ese cliente")
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
    etapa_inicial = "diagnostico" if payload.es_garantia else "recibido"
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
    return [_con_costos(s) for s in filas]


@router.put("/{servicio_id}", response_model=schemas.ServicioCompletoOut)
def actualizar(servicio_id: int, payload: schemas.ServicioUpdate, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    updates = payload.model_dump(exclude_unset=True)
    tipos_ids = updates.pop("tipos_mantenimiento_ids", None)
    se_esta_cerrando = updates.get("status") == "cerrado" and servicio.status != "cerrado"
    if updates.get("status") == "cerrado" and not servicio.fecha_salida_servicio and "fecha_salida_servicio" not in updates:
        updates["fecha_salida_servicio"] = datetime.utcnow()
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
    db.delete(servicio)
    db.commit()
    return None


# --- Detalles (mano de obra / refacciones / extras usados en el servicio) --
@router.post("/{servicio_id}/detalles", response_model=schemas.ServicioCompletoOut, status_code=201)
def agregar_detalle(servicio_id: int, payload: schemas.ServicioDetalleIn, db: Session = Depends(get_db), user=Depends(require_permission("servicios.editar"))):
    servicio = _get_servicio_o_404(db, servicio_id)
    _exigir_orden_abierta(servicio)

    cantidad = max(payload.cantidad or 1, 1)
    if payload.id_refaccion:
        refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == payload.id_refaccion).first()
        if not refaccion:
            raise HTTPException(status_code=400, detail="La refacción indicada no existe")
        if refaccion.cantidad_refaccion < cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Sin stock suficiente de '{refaccion.nombre_refaccion}' (disponible: {refaccion.cantidad_refaccion}, pedido: {cantidad})",
            )
        refaccion.cantidad_refaccion -= cantidad  # descuenta del inventario al usarla

    data = payload.model_dump()
    data["cantidad"] = cantidad
    detalle = models.ServicioDetalle(id_servicio=servicio_id, **data)
    db.add(detalle)
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
    if detalle.id_refaccion:
        refaccion = db.query(models.Refaccion).filter(models.Refaccion.id_refaccion == detalle.id_refaccion).first()
        if refaccion:
            refaccion.cantidad_refaccion += detalle.cantidad or 1  # regresa al inventario
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


# --- Recibo en PDF ------------------------------------------------------------
@router.get("/{servicio_id}/recibo")
def descargar_recibo(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    from ..recibo_pdf import generar_recibo_pdf  # import diferido: evita cargar reportlab si no se usa

    servicio = _get_servicio_o_404(db, servicio_id)
    costos = _calcular_costos(servicio)
    taller = db.query(models.ConfiguracionTaller).first()
    pdf_bytes = generar_recibo_pdf(servicio, costos, taller)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="orden-{servicio.id_servicio}.pdf"'},
    )


@router.get("/{servicio_id}/nota-remision")
def descargar_nota_remision(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("servicios.ver"))):
    """El documento que se le entrega al cliente al recoger su vehículo —
    diagnóstico, trabajos realizados, kilometraje, y espacio de firma de
    conformidad. Distinto del recibo de pago (ver /recibo arriba)."""
    from ..nota_remision_pdf import generar_nota_remision_pdf

    servicio = _get_servicio_o_404(db, servicio_id)
    if servicio.status != "cerrado":
        raise HTTPException(status_code=400, detail="La nota de remisión solo se genera cuando la orden ya está cerrada (entregada).")
    costos = _calcular_costos(servicio)
    taller = db.query(models.ConfiguracionTaller).first()
    pdf_bytes = generar_nota_remision_pdf(servicio, costos, taller)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="nota-remision-{servicio.id_servicio}.pdf"'},
    )


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
        "fecha": mensaje.fecha.isoformat(),
    })
    return mensaje
