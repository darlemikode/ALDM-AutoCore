import "./autoInspeccion.css";

// Cada punto del checklist se ubica en una o más zonas del auto (vista desde arriba).
const quitaAcentos = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const ZONAS = {
  di: { nombre: "Rueda delantera izquierda", pos: [[53, 94]] },
  dd: { nombre: "Rueda delantera derecha", pos: [[187, 94]] },
  ti: { nombre: "Rueda trasera izquierda", pos: [[53, 324]] },
  td: { nombre: "Rueda trasera derecha", pos: [[187, 324]] },
  faros: { nombre: "Faros y direccionales", pos: [[80, 32], [160, 32]] },
  motor: { nombre: "Motor, fluidos y enfriamiento", pos: [[120, 76]] },
  transmision: { nombre: "Transmisión y tracción", pos: [[120, 122]] },
  espejos: { nombre: "Espejos", pos: [[46, 166], [194, 166]] },
  cabina: { nombre: "Cabina y sistema eléctrico", pos: [[120, 232]] },
  cajuela: { nombre: "Cajuela y carrocería", pos: [[120, 330]] },
  escape: { nombre: "Escape", pos: [[120, 372]] },
  luces_t: { nombre: "Luces traseras", pos: [[78, 398], [162, 398]] },
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
 * Auto visto desde arriba con los puntos de revisión.
 * estadoZona(clave) -> "bien" | "regular" | "mal" | "ninguno"; onSelect(clave) al tocar un punto.
 */
export default function AutoInspeccion({ estadoZona, elegida, onSelect }) {
  return (
    <svg className="auto-svg" viewBox="0 0 240 424" role="group" aria-label="Vehículo visto desde arriba con los puntos de inspección">
      <rect className="auto-llanta" x="40" y="68" width="22" height="52" rx="7" /><rect className="auto-llanta" x="178" y="68" width="22" height="52" rx="7" />
      <rect className="auto-llanta" x="40" y="298" width="22" height="52" rx="7" /><rect className="auto-llanta" x="178" y="298" width="22" height="52" rx="7" />
      <ellipse className="auto-carro" cx="54" cy="168" rx="9" ry="6" /><ellipse className="auto-carro" cx="186" cy="168" rx="9" ry="6" />
      <rect className="auto-carro" x="62" y="14" width="116" height="396" rx="52" />
      <path className="auto-vidrio" d="M76 150 L164 150 L156 196 L84 196 Z" />
      <path className="auto-vidrio" d="M84 268 L156 268 L166 306 L74 306 Z" />
      <rect className="auto-techo" x="82" y="200" width="76" height="64" rx="12" />
      <path className="auto-linea" d="M80 52 Q120 40 160 52 M80 372 Q120 384 160 372" />
      {Object.entries(ZONAS).map(([k, z]) => z.pos.map(([x, y], i) => {
        const est = estadoZona(k);
        const activo = elegida === k;
        return (
          <g key={`${k}-${i}`} className={`auto-punto est-${est}${activo ? " activo" : ""}`} transform={`translate(${x} ${y})`}
            onClick={() => onSelect(k)} role="button" tabIndex={0} aria-pressed={activo}
            aria-label={`${z.nombre}: ${est === "ninguno" ? "sin puntos" : est}`}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(k); } }}>
            <title>{z.nombre}</title>
            {est === "mal" && <circle r="17" className="auto-halo" />}
            {activo && <circle r="17" className="auto-anillo" />}
            <circle className="auto-dot" r="11" />
            {est === "bien" && <path d="M-4.5 0.5 L-1.5 3.5 L4.5 -3" className="auto-simbolo" />}
            {est === "regular" && <path d="M0 -4.5 V1.5 M0 4.6 V4.7" className="auto-simbolo" />}
            {est === "mal" && <path d="M-3.8 -3.8 L3.8 3.8 M3.8 -3.8 L-3.8 3.8" className="auto-simbolo" />}
          </g>
        );
      }))}
    </svg>
  );
}
