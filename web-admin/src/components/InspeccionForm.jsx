import { IconoAuto } from "./Icono";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import FotoGaleria from "./FotoGaleria";
import { Icono } from "./Icono";
import Auto3D from "./Auto3D";
import { ZONAS, zonasDe, peorEstado } from "./AutoInspeccion";
import { reducirFoto } from "../lib/reducirFoto";

const ESTADOS = {
  bien: { icono: "check-circle", texto: "Bien" },
  regular: { icono: "warning", texto: "Regular" },
  mal: { icono: "x-circle", texto: "Mal" },
};

/**
 * Checklist de inspección digital, agrupado por categoría. NO se guarda solo:
 * se captura completo y se guarda con «Finalizar inspección» (o «Guardar avance»).
 * El primer guardado crea la inspección; los siguientes la actualizan.
 * Con `publico={{ token }}` funciona sin sesión desde el enlace del mecánico (servicio a domicilio): mismo diseño, otro API.
 */
export default function InspeccionForm({ idVehiculo, idServicio, inspeccionExistente, refacciones = [], onGuardado, onClose, puedeEditar = true, publico = null }) {
  const { notify, confirmDialog } = useUI();
  const [items, setItems] = useState([]);
  const [resultados, setResultados] = useState({}); // { id_item: {estado, comentario, id_refaccion_sugerida} }
  const [comentarioGeneral, setComentarioGeneral] = useState(inspeccionExistente?.comentario_general || "");
  const [idInspeccion, setIdInspeccion] = useState(inspeccionExistente?.id_inspeccion || null);
  const [estadoGuardado, setEstadoGuardado] = useState(""); // "" | guardando | guardado | error
  const [sucio, setSucio] = useState(false); // hay cambios sin guardar
  const [zona, setZona] = useState(null); // zona elegida en el mapa del auto
  const [fotosPuntos, setFotosPuntos] = useState({}); // { id_item: [foto, ...] } — fotos de puntos en Regular/Mal
  const [subiendoFoto, setSubiendoFoto] = useState(null); // id_item que está subiendo

  const idRef = useRef(inspeccionExistente?.id_inspeccion || null);
  const datosRef = useRef({ resultados, comentarioGeneral });
  datosRef.current = { resultados, comentarioGeneral };

  // Modo enlace público: mismas pantallas, pero contra /api/domicilio/{token}/... (sin sesión)
  async function llamarPublico(ruta, opciones = {}) {
    const res = await fetch(`/api/domicilio/${encodeURIComponent(publico.token)}/${ruta}`, { cache: "no-store", ...opciones });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.mensaje || data?.detail || "No se pudo completar la acción.");
    return data;
  }

  useEffect(() => {
    (async () => {
      let data; let existente = inspeccionExistente;
      try {
        if (publico) {
          const r = await llamarPublico("inspeccion");
          data = r.items; existente = r.inspeccion;
          if (existente) { idRef.current = existente.id_inspeccion; setIdInspeccion(existente.id_inspeccion); setComentarioGeneral(existente.comentario_general || ""); }
          setFotosPuntos(r.fotos_puntos || {});
        } else {
          data = await api.get("/inspecciones/items");
        }
      } catch (err) { notify(err.message, "error"); return; }
      setItems(data);
      const iniciales = {};
      data.forEach((it) => { iniciales[it.id_item] = { estado: "bien", comentario: "", id_refaccion_sugerida: null }; });
      if (existente) {
        existente.resultados.forEach((r) => {
          iniciales[r.id_item] = { estado: r.estado, comentario: r.comentario || "", id_refaccion_sugerida: r.id_refaccion_sugerida };
        });
      }
      setResultados(iniciales);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar() {
    const { resultados: res, comentarioGeneral: general } = datosRef.current;
    if (Object.keys(res).length === 0) return false;
    const payload = {
      id_vehiculo: idVehiculo,
      id_servicio: idServicio || null,
      comentario_general: general.trim() || null,
      resultados: Object.entries(res).map(([id_item, r]) => ({
        id_item: Number(id_item),
        estado: r.estado,
        comentario: r.comentario.trim() || null,
        id_refaccion_sugerida: r.id_refaccion_sugerida || null,
      })),
    };
    setEstadoGuardado("guardando");
    try {
      const guardada = publico
        ? await llamarPublico("inspeccion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comentario_general: payload.comentario_general, resultados: payload.resultados }) })
        : idRef.current
          ? await api.put(`/inspecciones/${idRef.current}`, payload)
          : await api.post("/inspecciones/", payload);
      idRef.current = guardada.id_inspeccion;
      setIdInspeccion(guardada.id_inspeccion);
      setEstadoGuardado("guardado");
      setSucio(false);
      onGuardado?.(guardada);
      return true;
    } catch (err) {
      setEstadoGuardado("error");
      notify(err.message, "error");
      return false;
    }
  }

  async function cargarFotosPuntos(id) {
    if (!id || publico) return;
    try {
      const lista = await api.get(`/fotos/?entidad_tipo=inspeccion_item&entidad_id=${id}`);
      const por = {};
      lista.forEach((f) => { (por[f.descripcion] = por[f.descripcion] || []).push(f); });
      setFotosPuntos(por);
    } catch { /* sin fotos */ }
  }
  useEffect(() => { cargarFotosPuntos(inspeccionExistente?.id_inspeccion); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function subirFotoPunto(idItem, archivo) {
    if (!archivo) return;
    setSubiendoFoto(idItem);
    try {
      // La foto necesita una inspección guardada: si aún no existe, se guarda el avance primero
      if (!idRef.current && !(await guardar())) return;
      const fd = new FormData();
      let foto;
      if (publico) {
        fd.append("id_item", String(idItem));
        fd.append("archivo", await reducirFoto(archivo));
        foto = await llamarPublico("inspeccion/foto", { method: "POST", body: fd });
      } else {
        fd.append("entidad_tipo", "inspeccion_item");
        fd.append("entidad_id", idRef.current);
        fd.append("descripcion", String(idItem));
        fd.append("archivo", archivo);
        foto = await api.postForm("/fotos/", fd);
      }
      setFotosPuntos((prev) => ({ ...prev, [idItem]: [...(prev[String(idItem)] || prev[idItem] || []), foto] }));
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubiendoFoto(null);
    }
  }
  async function borrarFotoPunto(idItem, foto) {
    if (!(await confirmDialog("¿Eliminar esta foto? No se puede deshacer.", { danger: true, confirmar: "Sí, eliminar" }))) return;
    try {
      if (publico) await llamarPublico(`inspeccion/foto/${foto.id_foto}`, { method: "DELETE" }); else await api.del(`/fotos/${foto.id_foto}`);
      setFotosPuntos((prev) => ({ ...prev, [idItem]: (prev[idItem] || []).filter((f) => f.id_foto !== foto.id_foto) }));
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function finalizar() {
    if (!puedeEditar) { onClose(); return; }
    if (await guardar()) {
      notify("Inspección guardada.", "success");
      onClose();
    }
  }

  async function cerrar() {
    if (sucio && puedeEditar) {
      const ok = await confirmDialog("Tienes cambios sin guardar en la inspección. ¿Salir sin guardarlos?", { danger: true, confirmar: "Sí, salir sin guardar" });
      if (!ok) return;
    }
    onClose();
  }

  function actualizar(idItem, campo, valor) {
    setResultados((prev) => ({ ...prev, [idItem]: { ...prev[idItem], [campo]: valor } }));
    setSucio(true);
  }

  const valores = Object.values(resultados);
  const conteo = {
    bien: valores.filter((r) => r.estado === "bien").length,
    regular: valores.filter((r) => r.estado === "regular").length,
    mal: valores.filter((r) => r.estado === "mal").length,
  };

  // Puntos del checklist por zona del auto
  const itemsPorZona = {};
  items.forEach((it) => zonasDe(it.categoria, it.nombre_item).forEach((z) => { (itemsPorZona[z] = itemsPorZona[z] || []).push(it); }));
  const estadoZona = (z) => peorEstado((itemsPorZona[z] || []).map((it) => resultados[it.id_item]?.estado || "bien"));
  function marcarZona(z, estado) {
    setResultados((prev) => {
      const siguiente = { ...prev };
      (itemsPorZona[z] || []).forEach((i) => { siguiente[i.id_item] = { ...siguiente[i.id_item], estado }; });
      return siguiente;
    });
    setSucio(true);
  }

  const renderItem = (item) => {
            const r = resultados[item.id_item] || { estado: "bien", comentario: "", id_refaccion_sugerida: null };
            return (
              <div key={item.id_item} className={`insp-item insp-${r.estado}`}>
                <div className="insp-item-nombre">{item.nombre_item}</div>
                <div className="insp-estados">
                  {Object.entries(ESTADOS).map(([estado, e]) => (
                    <button
                      key={estado}
                      type="button"
                      className={`insp-estado insp-estado-${estado} ${r.estado === estado ? "activo" : ""}`}
                      onClick={() => actualizar(item.id_item, "estado", estado)}
                    >
                      <span className="insp-estado-icono"><Icono nombre={e.icono} size={24} /></span>
                      {e.texto}
                    </button>
                  ))}
                </div>
                {r.estado !== "bien" && (
                  <div className="insp-detalle">
                    <input
                      placeholder="Comentario (opcional)"
                      value={r.comentario}
                      onChange={(e) => actualizar(item.id_item, "comentario", e.target.value)}
                    />
                    {r.estado === "mal" && !publico && (
                      <select
                        value={r.id_refaccion_sugerida || ""}
                        onChange={(e) => actualizar(item.id_item, "id_refaccion_sugerida", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Sugerir refacción (opcional)</option>
                        {refacciones.map((ref) => (
                          <option key={ref.id_refaccion} value={ref.id_refaccion}>{ref.nombre_refaccion}</option>
                        ))}
                      </select>
                    )}
                    <div className="insp-fotos">
                      {(fotosPuntos[item.id_item] || []).map((f) => (
                        <span key={f.id_foto} className="insp-foto">
                          <a href={`/uploads/${f.ruta_archivo}`} target="_blank" rel="noopener noreferrer"><img src={`/uploads/${f.ruta_archivo}`} alt="Foto del punto" loading="lazy" /></a>
                          {puedeEditar && <button type="button" title="Eliminar foto" aria-label="Eliminar foto" onClick={() => borrarFotoPunto(item.id_item, f)}>×</button>}
                        </span>
                      ))}
                      {puedeEditar && (
                        <>
                          <label className={`insp-foto-add ${subiendoFoto === item.id_item ? "ocupado" : ""}`}>
                            <Icono nombre="camera" size={20} />
                            <span>{subiendoFoto === item.id_item ? "Subiendo…" : "Tomar foto"}</span>
                            <input type="file" accept="image/*" capture="environment" hidden disabled={subiendoFoto !== null}
                              onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; subirFotoPunto(item.id_item, a); }} />
                          </label>
                          <label className={`insp-foto-add ${subiendoFoto === item.id_item ? "ocupado" : ""}`}>
                            <span>Galería</span>
                            <input type="file" accept="image/*" hidden disabled={subiendoFoto !== null}
                              onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; subirFotoPunto(item.id_item, a); }} />
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
  };

  const textoGuardado = estadoGuardado === "guardando" ? "Guardando…" : estadoGuardado === "error" ? "No se guardó"
    : sucio ? "Cambios sin guardar" : idInspeccion ? "Guardado" : "Aún sin guardar";
  const claseGuardado = estadoGuardado === "guardando" ? "guardando" : estadoGuardado === "error" ? "error" : sucio || !idInspeccion ? "" : "guardado";

  return createPortal(
    <div className={`modal-backdrop ${publico ? "insp-publico-fondo" : ""}`} onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className={`modal insp-modal ${publico ? "insp-publico" : ""}`}>
        <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={cerrar} disabled={estadoGuardado === "guardando"}><Icono nombre="close" size={20} /></button>
        <div className="insp-cabecera">
          <div className="modal-header-icono" style={{ marginBottom: 0 }}>
            <div className="modal-avatar-icono" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}><Icono nombre="search" size={26} /></div>
            <div>
              <h2>Inspección digital</h2>
              <div className="modal-subtitulo">Revisa cada punto y, al terminar, pulsa «Finalizar inspección». Lo que quede en "Mal" lo puedes ligar a la refacción que se necesita.</div>
            </div>
          </div>
          <div className="insp-contadores">
            <span className="insp-cont bien"><Icono nombre="check-circle" size={18} /> <b>{conteo.bien}</b> Bien</span>
            <span className="insp-cont regular"><Icono nombre="warning" size={18} /> <b>{conteo.regular}</b> Regular</span>
            <span className="insp-cont mal"><Icono nombre="x-circle" size={18} /> <b>{conteo.mal}</b> Mal</span>
            <span className={`guardado-auto ${claseGuardado}`}>{textoGuardado}</span>
          </div>
        </div>

        <div className="insp-cuerpo">
        <fieldset className="insp-fieldset" disabled={!puedeEditar}>
          <section className="insp-mapa" aria-label="Mapa del vehículo">
            <div className="insp-mapa-auto">
              <Auto3D nombres={Object.fromEntries(Object.entries(ZONAS).map(([k, z]) => [k, z.nombre]))} estadoZona={(z) => (itemsPorZona[z] ? estadoZona(z) : "ninguno")} elegida={zona} onSelect={(z) => setZona(zona === z ? null : z)} />
              <div className="insp-mapa-leyenda" aria-hidden="true">
                <span><i style={{ background: "var(--teal-600)" }} />Bien</span>
                <span><i style={{ background: "var(--warn-600)" }} />Regular</span>
                <span><i style={{ background: "var(--red-600)" }} />Mal</span>
              </div>
            </div>
            <div className="insp-mapa-panel">
              {zona && itemsPorZona[zona] ? (
                <>
                  <div className="insp-mapa-barra">
                    <h3>{ZONAS[zona].nombre}</h3>
                    {puedeEditar && <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcarZona(zona, "bien")}><Icono nombre="check-circle" size={16} /> Todo bien en esta zona</button>}
                  </div>
                  <div className="insp-mapa-grid">{itemsPorZona[zona].map(renderItem)}</div>
                </>
              ) : (
                <div className="insp-mapa-vacio">Toca un punto del auto para revisar esa zona. Los puntos cambian de color según lo que marques.</div>
              )}
            </div>
          </section>


          <div className="field full">
            <label><IconoAuto valor="📋" size={18} /> Comentario general</label>
            <textarea value={comentarioGeneral} onChange={(e) => { setComentarioGeneral(e.target.value); setSucio(true); }} placeholder="Observaciones generales de la inspección" />
          </div>

          {publico ? (
            <div className="field-hint" style={{ marginTop: 10 }}>📷 Las fotos se agregan en cada punto marcado como Regular o Mal (guarda el avance antes de la primera foto).</div>
          ) : idInspeccion ? (
            <div style={{ marginTop: 10 }}>
              <FotoGaleria entidadTipo="inspeccion" entidadId={idInspeccion} puedeEditar={puedeEditar} />
            </div>
          ) : puedeEditar && (
            <div className="field-hint" style={{ marginTop: 10 }}>📷 Para agregar fotos, pulsa primero «Guardar avance».</div>
          )}
        </fieldset>
        </div>

        <div className="insp-pie">
          <button type="button" className="btn btn-secondary" onClick={cerrar} disabled={estadoGuardado === "guardando"}>{puedeEditar ? "Cancelar" : "Cerrar"}</button>
          {puedeEditar && (
            <>
              <button type="button" className="btn btn-secondary" onClick={guardar} disabled={estadoGuardado === "guardando" || !sucio && !!idInspeccion}>Guardar avance</button>
              <button type="button" className="btn btn-exito" onClick={finalizar} disabled={estadoGuardado === "guardando"}>
                <Icono nombre="check-circle" size={18} /> {estadoGuardado === "guardando" ? "Guardando…" : "Finalizar inspección"}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  ,
  document.body
  );
}
