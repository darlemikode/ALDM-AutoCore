"""
Nota de remisión «elegante» (modo «Nota simple» del taller).

Todo centrado y con poca tinta: franja superior (nota · número · fecha de emisión),
logo ALDM AutoCore a la izquierda, nombre del taller al centro y sus datos a la
derecha; recuadro de cliente / vehículo / servicio; tabla de refacciones con filas
sombreadas; y al pie comentarios · subtotal e IVA · total con letra, firmas y aviso.
No muestra estatus de pago, saldo ni anticipos. Solo fuentes base (Helvetica).
"""
import os
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, Image, PageTemplate, Paragraph, Spacer, Table, TableStyle

from .pdf_diseno import ACCENT, datos_taller, esc, fecha_mx, fmt, hoy_mx

INK = colors.HexColor("#1c1c1e")
MUTED = colors.HexColor("#6e6e73")
TEXTO = colors.HexColor("#4a4a4e")
LINEA = colors.HexColor("#c9c9cd")
SUAVE = colors.HexColor("#e3e3e6")
SOMBRA = colors.HexColor("#f6f6f7")

MARGEN = 16 * mm
ANCHO = letter[0] - 2 * MARGEN
LOGO = os.path.join(os.path.dirname(__file__), "assets", "logo_aldm.png")
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def _est(nombre, **kw):
    base = dict(fontName="Helvetica", fontSize=8.6, leading=12, textColor=TEXTO)
    base.update(kw)
    return ParagraphStyle(nombre, **base)


P_TXT = _est("ne_txt", alignment=TA_CENTER)
P_NOM = _est("ne_nom", fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=INK, alignment=TA_CENTER)
P_DIR = _est("ne_dir", fontSize=7.6, leading=11.4, textColor=MUTED, alignment=TA_RIGHT)
P_COM = _est("ne_com", fontSize=8.4, leading=11.6, alignment=TA_LEFT)
P_CEL = _est("ne_cel", fontSize=8.8, leading=11, textColor=INK, alignment=TA_CENTER)
P_CEL_L = _est("ne_cel_l", fontSize=8.8, leading=11, textColor=INK, alignment=TA_LEFT)
P_LEGAL = _est("ne_leg", fontSize=6.6, leading=8.8, textColor=MUTED, alignment=TA_CENTER)


def _fecha_corta(dt):
    return f"{dt.day:02d}/{MESES[dt.month - 1]}/{dt.year}"


class _Esp(Flowable):
    """Texto con espaciado entre letras (mayúsculas elegantes), con ajuste de línea."""

    def __init__(self, texto, size=7, color=MUTED, bold=False, espacio=1.6, align="center", ancho=None, leading=None):
        super().__init__()
        self.texto, self.size, self.color, self.espacio = texto, size, color, espacio
        self.font = "Helvetica-Bold" if bold else "Helvetica"
        self.align, self.ancho = align, ancho
        self.leading = leading or size * 1.45
        self.lineas = [texto]

    def _w(self, s):
        return stringWidth(s, self.font, self.size) + self.espacio * len(s)

    def wrap(self, aw, ah):
        w = self.ancho or aw
        lineas, actual = [], ""
        for pal in self.texto.split():
            prueba = f"{actual} {pal}".strip()
            if actual and self._w(prueba) > w:
                lineas.append(actual)
                actual = pal
            else:
                actual = prueba
        lineas.append(actual)
        self.lineas, self.ancho_real = lineas, w
        return w, self.leading * len(lineas)

    def draw(self):
        c = self.canv
        n = len(self.lineas)
        for i, ln in enumerate(self.lineas):
            lw = self._w(ln) - self.espacio
            x = {"center": (self.ancho_real - lw) / 2, "right": self.ancho_real - lw}.get(self.align, 0)
            y = self.leading * (n - i - 1) + (self.leading - self.size) / 2 + self.size * 0.12
            t = c.beginText(x, y)
            t.setFont(self.font, self.size)
            t.setCharSpace(self.espacio)
            t.setFillColor(self.color)
            t.textOut(ln)
            c.drawText(t)


