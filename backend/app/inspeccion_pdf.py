"""Hoja adicional con la inspección digital (recibo y nota de remisión).

Todo en UNA sola hoja: resumen con íconos, puntos agrupados por categoría
en dos columnas (cada uno con su ícono y color de estado), fotos de la
inspección y observaciones. Si no cabe, se reduce para que quepa.
"""
import io
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepInFrame, PageBreak, Paragraph, Spacer, Table, TableStyle

from . import almacenamiento
from .pdf_diseno import (
    ACCENT, ACCENT_SOFT, ALTO_ENCABEZADO, CARPETA_UPLOADS, E, LINE, OK, OK_SOFT, ROJO, ROJO_SOFT, WARN, WARN_SOFT,
    Sombra, caja_texto, esc, seccion,
)

CARPETA_ICONOS = os.path.join(os.path.dirname(__file__), "assets", "iconos")

ESTADO = {
    "bien": ("Bien", OK, OK_SOFT, "bien"),
    "regular": ("Regular", WARN, WARN_SOFT, "regular"),
    "mal": ("Mal", ROJO, ROJO_SOFT, "mal"),
}
ICONO_CATEGORIA = {
    "llantas": "llantas", "frenos": "frenos", "luces": "luces", "fluidos": "fluidos",
    "batería y eléctrico": "bateria", "bateria y electrico": "bateria",
    "suspensión y dirección": "suspension", "suspension y direccion": "suspension",
    "carrocería": "carroceria", "carroceria": "carroceria", "motor": "motor",
}


def _hex(c) -> str:
    return "#" + c.hexval()[2:]


def _icono(nombre: str, lado: float):
    ruta = os.path.join(CARPETA_ICONOS, f"{nombre}.png")
    if not os.path.exists(ruta):
        return Spacer(lado, lado)
    return Image(ruta, width=lado, height=lado)


def inspeccion_de_servicio(db, models, servicio_id: int):
    """La inspección más reciente ligada a la orden (o None), con sus fotos."""
    inspeccion = (
        db.query(models.Inspeccion)
        .filter(models.Inspeccion.id_servicio == servicio_id)
        .order_by(models.Inspeccion.fecha.desc())
        .first()
    )
    if inspeccion is not None:
        fotos = (
            db.query(models.Foto)
            .filter(models.Foto.entidad_tipo == "inspeccion", models.Foto.entidad_id == inspeccion.id_inspeccion)
            .order_by(models.Foto.fecha)
            .all()
        )
        inspeccion.fotos_pdf = [f.ruta_archivo for f in fotos]
    return inspeccion


