"""Recibo de la orden de servicio y cotización en PDF.

Import perezoso desde el router (`from ..recibo_pdf import ...` dentro de la
función) para que reportlab solo se cargue si de verdad se pide un recibo.
El diseño (encabezado, tablas, totales) vive en pdf_diseno.py y es el mismo
para recibo, nota de remisión, cotización y factura.
"""
from io import BytesIO

from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from .pdf_diseno import (
    ACCENT, ACCENT_SOFT, E, OK, OK_SOFT, PlantillaDocumento, caja_texto, dos_columnas, esc, fmt,
    pastilla, seccion, tabla_conceptos, tarjeta, totales,
)
from .schemas import ServicioCostos

ANCHO = 183.9 * mm  # carta menos márgenes laterales


def nombre_refaccion(d) -> str | None:
    if getattr(d, "inventario_refaccion", None) and d.inventario_refaccion.refaccion:
        return d.inventario_refaccion.refaccion.nombre_refaccion
    if getattr(d, "refaccion", None):
        return d.refaccion.nombre_refaccion
    return None


def categoria_refaccion(d) -> str | None:
    if getattr(d, "inventario_refaccion", None) and d.inventario_refaccion.refaccion:
        return d.inventario_refaccion.refaccion.categoria
    if getattr(d, "refaccion", None):
        return d.refaccion.categoria
    return None


def descripcion_vehiculo(v) -> str:
    if not v:
        return "—"
    partes = [
        getattr(v.marca, "nombre_marca", None) if v.marca else None,
        getattr(v.modelo, "nombre_modelo", None) if v.modelo else None,
        v.id_year_vehiculo,
    ]
    return " ".join(filter(None, partes)) or "—"


def bloques_cliente_vehiculo(servicio, extra_vehiculo=()):
    """Tarjetas Cliente | Vehículo, compartidas por recibo y nota de remisión."""
    c, v = servicio.cliente, servicio.vehiculo
    nombre = " ".join(filter(None, [c.nombre_cliente, c.paterno_cliente, c.materno_cliente])) if c else "—"
    cliente = tarjeta([
        ("Nombre", nombre),
        ("Cuenta", c.numero_cuenta if c else "—"),
        ("Teléfono", (c.telefono1 if c else None) or "—"),
        ("Correo", (c.correo_cliente if c else None) or "—"),
    ], (ANCHO - 5 * mm) / 2, columnas=2)
    vehiculo = tarjeta([
        ("Vehículo", descripcion_vehiculo(v)),
        ("Placas", (v.placas_vehiculo if v else None) or "—"),
        ("Color", (v.color.nombre_color if v and v.color else None) or "—"),
        ("Cuenta vehículo", v.numero_cuenta if v else "—"),
        *extra_vehiculo,
    ], (ANCHO - 5 * mm) / 2, columnas=2)
    encabezados = dos_columnas(
        Paragraph("CLIENTE", E["etiqueta"]), Paragraph("VEHÍCULO", E["etiqueta"]), ANCHO,
    )
    return [encabezados, Spacer(1, 1.5 * mm), dos_columnas(cliente, vehiculo, ANCHO)]


