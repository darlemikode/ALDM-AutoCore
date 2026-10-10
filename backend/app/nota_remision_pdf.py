"""
Nota de remisión — el documento que se entrega al cliente cuando recoge su
vehículo. Distinto del recibo de pago (`recibo_pdf.py`): aquí lo importante
es dejar constancia de qué se le hizo al vehículo, en qué kilometraje entró,
el diagnóstico y la conformidad del cliente al recibirlo. También incluye el
total, para no obligar a manejar dos papeles.
"""
from datetime import datetime
from io import BytesIO

from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle

from .pdf_diseno import (
    notas_pie, fecha_mx, hoy_mx, ACCENT, E, OK, OK_SOFT, PlantillaDocumento, aviso, caja_texto, dos_columnas, esc, firmas, fmt, seccion,
    tabla_conceptos, totales,
)
from .recibo_pdf import ANCHO, bloques_cliente_vehiculo, categoria_refaccion, nombre_refaccion
from .schemas import ServicioCostos


def generar_nota_remision_pdf(servicio, costos: ServicioCostos, taller=None, inspeccion=None) -> bytes:
    buffer = BytesIO()
    entrega = f"{(fecha_mx(servicio.fecha_salida_servicio) or hoy_mx()):%d/%m/%Y}"
    liquidado = costos.saldo_pendiente <= 0
    plantilla = PlantillaDocumento(
        taller, "Nota de remisión", f"#{servicio.id_servicio:05d}",
        lineas_derecha=[f"Entrada: {fecha_mx(servicio.fecha_entrada_servicio):%d/%m/%Y}", f"Salida: {entrega}"],
    )
    doc = plantilla.documento(buffer)
    story = []

    if servicio.es_garantia:
        story.append(aviso(f"Reclamación de garantía de la orden #{servicio.id_servicio_original:05d}."
                           + (f" Motivo: {esc(servicio.motivo_garantia)}" if servicio.motivo_garantia else ""), ANCHO))
        story.append(Spacer(1, 4 * mm))

    story += bloques_cliente_vehiculo(servicio)

    media = (ANCHO - 5 * mm) / 2
    story.append(dos_columnas(
        [*seccion("Diagnóstico", media), caja_texto(servicio.diagnostico or "Sin diagnóstico registrado.", media)],
        [*seccion("Trabajos realizados", media), caja_texto(servicio.operaciones or servicio.nombre_servicio or "Sin detalle registrado.", media)],
        ANCHO,
    ))

    story += seccion("Refacciones", ANCHO)
    filas = []
    for d in servicio.detalles:
        refaccion = nombre_refaccion(d)
        nombre = Paragraph(
            esc(d.descripcion or refaccion or "—")
            + (f"<br/><font size='7.5' color='#6b7480'>Refacción: {esc(refaccion)}</font>" if refaccion and refaccion != d.descripcion else ""),
            E["celda"],
        )
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        cant = d.cantidad or 1
        filas.append([nombre, str(cant), fmt(importe / cant), Paragraph(f"<b>{fmt(importe)}</b>", E["celda_centro"])])
    story.append(tabla_conceptos(
        ["Refacción", "Cant.", "Precio unitario", "Importe"], filas,
        [ANCHO * w for w in (0.46, 0.14, 0.20, 0.20)], alinear_centro=(1, 2, 3),
    ))
    story.append(Spacer(1, 4 * mm))
    izquierda = []
    if servicio.km_proximo_servicio:
        izquierda.append(aviso(f"Próximo servicio recomendado a los {esc(servicio.km_proximo_servicio)} km.", ANCHO - 88 * mm, color=OK, fondo=OK_SOFT))
    if servicio.comentarios_finales:
        if izquierda:
            izquierda.append(Spacer(1, 3 * mm))
        izquierda += [Paragraph("COMENTARIOS", E["etiqueta"]), Spacer(1, 1.5 * mm), caja_texto(servicio.comentarios_finales, ANCHO - 88 * mm)]
    bloque = Table([[izquierda or "", totales([
        ("Total del servicio", fmt(costos.total)),
        ("Pagado", fmt(costos.total_abonado)),
        ("Liquidado" if liquidado else "Saldo pendiente", fmt(costos.saldo_pendiente)),
    ], ANCHO, color_final=OK if liquidado else ACCENT)]], colWidths=[ANCHO - 82 * mm, 82 * mm])
    bloque.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(bloque)

    story.append(KeepTogether([
        *seccion("Conformidad", ANCHO),
        Paragraph(
            "Declaro que recibí el vehículo arriba descrito a mi entera satisfacción, revisado y en las condiciones "
            "convenidas con el taller.", E["parrafo"],
        ),
        Spacer(1, 1 * mm),
        firmas(["Nombre y firma del cliente", "Firma / sello del taller"], ANCHO),
    ]))
    story += [Spacer(1, 5 * mm), notas_pie(ANCHO)]
    from .inspeccion_pdf import hoja_inspeccion
    story += hoja_inspeccion(inspeccion, ANCHO)

    doc.build(story, onFirstPage=plantilla, onLaterPages=plantilla)
    return buffer.getvalue()
