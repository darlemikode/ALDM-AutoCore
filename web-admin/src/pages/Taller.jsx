import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import Auto3D from "../components/Auto3D";
import IconoModulo from "../components/IconoModulo";
import "./taller.css";

const ZONAS = [
  ["di", "Del. izq."], ["dd", "Del. der."], ["ti", "Tras. izq."], ["td", "Tras. der."], ["faros", "Faros"], ["motor", "Motor"],
  ["transmision", "Transmisión"], ["espejos", "Espejos"], ["cabina", "Cabina"], ["cajuela", "Cajuela"], ["escape", "Escape"], ["luces_t", "Luces tras."],
];
const AVISOS = [
  "Tu vehículo ya está listo para recoger",
  "Necesitamos tu autorización para continuar",
  "Estamos esperando una refacción; te avisamos al llegar",
  "Tu entrega se retrasará un poco; seguimos trabajando en él",
];
const pad = (n) => String(n).padStart(2, "0");
const aLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const hoyA = (h, dias = 0) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, 0, 0, 0); return d; };

function duracion(min) {
  min = Math.abs(Math.round(min));
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${pad(min % 60)} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

// Tiempo en bahía: verde < 4 h · ámbar 4–8 h · rojo > 8 h
const nivelTiempo = (min) => (min >= 480 ? "largo" : min >= 240 ? "medio" : "ok");

function chipPromesa(o, ahora) {
  if (!o.fecha_promesa) return { clase: "sin", texto: "Sin fecha promesa" };
  const falta = Math.round((new Date(o.fecha_promesa).getTime() - ahora) / 60000);
  const cuando = new Date(o.fecha_promesa).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (falta < 0) return { clase: "atrasada", texto: `Atrasada ${duracion(falta)}`, cuando };
  if (falta <= 120) return { clase: "pronto", texto: `Entrega en ${duracion(falta)}`, cuando };
  return { clase: "ok", texto: `Entrega en ${duracion(falta)}`, cuando };
}

function Tarjeta({ b, o, ahora, tv, datos, puedeEditar, abierto, onToggle, acciones, nav }) {
  if (!o) {
    return (
      <article className="bahia-card libre">
        <header><h2>{b.nombre}</h2><span className="bahia-estado libre">Libre</span></header>
        <div className="bahia-libre-cuerpo">
          <span className="bahia-libre-icono" aria-hidden="true">＋</span>
          <p>Bahía disponible</p>
          {!tv && puedeEditar && datos.sin_bahia.length > 0 && (
            <select value="" onChange={(e) => e.target.value && acciones.asignar(Number(e.target.value), b.id_bahia)} aria-label={`Asignar una orden a ${b.nombre}`}>
              <option value="">Asignar una orden…</option>
              {datos.sin_bahia.map((s) => <option key={s.id_servicio} value={s.id_servicio}>#{s.id_servicio} · {s.vehiculo}{s.placas ? ` (${s.placas})` : ""}</option>)}
            </select>
          )}
        </div>
      </article>
    );
  }
  return <TarjetaOcupada b={b} o={o} ahora={ahora} tv={tv} datos={datos} puedeEditar={puedeEditar} abierto={abierto} onToggle={onToggle} acciones={acciones} nav={nav} />;
}

function TarjetaOcupada({ b, o, ahora, tv, datos, puedeEditar, abierto, onToggle, acciones, nav }) {
  const min = o.desde ? Math.max(0, Math.round((ahora - new Date(o.desde).getTime()) / 60000)) : 0;
  const p = chipPromesa(o, ahora);
  const [aviso, setAviso] = useState(AVISOS[0]);
  return (
    <article className={`bahia-card ocupada sem-${o.nivel}`}>
      <header>
        <h2>{b.nombre}</h2>
        <span className={`bahia-tiempo nivel-${nivelTiempo(min)}`} title="Tiempo en bahía">{duracion(min)}</span>
      </header>
      <div className="bahia-auto" onClick={() => !tv && nav(`/servicios/${o.id_servicio}`)} role={tv ? undefined : "link"} tabIndex={tv ? -1 : 0}
        onKeyDown={(e) => !tv && e.key === "Enter" && nav(`/servicios/${o.id_servicio}`)} title={tv ? undefined : "Abrir la orden"}>
        <Auto3D sinPuntos compacto avance={{ progreso: o.progreso, zonas: o.zonas }} />
      </div>
      <div className="bahia-info">
        {tv ? <span className="bahia-veh">{o.vehiculo}{o.placas ? <small> · {o.placas}</small> : null}</span>
          : <Link to={`/servicios/${o.id_servicio}`} className="bahia-veh">{o.vehiculo}{o.placas ? <small> · {o.placas}</small> : null}</Link>}
        <div className="bahia-cliente">{o.cliente || "—"} · #{o.id_servicio}</div>
        <div className="bahia-filas">
          <span className="bahia-etapa">{o.etapa_nombre}</span>
          <span className={`bahia-promesa ${p.clase}`} title={p.cuando}>{p.texto}</span>
        </div>
        <div className="bahia-mecanico">{o.mecanico ? `Mecánico: ${o.mecanico}` : "Sin mecánico asignado"}</div>
        {o.alertas.length > 0 && (
          <ul className="bahia-alertas">
            {o.alertas.map((a) => <li key={a.codigo} className={a.nivel}>{a.texto}</li>)}
          </ul>
        )}
      </div>

      {!tv && puedeEditar && (
        <>
          <div className="bahia-ops">
            <select value={o.etapa} onChange={(e) => acciones.etapa(o.id_servicio, e.target.value)} aria-label="Etapa">
              {datos.etapas.map((e) => <option key={e.clave} value={e.clave}>{e.etiqueta}</option>)}
            </select>
            <select value={o.id_empleado ?? ""} onChange={(e) => acciones.mecanico(o.id_servicio, e.target.value)} aria-label="Mecánico">
              <option value="">Sin mecánico</option>
              {datos.empleados.map((e) => <option key={e.id_empleado} value={e.id_empleado}>{e.nombre}</option>)}
            </select>
          </div>
          <button type="button" className="bahia-mas" onClick={onToggle} aria-expanded={abierto}>{abierto ? "Cerrar ▴" : "Zonas, entrega y aviso ▾"}</button>
          {abierto && (
            <div className="bahia-panel">
              <div className="bahia-panel-titulo">Zonas del auto</div>
              <div className="zonas-ops">
                {ZONAS.map(([z, nombre]) => (
                  <div key={z} className="zona-op">
                    <span>{nombre}</span>
                    <div role="group" aria-label={nombre}>
                      <button type="button" className={!o.zonas[z] ? "on" : ""} onClick={() => acciones.zona(o, z, null)}>—</button>
                      <button type="button" className={o.zonas[z] === "proceso" ? "on proceso" : ""} onClick={() => acciones.zona(o, z, "proceso")}>En proceso</button>
                      <button type="button" className={o.zonas[z] === "listo" ? "on listo" : ""} onClick={() => acciones.zona(o, z, "listo")}>Listo</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bahia-panel-titulo">Fecha y hora de entrega</div>
              <div className="promesa-ops">
                <input type="datetime-local" value={aLocal(o.fecha_promesa)} onChange={(e) => e.target.value && acciones.promesa(o.id_servicio, new Date(e.target.value).toISOString())} />
                <div className="promesa-rapidos">
                  <button type="button" onClick={() => acciones.promesa(o.id_servicio, new Date(Date.now() + 2 * 3600000).toISOString())}>+2 h</button>
                  <button type="button" onClick={() => acciones.promesa(o.id_servicio, hoyA(18).toISOString())}>Hoy 6 pm</button>
                  <button type="button" onClick={() => acciones.promesa(o.id_servicio, hoyA(12, 1).toISOString())}>Mañana 12 pm</button>
                  {o.fecha_promesa && <button type="button" onClick={() => acciones.promesa(o.id_servicio, null)}>Quitar</button>}
                </div>
                <small>Al cambiarla se avisa al cliente en su app.</small>
              </div>
              <div className="bahia-panel-titulo">Avisar al cliente</div>
              <div className="aviso-ops">
                <select value={aviso} onChange={(e) => setAviso(e.target.value)} disabled={!o.tiene_push}>
                  {AVISOS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button type="button" className="btn btn-primary" disabled={!o.tiene_push} onClick={() => acciones.avisar(o.id_servicio, aviso)}>Enviar</button>
              </div>
              {!o.tiene_push && <small>El cliente aún no tiene la app instalada.</small>}
              <button type="button" className="bahia-liberar" onClick={() => acciones.asignar(o.id_servicio, null)}>Liberar bahía</button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function Taller() {
  const nav = useNavigate();
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const [datos, setDatos] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const [tv, setTv] = useState(false);
  const [panel, setPanel] = useState(null);
  const puedeEditar = hasPermission("servicios.editar");

  const cargar = useCallback(() => api.get("/bahias/tablero").then((d) => { setDatos(d); setAhora(Date.now()); }).catch((e) => notify(e.message, "error")), [notify]);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, tv ? 15000 : 30000);
    return () => clearInterval(t);
  }, [cargar, tv]);

  // Modo TV: pantalla completa, sin controles, pantalla siempre encendida
  useEffect(() => {
    if (!tv) return undefined;
    let wl = null;
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* sin pantalla completa */ }
    try { navigator.wakeLock?.request("screen").then((l) => { wl = l; }).catch(() => {}); } catch { /* sin wake lock */ }
    const salir = () => { if (!document.fullscreenElement) setTv(false); };
    document.addEventListener("fullscreenchange", salir);
    return () => {
      document.removeEventListener("fullscreenchange", salir);
      try { wl?.release(); } catch { /* ignore */ }
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
    };
  }, [tv]);

  const hacer = useCallback(async (fn, ok) => {
    try { await fn(); if (ok) notify(ok, "success"); await cargar(); } catch (e) { notify(e.message, "error"); }
  }, [cargar, notify]);

  const acciones = useMemo(() => ({
    asignar: (id, idBahia) => hacer(() => api.put(`/bahias/asignar/${id}`, { id_bahia: idBahia })),
    etapa: (id, etapa) => hacer(() => api.put(`/servicios/${id}/etapa`, { etapa, comentario: "Cambio desde el tablero" }), "Etapa actualizada; el cliente fue notificado."),
    mecanico: (id, idEmp) => hacer(() => api.put(`/servicios/${id}`, { id_empleado_responsable: idEmp ? Number(idEmp) : null }), "Mecánico actualizado."),
    zona: (o, z, estado) => {
      const zonas = { ...o.zonas };
      if (estado) zonas[z] = estado; else delete zonas[z];
      return hacer(() => api.put(`/recepcion/${o.id_servicio}/avance`, { zonas }));
    },
    promesa: (id, iso) => hacer(() => api.put(`/bahias/promesa/${id}`, { fecha_promesa: iso, avisar: true }), iso ? "Fecha de entrega guardada." : "Se quitó la fecha de entrega."),
    avisar: (id, mensaje) => hacer(() => api.post(`/bahias/avisar/${id}`, { mensaje }), "Aviso enviado al cliente."),
  }), [hacer]);

  const atencion = useMemo(() => {
    if (!datos) return [];
    const todas = [...datos.bahias.filter((b) => b.orden_actual).map((b) => ({ ...b.orden_actual, bahia: b.nombre })), ...datos.sin_bahia.map((s) => ({ ...s, bahia: null }))];
    return todas.filter((t) => t.nivel !== "ok").sort((a, c) => (a.nivel === c.nivel ? 0 : a.nivel === "rojo" ? -1 : 1));
  }, [datos]);

  const r = datos?.resumen;
  const reloj = new Date(ahora).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  const contenido = (
    <>
      {r && (
        <div className="taller-resumen">
          <span className="res"><b>{r.abiertas}</b> abiertas</span>
          <span className={`res${r.atrasadas ? " rojo" : ""}`}><b>{r.atrasadas}</b> atrasadas</span>
          <span className={`res${r.por_vencer ? " ambar" : ""}`}><b>{r.por_vencer}</b> por vencer</span>
          <span className="res verde"><b>{r.listos}</b> listas para entrega</span>
        </div>
      )}

      {atencion.length > 0 && (
        <section className="taller-atencion" aria-label="Requieren atención">
          <h3>Requieren atención</h3>
          <ul>
            {atencion.map((t) => (
              <li key={t.id_servicio} className={t.nivel}>
                {tv ? <strong>{t.vehiculo}{t.placas ? ` · ${t.placas}` : ""}</strong> : <Link to={`/servicios/${t.id_servicio}`}><strong>{t.vehiculo}{t.placas ? ` · ${t.placas}` : ""}</strong></Link>}
                <span className="donde">{t.bahia || "Sin bahía"}</span>
                <span className="que">{t.alertas.map((a) => a.texto).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {datos && datos.bahias.length === 0 && (
        <div className="panel taller-vacio">
          <strong>Aún no hay bahías</strong>
          <p>Crea tus elevadores o cajones en Configuración del taller y asigna cada vehículo desde su orden.</p>
          {hasPermission("configuracion.editar") && <Link className="btn btn-primary" to="/configuracion-taller">Crear bahías</Link>}
        </div>
      )}

      <div className="taller-grid">
        {datos?.bahias.map((b) => (
          <Tarjeta key={b.id_bahia} b={b} o={b.orden_actual} ahora={ahora} tv={tv} datos={datos} puedeEditar={puedeEditar}
            abierto={panel === b.id_bahia} onToggle={() => setPanel(panel === b.id_bahia ? null : b.id_bahia)} acciones={acciones} nav={nav} />
        ))}
      </div>

      {datos && datos.sin_bahia.length > 0 && datos.bahias.length > 0 && (
        <section className="panel taller-sin">
          <h3>Órdenes abiertas sin bahía</h3>
          <ul>
            {datos.sin_bahia.map((s) => {
              const p = chipPromesa(s, ahora);
              return (
                <li key={s.id_servicio}>
                  {tv ? <span>#{s.id_servicio} · {s.vehiculo}{s.placas ? ` · ${s.placas}` : ""}</span> : <Link to={`/servicios/${s.id_servicio}`}>#{s.id_servicio} · {s.vehiculo}{s.placas ? ` · ${s.placas}` : ""}</Link>}
                  <span>{s.etapa_nombre}</span>
                  <span className={`bahia-promesa ${p.clase}`}>{p.texto}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );

  if (tv) {
    return (
      <div className="taller-tv">
        <header className="tv-barra">
          <h1>{(datos && "Tablero del taller") || "Cargando…"}</h1>
          <div className="tv-reloj">{reloj}</div>
          <button type="button" onClick={() => setTv(false)}>Salir</button>
        </header>
        {contenido}
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/taller" /> Tablero del taller</h1>
            <div className="subtitle">Opera cada auto desde aquí; se actualiza solo cada 30 s.</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setTv(true)}>Modo TV</button>
        </div>
      </div>
      {contenido}
    </>
  );
}
