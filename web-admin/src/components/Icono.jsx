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
