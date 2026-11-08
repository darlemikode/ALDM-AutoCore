import { mostrarBienvenida, marcarVisto } from "./bienvenida";
import { abrirTour } from "../ui/Tour";
import { T } from "./modulos";

// Ayuda (Más → Ayuda): recorridos con globos de texto, agrupados por módulo.
// abrir = (user, navigation) => void  ·  sin abrir = "Próximamente".
// permiso: solo se lista a quien lo tenga.
export const AYUDA = [
  {
    modulo: "Primeros pasos", icono: "rocket-outline", tutoriales: [
      { clave: "bienvenida", titulo: "Recorrido de bienvenida", desc: "Barra de abajo, nueva orden, menú, avisos y Más.",
        abrir: (user, navigation) => { navigation.navigate("Panel"); setTimeout(() => mostrarBienvenida(user), 600); } },
      { clave: "config-taller", titulo: "Configurar tu taller", desc: "Datos, logo, teléfonos y correos.", permiso: "configuracion.editar" },
      { clave: "usuarios-alta", titulo: "Contraseña y usuarios", desc: "Cambiar tu contraseña y dar de alta usuarios.", permiso: "usuarios.ver" },
      { clave: "suscripcion", titulo: "Suscripción", desc: "Vencimiento, pagos y módulos adicionales.", permiso: "configuracion.editar" },
    ],
  },
  {
    modulo: "Órdenes de servicio", icono: "construct-outline", permiso: "servicios.ver", tutoriales: [
      { clave: "orden-nueva", titulo: "Nueva orden", desc: "Cliente → vehículo → crear." },
      { clave: "orden-refacciones", titulo: "Agregar refacciones", desc: "Selección múltiple, cantidades y categorías." },
      { clave: "orden-editar", titulo: "Editar precios y cantidades", desc: "Cambiar cantidades y quitar refacciones." },
      { clave: "orden-fechas", titulo: "Fechas y datos del vehículo", desc: "Entrada, salida y datos editables." },
      { clave: "orden-abonos", titulo: "Abonos y saldo", desc: "Registrar, pago mixto y borrar." },
      { clave: "orden-estatus", titulo: "Estatus, inspección y chat", desc: "Etapas, fotos y mensajes." },
      { clave: "orden-finalizar", titulo: "Finalizar y cobrar", desc: "Cobro, aviso al cliente y nota." },
      { clave: "orden-nota", titulo: "Nota de remisión", desc: "Vista previa y enviar por WhatsApp." },
    ],
  },
  {
    modulo: "Cotizaciones y citas", icono: "document-text-outline", tutoriales: [
      { clave: "cotizaciones", titulo: "Cotizaciones", desc: "Crear y convertir en orden.", permiso: "cotizaciones.ver" },
      { clave: "citas", titulo: "Citas solicitadas", desc: "Confirmar y abrir la orden." },
    ],
  },
  {
    modulo: "Clientes y vehículos", icono: "people-outline", tutoriales: [
      { clave: "cliente-alta", titulo: "Alta de cliente", desc: "Campos obligatorios y código postal.", permiso: "clientes.ver" },
      { clave: "vehiculo-alta", titulo: "Alta de vehículo", desc: "Marca, modelo, km, VIN e historial.", permiso: "vehiculos.ver" },
      { clave: "cliente-app", titulo: "Invitar al cliente a la app", desc: "Código de activación.", permiso: "clientes.ver" },
    ],
  },
  {
    modulo: "Refacciones e inventario", icono: "cube-outline", permiso: "refacciones.ver", tutoriales: [
      { clave: "refacciones", titulo: "Refacciones", desc: "Alta rápida, categorías y duplicados." },
      { clave: "inventario", titulo: "Inventario", desc: "Stock, umbrales de color y compatibilidades." },
      { clave: "proveedores", titulo: "Proveedores y deudas", desc: "Contactos, productos y pagos.", permiso: "proveedores.ver" },
      { clave: "herramientas", titulo: "Herramientas", desc: "Inventario de herramientas.", permiso: "herramientas.ver" },
    ],
  },
  {
    modulo: "Personal", icono: "id-card-outline", tutoriales: [
      { clave: "empleados", titulo: "Empleados", desc: "Personal y responsables de orden.", permiso: "empleados.ver" },
      { clave: "nomina", titulo: "Nómina", desc: "Periodos y recibos.", permiso: "nomina.ver" },
      { clave: "comisiones", titulo: "Comisiones", desc: "Porcentajes por tipo de pago.", permiso: "configuracion.editar" },
      { clave: "roles", titulo: "Roles y permisos", desc: "Qué puede hacer cada rol.", permiso: "roles.ver" },
    ],
  },
  {
    modulo: "Administración", icono: "business-outline", tutoriales: [
      { clave: "catalogos", titulo: "Catálogos generales", desc: "Marcas, modelos y listas que administra ALDM.", permiso: "catalogos.ver" },
      { clave: "promociones", titulo: "Promociones", desc: "Lo que ven tus clientes en su app.", permiso: "promociones.ver" },
    ],
  },
  {
    modulo: "Consulta", icono: "stats-chart-outline", tutoriales: [
      { clave: "panel", titulo: "Panel general", desc: "Indicadores del día." },
      { clave: "mi-dashboard", titulo: "Mi dashboard", desc: "Tus órdenes, comisiones y avance." },
      { clave: "asistente", titulo: "Asistente", desc: "Códigos de falla y manuales." },
      { clave: "busqueda", titulo: "Búsqueda y filtros", desc: "Buscar sin acentos, chips y barra A–Z." },
    ],
  },
  {
    modulo: "Solo en la app", icono: "phone-portrait-outline", tutoriales: [
      { clave: "sin-conexion", titulo: "Trabajar sin conexión", desc: "Qué se guarda y cómo se sincroniza." },
      { clave: "biometria", titulo: "Entrar con huella", desc: "Activar el desbloqueo con biometría." },
      { clave: "fotos", titulo: "Fotos con la cámara", desc: "En la orden y en la inspección." },
    ],
  },
];

