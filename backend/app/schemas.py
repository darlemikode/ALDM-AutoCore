from datetime import datetime, date
from typing import Annotated, Optional, List

from pydantic import AliasChoices, BeforeValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator


# Kilometraje: las apps lo mandan como número; se guarda como texto.
KmTexto = Annotated[Optional[str], BeforeValidator(lambda v: None if v is None or v == "" else str(v))]


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TallerAccesoOut(BaseModel):
    """Un taller al que el usuario puede entrar (para el selector)."""
    id_taller: int
    nombre: str
    codigo: Optional[str] = None
    rol: Optional[str] = None
    estado: Optional[str] = None
    bloqueado: bool = False
    mensaje: Optional[str] = None


class EstadoSuscripcionOut(BaseModel):
    estado: Optional[str] = None
    paquete: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    dias_restantes: Optional[int] = None
    solo_lectura: bool = False
    bloqueado: bool = False
    mensaje: Optional[str] = None
    modulos: Optional[List[str]] = None


class Token(ORMBase):
    access_token: str
    token_type: str = "bearer"
    nombre_completo: str
    username: str
    rol: str
    permisos: List[str] = []
    es_superadmin: bool = False
    id_taller: Optional[int] = None
    taller: Optional[str] = None
    codigo_taller: Optional[str] = None
    qr_taller: Optional[str] = None  # contenido del QR para la app de clientes
    talleres: List[TallerAccesoOut] = []
    estado_suscripcion: Optional[EstadoSuscripcionOut] = None


class SeleccionarTallerIn(BaseModel):
    id_taller: int


class VerificarActivacionIn(BaseModel):
    codigo_taller: str
    codigo_activacion: str


class ActivarTallerIn(VerificarActivacionIn):
    nombre_completo: str
    username: str
    password: str
    telefono: Optional[str] = None
    correo: Optional[str] = None


class TallerPublicoOut(BaseModel):
    id_taller: int
    codigo: Optional[str] = None
    nombre: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    ruta_logo: Optional[str] = None
    app_habilitada: bool = True
    disponible: bool = True


class LoginRequest(BaseModel):
    username: str
    password: str


class PermisoOut(ORMBase):
    id_permiso: int
    clave: str
    modulo: str
    descripcion: str


class RolResumenOut(ORMBase):
    """Versión ligera del rol, para anidar dentro de UsuarioOut sin mandar
    toda la lista de permisos cada vez que se pide un usuario."""
    id_rol: int
    nombre: str


class RolOut(ORMBase):
    id_rol: int
    nombre: str
    descripcion: Optional[str] = None
    es_sistema: bool
    permisos: List[PermisoOut] = []


class RolCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    permisos: List[str] = []  # claves de permiso, ej. ["clientes.ver", "clientes.crear"]


class RolUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    permisos: Optional[List[str]] = None


class UsuarioOut(ORMBase):
    id_usuario: int
    username: str
    nombre_completo: str
    id_rol: Optional[int] = None
    rol: Optional[RolResumenOut] = None
    # activo EN ESTE TALLER (un mismo usuario puede estar en varios)
    activo: bool = Field(validation_alias=AliasChoices("activo_en_taller", "activo"))
    telefono: Optional[str] = None
    correo: Optional[str] = None
    es_superadmin: bool = False

    @field_validator("es_superadmin", mode="before")
    @classmethod
    def _nulo_es_falso(cls, v):
        return bool(v)


class PerfilOut(UsuarioOut):
    """Como UsuarioOut, pero con la lista de permisos incluida — la usa
    /auth/me para que el panel sepa qué mostrar/ocultar sin tener que pedir
    el rol completo aparte."""
    permisos: List[str] = []
    id_taller: Optional[int] = None
    taller: Optional[str] = None
    codigo_taller: Optional[str] = None
    qr_taller: Optional[str] = None  # contenido del QR para la app de clientes
    talleres: List[TallerAccesoOut] = []
    estado_suscripcion: Optional[EstadoSuscripcionOut] = None


class UsuarioCreate(BaseModel):
    username: str
    password: str
    nombre_completo: str
    id_rol: int
    telefono: Optional[str] = None
    correo: Optional[str] = None


class UsuarioUpdate(BaseModel):
    nombre_completo: Optional[str] = None
    id_rol: Optional[int] = None
    telefono: Optional[str] = None
    correo: Optional[str] = None
    activo: Optional[bool] = None


class PasswordChange(BaseModel):
    password_actual: str
    password_nueva: str


class RecuperacionRequest(BaseModel):
    identificador: str  # usuario, correo o teléfono


class SolicitudRecuperacionOut(ORMBase):
    id_solicitud: int
    id_usuario: int
    identificador_usado: str
    fecha_solicitud: datetime
    atendida: bool
    fecha_atencion: Optional[datetime] = None
    atendida_por: Optional[str] = None
    usuario: Optional[UsuarioOut] = None


class TempPasswordOut(BaseModel):
    username: str
    password_temporal: str


# ---------------------------------------------------------------------------
# Catálogos simples
# ---------------------------------------------------------------------------
class PaisIn(BaseModel):
    nombre_pais: str
    activo: bool = True


class PaisOut(PaisIn, ORMBase):
    id_pais: int


class EstadoIn(BaseModel):
    nombre_estado: str
    id_pais: int
    activo: bool = True


class EstadoOut(EstadoIn, ORMBase):
    id_estado: int


