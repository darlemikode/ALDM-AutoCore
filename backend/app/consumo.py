"""
Topes de uso y excedente del plan Full Garage (Asistente IA, Agente
WhatsApp, facturación CFDI). Solo aplica a talleres cuyo paquete incluye
esos módulos (ver seed.PAQUETES_BASE); un taller sin el módulo no se
registra ni se cobra aquí.

Topes incluidos por mes: 60 consultas de IA, 80 facturas CFDI y 150
interacciones del Agente WhatsApp. Excedente: $6 por consulta/interacción
(IA o WhatsApp) y $3 por factura CFDI adicional — documentado en
claude/paquetes_precios_oct2026.md.
"""
from datetime import date, datetime

from sqlalchemy.orm import Session

from . import models
from .tenancy import taller_actual

TOPES = {"ia": 60, "cfdi": 80, "wp": 150}
PRECIO_EXCEDENTE = {"ia": 6.0, "wp": 6.0, "cfdi": 3.0}
CAMPO = {"ia": "consultas_ia", "cfdi": "facturas_cfdi", "wp": "interacciones_wp"}


def _anio_mes(hoy: date | None = None) -> str:
    hoy = hoy or date.today()
    return f"{hoy.year:04d}-{hoy.month:02d}"


def _fila_mes(db: Session, id_taller: int, anio_mes: str, crear: bool = False) -> models.ConsumoMensual | None:
    fila = (
        db.query(models.ConsumoMensual)
        .execution_options(sin_filtro_taller=True)
        .filter(models.ConsumoMensual.id_taller == id_taller, models.ConsumoMensual.anio_mes == anio_mes)
        .first()
    )
    if not fila and crear:
        fila = models.ConsumoMensual(id_taller=id_taller, anio_mes=anio_mes)
        db.add(fila)
        db.flush()
    return fila


def registrar_consumo(db: Session, tipo: str, id_taller: int | None = None, cantidad: int = 1) -> models.ConsumoMensual:
    """Suma `cantidad` al contador `tipo` ('ia' | 'cfdi' | 'wp') del mes en
    curso para el taller dado (o el de la sesión). Llamar justo después de
    que la acción se completó con éxito (consulta respondida, factura
    timbrada, mensaje de WhatsApp atendido)."""
    if tipo not in CAMPO:
        raise ValueError(f"Tipo de consumo desconocido: {tipo}")
    id_taller = id_taller or taller_actual(db)
    if not id_taller:
        raise ValueError("registrar_consumo necesita un id_taller (sesión sin taller activo).")
    fila = _fila_mes(db, id_taller, _anio_mes(), crear=True)
    setattr(fila, CAMPO[tipo], (getattr(fila, CAMPO[tipo]) or 0) + cantidad)
    fila.actualizado = datetime.utcnow()
    db.flush()
    return fila


def resumen_mes(db: Session, id_taller: int, anio_mes: str | None = None) -> dict:
    """Consumo, tope, excedente y costo del excedente de un taller en un
    mes (por defecto el actual). Para cobrar: sumar `costo_total` al
    siguiente corte de suscripción del taller."""
    anio_mes = anio_mes or _anio_mes()
    fila = _fila_mes(db, id_taller, anio_mes)
    usados = {
        "ia": fila.consultas_ia if fila else 0,
        "cfdi": fila.facturas_cfdi if fila else 0,
        "wp": fila.interacciones_wp if fila else 0,
    }
    detalle = {}
    costo_total = 0.0
    for tipo, usado in usados.items():
        excedente = max(usado - TOPES[tipo], 0)
        costo = round(excedente * PRECIO_EXCEDENTE[tipo], 2)
        costo_total += costo
        detalle[tipo] = {"usado": usado, "tope": TOPES[tipo], "excedente": excedente, "precio_unitario": PRECIO_EXCEDENTE[tipo], "costo": costo}
    return {"id_taller": id_taller, "anio_mes": anio_mes, "detalle": detalle, "costo_total": round(costo_total, 2)}