class _Regla(Flowable):
    """Línea fina a todo lo ancho; con una marca roja corta al centro si `marca`."""

    def __init__(self, color=INK, grosor=0.5, marca=False, alto=6):
        super().__init__()
        self.color, self.grosor, self.marca, self.alto = color, grosor, marca, alto

    def wrap(self, aw, ah):
        self.w = aw
        return aw, self.alto

    def draw(self):
        c = self.canv
        y = self.alto / 2
        c.setStrokeColor(self.color)
        c.setLineWidth(self.grosor)
        c.line(0, y, self.w, y)
        if self.marca:
            c.setStrokeColor(ACCENT)
            c.setLineWidth(1.2)
            c.line(self.w / 2 - 8 * mm, y + 0.9, self.w / 2 + 8 * mm, y + 0.9)


class _Seccion(Flowable):
    """Título centrado con líneas finas a los lados."""

    def __init__(self, texto):
        super().__init__()
        self.texto = texto

    def wrap(self, aw, ah):
        self.w = aw
        return aw, 9 * mm

    def draw(self):
        c = self.canv
        size, esp = 7.4, 3.6
        tw = stringWidth(self.texto, "Helvetica-Bold", size) + esp * (len(self.texto) - 1)
        x0 = (self.w - tw) / 2
        y = 4.5 * mm
        c.setStrokeColor(LINEA)
        c.setLineWidth(0.5)
        c.line(0, y + 1, x0 - 4 * mm, y + 1)
        c.line(x0 + tw + 4 * mm, y + 1, self.w, y + 1)
        t = c.beginText(x0, y - 0.5)
        t.setFont("Helvetica-Bold", size)
        t.setCharSpace(esp)
        t.setFillColor(INK)
        t.textOut(self.texto)
        c.drawText(t)


class _AlPie(Flowable):
    """Ocupa el resto de la hoja y dibuja su contenido pegado al borde inferior."""

    def __init__(self, hijo):
        super().__init__()
        self.hijo = hijo

    def wrap(self, aw, ah):
        _, h = self.hijo.wrap(aw, ah)
        self.h_hijo, self.w = h, aw
        self.total = max(h, ah - 1)
        return aw, self.total

    def draw(self):
        self.hijo.wrapOn(self.canv, self.w, self.total)
        self.hijo.drawOn(self.canv, 0, 0)


def _logo(ancho):
    if not os.path.exists(LOGO):
        return Spacer(1, 1)
    from reportlab.lib.utils import ImageReader
    w, h = ImageReader(LOGO).getSize()
    img = Image(LOGO, width=ancho, height=ancho * h / w)
    img.hAlign = "LEFT"
    return img


def _caja(celdas, anchos, estilo_extra=None, pad=(8, 10)):
    t = Table([celdas], colWidths=anchos)
    est = [
        ("BOX", (0, 0), (-1, -1), 0.5, LINEA), ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, LINEA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), pad[0]), ("BOTTOMPADDING", (0, 0), (-1, -1), pad[0]),
        ("LEFTPADDING", (0, 0), (-1, -1), pad[1]), ("RIGHTPADDING", (0, 0), (-1, -1), pad[1]),
    ]
    t.setStyle(TableStyle(est + (estilo_extra or [])))
    return t


