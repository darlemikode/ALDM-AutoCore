// Íconos y colores de cada módulo — los MISMOS que usa la web
// (web-admin/src/iconos.js), para que menú, "Más" y títulos se vean igual.
const M = (icono, color) => ({ icono, color });

export const MODULOS = {
  "Panel": M("grid-outline", "#2de2d0"),
  "Mi dashboard": M("person-circle-outline", "#7aa8ff"),
  "Órdenes de servicio": M("construct-outline", "#ffb454"),
  "Nueva orden": M("add-circle-outline", "#ffb454"),
  "Cotizaciones": M("document-text-outline", "#c39bff"),
  "Citas solicitadas": M("calendar-outline", "#ff8fb1"),
  "Clientes": M("people-outline", "#5ad1ff"),
  "Vehículos": M("car-outline", "#ff7a6b"),
  "Facturación": M("document-outline", "#6bdc8c"),
  "Nómina": M("cash-outline", "#f2c94c"),
  "Refacciones": M("cube-outline", "#ffcc4d"),
  "Inventario": M("file-tray-outline", "#4dd6b0"),
  "Herramientas": M("hammer-outline", "#ff9d5c"),
  "Proveedores": M("business-outline", "#8ea2ff"),
  "Promociones": M("pricetag-outline", "#ff8fd0"),
  "Asistente": M("sparkles-outline", "#b48cff"),
  "Asistente (chatbot)": M("sparkles-outline", "#b48cff"),
  "Catálogos": M("list-outline", "#7fd6ff"),
  "Datos del taller": M("storefront-outline", "#ffd166"),
  "Comisiones": M("card-outline", "#7be07b"),
  "Comisiones por tipo de pago": M("card-outline", "#7be07b"),
  "Empleados": M("id-card-outline", "#ffa86b"),
  "Usuarios": M("key-outline", "#ffd166"),
  "Usuarios de la aplicación": M("key-outline", "#ffd166"),
  "Roles y permisos": M("shield-checkmark-outline", "#6bdc8c"),
  "Errores del sistema": M("warning-outline", "#ff6b6b"),
};

export const moduloPorTitulo = (titulo) => MODULOS[titulo] || null;

// Color del módulo a partir del nombre de un ícono (con o sin "-outline").
const base = (n) => String(n || "").replace(/-outline$/, "");
const POR_ICONO = {};
Object.values(MODULOS).forEach((m) => { POR_ICONO[base(m.icono)] = m.color; });
Object.assign(POR_ICONO, { "person-add": "#5ad1ff", "call": "#5ad1ff", "construct": "#ffb454", "add-circle": "#ffb454", "file-tray-stacked": "#4dd6b0" });
export const colorPorIcono = (icono) => POR_ICONO[base(icono)] || null;
