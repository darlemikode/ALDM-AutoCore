import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Selector con buscador: se escribe para filtrar y se elige de la lista.
 *   opciones: [{ value, label, sub? }]
 */
export default function BuscadorSelect({ label, opciones, value, onChange, placeholder = "Buscar…", disabled, vacio = "Sin resultados" }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const elegido = opciones.find((o) => String(o.value) === String(value));

  useEffect(() => {
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return opciones.filter((o) => !t || `${o.label} ${o.sub || ""}`.toLowerCase().includes(t)).slice(0, 60);
  }, [opciones, q]);

  return (
    <div className="field buscador-select" ref={caja} style={{ position: "relative" }}>
      <label>{label}</label>
      <input
        value={abierto ? q : (elegido ? elegido.label : "")}
        placeholder={elegido ? elegido.label : placeholder}
        disabled={disabled}
        onFocus={() => { setQ(""); setAbierto(true); }}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
      />
      {elegido && !disabled && (
        <button type="button" className="buscador-limpiar" title="Quitar" onClick={() => { onChange(""); setQ(""); }}>×</button>
      )}
      {abierto && !disabled && (
        <div className="buscador-lista">
          {filtradas.length === 0 ? <div className="buscador-vacio">{vacio}</div> : filtradas.map((o) => (
            <button type="button" key={o.value} className={"buscador-item" + (String(o.value) === String(value) ? " activo" : "")}
              onClick={() => { onChange(o.value); setAbierto(false); setQ(""); }}>
              <span>{o.label}</span>{o.sub && <small>{o.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
