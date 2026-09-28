// Estado compartido de la campanita de avisos (mensajes del chat del
// cliente que nadie vio en vivo — ver notificaciones.py en el backend).
// Vive fuera de React para que un solo temporizador sirva a toda la app,
// sin importar cuántas pantallas/pestañas monten el ícono de campana a la
// vez (cada stack de la barra inferior tiene su propio encabezado).
import { api } from "./api";
import { suscribirActualizacionGlobal } from "./actualizacionesGlobales";

let conteo = 0;
let lista = [];
const escuchas = new Set();
let intervalo = null;

function emitir() {
  escuchas.forEach((fn) => {
    try { fn({ conteo, lista }); } catch {}
  });
}

export function suscribirNotificaciones(fn) {
  escuchas.add(fn);
  fn({ conteo, lista });
  return () => escuchas.delete(fn);
}

export async function refrescarConteoNotificaciones() {
  try {
    const r = await api.get("/notificaciones/conteo");
    conteo = r.no_leidas || 0;
    emitir();
  } catch {
    // sin conexión / modo local: la campana simplemente no tiene nada nuevo que mostrar
  }
}

export async function cargarNotificaciones() {
  try {
    lista = await api.get("/notificaciones/");
    emitir();
  } catch {
    lista = [];
    emitir();
  }
}

export async function marcarNotificacionesVistas() {
  try {
    await api.post("/notificaciones/marcar-vistas");
  } catch {
    // si falla, se reintenta en el próximo refrescarConteoNotificaciones()
  }
  conteo = 0;
  emitir();
}

const INTERVALO_MS = 20000;
export function iniciarMonitoreoNotificaciones() {
  if (intervalo) return;
  refrescarConteoNotificaciones();
  intervalo = setInterval(refrescarConteoNotificaciones, INTERVALO_MS);
  // Además del sondeo cada 20s, se refresca al instante cuando llega un
  // mensaje de un cliente o una solicitud de recuperación de contraseña
  // (ver actualizacionesGlobales.js) — no hay que esperar el sondeo.
  suscribirActualizacionGlobal("portal-cliente", refrescarConteoNotificaciones);
  suscribirActualizacionGlobal("auth", refrescarConteoNotificaciones);
}
