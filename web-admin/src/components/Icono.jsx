// Ícono de línea (outline), sin librería externa — el mismo lenguaje visual
// que los Ionicons "-outline" que usa la app móvil, para que web y móvil se
// vean parte del mismo sistema. Trazo 1.8, esquinas redondeadas, 24x24.
const base = { fill: "none", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

const TRAZOS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  "person-circle": <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.2 18.2a6 6 0 0 1 11.6 0" /></>,
  construct: <><path d="M14.5 6.5 17.5 3.5a4 4 0 0 1 3 3l-3 3" /><path d="M17.5 3.5 15 6l1 1 2.5-2.5" /><path d="M14 8 4.5 17.5a1.8 1.8 0 0 0 2.5 2.5L17.5 10.5" /><path d="M6 19.5 5 20.5" /></>,
  "document-text": <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9.5 12.5h5" /><path d="M9.5 16h5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  people: <><circle cx="8.5" cy="8.5" r="3" /><circle cx="16" cy="9.5" r="2.4" /><path d="M3 19c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" /><path d="M14.7 14.3c2.3.3 4 1.8 4.3 4.4" /></>,
  car: <><path d="M4.5 15.5 6 9.8a2 2 0 0 1 1.9-1.5h8.2a2 2 0 0 1 1.9 1.5l1.5 5.7" /><rect x="3" y="15.5" width="18" height="4.2" rx="1.4" /><circle cx="7.5" cy="19.7" r="1.5" /><circle cx="16.5" cy="19.7" r="1.5" /><path d="M6 12h12" /></>,
  cube: <><path d="M12 3 20 7.2v9.6L12 21 4 16.8V7.2z" /><path d="M4 7.2 12 11.4l8-4.2" /><path d="M12 11.4V21" /></>,
  "file-tray": <><path d="M4 5h16v8H4z" /><path d="M4 13l2.5 4.5h11L20 13" /><path d="M6.5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1" /></>,
  hammer: <><path d="M14 6.5 17.5 3l3.5 3.5-3.5 3.5" /><path d="M15 8.5 5.5 18a1.8 1.8 0 0 1-2.5 0v0a1.8 1.8 0 0 1 0-2.5L12.5 6" /><path d="M4 20l1.5-1.5" /></>,
  business: <><rect x="4" y="9.5" width="7" height="10.5" /><rect x="13" y="3.5" width="7" height="16.5" /><path d="M6.3 12.5h2.4M6.3 15.5h2.4M15.3 6.5h2.4M15.3 9.5h2.4M15.3 12.5h2.4M15.3 15.5h2.4" /></>,
  pricetag: <><path d="M11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-.6 1.4l-8 8a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 1.4-.6z" /><circle cx="15.5" cy="8.5" r="1.6" /></>,
  sparkles: <><path d="M12 3.5 13.4 8l4.6 1.4-4.6 1.4L12 15.2 10.6 10.8 6 9.4l4.6-1.4z" /><path d="M19 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /><path d="M5 15.8l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" /></>,
  list: <><path d="M9 6.5h11" /><path d="M9 12h11" /><path d="M9 17.5h11" /><circle cx="4.3" cy="6.5" r="1.1" /><circle cx="4.3" cy="12" r="1.1" /><circle cx="4.3" cy="17.5" r="1.1" /></>,
  storefront: <><path d="M4 9 5 4h14l1 5" /><path d="M4 9v10.5h16V9" /><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path d="M9.5 19.5V14h5v5.5" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.3h18" /><path d="M6.5 14.3h4" /></>,
  sync: <><path d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4L20 9" /><path d="M20 5v4h-4" /><path d="M19.5 12a7.5 7.5 0 0 1-12.7 5.4L4 15" /><path d="M4 19v-4h4" /></>,
  "id-card": <><rect x="3" y="5.5" width="18" height="13" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.7 16c.4-1.8 1.5-2.7 2.8-2.7s2.4.9 2.8 2.7" /><path d="M14.5 9.5h4" /><path d="M14.5 12.5h4" /><path d="M14.5 15.5h2.5" /></>,
  key: <><circle cx="8" cy="15.5" r="4" /><path d="M11 12.5 18.5 5" /><path d="M16 7.5l2 2" /><path d="M18.5 5l2 2" /></>,
  link: <><path d="M9.5 14.5 14.5 9.5" /><path d="M11 6.8 13.3 4.5a3.6 3.6 0 0 1 5.1 5.1L16 12" /><path d="M13 17.2 10.7 19.5a3.6 3.6 0 0 1-5.1-5.1L8 12" /></>,
  "shield-check": <><path d="M12 3.5 19 6v6c0 5-3 7.7-7 8.5-4-.8-7-3.5-7-8.5V6z" /><path d="M9 12l2 2 4-4.5" /></>,
  rocket: <><path d="M13.5 3.5c3 .5 5 2.5 5.5 5.5-3 3-6 4-9 4.5l-1-4.5c1.5-3 3.5-5 4.5-5.5z" /><path d="M9 13l-4 1 1-4" /><path d="M9 13l2 2" /><circle cx="15" cy="9" r="1.3" /><path d="M6.5 17.5c-1.2.4-2 1.4-2.2 3 1.6-.2 2.6-1 3-2.2" /></>,
  document: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" /></>,
  warning: <><path d="M12 3.8 21 19.5H3z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r="0.6" /></>,
  close: <><path d="M5.5 5.5l13 13" /><path d="M18.5 5.5l-13 13" /></>,
  "log-out": <><path d="M9.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3.5" /><path d="M14 16l4.5-4-4.5-4" /><path d="M18.3 12H9" /></>,
  moon: <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2z" />,
  wrench: <><path d="M14.7 9.3a4 4 0 0 0 5.4-5.1l-3.2 3.2-2.1-.7-.7-2.1L17.3 1.4a4 4 0 0 0-5.1 5.4L4 15v3.5A1.5 1.5 0 0 0 5.5 20H9v-3.4z" /></>,
  notifications: <><path d="M6 10.5a6 6 0 0 1 12 0c0 4 1.3 5.3 1.8 6.2a.9.9 0 0 1-.8 1.3H5a.9.9 0 0 1-.8-1.3C4.7 15.8 6 14.5 6 10.5z" /><path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" /></>,
  "check-circle": <><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.7 2.7L16 9.5" /></>,
  "x-circle": <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6" /><path d="M15 9l-6 6" /></>,
  battery: <><rect x="3.5" y="8" width="15" height="9" rx="2" /><path d="M21 11v3" /><path d="M7 12.5h5" /></>,
  drop: <><path d="M12 3.5c3.5 4.2 6 7.2 6 10.2a6 6 0 0 1-12 0c0-3 2.5-6 6-10.2z" /></>,
  bulb: <><path d="M9 17.5h6" /><path d="M10 20.5h4" /><path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5v.5h5v-.5c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 12 3.5z" /></>,
  tire: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /><path d="M12 3.5v5.5M12 15v5.5M3.5 12H9M15 12h5.5" /></>,
  stop: <><path d="M8.5 3.5h7L20.5 8.5v7L15.5 20.5h-7L3.5 15.5v-7z" /><path d="M9 12h6" /></>,
  bolt: <><path d="M13 3 5.5 13.2h5.2L10 21l8-10.5h-5.4z" /></>,
  "doc-add": <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M12.5 11v6" /><path d="M9.5 14h6" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  hash: <><path d="M9.5 3.5 7.5 20.5" /><path d="M16.5 3.5l-2 17" /><path d="M4.5 9h16" /><path d="M3.5 15h16" /></>,
  truck: <><path d="M3 6.5h11v10H3z" /><path d="M14 10h4l3 3.5v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>,
  cash: <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3" /></>,
  camera: <><path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  plug: <><path d="M9 3v5M15 3v5" /><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z" /><path d="M12 16.5V21" /></>,
  puzzle: <><path d="M10 4.5a2 2 0 0 1 4 0V6h4v4h-1.5a2 2 0 0 0 0 4H18v4h-4v-1.5a2 2 0 0 0-4 0V18H6v-4h1.5a2 2 0 0 0 0-4H6V6h4z" /></>,
  book: <><path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" /><path d="M5 16.5a3 3 0 0 1 3-3h10" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>,
  repeat: <><path d="M17 3.5l3 3-3 3" /><path d="M4 11.5v-1a4 4 0 0 1 4-4h12" /><path d="M7 20.5l-3-3 3-3" /><path d="M20 12.5v1a4 4 0 0 1-4 4H4" /></>,
  folder: <><path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" /></>,
  map: <><path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  inbox: <><path d="M4 13.5 6.5 5h11L20 13.5V19H4z" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></>,
  shield: <><path d="M12 3.5 19 6v6c0 5-3 7.7-7 8.5-4-.8-7-3.5-7-8.5V6z" /></>,
  square: <><rect x="5" y="5" width="14" height="14" rx="3" /></>,
  diamond: <><path d="M12 4l8 8-8 8-8-8z" /></>,
  traffic: <><rect x="8" y="2.5" width="8" height="19" rx="3" /><circle cx="12" cy="7" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="17" r="1.5" /></>,
  save: <><path d="M5 3.5h11.5L20.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z" /><path d="M7.5 3.5v5h8v-5" /><rect x="7" y="13" width="10" height="7.5" rx="1" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  printer: <><path d="M7 8.5V3.5h10v5" /><rect x="3.5" y="8.5" width="17" height="8" rx="2" /><path d="M7 14h10v6.5H7z" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-.8-.5-1.3-.5-2 0-.9.7-1.5 1.6-1.5H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5z" /><circle cx="7.8" cy="11.5" r="1" /><circle cx="10.2" cy="7.6" r="1" /><circle cx="14.6" cy="7.8" r="1" /></>,
  "camera-add": <><path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><path d="M12 10.5v6M9 13.5h6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  add: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  dot: <circle cx="12" cy="12" r="5" />,
  clip: <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" />,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  pencil: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14.5 7.5l3 3" /></>,
  trash: <><path d="M4.5 6.5h15" /><path d="M9.5 6.5V4.5h5v2" /><path d="M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13" /><path d="M10 10.5v6" /><path d="M14 10.5v6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  chatbubble: <><path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 4v-4H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /></>,
};

