import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { Cargando, EstadoBadge, fmt, fmtCorto, fmtFecha, useCargar } from "./comun";

export default function Resumen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { datos: r, error } = useCargar(() => api.get("/superadmin/resumen"));
  if (!r) return <Cargando error={error} />;

  const irTalleres = (filtro) => navigate(`/superadmin/talleres${filtro ? `?filtro=${filtro}` : ""}`);
  const maxMes = Math.max(1, ...r.ingresos_por_mes.map((m) => m.ingresos));
  const cambio = r.ingresos_mes_anterior > 0 ? ((r.ingresos_mes - r.ingresos_mes_anterior) / r.ingresos_mes_anterior) * 100 : null;
  const kpis = [
    ["prueba", "En prueba", r.en_prueba, "blue"],
    ["por_vencer", "Por vencer", r.por_vencer, "warn"],
    ["gracia", "En gracia", r.en_gracia, "warn"],
    ["vencida", "Vencidos", r.vencidos, "red"],
    ["suspendida", "Suspendidos", r.suspendidos, "ink"],
    [null, "Talleres", r.total_talleres, "petrol"],
  ];

  return (
    <>
      <div className="sa-hero">
        <div className="sa-hero-etiqueta">Cobrado este mes · hola, {user?.nombre_completo?.split(" ")[0] || user?.username}</div>
        <div className="sa-hero-monto">{fmt(r.ingresos_mes)}</div>
        <div className="sa-hero-sub">
          {cambio === null ? "Sin cobros el mes pasado" : `${cambio >= 0 ? "▲" : "▼"} ${Math.abs(cambio).toFixed(0)}% vs. mes pasado (${fmt(r.ingresos_mes_anterior)})`}
        </div>
        <div className="sa-hero-fila">
          <div><div className="sa-hero-dato">{fmt(r.ingreso_mensual_recurrente)}</div><div className="sa-hero-sub">ingreso mensual recurrente</div></div>
          <div><div className="sa-hero-dato">{r.vigentes}</div><div className="sa-hero-sub">talleres vigentes</div></div>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map(([filtro, etiqueta, valor, tono]) => (
          <button key={etiqueta} type="button" className="kpi-card kpi-card-link sa-kpi" style={{ borderLeftColor: `var(--${tono === "ink" ? "ink-500" : `${tono}-600`})` }} onClick={() => irTalleres(filtro)}>
            <div className="kpi-label">{etiqueta}</div>
            <div className="kpi-value">{valor}</div>
          </button>
        ))}
      </div>

      <div className="sa-columnas">
        <div className="panel">
          <h2 className="sa-titulo">Cobrado por mes</h2>
          <div className="sa-grafica" role="img" aria-label="Ingresos cobrados por mes">
            {r.ingresos_por_mes.map((m, i) => {
              const actual = i === r.ingresos_por_mes.length - 1;
              return (
                <div key={m.mes} className="sa-grafica-col" title={`${m.mes}: ${fmt(m.ingresos)}`}>
                  <span className="sa-grafica-valor">{m.ingresos ? fmtCorto(m.ingresos) : ""}</span>
                  <div className="sa-grafica-riel">
                    <div className={"sa-grafica-barra" + (actual ? " actual" : "")} style={{ height: `${Math.max(3, (m.ingresos / maxMes) * 100)}%` }} />
                  </div>
                  <span className="sa-grafica-mes">{m.mes.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <h2 className="sa-titulo">Talleres por paquete</h2>
          {Object.keys(r.talleres_por_paquete).length === 0 ? <div className="subtitle">Sin talleres vigentes.</div> :
            Object.entries(r.talleres_por_paquete).map(([nombre, n]) => (
              <div key={nombre} className="sa-paquete">
                <span className="sa-paquete-nombre">{nombre}</span>
                <div className="sa-paquete-riel"><div style={{ width: `${(n / Math.max(1, r.vigentes)) * 100}%` }} /></div>
                <span className="sa-paquete-n">{n}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="panel">
        <div className="sa-titulo-fila">
          <h2 className="sa-titulo">Próximos vencimientos</h2>
          <Link to="/superadmin/talleres">Ver talleres</Link>
        </div>
        {r.proximos_vencimientos.length === 0 ? <div className="empty-state">No hay vencimientos próximos.</div> : (
          <div className="sa-tabla">
            <table>
              <thead><tr><th>Taller</th><th>Vence</th><th>Estado</th><th className="num">Por periodo</th></tr></thead>
              <tbody>
                {r.proximos_vencimientos.map((v) => (
                  <tr key={v.id_taller} className="sa-fila-link" onClick={() => navigate(`/superadmin/talleres/${v.id_taller}`)}>
                    <td><strong>{v.nombre_comercial}</strong></td>
                    <td>{fmtFecha(v.fecha_vencimiento)} · {v.dias_restantes < 0 ? `venció hace ${-v.dias_restantes} día(s)` : v.dias_restantes === 0 ? "vence hoy" : `en ${v.dias_restantes} día(s)`}</td>
                    <td><EstadoBadge estado={v.estado} /></td>
                    <td className="num">{fmt(v.precio_periodo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="subtitle" style={{ textAlign: "center" }}>
        {r.usuarios_totales} usuarios activos · {r.ordenes_mes_total} órdenes este mes en todos los talleres
        {r.para_depurar > 0 && <div style={{ color: "var(--red-600)" }}>{r.para_depurar} taller(es) ya pasaron su tiempo de conservación de datos.</div>}
      </div>
    </>
  );
}
