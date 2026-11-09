"""
Nota en formato ticket (papel térmico de 80 mm) para recibo y nota de remisión.

Es la misma información que la nota tamaño carta pero en una sola columna y
en una hoja continua: el ancho es fijo (80 mm) y el alto se calcula según el
contenido, así la impresora corta justo al terminar. Solo blanco y negro y
fuentes base de PDF (Helvetica), para que se vea nítido en térmica.
"""
from io import BytesIO

from PIL import Image as PILImage, ImageFilter, ImageOps

from reportlab.graphics.barcode import code128
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.platypus.flowables import HRFlowable

from .pdf_diseno import datos_taller, esc, fecha_mx, fmt, hoy_mx

ANCHO_PAPEL = 80 * mm
MARGEN = 3.5 * mm
ANCHO = ANCHO_PAPEL - 2 * MARGEN  # ≈ 73 mm útiles
ANCHO_IMPORTE = 22 * mm
NEGRO = colors.black
BLANCO = colors.white
GRIS = colors.Color(0.30, 0.30, 0.30)
GRIS_LINEA = colors.Color(0.62, 0.62, 0.62)
LOGO_MAX_ANCHO = ANCHO
LOGO_MAX_ALTO = 34 * mm


def _e(nombre, **kw):
    base = dict(fontName="Helvetica", fontSize=8.4, leading=11.2, textColor=NEGRO)
    base.update(kw)
    return ParagraphStyle(nombre, **base)


T_NOMBRE = _e("t_nombre", fontName="Helvetica-Bold", fontSize=13, leading=15, alignment=TA_CENTER)
T_CENTRO = _e("t_centro", fontSize=7, leading=9, alignment=TA_CENTER)
T_TITULO = _e("t_titulo", fontName="Helvetica-Bold", fontSize=9.5, leading=12, alignment=TA_CENTER)
T_FOLIO = _e("t_folio", fontName="Helvetica-Bold", fontSize=10, leading=12, alignment=TA_CENTER)
T_SALDO = _e("t_saldo", fontName="Helvetica-Bold", fontSize=9.5, leading=12)
T_SALDO_D = _e("t_saldo_d", fontName="Helvetica-Bold", fontSize=11, leading=13, alignment=TA_RIGHT)
T_ETIQ = _e("t_etiq", fontName="Helvetica-Bold", fontSize=7, leading=9)
T_TEXTO = _e("t_texto")
T_NEGRITA = _e("t_negrita", fontName="Helvetica-Bold")
T_DER = _e("t_der", alignment=TA_RIGHT)
T_DER_N = _e("t_der_n", fontName="Helvetica-Bold", alignment=TA_RIGHT)
T_TOTAL = _e("t_total", fontName="Helvetica-Bold", fontSize=11, leading=13)
T_TOTAL_D = _e("t_total_d", fontName="Helvetica-Bold", fontSize=11, leading=13, alignment=TA_RIGHT)
T_SEC = _e("t_sec", fontName="Helvetica-Bold", fontSize=7.4, leading=9)
T_SUB = _e("t_sub", fontSize=7.2, leading=8.8, textColor=GRIS)
T_SUB_D = _e("t_sub_d", fontSize=7.2, leading=8.8, textColor=GRIS, alignment=TA_RIGHT)
T_MINI = _e("t_mini", fontSize=6, leading=7, textColor=GRIS)
T_VALOR = _e("t_valor", fontName="Helvetica-Bold", fontSize=8.5, leading=10)
T_PIE = _e("t_pie", fontSize=6.8, leading=8.4, alignment=TA_CENTER)
T_GRACIAS = _e("t_gracias", fontName="Helvetica-Bold", fontSize=9, leading=11, alignment=TA_CENTER)


