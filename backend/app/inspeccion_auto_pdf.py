"""Hoja de inspección con el auto deportivo en líneas (casi sin color, para ahorrar tinta).

Dos vistas del auto (frontal y trasera) con los puntos numerados por zona: círculo blanco = Bien,
círculo gris con aro grueso = Regular, círculo rojo = Atención. Debajo, una tabla por zona con lo
que requiere atención (comentario y fotos del punto) y, al final, fotos y observaciones generales.
"""
import io
import math
import unicodedata

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Image, KeepInFrame, PageBreak, Paragraph, Spacer, Table, TableStyle

from . import almacenamiento
from .pdf_diseno import ACCENT, INK, INK_2, LINE, MUTED, SOFT, esc

# ---------------------------------------------------------------------------
# Zonas (mismo criterio que el panel y la página de seguimiento)
# ---------------------------------------------------------------------------
ZONAS = {
    "di": "Rueda delantera izquierda", "dd": "Rueda delantera derecha",
    "ti": "Rueda trasera izquierda", "td": "Rueda trasera derecha",
    "faros": "Faros y direccionales", "motor": "Motor, fluidos y enfriamiento",
    "transmision": "Transmisión y tracción", "espejos": "Espejos",
    "cabina": "Cabina y sistema eléctrico", "cajuela": "Cajuela y carrocería",
    "escape": "Escape", "luces_t": "Luces traseras",
}
FRONTAL = ["faros", "motor", "di", "dd", "espejos", "cabina", "transmision"]
TRASERA = ["cajuela", "ti", "td", "luces_t", "escape"]
ORDEN = FRONTAL + TRASERA

# Puntos 3D de cada zona (x izquierda del auto, y arriba, z frente)
PUNTOS3D = {
    "di": [[1.06, 0.34, 1.38]], "dd": [[-1.06, 0.34, 1.38]],
    "ti": [[1.06, 0.34, -1.38]], "td": [[-1.06, 0.34, -1.38]],
    "faros": [[0.56, 0.5, 2.06], [-0.56, 0.5, 2.06]], "motor": [[0, 0.7, 1.45]],
    "transmision": [[0.97, 0.3, 0.1]], "espejos": [[1.08, 0.72, 0.5], [-1.08, 0.72, 0.5]],
    "cabina": [[0, 1.02, -0.15]], "cajuela": [[0, 0.82, -1.62]], "escape": [[0.35, 0.28, -2.22]],
    "luces_t": [[0.5, 0.58, -2.14], [-0.5, 0.58, -2.14]],
}


def _sin_acentos(x) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", str(x or "")) if unicodedata.category(ch) != "Mn").lower()


def zonas_de(categoria, nombre) -> list:
    import re
    c, n = _sin_acentos(categoria), _sin_acentos(nombre)
    lado = "i" if re.search(r"izquierd", n) else "d" if re.search(r"derech", n) else ""
    delantero, trasero = bool(re.search(r"delanter", n)), bool(re.search(r"traser", n))
    if re.search(r"refaccion", n) and re.search(r"llanta", n):
        return ["cajuela"]
    if c.startswith(("llantas", "frenos", "suspension")):
        if lado and trasero:
            return [f"t{lado}"]
        if lado:
            return [f"d{lado}"]
        if trasero:
            return ["ti", "td"]
        if delantero:
            return ["di", "dd"]
        return ["di", "dd"] if c.startswith("suspension") else ["di", "dd", "ti", "td"]
    if c.startswith("luces"):
        return ["faros"] if re.search(r"delanter|niebla|direccional", n) else ["luces_t"]
    if c.startswith("enfriamiento"):
        return ["cabina"] if re.search(r"aire acondicionado|compresor|cabina", n) else ["motor"]
    if c.startswith("fluidos"):
        return ["transmision"] if re.search(r"transmision|diferencial", n) else ["motor"]
    if c.startswith("transmision"):
        return [f"d{lado}"] if lado else ["transmision"]
    if c.startswith("escape"):
        return ["escape"]
    if c.startswith("bateria"):
        return ["motor"] if re.search(r"bateria|alternador|marcha|fusibles", n) else ["cabina"]
    if c.startswith("carroceria"):
        if re.search(r"espejo", n):
            return ["espejos"]
        if re.search(r"cofre", n):
            return ["motor", "cajuela"]
        if re.search(r"plumas|defensas", n):
            return ["cajuela"]
        return ["cabina"]
    return ["motor"]


