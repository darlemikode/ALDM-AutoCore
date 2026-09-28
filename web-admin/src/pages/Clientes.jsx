import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import ClienteFormModal from "../components/ClienteFormModal";
import ModalPortal from "../components/ModalPortal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";

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
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null = cerrado, {} = crear, {...} = editar
  const [loading, setLoading] = useState(true);
  const [invitacion, setInvitacion] = useState(null); // { cliente, codigo_invitacion }
  const [ofrecerVehiculo, setOfrecerVehiculo] = useState(null); // { id_cliente, nombre_cliente, numero_cuenta } tras crear un cliente

  async function load() {
    setLoading(true);
    const data = await api.get(`/clientes/?${q ? `q=${encodeURIComponent(q)}&` : ""}solo_activos=true`);
    setClientes(data);
    setLoading(false);
  }

  useEffect(() => {
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
      setOfrecerVehiculo(creado);
    }
  }

  async function handleDelete(cliente) {
    const ok = await confirmDialog(`¿Dar de baja a ${cliente.nombre_cliente}? Su historial de servicios se conserva.`, { danger: true });
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

  const activados = clientes.filter((c) => c.cuenta_activada).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🧑 Clientes</h1>
          <div className="subtitle">{clientes.length} cliente(s) activos</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          🧑 Nuevo cliente
        </button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card" style={{ borderLeftColor: "var(--petrol-500)" }}>
          <div className="kpi-label">Clientes activos</div>
          <div className="kpi-value">{clientes.length}</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: "var(--teal-600)" }}>
          <div className="kpi-label">Con app activada</div>
          <div className="kpi-value">{activados}</div>
        </div>
        <div className="kpi-card" style={{ borderLeftColor: "var(--violet-600)" }}>
          <div className="kpi-label">Sin activar</div>
          <div className="kpi-value">{clientes.length - activados}</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="🔍 Buscar por nombre, cuenta, empresa, teléfono o correo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : clientes.length === 0 ? (
          <div className="empty-state">No hay clientes registrados todavía. Crea el primero.</div>
        ) : (
          <div className="clientes-lista">
            {clientes.map((c, i) => (
              <div className="cliente-card" key={c.id_cliente} style={acentoDe(i)}>
                <div className="cliente-avatar">{iniciales(c)}</div>

                <div className="cliente-info">
                  <div className="cliente-nombre">
                    <Link to={`/vehiculos?id_cliente=${c.id_cliente}`}>
                      {c.nombre_cliente} {c.paterno_cliente}
                    </Link>
                    <span className="cliente-cuenta">{c.numero_cuenta}</span>
                    {c.cuenta_activada ? (
                      <span className="badge badge-teal">App activa</span>
                    ) : (
                      <span className="badge badge-grey">Sin activar</span>
                    )}
                  </div>
                </div>

                <div className="cliente-datos">
                  {c.empresa_cliente && <span className="cliente-dato">🏢 {c.empresa_cliente}</span>}
                  {c.telefono1 && <span className="cliente-dato">📞 {c.telefono1}</span>}
                  {c.correo_cliente && <span className="cliente-dato">✉️ {c.correo_cliente}</span>}
                </div>

                <div className="cliente-acciones">
                  {hasPermission("clientes.editar") && !c.cuenta_activada && (
                    <button className="btn btn-secondary btn-sm" onClick={() => invitar(c)}>
                      Invitar a la app
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>
                    Editar
                  </button>
                  {hasPermission("clientes.eliminar") && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
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
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setInvitacion(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ fontSize: 18 }}>Invitación para {invitacion.cliente.nombre_cliente}</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 13 }}>
              Comunícale este código tú mismo (llamada, WhatsApp) junto con el teléfono o correo con el que está
              registrado — lo va a necesitar para activar su cuenta en la app.
            </p>
            <div className="mono" style={{ background: "var(--paper-0)", padding: "12px 16px", borderRadius: 8, fontSize: 22, textAlign: "center", letterSpacing: 3, fontWeight: 700 }}>
              {invitacion.codigo_invitacion}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 8 }}>
              Identificador para activar: <b>{invitacion.telefono1 || invitacion.correo_cliente}</b>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setInvitacion(null)}>Listo</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {ofrecerVehiculo && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOfrecerVehiculo(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ fontSize: 18 }}>Cliente creado 🎉</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 13.5, lineHeight: 1.5 }}>
              {ofrecerVehiculo.nombre_cliente} {ofrecerVehiculo.paterno_cliente} ya está registrado. ¿Quieres darle de alta su vehículo ahora mismo?
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setOfrecerVehiculo(null)}>Ahora no</button>
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/vehiculos?id_cliente=${ofrecerVehiculo.id_cliente}&abrir_nuevo=1`)}
              >
                🚗 Sí, agregar vehículo
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
