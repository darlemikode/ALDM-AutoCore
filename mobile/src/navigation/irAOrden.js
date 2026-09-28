import { api } from "../api";
import { mostrarDialogo } from "../ui/Dialogo";

// Rutas absolutas desde el menú raíz: funcionan desde cualquier pila
// (Clientes, Vehículos del menú lateral, Citas…), a diferencia de
// getParent("TallerTabs"), que no existe fuera de las pestañas.
export function irAServicio(navigation, screen, params) {
  navigation.navigate("Taller", { screen: "Servicio", params: { screen, params, initial: false } });
}

/*
 * Abre la orden de un vehículo:
 *  - Si ya tiene una orden ABIERTA, avisa y lleva a esa orden (no duplica).
 *  - Si no, abre "Nueva orden" con cliente y vehículo precargados; el
 *    parámetro `recargar` fuerza a reiniciar el asistente aunque ya estuviera abierto.
 */
export async function abrirOrdenDeVehiculo(navigation, cliente, vehiculo) {
  let abierta = null;
  try {
    const ordenes = await api.get("/servicios/?status=abierto");
    abierta = (ordenes || []).find((s) => Number(s.id_vehiculo) === Number(vehiculo?.id_vehiculo) && s.status === "abierto") || null;
  } catch {
    abierta = null;
  }
  if (abierta) {
    mostrarDialogo({
      tono: "info", icono: "construct", etiqueta: `Orden #${abierta.id_servicio}`,
      titulo: "Ya tiene una orden abierta",
      mensaje: `${vehiculo?.placas_vehiculo || "Este vehículo"} está en el taller por "${abierta.nombre_servicio}". Te llevo a esa orden para no duplicarla.`,
      acciones: [
        { texto: "Ir a la orden", tipo: "primario", icono: "arrow-forward", onPress: () => irAServicio(navigation, "ServicioDetalle", { id: abierta.id_servicio }) },
        { texto: "Cerrar", tipo: "secundario" },
      ],
    });
    return;
  }
  irAServicio(navigation, "NuevaOrden", { clientePrefijado: cliente, vehiculoPrefijado: vehiculo, recargar: Date.now() });
}