GRAVEDAD = {"bien": 1, "regular": 2, "mal": 3}
ETIQUETA = {"bien": "Bien", "regular": "Regular", "mal": "Atención"}


# ---------------------------------------------------------------------------
# Geometría del auto (alambre) — port de autoGeometria.js
# ---------------------------------------------------------------------------
def _lerp(a, b, t):
    return a + (b - a) * t


def _clamp(v, a, b):
    return max(a, min(b, v))


def _cr(p0, p1, p2, p3, t):
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)


_ESTACIONES = [
    [-2.2, 0.68, 0.5], [-2.12, 0.8, 0.62], [-1.9, 0.9, 0.7], [-1.55, 0.93, 0.74], [-1.15, 0.94, 0.84],
    [-0.75, 0.94, 0.93], [-0.25, 0.93, 0.98], [0.25, 0.93, 0.97], [0.62, 0.93, 0.86], [0.95, 0.93, 0.7],
    [1.35, 0.92, 0.62], [1.75, 0.88, 0.54], [2.05, 0.8, 0.46], [2.2, 0.66, 0.38],
]


def _anillo(hw, yt):
    yb = 0.17
    ysh = min(0.58, yt - 0.04)
    c = _clamp((yt - 0.64) / 0.14, 0, 1)
    p = [
        [hw * 0.74, yb], [hw * 0.98, yb + 0.09], [hw, (yb + ysh) / 2], [hw * 0.99, ysh],
        [_lerp(hw * 0.82, hw * 0.86, c), _lerp(yt - 0.01, (0.6 + yt) / 2, c)],
        [_lerp(hw * 0.5, hw * 0.64, c), _lerp(yt, yt - 0.03, c)],
        [_lerp(hw * 0.22, hw * 0.32, c), _lerp(yt + 0.01, yt, c)],
    ]
    der = [[x, y] for x, y in p]
    izq = [[-x, y] for x, y in reversed(p)]
    return [[0, yb]] + der + [[0, yt + 0.02]] + izq


