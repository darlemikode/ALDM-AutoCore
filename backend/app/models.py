"""
Modelos de base de datos.

Traducidos de las entidades originales de SistemaMecanico2020 (ERP.Entidades)
a un esquema relacional para PostgreSQL. Mejoras respecto al original:

- `refacciones` ya no se relaciona directamente con un vehículo; ahora es un
  catálogo de inventario real, y su uso en un servicio se registra en
  `servicios_detalles`.
- Se agregó el catálogo `tipos_servicio` (antes era solo un id sin catálogo).
- `servicios_costos` se eliminó como tabla: los totales (subtotal, IVA,
  total) se calculan siempre a partir de `servicios_detalles`, evitando que
  se desincronicen.
- `servicios_sin_cobrar` se reemplazó por `servicios_abonos`, que registra
  cada abono/pago parcial de un servicio; el saldo pendiente se calcula.
"""
from datetime import datetime, date

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Table, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship, object_session

from .database import Base
from .tenancy import TenantMixin, CatalogoCompartidoMixin


# ---------------------------------------------------------------------------
# Autenticación y permisos
# ---------------------------------------------------------------------------

# Tabla puente rol↔permiso (un rol tiene muchos permisos, un permiso puede
# estar en muchos roles).
rol_permiso = Table(
    "rol_permiso",
    Base.metadata,
    Column("id_rol", Integer, ForeignKey("roles.id_rol"), primary_key=True),
    Column("id_permiso", Integer, ForeignKey("permisos.id_permiso"), primary_key=True),
)


class Permiso(Base):
    """Catálogo fijo de permisos individuales, ej. 'clientes.crear'.
    Se siembra una sola vez en seed.py y no se edita desde la app."""
    __tablename__ = "permisos"

    id_permiso = Column(Integer, primary_key=True, index=True)
    clave = Column(String(60), unique=True, nullable=False, index=True)  # ej. "servicios.cerrar"
    modulo = Column(String(40), nullable=False)  # ej. "servicios" — para agrupar en la pantalla de roles
    descripcion = Column(String(150), nullable=False)


class Rol(TenantMixin, Base):
    """Un perfil (Dueño, Hijo, Ayudante, o uno personalizado) con un
    conjunto de permisos. Los tres roles base de la jerarquía del taller
    (`es_sistema=True`) no se pueden borrar, pero sí editar sus permisos si
    hace falta ajustar algo."""
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("id_taller", "nombre", name="uq_roles_taller_nombre"),)

    id_rol = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(60), nullable=False)
    descripcion = Column(String(200), nullable=True)
    es_sistema = Column(Boolean, default=False)  # True = Dueño/Hijo/Ayudante, no se puede borrar

    permisos = relationship("Permiso", secondary=rol_permiso, backref="roles")
    membresias = relationship("UsuarioTaller", back_populates="rol")

    def tiene_permiso(self, clave: str) -> bool:
        return any(p.clave == clave for p in self.permisos)


class Usuario(Base):
    """Cuenta de acceso (global): el mismo usuario puede entrar a uno o
    varios talleres — a qué talleres y con qué rol en cada uno vive en
    UsuarioTaller. `rol` / `id_rol` se resuelven para el taller activo de
    la sesión (ver tenancy.py)."""
    __tablename__ = "usuarios"

    id_usuario = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    nombre_completo = Column(String(150), nullable=False)
    # Rol "de origen" (histórico, de cuando había un solo taller). El rol
    # real por taller está en UsuarioTaller.
    id_rol_base = Column("id_rol", Integer, ForeignKey("roles.id_rol"), nullable=True)
    activo = Column(Boolean, default=True)
    # Usados para verificar identidad al recuperar la contraseña
    telefono = Column(String(20), nullable=True)
    correo = Column(String(120), nullable=True)
    push_token = Column(String(120), nullable=True)  # token de notificaciones de Expo
    notificaciones_vistas_hasta = Column(DateTime, nullable=True)  # (histórico) ahora vive en UsuarioTaller

    es_superadmin = Column(Boolean, default=False)  # acceso a la app de súper administración
    id_ultimo_taller = Column(Integer, nullable=True)  # para abrir directo en el último taller usado

    membresias = relationship("UsuarioTaller", back_populates="usuario", cascade="all, delete-orphan")
    solicitudes_recuperacion = relationship("SolicitudRecuperacion", back_populates="usuario")

    # --- Resolución por taller activo ---------------------------------
    def _id_taller_activo(self):
        forzado = getattr(self, "_taller_activo", None)
        if forzado is not None:
            return forzado
        sesion = object_session(self)
        if sesion is None:
            return None
        modo, tid = sesion.info.get("tenant", ("ninguno", None))
        return tid if modo == "taller" else None

    def membresia(self, id_taller=None):
        tid = id_taller if id_taller is not None else self._id_taller_activo()
        if tid is None:
            return None
        for m in self.membresias:
            if m.id_taller == tid:
                return m
        return None

    @property
    def rol(self):
        m = self.membresia()
        return m.rol if m and m.activo else None

    @property
    def id_rol(self):
        m = self.membresia()
        return m.id_rol if m else None

    @id_rol.setter
    def id_rol(self, valor):
        m = self.membresia()
        if m is not None:
            m.id_rol = valor

    @property
    def activo_en_taller(self):
        m = self.membresia()
        return bool(m and m.activo)

    def tiene_permiso(self, clave: str) -> bool:
        rol = self.rol
        if rol is None or not rol.tiene_permiso(clave):
            return False
        modulos = getattr(self, "_modulos_activos", None)
        if modulos is None:
            return True
        from .suscripciones import permiso_en_modulos
        return permiso_en_modulos(clave, modulos)


class UsuarioTaller(Base):
    """A qué talleres puede entrar cada usuario y con qué rol en cada uno."""
    __tablename__ = "usuarios_talleres"
    __table_args__ = (UniqueConstraint("id_usuario", "id_taller", name="uq_usuario_taller"),)

    id_usuario_taller = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id_usuario"), nullable=False, index=True)
    id_taller = Column(Integer, ForeignKey("talleres.id_taller"), nullable=False, index=True)
    id_rol = Column(Integer, ForeignKey("roles.id_rol"), nullable=False)
    activo = Column(Boolean, default=True)
    notificaciones_vistas_hasta = Column(DateTime, nullable=True)
    fecha_alta = Column(DateTime, default=datetime.utcnow)

    usuario = relationship("Usuario", back_populates="membresias")
    taller = relationship("Taller")
    rol = relationship("Rol", back_populates="membresias")


class SolicitudRecuperacion(TenantMixin, Base):
    """Registro de "olvidé mi contraseña". No se envía correo/SMS real (no
    hay credenciales de un proveedor configuradas); en vez de eso, el admin
    ve la solicitud dentro del panel y genera una contraseña temporal que
    comunica él mismo al usuario."""
    __tablename__ = "solicitudes_recuperacion"

    id_solicitud = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id_usuario"), nullable=False)
    identificador_usado = Column(String(120), nullable=False)  # lo que la persona escribió (correo, teléfono o usuario)
    fecha_solicitud = Column(DateTime, default=datetime.utcnow)
    atendida = Column(Boolean, default=False)
    fecha_atencion = Column(DateTime, nullable=True)
    atendida_por = Column(String(50), nullable=True)  # username del admin que la resolvió

    usuario = relationship("Usuario", back_populates="solicitudes_recuperacion")


# ---------------------------------------------------------------------------
# Catálogos geográficos
# ---------------------------------------------------------------------------
class Pais(CatalogoCompartidoMixin, Base):
    __tablename__ = "paises"

    id_pais = Column(Integer, primary_key=True, index=True)
    nombre_pais = Column(String(100), nullable=False)
    activo = Column(Boolean, default=True)

    estados = relationship("Estado", back_populates="pais")


