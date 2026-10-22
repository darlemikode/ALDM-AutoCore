import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

export default function Cotizaciones() {
  const { hasPermission } = useAuth();
  const { notify, confirmDialog } = useUI();
  const navigate = useNavigate();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setCotizaciones(await api.get("/cotizaciones/"));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(values) {
    const nueva = await api.post("/cotizaciones/", { ...values, iva_porcentaje: 16 });
    setCreating(false);
    notify(`Cotización creada — #${nueva.id_cotizacion}.`, "success");
    navigate(`/cotizaciones/${nueva.id_cotizacion}`);
  }

  async function handleDelete(c) {
    const ok = await confirmDialog(`¿Eliminar la cotización "${c.titulo}"?`, { danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try {
      await api.del(`/cotizaciones/${c.id_cotizacion}`);
      load();
      notify("Cotización eliminada.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/cotizaciones" /> Cotizaciones</h1>
          <div className="subtitle">Presupuestos sin cliente ni vehículo ligado — para cuando solo preguntan cuánto costaría algo</div>
        </div>
        {hasPermission("cotizaciones.crear") && (
          <button className="btn btn-primary btn-nuevo" onClick={() => setCreating(true)}><span className="btn-nuevo-icono"><Icono nombre="document-text" size={22} /><span className="btn-nuevo-mas">+</span></span>Nueva cotización</button>
        )}
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <DataTable
            columns={[
              { key: "titulo", label: "Título" },
              { key: "fecha_cotizacion", label: "Fecha", render: (c) => new Date(c.fecha_cotizacion).toLocaleDateString("es-MX") },
              { key: "vigente_hasta", label: "Vigente hasta", render: (c) => c.vigente_hasta ? new Date(c.vigente_hasta).toLocaleDateString("es-MX") : "Sin límite" },
              { key: "total", label: "Total estimado", render: (c) => fmt(c.costos?.total) },
            ]}
            rows={cotizaciones}
            onEdit={(c) => navigate(`/cotizaciones/${c.id_cotizacion}`)}
            onDelete={hasPermission("cotizaciones.eliminar") ? handleDelete : undefined}
            emptyMessage="No hay cotizaciones registradas todavía."
          />
        )}
      </div>

      {creating && (
        <FormModal
          title="Nueva cotización"
          icono="🧾"
          colorAcento="teal"
          subtitulo="Presupuesto sin cliente ni vehículo ligado."
          grupos={{ datos: { icono: "🧾", titulo: "Datos de la cotización", acento: "acento-teal", completo: true } }}
          initialValues={{ vigente_hasta: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }}
          fields={[
            { name: "titulo", label: "Título", required: true, full: true, grupo: "datos", hint: "Ej. Afinación mayor Nissan Versa" },
            { name: "vigente_hasta", label: "Vigente hasta", type: "date", grupo: "datos", hint: "Opcional — hasta cuándo sigue valiendo el precio" },
          ]}
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
