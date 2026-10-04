"""Índices extra para acelerar las consultas más usadas (filtros por cliente,
vehículo, estatus y las tablas hijas de cada orden). Se crean al iniciar y es
seguro repetirlo: solo se crea lo que falte y cualquier fallo se ignora."""
from sqlalchemy import inspect, text

from .database import engine

INDICES = [
    ("servicios", "id_cliente"),
    ("servicios", "id_vehiculo"),
    ("servicios", "status"),
    ("servicios", "id_servicio_original"),
    ("servicios_detalles", "id_servicio"),
    ("servicios_abonos", "id_servicio"),
    ("servicios_etapa_historial", "id_servicio"),
    ("vehiculos", "id_cliente"),
    ("cotizaciones", "id_cliente"),
    ("refacciones_compatibilidades", "id_refaccion"),
    ("refacciones_proveedores", "id_refaccion"),
]


def asegurar():
    try:
        insp = inspect(engine)
        tablas = set(insp.get_table_names())
    except Exception:
        return
    for tabla, columna in INDICES:
        if tabla not in tablas:
            continue
        try:
            columnas = {c["name"] for c in insp.get_columns(tabla)}
            if columna not in columnas:
                continue
            ya = any(columna in (i.get("column_names") or [])[:1] for i in insp.get_indexes(tabla))
            if ya:
                continue
            with engine.begin() as con:
                con.execute(text(f"CREATE INDEX ix_{tabla}_{columna} ON {tabla} ({columna})"))
        except Exception:
            pass
