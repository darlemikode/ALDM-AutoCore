import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/*
 * Combo ágil: se abre al tocarlo, se escribe directo para filtrar (sin
 * barra aparte), flechas + Enter para elegir, Esc para cerrar.
 *   opciones: [{ value, label }]  ·  onChange(value | null)
 */
export default function Combo({ opciones, value, onChange, required, disabled, placeholder = "Selecciona…" }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const caja = useRef(null);
  const lista = useRef(null);
  const [pos, setPos] = useState(null);
  const elegido = opciones.find((o) => String(o.value) === String(value ?? ""));

  useEffect(() => {
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target) && !(lista.current && lista.current.contains(e.target))) { setAbierto(false); setQ(""); } };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const filtradas = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return opciones;
    const empieza = opciones.filter((o) => norm(o.label).startsWith(t));
    const contiene = opciones.filter((o) => !norm(o.label).startsWith(t) && norm(o.label).includes(t));
    return [...empieza, ...contiene];
  }, [opciones, q]);

  // La lista flota (portal) para que ninguna ventana con scroll la recorte
  useLayoutEffect(() => {
    if (!abierto) return undefined;
    function colocar() {
      const r = caja.current?.getBoundingClientRect();
      if (!r) return;
      const alto = 250;
      const abajo = window.innerHeight - r.bottom;
      const arriba = abajo < alto && r.top > abajo;
      setPos({ left: r.left, width: r.width, ...(arriba ? { bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(alto, r.top - 12) } : { top: r.bottom + 4, maxHeight: Math.min(alto, abajo - 12) }) });
    }
    colocar();
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => { window.removeEventListener("resize", colocar); window.removeEventListener("scroll", colocar, true); };
  }, [abierto]);

  useEffect(() => { setCursor(0); }, [q, abierto]);
  useEffect(() => {
    lista.current?.querySelector(".combo-item.cursor")?.scrollIntoView({ block: "nearest" });
  }, [cursor, abierto]);

  function elegir(o) {
    onChange(o ? o.value : null);
    setAbierto(false);
    setQ("");
  }

  function teclas(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setCursor((c) => Math.min(c + 1, filtradas.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && abierto) { e.preventDefault(); if (filtradas[cursor]) elegir(filtradas[cursor]); }
    else if (e.key === "Escape" && abierto) { e.stopPropagation(); setAbierto(false); setQ(""); }
  }

  return (
    <div className="combo" ref={caja}>
      <input
        className="combo-input"
        value={abierto ? q : (elegido ? elegido.label : "")}
        placeholder={abierto && elegido ? elegido.label : placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onKeyDown={teclas}
      />
      <span className="combo-flecha" aria-hidden="true">▾</span>
      {required && <input className="combo-requerido" tabIndex={-1} aria-hidden="true" required value={value ?? ""} onChange={() => {}} />}
      {abierto && !disabled && pos && createPortal(
        <div className="combo-lista combo-flota" ref={lista} role="listbox" style={pos}>
          {filtradas.length === 0 ? <div className="combo-vacio">Sin resultados</div> : filtradas.map((o, i) => (
            <div
              key={o.value}
              role="option"
              className={"combo-item" + (i === cursor ? " cursor" : "") + (String(o.value) === String(value ?? "") ? " elegido" : "")}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
              onMouseEnter={() => setCursor(i)}
            >
              {o.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
