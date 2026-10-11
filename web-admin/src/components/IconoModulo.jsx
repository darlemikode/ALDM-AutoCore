import { Icono } from "./Icono";
import { ICONOS, COLORES_ICONO, iconoModuloSistema } from "../iconos";

// Insignia de color con el ícono del módulo — la misma que usa el menú lateral,
// para que el título de cada página se vea igual que su opción del menú.
export default function IconoModulo({ ruta, nombre, color, size = 22 }) {
  const ico = color || COLORES_ICONO[ruta] || "#2de2d0";
  return (
    <span className="h1-icono" style={{ "--ico": ico }}>
      <Icono nombre={nombre || ICONOS[ruta] || "grid"} size={size} />
    </span>
  );
}

// Insignia de un módulo del sistema por su clave (ordenes_servicio, nomina, …)
export function IconoModuloSistema({ clave, size = 18 }) {
  const { nombre, color } = iconoModuloSistema(clave);
  return (
    <span className="h1-icono icono-modulo-sis" style={{ "--ico": color }} aria-hidden="true">
      <Icono nombre={nombre} size={size} />
    </span>
  );
}
