import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import IconoModulo from "../components/IconoModulo";

const ETIQUETAS = { efectivo: "Efectivo", tarjeta: "Pago con tarjeta", mixto: "Mixto" };

export default function Comisiones() {
  const { notify } = useUI();
  const [comisiones, setComisiones] = useState([]);
  const [valores, setValores] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get("/comisiones/").then((data) => {
      setComisiones(data);
      const iniciales = {};
      data.forEach((c) => { iniciales[c.tipo_pago] = String(c.porcentaje); });
      setValores(iniciales);
    });
  }, []);

  async function guardar() {
    setGuardando(true);
    try {
      await Promise.all(
        comisiones.map((c) => api.put(`/comisiones/${c.tipo_pago}`, { porcentaje: parseFloat(valores[c.tipo_pago]) || 0 }))
      );
      notify("Comisiones actualizadas.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/comisiones" /> Comisiones por tipo de pago</h1>
            <div className="subtitle">Se usa para mostrar la comisión estimada en cada nota/recibo finalizado</div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 420 }}>
        {comisiones.map((c) => (
          <div className="field" key={c.tipo_pago}>
            <label>{ETIQUETAS[c.tipo_pago] || c.tipo_pago}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                step="0.1"
                value={valores[c.tipo_pago] || ""}
                onChange={(e) => setValores((prev) => ({ ...prev, [c.tipo_pago]: e.target.value }))}
              />
              <span style={{ fontWeight: 700, color: "var(--ink-500)" }}>%</span>
            </div>
          </div>
        ))}
        <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ marginTop: 12 }}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}
