import { useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";

// Etapas del servicio con su ícono — mismo catálogo que el backend
const ETAPAS = [
  { clave: "recibido", etiqueta: "Recibido", icono: "📥" },
  { clave: "diagnostico", etiqueta: "En diagnóstico", icono: "🔎" },
  { clave: "esperando_autorizacion", etiqueta: "Esperando autorización", icono: "⏳" },
  { clave: "en_reparacion", etiqueta: "En reparación", icono: "🔧" },
  { clave: "esperando_refacciones", etiqueta: "Esperando refacciones", icono: "📦" },
  { clave: "control_calidad", etiqueta: "Control de calidad", icono: "✅" },
  { clave: "listo_entrega", etiqueta: "Listo para entrega", icono: "🚗" },
];

/**
 * Estatus del servicio como una línea de pasos: se ve de un vistazo en qué
 * va el vehículo, y con un clic en otro paso se cambia (con comentario
 * opcional). Cada cambio le llega al cliente en su app.
 */
export default function EstatusLateral({ servicio, puedeEditar, onActualizado }) {
  const { notify } = useUI();
  const [eligiendo, setEligiendo] = useState(null); // clave de la etapa por confirmar
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const abierta = servicio.status === "abierto";
  const editable = puedeEditar && abierta;
  const indiceActual = Math.max(ETAPAS.findIndex((e) => e.clave === servicio.etapa), 0);
  const historial = (servicio.historial_etapas || []).slice().reverse();

  async function confirmar() {
    setGuardando(true);
    try {
      const actualizado = await api.put(`/servicios/${servicio.id_servicio}/etapa`, { etapa: eligiendo, comentario: comentario.trim() || null });
      onActualizado(actualizado);
      notify(`Estatus: ${ETAPAS.find((e) => e.clave === eligiendo)?.etiqueta}. Se avisó al cliente.`, "success");
      setEligiendo(null);
      setComentario("");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="nota-bloque lateral-bloque">
      <div className="nota-bloque-header">
        <span className="icono">🛠️</span>
        <h2>Estatus del servicio</h2>
      </div>
      <div className="nota-bloque-body">
        {!abierta && (
          <div className="field-hint" style={{ marginBottom: 10 }}>
            La orden está {servicio.status === "cerrado" ? "finalizada" : servicio.status}; el estatus ya no se modifica.
          </div>
        )}
        <ol className="estatus-pasos">
          {ETAPAS.map((e, i) => {
            const estado = i < indiceActual ? "hecho" : i === indiceActual ? "actual" : "pendiente";
            return (
              <li key={e.clave} className={`estatus-paso ${estado} ${eligiendo === e.clave ? "eligiendo" : ""}`}>
                <button
                  type="button"
                  disabled={!editable || estado === "actual"}
                  onClick={() => { setEligiendo(eligiendo === e.clave ? null : e.clave); setComentario(""); }}
                  title={estado === "actual" ? "Etapa actual" : editable ? `Cambiar a "${e.etiqueta}"` : e.etiqueta}
                >
                  <span className="estatus-paso-icono">{estado === "hecho" ? "✓" : e.icono}</span>
                  <span className="estatus-paso-texto">
                    {e.etiqueta}
                    {estado === "actual" && <span className="estatus-paso-actual">Actual</span>}
                  </span>
                </button>
                {eligiendo === e.clave && (
                  <div className="estatus-confirmar">
                    <input
                      autoFocus
                      value={comentario}
                      onChange={(ev) => setComentario(ev.target.value)}
                      onKeyDown={(ev) => ev.key === "Enter" && confirmar()}
                      placeholder="Comentario para el cliente (opcional)"
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEligiendo(null)}>Cancelar</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={confirmar} disabled={guardando}>
                        {guardando ? "Guardando…" : "Cambiar estatus"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {historial.length > 0 && (
          <div className="estatus-historial">
            <button type="button" className="estatus-historial-toggle" onClick={() => setVerHistorial((v) => !v)}>
              🕘 Historial ({historial.length}) {verHistorial ? "▲" : "▼"}
            </button>
            {verHistorial && historial.map((h) => (
              <div key={h.id_registro} className="estatus-historial-item">
                <b>{ETAPAS.find((e) => e.clave === h.etapa)?.etiqueta || h.etapa}</b>
                <span>{new Date(h.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}{h.actualizado_por ? ` · ${h.actualizado_por}` : ""}</span>
                {h.comentario && <div>{h.comentario}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
