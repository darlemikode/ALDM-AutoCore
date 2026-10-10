import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Dirección del servidor: la de app.json (expo.extra.apiUrl) o la que se
// capture en la pantalla de inicio de sesión ("Servidor").
const API_URL_DEFECTO = Constants.expoConfig?.extra?.apiUrl || "https://app.aldmautocore.com/api";
const TOKEN_KEY = "sa_token";
const SERVIDOR_KEY = "sa_servidor";
let apiUrl = API_URL_DEFECTO;
let alExpirar = null;

export function onSesionExpirada(fn) {
  alExpirar = fn;
}

export async function cargarServidor() {
  const guardado = await AsyncStorage.getItem(SERVIDOR_KEY).catch(() => null);
  apiUrl = guardado || API_URL_DEFECTO;
  return apiUrl;
}

export async function guardarServidor(url) {
  const limpio = (url || "").trim().replace(/\/+$/, "");
  apiUrl = limpio || API_URL_DEFECTO;
  if (limpio) await AsyncStorage.setItem(SERVIDOR_KEY, limpio);
  else await AsyncStorage.removeItem(SERVIDOR_KEY);
  return apiUrl;
}

export function servidorActual() {
  return apiUrl;
}

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

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = await getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(`No hay conexión con el servidor (${apiUrl}).`);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && alExpirar) alExpirar();
    const d = data?.detail;
    const mensaje = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(". ") : "Ocurrió un error inesperado";
    throw new Error(mensaje);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body ?? {} }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};

export async function login(username, password) {
  const form = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  let res;
  try {
    res = await fetch(`${apiUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  } catch {
    throw new Error(`No hay conexión con el servidor (${apiUrl}).`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || "No se pudo iniciar sesión");
  if (!data.es_superadmin) throw new Error("Este usuario no es súper administrador de ALDM.");
  await setToken(data.access_token);
  return data;
}