class Estado(CatalogoCompartidoMixin, Base):
    __tablename__ = "estados"

    id_estado = Column(Integer, primary_key=True, index=True)
    nombre_estado = Column(String(100), nullable=False)
    id_pais = Column(Integer, ForeignKey("paises.id_pais"), nullable=False)
    activo = Column(Boolean, default=True)

    pais = relationship("Pais", back_populates="estados")
    ciudades = relationship("Ciudad", back_populates="estado")


class Ciudad(CatalogoCompartidoMixin, Base):
    __tablename__ = "ciudades"

    id_ciudad = Column(Integer, primary_key=True, index=True)
    nombre_ciudad = Column(String(100), nullable=False)
    id_estado = Column(Integer, ForeignKey("estados.id_estado"), nullable=False)
    activo = Column(Boolean, default=True)

    estado = relationship("Estado", back_populates="ciudades")


class CodigoPostal(Base):
    """Catálogo de códigos postales (fuente: Sepomex/Correos de México).

    Nota de alcance: por ahora solo se cargó el municipio de León,
    Guanajuato (1,277 registros) como prueba piloto — no el catálogo
    nacional completo (~159,000 registros). El importador
    (`seed_codigos_postales.py`) y el endpoint ya están listos para
    recibir el archivo completo el día que se decida cargarlo; solo hay
    que reemplazar el CSV en `app/data/` y volver a correr la carga.
    """
    __tablename__ = "codigos_postales"

    id = Column(Integer, primary_key=True, index=True)
    cp = Column(String(5), nullable=False, index=True)
    asentamiento = Column(String(120), nullable=False)
    tipo_asentamiento = Column(String(40), nullable=True)
    municipio = Column(String(100), nullable=True)
    estado = Column(String(80), nullable=True, index=True)
    ciudad = Column(String(100), nullable=True)
    zona = Column(String(20), nullable=True)


class Foto(TenantMixin, Base):
    """Fotos adjuntas a un vehículo o a una orden de servicio — para
    documentar el estado del auto, daños previos, avances del trabajo,
    o cualquier aclaración visual. `entidad_tipo` + `entidad_id` apuntan
    al registro dueño (un vehículo o un servicio); una misma tabla sirve
    para ambos casos en vez de duplicar la lógica."""
    __tablename__ = "fotos"

    id_foto = Column(Integer, primary_key=True, index=True)
    entidad_tipo = Column(String(20), nullable=False, index=True)  # "vehiculo" | "servicio"
    entidad_id = Column(Integer, nullable=False, index=True)
    ruta_archivo = Column(String(255), nullable=False)  # nombre de archivo dentro de app/uploads/
    descripcion = Column(String(200), nullable=True)
    fecha = Column(DateTime, default=datetime.utcnow)
    subida_por = Column(String(50), nullable=True)  # username de quien la subió


# ---------------------------------------------------------------------------
# Catálogos de vehículos / refacciones / herramientas
# ---------------------------------------------------------------------------
class ColorVehiculo(CatalogoCompartidoMixin, Base):
    __tablename__ = "colores_vehiculos"

    id_color = Column(Integer, primary_key=True, index=True)
    nombre_color = Column(String(50), nullable=False)


class VehiculoMarca(CatalogoCompartidoMixin, Base):
    __tablename__ = "vehiculos_marcas"

    id_marca_vehiculo = Column(Integer, primary_key=True, index=True)
    nombre_marca = Column(String(80), nullable=False)
    comentarios = Column(Text, nullable=True)

    modelos = relationship("VehiculoModelo", back_populates="marca")


class VehiculoModelo(CatalogoCompartidoMixin, Base):
    __tablename__ = "vehiculos_modelos"

    id_modelo_vehiculo = Column(Integer, primary_key=True, index=True)
    id_marca_vehiculo = Column(Integer, ForeignKey("vehiculos_marcas.id_marca_vehiculo"), nullable=False)
    nombre_modelo = Column(String(80), nullable=False)
    comentario = Column(Text, nullable=True)

    marca = relationship("VehiculoMarca", back_populates="modelos")


class RefaccionMarca(CatalogoCompartidoMixin, Base):
    __tablename__ = "refacciones_marcas"

    id_marca_refaccion = Column(Integer, primary_key=True, index=True)
    nombre_marca = Column(String(80), nullable=False)
    comentarios = Column(Text, nullable=True)


class RefaccionCategoria(CatalogoCompartidoMixin, Base):
    """Catálogo administrable de categorías de refacción (ej. "Frenos",
    "Motor") — antes era texto libre en el campo Refaccion.categoria; ahora
    es un catálogo cerrado con sus propias subcategorías, igual que Marca→
    Modelo de vehículo. El campo de texto libre en Refaccion se conserva
    por compatibilidad con datos ya capturados."""
    __tablename__ = "refacciones_categorias"
    __table_args__ = (UniqueConstraint("id_taller", "nombre_categoria", name="uq_refcat_taller_nombre"),)

    id_categoria_refaccion = Column(Integer, primary_key=True, index=True)
    nombre_categoria = Column(String(80), nullable=False)

    subcategorias = relationship("RefaccionSubcategoria", back_populates="categoria", cascade="all, delete-orphan")


class RefaccionSubcategoria(CatalogoCompartidoMixin, Base):
    __tablename__ = "refacciones_subcategorias"

    id_subcategoria_refaccion = Column(Integer, primary_key=True, index=True)
    id_categoria_refaccion = Column(Integer, ForeignKey("refacciones_categorias.id_categoria_refaccion"), nullable=False)
    nombre_subcategoria = Column(String(80), nullable=False)

    categoria = relationship("RefaccionCategoria", back_populates="subcategorias")


class InventarioRefaccion(TenantMixin, Base):
    """Cada fila es un registro de inventario para UNA refacción del catálogo
    (Refaccion), con su propio stock, precio, marca de refacción y proveedor.
    La compatibilidad de vehículo (marca+modelo) vive aparte, en
    InventarioRefaccionCompatibilidad, porque un mismo registro de
    inventario puede aplicar a varios vehículos a la vez."""
    __tablename__ = "inventario_refacciones"

    id_inventario_refaccion = Column(Integer, primary_key=True, index=True)
    id_refaccion = Column(Integer, ForeignKey("refacciones.id_refaccion"), nullable=False)
    id_marca_refaccion = Column(Integer, ForeignKey("refacciones_marcas.id_marca_refaccion"), nullable=True)
    id_proveedor = Column(Integer, ForeignKey("proveedores.id_proveedor"), nullable=True)
    numero_parte = Column(String(60), nullable=True)
    cantidad = Column(Integer, default=0)
    preciopropio = Column(Float, default=0)
    preciocliente = Column(Float, default=0)
    ubicacion_fisica = Column(String(80), nullable=True)
    umbral_naranja = Column(Integer, default=4)
    umbral_rojo = Column(Integer, default=1)

    refaccion = relationship("Refaccion", foreign_keys=[id_refaccion])
    marca_refaccion = relationship("RefaccionMarca", foreign_keys=[id_marca_refaccion])
    proveedor = relationship("Proveedor", foreign_keys=[id_proveedor])
    compatibilidades = relationship("InventarioRefaccionCompatibilidad", cascade="all, delete-orphan")


class InventarioRefaccionCompatibilidad(TenantMixin, Base):
    """Una marca+modelo de vehículo con la que aplica un registro de
    InventarioRefaccion — puede haber varias por registro."""
    __tablename__ = "inventario_refacciones_compatibilidades"

    id_compatibilidad = Column(Integer, primary_key=True, index=True)
    id_inventario_refaccion = Column(Integer, ForeignKey("inventario_refacciones.id_inventario_refaccion"), nullable=False)
    id_marca_vehiculo = Column(Integer, ForeignKey("vehiculos_marcas.id_marca_vehiculo"), nullable=True)
    id_modelo_vehiculo = Column(Integer, ForeignKey("vehiculos_modelos.id_modelo_vehiculo"), nullable=True)

    marca_vehiculo = relationship("VehiculoMarca", foreign_keys=[id_marca_vehiculo])
    modelo_vehiculo = relationship("VehiculoModelo", foreign_keys=[id_modelo_vehiculo])


