// Pago de la suscripción del taller en línea (Mercado Pago). Se elige el
// tipo de cobro y se abre la página de pago; al aprobarse, el backend
// renueva la suscripción solo (ver backend/app/routers/pagos_en_linea.py).
import { useEffect, useState } from "react";
import { api } from "../api";
import ModalPortal from "./ModalPortal";

const fmt = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

export default function PagarSuscripcion({ onClose }) {
  const [datos, setDatos] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.get("/pagos-en-linea/opciones")
      .then((d) => { setDatos(d); setElegido(d.id_tipo_cobro_actual || d.opciones[0]?.id_tipo_cobro); })
      .catch((e) => setError(e.message));
  }, []);

  async function pagar() {
    setCargando(true);
    setError("");
    try {
      const { url } = await api.post("/pagos-en-linea/checkout", { id_tipo_cobro: elegido });
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setCargando(false);
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 460 }}>
          <h2>Pagar suscripción</h2>
          {!datos && !error && <div className="loading-text">Cargando…</div>}
          {datos && !datos.disponible && <p className="subtitle">El pago en línea aún no está disponible. Contacta a ALDM para pagar por transferencia.</p>}
          {datos?.disponible && (
            <>
              <p className="subtitle" style={{ marginBottom: 12 }}>Plan {datos.paquete}. Paga con tarjeta, OXXO o transferencia SPEI; al aprobarse se renueva sola.</p>
              <div className="chips-select" style={{ flexDirection: "column", alignItems: "stretch" }}>
                {datos.opciones.map((o) => (
                  <button key={o.id_tipo_cobro} type="button" className={"chip-toggle" + (elegido === o.id_tipo_cobro ? " chip-toggle-on" : "")}
                    style={{ display: "flex", justifyContent: "space-between", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}
                    onClick={() => setElegido(o.id_tipo_cobro)}>
                    <span>{o.nombre} ({o.meses} mes{o.meses > 1 ? "es" : ""})</span><strong>{fmt(o.monto)}</strong>
                  </button>
                ))}
              </div>
            </>
          )}
          {error && <div className="error-text" style={{ color: "var(--red-600)", marginTop: 10 }}>{error}</div>}
          <div className="modal-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            {datos?.disponible && <button className="btn btn-primary" disabled={!elegido || cargando} onClick={pagar}>{cargando ? "Abriendo…" : "Ir a pagar"}</button>}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
