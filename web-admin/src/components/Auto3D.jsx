import { useEffect, useRef } from "react";
import { dibujar, proyectar, PUNTOS3D } from "./autoGeometria";
import "./auto3d.css";

const SIMBOLO = { bien: "✓", regular: "!", mal: "✕", ninguno: "" };

// Auto deportivo en alambre azul: gira solo, se arrastra y se orienta hacia la zona elegida.
export default function Auto3D({ estadoZona, elegida, onSelect, nombres = {} }) {
  const vistaRef = useRef(null);
  const canvasRef = useRef(null);
  const dotsRef = useRef({});
  const ang = useRef(-35);
  const objetivo = useRef(null);
  const arrastre = useRef({ activo: false, x: 0, movido: false, hasta: 0 });

  useEffect(() => { objetivo.current = elegida && PUNTOS3D[elegida] ? PUNTOS3D[elegida].ang : null; }, [elegida]);

  useEffect(() => {
    const vista = vistaRef.current, canvas = canvasRef.current;
    if (!vista || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf;
    const medir = () => {
      // clientWidth/Height están en el mismo espacio que los puntos (no les afecta el zoom general de la app)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = vista.clientWidth; h = vista.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(vista);
    const paso = (t) => {
      const a = arrastre.current;
      if (!a.activo) {
        if (objetivo.current !== null) {
          const d = ((objetivo.current - ang.current + 540) % 360) - 180;
          if (Math.abs(d) > 0.2) ang.current += d * 0.1;
        } else if (!quieto && performance.now() > a.hasta) {
          ang.current += 0.3;
        }
      }
      if (ang.current > 180) ang.current -= 360;
      if (ang.current < -180) ang.current += 360;
      if (w > 0) {
        dibujar(ctx, w, h, ang.current, t);
        // Los puntos siguen al auto; los del lado oculto se atenúan
        Object.values(dotsRef.current).forEach((d) => {
          if (!d.el) return;
          const q = proyectar(d.p, ang.current, w, h);
          const visible = d.arriba || q.zr > -0.5;
          d.el.style.left = `${q.x}px`;
          d.el.style.top = `${q.y}px`;
          d.el.style.opacity = visible ? "1" : "0.12";
          d.el.style.pointerEvents = visible ? "auto" : "none";
          d.el.style.zIndex = visible ? String(Math.round(q.zc * 10) + 50) : "1";
        });
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const abajo = (e) => { arrastre.current = { ...arrastre.current, activo: true, x: e.clientX, movido: false }; };
  const mover = (e) => {
    const a = arrastre.current;
    if (!a.activo) return;
    const dx = e.clientX - a.x;
    if (Math.abs(dx) > 3) a.movido = true;
    if (a.movido) { ang.current += dx * 0.6; a.x = e.clientX; objetivo.current = null; }
  };
  const arriba = () => { arrastre.current.activo = false; arrastre.current.hasta = performance.now() + 3500; setTimeout(() => { arrastre.current.movido = false; }, 0); };

  return (
    <div className="auto3d">
      <div ref={vistaRef} className="car-vista" onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerLeave={arriba} onPointerCancel={arriba}>
        <span className="car-esq tl" /><span className="car-esq tr" /><span className="car-esq bl" /><span className="car-esq br" />
        <canvas ref={canvasRef} className="car-canvas" aria-hidden="true" />
        {Object.entries(PUNTOS3D).map(([k, z]) => z.p.map((p, i) => {
          const est = estadoZona(k);
          const activo = elegida === k;
          return (
            <button type="button" key={`${k}-${i}`} ref={(el) => { dotsRef.current[`${k}-${i}`] = { el, p, arriba: p[0] === 0 && p[1] >= 0.7 }; }}
              title={nombres[k]} aria-label={`${nombres[k] || k}: ${est === "ninguno" ? "sin puntos" : est}`} aria-pressed={activo}
              className={`car-dot est-${est}${activo ? " activo" : ""}`}
              onClick={() => { if (!arrastre.current.movido) onSelect(k); }}>
              {SIMBOLO[est]}
            </button>
          );
        }))}
      </div>
      <small className="car-ayuda">Arrastra para girar · toca un punto para revisarlo</small>
    </div>
  );
}
