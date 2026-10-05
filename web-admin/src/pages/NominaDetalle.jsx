import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { dinero, fechaCorta } from "./Nomina";

const CAMPOS_AJUSTE = [
  { name: "faltas", label: "Faltas (días)", type: "number" },
  { name: "horas_extra", label: "Horas extra (se pagan dobles)", type: "number" },
  { name: "comisiones", label: "Comisiones por órdenes (editable)", type: "number" },
  { name: "destajo", label: "Destajo / trabajos", type: "number" },
  { name: "destajo_nota", label: "Detalle del destajo (opcional)" },
  { name: "bonos", label: "Bono", type: "number" },
  { name: "bonos_nota", label: "Nota del bono (opcional)" },
  { name: "prestamo", label: "Descuento por préstamo / adelanto", type: "number" },
  { name: "prestamo_nota", label: "Nota del préstamo (opcional)" },
  { name: "deducciones", label: "Otras deducciones", type: "number" },
  { name: "deducciones_nota", label: "Nota de la deducción (opcional)" },
];

export default function NominaDetalle() {
  const { id } = useParams();
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission("nomina.editar");
  const [periodo, setPeriodo] = useState(null);
  const [editando, setEditando] = useState(null);

  async function load() {
    try {
      setPeriodo(await api.get(`/nomina/periodos/${id}`));
    } catch (err) {
      notify(err.message, "error");
    }
  }
  useEffect(() => { load(); }, [id]);

  async function guardarAjuste(values) {
    const n = (v) => Number(v) || 0;
    await api.put(`/nomina/recibos/${editando.id_recibo}`, {
      faltas: n(values.faltas), horas_extra: n(values.horas_extra), comisiones: n(values.comisiones),
      destajo: n(values.destajo), destajo_nota: values.destajo_nota || null,
      bonos: n(values.bonos), bonos_nota: values.bonos_nota || null,
      prestamo: n(values.prestamo), prestamo_nota: values.prestamo_nota || null,
      deducciones: n(values.deducciones), deducciones_nota: values.deducciones_nota || null,
    });
    setEditando(null);
    notify("Recibo actualizado y recalculado.", "success");
    load();
  }

  async function recalcular() {
    const ok = await confirmDialog("¿Recalcular los recibos pendientes? Se actualizan sueldos vigentes y comisiones de órdenes cerradas; lo capturado a mano se conserva.");
    if (!ok) return;
    try { setPeriodo(await api.post(`/nomina/periodos/${id}/recalcular`, {})); notify("Recibos recalculados.", "success"); } catch (err) { notify(err.message, "error"); }
  }

  async function pagarTodos() {
    const ok = await confirmDialog(`¿Marcar como pagados todos los recibos pendientes por ${dinero(pendienteTotal)}?`);
    if (!ok) return;
    try { setPeriodo(await api.post(`/nomina/periodos/${id}/pagar`, {})); notify("Periodo pagado.", "success"); } catch (err) { notify(err.message, "error"); }
  }

  async function descargarRecibo(r) {
    try {
      const res = await fetch(`/api/nomina/recibos/${r.id_recibo}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("No se pudo generar el recibo.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `Nomina ${nombreDe(r)}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) { notify(err.message, "error"); }
  }

  async function pagar(r) {
    const nombre = r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `empleado #${r.id_empleado}`;
    const ok = await confirmDialog(`¿Marcar como pagado el recibo de ${nombre} por ${dinero(r.total_pagar)}?`);
    if (!ok) return;
    try {
      await api.post(`/nomina/recibos/${r.id_recibo}/pagar`, {});
      notify("Recibo marcado como pagado.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function reabrir(r) {
    const ok = await confirmDialog("Este recibo está marcado como pagado. ¿Regresarlo a pendiente?");
    if (!ok) return;
    try {
      await api.post(`/nomina/recibos/${r.id_recibo}/reabrir`, {});
      notify("Recibo regresado a pendiente.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  if (!periodo) return <div className="loading-text">Cargando…</div>;

  const recibos = periodo.recibos || [];
  const total = recibos.reduce((a, r) => a + (r.total_pagar || 0), 0);
  const pagados = recibos.filter((r) => r.pagado).length;
  const percepcionesTotal = recibos.reduce((a, r) => a + (r.percepciones || 0), 0);
  const retenciones = recibos.reduce((a, r) => a + ((r.isr || 0) - (r.subsidio || 0)) + (r.imss || 0), 0);
  const pendienteTotal = recibos.filter((r) => !r.pagado).reduce((a, r) => a + (r.total_pagar || 0), 0);
  const nombreDe = (r) => (r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `Empleado #${r.id_empleado}`);

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/nomina" /> {fechaCorta(periodo.fecha_inicio)} — {fechaCorta(periodo.fecha_fin)}</h1>
          <div className="subtitle">
            <Link to="/nomina">← Nómina</Link> · {periodo.periodicidad[0].toUpperCase() + periodo.periodicidad.slice(1)} ·{" "}
            <span className={`badge ${periodo.status === "pagado" ? "badge-teal" : "badge-warn"}`}>{periodo.status === "pagado" ? "Pagado" : "Abierto"}</span>
          </div>
        </div>
        {puedeEditar && periodo.status !== "pagado" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={recalcular}>Recalcular</button>
            <button className="btn btn-primary" onClick={pagarTodos} disabled={pendienteTotal <= 0}>Pagar todo ({dinero(pendienteTotal)})</button>
          </div>
        )}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card"><div className="kpi-label">Percepciones</div><div className="kpi-value">{dinero(percepcionesTotal)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Retenciones (ISR + IMSS)</div><div className="kpi-value">{dinero(retenciones)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Neto a pagar</div><div className="kpi-value">{dinero(total)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Recibos</div><div className="kpi-value">{recibos.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Pagados</div><div className="kpi-value">{pagados} / {recibos.length}</div></div>
      </div>

      <div className="panel">
        <DataTable
          columns={[
            { key: "empleado", label: "Empleado", render: nombreDe },
            { key: "sueldo_base", label: "Sueldo", render: (r) => dinero(r.sueldo_base) },
            { key: "extras", label: "Extras", render: (r) => { const t = (r.pago_horas_extra || 0) + (r.comisiones || 0) + (r.destajo || 0) + (r.bonos || 0); return t > 0 ? `+${dinero(t)}` : ""; } },
            { key: "descuentos", label: "Descuentos", render: (r) => (r.total_deducciones + r.descuento_faltas > 0 ? `-${dinero(r.total_deducciones + r.descuento_faltas)}` : "") },
            { key: "total_pagar", label: "Neto a pagar", render: (r) => <strong>{dinero(r.total_pagar)}</strong> },
            { key: "pagado", label: "Estado", render: (r) => <span className={`badge ${r.pagado ? "badge-teal" : "badge-warn"}`}>{r.pagado ? "Pagado" : "Pendiente"}</span> },
          ]}
          rows={recibos.map((r) => ({ ...r, id: r.id_recibo }))}
          acentoFila={(r) => (r.pagado ? "var(--teal-600)" : "var(--warn-600)")}
          extraActions={puedeEditar ? (r) => (r.pagado ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => descargarRecibo(r)}>PDF</button>
              <button className="btn btn-secondary btn-sm" onClick={() => reabrir(r)}>Regresar a pendiente</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => descargarRecibo(r)}>PDF</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditando(r)}>Ajustar</button>
              <button className="btn btn-primary btn-sm" onClick={() => pagar(r)}>Marcar pagado</button>
            </>
          )) : undefined}
          emptyMessage="No hay empleados con sueldo base configurado."
        />
      </div>

      {editando && (
        <FormModal
          title={`Ajustar recibo — ${nombreDe(editando)}`}
          icono="💳"
          subtitulo={`Sueldo ${dinero(editando.sueldo_base)} · ISR ${dinero((editando.isr || 0) - (editando.subsidio || 0))} · IMSS ${dinero(editando.imss)}. Todo se recalcula solo.`}
          fields={CAMPOS_AJUSTE}
          initialValues={{
            faltas: editando.faltas || 0, horas_extra: editando.horas_extra || 0, comisiones: editando.comisiones || 0,
            destajo: editando.destajo || 0, destajo_nota: editando.destajo_nota || "",
            bonos: editando.bonos || 0, bonos_nota: editando.bonos_nota || "",
            prestamo: editando.prestamo || 0, prestamo_nota: editando.prestamo_nota || "",
            deducciones: editando.deducciones || 0, deducciones_nota: editando.deducciones_nota || "",
          }}
          onSubmit={guardarAjuste}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}
