import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";

const CAMPOS = [
  { name: "nombre", label: "Nombre", required: true, grupo: "personal" },
  { name: "paterno", label: "Apellido paterno", grupo: "personal" },
  { name: "materno", label: "Apellido materno", grupo: "personal" },
  { name: "telefono", label: "Teléfono", grupo: "contacto" },
  { name: "correo", label: "Correo", grupo: "contacto" },
  { name: "puesto", label: "Puesto (ej. Mecánico, Hojalatero)", grupo: "trabajo" },
  { name: "fecha_ingreso", label: "Fecha de ingreso", type: "date", grupo: "trabajo" },
];

const GRUPOS_EMPLEADO = {
  personal: { icono: "🧑", titulo: "Datos personales" },
  contacto: { icono: "📇", titulo: "Contacto", acento: "acento-ambar" },
  trabajo: { icono: "👷", titulo: "Trabajo en el taller", acento: "acento-teal" },
};

export default function Empleados() {
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const [empleados, setEmpleados] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [emps, usrs] = await Promise.all([api.get("/empleados/"), api.get("/auth/usuarios")]);
    setEmpleados(emps);
    setUsuarios(usrs);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const campos = CAMPOS.concat([
    {
      name: "id_usuario", label: "Cuenta de usuario ligada (opcional — para que vea su dashboard)",
      type: "select", grupo: "trabajo",
      options: [{ value: "", label: "Sin cuenta ligada" }].concat(usuarios.map((u) => ({ value: u.id_usuario, label: `${u.nombre_completo} (@${u.username})` }))),
    },
  ]);

  async function handleSave(values) {
    const payload = { ...values, id_usuario: values.id_usuario ? Number(values.id_usuario) : null };
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

  async function handleDelete(emp) {
    const ok = await confirmDialog(`¿Dar de baja a ${emp.nombre}? Su historial como responsable de servicios se conserva.`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/empleados/${emp.id_empleado}`);
      load();
      notify("Empleado dado de baja.", "success");
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
            <h1><IconoModulo ruta="/empleados" /> Empleados</h1>
            <div className="subtitle">Catálogo del personal del taller — solo el Administrador General lo administra</div>
          </div>
        </div>
        {hasPermission("empleados.crear") && (
          <button className="btn btn-primary" onClick={() => setEditing({})}>👷 Nuevo empleado</button>
        )}
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <DataTable
            columns={[
              { key: "nombre", label: "Nombre", render: (e) => `${e.nombre} ${e.paterno || ""}` },
              { key: "puesto", label: "Puesto", render: (e) => e.puesto || "—" },
              { key: "telefono", label: "Teléfono", render: (e) => e.telefono || "—" },
              {
                key: "cuenta", label: "Cuenta",
                render: (e) => e.id_usuario ? <span className="badge badge-teal">Ligada</span> : <span className="badge badge-grey">Sin cuenta</span>,
              },
              {
                key: "activo", label: "Estado",
                render: (e) => <span className={`badge ${e.activo ? "badge-teal" : "badge-grey"}`}>{e.activo ? "Activo" : "Inactivo"}</span>,
              },
            ]}
            rows={empleados}
            onEdit={hasPermission("empleados.editar") ? setEditing : undefined}
            onDelete={hasPermission("empleados.eliminar") ? handleDelete : undefined}
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
