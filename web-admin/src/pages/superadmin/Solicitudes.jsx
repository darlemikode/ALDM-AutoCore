// Personas que pidieron información o demo desde la página informativa.
import { api } from "../../api";
import { useUI } from "../../context/UIContext";
import { Cargando, useCargar } from "./comun";

function cuando(iso) {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Solicitudes() {
  const { notify } = useUI();
  const { datos, error, recargar } = useCargar(() => api.get("/superadmin/solicitudes"));
  if (!datos) return <Cargando error={error} />;

  async function marcar(s, atendida) {
    try { await api.put(`/superadmin/solicitudes/${s.id_solicitud}`, { atendida }); recargar(); } catch (err) { notify(err.message, "error"); }
  }
  const pendientes = datos.filter((s) => !s.atendida).length;

  return (
    <>
      <div className="subtitle" style={{ marginBottom: 12 }}>{pendientes} pendiente(s) · {datos.length} en total</div>
      {datos.length === 0 ? <div className="empty-state">Todavía nadie ha pedido información.</div> : (
        <div className="sa-tabla">
          <table>
            <thead><tr><th>Negocio</th><th>Contacto</th><th>Mensaje</th><th>Cuándo</th><th></th></tr></thead>
            <tbody>
              {datos.map((s) => (
                <tr key={s.id_solicitud} style={s.atendida ? { opacity: 0.55 } : undefined}>
                  <td><strong>{s.negocio}</strong></td>
                  <td>
                    {s.nombre}
                    <div className="sa-sub"><a href={`tel:${s.telefono}`}>{s.telefono}</a> · <a href={`https://wa.me/52${s.telefono.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
                    {s.correo && <div className="sa-sub">{s.correo}</div>}
                  </td>
                  <td className="sa-sub">{s.mensaje || "—"}</td>
                  <td className="sa-sub">{cuando(s.fecha)}</td>
                  <td>
                    <button className={"btn btn-sm " + (s.atendida ? "btn-secondary" : "btn-primary")} onClick={() => marcar(s, !s.atendida)}>
                      {s.atendida ? "Reabrir" : "Ya la atendí"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
