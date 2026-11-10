import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { toQR } from "../../lib/toqr";
import { useUI } from "../../context/UIContext";

function Qr({ contenido, tamano = 190 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !contenido) return;
    const m = toQR(contenido);
    const n = Math.round(Math.sqrt(m.length));
    const margen = 4;
    const esc = Math.max(1, Math.floor(tamano / (n + margen * 2)));
    canvas.width = canvas.height = (n + margen * 2) * esc;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y * n + x] & 1) ctx.fillRect((x + margen) * esc, (y + margen) * esc, esc, esc);
  }, [contenido, tamano]);
  return <canvas ref={ref} aria-label="Código QR para tu app de autenticación" style={{ borderRadius: 8 }} />;
}

/** Verificación en dos pasos del súper administrador (app de autenticación). */
export default function Seguridad2FA() {
  const { notify } = useUI();
  const [activo, setActivo] = useState(null);
  const [modal, setModal] = useState(null); // null | "activar" | "desactivar"
  const [setup, setSetup] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => { api.get("/superadmin/2fa").then((r) => setActivo(r.activo)).catch(() => {}); }, []);

  async function abrir(tipo) {
    setCodigo("");
    setSetup(null);
    try {
      if (tipo === "activar") setSetup(await api.post("/superadmin/2fa/iniciar"));
      setModal(tipo);
    } catch (err) { notify(err.message, "error"); }
  }
  async function enviar(e) {
    e.preventDefault();
    setTrabajando(true);
    try {
      const r = await api.post(`/superadmin/2fa/${modal === "activar" ? "activar" : "desactivar"}`, { codigo });
      setActivo(r.activo);
      setModal(null);
      notify(r.activo ? "Verificación en dos pasos activada." : "Verificación en dos pasos desactivada.", "success");
    } catch (err) { notify(err.message, "error"); } finally { setTrabajando(false); }
  }

  if (activo === null) return null;
  return (
    <>
      {activo ? (
        <div className="sa-sub" style={{ marginBottom: 10 }}>
          🔒 Verificación en dos pasos activa · <button type="button" className="btn-link" style={{ background: "none", border: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }} onClick={() => abrir("desactivar")}>Desactivar</button>
        </div>
      ) : (
        <div className="sa-aviso-2fa" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, borderRadius: 10, border: "1px solid var(--amber-500, #d99a00)", background: "color-mix(in srgb, var(--amber-500, #d99a00) 12%, transparent)" }}>
          <span style={{ flex: 1, minWidth: 220 }}><strong>Protege tu cuenta de súper admin.</strong> Activa la verificación en dos pasos: además de tu contraseña se pedirá un código de tu teléfono.</span>
          <button className="btn btn-primary" onClick={() => abrir("activar")}>Activar</button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <form className="modal" onSubmit={enviar} style={{ maxWidth: 420 }}>
            <h2>{modal === "activar" ? "Activar verificación" : "Desactivar verificación"}</h2>
            {modal === "activar" && setup && (
              <>
                <p className="sa-sub">1. En Google Authenticator, Microsoft Authenticator o Authy escanea este QR.</p>
                <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}><Qr contenido={setup.uri} /></div>
                <p className="sa-sub">¿No puedes escanear? Escribe esta clave: <code style={{ userSelect: "all", wordBreak: "break-all" }}>{setup.secreto}</code></p>
                <p className="sa-sub">2. Escribe el código de 6 dígitos que muestra la app.</p>
              </>
            )}
            {modal === "desactivar" && <p className="sa-sub">Escribe el código actual de tu app para quitar la verificación.</p>}
            <div className="field">
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^0-9 ]/g, ""))} placeholder="000000" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".2em" }} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={trabajando || codigo.replace(/\s/g, "").length !== 6}>{modal === "activar" ? "Activar" : "Desactivar"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
