import { BIENVENIDA } from "./bienvenida";

// Ayuda: recorridos con globos de texto, agrupados por módulo.
// pasos = función (nombre) => [...]  ·  sin pasos = "Próximamente".
// ruta: pantalla donde corre el recorrido · permiso: solo se lista a quien lo tenga.
export const AYUDA = [
  {
    modulo: "Primeros pasos", icono: "🚀", tutoriales: [
      { clave: "bienvenida", titulo: "Recorrido de bienvenida", desc: "Menú, panel, nueva orden, avisos y configuración.", ruta: "/", pasos: BIENVENIDA },
      { clave: "config-taller", titulo: "Configurar tu taller", desc: "Datos, logo, teléfonos, correos y datos fiscales.", permiso: "configuracion.editar" },
      { clave: "usuarios-alta", titulo: "Contraseña y usuarios", desc: "Cambiar tu contraseña y dar de alta usuarios con su rol.", permiso: "usuarios.ver" },
      { clave: "suscripcion", titulo: "Suscripción", desc: "Vencimiento, pagos y módulos adicionales.", permiso: "configuracion.editar" },
    ],
  },
  {
    modulo: "Órdenes de servicio", icono: "🔧", permiso: "servicios.ver", tutoriales: [
      { clave: "orden-nueva", titulo: "Nueva orden", desc: "Cliente → vehículo → crear." },
      { clave: "orden-refacciones", titulo: "Agregar refacciones", desc: "Selección múltiple, cantidades y categorías." },
      { clave: "orden-editar", titulo: "Editar precios y cantidades", desc: "Cambiar con Enter y quitar refacciones." },
      { clave: "orden-fechas", titulo: "Fechas y datos del vehículo", desc: "Entrada, salida y datos editables." },
      { clave: "orden-abonos", titulo: "Abonos y saldo", desc: "Registrar, pago mixto y borrar." },
      { clave: "orden-estatus", titulo: "Estatus, inspección y chat", desc: "Etapas, fotos de inspección y mensajes." },
      { clave: "orden-finalizar", titulo: "Finalizar y cobrar", desc: "Cobro, cambio, aviso al cliente y nota." },
      { clave: "orden-nota", titulo: "Nota de remisión", desc: "Vista previa, imprimir y enviar por WhatsApp." },
    ],
  },
  {
    modulo: "Cotizaciones y citas", icono: "📝", tutoriales: [
      { clave: "cotizaciones", titulo: "Cotizaciones", desc: "Crear y convertir en orden.", permiso: "cotizaciones.ver" },
      { clave: "citas", titulo: "Citas solicitadas", desc: "Confirmar y abrir la orden." },
    ],
  },
  {
    modulo: "Clientes y vehículos", icono: "👥", tutoriales: [
      { clave: "cliente-alta", titulo: "Alta de cliente", desc: "Campos obligatorios y código postal.", permiso: "clientes.ver" },
      { clave: "vehiculo-alta", titulo: "Alta de vehículo", desc: "Marca, modelo, km, VIN e historial.", permiso: "vehiculos.ver" },
      { clave: "cliente-app", titulo: "Invitar al cliente a la app", desc: "Código de activación.", permiso: "clientes.ver" },
    ],
  },
  {
    modulo: "Refacciones e inventario", icono: "📦", permiso: "refacciones.ver", tutoriales: [
      { clave: "refacciones", titulo: "Refacciones", desc: "Alta rápida, categorías y duplicados." },
      { clave: "inventario", titulo: "Inventario", desc: "Stock, umbrales de color y compatibilidades." },
      { clave: "proveedores", titulo: "Proveedores y deudas", desc: "Contactos, productos y pagos.", permiso: "proveedores.ver" },
      { clave: "herramientas", titulo: "Herramientas", desc: "Inventario de herramientas.", permiso: "herramientas.ver" },
    ],
  },
  {
    modulo: "Personal", icono: "👷", tutoriales: [
      { clave: "empleados", titulo: "Empleados", desc: "Personal y responsables de orden.", permiso: "empleados.ver" },
      { clave: "nomina", titulo: "Nómina", desc: "Periodos y recibos.", permiso: "nomina.ver" },
      { clave: "comisiones", titulo: "Comisiones", desc: "Porcentajes por tipo de pago.", permiso: "configuracion.editar" },
      { clave: "roles", titulo: "Roles y permisos", desc: "Qué puede hacer cada rol.", permiso: "roles.ver" },
    ],
  },
  {
    modulo: "Administración", icono: "🏢", tutoriales: [
      { clave: "facturacion", titulo: "Facturación CFDI", desc: "Configuración fiscal y timbrado.", permiso: "facturacion.ver" },
      { clave: "catalogos", titulo: "Catálogos generales", desc: "Listas de clientes, vehículos y refacciones.", permiso: "catalogos.ver" },
      { clave: "promociones", titulo: "Promociones", desc: "Lo que ven tus clientes en su app.", permiso: "promociones.ver" },
      { clave: "integraciones", titulo: "Integraciones", desc: "Llave para el agente de WhatsApp.", permiso: "configuracion.editar" },
    ],
  },
  {
    modulo: "Consulta", icono: "📊", tutoriales: [
      { clave: "panel", titulo: "Panel general y Mi dashboard", desc: "Indicadores del día." },
      { clave: "asistente", titulo: "Asistente", desc: "Códigos de falla y manuales." },
      { clave: "busqueda", titulo: "Búsqueda y atajos", desc: "Buscar sin acentos, filtros y teclado." },
    ],
  },
];

export function tutorialPorClave(clave) {
  for (const m of AYUDA) {
    const t = m.tutoriales.find((x) => x.clave === clave);
    if (t) return t;
  }
  return null;
}

// Abre un recorrido desde cualquier pantalla (lo escucha Layout)
export function abrirTutorial(clave) {
  window.dispatchEvent(new CustomEvent("sm:tutorial", { detail: { clave } }));
}

// Vistos en esta sesión (además de los que ya trae el usuario del servidor)
export const vistosSesion = new Set();
