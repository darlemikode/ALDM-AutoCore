import { DatabaseSync } from "node:sqlite";
// Una base por nombre dentro del proceso (como en el celular: el archivo persiste)
const bases = globalThis.__qaBases || (globalThis.__qaBases = new Map());
export async function openDatabaseAsync(nombre) {
  if (!bases.has(nombre)) bases.set(nombre, new DatabaseSync(":memory:"));
  const d = bases.get(nombre);
  const norm = (p) => (p || []).map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
  return {
    execAsync: async (sql) => d.exec(sql),
    runAsync: async (sql, params) => { const r = d.prepare(sql).run(...norm(params)); return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes }; },
    getFirstAsync: async (sql, params) => d.prepare(sql).get(...norm(params)) ?? null,
    getAllAsync: async (sql, params) => d.prepare(sql).all(...norm(params)),
    withTransactionAsync: async (fn) => { d.exec("BEGIN"); try { await fn(); d.exec("COMMIT"); } catch (e) { d.exec("ROLLBACK"); throw e; } },
  };
}
