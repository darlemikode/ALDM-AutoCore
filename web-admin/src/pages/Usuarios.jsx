import { IconoAuto } from "../components/Icono";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import { useActualizacionGlobal } from "../useActualizacionGlobal";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

const TABS = [
  { key: "usuarios", label: "Usuarios" },
  { key: "clientes", label: "Clientes" },
];

export default function Usuarios() {
  const { confirmDialog, notify } = useUI();
  const { user: usuarioActual, hasPermission } = useAuth();
  const [tab, setTab] = useState("usuarios");

  // --- Usuarios ---
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [editing, setEditing] = useState(null); // null=cerrado, {}=crear, {...}=editar
  const [loading, setLoading] = useState(true);
  const [tempPassword, setTempPassword] = useState(null); // { username, password_temporal }

  // --- Clientes (acceso a la app) ---
  const [clientes, setClientes] = useState([]);
  const [qClientes, setQClientes] = useState("");
  const [cargandoClientes, setCargandoClientes] = useState(true);
  const [accesoCliente, setAccesoCliente] = useState(null); // { nombre, identificador, password_temporal }

  async function load() {
    try {
      const [u, r, s, e] = await Promise.all([
        api.get("/auth/usuarios"),
        api.get("/auth/roles"),
        hasPermission("usuarios.ver") ? api.get("/auth/solicitudes-recuperacion?solo_pendientes=true") : Promise.resolve([]),
        api.get("/empleados/").catch(() => []),
      ]);
      setUsuarios(u);
      setRoles(r);
      setSolicitudes(s);
      setEmpleados(e);
    } catch (err) {
      notify(`No se pudo cargar: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadClientes(q) {
    setCargandoClientes(true);
    try {
      const data = await api.get(`/clientes/?solo_activos=true${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setClientes(data);
    } catch (err) {
      notify(`No se pudo cargar clientes: ${err.message}`, "error");
    } finally {
      setCargandoClientes(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => loadClientes(qClientes), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qClientes]);

  useActualizacionGlobal("usuarios", load);
  useActualizacionGlobal("clientes", () => loadClientes(qClientes));

  // Empleados que se pueden ofrecer para ligar: los que no tienen cuenta
  // todavía, más el que ya está ligado al usuario que se está editando
  // (para que no desaparezca de la lista mientras se edita).
  const empleadosDisponibles = empleados.filter(
    (e) => !e.id_usuario || e.id_usuario === editing?.id_usuario
  );

  const fields = [
    { name: "username", label: "Usuario (para iniciar sesión)", required: true, grupo: "cuenta" },
    { name: "password", label: "Contraseña", type: "password", required: true, grupo: "cuenta" },
    { name: "nombre_completo", label: "Nombre completo", required: true, full: true, grupo: "cuenta" },
    {
      name: "id_rol", label: "Rol", type: "select", required: true, grupo: "cuenta",
      options: roles.map((r) => ({ value: r.id_rol, label: r.nombre })),
    },
    {
      name: "id_empleado", label: "Empleado vinculado (opcional)", type: "select", grupo: "cuenta",
      options: [{ value: "", label: "Ninguno" }].concat(
        empleadosDisponibles.map((e) => ({ value: e.id_empleado, label: `${e.nombre} ${e.paterno || ""}`.trim() }))
      ),
    },
    { name: "correo", label: "Correo (para recuperar acceso)", grupo: "recuperacion" },
    { name: "telefono", label: "Teléfono (para recuperar acceso)", grupo: "recuperacion" },
  ];

  const gruposUsuario = {
    cuenta: { icono: "🔑", titulo: "Cuenta y rol" },
    recuperacion: { icono: "📱", titulo: "Recuperación de acceso", acento: "acento-ambar" },
  };

  // Al editar no se cambia la contraseña desde aquí (eso es autoservicio de
  // cada quien, o vía "Generar contraseña temporal" en una solicitud).
  const fieldsEditar = fields.filter((f) => f.name !== "password");

  // El vínculo usuario↔empleado vive del lado del empleado (id_usuario),
  // así que guardar el usuario no basta — hay que reflejarlo ahí también:
  // se desliga al empleado que tenía la cuenta antes (si cambió) y se liga
  // al elegido ahora. PUT /empleados/{id} espera el objeto completo, no
  // solo el campo que cambia.
  async function sincronizarVinculoEmpleado(idUsuarioResultante, idEmpleadoElegido) {
    const idElegido = idEmpleadoElegido ? Number(idEmpleadoElegido) : null;
    const ligadoAntes = empleados.find((e) => e.id_usuario === idUsuarioResultante);
    if (ligadoAntes && ligadoAntes.id_empleado !== idElegido) {
      await api.put(`/empleados/${ligadoAntes.id_empleado}`, { ...ligadoAntes, id_usuario: null });
    }
    if (idElegido && idElegido !== ligadoAntes?.id_empleado) {
      const nuevo = empleados.find((e) => e.id_empleado === idElegido);
      if (nuevo) await api.put(`/empleados/${idElegido}`, { ...nuevo, id_usuario: idUsuarioResultante });
    }
  }

  async function handleSave(values) {
    const { id_empleado, ...datosUsuario } = values;
    let idUsuarioResultante;
    if (editing?.id_usuario) {
      await api.put(`/auth/usuarios/${editing.id_usuario}`, datosUsuario);
      idUsuarioResultante = editing.id_usuario;
      notify("Usuario actualizado.", "success");
    } else {
      const creado = await api.post("/auth/usuarios", datosUsuario);
      idUsuarioResultante = creado.id_usuario;
      notify("Usuario creado.", "success");
    }
    await sincronizarVinculoEmpleado(idUsuarioResultante, id_empleado);
    setEditing(null);
    load();
  }

  async function handleDesactivar(u) {
    const ok = await confirmDialog(`¿Desactivar a "${u.nombre_completo}"? Ya no podrá iniciar sesión.`, { danger: true });
    if (!ok) return;
    try {
      await api.put(`/auth/usuarios/${u.id_usuario}/desactivar`);
      load();
      notify("Usuario desactivado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function resolverSolicitud(s) {
    const ok = await confirmDialog(
      `Se generará una contraseña temporal para "${s.usuario?.nombre_completo}". Tendrás que comunicársela tú (llamada, WhatsApp, en persona) — el sistema no envía correos/SMS automáticos.`,
      { title: "Generar contraseña temporal" }
    );
    if (!ok) return;
    try {
      const res = await api.post(`/auth/solicitudes-recuperacion/${s.id_solicitud}/resolver`);
      setTempPassword(res);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function generarAccesoCliente(cliente) {
    const ok = await confirmDialog(
      cliente.cuenta_activada
        ? `"${cliente.nombre_cliente}" ya puede entrar a la app. ¿Generar una contraseña temporal nueva? La anterior deja de servir.`
        : `Se creará un usuario (su teléfono o correo) y una contraseña temporal para que "${cliente.nombre_cliente}" entre a la app de clientes.`,
      { title: cliente.cuenta_activada ? "Restablecer acceso" : "Generar acceso a la app", danger: cliente.cuenta_activada }
    );
    if (!ok) return;
    try {
      const res = await api.post(`/clientes/${cliente.id_cliente}/generar-acceso`);
      setAccesoCliente({ nombre: cliente.nombre_cliente, ...res });
      loadClientes(qClientes);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <Link className="icon-btn" to="/configuracion" title="Volver a Configuración">←</Link>
          <div>
            <h1><IconoModulo ruta="/usuarios" /> Usuarios</h1>
            <div className="subtitle">
              Cuentas de acceso al panel, la app del taller y la app de clientes ·{" "}
              <Link to="/roles">ver roles y permisos →</Link>
            </div>
          </div>
        </div>
        {tab === "usuarios" && hasPermission("usuarios.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({})}><span className="btn-nuevo-icono"><Icono nombre="person-circle" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo usuario</button>
        )}
      </div>

      <div className="sa-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`sa-tab ${tab === t.key ? "sa-tab-activo" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "usuarios" && (
        <>
          {solicitudes.length > 0 && (
            <div className="panel" style={{ borderLeft: "4px solid var(--red-600)" }}>
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>
                <IconoAuto valor="🔔" size={18} /> {solicitudes.length} solicitud{solicitudes.length > 1 ? "es" : ""} de recuperación de acceso
              </h2>
              <table>
                <thead>
                  <tr><th>Usuario</th><th>Escribió</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {solicitudes.map((s) => (
                    <tr key={s.id_solicitud}>
                      <td>{s.usuario?.nombre_completo || "—"} ({s.usuario?.username})</td>
                      <td className="mono">{s.identificador_usado}</td>
                      <td>{new Date(s.fecha_solicitud).toLocaleString("es-MX")}</td>
                      <td><button className="btn btn-primary btn-sm" onClick={() => resolverSolicitud(s)}>Generar contraseña temporal</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            {loading ? (
              <div className="loading-text">Cargando…</div>
            ) : (
              <DataTable
                columns={[
                  { key: "username", label: "Usuario" },
                  { key: "nombre_completo", label: "Nombre" },
                  { key: "contacto", label: "Contacto", render: (u) => u.correo || u.telefono || "—" },
                  {
                    key: "empleado", label: "Empleado",
                    render: (u) => {
                      const e = empleados.find((emp) => emp.id_usuario === u.id_usuario);
                      return e ? `${e.nombre} ${e.paterno || ""}`.trim() : "—";
                    },
                  },
                  { key: "rol", label: "Rol", render: (u) => <span className="role-badge">{u.rol?.nombre}</span> },
                  { key: "activo", label: "Estado", render: (u) => (u.activo ? "Activo" : "Inactivo") },
                ]}
                rows={usuarios}
                onEdit={hasPermission("usuarios.editar") ? (u) => setEditing({ ...u, id_rol: u.rol?.id_rol, id_empleado: empleados.find((e) => e.id_usuario === u.id_usuario)?.id_empleado || "" }) : undefined}
                onDelete={hasPermission("usuarios.eliminar") ? (u) => (u.activo && u.id_usuario !== usuarioActual?.id_usuario ? handleDesactivar(u) : null) : undefined}
                emptyMessage="No hay usuarios registrados."
              />
            )}
          </div>
        </>
      )}

      {tab === "clientes" && (
        <div className="panel">
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Buscar por nombre, teléfono o correo…"
              value={qClientes}
              onChange={(e) => setQClientes(e.target.value)}
            />
            <Link className="btn btn-secondary" to="/clientes">Administrar clientes →</Link>
          </div>
          <p style={{ color: "var(--ink-500)", fontSize: 13, margin: "0 0 12px" }}>
            Aquí solo se administra el usuario y la contraseña temporal con los que cada cliente entra a su app.
            Para editar sus datos o vehículos, usa "Administrar clientes".
          </p>
          {cargandoClientes ? (
            <div className="loading-text">Cargando…</div>
          ) : (
            <DataTable
              columns={[
                { key: "nombre_cliente", label: "Cliente", render: (c) => `${c.nombre_cliente} ${c.paterno_cliente || ""}`.trim() },
                { key: "identificador", label: "Usuario de la app", render: (c) => c.telefono1 || c.correo_cliente || "—" },
                {
                  key: "cuenta_activada", label: "Estado",
                  render: (c) => (c.cuenta_activada ? <span className="badge badge-teal">Con acceso a la app</span> : <span className="badge badge-grey">Sin acceso a la app</span>),
                },
              ]}
              rows={clientes}
              extraActions={hasPermission("clientes.editar") ? (c) => (
                <button className="btn btn-secondary btn-sm" onClick={() => generarAccesoCliente(c)}>
                  {c.cuenta_activada ? "Restablecer acceso" : "Generar acceso"}
                </button>
              ) : undefined}
              emptyMessage="No hay clientes activos todavía."
            />
          )}
        </div>
      )}

      {editing && (
        <FormModal
          title={editing.id_usuario ? `Editar usuario — ${editing.username}` : "Nuevo usuario"}
          icono="👤"
          subtitulo="Cuenta de acceso y datos de recuperación."
          fields={editing.id_usuario ? fieldsEditar : fields}
          grupos={gruposUsuario}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {tempPassword && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setTempPassword(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ fontSize: 19 }}>Contraseña temporal</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 14 }}>
              Para <b>{tempPassword.username}</b>. Comunícasela tú mismo — no se envió por ningún medio automático.
              Pídele que la cambie en cuanto entre (sidebar → "Cambiar contraseña").
            </p>
            <div className="mono" style={{ background: "var(--paper-0)", padding: "12px 16px", borderRadius: 8, fontSize: 18, textAlign: "center", letterSpacing: 1 }}>
              {tempPassword.password_temporal}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setTempPassword(null)}>Listo</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {accesoCliente && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAccesoCliente(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ fontSize: 19 }}>Acceso listo</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 14 }}>
              Para <b>{accesoCliente.nombre}</b>. Compártesela tú mismo — no se envió por ningún medio automático.
              Puede cambiarla luego desde su app.
            </p>
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Usuario</div>
              <div className="mono" style={{ background: "var(--paper-0)", padding: "10px 14px", borderRadius: 8, fontSize: 15 }}>{accesoCliente.identificador}</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 6 }}>Contraseña temporal</div>
              <div className="mono" style={{ background: "var(--paper-0)", padding: "12px 16px", borderRadius: 8, fontSize: 18, textAlign: "center", letterSpacing: 1 }}>
                {accesoCliente.password_temporal}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setAccesoCliente(null)}>Listo</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
