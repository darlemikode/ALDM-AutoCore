import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Cargando, fmt, fmtFecha, useCargar } from "./comun";

const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Cobranza() {
  const navigate = useNavigate();
  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const hoy = new Date();
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return { clave: iso(d), etiqueta: `${NOMBRES[d.getMonth()]} ${d.getFullYear()}`, hasta: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }), []);
  const [mes, setMes] = useState(meses[0]);
  const { datos, error } = useCargar(() => api.get(`/superadmin/pagos?desde=${mes.clave}&hasta=${mes.hasta}`), [mes.clave]);
  const total = (datos || []).reduce((a, p) => a + (p.monto || 0), 0);

  return (
    <>
      <div className="toolbar">
        <select value={mes.clave} onChange={(e) => setMes(meses.find((m) => m.clave === e.target.value))}>
          {meses.map((m) => <option key={m.clave} value={m.clave}>{m.etiqueta}</option>)}
        </select>
        <div className="kpi-card" style={{ flex: 1 }}>
          <div className="kpi-label">Cobrado en {mes.etiqueta.toLowerCase()} · {(datos || []).length} pago(s)</div>
          <div className="kpi-value">{fmt(total)}</div>
        </div>
      </div>
      {!datos ? <Cargando error={error} /> : datos.length === 0 ? <div className="empty-state">No hay pagos en este mes.</div> : (
        <div className="sa-tabla">
          <table>
            <thead><tr><th>Taller</th><th>Fecha</th><th className="num">Monto</th><th>Forma de pago</th><th>Tipo</th><th>Cubre</th></tr></thead>
            <tbody>
              {datos.map((p) => (
                <tr key={p.id_pago} className="sa-fila-link" onClick={() => navigate(`/superadmin/talleres/${p.id_taller}`)}>
                  <td><strong>{p.taller?.nombre_comercial}</strong>{p.registrado_por && <div className="sa-sub">por {p.registrado_por}</div>}</td>
                  <td>{fmtFecha(p.fecha_pago)}</td>
                  <td className="num"><strong>{fmt(p.monto)}</strong></td>
                  <td>{p.metodo_pago || "—"}</td>
                  <td>{p.tipo_cobro?.nombre || "—"}</td>
                  <td>{p.periodo_desde ? `${fmtFecha(p.periodo_desde)} – ${fmtFecha(p.periodo_hasta)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