class HerramientaMarca(CatalogoCompartidoMixin, Base):
    __tablename__ = "herramientas_marcas"

    id_herramienta_marca = Column(Integer, primary_key=True, index=True)
    nombre_marca = Column(String(80), nullable=False)
    comentario = Column(Text, nullable=True)


class TipoServicio(CatalogoCompartidoMixin, Base):
    __tablename__ = "tipos_servicio"

    id_tipo_servicio = Column(Integer, primary_key=True, index=True)
    nombre_tipo = Column(String(100), nullable=False)


# Tabla puente: una orden puede tener más de un tipo de mantenimiento (ej.
# "Cambio de aceite" + "Frenos" en la misma visita). id_tipo_mantenimiento
# en Servicio se conserva por compatibilidad con datos existentes, pero
# esta es la fuente de verdad a partir de ahora.
class ServicioTipoMantenimiento(TenantMixin, Base):
    __tablename__ = "servicio_tipos_mantenimiento"

    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), primary_key=True)
    id_tipo_servicio = Column(Integer, ForeignKey("tipos_servicio.id_tipo_servicio"), primary_key=True)


# ---------------------------------------------------------------------------
# Clientes / Vehículos
# ---------------------------------------------------------------------------
class Cliente(TenantMixin, Base):
    __tablename__ = "clientes"

    id_cliente = Column(Integer, primary_key=True, index=True)
    # Cuenta única del cliente (folio), autogenerada al crear el registro
    # (ej. "CTE-000001"). Es la cuenta "maestra" a la que se cuelgan las
    # cuentas de cada vehículo (ver Vehiculo.numero_cuenta) y sirve como
    # identificador estable en recibos, aunque el cliente cambie de nombre.
    numero_cuenta = Column(String(20), unique=True, nullable=False, index=True)
    nombre_cliente = Column(String(80), nullable=False)
    paterno_cliente = Column(String(80), nullable=True)
    materno_cliente = Column(String(80), nullable=True)
    calle_cliente = Column(String(120), nullable=True)
    numexterior_cliente = Column(String(20), nullable=True)
    numinterior_cliente = Column(String(20), nullable=True)
    colonia_cliente = Column(String(100), nullable=True)
    cp_cliente = Column(String(10), nullable=True)
    telefono1 = Column(String(20), nullable=True)
    telefono2 = Column(String(20), nullable=True)
    id_ciudad = Column(Integer, ForeignKey("ciudades.id_ciudad"), nullable=True)
    id_estado = Column(Integer, ForeignKey("estados.id_estado"), nullable=True)
    id_pais = Column(Integer, ForeignKey("paises.id_pais"), nullable=True)
    empresa_cliente = Column(String(120), nullable=True)
    rfc_cliente = Column(String(20), nullable=True)
    correo_cliente = Column(String(120), nullable=True)
    # Datos fiscales para CFDI 4.0 — deben coincidir EXACTO con la
    # Constancia de Situación Fiscal del cliente, si no el PAC rechaza la factura.
    razon_social_fiscal = Column(String(254), nullable=True)
    regimen_fiscal = Column(String(3), nullable=True)  # c_RegimenFiscal, ej. "612"
    cp_fiscal = Column(String(5), nullable=True)
    uso_cfdi = Column(String(4), nullable=True)  # c_UsoCFDI preferido, ej. "G03"
    comentarios = Column(Text, nullable=True)
    status_cliente = Column(Integer, default=1)  # 1 activo, 0 inactivo

    # --- Acceso a la app de clientes (por invitación, no auto-registro) ---
    # El taller genera un código; el cliente lo usa una sola vez para crear
    # su contraseña y activar su cuenta. Sin invitación, no puede entrar.
    hashed_password = Column(String(255), nullable=True)
    cuenta_activada = Column(Boolean, default=False)
    codigo_invitacion = Column(String(10), nullable=True)
    fecha_invitacion = Column(DateTime, nullable=True)
    push_token = Column(String(120), nullable=True)  # token de notificaciones de Expo

    vehiculos = relationship("Vehiculo", back_populates="cliente")
    servicios = relationship("Servicio", back_populates="cliente")


