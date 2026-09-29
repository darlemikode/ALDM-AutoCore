import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { getTallerCodigo } from "./taller";

// Cambia esto en app.json (expo.extra.apiUrl / wsUrl) por la IP de tu
// servidor backend en la misma red que el teléfono del cliente.
const API_URL = Constants.expoConfig?.extra?.apiUrl || "https://aldm-autocore-app-abcxcugnfbgaaah0.centralus-01.azurewebsites.net/api";
const WS_URL = Constants.expoConfig?.extra?.wsUrl || "wss://aldm-autocore-app-abcxcugnfbgaaah0.centralus-01.azurewebsites.net";

const TOKEN_KEY = "sm_cliente_token";

// SecureStore no existe en la versión web de Expo — ahí se usa localStorage
// como respaldo, para poder abrir la app directo desde el navegador.
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

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  const token = await getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const taller = await getTallerCodigo();
  if (taller) headers["X-Taller"] = taller;

  const res = await fetch(`${API_URL}${path}`, {
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

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  postForm: (path, formData) => request(path, { method: "POST", body: formData, isForm: true }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};

export { API_URL, WS_URL };

// Ver mobile/src/api.js: un Blob real evita "Unsupported FormDataPart
// implementation" en las versiones nuevas de Expo/React Native.
export async function archivoParaForm(uri) {
  const respuesta = await fetch(uri);
  return respuesta.blob();
}


// URL pública de un archivo subido (fotos, imágenes de promociones)
const BASE_ARCHIVOS = API_URL.replace(/\/api\/?$/, "");
export function urlArchivo(ruta) {
  if (!ruta) return null;
  if (/^(data:|https?:|file:)/.test(ruta)) return ruta;
  return `${BASE_ARCHIVOS}/uploads/${ruta}`;
}
