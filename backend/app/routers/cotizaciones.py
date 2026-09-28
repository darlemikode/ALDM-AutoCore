"""
Cotizaciones — presupuestos sin cliente ni vehículo ligado. Sirven para
cuando alguien solo pregunta cuánto costaría algo, antes de comprometerse
a dejar el auto. A diferencia de una orden de servicio, agregar un
concepto aquí NO descuenta inventario (nada se ha usado todavía).
"""
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_permission

router = APIRouter(prefix="/api/cotizaciones", tags=["cotizaciones"])


def _get_cotizacion_o_404(db: Session, cotizacion_id: int) -> models.Cotizacion:
    cotizacion = db.query(models.Cotizacion).filter(models.Cotizacion.id_cotizacion == cotizacion_id).first()
    if not cotizacion:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    return cotizacion


def _calcular_costos(cotizacion: models.Cotizacion) -> schemas.CotizacionCostos:
    subtotal = sum(
        (d.costo_mano_obra or 0) + (d.costo_refaccion or 0) + (d.costo_extra or 0)
        for d in cotizacion.detalles
    )
    iva = subtotal * (cotizacion.iva_porcentaje or 0) / 100
    return schemas.CotizacionCostos(subtotal=round(subtotal, 2), iva=round(iva, 2), total=round(subtotal + iva, 2))


def _con_costos(cotizacion: models.Cotizacion) -> schemas.CotizacionCompletaOut:
    salida = schemas.CotizacionCompletaOut.model_validate(cotizacion)
    salida.costos = _calcular_costos(cotizacion)
    return salida


@router.get("/", response_model=list[schemas.CotizacionCompletaOut])
def listar(db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.ver"))):
    cotizaciones = db.query(models.Cotizacion).order_by(models.Cotizacion.id_cotizacion.desc()).all()
    return [_con_costos(c) for c in cotizaciones]


@router.get("/{cotizacion_id}", response_model=schemas.CotizacionCompletaOut)
def obtener(cotizacion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.ver"))):
    return _con_costos(_get_cotizacion_o_404(db, cotizacion_id))


@router.post("/", response_model=schemas.CotizacionCompletaOut, status_code=201)
def crear(payload: schemas.CotizacionIn, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.crear"))):
    cotizacion = models.Cotizacion(**payload.model_dump())
    db.add(cotizacion)
    db.commit()
    db.refresh(cotizacion)
    return _con_costos(cotizacion)


@router.put("/{cotizacion_id}", response_model=schemas.CotizacionCompletaOut)
def actualizar(cotizacion_id: int, payload: schemas.CotizacionUpdate, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.editar"))):
    cotizacion = _get_cotizacion_o_404(db, cotizacion_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(cotizacion, key, value)
    db.commit()
    return _con_costos(_get_cotizacion_o_404(db, cotizacion_id))


@router.delete("/{cotizacion_id}", status_code=204)
def eliminar(cotizacion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.eliminar"))):
    cotizacion = _get_cotizacion_o_404(db, cotizacion_id)
    db.delete(cotizacion)
    db.commit()


def consolidar_refacciones_repetidas(db: Session, cotizacion_id: int) -> None:
    """Igual que en las órdenes: una refacción repetida se suma al renglón existente."""
    detalles = (
        db.query(models.CotizacionDetalle)
        .filter(models.CotizacionDetalle.id_cotizacion == cotizacion_id, models.CotizacionDetalle.id_refaccion.isnot(None))
        .order_by(models.CotizacionDetalle.id_cotizacion_detalle)
        .all()
    )
    vistos = {}
    for d in detalles:
        base = vistos.get(d.id_refaccion)
        if base is None:
            vistos[d.id_refaccion] = d
            continue
        base.cantidad = (base.cantidad or 1) + (d.cantidad or 1)
        base.costo_mano_obra = (base.costo_mano_obra or 0) + (d.costo_mano_obra or 0)
        base.costo_refaccion = (base.costo_refaccion or 0) + (d.costo_refaccion or 0)
        base.costo_extra = (base.costo_extra or 0) + (d.costo_extra or 0)
        db.delete(d)
    db.flush()


@router.post("/{cotizacion_id}/detalles", response_model=schemas.CotizacionCompletaOut, status_code=201)
def agregar_detalle(cotizacion_id: int, payload: schemas.CotizacionDetalleIn, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.editar"))):
    _get_cotizacion_o_404(db, cotizacion_id)
    detalle = models.CotizacionDetalle(id_cotizacion=cotizacion_id, **payload.model_dump())
    db.add(detalle)
    db.flush()
    consolidar_refacciones_repetidas(db, cotizacion_id)
    db.commit()
    return _con_costos(_get_cotizacion_o_404(db, cotizacion_id))


@router.put("/{cotizacion_id}/detalles/{detalle_id}", response_model=schemas.CotizacionCompletaOut)
def actualizar_detalle(cotizacion_id: int, detalle_id: int, payload: schemas.CotizacionDetalleUpdate, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.editar"))):
    detalle = (
        db.query(models.CotizacionDetalle)
        .filter(models.CotizacionDetalle.id_cotizacion_detalle == detalle_id, models.CotizacionDetalle.id_cotizacion == cotizacion_id)
        .first()
    )
    if not detalle:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(detalle, key, value)
    db.commit()
    return _con_costos(_get_cotizacion_o_404(db, cotizacion_id))


@router.delete("/{cotizacion_id}/detalles/{detalle_id}", response_model=schemas.CotizacionCompletaOut)
def eliminar_detalle(cotizacion_id: int, detalle_id: int, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.editar"))):
    detalle = (
        db.query(models.CotizacionDetalle)
        .filter(models.CotizacionDetalle.id_cotizacion_detalle == detalle_id, models.CotizacionDetalle.id_cotizacion == cotizacion_id)
        .first()
    )
    if not detalle:
        raise HTTPException(status_code=404, detail="Detalle no encontrado")
    db.delete(detalle)
    db.commit()
    return _con_costos(_get_cotizacion_o_404(db, cotizacion_id))


@router.get("/{cotizacion_id}/pdf")
def descargar_pdf(cotizacion_id: int, db: Session = Depends(get_db), user=Depends(require_permission("cotizaciones.ver"))):
    from ..recibo_pdf import generar_cotizacion_pdf  # import diferido: evita cargar reportlab si no se usa

    cotizacion = _get_cotizacion_o_404(db, cotizacion_id)
    costos = _calcular_costos(cotizacion)
    taller = db.query(models.ConfiguracionTaller).first()
    pdf_bytes = generar_cotizacion_pdf(cotizacion, costos, taller)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cotizacion-{cotizacion.id_cotizacion}.pdf"'},
    )
