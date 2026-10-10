"""Crea las tablas (si no existen) y siembra datos base:
- Catálogo completo de permisos (por módulo: ver/crear/editar/eliminar)
- Los 4 roles de la jerarquía del taller (Administrador General, Jefe de
  Taller / Receptor, Asesor de Servicio / Caja, Técnico / Mecánico) con sus
  permisos por defecto, más el mecanismo para roles personalizados
- Un usuario "Administrador General" (tomado de las variables de entorno
  ADMIN_USERNAME / ADMIN_PASSWORD)
- Catálogo geográfico de México (32 estados) y tipos de servicio comunes

Se ejecuta automáticamente al iniciar la app (ver main.py) y también puede
correrse manualmente con: python -m app.seed
"""
import os

from sqlalchemy import UniqueConstraint, inspect, text

from .database import Base, engine, SessionLocal, es_sqlite, sesion_global

es_mssql = engine.dialect.name == "mssql"
from .tenancy import MODO_TALLER, TenantMixin, fijar_tenant
from . import models
from .security import hash_password

# --- Catálogo de permisos ---------------------------------------------------
# (clave, módulo, descripción). Los módulos con las 4 acciones estándar se
# generan con _crud(); "roles" es especial (solo ver/editar, no tiene "crear
# instancias sueltas" en el mismo sentido).
def _crud(modulo: str, etiqueta: str):
    return [
        (f"{modulo}.ver", modulo, f"Ver {etiqueta}"),
        (f"{modulo}.crear", modulo, f"Crear {etiqueta}"),
        (f"{modulo}.editar", modulo, f"Editar {etiqueta}"),
        (f"{modulo}.eliminar", modulo, f"Eliminar {etiqueta}"),
    ]


PERMISOS = (
    _crud("clientes", "clientes")
    + _crud("vehiculos", "vehículos")
    + _crud("servicios", "órdenes de servicio (incluye agregar conceptos/abonos y cerrar)")
    + _crud("cotizaciones", "cotizaciones / presupuestos")
    + _crud("refacciones", "refacciones (catálogo y precios)")
    + _crud("inventario", "inventario y punto de venta (stock por vehículo y venta en mostrador)")
    + _crud("herramientas", "herramientas (inventario)")
    + _crud("proveedores", "proveedores y sus deudas")
    + _crud("catalogos", "catálogos generales (marcas, modelos, colores, tipos de servicio, países/estados/ciudades)")
    + _crud("usuarios", "usuarios del sistema")
    + _crud("promociones", "promociones que ven los clientes en su app")
    + _crud("empleados", "catálogo de empleados del taller (datos personales y asignación como responsables)")
    + _crud("nomina", "nómina (sueldos, periodos de pago y recibos de los empleados)")
    + [
        ("configuracion.editar", "configuracion", "Editar los datos del taller que aparecen en los documentos (recibo, nota de remisión)"),
        ("roles.ver", "roles", "Ver roles y sus permisos"),
        ("roles.editar", "roles", "Crear/editar/eliminar roles y asignar permisos"),
        ("facturacion.ver", "facturacion", "Ver facturas emitidas y descargar PDF/XML"),
        ("facturacion.crear", "facturacion", "Emitir (timbrar) facturas CFDI 4.0"),
        ("facturacion.cancelar", "facturacion", "Cancelar facturas ante el SAT"),
        ("facturacion.configurar", "facturacion", "Configurar datos fiscales del emisor y el PAC"),
        ("dashboard.ver_por_cobrar", "dashboard", "Ver el total por cobrar (saldo pendiente de clientes) en el panel"),
        ("servicios.ver_precios", "servicios", "Ver los montos y precios (total, pagado, saldo) de las órdenes de servicio"),
    ]
)

# --- Roles base de la jerarquía del taller ----------------------------------
PERMISOS_ADMIN_GENERAL = [clave for clave, _, _ in PERMISOS]  # todo

PERMISOS_JEFE_TALLER = [
    "dashboard.ver_por_cobrar",
    "servicios.ver_precios",
    "clientes.ver", "clientes.editar",
    "vehiculos.ver", "vehiculos.crear", "vehiculos.editar", "vehiculos.eliminar",
    "servicios.ver", "servicios.crear", "servicios.editar", "servicios.eliminar",
    "cotizaciones.ver", "cotizaciones.crear", "cotizaciones.editar", "cotizaciones.eliminar",
    "refacciones.ver", "refacciones.crear", "refacciones.editar", "refacciones.eliminar",
    "inventario.ver", "inventario.crear", "inventario.editar", "inventario.eliminar",
    "herramientas.ver", "herramientas.editar",
    "proveedores.ver", "proveedores.editar",
    "catalogos.ver", "catalogos.crear", "catalogos.editar", "catalogos.eliminar",
    "promociones.ver", "promociones.crear", "promociones.editar", "promociones.eliminar",
]

PERMISOS_ASESOR_SERVICIO = [
    "dashboard.ver_por_cobrar",
    "servicios.ver_precios",
    "clientes.ver",
    "vehiculos.ver",
    "servicios.ver", "servicios.crear", "servicios.editar",
    "cotizaciones.ver", "cotizaciones.crear", "cotizaciones.editar",
    "refacciones.ver", "inventario.ver",
]

# El rol "Técnico / Mecánico" es el más angosto de todos: no administra nada
# del taller, solo necesita ver las órdenes que tiene asignadas (su propio
# dashboard personal es un endpoint aparte que no depende de ningún
# permiso — cualquier usuario ligado a un empleado lo puede ver).
PERMISOS_TECNICO = [
    "servicios.ver",
]

