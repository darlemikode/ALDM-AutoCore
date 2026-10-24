"""
Nómina — periodos de pago y el recibo de cada empleado en ese periodo.

Al crear un periodo se generan automáticamente los recibos de todos los
empleados activos con sueldo_base > 0, copiando su sueldo vigente (así un
cambio de sueldo después no altera recibos ya generados). Cada recibo se
puede ajustar con bonos/deducciones antes de marcarlo pagado.
"""
import io
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from .. import models, nomina_calculo, schemas
from ..database import get_db
from ..auditoria import registrar as registrar_auditoria
from ..security import require_permission, verify_password

router = APIRouter(prefix="/api/nomina", tags=["nomina"])


@router.get("/periodos", response_model=list[schemas.PeriodoNominaOut])
def listar_periodos(db: Session = Depends(get_db), user=Depends(require_permission("nomina.ver"))):
    _generar_recurrentes(db)
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


def _empleados_para_nomina(db: Session):
    emps = db.query(models.Empleado).filter(models.Empleado.estatus.in_(("activo", "vacaciones", "incapacidad"))).all()
    return [e for e in emps if nomina_calculo.sueldo_mensual_de(e) > 0 or (e.porcentaje_comision or 0) > 0 or (e.esquema_pago or "fijo") == "destajo"]


def _crear_con_recibos(db: Session, periodo: models.PeriodoNomina) -> None:
    db.add(periodo)
    db.flush()  # para tener id_periodo antes de crear los recibos
    elegidos = {int(x) for x in (periodo.empleados_ids or "").split(",") if x.strip().isdigit()}
    if elegidos:
        # Selección manual: se paga a quien se eligió (aunque su periodicidad habitual sea otra)
        lista = [e for e in db.query(models.Empleado).filter(models.Empleado.id_empleado.in_(elegidos)).all()
                 if e.estatus in ("activo", "vacaciones", "incapacidad")]
    else:
        # Sin selección: todos los empleados que cobran
        lista = _empleados_para_nomina(db)
    for emp in lista:
        recibo = models.ReciboNomina(
            id_periodo=periodo.id_periodo,
            id_empleado=emp.id_empleado,
            sueldo_base=nomina_calculo.sueldo_del_periodo(emp, periodo.periodicidad),
            comisiones=nomina_calculo.calcular_comisiones(db, emp, periodo),
        )
        nomina_calculo.recalcular(recibo, emp, periodo.periodicidad)
        db.add(recibo)


def _siguiente_rango(p: models.PeriodoNomina) -> tuple[date, date]:
    inicio = p.fecha_fin + timedelta(days=1)
    if p.periodicidad == "mensual":
        # mismo día del mes siguiente - 1 día (fin de mes natural)
        mes = inicio.month % 12 + 1
        anio = inicio.year + (1 if inicio.month == 12 else 0)
        fin = date(anio, mes, 1) - timedelta(days=1) if inicio.day == 1 else inicio + timedelta(days=(p.fecha_fin - p.fecha_inicio).days)
    else:
        fin = inicio + timedelta(days=(p.fecha_fin - p.fecha_inicio).days)
    return inicio, fin


def _generar_recurrentes(db: Session) -> None:
    """Periodos recurrentes: cuando el último de la cadena ya terminó, se crea
    el siguiente (con sus recibos) hasta cubrir el día de hoy. Se ejecuta al
    consultar la nómina, sin necesidad de un proceso programado."""
    hoy = date.today()
    colas = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.recurrente == True).all()  # noqa: E712
    for cola in colas:
        for _ in range(12):  # tope de seguridad
            if cola.fecha_fin >= hoy:
                break
            inicio, fin = _siguiente_rango(cola)
            nuevo = models.PeriodoNomina(
                fecha_inicio=inicio, fecha_fin=fin, periodicidad=cola.periodicidad,
                recurrente=True, dia_pago=cola.dia_pago, empleados_ids=cola.empleados_ids,
            )
            cola.recurrente = False
            _crear_con_recibos(db, nuevo)
            cola = nuevo
    db.commit()


