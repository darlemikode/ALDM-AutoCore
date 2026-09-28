// Canal de "algo cambió en la base de datos" para toda la app — un solo
// WebSocket persistente (ver ws_manager.py / ws_router.py: /api/ws/global
// en el backend) que avisa {tabla} cada vez que cualquier pantalla, en
// cualquier dispositivo (web, taller o cliente), guarda/edita/borra algo.
// Las pantallas se suscriben a la tabla que les interesa y se refrescan
// solas — sin que el usuario tenga que salir y volver a entrar.
import { getToken, esTokenLocal, WS_URL } from "./api";

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
  if (!token || esTokenLocal(token)) {
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

/** Se llama una vez al arrancar la app (ver App.js) y también al iniciar
 * sesión, para reconectar con el token correcto. */
export function iniciarActualizacionesGlobales() {
  activo = true;
  socket?.close();
  socket = null;
  if (reintentoId) {
    clearTimeout(reintentoId);
    reintentoId = null;
  }
  conectar();
}

export function detenerActualizacionesGlobales() {
  activo = false;
  if (reintentoId) clearTimeout(reintentoId);
  reintentoId = null;
  socket?.close();
  socket = null;
}

/** `tabla`: primer segmento de la URL de la API (ej. "clientes",
 * "servicios", "refacciones", "usuarios", "citas"...). Devuelve la función
 * para desuscribirse. */
export function suscribirActualizacionGlobal(tabla, fn) {
  const wrapper = (t) => {
    if (t === tabla) fn();
  };
  escuchas.add(wrapper);
  return () => escuchas.delete(wrapper);
}