# --- Módulos del sistema y paquetes de suscripción (super administración) --
# Mismo catálogo de 8 módulos que se muestra en la página pública de
# módulos — clave estable para referenciarlos desde cada paquete.
MODULOS_SISTEMA = [
    ("ordenes_servicio", "Órdenes de servicio", "Recepción, diagnóstico, avance, cobro y cierre de cada servicio.", "🔧", 1),
    ("cotizaciones", "Cotizaciones", "Presupuestos para el cliente antes de abrir la orden.", "🧾", 2),
    ("clientes_vehiculos", "Clientes y vehículos", "Historial completo por cliente y por vehículo.", "🧑", 3),
    ("refacciones", "Refacciones", "Catálogo de refacciones, marcas, categorías y precios. Es la base del inventario.", "🔩", 4),
    ("inventario", "Inventario y punto de venta", "Stock, compatibilidad por vehículo y venta en mostrador. Requiere Refacciones.", "📦", 5),
    ("herramientas", "Herramientas", "Inventario de herramientas del taller.", "🛠️", 6),
    ("proveedores", "Proveedores", "Catálogo de proveedores, compras y deuda.", "🚚", 7),
    ("catalogos", "Catálogos", "Administrar marcas, modelos, colores, tipos de servicio y categorías propias.", "🗂️", 8),
    ("empleados", "Empleados", "Personal del taller y responsables de cada orden.", "🪪", 9),
    ("nomina", "Nómina", "Sueldos, periodos de pago y recibos.", "👷", 10),
    ("roles_permisos", "Roles y permisos", "Control fino de qué puede hacer cada usuario.", "🛡️", 11),
    ("reportes", "Reportes", "Indicadores del negocio y saldo por cobrar.", "📊", 12),
    ("app_movil", "App para clientes", "App para que los clientes den seguimiento a su vehículo, promociones y citas.", "📱", 13),
    ("facturacion", "Facturación electrónica", "Emisión y cancelación de CFDI 4.0 desde las órdenes de servicio.", "💳", 14),
]

# Módulos que antes venían "dentro" de otro: al crearse por primera vez se
# agregan a los paquetes que ya tenían el módulo padre (o a todos, si antes
# no dependían de ningún módulo), para que ningún taller pierda funciones.
MODULOS_HEREDADOS = {
    "cotizaciones": "ordenes_servicio",
    "herramientas": "inventario",
    "refacciones": "inventario",
    "catalogos": None,
    "empleados": None,
}

# Paquetes base (precios oct-2026: $599 / $899 / $1,199 al mes + IVA). El
# súper administrador puede editarlos o crear otros desde su app.
PAQUETES_BASE = [
    ("Arranque", "Para el taller que va empezando: órdenes, cotizaciones, clientes y refacciones.", 599.0,
     ["ordenes_servicio", "cotizaciones", "clientes_vehiculos", "refacciones"]),
    ("Taller Pro", "El más contratado: suma inventario y punto de venta, proveedores, herramientas, empleados y reportes.", 899.0,
     ["ordenes_servicio", "cotizaciones", "clientes_vehiculos", "refacciones", "inventario", "herramientas",
      "proveedores", "catalogos", "empleados", "reportes"]),
    ("Full Garage", "Todo el sistema: nómina, roles y permisos, facturación electrónica y la app para tus clientes.", 1199.0,
     [c for c, *_ in MODULOS_SISTEMA]),
]
# Nombres anteriores de cada paquete (para actualizar sin duplicar)
NOMBRES_ANTERIORES = {
    "Arranque": ["Básico"],
    "Taller Pro": ["Profesional"],
    "Full Garage": ["Premium"],
}
# Al subir este número, al arrancar se vuelven a aplicar PAQUETES_BASE a los
# paquetes existentes (nombre, precio, descripción y módulos). Una sola vez por versión.
VERSION_PAQUETES = 3

ROLES_BASE = [
    ("Administrador General", "Acceso total al sistema.", PERMISOS_ADMIN_GENERAL),
    ("Jefe de Taller / Receptor", "Administra catálogos, promociones y vehículos/servicios/refacciones por completo; clientes, herramientas y proveedores en modo lectura/escritura (sin eliminar).", PERMISOS_JEFE_TALLER),
    ("Asesor de Servicio / Caja", "Da de alta órdenes de servicio y captura cobros; consulta clientes, vehículos y refacciones en solo lectura.", PERMISOS_ASESOR_SERVICIO),
    ("Técnico / Mecánico", "Solo ve las órdenes de servicio asignadas y su propio dashboard de trabajo — no administra nada del taller.", PERMISOS_TECNICO),
]

# Checklist estándar de inspección digital — el dueño puede desactivar
# puntos que no use desde el catálogo, no hace falta tocar código.
ITEMS_INSPECCION = {
    "Llantas": ["Presión y/o sensor de presión"],
    "Frenos": ["Balatas delanteras", "Balatas traseras", "Líquido de frenos"],
    "Luces": ["Faros delanteros", "Luces traseras", "Direccionales", "Luz de freno", "Luz de reversa"],
    "Fluidos": ["Nivel de aceite de motor", "Anticongelante/refrigerante", "Líquido limpiaparabrisas", "Líquido de dirección hidráulica"],
    "Batería y eléctrico": ["Batería (carga y terminales)", "Alternador", "Marcha"],
    "Suspensión y dirección": ["Amortiguadores delanteros", "Amortiguadores traseros", "Rótulas y terminales"],
    "Carrocería": ["Limpiaparabrisas", "Espejos", "Cinturones de seguridad"],
}

ESTADOS_MEXICO = [
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
    "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
    "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
    "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
    "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
]

