import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { Icono } from "./Icono";
import { useAuth } from "../context/AuthContext";

// Los montos de nómina se ocultan hasta que el administrador confirma su contraseña.
// El acceso dura 5 minutos y se comparte entre las pantallas de Nómina.
const VIGENCIA_MS = 5 * 60 * 1000;
let hasta = 0;
let pidiendo = false; // hay una solicitud de contraseña abierta (desde el botón o desde un ojito)
const subs = new Set();
const avisar = () => subs.forEach((f) => f());
const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function useMontos() {
  const { hasPermission } = useAuth();
  const libre = hasPermission("nomina.ver_salario"); // con este permiso no se pide contraseña
  const [, setT] = useState(0);
  useEffect(() => {
    const f = () => setT((x) => x + 1);
    subs.add(f);
    const t = setInterval(f, 15000);
    return () => { subs.delete(f); clearInterval(t); };
  }, []);
  const visible = libre || Date.now() < hasta;
  return { visible, libre, m: (n) => (visible ? fmt(n) : "$ ••••••"), ocultar: () => { hasta = 0; avisar(); } };
}

/** Botón "Mostrar montos" + ventana para capturar la contraseña. */
export function ControlMontos() {
  const { visible, libre, ocultar } = useMontos();
  const { notify } = useUI();
  const abierto = pidiendo;
  const setAbierto = (v) => { pidiendo = v; avisar(); };
  const [pwd, setPwd] = useState("");
  const [cargando, setCargando] = useState(false);

  async function verificar() {
    if (!pwd) return;
    setCargando(true);
    try {
      await api.post("/nomina/verificar-acceso", { password: pwd });
      hasta = Date.now() + VIGENCIA_MS;
      avisar();
      setAbierto(false); setPwd("");
    } catch (err) {
      notify(err.message, "error");
    } finally { setCargando(false); }
  }
  const cerrar = () => { setAbierto(false); setPwd(""); };
  if (libre) return null;

  return (
    <>
      {visible
        ? <button type="button" className="btn btn-secondary" onClick={ocultar} title="Vuelve a ocultar los montos"><Icono nombre="lock" size={16} /> Ocultar montos</button>
        : <button type="button" className="btn btn-secondary" onClick={() => setAbierto(true)}><Icono nombre="lock" size={16} /> Mostrar montos</button>}
      {abierto && createPortal(
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && cerrar()}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2 style={{ fontSize: 19 }}>Confirma tu identidad</h2>
            <div className="field">
              <label>Contraseña del administrador</label>
              <input type="password" autoFocus autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); verificar(); } }} />
              <div className="field-hint">Los montos de nómina se muestran por 5 minutos y luego se vuelven a ocultar.</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={cargando || !pwd} onClick={verificar}>{cargando ? "Verificando..." : "Mostrar montos"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const OJO_ABIERTO = <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>;
const OJO_CERRADO = <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>;

/** Ojito para mostrar/ocultar los montos justo donde se ven (pide contraseña si están ocultos). */
export function OjoMontos({ className = "" }) {
  const { visible, libre, ocultar } = useMontos();
  if (libre) return null;
  return (
    <button type="button" className={`ojo-montos ${className}`} title={visible ? "Ocultar montos" : "Ver montos (pide tu contraseña)"} aria-label={visible ? "Ocultar montos" : "Ver montos"}
      onClick={() => (visible ? ocultar() : (pidiendo = true, avisar()))}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{visible ? OJO_ABIERTO : OJO_CERRADO}</svg>
    </button>
  );
}
