import { api } from "../../api";
import { Cargando, useCargar } from "./comun";

const ACCION = { consulta: ["Consultó", "badge-grey"], alta: ["Creó", "badge-teal"], cambio: ["Modificó", "badge-amber"], baja: ["Eliminó", "badge-red"] };
const fmtFechaHora = (iso) => {
  const d = new Date(String(iso).endsWith("Z") ? iso : `${iso}Z`);
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Quién del equipo de súper admin vio o cambió qué (solo lectura, no se puede borrar). */
export default function Bitacora() {
  const { datos, error } = useCargar(() => api.get("/superadmin/bitacora?limite=300"));
  if (!datos) return <Cargando error={error} />;
  return (
    <>
      <div className="sa-conteo">Últimos {datos.length} accesos · la bitácora no se puede editar ni borrar</div>
      <div className="sa-tabla">
        <table>
          <thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Sobre</th><th>IP</th></tr></thead>
          <tbody>
            {datos.map((a) => {
              const [texto, clase] = ACCION[a.accion] || [a.accion, "badge-grey"];
              return (
                <tr key={a.id_acceso}>
                  <td>{fmtFechaHora(a.fecha)}</td>
                  <td>@{a.usuario}</td>
                  <td><span className={`badge ${clase}`}>{texto}</span> <span className="sa-sub">{a.metodo} {a.ruta}</span></td>
                  <td>{[a.taller, a.usuario_objetivo && `@${a.usuario_objetivo}`].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="sa-sub">{a.ip || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {datos.length === 0 && <div className="empty-state">Aún no hay accesos registrados.</div>}
      </div>
    </>
  );
}