def _construir():
    densas = []
    n = len(_ESTACIONES)
    for i in range(n - 1):
        a, b, c, d = _ESTACIONES[max(i - 1, 0)], _ESTACIONES[i], _ESTACIONES[i + 1], _ESTACIONES[min(i + 2, n - 1)]
        for s in range(2):
            t = s / 2
            densas.append([_cr(a[0], b[0], c[0], d[0], t), _cr(a[1], b[1], c[1], d[1], t), _cr(a[2], b[2], c[2], d[2], t)])
    densas.append(_ESTACIONES[-1])
    anillos = [[[x, y, z] for x, y in _anillo(hw, yt)] for z, hw, yt in densas]
    L = []

    def linea(a, b, w):
        L.append((a, b, w))

    for i, pts in enumerate(anillos):
        for k, p in enumerate(pts):
            linea(p, pts[(k + 1) % len(pts)], 0.9 if i in (0, len(anillos) - 1) else 0.4)
        if i > 0:
            q = anillos[i - 1]
            for k, p in enumerate(pts):
                linea(q[k], p, 0.95 if k in (4, 6, 8, 12, 14, 1, 15) else 0.5)

    def rueda(cx, cz):
        R, r = 0.34, 0.22
        xs = [0.72, 0.98] if cx > 0 else [-0.72, -0.98]

        def circ(x, rad, w, seg=28):
            for i in range(seg):
                a0, a1 = i / seg * math.pi * 2, (i + 1) / seg * math.pi * 2
                linea([x, 0.34 + math.sin(a0) * rad, cz + math.cos(a0) * rad], [x, 0.34 + math.sin(a1) * rad, cz + math.cos(a1) * rad], w)

        for x in xs:
            circ(x, R, 0.9)
        circ(xs[1], r, 0.8)
        circ(xs[1], 0.07, 0.8, 12)
        for i in range(10):
            a = i / 10 * math.pi * 2
            linea([xs[0], 0.34 + math.sin(a) * R, cz + math.cos(a) * R], [xs[1], 0.34 + math.sin(a) * R, cz + math.cos(a) * R], 0.4)
        for i in range(5):
            a = i / 5 * math.pi * 2 + 0.3
            linea([xs[1], 0.34 + math.sin(a) * 0.07, cz + math.cos(a) * 0.07], [xs[1], 0.34 + math.sin(a) * r, cz + math.cos(a) * r], 0.8)
        for i in range(16):
            a0, a1 = math.pi * (i / 16), math.pi * ((i + 1) / 16)
            x = 0.94 if cx > 0 else -0.94
            linea([x, 0.34 + math.sin(a0) * 0.42, cz + math.cos(a0) * 0.42], [x, 0.34 + math.sin(a1) * 0.42, cz + math.cos(a1) * 0.42], 0.7)

    for z in (1.38, -1.38):
        rueda(1, z)
        rueda(-1, z)

    for s in (1, -1):
        def q(pts, w=0.9):
            for k, p in enumerate(pts):
                linea(p, pts[(k + 1) % len(pts)], w)

        q([[s * 0.34, 0.5, 2.1], [s * 0.74, 0.54, 1.96], [s * 0.78, 0.45, 1.98], [s * 0.4, 0.42, 2.12]])
        linea([s * 0.4, 0.46, 2.1], [s * 0.72, 0.5, 1.97], 0.6)
        q([[s * 0.72, 0.6, -2.08], [s * 0.2, 0.62, -2.18], [s * 0.2, 0.55, -2.19], [s * 0.74, 0.53, -2.09]])
        q([[s * 0.98, 0.7, 0.55], [s * 1.12, 0.73, 0.5], [s * 1.12, 0.66, 0.47], [s * 0.98, 0.64, 0.5]])
        linea([s * 0.99, 0.2, 0.7], [s * 0.99, 0.58, 0.7], 0.55)
        linea([s * 0.99, 0.2, -0.4], [s * 0.99, 0.6, -0.4], 0.55)
        linea([s * 0.99, 0.46, 0.45], [s * 0.99, 0.46, 0.2], 0.7)
        linea([s * 0.97, 0.19, 1.0], [s * 0.97, 0.19, -1.0], 0.7)
        linea([s * 0.5, 0.74, -1.85], [s * 0.5, 0.9, -1.98], 0.8)
        linea([s * 0.35, 0.3, -2.2], [s * 0.35, 0.22, -2.16], 0.6)
    aleron = [[-0.88, 0.9, -1.78], [0.88, 0.9, -1.78], [0.88, 0.92, -2.15], [-0.88, 0.92, -2.15]]
    for k, p in enumerate(aleron):
        linea(p, aleron[(k + 1) % 4], 0.9)
    for k in range(4):
        linea([-0.88 + k * 0.59, 0.9, -1.78], [-0.88 + k * 0.59, 0.92, -2.15], 0.4)
        linea([-0.4, 0.22 + k * 0.045, 2.2], [0.4, 0.22 + k * 0.045, 2.2], 0.55)
    for s in (-1, 1):
        for k in range(4):
            linea([s * 0.3, 0.64 - k * 0.012, 1.5 - k * 0.1], [s * 0.55, 0.62 - k * 0.012, 1.55 - k * 0.1], 0.5)
    return L


_GEO = _construir()
_PITCH = 0.42


