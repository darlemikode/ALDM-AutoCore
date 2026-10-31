import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import "./empleados.css";
import FiltroChips, { colorGrupo, contarPor } from "../components/FiltroChips";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

export const ESTATUS_EMPLEADO = [
  { value: "activo", label: "Activo", badge: "badge-teal" },
  { value: "vacaciones", label: "Vacaciones", badge: "badge-blue" },
  { value: "incapacidad", label: "Incapacidad", badge: "badge-amber" },
  { value: "suspendido", label: "Suspendido", badge: "badge-red" },
  { value: "baja", label: "Baja", badge: "badge-grey" },
];

const CAMPOS = [
  { name: "nombre", label: "Nombre", required: true, grupo: "personal" },
  { name: "paterno", label: "Apellido paterno", grupo: "personal" },
  { name: "materno", label: "Apellido materno", grupo: "personal" },
  { name: "telefono", label: "Teléfono", grupo: "contacto" },
  { name: "correo", label: "Correo", grupo: "contacto" },
  { name: "puesto", label: "Puesto (ej. Mecánico, Hojalatero)", grupo: "trabajo" },
  { name: "fecha_ingreso", label: "Fecha de ingreso", type: "date", grupo: "trabajo" },
  { name: "estatus", label: "Estatus", type: "select", grupo: "trabajo", options: ESTATUS_EMPLEADO.map(({ value, label }) => ({ value, label })) },
  { name: "esquema_pago", label: "Esquema de pago", type: "select", grupo: "nomina", options: [
    { value: "fijo", label: "Sueldo fijo" }, { value: "mixto", label: "Sueldo + comisión" },
    { value: "comision", label: "Solo comisión por órdenes" }, { value: "destajo", label: "Destajo (por trabajo)" },
  ] },
  { name: "sueldo_mensual", label: "Sueldo neto mensual", type: "number", grupo: "nomina", full: true },
  { name: "porcentaje_comision", label: "% de comisión sobre mano de obra", type: "number", grupo: "nomina" },
  { name: "aplicar_impuestos", label: "Retener ISR e IMSS (estimado)", type: "checkbox", grupo: "nomina" },
  { name: "rfc_empleado", label: "RFC", grupo: "nomina" },
  { name: "curp", label: "CURP", grupo: "nomina" },
  { name: "nss", label: "No. de seguro social (NSS)", grupo: "nomina" },
];

const GRUPOS_EMPLEADO = {
  personal: { icono: "🧑", titulo: "Datos personales" },
  contacto: { icono: "📇", titulo: "Contacto", acento: "acento-ambar" },
  trabajo: { icono: "👷", titulo: "Trabajo en el taller", acento: "acento-teal" },
  nomina: { icono: "💵", titulo: "Pago y nómina", acento: "acento-ambar" },
};

