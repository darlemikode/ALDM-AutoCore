import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";
import { contiene } from "../lib/texto";
import "./domicilios.css";

const DomicilioOrdenModal = lazy(() => import("../components/DomicilioOrdenModal"));

// Mismas etapas cortas que el seguimiento público del cliente.
const PASOS = [
  ["en_proceso", "Recibido"], ["abierto", "En piso"], ["pendiente", "Aprobación"],
  ["espera_refacciones", "Piezas"], ["en_reparacion", "Reparación"], ["listo_entrega", "Listo"],
];
const FILTROS = [["", "Abiertos"], ["pend", "Esperando código"], ["ini", "En servicio"], ["bloq", "Bloqueado"], ["fin", "Finalizados"]];
const fmt = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

function enlaceMapa(d) {
  if (d.lat != null && d.lng != null) return `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;
  if (d.maps_url) return d.maps_url;
  if (d.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.direccion)}`;
  return null;
}

function hace(iso) {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}

// Acceso rápido a los servicios a domicilio abiertos: dirección, mecánico y estado del código.
export default function Domicilios() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [lista, setLista] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [mecanico, setMecanico] = useState("");
  const [filtro, setFiltro] = useState("");
  const [abierta, setAbierta] = useState(null);

  const conFin = useRef(false); // los finalizados solo se piden cuando se abre esa pestaña
  const cargar = useCallback(async () => {
    try { setLista(await api.get(`/servicio-domicilio/lista/abiertas${conFin.current ? "?incluir_finalizados=true" : ""}`)); } catch { setLista((l) => l || []); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (filtro === "fin" && !conFin.current) { conFin.current = true; cargar(); } }, [filtro, cargar]);
  useActualizacionGlobal("servicios", cargar);

  const mecanicos = [...new Map((lista || []).filter((d) => d.id_empleado_mecanico && d.mecanico).map((d) => [d.id_empleado_mecanico, d.mecanico])).entries()];
  const estado = (d) => (d.finalizado ? ["fin", "Finalizado"] : d.bloqueado ? ["bloq", "Código bloqueado"] : d.iniciado ? ["ini", "En servicio"] : ["pend", "Esperando código"]);

  const base = (lista || []).filter((d) => (!mecanico || String(d.id_empleado_mecanico || "") === mecanico)
    && (!busqueda || contiene(`${d.id_servicio} ${d.servicio} ${d.cliente || ""} ${d.direccion || ""} ${d.vehiculo || ""} ${d.placas || ""}`, busqueda)));
  const abiertos = base.filter((d) => !d.finalizado);
  const conteo = (k) => (k ? base.filter((d) => estado(d)[0] === k).length : abiertos.length);
  const filtradas = filtro ? base.filter((d) => estado(d)[0] === filtro) : abiertos;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/domicilios" /> Servicios a domicilio</h1>
          <div className="subtitle">{lista ? `${abiertos.length} abierto(s) · ${conteo("pend")} esperando código` : "Cargando…"}</div>
        </div>
        {hasPermission("servicios.crear") && (
          <button className="btn btn-primary" onClick={() => navigate("/servicios/nueva?domicilio=1")}>＋ Nuevo a domicilio</button>
        )}
      </div>

      <div className="panel">
        <div className="toolbar dmcl-barra">
          <input className="search-input" placeholder="Buscar por orden, cliente, vehículo, placas o dirección…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <select value={mecanico} onChange={(e) => setMecanico(e.target.value)} aria-label="Filtrar por mecánico">
            <option value="">Todos los mecánicos</option>
            {mecanicos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
        <div className="dmcl-filtros" role="tablist" aria-label="Estado del servicio">
          {FILTROS.map(([k, t]) => (
            <button key={k || "todos"} type="button" role="tab" aria-selected={filtro === k} className={`dmcl-filtro ${k}${filtro === k ? " activo" : ""}`} onClick={() => setFiltro(k)}>
              {t} {(k !== "fin" || conFin.current) && <span>{conteo(k)}</span>}
            </button>
          ))}
        </div>

        {lista && filtradas.length === 0 ? (
          <div className="empty-state">No hay servicios a domicilio en esta vista. Marca “Servicio a domicilio” al crear una orden o desde su detalle.</div>
        ) : (
          <div className="dmcl-grid">
            {filtradas.map((d) => {
              const [cls, txt] = estado(d);
              const idx = d.finalizado ? PASOS.length - 1 : Math.max(0, PASOS.findIndex(([k]) => k === d.etapa));
              const mapa = enlaceMapa(d);
              const mec = d.mecanico;
              return (
                <article key={d.id_servicio} className={`dmcl-card ${cls}`}>
                  <header>
                    <span className="dmcl-num">#{d.id_servicio}<small>{hace(d.fecha)}</small></span>
                    <span className={`dmcl-chip ${cls}`}>{txt}</span>
                  </header>
                  <h3>{d.servicio}</h3>

                  <div className="dmcl-datos">
                    <p className="dmcl-linea"><Icono nombre="user" size={15} /> <span>{d.cliente || "Sin cliente"}</span></p>
                    {(d.vehiculo || d.placas) && (
                      <p className="dmcl-linea"><Icono nombre="car" size={15} /> <span>{d.vehiculo || "Vehículo"}</span>{d.placas && <em className="dmcl-placa">{d.placas}</em>}</p>
                    )}
                    <p className="dmcl-linea"><Icono nombre="pin" size={15} /> <span>{d.direccion || "Ubicación por mapa"}</span></p>
                    <p className={`dmcl-linea${mec ? "" : " sin"}`}><Icono nombre="wrench" size={15} /> <span>{mec || "Sin mecánico asignado"}</span></p>
                  </div>

                  <div className="dmcl-avance" aria-label={`Etapa: ${PASOS[idx][1]}`}>
                    <div className="dmcl-barra-av">{PASOS.map(([k], i) => <i key={k} className={i < idx ? "hecho" : i === idx ? "actual" : ""} />)}</div>
                    <span>{d.finalizado ? (d.total != null ? `Entregado · ${fmt(d.total)}` : "Entregado") : d.iniciado ? PASOS[idx][1] : "Sin iniciar"}</span>
                  </div>

                  <footer>
                    {!d.finalizado && hasPermission("servicios.editar") && <button className="btn btn-primary btn-sm" onClick={() => setAbierta(d.id_servicio)}>Código y enlace</button>}
                    <Link className="btn btn-secondary btn-sm" to={`/servicios/${d.id_servicio}`}>Ver orden</Link>
                    {mapa && <a className="btn btn-secondary btn-sm dmcl-mapa" href={mapa} target="_blank" rel="noopener noreferrer" aria-label="Abrir en Google Maps" title="Abrir en Google Maps"><Icono nombre="map" size={16} /> {d.finalizado ? "Ver ubicación" : "Mapa"}</a>}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {abierta && <Suspense fallback={null}><DomicilioOrdenModal idServicio={abierta} nombreServicio={lista?.find((x) => x.id_servicio === abierta)?.servicio} onClose={() => setAbierta(null)} onCambio={cargar} /></Suspense>}
    </div>
  );
}
