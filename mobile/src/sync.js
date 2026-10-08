import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import {
  reemplazarClientes,
  reemplazarVehiculos,
  reemplazarServicios,
  reemplazarRefacciones,
  setMeta,
  getUltimaSincronizacion,
  contarRegistrosLocal,
} from "./db";

const CLAVE_ULTIMA_SYNC = "sm_ultima_sincronizacion";

// Sincronización MANUAL, servidor → celular: se llama solo cuando el
// usuario presiona el botón en Ajustes (Más → Sincronización). No corre
// sola en segundo plano ni al abrir la app — así se evita gastar datos o
// batería sin que el taller lo pida.
export async function sincronizarAhora() {
  // Trae los catálogos completos del servidor. Si alguno falla (por
  // ejemplo, sin internet en ese momento), se cancela todo el intento sin
  // tocar lo que ya había guardado localmente.
  // Módulos no contratados o sin permiso se omiten en silencio (null);
  // cualquier otro fallo (sin internet, servidor) cancela el intento.
  const omitible = (p) => p.catch((e) => (/no está incluido|no tiene permiso|no esta incluido/i.test(String(e?.message)) ? null : Promise.reject(e)));
  const [clientes, vehiculos, servicios, refacciones] = await Promise.all([
    omitible(api.get("/clientes/")),
    omitible(api.get("/vehiculos/")),
    omitible(api.get("/servicios/")),
    omitible(api.get("/refacciones/")),
  ]);

  if (clientes) await reemplazarClientes(clientes);
  if (vehiculos) await reemplazarVehiculos(vehiculos);
  if (servicios) await reemplazarServicios(servicios);
  if (refacciones) await reemplazarRefacciones(refacciones);

  const ahoraIso = new Date().toISOString();
  await setMeta("ultima_sincronizacion", ahoraIso);
  await AsyncStorage.setItem(CLAVE_ULTIMA_SYNC, ahoraIso); // respaldo rápido, sin abrir la BD, para mostrar la fecha al instante al abrir la pantalla

  const conteo = await contarRegistrosLocal();
  return { fecha: ahoraIso, conteo };
}

// Para mostrar "Última sincronización: ..." sin tener que esperar a abrir
// la base de datos completa (AsyncStorage responde de inmediato).
export async function obtenerUltimaSincronizacionRapido() {
  const deAsyncStorage = await AsyncStorage.getItem(CLAVE_ULTIMA_SYNC);
  if (deAsyncStorage) return deAsyncStorage;
  // Respaldo: si por lo que sea no está en AsyncStorage, se busca en la BD.
  return getUltimaSincronizacion();
}

export function formatearFechaSync(iso) {
  if (!iso) return "Nunca";
  const fecha = new Date(iso);
  const ahora = new Date();
  const mismDia = fecha.toDateString() === ahora.toDateString();
  const hora = fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (mismDia) return "Hoy a las " + hora;
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) + " a las " + hora;
}