def generar_recibo_pdf(servicio, costos: ServicioCostos, taller=None, inspeccion=None) -> bytes:
    buffer = BytesIO()
    liquidado = costos.saldo_pendiente <= 0
    plantilla = PlantillaDocumento(
        taller, "Orden de servicio · Recibo", f"#{servicio.id_servicio:05d}",
        lineas_derecha=[
            f"Entrada: {servicio.fecha_entrada_servicio:%d/%m/%Y}",
            f"Estado: {(servicio.status or '').capitalize()}",
        ],
    )
    doc = plantilla.documento(buffer)
    story = []

    story += bloques_cliente_vehiculo(servicio, extra_vehiculo=[("Km de llegada", servicio.km_llegada or "—")])

    story += seccion("Conceptos", ANCHO, derecha=f"{len(servicio.detalles)} concepto(s)")
    filas = []
    for d in servicio.detalles:
        refaccion = nombre_refaccion(d)
        concepto = Paragraph(
            esc(d.descripcion or refaccion or "Concepto") + (f"<br/><font size='7.5' color='#6b7480'>Refacción: {esc(refaccion)}</font>" if refaccion else ""),
            E["celda"],
        )
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        filas.append([concepto, str(d.cantidad or 1), fmt(d.costo_mano_obra), fmt(d.costo_refaccion), fmt(d.costo_extra), Paragraph(f"<b>{fmt(importe)}</b>", E["celda_der"])])
    story.append(tabla_conceptos(
        ["Concepto", "Cant.", "Mano de obra", "Refacción", "Extra", "Importe"], filas,
        [ANCHO * w for w in (0.38, 0.07, 0.14, 0.14, 0.12, 0.15)], alinear_derecha=(1, 2, 3, 4, 5),
    ))
    story.append(Spacer(1, 5 * mm))

    # Abonos (izquierda) + totales (derecha)
    if servicio.abonos:
        filas_abonos = [[f"{a.numero_abono}", f"{a.fecha_pago:%d/%m/%Y}", (a.tipo_pago or "").capitalize(), fmt(a.monto_abono)] for a in servicio.abonos]
        izquierda = [
            Paragraph("ABONOS REGISTRADOS", E["etiqueta"]), Spacer(1, 1.5 * mm),
            tabla_conceptos(["#", "Fecha", "Forma", "Monto"], filas_abonos, [10 * mm, 24 * mm, 24 * mm, 27 * mm], alinear_derecha=(3,)),
        ]
    else:
        izquierda = [Paragraph("Sin abonos registrados.", E["nota"])]
    derecha = totales(
        [
            ("Subtotal", fmt(costos.subtotal)),
            (f"IVA ({servicio.iva_porcentaje:g}%)", fmt(costos.iva)),
            ("Total", fmt(costos.total)),
            ("Abonado", fmt(costos.total_abonado)),
            ("Liquidado" if liquidado else "Saldo pendiente", fmt(costos.saldo_pendiente)),
        ],
        ANCHO, color_final=OK if liquidado else ACCENT,
    )
    bloque = Table([[izquierda, derecha]], colWidths=[ANCHO - 82 * mm, 82 * mm])
    bloque.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(bloque)

    if servicio.comentarios_finales:
        story += seccion("Comentarios", ANCHO)
        story.append(caja_texto(servicio.comentarios_finales, ANCHO))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Este recibo ampara los pagos registrados para la orden indicada. No es un comprobante fiscal (CFDI); "
        "si requieres factura, solicítala con tus datos fiscales.",
        E["nota"],
    ))
    from .inspeccion_pdf import hoja_inspeccion
    story += hoja_inspeccion(inspeccion, ANCHO)
    doc.build(story, onFirstPage=plantilla, onLaterPages=plantilla)
    return buffer.getvalue()


def generar_cotizacion_pdf(cotizacion, costos, taller=None) -> bytes:
    """Presupuesto sin cliente ni vehículo ligados."""
    buffer = BytesIO()
    vigencia = f"{cotizacion.vigente_hasta:%d/%m/%Y}" if cotizacion.vigente_hasta else "Sin fecha límite"
    plantilla = PlantillaDocumento(
        taller, "Cotización", f"#{cotizacion.id_cotizacion:05d}",
        lineas_derecha=[f"Fecha: {cotizacion.fecha_cotizacion:%d/%m/%Y}", f"Vigente hasta: {vigencia}"],
    )
    doc = plantilla.documento(buffer)
    story = [tarjeta([
        ("Cotización", cotizacion.titulo),
        ("Fecha", f"{cotizacion.fecha_cotizacion:%d/%m/%Y}"),
        ("Vigencia", pastilla(vigencia, OK, OK_SOFT) if cotizacion.vigente_hasta else vigencia),
    ], ANCHO, columnas=3)]

    story += seccion("Conceptos", ANCHO)
    filas = []
    for d in cotizacion.detalles:
        refaccion = d.refaccion.nombre_refaccion if d.refaccion else None
        concepto = Paragraph(
            esc(d.descripcion or refaccion or "Concepto") + (f"<br/><font size='7.5' color='#6b7480'>Refacción: {esc(refaccion)}</font>" if refaccion else ""),
            E["celda"],
        )
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        filas.append([concepto, str(d.cantidad or 1), fmt(d.costo_mano_obra), fmt(d.costo_refaccion), fmt(d.costo_extra), Paragraph(f"<b>{fmt(importe)}</b>", E["celda_der"])])
    story.append(tabla_conceptos(
        ["Concepto", "Cant.", "Mano de obra", "Refacción", "Extra", "Importe"], filas,
        [ANCHO * w for w in (0.38, 0.07, 0.14, 0.14, 0.12, 0.15)], alinear_derecha=(1, 2, 3, 4, 5),
    ))
    story.append(Spacer(1, 5 * mm))
    story.append(totales([
        ("Subtotal", fmt(costos.subtotal)),
        (f"IVA ({cotizacion.iva_porcentaje:g}%)", fmt(costos.iva)),
        ("Total estimado", fmt(costos.total)),
    ], ANCHO))

    if cotizacion.comentarios:
        story += seccion("Comentarios", ANCHO)
        story.append(caja_texto(cotizacion.comentarios, ANCHO))

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Presupuesto estimado, no es una factura. Los precios finales pueden variar según lo que se encuentre al revisar el vehículo.",
        E["nota"],
    ))
    doc.build(story, onFirstPage=plantilla, onLaterPages=plantilla)
    return buffer.getvalue()


__all__ = ["generar_recibo_pdf", "generar_cotizacion_pdf", "nombre_refaccion", "descripcion_vehiculo", "bloques_cliente_vehiculo", "ACCENT_SOFT"]
