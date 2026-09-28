import { colors, paletas, temaActivo, radius, shadowCard } from "../theme";

// Sistema de diseño de la app, espejo de web-admin/src/styles.css.
//
// Todas las pantallas crean sus estilos con `crearEstilos(...)`. Aquí se
// aplican dos cosas sin tocar el layout propio de cada pantalla:
//  1) Las reglas visuales de la web (tipografías, radios, sombras de
//     tarjeta, inputs con borde petróleo).
//  2) El tema (claro/oscuro): los estilos se calculan al leerlos, así que
//     el mismo `styles.card` da colores claros u oscuros según el tema activo.

const FAMILIA = {
  "100": "Inter_400Regular", "200": "Inter_400Regular", "300": "Inter_400Regular",
  "400": "Inter_400Regular", normal: "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold", bold: "Inter_700Bold",
  "800": "Inter_800ExtraBold", "900": "Inter_800ExtraBold",
};

// valor de color (de cualquiera de las dos paletas) -> nombre del token
const VALOR_A_TOKEN = {};
for (const nombre of ["claro", "oscuro"]) {
  for (const [token, valor] of Object.entries(paletas[nombre])) {
    const v = String(valor).toLowerCase();
    if (!(v in VALOR_A_TOKEN)) VALOR_A_TOKEN[v] = token;
  }
}
// Colores fijos que algunas pantallas traían escritos a mano
const LITERALES_FONDO = {
  "#fff": "paper100", "#ffffff": "paper100", white: "paper100",
  "#ece9e2": "paper0", "#e9edef": "ink300",
  "#f0f0ee": "ink300", "#eee": "ink300", "#e2e5e6": "ink300",
  "#fdf1d9": "warn100", "#fdecd2": "warn100",
  "rgba(20,24,28,0.55)": "velo",
};
const ES_BOTON = /(bot[oó]n|button|btn|fab|activo|activa|enviar)/i;
// Nota: los inputs se detectan por nombre del estilo (input, search, picker...)

function mapearColor(clave, valor, nombreEstilo, tema) {
  if (typeof valor !== "string") return valor;
  const v = valor.toLowerCase().replace(/\s+/g, "");
  const paleta = paletas[tema];
  if (clave !== "color" && LITERALES_FONDO[v]) return paleta[LITERALES_FONDO[v]];
  // Texto blanco sobre botones de acento: en oscuro la web usa texto oscuro
  // (el petróleo es muy brillante), igual que .btn-primary { color: var(--paper-100) }.
  if (clave === "color" && (v === "#fff" || v === "#ffffff") && tema === "oscuro" && ES_BOTON.test(nombreEstilo)) {
    return paleta.paper100;
  }
  const token = VALOR_A_TOKEN[v];
  return token ? paleta[token] : valor;
}

function esCirculo(o) {
  return typeof o.width === "number" && o.width === o.height && typeof o.borderRadius === "number" && o.borderRadius * 2 >= o.width;
}

function normalizar(e, nombreEstilo, tema) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return e;
  const o = { ...e };
  const oscuro = tema === "oscuro";
  const esBlanco = (c) => typeof c === "string" && ["#fff", "#ffffff", "white", paletas.claro.paper100, paletas.oscuro.paper100].includes(c.toLowerCase());

  // --- Tipografía (body: Inter; h1/h2 y números grandes: Barlow Condensed)
  const esTexto = o.fontSize != null || o.fontWeight != null || o.textAlign != null || o.textTransform != null || (o.color != null && o.backgroundColor == null);
  if (esTexto && !o.fontFamily) {
    const peso = String(o.fontWeight ?? "400");
    if (typeof o.fontSize === "number" && o.fontSize >= 20 && ["600", "700", "800", "900", "bold"].includes(peso)) {
      o.fontFamily = peso === "600" ? "BarlowCondensed_600SemiBold" : "BarlowCondensed_700Bold";
      if (o.letterSpacing == null) o.letterSpacing = 0.2;
    } else {
      o.fontFamily = FAMILIA[peso] || "Inter_400Regular";
    }
  }
  if (o.fontFamily) delete o.fontWeight;
  // Textos base sin color explícito: en oscuro quedarían negros sobre fondo
  // oscuro. Solo a estilos "base" (con fontSize), no a modificadores.
  if (typeof o.fontSize === "number" && o.color == null) o.color = paletas.claro.ink900;

  // --- Radios: --radius (10px) en todo lo que no sea círculo o píldora
  if (typeof o.borderRadius === "number" && !esCirculo(o) && o.borderRadius >= 6 && o.borderRadius <= 16) {
    o.borderRadius = radius;
  }

  // --- Tarjetas (.kpi-card / .panel): fondo paper-100 con sombra suave
  const esSuperficie = esBlanco(o.backgroundColor) && o.position !== "absolute" &&
    (o.padding != null || o.paddingVertical != null || o.paddingHorizontal != null);
  if (esSuperficie && o.shadowOpacity == null && o.elevation == null) {
    Object.assign(o, shadowCard);
    if (oscuro) { o.shadowOpacity = 0.35; o.shadowColor = "#000"; }
  }
  if (esSuperficie && oscuro && o.borderWidth == null) {
    o.borderWidth = 1;
    o.borderColor = paletas.oscuro.ink300;
  }

  // --- Inputs: borde 1.5px petróleo-300 (en oscuro, ink-300), como en la web
  const bordeTenue = typeof o.borderColor === "string" && ["#d3e2e5", "#e3e9eb", "#263840"].includes(o.borderColor.toLowerCase());
  const esCampo = /(input|search|buscar|busqueda|búsqueda|textarea|picker|select|campoTexto)/i.test(nombreEstilo);
  if (esCampo && o.borderWidth === 1 && bordeTenue && o.flexDirection == null) {
    o.borderWidth = 1.5;
    o.borderColor = oscuro ? paletas.oscuro.ink300 : paletas.claro.petrol300;
    if (o.backgroundColor == null || o.backgroundColor === paletas.claro.paper0) o.backgroundColor = paletas.claro.paper100;
    if (o.minHeight == null) o.minHeight = 44;
    if (o.color == null) o.color = paletas.claro.ink900;
  }

  // --- Botones flotantes
  if (o.position === "absolute" && esCirculo(o) && o.elevation != null) {
    o.elevation = 5;
    o.shadowOpacity = 0.35;
    o.shadowRadius = 10;
    o.shadowOffset = { width: 0, height: 6 };
  }

  // --- Colores según el tema activo
  for (const clave of Object.keys(o)) {
    if (/color$/i.test(clave)) o[clave] = mapearColor(clave, o[clave], nombreEstilo, tema);
  }
  return o;
}

export function crearEstilos(definicion) {
  const cache = {};
  return new Proxy({}, {
    get(_, prop) {
      if (typeof prop !== "string" || !(prop in definicion)) return undefined;
      const tema = temaActivo();
      const porTema = cache[tema] || (cache[tema] = {});
      if (!(prop in porTema)) porTema[prop] = normalizar(definicion[prop], prop, tema);
      return porTema[prop];
    },
    has(_, prop) {
      return prop in definicion;
    },
    ownKeys() {
      return Reflect.ownKeys(definicion);
    },
    getOwnPropertyDescriptor(_, prop) {
      return prop in definicion ? { enumerable: true, configurable: true } : undefined;
    },
  });
}

// Para colores fijos que no pasan por crearEstilos
export function color(token) {
  return colors[token];
}