# Al menos la capital de cada estado (y León, GTO, porque es con lo que se
# probó el catálogo de códigos postales) — así el autollenado por CP
# siempre tiene una ciudad real que hacer match.
CIUDADES_POR_ESTADO = {
    "Aguascalientes": ["Aguascalientes"], "Baja California": ["Mexicali", "Tijuana"],
    "Baja California Sur": ["La Paz"], "Campeche": ["Campeche"], "Chiapas": ["Tuxtla Gutiérrez"],
    "Chihuahua": ["Chihuahua", "Ciudad Juárez"], "Ciudad de México": ["Ciudad de México"],
    "Coahuila": ["Saltillo"], "Colima": ["Colima"], "Durango": ["Durango"],
    "Estado de México": ["Toluca", "Ecatepec"], "Guanajuato": ["Guanajuato", "León"],
    "Guerrero": ["Chilpancingo", "Acapulco"], "Hidalgo": ["Pachuca"],
    "Jalisco": ["Guadalajara", "Zapopan", "Tlaquepaque"], "Michoacán": ["Morelia"],
    "Morelos": ["Cuernavaca"], "Nayarit": ["Tepic"], "Nuevo León": ["Monterrey", "San Nicolás"],
    "Oaxaca": ["Oaxaca de Juárez"], "Puebla": ["Puebla"], "Querétaro": ["Querétaro"],
    "Quintana Roo": ["Chetumal", "Cancún"], "San Luis Potosí": ["San Luis Potosí"],
    "Sinaloa": ["Culiacán"], "Sonora": ["Hermosillo"], "Tabasco": ["Villahermosa"],
    "Tamaulipas": ["Ciudad Victoria", "Reynosa"], "Tlaxcala": ["Tlaxcala"],
    "Veracruz": ["Xalapa", "Veracruz"], "Yucatán": ["Mérida"], "Zacatecas": ["Zacatecas"],
}


def _sincronizar_columnas_faltantes():
    """create_all() únicamente crea TABLAS nuevas, nunca altera una que ya
    existe. Sin esto, cada vez que se agrega un campo a un modelo cualquier
    consulta a esa tabla truena con "no such column" hasta que alguien borra
    la base de datos a mano. Esto lo hace automático, sin perder datos
    (SQLite y Postgres)."""
    tipos_sqlite = {
        "INTEGER": "INTEGER", "SMALLINT": "INTEGER", "BIGINT": "INTEGER",
        "BOOLEAN": "BOOLEAN", "VARCHAR": "TEXT", "TEXT": "TEXT",
        "FLOAT": "FLOAT", "NUMERIC": "FLOAT", "DATETIME": "DATETIME", "DATE": "DATE",
    }
    inspector = inspect(engine)
    tablas_existentes = set(inspector.get_table_names())
    with engine.connect() as conn:
        for tabla in Base.metadata.sorted_tables:
            if tabla.name not in tablas_existentes:
                continue  # tabla nueva por completo — ya la creó create_all()
            columnas_actuales = {c["name"] for c in inspector.get_columns(tabla.name)}
            for columna in tabla.columns:
                if columna.name in columnas_actuales:
                    continue
                if es_sqlite:
                    tipo_sql = tipos_sqlite.get(columna.type.__class__.__name__.upper(), "TEXT")
                else:
                    tipo_sql = columna.type.compile(dialect=engine.dialect)
                default_sql = ""
                if columna.default is not None and getattr(columna.default, "is_scalar", False):
                    valor = columna.default.arg
                    if isinstance(valor, bool):
                        default_sql = f" DEFAULT {int(valor)}" if (es_sqlite or es_mssql) else f" DEFAULT {'TRUE' if valor else 'FALSE'}"
                    elif isinstance(valor, (int, float)):
                        default_sql = f" DEFAULT {valor}"
                    elif isinstance(valor, str):
                        default_sql = " DEFAULT '" + valor.replace("'", "''") + "'"
                agregar = "ADD" if es_mssql else "ADD COLUMN"  # SQL Server no acepta "ADD COLUMN"
                conn.execute(text(f'ALTER TABLE "{tabla.name}" {agregar} "{columna.name}" {tipo_sql}{default_sql}'))
                print(f"[migración automática] agregada columna faltante: {tabla.name}.{columna.name}")
        conn.commit()


# Restricciones que cambiaron al pasar a multi-taller: lo que antes era
# único en todo el sistema ahora es único POR TALLER (dos talleres pueden
# tener un rol "Administrador General" o atender el mismo VIN).
_UNICOS_VIEJOS = {
    "roles": ["nombre"],
    "vehiculos": ["numserie_vehiculo"],
    "refacciones_categorias": ["nombre_categoria"],
}


def _necesita_ajuste(inspector, tabla: str) -> bool:
    if tabla == "usuarios":
        return any(c["name"] == "id_rol" and not c["nullable"] for c in inspector.get_columns("usuarios"))
    viejo = _UNICOS_VIEJOS[tabla]
    return any(u["column_names"] == viejo for u in inspector.get_unique_constraints(tabla))


def _reconstruir_tabla_sqlite(conn, tabla):
    """SQLite no permite quitar una restricción UNIQUE ni un NOT NULL con
    ALTER TABLE: se crea la tabla nueva con la definición actual del modelo,
    se copian los datos y se reemplaza (procedimiento oficial de SQLite)."""
    from sqlalchemy.schema import CreateTable

    temporal = f"{tabla.name}__nueva"
    ddl = str(CreateTable(tabla).compile(dialect=engine.dialect)).strip()
    ddl = ddl.replace(f"CREATE TABLE {tabla.name} ", f"CREATE TABLE {temporal} ", 1)
    columnas_actuales = [c["name"] for c in inspect(conn).get_columns(tabla.name)]
    comunes = ", ".join(f'"{c.name}"' for c in tabla.columns if c.name in columnas_actuales)
    conn.execute(text("PRAGMA foreign_keys=OFF"))
    conn.execute(text(f'DROP TABLE IF EXISTS "{temporal}"'))
    conn.execute(text(ddl))
    conn.execute(text(f'INSERT INTO "{temporal}" ({comunes}) SELECT {comunes} FROM "{tabla.name}"'))
    conn.execute(text(f'DROP TABLE "{tabla.name}"'))
    conn.execute(text(f'ALTER TABLE "{temporal}" RENAME TO "{tabla.name}"'))
    for indice in tabla.indexes:
        indice.create(conn, checkfirst=True)


