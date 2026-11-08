import { contiene } from "../lib/texto";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import IconoModulo from "../components/IconoModulo";

// Quita ids numéricos de la ruta para agrupar el mismo error (/servicios/12 y /servicios/98 son uno solo)
const firma = (e) => `${e.status}|${e.metodo}|${(e.ruta || "").replace(/\/\d+/g, "/{id}")}|${(e.mensaje || "").slice(0, 80)}`;

// Bitácora global para soporte (solo súper admin). Cada error nuevo también llega por correo a soporte.
export default function Errores() {
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState("");
  const [soloServidor, setSoloServidor] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get("/errores/?limit=500").then(setFilas).catch(() => setFilas([])).finally(() => setCargando(false));
  }, []);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const e of filas) {
      if (soloServidor && e.status < 500 && e.origen === "servidor") continue; // 4xx/422 son ruido del usuario
      if (q && !contiene(`${e.codigo} ${e.ruta} ${e.mensaje} ${e.taller || ""} ${e.usuario || ""}`, q)) continue;
      const k = firma(e);
      const g = mapa.get(k);
      if (g) { g.n += 1; g.talleres.add(e.taller || "—"); } else mapa.set(k, { k, ultimo: e, n: 1, talleres: new Set([e.taller || "—"]) });
    }
    return [...mapa.values()];
  }, [filas, q, soloServidor]);

  return (
    <div>
      <div className="page-header"><h1><IconoModulo ruta="/errores" /> Errores del sistema</h1><p className="subtitle">Bitácora de todos los talleres. Los errores nuevos también llegan por correo a soporte. Busca por código, taller o ruta.</p></div>
      <div className="card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input placeholder="Buscar por código (ERR-…), taller, ruta o mensaje" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={soloServidor} onChange={(e) => setSoloServidor(e.target.checked)} /> Ocultar errores de validación del usuario
          </label>
        </div>
        {cargando ? <p>Cargando…</p> : grupos.length === 0 ? <p>Sin errores registrados.</p> : grupos.map((g) => {
          const e = g.ultimo;
          return (
            <div key={g.k} style={{ borderTop: "1px solid var(--border, #25424a)", padding: "10px 0" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setAbierto(abierto === g.k ? null : g.k)}>
                <b>{e.codigo}</b>
                {g.n > 1 && <span style={{ background: "#ff3b30", color: "#fff", borderRadius: 10, padding: "0 8px", fontSize: 12 }}>{g.n} veces</span>}
                <span>{e.taller || "Sin taller"}{g.talleres.size > 1 ? ` +${g.talleres.size - 1}` : ""}</span>
                <span>{new Date(e.fecha).toLocaleString("es-MX")}</span>
                <span>{e.metodo} {e.ruta}</span>
                <span>{e.status}</span>
              </div>
              <div style={{ opacity: 0.8, fontSize: 13 }}>{e.mensaje}</div>
              {abierto === g.k && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>{(e.usuario ? `Usuario: ${e.usuario}\n\n` : "") + (e.detalle || "Sin detalle")}</pre>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
