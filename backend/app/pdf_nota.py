"""
Diseño "lateral" de las notas que se entregan al cliente: recibo de la orden,
nota de remisión y cotización/presupuesto.

Barra oscura a la izquierda (logo y datos del taller, cliente, vehículo y
términos) y a la derecha el documento: título y folio, motivo, tabla de
conceptos con su tipo (servicio / refacción), totales y resumen por tipo.
Usa la misma paleta y utilidades de pdf_diseno.py (rojo ALDM sobre tinta).
Solo fuentes base de PDF (Helvetica): no depende de archivos de fuentes.
"""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, KeepTogether, NextPageTemplate, PageTemplate, Paragraph, Spacer, Table, TableStyle

from .pdf_diseno import (
    ACCENT, ACCENT_SOFT, E, INK, INK_2, LINE, MUTED, OK, OK_SOFT, ROJO, SOFT, WARN, WARN_SOFT,
    datos_taller, esc, fecha_mx, firmas, fmt, hoy_mx,
)

# --- Medidas ------------------------------------------------------------------
ANCHO_LATERAL = 64 * mm          # barra oscura
PAD_LATERAL = 6.5 * mm
X_CONTENIDO = ANCHO_LATERAL + 9 * mm
MARGEN_DER = 13 * mm
ANCHO_PAGINA, ALTO_PAGINA = letter
ANCHO = ANCHO_PAGINA - X_CONTENIDO - MARGEN_DER   # ancho útil del contenido (≈ 130 mm)
ALTO_CABECERA = 38 * mm
MARGEN_INF = 18 * mm
# Hoja de inspección: a todo lo ancho, sin la barra lateral
MARGEN_COMPLETA = 14 * mm
ANCHO_COMPLETA = ANCHO_PAGINA - 2 * MARGEN_COMPLETA
ALTO_COMPLETA = ALTO_PAGINA - 20 * mm - MARGEN_INF

# --- Paleta propia de la barra -----------------------------------------------------
LATERAL = colors.HexColor("#f6f6f7")          # fondo claro: ahorra tinta
LATERAL_TEXTO = colors.HexColor("#3b3f46")
LATERAL_SUAVE = colors.HexColor("#6b7078")
LATERAL_ETIQUETA = ACCENT
LATERAL_LINEA = colors.HexColor("#d6d8dd")


def _estilo(nombre, **kw):
    base = dict(fontName="Helvetica", fontSize=8, leading=10.5, textColor=LATERAL_TEXTO)
    base.update(kw)
    return ParagraphStyle(nombre, **base)


L_ETIQUETA = _estilo("l_et", fontName="Helvetica-Bold", fontSize=6.8, leading=9, textColor=LATERAL_ETIQUETA)
L_NOMBRE = _estilo("l_nom", fontName="Helvetica-Bold", fontSize=11.5, leading=13.5, textColor=INK)
L_TEXTO = _estilo("l_txt", fontSize=8, leading=10.8)
L_TALLER = _estilo("l_taller", fontName="Helvetica-Bold", fontSize=13, leading=15, textColor=INK, alignment=TA_CENTER)
L_DIRECCION = _estilo("l_dir", fontSize=7, leading=9.6, textColor=LATERAL_SUAVE, alignment=TA_CENTER)


class _Dato:
    """Datos ya resueltos de cliente / vehículo para la barra lateral."""

    def __init__(self, titulo, lineas):
        self.titulo, self.lineas = titulo, lineas


def datos_cliente(cliente, vacio="Sin cliente asignado"):
    if not cliente:
        return _Dato("Cliente", [("nombre", vacio)])
    nombre = " ".join(filter(None, [cliente.nombre_cliente, cliente.paterno_cliente, cliente.materno_cliente])) or vacio
    lineas = [("nombre", nombre)]
    if getattr(cliente, "telefono1", None):
        lineas.append(("texto", cliente.telefono1))
    if getattr(cliente, "correo_cliente", None):
        lineas.append(("texto", cliente.correo_cliente))
    empresa = getattr(cliente, "empresa_cliente", None)
    if empresa:
        lineas.append(("texto", empresa))
    return _Dato("Cliente", lineas)


def datos_vehiculo(vehiculo, km=None, extra_km=None):
    """Devuelve (_Dato, placas). Sin vehículo: solo una línea explicativa."""
    if not vehiculo:
        return _Dato("Vehículo", [("nombre", "Sin vehículo asignado")]), None
    partes = [
        getattr(vehiculo.marca, "nombre_marca", None) if vehiculo.marca else None,
        getattr(vehiculo.modelo, "nombre_modelo", None) if vehiculo.modelo else None,
        vehiculo.id_year_vehiculo,
    ]
    descripcion = " ".join(str(p) for p in partes if p) or "—"
    lineas = [("nombre", descripcion)]
    detalle = []
    if vehiculo.color and getattr(vehiculo.color, "nombre_color", None):
        detalle.append(f"Color {vehiculo.color.nombre_color.lower()}")
    if km:
        detalle.append(f"{km} km")
    if detalle:
        lineas.append(("texto", " · ".join(detalle)))
    if extra_km:
        lineas.append(("texto", extra_km))
    if getattr(vehiculo, "numserie_vehiculo", None):
        lineas.append(("texto", f"VIN {vehiculo.numserie_vehiculo}"))
    return _Dato("Vehículo", lineas), (vehiculo.placas_vehiculo or None)


