import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import BuscadorSelect from "../components/BuscadorSelect";
import { Icono } from "../components/Icono";

const ESTADO_BADGE = { pendiente: "badge-petrol", confirmada: "badge-teal", rechazada: "badge-red", cancelada: "badge-grey", atendida: "badge-grey" };
const ESTADOS = ["pendiente", "confirmada", "rechazada", "cancelada", "atendida"];
// Colores y nombres de estatus: los mismos que en Órdenes de servicio
const ETAPAS = {
  en_proceso: { t: "Recibido", c: "#2563EB" },
  abierto: { t: "En piso", c: "#2563EB" },
  pendiente: { t: "Confirmación del cliente", c: "#F59E0B" },
  espera_refacciones: { t: "Espera refacciones", c: "#D97706" },
  en_reparacion: { t: "En reparación", c: "#1D4ED8" },
  listo_entrega: { t: "Listo para entrega", c: "#16845B" },
};
// La base guarda las fechas de las órdenes en UTC: se interpretan como UTC y se muestran en la hora local del equipo (UTC-8 a UTC-5)
const conZ = (v) => (v && !/Z|[+-]\d\d:?\d\d$/.test(v) ? `${v}Z` : v);
const aHoraLocal = (o) => ({
  ...o,
  fecha_entrada_servicio: conZ(o.fecha_entrada_servicio),
  fecha_salida_servicio: conZ(o.fecha_salida_servicio),
  historial_etapas: (o.historial_etapas || []).map((h) => ({ ...h, fecha: conZ(h.fecha) })),
});
const etX = (x) => (x.tipo === "est" ? etapaDe({ etapa: x.etapa }) : etapaDe(x.o));
const etapaDe = (o) => ETAPAS[o.etapa] || { t: "En taller", c: "#F59E0B" };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MARK_H = 42; // alto de las tarjetas de marcas (mismo estilo que las citas)
const HORA_PX_MIN = 38; // alto mínimo de una hora; si hay espacio, la cuadrícula se estira a toda la ventana
const DURACION_MIN = 60; // las citas no traen duración: se dibujan de 1 hora

const claveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hora = (f) => new Date(f).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const nombreCliente = (c) => `${c.cliente?.nombre_cliente || ""} ${c.cliente?.paterno_cliente || ""}`.trim() || "Cliente";
const sumarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lunesDe = (d) => sumarDias(d, -((d.getDay() + 6) % 7));
const etiquetaHora = (h) => `${String(h).padStart(2, "0")}:00`;
const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const deMin = (m) => { const x = Math.max(0, Math.min(23 * 60 + 59, m)); return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const etiqueta12 = (v) => {
  const m = aMin(v); const h = Math.floor(m / 60);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
};
const duracionTxt = (d) => (d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}` : `${d} min`);

// Selector de hora propio (el nativo del navegador no respeta el tema oscuro)
function SelectorHora({ value, onChange, desde, label }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null);
  const listaRef = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  useEffect(() => {
    if (abierto && listaRef.current) {
      const sel = listaRef.current.querySelector(".sel-hora-op.activa");
      if (sel) listaRef.current.scrollTop = sel.offsetTop - listaRef.current.clientHeight / 2 + sel.clientHeight / 2;
    }
  }, [abierto]);
  const opciones = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    if (desde && m <= aMin(desde)) continue;
    opciones.push(deMin(m));
  }
  return (
    <div className="sel-hora" ref={raiz}>
      <button type="button" className="sel-hora-btn" aria-label={label} aria-haspopup="listbox" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span>{value ? etiqueta12(value) : "--:--"}</span>
        <Icono nombre="clock" size={16} />
      </button>
      {abierto && (
        <ul className="sel-hora-lista" role="listbox" ref={listaRef}>
          {opciones.map((o) => (
            <li key={o} role="option" aria-selected={o === value} className={`sel-hora-op ${o === value ? "activa" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setAbierto(false); }}>
              <span>{etiqueta12(o)}</span>
              {desde && <em>{duracionTxt(aMin(o) - aMin(desde))}</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Selector de fecha propio (el calendario nativo no respeta el tema oscuro)
function SelectorFecha({ value, onChange, label }) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => (value ? new Date(`${value}T12:00:00`) : new Date()));
  const raiz = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);
  const sel = value ? new Date(`${value}T12:00:00`) : null;
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const inicio = lunesDe(primero);
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  const hoy = claveDia(new Date());
  const cambiarMes = (n) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));
  return (
    <div className="sel-fecha" ref={raiz}>
      <button type="button" className="sel-hora-btn" aria-label={label} aria-haspopup="dialog" aria-expanded={abierto}
        onClick={() => { if (!abierto && sel) setMes(sel); setAbierto(!abierto); }}>
        <span>{sel ? sel.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Elegir día"}</span>
        <Icono nombre="calendar" size={16} />
      </button>
      {abierto && (
        <div className="sel-fecha-pop" role="dialog" aria-label="Elegir día">
          <div className="sel-fecha-cab">
            <strong>{mayus(mes.toLocaleDateString("es-MX", { month: "long", year: "numeric" }))}</strong>
            <span>
              <button type="button" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}>‹</button>
              <button type="button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}>›</button>
            </span>
          </div>
          <div className="sel-fecha-grid">
            {DIAS.map((d) => <i key={d} className="sel-fecha-dow">{d.charAt(0)}</i>)}
            {dias.map((d) => {
              const k = claveDia(d);
              return (
                <button type="button" key={k} onClick={() => { onChange(k); setAbierto(false); }}
                  className={`sel-fecha-dia ${d.getMonth() !== mes.getMonth() ? "fuera" : ""} ${k === hoy ? "hoy" : ""} ${k === value ? "activa" : ""}`}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="sel-fecha-pie">
            <button type="button" onClick={() => { onChange(hoy); setAbierto(false); }}>Hoy</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Citas() {
  const { notify, confirmDialog } = useUI();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [estado, setEstado] = useState("pendiente");
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem("sm_citas_vista") || "lista"; } catch { return "lista"; }
  });
  const [modo, setModo] = useState(() => {
    try { return localStorage.getItem("sm_citas_modo") || "semana"; } catch { return "semana"; }
  });
  const [ancla, setAncla] = useState(() => new Date());
  const [miniMes, setMiniMes] = useState(() => new Date());
  const [activos, setActivos] = useState({ pendiente: true, confirmada: true, rechazada: true, cancelada: false, atendida: false });
  const [detalle, setDetalle] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  // Nueva cita creada desde el calendario: { fecha, hora, titulo, id_cliente, id_vehiculo }
  const [nueva, setNueva] = useState(null);
  const [tituloErr, setTituloErr] = useState(false); // título vacío: se marca en rojo y se sacude
  const [guardando, setGuardando] = useState(false);
  const [errorNueva, setErrorNueva] = useState("");
  const [clientes, setClientes] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [enTaller, setEnTaller] = useState([]); // órdenes abiertas (vehículos que están en el taller)
  const [verTaller, setVerTaller] = useState(true);
  const [finalizadas, setFinalizadas] = useState([]); // órdenes cerradas (historial en el calendario)
  const [verFinalizadas, setVerFinalizadas] = useState(true);
  const [horario, setHorario] = useState({ ap: "08:00", ci: "18:00", dias: ["1", "2", "3", "4", "5", "6"] }); // horario de atención del taller
  const [popTaller, setPopTaller] = useState(null); // clave del día con la lista abierta
  const [ahora, setAhora] = useState(() => new Date());
  const scrollRef = useRef(null);
  const [altoDisp, setAltoDisp] = useState(0); // alto disponible para la cuadrícula

  useEffect(() => { try { localStorage.setItem("sm_citas_vista", vista); } catch { /* sin almacenamiento */ } }, [vista]);
  useEffect(() => { try { localStorage.setItem("sm_citas_modo", modo); } catch { /* sin almacenamiento */ } }, [modo]);
  useEffect(() => { setMiniMes(new Date(ancla.getFullYear(), ancla.getMonth(), 1)); }, [ancla]);
  // Hora oficial: la del servidor. Si el reloj del equipo está desfasado se corrige y se avisa.
  const [desfase, setDesfase] = useState(0); // ms: servidor - equipo
  useEffect(() => {
    let vivo = true;
    const sincronizar = () => api.get("/auditoria/hora").then((r) => {
      if (!vivo || !r?.utc) return;
      const d = new Date(r.utc).getTime() - Date.now();
      setDesfase(d);
      setAhora(new Date(Date.now() + d));
    }).catch(() => {});
    sincronizar();
    const s = setInterval(sincronizar, 600000);
    return () => { vivo = false; clearInterval(s); };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date(Date.now() + desfase)), 60000);
    return () => clearInterval(t);
  }, [desfase]);

  // En calendario se traen todas las citas y los estados se filtran con las casillas
  const estadoConsulta = vista === "calendario" ? "todas" : estado;
  async function load() {
    const data = await api.get(`/citas/?estado=${estadoConsulta}`);
    setCitas(data);
    setLoading(false);
  }
  useEffect(() => { load(); }, [estadoConsulta]);
  useActualizacionGlobal("citas", load);

  // Vehículos que están en el taller ahora (órdenes abiertas) para mostrarlos en el calendario
  function cargarTaller() {
    Promise.all([api.get("/servicios/?status=abierto"), api.get("/servicios/?status=cerrado"), api.get("/vehiculos/")])
      .then(([ab, ce, ve]) => {
        setEnTaller(ab.filter((o) => o.id_vehiculo).map(aHoraLocal));
        setFinalizadas(ce.filter((o) => o.id_vehiculo).map(aHoraLocal));
        setVehiculos((prev) => (prev.length ? prev : ve));
      })
      .catch(() => {});
  }
  useEffect(() => {
    api.get("/configuracion-taller/")
      .then((c) => {
        let esp = {};
        try { esp = JSON.parse(c.horarios_dia || "{}") || {}; } catch { esp = {}; }
        setHorario({ ap: c.hora_apertura || "08:00", ci: c.hora_cierre || "18:00", dias: (c.dias_atencion || "1,2,3,4,5,6").split(","), esp });
      })
      .catch(() => {});
    cargarTaller();
    window.addEventListener("focus", cargarTaller); // al volver de la orden se refresca
    return () => window.removeEventListener("focus", cargarTaller);
  }, []);
  const nombreVehOrden = (o) => {
    const v = vehiculos.find((x) => x.id_vehiculo === o.id_vehiculo);
    return v ? (`${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.placas_vehiculo || "Vehículo") : "Vehículo";
  };
  const clienteOrden = (o) => {
    const v = vehiculos.find((x) => x.id_vehiculo === o.id_vehiculo);
    const c = v?.cliente;
    const nombre = c ? `${c.nombre_cliente || ""} ${c.paterno_cliente || ""}`.trim() : "";
    return { nombre, tel: c?.telefono1 || "" };
  };
  const fCorta = (x) => new Date(x).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
  const fHora = (x) => new Date(x).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");
  const rangoOrden = (o) => (o._fin
    ? `${fCorta(o.fecha_entrada_servicio)}${o.fecha_salida_servicio ? ` → ${fCorta(o.fecha_salida_servicio)}` : ""}`
    : `Desde ${fCorta(o.fecha_entrada_servicio)} · en taller`);
  // Horario de un día: el especial si el taller lo configuró, si no el general
  const horarioDe = (f) => {
    const e = horario.esp?.[String(((f.getDay() + 6) % 7) + 1)];
    return e ? { ap: e.ap, ci: e.ci } : { ap: horario.ap, ci: horario.ci };
  };
  // Marcas de entrada/salida de órdenes en la cuadrícula, a la hora real en que ocurrieron
  const marcasDia = (f) => {
    const k = claveDia(f);
    const hd = horarioDe(f);
    const m = [];
    const min = (x) => { const d = new Date(x); return d.getHours() * 60 + d.getMinutes(); };
    const mismoDia = (x) => x && claveDia(new Date(x)) === k;
    if (verTaller && k !== claveDia(ahora)) enTallerF.forEach((o) => { if (mismoDia(o.fecha_entrada_servicio)) m.push({ o, tipo: "in", min: min(o.fecha_entrada_servicio) }); });
    // Último cambio de estatus de cada orden en taller, a la hora en que se hizo
    if (verTaller) enTallerF.forEach((o) => {
      const ent = new Date(o.fecha_entrada_servicio).getTime();
      const ult = (o.historial_etapas || []).filter((h) => h.fecha).sort((x, y) => new Date(y.fecha) - new Date(x.fecha))[0];
      if (!ult || Math.abs(new Date(ult.fecha).getTime() - ent) < 120000) return; // sin cambios: ya aparece como "Entrada"
      if (mismoDia(ult.fecha)) m.push({ o, tipo: "est", etapa: ult.etapa, id: ult.id_registro, min: min(ult.fecha) });
    });
    if (verFinalizadas) finalizadasF.forEach((o) => {
      if (mismoDia(o.fecha_entrada_servicio)) m.push({ o, tipo: "in", min: min(o.fecha_entrada_servicio), fin: true });
      if (mismoDia(o.fecha_salida_servicio)) m.push({ o, tipo: "out", min: min(o.fecha_salida_servicio), fin: true });
    });
    // Siempre dentro del horario de atención: antes de abrir queda en la apertura y
    // después del cierre queda en la hora de cierre, con la hora real como nota.
    const ap = aMin(hd.ap), ci = aMin(hd.ci);
    const alto = MARK_H / HORA_PX * 60; // alto de la etiqueta en minutos
    m.forEach((x) => {
      x.real = x.min;
      if (x.min < ap) { x.min = ap; x.ajustada = true; }
      else if (x.min > ci - alto) { x.min = Math.max(ci - alto, ap); x.ajustada = x.real > ci - alto; }
      x.horaReal = etiqueta12(deMin(x.real));
    });
    // las que caen casi a la misma hora se apilan hacia abajo para no taparse
    m.sort((a, b2) => a.min - b2.min);
    let ultimo = -999;
    m.forEach((x) => { const top = Math.max(((x.min - iniMin) / 60) * HORA_PX, ultimo + MARK_H + 2); x.top = top; ultimo = top; });
    // Vehículos en reparación: solo se destacan en el día actual (apilados al fondo de la jornada)
    if (verTaller && k === claveDia(ahora) && enTallerF.length > 0) {
      const MAX = 4;
      const ligadas = new Set(citas.map((c) => ordenDeCita(c)?.id_servicio).filter(Boolean));
      const lista = enTallerF.filter((o) => !ligadas.has(o.id_servicio));
      const vis = lista.slice(0, MAX);
      const extra = lista.length - vis.length;
      const total = vis.length + (extra > 0 ? 1 : 0);
      const base = ((ci - iniMin) / 60) * HORA_PX;
      vis.forEach((o, i) => m.push({ o, tipo: "rep", fin: false, top: Math.max(base - (total - i) * (MARK_H + 4) - 2, 0), real: ci, horaReal: `Desde ${fCorta(o.fecha_entrada_servicio)}` }));
      if (extra > 0) m.push({ tipo: "mas", extra, top: Math.max(base - (MARK_H + 4) - 2, 0) });
    }
    return m;
  };
  const placasOrden = (o) => vehiculos.find((x) => x.id_vehiculo === o.id_vehiculo)?.placas_vehiculo || "";
  // Búsqueda: cliente, vehículo, placas, servicio u orden
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = norm(busqueda.trim());
  const ordenCoincide = (o) => !q || norm([nombreVehOrden(o), placasOrden(o), clienteOrden(o).nombre, clienteOrden(o).tel, o.nombre_servicio, `#${o.id_servicio}`, o.id_servicio].join(" ")).includes(q);
  const enTallerF = enTaller.filter(ordenCoincide);
  const finalizadasF = finalizadas.filter(ordenCoincide);
  const tallerPorDia = (f) => {
    const k = claveDia(f);
    const dia = (x) => claveDia(new Date(x));
    const abiertas = k > claveDia(ahora) || !verTaller ? [] : enTallerF.filter((o) => dia(o.fecha_entrada_servicio) <= k);
    const cerradas = !verFinalizadas ? [] : finalizadasF
      .filter((o) => dia(o.fecha_entrada_servicio) <= k && k <= dia(o.fecha_salida_servicio || o.fecha_entrada_servicio))
      .map((o) => ({ ...o, _fin: true }));
    return [...abiertas, ...cerradas];
  };

  // Mide el espacio disponible para que las horas se ajusten a la ventana
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || vista !== "calendario" || modo === "mes") return undefined;
    const medir = () => setAltoDisp(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vista, modo, loading]);

  // Al abrir semana/día, la cuadrícula arranca cerca de las 7:00
  useEffect(() => {
    if (vista === "calendario" && modo !== "mes" && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [vista, modo, loading, horario.ap, horario.ci]);

  async function resolver(cita, accion) {
    try {
      await api.put(`/citas/${cita.id_cita}/${accion}`);
      notify(accion === "confirmar" ? "Cita confirmada." : "Cita rechazada.", "success");
      setDetalle(null);
      setNueva(null);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const puedeResolver = hasPermission("servicios.crear");
  const hoyClave = claveDia(ahora);

  // Orden de servicio generada a partir de una cita: mismo vehículo y mismo día de la cita
  function ordenDeCita(c) {
    const vid = c.id_vehiculo || c.vehiculo?.id_vehiculo;
    if (!vid || !c.fecha_propuesta) return null;
    const dia = claveDia(new Date(c.fecha_propuesta));
    const ords = [...enTaller, ...finalizadas.map((o) => ({ ...o, _fin: true }))]
      .filter((o) => o.id_vehiculo === vid && claveDia(new Date(o.fecha_entrada_servicio)) === dia);
    return ords.sort((a, b2) => b2.id_servicio - a.id_servicio)[0] || null;
  }

  const visibles = useMemo(() => {
    const nq = busqueda.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return citas.filter((c) => (ordenDeCita(c) ? verTaller : activos[c.estado] !== false) && (!nq || `${nombreCliente(c)} ${c.descripcion || ""} ${c.vehiculo?.placas_vehiculo || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(nq)));
  }, [citas, activos, busqueda, enTaller, finalizadas, verTaller]);
  const conteo = useMemo(() => {
    const m = { pendiente: 0, confirmada: 0, rechazada: 0, cancelada: 0, atendida: 0 };
    citas.forEach((c) => { if (m[c.estado] !== undefined) m[c.estado] += 1; });
    return m;
  }, [citas]);
  const sinFecha = visibles.filter((c) => !c.fecha_propuesta);

  const porDia = useMemo(() => {
    const m = {};
    visibles.forEach((c) => {
      if (!c.fecha_propuesta) return;
      const k = claveDia(new Date(c.fecha_propuesta));
      if (!m[k]) m[k] = [];
      m[k].push(c);
    });
    Object.values(m).forEach((l) => l.sort((a, b) => new Date(a.fecha_propuesta) - new Date(b.fecha_propuesta)));
    return m;
  }, [visibles]);

  // Días que muestra la cuadrícula principal
  const diasVista = useMemo(() => {
    if (modo === "dia") return [new Date(ancla.getFullYear(), ancla.getMonth(), ancla.getDate())];
    const lunes = lunesDe(ancla);
    return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  }, [modo, ancla]);

  // Celdas de un mes (semana desde lunes)
  function celdasDeMes(base) {
    const primero = new Date(base.getFullYear(), base.getMonth(), 1);
    const offset = (primero.getDay() + 6) % 7;
    const dias = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const total = Math.ceil((offset + dias) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(base.getFullYear(), base.getMonth(), i - offset + 1));
  }
  const celdasMes = useMemo(() => celdasDeMes(ancla), [ancla]);
  const celdasMini = useMemo(() => celdasDeMes(miniMes), [miniMes]);

  function mover(delta) {
    if (modo === "mes") setAncla(new Date(ancla.getFullYear(), ancla.getMonth() + delta, 1));
    else if (modo === "semana") setAncla(sumarDias(ancla, 7 * delta));
    else setAncla(sumarDias(ancla, delta));
  }

  const titulo = (() => {
    if (modo === "dia") return mayus(ancla.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    if (modo === "mes") return mayus(ancla.toLocaleDateString("es-MX", { month: "long", year: "numeric" }));
    const a = diasVista[0], b = diasVista[6];
    if (a.getMonth() === b.getMonth()) return mayus(a.toLocaleDateString("es-MX", { month: "long", year: "numeric" }));
    const corto = (d) => d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
    return mayus(`${corto(a)} – ${corto(b)} ${b.getFullYear()}`);
  })();

  // Reparte citas que se encima en el mismo día en columnas lado a lado
  function posicionar(lista) {
    const carriles = [];
    const items = lista.map((c) => {
      const f = new Date(c.fecha_propuesta);
      const ini = f.getHours() * 60 + f.getMinutes();
      let fin = ini + DURACION_MIN;
      if (c.fecha_fin) {
        const g = new Date(c.fecha_fin);
        if (claveDia(g) === claveDia(f) && g > f) fin = g.getHours() * 60 + g.getMinutes();
      }
      return { c, ini, fin };
    });
    items.forEach((it) => {
      let i = carriles.findIndex((fin) => fin <= it.ini);
      if (i === -1) { i = carriles.length; carriles.push(0); }
      carriles[i] = it.fin;
      it.carril = i;
    });
    return items.map((it) => ({ ...it, carriles: carriles.length }));
  }

  // Abre el formulario "Nueva cita" con el día y la hora donde se hizo clic
  function abrirNueva(fecha, hora) {
    if (!puedeResolver) { notify("No tienes permiso para agendar citas.", "error"); return; }
    setErrorNueva("");
    setNueva({ fecha: claveDia(fecha), hora, hora_fin: deMin(aMin(hora) + 60), titulo: "", id_cliente: "", id_vehiculo: "" });
    cargarCatalogos();
  }

  function cargarCatalogos() {
    if (clientes.length === 0) {
      Promise.all([api.get("/clientes/?solo_activos=true"), api.get("/vehiculos/")])
        .then(([cl, ve]) => { setClientes(cl); setVehiculos(ve); })
        .catch((err) => notify(err.message, "error"));
    }
  }

  // Clic en una cita: con permiso abre el formulario para editarla; sin permiso, solo el detalle
  function abrirCita(c) {
    if (!puedeResolver) { setDetalle(c); return; }
    const ini = c.fecha_propuesta ? new Date(c.fecha_propuesta) : new Date(new Date().setHours(9, 0, 0, 0));
    const h = `${String(ini.getHours()).padStart(2, "0")}:${String(ini.getMinutes()).padStart(2, "0")}`;
    const fin = c.fecha_fin ? new Date(c.fecha_fin) : null;
    const hf = fin && claveDia(fin) === claveDia(ini) ? `${String(fin.getHours()).padStart(2, "0")}:${String(fin.getMinutes()).padStart(2, "0")}` : deMin(aMin(h) + DURACION_MIN);
    setErrorNueva("");
    setNueva({
      id_cita: c.id_cita, estado: c.estado, fecha: claveDia(ini), hora: h, hora_fin: hf,
      titulo: c.descripcion || "", id_cliente: c.id_cliente || "", id_vehiculo: c.id_vehiculo || c.vehiculo?.id_vehiculo || "",
    });
    cargarCatalogos();
  }

  // El día de la cita: crea la orden de servicio heredando cliente y vehículo
  async function generarOrden() {
    if (!nueva.id_cliente || !nueva.id_vehiculo) { notify("Asigna cliente y vehículo a la cita para generar la orden.", "error"); return; }
    const citaActual = citas.find((x) => x.id_cita === nueva.id_cita);
    if (citaActual && ["cancelada", "rechazada", "atendida"].includes(citaActual.estado)) { notify(`Esta cita ya está ${citaActual.estado}; no se puede generar una orden desde ella.`, "error"); return; }
    const cli = clientes.find((x) => x.id_cliente === Number(nueva.id_cliente));
    const veh0 = vehiculos.find((x) => x.id_vehiculo === Number(nueva.id_vehiculo));
    if (!cli) { notify("El cliente de la cita ya no existe. Elige otro.", "error"); return; }
    if (!veh0) { notify("El vehículo de la cita ya no existe. Elige otro.", "error"); return; }
    if (veh0.id_cliente && veh0.id_cliente !== cli.id_cliente) { notify("Ese vehículo no pertenece al cliente elegido.", "error"); return; }
    const enTallerYa = enTaller.find((o) => o.id_vehiculo === veh0.id_vehiculo);
    if (enTallerYa) { notify(`Este vehículo ya está en el taller con la orden #${enTallerYa.id_servicio} abierta. Ábrela o ciérrala antes de crear otra.`, "error"); return; }
    setGuardando(true);
    try {
      const v = vehiculos.find((x) => x.id_vehiculo === Number(nueva.id_vehiculo));
      const o = await api.post("/servicios/", {
        id_cliente: Number(nueva.id_cliente), id_vehiculo: Number(nueva.id_vehiculo),
        nombre_servicio: nueva.titulo.trim() || "Servicio general", km_llegada: v?.km_vehiculo ? String(v.km_vehiculo) : null,
        iva_porcentaje: 0, tipos_mantenimiento_ids: [], autorizado_cliente: false,
      });
      // La cita pasa a "atendida": desde aquí manda la orden y su estatus
      try { await api.put(`/citas/${nueva.id_cita}/atender`); } catch { /* la orden ya existe; la cita se puede marcar luego */ }
      notify(`Orden creada — #${o.id_servicio}.`, "success");
      setNueva(null);
      load();
      navigate(`/servicios/${o.id_servicio}?agregar=1`);
    } catch (err) {
      notify(err.message || "No se pudo generar la orden.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function cancelarCita() {
    const ok = await confirmDialog("¿Seguro que quieres cancelar esta cita? Se avisará al cliente si tiene la app.", { title: "Cancelar cita", confirmar: "Sí, cancelar cita" });
    if (!ok) return;
    setGuardando(true);
    try {
      await api.put(`/citas/${nueva.id_cita}/cancelar`);
      notify("Cita cancelada.", "success");
      setNueva(null);
      load();
    } catch (err) {
      notify(err.message || "No se pudo cancelar la cita.", "error");
    } finally {
      setGuardando(false);
    }
  }

  // Clic en una columna de la cuadrícula: la hora sale de la posición vertical (de 30 en 30 minutos)
  function clicColumna(e, fecha) {
    const r = e.currentTarget.getBoundingClientRect();
    const min = Math.max(0, Math.min(23 * 60 + 30, iniMin + Math.floor(((e.clientY - r.top) / HORA_PX) * 2) * 30));
    abrirNueva(fecha, `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
  }

  async function guardarNueva(e) {
    e.preventDefault();
    if (!nueva.titulo.trim()) {
      setTituloErr(false);
      requestAnimationFrame(() => { setTituloErr(true); document.querySelector(".gcal-nueva-titulo")?.focus(); });
      return;
    }
    if (!nueva.fecha || !nueva.hora || !nueva.hora_fin) { notify("Elige el día y el horario.", "error"); return; }
    if (aMin(nueva.hora_fin) <= aMin(nueva.hora)) { notify("La hora de fin debe ser posterior a la de inicio.", "error"); return; }
    if (!nueva.id_cliente) { notify("Elige el cliente.", "error"); return; }
    if (nuevaPasada && !nueva.id_cita) {
      const ok = await confirmDialog(
        `La fecha elegida (${nueva.fecha} ${nueva.hora}) ya pasó. ¿Quieres agendar la cita de todos modos?`,
        { title: "Fecha anterior a hoy", confirmar: "Sí, agendar" }
      );
      if (!ok) return;
    }
    if (fueraDeHorario) {
      const ok = await confirmDialog(
        `La cita queda fuera del horario de atención del taller (${etiqueta12(horarioDe(new Date(`${nueva.fecha}T12:00:00`)).ap)} – ${etiqueta12(horarioDe(new Date(`${nueva.fecha}T12:00:00`)).ci)}). ¿Quieres agendarla de todos modos?`,
        { title: "Fuera de horario", confirmar: "Sí, agendar" }
      );
      if (!ok) return;
    }
    setGuardando(true);
    setErrorNueva("");
    try {
      const cuerpo = {
        id_cliente: Number(nueva.id_cliente),
        id_vehiculo: nueva.id_vehiculo ? Number(nueva.id_vehiculo) : null,
        descripcion: nueva.titulo.trim(),
        fecha_propuesta: `${nueva.fecha}T${nueva.hora}:00`,
        fecha_fin: `${nueva.fecha}T${nueva.hora_fin}:00`,
        retroactiva: !!nuevaPasada,
        zona_offset_min: new Date().getTimezoneOffset(),
      };
      if (nueva.id_cita) await api.put(`/citas/${nueva.id_cita}/`, cuerpo);
      else await api.post("/citas/", cuerpo);
      notify(nueva.id_cita ? "Cita actualizada." : "Cita agendada.", "success");
      setAncla(new Date(`${nueva.fecha}T12:00:00`));
      setNueva(null);
      load();
    } catch (err) {
      notify(err.message || "No se pudo guardar la cita.", "error");
    } finally {
      setGuardando(false);
    }
  }

  const diaAbierto = (f) => horario.dias.includes(String(((f.getDay() + 6) % 7) + 1));
  const fueraDeHorario = !!nueva && !!nueva.fecha && !!nueva.hora && (
    !diaAbierto(new Date(`${nueva.fecha}T12:00:00`)) || aMin(nueva.hora) < aMin(horarioDe(new Date(`${nueva.fecha}T12:00:00`)).ap) || aMin(nueva.hora_fin) > aMin(horarioDe(new Date(`${nueva.fecha}T12:00:00`)).ci)
  );
  const nuevaPasada = !!nueva && !nueva.id_cita && !!nueva.fecha && !!nueva.hora && new Date(`${nueva.fecha}T${nueva.hora}:00`) < ahora;
  const nombreVeh = (v) => `${v.marca?.nombre_marca || ""} ${v.modelo?.nombre_modelo || ""}`.trim() || v.numero_cuenta;
  const opcionesCliente = clientes.map((c) => ({
    value: c.id_cliente, label: `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim(),
    sub: [c.numero_cuenta, c.telefono1].filter(Boolean).join(" · "),
  }));
  const opcionesVehiculo = vehiculos
    .filter((v) => !nueva?.id_cliente || v.id_cliente === Number(nueva.id_cliente))
    .map((v) => ({ value: v.id_vehiculo, label: nombreVeh(v) + (enTaller.some((o) => o.id_vehiculo === v.id_vehiculo) ? " · EN TALLER" : ""), sub: [v.placas_vehiculo, !nueva?.id_cliente && v.cliente?.nombre_cliente].filter(Boolean).join(" · ") }));
  function elegirCliente(v) {
    const veh = vehiculos.find((x) => x.id_vehiculo === Number(nueva.id_vehiculo));
    setNueva({ ...nueva, id_cliente: v || "", id_vehiculo: veh && v && veh.id_cliente !== Number(v) ? "" : nueva.id_vehiculo });
  }
  function elegirVehiculo(v) {
    const veh = vehiculos.find((x) => x.id_vehiculo === Number(v));
    setNueva({ ...nueva, id_vehiculo: v || "", id_cliente: veh ? veh.id_cliente : nueva.id_cliente }); // autocompleta el dueño
  }

  function renderCita(c) {
    return (
      <div key={c.id_cita} className={`orden-fila fila-tabla est-${c.estado === "pendiente" ? "abierto" : c.estado === "confirmada" ? "cerrado" : "cancelado"}`}>
        <div className="orden-main">
          <div className="orden-titulo">
            <Link to={`/vehiculos?id_cliente=${c.id_cliente}`}>{c.cliente?.nombre_cliente} {c.cliente?.paterno_cliente}</Link>{" "}
            <span className={`badge ${ESTADO_BADGE[c.estado] || "badge-grey"}`}>{c.estado}</span>
          </div>
          <div className="orden-meta">
            <span><Icono nombre="car" size={15} /> {c.vehiculo?.placas_vehiculo || "Sin vehículo"}</span>
            <span><Icono nombre="calendar" size={15} /> {c.fecha_propuesta ? new Date(c.fecha_propuesta).toLocaleString("es-MX") : "Sin preferencia"}</span>
            <span><Icono nombre="clock" size={15} /> Solicitada {new Date(c.fecha_creacion).toLocaleDateString("es-MX")}</span>
          </div>
          {c.descripcion && <div className="orden-etapa" style={{ fontSize: 14, color: "var(--ink-700)", marginTop: 6 }}>{c.descripcion}</div>}
        </div>
        {puedeResolver && c.estado === "pendiente" && (
          <div className="row-actions">
            <button className="btn btn-primary btn-sm" onClick={() => resolver(c, "confirmar")}>Confirmar</button>
            <button className="btn btn-danger btn-sm" onClick={() => resolver(c, "rechazar")}>Rechazar</button>
          </div>
        )}
      </div>
    );
  }

  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  // Ventana visible: solo el horario de atención del taller (se amplía si hay citas fuera de él)
  const abiertos = diasVista.filter(diaAbierto).map(horarioDe);
  let minIni = abiertos.length ? Math.min(...abiertos.map((h) => aMin(h.ap))) : aMin(horario.ap);
  let maxFin = abiertos.length ? Math.max(...abiertos.map((h) => aMin(h.ci))) : aMin(horario.ci);
  diasVista.forEach((f) => posicionar(porDia[claveDia(f)] || []).forEach((it) => { minIni = Math.min(minIni, it.ini); maxFin = Math.max(maxFin, it.fin); }));
  if (nueva && nueva.hora && nueva.hora_fin) { minIni = Math.min(minIni, aMin(nueva.hora)); maxFin = Math.max(maxFin, aMin(nueva.hora_fin)); }
  const iniMin = Math.floor(minIni / 60) * 60;
  const finMin = Math.min(Math.max(Math.ceil(maxFin / 60) * 60, iniMin + 60), 24 * 60);
  const horasVis = (finMin - iniMin) / 60;
  // Alto de una hora: reparte el espacio disponible entre las horas visibles (más horario = cajas más pequeñas)
  const HORA_PX = Math.max((altoDisp - 2) / horasVis, HORA_PX_MIN);
  const altoCuerpo = horasVis * HORA_PX;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/citas" /> Citas solicitadas</h1>
          <div className="subtitle">Lo que los clientes piden desde su app — tú decides si se confirma</div>
        </div>
        <div className="vista-toggle vista-toggle-iconos">
          <button type="button" className={`vista-toggle-btn ${vista === "lista" ? "activo" : ""}`} title="Vista de lista" aria-label="Vista de lista" onClick={() => setVista("lista")}><Icono nombre="list" size={19} /></button>
          <button type="button" className={`vista-toggle-btn ${vista === "calendario" ? "activo" : ""}`} title="Vista de calendario" aria-label="Vista de calendario" onClick={() => setVista("calendario")}><Icono nombre="calendar" size={19} /></button>
        </div>
      </div>

      {vista === "lista" ? (
        <div className="panel">
          <div className="toolbar" style={{ marginBottom: 14 }}>
            {["pendiente", "confirmada", "rechazada", "todas"].map((e) => (
              <button key={e} className={`btn btn-sm ${estado === e ? "btn-primary" : "btn-secondary"}`} onClick={() => setEstado(e)}>
                {e === "todas" ? "Todas" : e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="loading-text">Cargando…</div>
          ) : citas.length === 0 ? (
            <div className="empty-state">No hay citas {estado !== "todas" ? `en estado "${estado}"` : ""}.</div>
          ) : (
            <div className="ordenes-lista">{citas.map(renderCita)}</div>
          )}
        </div>
      ) : (
        <div className="gcal panel">
          {/* ---------- Columna izquierda: mini calendario y filtros ---------- */}
          <aside className="gcal-lateral">
            <div className="gcal-mini">
              <div className="gcal-mini-cab">
                <strong>{mayus(miniMes.toLocaleDateString("es-MX", { month: "long", year: "numeric" }))}</strong>
                <span>
                  <button type="button" aria-label="Mes anterior" onClick={() => setMiniMes(new Date(miniMes.getFullYear(), miniMes.getMonth() - 1, 1))}>‹</button>
                  <button type="button" aria-label="Mes siguiente" onClick={() => setMiniMes(new Date(miniMes.getFullYear(), miniMes.getMonth() + 1, 1))}>›</button>
                </span>
              </div>
              <div className="gcal-mini-grid">
                {DIAS.map((d) => <span key={d} className="gcal-mini-dn">{d.charAt(0)}</span>)}
                {celdasMini.map((f) => {
                  const k = claveDia(f);
                  const enVista = diasVista.some((d) => claveDia(d) === k);
                  return (
                    <button
                      type="button"
                      key={k}
                      className={`gcal-mini-dia ${f.getMonth() !== miniMes.getMonth() ? "fuera" : ""} ${k === hoyClave ? "hoy" : ""} ${enVista && modo !== "mes" ? "en-vista" : ""} ${porDia[k] ? "con-citas" : ""}`}
                      onClick={() => setAncla(f)}
                      aria-label={f.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
                    >{f.getDate()}</button>
                  );
                })}
              </div>
            </div>

            <div className="gcal-bloque">
              <div className="gcal-bloque-titulo">Estados</div>
              {ESTADOS.map((e) => (
                <label key={e} className="gcal-check" style={{ "--k": `var(--gcal-${e})` }}>
                  <input type="checkbox" checked={activos[e]} onChange={() => setActivos({ ...activos, [e]: !activos[e] })} />
                  <i className="gcal-caja" />
                  <span>{mayus(e)}s</span>
                  <em>{conteo[e]}</em>
                </label>
              ))}
            </div>

            <div className="gcal-bloque">
              <div className="gcal-bloque-titulo">En taller · {mayus(ancla.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(".", ""))}</div>
              <label className="gcal-check" style={{ "--k": "var(--gcal-cancelada)" }}>
                <input type="checkbox" checked={verTaller} onChange={() => setVerTaller(!verTaller)} />
                <i className="gcal-caja" />
                <span>Mostrar en calendario</span>
                <em>{tallerPorDia(ancla).filter((o) => !o._fin).length}</em>
              </label>
              <label className="gcal-check" style={{ "--k": "var(--gcal-confirmada)" }}>
                <input type="checkbox" checked={verFinalizadas} onChange={() => setVerFinalizadas(!verFinalizadas)} />
                <i className="gcal-caja" />
                <span>Mostrar finalizadas</span>
                <em>{tallerPorDia(ancla).filter((o) => o._fin).length}</em>
              </label>
            </div>

            <div className="gcal-bloque">
              <div className="gcal-bloque-titulo">Buscar</div>
              <div className="gcal-buscar">
                <Icono nombre="search" size={16} />
                <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente, vehículo, placas u orden…" aria-label="Buscar en el calendario" />
                {busqueda && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setBusqueda("")}><Icono nombre="close" size={14} /></button>}
              </div>
            </div>

            <div className="gcal-bloque gcal-bloque-lista">
              <div className="gcal-taller-lista">
                {tallerPorDia(ancla).length === 0 && <small>{q ? "Sin resultados para la búsqueda." : "Ningún vehículo en el taller este día."}</small>}
                {tallerPorDia(ancla).map((o) => (
                  <Link key={`${o.id_servicio}-${o._fin ? "f" : "a"}`} className={`gcal-pop-card ${o._fin ? "fin" : ""}`} style={!o._fin ? { "--est": etapaDe(o).c } : undefined} to={`/servicios/${o.id_servicio}`}>
                    <div className="gcal-pop-cab">
                      <Icono nombre={o._fin ? "check" : "wrench"} size={16} />
                      <b>{nombreVehOrden(o)}</b>
                      {placasOrden(o) && <small>{placasOrden(o)}</small>}
                      <em>#{o.id_servicio}</em>
                    </div>
                    {!o._fin && <div className="gcal-pop-fila"><span className="gcal-punto" style={{ background: etapaDe(o).c }} /> {etapaDe(o).t}</div>}
                    <div className="gcal-pop-fila"><Icono nombre="calendar" size={14} /> {rangoOrden(o)}</div>
                    {clienteOrden(o).nombre && <div className="gcal-pop-fila"><Icono nombre="user" size={14} /> {[clienteOrden(o).nombre, clienteOrden(o).tel].filter(Boolean).join(" · ")}</div>}
                    <div className="gcal-pop-fila"><Icono nombre="document" size={14} /> {o.nombre_servicio}</div>
                  </Link>
                ))}
              </div>
            </div>

            {sinFecha.length > 0 && (
              <div className="gcal-bloque">
                <div className="gcal-bloque-titulo">Sin fecha preferida ({sinFecha.length})</div>
                {sinFecha.map((c) => (
                  <button type="button" key={c.id_cita} className={`gcal-sinfecha cal-cita-${c.estado}`} onClick={() => abrirCita(c)}>
                    {nombreCliente(c)}
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* ---------- Área principal ---------- */}
          <section className="gcal-principal">
            {Math.abs(desfase) > 180000 && (
              <div className="gcal-aviso-reloj" role="alert">
                <Icono nombre="warning" size={16} /> El reloj de este equipo está {Math.round(Math.abs(desfase) / 60000)} min {desfase > 0 ? "atrasado" : "adelantado"}. El calendario usa la hora del servidor; corrige la hora del equipo.
              </div>
            )}
            <div className="gcal-barra">
              <button type="button" className="btn btn-secondary btn-sm gcal-hoy" onClick={() => setAncla(new Date())}>Hoy</button>
              <button type="button" className="btn-icono" aria-label="Anterior" title="Anterior" onClick={() => mover(-1)}>‹</button>
              <button type="button" className="btn-icono" aria-label="Siguiente" title="Siguiente" onClick={() => mover(1)}>›</button>
              <h2 className="gcal-titulo">{titulo}</h2>
              <div className="gcal-modo-seg" role="group" aria-label="Tipo de vista">
                {[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, l]) => (
                  <button type="button" key={k} className={modo === k ? "on" : ""} aria-pressed={modo === k} onClick={() => setModo(k)}>{l}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="loading-text">Cargando…</div>
            ) : modo === "mes" ? (
              <div className="gcal-mes">
                {DIAS.map((d) => <div key={d} className="gcal-mes-dn">{d}</div>)}
                {celdasMes.map((f) => {
                  const k = claveDia(f);
                  const lista = porDia[k] || [];
                  return (
                    <div key={k} className={`gcal-mes-celda ${f.getMonth() !== ancla.getMonth() ? "fuera" : ""} ${diaAbierto(f) ? "" : "cerrado"} ${k === hoyClave ? "hoy" : ""}`} onClick={() => abrirNueva(f, "09:00")} title="Clic para agendar una cita">
                      <button type="button" className="gcal-mes-num" onClick={(e) => { e.stopPropagation(); setAncla(f); setModo("dia"); }} aria-label={`Ver ${f.toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`}>{f.getDate()}</button>
                      {lista.slice(0, 3).map((c) => (
                        <button type="button" key={c.id_cita} className={`gcal-chip cal-cita-${c.estado}`} onClick={(e) => { e.stopPropagation(); abrirCita(c); }}>
                          <b>{hora(c.fecha_propuesta)}</b> {nombreCliente(c)}
                        </button>
                      ))}
                      {lista.length > 3 && <button type="button" className="gcal-mas" onClick={(e) => { e.stopPropagation(); setAncla(f); setModo("dia"); }}>+{lista.length - 3} más</button>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="gcal-semana" style={{ "--cols": diasVista.length }}>
                <div className="gcal-cab-dias">
                  <div className="gcal-esquina">{`GMT${-ahora.getTimezoneOffset() >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(ahora.getTimezoneOffset()) / 60)).padStart(2, "0")}`}</div>
                  {diasVista.map((f) => {
                    const k = claveDia(f);
                    return (
                      <button type="button" key={k} className={`gcal-cab-dia ${k === hoyClave ? "hoy" : ""}`} onClick={() => { setAncla(f); setModo("dia"); }}>
                        <span>{f.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "")}</span>
                        <strong>{f.getDate()}</strong>
                      </button>
                    );
                  })}
                </div>
                {diasVista.some((f) => tallerPorDia(f).length > 0) && (
                  <div className="gcal-taller-fila">
                    <div className="gcal-taller-etq" title="Vehículos en el taller">🔧</div>
                    {diasVista.map((f) => {
                      const lista = tallerPorDia(f);
                      const k = claveDia(f);
                      const abiertas = lista.filter((o) => !o._fin);
                      const cerradas = lista.filter((o) => o._fin);
                      return (
                        <div key={k} className="gcal-taller-celda">
                          {lista.length > 0 && (
                            <button type="button" className="gcal-taller-resumen" aria-expanded={popTaller === k} onClick={() => setPopTaller(popTaller === k ? null : k)}>
                              {abiertas.length > 0 && <span className="ab">🔧 {abiertas.length}</span>}
                              {cerradas.length > 0 && <span className="fin">✓ {cerradas.length}</span>}
                            </button>
                          )}
                          {popTaller === k && lista.length > 0 && (
                            <>
                              <div className="gcal-taller-fondo" onClick={() => setPopTaller(null)} />
                              <div className="gcal-taller-pop" role="dialog" aria-label="Vehículos del día">
                                <div className="gcal-taller-pop-tit">{mayus(f.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }))}</div>
                                <div className="gcal-taller-pop-lista">
                                  {lista.map((o) => (
                                    <Link key={`${o.id_servicio}-${o._fin ? "f" : "a"}`} className={`gcal-pop-card ${o._fin ? "fin" : ""}`} style={!o._fin ? { "--est": etapaDe(o).c } : undefined} to={`/servicios/${o.id_servicio}`}>
                                      <div className="gcal-pop-cab">
                                        <Icono nombre={o._fin ? "check" : "wrench"} size={16} />
                                        <b>{nombreVehOrden(o)}</b>
                                        {placasOrden(o) && <small>{placasOrden(o)}</small>}
                                        <em>#{o.id_servicio}</em>
                                      </div>
                                      {!o._fin && <div className="gcal-pop-fila"><span className="gcal-punto" style={{ background: etapaDe(o).c }} /> {etapaDe(o).t}</div>}
                                      <div className="gcal-pop-fila"><Icono nombre="calendar" size={14} /> {rangoOrden(o)}</div>
                                      {clienteOrden(o).nombre && <div className="gcal-pop-fila"><Icono nombre="user" size={14} /> {[clienteOrden(o).nombre, clienteOrden(o).tel].filter(Boolean).join(" · ")}</div>}
                                      <div className="gcal-pop-fila"><Icono nombre="document" size={14} /> {o.nombre_servicio}</div>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="gcal-scroll" ref={scrollRef}>
                  <div className="gcal-cuerpo" style={{ height: altoCuerpo }}>
                    <div className="gcal-horas">
                      {Array.from({ length: horasVis }, (_, i) => (
                        <div key={i} className="gcal-hora" style={{ top: i * HORA_PX }}>{i === 0 ? "" : etiquetaHora(iniMin / 60 + i)}</div>
                      ))}
                    </div>
                    {diasVista.map((f) => {
                      const k = claveDia(f);
                      const items = posicionar(porDia[k] || []);
                      const marcas = marcasDia(f);
                      // Citas/órdenes y marcas que coinciden en el tiempo se reparten el ancho en partes iguales (simétrico)
                      const piezas = [
                        ...items.map(({ c, ini, fin }) => { const t0 = ((ini - iniMin) / 60) * HORA_PX + 1; return { id: `e${c.id_cita}`, t0, t1: t0 + Math.max(((fin - ini) / 60) * HORA_PX - 3, MARK_H) }; }),
                        ...marcas.map((x, i) => ({ id: `m${i}`, t0: x.top, t1: x.top + MARK_H })),
                      ].sort((p, q) => p.t0 - q.t0);
                      const lugar = {};
                      let grupo = [], finGrupo = -1, carrilesFin = [];
                      const cerrar = () => { const n = Math.max(carrilesFin.length, 1); const y0 = Math.min(...grupo.map((p) => p.t0)), y1 = Math.max(...grupo.map((p) => p.t1)); grupo.forEach((p) => { lugar[p.id].n = n; lugar[p.id].y0 = y0; lugar[p.id].y1 = y1; }); grupo = []; carrilesFin = []; };
                      piezas.forEach((p) => {
                        if (grupo.length && p.t0 >= finGrupo) cerrar();
                        let l = carrilesFin.findIndex((fin) => fin <= p.t0);
                        if (l === -1) { l = carrilesFin.length; carrilesFin.push(p.t1); } else carrilesFin[l] = p.t1;
                        lugar[p.id] = { l, n: 1 };
                        grupo.push(p);
                        finGrupo = Math.max(grupo.length === 1 ? p.t1 : finGrupo, p.t1);
                      });
                      cerrar();
                      // Lado del detalle emergente: a la derecha si la tarjeta está en la mitad izquierda, a la izquierda si está en la derecha;
                      // si la tarjeta ocupa gran parte del ancho no hay espacio a los lados y se abre debajo/arriba de ella ("centro")
                      const lado = (id) => {
                        const { l, n } = lugar[id] || { l: 0, n: 1 };
                        const nd = Math.max(diasVista.length, 1);
                        const frac = (diasVista.indexOf(f) + (l + 0.5) / n) / nd;
                        return 1 / (nd * n) > 0.4 ? "centro" : frac < 0.5 ? "der" : "";
                      };
                      const caja = (id) => { const { l, n, y0, y1 } = lugar[id] || { l: 0, n: 1 }; return { left: `calc((100% - 20px) * ${l / n} + 2px)`, width: `calc((100% - 20px) / ${n} - 3px)`, ...(n > 1 ? { top: y0, height: y1 - y0 } : {}) }; };
                      return (
                        <div key={k} className={`gcal-col ${k === hoyClave ? "hoy" : ""}`} onClick={(e) => clicColumna(e, f)} title="Clic para agendar una cita">
                          {Array.from({ length: horasVis }, (_, i) => <div key={i} className="gcal-linea" style={{ top: i * HORA_PX }} />)}
                          {items.map(({ c, ini, fin, carril, carriles }) => {
                            const ord = ordenDeCita(c);
                            const est = ord ? (ord._fin ? { t: "Finalizada", c: "#16845B" } : etapaDe(ord)) : null;
                            const topC = ((ini - iniMin) / 60) * HORA_PX + 1;
                            const idxC = diasVista.indexOf(f);
                            const cli = c.cliente || {};
                            const veh = c.vehiculo || {};
                            const vehTxt = [[veh.marca?.nombre_marca, veh.modelo?.nombre_modelo].filter(Boolean).join(" "), veh.placas_vehiculo].filter(Boolean).join(" · ");
                            const telC = cli.telefono1 || "";
                            const vehTxtCorto = [veh.marca?.nombre_marca, veh.modelo?.nombre_modelo].filter(Boolean).join(" ");
                            return (
                              <div
                                key={c.id_cita}
                                className={`gcal-marca-wrap gcal-evwrap ${topC > altoCuerpo * 0.55 ? "arriba" : ""} ${lado(`e${c.id_cita}`)}`}
                                style={{
                                  top: topC,
                                  height: Math.max(((fin - ini) / 60) * HORA_PX - 3, MARK_H),
                                  ...caja(`e${c.id_cita}`),
                                }}
                              >
                                <button
                                  type="button"
                                  className={`gcal-evento ${ord ? "gcal-evento-orden" : `cal-cita-${c.estado}`}`}
                                  style={est ? { "--k": est.c } : undefined}
                                  onClick={(e) => { e.stopPropagation(); if (ord) navigate(`/servicios/${ord.id_servicio}`); else abrirCita(c); }}
                                >
                                  <b>{ord ? <><Icono nombre={ord._fin ? "check" : "wrench"} size={13} /> {nombreVehOrden(ord)}</> : <><Icono nombre="calendar" size={13} /> {vehTxtCorto || nombreCliente(c)}</>}</b>
                                  <span>{ord ? [est.t, placasOrden(ord), nombreCliente(c)].filter(Boolean).join(" · ") : [`${hora(c.fecha_propuesta)}${c.fecha_fin ? ` – ${hora(c.fecha_fin)}` : ""}`, c.vehiculo?.placas_vehiculo, vehTxtCorto ? nombreCliente(c) : null].filter(Boolean).join(" · ")}</span>
                                </button>
                                <div className="gcal-tip" role="tooltip">
                                  <div className="gcal-tip-tit"><Icono nombre={ord ? (ord._fin ? "check" : "wrench") : "calendar"} size={17} /> {ord ? `Orden #${ord.id_servicio}` : `Cita ${c.estado}`} · {hora(c.fecha_propuesta)}{c.fecha_fin ? ` – ${hora(c.fecha_fin)}` : ""}</div>
                                  <div className="gcal-tip-fila"><span className="gcal-punto" style={{ background: est ? est.c : "var(--color-primary)" }} /><div><span>Estatus</span><b>{est ? est.t : c.estado.charAt(0).toUpperCase() + c.estado.slice(1)}</b></div></div>
                                  {!ord && c.descripcion && <div className="gcal-tip-fila"><Icono nombre="document" size={16} /><div><span>Cita</span><b>{c.descripcion}</b></div></div>}
                                  {(cli.nombre_cliente || cli.paterno_cliente) && <div className="gcal-tip-fila"><Icono nombre="user" size={16} /><div><span>Cliente</span><b>{[nombreCliente(c), telC].filter(Boolean).join(" · ")}</b></div></div>}
                                  {vehTxt && <div className="gcal-tip-fila"><Icono nombre="car" size={16} /><div><span>Vehículo</span><b>{vehTxt}</b></div></div>}
                                  {ord && <div className="gcal-tip-fila"><Icono nombre="document" size={16} /><div><span>Orden</span><b>#{ord.id_servicio} · {ord.nombre_servicio}</b></div></div>}
                                  <div className="gcal-tip-fila"><Icono nombre="calendar" size={16} /><div><span>{ord ? "Entrada" : "Fecha"}</span><b>{fHora(ord ? ord.fecha_entrada_servicio : c.fecha_propuesta)}</b></div></div>
                                  {ord && <div className="gcal-tip-fila"><Icono nombre="clock" size={16} /><div><span>Salida</span><b>{ord.fecha_salida_servicio ? fHora(ord.fecha_salida_servicio) : "Aún en taller"}</b></div></div>}
                                </div>
                              </div>
                            );
                          })}
                          {nueva && nueva.fecha === k && (
                            <div className="gcal-evento gcal-borrador" style={{ top: ((aMin(nueva.hora) - iniMin) / 60) * HORA_PX + 1, height: Math.max(((aMin(nueva.hora_fin) - aMin(nueva.hora)) / 60) * HORA_PX - 3, MARK_H), left: "2px", width: "calc(100% - 4px)" }}>
                              <b>{nueva.titulo.trim() || "(Sin título)"}</b>
                              <span>{nueva.hora} – {nueva.hora_fin}</span>
                            </div>
                          )}
                          {!diaAbierto(f)
                            ? <div className="gcal-cerrado" style={{ top: 0, height: altoCuerpo }} title="El taller no atiende este día" />
                            : (
                              <>
                                <div className="gcal-cerrado" style={{ top: 0, height: Math.max(((aMin(horarioDe(f).ap) - iniMin) / 60) * HORA_PX, 0) }} />
                                <div className="gcal-cerrado" style={{ top: ((aMin(horarioDe(f).ci) - iniMin) / 60) * HORA_PX, height: Math.max(altoCuerpo - ((aMin(horarioDe(f).ci) - iniMin) / 60) * HORA_PX, 0) }} />
                              </>
                            )}
                          {marcas.map((x, i) => {
                            const idx = diasVista.indexOf(f);
                            const der = diasVista.length > 2 && idx < 2; // en las primeras columnas no hay espacio a la izquierda: se abre hacia la derecha
                            const arriba = x.top > altoCuerpo * 0.55;
                            if (x.tipo === "mas") {
                              return (
                                <div key="mas-taller" className="gcal-marca-wrap" style={{ top: x.top, height: MARK_H, ...caja(`m${i}`) }} onClick={(e) => e.stopPropagation()}>
                                  <button type="button" className="gcal-marca ab rep mas" onClick={() => setPopTaller(popTaller === k ? null : k)}>+{x.extra} más en reparación</button>
                                </div>
                              );
                            }
                            const cli = clienteOrden(x.o);
                            return (
                              <div key={`${x.o.id_servicio}-${x.tipo}${x.id || ""}`} className={`gcal-marca-wrap ${arriba ? "arriba" : ""} ${lado(`m${i}`)}`} style={{ top: x.top, height: MARK_H, ...caja(`m${i}`) }} onClick={(e) => e.stopPropagation()}>
                                <Link to={`/servicios/${x.o.id_servicio}`} className={`gcal-marca ${x.fin ? "fin" : "ab"} ${x.tipo} ${x.ajustada ? "ajustada" : ""}`}
                                  style={!x.fin ? { "--est": etX(x).c } : undefined}>
                                  <b><Icono nombre={x.tipo === "out" ? "check" : "wrench"} size={13} /> {nombreVehOrden(x.o)}</b>
                                  <span>{[x.tipo === "rep" || x.tipo === "est" ? etX(x).t : x.tipo === "in" ? "↓ Entrada" : "↑ Salida", x.tipo !== "rep" ? x.horaReal : null, placasOrden(x.o)].filter(Boolean).join(" · ")}</span>
                                </Link>
                                <div className="gcal-tip" role="tooltip">
                                  <div className="gcal-tip-tit"><Icono nombre={x.tipo === "out" ? "check" : "wrench"} size={17} /> {x.tipo === "rep" ? "En reparación" : x.tipo === "est" ? "Cambio de estatus" : x.tipo === "in" ? "Entrada al taller" : "Salida del taller"} · {x.horaReal}</div>
                                  {x.ajustada && <div className="gcal-tip-nota"><Icono nombre="warning" size={15} /> Fuera de horario: se muestra en {x.real < aMin(horarioDe(f).ap) ? "la apertura" : "el cierre"} ({etiqueta12(x.real < aMin(horarioDe(f).ap) ? horarioDe(f).ap : horarioDe(f).ci)}).</div>}
                                  {!x.fin && <div className="gcal-tip-fila"><span className="gcal-punto" style={{ background: etX(x).c }} /><div><span>Estatus</span><b>{etX(x).t}</b></div></div>}
                                  <div className="gcal-tip-fila"><Icono nombre="car" size={16} /><div><span>Vehículo</span><b>{[nombreVehOrden(x.o), placasOrden(x.o)].filter(Boolean).join(" · ")}</b></div></div>
                                  {cli.nombre && <div className="gcal-tip-fila"><Icono nombre="user" size={16} /><div><span>Cliente</span><b>{[cli.nombre, cli.tel].filter(Boolean).join(" · ")}</b></div></div>}
                                  <div className="gcal-tip-fila"><Icono nombre="document" size={16} /><div><span>Orden</span><b>#{x.o.id_servicio} · {x.o.nombre_servicio}</b></div></div>
                                  <div className="gcal-tip-fila"><Icono nombre="calendar" size={16} /><div><span>Entrada</span><b>{fHora(x.o.fecha_entrada_servicio)}</b></div></div>
                                  <div className="gcal-tip-fila"><Icono nombre="clock" size={16} /><div><span>Salida</span><b>{x.o.fecha_salida_servicio ? fHora(x.o.fecha_salida_servicio) : "Aún en taller"}</b></div></div>
                                </div>
                              </div>
                            );
                          })}
                          {k === hoyClave && minutosAhora >= iniMin && minutosAhora <= finMin && <div className="gcal-ahora" style={{ top: ((minutosAhora - iniMin) / 60) * HORA_PX }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {nueva && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !guardando && setNueva(null)}>
          <form className="modal gcal-nueva" role="dialog" aria-label={nueva.id_cita ? "Editar cita" : "Nueva cita"} onSubmit={guardarNueva}>
            <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={() => setNueva(null)}><Icono nombre="close" size={20} /></button>
            <div className="gcal-nueva-cab">{nueva.id_cita ? "Editar cita" : "Nueva cita"}</div>
            <label className="gcal-nueva-label">Título</label>
            <input
              className={`gcal-nueva-titulo ${tituloErr ? "err" : ""}`}
              autoFocus
              placeholder="Agregar título"
              aria-label="Título de la cita"
              aria-invalid={tituloErr || undefined}
              value={nueva.titulo}
              onChange={(e) => { setNueva({ ...nueva, titulo: e.target.value }); if (tituloErr) setTituloErr(false); }}
            />
            {tituloErr && <div className="gcal-titulo-err" role="alert">Escribe un título para la cita</div>}
            <div className="gcal-nueva-fila">
              <span className="gcal-nueva-ico"><Icono nombre="clock" size={20} /></span>
              <div className="gcal-nueva-campos">
                <label className="gcal-nueva-label">Día y horario</label>
                <div className="gcal-nueva-fecha">
                  <SelectorFecha label="Día" value={nueva.fecha} onChange={(f) => setNueva({ ...nueva, fecha: f })} />
                  <SelectorHora label="Hora de inicio" value={nueva.hora} onChange={(h) => {
                    const dur = Math.max(aMin(nueva.hora_fin) - aMin(nueva.hora), 15);
                    setNueva({ ...nueva, hora: h, hora_fin: h ? deMin(aMin(h) + dur) : nueva.hora_fin });
                  }} />
                  <span className="gcal-nueva-guion" aria-hidden="true">–</span>
                  <SelectorHora label="Hora de fin" value={nueva.hora_fin} desde={nueva.hora} onChange={(h) => setNueva({ ...nueva, hora_fin: h })} />
                </div>
                <small>{nueva.fecha ? mayus(new Date(`${nueva.fecha}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })) : ""}{nueva.hora && nueva.hora_fin && aMin(nueva.hora_fin) > aMin(nueva.hora) ? ` · ${(() => { const d = aMin(nueva.hora_fin) - aMin(nueva.hora); return d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}` : `${d} min`; })()}` : ""}</small>
              </div>
            </div>
            <div className="gcal-nueva-fila">
              <span className="gcal-nueva-ico"><Icono nombre="user" size={20} /></span>
              <div className="gcal-nueva-campos">
                <label className="gcal-nueva-label">Cliente</label>
                <BuscadorSelect opciones={opcionesCliente} value={nueva.id_cliente} onChange={elegirCliente} placeholder="Agregar cliente" vacio="Sin clientes" />
              </div>
            </div>
            <div className="gcal-nueva-fila">
              <span className="gcal-nueva-ico"><Icono nombre="car" size={20} /></span>
              <div className="gcal-nueva-campos">
                <label className="gcal-nueva-label">Vehículo</label>
                <BuscadorSelect opciones={opcionesVehiculo} value={nueva.id_vehiculo} onChange={elegirVehiculo} placeholder="Agregar vehículo" vacio={nueva.id_cliente ? "Este cliente no tiene vehículos" : "Sin vehículos"} />
              </div>
            </div>
            {nuevaPasada && (
              <div className="gcal-aviso" role="alert">
                <Icono nombre="warning" size={18} /> Esa fecha y hora ya pasaron. Puedes guardarla, pero te pediremos confirmar.
              </div>
            )}
                        {nueva.id_cita && nueva.fecha === hoyClave && ["pendiente", "confirmada"].includes(nueva.estado) && (
              <button type="button" className="btn-generar-orden" onClick={generarOrden} disabled={guardando}>
                <Icono nombre="bolt" size={20} />
                <span><b>Generar orden de servicio</b><small>Hoy es el día de la cita · hereda el cliente y el vehículo</small></span>
                <i className="btn-generar-brillo" aria-hidden="true" />
              </button>
            )}
            <div className="modal-actions">
              {nueva.id_cita && nueva.estado !== "cancelada" && (
                <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={cancelarCita} disabled={guardando}>Cancelar cita</button>
              )}
              {nueva.id_cita && nueva.estado === "pendiente" && (
                <button type="button" className="btn btn-secondary" onClick={() => resolver({ id_cita: nueva.id_cita }, "confirmar")} disabled={guardando}>Confirmar</button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setNueva(null)} disabled={guardando}>{nueva.id_cita ? "Cerrar" : "Cancelar"}</button>
              <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : nueva.id_cita ? "Guardar cambios" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}

      {detalle && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setDetalle(null)}>
          <div className="modal gcal-detalle" role="dialog" aria-label="Detalle de la cita">
            <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={() => setDetalle(null)}><Icono nombre="close" size={20} /></button>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>{nombreCliente(detalle)}</h2>
            <span className={`badge ${ESTADO_BADGE[detalle.estado] || "badge-grey"}`}>{detalle.estado}</span>
            <div className="gcal-detalle-datos">
              <div><Icono nombre="calendar" size={16} /> {detalle.fecha_propuesta ? mayus(new Date(detalle.fecha_propuesta).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })) + (detalle.fecha_fin ? ` – ${hora(detalle.fecha_fin)}` : "") : "Sin fecha preferida"}</div>
              <div><Icono nombre="car" size={16} /> {detalle.vehiculo?.placas_vehiculo || "Sin vehículo"}</div>
              <div><Icono nombre="clock" size={16} /> Solicitada el {new Date(detalle.fecha_creacion).toLocaleDateString("es-MX")}</div>
              {detalle.descripcion && <p>{detalle.descripcion}</p>}
            </div>
            <div className="modal-actions">
              <Link className="btn btn-secondary" to={`/vehiculos?id_cliente=${detalle.id_cliente}`}>Ver vehículos</Link>
              {puedeResolver && detalle.estado === "pendiente" && (
                <>
                  <button type="button" className="btn btn-danger" onClick={() => resolver(detalle, "rechazar")}>Rechazar</button>
                  <button type="button" className="btn btn-primary" onClick={() => resolver(detalle, "confirmar")}>Confirmar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
