import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Mapa sin dependencias (mosaicos OpenStreetMap / satélite Esri). El pin queda fijo al centro y se
// mueve el mapa: arrastrar (con inercia), clic para colocar el pin ahí, rueda / pellizco / +− para acercar.
const T = 256;
const ZOOM_MIN = 5;
const ZOOM_MAX = 19;
const aPixel = (lat, lng, z) => {
  const n = T * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};
const limitar = (c, z) => { const n = T * 2 ** z; return [c[0], Math.max(0, Math.min(n, c[1]))]; };
const aCoord = (x, y, z) => {
  const n = T * 2 ** z;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, (x / n) * 360 - 180];
};
const CAPAS = {
  mapa: { nombre: "Mapa", url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, credito: "© OpenStreetMap" },
  satelite: { nombre: "Satélite", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, credito: "Imagery © Esri" },
};

export default function MapaUbicacion({ lat, lng, onMover, alto = 260, soloVer = false, zoomInicial = 17, onAmpliar }) {
  const caja = useRef(null);
  const [tam, setTam] = useState({ w: 0, h: alto });
  const [z, setZ] = useState(zoomInicial);
  const [centro, setCentro] = useState(() => aPixel(lat, lng, zoomInicial));
  const [capa, setCapa] = useState("mapa");
  const [arrastrando, setArrastrando] = useState(false);
  const est = useRef({ centro, z });
  est.current = { centro, z };
  const punteros = useRef(new Map());
  const gesto = useRef(null);
  const raf = useRef(0);
  const rueda = useRef(0);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Si cambian las coordenadas desde fuera (enlace, dirección, mi ubicación) se vuela hasta ellas
  useEffect(() => {
    if (gesto.current) return;
    animarA(aPixel(lat, lng, est.current.z), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  function avisar(c, zz = est.current.z) {
    const [la, lo] = aCoord(c[0], c[1], zz);
    onMover?.(Number(la.toFixed(6)), Number(lo.toFixed(6)));
  }

  // Desplazamiento suave hacia un punto (ease-out)
  function animarA(destino, notificar, ms = 320) {
    cancelAnimationFrame(raf.current);
    const ini = est.current.centro;
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setCentro(limitar([ini[0] + (destino[0] - ini[0]) * e, ini[1] + (destino[1] - ini[1]) * e], est.current.z));
      if (k < 1) raf.current = requestAnimationFrame(paso);
      else if (notificar) avisar(destino);
    };
    raf.current = requestAnimationFrame(paso);
  }

  function acercar(nuevoZ) {
    const zz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nuevoZ));
    const { centro: c, z: z0 } = est.current;
    if (zz === z0) return;
    cancelAnimationFrame(raf.current); // una animación en curso con el zoom anterior movería el mapa a otro lugar
    const [la, lo] = aCoord(c[0], c[1], z0);
    est.current = { centro: limitar(aPixel(la, lo, zz), zz), z: zz };
    setZ(zz);
    setCentro(est.current.centro);
  }

  // Rueda del ratón (sin que la página haga scroll)
  useEffect(() => {
    const el = caja.current;
    if (!el || soloVer) return undefined;
    const fn = (e) => {
      e.preventDefault();
      const ahora = Date.now();
      if (ahora - rueda.current < 140) return;
      rueda.current = ahora;
      acercar(est.current.z + (e.deltaY < 0 ? 1 : -1));
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloVer]);

  const abajo = (e) => {
    if (soloVer) return;
    cancelAnimationFrame(raf.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = { tipo: "pellizco", d0: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: est.current.z };
    } else {
      gesto.current = { tipo: "arrastre", x: e.clientX, y: e.clientY, c: est.current.centro, movido: false, vx: 0, vy: 0, t: performance.now() };
    }
  };
  const mover = (e) => {
    const g = gesto.current;
    if (!g) return;
    if (punteros.current.has(e.pointerId)) punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (g.tipo === "pellizco" && punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      acercar(g.z0 + Math.round(Math.log2(Math.hypot(a[0] - b[0], a[1] - b[1]) / g.d0)));
      return;
    }
    if (g.tipo !== "arrastre") return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.movido && Math.abs(dx) + Math.abs(dy) > 3) { g.movido = true; setArrastrando(true); }
    if (!g.movido) return;
    const ahora = performance.now();
    const dt = Math.max(1, ahora - g.t);
    g.vx = (g.px !== undefined ? e.clientX - g.px : 0) / dt;
    g.vy = (g.py !== undefined ? e.clientY - g.py : 0) / dt;
    g.px = e.clientX; g.py = e.clientY; g.t = ahora;
    setCentro(limitar([g.c[0] - dx, g.c[1] - dy], est.current.z));
  };
  const arriba = (e) => {
    punteros.current.delete(e.pointerId);
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === "pellizco") { if (punteros.current.size < 2) { gesto.current = null; avisar(est.current.centro); } return; }
    gesto.current = null;
    setArrastrando(false);
    if (!g.movido) {
      // Clic: el pin se coloca justo donde se hizo clic
      const r = caja.current.getBoundingClientRect();
      const c = est.current.centro;
      animarA([c[0] + (e.clientX - r.left - r.width / 2), c[1] + (e.clientY - r.top - r.height / 2)], true);
      return;
    }
    // Inercia al soltar
    let vx = g.vx * 16, vy = g.vy * 16;
    if (Math.hypot(vx, vy) < 1.5) { avisar(est.current.centro); return; }
    const deslizar = () => {
      vx *= 0.92; vy *= 0.92;
      if (Math.hypot(vx, vy) < 0.4) { avisar(est.current.centro); return; }
      setCentro(([cx, cy]) => limitar([cx - vx, cy - vy], est.current.z));
      raf.current = requestAnimationFrame(deslizar);
    };
    raf.current = requestAnimationFrame(deslizar);
  };

  const n = 2 ** z;
  const x0 = centro[0] - tam.w / 2, y0 = centro[1] - tam.h / 2;
  const tiles = [];
  if (tam.w) {
    for (let ty = Math.floor(y0 / T); ty <= Math.floor((y0 + tam.h) / T); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(x0 / T); tx <= Math.floor((x0 + tam.w) / T); tx++) {
        const wx = ((tx % n) + n) % n;
        tiles.push(
          <img key={`${capa}/${z}/${tx}/${ty}`} alt="" draggable={false} referrerPolicy="origin" src={CAPAS[capa].url(z, wx, ty)}
            style={{ position: "absolute", left: Math.round(tx * T - x0), top: Math.round(ty * T - y0), width: T, height: T }} />,
        );
      }
    }
  }
  const [cla, clo] = aCoord(centro[0], centro[1], z);

  return (
    <div className="mapa-ub" style={{ height: alto }}>
      <div ref={caja} className={`mapa-ub-lienzo ${soloVer ? "solo" : ""} ${arrastrando ? "arrastrando" : ""}`}
        onPointerDown={abajo} onPointerMove={mover} onPointerUp={arriba} onPointerCancel={arriba} onDoubleClick={(e) => { if (!soloVer) { e.preventDefault(); acercar(z + 1); } }}>
        {tiles}
        <div className={`mapa-ub-pin ${arrastrando ? "levantado" : ""}`}>
          <svg viewBox="0 0 24 32" width="34" height="44" aria-hidden="true">
            <path d="M12 31C12 31 2 19.5 2 12a10 10 0 0 1 20 0c0 7.5-10 19-10 19z" fill="#e5391f" stroke="#fff" strokeWidth="2" />
            <circle cx="12" cy="12" r="3.6" fill="#fff" />
          </svg>
          <i className="mapa-ub-sombra" />
        </div>
        {!soloVer && !arrastrando && <span className="mapa-ub-pista">Clic para colocar el pin · arrastra · rueda para acercar</span>}
      </div>
      <div className="mapa-ub-zoom">
        <button type="button" onClick={() => acercar(z + 1)} aria-label="Acercar" disabled={z >= ZOOM_MAX}>+</button>
        <button type="button" onClick={() => acercar(z - 1)} aria-label="Alejar" disabled={z <= ZOOM_MIN}>−</button>
      </div>
      {onAmpliar && (
        <button type="button" className="mapa-ub-ampliar" onClick={onAmpliar} title="Ampliar el mapa" aria-label="Ampliar el mapa">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
          <span>Ampliar</span>
        </button>
      )}
      {!soloVer && (
        <div className="mapa-ub-capas" role="group" aria-label="Tipo de mapa">
          {Object.entries(CAPAS).map(([k, v]) => <button key={k} type="button" className={capa === k ? "act" : ""} onClick={() => setCapa(k)}>{v.nombre}</button>)}
        </div>
      )}
      {!soloVer && <span className="mapa-ub-coords">{cla.toFixed(5)}, {clo.toFixed(5)}</span>}
      <span className="mapa-ub-credito">{CAPAS[capa].credito}</span>
    </div>
  );
}
