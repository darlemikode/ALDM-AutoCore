import { createPortal } from "react-dom";

/**
 * Envuelve cualquier modal hecho a mano (los que no usan FormModal) para
 * que se pinte directo en <body>, no anidado dentro de la página. Sin
 * esto, en algunos navegadores (sobre todo móviles) el fondo oscuro se
 * queda atrapado dentro del contenedor de la página y no cubre toda la
 * pantalla — se ve como si la barra lateral o el resto del contenido
 * nunca se oscureciera.
 */
export default function ModalPortal({ children }) {
  return createPortal(children, document.body);
}
