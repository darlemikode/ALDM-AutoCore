import { useMemo } from "react";
import Auto3D from "./Auto3D";
import { ZONAS } from "./AutoInspeccion";
import { zonasRefaccion } from "./zonasRefaccion";
import "./zonaRefacciones.css";

const NOMBRES = Object.fromEntries(Object.entries(ZONAS).map(([k, z]) => [k, z.nombre]));

/**
 * Auto 3D para elegir la zona de donde se van a agregar refacciones.
 *  · refacciones: catálogo (ya filtrado por la búsqueda) · seleccion: { [id_refaccion]: {...} } de lo marcado
 *  · zona: clave de ZONAS | "otras" | null (todas) · onZona(clave|null)
 */
export default function SelectorZonaRefacciones({ refacciones, seleccion, zona, onZona }) {
  const { conteo, marcadas, otras } = useMemo(() => {
    const c = {}, m = {};
    let o = 0;
    refacciones.forEach((r) => {
      const zs = zonasRefaccion(r);
      if (!zs.length) o += 1;
      zs.forEach((z) => {
        c[z] = (c[z] || 0) + 1;
        if (seleccion[r.id_refaccion]) m[z] = (m[z] || 0) + 1;
      });
    });
    return { conteo: c, marcadas: m, otras: o };
  }, [refacciones, seleccion]);

  const toggle = (k) => onZona(zona === k ? null : k);
  const estado = (k) => (marcadas[k] ? "refsel" : conteo[k] ? "ref" : "ninguno");
  const etiqueta = (k) => (conteo[k] ? (conteo[k] > 99 ? "99+" : String(conteo[k])) : "");

  return (
    <aside className="add-ref-auto" aria-label="Elegir refacciones por zona del auto">
      <div className="add-ref-auto-cab">
        <strong>{zona === "otras" ? "Sin zona" : zona ? ZONAS[zona]?.nombre : "Todo el vehículo"}</strong>
        {zona && <button type="button" className="add-ref-auto-todas" onClick={() => onZona(null)}>Ver todas</button>}
      </div>
      <Auto3D compacto estadoZona={estado} etiqueta={etiqueta} elegida={zona && zona !== "otras" ? zona : null} onSelect={toggle}
        nombres={NOMBRES} ayuda="Gira el auto y toca una zona para ver sus refacciones" />
      <div className="add-ref-auto-leyenda">
        <span><i className="ref" />Con refacciones</span>
        <span><i className="refsel" />Con marcadas</span>
      </div>
      {otras > 0 && (
        <button type="button" className={`add-ref-auto-otras${zona === "otras" ? " activo" : ""}`} onClick={() => toggle("otras")}>
          Sin zona <b>{otras}</b>
        </button>
      )}
    </aside>
  );
}
