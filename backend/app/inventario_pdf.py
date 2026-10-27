"""PDFs del inventario: etiquetas con código de barras, ticket de mostrador (80 mm)
y nota de venta (carta)."""
import io

from reportlab.graphics.barcode import code128
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Spacer, Paragraph

from .pdf_diseno import (
    ACCENT, INK, MUTED, ROJO, ROJO_SOFT, E, MARGEN_X, PlantillaDocumento, datos_taller, esc,
    firmas, fecha_mx, fmt, hoy_mx, seccion, tabla_conceptos, totales, aviso,
)

# ---------------------------------------------------------------------------
# Códigos de barras
# ---------------------------------------------------------------------------
PREFIJO_CODIGO = "ALDM"


def codigo_para(id_inventario: int) -> str:
    """Código interno consecutivo (Code128). Los productos con código de fábrica
    (EAN/UPC) conservan el suyo: solo se genera para los que no tienen."""
    return f"{PREFIJO_CODIGO}{id_inventario:07d}"


def _barras(valor: str, ancho_max: float, alto: float):
    """Code128 que cabe en ancho_max: se reduce el grosor de barra hasta que quepa."""
    ancho_barra = 0.5 * mm
    while True:
        b = code128.Code128(valor, barHeight=alto, barWidth=ancho_barra, quiet=False, humanReadable=False)
        if b.width <= ancho_max or ancho_barra <= 0.18 * mm:
            return b
        ancho_barra -= 0.03 * mm


def _recorta(c, texto, fuente, tam, ancho):
    texto = texto or ""
    while texto and c.stringWidth(texto, fuente, tam) > ancho:
        texto = texto[:-1]
    return texto


def _partir(c, texto, fuente, tam, ancho, max_lineas=2):
    palabras, lineas, actual = (texto or "").split(), [], ""
    for p in palabras:
        prueba = f"{actual} {p}".strip()
        if c.stringWidth(prueba, fuente, tam) <= ancho:
            actual = prueba
        else:
            if actual:
                lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    lineas = lineas[:max_lineas]
    if lineas:
        lineas[-1] = _recorta(c, lineas[-1], fuente, tam, ancho)
    return lineas


def ubicacion_texto(r) -> str:
    partes = []
    if r.almacen:
        partes.append(r.almacen)
    if r.pasillo:
        partes.append(f"Pas. {r.pasillo}")
    if r.estanteria:
        partes.append(f"Est. {r.estanteria}")
    if r.nivel:
        partes.append(f"Niv. {r.nivel}")
    if r.posicion:
        partes.append(f"Pos. {r.posicion}")
    return " · ".join(partes) or (r.ubicacion_fisica or "")


def _etiqueta(c, x, y, w, h, r, mostrar_precio, nombre_taller):
    """Una etiqueta: nombre, código de barras, código legible, ubicación y precio."""
    pad = 1.6 * mm
    nombre = (r.refaccion.nombre_refaccion if r.refaccion else "Producto")
    marca = r.marca_refaccion.nombre_marca if r.marca_refaccion else ""
    texto = f"{nombre} {marca}".strip()
    codigo = r.codigo_barras or codigo_para(r.id_inventario_refaccion)
    pequena = h < 30 * mm
    tam_nombre = 6.6 if pequena else 8
    top = y + h - pad

    c.setFillColor(INK)
    lineas = _partir(c, texto, "Helvetica-Bold", tam_nombre, w - 2 * pad, 2)
    for i, l in enumerate(lineas):
        c.setFont("Helvetica-Bold", tam_nombre)
        c.drawString(x + pad, top - tam_nombre - i * (tam_nombre + 0.8), l)
    base_texto = top - len(lineas) * (tam_nombre + 0.8) - 1

    # pie: código legible + precio/ubicación
    pie_h = 5.2 * mm if pequena else 7 * mm
    alto_barras = max(base_texto - (y + pad + pie_h) - 2.5 * mm, 5 * mm)
    b = _barras(codigo, w - 2 * pad - 2 * mm, alto_barras)
    bx = x + (w - b.width) / 2
    by = y + pad + pie_h
    b.drawOn(c, bx, by)

    c.setFont("Courier-Bold", 6.2 if pequena else 7.5)
    c.setFillColor(INK)
    c.drawCentredString(x + w / 2, by - (2.6 if pequena else 3.2) * mm, codigo)

    ubic = ubicacion_texto(r)
    c.setFont("Helvetica", 5.4 if pequena else 6.4)
    c.setFillColor(MUTED)
    c.drawString(x + pad, y + pad, _recorta(c, ubic, "Helvetica", 5.4 if pequena else 6.4, w * (0.58 if mostrar_precio else 0.95)))
    if mostrar_precio and r.preciocliente:
        c.setFont("Helvetica-Bold", 10 if pequena else 12)
        c.setFillColor(INK)
        c.drawRightString(x + w - pad, y + pad - 0.2 * mm, fmt(r.preciocliente))