@router.post("/periodos", response_model=schemas.PeriodoNominaOut, status_code=201)
def crear_periodo(payload: schemas.PeriodoNominaIn, db: Session = Depends(get_db), user=Depends(require_permission("nomina.crear"))):
    if payload.fecha_fin < payload.fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha final no puede ser anterior a la inicial.")
    choque = db.query(models.PeriodoNomina).filter(
        models.PeriodoNomina.periodicidad == payload.periodicidad,
        models.PeriodoNomina.fecha_inicio <= payload.fecha_fin,
        models.PeriodoNomina.fecha_fin >= payload.fecha_inicio,
    ).first()
    if choque:
        raise HTTPException(status_code=400, detail=f"Ya existe un periodo {choque.periodicidad} del {choque.fecha_inicio} al {choque.fecha_fin} que se empalma. Si te equivocaste, edítalo (queda en Auditoría) en lugar de crear otro.")
    datos = payload.model_dump(exclude={"empleados", "motivo"})
    datos["empleados_ids"] = ",".join(str(i) for i in (payload.empleados or [])) or None
    periodo = models.PeriodoNomina(**datos)
    _crear_con_recibos(db, periodo)
    db.commit()
    db.refresh(periodo)
    return periodo


def _fin_sugerido(periodicidad: str, dia_pago: int, inicio: date) -> date:
    """Misma regla que el formulario de la app: semanal termina en el siguiente día de pago;
    quincenal el 15 o fin de mes; mensual mes natural (o hasta el día anterior del mes siguiente)."""
    if periodicidad == "semanal":
        falta = (dia_pago - inicio.weekday()) % 7 or 7
        return inicio + timedelta(days=falta)
    if periodicidad == "quincenal":
        if inicio.day <= 14:
            return date(inicio.year, inicio.month, 15)
        sig = date(inicio.year + (inicio.month == 12), inicio.month % 12 + 1, 1)
        return sig - timedelta(days=1)
    sig = date(inicio.year + (inicio.month == 12), inicio.month % 12 + 1, 1)
    if inicio.day == 1:
        return sig - timedelta(days=1)
    try:
        return date(sig.year, sig.month, inicio.day) - timedelta(days=1)
    except ValueError:
        return sig + timedelta(days=30)


@router.post("/periodos/lote")
def crear_periodos_lote(payload: schemas.PeriodoLoteIn, db: Session = Depends(get_db), user=Depends(require_permission("nomina.crear"))):
    """Crea de una vez todos los periodos que cubren un rango (mes, trimestre, semestre, año)."""
    if payload.hasta < payload.desde:
        raise HTTPException(status_code=400, detail="El rango final no puede ser anterior al inicial.")
    if payload.periodicidad not in ("semanal", "quincenal", "mensual"):
        raise HTTPException(status_code=400, detail="Periodicidad no válida.")
    dia = payload.dia_pago if payload.dia_pago is not None else 4
    existentes = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.periodicidad == payload.periodicidad).all()
    ids = ",".join(str(i) for i in (payload.empleados or [])) or None
    creados = omitidos = 0
    inicio = payload.desde
    for _ in range(150):
        if inicio > payload.hasta:
            break
        fin = _fin_sugerido(payload.periodicidad, dia, inicio)
        if any(e.fecha_inicio <= fin and e.fecha_fin >= inicio for e in existentes):
            omitidos += 1
        else:
            nuevo = models.PeriodoNomina(fecha_inicio=inicio, fecha_fin=fin, periodicidad=payload.periodicidad,
                                         recurrente=False, dia_pago=dia, empleados_ids=ids)
            _crear_con_recibos(db, nuevo)
            existentes.append(nuevo)
            creados += 1
        inicio = fin + timedelta(days=1)
    db.commit()
    return {"creados": creados, "omitidos": omitidos}


@router.post("/verificar-acceso")
def verificar_acceso(payload: schemas.SueldoVerIn, db: Session = Depends(get_db), user=Depends(require_permission("nomina.ver"))):
    """Confirma la contraseña del usuario para mostrar los montos de nómina en pantalla."""
    if not user.tiene_permiso("nomina.ver_salario") and not verify_password(payload.password or "", user.hashed_password):
        registrar_auditoria(db, user, "nomina", None, "acceso_montos_fallido", alerta="Contraseña incorrecta al mostrar montos de nómina")
        db.commit()
        raise HTTPException(status_code=403, detail="Contraseña incorrecta.")
    registrar_auditoria(db, user, "nomina", None, "acceso_montos")
    db.commit()
    return {"ok": True}


@router.post("/periodos/eliminar-futuros")
def eliminar_periodos_futuros(payload: schemas.PeriodosFuturosDel, db: Session = Depends(get_db), user=Depends(require_permission("nomina.eliminar"))):
    """Borra de una vez los periodos que aún no empiezan (y sin pagos), con motivo obligatorio y bitácora."""
    motivo = (payload.motivo or "").strip()
    if len(motivo) < 5:
        raise HTTPException(status_code=400, detail="Escribe el motivo (mínimo 5 caracteres). Queda registrado en Auditoría.")
    hoy = date.today()
    borrados = 0
    for p in db.query(models.PeriodoNomina).filter(models.PeriodoNomina.fecha_inicio > hoy).all():
        if p.status == "pagado" or any(r.pagado for r in p.recibos):
            continue
        if payload.ids is not None and p.id_periodo not in payload.ids:
            continue
        total = sum((r.total_pagar or 0) for r in p.recibos)
        registrar_auditoria(db, user, "periodo_nomina", p.id_periodo, "eliminacion_periodo", "periodo",
                            f"{p.periodicidad} {p.fecha_inicio} a {p.fecha_fin} · {len(p.recibos)} recibo(s) · ${total:,.2f}", "eliminado", motivo)
        db.delete(p)
        borrados += 1
    db.commit()
    return {"borrados": borrados}


