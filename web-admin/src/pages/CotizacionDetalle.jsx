import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import FormModal from "../components/FormModal";
import ModalPortal from "../components/ModalPortal";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import IconoModulo from "../components/IconoModulo";
import { Icono, IconoAuto } from "../components/Icono";

function BloqueNota({ icono, titulo, acento, accion, children }) {
  return (
    <div className={`nota-bloque ${acento ? `acento-${acento}` : ""}`}>
      <div className="nota-bloque-header">
        <span className="icono"><IconoAuto valor={icono} size={18} /></span>
        <h2>{titulo}</h2>
        {accion}
      </div>
      <div className="nota-bloque-body">{children}</div>
    </div>
  );
}

export default function CotizacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { notify } = useUI();
  const [cotizacion, setCotizacion] = useState(null);
  const [refacciones, setRefacciones] = useState([]);
  const [categoriasRefaccion, setCategoriasRefaccion] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [datosTaller, setDatosTaller] = useState(null);
  const [comentarios, setComentarios] = useState("");
  const [guardandoComentarios, setGuardandoComentarios] = useState(false);
  const [addingDetalle, setAddingDetalle] = useState(false);
  const [modoMultiple, setModoMultiple] = useState(false);
  const [seleccionMultiple, setSeleccionMultiple] = useState({});
  const [filtroCategoriaMulti, setFiltroCategoriaMulti] = useState("");
  const [filtroSubcategoriaMulti, setFiltroSubcategoriaMulti] = useState("");
  const [guardandoMultiple, setGuardandoMultiple] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  async function load() {
    const c = await api.get(`/cotizaciones/${id}`);
    setCotizacion(c);
    setComentarios(c.comentarios || "");
  }

  useEffect(() => {
    load();
    api.get("/refacciones/").then(setRefacciones).catch(() => setRefacciones([]));
    api.get("/refacciones-categorias/").then(setCategoriasRefaccion).catch(() => setCategoriasRefaccion([]));
    api.get("/tipos-servicio/").then(setTipos).catch(() => setTipos([]));
    api.get("/configuracion-taller/").then(setDatosTaller).catch(() => setDatosTaller(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!cotizacion) return <div className="loading-text">Cargando…</div>;

  const fmt = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

  async function cambiarIva(aplicar) {
    try {
      const actualizada = await api.put(`/cotizaciones/${id}`, { iva_porcentaje: aplicar ? 16 : 0 });
      setCotizacion(actualizada);
      notify(aplicar ? "Se aplicará IVA (16%) a esta cotización." : "Se quitó el IVA de esta cotización.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function guardarComentarios() {
    setGuardandoComentarios(true);
    try {
      const actualizada = await api.put(`/cotizaciones/${id}`, { comentarios: comentarios.trim() || null });
      setCotizacion(actualizada);
      notify("Comentarios guardados.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoComentarios(false);
    }
  }

  async function handleAddDetalle(values) {
    try {
      const refaccionElegida = values.id_refaccion ? refacciones.find((r) => r.id_refaccion === Number(values.id_refaccion)) : null;
      const actualizada = await api.post(`/cotizaciones/${id}/detalles`, {
        ...values,
        id_tipo_servicio: values.id_tipo_servicio || null,
        id_refaccion: values.id_refaccion || null,
        descripcion: values.descripcion?.trim() || refaccionElegida?.nombre_refaccion || null,
        cantidad: Number(values.cantidad || 1),
        costo_refaccion: Number(values.costo_refaccion) || (refaccionElegida?.preciocliente_refaccion ?? 0),
        costo_extra: Number(values.costo_extra || 0),
      });
      setCotizacion(actualizada);
      setAddingDetalle(false);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function alternarSeleccionMultiple(idRefaccion, marcada) {
    setSeleccionMultiple((prev) => {
      const copia = { ...prev };
      if (marcada) copia[idRefaccion] = { cantidad: prev[idRefaccion]?.cantidad || 1 };
      else delete copia[idRefaccion];
      return copia;
    });
  }

  function cambiarCantidadMultiple(idRefaccion, cantidad) {
    setSeleccionMultiple((prev) => ({ ...prev, [idRefaccion]: { cantidad: Math.max(1, Number(cantidad) || 1) } }));
  }

  async function guardarSeleccionMultiple() {
    const idsSeleccionados = Object.keys(seleccionMultiple);
    if (idsSeleccionados.length === 0) {
      notify("Marca al menos una refacción.", "error");
      return;
    }
    setGuardandoMultiple(true);
    try {
      let actualizada = cotizacion;
      for (const idStr of idsSeleccionados) {
        const refaccion = refacciones.find((r) => r.id_refaccion === Number(idStr));
        actualizada = await api.post(`/cotizaciones/${id}/detalles`, {
          id_refaccion: Number(idStr),
          descripcion: refaccion?.nombre_refaccion || null,
          cantidad: seleccionMultiple[idStr].cantidad,
          costo_refaccion: (refaccion?.preciocliente_refaccion ?? 0) * seleccionMultiple[idStr].cantidad,
          costo_extra: 0,
        });
      }
      setCotizacion(actualizada);
      notify(`${idsSeleccionados.length} refacción(es) agregadas a la cotización.`, "success");
      setAddingDetalle(false);
      setModoMultiple(false);
      setSeleccionMultiple({});
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setGuardandoMultiple(false);
    }
  }

  async function handleUpdateDetalle(detalleId, cambios) {
    try {
      const actualizada = await api.put(`/cotizaciones/${id}/detalles/${detalleId}`, cambios);
      setCotizacion(actualizada);
    } catch (err) {
      notify(err.message, "error");
      load();
    }
  }

  async function handleDeleteDetalle(detalleId) {
    try {
      const actualizada = await api.del(`/cotizaciones/${id}/detalles/${detalleId}`);
      setCotizacion(actualizada);
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function descargarPdf(modo = "descargar") {
    // En navegadores de celular casi nunca hay un visor de PDF integrado
    // para <iframe> (a diferencia de Chrome de escritorio) — el modal con
    // vista previa se ve en blanco. En móvil, se manda directo a
    // descarga, que sí abre bien con el visor nativo del sistema.
    const esMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    setDescargando(true);
    try {
      const res = await fetch(`/api/cotizaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "No se pudo generar el documento.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (modo === "preview" && !esMovil) {
        setPdfPreviewUrl(url);
        return;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      if (modo === "preview") notify("Se descargó la cotización — tu celular la abre con su propio visor de PDF.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setDescargando(false);
    }
  }

  const puedeEditar = hasPermission("cotizaciones.editar");

  return (
    <>
      <div className="page-header">
        <div>
          <h1><IconoModulo ruta="/cotizaciones" /> {cotizacion.titulo}</h1>
          <div className="orden-cliente-vehiculo">
            Cotización #{cotizacion.id_cotizacion} · {new Date(cotizacion.fecha_cotizacion).toLocaleDateString("es-MX")}
            {cotizacion.vigente_hasta && ` · Vigente hasta ${new Date(cotizacion.vigente_hasta).toLocaleDateString("es-MX")}`}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate("/cotizaciones")}>← Volver</button>
      </div>

      {datosTaller && (
        <BloqueNota icono="🏢" titulo="Datos del taller">
          <dl className="datos-lista">
            <dt>Nombre</dt><dd>{datosTaller.nombre_taller || "—"}</dd>
            <dt>Dirección</dt><dd>{datosTaller.direccion || "—"}</dd>
            <dt>Teléfono</dt><dd>{datosTaller.telefono || "—"}</dd>
            <dt>RFC</dt><dd>{datosTaller.rfc || "—"}</dd>
          </dl>
        </BloqueNota>
      )}

      <BloqueNota icono="💰" titulo="Resumen de costos">
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi-card">
            <div className="kpi-label">Subtotal</div>
            <div className="kpi-value mono">{fmt(cotizacion.costos.subtotal)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">IVA ({cotizacion.iva_porcentaje}%)</div>
            <div className="kpi-value mono">{fmt(cotizacion.costos.iva)}</div>
          </div>
          <div className="kpi-card ok">
            <div className="kpi-label">Total estimado</div>
            <div className="kpi-value mono">{fmt(cotizacion.costos.total)}</div>
          </div>
        </div>
        {puedeEditar && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-700)", cursor: "pointer" }}>
            <input type="checkbox" checked={cotizacion.iva_porcentaje > 0} onChange={(e) => cambiarIva(e.target.checked)} />
            Aplicar IVA (16%)
          </label>
        )}
      </BloqueNota>

      <BloqueNota
        icono="🔧"
        titulo="Conceptos"
        accion={
          puedeEditar && (
            <button className="btn btn-agregar" onClick={() => setAddingDetalle(true)}><Icono nombre="add" size={18} /> Agregar refacciones</button>
          )
        }
      >
        {cotizacion.detalles.length === 0 ? (
          <div className="empty-state">Aún no se han agregado conceptos a esta cotización.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Descripción</th><th>Refacción</th><th>Cant.</th><th>Refacción $</th><th>Extra $</th><th></th></tr>
            </thead>
            <tbody>
              {cotizacion.detalles.map((d) => {
                const ref = refacciones.find((r) => r.id_refaccion === d.id_refaccion);
                return (
                  <tr key={d.id_cotizacion_detalle}>
                    <td>{d.descripcion || "—"}</td>
                    <td>{ref?.nombre_refaccion || "—"}</td>
                    <td style={{ width: 70 }}>
                      <input
                        key={`c-${d.id_cotizacion_detalle}-${d.cantidad}`} type="number" defaultValue={d.cantidad || 1} disabled={!puedeEditar}
                        style={{ width: "100%", padding: "4px 6px" }}
                        onBlur={(e) => { const v = Number(e.target.value) || 1; if (v !== d.cantidad) handleUpdateDetalle(d.id_cotizacion_detalle, { cantidad: v }); }}
                      />
                    </td>
                    <td style={{ width: 100 }}>
                      <input
                        key={`r-${d.id_cotizacion_detalle}-${d.costo_refaccion}`} type="number" defaultValue={d.costo_refaccion} disabled={!puedeEditar}
                        style={{ width: "100%", padding: "4px 6px" }}
                        onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== d.costo_refaccion) handleUpdateDetalle(d.id_cotizacion_detalle, { costo_refaccion: v }); }}
                      />
                    </td>
                    <td style={{ width: 100 }}>
                      <input
                        key={`e-${d.id_cotizacion_detalle}-${d.costo_extra}`} type="number" defaultValue={d.costo_extra} disabled={!puedeEditar}
                        style={{ width: "100%", padding: "4px 6px" }}
                        onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== d.costo_extra) handleUpdateDetalle(d.id_cotizacion_detalle, { costo_extra: v }); }}
                      />
                    </td>
                    <td>
                      {puedeEditar && <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDetalle(d.id_cotizacion_detalle)}>Quitar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </BloqueNota>

      <BloqueNota icono="📝" titulo="Comentarios">
        <div className="field full">
          <label>Notas o condiciones del presupuesto</label>
          <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} disabled={!puedeEditar} />
        </div>
        {puedeEditar && (
          <button className="btn btn-secondary btn-sm" onClick={guardarComentarios} disabled={guardandoComentarios}>
            {guardandoComentarios ? "Guardando…" : "Guardar comentarios"}
          </button>
        )}
      </BloqueNota>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button className="btn btn-primary btn-preview-fijo" onClick={() => descargarPdf("preview")} disabled={descargando}>
          {descargando ? "Generando…" : "Generar vista previa de la cotización"}
        </button>
      </div>

      {pdfPreviewUrl && (
        <ModalPortal>
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); } }}>
          <div className="modal modal-pdf">
            <div className="modal-pdf-header">
              <span><IconoAuto valor="📄" size={18} /> Vista previa de la cotización</span>
              <div style={{ display: "flex", gap: 10 }}>
                <a className="btn btn-secondary btn-sm" href={pdfPreviewUrl} download={`cotizacion-${id}.pdf`}>Descargar</a>
                <button className="btn btn-secondary btn-sm" onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }}>Cerrar <IconoAuto valor="✕" size={18} /></button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} title="Vista previa de la cotización" className="modal-pdf-frame" />
          </div>
        </div>
        </ModalPortal>
      )}

      {addingDetalle && (() => {
        const refaccionesFiltradas = refacciones.filter((r) =>
          (!filtroCategoriaMulti || r.categoria === filtroCategoriaMulti) &&
          (!filtroSubcategoriaMulti || (r.subcategoria || "Sin subcategoría") === filtroSubcategoriaMulti)
        );
        const grupos = {};
        refaccionesFiltradas.forEach((r) => {
          const clave = r.subcategoria || "Sin subcategoría";
          if (!grupos[clave]) grupos[clave] = [];
          grupos[clave].push(r);
        });
        const clavesOrdenadas = Object.keys(grupos).sort((a, b) => (a === "Sin subcategoría" ? 1 : b === "Sin subcategoría" ? -1 : a.localeCompare(b)));
        return (
          <ModalPortal>
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAddingDetalle(false)}>
            <div className="modal modal-grande">
              <h2 style={{ fontSize: 20 }}>Agregar refacciones a la cotización</h2>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 18 }}>
                <div className="field" style={{ maxWidth: 480, flex: 1, marginBottom: 0 }}>
                  <label>Categoría</label>
                  <select value={filtroCategoriaMulti} onChange={(e) => { setFiltroCategoriaMulti(e.target.value); setFiltroSubcategoriaMulti(""); }}>
                    <option value="">Todas</option>
                    {categoriasRefaccion.map((c) => <option key={c.id_categoria_refaccion} value={c.nombre_categoria}>{c.nombre_categoria}</option>)}
                  </select>
                </div>
                {filtroSubcategoriaMulti && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFiltroSubcategoriaMulti("")}>
                    <IconoAuto valor="✕" size={18} /> Quitar filtro "{filtroSubcategoriaMulti}"
                  </button>
                )}
              </div>

              <div className="tarjetas-refaccion-grid">
                {refaccionesFiltradas.length === 0 ? (
                  <div className="empty-state">No hay refacciones que coincidan con ese filtro.</div>
                ) : (
                  clavesOrdenadas.map((clave) => (
                    <>
                      <div
                        key={`grupo-${clave}`}
                        className="tarjetas-refaccion-grupo tarjetas-refaccion-grupo-clicable"
                        onClick={() => setFiltroSubcategoriaMulti(clave)}
                        title="Filtrar solo por esta subcategoría"
                      >
                        {clave}
                      </div>
                      {grupos[clave].map((r) => {
                        const marcada = !!seleccionMultiple[r.id_refaccion];
                        return (
                          <div
                            key={r.id_refaccion}
                            className={`tarjeta-refaccion ${marcada ? "seleccionada" : ""}`}
                            onClick={() => alternarSeleccionMultiple(r.id_refaccion, !marcada)}
                          >
                            <div className="tarjeta-refaccion-nombre">{r.nombre_refaccion}</div>
                            <div className="tarjeta-refaccion-info">
                              {r.categoria ? `${r.categoria}${r.subcategoria ? " / " + r.subcategoria : ""} · ` : ""}Stock: {r.cantidad_refaccion}
                              {r.preciocliente_refaccion ? ` · $${r.preciocliente_refaccion}` : ""}
                            </div>
                            {marcada && (
                              <div className="tarjeta-refaccion-cantidad" onClick={(e) => e.stopPropagation()}>
                                <label>Cantidad</label>
                                <input
                                  type="number"
                                  min={1}
                                  value={seleccionMultiple[r.id_refaccion]?.cantidad || 1}
                                  onChange={(e) => cambiarCantidadMultiple(r.id_refaccion, e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ))
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => { setAddingDetalle(false); setSeleccionMultiple({}); }}>Cancelar</button>
                <button className="btn btn-primary" onClick={guardarSeleccionMultiple} disabled={guardandoMultiple}>
                  {guardandoMultiple ? "Agregando…" : "Agregar a la cotización"}
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        );
      })()}
    </>
  );
}