class PlantillaLateral:
    """Dibuja la barra lateral, la cabecera (título, folio) y el pie en cada página."""

    def __init__(self, taller, titulo, subtitulo, folio, lineas_fecha, cliente: _Dato, vehiculo: _Dato, placas, terminos, nombre_doc):
        self.t = datos_taller(taller)
        self.titulo, self.subtitulo, self.folio = titulo, subtitulo, folio
        self.lineas_fecha = list(lineas_fecha)
        self.cliente, self.vehiculo, self.placas = cliente, vehiculo, placas
        self.terminos = terminos
        self.nombre_doc = nombre_doc

    def documento(self, buffer) -> BaseDocTemplate:
        """Dos tipos de página: 'lateral' (con la barra oscura) y 'completa' (hoja de inspección,
        a todo lo ancho para que la lista de puntos se lea grande)."""
        doc = BaseDocTemplate(buffer, pagesize=letter, title=f"{self.titulo} {self.folio}", author=self.t["nombre"])
        marco_lateral = Frame(X_CONTENIDO, MARGEN_INF, ANCHO, ALTO_PAGINA - ALTO_CABECERA - 3.5 * mm - MARGEN_INF,
                              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="lateral")
        marco_completo = Frame(MARGEN_COMPLETA, MARGEN_INF, ANCHO_COMPLETA, ALTO_COMPLETA,
                               leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="completa")
        doc.addPageTemplates([
            PageTemplate(id="lateral", frames=[marco_lateral], onPage=self),
            PageTemplate(id="completa", frames=[marco_completo], onPage=self.pagina_completa),
        ])
        return doc

    def hoja_inspeccion(self, inspeccion):
        """Página extra con la inspección digital, a todo lo ancho (vacío si no hay inspección)."""
        from .inspeccion_auto_pdf import hoja_inspeccion_auto
        bloques = hoja_inspeccion_auto(inspeccion, ANCHO_COMPLETA, ALTO_COMPLETA - 2)
        return [NextPageTemplate("completa"), *bloques] if bloques else []

    def pagina_completa(self, c, doc):
        c.saveState()
        c.setFillColor(ACCENT)
        c.rect(0, ALTO_PAGINA - 2 * mm, ANCHO_PAGINA, 2 * mm, stroke=0, fill=1)
        izq, der = MARGEN_COMPLETA, ANCHO_PAGINA - MARGEN_COMPLETA
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(izq, ALTO_PAGINA - 12 * mm, self.t["nombre"][:48])
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(der, ALTO_PAGINA - 12 * mm, f"{self.nombre_doc} {self.folio}")
        c.setStrokeColor(INK)
        c.setLineWidth(1.2)
        c.line(izq, ALTO_PAGINA - 16 * mm, der, ALTO_PAGINA - 16 * mm)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(izq, 13 * mm, der, 13 * mm)
        c.setFont("Helvetica", 6.8)
        c.setFillColor(MUTED)
        c.drawString(izq, 8.6 * mm, f"{self.nombre_doc} {self.folio} · Página {doc.page}")
        c.drawRightString(der, 8.6 * mm, "Generado con ALDM AutoCore")
        c.restoreState()

    # -- barra lateral ---------------------------------------------------------------
    def _lateral(self, c):
        c.setFillColor(LATERAL)
        c.rect(0, 0, ANCHO_LATERAL, ALTO_PAGINA, stroke=0, fill=1)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.line(ANCHO_LATERAL, 0, ANCHO_LATERAL, ALTO_PAGINA)
        ancho = ANCHO_LATERAL - 2 * PAD_LATERAL
        x = PAD_LATERAL
        y = ALTO_PAGINA - 11 * mm

        def poner(par, antes=0, despues=0):
            nonlocal y
            _, h = par.wrap(ancho, 1000)
            y -= antes + h
            par.drawOn(c, x, y)
            y -= despues

        def linea(espacio=3.2 * mm):
            nonlocal y
            y -= espacio
            c.setStrokeColor(LATERAL_LINEA)
            c.setLineWidth(0.7)
            c.line(x, y, x + ancho, y)
            y -= espacio

        # Logo centrado, con esquinas redondeadas
        if self.t["logo"]:
            lado = 30 * mm
            lx = (ANCHO_LATERAL - lado) / 2
            ly = y - lado
            try:
                c.saveState()
                ruta = c.beginPath()
                ruta.roundRect(lx, ly, lado, lado, 4.5 * mm)
                c.clipPath(ruta, stroke=0, fill=0)
                c.setFillColor(colors.white)
                c.rect(lx, ly, lado, lado, stroke=0, fill=1)
                c.drawImage(self.t["logo"], lx, ly, width=lado, height=lado, preserveAspectRatio=True, anchor="c", mask="auto")
                c.restoreState()
                c.setStrokeColor(LINE)
                c.setLineWidth(0.6)
                c.roundRect(lx, ly, lado, lado, 4.5 * mm, stroke=1, fill=0)
                y = ly - 5 * mm
            except Exception:  # noqa: BLE001 — un logo dañado no debe impedir generar el documento
                c.restoreState()
                y = ly - 5 * mm

        poner(Paragraph(esc(self.t["nombre"]).upper(), L_TALLER), despues=2 * mm)
        for ln in self.t["lineas"]:
            texto = " ".join(p for p in (ln.get("izq", ""), ln.get("der", "")) if p)
            if texto:
                poner(Paragraph(esc(texto), L_DIRECCION))
        linea()

        for bloque in (self.cliente, self.vehiculo):
            poner(Paragraph(bloque.titulo.upper(), L_ETIQUETA), despues=1.4 * mm)
            for tipo, texto in bloque.lineas:
                poner(Paragraph(esc(texto), L_NOMBRE if tipo == "nombre" else L_TEXTO))
            if bloque is self.vehiculo and self.placas:
                y -= 2.2 * mm
                # Placa tipo "etiqueta": caja clara con filete de marca
                pw, ph = 36 * mm, 8 * mm
                px, py = x, y - ph
                c.setFillColor(colors.white)
                c.setStrokeColor(INK)
                c.setLineWidth(0.8)
                c.roundRect(px, py, pw, ph, 1.6 * mm, stroke=1, fill=1)
                c.setFillColor(ACCENT)
                c.rect(px + 1.2 * mm, py + ph - 1.5 * mm, pw - 2.4 * mm, 0.9 * mm, stroke=0, fill=1)
                c.setFillColor(INK)
                c.setFont("Helvetica-Bold", 10.5)
                c.drawCentredString(px + pw / 2, py + 2.2 * mm, str(self.placas).upper()[:12])
                y = py - 1 * mm
            y -= 3.5 * mm
            linea(espacio=1.6 * mm)

        # Términos: ocupan lo que queda de la barra; la letra se reduce hasta que quepan
        poner(Paragraph("TÉRMINOS Y CONDICIONES", L_ETIQUETA), antes=1 * mm, despues=1.6 * mm)
        disponible = y - 10 * mm
        tam = 7.4
        while True:
            st = _estilo("l_term", fontSize=tam, leading=tam * 1.28, textColor=LATERAL_SUAVE)
            pars = [Paragraph(f"{i}. {esc(t)}", st) for i, t in enumerate(self.terminos, 1)]
            alto = sum(p.wrap(ancho, 1000)[1] for p in pars) + 1.4 * mm * (len(pars) - 1)
            if alto <= disponible or tam <= 4.8:
                break
            tam -= 0.2
        for p in pars:
            poner(p, despues=1.4 * mm)

    # -- cabecera y pie ------------------------------------------------------------------
    def __call__(self, c, doc):
        c.saveState()
        self._lateral(c)

        # Franja de marca arriba, a la derecha de la barra
        c.setFillColor(ACCENT)
        c.rect(ANCHO_LATERAL, ALTO_PAGINA - 2 * mm, ANCHO_PAGINA - ANCHO_LATERAL, 2 * mm, stroke=0, fill=1)

        top = ALTO_PAGINA - 3.5 * mm - 10 * mm
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 25)
        c.drawString(X_CONTENIDO, top - 6 * mm, self.titulo.upper())
        if self.subtitulo:
            c.saveState()  # el espaciado entre letras no debe pasar a los demás textos
            t = c.beginText(X_CONTENIDO, top - 12.5 * mm)
            t.setFont("Helvetica-Bold", 8)
            t.setCharSpace(2.4)
            t.setFillColor(ACCENT)
            t.textOut(self.subtitulo.upper())
            c.drawText(t)
            c.restoreState()

        derecha = ANCHO_PAGINA - MARGEN_DER
        c.setStrokeColor(INK)
        c.setLineWidth(0.7)
        c.roundRect(derecha - 33 * mm, top - 10.6 * mm, 33 * mm, 13.6 * mm, 2.2 * mm, stroke=1, fill=0)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 6.4)
        c.drawRightString(derecha - 3.4 * mm, top - 0.2 * mm, "FOLIO")
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 14)
        c.drawRightString(derecha - 3.4 * mm, top - 7 * mm, self.folio)
        c.setFont("Helvetica", 7.8)
        c.setFillColor(INK_2)
        for i, ln in enumerate(self.lineas_fecha[:3]):
            c.drawRightString(derecha, top - (14.6 + i * 3.6) * mm, ln)

        c.setStrokeColor(INK)
        c.setLineWidth(1.5)
        y_linea = ALTO_PAGINA - ALTO_CABECERA
        c.line(X_CONTENIDO, y_linea, derecha, y_linea)
        c.setLineWidth(0.45)
        c.line(X_CONTENIDO, y_linea - 1.1 * mm, derecha, y_linea - 1.1 * mm)

        # Pie
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(X_CONTENIDO, 13 * mm, derecha, 13 * mm)
        c.setFont("Helvetica", 6.8)
        c.setFillColor(MUTED)
        c.drawString(X_CONTENIDO, 8.6 * mm, f"{self.nombre_doc} {self.folio} · Página {doc.page}")
        c.drawRightString(derecha, 8.6 * mm, "Generado con ALDM AutoCore")
        c.restoreState()


