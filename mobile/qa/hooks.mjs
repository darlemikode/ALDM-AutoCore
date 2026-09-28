// Hace que Node ejecute el código de la app tal cual lo ve Metro:
//  - imports sin extensión ("./db" -> "./db.js")
//  - archivos .js de src/ como módulos ES
//  - módulos nativos de Expo/React Native sustituidos por mocks (mocks/)
const MOCKS = {
  "expo-sqlite": "sqlite.mjs",
  "expo-file-system": "filesystem.mjs",
  "expo-file-system/legacy": "filesystem.mjs",
  "expo-secure-store": "securestore.mjs",
  "@react-native-async-storage/async-storage": "asyncstorage.mjs",
  "react-native": "reactnative.mjs",
  "expo-constants": "constants.mjs",
};
const base = new URL("./mocks/", import.meta.url);
export async function resolve(spec, ctx, next) {
  if (MOCKS[spec]) return { url: new URL(MOCKS[spec], base).href, shortCircuit: true };
  try { return await next(spec, ctx); }
  catch (e) {
    if (spec.startsWith(".")) return next(spec + ".js", ctx);
    throw e;
  }
}
export async function load(url, ctx, next) {
  if (url.includes("/src/") && url.endsWith(".js")) {
    const r = await next(url, { ...ctx, format: "module" });
    return { ...r, format: "module" };
  }
  return next(url, ctx);
}