def _bloque_info(servicio):
    cli, veh = servicio.cliente, servicio.vehiculo
    nombre = " ".join(filter(None, [getattr(cli, "nombre_cliente", None), getattr(cli, "paterno_cliente", None), getattr(cli, "materno_cliente", None)])) or "Sin cliente asignado"
    lin_cli = [x for x in [getattr(cli, "telefono1", None), getattr(cli, "correo_cliente", None), getattr(cli, "empresa_cliente", None)] if x]
    marca = getattr(getattr(veh, "marca", None), "nombre_marca", None)
    modelo = getattr(getattr(veh, "modelo", None), "nombre_modelo", None)
    desc = " ".join(str(x) for x in [marca, modelo, getattr(veh, "id_year_vehiculo", None)] if x) or "Sin vehículo asignado"
    color = getattr(getattr(veh, "color", None), "nombre_color", None)
    serie = getattr(veh, "numserie_vehiculo", None)
    lin_veh = [" · ".join(x for x in [color, f"Serie {serie}" if serie else None] if x)]
    placas = getattr(veh, "placas_vehiculo", None)
    km = servicio.km_llegada
    entrada = fecha_mx(servicio.fecha_entrada_servicio)
    salida = fecha_mx(servicio.fecha_salida_servicio) or hoy_mx()
    lin_ser = [f"Entrada {_fecha_corta(entrada)}" if entrada else None, f"Salida {_fecha_corta(salida)}",
               f"Próximo: {servicio.km_proximo_servicio} km" if servicio.km_proximo_servicio else None]

    def celda(etiqueta, principal, lineas, placa=None):
        cont = [_Esp(etiqueta, 6.4, MUTED, True, 2.6), Spacer(1, 2.6 * mm), Paragraph(esc(principal), P_NOM), Spacer(1, 1 * mm)]
        for ln in lineas:
            if ln:
                cont.append(Paragraph(esc(ln), P_TXT))
        if placa:
            pl = Table([[Paragraph(f"<b>{esc(placa)}</b>", _est("ne_pl", fontName="Helvetica-Bold", fontSize=9, leading=11, textColor=INK, alignment=TA_CENTER))]], colWidths=[30 * mm])
            pl.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.7, INK), ("ROUNDEDCORNERS", [2, 2, 2, 2]), ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
            cont += [Spacer(1, 1.6 * mm), pl]
        return cont

    w = ANCHO / 3
    return _caja(
        [celda("CLIENTE", nombre, lin_cli), celda("VEHÍCULO", desc, lin_veh, placas), celda("SERVICIO", f"{int(km):,} km" if km else "—", lin_ser)],
        [w, w, w], pad=(10, 6),
    )


def _tabla_items(servicio, nombre_det):
    from .pdf_nota import tipo_de_detalle
    etiquetas = {"refaccion": "Refacción", "servicio": "Servicio", "extra": "Extra"}
    cab = [_Esp(t, 6.4, MUTED, True, 2.0, a) for t, a in (("CANT.", "center"), ("REFACCIÓN", "left"), ("TIPO", "center"), ("P. UNITARIO", "center"), ("IMPORTE", "center"))]
    filas = [cab]
    for d in servicio.detalles:
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        cant = d.cantidad or 1
        filas.append([
            Paragraph(str(cant), P_CEL), Paragraph(esc(nombre_det(d)), P_CEL_L), Paragraph(etiquetas[tipo_de_detalle(d)], P_CEL),
            Paragraph(fmt(importe / cant), P_CEL), Paragraph(f"<b>{fmt(importe)}</b>", P_CEL),
        ])
    if not servicio.detalles:
        filas.append(["", Paragraph("Sin refacciones registradas", P_CEL_L), "", "", ""])
    anchos = [16 * mm, ANCHO - 16 * mm - 26 * mm - 30 * mm - 30 * mm, 26 * mm, 30 * mm, 30 * mm]
    t = Table(filas, colWidths=anchos, repeatRows=1)
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [SOMBRA, colors.white]),
        ("LINEBELOW", (0, -1), (-1, -1), 0.4, SUAVE),
        ("TOPPADDING", (0, 0), (-1, 0), 2), ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 6), ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _bloque_pie(servicio, costos):
    from .factura_pdf import importe_con_letra
    comentarios = (servicio.comentarios_finales or "").strip() or "Sin comentarios."
    w1 = w2 = ANCHO * 0.29
    w3 = ANCHO - w1 - w2
    com = [_Esp("COMENTARIOS", 6.2, MUTED, True, 2.6), Spacer(1, 2.4 * mm), Paragraph(esc(comentarios), P_COM)]
    filas = [[Paragraph("Subtotal", _est("ne_d1", fontSize=8.4, textColor=MUTED)), Paragraph(f"<b>{fmt(costos.subtotal)}</b>", _est("ne_d2", fontSize=8.6, textColor=INK, alignment=TA_RIGHT))],
             [Paragraph("IVA", _est("ne_d3", fontSize=8.4, textColor=MUTED)), Paragraph(f"<b>{fmt(costos.iva)}</b>", _est("ne_d4", fontSize=8.6, textColor=INK, alignment=TA_RIGHT))]]
    det_t = Table(filas, colWidths=[(w2 - 20) * 0.45, (w2 - 20) * 0.55])
    det_t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.4, LINEA), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    det = [_Esp("DETALLE", 6.2, MUTED, True, 2.6), Spacer(1, 2.4 * mm), det_t]
    tot = [_Esp("TOTAL", 6.2, MUTED, True, 3.6), Spacer(1, 1.2 * mm),
           Paragraph(f"<b>{fmt(costos.total)}</b>", _est("ne_tot", fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=INK, alignment=TA_CENTER)),
           Spacer(1, 1 * mm), Paragraph(esc(importe_con_letra(costos.total)), _est("ne_let", fontSize=6.4, leading=8.4, textColor=TEXTO, alignment=TA_CENTER)),
           Spacer(1, 2 * mm), _Regla(ACCENT, 0.9, False, 3)]
    caja = _caja([com, det, tot], [w1, w2, w3], pad=(9, 10))
    firmas = Table([[_Regla(INK, 0.5, False, 4), "", _Regla(INK, 0.5, False, 4)],
                    [_Esp("NOMBRE Y FIRMA DEL CLIENTE", 6.2, MUTED, False, 1.6), "", _Esp("FIRMA / SELLO DEL TALLER", 6.2, MUTED, False, 1.6)]],
                   colWidths=[ANCHO * 0.4, ANCHO * 0.2, ANCHO * 0.4])
    firmas.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    legal = Paragraph("<b>NOTA:</b> Para hacer válida la garantía es necesaria tu nota de servicio. Revisa tu vehículo al menos una vez por semana "
                      "(niveles y presión de llantas) para prevenir accidentes. Gracias por confiar en nosotros.", P_LEGAL)
    cont = Table([[caja], [Spacer(1, 11 * mm)], [firmas], [Spacer(1, 4 * mm)], [legal]], colWidths=[ANCHO])
    cont.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return cont