# --- Bloques del contenido --------------------------------------------------------------
_ET = ParagraphStyle("n_et", parent=E["etiqueta"], fontSize=6.8, leading=9)
_TXT = ParagraphStyle("n_txt", parent=E["parrafo"], fontSize=8.8, leading=12.2, textColor=INK_2)
_CAB = ParagraphStyle("n_cab", parent=E["etiqueta"], fontSize=6.8, leading=9, textColor=INK_2)
_CAB_D = ParagraphStyle("n_cab_d", parent=_CAB, alignment=TA_RIGHT)
_CAB_C = ParagraphStyle("n_cab_c", parent=_CAB, alignment=TA_CENTER)
_CEL = ParagraphStyle("n_cel", parent=E["celda"], fontSize=8.6, leading=11)
_CEL_D = ParagraphStyle("n_cel_d", parent=_CEL, alignment=TA_RIGHT)
_CEL_C = ParagraphStyle("n_cel_c", parent=_CEL, alignment=TA_CENTER)
_SUB = ParagraphStyle("n_sub", parent=E["celda_sub"], fontSize=7, leading=9)

TIPOS = {
    "servicio": ("SERVICIO", ACCENT, ACCENT_SOFT),
    "refaccion": ("REFACCIÓN", WARN, WARN_SOFT),
    "extra": ("EXTRA", OK, OK_SOFT),
}


