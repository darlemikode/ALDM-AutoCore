// Zonas del auto (las 12 de la inspección), a qué zona va cada punto del checklist y cada refacción.
// Misma lógica que el panel web (components/AutoInspeccion.jsx y zonasRefaccion.js).
const quitaAcentos = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const ZONAS = {
  di: "Rueda delantera izquierda", dd: "Rueda delantera derecha", ti: "Rueda trasera izquierda", td: "Rueda trasera derecha",
  faros: "Faros y direccionales", motor: "Motor, fluidos y enfriamiento", transmision: "Transmisión y tracción",
  espejos: "Espejos", cabina: "Cabina y sistema eléctrico", cajuela: "Cajuela y carrocería", escape: "Escape", luces_t: "Luces traseras",
};

export function zonasDe(categoria, nombre) {
  const c = quitaAcentos(categoria), n = quitaAcentos(nombre);
  const lado = /izquierd/.test(n) ? "i" : /derech/.test(n) ? "d" : "";
  const del = /delanter/.test(n), tra = /traser/.test(n);
  if (/refaccion/.test(n) && /llanta/.test(n)) return ["cajuela"];
  if (c.startsWith("llantas") || c.startsWith("frenos") || c.startsWith("suspension")) {
    if (lado && tra) return [`t${lado}`];
    if (lado) return [`d${lado}`];
    if (tra) return ["ti", "td"];
    if (del) return ["di", "dd"];
    return c.startsWith("suspension") ? ["di", "dd"] : ["di", "dd", "ti", "td"];
  }
  if (c.startsWith("luces")) return /delanter|niebla|direccional/.test(n) ? ["faros"] : ["luces_t"];
  if (c.startsWith("enfriamiento")) return /aire acondicionado|compresor|cabina/.test(n) ? ["cabina"] : ["motor"];
  if (c.startsWith("fluidos")) return /transmision|diferencial/.test(n) ? ["transmision"] : ["motor"];
  if (c.startsWith("transmision")) return lado ? [`d${lado}`] : ["transmision"];
  if (c.startsWith("escape")) return ["escape"];
  if (c.startsWith("bateria")) return /bateria|alternador|marcha|fusibles/.test(n) ? ["motor"] : ["cabina"];
  if (c.startsWith("carroceria")) {
    if (/espejo/.test(n)) return ["espejos"];
    if (/cofre/.test(n)) return ["motor", "cajuela"];
    if (/plumas|defensas/.test(n)) return ["cajuela"];
    return ["cabina"];
  }
  return ["motor"]; // categoría "Motor" y cualquier punto nuevo
}

const GRAVEDAD = { bien: 1, regular: 2, mal: 3 };
/** Peor estado de una lista de estados ("bien" | "regular" | "mal"), o "ninguno" si está vacía. */
export const peorEstado = (estados) => estados.reduce((w, e) => ((GRAVEDAD[e] || 0) > (GRAVEDAD[w] || 0) ? e : w), "ninguno");


/**
 * Zonas del auto (claves de ZONAS) donde va una refacción, inferidas de su categoría, subcategoría,
 * posición y nombre. Sin categoría ni pista en el nombre devuelve [] ("Sin zona").
 */
export function zonasRefaccion(r) {
  const cat = quitaAcentos(r.categoria);
  const n = quitaAcentos([r.subcategoria, r.nombre_refaccion, r.posicion].filter(Boolean).join(" "));
  const t = `${cat} ${n}`;
  if (/embrague|clutch|diferencial|flecha|homocinetic|caja de cambios|transmision/.test(t) && !/aceite|filtro/.test(n)) return zonasDe("transmision", n);
  if (/\b(faro|foco|calavera|direccional|niebla|stop|luz|luces)\b/.test(n)) {
    return /calavera|traser|stop|reversa|placa/.test(n) ? ["luces_t"] : ["faros"];
  }
  if (/espejo/.test(n)) return ["espejos"];
  if (/escape|mofle|silenciador|catalizador/.test(t)) return ["escape"];
  if (/radiador|anticongel|termostato|ventilador|bomba de agua|refriger|enfria/.test(t)) return zonasDe("enfriamiento", n);
  if (/llanta|neumatic|\brin\b|\brines\b/.test(t)) return zonasDe("llantas", n);
  if (/freno|balata|disco|tambor|pastilla/.test(t)) return zonasDe("frenos", n);
  if (/suspension|amortiguador|rotula|terminal|resorte|brazo|buje/.test(t)) return zonasDe("suspension", n);
  if (/electric|bateria|alternador|marcha|fusible|bujia|sensor/.test(t)) return zonasDe("bateria", n);
  if (/aceite|lubric|fluido|liquido|filtro/.test(t)) return zonasDe("fluidos", n);
  if (/carroceria|cofre|cajuela|defensa|pluma|parabrisas|puerta|salpicadera/.test(t)) return zonasDe("carroceria", n);
  if (!cat) return [];
  return zonasDe(cat, n);
}