def generar_etiquetas_pdf(filas, formato="50x25", mostrar_precio=True, nombre_taller=""):
    """filas: lista de (InventarioRefaccion, copias). Devuelve bytes de PDF."""
    buf = io.BytesIO()
    if formato in ("50x25", "60x40"):
        w, h = (50 * mm, 25 * mm) if formato == "50x25" else (60 * mm, 40 * mm)
        c = canvas.Canvas(buf, pagesize=(w, h))
        c.setTitle("Etiquetas")
        for r, copias in filas:
            for _ in range(max(1, copias)):
                _etiqueta(c, 0, 0, w, h, r, mostrar_precio, nombre_taller)
                c.showPage()
    else:  # carta: 3 columnas x 10 filas (tipo Avery 5160, 66.7 x 25.4 mm)
        c = canvas.Canvas(buf, pagesize=letter)
        c.setTitle("Etiquetas")
        w, h = 66.7 * mm, 25.4 * mm
        mx, my, hueco = 4.8 * mm, 12.7 * mm, 3.2 * mm
        pw, ph = letter
        pos = 0
        for r, copias in filas:
            for _ in range(max(1, copias)):
                col, fila = pos % 3, (pos // 3) % 10
                if pos and pos % 30 == 0:
                    c.showPage()
                x = mx + col * (w + hueco)
                y = ph - my - (fila + 1) * h
                _etiqueta(c, x, y, w, h, r, mostrar_precio, nombre_taller)
                pos += 1
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Ticket de mostrador (rollo de 80 mm)
# ---------------------------------------------------------------------------
def generar_ticket_pdf(venta, taller) -> bytes:
    t = datos_taller(taller)
    W = 72 * mm  # área imprimible típica de un rollo de 80 mm
    m = 3 * mm
    ancho = W - 2 * m
    fuente, tam = "Helvetica", 8

    # Se arma primero la lista de renglones para conocer el alto exacto
    c0 = canvas.Canvas(io.BytesIO())
    rn = []  # (tipo, datos)
    rn.append(("centro_b", t["nombre"], 11))
    for l in t["lineas"]:
        rn.append(("centro", l.get("izq", "") + (f"  {l['der']}" if l.get("der") else ""), 7))
    rn.append(("linea",))
    rn.append(("centro_b", f"TICKET DE VENTA #{venta.folio or venta.id_venta}", 9))
    fecha = fecha_mx(venta.fecha) or hoy_mx()
    rn.append(("centro", fecha.strftime("%d/%m/%Y %H:%M"), 7.5))
    if venta.cliente_nombre:
        rn.append(("centro", f"Cliente: {venta.cliente_nombre}", 7.5))
    if venta.atendio:
        rn.append(("centro", f"Atendió: {venta.atendio}", 7.5))
    if venta.estatus == "Cancelada":
        rn.append(("centro_b", "*** CANCELADA ***", 10))
    rn.append(("linea",))
    for d in venta.detalles:
        for l in _partir(c0, d.descripcion, "Helvetica-Bold", 8, ancho, 3):
            rn.append(("izq_b", l, 8))
        cant = f"{d.cantidad:g}"
        rn.append(("par", f"{cant} x {fmt(d.precio_unitario)}", fmt(d.importe), 8))
    rn.append(("linea",))
    rn.append(("par", "Subtotal", fmt(venta.subtotal), 8))
    if venta.descuento:
        rn.append(("par", "Descuento", "-" + fmt(venta.descuento), 8))
    rn.append(("par_b", "TOTAL", fmt(venta.total), 11))
    rn.append(("par", f"Pago: {venta.metodo_pago}", "", 8))
    if venta.recibido is not None and venta.metodo_pago == "Efectivo":
        rn.append(("par", "Recibido", fmt(venta.recibido), 8))
        rn.append(("par", "Cambio", fmt(venta.cambio), 8))
    rn.append(("linea",))
    rn.append(("centro", "¡Gracias por su compra!", 8))
    rn.append(("centro", "Conserve su ticket para cualquier aclaración", 6.5))
    rn.append(("barras", f"VM{venta.id_venta:07d}"))

    def alto_de(x):
        k = x[0]
        if k == "centro_b":
            return x[2] + 3
        if k == "centro":
            return x[2] + 2.4
        if k == "izq_b":
            return 10.5
        if k == "par":
            return x[3] + 3.4
        if k == "par_b":
            return x[3] + 5
        if k == "linea":
            return 6
        return 17 * mm  # barras

    alto = 6 * mm + sum(alto_de(x) for x in rn) + 6 * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, alto))
    c.setTitle(f"Ticket {venta.folio or venta.id_venta}")
    y = alto - 6 * mm
    for x in rn:
        k = x[0]
        y -= alto_de(x)
        if k in ("centro_b", "centro"):
            c.setFont("Helvetica-Bold" if k == "centro_b" else "Helvetica", x[2])
            c.setFillColor(INK)
            for l in _partir(c, x[1], "Helvetica-Bold" if k == "centro_b" else "Helvetica", x[2], ancho, 2) or [""]:
                c.drawCentredString(W / 2, y + 2, l)
        elif k == "izq_b":
            c.setFont("Helvetica-Bold", 8)
            c.drawString(m, y + 2, x[1])
        elif k in ("par", "par_b"):
            c.setFont("Helvetica-Bold" if k == "par_b" else "Helvetica", x[3])
            c.drawString(m, y + 2, x[1])
            c.drawRightString(W - m, y + 2, x[2])
        elif k == "linea":
            c.setDash(1, 1.5)
            c.line(m, y + 3, W - m, y + 3)
            c.setDash()
        elif k == "barras":
            b = _barras(x[1], ancho, 10 * mm)
            b.drawOn(c, (W - b.width) / 2, y + 5 * mm)
            c.setFont("Courier", 6.5)
            c.drawCentredString(W / 2, y + 1.8 * mm, x[1])
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Nota de venta (carta)
# ---------------------------------------------------------------------------
def generar_nota_venta_pdf(venta, taller) -> bytes:
    buf = io.BytesIO()
    cancelada = venta.estatus == "Cancelada"
    fecha = fecha_mx(venta.fecha) or hoy_mx()
    plantilla = PlantillaDocumento(
        taller, "Nota de venta", f"#{venta.folio or venta.id_venta:05d}",
        lineas_derecha=[f"Fecha: {fecha:%d/%m/%Y %H:%M}", f"Pago: {venta.metodo_pago}"],
        marca_agua="CANCELADA" if cancelada else None, color_marca=ROJO,
    )
    doc = plantilla.documento(buf)
    ancho = letter[0] - 2 * MARGEN_X
    story = []
    if cancelada:
        story += [aviso("Esta venta fue cancelada; las piezas regresaron al inventario.", ancho, color=ROJO, fondo=ROJO_SOFT), Spacer(1, 3 * mm)]

    story += seccion("Cliente", ancho)
    story.append(Paragraph(esc(venta.cliente_nombre or "Público en general"), E["valor"]))
    if venta.atendio:
        story.append(Paragraph(f"Atendió: {esc(venta.atendio)}", E["celda_sub"]))

    story += seccion("Productos", ancho)
    filas = []
    for d in venta.detalles:
        desc = Paragraph(esc(d.descripcion) + (f"<br/><font size=7 color='#6d6d72'>Código: {esc(d.codigo_barras)}</font>" if d.codigo_barras else ""), E["celda"])
        filas.append([desc, f"{d.cantidad:g}", fmt(d.precio_unitario), fmt(d.importe)])
    story.append(tabla_conceptos(["Descripción", "Cant.", "P. unitario", "Importe"], filas,
                                 [ancho * 0.52, ancho * 0.12, ancho * 0.18, ancho * 0.18],
                                 alinear_derecha=(2, 3), alinear_centro=(1,)))
    story.append(Spacer(1, 4 * mm))
    filas_tot = [("Subtotal", fmt(venta.subtotal))]
    if venta.descuento:
        filas_tot.append(("Descuento", "-" + fmt(venta.descuento)))
    filas_tot.append(("TOTAL", fmt(venta.total)))
    if venta.recibido is not None and venta.metodo_pago == "Efectivo":
        filas_tot.insert(len(filas_tot) - 1, ("Recibido", fmt(venta.recibido)))
    story.append(totales(filas_tot, ancho, color_final=ACCENT))
    if venta.notas:
        story += seccion("Notas", ancho)
        story.append(Paragraph(esc(venta.notas), E["celda"]))
    story += [Spacer(1, 6 * mm), firmas(["Recibí de conformidad"], ancho)]
    doc.build(story, onFirstPage=plantilla, onLaterPages=plantilla)
    return buf.getvalue()
