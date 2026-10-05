import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import DataTable from "../components/DataTable";
import FormModal from "../components/FormModal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";
import { Icono } from "../components/Icono";

export const dinero = (n) => `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fechaCorta = (f) => (f ? new Date(`${String(f).slice(0, 10)}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "");

const NOMBRES_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
// Primer día >= fecha_fin que cae en el día de pago elegido
export function fechaPago(p) {
  if (p.dia_pago == null) return "";
  const d = new Date(`${String(p.fecha_fin).slice(0, 10)}T00:00:00`);
  while ((d.getDay() + 6) % 7 !== p.dia_pago) d.setDate(d.getDate() + 1);
  return `${NOMBRES_DIA[p.dia_pago]} ${d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`;
}

// ---- Fechas (UTC, sin depender de la zona horaria) ----
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (t) => (/^\d{4}-\d{2}-\d{2}/.test(String(t || "")) ? new Date(`${String(t).slice(0, 10)}T00:00:00Z`) : null);
const hoy = () => { const d = new Date(); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
const sumar = (d, n) => new Date(d.getTime() + n * 86400000);
const finDeMes = (y, m) => new Date(Date.UTC(y, m + 1, 0));

// Fecha fin sugerida según periodicidad, día de pago (semanal) y fecha de inicio.
function calcularFin(periodicidad, diaPago, inicio) {
  const d = parse(inicio);
  if (!d) return "";
  if (periodicidad === "semanal") {
    const dow = (d.getUTCDay() + 6) % 7;
    let falta = (Number(diaPago ?? 4) - dow + 7) % 7;
    if (falta === 0) falta = 7;
    return iso(sumar(d, falta));
  }
  if (periodicidad === "quincenal") {
    return d.getUTCDate() <= 14 ? iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15))) : iso(finDeMes(d.getUTCFullYear(), d.getUTCMonth()));
  }
  if (d.getUTCDate() === 1) return iso(finDeMes(d.getUTCFullYear(), d.getUTCMonth()));
  return iso(sumar(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())), -1));
}
const recalcular = (v) => ({ fecha_fin: calcularFin(v.periodicidad, v.dia_pago, v.fecha_inicio) });

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const PERIODICIDADES = [
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal (15 y fin de mes)" },
  { value: "mensual", label: "Mensual" },
];

const camposPeriodo = (empleados) => (v) => {
  const ini = parse(v.fecha_inicio), fin = parse(v.fecha_fin);
  const invalido = ini && fin && fin < ini;
  const dias = ini && fin && !invalido ? Math.round((fin - ini) / 86400000) + 1 : null;
  return [
    { name: "periodicidad", label: "¿Cada cuándo se paga?", type: "select", required: true, options: PERIODICIDADES, onElegir: (_, n) => recalcular(n) },
    ...(v.periodicidad === "semanal" ? [{
      name: "dia_pago", label: "¿Qué día de la semana se paga?", type: "select", required: true,
      options: DIAS.map((l, i) => ({ value: String(i), label: l })), onElegir: (_, n) => recalcular(n),
    }] : []),
    { name: "fecha_inicio", label: "Empieza el", type: "date", required: true, onElegir: (_, n) => recalcular(n) },
    {
      name: "fecha_fin", label: "Termina el", type: "date", required: true,
      hint: invalido ? "⚠ Debe ser igual o posterior a la fecha de inicio." : dias ? `Se calcula sola · ${dias} día(s) de periodo` : "Se calcula sola al elegir inicio y periodicidad.",
    },
    {
      name: "empleados", label: "¿A quién se le paga?", type: "multiselect", options: empleados,
      hint: (v.empleados || []).length ? `${v.empleados.length} empleado(s) elegido(s)` : "Sin elegir = todos los empleados que cobran.",
    },
    { name: "recurrente", label: "Repetir automáticamente cada periodo", type: "checkbox" },
  ];
};

