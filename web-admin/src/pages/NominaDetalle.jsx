import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { fechaCorta, nombrePeriodo, nombreEmpleado, descargarReciboPdf } from "./Nomina";
import { Icono } from "../components/Icono";
import { useMontos, ControlMontos, OjoMontos } from "../components/MontosNomina";

const CAMPOS_AJUSTE = [
  { name: "faltas", label: "Faltas (días)", type: "number", grupo: "asistencia", hint: "Se descuenta el día de sueldo por cada falta." },
  { name: "horas_extra", label: "Horas extra", type: "number", grupo: "asistencia", hint: "Se pagan dobles." },
  { name: "comisiones", label: "Comisiones por órdenes", type: "number", grupo: "ingresos", hint: "Viene de las órdenes cerradas; puedes corregirla." },
  { name: "destajo", label: "Destajo / trabajos", type: "number", grupo: "ingresos" },
  { name: "destajo_nota", label: "Detalle del destajo (opcional)", grupo: "ingresos", full: true },
  { name: "bonos", label: "Bono", type: "number", grupo: "ingresos" },
  { name: "bonos_nota", label: "Nota del bono (opcional)", grupo: "ingresos" },
  { name: "prestamo", label: "Préstamo / adelanto", type: "number", grupo: "descuentos", hint: "Se descuenta del neto." },
  { name: "prestamo_nota", label: "Nota del préstamo (opcional)", grupo: "descuentos" },
  { name: "deducciones", label: "Otras deducciones", type: "number", grupo: "descuentos" },
  { name: "deducciones_nota", label: "Nota de la deducción (opcional)", grupo: "descuentos" },
];

const GRUPOS_AJUSTE = {
  asistencia: { icono: "🗓️", titulo: "Asistencia", acento: "acento-ambar" },
  ingresos: { icono: "💵", titulo: "Ingresos extra", acento: "acento-teal" },
  descuentos: { icono: "➖", titulo: "Descuentos" },
};

