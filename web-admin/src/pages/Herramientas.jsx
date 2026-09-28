import { useEffect, useState } from "react";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import FotoGaleria from "../components/FotoGaleria";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";

export default function Herramientas() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [herramientas, setHerramientas] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [editing, setEditing] = useState(null);
  const [fotosDe, setFotosDe] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [h, m] = await Promise.all([api.get("/herramientas/"), api.get("/herramientas-marcas/")]);
    setHerramientas(h);
    setMarcas(m);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const fields = [
    { name: "nombre_herramienta", label: "Nombre", required: true, grupo: "general" },
    { name: "modelo_herramienta", label: "Modelo", grupo: "general" },
    {
      name: "id_herramienta_marca", label: "Marca", type: "select", grupo: "general",
      options: marcas.map((m) => ({ value: m.id_herramienta_marca, label: m.nombre_marca })),
      creatable: {
        endpoint: "/herramientas-marcas/", createField: "nombre_marca", idField: "id_herramienta_marca", label: "marca",
        onCreated: (nueva) => setMarcas((prev) => [...prev, nueva]),
      },
    },
    { name: "medida_herramienta", label: "Medida", grupo: "general" },
    { name: "cantidad_herramienta", label: "Cantidad", type: "number", grupo: "costo" },
    { name: "costo_herramienta", label: "Costo", type: "number", grupo: "costo" },
    { name: "factura_herramienta", label: "Factura", grupo: "costo" },
    { name: "comentario", label: "Comentario", type: "textarea", full: true, grupo: "costo" },
  ];

  const gruposHerramienta = {
    general: { icono: "🛠️", titulo: "Datos generales" },
    costo: { icono: "💲", titulo: "Cantidad y costo", acento: "acento-ambar" },
  };

  async function handleSave(values) {
    if (editing?.id_herramienta) {
      await api.put(`/herramientas/${editing.id_herramienta}`, values);
      notify("Herramienta actualizada.", "success");
    } else {
      await api.post("/herramientas/", values);
      notify("Herramienta creada.", "success");
    }
    setEditing(null);
    load();
  }

  async function handleDelete(h) {
    const ok = await confirmDialog(`¿Eliminar "${h.nombre_herramienta}" del inventario?`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/herramientas/${h.id_herramienta}`);
      load();
      notify("Herramienta eliminada.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function nombreMarca(id) { return marcas.find((m) => m.id_herramienta_marca === id)?.nombre_marca || "—"; }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🛠️ Herramientas</h1>
          <div className="subtitle">
            Inventario de herramientas del taller
            {!hasPermission("herramientas.crear") && <span className="role-badge">Solo lectura</span>}
          </div>
        </div>
        {hasPermission("herramientas.crear") && <button className="btn btn-primary" onClick={() => setEditing({})}>🛠️ Nueva herramienta</button>}
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <DataTable
            columns={[
              { key: "nombre_herramienta", label: "Nombre" },
              { key: "marca", label: "Marca", render: (h) => nombreMarca(h.id_herramienta_marca) },
              { key: "medida_herramienta", label: "Medida" },
              { key: "cantidad_herramienta", label: "Cantidad" },
              { key: "costo_herramienta", label: "Costo", render: (h) => `$${(h.costo_herramienta ?? 0).toLocaleString("es-MX")}` },
              { key: "fotos", label: "", render: (h) => <button className="btn btn-secondary btn-sm" onClick={() => setFotosDe(h)}>📷 Fotos</button> },
            ]}
            rows={herramientas}
            onEdit={hasPermission("herramientas.editar") ? setEditing : undefined}
            onDelete={hasPermission("herramientas.eliminar") ? handleDelete : undefined}
            emptyMessage="No hay herramientas registradas."
          />
        )}
      </div>

      {editing && (
        <FormModal
          title={editing.id_herramienta ? "Editar herramienta" : "Nueva herramienta"}
          icono="🛠️"
          subtitulo="Datos de la herramienta, cantidad y costo."
          fields={fields}
          grupos={gruposHerramienta}
          initialValues={editing}
          onSubmit={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {fotosDe && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setFotosDe(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 18 }}>Fotos — {fotosDe.nombre_herramienta}</h2>
            <FotoGaleria entidadTipo="herramienta" entidadId={fotosDe.id_herramienta} puedeEditar={hasPermission("herramientas.editar")} />
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setFotosDe(null)}>Cerrar</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
