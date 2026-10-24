import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
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
          <DataTable acentoFila={(e) => colorGrupo(e.puesto || "Sin asignar")}
            columns={[
              { key: "nombre", label: "Nombre", render: (e) => `${e.nombre} ${e.paterno || ""}` },
              { key: "puesto", label: "Puesto", render: (e) => e.puesto || "—" },
              { key: "telefono", label: "Teléfono", render: (e) => e.telefono || "—" },
              {
                key: "cuenta", label: "Cuenta",
                render: (e) => e.id_usuario ? <span className="badge badge-teal">Ligada</span> : <span className="badge badge-grey">Sin cuenta</span>,
              },
              {
                key: "estatus", label: "Estatus",
                render: (e) => {
                  const actual = ESTATUS_EMPLEADO.find((x) => x.value === (e.estatus || "activo")) || ESTATUS_EMPLEADO[0];
                  return hasPermission("empleados.editar") ? (
                    <select className={`badge ${actual.badge}`} style={{ border: "none", cursor: "pointer", fontWeight: 700 }} value={actual.value}
                      onChange={(ev) => cambiarEstatus(e, ev.target.value)}>
                      {ESTATUS_EMPLEADO.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  ) : <span className={`badge ${actual.badge}`}>{actual.label}</span>;
                },
              },
            ]}
            rows={puestoSel ? empleados.filter((e) => (e.puesto || "Sin asignar") === puestoSel) : empleados}
            onEdit={hasPermission("empleados.editar") ? setEditing : undefined}
            emptyMessage="No hay empleados registrados todavía."
          />
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