def _hex(c) -> str:
    return "#" + c.hexval()[2:]


class _Pastilla(Flowable):
    """Etiqueta redondeada del ancho justo de su texto (para la columna Tipo)."""

    def __init__(self, texto, color, fondo):
        super().__init__()
        self.texto, self.color, self.fondo = texto, color, fondo
        self.hAlign = "CENTER"

    def wrap(self, aw, ah):
        self.w = min(aw, stringWidth(self.texto, "Helvetica-Bold", 6.6) + 12)
        self.h = 11.5
        return self.w, self.h

    def draw(self):
        c = self.canv
        c.setStrokeColor(INK_2)
        c.setLineWidth(0.55)
        c.roundRect(0.3, 0.3, self.w - 0.6, self.h - 0.6, self.h / 2, stroke=1, fill=0)
        c.setFillColor(INK_2)
        c.setFont("Helvetica-Bold", 6.4)
        c.drawCentredString(self.w / 2, 3.6, self.texto)


def etiqueta_tipo(clave):
    texto, color, fondo = TIPOS[clave]
    return _Pastilla(texto, color, fondo)


def tipo_de_detalle(d) -> str:
    """Servicio (mano de obra), refacción o extra, según donde esté el costo principal."""
    mo, ref, ex = (d.costo_mano_obra or 0), (d.costo_refaccion or 0), (d.costo_extra or 0)
    if ref >= mo and ref >= ex and ref > 0:
        return "refaccion"
    if mo >= ex and mo > 0:
        return "servicio"
    if ex > 0:
        return "extra"
    return "refaccion" if ref else "servicio"


class _Rotulo(Flowable):
    """Rótulo de sección: rombo de marca + título en mayúsculas espaciadas."""

    def __init__(self, texto, color=None):
        super().__init__()
        self.texto, self.color = texto.upper(), color or ACCENT

    def wrap(self, aw, ah):
        return aw, 10

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.saveState()
        c.translate(3, 4.4)
        c.rotate(45)
        c.rect(-2.1, -2.1, 4.2, 4.2, stroke=0, fill=1)
        c.restoreState()
        t = c.beginText(10.5, 2.4)
        t.setFont("Helvetica-Bold", 6.8)
        t.setCharSpace(1.3)
        t.setFillColor(self.color)
        t.textOut(self.texto)
        c.drawText(t)


