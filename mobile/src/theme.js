// Tokens idénticos a web-admin/src/styles.css (:root y :root[data-theme="dark"]).
// Si cambian allá, cambiarlos aquí igual para que web y mobile se vean iguales.
export const paletas = {
  claro: {
    ink900: "#132a33",
    ink700: "#4d6b74",
    ink500: "#84a0a8",
    ink300: "#d3e2e5",
    linea: "#d3e2e5",
    contorno: "#9fb8bd",
    paper0: "#e9f1f3",
    paper100: "#fbfdfe",
    petrol600: "#0d8f9e",
    petrol500: "#17b6ae",
    petrol300: "#6fe0d6",
    petrol100: "#dcf2f0",
    teal600: "#2f9e6e",
    teal100: "#d8f0e3",
    red600: "#e0483f",
    red100: "#fbdedb",
    warn600: "#b5730a",
    warn100: "#fbead0",
    violet600: "#7c5cd6",
    violet100: "#e6def7",
    blue600: "#2f7dc9",
    blue100: "#dae8f7",
    fabBlue: "#17b6ae",
    // Barra lateral (drawer): en la web siempre es oscura
    sidebarBg: "#132a33",
    sidebarTexto: "#f3f9fa",
    sidebarTextoTenue: "#9fb3ba",
    sidebarHover: "#2c454e",
    velo: "rgba(20,24,28,0.55)",
  },
  oscuro: {
    ink900: "#f0f5f6",
    ink700: "#a9bcc2",
    ink500: "#71858c",
    ink300: "#263840",
    linea: "#263840",
    contorno: "#3d5560",
    paper0: "#0b1416",
    paper100: "#16242a",
    petrol600: "#1fc4b8",
    petrol500: "#2ee0d1",
    petrol300: "#5fe8dc",
    petrol100: "#0f3834",
    teal600: "#3fd690",
    teal100: "#0f3327",
    red600: "#ff6b60",
    red100: "#3a1a17",
    warn600: "#f0a838",
    warn100: "#3a2a0f",
    violet600: "#a58aef",
    violet100: "#241c3a",
    blue600: "#5ba3ec",
    blue100: "#16283a",
    fabBlue: "#2ee0d1",
    sidebarBg: "#0f1d22",
    sidebarTexto: "#f3f9fa",
    sidebarTextoTenue: "#9fb3ba",
    sidebarHover: "#1c3038",
    velo: "rgba(0,0,0,0.65)",
  },
};

// Objeto MUTABLE: al cambiar de tema se reescriben sus valores y la app se
// vuelve a montar, así todo lo que lee `colors.x` al renderizar ya ve el tema nuevo.
export const colors = { ...paletas.claro };

let temaActual = "claro";
export function temaActivo() {
  return temaActual;
}
export function aplicarPaleta(nombre) {
  temaActual = paletas[nombre] ? nombre : "claro";
  Object.assign(colors, paletas[temaActual]);
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Mismas familias que la web: --font-display (Barlow Condensed) para
// títulos, --font-body (Inter) para todo lo demás.
export const fonts = {
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  bodyExtra: "Inter_800ExtraBold",
  display: "BarlowCondensed_600SemiBold",
  displayBold: "BarlowCondensed_700Bold",
  displaySemi: "BarlowCondensed_600SemiBold",
  displayBlack: "BarlowCondensed_700Bold",
};

// --radius de la web
export const radius = 10;
export const radiusCard = 10;

// --shadow-card de la web
export const shadowCard = {
  shadowColor: "#14181c",
  shadowOpacity: 0.09,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
