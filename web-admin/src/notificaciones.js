// Estado compartido de la campanita (igual patrón que en mobile: ver
// mobile/src/notificaciones.js). Sondeo cada 20s + refresco al instante
// cuando llega un mensaje/alerta de cliente o una solicitud de
// recuperación de contraseña (ver actualizacionesGlobales.js).
import { api } from "./api";
import { suscribirActualizacionGlobal } from "./actualizacionesGlobales";

let conteo = 0;
let lista = [];
const escuchas = new Set();
let intervalo = null;

function emitir() {
  escuchas.forEach((fn) => {
    try {
      fn({ conteo, lista });
    } catch {
      // una pantalla rota no debe tumbar el aviso para las demás
    }
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
    // sin conexión: la campana no tiene nada nuevo que mostrar
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
    // se reintenta en el próximo refrescarConteoNotificaciones()
  }
  conteo = 0;
  emitir();
}

const INTERVALO_MS = 20000;
export function iniciarMonitoreoNotificaciones() {
  if (intervalo) return;
  refrescarConteoNotificaciones();
  intervalo = setInterval(refrescarConteoNotificaciones, INTERVALO_MS);
  suscribirActualizacionGlobal("portal-cliente", refrescarConteoNotificaciones);
  suscribirActualizacionGlobal("auth", refrescarConteoNotificaciones);
}

export function detenerMonitoreoNotificaciones() {
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
  conteo = 0;
  lista = [];
}