def _logo_termico(logo):
    """Logo en blanco y negro puro (tramado) para que la térmica lo imprima nítido.
    Devuelve un flowable Image centrado o None si no hay logo / está dañado."""
    if logo is None:
        return None
    try:
        img = getattr(logo, "_image", None)
        if img is None:
            return None
        img = img.convert("RGBA")
        fondo = PILImage.new("RGBA", img.size, (255, 255, 255, 255))
        fondo.alpha_composite(img)
        gris = ImageOps.autocontrast(fondo.convert("L"))
        gris.thumbnail((900, 620))
        # Solo líneas, sin fondo: si el logo es un dibujo de trazos se queda como está; si tiene
        # áreas rellenas (círculos, fondos de color) se dibuja únicamente su contorno.
        trazo = gris.point(lambda v: 0 if v < 140 else 255)
        oscuros = trazo.histogram()[0] / float(trazo.size[0] * trazo.size[1])
        if oscuros > 0.18:
            bordes = ImageOps.autocontrast(gris.filter(ImageFilter.FIND_EDGES))
            trazo = bordes.point(lambda v: 0 if v > 60 else 255)
            trazo = trazo.filter(ImageFilter.MinFilter(3))  # engrosa un poco el trazo
        bn = trazo.convert("L")
        w, h = bn.size
        esc_ = min(LOGO_MAX_ANCHO / w, LOGO_MAX_ALTO / h)
        buf = BytesIO()
        bn.save(buf, "PNG")
        buf.seek(0)
        flow = Image(buf, width=w * esc_, height=h * esc_)
        flow.hAlign = "CENTER"
        return flow
    except Exception:  # noqa: BLE001 — un logo dañado no debe impedir generar el ticket
        return None


def _banda(texto, estilo=None):
    """Título del documento: texto centrado entre una línea gruesa y una fina."""
    t = Table([[Paragraph(texto, estilo or T_TITULO)]], colWidths=[ANCHO])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1.6, NEGRO), ("LINEBELOW", (0, 0), (-1, 0), 0.5, NEGRO),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _fila_inversa(izq, der):
    """Saldo / liquidado: recuadro de línea doble, sin relleno."""
    t = Table([[Paragraph(izq, T_SALDO), Paragraph(der, T_SALDO_D)]], colWidths=[ANCHO - ANCHO_IMPORTE, ANCHO_IMPORTE])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.2, NEGRO), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
    ]))
    return t


def _fila_total(izq, der):
    t = Table([[Paragraph(izq, T_TOTAL), Paragraph(der, T_TOTAL_D)]], colWidths=[ANCHO - ANCHO_IMPORTE, ANCHO_IMPORTE])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, NEGRO), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _linea():
    return HRFlowable(width="100%", thickness=0.5, color=GRIS_LINEA, spaceBefore=3.5, spaceAfter=3.5)


def _corte():
    """Línea punteada de corte, solo antes de los términos."""
    return HRFlowable(width="100%", thickness=0.7, color=NEGRO, dash=(2, 2), spaceBefore=5, spaceAfter=5)


def _seccion(titulo, derecha=None):
    """Título de sección: texto en negritas con un filete fino debajo."""
    t = Table([[Paragraph(titulo, T_SEC), Paragraph(derecha or "", T_SUB_D)]], colWidths=[ANCHO * 0.62, ANCHO * 0.38])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, NEGRO), ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
    ]))
    return [t, Spacer(1, 1.3 * mm)]


def _ficha_orden(folio, pares):
    """Cuadro con el folio destacado y, al lado, entrada / salida / estado."""
    n = len(pares)
    ancho_folio = 21 * mm
    resto = (ANCHO - ancho_folio) / n
    t = Table([
        [Paragraph("FOLIO", T_MINI)] + [Paragraph(e, T_MINI) for e, _ in pares],
        [Paragraph(f"#{folio}", _e("t_folio_n", fontName="Helvetica-Bold", fontSize=14, leading=16))] + [Paragraph(v, _e("t_val_f", fontName="Helvetica-Bold", fontSize=8, leading=10)) for _, v in pares],
    ], colWidths=[ancho_folio] + [resto] * n)
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, NEGRO),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, GRIS_LINEA),
        ("LINEAFTER", (1, 0), (n - 2, -1), 0.5, GRIS_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, 0), 2.5), ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 0), ("BOTTOMPADDING", (0, 1), (-1, 1), 3),
    ]))
    return t


def _datos(pares):
    """Fila de datos con etiqueta chica arriba y valor en negritas: [(etiqueta, valor), ...]."""
    n = len(pares)
    t = Table([[Paragraph(e, T_MINI) for e, _ in pares], [Paragraph(v, T_VALOR) for _, v in pares]], colWidths=[ANCHO / n] * n)
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.4), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.4),
    ]))
    return t


def _fila_sub(izq, der):
    """Renglón secundario (desglose) con sangría, en gris y letra chica."""
    t = Table([["", Paragraph(izq, T_SUB), Paragraph(der, T_SUB_D)]], colWidths=[2.5 * mm, ANCHO - ANCHO_IMPORTE - 2.5 * mm, ANCHO_IMPORTE])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.2),
    ]))
    return t


