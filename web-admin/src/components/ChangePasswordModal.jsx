import { useState } from "react";
import { marcarCampo } from "../validacion";
import { createPortal } from "react-dom";
import { api, setToken } from "../api";
import { Icono } from "./Icono";
import { useUI } from "../context/UIContext";

export default function ChangePasswordModal({ onClose, onChanged, precargada = "" }) {
  const { notify } = useUI();
  const [passwordActual, setPasswordActual] = useState(precargada);
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [ver, setVer] = useState({ a: false, n: false, c: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (passwordNueva !== confirmacion) {
      const campos = e.currentTarget.querySelectorAll("input[type=password]");
      marcarCampo(campos[campos.length - 1], "La confirmación no coincide con la nueva contraseña");
      return;
    }
    setSaving(true);
    try {
      const r = await api.put("/auth/password", { password_actual: passwordActual, password_nueva: passwordNueva });
      // Las demás sesiones se cierran; esta sigue con el token nuevo
      if (r?.access_token) setToken(r.access_token);
      notify("Contraseña actualizada.", "success");
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onClose}><Icono nombre="close" size={20} /></button>
        <h2>Cambiar contraseña</h2>
        <form onSubmit={handleSubmit}>
          <div className="field-stack">
            <div className="field">
              <label>Contraseña actual</label>
              <div className="pass-caja">
                <input type={ver.a ? "text" : "password"} required value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} />
                <button type="button" className={"pass-ojo" + (ver.a ? " activo" : "")} aria-pressed={ver.a} aria-label={ver.a ? "Ocultar contraseña" : "Ver contraseña"} onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => ({ ...v, a: !v.a }))}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.a && <path d="M3 3l18 18" />}</svg>
                </button>
              </div>
            </div>
            <div className="field">
              <label>Nueva contraseña</label>
              <div className="pass-caja">
                <input type={ver.n ? "text" : "password"} required minLength={6} value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} />
                <button type="button" className={"pass-ojo" + (ver.n ? " activo" : "")} aria-pressed={ver.n} aria-label={ver.n ? "Ocultar contraseña" : "Ver contraseña"} onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => ({ ...v, n: !v.n }))}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.n && <path d="M3 3l18 18" />}</svg>
                </button>
              </div>
            </div>
            <div className="field">
              <label>Confirmar nueva contraseña</label>
              <div className="pass-caja">
                <input type={ver.c ? "text" : "password"} required minLength={6} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
                <button type="button" className={"pass-ojo" + (ver.c ? " activo" : "")} aria-pressed={ver.c} aria-label={ver.c ? "Ocultar contraseña" : "Ver contraseña"} onMouseDown={(e) => e.preventDefault()} onClick={() => setVer((v) => ({ ...v, c: !v.c }))}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{!ver.c && <path d="M3 3l18 18" />}</svg>
                </button>
              </div>
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </form>
      </div>
    </div>
  ,
  document.body
  );
}
