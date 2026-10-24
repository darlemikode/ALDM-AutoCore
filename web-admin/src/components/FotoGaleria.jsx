import { Icono, IconoAuto } from "./Icono";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";
import ModalPortal from "./ModalPortal";

/**
 * Galería de fotos reutilizable, para vehículos o servicios.
 * entidadTipo: "vehiculo" | "servicio"
 * entidadId: id del registro dueño de las fotos
 * puedeEditar: si puede subir/borrar (según el permiso de ese módulo)
 */
export default function FotoGaleria({ entidadTipo, entidadId, puedeEditar, onCambio, onFotoAgregada }) {
  const { notify, confirmDialog } = useUI();
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [viendo, setViendo] = useState(null); // foto abierta en el visualizador interno
  const inputRef = useRef(null);

  async function cargar() {
    setLoading(true);
    try {
      const data = await api.get(`/fotos/?entidad_tipo=${entidadTipo}&entidad_id=${entidadId}`);
      setFotos(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadTipo, entidadId]);

  async function alElegirArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!archivo) return;

    const formData = new FormData();
    formData.append("entidad_tipo", entidadTipo);
    formData.append("entidad_id", entidadId);
    formData.append("archivo", archivo);

    setSubiendo(true);
    try {
      await api.postForm("/fotos/", formData);
      await cargar();
      onCambio?.();
      notify("Foto agregada.", "success");
      onFotoAgregada?.();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminar(foto) {
    const ok = await confirmDialog("¿Eliminar esta foto? No se puede deshacer.", { danger: true, confirmar: "Sí, eliminar" });
    if (!ok) return;
    try {
      await api.del(`/fotos/${foto.id_foto}`);
      setFotos((prev) => prev.filter((f) => f.id_foto !== foto.id_foto));
      onCambio?.();
      notify("Foto eliminada.", "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", color: "var(--ink-700)" }}>
          Fotos {fotos.length > 0 ? `(${fotos.length})` : ""}
        </div>
        {puedeEditar && (
          <>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={alElegirArchivo} />
            <button className="btn-agregar btn-agregar-icono" title="Agregar foto" aria-label="Agregar foto" onClick={() => inputRef.current?.click()} disabled={subiendo}>
              {subiendo ? <span style={{ fontSize: 13 }}>Subiendo…</span> : <Icono nombre="camera-add" size={26} />}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="loading-text">Cargando…</div>
      ) : fotos.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--ink-500)" }}>Sin fotos todavía.</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {fotos.map((foto) => (
            <div key={foto.id_foto} style={{ position: "relative", width: 120 }}>
              <img loading="lazy" decoding="async"
                src={`/uploads/${foto.ruta_archivo}`}
                alt={foto.descripcion || "Foto"}
                onClick={() => setViendo(foto)}
                style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e5e6", cursor: "zoom-in" }}
              />
              {puedeEditar && (
                <button
                  onClick={() => eliminar(foto)}
                  title="Eliminar foto"
                  style={{
                    position: "absolute", top: 4, right: 4, background: "rgba(20,24,28,0.7)", color: "#fff",
                    border: "none", borderRadius: 100, width: 22, height: 22, cursor: "pointer", fontSize: 12, lineHeight: 1,
                  }}
                >
                  <IconoAuto valor="✕" size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viendo && (
        <ModalPortal>
          <div
            className="modal-backdrop"
            style={{ background: "rgba(10,12,14,0.82)" }}
            onClick={(e) => e.target === e.currentTarget && setViendo(null)}
          >
            <div style={{ position: "relative", maxWidth: "min(90vw, 640px)", maxHeight: "85vh" }}>
              <button
                onClick={() => setViendo(null)}
                title="Cerrar"
                aria-label="Cerrar"
                style={{
                  position: "absolute", top: -14, right: -14, background: "#fff", color: "var(--ink-900)",
                  border: "1px solid var(--ink-300)", borderRadius: 100, width: 32, height: 32, cursor: "pointer",
                  display: "grid", placeItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,.25)",
                }}
              >
                <IconoAuto valor="✕" size={18} />
              </button>
              <img loading="lazy" decoding="async"
                src={`/uploads/${viendo.ruta_archivo}`}
                alt={viendo.descripcion || "Foto"}
                style={{ display: "block", maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
