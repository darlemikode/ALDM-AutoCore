// Presentación compartida de permisos (Roles y permisos + Asignación de roles):
// cada permiso se muestra como un ícono + un texto corto (Ver, Crear, Editar,
// Eliminar…); la descripción completa queda en el tooltip.

export const ACCIONES = {
  ver: { icono: "👁️", texto: "Ver" },
  crear: { icono: "➕", texto: "Crear" },
  editar: { icono: "✏️", texto: "Editar" },
  eliminar: { icono: "🗑️", texto: "Eliminar" },
  cancelar: { icono: "🚫", texto: "Cancelar" },
  configurar: { icono: "⚙️", texto: "Configurar" },
  ver_por_cobrar: { icono: "💰", texto: "Ver por cobrar" },
  ver_precios: { icono: "🏷️", texto: "Ver precios" },
};
const ORDEN = ["ver", "crear", "editar", "eliminar", "cancelar", "configurar"];

export const MODULOS = {
  clientes: { icono: "🧑", nombre: "Clientes" },
  vehiculos: { icono: "🚗", nombre: "Vehículos" },
  servicios: { icono: "🔧", nombre: "Órdenes de servicio" },
  cotizaciones: { icono: "🧾", nombre: "Cotizaciones" },
  refacciones: { icono: "⚙️", nombre: "Refacciones" },
  herramientas: { icono: "🛠️", nombre: "Herramientas" },
  proveedores: { icono: "🚚", nombre: "Proveedores" },
  catalogos: { icono: "📚", nombre: "Catálogos generales" },
  usuarios: { icono: "👤", nombre: "Usuarios" },
  promociones: { icono: "🏷️", nombre: "Promociones" },
  empleados: { icono: "👷", nombre: "Empleados" },
  nomina: { icono: "💵", nombre: "Nómina" },
  configuracion: { icono: "🏢", nombre: "Datos del taller" },
  roles: { icono: "🛡️", nombre: "Roles y permisos" },
  facturacion: { icono: "📑", nombre: "Facturación" },
  dashboard: { icono: "📊", nombre: "Panel" },
};

export const ICONO_ROL_BASE = {
  "Administrador General": "👑",
  "Jefe de Taller / Receptor": "🧰",
  "Asesor de Servicio / Caja": "🧾",
  "Técnico / Mecánico": "🔧",
};

export function infoModulo(modulo) {
  return MODULOS[modulo] || { icono: "🔹", nombre: modulo.charAt(0).toUpperCase() + modulo.slice(1) };
}

export function accionDe(permiso) {
  const accion = permiso.clave.split(".")[1] || "";
  return ACCIONES[accion] || { icono: "🔹", texto: accion.charAt(0).toUpperCase() + accion.slice(1) };
}

export function ordenarPermisos(lista) {
  const pos = (p) => {
    const i = ORDEN.indexOf(p.clave.split(".")[1]);
    return i === -1 ? 99 : i;
  };
  return [...lista].sort((a, b) => pos(a) - pos(b));
}

// "Ver catálogos generales (marcas, modelos…)" → "Catálogos generales (marcas, modelos…)"
export function detalleModulo(permisosModulo) {
  const d = permisosModulo.find((p) => p.clave.endsWith(".ver"))?.descripcion || permisosModulo[0]?.descripcion || "";
  const sinVerbo = d.replace(/^(Ver|Crear|Editar|Eliminar)\s+/i, "");
  const texto = sinVerbo.charAt(0).toUpperCase() + sinVerbo.slice(1);
  // Si solo repite el nombre del módulo, no aporta nada: no se muestra
  const nombre = infoModulo(permisosModulo[0]?.modulo || "").nombre;
  return texto.toLowerCase() === nombre.toLowerCase() ? "" : texto;
}

/** Mosaico de acciones de un módulo (ícono + texto corto). */
export function AccionesModulo({ permisosModulo, activos, editable, onAlternar }) {
  return (
    <div className="acciones-grid">
      {ordenarPermisos(permisosModulo).map((p) => {
        const a = accionDe(p);
        const on = activos.includes(p.clave);
        return (
          <label key={p.clave} className={`accion-tile ${on ? "accion-tile-on" : ""}`} title={p.descripcion}>
            <input type="checkbox" disabled={!editable} checked={on} onChange={() => onAlternar?.(p.clave)} />
            <span className="accion-tile-icono">{a.icono}</span>
            <span className="accion-tile-texto">{a.texto}</span>
            <span className="accion-tile-check">{on ? "✓" : ""}</span>
          </label>
        );
      })}
    </div>
  );
}
