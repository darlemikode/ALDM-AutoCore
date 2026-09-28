import { useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";

const ETIQUETAS_ETAPA = {
  recibido: "Recibido",
  diagnostico: "En diagnóstico",
  esperando_autorizacion: "Esperando autorización del cliente",
  en_reparacion: "En reparación",
  esperando_refacciones: "Esperando refacciones",
  control_calidad: "Control de calidad",
  listo_entrega: "Listo para entrega",
};

/**
 * Panel para actualizar en qué etapa va un servicio activo, y ver la
 * bitácora de cambios. Solo tiene sentido mientras la orden sigue abierta
 * (status="abierto") — cerrada/cancelada ya no se actualiza.
 */
export default function EtapaTracker({ servicio, etapas, puedeEditar, onActualizado }) {
  const { notify } = useUI();
  const [nuevaEtapa, setNuevaEtapa] = useState(servicio.etapa || "recibido");
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);

  const catalogo = etapas?.length ? etapas : Object.entries(ETIQUETAS_ETAPA).map(([clave, etiqueta]) => ({ clave, etiqueta }));

  async function actualizar() {
    setGuardando(true);
    try {
      const actualizado = await api.put(`/servicios/${servicio.id_servicio}/etapa`, { etapa: nuevaEtapa, comentario: comentario.trim() || null });
      setComentario("");
      onActualizado(actualizado);
      notify("Estatus actualizado.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="nota-bloque">
      <div className="nota-bloque-header">
        <span className="icono">🛠️</span>
        <h2>Estatus del servicio</h2>
      </div>
      <div className="nota-bloque-body">
      {puedeEditar && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Nueva etapa</label>
            <select value={nuevaEtapa} onChange={(e) => setNuevaEtapa(e.target.value)}>
              {catalogo.map((e) => (
                <option key={e.clave} value={e.clave}>{e.etiqueta}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Comentario (opcional)</label>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej. Esperando la banda de distribución" />
          </div>
          <button className="btn btn-primary" onClick={actualizar} disabled={guardando}>
            {guardando ? "Guardando..." : "Actualizar"}
          </button>
        </div>
      )}

      <div style={{ borderLeft: "2px solid var(--petrol-100)", paddingLeft: 16 }}>
        {(servicio.historial_etapas || []).slice().reverse().map((h) => (
          <div key={h.id_registro} style={{ marginBottom: 12, position: "relative" }}>
            <div style={{ position: "absolute", left: -21, top: 4, width: 8, height: 8, borderRadius: "50%", background: "var(--petrol-500)" }} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>{ETIQUETAS_ETAPA[h.etapa] || h.etapa}</div>
            <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
              {new Date(h.fecha).toLocaleString("es-MX")} {h.actualizado_por ? `· ${h.actualizado_por}` : ""}
            </div>
            {h.comentario && <div style={{ fontSize: 12, marginTop: 2 }}>{h.comentario}</div>}
          </div>
        ))}
        {(!servicio.historial_etapas || servicio.historial_etapas.length === 0) && (
          <div style={{ fontSize: 13, color: "var(--ink-500)" }}>Sin movimientos registrados todavía.</div>
        )}
      </div>
      </div>
    </div>
  );
}