def _fila(izq, der, estilo_izq=T_TEXTO, estilo_der=T_DER):
    t = Table([[Paragraph(izq, estilo_izq), Paragraph(der, estilo_der)]], colWidths=[ANCHO - ANCHO_IMPORTE, ANCHO_IMPORTE])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6),
    ]))
    return t


def _fila_mitad(izq, der):
    t = Table([[Paragraph(izq, T_TEXTO), Paragraph(der, T_DER)]], colWidths=[ANCHO / 2, ANCHO / 2])
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0.8), ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8),
    ]))
    return t


def _importe(d) -> float:
    return (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)


def _concepto(d, nombre_refaccion) -> str:
    return d.descripcion or nombre_refaccion(d) or "Concepto"


def _tabla_conceptos(filas, anchos, encabezado=True):
    t = Table(filas, colWidths=anchos, repeatRows=0)
    est = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, NEGRO),
    ]
    if encabezado:
        est += [("LINEABOVE", (0, 0), (-1, 0), 0.8, NEGRO), ("LINEBELOW", (0, 0), (-1, 0), 0.5, NEGRO),
                ("TOPPADDING", (0, 0), (-1, 0), 3.5), ("BOTTOMPADDING", (0, 0), (-1, 0), 3.5)]
    t.setStyle(TableStyle(est))
    return t


def _tabla_mini(filas, anchos):
    """Cuadro chico con rejilla fina (desglose de impuestos y de pago)."""
    t = Table(filas, colWidths=anchos)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, NEGRO), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2.4), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _qr(url, lado=30 * mm):
    """Código QR como flowable centrado (vectorial, nítido en térmica)."""
    w = QrCodeWidget(url, barLevel="M")
    x0, y0, x1, y1 = w.getBounds()
    d = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    d.add(w)
    d.hAlign = "CENTER"
    return d