class Vehiculo(TenantMixin, Base):
    __tablename__ = "vehiculos"
    __table_args__ = (
        # Un mismo VIN no puede repetirse en el inventario del taller
        # (se permite NULL, para vehículos aún sin dato de serie).
        UniqueConstraint("id_taller", "numserie_vehiculo", name="uq_vehiculos_taller_numserie"),
    )

    id_vehiculo = Column(Integer, primary_key=True, index=True)
    # Cuenta única del vehículo, "casada" 1 a 1 con su cliente dueño:
    # "<numero_cuenta del cliente>-<consecutivo>", ej. "CTE-000001-01".
    # Se genera automáticamente al registrar el vehículo y nunca cambia,
    # incluso si el vehículo se transfiere de placas o de datos.
    numero_cuenta = Column(String(30), unique=True, nullable=False, index=True)
    id_modelo_vehiculo = Column(Integer, ForeignKey("vehiculos_modelos.id_modelo_vehiculo"), nullable=True)
    id_marca_vehiculo = Column(Integer, ForeignKey("vehiculos_marcas.id_marca_vehiculo"), nullable=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"), nullable=False)
    numserie_vehiculo = Column(String(50), nullable=True)
    placas_vehiculo = Column(String(20), nullable=True)
    id_color = Column(Integer, ForeignKey("colores_vehiculos.id_color"), nullable=True)
    cilindraje_vehiculo = Column(String(20), nullable=True)
    id_year_vehiculo = Column(String(10), nullable=True)
    km_vehiculo = Column(String(20), nullable=True)
    comentarios = Column(Text, nullable=True)
    # "activo" (en uso) | "vendido" (ya no es del cliente; se conserva su historial de órdenes).
    estado_vehiculo = Column(String(20), nullable=False, default="activo")

    cliente = relationship("Cliente", back_populates="vehiculos")
    servicios = relationship("Servicio", back_populates="vehiculo")
    marca = relationship("VehiculoMarca", foreign_keys=[id_marca_vehiculo])
    modelo = relationship("VehiculoModelo", foreign_keys=[id_modelo_vehiculo])
    color = relationship("ColorVehiculo", foreign_keys=[id_color])


# ---------------------------------------------------------------------------
# Proveedores / Refacciones / Herramientas (inventario)
# ---------------------------------------------------------------------------
class Proveedor(TenantMixin, Base):
    __tablename__ = "proveedores"

    id_proveedor = Column(Integer, primary_key=True, index=True)
    nombre_proveedor = Column(String(120), nullable=False)
    calle_proveedor = Column(String(120), nullable=True)
    numexterior_proveedor = Column(String(20), nullable=True)
    numinterior_proveedor = Column(String(20), nullable=True)
    colonia_proveedor = Column(String(100), nullable=True)
    telefono1_proveedor = Column(String(20), nullable=True)
    telefono2_proveedor = Column(String(20), nullable=True)
    correo_proveedor = Column(String(120), nullable=True)
    empresa_proveedor = Column(String(120), nullable=True)
    rfc_proveedor = Column(String(20), nullable=True)

    productos = relationship("ProveedorProducto", back_populates="proveedor")
    deudas = relationship("ProveedorDeuda", back_populates="proveedor")


class ProveedorProducto(TenantMixin, Base):
    __tablename__ = "proveedor_productos"

    id_producto_proveedor = Column(Integer, primary_key=True, index=True)
    id_proveedor = Column(Integer, ForeignKey("proveedores.id_proveedor"), nullable=False)
    nombre_producto = Column(String(120), nullable=False)
    id_marca_refaccion = Column(Integer, ForeignKey("refacciones_marcas.id_marca_refaccion"), nullable=True)
    comentario = Column(Text, nullable=True)

    proveedor = relationship("Proveedor", back_populates="productos")


class Refaccion(TenantMixin, Base):
    __tablename__ = "refacciones"

    id_refaccion = Column(Integer, primary_key=True, index=True)
    id_marca_refaccion = Column(Integer, ForeignKey("refacciones_marcas.id_marca_refaccion"), nullable=True)
    id_proveedor = Column(Integer, ForeignKey("proveedores.id_proveedor"), nullable=True)
    nombre_refaccion = Column(String(150), nullable=False)
    numero_refaccion = Column(String(60), nullable=True)
    categoria = Column(String(80), nullable=True)      # ej. "Frenos", "Motor" — texto libre: se agrupan solas por coincidir
    subcategoria = Column(String(80), nullable=True)    # ej. "Balatas", "Discos"
    preciopropio_refaccion = Column(Float, default=0)
    preciocliente_refaccion = Column(Float, default=0)
    cantidad_refaccion = Column(Integer, default=0)  # stock
    fecha_refaccion = Column(Date, default=date.today)
    # Umbrales configurables por refacción (cada una se mueve distinto: 10
    # piezas puede ser "mucho" para una y "poco" para otra), en vez de un
    # límite fijo igual para todo el inventario.
    umbral_naranja = Column(Integer, default=4)  # a partir de aquí, alerta amarilla
    umbral_rojo = Column(Integer, default=1)      # a partir de aquí, alerta crítica

    # Datos de Inventario (aparte del alta básica): se capturan/editan una
    # vez que la refacción ya existe, desde el módulo de Inventario.
    posicion = Column(String(40), nullable=True)  # delantero/trasero/izquierdo/derecho, etc.
    id_marca_vehiculo_compatible = Column(Integer, ForeignKey("vehiculos_marcas.id_marca_vehiculo"), nullable=True)
    id_modelo_vehiculo_compatible = Column(Integer, ForeignKey("vehiculos_modelos.id_modelo_vehiculo"), nullable=True)
    sku_interno = Column(String(60), nullable=True)
    codigo_barras = Column(String(60), nullable=True)  # UPC/EAN
    ubicacion_fisica = Column(String(80), nullable=True)  # ej. "Pasillo 3 - Estante B - Nivel 2"
    zona_abc = Column(String(1), nullable=True)  # "A" (rota mucho) / "B" / "C" (rota poco)

    marca_vehiculo_compatible = relationship("VehiculoMarca", foreign_keys=[id_marca_vehiculo_compatible])
    modelo_vehiculo_compatible = relationship("VehiculoModelo", foreign_keys=[id_modelo_vehiculo_compatible])
    compatibilidades = relationship("RefaccionCompatibilidad", cascade="all, delete-orphan")


class RefaccionCompatibilidad(TenantMixin, Base):
    """Una refacción puede servir para más de un vehículo — cada fila es
    una marca+modelo extra con la que es compatible (además de la marca y
    modelo únicos que ya trae el modelo Refaccion)."""
    __tablename__ = "refacciones_compatibilidades"

    id_compatibilidad = Column(Integer, primary_key=True, index=True)
    id_refaccion = Column(Integer, ForeignKey("refacciones.id_refaccion"), nullable=False)
    id_marca_vehiculo = Column(Integer, ForeignKey("vehiculos_marcas.id_marca_vehiculo"), nullable=False)
    id_modelo_vehiculo = Column(Integer, ForeignKey("vehiculos_modelos.id_modelo_vehiculo"), nullable=True)

    marca_vehiculo = relationship("VehiculoMarca", foreign_keys=[id_marca_vehiculo])
    modelo_vehiculo = relationship("VehiculoModelo", foreign_keys=[id_modelo_vehiculo])


class ProveedorDeuda(TenantMixin, Base):
    __tablename__ = "proveedor_deuda"

    id_deuda = Column(Integer, primary_key=True, index=True)
    id_proveedor = Column(Integer, ForeignKey("proveedores.id_proveedor"), nullable=False)
    id_producto_proveedor = Column(Integer, ForeignKey("proveedor_productos.id_producto_proveedor"), nullable=True)
    monto_total = Column(Float, default=0)
    saldo_total = Column(Float, default=0)
    cantidad_producto = Column(Integer, default=0)
    comentario = Column(Text, nullable=True)
    fecha = Column(Date, default=date.today)

    proveedor = relationship("Proveedor", back_populates="deudas")


class HerramientaInventario(TenantMixin, Base):
    __tablename__ = "herramientas_inventario"

    id_herramienta = Column(Integer, primary_key=True, index=True)
    id_herramienta_marca = Column(Integer, ForeignKey("herramientas_marcas.id_herramienta_marca"), nullable=True)
    nombre_herramienta = Column(String(120), nullable=False)
    medida_herramienta = Column(String(50), nullable=True)
    cantidad_herramienta = Column(Integer, default=0)
    factura_herramienta = Column(String(60), nullable=True)
    modelo_herramienta = Column(String(60), nullable=True)
    foto_herramienta = Column(String(255), nullable=True)
    costo_herramienta = Column(Float, default=0)
    comentario = Column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Servicios (órdenes de trabajo)
# ---------------------------------------------------------------------------
class Servicio(TenantMixin, Base):
    __tablename__ = "servicios"

    id_servicio = Column(Integer, primary_key=True, index=True)
    # Nulos solo mientras la orden es un "borrador" recién abierta: el cliente y
    # el vehículo se eligen (o se dan de alta) desde la propia pantalla de la orden.
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"), nullable=True)
    id_vehiculo = Column(Integer, ForeignKey("vehiculos.id_vehiculo"), nullable=True)
    nombre_servicio = Column(String(150), nullable=False)  # descripción del servicio
    km_llegada = Column(String(20), nullable=True)
    km_proximo_servicio = Column(String(20), nullable=True)
    fecha_entrada_servicio = Column(DateTime, default=datetime.utcnow)
    fecha_salida_servicio = Column(DateTime, nullable=True)
    status = Column(String(20), default="abierto")  # abierto, cerrado, cancelado
    etapa = Column(String(30), default="recibido")  # ver ETAPAS_SERVICIO — progreso dentro de "abierto"
    pagado = Column(Boolean, default=False)
    iva_porcentaje = Column(Float, default=0.0)  # sin IVA automático

    # Captura de intake (alta de la orden): diagnóstico inicial, tipo de
    # mantenimiento general, lista de operaciones a realizar, y la
    # confirmación de que el cliente autorizó el servicio (con código).
    diagnostico = Column(Text, nullable=True)
    id_tipo_mantenimiento = Column(Integer, ForeignKey("tipos_servicio.id_tipo_servicio"), nullable=True)
    operaciones = Column(Text, nullable=True)
    comentarios_finales = Column(Text, nullable=True)  # notas de cierre, para el ticket que se lleva el cliente
    autorizado_cliente = Column(Boolean, default=False)
    codigo_confirmacion = Column(String(10), nullable=True)  # el código de 4 dígitos que se usó para confirmar
    fecha_autorizacion = Column(DateTime, nullable=True)

    # Reclamación de garantía: si el auto vuelve a fallar por algo
    # relacionado, esta orden nueva queda ligada a la original en vez de
    # perderse como un servicio suelto sin relación — así se puede ver el
    # historial completo de "esto ya se tocó antes".
    es_garantia = Column(Boolean, default=False)
    id_servicio_original = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=True)
    motivo_garantia = Column(Text, nullable=True)

    # A quién del taller se le asigna como responsable de este servicio —
    # es lo que alimenta el dashboard personal de cada empleado.
    id_empleado_responsable = Column(Integer, ForeignKey("empleados.id_empleado"), nullable=True)

    cliente = relationship("Cliente", back_populates="servicios")
    vehiculo = relationship("Vehiculo", back_populates="servicios")
    empleado_responsable = relationship("Empleado", back_populates="servicios_responsable")
    tipo_mantenimiento = relationship("TipoServicio")
    tipos_mantenimiento = relationship("TipoServicio", secondary="servicio_tipos_mantenimiento")
    detalles = relationship("ServicioDetalle", back_populates="servicio", cascade="all, delete-orphan")
    abonos = relationship("ServicioAbono", back_populates="servicio", cascade="all, delete-orphan")
    servicio_original = relationship("Servicio", remote_side=[id_servicio], foreign_keys=[id_servicio_original])
    historial_etapas = relationship("ServicioEtapaHistorial", back_populates="servicio", cascade="all, delete-orphan", order_by="ServicioEtapaHistorial.fecha")


