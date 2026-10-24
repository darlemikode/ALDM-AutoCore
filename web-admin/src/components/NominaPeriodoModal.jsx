import { useState } from "react";
import { createPortal } from "react-dom";
import SelectorFecha from "./SelectorFecha";

const FRECUENCIAS = [
  ["semanal", "Semanal", "Cada semana"], ["quincenal", "Quincenal", "Días 15 y fin de mes"], ["mensual", "Mensual", "Una vez al mes"],
];
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const dias = (a, b) => (a && b ? Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1 : null);

/** Alta / edición de un periodo de nómina (mismo estilo que el asistente de varios periodos). */
export default function NominaPeriodoModal({ titulo, subtitulo, inicial, empleados, calcularFin, onSubmit, onClose, pedirMotivo }) {
  const [v, setV] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const set = (cambios) => setV((a) => ({ ...a, ...cambios }));
  const reponerFin = (n) => ({ fecha_fin: calcularFin(n.periodicidad, n.dia_pago, n.fecha_inicio) });
  const cambiar = (c) => setV((a) => { const n = { ...a, ...c }; return { ...n, ...reponerFin(n) }; });

  const n = dias(v.fecha_inicio, v.fecha_fin);
  const invalido = n !== null && n < 1;
  const elegidos = v.empleados || [];
  const toggle = (id) => set({ empleados: elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id] });

  async function guardar() {
    if (!v.fecha_inicio || !v.fecha_fin) { setError("Elige las fechas del periodo."); return; }
    if (invalido) { setError("La fecha de fin debe ser igual o posterior a la de inicio."); return; }
    if (pedirMotivo && (v.motivo || "").trim().length < 5) { setError("Escribe el motivo de la corrección (mínimo 5 caracteres)."); return; }
    setGuardando(true); setError("");
    try { await onSubmit(v); } catch (e) { setError(e.message || "No se pudo guardar."); } finally { setGuardando(false); }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal nom-lote">
        <h2 style={{ fontSize: 21 }}>{titulo}</h2>
        <div className="modal-subtitulo">{subtitulo}</div>

        <div className="nl-paso"><span className="nl-num">1</span> ¿Cada cuándo se paga?</div>
        <div className="nl-frec">
          {FRECUENCIAS.map(([k, l, d]) => (
            <button type="button" key={k} className={v.periodicidad === k ? "on" : ""} onClick={() => cambiar({ periodicidad: k })}>
              <b>{l}</b><small>{d}</small>
            </button>
          ))}
        </div>
        {v.periodicidad === "semanal" && (
          <div className="nl-dias">
            <span>Se paga el:</span>
            {DIAS.map((l, i) => <button type="button" key={l} className={Number(v.dia_pago) === i ? "on" : ""} onClick={() => cambiar({ dia_pago: String(i) })}>{l.slice(0, 3)}</button>)}
          </div>
        )}

        <div className="nl-paso"><span className="nl-num">2</span> ¿De qué fecha a qué fecha?</div>
        <div className="np-fechas">
          <div className="np-fecha"><label>Empieza el</label><SelectorFecha value={v.fecha_inicio} required onChange={(x) => cambiar({ fecha_inicio: x })} /></div>
          <span className="np-flecha" aria-hidden="true">→</span>
          <div className="np-fecha"><label>Termina el</label><SelectorFecha value={v.fecha_fin} required onChange={(x) => set({ fecha_fin: x })} /></div>
        </div>
        <div className={`np-nota ${invalido ? "mal" : ""}`}>
          {invalido ? "⚠ La fecha de fin debe ser igual o posterior a la de inicio." : n ? `${n} día(s) de periodo · el fin se calcula solo, pero puedes cambiarlo.` : "Elige la fecha de inicio."}
        </div>

        <div className="nl-paso"><span className="nl-num">3</span> ¿A quién se le paga?</div>
        <div className="nl-emps">
          <button type="button" className={`nl-emp todos ${elegidos.length === 0 ? "on" : ""}`} onClick={() => set({ empleados: [] })}>Todos los que cobran</button>
          {empleados.map((e) => (
            <button type="button" key={e.value} className={`nl-emp ${elegidos.includes(e.value) ? "on" : ""}`} onClick={() => toggle(e.value)}>{e.label}</button>
          ))}
        </div>

        <label className="np-repetir">
          <input type="checkbox" checked={!!v.recurrente} onChange={(e) => set({ recurrente: e.target.checked })} />
          <span><b>Repetir automáticamente</b><small>Al terminar este periodo se crea el siguiente solo, con la misma configuración.</small></span>
        </label>

        {pedirMotivo && (
          <div className="np-motivo">
            <label>Motivo de la corrección <span className="req">*</span></label>
            <textarea rows={2} placeholder="Ej. Se capturó mal la fecha de fin; el periodo correcto es del 24 al 30 de octubre." value={v.motivo || ""} onChange={(e) => set({ motivo: e.target.value })} />
            <small>🔒 Queda registrado en Auditoría: quién lo cambió, cuándo, el valor anterior y el nuevo. No se puede borrar.</small>
          </div>
        )}

        <div className="nl-resumen">
          Periodo <b>{v.periodicidad}</b> del <b>{v.fecha_inicio || "—"}</b> al <b>{v.fecha_fin || "—"}</b> para{" "}
          <b>{elegidos.length ? `${elegidos.length} empleado(s) elegido(s)` : `todos los empleados que cobran (${empleados.length})`}</b>
          {v.recurrente ? ", con repetición automática" : ""}.
        </div>
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={guardando || invalido} onClick={guardar}>{guardando ? "Guardando…" : "Guardar periodo"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
