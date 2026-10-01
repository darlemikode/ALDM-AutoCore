import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, getToken } from "../api";
import DataTable from "../components/DataTable";
import ModalPortal from "../components/ModalPortal";
import { useUI } from "../context/UIContext";
import { useAuth } from "../context/AuthContext";
import IconoModulo from "../components/IconoModulo";

/**
 * Facturación electrónica (CFDI 4.0).
 * - Facturas: listado, descarga de PDF/XML, cancelación ante el SAT.
 * - Emitir: desde una orden de servicio (precargada) o manual.
 * - Configuración fiscal: datos del emisor, serie/folio, claves SAT y PAC.
 */

const RFC_GENERICO = "XAXX010101000";

const ESTADO_BADGE = {
  timbrada: ["badge-teal", "Timbrada"],
  cancelacion_pendiente: ["badge-amber", "Cancelación pendiente"],
  cancelada: ["badge-red", "Cancelada"],
};

const MODO_PAC = {
  simulado: ["badge-grey", "Modo simulado — sin validez fiscal"],
  pruebas: ["badge-blue", "Facturapi · pruebas (no llega al SAT)"],
  produccion: ["badge-teal", "Facturapi · producción"],
  sin_llave: ["badge-red", "Facturapi sin llave configurada"],
};

function fmt(n) {
  return (n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function descargar(factura, tipo, notify) {
  try {
    const res = await fetch(`/api/facturacion/facturas/${factura.id_factura}/${tipo}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || "No se pudo descargar el archivo.");
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `factura-${factura.serie}${factura.folio}.${tipo}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    notify(err.message, "error");
  }
}

export default function Facturacion() {
  const { notify } = useUI();
  const { hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("facturas");
  const [facturas, setFacturas] = useState([]);
  const [catalogos, setCatalogos] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [emitiendo, setEmitiendo] = useState(null); // datos iniciales del modal de emisión
  const [cancelando, setCancelando] = useState(null);
  const [eligiendoOrden, setEligiendoOrden] = useState(false);

  const puedeEmitir = hasPermission("facturacion.crear");
  const puedeCancelar = hasPermission("facturacion.cancelar");
  const puedeConfigurar = hasPermission("facturacion.configurar");

  async function load() {
    const [f, c, cfg] = await Promise.all([
      api.get("/facturacion/facturas"),
      api.get("/facturacion/catalogos"),
      api.get("/facturacion/configuracion"),
    ]);
    setFacturas(f);
    setCatalogos(c);
    setConfig(cfg);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err) => { notify(err.message, "error"); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirOrden(idServicio) {
    api.get(`/facturacion/prefactura/servicio/${idServicio}`)
      .then((pre) => {
        if (pre.factura_existente) {
          notify("Esta orden ya tiene una factura vigente.", "error");
          return;
        }
        setEligiendoOrden(false);
        setEmitiendo({ ...pre, guardar_datos_cliente: true });
      })
      .catch((err) => notify(err.message, "error"));
  }

  // Llegada desde "Facturar" en una orden de servicio
  useEffect(() => {
    const idServicio = location.state?.idServicio;
    if (!idServicio) return;
    navigate(location.pathname, { replace: true, state: null });
    abrirOrden(idServicio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return facturas.filter((f) =>
      (!filtroEstado || f.estado === filtroEstado) &&
      (!q || f.receptor_nombre.toLowerCase().includes(q) || f.receptor_rfc.toLowerCase().includes(q) ||
        (f.uuid || "").toLowerCase().includes(q) || `${f.serie}${f.folio}`.toLowerCase().includes(q))
    );
  }, [facturas, filtroEstado, busqueda]);

  const resumenMes = useMemo(() => {
    const hoy = new Date();
    const delMes = facturas.filter((f) => {
      const d = new Date(f.fecha_emision);
      return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
    });
    const vigentes = delMes.filter((f) => f.estado === "timbrada");
    return {
      emitidas: vigentes.length,
      total: vigentes.reduce((s, f) => s + f.total, 0),
      iva: vigentes.reduce((s, f) => s + f.iva, 0),
      canceladas: delMes.filter((f) => f.estado !== "timbrada").length,
    };
  }, [facturas]);

  async function actualizarEstado(f) {
    try {
      const nueva = await api.post(`/facturacion/facturas/${f.id_factura}/actualizar-estado`);
      notify(`Estado: ${ESTADO_BADGE[nueva.estado]?.[1] || nueva.estado}`, "success");
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  if (loading) return <div className="loading-text">Cargando…</div>;
  if (!config || !catalogos) return <div className="empty-state">No se pudo cargar la facturación.</div>;

  const [modoClase, modoTexto] = MODO_PAC[config.pac_modo] || MODO_PAC.simulado;

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/facturacion" /> Facturación electrónica</h1>
          <div className="subtitle">
            CFDI 4.0 de ingreso · <span className={`badge ${modoClase}`}>{modoTexto}</span>
          </div>
        </div>
        {puedeEmitir && tab === "facturas" && (
          <button className="btn btn-primary" onClick={() => setEligiendoOrden(true)}>
            ➕ Facturar orden
          </button>
        )}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Facturas vigentes del mes</div><div className="kpi-value">{resumenMes.emitidas}</div></div>
        <div className="kpi-card ok"><div className="kpi-label">Facturado este mes</div><div className="kpi-value">{fmt(resumenMes.total)}</div></div>
        <div className="kpi-card"><div className="kpi-label">IVA trasladado del mes</div><div className="kpi-value">{fmt(resumenMes.iva)}</div></div>
        <div className={`kpi-card ${resumenMes.canceladas ? "alert" : ""}`}><div className="kpi-label">Canceladas del mes</div><div className="kpi-value">{resumenMes.canceladas}</div></div>
      </div>

      <div className="sa-tabs">
        <button type="button" className={`sa-tab ${tab === "facturas" ? "sa-tab-activo" : ""}`} onClick={() => setTab("facturas")}>🧾 Facturas</button>
        <button type="button" className={`sa-tab ${tab === "configuracion" ? "sa-tab-activo" : ""}`} onClick={() => setTab("configuracion")}>⚙️ Configuración fiscal</button>
      </div>

      {tab === "facturas" && (
        <div className="panel">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <input className="search-input" style={{ flex: 1, minWidth: 220 }} placeholder="🔍 Buscar por receptor, RFC, UUID o folio…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">Todos los estados</option>
              <option value="timbrada">Timbradas</option>
              <option value="cancelacion_pendiente">Cancelación pendiente</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          <DataTable
            columns={[
              { key: "folio", label: "Folio", render: (f) => (
                <>
                  <div style={{ fontWeight: 700 }}>{f.serie}-{f.folio}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-500)" }}>{f.uuid?.slice(0, 8)}…</div>
                </>
              ) },
              { key: "fecha", label: "Fecha", render: (f) => new Date(f.fecha_emision).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) },
              { key: "receptor", label: "Receptor", render: (f) => (
                <>
                  <div>{f.receptor_nombre}</div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-500)" }}>{f.receptor_rfc}</div>
                </>
              ) },
              { key: "orden", label: "Orden", render: (f) => (f.id_servicio ? <Link to={`/servicios/${f.id_servicio}`}>#{f.id_servicio}</Link> : "—") },
              { key: "total", label: "Total", render: (f) => <span className="mono">{fmt(f.total)}</span> },
              { key: "estado", label: "Estado", render: (f) => {
                const [cls, txt] = ESTADO_BADGE[f.estado] || ["badge-grey", f.estado];
                return (
                  <>
                    <span className={`badge ${cls}`}>{txt}</span>
                    {f.proveedor === "simulado" && <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 3 }}>Simulada</div>}
                  </>
                );
              } },
            ]}
            rows={filtradas.map((f) => ({ ...f, id: f.id_factura }))}
            extraActions={(f) => (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => descargar(f, "pdf", notify)}>PDF</button>
                <button className="btn btn-secondary btn-sm" onClick={() => descargar(f, "xml", notify)}>XML</button>
                {f.estado === "cancelacion_pendiente" && (
                  <button className="btn btn-secondary btn-sm" onClick={() => actualizarEstado(f)}>↻ Estado</button>
                )}
                {puedeCancelar && f.estado === "timbrada" && (
                  <button className="btn btn-danger btn-sm" onClick={() => setCancelando(f)}>Cancelar</button>
                )}
              </>
            )}
            emptyMessage={facturas.length ? "Ninguna factura coincide con el filtro." : "Aún no hay facturas. Usa “Facturar orden” para elegir una orden finalizada."}
          />
        </div>
      )}

      {tab === "configuracion" && (
        <ConfiguracionFiscal config={config} catalogos={catalogos} editable={puedeConfigurar} notify={notify} onGuardada={setConfig} />
      )}

      {emitiendo && (
        <EmitirModal
          inicial={emitiendo}
          catalogos={catalogos}
          config={config}
          notify={notify}
          onClose={() => setEmitiendo(null)}
          onEmitida={(f) => {
            setEmitiendo(null);
            notify(`Factura ${f.serie}-${f.folio} timbrada.`, "success");
            load();
          }}
        />
      )}

      {eligiendoOrden && (
        <SelectorOrdenes notify={notify} onElegir={abrirOrden} onClose={() => setEligiendoOrden(false)} />
      )}

      {cancelando && (
        <CancelarModal
          factura={cancelando}
          catalogos={catalogos}
          notify={notify}
          onClose={() => setCancelando(null)}
          onCancelada={(f) => {
            setCancelando(null);
            notify(f.estado === "cancelada" ? "Factura cancelada." : "Solicitud enviada: el receptor debe aceptar la cancelación.", "success");
            load();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Emisión
// ---------------------------------------------------------------------------
function EmitirModal({ inicial, catalogos, config, notify, onClose, onEmitida }) {
  const [form, setForm] = useState(() => ({
    id_servicio: inicial.id_servicio || null,
    id_cliente: inicial.id_cliente || null,
    receptor: { rfc: "", nombre: "", regimen_fiscal: "", cp: "", uso_cfdi: "G03", correo: "", ...inicial.receptor },
    forma_pago: inicial.forma_pago || "01",
    metodo_pago: inicial.metodo_pago || "PUE",
    iva_porcentaje: inicial.iva_porcentaje ?? config.iva_porcentaje,
    conceptos: inicial.conceptos || [],
    guardar_datos_cliente: inicial.guardar_datos_cliente ?? true,
  }));
  const [timbrando, setTimbrando] = useState(false);
  const [error, setError] = useState("");
  const publico = form.receptor.rfc === RFC_GENERICO;

  function setReceptor(campo, valor) {
    setForm((f) => ({ ...f, receptor: { ...f.receptor, [campo]: valor } }));
  }

  function alternarPublico(activo) {
    setForm((f) => ({
      ...f,
      receptor: activo
        ? { ...f.receptor, rfc: RFC_GENERICO, regimen_fiscal: "616", uso_cfdi: "S01", cp: config.cp_expedicion || "" }
        : { ...f.receptor, rfc: "", regimen_fiscal: "", uso_cfdi: "G03", cp: "" },
    }));
  }

  function setMetodo(metodo) {
    setForm((f) => ({
      ...f,
      metodo_pago: metodo,
      forma_pago: metodo === "PPD" ? "99" : f.forma_pago === "99" ? "01" : f.forma_pago,
    }));
  }

  function setConcepto(i, campo, valor) {
    setForm((f) => ({ ...f, conceptos: f.conceptos.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)) }));
  }

  function tipoConcepto(i, tipo) {
    const esPieza = tipo === "pieza";
    setForm((f) => ({
      ...f,
      conceptos: f.conceptos.map((c, j) => (j === i ? {
        ...c,
        clave_prod_serv: esPieza ? config.clave_prod_serv_refaccion : config.clave_prod_serv_mano_obra,
        clave_unidad: esPieza ? config.clave_unidad_pieza : config.clave_unidad_servicio,
        unidad: esPieza ? "Pieza" : "Servicio",
      } : c)),
    }));
  }

  const totales = useMemo(() => {
    const tasa = (Number(form.iva_porcentaje) || 0) / 100;
    let subtotal = 0;
    let iva = 0;
    for (const c of form.conceptos) {
      const importe = r2((Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0));
      subtotal += importe;
      iva += r2(importe * tasa);
    }
    return { subtotal: r2(subtotal), iva: r2(iva), total: r2(subtotal + iva) };
  }, [form.conceptos, form.iva_porcentaje]);

  async function timbrar(e) {
    e.preventDefault();
    setError("");
    setTimbrando(true);
    try {
      const payload = {
        ...form,
        iva_porcentaje: Number(form.iva_porcentaje) || 0,
        conceptos: form.conceptos.map((c) => ({ ...c, cantidad: Number(c.cantidad), precio_unitario: Number(c.precio_unitario) })),
      };
      const factura = await api.post("/facturacion/facturas", payload);
      onEmitida(factura);
    } catch (err) {
      setError(err.message);
    } finally {
      setTimbrando(false);
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !timbrando && onClose()}>
        <div className="modal" style={{ width: "94vw", maxWidth: 1100 }}>
          <div className="modal-header-icono">
            <div className="modal-avatar-icono" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}>📑</div>
            <div>
              <h2>Facturar orden #{form.id_servicio}</h2>
              <div className="modal-subtitulo">
                Serie {config.serie}, folio {config.folio_siguiente} · {config.pac_modo === "simulado" ? "modo simulado (sin validez fiscal)" : "se timbrará con Facturapi"}
              </div>
            </div>
          </div>

          <form onSubmit={timbrar}>
            <div className="nota-bloque">
              <div className="nota-bloque-header"><span className="icono">🏷️</span><h2>Receptor</h2></div>
              <div className="nota-bloque-body form-grid">
                <div className="field full">
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={publico} onChange={(e) => alternarPublico(e.target.checked)} style={{ width: "auto" }} />
                    Público en general (el cliente no dio RFC) — RFC {RFC_GENERICO}, régimen 616, uso S01
                  </label>
                </div>
                <div className="field">
                  <label>RFC</label>
                  <input value={form.receptor.rfc} disabled={publico} onChange={(e) => setReceptor("rfc", e.target.value.toUpperCase().trim())} maxLength={13} className="mono" />
                </div>
                <div className="field">
                  <label>Nombre o razón social (como en su constancia, sin “S.A. de C.V.”)</label>
                  <input value={form.receptor.nombre} onChange={(e) => setReceptor("nombre", e.target.value.toUpperCase())} />
                </div>
                <div className="field">
                  <label>Régimen fiscal</label>
                  <select value={form.receptor.regimen_fiscal} disabled={publico} onChange={(e) => setReceptor("regimen_fiscal", e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    {catalogos.regimenes_fiscales.map((r) => <option key={r.clave} value={r.clave}>{r.clave} · {r.descripcion}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>CP del domicilio fiscal</label>
                  <input value={form.receptor.cp} disabled={publico} maxLength={5} onChange={(e) => setReceptor("cp", e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="field">
                  <label>Uso del CFDI</label>
                  <select value={form.receptor.uso_cfdi} disabled={publico} onChange={(e) => setReceptor("uso_cfdi", e.target.value)}>
                    {catalogos.usos_cfdi.map((u) => <option key={u.clave} value={u.clave}>{u.clave} · {u.descripcion}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Correo (opcional)</label>
                  <input type="email" value={form.receptor.correo || ""} onChange={(e) => setReceptor("correo", e.target.value)} />
                </div>
                {form.id_cliente && !publico && (
                  <div className="field full">
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={form.guardar_datos_cliente} onChange={(e) => setForm((f) => ({ ...f, guardar_datos_cliente: e.target.checked }))} style={{ width: "auto" }} />
                      Guardar estos datos fiscales en el cliente para la próxima vez
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="nota-bloque acento-ambar">
              <div className="nota-bloque-header"><span className="icono">💳</span><h2>Pago</h2></div>
              <div className="nota-bloque-body form-grid">
                <div className="field">
                  <label>Método de pago</label>
                  <select value={form.metodo_pago} onChange={(e) => setMetodo(e.target.value)}>
                    {catalogos.metodos_pago.map((m) => <option key={m.clave} value={m.clave}>{m.clave} · {m.descripcion}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Forma de pago</label>
                  <select value={form.forma_pago} disabled={form.metodo_pago === "PPD"} onChange={(e) => setForm((f) => ({ ...f, forma_pago: e.target.value }))}>
                    {catalogos.formas_pago
                      .filter((fp) => (form.metodo_pago === "PPD" ? fp.clave === "99" : fp.clave !== "99"))
                      .map((fp) => <option key={fp.clave} value={fp.clave}>{fp.clave} · {fp.descripcion}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>IVA %</label>
                  <select value={form.iva_porcentaje} disabled title="Viene de la orden de servicio">
                    <option value={16}>16% (general)</option>
                    <option value={8}>8% (región fronteriza)</option>
                    <option value={0}>0% / no objeto</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="nota-bloque">
              <div className="nota-bloque-header">
                <span className="icono">🧩</span><h2>Conceptos</h2>
                <span className="field-hint" style={{ marginLeft: "auto", fontSize: 12 }}>
                  Cantidades e importes vienen de la orden · reábrela si necesitas cambiarlos
                </span>
              </div>
              <div className="nota-bloque-body fact-conceptos">
                <table>
                  <thead>
                    <tr><th style={{ width: 130 }}>Tipo</th><th>Descripción</th><th style={{ width: 120 }}>Clave SAT</th><th style={{ width: 60 }}>Cant.</th><th style={{ width: 120 }}>P. unitario</th><th style={{ width: 110 }}>Importe</th></tr>
                  </thead>
                  <tbody>
                    {form.conceptos.length === 0 && (
                      <tr><td colSpan={6} className="empty-state">La orden no tiene conceptos con importe — agrégalos en la orden antes de facturar.</td></tr>
                    )}
                    {form.conceptos.map((c, i) => (
                      <tr key={i}>
                        <td>
                          <select value={c.clave_unidad === config.clave_unidad_pieza ? "pieza" : "servicio"} onChange={(e) => tipoConcepto(i, e.target.value)}>
                            <option value="servicio">Servicio</option>
                            <option value="pieza">Refacción</option>
                          </select>
                        </td>
                        <td><input value={c.descripcion} onChange={(e) => setConcepto(i, "descripcion", e.target.value)} /></td>
                        <td><input className="mono" value={c.clave_prod_serv} maxLength={8} onChange={(e) => setConcepto(i, "clave_prod_serv", e.target.value.replace(/\D/g, ""))} /></td>
                        <td className="mono" style={{ textAlign: "right" }}>{c.cantidad}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmt(Number(c.precio_unitario) || 0)}</td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt(r2((Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="fact-totales">
                  <div><span>Subtotal</span><b className="mono">{fmt(totales.subtotal)}</b></div>
                  <div><span>IVA {form.iva_porcentaje}%</span><b className="mono">{fmt(totales.iva)}</b></div>
                  <div className="fact-total"><span>Total</span><b className="mono">{fmt(totales.total)}</b></div>
                </div>
              </div>
            </div>

            {error && <div className="error-text">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={timbrando}>✕ Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={timbrando || form.conceptos.length === 0 || totales.total <= 0}>
                {timbrando ? "Timbrando…" : `✓ Timbrar factura por ${fmt(totales.total)}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

// ---------------------------------------------------------------------------
// Selector de órdenes finalizadas sin factura
// ---------------------------------------------------------------------------
function SelectorOrdenes({ notify, onElegir, onClose }) {
  const [ordenes, setOrdenes] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/facturacion/ordenes-por-facturar").then(setOrdenes).catch((err) => { notify(err.message, "error"); setOrdenes([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lista = (ordenes || []).filter((o) => {
    const t = q.trim().toLowerCase();
    return !t || `${o.id_servicio} ${o.cliente} ${o.rfc} ${o.vehiculo} ${o.nombre_servicio}`.toLowerCase().includes(t);
  });

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal" style={{ maxWidth: 760 }}>
          <div className="modal-header-icono">
            <div className="modal-avatar-icono" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}>📑</div>
            <div>
              <h2>Facturar orden</h2>
              <div className="modal-subtitulo">Solo aparecen órdenes finalizadas que aún no tienen factura.</div>
            </div>
          </div>
          <input className="search-input" style={{ width: "100%", marginBottom: 12 }} autoFocus placeholder="🔍 Buscar por # de orden, cliente, RFC o vehículo…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="fact-ordenes">
            {ordenes === null ? (
              <div className="loading-text">Cargando…</div>
            ) : lista.length === 0 ? (
              <div className="empty-state">{ordenes.length ? "Ninguna orden coincide." : "No hay órdenes finalizadas pendientes de facturar."}</div>
            ) : (
              lista.map((o) => (
                <button type="button" key={o.id_servicio} className="fact-orden" onClick={() => onElegir(o.id_servicio)}>
                  <span className="fact-orden-num">#{o.id_servicio}</span>
                  <span className="fact-orden-info">
                    <b>{o.cliente}</b>{o.rfc ? <span className="mono"> · {o.rfc}</span> : <span className="fact-orden-sinrfc"> · sin RFC</span>}
                    <span className="fact-orden-meta">{o.vehiculo} · {o.nombre_servicio}{o.fecha_salida ? ` · entregada ${new Date(o.fecha_salida).toLocaleDateString("es-MX")}` : ""}</span>
                  </span>
                  <span className="fact-orden-total">
                    <b className="mono">{fmt(o.total)}</b>
                    <span className={`badge ${o.pagado ? "badge-teal" : "badge-amber"}`}>{o.pagado ? "Pagada" : "Con saldo"}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ---------------------------------------------------------------------------
// Cancelación
// ---------------------------------------------------------------------------
function CancelarModal({ factura, catalogos, notify, onClose, onCancelada }) {
  const [motivo, setMotivo] = useState("02");
  const [uuidSustitucion, setUuidSustitucion] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    try {
      const f = await api.post(`/facturacion/facturas/${factura.id_factura}/cancelar`, {
        motivo,
        uuid_sustitucion: motivo === "01" ? uuidSustitucion.trim() : null,
      });
      onCancelada(f);
    } catch (err) {
      notify(err.message, "error");
      setEnviando(false);
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}>
        <div className="modal" style={{ maxWidth: 520 }}>
          <h2 style={{ fontSize: 19 }}>Cancelar factura {factura.serie}-{factura.folio}</h2>
          <p style={{ color: "var(--ink-500)", fontSize: 14 }}>
            {factura.receptor_nombre} · {fmt(factura.total)}. La cancelación se envía al SAT y no se puede deshacer.
            Si el receptor debe aceptarla, quedará como “Cancelación pendiente”.
          </p>
          <div className="field">
            <label>Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {catalogos.motivos_cancelacion.map((m) => <option key={m.clave} value={m.clave}>{m.clave} · {m.descripcion}</option>)}
            </select>
          </div>
          {motivo === "01" && (
            <div className="field">
              <label>UUID de la factura que la sustituye (emítela primero)</label>
              <input className="mono" value={uuidSustitucion} onChange={(e) => setUuidSustitucion(e.target.value)} placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" />
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose} disabled={enviando}>Volver</button>
            <button className="btn btn-danger" onClick={confirmar} disabled={enviando}>{enviando ? "Cancelando…" : "Cancelar ante el SAT"}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ---------------------------------------------------------------------------
// Configuración fiscal
// ---------------------------------------------------------------------------
function ConfiguracionFiscal({ config, catalogos, editable, notify, onGuardada }) {
  const [form, setForm] = useState(config);
  const [guardando, setGuardando] = useState(false);
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const { pac_llave_detectada, pac_modo, ...payload } = form; // eslint-disable-line no-unused-vars
      const nueva = await api.put("/facturacion/configuracion", { ...payload, folio_siguiente: Number(payload.folio_siguiente), iva_porcentaje: Number(payload.iva_porcentaje) });
      setForm(nueva);
      onGuardada(nueva);
      notify("Configuración fiscal guardada.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar}>
      <div className="nota-bloque">
        <div className="nota-bloque-header"><span className="icono">🔌</span><h2>Proveedor de timbrado (PAC)</h2></div>
        <div className="nota-bloque-body form-grid">
          <div className="field">
            <label>Proveedor</label>
            <select value={form.proveedor} disabled={!editable} onChange={(e) => set("proveedor", e.target.value)}>
              <option value="simulado">Simulado (pruebas internas, sin validez fiscal)</option>
              <option value="facturapi">Facturapi</option>
            </select>
          </div>
          <div className="field">
            <label>Estado</label>
            <div style={{ paddingTop: 8 }}>
              <span className={`badge ${(MODO_PAC[config.pac_modo] || MODO_PAC.simulado)[0]}`}>{(MODO_PAC[config.pac_modo] || MODO_PAC.simulado)[1]}</span>
            </div>
          </div>
          {form.proveedor === "facturapi" && (
            <div className="field full field-hint">
              Para timbrar de verdad: 1) crea tu organización en Facturapi y sube tu CSD (.cer, .key y contraseña) — no tu e.firma;
              2) copia la llave secreta en <span className="mono">backend/.env</span> como <span className="mono">FACTURAPI_API_KEY=sk_test_…</span> (pruebas) o <span className="mono">sk_live_…</span> (producción);
              3) reinicia el backend. {config.pac_llave_detectada ? "✅ Llave detectada en el servidor." : "⚠️ Aún no se detecta la llave en el servidor."}
            </div>
          )}
        </div>
      </div>

      <div className="nota-bloque">
        <div className="nota-bloque-header"><span className="icono">🏢</span><h2>Emisor</h2></div>
        <div className="nota-bloque-body form-grid">
          <div className="field"><label>RFC</label><input className="mono" disabled={!editable} value={form.rfc_emisor || ""} maxLength={13} onChange={(e) => set("rfc_emisor", e.target.value.toUpperCase().trim())} /></div>
          <div className="field"><label>Razón social (como en la constancia)</label><input disabled={!editable} value={form.razon_social_emisor || ""} onChange={(e) => set("razon_social_emisor", e.target.value.toUpperCase())} /></div>
          <div className="field">
            <label>Régimen fiscal</label>
            <select disabled={!editable} value={form.regimen_fiscal_emisor || ""} onChange={(e) => set("regimen_fiscal_emisor", e.target.value || null)}>
              <option value="">-- Selecciona --</option>
              {catalogos.regimenes_fiscales.filter((r) => r.clave !== "616").map((r) => <option key={r.clave} value={r.clave}>{r.clave} · {r.descripcion}</option>)}
            </select>
          </div>
          <div className="field"><label>CP lugar de expedición</label><input disabled={!editable} value={form.cp_expedicion || ""} maxLength={5} onChange={(e) => set("cp_expedicion", e.target.value.replace(/\D/g, ""))} /></div>
        </div>
      </div>

      <div className="nota-bloque acento-ambar">
        <div className="nota-bloque-header"><span className="icono">🔢</span><h2>Serie, folio y claves SAT por defecto</h2></div>
        <div className="nota-bloque-body form-grid">
          <div className="field"><label>Serie</label><input disabled={!editable} value={form.serie || ""} maxLength={10} onChange={(e) => set("serie", e.target.value.toUpperCase())} /></div>
          <div className="field"><label>Folio siguiente</label><input type="number" min="1" disabled={!editable} value={form.folio_siguiente} onChange={(e) => set("folio_siguiente", e.target.value)} /></div>
          <div className="field"><label>Clave SAT mano de obra</label><input className="mono" disabled={!editable} value={form.clave_prod_serv_mano_obra} maxLength={8} onChange={(e) => set("clave_prod_serv_mano_obra", e.target.value.replace(/\D/g, ""))} /></div>
          <div className="field"><label>Clave SAT refacciones</label><input className="mono" disabled={!editable} value={form.clave_prod_serv_refaccion} maxLength={8} onChange={(e) => set("clave_prod_serv_refaccion", e.target.value.replace(/\D/g, ""))} /></div>
          <div className="field">
            <label>Unidad servicios</label>
            <select disabled={!editable} value={form.clave_unidad_servicio} onChange={(e) => set("clave_unidad_servicio", e.target.value)}>
              {catalogos.unidades.map((u) => <option key={u.clave} value={u.clave}>{u.clave} · {u.descripcion}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Unidad refacciones</label>
            <select disabled={!editable} value={form.clave_unidad_pieza} onChange={(e) => set("clave_unidad_pieza", e.target.value)}>
              {catalogos.unidades.map((u) => <option key={u.clave} value={u.clave}>{u.clave} · {u.descripcion}</option>)}
            </select>
          </div>
          <div className="field full field-hint">
            78181500 = servicio de mantenimiento y reparación de vehículos. Para refacciones usa la clave del catálogo c_ClaveProdServ que corresponda a lo que vendes (búscala en el catálogo del SAT); 01010101 es genérica.
          </div>
        </div>
      </div>

      {editable && (
        <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar configuración"}</button>
        </div>
      )}
    </form>
  );
}
