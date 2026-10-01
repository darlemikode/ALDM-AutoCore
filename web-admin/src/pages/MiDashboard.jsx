import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import IconoModulo from "../components/IconoModulo";

const ETIQUETAS_ETAPA = {
  recibido: "Recibido",
  diagnostico: "En diagnóstico",
  esperando_autorizacion: "Esperando autorización",
  en_reparacion: "En reparación",
  esperando_refacciones: "Esperando refacciones",
  control_calidad: "Control de calidad",
  listo_entrega: "Listo para entrega",
};

/**
 * Dashboard personal — lo ve cualquier usuario cuya cuenta esté ligada a
 * un registro del catálogo de Empleados (ver página Empleados.jsx). No
 * depende de ningún permiso especial; si tu cuenta no está ligada, el
 * backend responde con un mensaje claro en vez de datos.
 */
export default function MiDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/empleados/mi-dashboard")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-text">Cargando…</div>;

  if (error) {
    return (
      <>
        <div className="page-header"><div><h1><IconoModulo ruta="/mi-dashboard" /> Mi dashboard</h1></div></div>
        <div className="panel" style={{ borderLeft: "4px solid var(--red-600)" }}>{error}</div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/mi-dashboard" /> Mi dashboard</h1>
          <div className="subtitle">Hola, {data.nombre_empleado}</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card ok">
          <div className="kpi-label">Servicios abiertos</div>
          <div className="kpi-value">{data.servicios_abiertos}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cerrados este mes</div>
          <div className="kpi-value">{data.servicios_cerrados_mes}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Servicios totales asignados</div>
          <div className="kpi-value">{data.servicios_totales}</div>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Tus servicios recientes</h2>
        {data.servicios_recientes.length === 0 ? (
          <div className="empty-state">Todavía no tienes servicios asignados como responsable.</div>
        ) : (
          <table>
            <thead><tr><th>Orden</th><th>Fecha</th><th>Estatus</th></tr></thead>
            <tbody>
              {data.servicios_recientes.map((s) => (
                <tr key={s.id_servicio}>
                  <td><Link to={`/servicios/${s.id_servicio}`}>#{s.id_servicio} — {s.nombre_servicio}</Link></td>
                  <td>{new Date(s.fecha_entrada_servicio).toLocaleDateString("es-MX")}</td>
                  <td>
                    <span className={`badge badge-${s.status === "abierto" ? "petrol" : s.status === "cerrado" ? "teal" : "red"}`}>
                      {s.status === "abierto" ? (ETIQUETAS_ETAPA[s.etapa] || s.status) : s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