// ---- Generar varios periodos de golpe ----
const RANGOS = [
  { value: "mes", label: "Este mes" }, { value: "mes_sig", label: "Próximo mes" }, { value: "trimestre", label: "Este trimestre" },
  { value: "semestre", label: "Este semestre" }, { value: "anio", label: "Todo el año" },
];
function rangoDe(clave) {
  const h = new Date();
  const y = h.getFullYear(), m = h.getMonth();
  const u = (yy, mm, dd) => iso(new Date(Date.UTC(yy, mm, dd)));
  if (clave === "mes_sig") return [u(y, m + 1, 1), u(y, m + 2, 0)];
  if (clave === "trimestre") { const q = Math.floor(m / 3) * 3; return [u(y, q, 1), u(y, q + 3, 0)]; }
  if (clave === "semestre") { const q = m < 6 ? 0 : 6; return [u(y, q, 1), u(y, q + 6, 0)]; }
  if (clave === "anio") return [u(y, 0, 1), u(y, 12, 0)];
  return [u(y, m, 1), u(y, m + 1, 0)];
}
const camposLote = (empleados) => (v) => {
  const [d, h] = rangoDe(v.rango || "mes");
  const dias = Math.round((parse(h) - parse(d)) / 86400000) + 1;
  const aprox = v.periodicidad === "semanal" ? Math.ceil(dias / 7) : v.periodicidad === "quincenal" ? Math.round(dias / 15.2) : Math.round(dias / 30.4);
  return [
    { name: "rango", label: "¿Qué tanto quieres generar?", type: "select", required: true, options: RANGOS, hint: `Del ${d} al ${h} · aprox. ${aprox} periodo(s)` },
    { name: "periodicidad", label: "¿Cada cuándo se paga?", type: "select", required: true, options: PERIODICIDADES },
    ...(v.periodicidad === "semanal" ? [{ name: "dia_pago", label: "¿Qué día de la semana se paga?", type: "select", required: true, options: DIAS.map((l, i) => ({ value: String(i), label: l })) }] : []),
    { name: "empleados", label: "¿A quién se le paga?", type: "multiselect", options: empleados, hint: "Sin elegir = todos los empleados que cobran. Los periodos que ya existan en esas fechas se respetan." },
  ];
};