def generar_nota_elegante(servicio, costos, taller=None) -> bytes:
    from .pdf_nota import _nombre_detalle
    from .recibo_pdf import nombre_refaccion

    d = datos_taller(taller)
    emision = hoy_mx()
    buffer = BytesIO()
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=MARGEN, rightMargin=MARGEN, topMargin=12 * mm, bottomMargin=12 * mm,
                          title=f"Nota de remisión #{servicio.id_servicio:05d}")
    doc.addPageTemplates([PageTemplate(id="n", frames=[Frame(MARGEN, 12 * mm, ANCHO, letter[1] - 24 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)])])
    story = []

    # Franja superior: nota · número · fecha de emisión
    fr = Table([[_Esp("NOTA DE REMISIÓN", 7.2, INK, True, 2.8, "left"),
                 _Esp(f"N.º #{servicio.id_servicio:05d}", 9.2, ACCENT, True, 2.8, "center"),
                 _Esp(f"FECHA DE EMISIÓN · {emision.day:02d} {MESES[emision.month - 1].upper()} {emision.year}", 7.2, MUTED, False, 2.4, "right")]],
               colWidths=[ANCHO * 0.34, ANCHO * 0.32, ANCHO * 0.34])
    fr.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [fr, _Regla(SUAVE, 0.5, False, 4), Spacer(1, 4 * mm)]

    # Encabezado: logo · nombre del taller · datos
    contacto = [x for x in (d["linea2"] or "").split(" · ") if x]
    datos = "<br/>".join(esc(x) for x in ([d["linea1"]] if d["linea1"] else []) + contacto)
    enc = Table([[_logo(40 * mm), _Esp(d["nombre"].upper(), 12.5, INK, True, 2.4, "center", ancho=ANCHO * 0.36), Paragraph(datos, P_DIR)]],
                colWidths=[ANCHO * 0.30, ANCHO * 0.40, ANCHO * 0.30])
    enc.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [enc, Spacer(1, 3 * mm), _Regla(INK, 0.5, True, 6), Spacer(1, 6 * mm)]

    story.append(_bloque_info(servicio))
    story += [Spacer(1, 7 * mm), _Seccion("REFACCIONES"), _tabla_items(servicio, lambda x: _nombre_detalle(x, nombre_refaccion)), Spacer(1, 6 * mm)]
    story.append(_AlPie(_bloque_pie(servicio, costos)))
    doc.build(story)
    return buffer.getvalue()
