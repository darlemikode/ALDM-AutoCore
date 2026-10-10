import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Recorrido con globos de texto (tutorial). Ilumina un elemento de la pantalla
 * y pone el globo JUNTO a él, nunca encima: se prueba a la derecha, abajo, a la
 * izquierda y arriba, y se elige el primer lugar donde quepa sin tapar lo
 * iluminado. Si un paso apunta a algo que no está en pantalla, se brinca.
 *
 * pasos: [{ selector | selectores[], titulo, texto, centro? }]
 */
const MARGEN = 14;     // aire entre lo iluminado y el globo
const RELLENO = 8;     // aire alrededor de lo iluminado
const ORILLA = 12;     // distancia mínima a las orillas de la ventana

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function buscar(paso) {
  if (paso.centro) return null;
  const lista = paso.selectores || [paso.selector];
  for (const s of lista) {
    const el = [...document.querySelectorAll(s)].find(visible);
    if (el) return el;
  }
  return null;
}

const seEnciman = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

function ubicar(objetivo, globo) {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!objetivo) return { x: (vw - globo.w) / 2, y: Math.max(ORILLA, (vh - globo.h) / 2) };
  const t = { x: objetivo.left - RELLENO, y: objetivo.top - RELLENO, w: objetivo.width + RELLENO * 2, h: objetivo.height + RELLENO * 2 };
  const centroY = t.y + t.h / 2 - globo.h / 2;
  const centroX = t.x + t.w / 2 - globo.w / 2;
  const candidatos = [
    { x: t.x + t.w + MARGEN, y: centroY },          // derecha
    { x: centroX, y: t.y + t.h + MARGEN },          // abajo
    { x: t.x - MARGEN - globo.w, y: centroY },      // izquierda
    { x: centroX, y: t.y - MARGEN - globo.h },      // arriba
  ];
  const ajustar = (c) => ({
    x: Math.min(Math.max(ORILLA, c.x), vw - globo.w - ORILLA),
    y: Math.min(Math.max(ORILLA, c.y), vh - globo.h - ORILLA),
  });
  for (const c of candidatos) {
    const a = ajustar(c);
    if (!seEnciman({ ...a, w: globo.w, h: globo.h }, t)) return { ...a, libre: true };
  }
  // Último recurso: el lugar donde menos se tape lo iluminado
  const tapado = (a) => {
    const w = Math.max(0, Math.min(a.x + globo.w, t.x + t.w) - Math.max(a.x, t.x));
    const h = Math.max(0, Math.min(a.y + globo.h, t.y + t.h) - Math.max(a.y, t.y));
    return w * h;
  };
  const mejor = candidatos.map(ajustar).sort((a, b) => tapado(a) - tapado(b))[0];
  // No cabe libre: se indica cuánto hay que desplazar la pantalla para que el globo
  // quepa ARRIBA del elemento (o abajo si el elemento es más alto que el espacio).
  const yDeseada = ORILLA + globo.h + MARGEN + RELLENO;
  const cabeArriba = yDeseada + objetivo.height + RELLENO <= vh - ORILLA;
  const desplazar = cabeArriba ? objetivo.top - yDeseada : objetivo.top - RELLENO - ORILLA;
  return { ...mejor, libre: false, desplazar };
}

function contenedorConScroll(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const st = getComputedStyle(p);
    if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
  }
  return document.scrollingElement || document.documentElement;
}

export default function Tour({ pasos, abierto, onTerminar }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const [medido, setMedido] = useState(-1); // paso para el que ya se midió el elemento
  const globoRef = useRef(null);
  const dir = useRef(1);
  const yaDesplazado = useRef(-1); // para no desplazar dos veces en el mismo paso

  useEffect(() => { if (abierto) { setI(0); dir.current = 1; } }, [abierto]);

  const paso = pasos[i];

  // Ubica el elemento del paso (o lo brinca si no existe)
  const medir = useCallback(() => {
    if (!abierto || !paso) return;
    const el = buscar(paso);
    if (!paso.centro && !el) {
      const sig = i + dir.current;
      if (sig >= 0 && sig < pasos.length) setI(sig); else onTerminar(true);
      return;
    }
    setRect(el ? el.getBoundingClientRect() : null);
    setMedido(i);
  }, [abierto, paso, i, pasos.length, onTerminar]);

  useEffect(() => {
    if (!abierto || !paso) return undefined;
    const el = buscar(paso);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const t = setTimeout(medir, el ? 260 : 0);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => { clearTimeout(t); window.removeEventListener("resize", medir); window.removeEventListener("scroll", medir, true); };
  }, [abierto, paso, medir]);

  // Con el tamaño real del globo se elige dónde ponerlo
  useLayoutEffect(() => {
    if (!abierto || !globoRef.current || (!paso?.centro && medido !== i)) return;
    const g = globoRef.current.getBoundingClientRect();
    const p = ubicar(paso?.centro ? null : rect, { w: g.width, h: g.height });
    if (!p.libre && p.desplazar && yaDesplazado.current !== i) {
      // Se mueve la página lo necesario para que el globo quepa sin tapar lo iluminado
      yaDesplazado.current = i;
      const el = buscar(paso);
      if (el) contenedorConScroll(el).scrollBy({ top: p.desplazar, behavior: "instant" });
      setTimeout(() => { const e2 = buscar(paso); if (e2) setRect(e2.getBoundingClientRect()); }, 60);
      return;
    }
    setPos(p);
  }, [abierto, rect, i, paso, medido]);

  const ir = useCallback((delta) => {
    dir.current = delta;
    const sig = i + delta;
    setPos(null);
    if (sig >= pasos.length) onTerminar(true);
    else if (sig >= 0) setI(sig);
  }, [i, pasos.length, onTerminar]);

  useEffect(() => {
    if (!abierto) return undefined;
    const tecla = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onTerminar(false); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); ir(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopImmediatePropagation(); ir(-1); }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [abierto, ir, onTerminar]);

  if (!abierto || !paso) return null;
  const ultimo = i === pasos.length - 1;
  const listo = paso.centro || medido === i;
  const foco = !paso.centro && listo && rect
    ? { left: rect.left - RELLENO, top: rect.top - RELLENO, width: rect.width + RELLENO * 2, height: rect.height + RELLENO * 2 }
    : null;

  return createPortal(
    <div className="tour-capa" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
      {foco ? <div className="tour-foco" style={foco} /> : <div className="tour-velo" />}
      <div ref={globoRef} className={"tour-globo" + (paso.centro ? " tour-globo-centro" : "")}
        style={pos && listo ? { left: pos.x, top: pos.y } : { left: -9999, top: 0 }}>
        <div className="tour-cuenta">Paso {i + 1} de {pasos.length}</div>
        <h3 id="tour-titulo" className="tour-titulo">{paso.titulo}</h3>
        <p className="tour-texto">{paso.texto}</p>
        <div className="tour-puntos" aria-hidden="true">{pasos.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="tour-acciones">
          <button type="button" className="tour-saltar" onClick={() => onTerminar(false)}>{i === 0 ? "Ahora no" : "Saltar"}</button>
          <div className="tour-nav">
            {i > 0 && <button type="button" className="btn btn-secondary" onClick={() => ir(-1)}>Atrás</button>}
            <button type="button" className="btn btn-primary" onClick={() => ir(1)} autoFocus>{i === 0 ? "Empezar" : ultimo ? "Terminar" : "Siguiente"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
