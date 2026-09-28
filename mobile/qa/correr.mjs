// Corre todo el patrón de pruebas QA de la app del taller:  npm run qa
//   1. e2e.mjs        flujos completos (clientes, órdenes, cobro, garantías, inventario, fotos, chat, panel)
//   2. cobertura.mjs  cada llamada api.* de las pantallas tiene equivalente en modo local
//   3. estaticas.mjs  sintaxis, imports JSX, rutas, APIs obsoletas y estilos claro/oscuro (app taller Y app clientes)
//   4. contrato_api.py  cada llamada de la app existe en el backend FastAPI real (routers/*.py)
//   5. paridad_web.py   cada campo de los formularios web existe en la pantalla equivalente
// Deja el resultado en qa/ultimo-reporte.txt
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const dir = path.dirname(fileURLToPath(import.meta.url));
// e2e.mjs y cobertura.mjs prueban específicamente la implementación en
// modo local (ver apiLocal.js) — no un backend real. Con MODO_LOCAL ya
// dinámico (ver localMode.js), se fuerza aquí para que estas pruebas no
// dependan de si hay o no un backend real escuchando en esta máquina.
const pruebas = [
  ["Flujos E2E", "e2e.mjs", { ALDM_FORZAR_MODO_LOCAL: "1" }],
  ["Cobertura de endpoints", "cobertura.mjs", { ALDM_FORZAR_MODO_LOCAL: "1" }],
  ["Rutas y estilos — app taller", "estaticas.mjs"],
  ["Rutas y estilos — app clientes", "estaticas.mjs", { QA_SRC: "../../mobile-cliente/src" }],
  ["Rutas y estilos — app súper admin", "estaticas.mjs", { QA_SRC: "../../mobile-superadmin/src" }],
];
let reporte = `QA Apps móviles (taller + clientes) — ${new Date().toLocaleString("es-MX")}\n`;
let hayFallas = false;
// Los flujos E2E se repiten (QA_REPETIR, default 3) para cazar fallas intermitentes
const repeticiones = Number(process.env.QA_REPETIR || 3);
for (const [nombre, archivo, env = {}] of pruebas) {
  const veces = archivo === "e2e.mjs" ? repeticiones : 1;
  let r, salida = "", paso = true;
  for (let i = 1; i <= veces && paso; i++) {
    r = spawnSync(process.execPath, ["--no-warnings", "--import", "./registrar.mjs", archivo], { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
    salida = (veces > 1 ? `(corrida ${i} de ${veces})\n` : "") + (r.stdout || "") + (r.stderr || "");
    paso = r.status === 0;
  }
  if (!paso) hayFallas = true;
  reporte += `\n===== ${paso ? "✓" : "✗"} ${nombre} =====\n${salida.trim()}\n`;
  console.log(`${paso ? "✓" : "✗"} ${nombre}`);
}
// Validaciones en Python (se saltan si no hay Python instalado)
const python = ["python", "python3", "py"].find((p) => spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0);
for (const [nombre, archivo] of [["Contrato con el backend", "contrato_api.py"], ["Paridad de campos con la web", "paridad_web.py"]]) {
  if (!python) { reporte += `\n===== ⚠ ${nombre} =====\nNo se encontró Python; se omitió.\n`; console.log(`⚠ ${nombre} (sin Python)`); continue; }
  const r = spawnSync(python, [archivo], { cwd: dir, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  const paso = r.status === 0;
  if (!paso) hayFallas = true;
  reporte += `\n===== ${paso ? "✓" : "✗"} ${nombre} =====\n${((r.stdout || "") + (r.stderr || "")).trim()}\n`;
  console.log(`${paso ? "✓" : "✗"} ${nombre}`);
}
fs.writeFileSync(path.join(dir, "ultimo-reporte.txt"), reporte);
console.log(hayFallas ? "\nHay fallas — revisa qa/ultimo-reporte.txt" : "\nTodo en verde. Detalle en qa/ultimo-reporte.txt");
process.exit(hayFallas ? 1 : 0);
