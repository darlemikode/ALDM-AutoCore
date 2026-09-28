import { api } from "../src/api.js";
import { getDb } from "../src/db.js";

// El backend (y su espejo en modo local) bloquea el alta de clientes
// mientras el admin siga con la contraseña de fábrica — se cambia una
// vez aquí al arrancar la suite, igual que haría un taller real la
// primera vez que usa la app.
await api.put("/auth/password", { password_actual: "admin1234", password_nueva: "qa-tests-2026" });

const resultados = [];
let seccionActual = "";
function seccion(n) { seccionActual = n; }
function ok(cond, desc, detalle = "") { resultados.push({ seccion: seccionActual, ok: !!cond, desc, detalle: cond ? "" : detalle }); }
async function falla(fn, desc, contiene) {
  try { await fn(); ok(false, desc, "no lanzó error"); }
  catch (e) { ok(!contiene || String(e.message).includes(contiene), desc, e.message); }
}
const cerca = (a, b) => Math.abs(a - b) < 0.011;
const form = (campos) => ({ get: (k) => campos[k] ?? null });

// ---------- A. Catálogos precargados ----------
seccion("A. Catálogos precargados");
const cuenta = async (r) => (await api.get(r)).length;
ok(await cuenta("/tipos-servicio/") === 8, "8 tipos de servicio (seed.py)");
ok(await cuenta("/colores-vehiculos/") === 12, "12 colores (seed.py)");
const marcas = await api.get("/vehiculos-marcas/");
ok(marcas.length === 79 && marcas.every((m) => m.id_marca_vehiculo && m.nombre_marca), "79 marcas con id_marca_vehiculo (CSV del backend)");
ok(await cuenta("/vehiculos-modelos/") === 1008, "1008 modelos (CSV del backend)");
const nissan = marcas.find((m) => m.nombre_marca === "Nissan");
const modelosNissan = await api.get(`/vehiculos-modelos/?id_marca_vehiculo=${nissan.id_marca_vehiculo}`);
ok(modelosNissan.length > 10 && modelosNissan.every((m) => m.id_marca_vehiculo === nissan.id_marca_vehiculo), "filtro de modelos por marca", modelosNissan.length);
ok(await cuenta("/refacciones-categorias/") === 8, "8 categorías de refacción");
ok(await cuenta("/refacciones-subcategorias/") === 31, "31 subcategorías de refacción", await cuenta("/refacciones-subcategorias/"));
ok(await cuenta("/paises/") === 1, "País México");
ok(await cuenta("/estados/") === 32, "32 estados");
ok(await cuenta("/ciudades/") >= 40, "ciudades principales por estado", await cuenta("/ciudades/"));
ok((await api.get("/inspecciones/items")).length === 22, "22 puntos de inspección (seed.py: 1+3+5+4+3+3+3)");
ok(await cuenta("/usuarios/") >= 0, "usuarios responde");

// Re-siembra: no duplica y respeta lo capturado por el usuario
await api.post("/colores-vehiculos/", { nombre_color: "Morado" });
const db = await getDb();
await db.runAsync("UPDATE meta SET valor = '1' WHERE clave = 'version_catalogos'");
await db.runAsync("INSERT INTO colecciones (coleccion, id, datos_json) VALUES ('vehiculos_marcas', 9999, ?)", [JSON.stringify({ id_marca: 9999, nombre_marca: "Marca mal sembrada" })]);
globalThis.__aldmDbPromise = null;
await getDb();
ok(await cuenta("/colores-vehiculos/") === 13, "re-siembra no duplica y conserva el color del usuario", await cuenta("/colores-vehiculos/"));
ok(await cuenta("/vehiculos-modelos/") === 1008, "re-siembra no duplica modelos");
const marcas2 = await api.get("/vehiculos-marcas/");
ok(marcas2.length === 79 && !marcas2.some((m) => m.nombre_marca === "Marca mal sembrada"), "limpia marcas de la siembra vieja defectuosa", marcas2.length);

