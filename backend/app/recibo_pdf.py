"""Recibo de la orden de servicio y cotización en PDF.

Import perezoso desde el router (`from ..recibo_pdf import ...` dentro de la
función) para que reportlab solo se cargue si de verdad se pide un recibo.
El diseño (encabezado, tablas, totales) vive en pdf_diseno.py y es el mismo
para recibo, nota de remisión, cotización y factura.
"""
from datetime import datetime
from io import BytesIO

from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

from .pdf_diseno import (
    notas_pie, fecha_mx, hoy_mx, ACCENT, ACCENT_SOFT, E, OK, OK_SOFT, PlantillaDocumento, caja_texto, dos_columnas, esc, fmt,
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


def bloques_cliente_vehiculo(servicio, extra_vehiculo=(), con_comentario=False):
    """Tarjetas Cliente | Vehículo del mismo tamaño, compartidas por recibo y nota de remisión."""
    c, v = servicio.cliente, servicio.vehiculo
    nombre = " ".join(filter(None, [c.nombre_cliente, c.paterno_cliente, c.materno_cliente])) if c else "—"
    ancho_tarjeta = (ANCHO - 5 * mm) / 2
    alto_fila = 12.5 * mm
    cliente = tarjeta([
        ("Nombre", nombre),
        ("Teléfono", (c.telefono1 if c else None) or "—"),
        ("Correo", (c.correo_cliente if c else None) or "—"),
    ], ancho_tarjeta, columnas=1, alto_fila=alto_fila)
    vehiculo = tarjeta([
        ("Vehículo", descripcion_vehiculo(v)),
        ("Placas", (v.placas_vehiculo if v else None) or "—"),
        ("Color", (v.color.nombre_color if v and v.color else None) or "—"),
        ("VIN", (v.numserie_vehiculo if v else None) or "—"),
        ("Km de llegada", servicio.km_llegada or "—"),
        ("Km próximo servicio", servicio.km_proximo_servicio or "—"),
    ], ancho_tarjeta, columnas=2, alto_fila=alto_fila)
    encabezados = dos_columnas(
        Paragraph("CLIENTE", E["etiqueta"]), Paragraph("VEHÍCULO", E["etiqueta"]), ANCHO,
    )
    bloques = [encabezados, Spacer(1, 1.5 * mm), dos_columnas(cliente, vehiculo, ANCHO)]
    if con_comentario:
        bloques += [
            Spacer(1, 4 * mm), Paragraph("COMENTARIO", E["etiqueta"]), Spacer(1, 1.5 * mm),
            caja_texto(servicio.comentarios_finales or "Sin comentarios.", ANCHO),
        ]
    return bloques


def generar_recibo_pdf(servicio, costos: ServicioCostos, taller=None, inspeccion=None) -> bytes:
    buffer = BytesIO()
    liquidado = costos.saldo_pendiente <= 0
    plantilla = PlantillaDocumento(
        taller, "Orden de servicio · Recibo", f"#{servicio.id_servicio:05d}",
        lineas_derecha=[
            f"Entrada: {fecha_mx(servicio.fecha_entrada_servicio):%d/%m/%Y}",
            # Si aún no se captura la salida, se toma el día en que se genera la nota
            f"Salida: {(fecha_mx(servicio.fecha_salida_servicio) or hoy_mx()):%d/%m/%Y}",
            f"Estado: {(servicio.status or '').capitalize()}",
        ],
    )
    doc = plantilla.documento(buffer)
    story = []

    story += bloques_cliente_vehiculo(servicio, con_comentario=False)

    story += seccion("Refacciones", ANCHO, derecha=f"{len(servicio.detalles)} refacción(es)")
    filas = []
    for d in servicio.detalles:
        refaccion = nombre_refaccion(d)
        principal = refaccion or d.descripcion or "Refacción"
        concepto = Paragraph(
            f"<b>{esc(principal)}</b>" + (f"<br/><font size='7.5' color='#6b7480'>{esc(d.descripcion)}</font>" if d.descripcion and d.descripcion != principal else ""),
            E["celda"],
        )
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        cant = d.cantidad or 1
        filas.append([concepto, str(cant), fmt(importe / cant), Paragraph(f"<b>{fmt(importe)}</b>", E["celda_centro"])])
    story.append(tabla_conceptos(
        ["Refacción", "Cant.", "Precio unitario", "Importe"], filas,
        [ANCHO * w for w in (0.46, 0.14, 0.20, 0.20)], alinear_centro=(1, 2, 3),
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

    # Comentarios al final, debajo de abonos y totales
    story += [
        Spacer(1, 6 * mm), Paragraph("COMENTARIO", E["etiqueta"]), Spacer(1, 1.5 * mm),
        caja_texto(servicio.comentarios_finales or "Sin comentarios.", ANCHO),
    ]

    story += [Spacer(1, 6 * mm), notas_pie(ANCHO)]
    story.append(Spacer(1, 2 * mm))
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

    story += seccion("Refacciones", ANCHO)
    filas = []
    for d in cotizacion.detalles:
        refaccion = d.refaccion.nombre_refaccion if d.refaccion else None
        principal = refaccion or d.descripcion or "Refacción"
        concepto = Paragraph(
            f"<b>{esc(principal)}</b>" + (f"<br/><font size='7.5' color='#6b7480'>{esc(d.descripcion)}</font>" if d.descripcion and d.descripcion != principal else ""),
            E["celda"],
        )
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        cant = d.cantidad or 1
        filas.append([concepto, str(cant), fmt(importe / cant), Paragraph(f"<b>{fmt(importe)}</b>", E["celda_centro"])])
    story.append(tabla_conceptos(
        ["Refacción", "Cant.", "Precio unitario", "Importe"], filas,
        [ANCHO * w for w in (0.46, 0.14, 0.20, 0.20)], alinear_centro=(1, 2, 3),
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