// Pantalla a la que se navega antes de abrir cada recorrido: [ruta, parámetros]
const IR = {
  "config-taller": ["DatosTaller"], "usuarios-alta": ["Usuarios"],
  "orden-nueva": ["Servicio", { screen: "HistorialServicios" }], "orden-refacciones": ["Servicio", { screen: "HistorialServicios" }],
  "orden-editar": ["Servicio", { screen: "HistorialServicios" }], "orden-fechas": ["Servicio", { screen: "HistorialServicios" }],
  "orden-abonos": ["Servicio", { screen: "HistorialServicios" }], "orden-estatus": ["Servicio", { screen: "HistorialServicios" }],
  "orden-finalizar": ["Servicio", { screen: "HistorialServicios" }], "orden-nota": ["Servicio", { screen: "HistorialServicios" }],
  cotizaciones: ["Cotizaciones"], citas: ["Citas"],
  "cliente-alta": ["Clientes", { screen: "ClientesLista" }], "cliente-app": ["Clientes", { screen: "ClientesLista" }],
  "vehiculo-alta": ["Vehículos", { screen: "VehiculosLista" }],
  refacciones: ["Refacciones", { screen: "RefaccionesLista" }], inventario: ["InventarioLista"],
  proveedores: ["Proveedores"], herramientas: ["Herramientas"],
  empleados: ["Empleados"], nomina: ["Nomina"], comisiones: ["Comisiones"], roles: ["GestionRoles"],
  catalogos: ["Catálogos", { screen: "CatalogosLista" }], promociones: ["Promociones"],
  panel: ["Panel"], "mi-dashboard": ["MiDashboard"], asistente: ["Asistente"], busqueda: ["Clientes", { screen: "ClientesLista" }],
};

// Módulo del paquete que debe estar contratado para ver cada ayuda (sin entrada = siempre disponible)
const MODULO = {
  "orden-nueva": "ordenes_servicio", "orden-refacciones": "ordenes_servicio", "orden-editar": "ordenes_servicio", "orden-fechas": "ordenes_servicio",
  "orden-abonos": "ordenes_servicio", "orden-estatus": "ordenes_servicio", "orden-finalizar": "ordenes_servicio", "orden-nota": "ordenes_servicio",
  cotizaciones: "cotizaciones", citas: "citas", "cliente-alta": "clientes_vehiculos", "vehiculo-alta": "clientes_vehiculos", "cliente-app": "app_movil",
  refacciones: "refacciones", inventario: "inventario", proveedores: "proveedores", herramientas: "herramientas",
  empleados: "empleados", nomina: "nomina", comisiones: "comisiones", roles: "roles_permisos",
  catalogos: "catalogos", promociones: "promociones", "mi-dashboard": "empleados", asistente: "asistente_ia",
};
for (const m of AYUDA) for (const x of m.tutoriales) if (MODULO[x.clave]) x.modulo = MODULO[x.clave];

for (const m of AYUDA) {
  for (const x of m.tutoriales) {
    if (x.abrir || !T[x.clave]) continue;
    x.abrir = (user, navigation) => {
      const ir = IR[x.clave];
      if (ir) navigation.navigate(...ir);
      setTimeout(() => abrirTour(T[x.clave](), () => marcarVisto(user, x.clave)), ir ? 700 : 150);
    };
  }
}