// ---------- B. Códigos postales ----------
seccion("B. Códigos postales (León, GTO)");
const cp = await api.get("/codigos-postales/37000");
ok(cp.estado === "Guanajuato" && cp.municipio === "León" && cp.colonias.includes("Centro"), "CP 37000 → Guanajuato / León / Centro", JSON.stringify(cp).slice(0, 120));
await falla(() => api.get("/codigos-postales/99999"), "CP inexistente da error claro", "No se encontró");

// ---------- C. Alta cliente → vehículo → orden (asistente) ----------
seccion("C. Alta de cliente, vehículo y orden");
const cliente = await api.post("/clientes/", { nombre_cliente: "Juan", paterno_cliente: "Pérez", telefono1: "4771234567" });
ok(cliente.id_cliente > 0, "cliente creado");
const buscados = await api.get("/clientes/?solo_activos=true&q=juan");
ok(buscados.some((c) => c.id_cliente === cliente.id_cliente), "búsqueda de cliente por nombre");
const versa = (await api.get(`/vehiculos-modelos/?id_marca_vehiculo=${nissan.id_marca_vehiculo}`)).find((m) => m.nombre_modelo.toLowerCase().includes("versa")) || modelosNissan[0];
const blanco = (await api.get("/colores-vehiculos/")).find((c) => c.nombre_color === "Blanco");
const vehiculo = await api.post("/vehiculos/", { id_cliente: cliente.id_cliente, placas_vehiculo: "GTO-123", id_marca_vehiculo: nissan.id_marca_vehiculo, id_modelo_vehiculo: versa.id_modelo_vehiculo, id_color: blanco.id_color });
const vehiculosCliente = await api.get(`/vehiculos/?id_cliente=${cliente.id_cliente}`);
ok(vehiculosCliente.length === 1 && vehiculosCliente[0].marca?.nombre_marca === "Nissan" && vehiculosCliente[0].color?.nombre_color === "Blanco", "vehículo del cliente con marca/modelo/color resueltos");
const tipos = await api.get("/tipos-servicio/");
const orden = await api.post("/servicios/", {
  id_cliente: cliente.id_cliente, id_vehiculo: vehiculo.id_vehiculo, nombre_servicio: "Ruido en suspensión",
  tipos_mantenimiento_ids: [tipos[3].id_tipo_servicio], status: "abierto", es_garantia: false, id_servicio_original: null,
});
ok(orden.status === "abierto" && orden.etapa === "recibido", "orden creada abierta en etapa 'recibido'");
ok(orden.cliente?.nombre_cliente === "Juan" && orden.vehiculo?.modelo?.nombre_modelo === versa.nombre_modelo, "orden trae cliente y vehículo (como el JOIN del backend)");
ok(orden.iva_porcentaje === 0 && orden.costos.total === 0 && orden.costos.iva === 0, "sin IVA automático: la orden nace con IVA 0 y total en cero");
// El taller aplica el IVA desde la orden cuando el cliente lo pide (resto del flujo con IVA 16 %)
ok((await api.put(`/servicios/${orden.id_servicio}`, { iva_porcentaje: 16 })).iva_porcentaje === 16, "aplicar IVA 16% desde la orden");
ok(orden.tipos_mantenimiento?.[0]?.nombre_tipo === tipos[3].nombre_tipo, "tipos de mantenimiento guardados");
// anticipo con tarjeta (antes se guardaba siempre como efectivo)
const conAnticipo = await api.post(`/servicios/${orden.id_servicio}/abonos`, { monto_abono: 200, tipo_pago: "tarjeta", comentario: "Anticipo al recibir el vehículo" });
ok(conAnticipo.abonos[0].tipo_pago === "tarjeta", "anticipo guarda su forma de pago real (tarjeta)");
ok(conAnticipo.costos.total_abonado === 0 || conAnticipo.abonos[0].cambio === 200, "anticipo sobre total $0 queda como cambio (misma regla que el backend)", JSON.stringify(conAnticipo.abonos[0]));

