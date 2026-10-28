// Auto deportivo en alambre (wireframe) 3D: geometría y dibujo en canvas, sin librerías.
// Unidades: largo ≈ 4.4, ancho ≈ 1.9. x = izquierda del auto (a la derecha de la pantalla), y = arriba, z = frente.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

// Estaciones a lo largo del auto (de atrás hacia adelante): [z, semiancho, altura de la línea superior]
const ESTACIONES = [
  [-2.2, 0.68, 0.5], [-2.12, 0.8, 0.62], [-1.9, 0.9, 0.7], [-1.55, 0.93, 0.74], [-1.15, 0.94, 0.84],
  [-0.75, 0.94, 0.93], [-0.25, 0.93, 0.98], [0.25, 0.93, 0.97], [0.62, 0.93, 0.86], [0.95, 0.93, 0.7],
  [1.35, 0.92, 0.62], [1.75, 0.88, 0.54], [2.05, 0.8, 0.46], [2.2, 0.66, 0.38],
];

function anillo(hw, yt) {
  const yb = 0.17;
  const ysh = Math.min(0.58, yt - 0.04);
  const c = clamp((yt - 0.64) / 0.14, 0, 1); // 0 = capó/cajuela, 1 = cabina
  const P = [
    [hw * 0.74, yb],
    [hw * 0.98, yb + 0.09],
    [hw, (yb + ysh) / 2],
    [hw * 0.99, ysh],
    [lerp(hw * 0.82, hw * 0.86, c), lerp(yt - 0.01, (0.6 + yt) / 2, c)],
    [lerp(hw * 0.5, hw * 0.64, c), lerp(yt, yt - 0.03, c)],
    [lerp(hw * 0.22, hw * 0.32, c), lerp(yt + 0.01, yt, c)],
  ];
  const der = P.map(([x, y]) => [x, y]);
  const izq = P.slice().reverse().map(([x, y]) => [-x, y]);
  return [[0, yb], ...der, [0, yt + 0.02], ...izq]; // 16 puntos
}

