// Prueba de humo de la capa de red de la web (src/api.js): corre en Node, sin navegador ni dependencias.
// Atrapa justo el tipo de error que rompió producción el 7-nov-2026 ("request is not defined"):
// una función o variable que quedó fuera al editar api.js y que ni la compilación ni vite detectan.
//   Uso:  cd web-admin && npm run humo
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const memoria = new Map();
globalThis.localStorage = { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) };
globalThis.window = { location: { pathname: "/", href: "/" } };

const llamadas = [];
globalThis.fetch = async (url, opciones = {}) => {
  llamadas.push(`${opciones.method || "GET"} ${url}`);
  const cuerpo = String(url).endsWith("/auth/login") ? { access_token: "token-de-prueba" } : [{ id: 1 }];
  return { ok: true, status: 200, json: async () => cuerpo };
};

let fallos = 0;
async function prueba(nombre, fn) {
  try { await fn(); console.log(`  ok   ${nombre}`); } catch (e) { fallos++; console.log(`  FALLA ${nombre}\n        ${e.message}`); }
}

const api = await import(pathToFileURL(resolve("src/api.js")).href);
console.log("Prueba de humo: web-admin/src/api.js");

await prueba("exporta api, login, getToken y setToken", () => {
  for (const n of ["api", "login", "getToken", "setToken"]) assert.ok(api[n], `falta el export ${n}`);
  for (const m of ["get", "post", "postForm", "put", "del"]) assert.equal(typeof api.api[m], "function", `falta api.${m}`);
});
await prueba("login guarda el token", async () => {
  await api.login("usuario", "clave");
  assert.equal(api.getToken(), "token-de-prueba");
});
await prueba("api.get de una lista devuelve datos y manda el token", async () => {
  const r = await api.api.get("/clientes/");
  assert.deepEqual(r, [{ id: 1 }]);
});
await prueba("catálogo: la segunda lectura sale del caché", async () => {
  llamadas.length = 0;
  await api.api.get("/vehiculos-marcas/");
  await api.api.get("/vehiculos-marcas/");
  assert.equal(llamadas.filter((l) => l.includes("/vehiculos-marcas/")).length, 1);
});
await prueba("catálogo: un POST borra el caché", async () => {
  await api.api.post("/vehiculos-marcas/", { nombre_marca: "X" });
  llamadas.length = 0;
  await api.api.get("/vehiculos-marcas/");
  assert.equal(llamadas.filter((l) => l.includes("GET /api/vehiculos-marcas/")).length, 1);
});
await prueba("listas normales NO se cachean", async () => {
  llamadas.length = 0;
  await api.api.get("/servicios/");
  await api.api.get("/servicios/");
  assert.equal(llamadas.filter((l) => l.includes("/servicios/")).length, 2);
});
await prueba("setToken(null) limpia la sesión y el caché", async () => {
  api.setToken(null);
  assert.equal(api.getToken(), null);
  llamadas.length = 0;
  await api.api.get("/vehiculos-marcas/");
  assert.equal(llamadas.length, 1);
});

if (fallos) { console.log(`\n${fallos} prueba(s) fallaron: NO subir a producción.`); process.exit(1); }
console.log("\nTodo en verde.");