def panel_detalle(secciones, ancho: float = ANCHO):
    """Un solo panel con las secciones del detalle de la orden (motivo, diagnóstico, trabajos…),
    separadas por filetes. secciones = [(título, texto)] o [(título, texto, secundario)]."""
    filas, estilo = [], []
    for k, sec in enumerate(secciones):
        titulo, texto = sec[0], sec[1]
        secundario = sec[2] if len(sec) > 2 else None
        inicio = len(filas)
        filas.append([_Rotulo(titulo)])
        for ln in (texto or "").splitlines() or ["—"]:
            filas.append([Paragraph(esc(ln) or "&nbsp;", _TXT)])
        if secundario:
            filas.append([Paragraph(esc(secundario), ParagraphStyle("n_mot2", parent=_TXT, textColor=MUTED, fontSize=8))])
        fin = len(filas) - 1
        estilo += [
            ("TOPPADDING", (0, inicio), (-1, inicio), 9), ("BOTTOMPADDING", (0, inicio), (-1, inicio), 2),
            ("TOPPADDING", (0, inicio + 1), (-1, fin), 1.2), ("BOTTOMPADDING", (0, inicio + 1), (-1, fin), 1.2),
            ("BOTTOMPADDING", (0, fin), (-1, fin), 9),
        ]
        if k < len(secciones) - 1:
            estilo.append(("LINEBELOW", (0, fin), (-1, fin), 0.5, LINE))
    t = Table(filas, colWidths=[ancho])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#b9b9be")), ("ROUNDEDCORNERS", [7, 7, 7, 7]),
        ("LEFTPADDING", (0, 0), (-1, -1), 13), ("RIGHTPADDING", (0, 0), (-1, -1), 13),
        *estilo,
    ]))
    return t


def motivo(titulo: str, texto: str, ancho: float = ANCHO, secundario: str | None = None):
    """Recuadro de una sola sección (garantía, comentarios, concepto…)."""
    return panel_detalle([(titulo, texto, secundario) if secundario else (titulo, texto)], ancho)


