import { IconoAuto } from "../components/Icono";
import { opMarca, opModelo } from "../components/Combo";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import { colorGrupo } from "../components/FiltroChips";
import FiltrosVehiculos, { VACIOS, DIAS_PROXIMO } from "../components/FiltrosVehiculos";
import VehiculoModal from "../components/VehiculoModal";
import ModalPortal from "../components/ModalPortal";
import MensajeModal from "../components/MensajeModal";
import FotoGaleria from "../components/FotoGaleria";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

// Catálogo unificado de estatus — mismo catálogo que ETAPAS_SERVICIO en el backend
const ETIQUETAS_ETAPA = {
  en_proceso: "Recibido",
  abierto: "En piso",
  pendiente: "Confirmación del cliente",
  espera_refacciones: "Espera refacciones",
  en_reparacion: "En reparación",
  listo_entrega: "Listo para entrega",
  cerrado: "Órdenes finalizadas",
  garantia: "Garantía",
  cancelado: "Cancelado",
};
const STATUS_BADGE = { abierto: "badge-petrol", cerrado: "badge-teal", cancelado: "badge-red" };

// "Hace 3 días" / "Hace 2 meses" / "Nunca" — para ordenar y mostrar a quién
// le hicieron servicio más recientemente.
function hace(fecha) {
  if (!fecha) return "Nunca se le ha dado servicio";
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Hace 1 día";
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `Hace ${meses} mes${meses === 1 ? "" : "es"}`;
  const anios = Math.floor(meses / 12);
  return `Hace ${anios} año${anios === 1 ? "" : "s"}`;
}