def _proyectar(p, yaw, w, h):
    x, y, z = p
    th = math.radians(yaw)
    xr = x * math.cos(th) + z * math.sin(th)
    zr = -x * math.sin(th) + z * math.cos(th)
    yc = y - 0.45
    sy = -(yc * math.cos(_PITCH)) + zr * math.sin(_PITCH)
    zc = zr * math.cos(_PITCH) + yc * math.sin(_PITCH)
    k = min(w * 0.42, h * 0.62) * 3.7 * 1.12 / (7.5 - zc)
    return w / 2 + xr * k, h * 0.47 + sy * k, zc


# ---------------------------------------------------------------------------
# Elementos gráficos
# ---------------------------------------------------------------------------
def _marcador(c, x, y, estado, numero, radio=2.5 * mm):
    """Círculo numerado: blanco (Bien), gris con aro grueso (Regular), rojo (Atención)."""
    if estado == "mal":
        c.setFillColor(ACCENT)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(0.6)
        texto = colors.white
    elif estado == "regular":
        c.setFillColor(colors.HexColor("#d9d9dd"))
        c.setStrokeColor(INK)
        c.setLineWidth(1.5)
        texto = INK
    else:
        c.setFillColor(colors.white)
        c.setStrokeColor(INK_2)
        c.setLineWidth(0.6)
        texto = INK
    c.circle(x, y, radio, stroke=1, fill=1)
    c.setFillColor(texto)
    c.setFont("Helvetica-Bold", 6 if len(str(numero)) < 2 else 5.2)
    c.drawCentredString(x, y - 2.0, str(numero))


def _punto(c, x, y, estado):
    """Viñeta de un punto de revisión: hueca (Bien), gris con aro (Regular) o roja (Atención)."""
    if estado == "mal":
        c.setFillColor(ACCENT)
        c.setStrokeColor(ACCENT)
        c.setLineWidth(0.4)
        c.circle(x, y, 1.05 * mm, stroke=1, fill=1)
    elif estado == "regular":
        c.setFillColor(colors.HexColor("#d9d9dd"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.9)
        c.circle(x, y, 1.0 * mm, stroke=1, fill=1)
    else:
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.HexColor("#8f9096"))
        c.setLineWidth(0.45)
        c.circle(x, y, 0.85 * mm, stroke=1, fill=1)


