/**
 * Al pasar una orden a "Listo para entrega" debe tener las refacciones y sus
 * costos capturados (de ahí sale el saldo a cobrar). Devuelve el texto de la
 * advertencia, o null si todo está en orden.
 */
export function advertenciaListoEntrega(servicio) {
  const detalles = servicio?.detalles || [];
  const conRefaccion = detalles.some((d) => d.id_inventario_refaccion || (Number(d.costo_refaccion) || 0) > 0);
  const total = Number(servicio?.costos?.total) || 0;
  const saldo = Number(servicio?.costos?.saldo_pendiente) || 0;
  const faltas = [];
  if (!conRefaccion) faltas.push("no tiene refacciones capturadas");
  if (total <= 0) faltas.push("no tiene saldo por cobrar (no hay costos capturados)");
  else if (saldo <= 0 && !servicio?.pagado) faltas.push("no tiene saldo pendiente");
  if (!faltas.length) return null;
  return `Esta orden ${faltas.join(" y ")}. Antes de marcarla como «Listo para entrega» captura las refacciones y sus costos para que el saldo sea correcto.`;
}
