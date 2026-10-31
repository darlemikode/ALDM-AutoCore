import { zonasDe } from "./AutoInspeccion";

const sa = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Zonas del auto (claves de ZONAS) donde va una refacción, inferidas de su categoría, subcategoría,
 * posición y nombre. Sin categoría ni pista en el nombre devuelve [] ("Sin zona").
 */
export function zonasRefaccion(r) {
  const cat = sa(r.categoria);
  const n = sa([r.subcategoria, r.nombre_refaccion, r.posicion].filter(Boolean).join(" "));
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