class CiudadIn(BaseModel):
    nombre_ciudad: str
    id_estado: int
    activo: bool = True


class CiudadOut(CiudadIn, ORMBase):
    id_ciudad: int


class ConsultaCodigoPostal(BaseModel):
    cp: str
    estado: Optional[str] = None
    municipio: Optional[str] = None
    ciudad: Optional[str] = None
    colonias: List[str] = []


class FotoOut(ORMBase):
    id_foto: int
    entidad_tipo: str
    entidad_id: int
    ruta_archivo: str
    descripcion: Optional[str] = None
    fecha: datetime
    subida_por: Optional[str] = None


class ColorVehiculoIn(BaseModel):
    nombre_color: str


class ColorVehiculoOut(ColorVehiculoIn, ORMBase):
    id_color: int


class VehiculoMarcaIn(BaseModel):
    nombre_marca: str
    comentarios: Optional[str] = None


class VehiculoMarcaOut(VehiculoMarcaIn, ORMBase):
    id_marca_vehiculo: int


class VehiculoModeloIn(BaseModel):
    id_marca_vehiculo: int
    nombre_modelo: str
    comentario: Optional[str] = None


class VehiculoModeloOut(VehiculoModeloIn, ORMBase):
    id_modelo_vehiculo: int


class RefaccionMarcaIn(BaseModel):
    nombre_marca: str
    comentarios: Optional[str] = None


class RefaccionMarcaOut(RefaccionMarcaIn, ORMBase):
    id_marca_refaccion: int


class RefaccionCategoriaIn(BaseModel):
    nombre_categoria: str


class RefaccionCategoriaOut(RefaccionCategoriaIn, ORMBase):
    id_categoria_refaccion: int


class RefaccionSubcategoriaIn(BaseModel):
    id_categoria_refaccion: int
    nombre_subcategoria: str


class RefaccionSubcategoriaOut(RefaccionSubcategoriaIn, ORMBase):
    id_subcategoria_refaccion: int


class HerramientaMarcaIn(BaseModel):
    nombre_marca: str
    comentario: Optional[str] = None


class HerramientaMarcaOut(HerramientaMarcaIn, ORMBase):
    id_herramienta_marca: int


class TipoServicioIn(BaseModel):
    nombre_tipo: str


class TipoServicioOut(TipoServicioIn, ORMBase):
    id_tipo_servicio: int


# ---------------------------------------------------------------------------
# Clientes / Vehículos
# ---------------------------------------------------------------------------
class ClienteIn(BaseModel):
    nombre_cliente: str
    paterno_cliente: Optional[str] = None
    materno_cliente: Optional[str] = None
    calle_cliente: Optional[str] = None
    numexterior_cliente: Optional[str] = None
    numinterior_cliente: Optional[str] = None
    colonia_cliente: Optional[str] = None
    cp_cliente: Optional[str] = None
    telefono1: Optional[str] = None
    telefono2: Optional[str] = None
    id_ciudad: Optional[int] = None
    id_estado: Optional[int] = None
    id_pais: Optional[int] = None
    empresa_cliente: Optional[str] = None
    rfc_cliente: Optional[str] = None
    correo_cliente: Optional[str] = None
    comentarios: Optional[str] = None
    status_cliente: int = 1


class ClienteOut(ClienteIn, ORMBase):
    id_cliente: int
    numero_cuenta: str
    cuenta_activada: bool = False


class InvitacionOut(BaseModel):
    codigo_invitacion: str
    telefono1: Optional[str] = None
    correo_cliente: Optional[str] = None


class AccesoClienteOut(BaseModel):
    """Usuario (identificador de acceso) y contraseña temporal generados
    para que el cliente entre directo a la app, sin pasar por el código
    de invitación de un solo uso."""
    identificador: str
    password_temporal: str


class VehiculoIn(BaseModel):
    id_modelo_vehiculo: Optional[int] = None
    id_marca_vehiculo: Optional[int] = None
    id_cliente: int
    numserie_vehiculo: Optional[str] = None
    placas_vehiculo: Optional[str] = None
    id_color: Optional[int] = None
    cilindraje_vehiculo: Optional[str] = None
    id_year_vehiculo: Optional[str] = None
    km_vehiculo: Optional[str] = None
    comentarios: Optional[str] = None
    estado_vehiculo: str = "activo"  # "activo" | "vendido"


class VehiculoOut(VehiculoIn, ORMBase):
    id_vehiculo: int
    numero_cuenta: str
    marca: Optional[VehiculoMarcaOut] = None
    modelo: Optional[VehiculoModeloOut] = None
    color: Optional[ColorVehiculoOut] = None


class VehiculoConClienteOut(VehiculoOut):
    cliente: Optional[ClienteOut] = None


# ---------------------------------------------------------------------------
# Proveedores / Refacciones / Herramientas
# ---------------------------------------------------------------------------
class ProveedorIn(BaseModel):
    nombre_proveedor: str
    calle_proveedor: Optional[str] = None
    numexterior_proveedor: Optional[str] = None
    numinterior_proveedor: Optional[str] = None
    colonia_proveedor: Optional[str] = None
    telefono1_proveedor: Optional[str] = None
    telefono2_proveedor: Optional[str] = None
    correo_proveedor: Optional[str] = None
    empresa_proveedor: Optional[str] = None
    rfc_proveedor: Optional[str] = None


class ProveedorOut(ProveedorIn, ORMBase):
    id_proveedor: int


