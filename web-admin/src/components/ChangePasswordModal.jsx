import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";

export default function ChangePasswordModal({ onClose }) {
  const { notify } = useUI();
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (passwordNueva !== confirmacion) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/password", { password_actual: passwordActual, password_nueva: passwordNueva });
      notify("Contraseña actualizada.", "success");
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
        <h2>Cambiar contraseña</h2>
        <form onSubmit={handleSubmit}>
          <div className="field-stack">
            <div className="field">
              <label>Contraseña actual</label>
              <input type="password" required value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} />
            </div>
            <div className="field">
              <label>Nueva contraseña</label>
              <input type="password" required minLength={6} value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirmar nueva contraseña</label>
              <input type="password" required minLength={6} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
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