def tabla_lineas(detalles, nombre_principal, nombre_sub=None):
    """Conceptos con su tipo. `nombre_principal(d)` da el texto principal; `nombre_sub(d)` el renglón gris."""
    cab = [Paragraph("CONCEPTO", _CAB), Paragraph("TIPO", _CAB_C), Paragraph("CANT.", _CAB_C), Paragraph("P. UNIT.", _CAB_D), Paragraph("IMPORTE", _CAB_D)]
    filas = [cab]
    for d in detalles:
        importe = (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        cant = d.cantidad or 1
        sub = nombre_sub(d) if nombre_sub else None
        concepto = Paragraph(esc(nombre_principal(d)) + (f"<br/><font size='7' color='#6d6d72'>{esc(sub)}</font>" if sub else ""), _CEL)
        filas.append([concepto, etiqueta_tipo(tipo_de_detalle(d)), Paragraph(str(cant), _CEL_C), Paragraph(fmt(importe / cant), _CEL_D), Paragraph(f"<b>{fmt(importe)}</b>", _CEL_D)])
    vacio = not detalles
    if vacio:
        filas.append([Paragraph("Sin conceptos registrados", _SUB), "", "", "", ""])
    anchos = [ANCHO * w for w in (0.36, 0.20, 0.09, 0.17, 0.18)]
    t = Table(filas, colWidths=anchos, repeatRows=1)
    estilo = [
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, INK), ("LINEBELOW", (0, 0), (-1, 0), 0.6, INK),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE), ("LINEBELOW", (0, -1), (-1, -1), 0.6, INK),
        ("TOPPADDING", (0, 0), (-1, 0), 3), ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 6.5), ("BOTTOMPADDING", (0, 1), (-1, -1), 6.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if vacio:
        estilo.append(("SPAN", (0, 1), (-1, 1)))
    t.setStyle(TableStyle(estilo))
    return t


def resumen_por_tipo(detalles, aviso: str | None = None):
    servicios = sum((d.costo_mano_obra or 0) for d in detalles)
    refacciones = sum((d.costo_refaccion or 0) for d in detalles)
    extras = sum((d.costo_extra or 0) for d in detalles)
    partes = [f"Servicios {fmt(servicios)}", f"Refacciones {fmt(refacciones)}"]
    if extras:
        partes.append(f"Extras {fmt(extras)}")
    bloque = [
        Paragraph("RESUMEN POR TIPO", ParagraphStyle("n_rt", parent=_ET, textColor=INK, fontSize=7.4)),
        Spacer(1, 1.6 * mm),
        Paragraph(" · ".join(partes), ParagraphStyle("n_rt2", parent=_TXT, fontSize=8, leading=11, textColor=MUTED)),
    ]
    if aviso:
        bloque += [Spacer(1, 2.4 * mm), Paragraph(esc(aviso), ParagraphStyle("n_av", parent=_TXT, fontSize=7.4, leading=10, textColor=ROJO, fontName="Helvetica-Oblique"))]
    return bloque


def totales_lateral(filas, ancho, final_idx, final_color=SOFT, saldo_idx=None, saldo_color=ACCENT, saldo_fondo=ACCENT_SOFT):
    """Caja de totales: `filas` = [(etiqueta, monto)]; `final_idx` va en banda oscura; `saldo_idx` en banda de color suave."""
    datos = []
    for i, (e, v) in enumerate(filas):
        if i == final_idx:
            datos.append([Paragraph(f"<font color='#17181b'><b>{esc(e)}</b></font>", ParagraphStyle("n_t1", parent=_CEL, fontSize=10, leading=13)),
                          Paragraph(f"<font color='#17181b' size='11.5'><b>{esc(v)}</b></font>", ParagraphStyle("n_t2", parent=_CEL_D, leading=14))])
        elif i == saldo_idx:
            datos.append([Paragraph(f"<font color='{_hex(saldo_color)}'><b>{esc(e)}</b></font>", ParagraphStyle("n_t3", parent=_CEL, fontSize=8.4)),
                          Paragraph(f"<font color='{_hex(saldo_color)}'><b>{esc(v)}</b></font>", ParagraphStyle("n_t4", parent=_CEL_D, fontSize=8.8))])
        else:
            datos.append([Paragraph(esc(e), _CEL), Paragraph(f"<b>{esc(v)}</b>", _CEL_D)])
    t = Table(datos, colWidths=[ancho * 0.55, ancho * 0.45], hAlign="RIGHT")
    estilo = [
        ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("ROUNDEDCORNERS", [7, 7, 7, 7]),
        ("TOPPADDING", (0, 0), (-1, -1), 5.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 5.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BACKGROUND", (0, final_idx), (-1, final_idx), final_color),
        ("LINEABOVE", (0, final_idx), (-1, final_idx), 1.1, INK), ("LINEBELOW", (0, final_idx), (-1, final_idx), 1.1, INK),
        ("TOPPADDING", (0, final_idx), (-1, final_idx), 7.5), ("BOTTOMPADDING", (0, final_idx), (-1, final_idx), 7.5),
    ]
    if saldo_idx is not None:
        estilo.append(("BACKGROUND", (0, saldo_idx), (-1, saldo_idx), saldo_fondo))
    t.setStyle(TableStyle(estilo))
    return t


def fila_resumen_totales(izquierda, derecha, ancho_der=62 * mm):
    """Resumen a la izquierda y totales a la derecha, con el borde derecho al ras del contenido."""
    t = Table([[izquierda, derecha]], colWidths=[ANCHO - ancho_der, ancho_der])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 5 * mm), ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _nombre_detalle(d, nombre_refaccion):
    refaccion = nombre_refaccion(d)
    return d.descripcion or refaccion or "Concepto"


TERMINOS_RECIBO = [
    "Este recibo ampara los pagos registrados para la orden indicada. No es un comprobante fiscal (CFDI); si requieres factura, solicítala con tus datos fiscales.",
    "Para hacer válida cualquier garantía es indispensable presentar esta nota de servicio.",
    "Te recomendamos revisar tu vehículo al menos una vez por semana (niveles de aceite, líquidos y llantas) para prevenir fallas y accidentes. Gracias por tu confianza.",
]
TERMINOS_REMISION = [
    "Esta nota deja constancia del trabajo realizado y del estado en que se entrega el vehículo, y es válida junto con el recibo de pago.",
    "Para hacer válida cualquier garantía es indispensable presentar esta nota de servicio.",
    "Te recomendamos revisar tu vehículo al menos una vez por semana (niveles de aceite, líquidos y llantas) para prevenir fallas y accidentes. Gracias por tu confianza.",
]
TERMINOS_COTIZACION = [
    "Este presupuesto es informativo, no es una factura ni un comprobante fiscal.",
    "Los precios finales pueden variar según lo que se encuentre al revisar el vehículo.",
    "Los precios de las refacciones pueden variar según la disponibilidad del proveedor.",
]


# --- Generadores -----------------------------------------------------------------------------
def generar_recibo(servicio, costos, taller=None, inspeccion=None) -> bytes:
    from .recibo_pdf import nombre_refaccion

    buffer = BytesIO()
    liquidado = costos.saldo_pendiente <= 0
    cliente = datos_cliente(servicio.cliente)
    km = servicio.km_llegada
    vehiculo, placas = datos_vehiculo(servicio.vehiculo, km=km, extra_km=(f"Próximo servicio: {servicio.km_proximo_servicio} km" if servicio.km_proximo_servicio else None))
    plantilla = PlantillaLateral(
        taller, "Recibo", "Orden de servicio", f"#{servicio.id_servicio:05d}",
        [f"Entrada {fecha_mx(servicio.fecha_entrada_servicio):%d/%m/%Y}",
         # Si aún no se captura la salida, se toma el día en que se genera la nota
         f"Salida {(fecha_mx(servicio.fecha_salida_servicio) or hoy_mx()):%d/%m/%Y}",
         f"Estado: {(servicio.status or '').capitalize()}"],
        cliente, vehiculo, placas, TERMINOS_RECIBO, "Recibo",
    )
    doc = plantilla.documento(buffer)
    story = []
    if servicio.es_garantia:
        story += [motivo("Reclamación de garantía", f"Orden original #{servicio.id_servicio_original:05d}" + (f" · {servicio.motivo_garantia}" if servicio.motivo_garantia else "")), Spacer(1, 4 * mm)]
    story += [motivo("Motivo de ingreso", servicio.nombre_servicio or "—"), Spacer(1, 6 * mm)]

    story.append(tabla_lineas(servicio.detalles, lambda d: _nombre_detalle(d, nombre_refaccion),
                              lambda d: (f"Refacción: {nombre_refaccion(d)}" if nombre_refaccion(d) and nombre_refaccion(d) != d.descripcion and d.descripcion else None)))
    story.append(Spacer(1, 6 * mm))

    # Izquierda: resumen por tipo y abonos · Derecha: totales
    izquierda = resumen_por_tipo(servicio.detalles)
    if servicio.abonos:
        filas = [[Paragraph(f"{a.numero_abono}", _CEL_C), Paragraph(f"{a.fecha_pago:%d/%m/%Y}", _CEL), Paragraph((a.tipo_pago or "").capitalize(), _CEL), Paragraph(f"<b>{fmt(a.monto_abono)}</b>", _CEL_D)] for a in servicio.abonos]
        ta = Table([[Paragraph("#", _CAB_C), Paragraph("FECHA", _CAB), Paragraph("FORMA", _CAB), Paragraph("MONTO", _CAB_D)]] + filas,
                   colWidths=[7 * mm, 18 * mm, 16 * mm, 20 * mm])
        ta.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 1, INK), ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ]))
        izquierda += [Spacer(1, 4 * mm), Paragraph("ABONOS REGISTRADOS", ParagraphStyle("n_ab", parent=_ET, textColor=INK, fontSize=7.4)), Spacer(1, 1.4 * mm), ta]
    else:
        izquierda += [Spacer(1, 3 * mm), Paragraph("Sin abonos registrados.", E["nota"])]
    derecha = totales_lateral(
        [("Subtotal", fmt(costos.subtotal)), (f"IVA ({servicio.iva_porcentaje:g}%)", fmt(costos.iva)), ("Total", fmt(costos.total)),
         ("(-) Abonado", fmt(costos.total_abonado)), ("Liquidado" if liquidado else "Saldo restante", fmt(costos.saldo_pendiente))],
        62 * mm, final_idx=2, saldo_idx=4,
        saldo_color=OK if liquidado else ACCENT, saldo_fondo=OK_SOFT if liquidado else ACCENT_SOFT,
    )
    story.append(fila_resumen_totales(izquierda, derecha))

    if servicio.comentarios_finales:
        story += [Spacer(1, 6 * mm), motivo("Comentarios", servicio.comentarios_finales)]
    story += plantilla.hoja_inspeccion(inspeccion)
    doc.build(story)
    return buffer.getvalue()


