import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

const pad = (n) => String(n).padStart(2, "0");
const aTexto = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function leer(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}
const hoyTexto = () => { const h = new Date(); return aTexto(h.getFullYear(), h.getMonth(), h.getDate()); };

/**
 * Calendario propio (reemplaza al nativo del navegador): botón con la fecha,
 * y un panel con selector de mes y año, días y atajos Hoy / Borrar.
 * value / onChange trabajan con texto "YYYY-MM-DD" (igual que <input type="date">).
 */
export default function SelectorFecha({ value, onChange, min, max, disabled, required, placeholder = "dd/mm/aaaa", autoFocus }) {
  const actual = leer(value);
  const base = actual || leer(hoyTexto());
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState({ y: base.y, m: base.m });
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boton = useRef(null);
  const panel = useRef(null);

  useEffect(() => { if (abierto) setVista({ y: base.y, m: base.m }); /* eslint-disable-next-line */ }, [abierto]);

  function abrir() {
    if (disabled) return;
    const r = boton.current.getBoundingClientRect();
    const alto = 400, ancho = 320;
    const top = r.bottom + alto > window.innerHeight ? Math.max(8, r.top - alto - 6) : r.bottom + 6;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - ancho - 8);
    setPos({ top, left });
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (!panel.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); } };
    const cerrar = () => setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", cerrar);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla, true); window.removeEventListener("resize", cerrar); };
  }, [abierto]);

  const celdas = useMemo(() => {
    const primero = new Date(vista.y, vista.m, 1).getDay();
    const total = new Date(vista.y, vista.m + 1, 0).getDate();
    const prevTotal = new Date(vista.y, vista.m, 0).getDate();
    const lista = [];
    for (let i = 0; i < 42; i++) {
      const n = i - primero + 1;
      if (n < 1) lista.push({ d: prevTotal + n, fuera: true, mes: vista.m - 1 });
      else if (n > total) lista.push({ d: n - total, fuera: true, mes: vista.m + 1 });
      else lista.push({ d: n, fuera: false, mes: vista.m });
    }
    return lista.map((c) => {
      const f = new Date(vista.y, c.mes, c.d);
      return { ...c, texto: aTexto(f.getFullYear(), f.getMonth(), f.getDate()) };
    });
  }, [vista]);

  const anios = useMemo(() => {
    const y = new Date().getFullYear();
    const lista = [];
    for (let a = y - 80; a <= y + 15; a++) lista.push(a);
    if (!lista.includes(vista.y)) lista.push(vista.y);
    return lista.sort((a, b) => a - b);
  }, [vista.y]);

  const mover = (delta) => {
    const f = new Date(vista.y, vista.m + delta, 1);
    setVista({ y: f.getFullYear(), m: f.getMonth() });
  };
  const bloqueado = (t) => (min && t < min) || (max && t > max);
  const elegir = (t) => { if (bloqueado(t)) return; onChange(t); setAbierto(false); };
  const hoy = hoyTexto();
  const mostrado = actual ? `${pad(actual.d)}/${pad(actual.m + 1)}/${actual.y}` : "";

  return (
    <>
      <button ref={boton} type="button" className={`selfecha-boton ${actual ? "" : "vacio"}`} onClick={() => (abierto ? setAbierto(false) : abrir())} disabled={disabled} autoFocus={autoFocus}
        aria-haspopup="dialog" aria-expanded={abierto}>
        <span>{mostrado || placeholder}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" required value={value || ""} onChange={() => {}} className="selfecha-req" />}
      {abierto && createPortal(
        <div ref={panel} className="selfecha-panel" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label="Elegir fecha">
          <div className="selfecha-cab">
            <button type="button" className="selfecha-nav" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
            <select className="selfecha-sel" value={vista.m} onChange={(e) => setVista({ ...vista, m: Number(e.target.value) })} aria-label="Mes">
              {MESES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
            <select className="selfecha-sel selfecha-anio" value={vista.y} onChange={(e) => setVista({ ...vista, y: Number(e.target.value) })} aria-label="Año">
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" className="selfecha-nav" onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
          </div>
          <div className="selfecha-dias">{DIAS.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="selfecha-grid">
            {celdas.map((c, i) => (
              <button type="button" key={i} disabled={bloqueado(c.texto)}
                className={`selfecha-dia ${c.fuera ? "fuera" : ""} ${c.texto === value ? "sel" : ""} ${c.texto === hoy ? "hoy" : ""}`}
                onClick={() => elegir(c.texto)}>{c.d}</button>
            ))}
          </div>
          <div className="selfecha-pie">
            <button type="button" className="selfecha-atajo" onClick={() => { onChange(""); setAbierto(false); }} disabled={required}>Borrar</button>
            <button type="button" className="selfecha-atajo fuerte" onClick={() => elegir(hoy)} disabled={bloqueado(hoy)}>Hoy</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
