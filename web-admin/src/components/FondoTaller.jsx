import { useState } from "react";
import { FONDO_TALLER_HTML } from "./fondoTallerHtml";
import "../pages/login-nuevo.css";

// Fondo animado de las pantallas de acceso (login y crear contraseña).
// Con "reducir movimiento" activado en el sistema no se dibuja nada animado.
export default function FondoTaller() {
  const [reducir] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (reducir) return null;
  return (
    <div className="lgn-capa" aria-hidden="true">
      <div className="lgn-haz" />
      <div dangerouslySetInnerHTML={{ __html: FONDO_TALLER_HTML }} />
    </div>
  );
}