class ServicioEtapaHistorial(TenantMixin, Base):
    """Bitácora de cada cambio de etapa de un servicio — es la base para el
    seguimiento en tiempo real que vera el cliente más adelante (punto 4)."""
    __tablename__ = "servicios_etapa_historial"

    id_registro = Column(Integer, primary_key=True, index=True)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=False)
    etapa = Column(String(30), nullable=False)
    comentario = Column(String(255), nullable=True)
    fecha = Column(DateTime, default=datetime.utcnow)
    actualizado_por = Column(String(50), nullable=True)  # username

    servicio = relationship("Servicio", back_populates="historial_etapas")


class ServicioDetalle(TenantMixin, Base):
    __tablename__ = "servicios_detalles"

    id_servicio_detalle = Column(Integer, primary_key=True, index=True)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=False)
    id_tipo_servicio = Column(Integer, ForeignKey("tipos_servicio.id_tipo_servicio"), nullable=True)
    id_refaccion = Column(Integer, ForeignKey("refacciones.id_refaccion"), nullable=True)  # legado — se deja por compatibilidad con órdenes viejas
    id_inventario_refaccion = Column(Integer, ForeignKey("inventario_refacciones.id_inventario_refaccion"), nullable=True)  # de dónde se descontó el stock (marca+modelo específico)
    descripcion = Column(String(255), nullable=True)
    cantidad = Column(Integer, default=1)  # piezas de la refacción usadas en este concepto
    costo_mano_obra = Column(Float, default=0)
    costo_refaccion = Column(Float, default=0)
    costo_extra = Column(Float, default=0)
    fecha_detalle = Column(DateTime, default=datetime.utcnow)

    servicio = relationship("Servicio", back_populates="detalles")
    refaccion = relationship("Refaccion")
    inventario_refaccion = relationship("InventarioRefaccion")


class Cotizacion(TenantMixin, Base):
    """Presupuesto/estimado — como una orden, pero sin cliente ni vehículo
    ligados: sirve para cuando alguien solo pregunta cuánto costaría algo,
    antes de comprometerse a dejar el auto. Se puede imprimir con los
    datos del taller, igual que un recibo."""
    __tablename__ = "cotizaciones"

    id_cotizacion = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(150), nullable=False)  # ej. "Afinación mayor Nissan Versa 2018"
    iva_porcentaje = Column(Float, default=16)
    comentarios = Column(Text, nullable=True)
    fecha_cotizacion = Column(DateTime, default=datetime.utcnow)
    vigente_hasta = Column(DateTime, nullable=True)

    detalles = relationship("CotizacionDetalle", back_populates="cotizacion", cascade="all, delete-orphan")


class CotizacionDetalle(TenantMixin, Base):
    __tablename__ = "cotizaciones_detalles"

    id_cotizacion_detalle = Column(Integer, primary_key=True, index=True)
    id_cotizacion = Column(Integer, ForeignKey("cotizaciones.id_cotizacion"), nullable=False)
    id_tipo_servicio = Column(Integer, ForeignKey("tipos_servicio.id_tipo_servicio"), nullable=True)
    id_refaccion = Column(Integer, ForeignKey("refacciones.id_refaccion"), nullable=True)
    descripcion = Column(String(255), nullable=True)
    cantidad = Column(Integer, default=1)
    costo_mano_obra = Column(Float, default=0)
    costo_refaccion = Column(Float, default=0)
    costo_extra = Column(Float, default=0)

    cotizacion = relationship("Cotizacion", back_populates="detalles")
    refaccion = relationship("Refaccion")


class ServicioAbono(TenantMixin, Base):
    """Pago / abono parcial sobre el total de un servicio (reemplaza
    ServiciosSinCobrar del sistema original con un modelo más simple:
    el saldo pendiente se calcula como total_servicio - suma(abonos))."""

    __tablename__ = "servicios_abonos"

    id_abono = Column(Integer, primary_key=True, index=True)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=False)
    numero_abono = Column(Integer, nullable=False)
    monto_abono = Column(Float, nullable=False)
    tipo_pago = Column(String(20), default="efectivo")  # efectivo | tarjeta | mixto
    desglose_mixto_efectivo = Column(Float, nullable=True)
    desglose_mixto_tarjeta = Column(Float, nullable=True)
    cambio = Column(Float, default=0)  # si el cliente pagó de más, lo que se le regresó
    fecha_pago = Column(DateTime, default=datetime.utcnow)
    comentario = Column(Text, nullable=True)

    servicio = relationship("Servicio", back_populates="abonos")


class ConfiguracionComision(TenantMixin, Base):
    """% de comisión por tipo de pago (Efectivo/Tarjeta/Mixto) — se usa para
    mostrar la comisión estimada en cada nota/recibo finalizado. Una sola
    fila por tipo_pago; se siembra con valores por defecto en seed.py."""

    __tablename__ = "configuracion_comisiones"

    tipo_pago = Column(String(20), primary_key=True)  # efectivo | tarjeta | mixto
    porcentaje = Column(Float, default=0)


class RecordatorioContactado(TenantMixin, Base):
    """Registra cuándo el taller ya avisó a un cliente que le toca volver
    (recordatorio de servicio recurrente por tiempo). `fecha_base` guarda
    la fecha de salida del último servicio que originó el aviso — si
    después hay un servicio más reciente, el recordatorio se vuelve a
    activar solo (el "ciclo" cambió), sin quedar oculto para siempre."""
    __tablename__ = "recordatorios_contactados"

    id_recordatorio = Column(Integer, primary_key=True, index=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"), nullable=False)
    id_vehiculo = Column(Integer, ForeignKey("vehiculos.id_vehiculo"), nullable=False)
    fecha_base = Column(DateTime, nullable=False)
    fecha_contactado = Column(DateTime, default=datetime.utcnow)
    contactado_por = Column(String(50), nullable=True)


class MensajeChat(TenantMixin, Base):
    """Chat en vivo entre el cliente y el taller, por orden de servicio.
    `tipo='alerta'` es el botón de aviso urgente del cliente al mecánico —
    mismo canal, se distingue solo para resaltarlo distinto en pantalla."""
    __tablename__ = "mensajes_chat"

    id_mensaje = Column(Integer, primary_key=True, index=True)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=False, index=True)
    autor_tipo = Column(String(10), nullable=False)  # "cliente" | "taller"
    autor_nombre = Column(String(100), nullable=True)
    tipo = Column(String(20), default="mensaje")  # "mensaje" | "alerta"
    texto = Column(Text, nullable=False)
    ruta_foto = Column(String(255), nullable=True)  # foto adjunta (dentro de app/uploads/)
    fecha = Column(DateTime, default=datetime.utcnow)


