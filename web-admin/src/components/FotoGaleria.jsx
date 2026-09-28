import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useUI } from "../context/UIContext";

/**
 * Galería de fotos reutilizable, para vehículos o servicios.
 * entidadTipo: "vehiculo" | "servicio"
 * entidadId: id del registro dueño de las fotos
 * puedeEditar: si puede subir/borrar (según el permiso de ese módulo)
 */
export default function FotoGaleria({ entidadTipo, entidadId, puedeEditar }) {
  const { notify, confirmDialog } = useUI();
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
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
      notify("Foto agregada.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminar(foto) {
    const ok = await confirmDialog("¿Eliminar esta foto? No se puede deshacer.", { danger: true });
    if (!ok) return;
    try {
      await api.del(`/fotos/${foto.id_foto}`);
      setFotos((prev) => prev.filter((f) => f.id_foto !== foto.id_foto));
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
            <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={subiendo}>
              {subiendo ? "Subiendo..." : "+ Agregar foto"}
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
              <a href={`/uploads/${foto.ruta_archivo}`} target="_blank" rel="noreferrer">
                <img
                  src={`/uploads/${foto.ruta_archivo}`}
                  alt={foto.descripcion || "Foto"}
                  style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e5e6" }}
                />
              </a>
              {puedeEditar && (
                <button
                  onClick={() => eliminar(foto)}
                  title="Eliminar foto"
                  style={{
                    position: "absolute", top: 4, right: 4, background: "rgba(20,24,28,0.7)", color: "#fff",
                    border: "none", borderRadius: 100, width: 22, height: 22, cursor: "pointer", fontSize: 12, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
