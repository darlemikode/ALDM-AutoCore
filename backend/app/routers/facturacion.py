from ..busqueda import coincide
"""
Facturación electrónica — CFDI 4.0 de ingreso.

Flujo típico: orden de servicio cerrada/pagada → "Facturar" → se precargan
receptor (del cliente) y conceptos (de los detalles de la orden) → se
revisa → se timbra con el PAC → se guardan XML y PDF → se pueden cancelar
ante el SAT con el motivo correspondiente.
"""
import json
import os
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .. import almacenamiento
from ..facturacion_pac import RFC_GENERICO_NACIONAL, ErrorPAC, cancelar, consultar_estado, descargar_archivo, modo_pac, llave_facturapi, timbrar
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/facturacion", tags=["facturación"])

CARPETA_FACTURAS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "facturas")
os.makedirs(CARPETA_FACTURAS, exist_ok=True)

# --- Catálogos SAT (CFDI 4.0) — solo los que usa un taller/refaccionaria ----
REGIMENES_FISCALES = [
    ("601", "General de Ley Personas Morales"),
    ("603", "Personas Morales con Fines no Lucrativos"),
    ("605", "Sueldos y Salarios e Ingresos Asimilados a Salarios"),
    ("606", "Arrendamiento"),
    ("608", "Demás ingresos"),
    ("612", "Personas Físicas con Actividades Empresariales y Profesionales"),
    ("616", "Sin obligaciones fiscales"),
    ("621", "Incorporación Fiscal"),
    ("625", "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas"),
    ("626", "Régimen Simplificado de Confianza"),
]
USOS_CFDI = [
    ("G01", "Adquisición de mercancías"),
    ("G02", "Devoluciones, descuentos o bonificaciones"),
    ("G03", "Gastos en general"),
    ("I03", "Equipo de transporte"),
    ("I08", "Otra maquinaria y equipo"),
    ("S01", "Sin efectos fiscales"),
]
FORMAS_PAGO = [
    ("01", "Efectivo"),
    ("02", "Cheque nominativo"),
    ("03", "Transferencia electrónica de fondos"),
    ("04", "Tarjeta de crédito"),
    ("28", "Tarjeta de débito"),
    ("99", "Por definir"),
]
METODOS_PAGO = [("PUE", "Pago en una sola exhibición"), ("PPD", "Pago en parcialidades o diferido")]
MOTIVOS_CANCELACION = [
    ("01", "Comprobante emitido con errores con relación (se sustituye por otro)"),
    ("02", "Comprobante emitido con errores sin relación"),
    ("03", "No se llevó a cabo la operación"),
    ("04", "Operación nominativa relacionada en una factura global"),
]
UNIDADES = [("E48", "Unidad de servicio"), ("H87", "Pieza"), ("ACT", "Actividad"), ("LTR", "Litro"), ("KGM", "Kilogramo")]