class Notificacion(TenantMixin, Base):
    """Avisos para el personal del taller — hoy solo se generan cuando un
    cliente escribe en el chat de su orden (mensaje o alerta urgente) desde
    su app, que antes solo se veía si alguien tenía esa orden abierta en
    ese momento. La campanita (mobile y web) las lee de aquí.

    Es compartida por todo el taller (no por usuario): "leída" se calcula
    comparando `fecha` contra `Usuario.notificaciones_vistas_hasta` de
    quien pregunta, en vez de guardar una fila de lectura por usuario —
    más simple, y suficiente para un equipo chico que comparte el mismo
    panel de órdenes."""
    __tablename__ = "notificaciones"

    id_notificacion = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(30), nullable=False)  # "chat_cliente" | "alerta_cliente"
    titulo = Column(String(150), nullable=False)
    mensaje = Column(String(300), nullable=True)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=True, index=True)
    fecha = Column(DateTime, default=datetime.utcnow, index=True)


class CitaSolicitada(TenantMixin, Base):
    """Una solicitud de cita hecha por el cliente desde su app — no crea la
    orden de servicio directamente; el taller la revisa y confirma o
    rechaza (así lo pediste: nada se agenda solo sin que el admin lo vea)."""
    __tablename__ = "citas_solicitadas"

    id_cita = Column(Integer, primary_key=True, index=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"), nullable=False)
    id_vehiculo = Column(Integer, ForeignKey("vehiculos.id_vehiculo"), nullable=True)
    id_tipo_servicio = Column(Integer, ForeignKey("tipos_servicio.id_tipo_servicio"), nullable=True)
    descripcion = Column(Text, nullable=True)
    fecha_propuesta = Column(DateTime, nullable=True)
    estado = Column(String(20), default="pendiente")  # pendiente | confirmada | rechazada
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    confirmada_por = Column(String(50), nullable=True)
    id_servicio_generado = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=True)

    cliente = relationship("Cliente")
    vehiculo = relationship("Vehiculo")
    tipo_servicio = relationship("TipoServicio")


# ---------------------------------------------------------------------------
# Inspección digital — checklist con fotos, antes/durante el servicio
# ---------------------------------------------------------------------------
class InspeccionItem(TenantMixin, Base):
    """Catálogo fijo de puntos a revisar (llantas, frenos, luces...). Se
    siembra una vez en seed.py; el dueño puede desactivar los que no use."""
    __tablename__ = "inspeccion_items"

    id_item = Column(Integer, primary_key=True, index=True)
    categoria = Column(String(60), nullable=False)  # ej. "Llantas", "Frenos"
    nombre_item = Column(String(120), nullable=False)  # ej. "Llanta delantera izquierda"
    orden = Column(Integer, default=0)
    activo = Column(Boolean, default=True)


class Inspeccion(TenantMixin, Base):
    """Una inspección completa de un vehículo — normalmente al recibirlo,
    antes o junto con crear la orden de servicio."""
    __tablename__ = "inspecciones"

    id_inspeccion = Column(Integer, primary_key=True, index=True)
    id_vehiculo = Column(Integer, ForeignKey("vehiculos.id_vehiculo"), nullable=False)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=True)  # puede no existir todavía
    fecha = Column(DateTime, default=datetime.utcnow)
    realizada_por = Column(String(50), nullable=True)  # username
    comentario_general = Column(Text, nullable=True)

    vehiculo = relationship("Vehiculo")
    servicio = relationship("Servicio")
    resultados = relationship("InspeccionResultado", back_populates="inspeccion", cascade="all, delete-orphan")


class InspeccionResultado(TenantMixin, Base):
    """El estado de un punto específico dentro de una inspección. Si se
    marca 'mal' y se liga a una refacción sugerida, desde ahí se puede
    armar el concepto de la orden sin tener que buscarla de nuevo."""
    __tablename__ = "inspeccion_resultados"

    id_resultado = Column(Integer, primary_key=True, index=True)
    id_inspeccion = Column(Integer, ForeignKey("inspecciones.id_inspeccion"), nullable=False)
    id_item = Column(Integer, ForeignKey("inspeccion_items.id_item"), nullable=False)
    estado = Column(String(10), default="bien")  # "bien" | "regular" | "mal"
    comentario = Column(String(255), nullable=True)
    id_refaccion_sugerida = Column(Integer, ForeignKey("refacciones.id_refaccion"), nullable=True)

    inspeccion = relationship("Inspeccion", back_populates="resultados")
    item = relationship("InspeccionItem")
    refaccion_sugerida = relationship("Refaccion")


# ---------------------------------------------------------------------------
# Promociones — se muestran en el inicio de la app de clientes
# ---------------------------------------------------------------------------
class Promocion(TenantMixin, Base):
    __tablename__ = "promociones"

    id_promocion = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(120), nullable=False)
    descripcion = Column(Text, nullable=True)
    link = Column(String(500), nullable=True)  # ej. para mandarlos a WhatsApp, una página, etc.
    ruta_imagen = Column(String(255), nullable=True)  # dentro de app/uploads/, igual que las fotos
    precio_promocion = Column(Float, nullable=True)
    precio_original = Column(Float, nullable=True)  # opcional, para mostrar el tachado con el descuento
    fecha_inicio = Column(Date, nullable=True)  # vigencia — si no se pone, se muestra siempre
    fecha_fin = Column(Date, nullable=True)
    activa = Column(Boolean, default=True)
    solo_nuevos_clientes = Column(Boolean, default=False)  # ej. "10% en tu primer servicio"
    orden = Column(Integer, default=0)  # para controlar en qué orden aparecen
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    creada_por = Column(String(50), nullable=True)