def _construir(tipo, servicio, costos, taller, qr_url=None):
    """tipo: 'recibo' | 'remision'. Devuelve la lista de flowables.

    Orden de un ticket de punto de venta: logotipo, razón social y dirección; datos del
    cliente; tipo de documento, folio, fecha y quién atendió; relación de conceptos con
    cantidades y precios; totales; desglose de impuestos; forma de pago; pie."""
    from .pdf_nota import TERMINOS_RECIBO, TERMINOS_REMISION, datos_cliente, datos_vehiculo
    from .recibo_pdf import nombre_refaccion

    t = datos_taller(taller)
    remision = tipo == "remision"
    liquidado = costos.saldo_pendiente <= 0
    s = []
    c_sec = _e("t_sec_c", fontName="Helvetica-Bold", fontSize=8, leading=10, alignment=TA_CENTER)
    c_val = _e("t_val_c", fontName="Helvetica-Bold", fontSize=8.5, leading=10.5, alignment=TA_CENTER)
    c_sub = _e("t_sub_c", fontSize=7.6, leading=9.4, alignment=TA_CENTER, textColor=GRIS)
    c_txt = _e("t_txt_c", fontSize=8, leading=10, alignment=TA_CENTER)
    c_doc = _e("t_doc_c", fontName="Helvetica-Bold", fontSize=11.5, leading=14, alignment=TA_CENTER)
    h_izq = _e("t_h_izq", fontName="Helvetica-Bold", fontSize=7.4, leading=9)
    h_cen = _e("t_h_cen", fontName="Helvetica-Bold", fontSize=7.4, leading=9, alignment=TA_CENTER)
    h_der = _e("t_h_der", fontName="Helvetica-Bold", fontSize=7.4, leading=9, alignment=TA_RIGHT)
    c_cant = _e("t_c_cant", fontSize=8.4, leading=10.8, alignment=TA_CENTER)
    c_der = _e("t_c_der", fontSize=8.4, leading=10.8, alignment=TA_RIGHT)
    c_der_n = _e("t_c_der_n", fontName="Helvetica-Bold", fontSize=8.4, leading=10.8, alignment=TA_RIGHT)
    c_izq_n = _e("t_c_izq_n", fontSize=8.4, leading=10.8)
    c_izq_s = _e("t_c_izq_s", fontSize=7.2, leading=9, textColor=GRIS)
    c_der_s = _e("t_c_der_s", fontSize=7.2, leading=9, textColor=GRIS, alignment=TA_RIGHT)
    m_cab = _e("t_m_cab", fontName="Helvetica-Bold", fontSize=7, leading=8.6, alignment=TA_CENTER)
    m_cel = _e("t_m_cel", fontSize=8, leading=10, alignment=TA_CENTER)

    # --- 1. Logotipo, razón social y dirección
    logo = _logo_termico(t["logo"])
    if logo is not None:
        s.append(logo)
        s.append(Spacer(1, 2 * mm))
    s.append(Paragraph(esc(t["nombre"]).upper(), T_NOMBRE))
    s.append(Spacer(1, 0.8 * mm))
    for linea in (t["linea1"], t["linea2"]):
        if linea:
            s.append(Paragraph(esc(linea), T_CENTRO))
    s.append(_corte())

    # --- 2. Datos del cliente y del vehículo
    cliente = datos_cliente(servicio.cliente)
    extra_km = f"Próximo servicio: {servicio.km_proximo_servicio} km" if servicio.km_proximo_servicio and not remision else None
    vehiculo, placas = datos_vehiculo(servicio.vehiculo, km=servicio.km_llegada, extra_km=extra_km)
    s.append(Paragraph("DATOS DEL CLIENTE", c_sec))
    s.append(Spacer(1, 0.8 * mm))
    for clase, texto in cliente.lineas:
        if clase == "nombre":
            s.append(Paragraph(esc(texto), c_val))
        elif "@" not in str(texto) and str(texto).replace(" ", "").replace("-", "").isdigit():
            s.append(Paragraph(f"Tel. {esc(texto)}", c_sub))
        else:
            s.append(Paragraph(esc(texto), c_sub))
    s.append(Spacer(1, 3 * mm))
    s.append(Paragraph("VEHÍCULO", c_sec))
    s.append(Spacer(1, 0.8 * mm))
    for clase, texto in vehiculo.lineas:
        s.append(Paragraph(esc(texto), c_val if clase == "nombre" else c_sub))
    if placas:
        s.append(Paragraph(f"Placas: <b>{esc(placas)}</b>", c_txt))
    s.append(_corte())

    # --- 3. Documento: tipo, folio, fecha y quién atendió
    s.append(Paragraph("NOTA DE REMISIÓN" if remision else "RECIBO DE SERVICIO", c_doc))
    s.append(Paragraph(f"Folio: <b>{servicio.id_servicio:05d}</b>", c_txt))
    if servicio.es_garantia:
        extra = f" · {servicio.motivo_garantia}" if servicio.motivo_garantia else ""
        s.append(Paragraph(f"<b>GARANTÍA</b> de la orden #{servicio.id_servicio_original:05d}{esc(extra)}", c_txt))
    entrada = fecha_mx(servicio.fecha_entrada_servicio)
    salida = fecha_mx(servicio.fecha_salida_servicio) or hoy_mx()
    s.append(Paragraph(f"Entrada: {entrada:%d/%m/%Y %H:%M}" if entrada else "Entrada: —", c_txt))
    s.append(Paragraph(f"Salida: {salida:%d/%m/%Y %H:%M}", c_txt))
    emp = getattr(servicio, "empleado_responsable", None)
    if emp:
        nombre_emp = " ".join(filter(None, [emp.nombre, emp.paterno]))
        if nombre_emp:
            s.append(Paragraph(f"Le atendió: {esc(nombre_emp)}", c_txt))
    if not remision:
        s.append(Paragraph(f"Estado: {esc((servicio.status or '').capitalize())}", c_txt))
    s.append(Spacer(1, 3 * mm))

    # --- 4. Motivo (y en remisión diagnóstico y trabajos)
    s.append(Paragraph(f"<b>Motivo de ingreso:</b> {esc(servicio.nombre_servicio or '—')}", T_TEXTO))
    if remision:
        s.append(Spacer(1, 1 * mm))
        s.append(Paragraph(f"<b>Diagnóstico:</b> {esc(servicio.diagnostico or 'Sin diagnóstico registrado.')}", T_TEXTO))
        s.append(Spacer(1, 1 * mm))
        s.append(Paragraph(f"<b>Trabajos realizados:</b> {esc(servicio.operaciones or servicio.nombre_servicio or 'Sin detalle registrado.')}", T_TEXTO))
    s.append(Spacer(1, 4 * mm))

    # --- 5. Relación de conceptos: cantidad, descripción, precio unitario e importe
    w_cant, w_unit, w_imp = 8 * mm, 15 * mm, 17.5 * mm
    anchos = [w_cant, ANCHO - w_cant - w_unit - w_imp, w_unit, w_imp]
    filas = [[Paragraph("Cant.", h_cen), Paragraph("Descripción", h_izq), Paragraph("P. Unit.", h_der), Paragraph("Importe", h_der)]]
    tot_ref = tot_mo = tot_ex = 0.0
    for d in servicio.detalles:
        cant = d.cantidad or 1
        ref, mo, ex = d.costo_refaccion or 0, d.costo_mano_obra or 0, d.costo_extra or 0
        tot_ref, tot_mo, tot_ex = tot_ref + ref, tot_mo + mo, tot_ex + ex
        nombre_ref = nombre_refaccion(d)
        importe = _importe(d)
        filas.append([Paragraph(f"{cant:g}", c_cant), Paragraph(esc(d.descripcion or nombre_ref or "Concepto"), c_izq_n),
                      Paragraph(fmt(importe / cant), c_der), Paragraph(fmt(importe), c_der_n)])
        partes = sum(1 for v in (ref, mo, ex) if v)
        if partes > 1 or (ref and nombre_ref and d.descripcion and nombre_ref != d.descripcion):
            if ref:
                et = esc(nombre_ref) if nombre_ref and d.descripcion and nombre_ref != d.descripcion else "Refacción"
                filas.append(["", Paragraph(et, c_izq_s), "", Paragraph(fmt(ref), c_der_s)])
            if mo:
                filas.append(["", Paragraph("Mano de obra", c_izq_s), "", Paragraph(fmt(mo), c_der_s)])
            if ex:
                filas.append(["", Paragraph("Cargo extra", c_izq_s), "", Paragraph(fmt(ex), c_der_s)])
    if not servicio.detalles:
        filas.append(["", Paragraph("Sin conceptos registrados.", c_izq_s), "", ""])
    tabla = _tabla_conceptos(filas, anchos)
    # filete fino entre conceptos (no entre sus renglones de desglose)
    for i, fila in enumerate(filas[1:], start=1):
        if i > 1 and fila[0] != "":
            tabla.setStyle(TableStyle([("LINEABOVE", (0, i), (-1, i), 0.3, GRIS_LINEA)]))
    s.append(tabla)
    s.append(Spacer(1, 3 * mm))

    # --- 6. Totales
    if remision:
        filas_tot = [("Total del servicio", fmt(costos.total)), ("Pagado", fmt(costos.total_abonado))]
    else:
        filas_tot = []
        if sum(1 for v in (tot_ref, tot_mo, tot_ex) if v) > 1:
            filas_tot += [(n_, fmt(v_)) for n_, v_ in (("Refacciones", tot_ref), ("Mano de obra", tot_mo), ("Extras", tot_ex)) if v_]
        filas_tot += [("Subtotal", fmt(costos.subtotal)), (f"IVA ({servicio.iva_porcentaje:g}%)", fmt(costos.iva))]
    for etiqueta, monto in filas_tot:
        sec = etiqueta in ("Refacciones", "Mano de obra", "Extras")
        s.append(_fila(etiqueta, monto, T_SUB if sec else T_TEXTO, T_SUB_D if sec else T_DER))
    if not remision:
        s.append(Spacer(1, 0.8 * mm))
        s.append(_fila_total("TOTAL (con impuestos)", fmt(costos.total)))
    s.append(Spacer(1, 4 * mm))

    # --- 7. Desglose de impuestos (solo recibo)
    if not remision:
        s.append(_tabla_mini(
            [[Paragraph("Impuestos", m_cab), Paragraph("Base imp.", m_cab), Paragraph("Cuota", m_cab)],
             [Paragraph(f"IVA {servicio.iva_porcentaje:g}%", m_cel), Paragraph(fmt(costos.subtotal), m_cel), Paragraph(fmt(costos.iva), m_cel)]],
            [ANCHO / 3] * 3))
        s.append(Spacer(1, 3.5 * mm))

    # --- 8. Forma de pago
    if not remision and servicio.abonos:
        filas_pago = [[Paragraph("Fecha", m_cab), Paragraph("Forma de pago", m_cab), Paragraph("Monto", m_cab)]]
        for a in servicio.abonos:
            filas_pago.append([Paragraph(f"{a.fecha_pago:%d/%m/%Y}", m_cel), Paragraph(esc((a.tipo_pago or "").capitalize()), m_cel), Paragraph(fmt(a.monto_abono), m_cel)])
        s.append(_tabla_mini(filas_pago, [ANCHO * 0.30, ANCHO * 0.38, ANCHO * 0.32]))
        s.append(Spacer(1, 2.5 * mm))
    s.append(_tabla_mini(
        [[Paragraph("Total", m_cab), Paragraph("Pagado", m_cab), Paragraph("Saldo", m_cab)],
         [Paragraph(fmt(costos.total), m_cel), Paragraph(fmt(costos.total_abonado), m_cel), Paragraph(fmt(costos.saldo_pendiente), m_cel)]],
        [ANCHO / 3] * 3))
    s.append(Spacer(1, 3 * mm))
    s.append(_fila_inversa("LIQUIDADO" if liquidado else "SALDO RESTANTE", fmt(costos.saldo_pendiente)))

    if remision and servicio.km_proximo_servicio:
        s.append(Spacer(1, 2 * mm))
        s.append(Paragraph(f"<b>Próximo servicio a los {esc(servicio.km_proximo_servicio)} km.</b>", c_txt))

    if servicio.comentarios_finales:
        s.append(Spacer(1, 2 * mm))
        s.append(Paragraph(f"<b>Comentarios:</b> {esc(servicio.comentarios_finales)}", T_TEXTO))

    # --- 9. Conformidad (solo remisión) y pie
    if remision:
        s.append(_corte())
        s.append(Paragraph("Declaro que recibí el vehículo a mi entera satisfacción, revisado y en las condiciones convenidas.", T_PIE))
        s.append(Spacer(1, 11 * mm))
        s.append(HRFlowable(width="80%", thickness=0.7, color=NEGRO, spaceBefore=0, spaceAfter=1, hAlign="CENTER"))
        s.append(Paragraph("Nombre y firma del cliente", T_PIE))
    s.append(_corte())
    for texto in (TERMINOS_REMISION if remision else TERMINOS_RECIBO):
        s.append(Paragraph(esc(texto), T_PIE))
        s.append(Spacer(1, 1 * mm))
    s.append(Spacer(1, 1 * mm))
    s.append(Paragraph("¡Gracias por su preferencia!", T_GRACIAS))
    s.append(Spacer(1, 2 * mm))
    if qr_url:
        s.append(Paragraph("Escanea para descargar tu nota en PDF", _e("t_qr_t", fontName="Helvetica-Bold", fontSize=7.6, leading=9.4, alignment=TA_CENTER)))
        s.append(Spacer(1, 1.5 * mm))
        s.append(_qr(qr_url))
        s.append(Spacer(1, 1 * mm))
        s.append(Paragraph(f"Folio {servicio.id_servicio:05d} · disponible por 30 días", T_CENTRO))
    else:
        codigo = code128.Code128(f"{servicio.id_servicio:05d}", barHeight=9 * mm, barWidth=0.42 * mm, humanReadable=False, quiet=False)
        codigo.hAlign = "CENTER"
        s.append(codigo)
        s.append(Paragraph(f"{servicio.id_servicio:05d}", T_CENTRO))
    s.append(Spacer(1, 3 * mm))
    return s


def _alto_contenido(story) -> float:
    alto = 0.0
    for f in story:
        _, h = f.wrap(ANCHO, 100000)
        alto += h + f.getSpaceBefore() + f.getSpaceAfter()
    return alto


def generar_ticket(tipo, servicio, costos, taller=None, qr_url=None) -> bytes:
    """PDF de 80 mm de ancho y alto a la medida del contenido."""
    alto_pagina = max(_alto_contenido(_construir(tipo, servicio, costos, taller, qr_url)) + 2 * MARGEN + 4 * mm, 60 * mm)
    buffer = BytesIO()
    folio = f"#{servicio.id_servicio:05d}"
    doc = BaseDocTemplate(buffer, pagesize=(ANCHO_PAPEL, alto_pagina), title=f"Ticket {folio}", author=datos_taller(taller)["nombre"],
                          leftMargin=MARGEN, rightMargin=MARGEN, topMargin=MARGEN, bottomMargin=MARGEN)
    marco = Frame(MARGEN, MARGEN, ANCHO, alto_pagina - 2 * MARGEN, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="ticket")
    doc.addPageTemplates([PageTemplate(id="ticket", frames=[marco])])
    doc.build(_construir(tipo, servicio, costos, taller, qr_url))
    return buffer.getvalue()
