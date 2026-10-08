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
    ACCENT, ALTO_ENCABEZADO, CARPETA_UPLOADS, E, LINE, OK, OK_SOFT, ROJO, ROJO_SOFT, WARN, WARN_SOFT,
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


def _tarjeta_categoria(categoria: str, resultados, ancho: float):
    """Bloque de una categoría: encabezado con ícono + puntos con su estado."""
    malos = sum(1 for r in resultados if r.estado == "mal")
    regulares = sum(1 for r in resultados if r.estado == "regular")
    resumen = f"{len(resultados) - malos - regulares}/{len(resultados)} bien"
    color_resumen = ROJO if malos else WARN if regulares else OK

    filas = [[
        _icono(ICONO_CATEGORIA.get(categoria.lower(), "general"), 6.5 * mm),
        Paragraph(f"<b>{esc(categoria).upper()}</b>", ParagraphStyle("ct", parent=E["seccion"], textColor=ACCENT)),
        Paragraph(f"<font color='{_hex(color_resumen)}'><b>{resumen}</b></font>", ParagraphStyle("cr", parent=E["nota"], alignment=2)),
    ]]
    estilos = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e1eff2")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 4), ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
    ]
    for r in resultados:
        texto, color, fondo, icono = ESTADO.get(r.estado, ESTADO["bien"])
        detalle = ""
        if r.comentario:
            detalle += f"<br/><font size='7' color='#6b7480'>{esc(r.comentario)}</font>"
        if r.estado == "mal" and getattr(r, "refaccion_sugerida", None):
            detalle += f"<br/><font size='7' color='{_hex(ROJO)}'><b>Cambiar:</b> {esc(r.refaccion_sugerida.nombre_refaccion)}</font>"
        filas.append([
            _icono(icono, 4.2 * mm),
            Paragraph(esc(r.item.nombre_item if r.item else "—") + detalle, ParagraphStyle("it", parent=E["celda"], fontSize=8.2, leading=10)),
            Paragraph(f"<font color='{_hex(color)}'><b>{texto.upper()}</b></font>", ParagraphStyle("st", parent=E["celda"], fontSize=7.4, alignment=TA_CENTER)),
        ])
        i = len(filas) - 1
        estilos.append(("BACKGROUND", (2, i), (2, i), fondo))
        if r.estado != "bien":
            estilos.append(("BACKGROUND", (0, i), (1, i), fondo))
    t = Table(filas, colWidths=[8.5 * mm, ancho - 8.5 * mm - 17 * mm, 17 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 2.6), ("BOTTOMPADDING", (0, 1), (-1, -1), 2.6),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, LINE),
        ("BOX", (0, 0), (-1, -1), 0.8, LINE),
    ] + estilos))
    return Sombra(t, radio=0)


def _resumen(conteo: dict, total: int, ancho: float):
    celdas, estilos = [], []
    datos = [
        ("inspeccion", "Puntos revisados", total, ACCENT, colors.HexColor("#e1eff2")),
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


def hoja_inspeccion(inspeccion, ancho: float) -> list:
    if not inspeccion or not inspeccion.resultados:
        return []
    resultados = sorted(
        inspeccion.resultados,
        key=lambda r: ((r.item.categoria if r.item else ""), (r.item.orden if r.item else 0), (r.item.nombre_item if r.item else "")),
    )
    conteo = {k: sum(1 for r in resultados if r.estado == k) for k in ESTADO}

    # Categorías repartidas en dos columnas, equilibrando la altura
    categorias = {}
    for r in resultados:
        categorias.setdefault(r.item.categoria if r.item else "Otros", []).append(r)
    columnas, altos = [[], []], [0, 0]
    ancho_col = (ancho - 5 * mm) / 2
    for categoria, lista in sorted(categorias.items(), key=lambda kv: -len(kv[1])):
        i = 0 if altos[0] <= altos[1] else 1
        columnas[i] += [_tarjeta_categoria(categoria, lista, ancho_col), Spacer(1, 3 * mm)]
        altos[i] += len(lista) + 2
    rejilla = Table([columnas], colWidths=[ancho_col + 2.5 * mm, ancho_col + 2.5 * mm])
    rejilla.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), 2.5 * mm),
        ("LEFTPADDING", (1, 0), (1, 0), 2.5 * mm), ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    contenido = []
    contenido += seccion(
        "Inspección digital del vehículo", ancho,
        derecha=f"{inspeccion.fecha:%d/%m/%Y %H:%M}" + (f" · {esc(inspeccion.realizada_por)}" if inspeccion.realizada_por else ""),
    )
    contenido += [_resumen(conteo, len(resultados), ancho), Spacer(1, 4 * mm), rejilla]

    fotos = _fotos(getattr(inspeccion, "fotos_pdf", []) or [], ancho)
    if fotos is not None:
        contenido += seccion("Fotos de la inspección", ancho)
        contenido.append(fotos)
    if inspeccion.comentario_general:
        contenido += seccion("Observaciones generales", ancho)
        contenido.append(caja_texto(inspeccion.comentario_general, ancho))

    # Siempre en una sola hoja: si no cabe, se reduce proporcionalmente
    alto_disponible = 792 - (ALTO_ENCABEZADO + 5 * mm) - 20 * mm - 6
    return [PageBreak(), KeepInFrame(ancho, alto_disponible, contenido, mode="shrink")]
