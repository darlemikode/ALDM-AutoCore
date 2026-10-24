import { IconoAuto } from "../components/Icono";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, Cell, LabelList, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";
import SelectorFecha from "../components/SelectorFecha";
import { Icono } from "../components/Icono";

const COLORS = {
  petrol: "#2563EB",
  petrolDark: "#17191D",
  petrolLight: "#6B7280",
  green: "#16845B",
  red: "#B91C1C",
  grey: "#9CA3AF",
};

const ESTADO_COLORS = { Abierto: COLORS.petrol, Cerrado: COLORS.green, Cancelado: COLORS.red };

// Marcador de la gráfica de puntos: cada mes es un punto; el último lleva un carro encima de la línea
function PuntoCarro({ cx, cy, index, value, total }) {
  if (cx == null || cy == null) return null;
  const ultimo = index === total - 1;
  return (
    <g>
      <text x={cx} y={ultimo ? cy - 34 : cy - 14} textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: "currentColor" }}>{value}</text>
      {ultimo ? (
        <g transform={`translate(${cx - 24}, ${cy - 26})`} className="carro-marcador">
          <path d="M3 21 L3 15 Q3 12.5 6 12 L14 10.5 L20 4.5 Q21.2 3.5 23 3.5 L32 3.5 Q34 3.5 35.2 5 L40 11 L45 12.2 Q47 12.8 47 15 L47 21 Z" fill="#E10600" />
          <path d="M16 10.5 L21 5.8 Q21.8 5.2 23 5.2 L27 5.2 L27 10.5 Z M29.5 5.2 L32 5.2 Q33 5.2 33.7 6 L37.2 10.5 L29.5 10.5 Z" fill="#DDE6F2" />
          <circle cx="14" cy="22" r="5.2" fill="#17191D" /><circle cx="14" cy="22" r="2.2" fill="#9CA3AF" />
          <circle cx="36" cy="22" r="5.2" fill="#17191D" /><circle cx="36" cy="22" r="2.2" fill="#9CA3AF" />
          <rect x="44.5" y="14" width="3" height="2.4" rx="1" fill="#FFD166" />
        </g>
      ) : (
        <circle cx={cx} cy={cy} r={6} fill="#fff" stroke="#E10600" strokeWidth={3} />
      )}
    </g>
  );
}

// Neumático: el diagrama de pastel es la banda de colores dentro de una llanta con rin
function NeumaticoEstados({ datos }) {
  const total = datos.reduce((t, d) => t + d.valor, 0);
  const R = 66, C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 220 220" className="neumatico" role="img" aria-label={`Órdenes por estado: ${datos.map((d) => `${d.nombre} ${d.valor}`).join(", ")}`}>
      <circle cx="110" cy="110" r="106" fill="#17191D" />
      <circle cx="110" cy="110" r="99" fill="none" stroke="#33373F" strokeWidth="9" strokeDasharray="7 5" />
      <circle cx="110" cy="110" r="86" fill="#22262C" />
      <g className="neumatico-giro" style={{ transformOrigin: "110px 110px" }}>
        <circle cx="110" cy="110" r={R} fill="none" stroke="#3A3F47" strokeWidth="30" />
        {total > 0 && datos.filter((d) => d.valor > 0).map((d) => {
          const largo = (d.valor / total) * C;
          const trazo = Math.max(largo - 2, 0.1);
          const el = (
            <circle key={d.nombre} cx="110" cy="110" r={R} fill="none" stroke={d.color} strokeWidth="30"
              strokeDasharray={`${trazo} ${C - trazo}`} strokeDashoffset={-acumulado} transform="rotate(-90 110 110)" />
          );
          acumulado += largo;
          return el;
        })}
      </g>
      <circle cx="110" cy="110" r="48" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="3" />
      {[0, 72, 144, 216, 288].map((a) => (
        <line key={a} x1="110" y1="110" x2="110" y2="68" stroke="#B8BEC8" strokeWidth="7" strokeLinecap="round" transform={`rotate(${a} 110 110)`} />
      ))}
      <circle cx="110" cy="110" r="25" fill="#17191D" stroke="#E10600" strokeWidth="3" />
      <text x="110" y="113" textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: "#fff" }}>{total}</text>
      <text x="110" y="126" textAnchor="middle" style={{ fontSize: 8, fontWeight: 600, fill: "#9CA3AF", letterSpacing: ".08em" }}>ÓRDENES</text>
    </svg>
  );
}

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#17191D", color: "#E5E7EB", padding: "8px 12px", borderRadius: 6, fontSize: 12 }}>
      <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>{p.name}: {formatter ? formatter(p.value) : p.value}</div>
      ))}
    </div>
  );
}

