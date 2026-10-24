import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * El contenido (.main) y la barra lateral (.sidebar) ahora tienen su
 * propio scroll independiente — por eso ya no sirve window.scrollTo,
 * hay que resetear el contenedor .main directamente.
 * También muestra un botón flotante para volver arriba cuando ya se bajó.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo(0, 0);
    setVisible(false);
  }, [pathname]);

  useEffect(() => {
    // El scroll no burbujea: se escucha en captura y se filtra por .main
    function alDesplazar(e) {
      const el = e.target;
      if (el && el.classList && el.classList.contains("main")) setVisible(el.scrollTop > 320);
    }
    document.addEventListener("scroll", alDesplazar, true);
    return () => document.removeEventListener("scroll", alDesplazar, true);
  }, []);

  function subir() {
    const reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".main")?.scrollTo({ top: 0, behavior: reducir ? "auto" : "smooth" });
  }

  return (
    <button type="button" className={`btn-subir ${visible ? "visible" : ""}`} onClick={subir} aria-label="Subir al inicio" title="Subir al inicio" tabIndex={visible ? 0 : -1}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
    </button>
  );
}
