"""
Sistema de diseño compartido para los PDF que se entregan al cliente
(recibo, nota de remisión, cotización y factura).

Todos usan el mismo encabezado (logo + datos del taller a la izquierda,
tipo de documento y folio a la derecha), el mismo pie de página y los
mismos bloques: secciones, tarjetas de datos, tabla de conceptos, totales
y firmas — así los documentos se ven como una sola familia.
Solo usa fuentes base de PDF (Helvetica/Courier): no depende de archivos de
fuentes instalados en Windows ni en el servidor.
"""
import io
import math
import os

from reportlab.lib import colors
from reportlab.lib.utils import ImageReader

from . import almacenamiento
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# --- Paleta -----------------------------------------------------------------
INK = colors.HexColor("#141a22")
INK_2 = colors.HexColor("#3a4452")
MUTED = colors.HexColor("#6b7480")
LINE = colors.HexColor("#d9dee4")
SOFT = colors.HexColor("#eef2f4")
PANEL = colors.HexColor("#f7f9fa")
SOMBRA = colors.HexColor("#d3dae0")
FONDO_PAGINA = colors.HexColor("#eceff2")
BORDE_TARJETA = colors.HexColor("#c3ccd5")
# Azul petróleo: color de marca de los documentos
ACCENT = colors.HexColor("#0f5c6e")
ACCENT_SOFT = colors.HexColor("#e1eff2")
# Rojo: solo para estados (Mal, cancelada, sin validez fiscal)
ROJO = colors.HexColor("#c8372d")
ROJO_SOFT = colors.HexColor("#fdecea")
OK = colors.HexColor("#1f7a4f")
OK_SOFT = colors.HexColor("#e6f4ec")
WARN = colors.HexColor("#b5730a")
WARN_SOFT = colors.HexColor("#fdf3e1")

CARPETA_UPLOADS = os.path.join(os.path.dirname(__file__), "uploads")
MARGEN_X = 16 * mm
ALTO_ENCABEZADO = 33 * mm

