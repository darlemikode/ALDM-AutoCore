"""Inventario como refaccionaria: códigos de barras, entradas de stock, etiquetas
y ventas de mostrador (con ticket y nota de venta)."""
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_permission

router = APIRouter(prefix="/api/inventario", tags=["inventario"])

METODOS_PAGO = ("Efectivo", "Tarjeta", "Transferencia")


def _opciones():
    return (
        joinedload(models.InventarioRefaccion.refaccion),
        joinedload(models.InventarioRefaccion.marca_refaccion),
        selectinload(models.InventarioRefaccion.compatibilidades),
    )


def _producto_o_404(db: Session, id_inv: int) -> models.InventarioRefaccion:
    r = db.query(models.InventarioRefaccion).options(*_opciones()).filter(models.InventarioRefaccion.id_inventario_refaccion == id_inv).first()
    if not r:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return r


def _pdf(datos: bytes, nombre: str, descargar: bool = False):
    return StreamingResponse(
        io.BytesIO(datos), media_type="application/pdf",
        headers={"Content-Disposition": f'{"attachment" if descargar else "inline"}; filename="{nombre}"'},
    )


# ---- Código de barras ------------------------------------------------------------
@router.get("/codigo/{codigo}", response_model=schemas.InventarioRefaccionOut)
def buscar_por_codigo(codigo: str, db: Session = Depends(get_db), user=Depends(require_permission("inventario.ver"))):
    """Busca por lo que lee el lector: código de barras, o (si no hay) número de parte."""
    codigo = codigo.strip()
    q = db.query(models.InventarioRefaccion).options(*_opciones())
    r = q.filter(models.InventarioRefaccion.codigo_barras == codigo).first()
    if not r:
        r = q.filter(func.lower(models.InventarioRefaccion.numero_parte) == codigo.lower()).first()
    if not r:
        raise HTTPException(status_code=404, detail=f'No hay ningún producto con el código "{codigo}".')
    return r


@router.post("/{id_inv}/generar-codigo", response_model=schemas.InventarioRefaccionOut)
def generar_codigo(id_inv: int, db: Session = Depends(get_db), user=Depends(require_permission("inventario.editar"))):
    from ..inventario_pdf import codigo_para

    r = _producto_o_404(db, id_inv)
    if not r.codigo_barras:
        r.codigo_barras = codigo_para(r.id_inventario_refaccion)
        db.commit()
        db.refresh(r)
    return r


@router.post("/generar-codigos")
def generar_codigos_faltantes(db: Session = Depends(get_db), user=Depends(require_permission("inventario.editar"))):
    """Asigna código a todos los productos que aún no tienen."""
    from ..inventario_pdf import codigo_para

    pendientes = db.query(models.InventarioRefaccion).filter(
        (models.InventarioRefaccion.codigo_barras.is_(None)) | (models.InventarioRefaccion.codigo_barras == "")
    ).all()
    for r in pendientes:
        r.codigo_barras = codigo_para(r.id_inventario_refaccion)
    db.commit()
    return {"generados": len(pendientes)}


@router.post("/{id_inv}/entrada", response_model=schemas.InventarioRefaccionOut)
def entrada_stock(id_inv: int, payload: schemas.EntradaStockIn, db: Session = Depends(get_db), user=Depends(require_permission("inventario.editar"))):
    """Suma piezas al stock (recepción de mercancía, ej. escaneando cada pieza)."""
    if payload.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a cero.")
    r = _producto_o_404(db, id_inv)
    r.cantidad = (r.cantidad or 0) + int(payload.cantidad)
    if payload.costo is not None and payload.costo > 0:
        r.preciopropio = payload.costo
    db.commit()
    db.refresh(r)
    return r


# ---- Etiquetas -----------------------------------------------------------------
@router.post("/etiquetas.pdf")
def etiquetas(payload: schemas.EtiquetasIn, db: Session = Depends(get_db), user=Depends(require_permission("inventario.ver"))):
    from ..inventario_pdf import codigo_para, generar_etiquetas_pdf

    if not payload.items:
        raise HTTPException(status_code=400, detail="Elige al menos un producto.")
    if payload.formato not in ("50x25", "60x40", "carta"):
        raise HTTPException(status_code=400, detail="Formato de etiqueta no válido.")
    filas = []
    for it in payload.items:
        r = _producto_o_404(db, it.id_inventario_refaccion)
        if not r.codigo_barras:  # sin código no hay etiqueta útil: se le asigna el interno
            r.codigo_barras = codigo_para(r.id_inventario_refaccion)
        filas.append((r, min(max(it.copias, 1), 200)))
    db.commit()
    taller = db.query(models.ConfiguracionTaller).first()
    datos = generar_etiquetas_pdf(filas, payload.formato, payload.mostrar_precio, taller.nombre_taller if taller else "")
    return _pdf(datos, "etiquetas.pdf")


# ---- Ventas de mostrador --------------------------------------------------------
def _venta_o_404(db: Session, id_venta: int) -> models.VentaMostrador:
    v = db.query(models.VentaMostrador).options(selectinload(models.VentaMostrador.detalles)).filter(models.VentaMostrador.id_venta == id_venta).first()
    if not v:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return v


