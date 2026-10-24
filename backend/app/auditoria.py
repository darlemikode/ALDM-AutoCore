"""Auditoría: registro inmutable de cambios sensibles y reglas de alerta.

La hora SIEMPRE es la del servidor (UTC). El reloj del equipo del usuario no
cuenta para nada que quede registrado.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from . import models

# Zonas horarias que usa el taller: UTC-8 a UTC-5 (minutos que hay que restarle a UTC)
OFFSET_MIN_MINUTOS = 300   # UTC-5
OFFSET_MAX_MINUTOS = 480   # UTC-8
OFFSET_DEFECTO = 360       # UTC-6 (Ciudad de México)
LIMITE_CAMBIO_FECHA = timedelta(hours=24)
TOLERANCIA_RELOJ = timedelta(minutes=5)


def ahora_utc() -> datetime:
    return datetime.utcnow()


def offset_valido(minutos) -> int:
    """El front manda su desfase; solo se acepta dentro de UTC-8..UTC-5."""
    try:
        m = int(minutos)
    except (TypeError, ValueError):
        return OFFSET_DEFECTO
    return m if OFFSET_MIN_MINUTOS <= m <= OFFSET_MAX_MINUTOS else OFFSET_DEFECTO


def hora_local_taller(offset_minutos=None) -> datetime:
    """Hora actual del taller según el RELOJ DEL SERVIDOR + zona horaria permitida."""
    return ahora_utc() - timedelta(minutes=offset_valido(offset_minutos))


def _txt(v) -> str | None:
    if v is None:
        return None
    return v.strftime("%Y-%m-%d %H:%M") if isinstance(v, datetime) else str(v)[:60]


def registrar(db: Session, user, entidad: str, id_entidad, accion: str, campo=None, anterior=None, nuevo=None,
              motivo=None, alerta: str | None = None) -> models.BitacoraAuditoria:
    """Agrega un renglón a la bitácora (no hace commit: se guarda junto con el cambio)."""
    reg = models.BitacoraAuditoria(
        usuario=getattr(user, "username", None), entidad=entidad, id_entidad=id_entidad, accion=accion, campo=campo,
        valor_anterior=_txt(anterior), valor_nuevo=_txt(nuevo), motivo=(motivo or None) and motivo.strip()[:300],
        sospechosa=bool(alerta), alerta=alerta,
    )
    db.add(reg)
    return reg


def alerta_cambio_fecha(campo: str, anterior: datetime | None, nuevo: datetime | None) -> str | None:
    """Reglas para marcar un cambio de fecha como sospechoso."""
    ahora = ahora_utc()
    if nuevo is None:
        return "Se borró la fecha." if anterior else None
    if anterior and abs(nuevo - anterior) > LIMITE_CAMBIO_FECHA:
        return f"La fecha se movió más de 24 horas ({_txt(anterior)} → {_txt(nuevo)})."
    if campo == "fecha_entrada_servicio" and nuevo < ahora - LIMITE_CAMBIO_FECHA:
        return "Entrada retroactiva: la fecha es de hace más de 24 horas."
    if campo == "fecha_salida_servicio" and nuevo > ahora + TOLERANCIA_RELOJ + timedelta(hours=12):
        return "La fecha de salida está en el futuro."
    return None


def alerta_cierre_repetido(db: Session, momento: datetime) -> str | None:
    """Varios cierres con la misma hora (al minuto) en las últimas 24 horas."""
    desde = momento - timedelta(hours=24)
    minuto = momento.replace(second=0, microsecond=0)
    filas = (
        db.query(models.BitacoraAuditoria)
        .filter(models.BitacoraAuditoria.accion == "cierre", models.BitacoraAuditoria.fecha >= desde)
        .all()
    )
    iguales = [f for f in filas if f.fecha.replace(second=0, microsecond=0) == minuto]
    return "Varios cierres de orden con exactamente la misma hora." if iguales else None
