import { Icono } from "./Icono";
import { ICONOS, COLORES_ICONO } from "../iconos";

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