// ---------- D. Llenado de la orden ----------
seccion("D. Llenado de la orden (refacciones y conceptos)");
const ref = await api.post("/refacciones/", { nombre_refaccion: "Amortiguador delantero", categoria: "Suspensión", subcategoria: "Amortiguadores delanteros", preciocliente_refaccion: 350, cantidad_refaccion: 10 });
let s = await api.post(`/servicios/${orden.id_servicio}/detalles`, { id_refaccion: ref.id_refaccion, descripcion: ref.nombre_refaccion, cantidad: 2, costo_refaccion: 700, costo_extra: 0 });
ok(cerca(s.costos.subtotal, 700), "refacción del catálogo x2 = $700", s.costos.subtotal);
s = await api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "Mano de obra suspensión", id_tipo_servicio: tipos[3].id_tipo_servicio, id_refaccion: null, cantidad: 1, costo_mano_obra: 500, costo_refaccion: 0, costo_extra: 0 });
ok(cerca(s.costos.subtotal, 1200) && cerca(s.costos.iva, 192) && cerca(s.costos.total, 1392), "concepto libre de mano de obra: subtotal 1200, IVA 192, total 1392", JSON.stringify(s.costos));
ok((await api.get(`/refacciones/${ref.id_refaccion}`)).cantidad_refaccion === 8, "sin inventario compatible descuenta del stock general (10 − 2), igual que el backend");
const idMO = s.detalles[1].id_servicio_detalle;
s = await api.put(`/servicios/${orden.id_servicio}/detalles/${idMO}`, { costo_mano_obra: 600 });
ok(cerca(s.costos.subtotal, 1300), "editar costo de mano de obra recalcula", s.costos.subtotal);
s = await api.put(`/servicios/${orden.id_servicio}/detalles/${idMO}`, { costo_extra: 50 });
ok(cerca(s.costos.subtotal, 1350), "editar extra recalcula");
s = await api.put(`/servicios/${orden.id_servicio}`, { iva_porcentaje: 0 });
ok(s.costos.iva === 0 && cerca(s.costos.total, 1350), "quitar IVA", JSON.stringify(s.costos));
s = await api.put(`/servicios/${orden.id_servicio}`, { iva_porcentaje: 16 });
ok(cerca(s.costos.total, 1566), "volver a aplicar IVA", s.costos.total);
await api.del(`/servicios/${orden.id_servicio}/detalles/${idMO}`);
s = await api.get(`/servicios/${orden.id_servicio}`);
ok(s.detalles.length === 1 && cerca(s.costos.subtotal, 700), "quitar concepto recalcula");
s = await api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "Mano de obra", cantidad: 1, costo_mano_obra: 500, costo_refaccion: 0, costo_extra: 0 });
ok(cerca(s.costos.total, 1392), "total final antes de cobrar: $1,392");

// ---------- E. Pagos ----------
seccion("E. Abonos");
s = await api.post(`/servicios/${orden.id_servicio}/abonos`, { monto_abono: 500, tipo_pago: "efectivo" });
ok(cerca(s.costos.saldo_pendiente, 892), "abono $500 deja saldo $892", s.costos.saldo_pendiente);
s = await api.post(`/servicios/${orden.id_servicio}/abonos`, { monto_abono: 100, tipo_pago: "mixto", desglose_mixto_efectivo: 60, desglose_mixto_tarjeta: 40 });
const ultimo = s.abonos[s.abonos.length - 1];
ok(ultimo.desglose_mixto_efectivo === 60 && ultimo.desglose_mixto_tarjeta === 40 && cerca(s.costos.saldo_pendiente, 792), "abono mixto con desglose");
ok(s.abonos.every((a, i) => a.numero_abono === i + 1), "abonos numerados");

