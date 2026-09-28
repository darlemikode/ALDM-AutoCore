// Pruebas estáticas: rutas de navegación y estilos de TODAS las pantallas en claro y oscuro.
// QA_SRC elige la app: "../src" (taller, default) o "../../mobile-cliente/src" (app de clientes).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const SRC = process.env.QA_SRC || "../src";
const { colors, spacing, radius, radiusCard, shadowCard, fonts, aplicarPaleta, paletas } = await import(pathToFileURL(path.resolve(SRC, "theme.js")).href);
const { crearEstilos } = await import(pathToFileURL(path.resolve(SRC, "ui/estilos.js")).href);
const { parse } = createRequire(import.meta.url)("@babel/parser");
console.log(`App: ${path.resolve(SRC, "..")}`);

let fallas = 0;
const falla = (m) => { fallas++; console.log("  FALLA:", m); };
const archivos = [];
for (const d of ["screens", "components", "navigation", "ui"].map((x) => path.join(SRC, x))) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith(".js")) archivos.push(path.join(d, f));

// 1) Rutas: todo navigate/push/replace apunta a una pantalla registrada
const nav = fs.readFileSync(path.join(SRC, "navigation/AppNavigator.js"), "utf8");
const registradas = new Set([...nav.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
// pilas creadas con un helper pila(Stack, "Nombre", …) — app de clientes
for (const m of nav.matchAll(/pila\(\w+,\s*"([^"]+)"/g)) registradas.add(m[1]);
let rutasRevisadas = 0;
for (const f of archivos) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(/navigation(?:\?\.)?(?:\.getParent\([^)]*\)\??)?\.(?:navigate|push|replace)\(\s*"([^"]+)"/g)) { rutasRevisadas++; if (!registradas.has(m[1])) falla(`${path.basename(f)} navega a "${m[1]}" que no existe`); }
  for (const m of t.matchAll(/screen:\s*"([^"]+)"/g)) { rutasRevisadas++; if (!registradas.has(m[1])) falla(`${path.basename(f)} usa screen "${m[1]}" que no existe`); }
}
console.log(`✓ Rutas de navegación revisadas: ${rutasRevisadas} (${registradas.size} pantallas registradas)`);

// 1b) APIs de Expo que ya no existen o truenan en el SDK actual
const PROHIBIDOS = [
  [/from\s+"expo-file-system"\s*;/, 'importar de "expo-file-system": readAsStringAsync/downloadAsync lanzan error en SDK 54+; usar "expo-file-system/legacy"'],
  [/\.defaultProps\s*=/, "defaultProps no aplica a componentes función en React 19"],
  [/\bAlert\.alert\(/, "Alert.alert muestra el cuadro nativo; usar alerta() / mostrarDialogo() de ui/Dialogo para mantener el diseño"],
];
let revisadosApis = 0;
for (const f of [...archivos, ...fs.readdirSync(SRC).filter((x) => x.endsWith(".js")).map((x) => path.join(SRC, x))]) {
  const t = fs.readFileSync(f, "utf8");
  revisadosApis++;
  for (const [re, motivo] of PROHIBIDOS) if (re.test(t)) falla(`${path.basename(f)}: ${motivo}`);
}
console.log(`✓ APIs obsoletas revisadas en ${revisadosApis} archivos`);

// 1c) Sintaxis (parser de Babel, igual que Metro), componentes JSX sin importar y styles.x sin definir
let jsxRevisados = 0;
for (const f of archivos) {
  const t = fs.readFileSync(f, "utf8");
  try { parse(t, { sourceType: "module", plugins: ["jsx"] }); } catch (e) { falla(`${path.basename(f)}: error de sintaxis ${e.message}`); continue; }
  for (const u of new Set([...t.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]))) {
    jsxRevisados++;
    if (!new RegExp(`(import[^;]*\\b${u}\\b|function ${u}\\b|const ${u}\\b)`).test(t)) falla(`${path.basename(f)}: <${u}> se usa pero no está importado`);
  }
  const bloque = t.includes("crearEstilos({") || t.includes("StyleSheet.create({") ? t.slice(t.search(/(crearEstilos|StyleSheet\.create)\(\{/)) : "";
  const definidos = new Set([...bloque.matchAll(/(?:^\s{2}|\},\s*)(\w+):\s*\{/gm)].map((m) => m[1]));
  for (const m of new Set([...t.matchAll(/\bstyles\.(\w+)/g)].map((x) => x[1]))) if (bloque && !definidos.has(m)) falla(`${path.basename(f)}: styles.${m} no está definido`);
}
console.log(`✓ Sintaxis, ${jsxRevisados} componentes JSX y estilos usados revisados`);

// 2) Estilos: se evalúa el bloque crearEstilos de cada archivo y se calcula cada estilo en ambos temas
function extraerBloque(t) {
  const i = t.indexOf("crearEstilos({");
  if (i < 0) return null;
  let j = t.indexOf("{", i), prof = 0;
  for (let k = j; k < t.length; k++) { if (t[k] === "{") prof++; else if (t[k] === "}") { prof--; if (prof === 0) return t.slice(j, k + 1); } }
  return null;
}
const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function lum(c) {
  if (!hex.test(c)) return null;
  let h = c.slice(1); if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => { const x = lum(a), y = lum(b); if (x == null || y == null) return 99; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
let estilosRevisados = 0, bajoContraste = [];
for (const f of archivos) {
  const bloque = extraerBloque(fs.readFileSync(f, "utf8"));
  if (!bloque) continue;
  aplicarPaleta("claro");
  let def;
  try { def = new Function("colors", "spacing", "radius", "radiusCard", "shadowCard", "fonts", `return (${bloque});`)(colors, spacing, radius, radiusCard, shadowCard, fonts); }
  catch (e) { falla(`${path.basename(f)}: no se pudo evaluar estilos (${e.message})`); continue; }
  const st = crearEstilos(def);
  for (const tema of ["claro", "oscuro"]) {
    aplicarPaleta(tema);
    for (const k of Object.keys(def)) {
      estilosRevisados++;
      const o = st[k];
      for (const [p, v] of Object.entries(o || {})) {
        if (/color$/i.test(p) && (v === undefined || v === null)) falla(`${path.basename(f)}.${k}.${p} sin color en ${tema}`);
        if (p === "fontFamily" && !/^(Inter_|BarlowCondensed_)/.test(v)) falla(`${path.basename(f)}.${k} fuente desconocida ${v}`);
      }
      // texto sobre su propio fondo (en el mismo estilo)
      if (o?.color && o?.backgroundColor && contraste(o.color, o.backgroundColor) < 3) bajoContraste.push(`${path.basename(f)}.${k} (${tema}) ${o.color} sobre ${o.backgroundColor}: ${contraste(o.color, o.backgroundColor).toFixed(2)}`);
      // texto sobre el fondo general de la app
      if (!/(bot[oó]n|button|btn|fab|activo|activa|texto$)/i.test(k) && o?.color && !o?.backgroundColor && o.fontSize && contraste(o.color, paletas[tema].paper0) < 1.6 && contraste(o.color, paletas[tema].paper100) < 1.6) bajoContraste.push(`${path.basename(f)}.${k} (${tema}) ${o.color} casi invisible sobre el fondo`);
    }
  }
}
aplicarPaleta("claro");
console.log(`✓ Estilos calculados en claro y oscuro: ${estilosRevisados}`);
if (bajoContraste.length) { console.log(`  Contraste bajo (${bajoContraste.length}):`); bajoContraste.forEach((x) => console.log("   -", x)); }
console.log(fallas ? `\n${fallas} FALLAS` : "\nSin fallas");
process.exit(fallas ? 1 : 0);