class ProveedorProductoIn(BaseModel):
    id_proveedor: int
    nombre_producto: str
    id_marca_refaccion: Optional[int] = None
    comentario: Optional[str] = None


class ProveedorProductoCreate(BaseModel):
    """Para POST /proveedores/{id}/productos: el id_proveedor viene de la URL,
    no del body, así que aquí no se exige (evita un 422 innecesario)."""
    nombre_producto: str
    id_marca_refaccion: Optional[int] = None
    comentario: Optional[str] = None


class ProveedorProductoOut(ProveedorProductoIn, ORMBase):
    id_producto_proveedor: int


class RefaccionIn(BaseModel):
    id_marca_refaccion: Optional[int] = None
    id_proveedor: Optional[int] = None
    nombre_refaccion: str
    numero_refaccion: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    preciopropio_refaccion: float = 0
    preciocliente_refaccion: float = 0
    cantidad_refaccion: int = 0
    fecha_refaccion: Optional[date] = None
    umbral_naranja: int = 4
    umbral_rojo: int = 1
    posicion: Optional[str] = None
    id_marca_vehiculo_compatible: Optional[int] = None
    id_modelo_vehiculo_compatible: Optional[int] = None
    sku_interno: Optional[str] = None
    codigo_barras: Optional[str] = None
    ubicacion_fisica: Optional[str] = None
    zona_abc: Optional[str] = None


class RefaccionCompatibilidadIn(BaseModel):
    id_marca_vehiculo: int
    id_modelo_vehiculo: Optional[int] = None


class RefaccionCompatibilidadOut(RefaccionCompatibilidadIn, ORMBase):
    id_compatibilidad: int
    id_refaccion: int
    marca_vehiculo: Optional[VehiculoMarcaOut] = None
    modelo_vehiculo: Optional[VehiculoModeloOut] = None


class RefaccionOut(RefaccionIn, ORMBase):
    id_refaccion: int
    marca_vehiculo_compatible: Optional[VehiculoMarcaOut] = None
    modelo_vehiculo_compatible: Optional[VehiculoModeloOut] = None
    compatibilidades: List[RefaccionCompatibilidadOut] = []


class InventarioRefaccionCompatibilidadIn(BaseModel):
    id_inventario_refaccion: int
    id_marca_vehiculo: Optional[int] = None
    id_modelo_vehiculo: Optional[int] = None


class InventarioRefaccionCompatibilidadOut(InventarioRefaccionCompatibilidadIn, ORMBase):
    id_compatibilidad: int
    id_inventario_refaccion: int
    marca_vehiculo: Optional[VehiculoMarcaOut] = None
    modelo_vehiculo: Optional[VehiculoModeloOut] = None


class InventarioRefaccionIn(BaseModel):
    id_refaccion: int
    id_marca_refaccion: Optional[int] = None
    id_proveedor: Optional[int] = None
    numero_parte: Optional[str] = None
    cantidad: int = 0
    preciopropio: float = 0
    preciocliente: float = 0
    ubicacion_fisica: Optional[str] = None
    umbral_naranja: int = 4
    umbral_rojo: int = 1


class InventarioRefaccionOut(InventarioRefaccionIn, ORMBase):
    id_inventario_refaccion: int
    id_refaccion: Optional[int] = None  # se relaja aquí (solo lectura) por si quedó algún registro viejo sin este dato al migrar
    refaccion: Optional[RefaccionOut] = None
    marca_refaccion: Optional[RefaccionMarcaOut] = None
    proveedor: Optional[ProveedorOut] = None
    compatibilidades: List[InventarioRefaccionCompatibilidadOut] = []


class ProveedorDeudaIn(BaseModel):
    id_proveedor: int
    id_producto_proveedor: Optional[int] = None
    monto_total: float = 0
    saldo_total: float = 0
    cantidad_producto: int = 0
    comentario: Optional[str] = None
    fecha: Optional[date] = None


class ProveedorDeudaCreate(BaseModel):
    """Para POST /proveedores/{id}/deudas: mismo caso que ProveedorProductoCreate."""
    id_producto_proveedor: Optional[int] = None
    monto_total: float = 0
    saldo_total: float = 0
    cantidad_producto: int = 0
    comentario: Optional[str] = None


class ProveedorDeudaOut(ProveedorDeudaIn, ORMBase):
    id_deuda: int


class HerramientaInventarioIn(BaseModel):
    id_herramienta_marca: Optional[int] = None
    nombre_herramienta: str
    medida_herramienta: Optional[str] = None
    cantidad_herramienta: int = 0
    factura_herramienta: Optional[str] = None
    modelo_herramienta: Optional[str] = None
    foto_herramienta: Optional[str] = None
    costo_herramienta: float = 0
    comentario: Optional[str] = None


class HerramientaInventarioOut(HerramientaInventarioIn, ORMBase):
    id_herramienta: int


# ---------------------------------------------------------------------------
# Servicios (órdenes de trabajo)
# ---------------------------------------------------------------------------
class ServicioDetalleIn(BaseModel):
    id_tipo_servicio: Optional[int] = None
    id_refaccion: Optional[int] = None
    descripcion: Optional[str] = None
    cantidad: int = 1
    costo_mano_obra: float = 0
    costo_refaccion: float = 0
    costo_extra: float = 0


