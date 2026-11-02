// Íconos de la web (web-admin/src/components/Icono.jsx) portados a la app:
// mismos trazos, mismo grosor (1.8), misma forma. Se usan como reemplazo de
// Ionicons: `import { Ionicons } from "../ui/IconoWeb"` y se escriben igual
// (name="construct-outline"). Si un nombre no existe en la web, se usa el
// Ionicons original para no dejar un hueco.
import Svg, { G, Circle, Path, Rect } from "react-native-svg";
import { Ionicons as IonReal } from "@expo/vector-icons";

const TRAZOS = {
  "chevron-right": <><Path d="M9 6l6 6-6 6" /></>,
  "chevron-left": <><Path d="M15 6l-6 6 6 6" /></>,
  "arrow-right": <><Path d="M5 12h14" /><Path d="M13 6l6 6-6 6" /></>,
  "arrow-left": <><Path d="M19 12H5" /><Path d="M11 6l-6 6 6 6" /></>,
  "arrow-up": <><Path d="M12 19V5" /><Path d="M6 11l6-6 6 6" /></>,
  "arrow-down": <><Path d="M12 5v14" /><Path d="M6 13l6 6 6-6" /></>,
  "user-add": <><Circle cx="10" cy="8.5" r="3.8" /><Path d="M3 20.5c.6-4 3.2-6.3 7-6.3 1.6 0 3 .4 4.1 1.1" /><Path d="M19 14v6" /><Path d="M16 17h6" /></>,
  help: <><Circle cx="12" cy="12" r="9" /><Path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8" /><Path d="M12 17h.01" /></>,
  fingerprint: <><Path d="M6 10a6 6 0 0 1 12 0v2" /><Path d="M9 20c.8-1.5 1-3 1-5v-4a2 2 0 0 1 4 0v4c0 2 .4 3.4 1.2 4.6" /><Path d="M6 14c0 2-.3 3.5-1 5" /><Path d="M18 14.5c0 1.8.3 3 .8 4" /></>,
  sun: <><Circle cx="12" cy="12" r="4" /><Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  "x-mark": <><Path d="M6 6l12 12" /><Path d="M18 6L6 18" /></>,
  grid: <><Rect x="3" y="3" width="7" height="7" rx="1.5" /><Rect x="14" y="3" width="7" height="7" rx="1.5" /><Rect x="3" y="14" width="7" height="7" rx="1.5" /><Rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  "person-circle": <><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="10" r="3" /><Path d="M6.2 18.2a6 6 0 0 1 11.6 0" /></>,
  construct: <><Path d="M14.5 6.5 17.5 3.5a4 4 0 0 1 3 3l-3 3" /><Path d="M17.5 3.5 15 6l1 1 2.5-2.5" /><Path d="M14 8 4.5 17.5a1.8 1.8 0 0 0 2.5 2.5L17.5 10.5" /><Path d="M6 19.5 5 20.5" /></>,
  "document-text": <><Path d="M7 3h7l4 4v14H7z" /><Path d="M14 3v4h4" /><Path d="M9.5 12.5h5" /><Path d="M9.5 16h5" /></>,
  calendar: <><Rect x="3.5" y="5" width="17" height="15.5" rx="2" /><Path d="M3.5 9.5h17" /><Path d="M8 3v4" /><Path d="M16 3v4" /></>,
  people: <><Circle cx="8.5" cy="8.5" r="3" /><Circle cx="16" cy="9.5" r="2.4" /><Path d="M3 19c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" /><Path d="M14.7 14.3c2.3.3 4 1.8 4.3 4.4" /></>,
  "chevron-down": <><Path d="M6 9l6 6 6-6" /></>,
  "chevron-up": <><Path d="M6 15l6-6 6 6" /></>,
  whatsapp: <><Path d="M3 21l1.6-4.6A9 9 0 1 1 8 19.5L3 21z" /><Path d="M9.2 8.6c-.4.5-.4 1.4.3 2.6 1 1.7 2.4 3 4.2 3.6.9.3 1.5-.1 1.9-.8l-1.7-1-.8.6c-.9-.4-1.9-1.4-2.3-2.3l.6-.8-1-1.7c-.3.1-.9.4-1.2.8z" /></>,
  car: <><Path d="M4.5 15.5 6 9.8a2 2 0 0 1 1.9-1.5h8.2a2 2 0 0 1 1.9 1.5l1.5 5.7" /><Rect x="3" y="15.5" width="18" height="4.2" rx="1.4" /><Circle cx="7.5" cy="19.7" r="1.5" /><Circle cx="16.5" cy="19.7" r="1.5" /><Path d="M6 12h12" /></>,
  cube: <><Path d="M12 3 20 7.2v9.6L12 21 4 16.8V7.2z" /><Path d="M4 7.2 12 11.4l8-4.2" /><Path d="M12 11.4V21" /></>,
  "file-tray": <><Path d="M4 5h16v8H4z" /><Path d="M4 13l2.5 4.5h11L20 13" /><Path d="M6.5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1" /></>,
  hammer: <><Path d="M14 6.5 17.5 3l3.5 3.5-3.5 3.5" /><Path d="M15 8.5 5.5 18a1.8 1.8 0 0 1-2.5 0v0a1.8 1.8 0 0 1 0-2.5L12.5 6" /><Path d="M4 20l1.5-1.5" /></>,
  business: <><Rect x="4" y="9.5" width="7" height="10.5" /><Rect x="13" y="3.5" width="7" height="16.5" /><Path d="M6.3 12.5h2.4M6.3 15.5h2.4M15.3 6.5h2.4M15.3 9.5h2.4M15.3 12.5h2.4M15.3 15.5h2.4" /></>,
  pricetag: <><Path d="M11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-.6 1.4l-8 8a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 1.4-.6z" /><Circle cx="15.5" cy="8.5" r="1.6" /></>,
  sparkles: <><Path d="M12 3.5 13.4 8l4.6 1.4-4.6 1.4L12 15.2 10.6 10.8 6 9.4l4.6-1.4z" /><Path d="M19 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /><Path d="M5 15.8l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" /></>,
  list: <><Path d="M9 6.5h11" /><Path d="M9 12h11" /><Path d="M9 17.5h11" /><Circle cx="4.3" cy="6.5" r="1.1" /><Circle cx="4.3" cy="12" r="1.1" /><Circle cx="4.3" cy="17.5" r="1.1" /></>,
  storefront: <><Path d="M4 9 5 4h14l1 5" /><Path d="M4 9v10.5h16V9" /><Path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><Path d="M9.5 19.5V14h5v5.5" /></>,
  card: <><Rect x="3" y="6" width="18" height="13" rx="2" /><Path d="M3 10.3h18" /><Path d="M6.5 14.3h4" /></>,
  sync: <><Path d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4L20 9" /><Path d="M20 5v4h-4" /><Path d="M19.5 12a7.5 7.5 0 0 1-12.7 5.4L4 15" /><Path d="M4 19v-4h4" /></>,
  "id-card": <><Rect x="3" y="5.5" width="18" height="13" rx="2" /><Circle cx="8.5" cy="11" r="2" /><Path d="M5.7 16c.4-1.8 1.5-2.7 2.8-2.7s2.4.9 2.8 2.7" /><Path d="M14.5 9.5h4" /><Path d="M14.5 12.5h4" /><Path d="M14.5 15.5h2.5" /></>,
  key: <><Circle cx="8" cy="15.5" r="4" /><Path d="M11 12.5 18.5 5" /><Path d="M16 7.5l2 2" /><Path d="M18.5 5l2 2" /></>,
  link: <><Path d="M9.5 14.5 14.5 9.5" /><Path d="M11 6.8 13.3 4.5a3.6 3.6 0 0 1 5.1 5.1L16 12" /><Path d="M13 17.2 10.7 19.5a3.6 3.6 0 0 1-5.1-5.1L8 12" /></>,
  "shield-check": <><Path d="M12 3.5 19 6v6c0 5-3 7.7-7 8.5-4-.8-7-3.5-7-8.5V6z" /><Path d="M9 12l2 2 4-4.5" /></>,
  rocket: <><Path d="M13.5 3.5c3 .5 5 2.5 5.5 5.5-3 3-6 4-9 4.5l-1-4.5c1.5-3 3.5-5 4.5-5.5z" /><Path d="M9 13l-4 1 1-4" /><Path d="M9 13l2 2" /><Circle cx="15" cy="9" r="1.3" /><Path d="M6.5 17.5c-1.2.4-2 1.4-2.2 3 1.6-.2 2.6-1 3-2.2" /></>,
  document: <><Path d="M7 3h7l4 4v14H7z" /><Path d="M14 3v4h4" /></>,
  settings: <><Circle cx="12" cy="12" r="3" /><Path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" /></>,
  warning: <><Path d="M12 3.8 21 19.5H3z" /><Path d="M12 10v4.5" /><Circle cx="12" cy="17" r="0.6" /></>,
  close: <><Path d="M5.5 5.5l13 13" /><Path d="M18.5 5.5l-13 13" /></>,
  "log-out": <><Path d="M9.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3.5" /><Path d="M14 16l4.5-4-4.5-4" /><Path d="M18.3 12H9" /></>,
  moon: <Path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2z" />,
  wrench: <><Path d="M14.7 9.3a4 4 0 0 0 5.4-5.1l-3.2 3.2-2.1-.7-.7-2.1L17.3 1.4a4 4 0 0 0-5.1 5.4L4 15v3.5A1.5 1.5 0 0 0 5.5 20H9v-3.4z" /></>,
  notifications: <><Path d="M6 10.5a6 6 0 0 1 12 0c0 4 1.3 5.3 1.8 6.2a.9.9 0 0 1-.8 1.3H5a.9.9 0 0 1-.8-1.3C4.7 15.8 6 14.5 6 10.5z" /><Path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" /></>,
  "check-circle": <><Circle cx="12" cy="12" r="9" /><Path d="M8 12.3l2.7 2.7L16 9.5" /></>,
  "x-circle": <><Circle cx="12" cy="12" r="9" /><Path d="M9 9l6 6" /><Path d="M15 9l-6 6" /></>,
  battery: <><Rect x="3.5" y="8" width="15" height="9" rx="2" /><Path d="M21 11v3" /><Path d="M7 12.5h5" /></>,
  drop: <><Path d="M12 3.5c3.5 4.2 6 7.2 6 10.2a6 6 0 0 1-12 0c0-3 2.5-6 6-10.2z" /></>,
  bulb: <><Path d="M9 17.5h6" /><Path d="M10 20.5h4" /><Path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5v.5h5v-.5c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 12 3.5z" /></>,
  tire: <><Circle cx="12" cy="12" r="8.5" /><Circle cx="12" cy="12" r="3" /><Path d="M12 3.5v5.5M12 15v5.5M3.5 12H9M15 12h5.5" /></>,
  stop: <><Path d="M8.5 3.5h7L20.5 8.5v7L15.5 20.5h-7L3.5 15.5v-7z" /><Path d="M9 12h6" /></>,
  bolt: <><Path d="M13 3 5.5 13.2h5.2L10 21l8-10.5h-5.4z" /></>,
  "doc-add": <><Path d="M7 3h7l4 4v14H7z" /><Path d="M14 3v4h4" /><Path d="M12.5 11v6" /><Path d="M9.5 14h6" /></>,
  phone: <><Rect x="7" y="2.5" width="10" height="19" rx="2.2" /><Path d="M11 18.5h2" /></>,
  mail: <><Rect x="3" y="5.5" width="18" height="13" rx="2" /><Path d="M3.5 7l8.5 6 8.5-6" /></>,
  pin: <><Path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><Circle cx="12" cy="10" r="2.4" /></>,
  hash: <><Path d="M9.5 3.5 7.5 20.5" /><Path d="M16.5 3.5l-2 17" /><Path d="M4.5 9h16" /><Path d="M3.5 15h16" /></>,
  truck: <><Path d="M3 6.5h11v10H3z" /><Path d="M14 10h4l3 3.5v3h-7" /><Circle cx="7" cy="18" r="1.8" /><Circle cx="17.5" cy="18" r="1.8" /></>,
  cash: <><Rect x="2.5" y="6.5" width="19" height="11" rx="2" /><Circle cx="12" cy="12" r="2.6" /><Path d="M6 9.5v5M18 9.5v5" /></>,
  user: <><Circle cx="12" cy="8.5" r="3.8" /><Path d="M4.5 20.5c.6-4 3.6-6.3 7.5-6.3s6.9 2.3 7.5 6.3" /></>,
  camera: <><Path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><Circle cx="12" cy="13.5" r="3.5" /></>,
  lock: <><Rect x="5" y="10.5" width="14" height="10" rx="2" /><Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  plug: <><Path d="M9 3v5M15 3v5" /><Path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z" /><Path d="M12 16.5V21" /></>,
  puzzle: <><Path d="M10 4.5a2 2 0 0 1 4 0V6h4v4h-1.5a2 2 0 0 0 0 4H18v4h-4v-1.5a2 2 0 0 0-4 0V18H6v-4h1.5a2 2 0 0 0 0-4H6V6h4z" /></>,
  book: <><Path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" /><Path d="M5 16.5a3 3 0 0 1 3-3h10" /></>,
  ban: <><Circle cx="12" cy="12" r="8.5" /><Path d="M6 6l12 12" /></>,
  repeat: <><Path d="M17 3.5l3 3-3 3" /><Path d="M4 11.5v-1a4 4 0 0 1 4-4h12" /><Path d="M7 20.5l-3-3 3-3" /><Path d="M20 12.5v1a4 4 0 0 1-4 4H4" /></>,
  folder: <><Path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" /></>,
  map: <><Path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z" /><Path d="M9 4v13.5M15 6.5V20" /></>,
  inbox: <><Path d="M4 13.5 6.5 5h11L20 13.5V19H4z" /><Path d="M4 13.5h4.5l1 2h5l1-2H20" /></>,
  shield: <><Path d="M12 3.5 19 6v6c0 5-3 7.7-7 8.5-4-.8-7-3.5-7-8.5V6z" /></>,
  square: <><Rect x="5" y="5" width="14" height="14" rx="3" /></>,
  diamond: <><Path d="M12 4l8 8-8 8-8-8z" /></>,
  traffic: <><Rect x="8" y="2.5" width="8" height="19" rx="3" /><Circle cx="12" cy="7" r="1.5" /><Circle cx="12" cy="12" r="1.5" /><Circle cx="12" cy="17" r="1.5" /></>,
  save: <><Path d="M5 3.5h11.5L20.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z" /><Path d="M7.5 3.5v5h8v-5" /><Rect x="7" y="13" width="10" height="7.5" rx="1" /></>,
  eye: <><Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><Circle cx="12" cy="12" r="3" /></>,
  printer: <><Path d="M7 8.5V3.5h10v5" /><Rect x="3.5" y="8.5" width="17" height="8" rx="2" /><Path d="M7 14h10v6.5H7z" /></>,
  chart: <><Path d="M4 20V4" /><Path d="M4 20h16" /><Path d="M8 16v-5M12 16V8M16 16v-3" /></>,
  palette: <><Path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-.8-.5-1.3-.5-2 0-.9.7-1.5 1.6-1.5H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5z" /><Circle cx="7.8" cy="11.5" r="1" /><Circle cx="10.2" cy="7.6" r="1" /><Circle cx="14.6" cy="7.8" r="1" /></>,
  "camera-add": <><Path d="M4 8h3.5l1.8-2.5h5.4L16.5 8H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><Path d="M12 10.5v6M9 13.5h6" /></>,
  clock: <><Circle cx="12" cy="12" r="8.5" /><Path d="M12 7.5V12l3 2" /></>,
  add: <><Path d="M12 5v14" /><Path d="M5 12h14" /></>,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  dot: <Circle cx="12" cy="12" r="5" />,
  clip: <Path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" />,
  menu: <><Path d="M4 7h16M4 12h16M4 17h16" /></>,
  pencil: <><Path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><Path d="M14.5 7.5l3 3" /></>,
  trash: <><Path d="M4.5 6.5h15" /><Path d="M9.5 6.5V4.5h5v2" /><Path d="M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13" /><Path d="M10 10.5v6" /><Path d="M14 10.5v6" /></>,
  search: <><Circle cx="11" cy="11" r="6.5" /><Path d="M16 16l4.5 4.5" /></>,
  chatbubble: <><Path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 4v-4H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /></>,
};

