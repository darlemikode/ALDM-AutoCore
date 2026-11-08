import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LogoMarca from "./LogoMarca";
import { Icono } from "./Icono";
import "./filtrosVehiculos.css";

const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* Lista desplegable con casillas, buscador y conteos. valor: lista de values elegidos. */
export function MultiFiltro({ etiqueta, opciones, valor, onChange, vacio = "Sin opciones" }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(null);
  const caja = useRef(null);
  const menu = useRef(null);

  useEffect(() => {
    const fuera = (e) => {
      if (caja.current?.contains(e.target) || menu.current?.contains(e.target)) return;
      setAbierto(false); setQ("");
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return undefined;
    function colocar() {
      const r = caja.current?.getBoundingClientRect();
      if (!r) return;
      const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zoom")) || 1;
      const ancho = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
      const abajo = window.innerHeight - r.bottom;
      const arriba = abajo < 300 && r.top > abajo;
      setPos({ left: left / z, width: ancho / z, ...(arriba ? { bottom: (window.innerHeight - r.top + 6) / z, maxHeight: Math.min(440, r.top - 12) / z } : { top: (r.bottom + 6) / z, maxHeight: Math.min(440, abajo - 12) / z }) });
    }
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => { window.removeEventListener("resize", colocar); window.removeEventListener("scroll", colocar, true); };
  }, [abierto]);

  const lista = useMemo(() => {
    const t = norm(q.trim());
    return t ? opciones.filter((o) => norm(o.label).includes(t)) : opciones;
  }, [opciones, q]);

  const n = valor.length;
  const alternar = (v) => onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);

  return (
    <div className="vf-wrap" ref={caja}>
      <button type="button" className={`vf-boton ${n ? "vf-boton-on" : ""} ${abierto ? "vf-boton-abierto" : ""}`} onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span className="vf-boton-txt">{etiqueta}</span>
        {n > 0 && <b className="vf-cuenta">{n}</b>}
        <span className="vf-flecha" aria-hidden="true">▾</span>
      </button>
      {abierto && pos && createPortal(
        <div className="vf-menu" ref={menu} style={pos} onScroll={(e) => { if (e.currentTarget.scrollTop) e.currentTarget.scrollTop = 0; }}>
          <div className="vf-menu-cab">
            <input className="vf-busca" autoFocus placeholder={`Buscar ${etiqueta.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
            {n > 0 && <button type="button" className="vf-limpiar-mini" onClick={() => onChange([])}>Quitar ({n})</button>}
          </div>
          <div className="vf-lista">
            {lista.length === 0 ? <div className="vf-vacio">{opciones.length === 0 ? vacio : "Sin resultados"}</div> : lista.map((o) => {
              const on = valor.includes(o.value);
              return (
                <label key={o.value} className={`vf-op ${on ? "vf-op-on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => alternar(o.value)} />
                  <span className="vf-check" aria-hidden="true">{on ? "✓" : ""}</span>
                  {o.logo && <span className="vf-op-logo"><LogoMarca nombre={o.logo} size={22} /></span>}
                  {o.color && <span className="vf-op-color" style={{ background: o.color }} />}
                  <span className="vf-op-txt">{o.label}</span>
                  {o.count != null && <span className="vf-op-n">{o.count}</span>}
                </label>
              );
            })}
          </div>
        </div>, document.body)}
    </div>
  );
}

// Días desde la última visita para considerar que ya le toca servicio (igual que los recordatorios del panel)
export const DIAS_PROXIMO = 150;
export const VACIOS = { marcas: [], modelos: [], colores: [], estado: "", servicio: "", anioDesde: "", anioHasta: "", orden: "" };

export const SERVICIOS = [
  ["abierto", "Con orden abierta"],
  ["reciente", "Servicio en los últimos 90 días"],
  ["toca", `Le toca servicio (${DIAS_PROXIMO}+ días sin visita)`],
  ["sin", "Nunca se le ha dado servicio"],
];
export const ORDENES = [
  ["", "Orden predeterminado"],
  ["reciente", "Registrados recientemente"],
  ["marca", "Marca y modelo (A–Z)"],
  ["anio_desc", "Año: más nuevos primero"],
  ["anio_asc", "Año: más viejos primero"],
  ["km_desc", "Kilometraje: mayor a menor"],
  ["km_asc", "Kilometraje: menor a mayor"],
  ["servicio", "Último servicio (más reciente)"],
  ["mas_servicios", "Con más servicios"],
];

