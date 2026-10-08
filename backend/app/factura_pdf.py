"""Representación impresa del CFDI 4.0 (misma línea visual que recibo y nota).

Se genera para cualquier proveedor (simulado o Facturapi) a partir del XML
timbrado: de ahí salen los sellos, el certificado del SAT y los datos para
el código QR de verificación. El documento legal es el XML; este PDF es su
representación impresa.
"""
import json
from io import BytesIO
from urllib.parse import quote
from xml.etree import ElementTree as ET

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle

from .pdf_diseno import (
    ACCENT, ACCENT_SOFT, E, INK, LINE, ROJO, ROJO_SOFT, OK, OK_SOFT, SOFT, WARN, WARN_SOFT, PlantillaDocumento, aviso, dos_columnas,
    esc, fmt, pastilla, seccion, tabla_conceptos, tarjeta, totales,
)

ANCHO = 183.9 * mm
NS = {"cfdi": "http://www.sat.gob.mx/cfd/4", "tfd": "http://www.sat.gob.mx/TimbreFiscalDigital"}

REGIMENES = {
    "601": "General de Ley Personas Morales", "603": "Personas Morales con Fines no Lucrativos",
    "605": "Sueldos y Salarios", "606": "Arrendamiento", "608": "Demás ingresos",
    "612": "Personas Físicas con Actividades Empresariales y Profesionales", "616": "Sin obligaciones fiscales",
    "621": "Incorporación Fiscal", "625": "Plataformas Tecnológicas", "626": "Régimen Simplificado de Confianza",
}
USOS = {"G01": "Adquisición de mercancías", "G02": "Devoluciones, descuentos o bonificaciones", "G03": "Gastos en general",
        "I03": "Equipo de transporte", "I08": "Otra maquinaria y equipo", "S01": "Sin efectos fiscales"}
FORMAS_PAGO = {"01": "Efectivo", "02": "Cheque nominativo", "03": "Transferencia electrónica", "04": "Tarjeta de crédito",
               "28": "Tarjeta de débito", "99": "Por definir"}
METODOS_PAGO = {"PUE": "Pago en una sola exhibición", "PPD": "Pago en parcialidades o diferido"}


# --- Importe con letra ---------------------------------------------------------
_UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE",
             "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIÚN",
             "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"]
_DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
_CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS",
             "OCHOCIENTOS", "NOVECIENTOS"]