def _ajustar_restricciones():
    # Las bases viejas (antes de multi-taller) solo existieron en SQLite/Postgres.
    # En SQL Server la base nace nueva con las restricciones correctas, y además
    # su dialecto no implementa get_unique_constraints().
    if es_mssql:
        return
    inspector = inspect(engine)
    existentes = set(inspector.get_table_names())
    pendientes = [t for t in list(_UNICOS_VIEJOS) + ["usuarios"] if t in existentes and _necesita_ajuste(inspector, t)]
    if not pendientes:
        return
    with engine.connect() as conn:
        for nombre in pendientes:
            tabla = Base.metadata.tables[nombre]
            if es_sqlite:
                _reconstruir_tabla_sqlite(conn, tabla)
            else:
                if nombre == "usuarios":
                    conn.execute(text('ALTER TABLE usuarios ALTER COLUMN id_rol DROP NOT NULL'))
                else:
                    for u in inspect(conn).get_unique_constraints(nombre):
                        if u["column_names"] == _UNICOS_VIEJOS[nombre] and u["name"]:
                            conn.execute(text(f'ALTER TABLE "{nombre}" DROP CONSTRAINT "{u["name"]}"'))
                    for restriccion in tabla.constraints:
                        if isinstance(restriccion, UniqueConstraint) and restriccion.name:
                            cols = ", ".join(f'"{c.name}"' for c in restriccion.columns)
                            conn.execute(text(f'ALTER TABLE "{nombre}" ADD CONSTRAINT "{restriccion.name}" UNIQUE ({cols})'))
            print(f"[migración automática] restricciones ajustadas para multi-taller: {nombre}")
        if es_sqlite:
            conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()


def _vin_unico_filtrado():
    """SQL Server trata NULL como un valor en un UNIQUE: solo dejaba un
    vehículo sin VIN por taller. Se cambia por un índice único filtrado
    (solo cuando hay VIN) y se limpian los VIN vacíos."""
    if not es_mssql:
        return
    with engine.begin() as conn:
        conn.execute(text("UPDATE vehiculos SET numserie_vehiculo = NULL WHERE numserie_vehiculo IS NOT NULL AND LTRIM(RTRIM(numserie_vehiculo)) = ''"))
        conn.execute(text("IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_vehiculos_taller_numserie') ALTER TABLE vehiculos DROP CONSTRAINT uq_vehiculos_taller_numserie"))
        conn.execute(text("IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_vehiculos_taller_numserie' AND object_id = OBJECT_ID('vehiculos')) DROP INDEX uq_vehiculos_taller_numserie ON vehiculos"))
        conn.execute(text("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_vehiculos_taller_numserie' AND object_id = OBJECT_ID('vehiculos')) CREATE UNIQUE INDEX ux_vehiculos_taller_numserie ON vehiculos (id_taller, numserie_vehiculo) WHERE numserie_vehiculo IS NOT NULL"))


def _indices_llaves_foraneas():
    """SQL Server no crea índices para las llaves foráneas (Postgres y MySQL
    tampoco siempre). Sin ellos cada JOIN o filtro por cliente, vehículo,
    servicio, etc. recorre la tabla completa. Crea los que falten; en
    arranques siguientes no hace nada."""
    inspector = inspect(engine)
    existentes = set(inspector.get_table_names())
    creados = 0
    with engine.connect() as conn:
        for tabla in Base.metadata.sorted_tables:
            if tabla.name not in existentes:
                continue
            # Columnas que ya encabezan un índice (incluye la llave primaria)
            cubiertas = {i["column_names"][0] for i in inspector.get_indexes(tabla.name) if i.get("column_names")}
            pk = [c.name for c in tabla.primary_key.columns]
            if pk:
                cubiertas.add(pk[0])
            for col in tabla.columns:
                if not col.foreign_keys or col.name in cubiertas:
                    continue
                nombre = f"ix_{tabla.name}_{col.name}"[:60]
                conn.execute(text(f'CREATE INDEX "{nombre}" ON "{tabla.name}" ("{col.name}")'))
                creados += 1
        conn.commit()
    if creados:
        print(f"[migración automática] {creados} índice(s) creados en llaves foráneas")


def _migrar_subcategorias_a_refacciones(id_taller: int):
    """Las 'subcategorías de refacción' (Balatas delanteras, Bujías, etc.)
    dejaron de ser un catálogo aparte — ahora son refacciones reales dentro
    del catálogo de Refacciones. Esto copia una sola vez las que no existan
    ya como refacción (por nombre), y no borra la tabla vieja por si algo
    más la sigue referenciando."""
    inspector = inspect(engine)
    if "refacciones_subcategorias" not in inspector.get_table_names():
        return
    db = _sesion_taller(id_taller)
    try:
        subcategorias = db.query(models.RefaccionSubcategoria).all()
        if not subcategorias:
            return
        nombres_existentes = {r.nombre_refaccion for r in db.query(models.Refaccion).all()}
        migradas = 0
        for s in subcategorias:
            if s.nombre_subcategoria in nombres_existentes:
                continue
            categoria = db.query(models.RefaccionCategoria).filter(
                models.RefaccionCategoria.id_categoria_refaccion == s.id_categoria_refaccion
            ).first()
            db.add(models.Refaccion(
                nombre_refaccion=s.nombre_subcategoria,
                categoria=categoria.nombre_categoria if categoria else None,
            ))
            nombres_existentes.add(s.nombre_subcategoria)
            migradas += 1
        if migradas:
            db.commit()
            print(f"[migración automática] {migradas} subcategoría(s) migradas a Refacciones")
    finally:
        db.close()


