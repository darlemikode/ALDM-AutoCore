import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";

const ESTADO_BADGE = { pendiente: "badge-petrol", confirmada: "badge-teal", rechazada: "badge-red" };

export default function Citas() {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const [estado, setEstado] = useState("pendiente");
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await api.get(`/citas/?estado=${estado}`);
    setCitas(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [estado]);

  useActualizacionGlobal("citas", load);

  async function resolver(cita, accion) {
    try {
      await api.put(`/citas/${cita.id_cita}/${accion}`);
      notify(accion === "confirmar" ? "Cita confirmada." : "Cita rechazada.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const puedeResolver = hasPermission("servicios.crear");

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/citas" /> Citas solicitadas</h1>
          <div className="subtitle">Lo que los clientes piden desde su app — tú decides si se confirma</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          {["pendiente", "confirmada", "rechazada", "todas"].map((e) => (
            <button
              key={e}
              className={`btn btn-sm ${estado === e ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setEstado(e)}
            >
              {e === "todas" ? "Todas" : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : citas.length === 0 ? (
          <div className="empty-state">No hay citas {estado !== "todas" ? `en estado "${estado}"` : ""}.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Vehículo</th>
                <th>Descripción</th>
                <th>Fecha propuesta</th>
                <th>Solicitada</th>
                <th>Estado</th>
                {puedeResolver && <th></th>}
              </tr>
            </thead>
            <tbody>
              {citas.map((c) => (
                <tr key={c.id_cita}>
                  <td>
                    <Link to={`/vehiculos?id_cliente=${c.id_cliente}`}>
                      {c.cliente?.nombre_cliente} {c.cliente?.paterno_cliente}
                    </Link>
                  </td>
                  <td>{c.vehiculo?.placas_vehiculo || "—"}</td>
                  <td>{c.descripcion || "—"}</td>
                  <td>{c.fecha_propuesta ? new Date(c.fecha_propuesta).toLocaleString("es-MX") : "Sin preferencia"}</td>
                  <td>{new Date(c.fecha_creacion).toLocaleDateString("es-MX")}</td>
                  <td><span className={`badge ${ESTADO_BADGE[c.estado] || "badge-grey"}`}>{c.estado}</span></td>
                  {puedeResolver && (
                    <td>
                      {c.estado === "pendiente" && (
                        <div className="row-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => resolver(c, "confirmar")}>Confirmar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => resolver(c, "rechazar")}>Rechazar</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