// ---------- F. Finalizar ----------
seccion("F. Finalizar orden");
await falla(() => api.post(`/servicios/${orden.id_servicio}/finalizar`, { tipo_pago: "efectivo", monto_recibido: 100 }), "no deja finalizar si el pago no cubre el saldo", "no cubre");
const fin = await api.post(`/servicios/${orden.id_servicio}/finalizar`, { tipo_pago: "efectivo", monto_recibido: 1000, comentarios_finales: "Revisar balatas", notificar_cliente: true });
ok(cerca(fin.cambio, 208), "cambio correcto al finalizar ($1000 − $792 = $208)", fin.cambio);
ok(fin.servicio.status === "cerrado" && fin.servicio.pagado && fin.servicio.costos.saldo_pendiente <= 0.005, "orden cerrada, pagada y sin saldo");
ok(fin.servicio.comentarios_finales === "Revisar balatas", "guarda comentarios finales");
await falla(() => api.post(`/servicios/${orden.id_servicio}/detalles`, { descripcion: "x", costo_extra: 1 }), "orden cerrada no acepta nuevos conceptos", "no está abierta");
await falla(() => api.put(`/servicios/${orden.id_servicio}/detalles/${s.detalles[0].id_servicio_detalle}`, { cantidad: 5 }), "orden cerrada no permite editar conceptos", "no está abierta");
await falla(() => api.post(`/servicios/${orden.id_servicio}/finalizar`, {}), "no se puede finalizar dos veces", "abiertas");

// finalizar con tarjeta sin monto (cobra el saldo exacto)
const o2 = await api.post("/servicios/", { id_cliente: cliente.id_cliente, id_vehiculo: vehiculo.id_vehiculo, nombre_servicio: "Afinación", tipos_mantenimiento_ids: [tipos[1].id_tipo_servicio] });
await api.post(`/servicios/${o2.id_servicio}/detalles`, { descripcion: "Afinación", costo_mano_obra: 1000 });
const fin2 = await api.post(`/servicios/${o2.id_servicio}/finalizar`, { tipo_pago: "tarjeta" });
ok(fin2.cambio === 0 && fin2.servicio.status === "cerrado", "tarjeta sin monto cobra el saldo exacto");

// ---------- G. Reabrir / cancelar ----------
seccion("G. Reabrir y cancelar");
s = await api.put(`/servicios/${o2.id_servicio}`, { status: "abierto" });
ok(s.status === "abierto", "reabrir orden");
s = await api.post(`/servicios/${o2.id_servicio}/detalles`, { descripcion: "Extra tras reabrir", costo_extra: 100 });
ok(s.detalles.length === 2, "tras reabrir se puede editar");
const o3 = await api.post("/servicios/", { id_cliente: cliente.id_cliente, id_vehiculo: vehiculo.id_vehiculo, nombre_servicio: "Cancelar", tipos_mantenimiento_ids: [tipos[0].id_tipo_servicio] });
s = await api.put(`/servicios/${o3.id_servicio}`, { status: "cancelado" });
ok(s.status === "cancelado", "cancelar orden");
ok((await api.get("/servicios/?status=cancelado")).some((x) => x.id_servicio === o3.id_servicio), "filtro por estatus");

// ---------- H. Garantía ----------
seccion("H. Garantías");
const g = await api.post("/servicios/", { id_cliente: cliente.id_cliente, id_vehiculo: vehiculo.id_vehiculo, nombre_servicio: `Garantía de la orden #${orden.id_servicio}`, tipos_mantenimiento_ids: [tipos[3].id_tipo_servicio], es_garantia: true, id_servicio_original: orden.id_servicio, motivo_garantia: "Volvió el ruido" });
ok(g.es_garantia && g.etapa === "diagnostico", "orden de garantía arranca en diagnóstico");
const recl = await api.get(`/servicios/${orden.id_servicio}/reclamaciones`);
ok(recl.length === 1 && recl[0].motivo_garantia === "Volvió el ruido", "la orden original lista su reclamación");

// ---------- I. Estatus / etapas ----------
seccion("I. Estatus del servicio");
s = await api.put(`/servicios/${g.id_servicio}/etapa`, { etapa: "en_reparacion", comentario: "Se cambió buje" });
ok(s.etapa === "en_reparacion" && s.historial_etapas.length === 2, "cambiar etapa guarda historial");
{ const ids = s.historial_etapas.map((h) => h.id_registro); ok(ids.every(Boolean) && new Set(ids).size === ids.length, "historial con id_registro único (key de EtapaTracker)", JSON.stringify(ids)); }
await falla(() => api.put(`/servicios/${g.id_servicio}/etapa`, { etapa: "inventada" }), "etapa inválida se rechaza", "no existe");
ok((await api.get("/servicios/etapas-disponibles")).length === 7, "7 etapas disponibles (igual que el backend)");