const DIA = 86400000;
export function aplicarFiltros(lista, f, { nomMarca, nomModelo }) {
  const hoy = Date.now();
  const desde = f.anioDesde ? Number(f.anioDesde) : null;
  const hasta = f.anioHasta ? Number(f.anioHasta) : null;
  let r = lista.filter((v) => {
    if (f.marcas.length && !f.marcas.includes(v.id_marca_vehiculo)) return false;
    if (f.modelos.length && !f.modelos.includes(v.id_modelo_vehiculo)) return false;
    if (f.colores.length && !f.colores.includes(v.id_color)) return false;
    if (f.estado && (v.estado_vehiculo || "activo") !== f.estado) return false;
    if (desde || hasta) {
      const y = parseInt(v.id_year_vehiculo, 10);
      if (!y) return false;
      if (desde && y < desde) return false;
      if (hasta && y > hasta) return false;
    }
    if (f.servicio) {
      const fecha = v.fecha_ultimo_servicio ? new Date(v.fecha_ultimo_servicio).getTime() : null;
      if (f.servicio === "abierto" && v.status_ultimo_servicio !== "abierto") return false;
      if (f.servicio === "sin" && (v.total_servicios || fecha)) return false;
      if (f.servicio === "reciente" && !(fecha && hoy - fecha <= 90 * DIA)) return false;
      if (f.servicio === "toca" && !(fecha && hoy - fecha >= DIAS_PROXIMO * DIA && v.status_ultimo_servicio !== "abierto" && (v.estado_vehiculo || "activo") === "activo")) return false;
    }
    return true;
  });
  const num = (x) => parseInt(x, 10) || 0;
  const cmp = {
    reciente: (a, b) => b.id_vehiculo - a.id_vehiculo,
    marca: (a, b) => `${nomMarca(a)} ${nomModelo(a)}`.localeCompare(`${nomMarca(b)} ${nomModelo(b)}`, "es"),
    anio_desc: (a, b) => num(b.id_year_vehiculo) - num(a.id_year_vehiculo),
    anio_asc: (a, b) => (num(a.id_year_vehiculo) || 9999) - (num(b.id_year_vehiculo) || 9999),
    km_desc: (a, b) => num(b.km_vehiculo) - num(a.km_vehiculo),
    km_asc: (a, b) => num(a.km_vehiculo) - num(b.km_vehiculo),
    servicio: (a, b) => (b.fecha_ultimo_servicio ? new Date(b.fecha_ultimo_servicio).getTime() : 0) - (a.fecha_ultimo_servicio ? new Date(a.fecha_ultimo_servicio).getTime() : 0),
    mas_servicios: (a, b) => (b.total_servicios || 0) - (a.total_servicios || 0),
  }[f.orden];
  if (cmp) r = [...r].sort(cmp);
  return r;
}

