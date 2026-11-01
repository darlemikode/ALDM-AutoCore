// Color de referencia de un vehículo: silueta de auto pintada con el color (imagen SVG).
export const HEX_POR_NOMBRE = {"Blanco": "#F5F5F5", "Negro": "#111111", "Gris": "#8A8D8F", "Plata": "#C0C0C0", "Rojo": "#C8102E", "Azul": "#1F4E9C", "Verde": "#2E7D32", "Amarillo": "#F6C700", "Café": "#6F4E37", "Dorado": "#C9A227", "Naranja": "#F57C00", "Vino": "#6D1A36", "Beige": "#D9C7A3", "Champagne": "#E7D3B0", "Morado": "#6A3FA0", "Rosa": "#E77FA7", "Turquesa": "#26B3B0", "Azul marino": "#14213D", "Gris Oxford": "#3B3F45", "Blanco perla": "#F1EEE6", "Bronce": "#8C6A3F", "Arena": "#D2B48C", "Grafito": "#4A4D50", "Azul cielo": "#7EC8E3", "Verde oscuro": "#1B4D2E"};

export function hexDeColor(nombre, hex) {
  if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const k = Object.keys(HEX_POR_NOMBRE).find((n) => n.toLowerCase() === String(nombre || "").trim().toLowerCase());
  return k ? HEX_POR_NOMBRE[k] : "#9AA0A6";
}

export default function ColorAuto({ nombre, hex, size = 84 }) {
  const color = hexDeColor(nombre, hex);
  const id = "g" + String(nombre || "c").replace(/[^a-z0-9]/gi, "") + color.slice(1);
  return (
    <span className="color-auto" style={{ width: size, height: size }} title={`${nombre || "Color"} ${color}`}>
      <svg viewBox="0 0 120 70" width="100%" height="100%" role="img" aria-label={`Color ${nombre || ""}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" />
            <stop offset=".45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".28" />
          </linearGradient>
        </defs>
        <path d="M8 46 L12 34 Q16 30 28 28 L42 14 Q46 11 52 11 L76 11 Q83 11 88 16 L99 28 Q110 30 112 36 L114 46 Q114 50 110 50 L12 50 Q6 50 8 46 Z" fill={color} stroke="rgba(0,0,0,.45)" strokeWidth="1.5" />
        <path d="M8 46 L12 34 Q16 30 28 28 L42 14 Q46 11 52 11 L76 11 Q83 11 88 16 L99 28 Q110 30 112 36 L114 46 Q114 50 110 50 L12 50 Q6 50 8 46 Z" fill={`url(#${id})`} />
        <path d="M45 17 L33 28 L58 28 L58 15 Z M63 15 L63 28 L92 28 L84 18 Q82 15 78 15 Z" fill="#dfeaf2" opacity=".85" stroke="rgba(0,0,0,.35)" strokeWidth="1" />
        <circle cx="32" cy="50" r="9" fill="#1b1b1b" /><circle cx="32" cy="50" r="4" fill="#bbb" />
        <circle cx="90" cy="50" r="9" fill="#1b1b1b" /><circle cx="90" cy="50" r="4" fill="#bbb" />
      </svg>
    </span>
  );
}