class ServicioDetalleUpdate(BaseModel):
    """Edición en línea de un concepto ya agregado — solo los montos y la
    descripción; no se permite reasignar la refacción ligada aquí (eso ya
    movió stock al crearse el concepto, cambiarla después se presta a
    inconsistencias del inventario)."""
    descripcion: Optional[str] = None
    cantidad: Optional[int] = None
    costo_mano_obra: Optional[float] = None
    costo_refaccion: Optional[float] = None
    costo_extra: Optional[float] = None


class ServicioDetalleOut(ServicioDetalleIn, ORMBase):
    id_servicio_detalle: int
    id_servicio: int
    id_inventario_refaccion: Optional[int] = None
    fecha_detalle: datetime


class CotizacionDetalleIn(BaseModel):
    id_tipo_servicio: Optional[int] = None
    id_refaccion: Optional[int] = None
    descripcion: Optional[str] = None
    cantidad: int = 1
    costo_mano_obra: float = 0
    costo_refaccion: float = 0
    costo_extra: float = 0


class CotizacionDetalleUpdate(BaseModel):
    descripcion: Optional[str] = None
    cantidad: Optional[int] = None
    costo_mano_obra: Optional[float] = None
    costo_refaccion: Optional[float] = None
    costo_extra: Optional[float] = None


class CotizacionDetalleOut(CotizacionDetalleIn, ORMBase):
    id_cotizacion_detalle: int
    id_cotizacion: int


class CotizacionCostos(BaseModel):
    subtotal: float
    iva: float
    total: float


class CotizacionIn(BaseModel):
    titulo: str
    iva_porcentaje: float = 16
    comentarios: Optional[str] = None
    vigente_hasta: Optional[datetime] = None


class CotizacionUpdate(BaseModel):
    titulo: Optional[str] = None
    iva_porcentaje: Optional[float] = None
    comentarios: Optional[str] = None
    vigente_hasta: Optional[datetime] = None


class CotizacionOut(CotizacionIn, ORMBase):
    id_cotizacion: int
    fecha_cotizacion: datetime


class CotizacionCompletaOut(CotizacionOut):
    detalles: List[CotizacionDetalleOut] = []
    costos: CotizacionCostos = CotizacionCostos(subtotal=0, iva=0, total=0)


class ServicioAbonoIn(BaseModel):
    monto_abono: float
    tipo_pago: str = "efectivo"  # efectivo | tarjeta | mixto
    desglose_mixto_efectivo: Optional[float] = None
    desglose_mixto_tarjeta: Optional[float] = None
    comentario: Optional[str] = None


class ServicioAbonoOut(ServicioAbonoIn, ORMBase):
    id_abono: int
    id_servicio: int
    numero_abono: int
    cambio: float = 0
    fecha_pago: datetime


class ConfiguracionComisionOut(BaseModel):
    tipo_pago: str
    porcentaje: float


class ConfiguracionComisionIn(BaseModel):
    porcentaje: float


class ServicioIn(BaseModel):
    id_cliente: int
    id_vehiculo: int
    nombre_servicio: str
    km_llegada: KmTexto = None
    km_proximo_servicio: KmTexto = None
    iva_porcentaje: float = 0.0  # sin IVA automático; se aplica desde la orden si el cliente lo pide
    diagnostico: Optional[str] = None
    id_tipo_mantenimiento: Optional[int] = None
    tipos_mantenimiento_ids: List[int] = []  # múltiples tipos por orden — id_tipo_mantenimiento se conserva por compatibilidad
    operaciones: Optional[str] = None
    comentarios_finales: Optional[str] = None
    autorizado_cliente: bool = False
    codigo_confirmacion: Optional[str] = None
    es_garantia: bool = False
    id_servicio_original: Optional[int] = None
    motivo_garantia: Optional[str] = None
    id_empleado_responsable: Optional[int] = None


class ServicioUpdate(BaseModel):
    nombre_servicio: Optional[str] = None
    km_llegada: KmTexto = None
    km_proximo_servicio: KmTexto = None
    status: Optional[str] = None
    pagado: Optional[bool] = None
    iva_porcentaje: Optional[float] = None
    fecha_salida_servicio: Optional[datetime] = None
    diagnostico: Optional[str] = None
    id_tipo_mantenimiento: Optional[int] = None
    tipos_mantenimiento_ids: Optional[List[int]] = None
    id_empleado_responsable: Optional[int] = None
    operaciones: Optional[str] = None
    comentarios_finales: Optional[str] = None


class ServicioOut(ORMBase):
    id_servicio: int
    id_cliente: int
    id_vehiculo: int
    nombre_servicio: str
    km_llegada: KmTexto = None
    km_proximo_servicio: KmTexto = None
    fecha_entrada_servicio: datetime
    fecha_salida_servicio: Optional[datetime] = None
    status: str
    etapa: str = "recibido"
    pagado: bool
    iva_porcentaje: float
    diagnostico: Optional[str] = None
    id_tipo_mantenimiento: Optional[int] = None
    operaciones: Optional[str] = None
    comentarios_finales: Optional[str] = None
    autorizado_cliente: bool = False
    fecha_autorizacion: Optional[datetime] = None
    es_garantia: bool = False
    id_servicio_original: Optional[int] = None
    motivo_garantia: Optional[str] = None
    id_empleado_responsable: Optional[int] = None


class EtapaHistorialOut(ORMBase):
    id_registro: int
    etapa: str
    comentario: Optional[str] = None
    fecha: datetime
    actualizado_por: Optional[str] = None


class ActualizarEtapaIn(BaseModel):
    etapa: str
    comentario: Optional[str] = None