def generar_nota_remision(servicio, costos, taller=None, inspeccion=None) -> bytes:
    from .recibo_pdf import nombre_refaccion

    buffer = BytesIO()
    entrega = f"{(fecha_mx(servicio.fecha_salida_servicio) or hoy_mx()):%d/%m/%Y}"
    liquidado = costos.saldo_pendiente <= 0
    cliente = datos_cliente(servicio.cliente)
    vehiculo, placas = datos_vehiculo(servicio.vehiculo, km=servicio.km_llegada)
    plantilla = PlantillaLateral(
        taller, "Nota de remisión", "Entrega de vehículo", f"#{servicio.id_servicio:05d}",
        [f"Entrada {fecha_mx(servicio.fecha_entrada_servicio):%d/%m/%Y}", f"Salida {entrega}"],
        cliente, vehiculo, placas, TERMINOS_REMISION, "Nota de remisión",
    )
    doc = plantilla.documento(buffer)
    story = []
    if servicio.es_garantia:
        story += [motivo("Reclamación de garantía", f"Orden original #{servicio.id_servicio_original:05d}" + (f" · {servicio.motivo_garantia}" if servicio.motivo_garantia else "")), Spacer(1, 4 * mm)]
    story += [panel_detalle([
        ("Motivo de ingreso", servicio.nombre_servicio or "—"),
        ("Diagnóstico", servicio.diagnostico or "Sin diagnóstico registrado."),
        ("Trabajos realizados", servicio.operaciones or servicio.nombre_servicio or "Sin detalle registrado."),
    ]), Spacer(1, 6 * mm)]
    story.append(tabla_lineas(servicio.detalles, lambda d: _nombre_detalle(d, nombre_refaccion),
                              lambda d: (f"Refacción: {nombre_refaccion(d)}" if nombre_refaccion(d) and nombre_refaccion(d) != d.descripcion and d.descripcion else None)))
    story.append(Spacer(1, 6 * mm))
    izquierda = resumen_por_tipo(servicio.detalles)
    if servicio.km_proximo_servicio:
        izquierda += [Spacer(1, 3 * mm), Paragraph(f"Próximo servicio recomendado a los {esc(servicio.km_proximo_servicio)} km.",
                                                   ParagraphStyle("n_prox", parent=_TXT, fontSize=7.8, leading=10.5, textColor=OK, fontName="Helvetica-Bold"))]
    derecha = totales_lateral(
        [("Total del servicio", fmt(costos.total)), ("Pagado", fmt(costos.total_abonado)), ("Liquidado" if liquidado else "Saldo restante", fmt(costos.saldo_pendiente))],
        62 * mm, final_idx=0, saldo_idx=2,
        saldo_color=OK if liquidado else ACCENT, saldo_fondo=OK_SOFT if liquidado else ACCENT_SOFT,
    )
    story.append(fila_resumen_totales(izquierda, derecha))
    if servicio.comentarios_finales:
        story += [Spacer(1, 6 * mm), motivo("Comentarios", servicio.comentarios_finales)]
    story.append(KeepTogether([
        Spacer(1, 7 * mm),
        Paragraph("CONFORMIDAD", ParagraphStyle("n_conf", parent=_ET, textColor=ACCENT)),
        Spacer(1, 1.5 * mm),
        Paragraph("Declaro que recibí el vehículo arriba descrito a mi entera satisfacción, revisado y en las condiciones convenidas con el taller.", _TXT),
        firmas(["Nombre y firma del cliente", "Firma / sello del taller"], ANCHO),
    ]))
    story += plantilla.hoja_inspeccion(inspeccion)
    doc.build(story)
    return buffer.getvalue()


