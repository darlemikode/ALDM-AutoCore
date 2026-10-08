import { contiene, norm } from "../lib/texto";
import { useEffect, useState } from "react";
import { api } from "../api";
import IconoModulo from "../components/IconoModulo";

export default function Errores() {
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get("/errores/?limit=300").then(setFilas).catch(() => setFilas([])).finally(() => setCargando(false));
  }, []);

  const visibles = filas.filter((e) => !q || contiene(`${e.codigo} ${e.ruta} ${e.mensaje}`, q));

  return (
    <div>
      <div className="page-header"><h1><IconoModulo ruta="/errores" /> Errores del sistema</h1><p className="subtitle">Bitácora de errores de tu taller. Busca por el código que ve el usuario.</p></div>
      <div className="card">
        <input placeholder="Buscar por código (ERR-…), ruta o mensaje" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
        {cargando ? <p>Cargando…</p> : visibles.length === 0 ? <p>Sin errores registrados.</p> : visibles.map((e) => (
          <div key={e.id_error} style={{ borderTop: "1px solid var(--border, #25424a)", padding: "10px 0" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setAbierto(abierto === e.id_error ? null : e.id_error)}>
              <b>{e.codigo}</b>
              <span>{new Date(e.fecha).toLocaleString("es-MX")}</span>
              <span>{e.metodo} {e.ruta}</span>
              <span>{e.status}</span>
            </div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>{e.mensaje}</div>
            {abierto === e.id_error && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>{e.detalle || "Sin detalle"}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
