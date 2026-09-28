import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * El contenido (.main) y la barra lateral (.sidebar) ahora tienen su
 * propio scroll independiente — por eso ya no sirve window.scrollTo,
 * hay que resetear el contenedor .main directamente.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.querySelector(".main")?.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
