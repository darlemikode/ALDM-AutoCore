import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

const COLORS = {
  petrol: "#1565a8",
  petrolDark: "#0b3d63",
  petrolLight: "#5b9bd5",
  green: "#2f7d5b",
  red: "#c4432f",
  grey: "#aebac0",
};

const ESTADO_COLORS = { Abierto: COLORS.petrol, Cerrado: COLORS.green, Cancelado: COLORS.red };

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1b2226", color: "#eef1f2", padding: "8px 12px", borderRadius: 6, fontSize: 12 }}>
      <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>{p.name}: {formatter ? formatter(p.value) : p.value}</div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { hasPermission } = useAuth();
  const { notify } = useUI();
  const [data, setData] = useState(null);
  const [porEstado, setPorEstado] = useState([]);
  const [mensual, setMensual] = useState([]);
  const [bajoStock, setBajoStock] = useState([]);
  const [proximos, setProximos] = useState([]);

  function cargarProximos() {
    api.get("/dashboard/proximos-servicios?dias_umbral=150").then(setProximos);
  }

  function cargarResumen() {
    api.get("/dashboard/resumen").then(setData);
    api.get("/dashboard/servicios-por-estado").then(setPorEstado);
    api.get("/dashboard/servicios-mensuales?meses=6").then(setMensual);
    api.get("/dashboard/refacciones-bajo-stock-top?limite=6").then(setBajoStock);
  }

  useEffect(() => {
    cargarResumen();
    cargarProximos();
  }, []);

  useActualizacionGlobal("servicios", cargarResumen);
  useActualizacionGlobal("refacciones", cargarResumen);

  async function marcarContactado(item) {
    try {
      await api.post(`/dashboard/proximos-servicios/${item.id_vehiculo}/contactado`, { fecha_base: item.fecha_ultimo_servicio });
      setProximos((prev) => prev.filter((p) => p.id_vehiculo !== item.id_vehiculo));
      notify("Marcado como contactado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  if (!data) return <div className="loading-text">Cargando panel…</div>;

  const fmt = (n) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const fmtCorto = (n) => `$${Math.round(n).toLocaleString("es-MX")}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/" /> Panel general</h1>
          <div className="subtitle">Resumen del taller en tiempo real</div>
        </div>
      </div>

      {proximos.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid var(--petrol-500)" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>🔔 Próximos a dar servicio ({proximos.length})</h2>
          <div className="subtitle" style={{ marginBottom: 10 }}>
            Clientes que llevan 5+ meses sin volver — buen momento para invitarlos.
          </div>
          <table>
            <thead>
              <tr><th>Cliente</th><th>Vehículo</th><th>Último servicio</th><th>Teléfono</th><th></th></tr>
            </thead>
            <tbody>
              {proximos.map((p) => (
                <tr key={p.id_vehiculo}>
                  <td>
                    <Link to={`/clientes`}>{p.nombre_cliente}</Link>
                  </td>
                  <td>{p.placas_vehiculo || p.numero_cuenta_vehiculo}</td>
                  <td>
                    Hace {Math.floor(p.dias_desde_ultimo_servicio / 30)} meses
                    {p.km_proximo_servicio ? ` · próximo a los ${p.km_proximo_servicio} km` : ""}
                  </td>
                  <td className="mono">{p.telefono1 || "—"}</td>
                  <td>
                    {hasPermission("clientes.editar") && (
                      <button className="btn btn-secondary btn-sm" onClick={() => marcarContactado(p)}>
                        Ya lo contacté
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="kpi-grid">
        {hasPermission("clientes.crear") ? (
          <Link to="/clientes?abrir_nuevo=1" className="kpi-card kpi-card-link kpi-card-accion">
            <span className="kpi-icono"><Icono nombre="people" size={22} /></span>
            <div className="kpi-label">Nuevo cliente</div>
            <div className="kpi-accion-mas">＋ Agregar</div>
            <div className="kpi-accion-sub">{data.total_clientes} clientes activos</div>
          </Link>
        ) : (
          <Link to="/clientes" className="kpi-card kpi-card-link">
            <span className="kpi-icono"><Icono nombre="people" size={22} /></span>
            <div className="kpi-label">Clientes activos</div>
            <div className="kpi-value">{data.total_clientes}</div>
          </Link>
        )}
        <Link to="/vehiculos" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="car" size={22} /></span>
          <div className="kpi-label">Vehículos registrados</div>
          <div className="kpi-value">{data.total_vehiculos}</div>
        </Link>
        <Link to="/servicios?status=abierto" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="construct" size={22} /></span>
          <div className="kpi-label">Órdenes abiertas</div>
          <div className="kpi-value">{data.servicios_abiertos}</div>
        </Link>
        <Link to="/servicios" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="calendar" size={22} /></span>
          <div className="kpi-label">Servicios este mes</div>
          <div className="kpi-value">{data.servicios_este_mes}</div>
        </Link>
        <Link to="/refacciones" className={`kpi-card kpi-card-link ${data.refacciones_bajo_stock > 0 ? "alert" : "ok"}`}>
          <span className="kpi-icono"><Icono nombre="cube" size={22} /></span>
          <div className="kpi-label">Refacciones con poco stock</div>
          <div className="kpi-value">{data.refacciones_bajo_stock}</div>
        </Link>
        {hasPermission("dashboard.ver_por_cobrar") && (
          <Link to="/servicios?status=abierto" className={`kpi-card kpi-card-link ${data.saldo_pendiente_clientes > 0 ? "alert" : "ok"}`}>
            <span className="kpi-icono"><Icono nombre="card" size={22} /></span>
          <div className="kpi-label">Por cobrar</div>
            <div className="kpi-value">{fmt(data.saldo_pendiente_clientes)}</div>
          </Link>
        )}
        <Link to="/proveedores" className={`kpi-card kpi-card-link ${data.deuda_con_proveedores > 0 ? "alert" : "ok"}`}>
          <span className="kpi-icono"><Icono nombre="business" size={22} /></span>
          <div className="kpi-label">Deuda con proveedores</div>
          <div className="kpi-value">{fmt(data.deuda_con_proveedores)}</div>
        </Link>
        {data.solicitudes_recuperacion_pendientes > 0 && (
          <div className="kpi-card alert">
            <span className="kpi-icono"><Icono nombre="notifications" size={22} /></span>
            <div className="kpi-label">Solicitudes de acceso</div>
            <div className="kpi-value">
              <Link to="/usuarios" style={{ color: "inherit" }}>{data.solicitudes_recuperacion_pendientes}</Link>
            </div>
          </div>
        )}
      </div>

      <div className="dash-2col">
        <div className="panel">
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>Órdenes e ingresos — últimos 6 meses</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mensual} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#e2e5e6" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#63737b" }} axisLine={{ stroke: "#aebac0" }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#63737b" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#63737b" }} axisLine={false} tickLine={false} tickFormatter={fmtCorto} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="cantidad" name="Órdenes" stroke={COLORS.petrol} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="ingresos" name="Ingresos" stroke={COLORS.green} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2 style={{ fontSize: 16, marginBottom: 14 }}>Órdenes por estado</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={porEstado}
                dataKey="cantidad"
                nameKey="estado"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {porEstado.map((entry) => (
                  <Cell key={entry.estado} fill={ESTADO_COLORS[entry.estado] || COLORS.grey} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: 16, marginBottom: 14 }}>Refacciones con menor stock</h2>
        {bajoStock.length === 0 ? (
          <div className="empty-state">Sin datos de inventario todavía.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bajoStock} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid stroke="#e2e5e6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#63737b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" width={160} tick={{ fontSize: 12, fill: "#1b2226" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="stock" name="Piezas en stock" radius={[0, 4, 4, 0]}>
                {bajoStock.map((entry, i) => (
                  <Cell key={i} fill={entry.stock <= 3 ? COLORS.red : COLORS.petrolLight} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginBottom: 12, fontSize: 18 }}>Accesos rápidos</h2>
        <div className="toolbar">
          <Link className="btn btn-primary" to="/servicios">Nueva orden de servicio</Link>
          <Link className="btn btn-secondary" to="/clientes">Registrar cliente</Link>
          <Link className="btn btn-secondary" to="/refacciones">Ver inventario de refacciones</Link>
        </div>
      </div>
    </>
  );
}