// ---------- J. Inventario por vehículo ----------
seccion("J. Inventario por vehículo");
const inv0 = await api.post("/inventario-refacciones/", { id_refaccion: ref.id_refaccion, cantidad: 3, preciocliente: 400, numero_parte: "AM-1", ubicacion_fisica: "A2", umbral_naranja: 2, umbral_rojo: 1 });
ok(inv0.id_inventario_refaccion && inv0.refaccion?.nombre_refaccion === ref.nombre_refaccion, "alta en inventario con la refacción resuelta");
const comp = await api.post("/inventario-refacciones-compatibilidades/", { id_inventario_refaccion: inv0.id_inventario_refaccion, id_marca_vehiculo: nissan.id_marca_vehiculo, id_modelo_vehiculo: versa.id_modelo_vehiculo });
ok(comp.id_compatibilidad, "agregar compatibilidad marca+modelo");
await falla(() => api.post("/inventario-refacciones-compatibilidades/", { id_inventario_refaccion: inv0.id_inventario_refaccion, id_marca_vehiculo: nissan.id_marca_vehiculo, id_modelo_vehiculo: versa.id_modelo_vehiculo }), "no duplica compatibilidades", "ya está");
const o4 = await api.post("/servicios/", { id_cliente: cliente.id_cliente, id_vehiculo: vehiculo.id_vehiculo, nombre_servicio: "Inventario", tipos_mantenimiento_ids: [tipos[3].id_tipo_servicio] });
let o4s = await api.post(`/servicios/${o4.id_servicio}/detalles`, { id_refaccion: ref.id_refaccion, cantidad: 2, costo_refaccion: 800 });
let inv = await api.get(`/inventario-refacciones/${inv0.id_inventario_refaccion}`);
ok(inv.cantidad === 1, "descuenta del inventario compatible con el vehículo (3 − 2)", inv.cantidad);
ok((await api.get(`/refacciones/${ref.id_refaccion}`)).cantidad_refaccion === 8, "con inventario compatible NO toca el stock general");
o4s = await api.post(`/servicios/${o4.id_servicio}/detalles`, { id_refaccion: ref.id_refaccion, cantidad: 5, costo_refaccion: 2000 });
inv = await api.get(`/inventario-refacciones/${inv0.id_inventario_refaccion}`);
ok(inv.cantidad === 0, "nunca deja el stock negativo (igual que el backend)", inv.cantidad);
ok(o4s.detalles.length === 1 && o4s.detalles[0].cantidad === 7 && cerca(o4s.detalles[0].costo_refaccion, 2800), "misma refacción se consolida en un renglón (2+5 piezas)", JSON.stringify(o4s.detalles.map((d) => [d.cantidad, d.costo_refaccion])));
await api.del(`/servicios/${o4.id_servicio}/detalles/${o4s.detalles[0].id_servicio_detalle}`);
inv = await api.get(`/inventario-refacciones/${inv0.id_inventario_refaccion}`);
ok(inv.cantidad === 7, "quitar el concepto regresa las piezas a su inventario", inv.cantidad);
await api.del(`/inventario-refacciones-compatibilidades/${comp.id_compatibilidad}`);
ok((await api.get(`/inventario-refacciones/${inv0.id_inventario_refaccion}`)).compatibilidades.length === 0, "quitar compatibilidad");
await api.put(`/inventario-refacciones/${inv0.id_inventario_refaccion}`, { cantidad: 10, ubicacion_fisica: "B1" });
ok((await api.get(`/inventario-refacciones/${inv0.id_inventario_refaccion}`)).ubicacion_fisica === "B1", "editar inventario");

