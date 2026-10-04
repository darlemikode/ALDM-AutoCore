import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Selector con buscador: se escribe para filtrar y se elige de la lista.
 *   opciones: [{ value, label, sub? }]
 */
export default function BuscadorSelect({ label, opciones, value, onChange, placeholder = "Buscar…", disabled, vacio = "Sin resultados" }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const [sel, setSel] = useState(0);
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

  useEffect(() => { setSel(0); }, [q, abierto]);
  useEffect(() => {
    if (!abierto || !caja.current) return;
    const el = caja.current.querySelectorAll(".buscador-item")[sel];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [sel, abierto]);

  function elegir(o) { onChange(o.value); setAbierto(false); setQ(""); }
  function teclas(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setSel((i) => Math.min(i + 1, filtradas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && abierto) { e.preventDefault(); if (filtradas[sel]) elegir(filtradas[sel]); }
    else if (e.key === "Escape" && abierto) { e.stopPropagation(); e.preventDefault(); setAbierto(false); }
  }

  return (
    <div className="field buscador-select" ref={caja} style={{ position: "relative" }}>
      <label>{label}</label>
      <input
        value={abierto ? q : (elegido ? elegido.label : "")}
        placeholder={elegido ? elegido.label : placeholder}
        disabled={disabled}
        onFocus={() => { setQ(""); setAbierto(true); }}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onKeyDown={teclas}
      />
      {elegido && !disabled && (
        <button type="button" className="buscador-limpiar" title="Quitar" onClick={() => { onChange(""); setQ(""); }}>×</button>
      )}
      {abierto && !disabled && (
        <div className="buscador-lista">
          {filtradas.length === 0 ? <div className="buscador-vacio">{vacio}</div> : filtradas.map((o, i) => (
            <button type="button" key={o.value} className={"buscador-item" + (String(o.value) === String(value) ? " activo" : "") + (i === sel ? " resaltado" : "")}
              onMouseEnter={() => setSel(i)} onClick={() => elegir(o)}>
              <span>{o.label}</span>{o.sub && <small>{o.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
