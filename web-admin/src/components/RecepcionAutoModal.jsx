import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import ModalPortal from "./ModalPortal";
import { Icono } from "./Icono";
import Auto3D from "./Auto3D";
import { PIEZAS3D, PUNTOS3D } from "./autoGeometria";
import { ZONAS } from "./AutoInspeccion";
import "./recepcionAuto.css";

const TIPOS = [
  ["rayon", "Rayón"], ["golpe", "Golpe"], ["abolladura", "Abolladura"], ["pintura", "Pintura dañada"],
  ["cristal", "Cristal roto"], ["faltante", "Faltante"], ["otro", "Otro"],
];
const GRAVEDADES = [["leve", "Leve"], ["medio", "Medio"], ["severo", "Severo"]];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const NOMBRES_ZONA = Object.fromEntries(Object.entries(ZONAS).map(([k, z]) => [k, z.nombre]));
const ORDEN_GRAVEDAD = { leve: 1, medio: 2, severo: 3 };
const ESTADOS_AVANCE = [["", "Sin iniciar"], ["proceso", "En proceso"], ["listo", "Listo"]];

/**
 * Recepción del vehículo (daños previos marcados en el auto 3D) y avance por zonas de la orden.
 * Pestaña 1: toca una pieza → registra el daño con tipo, gravedad, comentario y fotos.
 * Pestaña 2: marca qué zonas ya se atendieron; el cliente lo ve iluminado en su seguimiento.
 */