class _Mapa(Flowable):
    """Auto en alambre al centro (vista cenital con perspectiva) y, a los lados, una tarjeta por zona
    unida con una línea a su punto en el auto."""

    YAW, PITCH = 180, 0.86
    CW = 52 * mm      # ancho de cada tarjeta
    GAP = 1.6 * mm

    def __init__(self, ancho, alto_min, zonas, estado, numero, detalle):
        super().__init__()
        self.w, self.zonas, self.estado, self.numero, self.detalle = ancho, zonas, estado, numero, detalle
        self.izq = [z for z in ("di", "motor", "espejos", "transmision", "ti") if z in zonas]
        self.der = [z for z in ("faros", "dd", "cabina", "td", "cajuela", "luces_t", "escape") if z in zonas]
        self.cartas = {z: self._carta(z) for z in zonas}
        necesario = max(self._alto_columna(self.izq), self._alto_columna(self.der))
        self.h = max(alto_min, necesario)

    # -- tarjetas ---------------------------------------------------------------
    def _carta(self, z):
        anchoTxt = self.CW - 5 * mm - 7.5 * mm
        titulo = Paragraph(f"<b>{esc(ZONAS[z])}</b>", ParagraphStyle("m_t", fontName="Helvetica-Bold", fontSize=7.2, leading=8.6, textColor=INK))
        _, ht = titulo.wrap(anchoTxt, 1000)
        ancho_linea = self.CW - 2.6 * mm - 5.4 * mm
        lineas = []   # (párrafo, alto, estado)
        for r in self.detalle[z]["todos"]:
            est = r.estado if r.estado in GRAVEDAD else "bien"
            nombre = esc(r.item.nombre_item)
            if est == "bien":
                txt = f"<font color='#3b3f46'>{nombre}</font>"
            else:
                com = f" <font color='#6d6d72'>— {esc(r.comentario)}</font>" if (r.comentario or "").strip() else ""
                txt = f"<b>{nombre}</b>{com}"
            par = Paragraph(txt, ParagraphStyle("m_p", parent=_P, fontSize=5.8, leading=6.5))
            _, hp = par.wrap(ancho_linea, 1000)
            lineas.append((par, hp, est))
        alto = 2.4 * mm + ht + 1.3 * mm + sum(hp + 0.55 * mm for _, hp, _ in lineas) + 1.2 * mm
        return {"titulo": titulo, "ht": ht, "lineas": lineas, "alto": alto}

    def _alto_columna(self, zs):
        return sum(self.cartas[z]["alto"] for z in zs) + self.GAP * max(len(zs) - 1, 0)

    # -- proyección ---------------------------------------------------------------
    def _p(self, p):
        x, y, z = p
        th = math.radians(self.YAW)
        xr = x * math.cos(th) + z * math.sin(th)
        zr = -x * math.sin(th) + z * math.cos(th)
        yc = y - 0.45
        sy = -(yc * math.cos(self.PITCH)) + zr * math.sin(self.PITCH)
        zc = zr * math.cos(self.PITCH) + yc * math.sin(self.PITCH)
        k = 7.5 / (7.5 - zc)
        return xr * k, sy * k, zc

    def _transformar(self):
        puntos = []
        for a, b, _ in _GEO:
            puntos += [self._p(a), self._p(b)]
        xs, ys = [q[0] for q in puntos], [q[1] for q in puntos]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        ancho_c = self.w - 2 * (self.CW + 7 * mm)
        s = min(ancho_c / (x1 - x0), (self.h - 2 * mm) / (y1 - y0))
        cx = self.w / 2 - (x0 + x1) / 2 * s
        cy = self.h / 2 + (y0 + y1) / 2 * s
        return lambda p: (cx + self._p(p)[0] * s, cy - self._p(p)[1] * s)

    # -- dibujo ---------------------------------------------------------------------
    def wrap(self, aw, ah):
        return self.w, self.h

    def draw(self):
        c = self.canv
        T = self._transformar()
        c.setLineCap(1)
        for a, b, peso in _GEO:
            xa, ya = T(a)
            xb, yb = T(b)
            za, zb = self._p(a)[2], self._p(b)[2]
            prof = _clamp(((za + zb) / 2 + 2.6) / 5.2, 0, 1)
            intensidad = _clamp((0.2 + 0.65 * prof) * (0.35 + 0.65 * peso), 0, 1)
            g = 1 - intensidad * 0.72
            c.setStrokeColor(colors.Color(g, g, g))
            c.setLineWidth(0.5 * (0.7 + 0.8 * peso) * (0.8 + 0.5 * prof))
            c.line(xa, ya, xb, yb)

        # Posición de cada tarjeta (columna izquierda / derecha), alineada con su punto
        ancla = {}
        for z in self.zonas:
            pts = [T(p) for p in PUNTOS3D[z]]
            lado_izq = z in self.izq
            ancla[z] = (min(pts) if lado_izq else max(pts))
        posiciones = {}
        for lado, zs in (("i", self.izq), ("d", self.der)):
            zs = sorted(zs, key=lambda z: -ancla[z][1])  # de arriba hacia abajo
            tops = []
            prev = self.h + 1
            for z in zs:
                alto = self.cartas[z]["alto"]
                deseado = self.h - ancla[z][1] - alto / 2    # distancia desde arriba
                top = max(deseado, 0 if not tops else tops[-1][1] + tops[-1][2] + self.GAP)
                tops.append([z, top, alto])
            # si se pasa del fondo, se sube lo necesario
            limite = self.h
            for k in range(len(tops) - 1, -1, -1):
                z, top, alto = tops[k]
                if top + alto > limite:
                    top = limite - alto
                    tops[k][1] = top
                limite = top - self.GAP
            for z, top, alto in tops:
                x = 0 if lado == "i" else self.w - self.CW
                posiciones[z] = (x, self.h - top - alto, alto, lado)

        # Líneas de enlace (debajo de las tarjetas)
        for z, (x, y, alto, lado) in posiciones.items():
            mx, my = ancla[z]
            est = self.estado[z]
            col = ACCENT if est == "mal" else INK_2 if est == "regular" else colors.HexColor("#b4b4b9")
            c.setStrokeColor(col)
            c.setLineWidth(0.6 if est != "bien" else 0.45)
            borde = x + self.CW if lado == "i" else x
            yc = y + alto - 3.9 * mm
            ex = borde + (4 * mm if lado == "i" else -4 * mm)
            c.line(mx, my, ex, my)
            c.line(ex, my, ex, yc)
            c.line(ex, yc, borde, yc)

        # Tarjetas
        for z, (x, y, alto, lado) in posiciones.items():
            est = self.estado[z]
            card = self.cartas[z]
            c.setFillColor(colors.white)
            c.setStrokeColor(ACCENT if est == "mal" else INK_2 if est == "regular" else colors.HexColor("#c9c9cd"))
            c.setLineWidth(0.9 if est != "bien" else 0.6)
            c.roundRect(x, y, self.CW, alto, 2.2 * mm, stroke=1, fill=1)
            _marcador(c, x + 4.4 * mm, y + alto - 3.9 * mm, est, self.numero[z], radio=2.3 * mm)
            card["titulo"].drawOn(c, x + 8.6 * mm, y + alto - 2.4 * mm - card["ht"])
            cursor = y + alto - 2.4 * mm - card["ht"] - 1.3 * mm
            for par, hp, est_p in card["lineas"]:
                cursor -= hp
                par.drawOn(c, x + 5.4 * mm, cursor)
                _punto(c, x + 3.2 * mm, cursor + hp - 2.3, est_p)
                cursor -= 0.55 * mm

        # Puntos sobre el auto
        for z in self.zonas:
            for p in PUNTOS3D[z]:
                x, y = T(p)
                _marcador(c, x, y, self.estado[z], self.numero[z], radio=2.3 * mm)


