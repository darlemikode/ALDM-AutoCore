// Igual que en la app del taller: un WebSocket a /api/ws/global que avisa
// {tabla} cuando algo cambió (en cualquier app) para refrescar pantallas
// solas — aquí sobre todo para el estatus de la orden y el chat.
import { getToken, WS_URL } from "./api";

const escuchas = new Set(); // fn(tabla)
let socket = null;
let reintentoId = null;
let activo = false;

function emitir(tabla) {
  escuchas.forEach((fn) => {
    try {
      fn(tabla);
    } catch {
      // una pantalla rota no debe tumbar el aviso para las demás
    }
  });
}

function programarReintento() {
  if (!activo || reintentoId) return;
  reintentoId = setTimeout(() => {
    reintentoId = null;
    conectar();
  }, 5000);
}

async function conectar() {
  if (!activo) return;
  const token = await getToken();
  if (!token) {
    programarReintento();
    return;
  }
  try {
    socket = new WebSocket(`${WS_URL}/api/ws/global?token=${token}`);
  } catch {
    programarReintento();
    return;
  }
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data && data.tipo === "cambio" && data.tabla) emitir(data.tabla);
    } catch {
      // avisos que no vengan en el formato esperado se ignoran
    }
  };
  socket.onclose = () => {
    socket = null;
    programarReintento();
  };
  socket.onerror = () => {
    socket?.close();
  };
}

export function iniciarActualizacionesGlobales() {
  activo = true;
  socket?.close();
  socket = null;
  if (reintentoId) clearTimeout(reintentoId);
  reintentoId = null;
  conectar();
}

export function detenerActualizacionesGlobales() {
  activo = false;
  if (reintentoId) clearTimeout(reintentoId);
  reintentoId = null;
  socket?.close();
  socket = null;
}

export function suscribirActualizacionGlobal(tabla, fn) {
  const wrapper = (t) => {
    if (t === tabla) fn();
  };
  escuchas.add(wrapper);
  return () => escuchas.delete(wrapper);
}
