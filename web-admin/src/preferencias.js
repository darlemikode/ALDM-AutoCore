// Avisos de confirmación que el usuario puede silenciar con "No volver a
// preguntar". Se guardan en este navegador (localStorage) y se vuelven a
// habilitar desde la barra lateral: ⚙️ Configuración → Avisos.
const CLAVE_STORAGE = "sm_avisos_omitidos";
const EVENTO = "sm-avisos-cambio";

export const AVISOS = {
  sin_inventario_orden: "Refacción sin inventario al agregarla a una orden",
};

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_STORAGE) || "[]");
  } catch {
    return [];
  }
}

export function avisoOmitido(clave) {
  return leer().includes(clave);
}

export function omitirAviso(clave, omitir = true) {
  const actuales = new Set(leer());
  if (omitir) actuales.add(clave);
  else actuales.delete(clave);
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify([...actuales]));
  } catch {
    /* almacenamiento no disponible: el aviso se seguirá mostrando */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function escucharAvisos(callback) {
  window.addEventListener(EVENTO, callback);
  return () => window.removeEventListener(EVENTO, callback);
}

// ---------------------------------------------------------------------------
// Tema oscuro y barra lateral compacta — mismo patrón que los avisos: se
// guardan en este navegador y cualquier componente (la barra lateral, la
// página de Configuración) puede leerlos y escuchar cuando cambian.
// ---------------------------------------------------------------------------
const CLAVE_TEMA = "sm_tema_oscuro";
const EVENTO_TEMA = "sm-tema-cambio";

export function temaOscuroActivo() {
  return localStorage.getItem(CLAVE_TEMA) === "true";
}

export function setTemaOscuro(activo) {
  try {
    localStorage.setItem(CLAVE_TEMA, activo ? "true" : "false");
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

export function escucharTema(callback) {
  window.addEventListener(EVENTO_TEMA, callback);
  return () => window.removeEventListener(EVENTO_TEMA, callback);
}

const CLAVE_SIDEBAR = "sm_sidebar_compacta";
const EVENTO_SIDEBAR = "sm-sidebar-cambio";

export function sidebarCompactaActiva() {
  return localStorage.getItem(CLAVE_SIDEBAR) === "true";
}

export function setSidebarCompacta(activa) {
  try {
    localStorage.setItem(CLAVE_SIDEBAR, activa ? "true" : "false");
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new Event(EVENTO_SIDEBAR));
}

export function escucharSidebar(callback) {
  window.addEventListener(EVENTO_SIDEBAR, callback);
  return () => window.removeEventListener(EVENTO_SIDEBAR, callback);
}

// Atajos de teclado (activados por defecto)
const CLAVE_ATAJOS = "sm_atajos";
const EVENTO_ATAJOS = "sm-atajos-cambio";

export function atajosActivos() {
  return localStorage.getItem(CLAVE_ATAJOS) !== "false";
}

export function setAtajosActivos(activo) {
  try {
    localStorage.setItem(CLAVE_ATAJOS, activo ? "true" : "false");
  } catch {
    /* almacenamiento no disponible */
  }
  window.dispatchEvent(new Event(EVENTO_ATAJOS));
}

export function escucharAtajos(callback) {
  window.addEventListener(EVENTO_ATAJOS, callback);
  return () => window.removeEventListener(EVENTO_ATAJOS, callback);
}
