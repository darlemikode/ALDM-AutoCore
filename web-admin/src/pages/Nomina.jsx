import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getToken } from "../api";
import DataTable from "../components/DataTable";
import { useMontos, ControlMontos, OjoMontos } from "../components/MontosNomina";
import NominaLoteModal from "../components/NominaLoteModal";
import NominaPeriodoModal from "../components/NominaPeriodoModal";
import { createPortal } from "react-dom";
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


// ---- Generar varios periodos de golpe ----
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
// Vista previa del lote: misma regla que el servidor (inicio → fin sugerido → siguiente día)
function previewLote(rango, periodicidad, dia, existentes) {
  const [d, h] = rangoDe(rango);
  const out = [];
  let ini = parse(d);
  const limite = parse(h);
  for (let i = 0; i < 150 && ini <= limite; i++) {
    const fin = parse(calcularFin(periodicidad, dia, iso(ini)));
    const a = iso(ini), b = iso(fin);
    const p = { fecha_inicio: a, fecha_fin: b, periodicidad };
    out.push({
      inicio: a, fin: b, nombre: nombrePeriodo(p), rangoTxt: `${fechaCorta(a)} — ${fechaCorta(b)}`,
      existe: existentes.some((e) => e.periodicidad === periodicidad && String(e.fecha_inicio).slice(0, 10) <= b && String(e.fecha_fin).slice(0, 10) >= a),
    });
    ini = sumar(fin, 1);
  }
  return out;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
// Nombre claro del periodo: "Quincena 16–31 oct", "Semana 20–26 oct", "Octubre 2026"
export function nombrePeriodo(p) {
  const a = parse(p.fecha_inicio), b = parse(p.fecha_fin);
  if (!a || !b) return "";
  if (p.periodicidad === "mensual" && a.getUTCDate() === 1) return `${MESES_LARGO[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  const rango = a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MESES[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MESES[a.getUTCMonth()]} – ${b.getUTCDate()} ${MESES[b.getUTCMonth()]}`;
  return `${p.periodicidad === "semanal" ? "Semana" : p.periodicidad === "quincenal" ? "Quincena" : "Periodo"} ${rango}`;
}
export const nombreEmpleado = (r) => (r.empleado ? `${r.empleado.nombre} ${r.empleado.paterno || ""}`.trim() : `Empleado #${r.id_empleado}`);

export async function descargarReciboPdf(r, notify) {
  try {
    const res = await fetch(`/api/nomina/recibos/${r.id_recibo}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error("No se pudo generar el recibo.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `Nomina ${nombreEmpleado(r)}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (err) { notify(err.message, "error"); }
}

export default function Nomina() {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [motivoBorrar, setMotivoBorrar] = useState("");
  const [lote, setLote] = useState(false);
  const { m } = useMontos();
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

  function eliminar(p) { setBorrando(p); setMotivoBorrar(""); }
  function eliminarFuturos() { setBorrando({ futuros: true }); setMotivoBorrar(""); }

  async function confirmarEliminar() {
    const p = borrando;
    try {
      if (p.futuros) {
        const ids = proximos.map((x) => x.id_periodo);
        const r = await api.post("/nomina/periodos/eliminar-futuros", { motivo: motivoBorrar.trim(), ids });
        notify(`${r.borrados} periodo(s) eliminado(s). Quedó registrado en Auditoría.`, "success");
      } else {
        await api.del(`/nomina/periodos/${p.id_periodo}?motivo=${encodeURIComponent(motivoBorrar.trim())}`);
        notify("Periodo eliminado. Quedó registrado en Auditoría.", "success");
      }
      setBorrando(null);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  const totalPeriodo = (p) => (p.recibos || []).reduce((a, r) => a + (r.total_pagar || 0), 0);
  const pagadosDe = (p) => (p.recibos || []).filter((r) => r.pagado).length;

  // --- Qué toca pagar: periodos abiertos (primero los que ya terminaron y faltan por pagar) ---
  const [pestana, setPestana] = useState("pagar");
  const [abierto, setAbierto] = useState(null); // empleado expandido en "Por empleado"
  const [generando, setGenerando] = useState(false);
  const hoyS = hoy();
  const dia = (f) => String(f).slice(0, 10);
  const porPagar = periodos.filter((p) => p.status !== "pagado").sort((x, y) => dia(y.fecha_inicio).localeCompare(dia(x.fecha_inicio)));
  const estadoPeriodo = (p) => (dia(p.fecha_fin) < hoyS ? { t: "Terminó · falta pagar", c: "urgente" } : dia(p.fecha_inicio) <= hoyS ? { t: "En curso", c: "curso" } : { t: "Próximo", c: "proximo" });
  const ultimo = periodos.reduce((m, p) => (!m || dia(p.fecha_fin) > dia(m.fecha_fin) ? p : m), null);
  const proximos = periodos.filter((p) => dia(p.fecha_inicio) > hoyS && p.status !== "pagado" && !(p.recibos || []).some((r) => r.pagado));
  const hayVigente = periodos.some((p) => dia(p.fecha_fin) >= hoyS);

  async function generarSiguiente() {
    if (!ultimo) return;
    setGenerando(true);
    try {
      const inicio = iso(sumar(parse(ultimo.fecha_fin), 1));
      await api.post("/nomina/periodos", {
        fecha_inicio: inicio, fecha_fin: calcularFin(ultimo.periodicidad, ultimo.dia_pago, inicio), periodicidad: ultimo.periodicidad,
        dia_pago: ultimo.dia_pago ?? 4, recurrente: !!ultimo.recurrente,
        empleados: (ultimo.empleados_ids || "").split(",").filter(Boolean).map(Number),
      });
      notify("Siguiente periodo generado con los recibos de cada empleado.", "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGenerando(false);
    }
  }

  // --- Por empleado: lo que se le ha pagado a cada persona ---
  const porEmpleado = (() => {
    const m = new Map();
    periodos.forEach((p) => (p.recibos || []).forEach((r) => {
      if (!m.has(r.id_empleado)) m.set(r.id_empleado, { id: r.id_empleado, nombre: nombreEmpleado(r), puesto: r.empleado?.puesto, recibos: [], pagado: 0, pendiente: 0 });
      const e = m.get(r.id_empleado);
      e.recibos.push({ ...r, periodo: p });
      if (r.pagado) e.pagado += r.total_pagar || 0; else e.pendiente += r.total_pagar || 0;
    }));
    m.forEach((e) => e.recibos.sort((x, y) => dia(y.periodo.fecha_inicio).localeCompare(dia(x.periodo.fecha_inicio))));
    return [...m.values()].sort((x, y) => x.nombre.localeCompare(y.nombre));
  })();

  const puedeCrear = hasPermission("nomina.crear");
  const nuevoConPeriodicidad = (periodicidad) => setCreando({ periodicidad });

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/nomina" /> Nómina</h1>
          <div className="subtitle">Qué toca pagar, a quién y cuánto</div>
        </div>
        {periodos.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ControlMontos />
            {puedeCrear && <>
            <button className="btn btn-secondary" onClick={() => setLote(true)} title="Crea de una vez todos los periodos del mes, trimestre o año">Generar varios</button>
            <button className="btn btn-primary btn-nuevo" onClick={() => setCreando(true)}>
              <span className="btn-nuevo-icono"><Icono nombre="cash" size={22} /><span className="btn-nuevo-mas">+</span></span>Nuevo periodo
            </button></>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="panel"><div className="loading-text">Cargando…</div></div>
      ) : periodos.length === 0 ? (
        <div className="panel nom-inicio">
          <h2>Empecemos: ¿cada cuándo les pagas a tus empleados?</h2>
          <p>Elige una opción y se crea el primer periodo con el recibo de cada empleado. Los siguientes se generan solos.</p>
          {puedeCrear ? (
            <div className="nom-opciones">
              {[["semanal", "Cada semana", "Se paga el día que elijas"], ["quincenal", "Cada quincena", "Días 15 y último del mes"], ["mensual", "Cada mes", "Un pago mensual"]].map(([v, t, d]) => (
                <button key={v} type="button" className="nom-opcion" onClick={() => nuevoConPeriodicidad(v)}>
                  <Icono nombre="cash" size={26} /><b>{t}</b><span>{d}</span>
                </button>
              ))}
            </div>
          ) : <div className="empty-state">Aún no hay periodos de nómina.</div>}
        </div>
      ) : (
        <>
          <div className="nom-tabs" role="tablist">
            {[["pagar", `Por pagar${porPagar.length ? ` (${porPagar.length})` : ""}`], ["historial", "Historial"], ["empleados", "Por empleado"]].map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={pestana === k} className={pestana === k ? "activo" : ""} onClick={() => setPestana(k)}>{t}</button>
            ))}
          </div>

          {pestana === "pagar" && (
            <div className="nom-pagar">
              {proximos.length > 1 && hasPermission("nomina.eliminar") && (
                <div className="nom-proximos-barra">
                  <span>Hay <b>{proximos.length}</b> periodos próximos que aún no empiezan. ¿Se generaron por error?</span>
                  <button type="button" className="btn btn-secondary nom-btn-borrar" onClick={eliminarFuturos}>Eliminar los {proximos.length} próximos</button>
                </div>
              )}
              {porPagar.length === 0 && (
                <div className="panel nom-todo-pagado"><Icono nombre="check" size={28} /><div><b>Todo al corriente</b><span>No hay periodos pendientes de pago.</span></div></div>
              )}
              {porPagar.map((p) => {
                const est = estadoPeriodo(p);
                const n = (p.recibos || []).length, pg = pagadosDe(p);
                const fp = fechaPago(p);
                return (
                  <div key={p.id_periodo} className={`panel nom-card ${est.c}`}>
                    <div className="nom-card-cab">
                      <div>
                        <span className={`nom-estado ${est.c}`}>{est.t}</span>
                        <h2>{nombrePeriodo(p)}</h2>
                        <small>{fechaCorta(p.fecha_inicio)} — {fechaCorta(p.fecha_fin)}{fp ? ` · se paga ${fp}` : ""}</small>
                      </div>
                      <div className="nom-total"><span>Total a pagar <OjoMontos /></span><b>{m(totalPeriodo(p))}</b></div>
                    </div>
                    <div className="nom-progreso" aria-label={`${pg} de ${n} recibos pagados`}><div style={{ width: `${n ? (pg / n) * 100 : 0}%` }} /></div>
                    <div className="nom-card-pie">
                      <span>{n} empleado(s) · {pg} de {n} recibos pagados</span>
                      <div className="nom-card-acciones">
                        {pg === 0 && hasPermission("nomina.editar") && <button type="button" className="btn btn-secondary" onClick={() => setEditando(p)}>Editar</button>}
                        {pg === 0 && hasPermission("nomina.eliminar") && <button type="button" className="btn btn-secondary nom-btn-borrar" onClick={() => eliminar(p)}>Eliminar</button>}
                        <Link className="btn btn-primary" to={`/nomina/${p.id_periodo}`}>Revisar y pagar <span aria-hidden="true">→</span></Link>
                      </div>
                    </div>
                  </div>
                );
              })}
              {puedeCrear && !hayVigente && ultimo && (
                <div className="panel nom-siguiente">
                  <div><b>No hay un periodo en curso</b><span>Genera el siguiente con la misma configuración ({ultimo.periodicidad}).</span></div>
                  <button className="btn btn-secondary" onClick={generarSiguiente} disabled={generando}>{generando ? "Generando…" : "Generar siguiente periodo"}</button>
                </div>
              )}
            </div>
          )}

          {pestana === "historial" && (
            <div className="panel">
              <DataTable
                columns={[
                  { key: "periodo", label: "Periodo", render: (p) => <Link to={`/nomina/${p.id_periodo}`}>{nombrePeriodo(p)}</Link> },
                  { key: "fechas", label: "Fechas", render: (p) => `${fechaCorta(p.fecha_inicio)} — ${fechaCorta(p.fecha_fin)}` },
                  { key: "pago", label: "Se paga", render: (p) => { const d = fechaPago(p); return d ? `${d}${p.recurrente ? " · se repite" : ""}` : ""; } },
                  { key: "recibos", label: "Pagados", render: (p) => `${pagadosDe(p)} / ${(p.recibos || []).length}` },
                  { key: "total", label: "Total a pagar", render: (p) => m(totalPeriodo(p)) },
                  { key: "status", label: "Estado", render: (p) => <span className={`badge ${p.status === "pagado" ? "badge-teal" : "badge-warn"}`}>{p.status === "pagado" ? "Pagado" : "Abierto"}</span> },
                ]}
                rows={[...periodos].sort((x, y) => dia(y.fecha_inicio).localeCompare(dia(x.fecha_inicio)))}
                onEdit={hasPermission("nomina.editar") ? (p) => setEditando(p) : undefined}
                onDelete={hasPermission("nomina.eliminar") ? eliminar : undefined}
                emptyMessage="Aún no hay periodos de nómina."
              />
            </div>
          )}

          {pestana === "empleados" && (
            <div className="panel nom-empleados">
              {porEmpleado.length === 0 ? <div className="empty-state">Todavía no hay recibos.</div> : porEmpleado.map((e) => (
                <div key={e.id} className="nom-emp">
                  <button type="button" className="nom-emp-cab" onClick={() => setAbierto(abierto === e.id ? null : e.id)} aria-expanded={abierto === e.id}>
                    <span className="nom-avatar">{e.nombre.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
                    <span className="nom-emp-nombre"><b>{e.nombre}</b>{e.puesto && <small>{e.puesto}</small>}</span>
                    <span className="nom-emp-cifra"><small>Pagado</small><b>{m(e.pagado)}</b></span>
                    <span className="nom-emp-cifra"><small>Pendiente</small><b>{m(e.pendiente)}</b></span>
                    <Icono nombre={abierto === e.id ? "chevron-up" : "chevron-down"} size={18} />
                  </button>
                  {abierto === e.id && (
                    <div className="nom-emp-lista">
                      {e.recibos.map((r) => (
                        <div key={r.id_recibo} className="nom-emp-fila">
                          <Link to={`/nomina/${r.periodo.id_periodo}`}>{nombrePeriodo(r.periodo)}</Link>
                          <b>{m(r.total_pagar)}</b>
                          <span className={`badge ${r.pagado ? "badge-teal" : "badge-warn"}`}>{r.pagado ? "Pagado" : "Pendiente"}</span>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => descargarReciboPdf(r, notify)}>Recibo PDF</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {creando && (
        <NominaPeriodoModal
          titulo="Nuevo periodo de nómina"
          subtitulo="Se crea un recibo por cada empleado elegido (o por todos)."
          inicial={(() => { const per = creando?.periodicidad || "quincenal"; return { periodicidad: per, dia_pago: "4", recurrente: true, fecha_inicio: hoy(), fecha_fin: calcularFin(per, 4, hoy()), empleados: [] }; })()}
          empleados={empleados}
          calcularFin={calcularFin}
          onSubmit={crear}
          onClose={() => setCreando(false)}
        />
      )}
      {editando && (
        <NominaPeriodoModal
          titulo="Editar periodo de nómina"
          subtitulo="Con recibos ya pagados solo se puede cambiar la repetición. Al corregir, los recibos se regeneran con los datos actuales."
          pedirMotivo
          inicial={{ ...editando, fecha_inicio: String(editando.fecha_inicio).slice(0, 10), fecha_fin: String(editando.fecha_fin).slice(0, 10), dia_pago: String(editando.dia_pago ?? 4), empleados: (editando.empleados_ids || "").split(",").filter(Boolean).map(Number) }}
          empleados={empleados}
          calcularFin={calcularFin}
          onSubmit={guardarEdicion}
          onClose={() => setEditando(null)}
        />
      )}
      {borrando && createPortal(
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setBorrando(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <h2 style={{ fontSize: 20 }}>{borrando.futuros ? `Eliminar ${proximos.length} periodo(s) próximos` : "Eliminar periodo"}</h2>
            <div className="modal-subtitulo">{borrando.futuros
              ? "Se borran todos los periodos que aún no empiezan y sus recibos. Los que ya tienen pagos no se tocan."
              : `${nombrePeriodo(borrando)} · ${fechaCorta(borrando.fecha_inicio)} — ${fechaCorta(borrando.fecha_fin)}. Se borran también sus recibos.`}</div>
            <div className="np-motivo">
              <label>Motivo <span className="req">*</span></label>
              <textarea rows={2} autoFocus placeholder="Ej. Periodo duplicado por error de captura." value={motivoBorrar} onChange={(e) => setMotivoBorrar(e.target.value)} />
              <small>🔒 Queda registrado en Auditoría con tu usuario, fecha y hora.</small>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBorrando(null)}>Cancelar</button>
              <button type="button" className="btn btn-danger" disabled={motivoBorrar.trim().length < 5} onClick={confirmarEliminar}>Eliminar periodo</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {lote && (
        <NominaLoteModal
          empleados={empleados}
          generar={(r, per, dia) => previewLote(r, per, dia, periodos)}
          onSubmit={generarLote}
          onClose={() => setLote(false)}
        />
      )}
      <div className="nom-aviso-legal">Los cálculos de nómina son un estimado operativo. <Link to="/avisos-legales">Avisos legales</Link></div>
    </>
  );
}
