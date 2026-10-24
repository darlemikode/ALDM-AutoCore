import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { Icono } from "../components/Icono";

const ACCIONES = {
  cambio_fecha: "Cambio de fecha",
  cierre: "Cierre de orden",
  cancelacion: "Cancelación",
  cita_retroactiva: "Cita retroactiva",
};
const CAMPOS = { fecha_entrada_servicio: "Entrada", fecha_salida_servicio: "Salida", status: "Estatus", estado: "Estado", fecha_propuesta: "Fecha de cita" };

// La base guarda UTC: se muestra en la hora local del equipo
const fechaHora = (v) => (v ? new Date(/Z|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function Auditoria() {
  const { notify } = useUI();
  const [filas, setFilas] = useState([]);
  const [soloSospechosas, setSoloSospechosas] = useState(true);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    api.get(`/auditoria/?solo_sospechosas=${soloSospechosas}&limite=300`)
      .then(setFilas)
      .catch((e) => notify(e.message, "error"))
      .finally(() => setCargando(false));
  }, [soloSospechosas]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1>Auditoría</h1>
            <div className="subtitle">Cambios de fechas, cierres, cancelaciones y citas retroactivas. La bitácora no se puede editar ni borrar.</div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="aud-filtros">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={soloSospechosas} onChange={(e) => setSoloSospechosas(e.target.checked)} /> Solo excepciones sospechosas
          </label>
          <span className="aud-ok">{filas.length} registro(s)</span>
        </div>
        {cargando ? <p>Cargando…</p> : filas.length === 0 ? <p className="aud-ok">Sin registros{soloSospechosas ? " sospechosos" : ""}.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="aud-tabla">
              <thead>
                <tr><th>Cuándo (hora del servidor)</th><th>Quién</th><th>Qué</th><th>Cambio</th><th>Motivo</th><th>Alerta</th></tr>
              </thead>
              <tbody>
                {filas.map((r) => (
                  <tr key={r.id_registro}>
                    <td>{fechaHora(r.fecha)}</td>
                    <td>{r.usuario || "—"}</td>
                    <td>
                      {ACCIONES[r.accion] || r.accion}{" "}
                      {r.entidad === "servicio" && r.id_entidad ? <Link to={`/servicios/${r.id_entidad}`}>#{r.id_entidad}</Link> : r.id_entidad ? `#${r.id_entidad}` : ""}
                    </td>
                    <td>{CAMPOS[r.campo] || r.campo || ""}{r.valor_anterior || r.valor_nuevo ? `: ${r.valor_anterior || "—"} → ${r.valor_nuevo || "—"}` : ""}</td>
                    <td>{r.motivo || "—"}</td>
                    <td>{r.sospechosa ? <span className="aud-alerta"><Icono nombre="warning" size={14} /> {r.alerta}</span> : <span className="aud-ok">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
