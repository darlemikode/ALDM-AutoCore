// Igual que en la app móvil: un solo WebSocket a /api/ws/global que avisa
// {tabla} cuando algo cambió en la base de datos (en cualquier app), para
// que las páginas se refresquen solas sin recargar el navegador.
import { getToken } from "./api";

const escuchas = new Set(); // fn(tabla)
let socket = null;
let reintentoId = null;
let activo = false;

function emitir(tabla) {
  escuchas.forEach((fn) => {
    try {
      fn(tabla);
    } catch {
      // una página rota no debe tumbar el aviso para las demás
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

function conectar() {
  if (!activo) return;
  const token = getToken();
  if (!token) {
    programarReintento();
    return;
  }
  const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
  try {
    socket = new WebSocket(`${protocolo}//${window.location.host}/api/ws/global?token=${token}`);
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