// Sueldo base: oculto hasta que el administrador confirma su contraseña.
function SueldoCampo({ emp, value, onChange, notify }) {
  const [pidiendo, setPidiendo] = useState(false);
  const [pwd, setPwd] = useState("");
  const [cargando, setCargando] = useState(false);
  const nuevo = !emp?.id_empleado;
  const visible = nuevo || (value !== null && value !== undefined);

  function cerrar() { setPidiendo(false); setPwd(""); }

  async function verificar() {
    if (!pwd) return;
    setCargando(true);
    try {
      const r = await api.post(`/empleados/${emp.id_empleado}/sueldo-base`, { password: pwd });
      onChange(r.sueldo_mensual);
      setPidiendo(false);
      setPwd("");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setCargando(false);
    }
  }

  if (visible) {
    const mm = Number(value) || 0;
    const f = (n) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return (
      <>
        <input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        <div className="sueldo-previa" aria-live="polite">
          <div><small>Semanal</small><b>{f(mm * 7 / 30)}</b></div>
          <div><small>Quincenal</small><b>{f(mm * 15 / 30)}</b></div>
          <div><small>Mensual</small><b>{f(mm)}</b></div>
          <div><small>Por día</small><b>{f(mm / 30)}</b></div>
        </div>
        <div className="field-hint">El mes se toma de 30 días (como la ley): semana = 7/30, quincena = 15/30. Ver «Avisos legales» en Nómina.</div>
      </>
    );
  }
  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="text" value="••••••" disabled style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary" onClick={() => setPidiendo(true)}>Ver sueldo</button>
      </div>
      {pidiendo && createPortal(
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && cerrar()}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2 style={{ fontSize: 19 }}>Confirma tu identidad</h2>
            <div className="field">
              <label>Contraseña del administrador</label>
              <input type="password" autoFocus autoComplete="current-password" value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); verificar(); } }} />
              <div className="field-hint">Se requiere para ver el sueldo base de este empleado.</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={cargando || !pwd} onClick={verificar}>{cargando ? "Verificando..." : "Verificar"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Enlace a WhatsApp: 10 dígitos = México (+52)
function BotonWhatsApp({ telefono }) {
  const d = String(telefono || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const num = d.length === 10 ? "52" + d : d;
  return (
    <a href={`https://wa.me/${num}`} target="_blank" rel="noopener noreferrer" title="Abrir chat de WhatsApp" aria-label="Abrir chat de WhatsApp"
      onClick={(e) => e.stopPropagation()}
      className="emp-wa">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
      Enviar WhatsApp
    </a>
  );
}

export default function Empleados() {
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [puestoSel, setPuestoSel] = useState("");

  async function load() {
    const [emps, usrs] = await Promise.all([api.get("/empleados/"), api.get("/auth/usuarios")]);
    setEmpleados(emps);
    setUsuarios(usrs);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const campos = CAMPOS.map((c) => c.name !== "sueldo_mensual" ? c : {
    ...c, type: "custom",
    render: (valor, set) => <SueldoCampo emp={editing} value={valor} onChange={set} notify={notify} />,
  }).concat([
    {
      name: "id_usuario", label: "Cuenta de usuario ligada (opcional — para que vea su dashboard)",
      type: "select", grupo: "trabajo",
      options: [{ value: "", label: "Sin cuenta ligada" }].concat(usuarios.map((u) => ({ value: u.id_usuario, label: `${u.nombre_completo} (@${u.username})` }))),
    },
  ]);

  async function handleSave(values) {
    const payload = { ...values, id_usuario: values.id_usuario ? Number(values.id_usuario) : null };
    delete payload.sueldo_base; // el sueldo por periodo se deriva del mensual en el servidor
    if (payload.sueldo_mensual === "" || payload.sueldo_mensual === undefined) payload.sueldo_mensual = editing?.id_empleado ? null : 0;
    if (editing?.id_empleado) {
      await api.put(`/empleados/${editing.id_empleado}`, payload);
      notify("Empleado actualizado.", "success");
    } else {
      await api.post("/empleados/", payload);
      notify("Empleado creado.", "success");
    }
    setEditing(null);
    load();
  }

  async function cambiarEstatus(emp, estatus) {
    if (estatus === emp.estatus) return;
    if (estatus === "baja") {
      const ok = await confirmDialog(`¿Dar de baja a ${emp.nombre}? Su historial se conserva y ya no saldrá en nómina ni como responsable.`, { danger: true, confirmar: "Sí, dar de baja" });
      if (!ok) return;
    }
    try {
      await api.put(`/empleados/${emp.id_empleado}/estatus`, { estatus });
      notify("Estatus actualizado.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-titulo">
          <div>
            <h1><IconoModulo ruta="/empleados" /> Empleados</h1>
            <div className="subtitle">Catálogo del personal del taller — solo el Administrador General lo administra</div>
          </div>
        </div>
        {hasPermission("empleados.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({})}><span className="btn-nuevo-icono"><Icono nombre="id-card" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo empleado</button>
        )}
      </div>

      <div className="panel">
        <FiltroChips items={contarPor(empleados, (e) => e.puesto)} valor={puestoSel} onChange={setPuestoSel} total={empleados.length} etiquetaTodas="Todos" />
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <div className="emp-grid">
            {(puestoSel ? empleados.filter((e) => (e.puesto || "Sin asignar") === puestoSel) : empleados).map((e) => {
              const actual = ESTATUS_EMPLEADO.find((x) => x.value === (e.estatus || "activo")) || ESTATUS_EMPLEADO[0];
              const editable = hasPermission("empleados.editar");
              const nombre = `${e.nombre} ${e.paterno || ""} ${e.materno || ""}`.replace(/\s+/g, " ").trim();
              return (
                <div key={e.id_empleado} className={"emp-card" + (editable ? " clicable" : "") + (e.estatus === "baja" ? " baja" : "")}
                  style={{ "--acc": colorGrupo(e.puesto || "Sin asignar") }} onClick={editable ? () => setEditing(e) : undefined}>
                  <div className="emp-cab">
                    <span className="emp-avatar">{nombre.split(" ").slice(0, 2).map((x) => x[0]).join("").toUpperCase()}</span>
                    <div className="emp-id">
                      <b>{nombre}</b>
                      <span className="emp-puesto">{e.puesto || "Sin puesto"}</span>
                    </div>
                    {editable && <button className="btn-icono" title="Editar" aria-label="Editar" onClick={(ev) => { ev.stopPropagation(); setEditing(e); }}><Icono nombre="pencil" size={18} /></button>}
                  </div>
                  <div className="emp-datos">
                    <div className="emp-dato"><small>Teléfono</small>
                      {e.telefono ? <><span className="emp-tel">{e.telefono}</span><BotonWhatsApp telefono={e.telefono} /></> : <span className="emp-nd">—</span>}
                    </div>
                    <div className="emp-dato"><small>Cuenta</small>
                      {e.id_usuario ? <span className="badge badge-teal">Ligada</span> : <span className="badge badge-grey">Sin cuenta</span>}
                    </div>
                  </div>
                  <div className="emp-pie">
                    {editable ? (
                      <select className={`badge ${actual.badge}`} style={{ border: "none", cursor: "pointer", fontWeight: 700 }} value={actual.value}
                        onClick={(ev) => ev.stopPropagation()} onChange={(ev) => cambiarEstatus(e, ev.target.value)}>
                        {ESTATUS_EMPLEADO.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    ) : <span className={`badge ${actual.badge}`}>{actual.label}</span>}
                  </div>
                </div>
              );
            })}
            {empleados.length === 0 && <div className="empty-state">No hay empleados registrados todavía.</div>}
          </div>
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_empleado ? `Editar empleado — ${editing.nombre}` : "Nuevo empleado"}
          icono="👷"
          subtitulo="Datos personales, contacto y puesto en el taller."
          fields={campos}
          grupos={GRUPOS_EMPLEADO}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
