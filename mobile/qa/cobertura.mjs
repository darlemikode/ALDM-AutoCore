// Escanea TODAS las llamadas api.* de pantallas/componentes y verifica que
// el modo local (apiLocal.js) tenga equivalente para cada una.
import fs from "node:fs";
import path from "node:path";
import { api } from "../src/api.js";

const dirs = ["../src/screens", "../src/components", "../src/context"];
const llamadas = [];
const re = /api\.(get|post|put|del|postForm)\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const txt = fs.readFileSync(path.join(d, f), "utf8");
  let m;
  while ((m = re.exec(txt))) llamadas.push({ archivo: f, metodo: m[1], ruta: m[2].slice(1, -1) });
}
// preparar datos base para que las rutas con id existan
await api.put("/auth/password", { password_actual: "admin1234", password_nueva: "qa-tests-2026" });
const c = await api.post("/clientes/", { nombre_cliente: "QA", telefono1: "4770000000" });
const v = await api.post("/vehiculos/", { id_cliente: c.id_cliente, placas_vehiculo: "QA-1" });
const s = await api.post("/servicios/", { id_cliente: c.id_cliente, id_vehiculo: v.id_vehiculo, nombre_servicio: "QA" });

const muestra = (ruta) => ruta
  .replace(/\$\{[^}]*(cp|valor)[^}]*\}/gi, "37000")
  .replace(/\$\{[^}]*\}/g, "1");
const vistas = new Set();
const faltan = [], otrosErrores = [];
for (const l of llamadas) {
  const ruta = muestra(l.ruta);
  if (!ruta.startsWith("/")) continue; // rutas armadas dinámicamente (p. ej. Catálogos) se prueban en e2e
  const clave = `${l.metodo} ${ruta}`;
  if (vistas.has(clave)) continue;
  vistas.add(clave);
  try {
    const metodo = l.metodo === "del" ? "del" : l.metodo;
    if (metodo === "get" || metodo === "del") await api[metodo](ruta);
    else await api[metodo](ruta, metodo === "postForm" ? { get: () => null } : {});
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("todavía no tiene equivalente local")) faltan.push(`${clave}   (${l.archivo})`);
    else otrosErrores.push(`${clave}   (${l.archivo}) -> ${msg.slice(0, 90)}`);
  }
}
console.log(`Llamadas únicas: ${vistas.size}`);
console.log(`\nSIN EQUIVALENTE LOCAL (${faltan.length}):\n` + faltan.join("\n"));
console.log(`\nErrores de validación esperados con cuerpo vacío (${otrosErrores.length}):\n` + otrosErrores.join("\n"));
process.exit(faltan.length ? 1 : 0);