# --- Estilos de texto --------------------------------------------------------
_base = ParagraphStyle("base", fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
E = {
    "etiqueta": ParagraphStyle("etiqueta", parent=_base, fontSize=7, leading=9, textColor=MUTED, fontName="Helvetica-Bold"),
    "valor": ParagraphStyle("valor", parent=_base, fontSize=9.6, leading=12.2, fontName="Helvetica-Bold"),
    "valor_n": ParagraphStyle("valor_n", parent=_base, fontSize=9.5, leading=13),
    "parrafo": ParagraphStyle("parrafo", parent=_base, fontSize=9.5, leading=14, textColor=INK_2),
    "celda": ParagraphStyle("celda", parent=_base, fontSize=8.8, leading=11.5),
    "celda_sub": ParagraphStyle("celda_sub", parent=_base, fontSize=7.5, leading=10, textColor=MUTED),
    "celda_centro": ParagraphStyle("celda_centro", parent=_base, fontSize=8.8, leading=11.5, alignment=1),
    "celda_der": ParagraphStyle("celda_der", parent=_base, fontSize=8.8, leading=11.5, alignment=TA_RIGHT),
    "seccion": ParagraphStyle("seccion", parent=_base, fontSize=8, leading=10, fontName="Helvetica-Bold", textColor=INK),
    "nota": ParagraphStyle("nota", parent=_base, fontSize=7.5, leading=10.5, textColor=MUTED),
    "mono": ParagraphStyle("mono", parent=_base, fontName="Courier", fontSize=6.6, leading=8.4, textColor=INK_2),
}


def fmt(n) -> str:
    return f"${(n or 0):,.2f}"


def esc(texto) -> str:
    """Escapa texto libre para Paragraph (que interpreta mini-HTML)."""
    return (str(texto) if texto is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _espaciado(texto: str) -> str:
    return texto.upper()


# --- Datos del taller ----------------------------------------------------------
def datos_taller(taller) -> dict:
    if not taller:
        return {"nombre": "Mi Taller", "linea1": "", "linea2": "", "logo": None}
    ciudad = getattr(getattr(taller, "ciudad", None), "nombre_ciudad", None)
    estado = getattr(getattr(taller, "estado", None), "nombre_estado", None)
    calle = " ".join(filter(None, [taller.calle, taller.numero_taller]))
    domicilio = ", ".join(filter(None, [calle or None, f"CP {taller.cp}" if taller.cp else None, ciudad, estado])) or (taller.direccion or "")
    contacto = " · ".join(filter(None, [
        f"Tel. {taller.telefono}" if taller.telefono else None,
        taller.correo,
        f"RFC {taller.rfc}" if taller.rfc else None,
    ]))
    logo = None
    if taller.ruta_logo:
        datos = almacenamiento.leer(taller.ruta_logo)
        if datos:
            logo = ImageReader(io.BytesIO(datos))
    return {"nombre": taller.nombre_taller or "Mi Taller", "linea1": domicilio, "linea2": contacto, "logo": logo}


# --- Plantilla de página ---------------------------------------------------------
class PlantillaDocumento:
    """Dibuja encabezado, pie y (opcional) marca de agua en cada página."""

    def __init__(self, taller, tipo: str, numero: str, lineas_derecha=(), marca_agua: str | None = None, color_marca=ACCENT):
        self.t = datos_taller(taller)
        self.tipo = tipo
        self.numero = numero
        self.lineas = list(lineas_derecha)
        self.marca_agua = marca_agua
        self.color_marca = color_marca

    def documento(self, buffer) -> SimpleDocTemplate:
        return SimpleDocTemplate(
            buffer, pagesize=letter,
            topMargin=ALTO_ENCABEZADO + 5 * mm, bottomMargin=20 * mm,
            leftMargin=MARGEN_X, rightMargin=MARGEN_X,
            title=f"{self.tipo} {self.numero}", author=self.t["nombre"],
        )

    def __call__(self, c, doc):
        ancho, alto = letter
        c.saveState()

        # Fondo de la hoja: un tono por debajo del blanco para que los recuadros se distingan
        c.setFillColor(FONDO_PAGINA)
        c.rect(0, 0, ancho, alto, stroke=0, fill=1)

        if self.marca_agua:
            c.saveState()
            c.setFillColor(self.color_marca)
            c.setFillAlpha(0.07)
            c.translate(ancho / 2, alto / 2)
            c.rotate(math.degrees(math.atan2(alto, ancho)))
            # Tamaño que quepa en la diagonal de la hoja, sin salirse
            tam = min(80, 0.72 * math.hypot(ancho, alto) / max(1, c.stringWidth(self.marca_agua, "Helvetica-Bold", 1)))
            c.setFont("Helvetica-Bold", tam)
            c.drawCentredString(0, -tam / 3, self.marca_agua)
            c.restoreState()

        # Panel de fondo del encabezado
        c.setFillColor(colors.white)
        c.rect(0, alto - ALTO_ENCABEZADO - 2 * mm, ancho, ALTO_ENCABEZADO + 2 * mm, stroke=0, fill=1)

        # Franja superior
        c.setFillColor(ACCENT)
        c.rect(0, alto - 3.5 * mm, ancho, 3.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#14a8a0"))
        c.rect(0, alto - 3.5 * mm, 60 * mm, 3.5 * mm, stroke=0, fill=1)

        top = alto - 3.5 * mm - 8 * mm  # línea base superior del contenido del encabezado
        # Recuadro de los datos del taller (con énfasis)
        caja_x, caja_w, caja_h = MARGEN_X, 118 * mm, 24 * mm
        caja_y = top - 20 * mm
        c.setFillColor(ACCENT_SOFT)
        c.roundRect(caja_x, caja_y, caja_w, caja_h, 3 * mm, stroke=0, fill=1)
        x = caja_x + 4 * mm
        if self.t["logo"]:
            try:
                c.drawImage(self.t["logo"], x, caja_y + 2 * mm, width=22 * mm, height=20 * mm,
                            preserveAspectRatio=True, anchor="w", mask="auto")
                x += 26 * mm
            except Exception:  # noqa: BLE001 — un logo dañado no debe impedir generar el documento
                pass

        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(x, caja_y + caja_h - 8 * mm, self.t["nombre"][:36])
        c.setFillColor(INK_2)
        disponible = caja_x + caja_w - 4 * mm - x
        for linea, dy in ((self.t["linea1"], 13), (self.t["linea2"], 17.5)):
            if not linea:
                continue
            tam = 8
            while tam > 6 and c.stringWidth(linea, "Helvetica", tam) > disponible:
                tam -= 0.25  # reduce la letra para que quepa dentro de la caja
            c.setFont("Helvetica", tam)
            c.drawString(x, caja_y + caja_h - dy * mm, linea)

        # Bloque derecho: tipo de documento + folio
        derecha = ancho - MARGEN_X
        c.setFillColor(ACCENT)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawRightString(derecha, top - 3 * mm, self.tipo.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 19)
        c.drawRightString(derecha, top - 10.5 * mm, self.numero)
        c.setFont("Helvetica", 8)
        c.setFillColor(MUTED)
        for i, linea in enumerate(self.lineas[:3]):
            c.drawRightString(derecha, top - (15 + i * 3.5) * mm, linea)

        # Línea divisoria bajo el encabezado
        y_linea = alto - ALTO_ENCABEZADO - 2 * mm
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.line(MARGEN_X, y_linea, ancho - MARGEN_X, y_linea)

        # Pie
        c.setStrokeColor(LINE)
        c.line(MARGEN_X, 14 * mm, ancho - MARGEN_X, 14 * mm)
        c.setFont("Helvetica", 7)
        c.setFillColor(MUTED)
        c.drawString(MARGEN_X, 9.5 * mm, f"{self.t['nombre']} · {self.tipo} {self.numero}"[:110])
        c.drawRightString(ancho - MARGEN_X, 9.5 * mm, f"Página {doc.page}")
        c.setFillColor(colors.HexColor("#9aa2ad"))
        c.drawCentredString(ancho / 2, 9.5 * mm, "Generado con ALDM AutoCore")
        c.restoreState()


class Sombra(Flowable):
    """Dibuja un bloque con sombreado (sombra desplazada abajo-derecha)
    para que cada división del documento se distinga a simple vista."""

    def __init__(self, contenido, desplazamiento=0, radio=6):
        super().__init__()
        self.contenido = contenido
        self.hAlign = getattr(contenido, "hAlign", "LEFT")
        self.d = desplazamiento
        self.radio = radio

    def wrap(self, ancho_disp, alto_disp):
        self.ancho, self.alto = self.contenido.wrap(ancho_disp - self.d, alto_disp - self.d)
        return self.ancho + self.d, self.alto + self.d

    def split(self, ancho_disp, alto_disp):
        partes = self.contenido.split(ancho_disp - self.d, alto_disp - self.d)
        return [Sombra(p, self.d, self.radio) for p in partes]

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(SOMBRA)
        c.setStrokeColor(SOMBRA)
        c.roundRect(self.d, 0, self.ancho, self.alto, self.radio, stroke=0, fill=1)
        # Fondo blanco bajo el bloque: las celdas sin color no dejan ver la sombra
        c.setFillColor(colors.white)
        c.roundRect(0, self.d, self.ancho, self.alto, self.radio, stroke=0, fill=1)
        c.restoreState()
        self.contenido.drawOn(c, 0, self.d)


# --- Bloques ------------------------------------------------------------------
def seccion(titulo: str, ancho: float, derecha: str | None = None):
    """Título de sección con marca de color a la izquierda."""
    celdas = [["", Paragraph(_espaciado(titulo), E["seccion"]), Paragraph(derecha or "", ParagraphStyle("sd", parent=E["nota"], alignment=TA_RIGHT))]]
    t = Table(celdas, colWidths=[3.5, ancho * 0.6 - 3.5, ancho * 0.4])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT),
        ("BACKGROUND", (0, 0), (0, 0), ACCENT),
        ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 8), ("RIGHTPADDING", (2, 0), (2, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return [Spacer(1, 5.5 * mm), t, Spacer(1, 2.6 * mm)]


def tarjeta(campos, ancho: float, columnas: int = 3, fondo=colors.white, borde=None, proporciones=None, alto_fila=None):
    """Rejilla de etiqueta/valor dentro de un recuadro suave.
    campos: [(etiqueta, valor), ...] — el valor puede ser str o Paragraph."""
    celdas, fila = [], []
    for etiqueta, valor in campos:
        v = valor if hasattr(valor, "wrap") else Paragraph(esc(valor) if valor not in (None, "") else "—", E["valor"])
        fila.append([Paragraph(_espaciado(etiqueta), E["etiqueta"]), Spacer(1, 1.2 * mm), v])
        if len(fila) == columnas:
            celdas.append(fila)
            fila = []
    if fila:
        fila += [""] * (columnas - len(fila))
        celdas.append(fila)
    anchos = [ancho * p for p in proporciones] if proporciones else [ancho / columnas] * columnas
    t = Table(celdas, colWidths=anchos, rowHeights=[alto_fila] * len(celdas) if alto_fila else None)
    estilo = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]
    if fondo is not None:
        estilo.append(("BACKGROUND", (0, 0), (-1, -1), fondo))
    estilo.append(("BOX", (0, 0), (-1, -1), 1, borde or BORDE_TARJETA))
    t.setStyle(TableStyle(estilo))
    return Sombra(t)


def dos_columnas(izq, der, ancho: float, separacion: float = 5 * mm):
    """Coloca dos flowables lado a lado (ej. emisor | receptor)."""
    t = Table([[izq, der]], colWidths=[(ancho - separacion) / 2 + separacion / 2] * 2)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), separacion / 2),
        ("LEFTPADDING", (1, 0), (1, 0), separacion / 2), ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def tabla_conceptos(encabezados, filas, anchos, alinear_derecha=(), vacio="Sin conceptos registrados", alinear_centro=()):
    """Tabla con encabezado oscuro, filas alternadas y solo líneas horizontales."""
    cab = [Paragraph(f"<font color='white'><b>{_espaciado(h)}</b></font>",
                     ParagraphStyle("h", parent=E["etiqueta"], alignment=TA_RIGHT if i in alinear_derecha else (1 if i in alinear_centro else 0)))
           for i, h in enumerate(encabezados)]
    cuerpo = []
    for f in filas:
        cuerpo.append([
            celda if hasattr(celda, "wrap") else Paragraph(esc(celda), E["celda_der"] if i in alinear_derecha else (E["celda_centro"] if i in alinear_centro else E["celda"]))
            for i, celda in enumerate(f)
        ])
    if not cuerpo:
        cuerpo = [[Paragraph(vacio, E["celda_sub"])] + [""] * (len(encabezados) - 1)]
    t = Table([cab] + cuerpo, colWidths=anchos, repeatRows=1)
    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 7), ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING", (0, 1), (-1, -1), 6), ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]
    for i in range(1, len(cuerpo) + 1):
        estilo.append(("BACKGROUND", (0, i), (-1, i), colors.white if i % 2 else PANEL))
    if len(cuerpo) == 1 and not filas:
        estilo.append(("SPAN", (0, 1), (-1, 1)))
    estilo.append(("BOX", (0, 0), (-1, -1), 1, BORDE_TARJETA))
    t.setStyle(TableStyle(estilo))
    return Sombra(t, radio=6)