def _servicio_cliente_opcional():
    """Las órdenes pueden abrirse como borrador sin cliente/vehículo: esas dos
    columnas de `servicios` dejan de ser NOT NULL."""
    inspector = inspect(engine)
    if "servicios" not in inspector.get_table_names():
        return
    cols = {c["name"]: c for c in inspector.get_columns("servicios")}
    pendientes = [n for n in ("id_cliente", "id_vehiculo") if n in cols and not cols[n].get("nullable", True)]
    if not pendientes:
        return
    try:
        with engine.begin() as conn:
            if es_sqlite:
                _reconstruir_tabla_sqlite(conn, Base.metadata.tables["servicios"])
                conn.execute(text("PRAGMA foreign_keys=ON"))
            elif es_mssql:
                for n in pendientes:
                    conn.execute(text(f"ALTER TABLE servicios ALTER COLUMN {n} INT NULL"))
            else:
                for n in pendientes:
                    conn.execute(text(f'ALTER TABLE servicios ALTER COLUMN "{n}" DROP NOT NULL'))
        print("[migración automática] servicios: cliente y vehículo ahora opcionales (órdenes borrador)")
    except Exception as e:  # noqa: BLE001
        print(f"[migración] no se pudo relajar servicios.id_cliente/id_vehiculo: {e}")


def _quitar_subcategoria_legacy():
    """inventario_refacciones aún trae la columna vieja id_subcategoria_refaccion
    (NOT NULL) del diseño anterior; el modelo actual ya no la usa y bloquea los
    INSERT. SQL Server: se vuelve NULL. SQLite: se reconstruye la tabla."""
    inspector = inspect(engine)
    if "inventario_refacciones" not in inspector.get_table_names():
        return
    cols = {c["name"]: c for c in inspector.get_columns("inventario_refacciones")}
    legacy = cols.get("id_subcategoria_refaccion")
    if not legacy or legacy.get("nullable", True):
        return
    try:
        with engine.begin() as conn:
            if engine.dialect.name == "mssql":
                conn.execute(text("ALTER TABLE inventario_refacciones ALTER COLUMN id_subcategoria_refaccion INT NULL"))
            elif engine.dialect.name == "sqlite":
                for (nombre,) in conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='inventario_refacciones' AND sql IS NOT NULL")).fetchall():
                    conn.execute(text(f'DROP INDEX IF EXISTS "{nombre}"'))
                conn.execute(text("ALTER TABLE inventario_refacciones RENAME TO inventario_refacciones_old"))
                models.InventarioRefaccion.__table__.create(conn)
                nuevas = {c.name for c in models.InventarioRefaccion.__table__.columns}
                comunes = ", ".join(f'"{c}"' for c in cols if c in nuevas)
                conn.execute(text(f"INSERT INTO inventario_refacciones ({comunes}) SELECT {comunes} FROM inventario_refacciones_old WHERE id_refaccion IS NOT NULL"))
                conn.execute(text("DROP TABLE inventario_refacciones_old"))
            else:
                conn.execute(text("ALTER TABLE inventario_refacciones ALTER COLUMN id_subcategoria_refaccion DROP NOT NULL"))
        print("[migración automática] inventario_refacciones: columna legacy id_subcategoria_refaccion ahora es opcional")
    except Exception as e:  # noqa: BLE001
        print(f"[migración] no se pudo relajar id_subcategoria_refaccion: {e}")


def _limpiar_inventario_huerfano(id_taller: int):
    """InventarioRefaccion cambió de apuntar a una subcategoría a apuntar a
    Refaccion (id_refaccion, ahora obligatorio). Los registros que se hayan
    creado con el diseño anterior se quedaron sin ese dato y ya no se
    pueden usar — se eliminan aquí para que no rompan la lista al leerla."""
    inspector = inspect(engine)
    if "inventario_refacciones" not in inspector.get_table_names():
        return
    columnas = {c["name"] for c in inspector.get_columns("inventario_refacciones")}
    if "id_refaccion" not in columnas:
        return
    db = _sesion_taller(id_taller)
    try:
        huerfanos = db.query(models.InventarioRefaccion).filter(models.InventarioRefaccion.id_refaccion.is_(None)).all()
        if huerfanos:
            for h in huerfanos:
                db.delete(h)
            db.commit()
            print(f"[migración automática] {len(huerfanos)} registro(s) de inventario huérfano(s) eliminados (del diseño anterior)")
    finally:
        db.close()


def _consolidar_refacciones_existentes(id_taller: int):
    """Una sola vez por arranque: une renglones repetidos de la misma
    refacción que se hayan capturado antes de existir esta regla."""
    from .routers.servicios import consolidar_refacciones_repetidas as consolidar_orden
    from .routers.cotizaciones import consolidar_refacciones_repetidas as consolidar_cotizacion
    db = _sesion_taller(id_taller)
    try:
        for (id_servicio,) in db.query(models.Servicio.id_servicio).filter(models.Servicio.status == "abierto").all():
            consolidar_orden(db, id_servicio)
        for (id_cotizacion,) in db.query(models.Cotizacion.id_cotizacion).all():
            consolidar_cotizacion(db, id_cotizacion)
        db.commit()
    finally:
        db.close()


def _sesion_taller(id_taller: int):
    db = SessionLocal()
    fijar_tenant(db, MODO_TALLER, id_taller)
    return db