def _menor_mil(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "CIEN"
    c, r = divmod(n, 100)
    partes = [_CENTENAS[c]] if c else []
    if r < 30:
        partes.append(_UNIDADES[r])
    else:
        d, u = divmod(r, 10)
        partes.append(_DECENAS[d] + (f" Y {_UNIDADES[u]}" if u else ""))
    return " ".join(p for p in partes if p)


def numero_a_letras(n: int) -> str:
    if n == 0:
        return "CERO"
    millones, resto = divmod(n, 1_000_000)
    miles, unidades = divmod(resto, 1000)
    partes = []
    if millones:
        partes.append("UN MILLÓN" if millones == 1 else f"{numero_a_letras(millones)} MILLONES")
    if miles:
        partes.append("MIL" if miles == 1 else f"{_menor_mil(miles)} MIL")
    if unidades:
        partes.append(_menor_mil(unidades))
    return " ".join(partes)


def importe_con_letra(total: float) -> str:
    enteros = int(round(total, 2))
    centavos = int(round((round(total, 2) - enteros) * 100))
    if centavos < 0:  # por redondeo de flotantes
        enteros, centavos = enteros - 1, centavos + 100
    texto = numero_a_letras(enteros)
    moneda = "PESO" if enteros == 1 else "PESOS"
    if enteros >= 1_000_000 and enteros % 1_000_000 == 0:
        moneda = "DE PESOS"
    return f"{texto} {moneda} {centavos:02d}/100 M.N."


# --- Datos del timbre desde el XML -------------------------------------------------
def datos_xml(xml_bytes: bytes | None) -> dict:
    vacio = {"sello_cfd": "", "no_cert": "", "sello_sat": "", "no_cert_sat": "", "fecha_timbrado": "", "rfc_prov": "",
             "emisor_rfc": None, "emisor_nombre": None, "emisor_regimen": None, "lugar_expedicion": None}
    if not xml_bytes:
        return vacio
    try:
        raiz = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return vacio
    emisor = raiz.find("cfdi:Emisor", NS)
    tfd = raiz.find(".//tfd:TimbreFiscalDigital", NS)
    d = dict(vacio)
    d.update({
        "sello_cfd": raiz.get("Sello", ""), "no_cert": raiz.get("NoCertificado", ""),
        "lugar_expedicion": raiz.get("LugarExpedicion"),
        "emisor_rfc": emisor.get("Rfc") if emisor is not None else None,
        "emisor_nombre": emisor.get("Nombre") if emisor is not None else None,
        "emisor_regimen": emisor.get("RegimenFiscal") if emisor is not None else None,
    })
    if tfd is not None:
        d.update({
            "sello_sat": tfd.get("SelloSAT", ""), "no_cert_sat": tfd.get("NoCertificadoSAT", ""),
            "fecha_timbrado": tfd.get("FechaTimbrado", ""), "rfc_prov": tfd.get("RfcProvCertif", ""),
        })
        d["cadena"] = f"||1.1|{tfd.get('UUID', '')}|{d['fecha_timbrado']}|{d['rfc_prov']}|{tfd.get('SelloCFD', '')}|{d['no_cert_sat']}||"
    return d


def _qr(url: str, lado: float) -> Drawing:
    w = QrCodeWidget(url)
    x0, y0, x1, y1 = w.getBounds()
    dib = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    dib.add(w)
    return dib


def _texto_mono(texto: str) -> Paragraph:
    # Cortes suaves para que los sellos (texto sin espacios) se ajusten al ancho
    trozos = [esc(texto[i:i + 100]) for i in range(0, len(texto or ""), 100)]
    return Paragraph("<br/>".join(trozos) or "—", E["mono"])


# --- PDF -------------------------------------------------------------------------------
def generar_factura_pdf(factura, config, taller=None, xml_bytes: bytes | None = None, simulada: bool | None = None) -> bytes:
    if simulada is None:
        simulada = factura.proveedor == "simulado"
    x = datos_xml(xml_bytes)
    cancelada = factura.estado == "cancelada"
    buffer = BytesIO()
    plantilla = PlantillaDocumento(
        taller, "Factura · CFDI 4.0", f"{factura.serie or ''}-{factura.folio or ''}",
        lineas_derecha=[f"Emisión: {factura.fecha_emision:%d/%m/%Y %H:%M}", "Tipo: I — Ingreso", "Moneda: MXN"],
        marca_agua="CANCELADA" if cancelada else ("SIN VALIDEZ FISCAL" if simulada else None),
        color_marca=ROJO,
    )
    doc = plantilla.documento(buffer)
    story = []

    if simulada:
        story += [aviso("Factura de prueba (modo simulado): no fue timbrada por un PAC ni enviada al SAT. Sin validez fiscal.",
                        ANCHO, color=ROJO, fondo=ROJO_SOFT), Spacer(1, 4 * mm)]
    elif factura.estado == "cancelacion_pendiente":
        story += [aviso("Cancelación en proceso: pendiente de aceptación del receptor ante el SAT.", ANCHO), Spacer(1, 4 * mm)]

    # Emisor | Receptor
    rfc_emisor = x["emisor_rfc"] or config.rfc_emisor or ""
    regimen_emisor = x["emisor_regimen"] or config.regimen_fiscal_emisor or ""
    lugar = x["lugar_expedicion"] or config.cp_expedicion or ""
    col = (ANCHO - 5 * mm) / 2
    emisor = tarjeta([
        ("Razón social", x["emisor_nombre"] or config.razon_social_emisor or ""),
        ("RFC", rfc_emisor),
        ("Régimen fiscal", Paragraph(f"<b>{esc(regimen_emisor)}</b> · {esc(REGIMENES.get(regimen_emisor, ''))}", ParagraphStyle("rg", parent=E["valor_n"], fontSize=8.5, leading=11))),
        ("CP expedición", lugar),
    ], col, columnas=2, proporciones=(0.6, 0.4))
    receptor = tarjeta([
        ("Nombre / razón social", factura.receptor_nombre),
        ("RFC", factura.receptor_rfc),
        ("Régimen fiscal", Paragraph(f"<b>{esc(factura.receptor_regimen)}</b> · {esc(REGIMENES.get(factura.receptor_regimen, ''))}", ParagraphStyle("rg", parent=E["valor_n"], fontSize=8.5, leading=11))),
        ("CP fiscal", factura.receptor_cp),
    ], col, columnas=2, proporciones=(0.6, 0.4))
    story += [dos_columnas(Paragraph("EMISOR", E["etiqueta"]), Paragraph("RECEPTOR", E["etiqueta"]), ANCHO), Spacer(1, 1.5 * mm),
              dos_columnas(emisor, receptor, ANCHO)]

    # Datos del comprobante
    if cancelada:
        estado, color_estado = "CANCELADA", ROJO
    elif factura.estado == "cancelacion_pendiente":
        estado, color_estado = "CANCELACIÓN PENDIENTE", WARN
    elif simulada:
        estado, color_estado = "SIMULADA", WARN
    else:
        estado, color_estado = "VIGENTE", OK
    story += seccion("Datos del comprobante", ANCHO, derecha=f"<font color='#{color_estado.hexval()[2:]}'><b>● {estado}</b></font>")
    story.append(tarjeta([
        ("Folio fiscal (UUID)", Paragraph(f"<font name='Courier-Bold' size='7.8'>{esc(factura.uuid)}</font>", E["valor"])),
        ("Uso del CFDI", f"{factura.uso_cfdi} · {USOS.get(factura.uso_cfdi, '')}"),
        ("Forma de pago", f"{factura.forma_pago} · {FORMAS_PAGO.get(factura.forma_pago, '')}"),
        ("Método de pago", f"{factura.metodo_pago} · {METODOS_PAGO.get(factura.metodo_pago, '')}"),
    ], ANCHO, columnas=4, fondo=None, borde=LINE, proporciones=(0.37, 0.23, 0.2, 0.2)))

    # Conceptos
    conceptos = json.loads(factura.conceptos_json)
    story += seccion("Conceptos", ANCHO, derecha=f"{len(conceptos)} concepto(s)")
    filas = []
    for c in conceptos:
        pu = c["precio_unitario"]
        filas.append([
            Paragraph(f"<font name='Courier'>{esc(c['clave_prod_serv'])}</font>", E["celda"]),
            f"{c['cantidad']:g}",
            c["clave_unidad"],
            c["descripcion"],
            f"${pu:,.2f}" if round(pu, 2) == pu else f"${pu:,.4f}",
            fmt(c.get("iva", 0)),
            Paragraph(f"<b>{fmt(c['importe'])}</b>", E["celda_der"]),
        ])
    story.append(tabla_conceptos(
        ["Clave SAT", "Cant.", "Unidad", "Descripción", "P. unitario", "IVA", "Importe"], filas,
        [ANCHO * w for w in (0.11, 0.07, 0.085, 0.37, 0.13, 0.10, 0.135)], alinear_derecha=(1, 4, 5, 6), vacio="Sin conceptos registrados",
    ))
    story.append(Spacer(1, 5 * mm))

    # Importe con letra + QR (izquierda) · totales (derecha)
    tasa = ""
    if factura.subtotal:
        tasa = f" {round(factura.iva / factura.subtotal * 100):g}%"
    tt = f"{factura.total:.6f}".rstrip("0").rstrip(".")
    url_qr = ("https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx"
              f"?id={factura.uuid}&re={quote(rfc_emisor)}&rr={quote(factura.receptor_rfc)}&tt={tt}&fe={(x['sello_cfd'] or '')[-8:]}")
    letra = [
        Paragraph("IMPORTE CON LETRA", E["etiqueta"]), Spacer(1, 1.5 * mm),
        Paragraph(importe_con_letra(factura.total), E["valor"]),
    ]
    bloque = Table([[letra, totales([
        ("Subtotal", fmt(factura.subtotal)),
        (f"IVA trasladado{tasa}", fmt(factura.iva)),
        ("Total MXN", fmt(factura.total)),
    ], ANCHO, color_final=ROJO if cancelada else ACCENT)]], colWidths=[ANCHO - 82 * mm, 82 * mm])
    bloque.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(bloque)

    # Timbre: QR de verificación (izquierda) + sellos y certificación (derecha)
    lado_qr = 31 * mm
    ancho_sellos = ANCHO - lado_qr - 6 * mm
    sellos = Table([
        [Paragraph("SELLO DIGITAL DEL CFDI", E["etiqueta"])], [_texto_mono(x["sello_cfd"])],
        [Paragraph("SELLO DEL SAT", E["etiqueta"])], [_texto_mono(x["sello_sat"])],
        [Paragraph("CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACIÓN DIGITAL DEL SAT", E["etiqueta"])], [_texto_mono(x.get("cadena", ""))],
        [Paragraph(
            f"Certificado emisor: <b>{esc(x['no_cert'] or '—')}</b> · Certificado SAT: <b>{esc(x['no_cert_sat'] or '—')}</b> · "
            f"Certificación: <b>{esc(x['fecha_timbrado'] or '—')}</b> · RFC del PAC: <b>{esc(x['rfc_prov'] or '—')}</b>", E["nota"])],
    ], colWidths=[ancho_sellos])
    sellos.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2), ("TOPPADDING", (0, -1), (-1, -1), 4),
    ]))
    timbre = Table([[
        [_qr(url_qr, lado_qr), Spacer(1, 1.5 * mm), Paragraph("Verifica este CFDI en el portal del SAT.", ParagraphStyle("q", parent=E["nota"], fontSize=6.5, leading=8, alignment=1))],
        sellos,
    ]], colWidths=[lado_qr + 6 * mm, ancho_sellos])
    timbre.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("ROUNDEDCORNERS", [5, 5, 5, 5]), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 7), ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 4), ("RIGHTPADDING", (1, 0), (1, 0), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    leyenda = Paragraph(
        "Este documento es una representación impresa de un CFDI 4.0."
        + (" Generado en modo de simulación." if simulada else "")
        + (f" Cancelado el {factura.fecha_cancelacion:%d/%m/%Y} (motivo {esc(factura.motivo_cancelacion)})." if cancelada and factura.fecha_cancelacion else ""),
        E["nota"],
    )
    story.append(KeepTogether([*seccion("Timbre fiscal digital", ANCHO), timbre, Spacer(1, 2.5 * mm), leyenda]))
    doc.build(story, onFirstPage=plantilla, onLaterPages=plantilla)
    return buffer.getvalue()