# ---------------------------------------------------------------------------
# Empleados — catálogo del taller (mecánicos, etc.), solo lo administra el
# Dueño. Un empleado PUEDE tener una cuenta de usuario ligada (id_usuario)
# para poder entrar a ver su propio dashboard — si no la tiene, sigue
# existiendo como registro de "quién es responsable de qué", nada más.
# ---------------------------------------------------------------------------
class Empleado(TenantMixin, Base):
    __tablename__ = "empleados"

    id_empleado = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    paterno = Column(String(100), nullable=True)
    materno = Column(String(100), nullable=True)
    telefono = Column(String(20), nullable=True)
    correo = Column(String(120), nullable=True)
    puesto = Column(String(80), nullable=True)  # ej. "Mecánico", "Hojalatero"
    fecha_ingreso = Column(Date, nullable=True)
    activo = Column(Boolean, default=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id_usuario"), nullable=True)  # opcional
    fecha_creacion = Column(DateTime, default=datetime.utcnow)

    # --- Nómina ---------------------------------------------------------
    sueldo_base = Column(Float, default=0)  # por periodo (según periodicidad_pago)
    periodicidad_pago = Column(String(20), default="quincenal")  # semanal | quincenal | mensual

    usuario = relationship("Usuario")
    servicios_responsable = relationship("Servicio", back_populates="empleado_responsable")
    recibos_nomina = relationship("ReciboNomina", back_populates="empleado")


# ---------------------------------------------------------------------------
# Nómina — periodos de pago y el recibo de cada empleado en ese periodo.
# El sueldo base vive en Empleado (es su dato "vigente"); al generar un
# periodo se copia ese sueldo al recibo, así que un cambio de sueldo
# después no altera recibos ya generados.
# ---------------------------------------------------------------------------
class PeriodoNomina(TenantMixin, Base):
    __tablename__ = "periodos_nomina"

    id_periodo = Column(Integer, primary_key=True, index=True)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    periodicidad = Column(String(20), default="quincenal")
    status = Column(String(20), default="abierto")  # abierto | pagado
    fecha_pago = Column(DateTime, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow)

    recibos = relationship("ReciboNomina", back_populates="periodo", cascade="all, delete-orphan")


class ReciboNomina(TenantMixin, Base):
    __tablename__ = "recibos_nomina"

    id_recibo = Column(Integer, primary_key=True, index=True)
    id_periodo = Column(Integer, ForeignKey("periodos_nomina.id_periodo"), nullable=False)
    id_empleado = Column(Integer, ForeignKey("empleados.id_empleado"), nullable=False)
    sueldo_base = Column(Float, default=0)
    bonos = Column(Float, default=0)
    bonos_nota = Column(String(255), nullable=True)
    deducciones = Column(Float, default=0)
    deducciones_nota = Column(String(255), nullable=True)
    total_pagar = Column(Float, default=0)
    pagado = Column(Boolean, default=False)
    fecha_pago = Column(DateTime, nullable=True)

    periodo = relationship("PeriodoNomina", back_populates="recibos")
    empleado = relationship("Empleado", back_populates="recibos_nomina")


# ---------------------------------------------------------------------------
# Configuración del taller — una sola fila. Nombre real, dirección,
# teléfono, RFC — lo que va en el encabezado de los documentos que se le
# entregan al cliente (recibo, nota de remisión). Antes esto estaba fijo
# como "Sistema Mecánico" en el propio PDF, sin reflejar el taller real.
# ---------------------------------------------------------------------------
class ConfiguracionTaller(TenantMixin, Base):
    __tablename__ = "configuracion_taller"

    id_configuracion = Column(Integer, primary_key=True, index=True)
    nombre_taller = Column(String(150), default="Mi Taller")
    direccion = Column(String(255), nullable=True)
    telefono = Column(String(20), nullable=True)
    correo = Column(String(120), nullable=True)
    rfc = Column(String(20), nullable=True)
    ruta_logo = Column(String(255), nullable=True)  # dentro de app/uploads/, igual que fotos/promociones
    cp = Column(String(5), nullable=True)
    calle = Column(String(150), nullable=True)
    numero_taller = Column(String(20), nullable=True)  # número exterior / de sucursal
    id_estado = Column(Integer, ForeignKey("estados.id_estado"), nullable=True)
    id_ciudad = Column(Integer, ForeignKey("ciudades.id_ciudad"), nullable=True)

    estado = relationship("Estado", foreign_keys=[id_estado])
    ciudad = relationship("Ciudad", foreign_keys=[id_ciudad])


# ---------------------------------------------------------------------------
# Super administración — catálogo de talleres/refaccionarias clientes de
# ALDM AutoCore, paquetes de suscripción y qué módulos incluye cada uno.
# Es el control del negocio SaaS en sí (quién paga, qué plan, qué módulos
# tiene habilitados), separado de ConfiguracionTaller (los datos del taller
# dueño de ESTA instalación, para sus propios documentos).
# ---------------------------------------------------------------------------

paquete_modulo = Table(
    "paquete_modulo",
    Base.metadata,
    Column("id_paquete", Integer, ForeignKey("paquetes.id_paquete"), primary_key=True),
    Column("id_modulo", Integer, ForeignKey("modulos.id_modulo"), primary_key=True),
)


class Modulo(Base):
    """Catálogo fijo de módulos del sistema (Órdenes de servicio, Inventario,
    Clientes, Reportes, etc.) — el mismo listado que se muestra en la página
    pública de módulos. Sirve para decidir qué trae cada paquete."""
    __tablename__ = "modulos"

    id_modulo = Column(Integer, primary_key=True, index=True)
    clave = Column(String(60), unique=True, nullable=False)  # ej. "inventario"
    nombre = Column(String(100), nullable=False)
    descripcion = Column(String(255), nullable=True)
    icono = Column(String(10), nullable=True)
    orden = Column(Integer, default=0)


class Paquete(Base):
    """Un plan de suscripción (Básico, Profesional, Premium, o uno
    personalizado) con un precio y el conjunto de módulos que incluye."""
    __tablename__ = "paquetes"

    id_paquete = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(80), unique=True, nullable=False)
    descripcion = Column(String(255), nullable=True)
    precio_mensual = Column(Float, default=0)
    ciclo_facturacion = Column(String(20), default="mensual")  # mensual | anual
    activo = Column(Boolean, default=True)
    limite_usuarios = Column(Integer, nullable=True)  # None = sin límite

    modulos = relationship("Modulo", secondary=paquete_modulo, backref="paquetes")
    suscripciones = relationship("Suscripcion", back_populates="paquete")
    precios = relationship("PrecioPaquete", back_populates="paquete", cascade="all, delete-orphan")


class PrecioPaquete(Base):
    """Precio de un paquete para un tipo de cobro (ej. Profesional anual =
    $14,990). Si no hay fila, el precio se calcula: mensual × meses −
    descuento del tipo de cobro."""
    __tablename__ = "precios_paquete"
    __table_args__ = (UniqueConstraint("id_paquete", "id_tipo_cobro", name="uq_precio_paquete_tipo"),)

    id_precio = Column(Integer, primary_key=True, index=True)
    id_paquete = Column(Integer, ForeignKey("paquetes.id_paquete"), nullable=False)
    id_tipo_cobro = Column(Integer, ForeignKey("tipos_cobro.id_tipo_cobro"), nullable=False)
    precio = Column(Float, nullable=False)

    paquete = relationship("Paquete", back_populates="precios")


class Taller(Base):
    """Un taller/refaccionaria cliente de ALDM AutoCore. Todos los datos
    operativos (clientes, órdenes, inventario…) cuelgan de aquí vía
    `id_taller` (ver tenancy.py). `codigo` es lo que va en el QR que el
    taller comparte con sus clientes para entrar a la app."""
    __tablename__ = "talleres"

    id_taller = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(40), unique=True, nullable=True, index=True)
    # Código secreto de un solo uso para que el dueño registre su usuario
    # administrador la primera vez (se borra al activar). No confundir con
    # `codigo`, que es público (va en el QR de los clientes).
    codigo_activacion = Column(String(12), nullable=True)
    nombre_comercial = Column(String(150), nullable=False)
    razon_social = Column(String(150), nullable=True)
    tipo_negocio = Column(String(20), default="taller")  # taller | refaccionaria | ambos
    contacto_nombre = Column(String(120), nullable=True)
    correo = Column(String(120), nullable=True)
    telefono = Column(String(20), nullable=True)
    ciudad = Column(String(100), nullable=True)
    estado_mx = Column(String(60), nullable=True)
    activo = Column(Boolean, default=True)
    notas = Column(Text, nullable=True)
    fecha_alta = Column(DateTime, default=datetime.utcnow)

    suscripcion = relationship("Suscripcion", back_populates="taller", uselist=False)


class TipoCobro(Base):
    """Forma de cobro capturable desde la app de súper administración
    (Mensual, Trimestral, Anual…): cuántos meses cubre cada pago y si lleva
    descuento sobre el precio mensual del paquete."""
    __tablename__ = "tipos_cobro"

    id_tipo_cobro = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(60), unique=True, nullable=False)
    meses = Column(Integer, nullable=False, default=1)
    descuento_porcentaje = Column(Float, default=0)
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)


class ConfiguracionSaaS(Base):
    """Una sola fila con las reglas del negocio, capturables desde la app
    de súper administración."""
    __tablename__ = "configuracion_saas"

    id_configuracion = Column(Integer, primary_key=True, index=True)
    dias_prueba = Column(Integer, default=15)
    dias_gracia = Column(Integer, default=5)  # después de vencer: solo consulta
    dias_conservacion = Column(Integer, default=90)  # suspendido: se guardan los datos
    dias_aviso_vencimiento = Column(Integer, default=7)
    id_paquete_prueba = Column(Integer, ForeignKey("paquetes.id_paquete"), nullable=True)
    id_taller_principal = Column(Integer, ForeignKey("talleres.id_taller"), nullable=True)

    paquete_prueba = relationship("Paquete", foreign_keys=[id_paquete_prueba])


