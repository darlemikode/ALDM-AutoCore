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

// Sincronización MANUAL, servidor → navegador — igual que en la app del
// celular: solo corre cuando alguien presiona el botón en Ajustes, nunca
// sola en segundo plano.
export async function sincronizarAhora() {
  const [clientes, vehiculos, servicios, refacciones] = await Promise.all([
    api.get("/clientes/"),
    api.get("/vehiculos/"),
    api.get("/servicios/"),
    api.get("/refacciones/"),
  ]);

  await reemplazarClientes(clientes || []);
  await reemplazarVehiculos(vehiculos || []);
  await reemplazarServicios(servicios || []);
  await reemplazarRefacciones(refacciones || []);

  const ahoraIso = new Date().toISOString();
  await setMeta("ultima_sincronizacion", ahoraIso);

  const conteo = await contarRegistrosLocal();
  return { fecha: ahoraIso, conteo };
}

export async function obtenerUltimaSincronizacion() {
  return getUltimaSincronizacion();
}

export function formatearFechaSync(iso) {
  if (!iso) return "Nunca";
  const fecha = new Date(iso);
  const ahora = new Date();
  const mismoDia = fecha.toDateString() === ahora.toDateString();
  const hora = fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (mismoDia) return "Hoy a las " + hora;
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) + " a las " + hora;
}
