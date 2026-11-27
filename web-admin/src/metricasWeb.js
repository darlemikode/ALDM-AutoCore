// Métricas reales de usuarios (RUM): LCP, CLS, INP y tiempos de carga. Se mandan con sendBeacon al salir de la página.
const datos = { ruta: location.pathname.replace(/\d+/g, ":id"), red: navigator.connection?.effectiveType || "", lcp: 0, cls: 0, inp: 0 };

try {
  new PerformanceObserver((l) => { const e = l.getEntries(); datos.lcp = Math.round(e[e.length - 1].startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) datos.cls = Math.round((datos.cls + e.value) * 1000) / 1000; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) datos.inp = Math.max(datos.inp, Math.round(e.duration)); }).observe({ type: "event", durationThreshold: 40, buffered: true });
} catch {
  // navegador sin PerformanceObserver: no se mide
}

let enviado = false;
function enviar() {
  if (enviado || !datos.lcp) return;
  enviado = true;
  const nav = performance.getEntriesByType("navigation")[0];
  const cuerpo = JSON.stringify({ ...datos, ttfb: nav ? Math.round(nav.responseStart) : 0, carga: nav ? Math.round(nav.loadEventEnd) : 0 });
  try { navigator.sendBeacon("/api/metricas-web", new Blob([cuerpo], { type: "application/json" })); } catch { /* sin métricas */ }
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") enviar(); });
addEventListener("pagehide", enviar);
