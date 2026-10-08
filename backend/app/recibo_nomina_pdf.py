"""Recibo de nómina (comprobante interno, no es CFDI) de un empleado en un periodo."""
from io import BytesIO

from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer

from .pdf_diseno import E, OK, PlantillaDocumento, esc, firmas, fmt, seccion, tabla_conceptos, totales
from .recibo_pdf import ANCHO


def generar_recibo_nomina_pdf(recibo, empleado, periodo, taller=None) -> bytes:
    buffer = BytesIO()
    nombre = " ".join(x for x in [empleado.nombre, empleado.paterno, empleado.materno] if x)
    plantilla = PlantillaDocumento(
        taller, "Recibo de nómina", f"#{recibo.id_recibo:05d}",
        lineas_derecha=[f"Periodo: {periodo.fecha_inicio:%d/%m/%Y} al {periodo.fecha_fin:%d/%m/%Y}", f"Pago: {periodo.periodicidad}"],
    )
    doc = plantilla.documento(buffer)
    story = []

    datos = [f"<b>{esc(nombre)}</b>", esc(empleado.puesto or "Empleado")]
    ident = [x for x in [f"RFC {empleado.rfc_empleado}" if empleado.rfc_empleado else None,
                         f"CURP {empleado.curp}" if empleado.curp else None,
                         f"NSS {empleado.nss}" if empleado.nss else None] if x]
    if ident:
        datos.append(esc(" · ".join(ident)))
    story += seccion("Empleado", ANCHO)
    story.append(Paragraph("<br/>".join(datos), E["parrafo"]))
    story.append(Spacer(1, 4 * mm))

    percepciones = []
    if recibo.sueldo_base and (empleado.esquema_pago or "fijo") in ("fijo", "mixto"):
        percepciones.append(["Sueldo base", fmt(recibo.sueldo_base)])
    if recibo.pago_horas_extra:
        percepciones.append([f"Horas extra ({recibo.horas_extra:g} h, dobles)", fmt(recibo.pago_horas_extra)])
    if recibo.comisiones:
        percepciones.append(["Comisiones por órdenes", fmt(recibo.comisiones)])
    if recibo.destajo:
        percepciones.append([f"Destajo{(' — ' + recibo.destajo_nota) if recibo.destajo_nota else ''}", fmt(recibo.destajo)])
    if recibo.bonos:
        percepciones.append([f"Bonos{(' — ' + recibo.bonos_nota) if recibo.bonos_nota else ''}", fmt(recibo.bonos)])
    story += seccion("Percepciones", ANCHO)
    story.append(tabla_conceptos(["Concepto", "Importe"], percepciones, [ANCHO * 0.75, ANCHO * 0.25], alinear_derecha=(1,), vacio="Sin percepciones"))
    story.append(Spacer(1, 4 * mm))

    deducciones = []
    if recibo.descuento_faltas:
        deducciones.append([f"Faltas ({recibo.faltas:g} día(s))", fmt(recibo.descuento_faltas)])
    neto_isr = (recibo.isr or 0) - (recibo.subsidio or 0)
    if neto_isr:
        deducciones.append(["ISR (retención estimada, ya con subsidio al empleo)", fmt(neto_isr)])
    if recibo.imss:
        deducciones.append(["IMSS (cuota obrera estimada)", fmt(recibo.imss)])
    if recibo.prestamo:
        deducciones.append([f"Préstamo / adelanto{(' — ' + recibo.prestamo_nota) if recibo.prestamo_nota else ''}", fmt(recibo.prestamo)])
    if recibo.deducciones:
        deducciones.append([f"Otras deducciones{(' — ' + recibo.deducciones_nota) if recibo.deducciones_nota else ''}", fmt(recibo.deducciones)])
    story += seccion("Deducciones", ANCHO)
    story.append(tabla_conceptos(["Concepto", "Importe"], deducciones, [ANCHO * 0.75, ANCHO * 0.25], alinear_derecha=(1,), vacio="Sin deducciones"))
    story.append(Spacer(1, 4 * mm))

    story.append(totales([
        ("Total percepciones", fmt(recibo.percepciones)),
        ("Total deducciones", fmt(recibo.total_deducciones)),
        ("Neto a pagar", fmt(recibo.total_pagar)),
    ], ANCHO, color_final=OK))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Comprobante interno de pago. Las retenciones de ISR e IMSS son estimadas y no sustituyen el CFDI de nómina.",
        E["parrafo"],
    ))
    story.append(Spacer(1, 10 * mm))
    story.append(firmas(["Firma del empleado", "Firma / sello del taller"], ANCHO))

    doc.build(story, onFirstPage=plantilla, onLaterPages=plantilla)
    return buffer.getvalue()
