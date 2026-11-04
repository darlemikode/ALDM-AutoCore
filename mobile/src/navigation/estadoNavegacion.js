// Guarda en memoria dónde estaba la persona dentro de la app. Al cambiar de
// tema la interfaz se vuelve a montar (key={tema} en App.js) y, sin esto, el
// NavigationContainer arrancaría de cero y mandaría a la pantalla principal.
let estado;
export const estadoGuardado = () => estado;
// Quita el "cajón abierto" del historial: si se restaurara así, el menú lateral
// reaparecería abierto y trabado después de cambiar el tema.
function sinCajon(n) {
  if (!n || typeof n !== "object") return n;
  const r = { ...n };
  if (Array.isArray(r.history)) r.history = r.history.filter((h) => h?.type !== "drawer");
  if (Array.isArray(r.routes)) r.routes = r.routes.map((x) => (x?.state ? { ...x, state: sinCajon(x.state) } : x));
  return r;
}
export const guardarEstado = (s) => { estado = sinCajon(s); };
export const olvidarNavegacion = () => { estado = undefined; };