class _Leyenda(Flowable):
    def __init__(self, ancho):
        super().__init__()
        self.w = ancho

    def wrap(self, aw, ah):
        return self.w, 8 * mm

    def draw(self):
        c = self.canv
        items = [("bien", "Bien"), ("regular", "Regular"), ("mal", "Requiere atención")]
        x = self.w / 2 - 62 * mm / 2
        for est, txt in items:
            _marcador(c, x + 2 * mm, 4 * mm, est, "", radio=2 * mm)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 7.2)
            c.drawString(x + 5.6 * mm, 4 * mm - 2.4, txt)
            x += 5.6 * mm + c.stringWidth(txt, "Helvetica", 7.2) + 7 * mm


# ---------------------------------------------------------------------------
# Hoja
# ---------------------------------------------------------------------------
_P = ParagraphStyle("ia_p", fontName="Helvetica", fontSize=8, leading=10.4, textColor=INK_2)
_P_MUTED = ParagraphStyle("ia_pm", parent=_P, textColor=MUTED)
_CAB = ParagraphStyle("ia_cab", fontName="Helvetica-Bold", fontSize=6.8, leading=9, textColor=INK_2)
_PIE_VISTA = ParagraphStyle("ia_pv", fontName="Helvetica-Bold", fontSize=6.6, leading=8, textColor=MUTED, alignment=TA_CENTER)


def _spaced(texto: str) -> str:
    return f"<font>{esc(texto)}</font>"


