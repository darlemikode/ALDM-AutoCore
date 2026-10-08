"""
Cálculo de nómina (México, estimado).

Percepciones: sueldo (según esquema) - faltas + horas extra (dobles) +
comisiones por órdenes cerradas + destajo + bonos.
Deducciones: ISR (tarifa mensual art. 96 LISR 2026, proporcional al periodo)
menos subsidio al empleo, IMSS cuota obrera, préstamos/adelantos y otras.

Es un ESTIMADO operativo para el taller: no sustituye el timbrado de CFDI de
nómina ni el cálculo de un contador. Las cifras fiscales viven aquí como
constantes para actualizarlas cada año (Anexo 8 de la RMF, UMA del INEGI).
"""
from datetime import datetime, time

from sqlalchemy.orm import Session

from . import models

# --- Parámetros 2026 -------------------------------------------------------
UMA_DIARIA = 113.14
DIAS_MES = 30.4
SUBSIDIO_MENSUAL = 535.65
TOPE_SUBSIDIO_MENSUAL = 11492.66
FACTOR_INTEGRACION = 1.0493  # primer año de antigüedad (prestaciones de ley)
TOPE_SBC_UMAS = 25

# (límite inferior, cuota fija, % sobre excedente) — tarifa mensual 2026
TARIFA_MENSUAL = [
    (0.01, 0.00, 1.92),
    (844.60, 16.22, 6.40),
    (7168.52, 420.95, 10.88),
    (12598.03, 1011.68, 16.00),
    (14644.65, 1339.14, 17.92),
    (17533.65, 1856.84, 21.36),
    (35362.84, 5665.16, 23.52),
    (55736.69, 10457.09, 30.00),
    (106410.51, 25659.23, 32.00),
    (141880.67, 37009.69, 34.00),
    (425642.00, 133488.54, 35.00),
]

# Cuota obrera IMSS (% sobre SBC): dinero 0.25 + pensionados 0.375 + invalidez y vida 0.625 + cesantía y vejez 1.125
IMSS_OBRERO_SBC = 0.25 + 0.375 + 0.625 + 1.125
IMSS_OBRERO_EXCEDENTE_3UMA = 0.40

DIAS_NOMINALES = {"semanal": 7, "quincenal": 15, "mensual": 30}


def dias_nominales(periodicidad: str) -> int:
    return DIAS_NOMINALES.get((periodicidad or "quincenal").lower(), 15)


def isr_mensual(base: float) -> float:
    if base <= 0:
        return 0.0
    fila = TARIFA_MENSUAL[0]
    for f in TARIFA_MENSUAL:
        if base >= f[0]:
            fila = f
    limite, cuota, pct = fila
    return cuota + (base - limite) * pct / 100


def calcular_comisiones(db: Session, emp: models.Empleado, periodo: models.PeriodoNomina) -> float:
    """% de comisión sobre la mano de obra de las órdenes cerradas que atendió
    el empleado dentro del periodo."""
    if not emp.porcentaje_comision or (emp.esquema_pago or "fijo") not in ("comision", "mixto"):
        return 0.0
    ini = datetime.combine(periodo.fecha_inicio, time.min)
    fin = datetime.combine(periodo.fecha_fin, time.max)
    servicios = (
        db.query(models.Servicio)
        .filter(
            models.Servicio.id_empleado_responsable == emp.id_empleado,
            models.Servicio.status == "cerrado",
            models.Servicio.fecha_salida_servicio >= ini,
            models.Servicio.fecha_salida_servicio <= fin,
        )
        .all()
    )
    mano_obra = sum((d.costo_mano_obra or 0) for s in servicios for d in s.detalles)
    return round(mano_obra * emp.porcentaje_comision / 100, 2)


def recalcular(recibo: models.ReciboNomina, emp: models.Empleado, periodicidad: str) -> None:
    """Recalcula todos los importes derivados del recibo a partir de lo
    capturado (sueldo, faltas, horas extra, comisiones, destajo, bonos,
    préstamo, otras deducciones)."""
    dias = dias_nominales(periodicidad)
    esquema = (emp.esquema_pago or "fijo") if emp else "fijo"
    sueldo = (recibo.sueldo_base or 0) if esquema in ("fijo", "mixto") else 0.0
    diario = sueldo / dias if dias else 0.0

    recibo.dias_periodo = dias
    recibo.descuento_faltas = round(min((recibo.faltas or 0) * diario, sueldo), 2)
    recibo.pago_horas_extra = round((recibo.horas_extra or 0) * (diario / 8) * 2, 2)
    percepciones = (
        sueldo - recibo.descuento_faltas + recibo.pago_horas_extra
        + (recibo.comisiones or 0) + (recibo.destajo or 0) + (recibo.bonos or 0)
    )
    recibo.percepciones = round(percepciones, 2)

    isr = subsidio = imss = 0.0
    if emp and emp.aplicar_impuestos and percepciones > 0:
        diario_total = percepciones / dias
        gravable_mensual = diario_total * DIAS_MES
        isr = isr_mensual(gravable_mensual) / DIAS_MES * dias
        if gravable_mensual <= TOPE_SUBSIDIO_MENSUAL:
            subsidio = min(SUBSIDIO_MENSUAL / DIAS_MES * dias, isr)
        sbc = min(diario_total * FACTOR_INTEGRACION, TOPE_SBC_UMAS * UMA_DIARIA)
        excedente = max(sbc - 3 * UMA_DIARIA, 0)
        dias_cot = max(dias - (recibo.faltas or 0), 0)
        imss = dias_cot * (sbc * IMSS_OBRERO_SBC / 100 + excedente * IMSS_OBRERO_EXCEDENTE_3UMA / 100)
    recibo.isr = round(isr, 2)
    recibo.subsidio = round(subsidio, 2)
    recibo.imss = round(imss, 2)

    recibo.total_deducciones = round(
        (recibo.isr - recibo.subsidio) + recibo.imss + (recibo.prestamo or 0) + (recibo.deducciones or 0), 2
    )
    recibo.total_pagar = round(max(recibo.percepciones - recibo.total_deducciones, 0), 2)