export function Icono({ nombre, size = 18, className = "" }) {
  const trazo = TRAZOS[nombre];
  if (!trazo) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" className={className} style={base} aria-hidden="true">
      {trazo}
    </svg>
  );
}

// El mismo tratamiento "círculo suave de color" que usa la app móvil detrás
// de sus íconos (Dialogo, KPIs del panel): círculo con fondo del tono y el
// ícono encima del mismo color. `tono` es un token del tema: petrol | teal | red.
export function IconoTono({ nombre, tono = "petrol", size = 34, iconoSize = 17 }) {
  return (
    <span
      className="icono-tono"
      style={{
        width: size, height: size, borderRadius: size / 2,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: `var(--${tono}-100)`, color: `var(--${tono}-600)`, flexShrink: 0,
      }}
    >
      <Icono nombre={nombre} size={iconoSize} />
    </span>
  );
}

// Emoji heredado → ícono de línea del sistema (homologa todo lo que todavía
// llega como emoji en props `icono`, grupos de formularios, etc.)
const EMOJI_A_ICONO = {
  "🧑": "user", "👤": "user", "👷": "id-card", "📇": "id-card", "🪪": "id-card",
  "📱": "phone", "☎": "phone", "📞": "phone", "✉": "mail", "📧": "mail",
  "🏢": "business", "🏬": "business", "🧾": "document-text", "📑": "document-text", "📄": "document", "📝": "pencil",
  "📍": "pin", "📮": "pin", "🗺": "map", "🔢": "hash", "🚗": "car", "🚙": "car", "🚘": "car",
  "💲": "cash", "💵": "cash", "💰": "cash", "💳": "card", "🏷": "pricetag",
  "⚙": "settings", "🔧": "wrench", "🛠": "hammer", "🔨": "hammer", "📦": "cube", "🚚": "truck",
  "🛡": "shield", "🔔": "notifications", "📚": "book", "🔑": "key", "🔒": "lock", "🔗": "link",
  "🔎": "search", "🔍": "search", "🔄": "sync", "🔁": "repeat", "🔀": "repeat", "🗑": "trash",
  "📸": "camera", "📷": "camera", "🧩": "puzzle", "🔌": "plug", "🚫": "ban", "🗂": "folder", "📥": "inbox",
  "🎨": "palette", "📅": "calendar", "🗓": "calendar", "🚦": "traffic", "🔹": "diamond", "🟩": "square", "🟦": "square", "🟥": "square",
  "✅": "check-circle", "⚠": "warning", "❌": "x-circle", "✓": "check", "✔": "check", "✕": "close", "✖": "close",
  "👁": "eye", "🖨": "printer", "📊": "chart", "🕘": "clock", "⏳": "clock", "➕": "add", "✏": "pencil", "💾": "save",
  "📋": "list", "📎": "clip", "💬": "chatbubble", "🌙": "moon", "☰": "menu", "🟠": "dot", "🔴": "dot", "🚨": "warning",
  "🧰": "hammer", "📞": "phone", "📧": "mail", "🗓": "calendar", "🪪": "id-card", "📦": "cube", "👑": "shield-check",
};

export function IconoAuto({ valor, size = 18 }) {
  if (typeof valor !== "string") return valor ?? null;
  const limpio = valor.replace(/\uFE0F/g, "").trim();
  const nombre = EMOJI_A_ICONO[limpio];
  return nombre ? <Icono nombre={nombre} size={size} /> : valor;
}