def _generar_codigo(db, nombre: str) -> str:
    """Código corto y legible para el QR del taller (ej. TALLERLEON)."""
    import re
    import unicodedata

    base = unicodedata.normalize("NFKD", nombre or "TALLER").encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9]", "", base).upper()[:12] or "TALLER"
    codigo, n = base, 1
    while db.query(models.Taller).filter(models.Taller.codigo == codigo).first():
        n += 1
        codigo = f"{base}{n}"
    return codigo


def _actualizar_paquetes(db, config, mapa_modulos):
    """Aplica PAQUETES_BASE (nombre, precio, descripción y módulos) a los
    paquetes que ya existen, una sola vez por VERSION_PAQUETES. Busca cada
    paquete por su nombre actual o uno anterior (nunca duplica). Los paquetes
    que no son de la lista quedan inactivos (no se borran: los talleres que
    los tengan los conservan). Los talleres con precio pactado lo conservan;
    se quitan los precios fijos por tipo de cobro para que se recalculen."""
    if (config.version_paquetes or 0) >= VERSION_PAQUETES:
        return
    usados = set()
    for nombre, descripcion, precio, claves in PAQUETES_BASE:
        candidatos = [nombre] + NOMBRES_ANTERIORES.get(nombre, [])
        encontrados = [
            p for n in candidatos
            for p in db.query(models.Paquete).filter(models.Paquete.nombre == n).all()
        ]
        paquete = encontrados[0] if encontrados else None
        for sobrante in encontrados[1:]:
            sobrante.activo = False  # duplicado de otra versión
            usados.add(sobrante.id_paquete)
        if not paquete:
            paquete = models.Paquete(nombre=nombre)
            db.add(paquete)
            db.flush()
        paquete.nombre = nombre
        paquete.descripcion = descripcion
        paquete.precio_mensual = precio
        paquete.activo = True
        paquete.modulos = [mapa_modulos[c] for c in claves if c in mapa_modulos]
        for fijo in list(paquete.precios):
            db.delete(fijo)
        usados.add(paquete.id_paquete)
    for otro in db.query(models.Paquete).all():
        if otro.id_paquete not in usados and otro.activo:
            otro.activo = False
            print(f"[migración automática] paquete «{otro.nombre}» desactivado (ya no está en la lista de paquetes)")
    config.version_paquetes = VERSION_PAQUETES
    db.commit()
    print(f"[migración automática] paquetes actualizados a la versión {VERSION_PAQUETES}: "
          + ", ".join(f"{n} ${p:,.0f} + IVA" for n, _, p, _ in PAQUETES_BASE))


def sembrar_globales(db):
    """Catálogos que comparten todos los talleres (sin id_taller)."""
    existentes = {p.clave for p in db.query(models.Permiso).all()}
    for clave, modulo, descripcion in PERMISOS:
        if clave not in existentes:
            db.add(models.Permiso(clave=clave, modulo=modulo, descripcion=descripcion))
    db.commit()
    if "inventario.ver" not in existentes:
        # Separación Refacciones / Inventario: quien tenía refacciones.X conserva inventario.X
        mapa = {p.clave: p for p in db.query(models.Permiso).all()}
        for rol in db.query(models.Rol).execution_options(sin_filtro_taller=True).all():
            claves = {p.clave for p in rol.permisos}
            for accion in ("ver", "crear", "editar", "eliminar"):
                if f"refacciones.{accion}" in claves and f"inventario.{accion}" in mapa and f"inventario.{accion}" not in claves:
                    rol.permisos.append(mapa[f"inventario.{accion}"])
        db.commit()

    modulos_existentes = {m.clave for m in db.query(models.Modulo).all()}
    nuevos = []
    for clave, nombre, descripcion, icono, orden in MODULOS_SISTEMA:
        if clave not in modulos_existentes:
            db.add(models.Modulo(clave=clave, nombre=nombre, descripcion=descripcion, icono=icono, orden=orden))
            nuevos.append(clave)
    db.commit()
    mapa_modulos = {m.clave: m for m in db.query(models.Modulo).all()}
    if modulos_existentes:
        for clave in nuevos:
            if clave not in MODULOS_HEREDADOS:
                continue
            padre = MODULOS_HEREDADOS[clave]
            for paquete in db.query(models.Paquete).all():
                claves = {m.clave for m in paquete.modulos}
                if padre is None or padre in claves:
                    paquete.modulos.append(mapa_modulos[clave])
        db.commit()

    # Paquetes de ejemplo — solo si todavía no hay ninguno
    if not db.query(models.Paquete).first():
        for nombre, descripcion, precio, claves_modulo in PAQUETES_BASE:
            db.add(models.Paquete(
                nombre=nombre, descripcion=descripcion, precio_mensual=precio,
                modulos=[mapa_modulos[c] for c in claves_modulo if c in mapa_modulos],
            ))
        db.commit()

    # Tipos de cobro de ejemplo — capturables desde la app de súper admin
    if not db.query(models.TipoCobro).first():
        for orden, (nombre, meses, descuento) in enumerate([("Mensual", 1, 0), ("Trimestral", 3, 5), ("Semestral", 6, 10), ("Anual", 12, 16.67)]):
            db.add(models.TipoCobro(nombre=nombre, meses=meses, descuento_porcentaje=descuento, orden=orden))
        db.commit()

    config = db.query(models.ConfiguracionSaaS).first()
    if not config:
        premium = db.query(models.Paquete).order_by(models.Paquete.precio_mensual.desc()).first()
        db.add(models.ConfiguracionSaaS(id_paquete_prueba=premium.id_paquete if premium else None, version_paquetes=VERSION_PAQUETES))
        db.commit()
    else:
        _actualizar_paquetes(db, config, mapa_modulos)

    # Catálogo geográfico: México y sus 32 estados
    if not db.query(models.Pais).first():
        mx = models.Pais(nombre_pais="México")
        db.add(mx)
        db.flush()
        for nombre_estado in ESTADOS_MEXICO:
            db.add(models.Estado(nombre_estado=nombre_estado, id_pais=mx.id_pais))

    if not db.query(models.TipoServicio).first():
        for nombre in [
            "Cambio de aceite", "Afinación", "Frenos", "Suspensión",
            "Diagnóstico eléctrico", "Alineación y balanceo", "Transmisión", "Otro",
        ]:
            db.add(models.TipoServicio(nombre_tipo=nombre))

    if not db.query(models.ColorVehiculo).first():
        for nombre in [
            "Blanco", "Negro", "Gris", "Plata", "Rojo", "Azul",
            "Verde", "Amarillo", "Café", "Dorado", "Naranja", "Vino",
        ]:
            db.add(models.ColorVehiculo(nombre_color=nombre))

    if not db.query(models.RefaccionCategoria).first():
        CATEGORIAS_REFACCION = {
            "Frenos": ["Balatas delanteras", "Balatas traseras", "Discos", "Líquido de frenos"],
            "Motor": ["Filtro de aceite", "Bujías", "Banda de distribución", "Aceite de motor", "Filtro de aire"],
            "Suspensión": ["Amortiguadores delanteros", "Amortiguadores traseros", "Rótulas", "Terminales"],
            "Eléctrico": ["Batería", "Alternador", "Marcha", "Fusibles"],
            "Transmisión": ["Aceite de transmisión", "Embrague", "Bandas"],
            "Refrigeración": ["Radiador", "Anticongelante", "Termostato", "Mangueras"],
            "Llantas": ["Llantas", "Válvulas", "Balanceo"],
            "Carrocería": ["Limpiaparabrisas", "Espejos", "Faros", "Molduras"],
        }
        for nombre_categoria, subcategorias in CATEGORIAS_REFACCION.items():
            categoria = models.RefaccionCategoria(nombre_categoria=nombre_categoria)
            db.add(categoria)
            db.flush()
            for nombre_sub in subcategorias:
                db.add(models.RefaccionSubcategoria(nombre_subcategoria=nombre_sub, id_categoria_refaccion=categoria.id_categoria_refaccion))
    db.commit()


