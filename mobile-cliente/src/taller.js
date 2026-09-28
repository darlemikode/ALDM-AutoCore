// El taller al que pertenece el cliente (viene del QR que le dio su
// taller). Se guarda en el teléfono y se manda en cada petición
// (encabezado X-Taller) para que el servidor sepa de qué taller es.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const CLAVE = "sm_cliente_taller";
let enMemoria = null;

export async function getTallerCodigo() {
  if (enMemoria !== null) return enMemoria || null;
  enMemoria = (Platform.OS === "web" ? localStorage.getItem(CLAVE) : await SecureStore.getItemAsync(CLAVE)) || "";
  return enMemoria || null;
}

export async function setTallerCodigo(codigo) {
  enMemoria = codigo || "";
  if (Platform.OS === "web") {
    if (codigo) localStorage.setItem(CLAVE, codigo);
    else localStorage.removeItem(CLAVE);
    return;
  }
  if (codigo) await SecureStore.setItemAsync(CLAVE, codigo);
  else await SecureStore.deleteItemAsync(CLAVE);
}

// Acepta lo que venga en el QR: "aldmcliente://taller/CODIGO",
// "https://servidor/api/portal-cliente/qr/CODIGO" o el código solo.
export function extraerCodigo(texto) {
  if (!texto) return null;
  const limpio = String(texto).trim();
  const m = limpio.match(/(?:taller|portal-cliente\/qr)\/([A-Za-z0-9]+)/);
  const codigo = (m ? m[1] : limpio).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return codigo.length >= 3 ? codigo : null;
}
