import { getToken } from "../../api";

/** Descarga un PDF protegido por token y devuelve una URL local (blob). */
export async function pdfUrl(ruta, { method = "GET", body } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${ruta}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = "No se pudo generar el documento.";
    try { msg = (await res.json()).detail || msg; } catch { /* sin cuerpo */ }
    throw new Error(typeof msg === "string" ? msg : "No se pudo generar el documento.");
  }
  return URL.createObjectURL(await res.blob());
}

export const dinero = (n) => `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto de ubicación estructurada: "Bodega · Pasillo A · Estante 3 · Nivel 2 · Pos. 4". */
export function ubicacionTexto(r) {
  const p = [];
  if (r.almacen) p.push(r.almacen);
  if (r.pasillo) p.push(`Pasillo ${r.pasillo}`);
  if (r.estanteria) p.push(`Estante ${r.estanteria}`);
  if (r.nivel) p.push(`Nivel ${r.nivel}`);
  if (r.posicion) p.push(`Pos. ${r.posicion}`);
  return p.join(" · ") || r.ubicacion_fisica || "";
}

export const nombreProducto = (r) => `${r.refaccion?.nombre_refaccion || "Producto"}${r.marca_refaccion?.nombre_marca ? ` ${r.marca_refaccion.nombre_marca}` : ""}`;
