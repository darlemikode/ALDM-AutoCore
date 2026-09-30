import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { API_URL, WS_URL } from "./config";
import { MODO_LOCAL } from "./localMode";
import { verificarConexion } from "./conexion";
import { solicitudLocal } from "./apiLocal";

const TOKEN_KEY = "sm_token";

// El token vive en SecureStore (cifrado por el sistema operativo) en
// celular, porque cuando la biometría está activada este token es lo único
// que protege la sesión entre aperturas de la app. SecureStore no existe en
// navegador (versión web de Expo), así que ahí se usa localStorage normal
// como respaldo — funciona igual para probar el sistema desde una compu o
// abriendo la página en el celular, solo sin el cifrado extra del SO.
export async function getToken() {
  if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token) {
  if (Platform.OS === "web") {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Un token "local-..." (ver login() más abajo) es una sesión de mentira que
// solo sirve para trabajar sin servidor — nunca hay que mandarla al
// backend real ni contarla como sesión válida para auto-subir pendientes.
export function esTokenLocal(token) {
  return typeof token === "string" && token.startsWith("local-");
}

// Distingue "no hay red / el servidor no contestó" de "el servidor
// contestó con un error real" (credenciales malas, datos inválidos,
// permiso denegado, etc). Solo el primer caso debe hacer que la app se
// pase a modo local — el segundo es información real que el usuario
// necesita ver, no algo que deba quedar encolado en el celular en
// silencio.
function esFalloDeRed(err) {
  if (!err) return false;
  if (err.name === "AbortError") return true; // se acabó el tiempo de espera
  if (err instanceof TypeError) return true; // fetch no pudo ni conectar
  const msg = String(err.message || "");
  return /network request failed|failed to fetch|Network Error|fetch failed|canceled|cancelled/i.test(msg);
}

const TIEMPO_LIMITE_MS = 8000;

async function fetchConLimite(url, opciones) {
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_MS);
  try {
    return await fetch(url, { ...opciones, signal: controlador.signal });
  } finally {
    clearTimeout(limite);
  }
}

async function requestReal(path, method, body, isForm) {
  const headers = {};
  const token = await getToken();
  if (token && !esTokenLocal(token)) headers["Authorization"] = `Bearer ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const res = await fetchConLimite(`${API_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    // sin cuerpo
  }
  if (!res.ok) {
    const message = data?.detail || "Ocurrió un error inesperado";
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

const MENSAJE_SOPORTE = (codigo) =>
  `Ocurrió un problema en el sistema. Comunícate con soporte de ALDM AutoCore y menciona el código ${codigo}.`;

// Errores del servidor ya traen mensaje y código de soporte. Los técnicos
// del propio celular (sin mensaje legible) se reportan al log del taller y
// se muestran con el mismo mensaje estándar.
async function errorEstandar(err, path) {
  const msg = String(err?.message || "");
  const legible = /código ERR-|codigo ERR-|\bERR-[0-9A-F]{8}\b/.test(msg) || (msg && !/fetch|network|undefined|null|TypeError|\[object|JSON|canceled|cancelled/i.test(msg));
  if (legible) return err;
  let codigo = "LOC-" + Math.random().toString(16).slice(2, 10).toUpperCase();
  try {
    const r = await fetchConLimite(`${API_URL}/errores/cliente`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await getToken() && !esTokenLocal(await getToken()) ? { Authorization: `Bearer ${await getToken()}` } : {}) },
      body: JSON.stringify({ mensaje: msg.slice(0, 300), pantalla: path, origen: "app_movil", detalle: String(err?.stack || "").slice(0, 3000) }),
    });
    const d = await r.json();
    if (d?.codigo) codigo = d.codigo;
  } catch { /* sin servidor: se queda el código local */ }
  return new Error(MENSAJE_SOPORTE(codigo));
}

async function request(path, { method = "GET", body, isForm = false } = {}) {
  // Modo local (ver localMode.js): ya se sabe que no hay servidor, no
  // tiene sentido intentar el fetch real cada vez — se resuelve directo
  // contra la base de datos del propio celular.
  if (MODO_LOCAL) {
    return solicitudLocal(path, method, body);
  }

  try {
    return await requestReal(path, method, body, isForm);
  } catch (err) {
    if (!esFalloDeRed(err)) throw await errorEstandar(err, path); // error real del servidor: se muestra, no se encola
    // No hubo forma de llegar al servidor — se confirma con una
    // verificación de conexión (enciende MODO_LOCAL si en efecto no hay
    // servidor) y esta petición en particular se resuelve local para no
    // perder lo que el usuario estaba haciendo.
    await verificarConexion();
    try {
      return await solicitudLocal(path, method, body);
    } catch (errLocal) {
      throw await errorEstandar(errLocal, path);
    }
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  postForm: (path, formData) => request(path, { method: "POST", body: formData, isForm: true }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};

export { API_URL, WS_URL };

// Convierte el resultado de ImagePicker a un Blob real antes de adjuntarlo
// a un FormData. En versiones nuevas de Expo/React Native el objeto
// "clásico" { uri, name, type } ya no lo reconoce el nuevo stack de red
// (error "Unsupported FormDataPart implementation") — un Blob de verdad
// sí funciona siempre, en cualquier versión.
export async function archivoParaForm(uri) {
  const respuesta = await fetch(uri);
  return respuesta.blob();
}


// URL de un archivo subido (foto, logo). En modo local los archivos se guardan
// como data URI dentro de la base del celular; con servidor, viven en /uploads.
const BASE_ARCHIVOS = API_URL.replace(/\/api\/?$/, "");
export function urlArchivo(ruta) {
  if (!ruta) return null;
  if (/^(data:|https?:|file:)/.test(ruta)) return ruta;
  return `${BASE_ARCHIVOS}/uploads/${ruta}`;
}

async function loginLocalFalso(username, password) {
  // Sin backend que valide credenciales — en modo local se acepta
  // cualquier usuario/contraseña no vacíos y se entra con una sesión
  // local falsa (esTokenLocal() la reconoce). En cuanto vuelva a haber
  // servidor esta sesión no se usa para nada real: hay que iniciar
  // sesión de nuevo con las credenciales reales.
  if (!username || !password) throw new Error("Escribe usuario y contraseña.");
  const dataFalsa = { access_token: "local-" + Date.now(), token_type: "bearer" };
  await setToken(dataFalsa.access_token);
  return dataFalsa;
}

export async function login(username, password) {
  if (MODO_LOCAL) return loginLocalFalso(username, password);

  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  try {
    const res = await fetchConLimite(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.detail || "No se pudo iniciar sesión");
    await setToken(data.access_token);
    return data;
  } catch (err) {
    if (!esFalloDeRed(err)) throw err; // usuario/contraseña incorrectos: es real, se muestra
    await verificarConexion();
    return loginLocalFalso(username, password);
  }
}