// Nombre de Ionicons (sin -outline) -> ícono de la web. Lo que no está aquí
// (flechas, chevrones laterales, estrellas…) usa el Ionicons original.
const ALIAS = {
  "chevron-forward": "chevron-right", "chevron-back": "chevron-left", "arrow-forward": "arrow-right", "arrow-back": "arrow-left",
  "arrow-up": "arrow-up", "arrow-down": "arrow-down", "person-add": "user-add", "help-circle": "help", "help": "help",
  "finger-print": "fingerprint", "sunny": "sun", "shield-half": "shield", "cloud-upload": "inbox", "images": "camera",
  "grid": "grid", "apps": "grid", "person-circle": "person-circle", "construct": "construct", "build": "wrench",
  "document-text": "document-text", "document": "document", "receipt": "document-text", "calendar": "calendar",
  "calendar-number": "calendar", "calendar-clear": "calendar", "today": "calendar", "people": "people",
  "person": "user", "car": "car", "car-sport": "car", "cube": "cube", "file-tray": "file-tray", "file-tray-stacked": "file-tray",
  "hammer": "hammer", "business": "business", "pricetag": "pricetag", "pricetags": "pricetag", "sparkles": "sparkles",
  "list": "list", "storefront": "storefront", "card": "card", "wallet": "card", "sync": "sync", "refresh": "sync",
  "id-card": "id-card", "key": "key", "link": "link", "shield-checkmark": "shield-check", "shield": "shield",
  "settings": "settings", "warning": "warning", "alert-circle": "warning", "close": "close", "close-circle": "x-circle",
  "log-out": "log-out", "moon": "moon", "notifications": "notifications", "checkmark-circle": "check-circle",
  "checkmark": "check", "checkmark-done": "check", "battery-charging": "battery", "water": "drop", "bulb": "bulb",
  "stop-circle": "stop", "flash": "bolt", "phone-portrait": "phone", "call": "phone", "mail": "mail", "location": "pin",
  "pin": "pin", "map": "map", "cash": "cash", "camera": "camera", "lock-closed": "lock", "repeat": "repeat",
  "folder": "folder", "add": "add", "add-circle": "add", "trash": "trash", "create": "pencil", "pencil": "pencil",
  "search": "search", "menu": "menu", "eye": "eye", "time": "clock", "save": "save", "chatbubble": "chatbubble",
  "chatbubbles": "chatbubble", "chatbubble-ellipses": "chatbubble", "chatbox-ellipses": "chatbubble",
  "color-palette": "palette", "swap-horizontal": "repeat", "chevron-down": "chevron-down", "chevron-up": "chevron-up",
  "snow": "drop", "disc": "tire", "cog": "settings", "clipboard": "list", "print": "printer", "stats-chart": "chart",
  "bar-chart": "chart", "attach": "clip", "ban": "ban", "extension-puzzle": "puzzle", "download": "inbox",
};

function resolver(name) {
  const base = String(name || "").replace(/-(outline|sharp)$/, "");
  if (name && TRAZOS[name]) return name;
  const web = ALIAS[base];
  return web && TRAZOS[web] ? web : null;
}

export function Ionicons({ name, size = 18, color = "#000", style, ...resto }) {
  const web = resolver(name);
  if (!web) return <IonReal name={name} size={size} color={color} style={style} {...resto} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <G fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {TRAZOS[web]}
      </G>
    </Svg>
  );
}

export default Ionicons;
