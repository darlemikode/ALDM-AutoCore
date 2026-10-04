import { IconoAuto } from "./Icono";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import FotoGaleria from "./FotoGaleria";
import { Icono } from "./Icono";

const ESTADOS = {
  bien: { icono: "check-circle", texto: "Bien" },
  regular: { icono: "warning", texto: "Regular" },
  mal: { icono: "x-circle", texto: "Mal" },
};

// Ícono por categoría del checklist (las que no estén aquí usan la lupa)
const ICONO_CATEGORIA = {
  "Llantas": "tire", "Frenos": "stop", "Luces": "bulb", "Fluidos": "drop",
  "Batería y eléctrico": "battery", "Suspensión y dirección": "bolt", "Carrocería": "car",
};

/**
 * Checklist de inspección digital, agrupado por categoría. Se guarda solo:
 * cada clic se guarda al momento y los comentarios al dejar de escribir.
 * El primer cambio crea la inspección; los siguientes la actualizan.
 */
export default function InspeccionForm({ idVehiculo, idServicio, inspeccionExistente, refacciones, onGuardado, onClose }) {
  const { notify } = useUI();
  const [items, setItems] = useState([]);
  const [resultados, setResultados] = useState({}); // { id_item: {estado, comentario, id_refaccion_sugerida} }
  const [comentarioGeneral, setComentarioGeneral] = useState(inspeccionExistente?.comentario_general || "");
  const [idInspeccion, setIdInspeccion] = useState(inspeccionExistente?.id_inspeccion || null);
  const [estadoGuardado, setEstadoGuardado] = useState(""); // "" | guardando | guardado | error
  const [pendiente, setPendiente] = useState(null); // { n, retraso } — pide un guardado

  const idRef = useRef(inspeccionExistente?.id_inspeccion || null);
  const datosRef = useRef({ resultados, comentarioGeneral });
  datosRef.current = { resultados, comentarioGeneral };
  const colaRef = useRef(Promise.resolve());
  const timerRef = useRef(null);

  useEffect(() => {
    api.get("/inspecciones/items").then((data) => {
      setItems(data);
      const iniciales = {};
      data.forEach((it) => { iniciales[it.id_item] = { estado: "bien", comentario: "", id_refaccion_sugerida: null }; });
      if (inspeccionExistente) {
        inspeccionExistente.resultados.forEach((r) => {
          iniciales[r.id_item] = { estado: r.estado, comentario: r.comentario || "", id_refaccion_sugerida: r.id_refaccion_sugerida };
        });
      }
      setResultados(iniciales);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistir() {
    const { resultados: res, comentarioGeneral: general } = datosRef.current;
    if (Object.keys(res).length === 0) return;
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
    try {
      const guardada = idRef.current
        ? await api.put(`/inspecciones/${idRef.current}`, payload)
        : await api.post("/inspecciones/", payload);
      idRef.current = guardada.id_inspeccion;
      setIdInspeccion(guardada.id_inspeccion);
      setEstadoGuardado("guardado");
      onGuardado?.(guardada);
    } catch (err) {
      setEstadoGuardado("error");
      notify(err.message, "error");
    }
  }

  // Guardados en fila: el primero crea la inspección y los demás la actualizan
  function encolar() {
    timerRef.current = null;
    colaRef.current = colaRef.current.then(persistir);
    return colaRef.current;
  }

  useEffect(() => {
    if (!pendiente) return undefined;
    setEstadoGuardado("guardando");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(encolar, pendiente.retraso);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente]);

  function guardarLuego(retraso = 0) {
    setPendiente((p) => ({ n: (p?.n || 0) + 1, retraso }));
  }

  function actualizar(idItem, campo, valor) {
    setResultados((prev) => ({ ...prev, [idItem]: { ...prev[idItem], [campo]: valor } }));
    guardarLuego(campo === "comentario" ? 900 : 0);
  }

  async function cerrar() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      encolar();
    }
    await colaRef.current;
    onClose();
  }

  const categorias = [...new Set(items.map((i) => i.categoria))];
  const valores = Object.values(resultados);
  const conteo = {
    bien: valores.filter((r) => r.estado === "bien").length,
    regular: valores.filter((r) => r.estado === "regular").length,
    mal: valores.filter((r) => r.estado === "mal").length,
  };

  function marcarCategoria(cat, estado) {
    setResultados((prev) => {
      const siguiente = { ...prev };
      items.filter((i) => i.categoria === cat).forEach((i) => { siguiente[i.id_item] = { ...siguiente[i.id_item], estado }; });
      return siguiente;
    });
    guardarLuego(0);
  }

  const textoGuardado = {
    guardando: "Guardando…",
    guardado: "Guardado",
    error: "No se guardó",
  }[estadoGuardado] || (idInspeccion ? "Guardado" : "Se guarda solo al tocar");

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="modal insp-modal">
        <div className="insp-cabecera">
          <div className="modal-header-icono" style={{ marginBottom: 0 }}>
            <div className="modal-avatar-icono" style={{ "--acc": "var(--teal-600)", "--acc-soft": "var(--teal-100)" }}><Icono nombre="search" size={26} /></div>
            <div>
              <h2>Inspección digital</h2>
              <div className="modal-subtitulo">Toca el estado de cada punto; se guarda al instante. Lo que quede en "Mal" lo puedes ligar a la refacción que se necesita.</div>
            </div>
          </div>
          <div className="insp-contadores">
            <span className="insp-cont bien"><Icono nombre="check-circle" size={18} /> <b>{conteo.bien}</b> Bien</span>
            <span className="insp-cont regular"><Icono nombre="warning" size={18} /> <b>{conteo.regular}</b> Regular</span>
            <span className="insp-cont mal"><Icono nombre="x-circle" size={18} /> <b>{conteo.mal}</b> Mal</span>
            <span className={`guardado-auto ${estadoGuardado || (idInspeccion ? "guardado" : "")}`}>{textoGuardado}</span>
            <button type="button" className="btn-icono insp-cerrar" title="Cerrar" aria-label="Cerrar" onClick={cerrar} disabled={estadoGuardado === "guardando"}>
              <Icono nombre="close" size={20} />
            </button>
          </div>
        </div>

        <div className="insp-cuerpo">
          {categorias.map((cat) => {
            const delaCat = items.filter((i) => i.categoria === cat);
            const malos = delaCat.filter((i) => resultados[i.id_item]?.estado === "mal").length;
            return (
              <section key={cat} className="insp-categoria">
                <div className="insp-categoria-titulo">
                  <span className="insp-categoria-icono"><Icono nombre={ICONO_CATEGORIA[cat] || "search"} size={22} /></span>
                  <h3>{cat}</h3>
                  {malos > 0 && <span className="badge badge-red">{malos} mal</span>}
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => marcarCategoria(cat, "bien")}>
                    <Icono nombre="check-circle" size={16} /> Todo bien
                  </button>
                </div>
                <div className="insp-grid">
                  {delaCat.map((item) => {
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
                            {r.estado === "mal" && (
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <div className="field full">
            <label><IconoAuto valor="📋" size={18} /> Comentario general</label>
            <textarea value={comentarioGeneral} onChange={(e) => { setComentarioGeneral(e.target.value); guardarLuego(900); }} placeholder="Observaciones generales de la inspección" />
          </div>

          {idInspeccion && (
            <div style={{ marginTop: 10 }}>
              <FotoGaleria entidadTipo="inspeccion" entidadId={idInspeccion} puedeEditar />
            </div>
          )}
        </div>

      </div>
    </div>
  ,
  document.body
  );
}
