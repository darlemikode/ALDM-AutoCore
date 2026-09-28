// Detección de conexión con el servidor real. No hay librería instalada
// para esto (NetInfo/expo-network no están en el proyecto y el registro
// de npm está bloqueado desde esta máquina para instalar algo nuevo), así
// que se hace con lo que ya hay: un fetch corto contra /api/health con
// límite de tiempo. "Hay conexión" aquí significa concretamente "el
// backend respondió", que es lo único que le importa a esta app — tener
// wifi pero no poder llegar al servidor debe tratarse igual que no tener
// wifi.
import { API_URL } from "./config";
import { _establecerModoLocal, suscribirModoLocal } from "./localMode";

const URL_SALUD = `${API_URL}/health`;
const INTERVALO_MS = 20000; // reintento periódico en segundo plano
const LIMITE_MS = 4000; // no dejar a la app esperando una red caída

let verificando = false;
let ultimoResultado = null; // null = todavía no se sabe (primer arranque)
let intervalo = null;

async function probarServidor() {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), LIMITE_MS);
  try {
    const res = await fetch(URL_SALUD, { method: "GET", signal: controlador.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(limite);
  }
}

// Revisa ahora mismo si hay servidor y actualiza MODO_LOCAL según lo que
// encuentre. Varias pantallas pueden llamarla a la vez (p. ej. al abrir la
// app y al mismo tiempo el monitoreo periódico) — solo se hace una
// verificación real, las demás llamadas esperan esa misma.
let verificacionEnCurso = null;
export async function verificarConexion() {
  if (verificacionEnCurso) return verificacionEnCurso;
  verificando = true;
  verificacionEnCurso = (async () => {
    const enLinea = await probarServidor();
    ultimoResultado = enLinea;
    _establecerModoLocal(!enLinea);
    verificando = false;
    verificacionEnCurso = null;
    return enLinea;
  })();
  return verificacionEnCurso;
}

export function estaVerificando() {
  return verificando;
}

// Último resultado conocido, sin disparar una verificación nueva —para
// pintar la interfaz sin esperar red.
export function ultimaConexionConocida() {
  return ultimoResultado;
}

export function iniciarMonitoreoConexion() {
  if (intervalo) return;
  verificarConexion();
  intervalo = setInterval(verificarConexion, INTERVALO_MS);
}

export function detenerMonitoreoConexion() {
  if (intervalo) {
    clearInterval(intervalo);
    intervalo = null;
  }
}

export { suscribirModoLocal };