RE_RFC = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$")
RE_CP = re.compile(r"^\d{5}$")
RE_CLAVE_SAT = re.compile(r"^\d{8}$")
RE_UUID = re.compile(r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$")


def _claves(catalogo):
    return {c for c, _ in catalogo}


def _config(db: Session) -> models.ConfiguracionFiscal:
    config = db.query(models.ConfiguracionFiscal).first()
    if not config:
        taller = db.query(models.ConfiguracionTaller).first()
        config = models.ConfiguracionFiscal(
            rfc_emisor=(taller.rfc or None) if taller else None,
            razon_social_emisor=taller.nombre_taller if taller else None,
            cp_expedicion=(taller.cp or None) if taller else None,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _config_out(config) -> schemas.ConfiguracionFiscalOut:
    out = schemas.ConfiguracionFiscalOut.model_validate(config)
    out.pac_llave_detectada = bool(llave_facturapi())
    out.pac_modo = modo_pac(config)
    return out


def _factura_o_404(db: Session, factura_id: int) -> models.Factura:
    f = db.query(models.Factura).filter(models.Factura.id_factura == factura_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return f


# --- Catálogos / configuración ----------------------------------------------
@router.get("/catalogos")
def catalogos(user=Depends(get_current_user)):
    a_lista = lambda cat: [{"clave": c, "descripcion": d} for c, d in cat]  # noqa: E731
    return {
        "regimenes_fiscales": a_lista(REGIMENES_FISCALES),
        "usos_cfdi": a_lista(USOS_CFDI),
        "formas_pago": a_lista(FORMAS_PAGO),
        "metodos_pago": a_lista(METODOS_PAGO),
        "motivos_cancelacion": a_lista(MOTIVOS_CANCELACION),
        "unidades": a_lista(UNIDADES),
    }


@router.get("/configuracion", response_model=schemas.ConfiguracionFiscalOut)
def obtener_configuracion(db: Session = Depends(get_db), user=Depends(require_permission("facturacion.ver"))):
    return _config_out(_config(db))


@router.put("/configuracion", response_model=schemas.ConfiguracionFiscalOut)
def guardar_configuracion(payload: schemas.ConfiguracionFiscalIn, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.configurar"))):
    datos = payload.model_dump()
    if datos["proveedor"] not in ("simulado", "facturapi"):
        raise HTTPException(status_code=400, detail="Proveedor no válido (simulado o facturapi).")
    datos["rfc_emisor"] = (datos["rfc_emisor"] or "").strip().upper() or None
    if datos["rfc_emisor"] and not RE_RFC.match(datos["rfc_emisor"]):
        raise HTTPException(status_code=400, detail="El RFC del emisor no tiene un formato válido.")
    if datos["cp_expedicion"] and not RE_CP.match(datos["cp_expedicion"]):
        raise HTTPException(status_code=400, detail="El código postal de expedición debe tener 5 dígitos.")
    if datos["regimen_fiscal_emisor"] and datos["regimen_fiscal_emisor"] not in _claves(REGIMENES_FISCALES):
        raise HTTPException(status_code=400, detail="Régimen fiscal del emisor no válido.")
    for campo in ("clave_prod_serv_mano_obra", "clave_prod_serv_refaccion"):
        if not RE_CLAVE_SAT.match(datos[campo] or ""):
            raise HTTPException(status_code=400, detail="Las claves de producto/servicio SAT deben tener 8 dígitos.")
    if datos["folio_siguiente"] < 1:
        raise HTTPException(status_code=400, detail="El folio siguiente debe ser mayor a 0.")
    config = _config(db)
    for k, v in datos.items():
        setattr(config, k, v)
    db.commit()
    db.refresh(config)
    return _config_out(config)


# --- Prefactura desde una orden de servicio ---------------------------------
def _forma_pago_sugerida(servicio) -> str:
    montos = {"01": 0.0, "04": 0.0}
    for a in servicio.abonos:
        if a.tipo_pago == "tarjeta":
            montos["04"] += a.monto_abono or 0
        elif a.tipo_pago == "mixto":
            montos["01"] += a.desglose_mixto_efectivo or 0
            montos["04"] += a.desglose_mixto_tarjeta or 0
        else:
            montos["01"] += a.monto_abono or 0
    return "04" if montos["04"] > montos["01"] else "01"


@router.get("/prefactura/servicio/{servicio_id}")
def prefactura_servicio(servicio_id: int, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.crear"))):
    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == servicio_id).first()
    if not servicio:
        raise HTTPException(status_code=404, detail="Orden de servicio no encontrada")
    if servicio.status != "cerrado":
        raise HTTPException(status_code=400, detail="Solo se pueden facturar órdenes finalizadas (cerradas).")
    config = _config(db)
    existente = (
        db.query(models.Factura)
        .filter(models.Factura.id_servicio == servicio_id, models.Factura.estado.in_(["timbrada", "cancelacion_pendiente"]))
        .first()
    )

    conceptos = []
    for d in servicio.detalles:
        base = (d.descripcion or "").strip()
        if (d.costo_mano_obra or 0) > 0:
            conceptos.append({
                "descripcion": f"Mano de obra — {base}" if base else "Mano de obra",
                "clave_prod_serv": config.clave_prod_serv_mano_obra, "clave_unidad": config.clave_unidad_servicio,
                "unidad": "Servicio", "cantidad": 1, "precio_unitario": round(d.costo_mano_obra, 2),
            })
        if (d.costo_refaccion or 0) > 0:
            nombre = None
            if d.inventario_refaccion and d.inventario_refaccion.refaccion:
                nombre = d.inventario_refaccion.refaccion.nombre_refaccion
            elif d.refaccion:
                nombre = d.refaccion.nombre_refaccion
            cantidad = d.cantidad or 1
            conceptos.append({
                "descripcion": nombre or base or "Refacción",
                "clave_prod_serv": config.clave_prod_serv_refaccion, "clave_unidad": config.clave_unidad_pieza,
                "unidad": "Pieza", "cantidad": cantidad, "precio_unitario": round(d.costo_refaccion / cantidad, 6),
            })
        if (d.costo_extra or 0) > 0:
            conceptos.append({
                "descripcion": f"Cargo adicional — {base}" if base else "Cargo adicional",
                "clave_prod_serv": config.clave_prod_serv_mano_obra, "clave_unidad": config.clave_unidad_servicio,
                "unidad": "Servicio", "cantidad": 1, "precio_unitario": round(d.costo_extra, 2),
            })

    c = servicio.cliente
    nombre_completo = " ".join(filter(None, [c.nombre_cliente, c.paterno_cliente, c.materno_cliente])) if c else ""
    liquidada = servicio.pagado
    return {
        "id_servicio": servicio.id_servicio,
        "id_cliente": servicio.id_cliente,
        "factura_existente": existente.id_factura if existente else None,
        "receptor": {
            "rfc": (c.rfc_cliente or "").upper() if c else "",
            "nombre": (c.razon_social_fiscal or c.empresa_cliente or nombre_completo).upper() if c else "",
            "regimen_fiscal": (c.regimen_fiscal if c else None) or "",
            "cp": (c.cp_fiscal or c.cp_cliente or "") if c else "",
            "uso_cfdi": (c.uso_cfdi if c else None) or "G03",
            "correo": (c.correo_cliente if c else None) or "",
        },
        "forma_pago": _forma_pago_sugerida(servicio) if liquidada else "99",
        "metodo_pago": "PUE" if liquidada else "PPD",
        "iva_porcentaje": servicio.iva_porcentaje if servicio.iva_porcentaje is not None else config.iva_porcentaje,
        "conceptos": conceptos,
    }


@router.get("/receptor-cliente/{cliente_id}")
def receptor_de_cliente(cliente_id: int, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.crear"))):
    """Datos fiscales guardados de un cliente, para facturas sin orden de servicio."""
    c = db.query(models.Cliente).filter(models.Cliente.id_cliente == cliente_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    nombre_completo = " ".join(filter(None, [c.nombre_cliente, c.paterno_cliente, c.materno_cliente]))
    return {
        "rfc": (c.rfc_cliente or "").upper(),
        "nombre": (c.razon_social_fiscal or c.empresa_cliente or nombre_completo).upper(),
        "regimen_fiscal": c.regimen_fiscal or "",
        "cp": c.cp_fiscal or c.cp_cliente or "",
        "uso_cfdi": c.uso_cfdi or "G03",
        "correo": c.correo_cliente or "",
    }


@router.get("/ordenes-por-facturar")
def ordenes_por_facturar(db: Session = Depends(get_db), user=Depends(require_permission("facturacion.crear"))):
    """Órdenes finalizadas que todavía no tienen una factura vigente."""
    from .servicios import _calcular_costos

    facturadas = {
        f.id_servicio for f in db.query(models.Factura.id_servicio)
        .filter(models.Factura.id_servicio.isnot(None), models.Factura.estado.in_(["timbrada", "cancelacion_pendiente"]))
    }
    servicios = (
        db.query(models.Servicio)
        .filter(models.Servicio.status == "cerrado")
        .order_by(models.Servicio.fecha_salida_servicio.desc(), models.Servicio.id_servicio.desc())
        .limit(300)
        .all()
    )
    resultado = []
    for s in servicios:
        if s.id_servicio in facturadas:
            continue
        c, v = s.cliente, s.vehiculo
        resultado.append({
            "id_servicio": s.id_servicio,
            "cliente": " ".join(filter(None, [c.nombre_cliente, c.paterno_cliente])) if c else "—",
            "rfc": (c.rfc_cliente or "") if c else "",
            "vehiculo": " ".join(filter(None, [
                v.marca.nombre_marca if v and v.marca else None,
                v.modelo.nombre_modelo if v and v.modelo else None,
                v.placas_vehiculo if v else None,
            ])) or "—",
            "nombre_servicio": s.nombre_servicio,
            "fecha_salida": s.fecha_salida_servicio.isoformat() if s.fecha_salida_servicio else None,
            "total": _calcular_costos(s).total,
            "pagado": bool(s.pagado),
        })
    return resultado


# --- Emisión -----------------------------------------------------------------
def _validar(payload: schemas.FacturaIn, config) -> None:
    rec = payload.receptor
    rec.rfc = rec.rfc.strip().upper()
    rec.nombre = " ".join(rec.nombre.strip().upper().split())
    if rec.rfc == RFC_GENERICO_NACIONAL:
        # Reglas SAT para RFC genérico: régimen 616, uso S01 y CP = lugar de expedición
        rec.regimen_fiscal, rec.uso_cfdi, rec.cp = "616", "S01", config.cp_expedicion or rec.cp
        if not rec.nombre:
            rec.nombre = "PUBLICO EN GENERAL"
    errores = []
    if not RE_RFC.match(rec.rfc):
        errores.append("RFC del receptor con formato inválido")
    if not rec.nombre:
        errores.append("falta el nombre o razón social del receptor (sin 'S.A. de C.V.', tal como viene en su constancia)")
    if not RE_CP.match(rec.cp or ""):
        errores.append("el CP del domicilio fiscal del receptor debe tener 5 dígitos")
    if rec.regimen_fiscal not in _claves(REGIMENES_FISCALES):
        errores.append("régimen fiscal del receptor no válido")
    if rec.uso_cfdi not in _claves(USOS_CFDI):
        errores.append("uso de CFDI no válido")
    if payload.forma_pago not in _claves(FORMAS_PAGO):
        errores.append("forma de pago no válida")
    if payload.metodo_pago not in _claves(METODOS_PAGO):
        errores.append("método de pago no válido")
    if payload.metodo_pago == "PPD" and payload.forma_pago != "99":
        errores.append("con método PPD la forma de pago debe ser 99 (Por definir)")
    if payload.metodo_pago == "PUE" and payload.forma_pago == "99":
        errores.append("con método PUE la forma de pago no puede ser 99 — indica cómo te pagaron")
    if not payload.conceptos:
        errores.append("la factura no tiene conceptos")
    for i, c in enumerate(payload.conceptos, start=1):
        if not c.descripcion.strip():
            errores.append(f"concepto {i}: falta descripción")
        if not RE_CLAVE_SAT.match(c.clave_prod_serv or ""):
            errores.append(f"concepto {i}: la clave SAT debe tener 8 dígitos")
        if c.cantidad <= 0:
            errores.append(f"concepto {i}: la cantidad debe ser mayor a 0")
        if c.precio_unitario < 0:
            errores.append(f"concepto {i}: el precio no puede ser negativo")
    if not (0 <= payload.iva_porcentaje <= 16):
        errores.append("el IVA debe estar entre 0% y 16%")
    if config.proveedor == "simulado":
        faltan = [n for n, v in [("RFC", config.rfc_emisor), ("razón social", config.razon_social_emisor),
                                 ("régimen fiscal", config.regimen_fiscal_emisor), ("CP de expedición", config.cp_expedicion)] if not v]
        if faltan:
            errores.append("completa en Configuración fiscal los datos del emisor: " + ", ".join(faltan))
    elif not llave_facturapi():
        errores.append("falta FACTURAPI_API_KEY en el archivo .env del backend")
    if errores:
        raise HTTPException(status_code=400, detail="No se puede timbrar: " + "; ".join(errores) + ".")


def _guardar_archivo(nombre: str, contenido: bytes) -> str:
    almacenamiento.guardar("facturas/" + nombre, contenido)
    return nombre


def _regenerar_pdf(db: Session, factura: models.Factura, config) -> None:
    """PDF con el diseño del sistema (logo y datos del taller), a partir del
    XML timbrado — se usa igual para modo simulado y para Facturapi."""
    from ..factura_pdf import generar_factura_pdf

    xml = None
    if factura.ruta_xml:
        xml = almacenamiento.leer("facturas/" + factura.ruta_xml)
    taller = db.query(models.ConfiguracionTaller).first()
    nombre = factura.ruta_pdf or f"{factura.serie}{factura.folio}_{factura.uuid or factura.id_factura}.pdf"
    factura.ruta_pdf = _guardar_archivo(nombre, generar_factura_pdf(factura, config, taller, xml))


@router.post("/facturas", response_model=schemas.FacturaOut, status_code=201)
def emitir(payload: schemas.FacturaIn, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.crear"))):
    config = _config(db)
    _validar(payload, config)

    # La facturación siempre parte de una orden finalizada — así cada CFDI
    # corresponde a un trabajo real y entregado, con los mismos importes.
    if not payload.id_servicio:
        raise HTTPException(status_code=400, detail="Solo se pueden facturar órdenes de servicio finalizadas.")
    servicio = db.query(models.Servicio).filter(models.Servicio.id_servicio == payload.id_servicio).first()
    if not servicio:
        raise HTTPException(status_code=404, detail="Orden de servicio no encontrada")
    if servicio.status != "cerrado":
        raise HTTPException(status_code=400, detail="Solo se pueden facturar órdenes finalizadas (cerradas).")
    duplicada = db.query(models.Factura).filter(
        models.Factura.id_servicio == payload.id_servicio,
        models.Factura.estado.in_(["timbrada", "cancelacion_pendiente"]),
    ).first()
    if duplicada:
        raise HTTPException(status_code=400, detail=f"Esta orden ya tiene la factura {duplicada.serie}-{duplicada.folio}. Cancélala antes de emitir otra.")
    payload.id_cliente = payload.id_cliente or servicio.id_cliente

    tasa = payload.iva_porcentaje / 100
    conceptos = []
    for c in payload.conceptos:
        c.precio_unitario = round(c.precio_unitario, 6)
        importe = round(c.cantidad * c.precio_unitario, 2)
        conceptos.append({**c.model_dump(), "descripcion": c.descripcion.strip(), "importe": importe, "iva": round(importe * tasa, 2)})
    subtotal = round(sum(c["importe"] for c in conceptos), 2)
    iva = round(sum(c["iva"] for c in conceptos), 2)
    total = round(subtotal + iva, 2)

    from .servicios import _calcular_costos
    subtotal_orden = _calcular_costos(servicio).subtotal
    if abs(subtotal_orden - subtotal) > 0.05:
        raise HTTPException(
            status_code=400,
            detail=f"El subtotal de la factura (${subtotal:,.2f}) no coincide con el de la orden (${subtotal_orden:,.2f}). Reabre la orden si necesitas cambiar importes.",
        )

    serie, folio, ahora = config.serie or "A", config.folio_siguiente or 1, datetime.now()
    datos = {
        "serie": serie, "folio": folio, "fecha": ahora,
        "forma_pago": payload.forma_pago, "metodo_pago": payload.metodo_pago, "uso_cfdi": payload.receptor.uso_cfdi,
        "iva_porcentaje": payload.iva_porcentaje, "receptor": payload.receptor.model_dump(),
        "conceptos": conceptos, "subtotal": subtotal, "iva": iva, "total": total,
    }
    try:
        resultado = timbrar(config, datos)
    except ErrorPAC as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    rec = payload.receptor
    factura = models.Factura(
        id_servicio=payload.id_servicio, id_cliente=payload.id_cliente, proveedor=config.proveedor or "simulado",
        estado="timbrada", serie=serie, folio=folio, uuid=resultado["uuid"], pac_id=resultado["pac_id"],
        receptor_rfc=rec.rfc, receptor_nombre=rec.nombre, receptor_regimen=rec.regimen_fiscal, receptor_cp=rec.cp,
        receptor_correo=rec.correo or None, uso_cfdi=rec.uso_cfdi, forma_pago=payload.forma_pago, metodo_pago=payload.metodo_pago,
        conceptos_json=json.dumps(conceptos, ensure_ascii=False), subtotal=subtotal, iva=iva, total=round(resultado["total"], 2),
        fecha_emision=ahora, emitida_por=user.username,
    )
    db.add(factura)
    config.folio_siguiente = folio + 1
    db.flush()

    base = f"{serie}{folio}_{(resultado['uuid'] or factura.id_factura)}"
    factura.ruta_xml = _guardar_archivo(f"{base}.xml", resultado["xml"])
    if resultado["pdf"]:  # el PDF propio del PAC se conserva aparte, por si se necesita
        _guardar_archivo(f"{base}_pac.pdf", resultado["pdf"])
    factura.ruta_pdf = f"{base}.pdf"
    _regenerar_pdf(db, factura, config)

    if payload.guardar_datos_cliente and payload.id_cliente and rec.rfc != RFC_GENERICO_NACIONAL:
        cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == payload.id_cliente).first()
        if cliente:
            cliente.rfc_cliente, cliente.razon_social_fiscal = rec.rfc, rec.nombre
            cliente.regimen_fiscal, cliente.cp_fiscal, cliente.uso_cfdi = rec.regimen_fiscal, rec.cp, rec.uso_cfdi
            if rec.correo and not cliente.correo_cliente:
                cliente.correo_cliente = rec.correo

    db.commit()
    db.refresh(factura)
    return factura


# --- Consulta ------------------------------------------------------------------
@router.get("/facturas", response_model=list[schemas.FacturaOut])
def listar(estado: str = None, id_servicio: int = None, q: str = None, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.ver"))):
    query = db.query(models.Factura)
    if estado:
        query = query.filter(models.Factura.estado == estado)
    if id_servicio:
        query = query.filter(models.Factura.id_servicio == id_servicio)
    if q:
        facturas = query.order_by(models.Factura.fecha_emision.desc()).all()
        return [f for f in facturas if coincide(q, f.receptor_rfc, f.receptor_nombre, f.uuid)][:500]
    return query.order_by(models.Factura.fecha_emision.desc()).limit(500).all()


@router.get("/facturas/{factura_id}", response_model=schemas.FacturaOut)
def obtener(factura_id: int, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.ver"))):
    return _factura_o_404(db, factura_id)


@router.get("/facturas/{factura_id}/{tipo}")
def descargar(factura_id: int, tipo: str, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.ver"))):
    if tipo not in ("pdf", "xml"):
        raise HTTPException(status_code=404, detail="Formato no disponible")
    factura = _factura_o_404(db, factura_id)
    if tipo == "pdf" and not (factura.ruta_pdf and almacenamiento.existe("facturas/" + factura.ruta_pdf)):
        _regenerar_pdf(db, factura, _config(db))
        db.commit()
    ruta = factura.ruta_pdf if tipo == "pdf" else factura.ruta_xml
    contenido = almacenamiento.leer("facturas/" + ruta) if ruta else None
    if contenido is not None:
        pass
    elif factura.proveedor == "facturapi" and factura.pac_id:
        try:
            contenido = descargar_archivo(factura, tipo)
        except ErrorPAC as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        raise HTTPException(status_code=404, detail="No se encontró el archivo de esta factura.")
    nombre = f"factura-{factura.serie}{factura.folio}.{tipo}"
    return Response(
        content=contenido,
        media_type="application/pdf" if tipo == "pdf" else "application/xml",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


# --- Cancelación -----------------------------------------------------------------
@router.post("/facturas/{factura_id}/cancelar", response_model=schemas.FacturaOut)
def cancelar_factura(factura_id: int, payload: schemas.CancelarFacturaIn, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.cancelar"))):
    factura = _factura_o_404(db, factura_id)
    if factura.estado != "timbrada":
        raise HTTPException(status_code=400, detail=f"La factura está '{factura.estado}', no se puede cancelar.")
    if payload.motivo not in _claves(MOTIVOS_CANCELACION):
        raise HTTPException(status_code=400, detail="Motivo de cancelación no válido.")
    if payload.motivo == "01":
        if not payload.uuid_sustitucion or not RE_UUID.match(payload.uuid_sustitucion.strip()):
            raise HTTPException(status_code=400, detail="Con motivo 01 debes indicar el UUID de la factura que la sustituye (emítela primero).")
        payload.uuid_sustitucion = payload.uuid_sustitucion.strip().upper()
    config = _config(db)
    try:
        nuevo_estado = cancelar(config, factura, payload.motivo, payload.uuid_sustitucion)
    except ErrorPAC as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    factura.estado = nuevo_estado
    factura.motivo_cancelacion = payload.motivo
    factura.uuid_sustitucion = payload.uuid_sustitucion
    if nuevo_estado == "cancelada":
        factura.fecha_cancelacion = datetime.now()
    _regenerar_pdf(db, factura, config)  # marca de agua CANCELADA / aviso de cancelación pendiente
    db.commit()
    db.refresh(factura)
    return factura


@router.post("/facturas/{factura_id}/actualizar-estado", response_model=schemas.FacturaOut)
def actualizar_estado(factura_id: int, db: Session = Depends(get_db), user=Depends(require_permission("facturacion.ver"))):
    """Para cancelaciones pendientes de aceptación del receptor (Facturapi)."""
    factura = _factura_o_404(db, factura_id)
    try:
        estado = consultar_estado(factura)
    except ErrorPAC as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if estado and estado != factura.estado:
        factura.estado = estado
        if estado == "cancelada":
            factura.fecha_cancelacion = datetime.now()
        _regenerar_pdf(db, factura, _config(db))
        db.commit()
        db.refresh(factura)
    return factura