class ServicioCostos(BaseModel):
    subtotal: float
    iva: float
    total: float
    total_abonado: float
    saldo_pendiente: float


class ServicioCompletoOut(ServicioOut):
    cliente: Optional[ClienteOut] = None
    vehiculo: Optional[VehiculoOut] = None
    detalles: List[ServicioDetalleOut] = []
    abonos: List[ServicioAbonoOut] = []
    historial_etapas: List[EtapaHistorialOut] = []
    tipos_mantenimiento: List[TipoServicioOut] = []
    # Placeholder: no existe como columna en el modelo, así que necesita un
    # valor por defecto para que model_validate(servicio) no falle. El router
    # siempre lo sobreescribe con el valor calculado real antes de responder.
    costos: ServicioCostos = ServicioCostos(subtotal=0, iva=0, total=0, total_abonado=0, saldo_pendiente=0)
    # Igual que costos: se llena solo al cerrar la orden, si alguna
    # refacción usada quedó en nivel bajo/crítico de stock.
    alertas_stock: List[dict] = []


class ProximoServicioOut(BaseModel):
    """Un cliente/vehículo que ya lleva tiempo sin volver — candidato a
    recordatorio de servicio recurrente."""
    id_cliente: int
    id_vehiculo: int
    nombre_cliente: str
    telefono1: Optional[str] = None
    placas_vehiculo: Optional[str] = None
    numero_cuenta_vehiculo: str
    fecha_ultimo_servicio: datetime
    dias_desde_ultimo_servicio: int
    km_proximo_servicio: KmTexto = None


# ---------------------------------------------------------------------------
# Portal de clientes (app aparte, cuenta separada de los usuarios del taller)
# ---------------------------------------------------------------------------
class PushTokenIn(BaseModel):
    push_token: str


class ChatbotVerificarIn(BaseModel):
    numero_cuenta: str
    vin: str


class ChatbotSesionOut(BaseModel):
    token: str
    nombre_cliente: str
    cuenta_activada: bool


class ChatbotRespuestaOut(BaseModel):
    texto: str
    datos: dict = {}


class ActivarCuentaIn(BaseModel):
    identificador: str  # teléfono o correo con el que está registrado
    codigo_invitacion: str
    password_nueva: str


class ClienteLoginIn(BaseModel):
    identificador: str
    password: str


class ClienteTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id_cliente: int
    nombre_cliente: str


class ClientePerfilOut(ORMBase):
    id_cliente: int
    numero_cuenta: str
    nombre_cliente: str
    paterno_cliente: Optional[str] = None
    telefono1: Optional[str] = None
    correo_cliente: Optional[str] = None


class MensajeChatIn(BaseModel):
    texto: str
    tipo: str = "mensaje"  # "mensaje" | "alerta"


class MensajeChatOut(ORMBase):
    id_mensaje: int
    id_servicio: int
    autor_tipo: str
    autor_nombre: Optional[str] = None
    tipo: str
    texto: str
    ruta_foto: Optional[str] = None
    fecha: datetime


class NotificacionOut(ORMBase):
    id_notificacion: int
    tipo: str
    titulo: str
    mensaje: Optional[str] = None
    id_servicio: Optional[int] = None
    fecha: datetime
    leida: bool = False


class ConteoNotificacionesOut(BaseModel):
    no_leidas: int


class CitaIn(BaseModel):
    id_vehiculo: Optional[int] = None
    id_tipo_servicio: Optional[int] = None
    descripcion: Optional[str] = None
    fecha_propuesta: Optional[datetime] = None


class CitaOut(ORMBase):
    id_cita: int
    id_cliente: int
    id_vehiculo: Optional[int] = None
    id_tipo_servicio: Optional[int] = None
    descripcion: Optional[str] = None
    fecha_propuesta: Optional[datetime] = None
    estado: str
    fecha_creacion: datetime
    confirmada_por: Optional[str] = None
    id_servicio_generado: Optional[int] = None
    cliente: Optional[ClienteOut] = None
    vehiculo: Optional[VehiculoOut] = None


# ---------------------------------------------------------------------------
# Inspección digital
# ---------------------------------------------------------------------------
class InspeccionItemOut(ORMBase):
    id_item: int
    categoria: str
    nombre_item: str
    orden: int
    activo: bool


class InspeccionResultadoIn(BaseModel):
    id_item: int
    estado: str = "bien"  # "bien" | "regular" | "mal"
    comentario: Optional[str] = None
    id_refaccion_sugerida: Optional[int] = None


class InspeccionResultadoOut(ORMBase):
    id_resultado: int
    id_item: int
    estado: str
    comentario: Optional[str] = None
    id_refaccion_sugerida: Optional[int] = None
    item: InspeccionItemOut


class InspeccionIn(BaseModel):
    id_vehiculo: int
    id_servicio: Optional[int] = None
    comentario_general: Optional[str] = None
    resultados: List[InspeccionResultadoIn] = []


class InspeccionOut(ORMBase):
    id_inspeccion: int
    id_vehiculo: int
    id_servicio: Optional[int] = None
    fecha: datetime
    realizada_por: Optional[str] = None
    comentario_general: Optional[str] = None
    resultados: List[InspeccionResultadoOut] = []
    vehiculo: Optional[VehiculoOut] = None


