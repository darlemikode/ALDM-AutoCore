"""Utilidades para detectar que un vehículo ya está en el taller, aunque se haya
dado de alta dos veces (otro cliente / otro registro) con las mismas placas."""
import re

from sqlalchemy.orm import Session

from . import models


def placas_normalizadas(placas) -> str:
    return re.sub(r"[^A-Z0-9]", "", (placas or "").upper())


def ids_mismo_vehiculo(db: Session, id_vehiculo: int) -> list[int]:
    """El propio vehículo + cualquier otro registro con las mismas placas."""
    ids = [id_vehiculo]
    veh = db.query(models.Vehiculo).filter(models.Vehiculo.id_vehiculo == id_vehiculo).first()
    norm = placas_normalizadas(getattr(veh, "placas_vehiculo", None))
    if len(norm) >= 4:
        for v in db.query(models.Vehiculo).filter(models.Vehiculo.placas_vehiculo.isnot(None)).all():
            if v.id_vehiculo != id_vehiculo and placas_normalizadas(v.placas_vehiculo) == norm:
                ids.append(v.id_vehiculo)
    return ids


def orden_abierta_del_vehiculo(db: Session, id_vehiculo: int, excepto_servicio=None):
    q = db.query(models.Servicio).filter(
        models.Servicio.id_vehiculo.in_(ids_mismo_vehiculo(db, id_vehiculo)), models.Servicio.status == "abierto"
    )
    if excepto_servicio is not None:
        q = q.filter(models.Servicio.id_servicio != excepto_servicio)
    return q.order_by(models.Servicio.id_servicio.desc()).first()