export default function Vehiculos() {
  const [params, setParams] = useSearchParams();
  const idCliente = params.get("id_cliente");
  const navigate = useNavigate();
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();

  const [vehiculos, setVehiculos] = useState([]); // páginas ya cargadas (filtradas por el servidor)
  const [total, setTotal] = useState(0); // vehículos que coinciden con los filtros
  const [resumen, setResumen] = useState(null); // tarjetas y conteos de los filtros
  const [cargandoMas, setCargandoMas] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [colores, setColores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState(VACIOS);
  const [q, setQ] = useState("");
  const [vista, setVista] = useState("lista"); // lista | clientes
  const [fotosDe, setFotosDe] = useState(null); // vehículo cuyas fotos se están viendo
  const [ofrecerSiguiente, setOfrecerSiguiente] = useState(null); // vehículo recién creado

  const PAGINA = 40;
  const peticion = useRef(0); // descarta respuestas viejas si cambian los filtros a medias
  const filtrosRef = useRef({ q: "", filtros: VACIOS });
  filtrosRef.current = { q, filtros };

  function parametros(offset) {
    const { q: texto, filtros: f } = filtrosRef.current;
    const p = new URLSearchParams();
    if (idCliente) p.set("id_cliente", idCliente);
    if (texto.trim()) p.set("q", texto.trim());
    if (f.marcas.length) p.set("marcas", f.marcas.join(","));
    if (f.modelos.length) p.set("modelos", f.modelos.join(","));
    if (f.colores.length) p.set("colores", f.colores.join(","));
    if (f.anioDesde) p.set("anio_desde", f.anioDesde);
    if (f.anioHasta) p.set("anio_hasta", f.anioHasta);
    if (f.estado) p.set("estado", f.estado);
    if (f.servicio) p.set("servicio", f.servicio);
    if (f.orden) p.set("orden", f.orden);
    p.set("limite", PAGINA);
    p.set("offset", offset);
    return p.toString();
  }

  // Primera página (o recarga tras guardar/borrar) con los filtros actuales
  async function cargarPagina() {
    const n = ++peticion.current;
    try {
      const r = await api.get(`/vehiculos/pagina?${parametros(0)}`);
      if (n !== peticion.current) return;
      setVehiculos(r.items);
      setTotal(r.total);
    } catch (err) {
      if (n === peticion.current) notify(err.message, "error");
    } finally {
      if (n === peticion.current) setLoading(false);
    }
  }

  async function cargarMas() {
    if (cargandoMas || vehiculos.length >= total) return;
    const n = peticion.current;
    setCargandoMas(true);
    try {
      const r = await api.get(`/vehiculos/pagina?${parametros(vehiculos.length)}`);
      if (n !== peticion.current) return;
      setVehiculos((l) => [...l, ...r.items.filter((x) => !l.some((y) => y.id_vehiculo === x.id_vehiculo))]);
      setTotal(r.total);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setCargandoMas(false);
    }
  }

  async function cargarResumen() {
    try {
      const r = await api.get(`/vehiculos/resumen${idCliente ? `?id_cliente=${idCliente}` : ""}`);
      setResumen(r);
      if (r.errores?.length) console.warn("vehiculos/resumen:", r.errores);
    } catch (err) {
      console.warn("vehiculos/resumen:", err);
      notify(`No se pudieron cargar las tarjetas: ${err.message}`, "error");
    }
  }

  // Tras guardar, borrar o cambiar fotos: se refresca la lista y las tarjetas
  function loadAll() {
    cargarPagina();
    cargarResumen();
  }

  // Catálogos (marcas, modelos, colores): una sola vez
  useEffect(() => {
    api.get("/vehiculos/catalogos").then((cat) => { setMarcas(cat.marcas); setModelos(cat.modelos); setColores(cat.colores); }).catch(() => {});
  }, []);

  useEffect(() => { cargarResumen(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idCliente]);

  // La lista se vuelve a pedir al servidor cuando cambia el cliente, la búsqueda o un filtro (con una pausa al escribir)
  const primera = useRef(true);
  useEffect(() => {
    const espera = primera.current ? 0 : 300;
    primera.current = false;
    const t = setTimeout(cargarPagina, espera);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCliente, q, filtros]);

  // La lista de clientes solo sirve para el selector del formulario: se pide al abrirlo (y una sola vez)
  const clientesPedidos = useRef(false);
  useEffect(() => {
    if (!editing || clientesPedidos.current) return;
    clientesPedidos.current = true;
    api.get("/clientes/?solo_activos=true").then(setClientes).catch(() => { clientesPedidos.current = false; });
  }, [editing]);

  // Si se llegó aquí desde "Cliente creado — ¿agregar su vehículo?", se
  // abre el formulario de alta solo, ya con el cliente precargado, sin
  // que la persona tenga que volver a buscarlo ni dar clic en "+ Nuevo".
  useEffect(() => {
    if (params.get("abrir_nuevo") === "1" && idCliente && hasPermission("vehiculos.crear")) {
      setEditing({ id_cliente: Number(idCliente) });
      const nuevosParams = new URLSearchParams(params);
      nuevosParams.delete("abrir_nuevo");
      setParams(nuevosParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(values) {
    const esNuevo = !editing?.id_vehiculo;
    let creado = null;
    if (editing?.id_vehiculo) {
      await api.put(`/vehiculos/${editing.id_vehiculo}`, values);
    } else {
      creado = await api.post("/vehiculos/", values);
    }
    setEditing(null);
    loadAll();
    notify(esNuevo ? "Vehículo registrado." : "Vehículo actualizado.", "success");
    // Al dar de alta un vehículo nuevo se le ofrece, de una vez, agregarle
    // una foto (recién ahí ya existe su id_vehiculo, antes no se puede) y
    // crear su primera orden — dos cosas que casi siempre siguen después.
    if (esNuevo && creado && hasPermission("servicios.crear")) {
      setOfrecerSiguiente(creado);
    }
  }

  async function handleDelete(v) {
    const ok = await confirmDialog(`¿Eliminar el vehículo con placas ${v.placas_vehiculo || "(sin placas)"}? Esto no se puede deshacer.`, { danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try {
      await api.del(`/vehiculos/${v.id_vehiculo}`);
      loadAll();
      notify("Vehículo eliminado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const nomMarcaV = (v) => marcas.find((m) => m.id_marca_vehiculo === v.id_marca_vehiculo)?.nombre_marca || "Sin marca";
  function nombreMarca(id) { return marcas.find((m) => m.id_marca_vehiculo === id)?.nombre_marca || "—"; }
  function nombreModelo(id) { return modelos.find((m) => m.id_modelo_vehiculo === id)?.nombre_modelo || "—"; }
  const kpis = { activos: resumen?.activos ?? 0, abiertos: resumen?.abiertos ?? 0, toca: resumen?.toca ?? 0, sin: resumen?.sin ?? 0 };
  // Al llegar al final de lo cargado se pide la siguiente página
  const centinela = useRef(null);
  const cargarMasRef = useRef(cargarMas);
  cargarMasRef.current = cargarMas;
  useEffect(() => {
    const el = centinela.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) cargarMasRef.current(); }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  });
  const alternarServicio = (clave) => setFiltros((f) => ({ ...f, servicio: f.servicio === clave ? "" : clave }));
  const visibles = vehiculos;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/vehiculos" /> Vehículos</h1>
          <div className="subtitle">
            {idCliente ? "Filtrando por cliente seleccionado" : `${resumen?.total ?? total} vehículo(s) registrados`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="vista-toggle vista-toggle-iconos">
            <button type="button" className={`vista-toggle-btn ${vista === "clientes" ? "activo" : ""}`} title="Agrupar por cliente" aria-label="Agrupar por cliente" onClick={() => setVista("clientes")}>
              <Icono nombre="list" size={19} />
            </button>
            <button type="button" className={`vista-toggle-btn ${vista === "lista" ? "activo" : ""}`} title="Vista de lista" aria-label="Vista de lista" onClick={() => setVista("lista")}>
              <Icono nombre="grid" size={19} />
            </button>
          </div>
          {idCliente && (
            <button className="btn btn-secondary" onClick={() => setParams({})}>
              Quitar filtro
            </button>
          )}
          {hasPermission("vehiculos.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({ id_cliente: idCliente ? Number(idCliente) : undefined })}>
            <span className="btn-nuevo-icono"><Icono nombre="car" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo vehículo</button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card kpi-card-link" role="button" tabIndex={0} title="Ver todos" onClick={() => setFiltros((f) => ({ ...f, servicio: "" }))}>
          <span className="kpi-icono"><Icono nombre="car" size={22} /></span>
          <div className="kpi-label">Vehículos activos</div><div className="kpi-value">{kpis.activos}</div></div>
        <div className="kpi-card kpi-card-link ok" role="button" tabIndex={0} title="Ver los que tienen una orden abierta" style={filtros.servicio === "abierto" ? { outline: "2px solid var(--teal-600)" } : undefined} onClick={() => alternarServicio("abierto")}>
          <span className="kpi-icono"><Icono nombre="clock" size={22} /></span>
          <div className="kpi-label">Con orden abierta</div><div className="kpi-value">{kpis.abiertos}</div></div>
        <div className="kpi-card kpi-card-link alert" role="button" tabIndex={0} title="Ver los vehículos que ya les toca servicio" style={filtros.servicio === "toca" ? { outline: "2px solid var(--red-600)" } : undefined} onClick={() => alternarServicio("toca")}>
          <span className="kpi-icono"><Icono nombre="notifications" size={22} /></span>
          <div className="kpi-label">Próximo servicio</div><div className="kpi-value">{kpis.toca}</div>
          <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{DIAS_PROXIMO}+ días desde su última visita</div></div>
        <div className="kpi-card kpi-card-link" role="button" tabIndex={0} title="Ver los que nunca han tenido servicio" style={filtros.servicio === "sin" ? { outline: "2px solid var(--petrol-500)" } : undefined} onClick={() => alternarServicio("sin")}>
          <span className="kpi-icono"><Icono nombre="calendar" size={22} /></span>
          <div className="kpi-label">Sin servicios aún</div><div className="kpi-value">{kpis.sin}</div></div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Buscar por placa, marca, modelo, cuenta o cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <FiltrosVehiculos resumen={resumen} marcas={marcas} modelos={modelos} colores={colores} filtros={filtros} setFiltros={setFiltros} mostrados={visibles.length} total={total} />
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : vista === "clientes" ? (
          <div className="ordenes-lista">
            {visibles.length === 0 && <div className="empty-state">{(resumen?.total ?? total) ? "Ningún vehículo coincide con los filtros." : "No hay vehículos registrados todavía."}</div>}
            {visibles.map((v) => (
              <div
                key={v.id_vehiculo}
                className={`orden-fila fila-acciones ${v.status_ultimo_servicio === "cancelado" ? "est-cancelado" : v.status_ultimo_servicio === "cerrado" ? "est-cerrado" : ""}`}
                style={{ "--acc": colorGrupo(nomMarcaV(v)) }}
                onClick={() => hasPermission("vehiculos.editar") && setEditing(v)}
              >
                <div className={`cliente-avatar ${v.foto_principal ? "veh-miniatura" : ""}`}>{v.foto_principal ? <img src={v.foto_principal} alt={`Foto de ${nombreMarca(v.id_marca_vehiculo)} ${nombreModelo(v.id_modelo_vehiculo)}`} loading="lazy" /> : <Icono nombre="car" size={22} />}</div>
                <div className="orden-main">
                  <div className="orden-titulo">
                    {nombreMarca(v.id_marca_vehiculo)} {nombreModelo(v.id_modelo_vehiculo)} {v.id_year_vehiculo || ""} <span className="cliente-cuenta">{v.placas_vehiculo || "Sin placas"}</span>
                  </div>
                  <div className="orden-meta">
                    <span><Icono nombre="user" size={15} /> {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}`.trim() : "Sin cliente"}</span>
                    <span><Icono nombre="phone" size={15} /> {v.cliente?.telefono1 || "Sin teléfono"}</span>
                    <span><Icono nombre="chart" size={15} /> {v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : "— km"}</span>
                    <span><Icono nombre="clock" size={15} /> {v.fecha_ultimo_servicio ? `Última visita: ${hace(v.fecha_ultimo_servicio).toLowerCase()}` : "Sin visitas"}</span>
                  </div>
                </div>
                <div className="orden-estado">
                  {v.status_ultimo_servicio ? (
                    <span className={`badge ${STATUS_BADGE[v.status_ultimo_servicio] || "badge-petrol"}`}>
                      {v.status_ultimo_servicio === "abierto" ? (ETIQUETAS_ETAPA[v.etapa_ultimo_servicio] || "Abierto") : v.status_ultimo_servicio === "cerrado" ? "Cerrado" : "Cancelado"}
                    </span>
                  ) : <span className="badge badge-grey">Sin servicios</span>}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="row-actions">
                    <button type="button" className="btn-icono" title="Fotos" aria-label="Fotos" onClick={() => setFotosDe(v)}><Icono nombre="camera" size={18} /></button>
                    {hasPermission("vehiculos.editar") && (
                      <button type="button" className="btn-icono" title="Editar" aria-label="Editar" onClick={() => setEditing(v)}><Icono nombre="pencil" size={18} /></button>
                    )}
                    {hasPermission("vehiculos.eliminar") && (
                      <button type="button" className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(v)}><Icono nombre="trash" size={18} /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {visibles.length < total && (
              <div ref={centinela} style={{ textAlign: "center", padding: 12, gridColumn: "1 / -1" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={cargarMas} disabled={cargandoMas}>{cargandoMas ? "Cargando…" : `Mostrar más (${total - visibles.length} restantes)`}</button>
              </div>
            )}
          </div>
        ) : (
          <div className="veh-cuadros">
            {visibles.length === 0 && <div className="empty-state">{(resumen?.total ?? total) ? "Ningún vehículo coincide con los filtros." : "No hay vehículos registrados todavía."}</div>}
            {visibles.map((v) => (
              <div key={v.id_vehiculo} className="veh-tarjeta" style={{ "--acc": colorGrupo(nomMarcaV(v)) }} onClick={() => hasPermission("vehiculos.editar") && setEditing(v)}>
                <div className="veh-tarjeta-foto" onClick={(e) => { e.stopPropagation(); setFotosDe(v); }} title="Ver / agregar fotos">
                  {v.foto_principal ? (
                    <img loading="lazy" decoding="async" src={v.foto_principal} alt="" />
                  ) : (
                    <div className="veh-tarjeta-foto-vacia">
                      <Icono nombre="camera" size={26} />
                      <span>Agregar foto</span>
                    </div>
                  )}
                  {v.status_ultimo_servicio && (
                    <span className={`badge ${STATUS_BADGE[v.status_ultimo_servicio] || "badge-petrol"} veh-tarjeta-estado`}>
                      {v.status_ultimo_servicio === "abierto" ? (ETIQUETAS_ETAPA[v.etapa_ultimo_servicio] || "Abierto") : v.status_ultimo_servicio === "cerrado" ? "Cerrado" : "Cancelado"}
                    </span>
                  )}
                </div>
                <div className="veh-tarjeta-cuerpo">
                  <div className="veh-tarjeta-titulo">{nombreMarca(v.id_marca_vehiculo)} {nombreModelo(v.id_modelo_vehiculo)} {v.id_year_vehiculo || ""}</div>
                  <div className="veh-tarjeta-meta">
                    <span><Icono nombre="hash" size={14} /> {v.placas_vehiculo || "Sin placas"}</span>
                    <span><Icono nombre="user" size={14} /> {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}` : "Sin cliente"}</span>
                    <span><Icono nombre="chart" size={14} /> {v.km_vehiculo ? `${Number(v.km_vehiculo).toLocaleString("es-MX")} km` : "— km"}</span>
                    <span><Icono nombre="clock" size={14} /> {v.fecha_ultimo_servicio ? `Última visita: ${hace(v.fecha_ultimo_servicio).toLowerCase()}` : "Sin visitas"}</span>
                  </div>
                  <div className="veh-tarjeta-pie">
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-icono" title="Fotos" aria-label="Fotos" onClick={() => setFotosDe(v)}><IconoAuto valor="📷" size={18} /></button>
                      {hasPermission("vehiculos.editar") && (
                        <button className="btn-icono" title="Editar" aria-label="Editar" onClick={() => setEditing(v)}><Icono nombre="pencil" size={18} /></button>
                      )}
                      {hasPermission("vehiculos.eliminar") && (
                        <button className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(v)}><Icono nombre="trash" size={18} /></button>
                      )}
                    </div>
                    <div className="veh-tarjeta-contacto">
                      <span className="veh-tarjeta-contacto-nombre">
                        <Icono nombre="user" size={13} />
                        {v.cliente ? `${v.cliente.nombre_cliente} ${v.cliente.paterno_cliente || ""}`.trim() : "Sin cliente"}
                      </span>
                      <span className="veh-tarjeta-contacto-tel" title={v.cliente?.telefono1 || "Sin teléfono registrado"}>
                        <Icono nombre="phone" size={13} />
                        {v.cliente?.telefono1 || "Sin teléfono"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {visibles.length < total && (
              <div ref={centinela} style={{ textAlign: "center", padding: 12, gridColumn: "1 / -1" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={cargarMas} disabled={cargandoMas}>{cargandoMas ? "Cargando…" : `Mostrar más (${total - visibles.length} restantes)`}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <VehiculoModal
          titulo={editing.id_vehiculo ? `Editar vehículo — ${editing.numero_cuenta || ""}` : "Nuevo vehículo"}
          subtitulo="Propietario e identificación del vehículo."
          inicial={editing}
          clientes={clientes}
          clienteBloqueado={!!editing.id_vehiculo}
          marcas={marcas}
          modelos={modelos}
          colores={colores}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
          extra={editing.id_vehiculo ? (
            <section className="vm-tarjeta">
              <h3><Icono nombre="camera" size={16} />Fotos del vehículo</h3>
              <FotoGaleria entidadTipo="vehiculo" entidadId={editing.id_vehiculo} puedeEditar={hasPermission("vehiculos.editar")} />
            </section>
          ) : null}
        />
      )}

      {fotosDe && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && (setFotosDe(null), loadAll())}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 18 }}>Fotos — {fotosDe.placas_vehiculo || fotosDe.numero_cuenta}</h2>
            <FotoGaleria
              entidadTipo="vehiculo"
              entidadId={fotosDe.id_vehiculo}
              puedeEditar={hasPermission("vehiculos.editar")}
              onCambio={loadAll}
              onFotoAgregada={() => { loadAll(); setFotosDe(null); }}
            />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => { setFotosDe(null); loadAll(); }}>Cerrar</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {ofrecerSiguiente && (
        <MensajeModal
          icono="🔧"
          titulo="Vehículo registrado"
          onCerrar={() => setOfrecerSiguiente(null)}
          primario={{
            texto: "Sí, crear orden",
            onClick: () => navigate(`/servicios?id_cliente=${ofrecerSiguiente.id_cliente}&id_vehiculo=${ofrecerSiguiente.id_vehiculo}&abrir_nuevo=1`),
          }}
          secundario={{ texto: "Ahora no", onClick: () => setOfrecerSiguiente(null) }}
        >
          <p>
            {ofrecerSiguiente.placas_vehiculo ? <>El vehículo <b>{ofrecerSiguiente.placas_vehiculo}</b> quedó registrado.</> : "El vehículo quedó registrado."} ¿Quieres crear su primera orden de servicio ahora?
          </p>
        </MensajeModal>
      )}
    </>
  );
}