def _tarjeta_categoria(categoria: str, resultados, ancho: float, compacto: bool = False, pad: float = 2.6, k: float = 1.0):
    """Bloque de una categoría: encabezado con ícono + puntos con su estado."""
    malos = sum(1 for r in resultados if r.estado == "mal")
    regulares = sum(1 for r in resultados if r.estado == "regular")
    resumen = f"{len(resultados) - malos - regulares}/{len(resultados)}" + ("" if compacto else " bien")
    color_resumen = ROJO if malos else WARN if regulares else OK

    ic_cab = 5.2 * mm * k if compacto else 6.5 * mm
    col_ic = 6.2 * mm * k if compacto else 8.5 * mm
    col_st = 13 * mm * min(k, 1.3) if compacto else 17 * mm
    ic_item = 3.4 * mm * k if compacto else 4.2 * mm
    fs_item, ld_item = (7.0 * k, 8.4 * k) if compacto else (8.2, 10)
    fs_st = 5.8 * min(k, 1.3) if compacto else 7.4
    fs_det = 6.0 * k if compacto else 7
    lado_pad = 3 if compacto else 5
    filas = [[
        _icono(ICONO_CATEGORIA.get(categoria.lower(), "general"), ic_cab),
        Paragraph(f"<b>{esc(categoria).upper()}</b>", ParagraphStyle("ct", parent=E["seccion"], textColor=ACCENT, fontSize=6.8 * k if compacto else 8, leading=8 * k if compacto else 10)),
        Paragraph(f"<font color='{_hex(color_resumen)}'><b>{resumen}</b></font>", ParagraphStyle("cr", parent=E["nota"], alignment=2, fontSize=6.2 * k if compacto else 7.5)),
    ]]
    estilos = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_SOFT),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 3 if compacto else 4), ("BOTTOMPADDING", (0, 0), (-1, 0), 3 if compacto else 4),
    ]
    for r in resultados:
        texto, color, fondo, icono = ESTADO.get(r.estado, ESTADO["bien"])
        detalle = ""
        if r.comentario:
            detalle += f"<br/><font size='{fs_det}' color='#6b7480'>{esc(r.comentario)}</font>"
        if r.estado == "mal" and getattr(r, "refaccion_sugerida", None):
            detalle += f"<br/><font size='{fs_det}' color='{_hex(ROJO)}'><b>Cambiar:</b> {esc(r.refaccion_sugerida.nombre_refaccion)}</font>"
        filas.append([
            _icono(icono, ic_item),
            Paragraph(esc(r.item.nombre_item if r.item else "—") + detalle, ParagraphStyle("it", parent=E["celda"], fontSize=fs_item, leading=ld_item)),
            Paragraph(f"<font color='{_hex(color)}'><b>{texto.upper()}</b></font>", ParagraphStyle("st", parent=E["celda"], fontSize=fs_st, leading=fs_st + 1.5, alignment=TA_CENTER)),
        ])
        i = len(filas) - 1
        estilos.append(("BACKGROUND", (2, i), (2, i), fondo))
        if r.estado != "bien":
            estilos.append(("BACKGROUND", (0, i), (1, i), fondo))
    t = Table(filas, colWidths=[col_ic, ancho - col_ic - col_st, col_st])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), lado_pad), ("RIGHTPADDING", (0, 0), (-1, -1), lado_pad),
        ("TOPPADDING", (0, 1), (-1, -1), pad), ("BOTTOMPADDING", (0, 1), (-1, -1), pad),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
    ] + estilos))
    return Sombra(t, radio=0)


def _resumen(conteo: dict, total: int, ancho: float):
    celdas, estilos = [], []
    datos = [
        ("inspeccion", "Puntos revisados", total, ACCENT, ACCENT_SOFT),
        ("bien", "Bien", conteo["bien"], OK, OK_SOFT),
        ("regular", "Regular", conteo["regular"], WARN, WARN_SOFT),
        ("mal", "Mal", conteo["mal"], ROJO, ROJO_SOFT),
    ]
    for i, (icono, etiqueta, valor, color, fondo) in enumerate(datos):
        interior = Table([[
            _icono(icono, 8 * mm),
            [Paragraph(f"<font color='{_hex(color)}' size='16'><b>{valor}</b></font>", ParagraphStyle("v", parent=E["valor"], leading=18)),
             Paragraph(etiqueta.upper(), E["etiqueta"])],
        ]], colWidths=[11 * mm, ancho / 4 - 11 * mm - 12])
        interior.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        celdas.append(interior)
        estilos += [("BACKGROUND", (i, 0), (i, 0), fondo), ("LINEBEFORE", (i, 0), (i, 0), 3, color)]
    t = Table([celdas], colWidths=[ancho / 4] * 4)
    t.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
    ] + estilos))
    return Sombra(t, radio=0)


def _fotos(rutas, ancho: float):
    contenidos = {r: almacenamiento.leer(r) for r in rutas[:5]}
    rutas = [r for r in rutas[:5] if contenidos[r]]
    if not rutas:
        return None
    lado = min(34 * mm, (ancho - 4 * mm * (len(rutas) - 1)) / len(rutas))
    imagenes = []
    for r in rutas:
        try:
            img = Image(io.BytesIO(contenidos[r]))
            proporcion = img.imageHeight / float(img.imageWidth or 1)
            img.drawWidth, img.drawHeight = (lado, lado * proporcion) if proporcion <= 1 else (lado / proporcion, lado)
            imagenes.append(img)
        except Exception:  # noqa: BLE001 — una foto dañada no debe impedir el documento
            continue
    if not imagenes:
        return None
    t = Table([imagenes], colWidths=[lado + 4 * mm] * len(imagenes), hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm)]))
    return t