function construir() {
  // Interpolación suave entre estaciones
  const densas = [];
  const n = ESTACIONES.length;
  for (let i = 0; i < n - 1; i++) {
    const a = ESTACIONES[Math.max(i - 1, 0)], b = ESTACIONES[i], c = ESTACIONES[i + 1], d = ESTACIONES[Math.min(i + 2, n - 1)];
    for (let s = 0; s < 2; s++) {
      const t = s / 2;
      densas.push([cr(a[0], b[0], c[0], d[0], t), cr(a[1], b[1], c[1], d[1], t), cr(a[2], b[2], c[2], d[2], t)]);
    }
  }
  densas.push(ESTACIONES[n - 1]);
  const anillos = densas.map(([z, hw, yt]) => ({ z, pts: anillo(hw, yt).map(([x, y]) => [x, y, z]) }));
  const L = []; // {a, b, w} w: 0.35 fino, 0.6 normal, 1 contorno
  const linea = (a, b, w) => L.push({ a, b, w });
  anillos.forEach((r, i) => {
    r.pts.forEach((p, k) => { linea(p, r.pts[(k + 1) % r.pts.length], i === 0 || i === anillos.length - 1 ? 0.9 : 0.4); });
    if (i > 0) {
      const q = anillos[i - 1];
      r.pts.forEach((p, k) => {
        const principal = [4, 6, 8, 12, 14, 1, 15].includes(k); // hombro, borde de techo y centro
        linea(q.pts[k], p, principal ? 0.95 : 0.5);
      });
    }
  });
  // Ruedas
  const rueda = (cx, cz) => {
    const R = 0.34, r = 0.22, xs = [cx > 0 ? 0.72 : -0.72, cx > 0 ? 0.98 : -0.98];
    const circ = (x, rad, w, seg = 28) => { for (let i = 0; i < seg; i++) { const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2; linea([x, 0.34 + Math.sin(a0) * rad, cz + Math.cos(a0) * rad], [x, 0.34 + Math.sin(a1) * rad, cz + Math.cos(a1) * rad], w); } };
    xs.forEach((x) => circ(x, R, 0.9));
    circ(xs[1], r, 0.8); circ(xs[1], 0.07, 0.8, 12);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; linea([xs[0], 0.34 + Math.sin(a) * R, cz + Math.cos(a) * R], [xs[1], 0.34 + Math.sin(a) * R, cz + Math.cos(a) * R], 0.4); }
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; linea([xs[1], 0.34 + Math.sin(a) * 0.07, cz + Math.cos(a) * 0.07], [xs[1], 0.34 + Math.sin(a) * r, cz + Math.cos(a) * r], 0.8); }
    // arco de la salpicadera
    for (let i = 0; i < 16; i++) { const a0 = Math.PI * (i / 16), a1 = Math.PI * ((i + 1) / 16); const x = cx > 0 ? 0.94 : -0.94; linea([x, 0.34 + Math.sin(a0) * 0.42, cz + Math.cos(a0) * 0.42], [x, 0.34 + Math.sin(a1) * 0.42, cz + Math.cos(a1) * 0.42], 0.7); }
  };
  [[0.0, 1.38], [0.0, -1.38]].forEach(([, z]) => { rueda(1, z); rueda(-1, z); });
  // Faros (delante), pilotos (atrás), parrilla, puertas, espejos, alerón
  [1, -1].forEach((s) => {
    const q = (pts, w = 0.9) => pts.forEach((p, k) => linea(p, pts[(k + 1) % pts.length], w));
    q([[s * 0.34, 0.5, 2.1], [s * 0.74, 0.54, 1.96], [s * 0.78, 0.45, 1.98], [s * 0.4, 0.42, 2.12]]);
    linea([s * 0.4, 0.46, 2.1], [s * 0.72, 0.5, 1.97], 0.6);
    q([[s * 0.72, 0.6, -2.08], [s * 0.2, 0.62, -2.18], [s * 0.2, 0.55, -2.19], [s * 0.74, 0.53, -2.09]]);
    q([[s * 0.98, 0.7, 0.55], [s * 1.12, 0.73, 0.5], [s * 1.12, 0.66, 0.47], [s * 0.98, 0.64, 0.5]]);
    linea([s * 0.99, 0.2, 0.7], [s * 0.99, 0.58, 0.7], 0.55); linea([s * 0.99, 0.2, -0.4], [s * 0.99, 0.6, -0.4], 0.55);
    linea([s * 0.99, 0.46, 0.45], [s * 0.99, 0.46, 0.2], 0.7);
    linea([s * 0.97, 0.19, 1.0], [s * 0.97, 0.19, -1.0], 0.7); // faldón lateral
    linea([s * 0.5, 0.74, -1.85], [s * 0.5, 0.9, -1.98], 0.8); // soporte del alerón
    linea([s * 0.35, 0.3, -2.2], [s * 0.35, 0.22, -2.16], 0.6);
  });
  [[-0.88, 0.9, -1.78], [0.88, 0.9, -1.78], [0.88, 0.92, -2.15], [-0.88, 0.92, -2.15]].forEach((p, k, a) => linea(p, a[(k + 1) % 4], 0.9));
  for (let k = 0; k < 4; k++) linea([-0.88 + k * 0.59, 0.9, -1.78], [-0.88 + k * 0.59, 0.92, -2.15], 0.4);
  for (let k = 0; k < 4; k++) linea([-0.4, 0.22 + k * 0.045, 2.2], [0.4, 0.22 + k * 0.045, 2.2], 0.55); // parrilla
  // Respiraderos del capó
  [-1, 1].forEach((s) => { for (let k = 0; k < 4; k++) linea([s * 0.3, 0.64 - k * 0.012, 1.5 - k * 0.1], [s * 0.55, 0.62 - k * 0.012, 1.55 - k * 0.1], 0.5); });
  // Anillos del suelo
  const suelo = [];
  [3.0, 2.45].forEach((R, j) => { for (let i = 0; i < 64; i++) { const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 1) / 64) * Math.PI * 2; if (i % 2 === 0 || j === 1) suelo.push({ a: [Math.cos(a0) * R, 0, Math.sin(a0) * R], b: [Math.cos(a1) * R, 0, Math.sin(a1) * R], w: j ? 0.25 : 0.35 }); } });
  for (let i = -5; i <= 5; i++) { suelo.push({ a: [i * 0.6, 0, -3], b: [i * 0.6, 0, 3], w: 0.12 }); suelo.push({ a: [-3, 0, i * 0.6], b: [3, 0, i * 0.6], w: 0.12 }); }
  return { L, suelo };
}
const GEO = construir();