@router.post("/ventas", response_model=schemas.VentaMostradorOut, status_code=201)
def crear_venta(payload: schemas.VentaMostradorIn, db: Session = Depends(get_db), user=Depends(require_permission("inventario.editar"))):
    if not payload.lineas:
        raise HTTPException(status_code=400, detail="Agrega al menos un producto a la venta.")
    if payload.metodo_pago not in METODOS_PAGO:
        raise HTTPException(status_code=400, detail="Método de pago no válido.")

    # Se juntan líneas repetidas del mismo producto para validar el stock una sola vez
    pedidas: dict[int, int] = {}
    for l in payload.lineas:
        if l.cantidad <= 0:
            raise HTTPException(status_code=400, detail="Las cantidades deben ser mayores a cero.")
        pedidas[l.id_inventario_refaccion] = pedidas.get(l.id_inventario_refaccion, 0) + l.cantidad
    productos = {}
    for id_inv, cant in pedidas.items():
        r = _producto_o_404(db, id_inv)
        nombre = r.refaccion.nombre_refaccion if r.refaccion else "Producto"
        if (r.cantidad or 0) < cant:
            raise HTTPException(status_code=400, detail=f'Stock insuficiente de "{nombre}": quedan {r.cantidad or 0}, pides {cant}.')
        productos[id_inv] = r

    venta = models.VentaMostrador(
        cliente_nombre=(payload.cliente_nombre or "").strip() or None,
        id_cliente=payload.id_cliente,
        metodo_pago=payload.metodo_pago,
        notas=(payload.notas or "").strip() or None,
        id_usuario=user.id_usuario,
        atendio=user.nombre_completo,
        estatus="Pagada",
    )
    subtotal = 0.0
    for l in payload.lineas:
        r = productos[l.id_inventario_refaccion]
        precio = l.precio_unitario if l.precio_unitario is not None else (r.preciocliente or 0)
        if precio < 0:
            raise HTTPException(status_code=400, detail="El precio no puede ser negativo.")
        importe = round(precio * l.cantidad, 2)
        subtotal += importe
        nombre = r.refaccion.nombre_refaccion if r.refaccion else "Producto"
        marca = f" {r.marca_refaccion.nombre_marca}" if r.marca_refaccion else ""
        venta.detalles.append(models.VentaMostradorDetalle(
            id_inventario_refaccion=r.id_inventario_refaccion, descripcion=f"{nombre}{marca}",
            codigo_barras=r.codigo_barras, cantidad=l.cantidad, precio_unitario=precio,
            costo_unitario=r.preciopropio or 0, importe=importe,
        ))
    subtotal = round(subtotal, 2)
    descuento = min(max(payload.descuento or 0, 0), subtotal)
    venta.subtotal, venta.descuento, venta.total = subtotal, round(descuento, 2), round(subtotal - descuento, 2)
    if payload.metodo_pago == "Efectivo":
        recibido = payload.recibido if payload.recibido is not None else venta.total
        if recibido + 1e-9 < venta.total:
            raise HTTPException(status_code=400, detail="El efectivo recibido no alcanza para cubrir el total.")
        venta.recibido, venta.cambio = round(recibido, 2), round(recibido - venta.total, 2)

    ultimo = db.query(func.max(models.VentaMostrador.folio)).scalar() or 0
    venta.folio = ultimo + 1
    for id_inv, cant in pedidas.items():
        productos[id_inv].cantidad = (productos[id_inv].cantidad or 0) - cant
    db.add(venta)
    db.commit()
    db.refresh(venta)
    return venta


@router.get("/ventas", response_model=list[schemas.VentaMostradorOut])
def listar_ventas(limite: int = 100, q: Optional[str] = None, db: Session = Depends(get_db), user=Depends(require_permission("inventario.ver"))):
    query = db.query(models.VentaMostrador).options(selectinload(models.VentaMostrador.detalles))
    if q and q.strip().isdigit():
        query = query.filter(models.VentaMostrador.folio == int(q.strip()))
    return query.order_by(models.VentaMostrador.id_venta.desc()).limit(min(max(limite, 1), 500)).all()


@router.get("/ventas/{id_venta}", response_model=schemas.VentaMostradorOut)
def obtener_venta(id_venta: int, db: Session = Depends(get_db), user=Depends(require_permission("inventario.ver"))):
    return _venta_o_404(db, id_venta)


@router.post("/ventas/{id_venta}/cancelar", response_model=schemas.VentaMostradorOut)
def cancelar_venta(id_venta: int, db: Session = Depends(get_db), user=Depends(require_permission("inventario.eliminar"))):
    v = _venta_o_404(db, id_venta)
    if v.estatus == "Cancelada":
        raise HTTPException(status_code=400, detail="La venta ya está cancelada.")
    for d in v.detalles:
        if d.id_inventario_refaccion:
            r = db.query(models.InventarioRefaccion).filter(models.InventarioRefaccion.id_inventario_refaccion == d.id_inventario_refaccion).first()
            if r:
                r.cantidad = (r.cantidad or 0) + int(round(d.cantidad))
    v.estatus = "Cancelada"
    db.commit()
    db.refresh(v)
    return v


@router.get("/ventas/{id_venta}/ticket.pdf")
def ticket(id_venta: int, db: Session = Depends(get_db), user=Depends(require_permission("inventario.ver"))):
    from ..inventario_pdf import generar_ticket_pdf

    v = _venta_o_404(db, id_venta)
    taller = db.query(models.ConfiguracionTaller).first()
    return _pdf(generar_ticket_pdf(v, taller), f"Ticket {v.folio or v.id_venta}.pdf")


@router.get("/ventas/{id_venta}/nota.pdf")
def nota(id_venta: int, db: Session = Depends(get_db), user=Depends(require_permission("inventario.ver"))):
    from ..inventario_pdf import generar_nota_venta_pdf

    v = _venta_o_404(db, id_venta)
    taller = db.query(models.ConfiguracionTaller).first()
    return _pdf(generar_nota_venta_pdf(v, taller), f"Nota de venta {v.folio or v.id_venta}.pdf")
