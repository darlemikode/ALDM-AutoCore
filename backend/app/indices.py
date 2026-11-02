"""Índices extra para acelerar las consultas más usadas (filtros por cliente,
vehículo, estatus y las tablas hijas de cada orden). Se crean al iniciar y es
seguro repetirlo: solo se crea lo que falte y cualquier fallo se ignora."""
from sqlalchemy import inspect, text

from .database import engine

# (tabla, columnas). Toda consulta de un taller filtra por id_taller, así que
# varios índices son compuestos con id_taller primero.
INDICES = [
    ("servicios", ["id_cliente"]),
    ("servicios", ["id_vehiculo"]),
    ("servicios", ["status"]),
    ("servicios", ["id_servicio_original"]),
    ("servicios", ["id_taller", "status"]),
    ("servicios", ["id_taller", "fecha_entrada_servicio"]),
    ("servicios", ["id_taller", "pagado"]),
    ("servicios_detalles", ["id_servicio"]),
    ("servicios_detalles", ["id_refaccion"]),
    ("servicios_detalles", ["id_inventario_refaccion"]),
    ("servicios_abonos", ["id_servicio"]),
    ("servicios_etapa_historial", ["id_servicio"]),
    ("servicio_tipos_mantenimiento", ["id_servicio"]),
    ("danos_recepcion", ["id_servicio"]),
    ("seguimiento_ordenes", ["id_servicio"]),
    ("clientes", ["id_taller", "status_cliente"]),
    ("clientes", ["id_taller", "nombre_cliente"]),
    ("vehiculos", ["id_cliente"]),
    ("vehiculos", ["id_taller", "placas_vehiculo"]),
    ("fotos", ["entidad_tipo", "entidad_id"]),
    ("cotizaciones", ["id_cliente"]),
    ("cotizaciones", ["id_vehiculo"]),
    ("cotizaciones_detalles", ["id_cotizacion"]),
    ("refacciones_compatibilidades", ["id_refaccion"]),
    ("refacciones_proveedores", ["id_refaccion"]),
    ("inventario_refacciones", ["id_refaccion"]),
    ("citas_solicitadas", ["id_cliente"]),
    ("citas_solicitadas", ["id_vehiculo"]),
    ("citas_solicitadas", ["fecha_propuesta"]),
    ("inspecciones", ["id_vehiculo"]),
    ("inspecciones", ["id_servicio"]),
    ("inspeccion_resultados", ["id_inspeccion"]),
    ("ventas_mostrador", ["fecha"]),
    ("facturas", ["id_servicio"]),
    ("facturas", ["id_cliente"]),
]


def asegurar():
    try:
        insp = inspect(engine)
        tablas = set(insp.get_table_names())
    except Exception:
        return
    for tabla, cols in INDICES:
        if tabla not in tablas:
            continue
        try:
            existentes = {c["name"] for c in insp.get_columns(tabla)}
            if not all(c in existentes for c in cols):
                continue
            n = len(cols)
            ya = any(list(i.get("column_names") or [])[:n] == cols for i in insp.get_indexes(tabla))
            if ya:
                continue
            nombre = f"ix_{tabla}_{'_'.join(cols)}"[:120]
            with engine.begin() as con:
                con.execute(text(f"CREATE INDEX {nombre} ON {tabla} ({', '.join(cols)})"))
        except Exception:
            pass


def migrar_estatus_empleados():
    """Una vez: los empleados ya marcados como inactivos pasan a estatus "baja"."""
    try:
        with engine.begin() as con:
            con.execute(text("UPDATE empleados SET estatus='baja' WHERE activo = :f AND (estatus IS NULL OR estatus='activo')"), {"f": False})
            con.execute(text("UPDATE empleados SET estatus='activo' WHERE estatus IS NULL"))
    except Exception:
        pass