export const PUNTOS3D = {
  di: { p: [[1.06, 0.34, 1.38]], ang: -55 },
  dd: { p: [[-1.06, 0.34, 1.38]], ang: 55 },
  ti: { p: [[1.06, 0.34, -1.38]], ang: -125 },
  td: { p: [[-1.06, 0.34, -1.38]], ang: 125 },
  faros: { p: [[0.56, 0.5, 2.06], [-0.56, 0.5, 2.06]], ang: 0 },
  motor: { p: [[0, 0.7, 1.45]], ang: 12 },
  transmision: { p: [[0.97, 0.3, 0.1]], ang: -90 },
  espejos: { p: [[1.08, 0.72, 0.5], [-1.08, 0.72, 0.5]], ang: 0 },
  cabina: { p: [[0, 1.02, -0.15]], ang: -30 },
  cajuela: { p: [[0, 0.82, -1.62]], ang: 165 },
  escape: { p: [[0.35, 0.28, -2.22]], ang: 180 },
  luces_t: { p: [[0.5, 0.58, -2.14], [-0.5, 0.58, -2.14]], ang: 180 },
};

const PITCH = 0.42;
export function proyectar([x, y, z], yaw, w, h) {
  const th = (yaw * Math.PI) / 180;
  const xr = x * Math.cos(th) + z * Math.sin(th);
  const zr = -x * Math.sin(th) + z * Math.cos(th);
  const yc = y - 0.45; // centra el auto en vertical
  const sy = -(yc * Math.cos(PITCH)) + zr * Math.sin(PITCH);
  const zc = zr * Math.cos(PITCH) + yc * Math.sin(PITCH);
  const k = Math.min(w * 0.42, h * 0.62) * 3.7 / (7.5 - zc);
  return { x: w / 2 + xr * k, y: h * 0.5 + sy * k, zr, zc };
}

export function dibujar(ctx, w, h, yaw, t) {
  ctx.clearRect(0, 0, w, h);
  const barrido = ((t * 0.00045) % 1) * 6 - 3; // franja luminosa que recorre el auto
  const trazar = (lista, ancho, glow) => {
    lista.forEach(({ a, b, w: peso }) => {
      const pa = proyectar(a, yaw, w, h), pb = proyectar(b, yaw, w, h);
      const prof = clamp(((pa.zc + pb.zc) / 2 + 2.6) / 5.2, 0, 1);
      const zm = (a[2] + b[2]) / 2;
      const luz = glow ? Math.exp(-((zm - barrido) ** 2) / 0.12) : 0;
      const al = clamp((0.14 + 0.7 * prof) * (0.35 + 0.65 * peso) + luz * 0.6, 0, 1);
      const r = Math.round(lerp(60, 170, luz)), g = Math.round(lerp(150, 230, luz)), bl = 255;
      ctx.strokeStyle = `rgba(${r},${g},${bl},${al})`;
      ctx.lineWidth = ancho * (0.7 + 0.8 * peso) * (0.8 + 0.5 * prof);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  };
  ctx.lineCap = "round";
  // El suelo gira lento por su cuenta
  const rot = (t * 0.00004) % (Math.PI * 2);
  const sueloRot = GEO.suelo.map(({ a, b, w: p }) => ({ a: [a[0] * Math.cos(rot) - a[2] * Math.sin(rot), 0, a[0] * Math.sin(rot) + a[2] * Math.cos(rot)], b: [b[0] * Math.cos(rot) - b[2] * Math.sin(rot), 0, b[0] * Math.sin(rot) + b[2] * Math.cos(rot)], w: p }));
  trazar(sueloRot, 1, false);
  trazar(GEO.L, 1.15, true);
}