class Suscripcion(Base):
    """LA suscripción de un taller (una sola por taller). Cada pago la
    renueva: se registra en PagoSuscripcion y se recorre fecha_vencimiento.

    estado (lo decide el súper administrador): prueba | activa | suspendida | cancelada
    El estado EFECTIVO (vigente / gracia / vencida) se calcula con las
    fechas y ConfiguracionSaaS — ver suscripciones.py."""
    __tablename__ = "suscripciones"

    id_suscripcion = Column(Integer, primary_key=True, index=True)
    id_taller = Column(Integer, ForeignKey("talleres.id_taller"), nullable=False)
    id_paquete = Column(Integer, ForeignKey("paquetes.id_paquete"), nullable=False)
    id_tipo_cobro = Column(Integer, ForeignKey("tipos_cobro.id_tipo_cobro"), nullable=True)
    estado = Column(String(20), default="prueba")
    fecha_inicio = Column(Date, default=date.today)
    fecha_vencimiento = Column(Date, nullable=True)
    precio_pactado = Column(Float, nullable=True)  # por periodo; None = precio de lista
    notas = Column(Text, nullable=True)
    fecha_suspension = Column(Date, nullable=True)

    taller = relationship("Taller", back_populates="suscripcion")
    paquete = relationship("Paquete", back_populates="suscripciones")
    tipo_cobro = relationship("TipoCobro")
    pagos = relationship("PagoSuscripcion", back_populates="suscripcion", order_by="desc(PagoSuscripcion.fecha_pago)")


class PagoSuscripcion(Base):
    """Historial de pagos/renovaciones de la suscripción de un taller."""
    __tablename__ = "pagos_suscripcion"

    id_pago = Column(Integer, primary_key=True, index=True)
    id_suscripcion = Column(Integer, ForeignKey("suscripciones.id_suscripcion"), nullable=False, index=True)
    id_taller = Column(Integer, ForeignKey("talleres.id_taller"), nullable=False, index=True)
    id_paquete = Column(Integer, ForeignKey("paquetes.id_paquete"), nullable=True)
    id_tipo_cobro = Column(Integer, ForeignKey("tipos_cobro.id_tipo_cobro"), nullable=True)
    fecha_pago = Column(DateTime, default=datetime.utcnow)
    monto = Column(Float, nullable=False, default=0)
    metodo_pago = Column(String(30), nullable=True)  # transferencia | efectivo | tarjeta | deposito | otro
    referencia = Column(String(120), nullable=True)
    periodo_desde = Column(Date, nullable=True)
    periodo_hasta = Column(Date, nullable=True)
    registrado_por = Column(String(50), nullable=True)
    notas = Column(Text, nullable=True)

    suscripcion = relationship("Suscripcion", back_populates="pagos")
    taller = relationship("Taller")
    paquete = relationship("Paquete")
    tipo_cobro = relationship("TipoCobro")


# ---------------------------------------------------------------------------
# Facturación electrónica (CFDI 4.0)
# ---------------------------------------------------------------------------

class ConfiguracionFiscal(TenantMixin, Base):
    """Una sola fila: datos del emisor y cómo se timbra. El certificado de
    sello digital (CSD) NO se guarda aquí — con Facturapi se carga en su
    panel; en modo "simulado" no se necesita."""
    __tablename__ = "configuracion_fiscal"

    id_configuracion_fiscal = Column(Integer, primary_key=True, index=True)
    proveedor = Column(String(20), default="simulado")  # simulado | facturapi
    rfc_emisor = Column(String(13), nullable=True)
    razon_social_emisor = Column(String(254), nullable=True)
    regimen_fiscal_emisor = Column(String(3), nullable=True)
    cp_expedicion = Column(String(5), nullable=True)
    serie = Column(String(10), default="A")
    folio_siguiente = Column(Integer, default=1)
    iva_porcentaje = Column(Float, default=16.0)
    clave_prod_serv_mano_obra = Column(String(8), default="78181500")  # mantenimiento y reparación de vehículos
    clave_prod_serv_refaccion = Column(String(8), default="01010101")  # ajústala al giro de tus refacciones
    clave_unidad_servicio = Column(String(3), default="E48")  # unidad de servicio
    clave_unidad_pieza = Column(String(3), default="H87")  # pieza


class Factura(TenantMixin, Base):
    """CFDI emitido. Se guarda una copia de los datos del receptor y de los
    conceptos tal como se timbraron — si después cambian en el catálogo de
    clientes, la factura ya emitida no debe cambiar."""
    __tablename__ = "facturas"

    id_factura = Column(Integer, primary_key=True, index=True)
    id_servicio = Column(Integer, ForeignKey("servicios.id_servicio"), nullable=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"), nullable=True)
    proveedor = Column(String(20), default="simulado")
    estado = Column(String(25), default="timbrada")  # timbrada | cancelacion_pendiente | cancelada | error
    serie = Column(String(10), nullable=True)
    folio = Column(Integer, nullable=True)
    uuid = Column(String(40), nullable=True, index=True)  # folio fiscal
    pac_id = Column(String(60), nullable=True)  # id del CFDI en el PAC (Facturapi)

    receptor_rfc = Column(String(13), nullable=False)
    receptor_nombre = Column(String(254), nullable=False)
    receptor_regimen = Column(String(3), nullable=False)
    receptor_cp = Column(String(5), nullable=False)
    receptor_correo = Column(String(120), nullable=True)
    uso_cfdi = Column(String(4), nullable=False)
    forma_pago = Column(String(2), nullable=False)
    metodo_pago = Column(String(3), default="PUE")

    conceptos_json = Column(Text, nullable=False)
    subtotal = Column(Float, default=0)
    iva = Column(Float, default=0)
    total = Column(Float, default=0)

    fecha_emision = Column(DateTime, default=datetime.utcnow)
    emitida_por = Column(String(50), nullable=True)
    motivo_cancelacion = Column(String(2), nullable=True)
    uuid_sustitucion = Column(String(40), nullable=True)
    fecha_cancelacion = Column(DateTime, nullable=True)
    ruta_pdf = Column(String(255), nullable=True)
    ruta_xml = Column(String(255), nullable=True)

    servicio = relationship("Servicio")
    cliente = relationship("Cliente")


class SolicitudContacto(Base):
    """Alguien que pidió información o una demo desde la página informativa
    (sitio-web). Es global (no pertenece a ningún taller): la atiende ALDM
    desde el panel de súper admin. Al llegar también se crea un aviso en la
    campanita del taller principal y se manda push a los súper admin."""
    __tablename__ = "solicitudes_contacto"

    id_solicitud = Column(Integer, primary_key=True, index=True)
    negocio = Column(String(120), nullable=False)
    nombre = Column(String(120), nullable=False)
    telefono = Column(String(30), nullable=False)
    correo = Column(String(120), nullable=True)
    mensaje = Column(String(280), nullable=True)
    fecha = Column(DateTime, default=datetime.utcnow, index=True)
    atendida = Column(Boolean, default=False)


class ErrorSistema(TenantMixin, Base):
    """Bitácora de errores por taller: cada error inesperado (servidor o app)
    queda con un código corto que el usuario le da a soporte."""
    __tablename__ = "errores_sistema"

    id_error = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), nullable=False, index=True)
    fecha = Column(DateTime, default=datetime.utcnow, index=True)
    origen = Column(String(20), nullable=False, default="servidor")  # servidor | app_movil | web
    metodo = Column(String(10), nullable=True)
    ruta = Column(String(255), nullable=True)
    status = Column(Integer, nullable=True)
    usuario = Column(String(50), nullable=True)
    mensaje = Column(String(500), nullable=True)
    detalle = Column(Text, nullable=True)
