import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";

/**
 * Panel de Super Administración — exclusivo para usuarios con
 * es_superadmin=True. No administra datos operativos de un taller
 * (eso ya lo hace el resto de la app); administra el negocio SaaS de ALDM
 * AutoCore: qué talleres/refaccionarias son clientes, qué paquete tienen
 * contratado, qué módulos incluye cada paquete y el estado de su
 * suscripción.
 */

const COLORES = ["petrol", "teal", "warn", "violet", "blue"];
function acentoDe(indice) {
  const c = COLORES[indice % COLORES.length];
  return { "--acc": `var(--${c}-600)`, "--acc-soft": `var(--${c}-100)` };
}

const ICONO_MODULO = {
  ordenes_servicio: "🔧", inventario: "📦", clientes_vehiculos: "🧑", proveedores: "🚚",
  nomina: "👷", roles_permisos: "🛡️", reportes: "📊", app_movil: "📱",
};

const ESTADO_BADGE = {
  activa: "badge-teal", prueba: "badge-blue", vencida: "badge-amber", cancelada: "badge-red",
};

const TIPO_NEGOCIO_LABEL = { taller: "Taller", refaccionaria: "Refaccionaria", ambos: "Taller y refaccionaria" };

function fmtMoneda(n) {
  return (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function suscripcionVigente(taller) {
  return (taller.suscripciones || []).find((s) => s.estado === "activa" || s.estado === "prueba");
}

const TABS = [
  { key: "talleres", label: "🏢 Talleres" },
  { key: "paquetes", label: "📦 Paquetes y módulos" },
  { key: "suscripciones", label: "🧾 Suscripciones" },
];

export default function SuperAdmin() {
  const { notify, confirmDialog } = useUI();
  const [tab, setTab] = useState("talleres");
  const [resumen, setResumen] = useState(null);
  const [talleres, setTalleres] = useState([]);
  const [paquetes, setPaquetes] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [suscripciones, setSuscripciones] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [r, t, p, m, s] = await Promise.all([
      api.get("/superadmin/resumen"),
      api.get("/superadmin/talleres"),
      api.get("/superadmin/paquetes"),
      api.get("/superadmin/modulos"),
      api.get("/superadmin/suscripciones"),
    ]);
    setResumen(r);
    setTalleres(t);
    setPaquetes(p);
    setModulos(m);
    setSuscripciones(s);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading-text">Cargando…</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🚀 Super Administración</h1>
          <div className="subtitle">Talleres clientes de ALDM AutoCore, paquetes de suscripción y qué módulos incluye cada uno</div>
        </div>
      </div>

      {resumen && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card">
            <div className="kpi-label">Talleres activos</div>
            <div className="kpi-value">{resumen.talleres_activos} <span style={{ fontSize: 14, color: "var(--ink-400)" }}>/ {resumen.total_talleres}</span></div>
          </div>
          <div className="kpi-card ok">
            <div className="kpi-label">Ingreso mensual estimado</div>
            <div className="kpi-value">{fmtMoneda(resumen.ingreso_mensual_estimado)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Suscripciones activas</div>
            <div className="kpi-value">{resumen.suscripciones_activas}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">En prueba</div>
            <div className="kpi-value">{resumen.suscripciones_prueba}</div>
          </div>
          <div className={`kpi-card ${resumen.suscripciones_por_vencer > 0 ? "alert" : "ok"}`}>
            <div className="kpi-label">Por vencer (30 días)</div>
            <div className="kpi-value">{resumen.suscripciones_por_vencer}</div>
          </div>
        </div>
      )}

      <div className="sa-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`sa-tab ${tab === t.key ? "sa-tab-activo" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "talleres" && (
        <TabTalleres talleres={talleres} paquetes={paquetes} notify={notify} confirmDialog={confirmDialog} reload={load} />
      )}
      {tab === "paquetes" && (
        <TabPaquetes paquetes={paquetes} modulos={modulos} notify={notify} confirmDialog={confirmDialog} reload={load} />
      )}
      {tab === "suscripciones" && (
        <TabSuscripciones suscripciones={suscripciones} talleres={talleres} paquetes={paquetes} notify={notify} confirmDialog={confirmDialog} reload={load} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Talleres
// ---------------------------------------------------------------------------
function TabTalleres({ talleres, paquetes, notify, confirmDialog, reload }) {
  const [editing, setEditing] = useState(null);

  const fields = [
    { name: "nombre_comercial", label: "Nombre comercial", required: true, full: true },
    { name: "razon_social", label: "Razón social" },
    {
      name: "tipo_negocio", label: "Tipo de negocio", type: "select", required: true,
      options: [{ value: "taller", label: "Taller" }, { value: "refaccionaria", label: "Refaccionaria" }, { value: "ambos", label: "Taller y refaccionaria" }],
    },
    { name: "contacto_nombre", label: "Nombre de contacto" },
    { name: "correo", label: "Correo" },
    { name: "telefono", label: "Teléfono" },
    { name: "ciudad", label: "Ciudad" },
    { name: "estado_mx", label: "Estado" },
    { name: "notas", label: "Notas", type: "textarea", full: true },
  ];

  async function handleSave(values) {
    try {
      if (editing?.id_taller) {
        await api.put(`/superadmin/talleres/${editing.id_taller}`, values);
        notify("Taller actualizado.", "success");
      } else {
        await api.post("/superadmin/talleres", values);
        notify("Taller creado.", "success");
      }
      setEditing(null);
      reload();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleDelete(t) {
    const ok = await confirmDialog(`¿Eliminar "${t.nombre_comercial}"? Solo es posible si no tiene historial de suscripciones.`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/superadmin/talleres/${t.id_taller}`);
      notify("Taller eliminado.", "success");
      reload();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <div className="panel">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="subtitle">{talleres.length} taller{talleres.length === 1 ? "" : "es"} registrado{talleres.length === 1 ? "" : "s"}</div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>➕ Nuevo taller</button>
      </div>
      <DataTable
        columns={[
          { key: "nombre_comercial", label: "Taller", render: (t) => (
            <>
              <div style={{ fontWeight: 700 }}>{t.nombre_comercial}</div>
              <div className="rol-card-meta">{TIPO_NEGOCIO_LABEL[t.tipo_negocio] || t.tipo_negocio}</div>
            </>
          ) },
          { key: "contacto", label: "Contacto", render: (t) => (
            <>
              <div>{t.contacto_nombre || "—"}</div>
              <div className="rol-card-meta">{t.correo || t.telefono || "—"}</div>
            </>
          ) },
          { key: "ubicacion", label: "Ubicación", render: (t) => [t.ciudad, t.estado_mx].filter(Boolean).join(", ") || "—" },
          { key: "plan", label: "Plan actual", render: (t) => {
            const s = suscripcionVigente(t);
            return s ? (
              <>
                <span className={`badge ${ESTADO_BADGE[s.estado] || "badge-grey"}`}>{s.estado}</span>{" "}
                <span>{s.paquete?.nombre}</span>
              </>
            ) : <span className="badge badge-grey">Sin suscripción</span>;
          } },
          { key: "activo", label: "Estado", render: (t) => (t.activo ? "Activo" : "Inactivo") },
        ]}
        rows={talleres}
        onEdit={(t) => setEditing(t)}
        onDelete={handleDelete}
        emptyMessage="No hay talleres registrados todavía."
      />

      {editing && (
        <FormModal
          title={editing.id_taller ? `Editar taller — ${editing.nombre_comercial}` : "Nuevo taller"}
          icono="🏢"
          subtitulo="Datos del negocio cliente de ALDM AutoCore."
          fields={fields}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paquetes y módulos — mismo patrón maestro/detalle que Roles.jsx
// ---------------------------------------------------------------------------
function TabPaquetes({ paquetes, modulos, notify, confirmDialog, reload }) {
  const [seleccionado, setSeleccionado] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!seleccionado && !creando && paquetes.length > 0) seleccionar(paquetes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paquetes]);

  function seleccionar(p) {
    setCreando(false);
    setSeleccionado(p.id_paquete);
    setBorrador({
      nombre: p.nombre, descripcion: p.descripcion || "", precio_mensual: p.precio_mensual,
      ciclo_facturacion: p.ciclo_facturacion, activo: p.activo, limite_usuarios: p.limite_usuarios ?? "",
      modulos: p.modulos.map((m) => m.clave),
    });
  }

  function iniciarNuevo() {
    setCreando(true);
    setSeleccionado(null);
    setBorrador({ nombre: "", descripcion: "", precio_mensual: 0, ciclo_facturacion: "mensual", activo: true, limite_usuarios: "", modulos: [] });
  }

  function alternarModulo(clave) {
    setBorrador((b) => ({
      ...b,
      modulos: b.modulos.includes(clave) ? b.modulos.filter((c) => c !== clave) : [...b.modulos, clave],
    }));
  }

  async function guardar() {
    if (!borrador.nombre.trim()) {
      notify("Ponle un nombre al paquete.", "error");
      return;
    }
    const payload = { ...borrador, limite_usuarios: borrador.limite_usuarios === "" ? null : Number(borrador.limite_usuarios) };
    try {
      if (creando) {
        const nuevo = await api.post("/superadmin/paquetes", payload);
        notify(`Paquete "${nuevo.nombre}" creado.`, "success");
        await reload();
        setCreando(false);
        setSeleccionado(nuevo.id_paquete);
      } else {
        await api.put(`/superadmin/paquetes/${seleccionado}`, payload);
        notify("Paquete actualizado.", "success");
        await reload();
      }
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function eliminar() {
    const p = paquetes.find((x) => x.id_paquete === seleccionado);
    if (!p) return;
    const ok = await confirmDialog(`¿Eliminar el paquete "${p.nombre}"? Solo es posible si ningún taller está suscrito a él.`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/superadmin/paquetes/${seleccionado}`);
      notify("Paquete eliminado.", "success");
      setSeleccionado(null);
      await reload();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const paqueteActual = paquetes.find((p) => p.id_paquete === seleccionado);

  return (
    <div className="roles-layout">
      <div>
        <div className="roles-lista">
          {paquetes.map((p, i) => (
            <button
              type="button"
              key={p.id_paquete}
              onClick={() => seleccionar(p)}
              className={`rol-card ${seleccionado === p.id_paquete && !creando ? "activo" : ""}`}
              style={acentoDe(i)}
            >
              <span className="rol-card-icono">📦</span>
              <span className="rol-card-info">
                <span className="rol-card-nombre">
                  {p.nombre}
                  {!p.activo && <span className="badge badge-grey">Inactivo</span>}
                </span>
                <span className="rol-card-meta">{fmtMoneda(p.precio_mensual)}/mes · {p.modulos.length} módulo{p.modulos.length === 1 ? "" : "s"}</span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn-nuevo-rol" onClick={iniciarNuevo}>➕ Crear paquete nuevo</button>
      </div>

      <div className="panel">
        {(paqueteActual || creando) ? (
          <>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div className="field">
                <label>Nombre del paquete</label>
                <input value={borrador.nombre} onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))} />
              </div>
              <div className="field">
                <label>Precio mensual (MXN)</label>
                <input type="number" value={borrador.precio_mensual} onChange={(e) => setBorrador((b) => ({ ...b, precio_mensual: e.target.value === "" ? "" : Number(e.target.value) }))} />
              </div>
              <div className="field">
                <label>Ciclo de facturación</label>
                <select value={borrador.ciclo_facturacion} onChange={(e) => setBorrador((b) => ({ ...b, ciclo_facturacion: e.target.value }))}>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
              <div className="field">
                <label>Límite de usuarios (vacío = sin límite)</label>
                <input type="number" value={borrador.limite_usuarios} onChange={(e) => setBorrador((b) => ({ ...b, limite_usuarios: e.target.value }))} />
              </div>
              <div className="field full">
                <label>Descripción</label>
                <input value={borrador.descripcion} onChange={(e) => setBorrador((b) => ({ ...b, descripcion: e.target.value }))} />
              </div>
              <div className="field full">
                <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={borrador.activo} onChange={(e) => setBorrador((b) => ({ ...b, activo: e.target.checked }))} />
                  Paquete activo (visible para nuevas suscripciones)
                </label>
              </div>
            </div>

            <div className="modulo-card" style={acentoDe(1)}>
              <div className="modulo-card-header">
                <span className="modulo-card-icono">🧩</span>
                <span className="modulo-card-titulo">Módulos incluidos</span>
                <span className="modulo-card-contador">{borrador.modulos.length}/{modulos.length}</span>
              </div>
              <div className="modulo-card-body">
                {modulos.map((m) => {
                  const activo = borrador.modulos.includes(m.clave);
                  return (
                    <label key={m.clave} className={`permiso-toggle ${activo ? "permiso-toggle-on" : ""}`}>
                      <input type="checkbox" checked={activo} onChange={() => alternarModulo(m.clave)} />
                      <span className="permiso-toggle-punto" />
                      {ICONO_MODULO[m.clave] || m.icono || "🔹"} {m.nombre}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 20 }}>
              <button className="btn btn-primary" onClick={guardar}>{creando ? "Crear paquete" : "Guardar cambios"}</button>
              {!creando && <button className="btn btn-danger" onClick={eliminar}>Eliminar paquete</button>}
            </div>
          </>
        ) : (
          <div className="empty-state">Selecciona un paquete de la lista, o crea uno nuevo.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suscripciones
// ---------------------------------------------------------------------------
function TabSuscripciones({ suscripciones, talleres, paquetes, notify, confirmDialog, reload }) {
  const [editing, setEditing] = useState(null);

  const fields = useMemo(() => [
    { name: "id_taller", label: "Taller", type: "select", required: true, disabled: !!editing?.id_suscripcion,
      options: talleres.map((t) => ({ value: t.id_taller, label: t.nombre_comercial })) },
    { name: "id_paquete", label: "Paquete", type: "select", required: true,
      options: paquetes.map((p) => ({ value: p.id_paquete, label: `${p.nombre} — ${fmtMoneda(p.precio_mensual)}/mes` })) },
    { name: "estado", label: "Estado", type: "select", required: true,
      options: [
        { value: "activa", label: "Activa" }, { value: "prueba", label: "Prueba" },
        { value: "vencida", label: "Vencida" }, { value: "cancelada", label: "Cancelada" },
      ] },
    { name: "fecha_inicio", label: "Fecha de inicio", type: "date" },
    { name: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date" },
    { name: "precio_pactado", label: "Precio pactado (vacío = precio de lista)", type: "number" },
    { name: "notas", label: "Notas", type: "textarea", full: true },
  ], [talleres, paquetes, editing]);

  async function handleSave(values) {
    const payload = { ...values, precio_pactado: values.precio_pactado === "" ? null : values.precio_pactado };
    try {
      if (editing?.id_suscripcion) {
        const { id_taller, ...resto } = payload;
        await api.put(`/superadmin/suscripciones/${editing.id_suscripcion}`, resto);
        notify("Suscripción actualizada.", "success");
      } else {
        await api.post("/superadmin/suscripciones", payload);
        notify("Suscripción creada.", "success");
      }
      setEditing(null);
      reload();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleDelete(s) {
    const ok = await confirmDialog(`¿Eliminar esta suscripción de "${s.taller?.nombre_comercial}"?`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/superadmin/suscripciones/${s.id_suscripcion}`);
      notify("Suscripción eliminada.", "success");
      reload();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <div className="panel">
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="subtitle">{suscripciones.length} suscripción{suscripciones.length === 1 ? "" : "es"} registrada{suscripciones.length === 1 ? "" : "s"}</div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>➕ Nueva suscripción</button>
      </div>
      <DataTable
        columns={[
          { key: "taller", label: "Taller", render: (s) => s.taller?.nombre_comercial || "—" },
          { key: "paquete", label: "Paquete", render: (s) => s.paquete?.nombre || "—" },
          { key: "estado", label: "Estado", render: (s) => <span className={`badge ${ESTADO_BADGE[s.estado] || "badge-grey"}`}>{s.estado}</span> },
          { key: "fecha_inicio", label: "Inicio", render: (s) => s.fecha_inicio || "—" },
          { key: "fecha_vencimiento", label: "Vence", render: (s) => s.fecha_vencimiento || "—" },
          { key: "precio", label: "Precio", render: (s) => fmtMoneda(s.precio_pactado ?? s.paquete?.precio_mensual) },
        ]}
        rows={suscripciones}
        onEdit={(s) => setEditing({ ...s, fecha_inicio: s.fecha_inicio || "", fecha_vencimiento: s.fecha_vencimiento || "", precio_pactado: s.precio_pactado ?? "" })}
        onDelete={handleDelete}
        emptyMessage="No hay suscripciones registradas todavía."
      />

      {editing && (
        <FormModal
          title={editing.id_suscripcion ? "Editar suscripción" : "Nueva suscripción"}
          icono="🧾"
          subtitulo="Vincula un taller con un paquete y controla su vigencia."
          fields={fields}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
