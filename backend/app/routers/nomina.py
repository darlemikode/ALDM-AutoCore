"""
Nómina — periodos de pago y el recibo de cada empleado en ese periodo.

Al crear un periodo se generan automáticamente los recibos de todos los
empleados activos con sueldo_base > 0, copiando su sueldo vigente (así un
cambio de sueldo después no altera recibos ya generados). Cada recibo se
puede ajustar con bonos/deducciones antes de marcarlo pagado.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..security import require_permission

router = APIRouter(prefix="/api/nomina", tags=["nomina"])


@router.get("/periodos", response_model=list[schemas.PeriodoNominaOut])
def listar_periodos(db: Session = Depends(get_db), user=Depends(require_permission("nomina.ver"))):
    return (
        db.query(models.PeriodoNomina)
        .options(joinedload(models.PeriodoNomina.recibos).joinedload(models.ReciboNomina.empleado))
        .order_by(models.PeriodoNomina.fecha_inicio.desc())
        .all()
    )


@router.get("/periodos/{periodo_id}", response_model=schemas.PeriodoNominaOut)
def obtener_periodo(periodo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.ver"))):
    periodo = (
        db.query(models.PeriodoNomina)
        .options(joinedload(models.PeriodoNomina.recibos).joinedload(models.ReciboNomina.empleado))
        .filter(models.PeriodoNomina.id_periodo == periodo_id)
        .first()
    )
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    return periodo


@router.post("/periodos", response_model=schemas.PeriodoNominaOut, status_code=201)
def crear_periodo(payload: schemas.PeriodoNominaIn, db: Session = Depends(get_db), user=Depends(require_permission("nomina.crear"))):
    periodo = models.PeriodoNomina(**payload.model_dump())
    db.add(periodo)
    db.flush()  # para tener id_periodo antes de crear los recibos

    empleados = (
        db.query(models.Empleado)
        .filter(models.Empleado.activo == True, models.Empleado.sueldo_base > 0)  # noqa: E712
        .all()
    )
    for emp in empleados:
        db.add(models.ReciboNomina(
            id_periodo=periodo.id_periodo,
            id_empleado=emp.id_empleado,
            sueldo_base=emp.sueldo_base,
            total_pagar=emp.sueldo_base,
        ))

    db.commit()
    db.refresh(periodo)
    return periodo


@router.delete("/periodos/{periodo_id}", status_code=204)
def eliminar_periodo(periodo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.eliminar"))):
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == periodo_id).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    if periodo.status == "pagado":
        raise HTTPException(status_code=400, detail="Este periodo ya se pagó, no se puede eliminar.")
    db.delete(periodo)
    db.commit()
    return None


@router.put("/recibos/{recibo_id}", response_model=schemas.ReciboNominaOut)
def actualizar_recibo(recibo_id: int, payload: schemas.ReciboNominaUpdate, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    recibo = db.query(models.ReciboNomina).filter(models.ReciboNomina.id_recibo == recibo_id).first()
    if not recibo:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    if recibo.pagado:
        raise HTTPException(status_code=400, detail="Este recibo ya está pagado, no se puede editar.")
    recibo.bonos = payload.bonos
    recibo.bonos_nota = payload.bonos_nota
    recibo.deducciones = payload.deducciones
    recibo.deducciones_nota = payload.deducciones_nota
    recibo.total_pagar = (recibo.sueldo_base or 0) + (payload.bonos or 0) - (payload.deducciones or 0)
    db.commit()
    db.refresh(recibo)
    return recibo


@router.post("/recibos/{recibo_id}/pagar", response_model=schemas.ReciboNominaOut)
def pagar_recibo(recibo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    recibo = db.query(models.ReciboNomina).filter(models.ReciboNomina.id_recibo == recibo_id).first()
    if not recibo:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    recibo.pagado = True
    recibo.fecha_pago = datetime.utcnow()
    db.commit()

    # Si ya no queda ningún recibo pendiente en el periodo, se cierra solo.
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == recibo.id_periodo).first()
    pendientes = db.query(models.ReciboNomina).filter(
        models.ReciboNomina.id_periodo == periodo.id_periodo,
        models.ReciboNomina.pagado == False,  # noqa: E712
    ).count()
    if pendientes == 0:
        periodo.status = "pagado"
        periodo.fecha_pago = datetime.utcnow()
        db.commit()

    db.refresh(recibo)
    return recibo