def sembrar_taller(id_taller: int):
    """Lo mínimo que necesita cada taller para operar: roles base (el
    Administrador General siempre con TODOS los permisos), su fila de
    configuración y el checklist de inspección."""
    db = _sesion_taller(id_taller)
    try:
        mapa_permisos = {p.clave: p for p in db.query(models.Permiso).all()}
        for nombre, descripcion, claves in ROLES_BASE:
            rol = db.query(models.Rol).filter(models.Rol.nombre == nombre).first()
            if not rol:
                db.add(models.Rol(
                    nombre=nombre, descripcion=descripcion, es_sistema=True,
                    permisos=[mapa_permisos[c] for c in claves if c in mapa_permisos],
                ))
            elif nombre == "Administrador General":
                rol.permisos = list(mapa_permisos.values())
        if not db.query(models.ConfiguracionTaller).first():
            taller = db.query(models.Taller).filter(models.Taller.id_taller == id_taller).first()
            db.add(models.ConfiguracionTaller(
                nombre_taller=taller.nombre_comercial if taller else "Mi Taller",
                telefono=taller.telefono if taller else None,
                correo=taller.correo if taller else None,
            ))
        if not db.query(models.Refaccion).first():
            # Catálogo base de refacciones (desde las categorías/subcategorías compartidas)
            cats = {c.id_categoria_refaccion: c.nombre_categoria for c in db.query(models.RefaccionCategoria).all()}
            for sub in db.query(models.RefaccionSubcategoria).all():
                db.add(models.Refaccion(nombre_refaccion=sub.nombre_subcategoria, categoria=cats.get(sub.id_categoria_refaccion)))
        if not db.query(models.InspeccionItem).first():
            orden = 0
            for categoria, items in ITEMS_INSPECCION.items():
                for nombre_item in items:
                    orden += 1
                    db.add(models.InspeccionItem(categoria=categoria, nombre_item=nombre_item, orden=orden))
        db.commit()
    finally:
        db.close()


def rol_admin_de(db, id_taller: int):
    return (
        db.query(models.Rol).execution_options(sin_filtro_taller=True)
        .filter(models.Rol.id_taller == id_taller, models.Rol.nombre == "Administrador General").first()
    )


def _migrar_a_multitaller(db):
    """Una sola vez: la instalación de un solo taller se convierte en el
    taller #1 (principal). Todos los datos que ya existen quedan ligados a
    él, cada usuario conserva su rol ahí y las suscripciones viejas (varias
    por taller) se vuelven una sola + su historial de pagos."""
    config = db.query(models.ConfiguracionSaaS).first()
    if config.id_taller_principal:
        return
    datos_taller = (
        db.query(models.ConfiguracionTaller).execution_options(sin_filtro_taller=True)
        .order_by(models.ConfiguracionTaller.id_configuracion).first()
    )
    nombre = (datos_taller.nombre_taller if datos_taller and datos_taller.nombre_taller not in (None, "", "Mi Taller") else None) or "Taller principal"
    principal = models.Taller(
        nombre_comercial=nombre, codigo=_generar_codigo(db, nombre), activo=True,
        telefono=datos_taller.telefono if datos_taller else None,
        correo=datos_taller.correo if datos_taller else None,
        notas="Taller original de la instalación (migrado a multi-taller).",
    )
    db.add(principal)
    db.flush()
    premium = db.query(models.Paquete).order_by(models.Paquete.precio_mensual.desc()).first()
    db.add(models.Suscripcion(
        id_taller=principal.id_taller, id_paquete=premium.id_paquete, estado="activa",
        fecha_vencimiento=None, notas="Taller principal: sin vencimiento.",
    ))
    config.id_taller_principal = principal.id_taller
    db.commit()

    # Todo lo que ya existe es del taller principal
    with engine.connect() as conn:
        for tabla in Base.metadata.sorted_tables:
            if "id_taller" in tabla.c and tabla.name in _tablas_de_taller():
                conn.execute(text(f'UPDATE "{tabla.name}" SET id_taller = :t WHERE id_taller IS NULL'), {"t": principal.id_taller})
        conn.commit()
    db.expire_all()

    # Cada usuario conserva su rol en el taller principal
    for u in db.query(models.Usuario).all():
        if u.id_rol_base and not any(m.id_taller == principal.id_taller for m in u.membresias):
            db.add(models.UsuarioTaller(
                id_usuario=u.id_usuario, id_taller=principal.id_taller, id_rol=u.id_rol_base,
                activo=bool(u.activo), notificaciones_vistas_hasta=u.notificaciones_vistas_hasta,
            ))
        u.id_ultimo_taller = principal.id_taller
    db.commit()
    print(f"[migración multi-taller] datos existentes ligados al taller #{principal.id_taller} ({principal.codigo})")


