// Utilidades compartidas del panel de súper administración (mismas reglas
// de formato y estados que la app móvil mobile-superadmin).
import { useCallback, useEffect, useState } from "react";

export const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtCorto = (n) => {
  const v = Number(n) || 0;
  return v >= 1000 ? `$${(v / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${v.toFixed(0)}`;
};
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtFecha(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export const ESTADOS = {
  prueba: { texto: "En prueba", clase: "badge-blue" },
  activa: { texto: "Activa", clase: "badge-teal" },
  gracia: { texto: "En gracia", clase: "badge-amber" },
  vencida: { texto: "Vencida", clase: "badge-red" },
  suspendida: { texto: "Suspendida", clase: "badge-grey" },
  cancelada: { texto: "Cancelada", clase: "badge-grey" },
};

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { texto: estado || "—", clase: "badge-grey" };
  return <span className={`badge ${e.clase}`}>{e.texto}</span>;
}

export const METODOS_PAGO = [
  { value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" }, { value: "deposito", label: "Depósito" }, { value: "otro", label: "Otro" },
];

export const ESTADOS_MANUALES = [
  { value: "prueba", label: "En prueba" }, { value: "activa", label: "Activa" },
  { value: "suspendida", label: "Suspendida" }, { value: "cancelada", label: "Cancelada" },
];

export const TIPOS_NEGOCIO = [
  { value: "taller", label: "Taller" }, { value: "refaccionaria", label: "Refaccionaria" }, { value: "ambos", label: "Ambos" },
];

/** Carga datos con estado de carga/error y una función para recargar. */
export function useCargar(cargar, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const recargar = useCallback(async () => {
    try {
      setError("");
      setDatos(await cargar());
    } catch (err) {
      setError(err.message || "No se pudo cargar.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { recargar(); }, [recargar]);
  return { datos, setDatos, error, recargar };
}

export function Cargando({ error }) {
  return error ? <div className="empty-state" style={{ color: "var(--red-600)" }}>{error}</div> : <div className="loading-text">Cargando…</div>;
}

/** Fila etiqueta/valor para las tarjetas de detalle. */
export function Dato({ etiqueta, children, tono }) {
  return (
    <div className="sa-dato">
      <span className="sa-dato-etiqueta">{etiqueta}</span>
      <span className="sa-dato-valor" style={tono ? { color: `var(--${tono}-600)` } : undefined}>{children ?? "—"}</span>
    </div>
  );
}

/** Copia texto al portapapeles; si el navegador lo impide, lo selecciona con prompt. */
export async function copiar(texto, notify) {
  try {
    await navigator.clipboard.writeText(texto);
    notify?.("Copiado al portapapeles.", "success");
  } catch {
    window.prompt("Copia este texto:", texto);
  }
}