@router.put("/periodos/{periodo_id}", response_model=schemas.PeriodoNominaOut)
def editar_periodo(periodo_id: int, payload: schemas.PeriodoNominaIn, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == periodo_id).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    if payload.fecha_fin < payload.fecha_inicio:
        raise HTTPException(status_code=400, detail="La fecha final no puede ser anterior a la inicial.")
    if periodo.status == "pagado" or any(r.pagado for r in periodo.recibos):
        # Con pagos hechos solo se puede cambiar la repetición
        periodo.recurrente = payload.recurrente
        if payload.dia_pago is not None:
            periodo.dia_pago = payload.dia_pago
        db.commit()
        db.refresh(periodo)
        return periodo
    nuevos_ids = ",".join(str(i) for i in (payload.empleados or [])) or None
    cambios = [
        ("fecha_inicio", periodo.fecha_inicio, payload.fecha_inicio),
        ("fecha_fin", periodo.fecha_fin, payload.fecha_fin),
        ("periodicidad", periodo.periodicidad, payload.periodicidad),
        ("dia_pago", periodo.dia_pago, payload.dia_pago),
        ("empleados_ids", periodo.empleados_ids, nuevos_ids),
        ("recurrente", periodo.recurrente, payload.recurrente),
    ]
    cambios = [(c, a, n) for c, a, n in cambios if str(a or "") != str(n or "")]
    # Corregir un periodo exige motivo: queda en la bitácora inmutable (campo, antes, después, quién y cuándo)
    if any(c != "recurrente" for c, _, _ in cambios):
        motivo = (payload.motivo or "").strip()
        if len(motivo) < 5:
            raise HTTPException(status_code=400, detail="Escribe el motivo de la corrección (mínimo 5 caracteres). Queda registrado en Auditoría.")
        for campo, antes, despues in cambios:
            registrar_auditoria(db, user, "periodo_nomina", periodo_id, "correccion_periodo", campo, antes, despues, motivo,
                                "Periodo de nómina corregido" if campo in ("fecha_inicio", "fecha_fin") else None)
    periodo.fecha_inicio = payload.fecha_inicio
    periodo.fecha_fin = payload.fecha_fin
    periodo.periodicidad = payload.periodicidad
    periodo.recurrente = payload.recurrente
    periodo.dia_pago = payload.dia_pago
    periodo.empleados_ids = nuevos_ids
    for r in list(periodo.recibos):
        db.delete(r)
    db.flush()
    db.expire(periodo, ["recibos"])
    _crear_con_recibos(db, periodo)
    db.commit()
    db.refresh(periodo)
    return periodo


@router.put("/periodos/{periodo_id}/recurrencia", response_model=schemas.PeriodoNominaOut)
def cambiar_recurrencia(periodo_id: int, payload: schemas.PeriodoRecurrenciaIn, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == periodo_id).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    periodo.recurrente = payload.recurrente
    if payload.dia_pago is not None:
        periodo.dia_pago = payload.dia_pago
    db.commit()
    db.refresh(periodo)
    return periodo


@router.post("/periodos/{periodo_id}/recalcular", response_model=schemas.PeriodoNominaOut)
def recalcular_periodo(periodo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    """Vuelve a traer sueldo vigente y comisiones de las órdenes cerradas, y
    recalcula los recibos aún no pagados (conserva lo capturado a mano)."""
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == periodo_id).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    # Agrega a quien aún no tiene recibo (ej. se le capturó el sueldo después de crear el periodo)
    ya = {r.id_empleado for r in periodo.recibos}
    elegidos = {int(x) for x in (periodo.empleados_ids or "").split(",") if x.strip().isdigit()}
    if elegidos:
        candidatos = [e for e in db.query(models.Empleado).filter(models.Empleado.id_empleado.in_(elegidos)).all()
                      if e.estatus in ("activo", "vacaciones", "incapacidad")]
    else:
        candidatos = _empleados_para_nomina(db)
    for emp in candidatos:
        if emp.id_empleado in ya:
            continue
        nuevo = models.ReciboNomina(id_periodo=periodo.id_periodo, id_empleado=emp.id_empleado,
                                    sueldo_base=nomina_calculo.sueldo_del_periodo(emp, periodo.periodicidad),
                                    comisiones=nomina_calculo.calcular_comisiones(db, emp, periodo))
        nomina_calculo.recalcular(nuevo, emp, periodo.periodicidad)
        db.add(nuevo)
    db.flush()
    db.refresh(periodo)
    for rec in periodo.recibos:
        if rec.pagado:
            continue
        emp = rec.empleado
        rec.sueldo_base = nomina_calculo.sueldo_del_periodo(emp, periodo.periodicidad)
        rec.comisiones = nomina_calculo.calcular_comisiones(db, emp, periodo)
        nomina_calculo.recalcular(rec, emp, periodo.periodicidad)
    db.commit()
    db.refresh(periodo)
    return periodo