def totales(filas, ancho_total: float, destacar_ultima: bool = True, color_final=INK, extra=None):
    """Bloque de totales alineado a la derecha.
    filas: [(etiqueta, monto_str), ...]; extra: [(fila_idx, color)] para colorear montos."""
    colores = dict(extra or [])
    datos = []
    for i, (e, v) in enumerate(filas):
        monto = f"<font color='{_hex(colores[i])}'><b>{esc(v)}</b></font>" if i in colores else esc(v)
        datos.append([Paragraph(esc(e), E["valor_n"]), Paragraph(monto, E["celda_der"])])
    ancho = 78 * mm
    estilo = [
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]
    if destacar_ultima:
        u = len(datos) - 1
        e, v = filas[-1]
        datos[u] = [Paragraph(f"<font color='white'><b>{esc(e)}</b></font>", E["valor_n"]),
                    Paragraph(f"<font color='white' size='12'><b>{esc(v)}</b></font>", ParagraphStyle("tf", parent=E["celda_der"], leading=15))]
        estilo += [("BACKGROUND", (0, u), (-1, u), color_final),
                   ("TOPPADDING", (0, u), (-1, u), 6), ("BOTTOMPADDING", (0, u), (-1, u), 6)]
    t = Table(datos, colWidths=[ancho * 0.55, ancho * 0.45], hAlign="RIGHT")
    estilo = [("BACKGROUND", (0, 0), (-1, -1), colors.white), ("BOX", (0, 0), (-1, -1), 1, BORDE_TARJETA), ("ROUNDEDCORNERS", [8, 8, 8, 8])] + estilo
    t.setStyle(TableStyle(estilo))
    return Sombra(t, radio=6)