# ---------------------------------------------------------------------------
# Promociones
# ---------------------------------------------------------------------------
class PromocionIn(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    link: Optional[str] = None
    precio_promocion: Optional[float] = None
    precio_original: Optional[float] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    activa: bool = True
    solo_nuevos_clientes: bool = False
    orden: int = 0


class PromocionOut(PromocionIn, ORMBase):
    id_promocion: int
    ruta_imagen: Optional[str] = None
    fecha_creacion: datetime
    creada_por: Optional[str] = None


# ---------------------------------------------------------------------------
# Empleados
# ---------------------------------------------------------------------------
class EmpleadoIn(BaseModel):
    nombre: str
    paterno: Optional[str] = None
    materno: Optional[str] = None
    telefono: Optional[str] = None
    correo: Optional[str] = None
    puesto: Optional[str] = None
    fecha_ingreso: Optional[date] = None
    activo: bool = True
    id_usuario: Optional[int] = None
    sueldo_base: float = 0
    periodicidad_pago: str = "quincenal"


class EmpleadoOut(EmpleadoIn, ORMBase):
    id_empleado: int
    fecha_creacion: datetime


# ---------------------------------------------------------------------------
# Nómina
# ---------------------------------------------------------------------------
class ReciboNominaOut(ORMBase):
    id_recibo: int
    id_periodo: int
    id_empleado: int
    sueldo_base: float
    bonos: float
    bonos_nota: Optional[str] = None
    deducciones: float
    deducciones_nota: Optional[str] = None
    total_pagar: float
    pagado: bool
    fecha_pago: Optional[datetime] = None
    empleado: Optional[EmpleadoOut] = None


class ReciboNominaUpdate(BaseModel):
    bonos: float = 0
    bonos_nota: Optional[str] = None
    deducciones: float = 0
    deducciones_nota: Optional[str] = None


class PeriodoNominaIn(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    periodicidad: str = "quincenal"


class PeriodoNominaOut(ORMBase):
    id_periodo: int
    fecha_inicio: date
    fecha_fin: date
    periodicidad: str
    status: str
    fecha_pago: Optional[datetime] = None
    fecha_creacion: datetime
    recibos: list[ReciboNominaOut] = []


class DashboardEmpleadoOut(BaseModel):
    nombre_empleado: str
    servicios_abiertos: int
    servicios_cerrados_mes: int
    servicios_totales: int
    servicios_recientes: list  # lista simple de dicts, no requiere schema propio


# ---------------------------------------------------------------------------
# Configuración del taller
# ---------------------------------------------------------------------------
class ConfiguracionTallerIn(BaseModel):
    nombre_taller: str = "Mi Taller"
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    correo: Optional[str] = None
    rfc: Optional[str] = None
    cp: Optional[str] = None
    calle: Optional[str] = None
    numero_taller: Optional[str] = None
    id_estado: Optional[int] = None
    id_ciudad: Optional[int] = None


class ConfiguracionTallerOut(ConfiguracionTallerIn, ORMBase):
    id_configuracion: int
    ruta_logo: Optional[str] = None
    estado: Optional[EstadoOut] = None
    ciudad: Optional[CiudadOut] = None


# ---------------------------------------------------------------------------
# Super administración — talleres clientes, paquetes/módulos, suscripciones
# ---------------------------------------------------------------------------
class ModuloOut(ORMBase):
    id_modulo: int
    clave: str
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    orden: int = 0


class ModuloCreate(BaseModel):
    clave: str
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    orden: int = 0


class ModuloUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    orden: Optional[int] = None


class PrecioPaqueteIO(ORMBase):
    id_tipo_cobro: int
    precio: float


class PaqueteOut(ORMBase):
    id_paquete: int
    nombre: str
    descripcion: Optional[str] = None
    precio_mensual: float = 0
    ciclo_facturacion: str = "mensual"
    activo: bool = True
    limite_usuarios: Optional[int] = None
    modulos: List[ModuloOut] = []
    precios: List[PrecioPaqueteIO] = []


class PaqueteCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    precio_mensual: float = 0
    ciclo_facturacion: str = "mensual"
    activo: bool = True
    limite_usuarios: Optional[int] = None
    modulos: List[str] = []  # claves de módulo
    precios: List[PrecioPaqueteIO] = []  # precio fijo por tipo de cobro (opcional)


class PaqueteUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    precio_mensual: Optional[float] = None
    ciclo_facturacion: Optional[str] = None
    activo: Optional[bool] = None
    limite_usuarios: Optional[int] = None
    modulos: Optional[List[str]] = None
    precios: Optional[List[PrecioPaqueteIO]] = None


class TipoCobroOut(ORMBase):
    id_tipo_cobro: int
    nombre: str
    meses: int
    descuento_porcentaje: float = 0
    activo: bool = True
    orden: int = 0


class TipoCobroIn(BaseModel):
    nombre: str
    meses: int = Field(ge=1, le=60)
    descuento_porcentaje: float = Field(default=0, ge=0, le=100)
    activo: bool = True
    orden: int = 0


class ConfiguracionSaaSOut(ORMBase):
    dias_prueba: int
    dias_gracia: int
    dias_conservacion: int
    dias_aviso_vencimiento: int
    id_paquete_prueba: Optional[int] = None
    id_taller_principal: Optional[int] = None


class ConfiguracionSaaSIn(BaseModel):
    dias_prueba: int = Field(ge=0, le=365)
    dias_gracia: int = Field(ge=0, le=365)
    dias_conservacion: int = Field(ge=0, le=3650)
    dias_aviso_vencimiento: int = Field(default=7, ge=0, le=90)
    id_paquete_prueba: Optional[int] = None


class SuscripcionDetalleOut(ORMBase):
    id_suscripcion: int
    id_paquete: int
    id_tipo_cobro: Optional[int] = None
    estado: str
    fecha_inicio: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    precio_pactado: Optional[float] = None
    notas: Optional[str] = None
    paquete: Optional[PaqueteOut] = None
    tipo_cobro: Optional[TipoCobroOut] = None


class SuscripcionUpdate(BaseModel):
    id_paquete: Optional[int] = None
    id_tipo_cobro: Optional[int] = None
    estado: Optional[str] = None  # prueba | activa | suspendida | cancelada
    fecha_vencimiento: Optional[date] = None
    precio_pactado: Optional[float] = None
    quitar_precio_pactado: bool = False
    notas: Optional[str] = None


class EstadoTallerOut(BaseModel):
    estado: str
    bloqueado: bool = False
    solo_lectura: bool = False
    dias_restantes: Optional[int] = None
    fecha_vencimiento: Optional[date] = None
    fin_gracia: Optional[date] = None
    fecha_depuracion: Optional[date] = None
    para_depurar: bool = False
    mensaje: Optional[str] = None


class UsoTallerOut(BaseModel):
    usuarios_activos: int = 0
    clientes: int = 0
    vehiculos: int = 0
    ordenes_mes: int = 0
    ordenes_total: int = 0
    ultima_actividad: Optional[datetime] = None


class TallerOut(ORMBase):
    id_taller: int
    codigo: Optional[str] = None
    nombre_comercial: str
    razon_social: Optional[str] = None
    tipo_negocio: str = "taller"
    contacto_nombre: Optional[str] = None
    correo: Optional[str] = None
    telefono: Optional[str] = None
    ciudad: Optional[str] = None
    estado_mx: Optional[str] = None
    activo: bool = True
    notas: Optional[str] = None
    fecha_alta: datetime
    qr: Optional[str] = None
    pendiente_activacion: bool = False  # todavía nadie registró su administrador
    codigo_activacion: Optional[str] = None
    suscripcion: Optional[SuscripcionDetalleOut] = None
    estado: Optional[EstadoTallerOut] = None
    uso: Optional[UsoTallerOut] = None
    precio_periodo: Optional[float] = None


class AdminTallerIn(BaseModel):
    nombre_completo: str
    username: str
    password: Optional[str] = None  # si el usuario ya existe, se liga sin cambiarle la contraseña
    correo: Optional[str] = None
    telefono: Optional[str] = None


class TallerCreate(BaseModel):
    nombre_comercial: str
    codigo: Optional[str] = None
    razon_social: Optional[str] = None
    tipo_negocio: str = "taller"
    contacto_nombre: Optional[str] = None
    correo: Optional[str] = None
    telefono: Optional[str] = None
    ciudad: Optional[str] = None
    estado_mx: Optional[str] = None
    notas: Optional[str] = None
    id_paquete: Optional[int] = None
    id_tipo_cobro: Optional[int] = None
    en_prueba: bool = True
    admin: Optional[AdminTallerIn] = None  # vacío = el dueño lo registra al entrar la primera vez


class TallerUpdate(BaseModel):
    nombre_comercial: Optional[str] = None
    codigo: Optional[str] = None
    razon_social: Optional[str] = None
    tipo_negocio: Optional[str] = None
    contacto_nombre: Optional[str] = None
    correo: Optional[str] = None
    telefono: Optional[str] = None
    ciudad: Optional[str] = None
    estado_mx: Optional[str] = None
    activo: Optional[bool] = None
    notas: Optional[str] = None


class PagoSuscripcionOut(ORMBase):
    id_pago: int
    id_taller: int
    fecha_pago: datetime
    monto: float
    metodo_pago: Optional[str] = None
    referencia: Optional[str] = None
    periodo_desde: Optional[date] = None
    periodo_hasta: Optional[date] = None
    registrado_por: Optional[str] = None
    notas: Optional[str] = None
    paquete: Optional[PaqueteOut] = None
    tipo_cobro: Optional[TipoCobroOut] = None
    taller: Optional["TallerMiniOut"] = None


class TallerMiniOut(ORMBase):
    id_taller: int
    nombre_comercial: str
    codigo: Optional[str] = None


class RenovarIn(BaseModel):
    id_tipo_cobro: Optional[int] = None
    id_paquete: Optional[int] = None
    monto: Optional[float] = None  # None = precio calculado
    metodo_pago: str = "transferencia"
    referencia: Optional[str] = None
    notas: Optional[str] = None


class SuspenderIn(BaseModel):
    motivo: Optional[str] = None


class MembresiaOut(ORMBase):
    id_usuario_taller: int
    id_taller: int
    id_rol: int
    activo: bool
    taller: Optional[TallerMiniOut] = None
    rol: Optional[RolResumenOut] = None


class UsuarioGlobalOut(ORMBase):
    id_usuario: int
    username: str
    nombre_completo: str
    activo: bool
    telefono: Optional[str] = None
    correo: Optional[str] = None
    es_superadmin: bool = False
    membresias: List[MembresiaOut] = []

    @field_validator("es_superadmin", mode="before")
    @classmethod
    def _nulo_es_falso(cls, v):
        return bool(v)


class MembresiaIn(BaseModel):
    id_taller: int
    id_rol: Optional[int] = None  # None = Administrador General del taller
    activo: bool = True


class UsuarioGlobalCreate(BaseModel):
    username: str
    password: str
    nombre_completo: str
    telefono: Optional[str] = None
    correo: Optional[str] = None
    es_superadmin: bool = False
    membresias: List[MembresiaIn] = []


class UsuarioGlobalUpdate(BaseModel):
    nombre_completo: Optional[str] = None
    telefono: Optional[str] = None
    correo: Optional[str] = None
    es_superadmin: Optional[bool] = None
    activo: Optional[bool] = None
    password: Optional[str] = None


class RolTallerOut(ORMBase):
    id_rol: int
    nombre: str
    es_sistema: bool = False


class SerieMesOut(BaseModel):
    mes: str
    ingresos: float
    pagos: int


class VencimientoOut(BaseModel):
    id_taller: int
    nombre_comercial: str
    estado: str
    fecha_vencimiento: Optional[date] = None
    dias_restantes: Optional[int] = None
    precio_periodo: Optional[float] = None


class ResumenSuperAdminOut(BaseModel):
    total_talleres: int
    vigentes: int
    en_prueba: int
    en_gracia: int
    vencidos: int
    suspendidos: int
    por_vencer: int
    para_depurar: int
    ingresos_mes: float
    ingresos_mes_anterior: float
    ingreso_mensual_recurrente: float
    talleres_por_paquete: dict
    ingresos_por_mes: List[SerieMesOut] = []
    proximos_vencimientos: List[VencimientoOut] = []
    usuarios_totales: int = 0
    ordenes_mes_total: int = 0


# ---------------------------------------------------------------------------
# Facturación electrónica (CFDI 4.0)
# ---------------------------------------------------------------------------
class ConfiguracionFiscalOut(ORMBase):
    proveedor: str = "simulado"
    rfc_emisor: Optional[str] = None
    razon_social_emisor: Optional[str] = None
    regimen_fiscal_emisor: Optional[str] = None
    cp_expedicion: Optional[str] = None
    serie: str = "A"
    folio_siguiente: int = 1
    iva_porcentaje: float = 16.0
    clave_prod_serv_mano_obra: str = "78181500"
    clave_prod_serv_refaccion: str = "01010101"
    clave_unidad_servicio: str = "E48"
    clave_unidad_pieza: str = "H87"
    # Calculados (no se guardan): si hay llave de Facturapi y de qué tipo
    pac_llave_detectada: bool = False
    pac_modo: str = "simulado"  # simulado | pruebas | produccion


class ConfiguracionFiscalIn(BaseModel):
    proveedor: str = "simulado"
    rfc_emisor: Optional[str] = None
    razon_social_emisor: Optional[str] = None
    regimen_fiscal_emisor: Optional[str] = None
    cp_expedicion: Optional[str] = None
    serie: str = "A"
    folio_siguiente: int = 1
    iva_porcentaje: float = 16.0
    clave_prod_serv_mano_obra: str = "78181500"
    clave_prod_serv_refaccion: str = "01010101"
    clave_unidad_servicio: str = "E48"
    clave_unidad_pieza: str = "H87"


class ConceptoFactura(BaseModel):
    descripcion: str
    clave_prod_serv: str
    clave_unidad: str = "E48"
    unidad: Optional[str] = None
    cantidad: float = 1
    precio_unitario: float  # sin IVA


class ReceptorFactura(BaseModel):
    rfc: str
    nombre: str
    regimen_fiscal: str
    cp: str
    uso_cfdi: str = "G03"
    correo: Optional[str] = None


class FacturaIn(BaseModel):
    id_servicio: Optional[int] = None
    id_cliente: Optional[int] = None
    receptor: ReceptorFactura
    forma_pago: str = "01"
    metodo_pago: str = "PUE"
    iva_porcentaje: float = 16.0
    conceptos: List[ConceptoFactura]
    guardar_datos_cliente: bool = False  # copia los datos fiscales al catálogo de clientes


class CancelarFacturaIn(BaseModel):
    motivo: str  # 01 | 02 | 03 | 04
    uuid_sustitucion: Optional[str] = None


class FacturaOut(ORMBase):
    id_factura: int
    id_servicio: Optional[int] = None
    id_cliente: Optional[int] = None
    proveedor: str
    estado: str
    serie: Optional[str] = None
    folio: Optional[int] = None
    uuid: Optional[str] = None
    receptor_rfc: str
    receptor_nombre: str
    receptor_regimen: str
    receptor_cp: str
    receptor_correo: Optional[str] = None
    uso_cfdi: str
    forma_pago: str
    metodo_pago: str
    conceptos_json: str
    subtotal: float
    iva: float
    total: float
    fecha_emision: datetime
    emitida_por: Optional[str] = None
    motivo_cancelacion: Optional[str] = None
    uuid_sustitucion: Optional[str] = None
    fecha_cancelacion: Optional[datetime] = None


# --- Finalizar orden (cobro + cierre + nota + aviso al cliente) --------------
class FinalizarServicioIn(BaseModel):
    tipo_pago: Optional[str] = None  # efectivo | tarjeta | mixto (solo si hay saldo)
    monto_recibido: Optional[float] = None  # efectivo entregado / cargo a tarjeta
    desglose_mixto_efectivo: Optional[float] = None
    desglose_mixto_tarjeta: Optional[float] = None
    comentarios_finales: Optional[str] = None
    notificar_cliente: bool = True


class FinalizarServicioOut(BaseModel):
    servicio: ServicioCompletoOut
    cambio: float = 0
    notificaciones: dict = {}


PagoSuscripcionOut.model_rebuild()