# ---------------------------------------------------------------------------
# Mapa del vehículo: un auto al centro y cada grupo de inspección unido por una
# línea a la zona que revisa, resaltada con el color de su estado.
# ---------------------------------------------------------------------------
import unicodedata

from reportlab.platypus import Flowable

from .pdf_diseno import INK_2, PANEL, PAPEL, BORDE_TARJETA

# zona -> (altura en el auto 0..1 con el frente arriba, desplazamiento horizontal del punto de enlace)
_ZONAS = {
    "enfriamiento": (0.915, 0.10), "motor": (0.83, 0.06), "bateria": (0.775, 0.20), "fluidos": (0.705, 0.20),
    "luces": (0.95, 0.31), "suspension": (0.76, 0.33), "llantas": (0.70, 0.43), "frenos": (0.25, 0.43),
    "carroceria": (0.50, 0.40), "transmision": (0.44, 0.06), "escape": (0.12, 0.10), "otro": (0.50, 0.15),
}


def _zona_de(categoria: str) -> str:
    n = unicodedata.normalize("NFD", categoria.lower())
    n = "".join(ch for ch in n if unicodedata.category(ch) != "Mn")
    for clave, palabras in (
        ("enfriamiento", ("enfri", "clima", "radiador")), ("motor", ("motor",)), ("bateria", ("bateria", "electric")),
        ("fluidos", ("fluido", "liquido")), ("luces", ("luces", "luz", "ilumin")), ("suspension", ("suspension", "direccion")),
        ("llantas", ("llanta", "neumatic", "rueda")), ("frenos", ("freno",)), ("carroceria", ("carroceria", "exterior", "interior", "cristal")),
        ("transmision", ("transmision", "traccion", "clutch")), ("escape", ("escape",)),
    ):
        if any(p in n for p in palabras):
            return clave
    return "otro"


def _color_estado(lista):
    return ROJO if any(r.estado == "mal" for r in lista) else WARN if any(r.estado == "regular" for r in lista) else OK