// ---------- K. Fotos, chat, inspección ----------
seccion("K. Fotos, chat e inspección");
const foto = await api.postForm("/fotos/", form({ entidad_tipo: "servicio", entidad_id: String(orden.id_servicio), archivo: { uri: "file:///x.jpg", type: "image/jpeg" } }));
ok(foto.ruta_archivo?.startsWith("data:image/jpeg;base64,"), "subir foto la guarda en el celular");
const fotos = await api.get(`/fotos/?entidad_tipo=servicio&entidad_id=${orden.id_servicio}`);
ok(Array.isArray(fotos) && fotos.length === 1, "listar fotos devuelve lista (antes objeto → crash)");
ok((await api.get(`/fotos/?entidad_tipo=vehiculo&entidad_id=${vehiculo.id_vehiculo}`)).length === 0, "fotos filtradas por entidad");
await api.del(`/fotos/${foto.id_foto}`);
ok((await api.get(`/fotos/?entidad_tipo=servicio&entidad_id=${orden.id_servicio}`)).length === 0, "borrar foto");
{ const vacio = await api.get(`/servicios/${g.id_servicio}/chat/mensajes`); ok(Array.isArray(vacio) && vacio.length === 0, "chat de orden sin mensajes responde [] (no error)"); }
const msg = await api.post(`/servicios/${orden.id_servicio}/chat/mensajes`, { texto: "Su auto está listo", tipo: "mensaje" });
ok(msg.id_mensaje && msg.autor_tipo === "taller", "enviar mensaje de chat regresa el mensaje");
const fotoChat = await api.postForm(`/servicios/${orden.id_servicio}/chat/foto`, form({ archivo: { uri: "file:///y.jpg" } }));
ok(fotoChat.ruta_foto?.startsWith("data:"), "foto en el chat");
ok((await api.get(`/servicios/${orden.id_servicio}/chat/mensajes`)).length === 2, "historial del chat");
const items = await api.get("/inspecciones/items");
const insp = await api.post("/inspecciones/", { id_vehiculo: vehiculo.id_vehiculo, id_servicio: orden.id_servicio, resultados: [{ id_item: items[0].id_item, estado: "mal", comentario: "Baja presión" }] });
ok(insp.resultados[0].item?.categoria === "Llantas", "inspección guarda resultados con su punto");
const insp2 = await api.put(`/inspecciones/${insp.id_inspeccion}`, { resultados: [{ id_item: items[0].id_item, estado: "bien" }, { id_item: items[1].id_item, estado: "regular" }] });
ok(insp2.resultados.length === 2, "autosave de inspección (PUT)");
ok((await api.get(`/inspecciones/?id_servicio=${orden.id_servicio}`)).length === 1, "inspección ligada a la orden");

// ---------- L. Panel / dashboard ----------
seccion("L. Panel");
const res = await api.get("/dashboard/resumen");
ok(res.total_clientes === 1 && res.total_vehiculos === 1, "panel cuenta clientes y vehículos");
ok(res.servicios_abiertos === (await api.get("/servicios/?status=abierto")).length, "panel: órdenes abiertas coincide con la lista");
const abiertas = await api.get("/servicios/?status=abierto");
const saldoEsperado = Math.round(abiertas.reduce((a, x) => a + Math.max(x.costos.saldo_pendiente, 0), 0) * 100) / 100;
ok(cerca(res.saldo_pendiente_clientes, saldoEsperado), "panel: por cobrar coincide con saldos", `${res.saldo_pendiente_clientes} vs ${saldoEsperado}`);
const mens = await api.get("/dashboard/servicios-mensuales?meses=6");
ok(mens.length === 6 && mens[5].cantidad >= 5, "órdenes por mes (mes actual)", JSON.stringify(mens[5]));
ok((await api.get("/facturacion/facturas?id_servicio=1")).length === 0, "facturación en local responde lista vacía (sin crash)");