def _miniaturas(rutas, lado=14 * mm, maximo=4):
    imgs = []
    for r in rutas[:maximo]:
        datos = almacenamiento.leer(r)
        if not datos:
            continue
        try:
            img = Image(io.BytesIO(datos))
            prop = img.imageHeight / float(img.imageWidth or 1)
            img.drawWidth, img.drawHeight = (lado, lado * prop) if prop <= 1 else (lado / prop, lado)
            imgs.append(img)
        except Exception:  # noqa: BLE001 — una foto dañada no debe impedir el documento
            continue
    if not imgs:
        return None
    t = Table([imgs], colWidths=[lado + 2 * mm] * len(imgs), hAlign="LEFT")
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
                           ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t


def _titulo(inspeccion, ancho, conteo=None, total=None):
    fecha = f"{inspeccion.fecha:%d/%m/%Y %H:%M}" if getattr(inspeccion, "fecha", None) else ""
    quien = f" · {esc(inspeccion.realizada_por)}" if getattr(inspeccion, "realizada_por", None) else ""
    derecha = [Paragraph(fecha + quien, ParagraphStyle("ia_f", fontName="Helvetica", fontSize=7.6, leading=9.5, textColor=MUTED, alignment=TA_RIGHT))]
    if conteo is not None:
        rojo = "#" + ACCENT.hexval()[2:]
        derecha.append(Paragraph(
            f"<b>{conteo['bien']}</b> Bien  ·  <b>{conteo['regular']}</b> Regular  ·  "
            f"<font color='{rojo if conteo['mal'] else '#1c1c1e'}'><b>{conteo['mal']}</b> Atención</font>  ·  {total} revisados",
            ParagraphStyle("ia_c", fontName="Helvetica", fontSize=8, leading=11, textColor=INK_2, alignment=TA_RIGHT)))
    t = Table([[
        Paragraph("INSPECCIÓN DEL VEHÍCULO", ParagraphStyle("ia_t", fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=INK)),
        derecha,
    ]], colWidths=[ancho * 0.5, ancho * 0.5])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LINEBELOW", (0, 0), (-1, 0), 1.3, INK),
    ]))
    return t


def _resumen(conteo, total, ancho):
    def celda(n, texto, color=INK):
        return [Paragraph(f"<font size='19' color='{'#' + color.hexval()[2:]}'><b>{n}</b></font>", ParagraphStyle("ia_n", fontName="Helvetica", leading=22, alignment=TA_CENTER)),
                Paragraph(texto, ParagraphStyle("ia_nl", parent=_CAB, alignment=TA_CENTER, textColor=MUTED))]

    t = Table([[celda(conteo["bien"], "BIEN"), celda(conteo["regular"], "REGULAR"),
                celda(conteo["mal"], "ATENCIÓN", ACCENT if conteo["mal"] else INK), celda(total, "REVISADOS")]],
              colWidths=[ancho / 4] * 4)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _nota(texto, ancho):
    filas = [[Paragraph(esc(ln) or "&nbsp;", ParagraphStyle("ia_nt", parent=_P, fontSize=8.6, leading=12))] for ln in (texto or "").splitlines() or ["—"]]
    t = Table(filas, colWidths=[ancho])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, 0), 7), ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
    ]))
    return t