@router.post("/periodos/{periodo_id}/pagar", response_model=schemas.PeriodoNominaOut)
def pagar_periodo(periodo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    """Marca como pagados todos los recibos pendientes del periodo."""
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == periodo_id).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    ahora = datetime.utcnow()
    for rec in periodo.recibos:
        if not rec.pagado:
            rec.pagado = True
            rec.fecha_pago = ahora
    periodo.status = "pagado"
    periodo.fecha_pago = ahora
    db.commit()
    db.refresh(periodo)
    return periodo


@router.get("/recibos/{recibo_id}/pdf")
def recibo_pdf(recibo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.ver"))):
    from ..recibo_nomina_pdf import generar_recibo_nomina_pdf  # import diferido

    recibo = db.query(models.ReciboNomina).filter(models.ReciboNomina.id_recibo == recibo_id).first()
    if not recibo:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    taller = db.query(models.ConfiguracionTaller).first()
    pdf = generar_recibo_nomina_pdf(recibo, recibo.empleado, recibo.periodo, taller)
    nombre = f"Nomina {recibo.empleado.nombre} {recibo.periodo.fecha_inicio:%Y-%m-%d}".encode("ascii", "ignore").decode().strip()
    return StreamingResponse(
        io.BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre}.pdf"'},
    )


@router.delete("/periodos/{periodo_id}", status_code=204)
def eliminar_periodo(periodo_id: int, motivo: str = "", db: Session = Depends(get_db), user=Depends(require_permission("nomina.eliminar"))):
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == periodo_id).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo no encontrado")
    if periodo.status == "pagado":
        raise HTTPException(status_code=400, detail="Este periodo ya se pagó, no se puede eliminar.")
    if any(r.pagado for r in periodo.recibos):
        raise HTTPException(status_code=400, detail="Este periodo tiene recibos pagados, no se puede eliminar.")
    if len((motivo or "").strip()) < 5:
        raise HTTPException(status_code=400, detail="Escribe el motivo de la eliminación (mínimo 5 caracteres). Queda registrado en Auditoría.")
    total = sum((r.total_pagar or 0) for r in periodo.recibos)
    registrar_auditoria(db, user, "periodo_nomina", periodo_id, "eliminacion_periodo", "periodo",
                        f"{periodo.periodicidad} {periodo.fecha_inicio} a {periodo.fecha_fin} · {len(periodo.recibos)} recibo(s) · ${total:,.2f}",
                        "eliminado", motivo)
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
    recibo.faltas = payload.faltas
    recibo.horas_extra = payload.horas_extra
    if payload.comisiones is not None:
        recibo.comisiones = payload.comisiones
    recibo.destajo = payload.destajo
    recibo.destajo_nota = payload.destajo_nota
    recibo.prestamo = payload.prestamo
    recibo.prestamo_nota = payload.prestamo_nota
    nomina_calculo.recalcular(recibo, recibo.empleado, recibo.periodo.periodicidad)
    db.commit()
    db.refresh(recibo)
    return recibo


@router.post("/recibos/{recibo_id}/reabrir", response_model=schemas.ReciboNominaOut)
def reabrir_recibo(recibo_id: int, db: Session = Depends(get_db), user=Depends(require_permission("nomina.editar"))):
    """Regresa un recibo pagado a pendiente (por si se marcó por error)."""
    recibo = db.query(models.ReciboNomina).filter(models.ReciboNomina.id_recibo == recibo_id).first()
    if not recibo:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    recibo.pagado = False
    recibo.fecha_pago = None
    periodo = db.query(models.PeriodoNomina).filter(models.PeriodoNomina.id_periodo == recibo.id_periodo).first()
    if periodo and periodo.status == "pagado":
        periodo.status = "abierto"
        periodo.fecha_pago = None
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