export default function RecepcionAutoModal({ idServicio, puedeEditar = true, onClose }) {
  const { notify, confirmDialog } = useUI();
  const [pestana, setPestana] = useState("recepcion");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [pieza, setPieza] = useState(null);
  const [zona, setZona] = useState(null);
  const [form, setForm] = useState({ tipo: "golpe", gravedad: "leve", comentario: "" });
  const [archivos, setArchivos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [subiendoDano, setSubiendoDano] = useState(null);

  async function cargar() {
    try {
      setDatos(await api.get(`/recepcion/${idServicio}`));
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo cargar la recepción.");
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idServicio]);

  const danos = datos?.danos || [];
  const avance = datos?.avance_zonas || {};

  // ---- Recepción ------------------------------------------------------------------
  const danosPorPieza = useMemo(() => {
    const m = {};
    danos.forEach((d) => { (m[d.pieza] = m[d.pieza] || []).push(d); });
    return m;
  }, [danos]);
  const estadoPieza = (k) => {
    const lista = danosPorPieza[k];
    if (!lista) return "ninguno";
    const peor = Math.max(...lista.map((d) => ORDEN_GRAVEDAD[d.gravedad] || 1));
    return peor >= 3 ? "mal" : "regular";
  };

  function elegirArchivo(e) {
    const nuevos = Array.from(e.target.files || []);
    e.target.value = "";
    if (nuevos.length) setArchivos((prev) => [...prev, ...nuevos].slice(0, 6));
  }

  async function subirFoto(idDano, archivo) {
    const fd = new FormData();
    fd.append("entidad_tipo", "dano_recepcion");
    fd.append("entidad_id", idDano);
    fd.append("archivo", archivo);
    return api.postForm("/fotos/", fd);
  }

  async function guardarDano() {
    if (!pieza) return;
    setGuardando(true);
    try {
      const d = await api.post(`/recepcion/${idServicio}/danos`, { pieza, tipo: form.tipo, gravedad: form.gravedad, comentario: form.comentario.trim() || null });
      for (const a of archivos) {
        try { await subirFoto(d.id_dano, a); } catch (e) { notify(`Una foto no se pudo subir: ${e.message}`, "error"); }
      }
      setArchivos([]);
      setForm((f) => ({ ...f, comentario: "" }));
      await cargar();
      notify("Daño registrado.", "success");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarDano(d) {
    if (!(await confirmDialog("¿Eliminar este daño y sus fotos? No se puede deshacer.", { danger: true, confirmar: "Sí, eliminar" }))) return;
    try {
      await api.del(`/recepcion/danos/${d.id_dano}`);
      await cargar();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  async function agregarFotoADano(d, archivo) {
    if (!archivo) return;
    setSubiendoDano(d.id_dano);
    try {
      await subirFoto(d.id_dano, archivo);
      await cargar();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setSubiendoDano(null);
    }
  }

  async function borrarFoto(f) {
    if (!(await confirmDialog("¿Eliminar esta foto?", { danger: true, confirmar: "Sí, eliminar" }))) return;
    try {
      await api.del(`/fotos/${f.id_foto}`);
      await cargar();
    } catch (e) {
      notify(e.message, "error");
    }
  }

  // ---- Avance ------------------------------------------------------------------------
  async function marcarZona(z, estado) {
    const siguiente = { ...avance };
    if (estado) siguiente[z] = estado; else delete siguiente[z];
    setDatos((d) => ({ ...d, avance_zonas: siguiente })); // optimista
    try {
      await api.put(`/recepcion/${idServicio}/avance`, { zonas: siguiente });
    } catch (e) {
      notify(e.message, "error");
      cargar();
    }
  }
  const estadoZona = (k) => (avance[k] === "listo" ? "bien" : avance[k] === "proceso" ? "regular" : "ninguno");
  const listos = Object.values(avance).filter((e) => e === "listo").length;
  const enProceso = Object.values(avance).filter((e) => e === "proceso").length;
  const luz = { progreso: datos?.progreso_auto ?? 0, zonas: avance };

  const listaPieza = pieza ? danosPorPieza[pieza] || [] : [];

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal insp-modal ra-modal">
          <button type="button" className="x-cerrar" title="Cerrar" aria-label="Cerrar" onClick={onClose}><Icono nombre="close" size={20} /></button>
          <div className="insp-cabecera">
            <div className="modal-header-icono" style={{ marginBottom: 0 }}>
              <div className="modal-avatar-icono" style={{ "--acc": "var(--petrol-500)", "--acc-soft": "var(--teal-100)" }}><Icono nombre="camera" size={26} /></div>
              <div>
                <h2>Recepción y avance del vehículo</h2>
                <div className="modal-subtitulo">Marca los daños con los que llega el auto y, durante el trabajo, las zonas que ya atendiste. El cliente lo ve en su seguimiento.</div>
              </div>
            </div>
            <div className="ra-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={pestana === "recepcion"} className={pestana === "recepcion" ? "activo" : ""} onClick={() => setPestana("recepcion")}>
                Recepción <b>{danos.length}</b>
              </button>
              <button type="button" role="tab" aria-selected={pestana === "avance"} className={pestana === "avance" ? "activo" : ""} onClick={() => setPestana("avance")}>
                Avance <b>{listos + enProceso}</b>
              </button>
            </div>
          </div>

          <div className="insp-cuerpo">
            {error && <p className="error-text" role="alert">{error}</p>}
            {!datos && !error && <p className="loading-text">Cargando…</p>}

            {datos && pestana === "recepcion" && (
              <div className="ra-grid">
                <div className="ra-auto">
                  <Auto3D puntos={PIEZAS3D} compacto estadoZona={estadoPieza} elegida={pieza} onSelect={(k) => setPieza(pieza === k ? null : k)}
                    ayuda="Arrastra para girar · toca una pieza para registrar un daño" />
                  <div className="ra-leyenda" aria-hidden="true"><span><i className="n" />Sin daño</span><span><i className="r" />Leve / medio</span><span><i className="m" />Severo</span></div>
                </div>

                <div className="ra-panel">
                  {!pieza ? (
                    <>
                      <h3>Daños registrados ({danos.length})</h3>
                      {danos.length === 0 ? (
                        <p className="ra-vacio">Sin daños registrados. Toca una pieza del auto para marcar un rayón, golpe o faltante. Si el auto llega en buen estado, no hace falta marcar nada.</p>
                      ) : (
                        <ul className="ra-lista">
                          {danos.map((d) => (
                            <li key={d.id_dano} className={`g-${d.gravedad}`}>
                              <button type="button" className="ra-lista-ir" onClick={() => setPieza(d.pieza)}>
                                <strong>{d.pieza_nombre}</strong>
                                <span>{NOMBRE_TIPO[d.tipo] || d.tipo} · {d.gravedad}</span>
                              </button>
                              {d.fotos.length > 0 && <small>{d.fotos.length} foto{d.fotos.length !== 1 ? "s" : ""}</small>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="ra-barra">
                        <h3>{PIEZAS3D[pieza].nombre}</h3>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPieza(null)}>Ver todos</button>
                      </div>

                      {listaPieza.map((d) => (
                        <article key={d.id_dano} className={`ra-dano g-${d.gravedad}`}>
                          <header>
                            <strong>{NOMBRE_TIPO[d.tipo] || d.tipo}</strong>
                            <span className="ra-chip">{d.gravedad}</span>
                            {puedeEditar && <button type="button" className="ra-x" title="Eliminar daño" aria-label="Eliminar daño" onClick={() => borrarDano(d)}>×</button>}
                          </header>
                          {d.comentario && <p>{d.comentario}</p>}
                          <div className="ra-fotos">
                            {d.fotos.map((f) => (
                              <span key={f.id_foto} className="ra-foto">
                                <a href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt="Foto del daño" loading="lazy" /></a>
                                {puedeEditar && <button type="button" title="Eliminar foto" aria-label="Eliminar foto" onClick={() => borrarFoto(f)}>×</button>}
                              </span>
                            ))}
                            {puedeEditar && (
                              <>
                                <label className={`ra-add ${subiendoDano === d.id_dano ? "ocupado" : ""}`}><Icono nombre="camera" size={18} /><span>Tomar foto</span>
                                  <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; agregarFotoADano(d, a); }} /></label>
                                <label className={`ra-add ${subiendoDano === d.id_dano ? "ocupado" : ""}`}><span>Galería</span>
                                  <input type="file" accept="image/*" hidden onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; agregarFotoADano(d, a); }} /></label>
                              </>
                            )}
                          </div>
                        </article>
                      ))}

                      {puedeEditar && (
                        <div className="ra-form">
                          <h4>Registrar daño en esta pieza</h4>
                          <div className="ra-campo">
                            <label>Tipo de daño</label>
                            <div className="ra-chips">
                              {TIPOS.map(([k, n]) => <button type="button" key={k} className={form.tipo === k ? "activo" : ""} onClick={() => setForm({ ...form, tipo: k })}>{n}</button>)}
                            </div>
                          </div>
                          <div className="ra-campo">
                            <label>Gravedad</label>
                            <div className="ra-seg">
                              {GRAVEDADES.map(([k, n]) => <button type="button" key={k} className={`${form.gravedad === k ? "activo" : ""} g-${k}`} onClick={() => setForm({ ...form, gravedad: k })}>{n}</button>)}
                            </div>
                          </div>
                          <div className="ra-campo">
                            <label>Comentario (opcional)</label>
                            <input value={form.comentario} maxLength={255} placeholder="Ej. Rayón largo en la parte baja" onChange={(e) => setForm({ ...form, comentario: e.target.value })} />
                          </div>
                          <div className="ra-campo">
                            <label>Fotos</label>
                            <div className="ra-fotos">
                              {archivos.map((a, i) => (
                                <span key={i} className="ra-foto">
                                  <img src={URL.createObjectURL(a)} alt="Vista previa" />
                                  <button type="button" title="Quitar" aria-label="Quitar foto" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))}>×</button>
                                </span>
                              ))}
                              <label className="ra-add"><Icono nombre="camera" size={18} /><span>Tomar foto</span>
                                <input type="file" accept="image/*" capture="environment" hidden onChange={elegirArchivo} /></label>
                              <label className="ra-add"><span>Galería</span><input type="file" accept="image/*" multiple hidden onChange={elegirArchivo} /></label>
                            </div>
                          </div>
                          <button type="button" className="btn btn-primary" onClick={guardarDano} disabled={guardando}>{guardando ? "Guardando…" : "Guardar daño"}</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {datos && pestana === "avance" && (
              <div className="ra-grid">
                <div className="ra-auto">
                  <Auto3D puntos={PUNTOS3D} compacto nombres={NOMBRES_ZONA} avance={luz} estadoZona={estadoZona} elegida={zona}
                    onSelect={(k) => setZona(zona === k ? null : k)} ayuda="Así lo verá el cliente · toca una zona para marcarla" />
                  <div className="ra-leyenda" aria-hidden="true"><span><i className="av" />Avance por etapa</span><span><i className="p" />En proceso</span><span><i className="l" />Listo</span></div>
                </div>
                <div className="ra-panel">
                  <h3>Avance por zonas</h3>
                  <p className="ra-vacio">El auto se ilumina solo según la etapa de la orden ({Math.round((datos.progreso_auto || 0) * 100)}%). Aquí marca, además, las zonas que ya trabajaste.</p>
                  <ul className="ra-zonas">
                    {Object.entries(ZONAS).map(([k, z]) => (
                      <li key={k} className={zona === k ? "elegida" : ""}>
                        <button type="button" className="ra-zona-nombre" onClick={() => setZona(zona === k ? null : k)}>{z.nombre}</button>
                        <div className="ra-seg ra-seg-av">
                          {ESTADOS_AVANCE.map(([e, n]) => (
                            <button type="button" key={e || "ninguno"} disabled={!puedeEditar}
                              className={`${(avance[k] || "") === e ? "activo" : ""} av-${e || "ninguno"}`} onClick={() => marcarZona(k, e)}>{n}</button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="insp-pie">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