// ---------- M. Cotizaciones ----------
seccion("M. Cotizaciones");
let cot = await api.post("/cotizaciones/", { titulo: "Afinación mayor Versa", iva_porcentaje: 16, vigente_hasta: "2026-12-31" });
ok(cot.id_cotizacion && cot.costos.total === 0, "crear cotización");
cot = await api.post(`/cotizaciones/${cot.id_cotizacion}/detalles`, { id_refaccion: ref.id_refaccion, descripcion: ref.nombre_refaccion, cantidad: 1, costo_refaccion: 350 });
cot = await api.post(`/cotizaciones/${cot.id_cotizacion}/detalles`, { id_refaccion: ref.id_refaccion, descripcion: ref.nombre_refaccion, cantidad: 1, costo_refaccion: 350 });
ok(cot.detalles.length === 1 && cot.detalles[0].cantidad === 2, "cotización consolida refacciones repetidas");
cot = await api.post(`/cotizaciones/${cot.id_cotizacion}/detalles`, { descripcion: "Mano de obra", costo_mano_obra: 300 });
ok(cerca(cot.costos.subtotal, 1000) && cerca(cot.costos.total, 1160), "costos de la cotización (1000 + IVA)", JSON.stringify(cot.costos));
cot = await api.put(`/cotizaciones/${cot.id_cotizacion}`, { iva_porcentaje: 0, comentarios: "Entrega en 2 días" });
ok(cot.costos.iva === 0 && cot.comentarios === "Entrega en 2 días", "quitar IVA y guardar comentarios");
cot = await api.put(`/cotizaciones/${cot.id_cotizacion}/detalles/${cot.detalles[1].id_cotizacion_detalle}`, { costo_mano_obra: 500 });
ok(cerca(cot.costos.total, 1200), "editar concepto de la cotización");
cot = await api.del(`/cotizaciones/${cot.id_cotizacion}/detalles/${cot.detalles[1].id_cotizacion_detalle}`);
ok(cot.detalles.length === 1, "quitar concepto de la cotización");
ok((await api.get(`/refacciones/${ref.id_refaccion}`)).cantidad_refaccion === 8, "cotizar no descuenta inventario");
await api.del(`/cotizaciones/${cot.id_cotizacion}`);
ok((await api.get("/cotizaciones/")).length === 0, "eliminar cotización");

