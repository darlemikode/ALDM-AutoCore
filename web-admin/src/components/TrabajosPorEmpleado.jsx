import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import SelectorFecha from "./SelectorFecha";
import { Icono } from "./Icono";

const ETAPAS = {
  en_proceso: { t: "Recibido", c: "#2563EB" },
  abierto: { t: "En piso", c: "#2563EB" },
  pendiente: { t: "Confirmación del cliente", c: "#F59E0B" },
  espera_refacciones: { t: "Espera refacciones", c: "#D97706" },
  en_reparacion: { t: "En reparación", c: "#1D4ED8" },
  listo_entrega: { t: "Listo para entrega", c: "#16845B" },
  garantia: { t: "Garantía", c: "#7C3AED" },
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fCorta = (v) => (v ? new Date(v).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "") : "");

/** Trabajos que se están realizando, agrupados por trabajador; se filtran por empleado y fechas. */
export default function TrabajosPorEmpleado() {
  const [datos, setDatos] = useState({ empleados: [], trabajos: [] });
  const [empleado, setEmpleado] = useState("");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [terminadas, setTerminadas] = useState(false);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    const p = new URLSearchParams();
    if (empleado !== "") p.set("id_empleado", empleado);
    if (rango.desde) p.set("desde", rango.desde);
    if (rango.hasta) p.set("hasta", rango.hasta);
    if (terminadas) p.set("incluir_terminadas", "true");
    api.get(`/dashboard/trabajos-por-empleado?${p}`).then(setDatos).catch(() => {}).finally(() => setCargando(false));
  }
  useEffect(() => { cargar(); }, [empleado, rango.desde, rango.hasta, terminadas]);
  useActualizacionGlobal("servicios", cargar);

  const grupos = useMemo(() => {
    const m = new Map();
    datos.trabajos.forEach((t) => {
      const k = t.id_empleado ?? 0;
      if (!m.has(k)) m.set(k, { id: k, nombre: t.empleado, trabajos: [] });
      m.get(k).trabajos.push(t);
    });
    return [...m.values()].sort((a, b) => (a.id === 0) - (b.id === 0) || a.nombre.localeCompare(b.nombre));
  }, [datos.trabajos]);

  function atajo(tipo) {
    const d = new Date();
    if (tipo === "todo") setRango({ desde: "", hasta: "" });
    if (tipo === "hoy") setRango({ desde: iso(d), hasta: iso(d) });
    if (tipo === "semana") { const lun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); setRango({ desde: iso(lun), hasta: iso(d) }); }
    if (tipo === "mes") setRango({ desde: iso(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: iso(d) });
  }
  const sinRango = !rango.desde && !rango.hasta;

  return (
    <div className="panel">
      <div className="estado-cabecera">
        <div>
          <h2 className="graf-titulo">Trabajos por empleado</h2>
          <div className="graf-sub">{terminadas ? "Órdenes en taller y terminadas" : "Lo que cada trabajador tiene en proceso"} · {datos.trabajos.length} orden(es)</div>
        </div>
        <div className="rango-fechas">
          <div className="rango-atajos">
            <button type="button" className={`chip-rango ${sinRango ? "activo" : ""}`} onClick={() => atajo("todo")}>Todo</button>
            <button type="button" className="chip-rango" onClick={() => atajo("hoy")}>Hoy</button>
            <button type="button" className="chip-rango" onClick={() => atajo("semana")}>Esta semana</button>
            <button type="button" className="chip-rango" onClick={() => atajo("mes")}>Este mes</button>
          </div>
          <div className="rango-campos">
            <label>Desde</label>
            <SelectorFecha value={rango.desde} max={rango.hasta || undefined} onChange={(v) => setRango({ ...rango, desde: v || "" })} />
            <label>Hasta</label>
            <SelectorFecha value={rango.hasta} min={rango.desde || undefined} onChange={(v) => setRango({ ...rango, hasta: v || "" })} />
          </div>
        </div>
      </div>

      <div className="tpe-filtros">
        <label>
          <span>Empleado</span>
          <select value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
            <option value="">Todos</option>
            <option value="0">Sin asignar</option>
            {datos.empleados.map((e) => <option key={e.id_empleado} value={e.id_empleado}>{e.nombre}{e.puesto ? ` · ${e.puesto}` : ""}</option>)}
          </select>
        </label>
        <label className="tpe-check">
          <input type="checkbox" checked={terminadas} onChange={(e) => setTerminadas(e.target.checked)} /> Incluir terminadas
        </label>
      </div>

      {cargando ? <p className="aud-ok">Cargando…</p> : grupos.length === 0 ? (
        <div className="empty-state">No hay trabajos con estos filtros.</div>
      ) : (
        <div className="tpe-grupos">
          {grupos.map((g) => (
            <section key={g.id} className="tpe-grupo">
              <header>
                <Icono nombre="user" size={18} />
                <b>{g.nombre}</b>
                <em>{g.trabajos.length}</em>
              </header>
              <div className="tpe-lista">
                {g.trabajos.map((t) => {
                  const et = t.status === "cerrado" ? { t: "Terminada", c: "#16845B" } : ETAPAS[t.etapa] || { t: "En taller", c: "#F59E0B" };
                  return (
                    <Link key={t.id_servicio} to={`/servicios/${t.id_servicio}`} className="tpe-orden" style={{ "--est": et.c }}>
                      <div className="tpe-cab">
                        <b>{t.vehiculo || "Sin vehículo"}</b>
                        {t.placas && <small>{t.placas}</small>}
                        <em>#{t.id_servicio}</em>
                      </div>
                      <div className="tpe-fila"><span className="gcal-punto" style={{ background: et.c }} /> {et.t}</div>
                      <div className="tpe-fila"><Icono nombre="document" size={13} /> {t.nombre_servicio}</div>
                      {t.cliente && <div className="tpe-fila"><Icono nombre="user" size={13} /> {t.cliente}</div>}
                      <div className="tpe-fila"><Icono nombre="calendar" size={13} /> {fCorta(t.fecha_entrada)}{t.fecha_salida ? ` → ${fCorta(t.fecha_salida)}` : " · en taller"}</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
