// Tokens idénticos a web-admin/src/styles.css (:root y :root[data-theme="dark"]).
// Si cambian allá, cambiarlos aquí igual para que web y mobile se vean iguales.
export const paletas = {
  claro: {
    ink900: "#141416",
    ink700: "#4a4a51",
    ink500: "#85858d",
    ink300: "#dcdce0",
    linea: "#dcdce0",
    contorno: "#b4b4bb",
    paper0: "#ededf0",
    paper100: "#fcfcfd",
    petrol600: "#c40000",
    petrol500: "#e10600",
    petrol300: "#ff6b66",
    petrol100: "#fde3e2",
    teal600: "#2f9e6e",
    teal100: "#d8f0e3",
    red600: "#b3261e",
    red100: "#f9dcd9",
    warn600: "#b5730a",
    warn100: "#fbead0",
    violet600: "#7c5cd6",
    violet100: "#e6def7",
    blue600: "#2f7dc9",
    blue100: "#dae8f7",
    fabBlue: "#e10600",
    sobreAcento: "#ffffff", // texto sobre botones y chips rojos
    // Barra lateral (drawer): en la web siempre es oscura
    sidebarBg: "#070708",
    sidebarTexto: "#f5f5f7",
    sidebarTextoTenue: "#a8a8b0",
    sidebarHover: "#2a2a30",
    velo: "rgba(20,24,28,0.55)",
  },
  oscuro: {
    ink900: "#f2f2f4",
    ink700: "#b4b4bb",
    ink500: "#7d7d85",
    ink300: "#2a2a30",
    linea: "#2a2a30",
    contorno: "#46464e",
    paper0: "#0b0b0c",
    paper100: "#17171a",
    petrol600: "#ff4a3f",
    petrol500: "#e8251b",
    petrol300: "#ff7a70",
    petrol100: "#3d1010",
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
    fabBlue: "#e8251b",
    sobreAcento: "#f5f5f7",
    sidebarBg: "#070708",
    sidebarTexto: "#f5f5f7",
    sidebarTextoTenue: "#a8a8b0",
    sidebarHover: "#2a2a30",
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