def _tablas_de_taller():
    return {m.class_.__table__.name for m in Base.registry.mappers if issubclass(m.class_, TenantMixin)}


def _una_suscripcion_por_taller(db):
    """Antes un taller podía tener varias suscripciones; ahora es una sola
    que se renueva. Las anteriores pasan al historial de pagos."""
    for taller in db.query(models.Taller).all():
        todas = (
            db.query(models.Suscripcion).filter(models.Suscripcion.id_taller == taller.id_taller)
            .order_by(models.Suscripcion.fecha_inicio.desc(), models.Suscripcion.id_suscripcion.desc()).all()
        )
        if len(todas) <= 1:
            continue
        vigente, viejas = todas[0], todas[1:]
        for v in viejas:
            db.add(models.PagoSuscripcion(
                id_suscripcion=vigente.id_suscripcion, id_taller=taller.id_taller, id_paquete=v.id_paquete,
                monto=v.precio_pactado if v.precio_pactado is not None else (v.paquete.precio_mensual if v.paquete else 0),
                periodo_desde=v.fecha_inicio, periodo_hasta=v.fecha_vencimiento,
                notas=f"Migrado de una suscripción anterior ({v.estado}). {v.notas or ''}".strip(),
            ))
            db.delete(v)
    for s in db.query(models.Suscripcion).filter(models.Suscripcion.estado == "vencida").all():
        s.estado = "activa"  # "vencida" ahora se calcula con las fechas
    for t in db.query(models.Taller).filter(models.Taller.codigo.is_(None)).all():
        t.codigo = _generar_codigo(db, t.nombre_comercial)
        db.flush()
    db.commit()


def _asegurar_admin(db, id_taller_principal: int):
    """El usuario administrador original (ADMIN_USERNAME): súper
    administrador de ALDM AutoCore y Administrador General del taller
    principal."""
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin1234")
    admin_correo = os.getenv("ADMIN_CORREO")
    rol_admin = rol_admin_de(db, id_taller_principal)
    admin = db.query(models.Usuario).filter(models.Usuario.username == admin_username).first()
    if os.getenv("WEBSITE_SITE_NAME") and admin_password == "admin1234" and (not admin or os.getenv("RESET_ADMIN_PASSWORD") == "1"):
        # En Azure nunca se crea (ni se restablece) el súper admin con la contraseña de fábrica
        raise RuntimeError("Define ADMIN_PASSWORD (una contraseña fuerte) en la configuración de Azure.")
    if not admin:
        admin = models.Usuario(
            username=admin_username, hashed_password=hash_password(admin_password),
            nombre_completo="Administrador General", id_rol_base=rol_admin.id_rol,
            correo=admin_correo, activo=True, es_superadmin=True, id_ultimo_taller=id_taller_principal,
        )
        db.add(admin)
        db.flush()
    if os.getenv("RESET_ADMIN_PASSWORD") == "1":  # solo para DEV local: fuerza ADMIN_PASSWORD
        admin.hashed_password = hash_password(admin_password)
        admin.activo = True
    admin.es_superadmin = True
    if not any(m.id_taller == id_taller_principal for m in admin.membresias):
        db.add(models.UsuarioTaller(id_usuario=admin.id_usuario, id_taller=id_taller_principal, id_rol=rol_admin.id_rol, activo=True))
    db.query(models.Usuario).filter(models.Usuario.es_superadmin.is_(None)).update({"es_superadmin": False}, synchronize_session=False)
    db.commit()


def run():
    Base.metadata.create_all(bind=engine)
    _sincronizar_columnas_faltantes()
    _ajustar_restricciones()
    _vin_unico_filtrado()
    _quitar_subcategoria_legacy()
    _servicio_cliente_opcional()
    _indices_llaves_foraneas()
    db = sesion_global()
    try:
        sembrar_globales(db)
        from .seed_catalogos import asegurar_catalogos_base
        asegurar_catalogos_base(db)  # catálogos precargados (idempotente)
        _migrar_a_multitaller(db)
        _una_suscripcion_por_taller(db)
        id_principal = db.query(models.ConfiguracionSaaS).first().id_taller_principal
        from . import tenancy
        tenancy.TALLER_PRINCIPAL = id_principal
        ids = [t for (t,) in db.query(models.Taller.id_taller).all()]
    finally:
        db.close()

    for id_taller in ids:
        sembrar_taller(id_taller)

    db = sesion_global()
    try:
        _asegurar_admin(db, id_principal)
    finally:
        db.close()

    _migrar_subcategorias_a_refacciones(id_principal)
    for id_taller in ids:
        _limpiar_inventario_huerfano(id_taller)
        _consolidar_refacciones_existentes(id_taller)