class MapaInspeccion(Flowable):
    """Auto visto desde arriba, al centro, con las categorías a los lados enlazadas a su zona."""

    def __init__(self, categorias: dict, ancho: float, alto: float):
        super().__init__()
        self.categorias, self.ancho, self.alto = categorias, ancho, alto
        self.hueco = 9 * mm

    def wrap(self, aw, ah):
        return self.ancho, self.alto

    # -- disposición ---------------------------------------------------------
    def _disponer(self, s, pad, k=1.0):
        """Tarjetas a la escala s con relleno de fila pad: devuelve geometría y altura necesaria."""
        wv, hv = self.ancho / s, self.alto / s
        cw = min(0.33 * wv, hv / 2.25)
        sw = (wv - cw - 2 * self.hueco) / 2
        items = []
        for nombre, lista in self.categorias.items():
            zona = _zona_de(nombre)
            t = _tarjeta_categoria(nombre, lista, sw, compacto=True, pad=pad, k=k)
            _, h = t.wrap(sw, 100000)
            items.append({"nombre": nombre, "lista": lista, "zona": zona, "t": t, "h": h, "y": _ZONAS[zona][0]})
        items.sort(key=lambda d: -d["y"])
        # Reparto en dos columnas con la menor altura posible (fuerza bruta: son ~11 grupos)
        n = len(items)
        mejor, mejor_altura = 0, None
        for mask in range(1 << min(n, 16)):
            a_ = sum(d["h"] for i, d in enumerate(items) if mask >> i & 1)
            b_ = sum(d["h"] for i, d in enumerate(items) if not mask >> i & 1)
            na, nb = bin(mask).count("1"), n - bin(mask).count("1")
            alt = max(a_ + 1.6 * mm * max(na - 1, 0), b_ + 1.6 * mm * max(nb - 1, 0))
            if mejor_altura is None or alt < mejor_altura - 1e-6:
                mejor, mejor_altura = mask, alt
        cols = ([d for i, d in enumerate(items) if mejor >> i & 1], [d for i, d in enumerate(items) if not mejor >> i & 1])
        altos = [sum(d["h"] for d in c_) for c_ in cols]
        min_gap = 1.6 * mm
        need = max(altos[k] + min_gap * max(len(cols[k]) - 1, 0) for k in (0, 1))
        return {"wv": wv, "hv": hv, "cw": cw, "sw": sw, "cols": cols, "need": need}

    def draw(self):
        # 1) la letra más grande que quepa en la hoja a escala 1; 2) si ni la mínima cabe, se reduce todo
        for k in (1.75, 1.6, 1.45, 1.3, 1.18, 1.08, 1.0):
            g = self._disponer(1.0, 1.3 * k, k)
            if g["need"] <= self.alto:
                self._pintar(g, 1.0)
                return
        # No cabe a tamaño normal: se busca la escala más grande (punto fijo) con la que todo entra
        s = 1.0
        for _ in range(12):
            g = self._disponer(s, 1.3, 1.0)
            nuevo = min(1.0, self.alto / g["need"]) if g["need"] > 0 else 1.0
            if abs(nuevo - s) < 0.002:
                break
            s = (s + nuevo) / 2
        while True:
            g = self._disponer(s, 1.3, 1.0)
            if g["need"] <= self.alto / s or s < 0.3:
                break
            s *= 0.99
        self._pintar(g, s)

    # -- dibujo --------------------------------------------------------------
    def _pintar(self, g, s):
        c = self.canv
        c.saveState()
        c.scale(s, s)
        wv, hv, cw, sw = g["wv"], g["hv"], g["cw"], g["sw"]
        ch = min(cw * 2.45, hv)
        cx0, cy0 = (wv - cw) / 2, (hv - ch) / 2

        def P(nx, ny):
            return cx0 + nx * cw, cy0 + ny * ch

        # posiciones de las tarjetas (de arriba abajo, repartiendo el sobrante entre ellas)
        colocadas = []
        for k, col in enumerate(g["cols"]):
            if not col:
                continue
            suma = sum(d["h"] for d in col)
            hueco_v = (hv - suma) / (len(col) - 1) if len(col) > 1 else 0
            hueco_v = min(hueco_v, 40 * mm)
            total = suma + hueco_v * (len(col) - 1)
            y = hv - (hv - total) / 2
            for d in col:
                y -= d["h"]
                d["x"] = 0 if k == 0 else wv - sw
                d["y0"] = y
                d["lado"] = k
                colocadas.append(d)
                y -= hueco_v

        self._auto(c, P, cw, ch)
        # zonas resaltadas y líneas (debajo de las tarjetas)
        for d in colocadas:
            color = _color_estado(d["lista"])
            ay, off = _ZONAS[d["zona"]]
            ax = 0.5 - off if d["lado"] == 0 else 0.5 + off
            d["ancla"] = P(ax, ay)
            self._zona(c, P, cw, ch, d["zona"], color, d["lado"])
        for d in colocadas:
            color = _color_estado(d["lista"])
            x_borde = d["x"] + sw if d["lado"] == 0 else d["x"]
            y_med = d["y0"] + d["h"] / 2
            ax, ay = d["ancla"]
            codo = x_borde + (self.hueco * 0.55 if d["lado"] == 0 else -self.hueco * 0.55)
            c.setStrokeColor(color)
            c.setLineWidth(1.1)
            c.setLineJoin(1)
            p = c.beginPath()
            p.moveTo(x_borde, y_med)
            p.lineTo(codo, y_med)
            p.lineTo(ax, ay)
            c.drawPath(p, stroke=1, fill=0)
            c.setFillColor(color)
            c.circle(x_borde, y_med, 1.1 * mm, stroke=0, fill=1)
        for d in colocadas:
            d["t"].wrapOn(c, sw, 100000)
            d["t"].drawOn(c, d["x"], d["y0"])
        for d in colocadas:
            color = _color_estado(d["lista"])
            ax, ay = d["ancla"]
            c.setFillColor(colors.white)
            c.setStrokeColor(color)
            c.setLineWidth(1.4)
            c.circle(ax, ay, 1.9 * mm, stroke=1, fill=1)
            c.setFillColor(color)
            c.circle(ax, ay, 0.9 * mm, stroke=0, fill=1)
        c.restoreState()

    def _auto(self, c, P, cw, ch):
        """Sedán visto desde arriba (frente hacia arriba)."""
        def rect(x0, y0, x1, y1, r=1.2 * mm, fill=None, stroke=None, lw=0.6):
            (ax, ay), (bx, by) = P(x0, y0), P(x1, y1)
            if fill is not None:
                c.setFillColor(fill)
            if stroke is not None:
                c.setStrokeColor(stroke)
            c.setLineWidth(lw)
            c.roundRect(ax, ay, bx - ax, by - ay, r, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)

        oscuro = colors.HexColor("#3a3a3d")
        # llantas (detrás de la carrocería)
        for yy in (0.66, 0.16):
            rect(0.04, yy, 0.14, yy + 0.14, fill=oscuro)
            rect(0.86, yy, 0.96, yy + 0.14, fill=oscuro)
        # carrocería
        der = [((0.5, 1.0), (0.70, 1.0), (0.86, 0.985), (0.885, 0.93)), ((0.885, 0.93), (0.90, 0.88), (0.915, 0.82), (0.915, 0.74)),
               ((0.915, 0.74), (0.92, 0.60), (0.92, 0.40), (0.915, 0.26)), ((0.915, 0.26), (0.915, 0.14), (0.90, 0.06), (0.84, 0.03)),
               ((0.84, 0.03), (0.76, 0.0), (0.62, 0.0), (0.5, 0.0))]
        m = lambda q: (1 - q[0], q[1])  # noqa: E731
        path = c.beginPath()
        path.moveTo(*P(*der[0][0]))
        for _, c1, c2, e in der:
            path.curveTo(*P(*c1), *P(*c2), *P(*e))
        for ini, c1, c2, e in reversed(der):
            path.curveTo(*P(*m(c2)), *P(*m(c1)), *P(*m(ini)))
        path.close()
        c.setFillColor(PAPEL)
        c.setStrokeColor(INK_2)
        c.setLineWidth(1.3)
        c.drawPath(path, stroke=1, fill=1)
        # cofre y cajuela
        rect(0.21, 0.72, 0.79, 0.94, r=3 * mm, stroke=BORDE_TARJETA, lw=0.5)
        rect(0.23, 0.05, 0.77, 0.25, r=3 * mm, stroke=BORDE_TARJETA, lw=0.5)
        # cabina: parabrisas, techo y luneta
        cristal = colors.HexColor("#9fb0bf")
        for pts in (((0.23, 0.62), (0.77, 0.62), (0.71, 0.71), (0.29, 0.71)), ((0.25, 0.37), (0.75, 0.37), (0.70, 0.28), (0.30, 0.28))):
            q = c.beginPath()
            q.moveTo(*P(*pts[0]))
            for pt in pts[1:]:
                q.lineTo(*P(*pt))
            q.close()
            c.setFillColor(cristal)
            c.setStrokeColor(INK_2)
            c.setLineWidth(0.6)
            c.drawPath(q, stroke=1, fill=1)
        rect(0.23, 0.37, 0.77, 0.62, r=3 * mm, fill=PANEL, stroke=INK_2, lw=0.6)
        # espejos y faros
        for xx in (0.07, 0.93):
            (ex, ey) = P(xx, 0.665)
            c.setFillColor(oscuro)
            c.ellipse(ex - 0.018 * cw * 3, ey - 0.012 * ch * 3, ex + 0.018 * cw * 3, ey + 0.012 * ch * 3, stroke=0, fill=1)
        for xx0, xx1 in ((0.13, 0.30), (0.70, 0.87)):
            rect(xx0, 0.935, xx1, 0.965, r=1 * mm, fill=colors.HexColor("#f4efc4"), stroke=INK_2, lw=0.5)
            rect(xx0, 0.035, xx1, 0.065, r=1 * mm, fill=colors.HexColor("#e7a9a5"), stroke=INK_2, lw=0.5)

    def _zona(self, c, P, cw, ch, zona, color, lado):
        """Resalta la zona revisada con el color del estado de su grupo."""
        def rect(x0, y0, x1, y1, r=1.2 * mm):
            (ax, ay), (bx, by) = P(x0, y0), P(x1, y1)
            c.setFillColor(color, alpha=0.38)
            c.setStrokeColor(color)
            c.setLineWidth(1.0)
            c.roundRect(ax, ay, bx - ax, by - ay, r, stroke=1, fill=1)

        def lateral(x0, x1):  # misma zona del lado de la tarjeta
            return (x0, x1) if lado == 0 else (1 - x1, 1 - x0)

        if zona == "enfriamiento":
            rect(0.27, 0.885, 0.73, 0.945)
        elif zona == "motor":
            rect(0.30, 0.755, 0.70, 0.875, r=2 * mm)
        elif zona == "bateria":
            a, b = lateral(0.15, 0.30); rect(a, 0.73, b, 0.82)
        elif zona == "fluidos":
            a, b = lateral(0.70, 0.85) if lado == 1 else lateral(0.15, 0.30)
            rect(a, 0.625, b, 0.70)
        elif zona == "luces":
            for xx0, xx1 in ((0.13, 0.30), (0.70, 0.87)):
                rect(xx0, 0.935, xx1, 0.965); rect(xx0, 0.035, xx1, 0.065)
        elif zona == "suspension":
            for yy in (0.76, 0.23):
                rect(0.14, yy - 0.012, 0.86, yy + 0.012, r=0.6 * mm)
        elif zona == "llantas":
            for yy in (0.66, 0.16):
                rect(0.04, yy, 0.14, yy + 0.14); rect(0.86, yy, 0.96, yy + 0.14)
        elif zona == "frenos":
            c.setFillColor(color, alpha=0.38); c.setStrokeColor(color); c.setLineWidth(1.0)
            for yy in (0.73, 0.23):
                for xx in (0.09, 0.91):
                    x, y = P(xx, yy)
                    c.circle(x, y, 0.036 * cw * 1.9, stroke=1, fill=1)
        elif zona == "carroceria":
            rect(0.10, 0.40, 0.22, 0.66); rect(0.78, 0.40, 0.90, 0.66)
            rect(0.23, 0.94, 0.77, 0.985, r=1 * mm); rect(0.23, 0.015, 0.77, 0.055, r=1 * mm)
        elif zona == "transmision":
            rect(0.455, 0.20, 0.545, 0.70, r=1.5 * mm)
        elif zona == "escape":
            rect(0.46, 0.03, 0.54, 0.34, r=1.5 * mm); rect(0.36, 0.06, 0.64, 0.14, r=2 * mm)
        else:
            rect(0.38, 0.45, 0.62, 0.55, r=2 * mm)