/* Barra completa: filtros desplegables, marcas frecuentes, chips activos y conteo */
// "resumen" trae los conteos ya calculados por el servidor (la lista de vehículos llega por páginas).
export default function FiltrosVehiculos({ resumen, marcas, modelos, colores, filtros, setFiltros, mostrados, total }) {
  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const activos = filtros.marcas.length + filtros.modelos.length + filtros.colores.length + (filtros.estado ? 1 : 0) + (filtros.servicio ? 1 : 0) + (filtros.anioDesde || filtros.anioHasta ? 1 : 0);

  const conteo = useMemo(() => ({ marca: resumen?.marcas || {}, modelo: resumen?.modelos || {}, color: resumen?.colores || {} }), [resumen]);

  const opMarcas = useMemo(() => marcas.filter((m) => conteo.marca[m.id_marca_vehiculo]).map((m) => ({ value: m.id_marca_vehiculo, label: m.nombre_marca, count: conteo.marca[m.id_marca_vehiculo], logo: m.nombre_marca })).sort((a, b) => a.label.localeCompare(b.label, "es")), [marcas, conteo]);
  const topMarcas = useMemo(() => [...opMarcas].sort((a, b) => b.count - a.count).slice(0, 8), [opMarcas]);
  const opModelos = useMemo(() => modelos
    .filter((m) => conteo.modelo[m.id_modelo_vehiculo] && (!filtros.marcas.length || filtros.marcas.includes(m.id_marca_vehiculo)))
    .map((m) => ({ value: m.id_modelo_vehiculo, label: filtros.marcas.length === 1 ? m.nombre_modelo : `${marcas.find((x) => x.id_marca_vehiculo === m.id_marca_vehiculo)?.nombre_marca || ""} ${m.nombre_modelo}`.trim(), count: conteo.modelo[m.id_modelo_vehiculo] }))
    .sort((a, b) => a.label.localeCompare(b.label, "es")), [modelos, marcas, conteo, filtros.marcas]);
  const opColores = useMemo(() => colores.filter((c) => conteo.color[c.id_color]).map((c) => ({ value: c.id_color, label: c.nombre_color, count: conteo.color[c.id_color], color: c.codigo_hex || undefined })).sort((a, b) => b.count - a.count), [colores, conteo]);
  const anios = useMemo(() => {
    const min = resumen?.anio_min, max = resumen?.anio_max;
    if (!min || !max) return [];
    return Array.from({ length: max - min + 1 }, (_, i) => max - i);
  }, [resumen]);

  // Si se quitan marcas, se sueltan los modelos que ya no corresponden
  useEffect(() => {
    if (!filtros.marcas.length || !filtros.modelos.length) return;
    const validos = new Set(modelos.filter((m) => filtros.marcas.includes(m.id_marca_vehiculo)).map((m) => m.id_modelo_vehiculo));
    const nuevos = filtros.modelos.filter((id) => validos.has(id));
    if (nuevos.length !== filtros.modelos.length) set("modelos", nuevos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.marcas]);

  const nomMarca = (id) => marcas.find((m) => m.id_marca_vehiculo === id)?.nombre_marca || "—";
  const nomModelo = (id) => modelos.find((m) => m.id_modelo_vehiculo === id)?.nombre_modelo || "—";
  const nomColor = (id) => colores.find((c) => c.id_color === id)?.nombre_color || "—";
  const chips = [
    ...filtros.marcas.map((id) => ({ k: `m${id}`, t: nomMarca(id), quitar: () => set("marcas", filtros.marcas.filter((x) => x !== id)) })),
    ...filtros.modelos.map((id) => ({ k: `mo${id}`, t: nomModelo(id), quitar: () => set("modelos", filtros.modelos.filter((x) => x !== id)) })),
    ...filtros.colores.map((id) => ({ k: `c${id}`, t: `Color ${nomColor(id)}`, quitar: () => set("colores", filtros.colores.filter((x) => x !== id)) })),
    ...(filtros.anioDesde || filtros.anioHasta ? [{ k: "anio", t: `Año ${filtros.anioDesde || "…"} – ${filtros.anioHasta || "…"}`, quitar: () => setFiltros((f) => ({ ...f, anioDesde: "", anioHasta: "" })) }] : []),
    ...(filtros.estado ? [{ k: "estado", t: filtros.estado === "activo" ? "Solo activos" : "Solo vendidos", quitar: () => set("estado", "") }] : []),
    ...(filtros.servicio ? [{ k: "serv", t: SERVICIOS.find((s) => s[0] === filtros.servicio)?.[1], quitar: () => set("servicio", "") }] : []),
  ];

  return (
    <div className="vf-barra">
      <div className="vf-fila">
        <MultiFiltro etiqueta="Marca" opciones={opMarcas} valor={filtros.marcas} onChange={(v) => set("marcas", v)} />
        <MultiFiltro etiqueta="Modelo" opciones={opModelos} valor={filtros.modelos} onChange={(v) => set("modelos", v)} vacio="No hay modelos" />
        <MultiFiltro etiqueta="Color" opciones={opColores} valor={filtros.colores} onChange={(v) => set("colores", v)} />
        <div className="vf-rango" title="Año del vehículo">
          <span className="vf-rango-etq">Año</span>
          <select className="vf-sel" value={filtros.anioDesde} onChange={(e) => set("anioDesde", e.target.value)} aria-label="Año desde"><option value="">Desde</option>{anios.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <span className="vf-rango-sep">–</span>
          <select className="vf-sel" value={filtros.anioHasta} onChange={(e) => set("anioHasta", e.target.value)} aria-label="Año hasta"><option value="">Hasta</option>{anios.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </div>
        <select className={`vf-sel vf-sel-solo ${filtros.estado ? "vf-sel-on" : ""}`} value={filtros.estado} onChange={(e) => set("estado", e.target.value)} aria-label="Estado del vehículo">
          <option value="">Activos y vendidos</option><option value="activo">Solo activos</option><option value="vendido">Solo vendidos</option>
        </select>
        <select className={`vf-sel vf-sel-solo ${filtros.servicio ? "vf-sel-on" : ""}`} value={filtros.servicio} onChange={(e) => set("servicio", e.target.value)} aria-label="Servicio">
          <option value="">Cualquier servicio</option>{SERVICIOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select className="vf-sel vf-sel-solo vf-orden" value={filtros.orden} onChange={(e) => set("orden", e.target.value)} aria-label="Ordenar por">
          {ORDENES.map(([v, t]) => <option key={v} value={v}>{v ? `Ordenar: ${t}` : t}</option>)}
        </select>
      </div>

      {topMarcas.length > 1 && (
        <div className="vf-rapidas" aria-label="Marcas frecuentes">
          <span className="vf-rapidas-etq">Frecuentes</span>
          {topMarcas.map((m) => {
            const on = filtros.marcas.includes(m.value);
            return (
              <button key={m.value} type="button" className={`vf-rapida ${on ? "vf-rapida-on" : ""}`} onClick={() => set("marcas", on ? filtros.marcas.filter((x) => x !== m.value) : [...filtros.marcas, m.value])}>
                <LogoMarca nombre={m.label} size={18} /> {m.label} <b>{m.count}</b>
              </button>
            );
          })}
        </div>
      )}

      <div className="vf-resumen">
        <span className="vf-contador">Mostrando <b>{mostrados}</b> de {total}</span>
        {chips.map((c) => (
          <button key={c.k} type="button" className="vf-chip" onClick={c.quitar} title="Quitar este filtro">{c.t} <span aria-hidden="true">✕</span></button>
        ))}
        {activos > 0 && <button type="button" className="vf-limpiar" onClick={() => setFiltros((f) => ({ ...VACIOS, orden: f.orden }))}><Icono nombre="close" size={13} /> Limpiar filtros</button>}
      </div>
    </div>
  );
}