export default function Nomina() {
  const { confirmDialog, notify } = useUI();
  const { hasPermission } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [lote, setLote] = useState(false);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setPeriodos(await api.get("/nomina/periodos"));
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.get("/empleados/").then((l) => setEmpleados((l || [])
      .filter((e) => ["activo", "vacaciones", "incapacidad"].includes(e.estatus))
      .map((e) => ({ value: e.id_empleado, label: `${e.nombre} ${e.paterno || ""}`.trim() })))).catch(() => setEmpleados([]));
  }, []);

  const cuerpo = (v) => {
    if (parse(v.fecha_fin) < parse(v.fecha_inicio)) throw new Error("La fecha de fin debe ser igual o posterior a la de inicio.");
    return { ...v, dia_pago: Number(v.dia_pago ?? 4), recurrente: !!v.recurrente, empleados: (v.empleados || []).map(Number) };
  };

  async function crear(values) {
    await api.post("/nomina/periodos", cuerpo(values));
    notify("Periodo creado: se generó el recibo de cada empleado.", "success");
    setCreando(false);
    load();
  }

  async function guardarEdicion(values) {
    await api.put(`/nomina/periodos/${editando.id_periodo}`, cuerpo(values));
    notify("Periodo actualizado.", "success");
    setEditando(null);
    load();
  }

  async function generarLote(v) {
    const [desde, hasta] = rangoDe(v.rango || "mes");
    const r = await api.post("/nomina/periodos/lote", {
      desde, hasta, periodicidad: v.periodicidad, dia_pago: Number(v.dia_pago ?? 4), empleados: (v.empleados || []).map(Number),
    });
    notify(`${r.creados} periodo(s) creado(s)${r.omitidos ? ` · ${r.omitidos} ya existían` : ""}.`, "success");
    setLote(false);
    load();
  }

  async function eliminar(p) {
    const ok = await confirmDialog(`¿Eliminar el periodo ${fechaCorta(p.fecha_inicio)} — ${fechaCorta(p.fecha_fin)} y sus recibos?`, { danger: true });
    if (!ok) return;
    try {
      await api.del(`/nomina/periodos/${p.id_periodo}`);
      notify("Periodo eliminado.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const totalPeriodo = (p) => (p.recibos || []).reduce((a, r) => a + (r.total_pagar || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/nomina" /> Nómina</h1>
          <div className="subtitle">Periodos de pago y recibos de los empleados</div>
        </div>
        {hasPermission("nomina.crear") && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={() => setLote(true)}>Generar varios</button>
            <button className="btn btn-primary btn-nuevo" onClick={() => setCreando(true)}>
              <span className="btn-nuevo-icono"><Icono nombre="cash" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo periodo
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-text">Cargando…</div>
        ) : (
          <DataTable
            columns={[
              { key: "periodo", label: "Periodo", render: (p) => <Link to={`/nomina/${p.id_periodo}`}>{fechaCorta(p.fecha_inicio)} — {fechaCorta(p.fecha_fin)}</Link> },
              { key: "periodicidad", label: "Periodicidad", render: (p) => p.periodicidad[0].toUpperCase() + p.periodicidad.slice(1) },
              { key: "pago", label: "Se paga", render: (p) => { const d = fechaPago(p); return d ? `${d}${p.recurrente ? " · se repite" : ""}` : ""; } },
              { key: "recibos", label: "Recibos", render: (p) => (p.recibos || []).length },
              { key: "total", label: "Total a pagar", render: (p) => dinero(totalPeriodo(p)) },
              { key: "status", label: "Estado", render: (p) => <span className={`badge ${p.status === "pagado" ? "badge-teal" : "badge-warn"}`}>{p.status === "pagado" ? "Pagado" : "Abierto"}</span> },
            ]}
            rows={periodos}
            onEdit={hasPermission("nomina.editar") ? (p) => setEditando(p) : undefined}
            onDelete={hasPermission("nomina.eliminar") ? eliminar : undefined}
            emptyMessage="Aún no hay periodos de nómina. Crea el primero con el botón de arriba."
          />
        )}
      </div>

      {creando && (
        <FormModal
          title="Nuevo periodo de nómina"
          icono="💳"
          subtitulo="Se genera un recibo por cada empleado elegido (o todos)."
          fields={camposPeriodo(empleados)}
          initialValues={{ periodicidad: "quincenal", dia_pago: "4", recurrente: true, fecha_inicio: hoy(), fecha_fin: calcularFin("quincenal", 4, hoy()), empleados: [] }}
          onSubmit={crear}
          onClose={() => setCreando(false)}
        />
      )}
      {editando && (
        <FormModal
          title="Editar periodo de nómina"
          icono="💳"
          subtitulo="Con recibos ya pagados solo se puede cambiar la repetición."
          fields={camposPeriodo(empleados)}
          initialValues={{ ...editando, dia_pago: String(editando.dia_pago ?? 4), empleados: (editando.empleados_ids || "").split(",").filter(Boolean).map(Number) }}
          onSubmit={guardarEdicion}
          onClose={() => setEditando(null)}
        />
      )}
      {lote && (
        <FormModal
          title="Generar varios periodos"
          icono="💳"
          subtitulo="Crea de una vez todos los periodos del mes, trimestre, semestre o año."
          fields={camposLote(empleados)}
          initialValues={{ rango: "mes", periodicidad: "semanal", dia_pago: "4", empleados: [] }}
          onSubmit={generarLote}
          onClose={() => setLote(false)}
        />
      )}
    </>
  );
}