def _evidencia(items, ancho, por_fila=5):
    lado = (ancho - 3 * mm * (por_fila - 1)) / por_fila
    celdas = []
    for num, nombre, ruta in items:
        datos = almacenamiento.leer(ruta)
        if not datos:
            continue
        try:
            img = Image(io.BytesIO(datos))
            prop = img.imageHeight / float(img.imageWidth or 1)
            img.drawWidth, img.drawHeight = (lado, lado * prop) if prop <= 1 else (lado / prop, lado)
        except Exception:  # noqa: BLE001
            continue
        cap = Paragraph(f"<b>{num}</b> · {esc(nombre)}", ParagraphStyle("ia_cap", parent=_P_MUTED, fontSize=6.4, leading=7.6))
        celdas.append([img, cap])
    if not celdas:
        return None
    filas = [celdas[i:i + por_fila] for i in range(0, len(celdas), por_fila)]
    for f in filas:
        f += [""] * (por_fila - len(f))
    t = Table(filas, colWidths=[lado + 3 * mm] * por_fila, hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
                           ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def _subtitulo(texto):
    return Paragraph(texto.upper(), ParagraphStyle("ia_s", fontName="Helvetica-Bold", fontSize=7.4, leading=9, textColor=INK))


def hoja_inspeccion_auto(inspeccion, ancho: float, alto_disponible: float) -> list:
    if not inspeccion or not inspeccion.resultados:
        return []
    resultados = [r for r in inspeccion.resultados if r.item]
    if not resultados:
        return []
    conteo = {k: sum(1 for r in resultados if r.estado == k) for k in ("bien", "regular", "mal")}
    fotos_puntos = getattr(inspeccion, "fotos_puntos_pdf", {}) or {}

    por_zona: dict = {}
    for r in sorted(resultados, key=lambda x: (x.item.categoria or "", x.item.orden or 0)):
        for z in zonas_de(r.item.categoria, r.item.nombre_item):
            por_zona.setdefault(z, []).append(r)
    zonas = [z for z in ORDEN if z in por_zona]
    numero = {z: i for i, z in enumerate(zonas, 1)}
    estado = {z: max((r.estado if r.estado in GRAVEDAD else "bien" for r in por_zona[z]), key=lambda e: GRAVEDAD[e]) for z in zonas}

    detalle = {}
    for z in zonas:
        malos = sorted([r for r in por_zona[z] if r.estado != "bien"], key=lambda r: -GRAVEDAD.get(r.estado, 0))
        detalle[z] = {"malos": malos, "todos": por_zona[z], "total": len(por_zona[z])}
    cabecera = [_titulo(inspeccion, ancho, conteo, len(resultados)), Spacer(1, 4 * mm)]
    alto_cab = sum(f.wrap(ancho, 100000)[1] for f in cabecera)
    mapa = _Mapa(ancho, alto_disponible - alto_cab - 9 * mm, zonas, estado, numero, detalle)

    # Evidencia: fotos de los puntos en Regular / Mal, con el número de su zona
    evidencia = []
    for z in zonas:
        for r in detalle[z]["malos"]:
            for ruta in fotos_puntos.get(str(r.id_item), [])[:2]:
                evidencia.append((numero[z], r.item.nombre_item, ruta))
    bloque_evidencia = _evidencia(evidencia[:12], ancho, por_fila=6) if evidencia else None

    hoja1 = cabecera + [mapa, Spacer(1, 1 * mm), _Leyenda(ancho)]

    extra = []
    if bloque_evidencia is not None:
        extra += [_subtitulo("Evidencia fotográfica"), Spacer(1, 2 * mm), bloque_evidencia, Spacer(1, 5 * mm)]
    fotos_gen = _fotos_generales(getattr(inspeccion, "fotos_pdf", []) or [], ancho)
    if fotos_gen is not None:
        extra += [_subtitulo("Fotos de la inspección"), Spacer(1, 2 * mm), fotos_gen, Spacer(1, 5 * mm)]
    if getattr(inspeccion, "comentario_general", None):
        extra += [_subtitulo("Observaciones generales"), Spacer(1, 2 * mm), _nota(inspeccion.comentario_general, ancho)]
    salida = [PageBreak(), KeepInFrame(ancho, alto_disponible, hoja1, mode="shrink")]
    if extra:
        salida += [PageBreak(), KeepInFrame(ancho, alto_disponible, [_titulo(inspeccion, ancho), Spacer(1, 5 * mm)] + extra, mode="shrink")]
    return salida


def _fotos_generales(rutas, ancho):
    return _miniaturas(rutas, lado=min(20 * mm, (ancho - 4 * mm * 4) / 5), maximo=5) if rutas else None