def hoja_inspeccion(inspeccion, ancho: float, alto_disponible: float | None = None, columnas_n: int = 2) -> list:
    if not inspeccion or not inspeccion.resultados:
        return []
    resultados = sorted(
        inspeccion.resultados,
        key=lambda r: ((r.item.categoria if r.item else ""), (r.item.orden if r.item else 0), (r.item.nombre_item if r.item else "")),
    )
    conteo = {k: sum(1 for r in resultados if r.estado == k) for k in ESTADO}

    # Categorías repartidas en columnas (2 por defecto; 0 = automático: la cantidad de columnas
    # que deje la letra más grande al ajustar a la hoja), equilibrando la altura
    categorias = {}
    for r in resultados:
        categorias.setdefault(r.item.categoria if r.item else "Otros", []).append(r)

    hueco = 5 * mm

    def construir(n, cats, w):
        """Rejilla de n columnas de ancho total w, repartiendo las categorías por altura."""
        columnas, altos = [[] for _ in range(n)], [0] * n
        ancho_col = (w - hueco * (n - 1)) / n
        for categoria, lista in sorted(cats.items(), key=lambda kv: -len(kv[1])):
            tarjeta = _tarjeta_categoria(categoria, lista, ancho_col)
            _, alto_t = tarjeta.wrap(ancho_col, 100000)
            i = altos.index(min(altos))
            columnas[i] += [tarjeta, Spacer(1, 3 * mm)]
            altos[i] += alto_t + 3 * mm
        anchos = [ancho_col + (hueco / 2 if k in (0, n - 1) else hueco) for k in range(n)] if n > 1 else [w]
        tabla = Table([columnas], colWidths=anchos)
        estilo = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]
        for k in range(n):
            if k > 0:
                estilo.append(("LEFTPADDING", (k, 0), (k, 0), hueco / 2))
            if k < n - 1:
                estilo.append(("RIGHTPADDING", (k, 0), (k, 0), hueco / 2))
        tabla.setStyle(TableStyle(estilo))
        return tabla

    def armar(n, w):
        """Todo el contenido de la hoja a un ancho w (las fotos y observaciones al final)."""
        cont = []
        cont += seccion(
            "Inspección digital del vehículo", w,
            derecha=f"{inspeccion.fecha:%d/%m/%Y %H:%M}" + (f" · {esc(inspeccion.realizada_por)}" if inspeccion.realizada_por else ""),
        )
        cont += [_resumen(conteo, len(resultados), w), Spacer(1, 4 * mm), construir(n, categorias, w)]
        fotos = _fotos(getattr(inspeccion, "fotos_pdf", []) or [], w)
        if fotos is not None:
            cont += seccion("Fotos de la inspección", w)
            cont.append(fotos)
        if inspeccion.comentario_general:
            cont += seccion("Observaciones generales", w)
            cont.append(caja_texto(inspeccion.comentario_general, w))
        return cont

    def alto_de(cont, w):
        return sum(f.wrap(w, 100000)[1] for f in cont)

    if alto_disponible is None:
        alto_disponible = 792 - (ALTO_ENCABEZADO + 5 * mm) - 20 * mm - 6

    if columnas_n and columnas_n > 0:
        contenido = armar(columnas_n, ancho)
    else:
        # Hoja única con el mapa del vehículo: el auto al centro, los grupos a los lados enlazados
        # a su zona. El mapa ocupa TODA la altura que dejan el resumen, las fotos y las observaciones.
        arriba = seccion(
            "Inspección digital del vehículo", ancho,
            derecha=f"{inspeccion.fecha:%d/%m/%Y %H:%M}" + (f" · {esc(inspeccion.realizada_por)}" if inspeccion.realizada_por else ""),
        ) + [_resumen(conteo, len(resultados), ancho), Spacer(1, 3 * mm)]
        abajo = []
        fotos = _fotos(getattr(inspeccion, "fotos_pdf", []) or [], ancho)
        if fotos is not None:
            abajo += seccion("Fotos de la inspección", ancho) + [fotos]
        if inspeccion.comentario_general:
            abajo += seccion("Observaciones generales", ancho) + [caja_texto(inspeccion.comentario_general, ancho)]
        usado = sum(f.wrap(ancho, 100000)[1] for f in arriba + abajo)
        alto_mapa = max(alto_disponible - usado - 2 * mm, 90 * mm)
        contenido = arriba + [MapaInspeccion(categorias, ancho, alto_mapa)] + abajo

    # Cada hoja se ajusta a la página: si no cabe, se reduce proporcionalmente
    return [PageBreak(), KeepInFrame(ancho, alto_disponible, contenido, mode="shrink")]