export default function NominaDetalle() {
  const { id } = useParams();
  const { notify, confirmDialog } = useUI();
  const { hasPermission } = useAuth();
  const puedeEditar = hasPermission("nomina.editar");
  const { m, visible } = useMontos();
  const exigirMontos = () => { if (visible) return false; notify("Para pagar, primero pulsa «Mostrar montos» y confirma tu contraseña.", "error"); return true; };
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
    const ok = await confirmDialog("¿Recalcular los recibos pendientes? Se actualizan sueldos vigentes y comisiones de órdenes cerradas; lo capturado a mano se conserva.", { title: "Recalcular recibos", confirmar: "Sí, recalcular" });
    if (!ok) return;
    try { setPeriodo(await api.post(`/nomina/periodos/${id}/recalcular`, {})); notify("Recibos recalculados.", "success"); } catch (err) { notify(err.message, "error"); }
  }

  async function pagarTodos() {
    if (exigirMontos()) return;
    const ok = await confirmDialog(`¿Marcar como pagados todos los recibos pendientes por ${m(pendienteTotal)}?`, { title: "Pagar recibos", confirmar: "Sí, pagar", exito: true });
    if (!ok) return;
    try { setPeriodo(await api.post(`/nomina/periodos/${id}/pagar`, {})); notify("Periodo pagado.", "success"); } catch (err) { notify(err.message, "error"); }
  }

  const descargarRecibo = (r) => descargarReciboPdf(r, notify);

  async function pagar(r) {
    const nombre = r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `empleado #${r.id_empleado}`;
    if (exigirMontos()) return;
    const ok = await confirmDialog(`¿Marcar como pagado el recibo de ${nombre} por ${m(r.total_pagar)}?`, { title: "Pagar recibo", confirmar: "Sí, pagar", exito: true });
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
    const ok = await confirmDialog("Este recibo está marcado como pagado. ¿Regresarlo a pendiente?", { title: "Reabrir recibo", confirmar: "Sí, reabrir" });
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
  const nombreDe = nombreEmpleado;
  const pendientes = recibos.length - pagados;
  const paso = periodo.status === "pagado" ? 3 : pagados > 0 ? 3 : 2; // 1 calcular · 2 revisar · 3 pagar

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/nomina" /> {nombrePeriodo(periodo)}</h1>
          <div className="subtitle">
            <Link to="/nomina">← Nómina</Link> · {fechaCorta(periodo.fecha_inicio)} — {fechaCorta(periodo.fecha_fin)} ·{" "}
            <span className={`badge ${periodo.status === "pagado" ? "badge-teal" : "badge-warn"}`}>{periodo.status === "pagado" ? "Pagado" : "Abierto"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ControlMontos />
          {puedeEditar && periodo.status !== "pagado" && (<>
            <button className="btn btn-secondary" onClick={recalcular}>Recalcular</button>
            <button className="btn btn-primary" onClick={pagarTodos} disabled={pendienteTotal <= 0}>Pagar todo ({m(pendienteTotal)})</button>
          </>)}
        </div>
      </div>

      <ol className="nom-pasos" aria-label="Pasos de la nómina">
        <li className="listo"><span><Icono nombre="check" size={16} /></span><div><b>1 · Calcular</b><small>Los recibos ya se generaron con sueldos y comisiones</small></div></li>
        <li className={paso === 2 && periodo.status !== "pagado" ? "activo" : "listo"}><span>{paso === 2 && periodo.status !== "pagado" ? "2" : <Icono nombre="check" size={16} />}</span><div><b>2 · Revisar</b><small>Ajusta faltas, horas extra, bonos y préstamos de cada empleado</small></div></li>
        <li className={periodo.status === "pagado" ? "listo" : paso === 3 ? "activo" : ""}><span>{periodo.status === "pagado" ? <Icono nombre="check" size={16} /> : "3"}</span><div><b>3 · Pagar</b><small>{pagados} de {recibos.length} recibos pagados</small></div></li>
      </ol>

      <div className="kpi-grid" style={{ marginBottom: 12 }}>
        <div className="kpi-card"><div className="kpi-label">Total a pagar (neto) <OjoMontos /></div><div className="kpi-value">{m(total)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Pendiente de pago <OjoMontos /></div><div className="kpi-value">{m(pendienteTotal)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Empleados</div><div className="kpi-value">{recibos.length}{pendientes > 0 ? ` · ${pendientes} sin pagar` : ""}</div></div>
      </div>
      <details className="nom-ayuda">
        <summary>¿Cómo se calcula el neto?</summary>
        <p><b>Sueldo del periodo</b> = sueldo neto mensual × días del periodo ÷ 30 (semana 7/30, quincena 15/30). Horas extra = horas × (sueldo mensual ÷ 30 ÷ 8) × 2.
          Más detalle en <Link to="/avisos-legales">Avisos legales</Link>.</p>
        <p><b>Neto</b> = Sueldo + Extras (horas extra dobles, comisiones, destajo, bonos) − Descuentos (faltas, préstamos, otras deducciones) − Retenciones (ISR e IMSS).
          Este periodo: percepciones {m(percepcionesTotal)} · retenciones {m(retenciones)}. Las comisiones salen de las órdenes cerradas y se pueden editar en «Ajustar».</p>
      </details>

      <div className="panel">
        <DataTable
          columns={[
            { key: "empleado", label: "Empleado", render: nombreDe },
            { key: "sueldo_base", label: "Sueldo", render: (r) => m(r.sueldo_base) },
            { key: "comisiones", label: "Comisiones", render: (r) => (r.comisiones > 0 ? `+${m(r.comisiones)}` : "—") },
            { key: "extras", label: "Otros extras", render: (r) => { const t = (r.pago_horas_extra || 0) + (r.destajo || 0) + (r.bonos || 0); return t > 0 ? `+${m(t)}` : "—"; } },
            { key: "descuentos", label: "Descuentos", render: (r) => (r.total_deducciones + r.descuento_faltas > 0 ? `-${m(r.total_deducciones + r.descuento_faltas)}` : "—") },
            { key: "total_pagar", label: "Neto a pagar", render: (r) => <strong>{m(r.total_pagar)}</strong> },
            { key: "pagado", label: "Estatus", render: (r) => <span className={`badge ${r.pagado ? "badge-teal" : "badge-warn"}`}>{r.pagado ? "Pagado" : "Pendiente"}</span> },
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
          emptyMessage="No hay empleados con sueldo base configurado. Captura el sueldo en Empleados y luego pulsa Recalcular para que aparezcan aquí."
        />
      </div>

      {editando && (
        <FormModal
          title={`Ajustar recibo — ${nombreDe(editando)}`}
          icono="💳"
          subtitulo={`Sueldo ${m(editando.sueldo_base)} · ISR ${m((editando.isr || 0) - (editando.subsidio || 0))} · IMSS ${m(editando.imss)}. Todo se recalcula solo.`}
          fields={CAMPOS_AJUSTE}
          grupos={GRUPOS_AJUSTE}
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