// ---------- N. Proveedores y catálogos ----------
seccion("N. Proveedores y catálogos");
const prov = await api.post("/proveedores/", { nombre_proveedor: "Refaccionaria León", rfc_proveedor: "RLE010101AAA", telefono2_proveedor: "4770000001", colonia_proveedor: "Centro" });
ok(prov.rfc_proveedor === "RLE010101AAA" && prov.colonia_proveedor === "Centro", "proveedor guarda RFC y dirección");
await api.post(`/proveedores/${prov.id_proveedor}/productos`, { nombre_producto: "Balatas", comentario: "Marca Brembo" });
ok((await api.get(`/proveedores/${prov.id_proveedor}/productos`))[0]?.comentario === "Marca Brembo", "producto de proveedor con comentario (antes se perdía en local)");
await api.post(`/proveedores/${prov.id_proveedor}/deudas`, { monto_total: 1500, saldo_total: 900, cantidad_producto: 10, comentario: "Factura 123" });
const deu = await api.get(`/proveedores/${prov.id_proveedor}/deudas`);
ok(deu.length === 1 && deu[0].cantidad_producto === 10, "deuda con cantidad y comentario");
ok(cerca((await api.get("/dashboard/resumen")).deuda_con_proveedores, 900), "el panel suma la deuda con proveedores (antes fija en 0)");
const refConProv = await api.put(`/refacciones/${ref.id_refaccion}`, { id_proveedor: prov.id_proveedor, preciopropio_refaccion: 200 });
ok(refConProv.id_proveedor === prov.id_proveedor, "refacción ligada a proveedor");
const gto = (await api.get("/estados/")).find((e) => e.nombre_estado === "Guanajuato");
const ciudadesGto = await api.get(`/ciudades/?id_estado=${gto.id_estado}`);
ok(ciudadesGto.length === 2 && ciudadesGto.every((c) => c.id_estado === gto.id_estado), "filtrar ciudades por estado (antes regresaba todas)", ciudadesGto.map((c) => c.nombre_ciudad).join(","));
const emp = await api.post("/empleados/", { nombre: "Luis", materno: "Gómez", correo: "luis@taller.mx", fecha_ingreso: "2026-01-15" });
ok(emp.materno === "Gómez" && emp.fecha_ingreso === "2026-01-15", "empleado con materno, correo y fecha de ingreso");
const promo = await api.post("/promociones/", { titulo: "Afinación", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-31", link: "https://wa.me/524770000000", orden: 1 });
ok(promo.fecha_fin === "2026-10-31" && promo.orden === 1, "promoción con vigencia, link y orden");

// ---------- O. Usuarios, roles y permisos (contrato routers/auth.py) ----------
seccion("O. Usuarios, roles y permisos");
const permisos = await api.get("/auth/permisos");
ok(permisos.length >= 43 && permisos.every((p) => p.clave && p.modulo), "catálogo de permisos", permisos.length);
const roles = await api.get("/auth/roles");
ok(roles.length >= 4 && roles.every((r) => Array.isArray(r.permisos)), "roles base con permisos resueltos");
const rolQA = await api.post("/auth/roles", { nombre: "Rol QA", descripcion: "prueba", permisos: ["clientes.ver", "servicios.ver"] });
ok(rolQA.id_rol && rolQA.es_sistema === false && rolQA.permisos.length === 2, "crear rol");
await falla(() => api.post("/auth/roles", { nombre: "Rol QA" }), "rol duplicado se rechaza", "Ya existe");
await falla(() => api.post("/auth/roles", { nombre: "Otro", permisos: ["inventado.ver"] }), "permiso desconocido se rechaza", "no reconocido");
ok((await api.put(`/auth/roles/${rolQA.id_rol}`, { permisos: ["clientes.ver"] })).permisos.length === 1, "editar permisos de un rol");
await falla(() => api.del("/auth/roles/1"), "rol base no se elimina", "no se pueden eliminar");
const usr = await api.post("/auth/usuarios", { username: "qa.user", password: "secreta1", nombre_completo: "Usuario QA", id_rol: rolQA.id_rol, correo: "qa@taller.mx" });
ok(usr.id_usuario && usr.rol?.nombre === "Rol QA" && !("password" in usr), "crear usuario (sin exponer contraseña)");
await falla(() => api.post("/auth/usuarios", { username: "qa.user", password: "x", nombre_completo: "X", id_rol: 1 }), "usuario duplicado se rechaza", "ya existe");
await falla(() => api.post("/auth/usuarios", { username: "otro", password: "x", nombre_completo: "X", id_rol: 999 }), "rol inexistente se rechaza", "no existe");
ok((await api.put(`/auth/usuarios/${usr.id_usuario}`, { telefono: "4770000000" })).telefono === "4770000000", "editar usuario");
await falla(() => api.del(`/auth/roles/${rolQA.id_rol}`), "rol en uso no se elimina", "reasígnalos");
ok((await api.put(`/auth/usuarios/${usr.id_usuario}/desactivar`)).activo === false, "desactivar usuario");
ok((await api.get("/auth/usuarios")).some((u) => u.username === "qa.user"), "listar usuarios (misma colección que /usuarios/)");
ok(Array.isArray(await api.get("/auth/solicitudes-recuperacion?solo_pendientes=true")), "solicitudes de recuperación");

// ---------- Reporte ----------
const porSeccion = {};
for (const r of resultados) (porSeccion[r.seccion] = porSeccion[r.seccion] || []).push(r);
let total = 0, fallas = 0;
for (const [sec, lista] of Object.entries(porSeccion)) {
  const f = lista.filter((r) => !r.ok);
  total += lista.length; fallas += f.length;
  console.log(`${f.length ? "✗" : "✓"} ${sec}: ${lista.length - f.length}/${lista.length}`);
  for (const r of f) console.log(`    FALLA: ${r.desc} -> ${r.detalle}`);
}
console.log(`\nTOTAL: ${total - fallas}/${total} pruebas OK`);
process.exit(fallas ? 1 : 0);