def aviso(texto: str, ancho: float, color=WARN, fondo=WARN_SOFT):
    t = Table([[Paragraph(texto, ParagraphStyle("av", parent=E["parrafo"], textColor=color, fontName="Helvetica-Bold", fontSize=9))]], colWidths=[ancho])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fondo), ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return Sombra(t, radio=0)


def caja_texto(texto: str, ancho: float):
    """Párrafo largo (diagnóstico, trabajos, comentarios) dentro de un recuadro."""
    parrafos = [Paragraph(esc(linea) or "&nbsp;", E["parrafo"]) for linea in (texto or "").splitlines()] or [Paragraph("—", E["parrafo"])]
    t = Table([[p] for p in parrafos], colWidths=[ancho])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE), ("ROUNDEDCORNERS", [5, 5, 5, 5]),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("TOPPADDING", (0, 0), (-1, 0), 7), ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
    ]))
    return Sombra(t)


def firmas(etiquetas, ancho: float):
    """Líneas de firma separadas por un hueco (columna vacía entre cada una)."""
    hueco = 14 * mm
    col = (ancho - hueco * (len(etiquetas) - 1)) / len(etiquetas)
    fila_linea, fila_texto, anchos = [], [], []
    for i, e in enumerate(etiquetas):
        if i:
            fila_linea.append(""); fila_texto.append(""); anchos.append(hueco)
        fila_linea.append("")
        fila_texto.append(Paragraph(e, ParagraphStyle("f", parent=E["nota"], alignment=1)))
        anchos.append(col)
    t = Table([fila_linea, fila_texto], colWidths=anchos, rowHeights=[13 * mm, None])
    estilo = [("TOPPADDING", (0, 1), (-1, 1), 4)]
    for i in range(0, len(anchos), 2):
        estilo.append(("LINEBELOW", (i, 0), (i, 0), 0.8, INK_2))
    t.setStyle(TableStyle(estilo))
    return t


def pastilla(texto: str, color, fondo) -> Paragraph:
    """Etiqueta de estado tipo 'badge' para meter en una tarjeta."""
    return Paragraph(f"<font color='{_hex(color)}'><b>{esc(texto).upper()}</b></font>",
                     ParagraphStyle("p", parent=E["valor"], backColor=fondo, borderPadding=(2, 5, 2, 5), fontSize=8.5))


def _hex(color) -> str:
    return "#" + color.hexval()[2:]
