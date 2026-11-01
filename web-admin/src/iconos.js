// Un solo lugar con el ícono de cada módulo — así la barra lateral y el
// título de cada página siempre usan el mismo, sin tener que repetirlo.
// Nombres de src/components/Icono.jsx — mismo lenguaje visual que los
// Ionicons "-outline" que usa la app móvil (ver mobile/src/screens/MasScreen.js).
export const ICONOS = {
  "/": "grid",
  "/mi-dashboard": "person-circle",
  "/servicios": "construct",
  "/cotizaciones": "document-text",
  "/citas": "calendar",
  "/clientes": "people",
  "/vehiculos": "car",
  "/refacciones": "cube",
  "/inventario": "file-tray",
  "/herramientas": "hammer",
  "/proveedores": "business",
  "/promociones": "pricetag",
  "/asistente": "sparkles",
  "/catalogos": "list",
  "/configuracion-taller": "storefront",
  "/comisiones": "card",
  "/suscripcion": "sparkles",
  "/sincronizacion": "sync",
  "/empleados": "id-card",
  "/usuarios": "key",
  "/asignacion-roles": "link",
  "/roles": "shield-check",
  "/facturacion": "document",
  "/nomina": "cash",
  "/superadmin": "shield-check",
  "/errores": "warning",
  "/configuracion": "settings",
};

// Color propio de cada módulo (insignia del menú lateral)
export const COLORES_ICONO = {
  "/": "#2de2d0",
  "/mi-dashboard": "#7aa8ff",
  "/servicios": "#ffb454",
  "/cotizaciones": "#c39bff",
  "/citas": "#ff8fb1",
  "/clientes": "#5ad1ff",
  "/vehiculos": "#ff7a6b",
  "/facturacion": "#6bdc8c",
  "/nomina": "#f2c94c",
  "/refacciones": "#ffcc4d",
  "/inventario": "#4dd6b0",
  "/herramientas": "#ff9d5c",
  "/proveedores": "#8ea2ff",
  "/errores": "#ff6b6b",
  "/promociones": "#ff8fd0",
  "/asistente": "#b48cff",
  "/superadmin": "#5ee0a0",
  "/catalogos": "#7fd6ff",
  "/configuracion-taller": "#ffd166",
  "/comisiones": "#7be07b",
  "/suscripcion": "#ffd166",
  "/sincronizacion": "#6bc4ff",
  "/empleados": "#ffa86b",
  "/usuarios": "#ffd166",
  "/asignacion-roles": "#a0b4ff",
  "/roles": "#6bdc8c",
  "/configuracion": "#9fb3ba",
};

// Ícono de cada módulo del sistema (por su clave), igual que en el menú lateral.
// No se usa el emoji guardado en la base: en SQL Server se guarda como "??".
const RUTA_MODULO = {
  ordenes_servicio: "/servicios", cotizaciones: "/cotizaciones", clientes_vehiculos: "/clientes",
  refacciones: "/refacciones", inventario: "/inventario", herramientas: "/herramientas",
  proveedores: "/proveedores", catalogos: "/catalogos", empleados: "/empleados", nomina: "/nomina",
  roles_permisos: "/roles", facturacion: "/facturacion",
};
const ICONO_MODULO_EXTRA = {
  reportes: { nombre: "chart", color: "#7aa8ff" },
  app_movil: { nombre: "phone", color: "#ff8fb1" },
  app_taller: { nombre: "phone", color: "#ff6b5f" },
  citas: { nombre: "calendar", color: "#6bc4ff" },
  promociones: { nombre: "pricetag", color: "#ffa86b" },
  seguimiento_qr: { nombre: "link", color: "#2de2d0" },
  inspeccion_digital: { nombre: "camera", color: "#c58bff" },
  chat_ordenes: { nombre: "chatbubble", color: "#6bdc8c" },
  comisiones: { nombre: "cash", color: "#7be07b" },
  auditoria: { nombre: "shield", color: "#ffd166" },
  notas_recibos: { nombre: "document", color: "#9fb3ba" },
};
export function iconoModuloSistema(clave) {
  if (ICONO_MODULO_EXTRA[clave]) return ICONO_MODULO_EXTRA[clave];
  const ruta = RUTA_MODULO[clave];
  return { nombre: (ruta && ICONOS[ruta]) || "puzzle", color: (ruta && COLORES_ICONO[ruta]) || "#e10600" };
}