def generar_cotizacion(cotizacion, costos, taller=None) -> bytes:
    buffer = BytesIO()
    vigencia = f"{cotizacion.vigente_hasta:%d/%m/%Y}" if cotizacion.vigente_hasta else "Sin fecha límite"
    cliente = datos_cliente(getattr(cotizacion, "cliente", None))
    vehiculo, placas = datos_vehiculo(getattr(cotizacion, "vehiculo", None))
    plantilla = PlantillaLateral(
        taller, "Presupuesto", "Cotización", f"#{cotizacion.id_cotizacion:05d}",
        [f"{cotizacion.fecha_cotizacion:%d/%m/%Y}", f"Vigencia: {vigencia}"],
        cliente, vehiculo, placas, TERMINOS_COTIZACION, "Cotización",
    )
    doc = plantilla.documento(buffer)
    story = [motivo("Concepto", cotizacion.titulo or "—", secundario=None), Spacer(1, 6 * mm)]
    from .recibo_pdf import nombre_refaccion
    story.append(tabla_lineas(
        cotizacion.detalles,
        lambda d: d.descripcion or (d.refaccion.nombre_refaccion if d.refaccion else None) or "Concepto",
        lambda d: (f"Refacción: {d.refaccion.nombre_refaccion}" if d.refaccion and d.descripcion and d.descripcion != d.refaccion.nombre_refaccion else None),
    ))
    story.append(Spacer(1, 6 * mm))
    izquierda = resumen_por_tipo(cotizacion.detalles, aviso="El precio puede variar en caso de requerir piezas adicionales no visibles en el diagnóstico inicial.")
    derecha = totales_lateral(
        [("Subtotal", fmt(costos.subtotal)), (f"IVA ({cotizacion.iva_porcentaje:g}%)", fmt(costos.iva)), ("Total estimado", fmt(costos.total))],
        62 * mm, final_idx=2,
    )
    story.append(fila_resumen_totales(izquierda, derecha))
    if cotizacion.comentarios:
        story += [Spacer(1, 6 * mm), motivo("Comentarios", cotizacion.comentarios)]
    story.append(KeepTogether([
        Spacer(1, 8 * mm),
        firmas(["Autorizo el presupuesto · Nombre y firma del cliente"], ANCHO * 0.7),
    ]))
    doc.build(story)
    return buffer.getvalue()
