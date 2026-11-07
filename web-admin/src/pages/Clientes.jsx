import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import ClienteFormModal from "../components/ClienteFormModal";
import MensajeModal from "../components/MensajeModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

// Mismo ciclo de acentos que Roles y permisos, para que el avatar de cada
// cliente tenga color propio sin salirse de la paleta de la app.
const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)`, "--acc-soft": `var(--${c}-100)` };
}

function iniciales(cliente) {
  const a = (cliente.nombre_cliente || "").trim()[0] || "";
  const b = (cliente.paterno_cliente || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

export default function Clientes() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null = cerrado, {} = crear, {...} = editar
  const [loading, setLoading] = useState(true);
  const [totales, setTotales] = useState({ total: 0, activados: 0 });
  const [cargandoMas, setCargandoMas] = useState(false);
  const PAGINA = 30; // la lista se trae por bloques de 30 al ir bajando
  const centinela = useRef(null);
  const cuantos = useRef(0);
  // Desde el Panel: /clientes?abrir_nuevo=1 abre directo el alta de cliente
  useEffect(() => {
    if (params.get("abrir_nuevo") === "1" && hasPermission("clientes.crear")) {
      setEditing({});
      const p = new URLSearchParams(params);
      p.delete("abrir_nuevo");
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [invitacion, setInvitacion] = useState(null); // { cliente, codigo_invitacion }
  const [ofrecerVehiculo, setOfrecerVehiculo] = useState(null); // { id_cliente, nombre_cliente, numero_cuenta } tras crear un cliente

  // La suscripción a actualizaciones en vivo conserva la primera versión de load(): la búsqueda vigente se lee de un ref
  const qRef = useRef("");
  const peticion = useRef(0); // descarta respuestas viejas si se sigue escribiendo
  const filtro = () => `${qRef.current ? `q=${encodeURIComponent(qRef.current)}&` : ""}solo_activos=true`;
  // Recarga lo que ya se había mostrado (mínimo un bloque) y los totales
  async function load() {
    const limite = Math.min(2000, Math.max(PAGINA, cuantos.current));
    const mia = ++peticion.current;
    const [data, tot] = await Promise.all([
      api.get(`/clientes/?${filtro()}&limite=${limite}`),
      api.get(`/clientes/conteo?${filtro()}`),
    ]);
    if (mia !== peticion.current) return;
    cuantos.current = data.length;
    setClientes(data);
    setTotales(tot);
    setLoading(false);
  }
  async function cargarMas() {
    if (cargandoMas || clientes.length >= totales.total) return;
    setCargandoMas(true);
    try {
      const mas = await api.get(`/clientes/?${filtro()}&limite=${PAGINA}&offset=${clientes.length}`);
      cuantos.current = clientes.length + mas.length;
      setClientes((prev) => [...prev, ...mas.filter((m) => !prev.some((p) => p.id_cliente === m.id_cliente))]);
    } finally { setCargandoMas(false); }
  }
  useEffect(() => {
    const el = centinela.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) cargarMas(); }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    qRef.current = q.trim();
    cuantos.current = 0; // al cambiar la búsqueda se vuelve al primer bloque
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useActualizacionGlobal("clientes", load);

  async function handleSave(values) {
    const esNuevo = !editing?.id_cliente;
    let creado = null;
    if (editing?.id_cliente) {
      await api.put(`/clientes/${editing.id_cliente}`, values);
      notify("Cliente actualizado.", "success");
    } else {
      creado = await api.post("/clientes/", values);
      notify(`Cliente creado con cuenta ${creado.numero_cuenta}.`, "success");
    }
    setEditing(null);
    load();
    // Al dar de alta un cliente nuevo (no al editar uno existente), se le
    // ofrece registrar de una vez su vehículo — rara vez se da de alta un
    // cliente sin un auto que traer al taller.
    if (esNuevo && creado) {
      if (hasPermission("vehiculos.crear")) setOfrecerVehiculo(creado);
    }
  }

  async function handleDelete(cliente) {
    const ok = await confirmDialog(`¿Dar de baja a ${cliente.nombre_cliente}? Su historial de servicios se conserva.`, { danger: true, confirmar: "Sí, dar de baja" });
    if (!ok) return;
    try {
      await api.del(`/clientes/${cliente.id_cliente}`);
      load();
      notify("Cliente dado de baja.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function invitar(cliente) {
    try {
      const res = await api.post(`/clientes/${cliente.id_cliente}/invitar`);
      setInvitacion({ cliente, ...res });
    } catch (err) {
      notify(err.message, "error");
    }
  }

  // Abre una orden ya con este cliente; falta elegir su vehículo en la ventana de la orden
  // Icono de vehículos: si el cliente no tiene ninguno se abre directo el alta; si ya tiene, se muestran solo los suyos
  async function irAVehiculos(c) {
    try {
      const lista = await api.get(`/vehiculos/?id_cliente=${c.id_cliente}`);
      const sinVehiculos = !lista || lista.length === 0;
      navigate(`/vehiculos?id_cliente=${c.id_cliente}${sinVehiculos && hasPermission("vehiculos.crear") ? "&abrir_nuevo=1" : ""}`);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  // La orden NO se crea aquí: se abre el selector de cliente/vehículo y se crea hasta confirmar.
  function nuevaOrdenDe(cliente) {
    navigate(`/servicios?nueva=1&cliente=${cliente.id_cliente}`);
  }

  const activados = totales.activados;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/clientes" /> Clientes</h1>
          <div className="subtitle">{totales.total} cliente(s) activos</div>
        </div>
        {hasPermission("clientes.crear") && (
        <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({})}>
          <span className="btn-nuevo-icono"><Icono nombre="people" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo cliente</button>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><span className="kpi-icono"><Icono nombre="people" size={22} /></span>
          <div className="kpi-label">Clientes activos</div><div className="kpi-value">{totales.total}</div></div>
        <div className="kpi-card ok"><span className="kpi-icono"><Icono nombre="sparkles" size={22} /></span>
          <div className="kpi-label">Con app activada</div><div className="kpi-value">{activados}</div></div>
        <div className="kpi-card alert"><span className="kpi-icono"><Icono nombre="notifications" size={22} /></span>
          <div className="kpi-label">Sin activar</div><div className="kpi-value">{totales.total - activados}</div></div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Buscar por nombre, cuenta, empresa, teléfono o correo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : clientes.length === 0 ? (
          <div className="empty-state">No hay clientes registrados todavía. Crea el primero.</div>
        ) : (
          <div className="ordenes-lista">
            {clientes.map((c) => {
              const tel = String(c.telefono1 || "").replace(/\D/g, "").slice(-10);
              return (
                <div key={c.id_cliente} className={`orden-fila fila-acciones fila-cliente ${c.cuenta_activada ? "" : "est-cerrado"}`} onClick={() => (hasPermission("clientes.editar") ? setEditing(c) : navigate(`/vehiculos?id_cliente=${c.id_cliente}`))} style={{ cursor: "pointer" }}>
                  <div className="cliente-avatar">{iniciales(c)}</div>
                  <div className="orden-main">
                    <div className="orden-titulo">{c.nombre_cliente} {c.paterno_cliente}</div>
                    <div className="orden-meta"><span className="cliente-cuenta">{c.numero_cuenta}</span></div>
                  </div>
                  <div className="cliente-contacto">
                    <div><Icono nombre="phone" size={16} /><span>Teléfono</span><b>{c.telefono1 || "—"}</b></div>
                    <div><Icono nombre="mail" size={16} /><span>Correo</span><b>{c.correo_cliente || "—"}</b></div>
                    <div><Icono nombre="business" size={16} /><span>Empresa</span><b>{c.empresa_cliente || "—"}</b></div>
                  </div>
                  <div className="orden-estado">{c.cuenta_activada ? <span className="badge badge-teal">App activa</span> : <span className="badge badge-grey">Sin activar</span>}</div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                <button type="button" className="btn-icono btn-icono-veh" title="Vehículos" aria-label="Vehículos" onClick={() => irAVehiculos(c)}><Icono nombre="car" size={20} /></button>
                {hasPermission("servicios.crear") && (
                  <button type="button" className="btn-icono btn-icono-fuerte" title="Nueva orden" aria-label="Nueva orden" onClick={() => nuevaOrdenDe(c)}><Icono nombre="doc-add" size={20} /></button>
                )}
                {tel.length === 10 ? (
                  <a className="btn-icono btn-icono-wa" href={`https://wa.me/52${tel}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp"><Icono nombre="whatsapp" size={20} /></a>
                ) : <span className="btn-icono-hueco" />}
                {hasPermission("clientes.editar") && (!c.cuenta_activada ? (
                  <button type="button" className="btn-icono" title="Invitar a la app" aria-label="Invitar a la app" onClick={() => invitar(c)}><Icono nombre="link" size={18} /></button>
                ) : <span className="btn-icono-hueco" />)}
                {hasPermission("clientes.editar") && (
                  <button type="button" className="btn-icono" title="Editar" aria-label="Editar" onClick={() => setEditing(c)}><Icono nombre="pencil" size={18} /></button>
                )}
                {hasPermission("clientes.eliminar") && (
                  <button type="button" className="btn-icono btn-icono-peligro" title="Eliminar" aria-label="Eliminar" onClick={() => handleDelete(c)}><Icono nombre="trash" size={18} /></button>
                )}
              </div>
                  </div>
                </div>
              );
            })}
            <div ref={centinela} style={{ textAlign: "center", padding: 10, fontSize: 12, opacity: .65 }}>
              {clientes.length < totales.total ? (cargandoMas ? "Cargando más…" : <button type="button" className="btn btn-secondary btn-sm" onClick={cargarMas}>Mostrar más ({totales.total - clientes.length} restantes)</button>) : ""}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <ClienteFormModal
          title={editing.id_cliente ? `Editar cliente — ${editing.numero_cuenta || ""}` : "Nuevo cliente"}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {invitacion && (
        <MensajeModal
          icono="🔑"
          titulo={`Invitación para ${invitacion.cliente.nombre_cliente}`}
          onCerrar={() => setInvitacion(null)}
          primario={{ texto: "Listo", onClick: () => setInvitacion(null) }}
        >
          <p>
            Comunícale este código tú mismo (llamada, WhatsApp) junto con el teléfono o correo con el que está
            registrado — lo va a necesitar para activar su cuenta en la app.
          </p>
          <div className="mono" style={{ background: "var(--paper-0)", padding: "12px 16px", borderRadius: 8, fontSize: 22, textAlign: "center", letterSpacing: 3, fontWeight: 700 }}>
            {invitacion.codigo_invitacion}
          </div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            Identificador para activar: <b>{invitacion.telefono1 || invitacion.correo_cliente}</b>
          </div>
        </MensajeModal>
      )}

      {ofrecerVehiculo && (
        <MensajeModal
          icono="🚗"
          titulo="Cliente creado"
          onCerrar={() => setOfrecerVehiculo(null)}
          primario={{
            texto: "Sí, agregar vehículo",
            onClick: () => navigate(`/vehiculos?id_cliente=${ofrecerVehiculo.id_cliente}&abrir_nuevo=1`),
          }}
          secundario={{ texto: "Ahora no", onClick: () => setOfrecerVehiculo(null) }}
        >
          <p>{ofrecerVehiculo.nombre_cliente} {ofrecerVehiculo.paterno_cliente} quedó registrado en tu taller. ¿Quieres dar de alta su vehículo ahora?</p>
        </MensajeModal>
      )}
    </>
  );
}
