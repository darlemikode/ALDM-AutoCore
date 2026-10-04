import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

const FIELDS = [
  { name: "nombre_proveedor", label: "Nombre", required: true, full: true, grupo: "general" },
  { name: "empresa_proveedor", label: "Empresa", grupo: "general" },
  { name: "rfc_proveedor", label: "RFC", grupo: "general" },
  { name: "telefono1_proveedor", label: "Teléfono principal", grupo: "contacto" },
  { name: "telefono2_proveedor", label: "Teléfono secundario", grupo: "contacto" },
  { name: "correo_proveedor", label: "Correo", grupo: "contacto" },
  { name: "calle_proveedor", label: "Calle", grupo: "direccion" },
  { name: "numexterior_proveedor", label: "Número ext.", grupo: "direccion" },
  { name: "numinterior_proveedor", label: "Número int.", grupo: "direccion" },
  { name: "colonia_proveedor", label: "Colonia", grupo: "direccion" },
];

const GRUPOS_PROVEEDOR = {
  general: { icono: "🚚", titulo: "Datos generales" },
  contacto: { icono: "📇", titulo: "Contacto", acento: "acento-teal" },
  direccion: { icono: "📍", titulo: "Dirección", acento: "acento-ambar" },
};

export default function Proveedores() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [proveedores, setProveedores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setProveedores(await api.get("/proveedores/"));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(values) {
    if (editing?.id_proveedor) {
      await api.put(`/proveedores/${editing.id_proveedor}`, values);
      notify("Proveedor actualizado.", "success");
    } else {
      await api.post("/proveedores/", values);
      notify("Proveedor creado.", "success");
    }
    setEditing(null);
    load();
  }

  async function handleDelete(p) {
    const ok = await confirmDialog(`¿Eliminar al proveedor "${p.nombre_proveedor}"?`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/proveedores/${p.id_proveedor}`);
      load();
      notify("Proveedor eliminado.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/proveedores" /> Proveedores</h1>
          <div className="subtitle">
            {proveedores.length} proveedor(es)
            {!hasPermission("proveedores.crear") && <span className="role-badge">Solo lectura</span>}
          </div>
        </div>
        {hasPermission("proveedores.crear") && <button className="btn btn-primary btn-nuevo" onClick={() => setEditing({})}><span className="btn-nuevo-icono"><Icono nombre="business" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo proveedor</button>}
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <DataTable
            columns={[
              { key: "nombre", label: "Nombre", render: (p) => <Link to={`/proveedores/${p.id_proveedor}`}>{p.nombre_proveedor}</Link> },
              { key: "empresa_proveedor", label: "Empresa" },
              { key: "telefono1_proveedor", label: "Teléfono" },
              { key: "correo_proveedor", label: "Correo" },
            ]}
            rows={proveedores}
            onEdit={hasPermission("proveedores.editar") ? setEditing : undefined}
            onDelete={hasPermission("proveedores.eliminar") ? handleDelete : undefined}
            emptyMessage="No hay proveedores registrados."
          />
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_proveedor ? "Editar proveedor" : "Nuevo proveedor"}
          icono="🚚"
          subtitulo="Datos generales, contacto y dirección del proveedor."
          fields={FIELDS}
          grupos={GRUPOS_PROVEEDOR}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