// Número que "sube" desde 0 al cargar: llama la atención y se entiende de un vistazo
function Contar({ valor, formato }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const meta = Number(valor) || 0;
    const ini = prev.current;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(meta); prev.current = meta; return; }
    const t0 = performance.now();
    let raf;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setV(ini + (meta - ini) * e);
      if (k < 1) raf = requestAnimationFrame(paso); else prev.current = meta;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{formato ? formato(v) : Math.round(v)}</>;
}

function RelojVivo() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="reloj-vivo">
      <Icono nombre="clock" size={26} />
      <div>
        <div className="reloj-hora">{ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
        <div className="reloj-fecha">{ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</div>
      </div>
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

  // Rango de fechas del bloque «Estado de las órdenes» (por fecha de entrada)
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const rangoRef = useRef(rango);
  function cargarPorEstado(r = rangoRef.current) {
    const p = new URLSearchParams();
    if (r.desde) p.set("desde", r.desde);
    if (r.hasta) p.set("hasta", r.hasta);
    api.get(`/dashboard/servicios-por-estado${p.toString() ? `?${p}` : ""}`).then(setPorEstado);
  }
  function cambiarRango(nuevo) {
    rangoRef.current = nuevo;
    setRango(nuevo);
    cargarPorEstado(nuevo);
  }
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function atajoRango(tipo) {
    const d = new Date();
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    if (tipo === "todo") return cambiarRango({ desde: "", hasta: "" });
    if (tipo === "mes") return cambiarRango({ desde: iso(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: hoyISO() });
    if (tipo === "30") return cambiarRango({ desde: iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 29)), hasta: hoyISO() });
  }

  function cargarResumen() {
    api.get("/dashboard/resumen").then(setData);
    cargarPorEstado();
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
        <RelojVivo />
      </div>

      {hasPermission("servicios.crear") && (
        <Link to="/servicios?nueva=1" className="hero-orden">
          <span className="hero-orden-icono"><Icono nombre="construct" size={34} /></span>
          <span className="hero-orden-textos">
            <span className="hero-orden-titulo">Nueva orden de servicio</span>
            <span className="hero-orden-sub">Toca aquí para abrir una orden rápida</span>
          </span>
          <span className="hero-orden-flecha">→</span>
        </Link>
      )}

      {proximos.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid var(--petrol-500)" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}><IconoAuto valor="🔔" size={18} /> Próximos a dar servicio ({proximos.length})</h2>
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
        <Link to="/clientes" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="people" size={22} /></span>
          <div className="kpi-label">Clientes activos</div>
          <div className="kpi-value"><Contar valor={data.total_clientes} /></div>
        </Link>
        <Link to="/vehiculos" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="car" size={22} /></span>
          <div className="kpi-label">Vehículos registrados</div>
          <div className="kpi-value"><Contar valor={data.total_vehiculos} /></div>
        </Link>
        <Link to="/servicios?status=abierto" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="construct" size={22} /></span>
          <div className="kpi-label">Órdenes abiertas</div>
          <div className="kpi-value"><Contar valor={data.servicios_abiertos} /></div>
        </Link>
        <Link to="/servicios" className="kpi-card kpi-card-link">
          <span className="kpi-icono"><Icono nombre="calendar" size={22} /></span>
          <div className="kpi-label">Servicios este mes</div>
          <div className="kpi-value"><Contar valor={data.servicios_este_mes} /></div>
        </Link>
        <Link to="/refacciones" className={`kpi-card kpi-card-link ${data.refacciones_bajo_stock > 0 ? "alert" : "ok"}`}>
          <span className="kpi-icono"><Icono nombre="cube" size={22} /></span>
          <div className="kpi-label">Refacciones con poco stock</div>
          <div className="kpi-value"><Contar valor={data.refacciones_bajo_stock} /></div>
        </Link>
        {hasPermission("dashboard.ver_por_cobrar") && (
          <Link to="/servicios?status=abierto" className={`kpi-card kpi-card-link ${data.saldo_pendiente_clientes > 0 ? "alert" : "ok"}`}>
            <span className="kpi-icono"><Icono nombre="card" size={22} /></span>
          <div className="kpi-label">Por cobrar</div>
            <div className="kpi-value"><Contar valor={data.saldo_pendiente_clientes} formato={fmt} /></div>
          </Link>
        )}
        <Link to="/proveedores" className={`kpi-card kpi-card-link ${data.deuda_con_proveedores > 0 ? "alert" : "ok"}`}>
          <span className="kpi-icono"><Icono nombre="business" size={22} /></span>
          <div className="kpi-label">Deuda con proveedores</div>
          <div className="kpi-value"><Contar valor={data.deuda_con_proveedores} formato={fmt} /></div>
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
          <h2 className="graf-titulo">Órdenes por mes</h2>
          <div className="graf-sub">Cuántos trabajos entraron cada mes</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={mensual} margin={{ top: 44, right: 36, left: 36, bottom: 0 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 15, fill: "currentColor", fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, (max) => Math.max(max + 1, 3)]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#E10600", strokeOpacity: 0.25, strokeDasharray: "4 4" }} />
              <Line type="monotone" dataKey="cantidad" name="Órdenes" stroke="#E10600" strokeWidth={3.5} strokeLinecap="round"
                dot={<PuntoCarro total={mensual.length} />} activeDot={false} animationDuration={1400} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2 className="graf-titulo">Dinero que entró por mes</h2>
          <div className="graf-sub">Total cobrado en cada mes</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mensual} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 15, fill: "currentColor", fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<ChartTooltip formatter={fmtCorto} />} cursor={{ fill: "rgba(47,125,91,0.08)" }} />
              <Bar dataKey="ingresos" name="Ingresos" animationDuration={1100} animationEasing="ease-out" fill={COLORS.green} radius={[8, 8, 0, 0]}>
                <LabelList dataKey="ingresos" position="top" formatter={fmtCorto} style={{ fontSize: 14, fontWeight: 700, fill: "currentColor" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <div className="estado-cabecera">
          <div>
            <h2 className="graf-titulo">Estado de las órdenes</h2>
            <div className="graf-sub">{rango.desde || rango.hasta ? "Órdenes que entraron en el periodo elegido" : "Cuántas hay en cada situación"}</div>
          </div>
          <div className="rango-fechas">
            <div className="rango-atajos">
              <button type="button" className={`chip-rango ${!rango.desde && !rango.hasta ? "activo" : ""}`} onClick={() => atajoRango("todo")}>Todo</button>
              <button type="button" className="chip-rango" onClick={() => atajoRango("mes")}>Este mes</button>
              <button type="button" className="chip-rango" onClick={() => atajoRango("30")}>Últimos 30 días</button>
            </div>
            <div className="rango-campos">
              <label>Desde</label>
              <SelectorFecha value={rango.desde} max={rango.hasta || undefined} onChange={(v) => cambiarRango({ ...rango, desde: v || "" })} />
              <label>Hasta</label>
              <SelectorFecha value={rango.hasta} min={rango.desde || undefined} onChange={(v) => cambiarRango({ ...rango, hasta: v || "" })} />
            </div>
          </div>
        </div>
        <div className="estado-neumatico">
          <NeumaticoEstados datos={porEstado.map((e) => ({ nombre: e.estado, valor: e.cantidad, color: ESTADO_COLORS[e.estado] || COLORS.grey }))} />
        <div className="estado-lista">
          {(() => {
            const total = porEstado.reduce((t, e) => t + e.cantidad, 0) || 1;
            const NOMBRES = { Abierto: "En el taller", Cerrado: "Terminadas", Cancelado: "Canceladas" };
            return porEstado.map((e) => (
              <div key={e.estado} className="estado-fila" style={{ animationDelay: `${porEstado.indexOf(e) * 120}ms` }}>
                <div className="estado-cab">
                  <span>{NOMBRES[e.estado] || e.estado}</span>
                  <strong style={{ color: ESTADO_COLORS[e.estado] || COLORS.grey }}><Contar valor={e.cantidad} /></strong>
                </div>
                <div className="estado-barra"><div style={{ width: `${(e.cantidad / total) * 100}%`, background: ESTADO_COLORS[e.estado] || COLORS.grey }} /></div>
              </div>
            ));
          })()}
        </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="graf-titulo">Refacciones que se están acabando</h2>
        <div className="graf-sub">En rojo: quedan 3 piezas o menos</div>
        {bajoStock.length === 0 ? (
          <div className="empty-state">Sin datos de inventario todavía.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, bajoStock.length * 48)}>
            <BarChart data={bajoStock} layout="vertical" margin={{ left: 8, right: 40 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" width={190} tick={{ fontSize: 14, fill: "currentColor" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="stock" name="Piezas en stock" animationDuration={1100} animationEasing="ease-out" radius={[0, 8, 8, 0]} barSize={26}>
                {bajoStock.map((entry, i) => (
                  <Cell key={i} fill={entry.stock <= 3 ? COLORS.red : COLORS.petrolLight} />
                ))}
                <LabelList dataKey="stock" position="right" style={{ fontSize: 16, fontWeight: 700, fill: "currentColor" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginBottom: 12, fontSize: 18 }}>Accesos rápidos</h2>
        <div className="toolbar">
          {hasPermission("clientes.crear") && <Link className="btn btn-secondary" to="/clientes?abrir_nuevo=1">Registrar cliente</Link>}
          <Link className="btn btn-secondary" to="/refacciones">Ver inventario de refacciones</Link>
        </div>
      </div>
    </>
  );
}
