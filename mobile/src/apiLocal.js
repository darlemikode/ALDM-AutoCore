import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  colGetAll,
  colGetOne,
  colInsertar,
  colActualizar,
  colEliminar,
  getDb,
} from "./db";
import { CODIGOS_POSTALES } from "./catalogosBase";
import { isPasswordAdminCambiada, setPasswordAdminCambiada } from "./configuracionApp";

// Contraseña de fábrica del admin sembrado en modo local — espejo del
// ADMIN_PASSWORD por defecto del backend real (app/seed.py), solo para
// validar el formulario de "Cambiar mi contraseña" aquí en local.
const ADMIN_PASSWORD_DEFECTO_LOCAL = "admin1234";

// Catálogo completo de permisos — debe ser un espejo exacto de PERMISOS en
// app/seed.py (backend). Cada rol se arma filtrando de aquí, con la misma
// forma {clave, modulo, descripcion} que regresa la API real.
const MODULOS_CRUD = [
  ["clientes", "clientes"], ["vehiculos", "vehículos"],
  ["servicios", "órdenes de servicio (incluye agregar conceptos/abonos y cerrar)"],
  ["refacciones", "refacciones (inventario)"], ["herramientas", "herramientas (inventario)"],
  ["proveedores", "proveedores y sus deudas"],
  ["catalogos", "catálogos generales (marcas, modelos, colores, tipos de servicio, países/estados/ciudades)"],
  ["usuarios", "usuarios del sistema"], ["promociones", "promociones que ven los clientes en su app"],
  ["empleados", "catálogo de empleados del taller (datos personales y asignación como responsables)"],
];
const CATALOGO_PERMISOS = [
  ...MODULOS_CRUD.flatMap(([modulo, etiqueta], i) =>
    ["ver", "crear", "editar", "eliminar"].map((accion, j) => ({
      id_permiso: i * 4 + j + 1,
      clave: `${modulo}.${accion}`,
      modulo,
      descripcion: `${accion[0].toUpperCase() + accion.slice(1)} ${etiqueta}`,
    }))
  ),
  { id_permiso: 41, clave: "configuracion.editar", modulo: "configuracion", descripcion: "Editar los datos del taller que aparecen en los documentos (recibo, nota de remisión)" },
  { id_permiso: 42, clave: "roles.ver", modulo: "roles", descripcion: "Ver roles y sus permisos" },
  { id_permiso: 43, clave: "roles.editar", modulo: "roles", descripcion: "Crear/editar/eliminar roles y asignar permisos" },
  // Mismas claves que seed.py del backend
  ...["ver", "crear", "editar", "eliminar"].map((accion, j) => ({
    id_permiso: 44 + j, clave: `cotizaciones.${accion}`, modulo: "cotizaciones",
    descripcion: `${accion[0].toUpperCase() + accion.slice(1)} cotizaciones / presupuestos`,
  })),
  ...["ver", "crear", "editar", "eliminar"].map((accion, j) => ({
    id_permiso: 48 + j, clave: `nomina.${accion}`, modulo: "nomina",
    descripcion: `${accion[0].toUpperCase() + accion.slice(1)} nómina (sueldos, periodos de pago y recibos de los empleados)`,
  })),
];
function permisosPorClave(...claves) {
  return CATALOGO_PERMISOS.filter((p) => claves.includes(p.clave));
}

const ROLES_BASE_LOCAL = [
  { id_rol: 1, nombre: "Administrador General", descripcion: "Acceso total al sistema.", es_sistema: true,
    permisos: CATALOGO_PERMISOS },
  { id_rol: 2, nombre: "Jefe de Taller / Receptor", descripcion: "Administra catálogos, promociones y vehículos/servicios/refacciones por completo; clientes, herramientas y proveedores en modo lectura/escritura (sin eliminar).", es_sistema: true,
    permisos: permisosPorClave(
      "clientes.ver", "clientes.editar",
      "vehiculos.ver", "vehiculos.crear", "vehiculos.editar", "vehiculos.eliminar",
      "servicios.ver", "servicios.crear", "servicios.editar", "servicios.eliminar",
      "refacciones.ver", "refacciones.crear", "refacciones.editar", "refacciones.eliminar",
      "herramientas.ver", "herramientas.editar",
      "proveedores.ver", "proveedores.editar",
      "catalogos.ver", "catalogos.crear", "catalogos.editar", "catalogos.eliminar",
      "promociones.ver", "promociones.crear", "promociones.editar", "promociones.eliminar"
    ) },
  { id_rol: 3, nombre: "Asesor de Servicio / Caja", descripcion: "Da de alta órdenes de servicio y captura cobros; consulta clientes, vehículos y refacciones en solo lectura.", es_sistema: true,
    permisos: permisosPorClave("clientes.ver", "vehiculos.ver", "servicios.ver", "servicios.crear", "servicios.editar", "refacciones.ver") },
  { id_rol: 4, nombre: "Técnico / Mecánico", descripcion: "Solo ve las órdenes de servicio asignadas y su propio dashboard de trabajo — no administra nada del taller.", es_sistema: true,
    permisos: permisosPorClave("servicios.ver") },
];

// Roles guardados en la colección "roles" (se siembran con los base la primera vez);
// permisos se guardan como claves y se resuelven a objetos al leer, como RolOut.
function resolverRol(r) {
  return r && { ...r, permisos: CATALOGO_PERMISOS.filter((p) => (r.permisos || []).includes(p.clave)) };
}
async function rolesLocales() {
  let lista = await colGetAll("roles");
  if (!lista.length) {
    for (const r of ROLES_BASE_LOCAL) {
      const db = await getDb();
      await db.runAsync("INSERT INTO colecciones (coleccion, id, datos_json) VALUES (?, ?, ?)", ["roles", r.id_rol, JSON.stringify({ ...r, permisos: r.permisos.map((p) => p.clave) })]);
    }
    lista = await colGetAll("roles");
  }
  return lista.map(resolverRol);
}

// Traduce cada endpoint que usa la app a una operación sobre las
// "colecciones" locales (ver db.js) — para que, en modo local, ninguna
// pantalla necesite saber que no hay servidor detrás. Cubre el flujo
// principal del taller: clientes, vehículos, órdenes (con sus conceptos y
// abonos), refacciones, empleados, proveedores, herramientas y catálogos.
//
// Lo que NO está cubierto en esta primera versión (se deja pendiente a
// propósito, ver nota al final del archivo): citas, inspecciones digitales,
// códigos postales, y el resumen del dashboard con datos reales.

// Ids únicos para renglones anidados (conceptos, abonos, compatibilidades).
// Antes se usaba Date.now(): dos renglones creados en el mismo milisegundo
// quedaban con el mismo id y editar/quitar uno afectaba al otro.
let ultimoId = 0;
function nuevoId() {
  ultimoId = Math.max(ultimoId + 1, Date.now() * 1000);
  return ultimoId;
}

function separarQuery(path) {
  const [ruta, query] = path.split("?");
  const params = new URLSearchParams(query || "");
  return { ruta, params };
}

function partes(ruta) {
  return ruta.split("/").filter(Boolean);
}

function coincideTexto(texto, busqueda) {
  return (texto || "").toString().toLowerCase().includes(busqueda.toLowerCase());
}

export async function solicitudLocal(path, method, body) {
  const { ruta, params } = separarQuery(path);
  const seg = partes(ruta); // ej. ["clientes"] o ["servicios", "12", "abonos"]

  // ---------------- CLIENTES ----------------
  if (seg[0] === "clientes") {
    if (seg.length === 1) {
      if (method === "GET") {
        let lista = await colGetAll("clientes");
        const q = params.get("q");
        if (q) lista = lista.filter((c) => coincideTexto(c.nombre_cliente, q) || coincideTexto(c.paterno_cliente, q) || coincideTexto(c.telefono1_cliente, q));
        if (params.get("solo_activos") === "true") lista = lista.filter((c) => c.activo !== false);
        return lista;
      }
      if (method === "POST") {
        if (!(await isPasswordAdminCambiada())) {
          throw new Error("Antes de agregar clientes, cambia la contraseña del usuario admin (sigue siendo la de fábrica).");
        }
        return colInsertar("clientes", { ...body, activo: true }, "id_cliente");
      }
    }
    if (seg.length === 2) {
      const idCliente = parseInt(seg[1], 10);
      if (method === "GET") return colGetOne("clientes", idCliente);
      if (method === "PUT") return colActualizar("clientes", idCliente, body);
      if (method === "DELETE") { await colEliminar("clientes", idCliente); return null; }
    }
    if (seg.length === 3 && seg[2] === "vehiculos" && method === "GET") {
      const idCliente = parseInt(seg[1], 10);
      const todos = await colGetAll("vehiculos");
      return todos.filter((v) => v.id_cliente === idCliente);
    }
    if (seg.length === 3 && seg[2] === "generar-acceso" && method === "POST") {
      const idCliente = parseInt(seg[1], 10);
      const cliente = await colGetOne("clientes", idCliente);
      if (!cliente) throw new Error("Cliente no encontrado");
      const identificador = cliente.telefono1 || cliente.correo_cliente;
      if (!identificador) throw new Error("El cliente necesita al menos un teléfono o correo registrado para poder entrar a la app.");
      const passwordTemporal = Math.random().toString(36).slice(-10);
      await colActualizar("clientes", idCliente, { cuenta_activada: true, codigo_invitacion: null });
      return { identificador, password_temporal: passwordTemporal };
    }
  }

  // ---------------- VEHÍCULOS ----------------
  if (seg[0] === "vehiculos") {
    if (seg.length === 1) {
      if (method === "GET") {
        let lista = await colGetAll("vehiculos");
        const idCliente = params.get("id_cliente");
        if (idCliente) lista = lista.filter((v) => String(v.id_cliente) === idCliente);
        const ctx = await contextoRelaciones();
        return lista.map((v) => vehiculoCompleto(v, ctx));
      }
      if (method === "POST") return colInsertar("vehiculos", { estado_vehiculo: "activo", ...body }, "id_vehiculo");
    }
    if (seg.length === 2) {
      const idVeh = parseInt(seg[1], 10);
      if (method === "GET") return colGetOne("vehiculos", idVeh);
      if (method === "PUT") return colActualizar("vehiculos", idVeh, body);
      if (method === "DELETE") {
        const tieneServicios = (await colGetAll("servicios")).some((s) => mismoId(s.id_vehiculo, idVeh));
        if (tieneServicios) throw new Error("No se puede eliminar: el vehículo tiene órdenes de servicio en su historial.");
        await colEliminar("vehiculos", idVeh);
        return null;
      }
    }
  }

  // ---------------- SERVICIOS (órdenes), con detalles y abonos anidados ----------------
// Debe reflejar exactamente ETAPAS_SERVICIO en app/routers/servicios.py
// (backend real) — es el catálogo fijo de etapas de trabajo dentro de una
// orden abierta.
const ETAPAS_SERVICIO_LOCAL = [
  { clave: "recibido", etiqueta: "Recibido" },
  { clave: "diagnostico", etiqueta: "En diagnóstico" },
  { clave: "esperando_autorizacion", etiqueta: "Esperando autorización del cliente" },
  { clave: "en_reparacion", etiqueta: "En reparación" },
  { clave: "esperando_refacciones", etiqueta: "Esperando refacciones" },
  { clave: "control_calidad", etiqueta: "Control de calidad" },
  { clave: "listo_entrega", etiqueta: "Listo para entrega" },
];

  if (seg[0] === "servicios") {
    if (seg.length === 2 && seg[1] === "etapas-disponibles" && method === "GET") {
      return ETAPAS_SERVICIO_LOCAL;
    }
    if (seg.length === 1) {
      if (method === "GET") {
        let lista = await colGetAll("servicios");
        const idCliente = params.get("id_cliente");
        const status = params.get("status");
        if (idCliente) lista = lista.filter((s) => String(s.id_cliente) === idCliente);
        if (status) lista = lista.filter((s) => s.status === status);
        const ctx = await contextoRelaciones();
        return lista.map((x) => servicioCompleto(x, ctx)).sort((a, b) => b.id_servicio - a.id_servicio);
      }
      if (method === "POST") {
        const etapaInicial = body.es_garantia ? "diagnostico" : "recibido";
        const todosLosTipos = await colGetAll("tipos_servicio");
        const tiposElegidos = (body.tipos_mantenimiento_ids || []).map((id) => todosLosTipos.find((t) => t.id_tipo_servicio === id)).filter(Boolean);
        const { tipos_mantenimiento_ids, ...bodySinIds } = body;
        const nuevo = await colInsertar("servicios", {
          iva_porcentaje: body.iva_porcentaje ?? 0, pagado: false,
          ...bodySinIds, status: body.status || "abierto", etapa: etapaInicial, detalles: [], abonos: [],
          tipos_mantenimiento: tiposElegidos,
          fecha_entrada_servicio: new Date().toISOString(),
          historial_etapas: [{ id_registro: nuevoId(), etapa: etapaInicial, fecha: new Date().toISOString(), comentario: null, actualizado_por: "admin" }],
        }, "id_servicio");
        return servicioCompleto(nuevo, await contextoRelaciones());
      }
    }
    if (seg.length === 2) {
      const idServicio = parseInt(seg[1], 10);
      if (method === "GET") {
        const s = await colGetOne("servicios", idServicio);
        return s ? servicioCompleto(s, await contextoRelaciones()) : null;
      }
      if (method === "PUT") {
        let cuerpoActualizar = body;
        if (body.tipos_mantenimiento_ids !== undefined) {
          const todosLosTipos = await colGetAll("tipos_servicio");
          const tiposElegidos = (body.tipos_mantenimiento_ids || []).map((id) => todosLosTipos.find((t) => t.id_tipo_servicio === id)).filter(Boolean);
          const { tipos_mantenimiento_ids, ...resto } = body;
          cuerpoActualizar = { ...resto, tipos_mantenimiento: tiposElegidos };
        }
        const actualizado = await colActualizar("servicios", idServicio, cuerpoActualizar);
        return servicioCompleto(actualizado, await contextoRelaciones());
      }
      if (method === "DELETE") { await colEliminar("servicios", idServicio); return null; }
    }
    if (seg.length === 3 && seg[2] === "etapa" && method === "PUT") {
      const idServicio = parseInt(seg[1], 10);
      if (!ETAPAS_SERVICIO_LOCAL.some((e) => e.clave === body.etapa)) {
        throw new Error("Esa etapa no existe en el catálogo.");
      }
      const s = await colGetOne("servicios", idServicio);
      const historial = [...(s.historial_etapas || []), { id_registro: nuevoId(), etapa: body.etapa, fecha: new Date().toISOString(), comentario: body.comentario || null, actualizado_por: "admin" }];
      const actualizado = await colActualizar("servicios", idServicio, { etapa: body.etapa, historial_etapas: historial });
      return servicioCompleto(actualizado, await contextoRelaciones());
    }
    if (seg.length === 3 && seg[2] === "detalles" && method === "POST") {
      const idServicio = parseInt(seg[1], 10);
      const s = await colGetOne("servicios", idServicio);
      if (!s) throw new Error("La orden no existe.");
      // _pendienteSubir aquí marca el detalle individual, no todo el
      // servicio — así, si la orden ya se había subido antes y le agregas
      // un concepto después, ese concepto sí se detecta como pendiente.
      if (s.status !== "abierto") throw new Error("La orden no está abierta: ya no se le pueden agregar conceptos.");
      const cantidad = Math.max(Number(body.cantidad) || 1, 1);
      // Mismo algoritmo que agregar_detalle() del backend: descuenta del
      // inventario compatible con marca+modelo del vehículo (nunca en negativo);
      // si no hay, descuenta del stock general de la refacción.
      const idInventario = await descontarStock(s, body.id_refaccion, cantidad);
      const nuevoDetalle = { id_servicio_detalle: nuevoId(), ...body, cantidad, id_inventario_refaccion: idInventario, _pendienteSubir: true };
      const detalles = consolidarRefacciones([...(s.detalles || []), nuevoDetalle], "id_servicio_detalle");
      const actualizado = await colActualizar("servicios", idServicio, { detalles });
      return servicioCompleto(actualizado, await contextoRelaciones());
    }
    if (seg.length === 3 && seg[2] === "abonos" && method === "POST") {
      const idServicio = parseInt(seg[1], 10);
      const s = await colGetOne("servicios", idServicio);
      // Mismo cálculo que el backend real: si el monto es mayor al saldo,
      // se acepta igual y el resto queda como cambio a devolver. Si la
      // orden ya estaba pagada (saldo en $0 o menos), todo el monto es
      // cambio — no se aplica nada, para no dejar el saldo en negativo.
      const saldoActual = agregarCostos(s).costos.saldo_pendiente;
      let montoAplicar;
      let cambio;
      if (saldoActual <= 0) {
        montoAplicar = 0;
        cambio = Math.round(body.monto_abono * 100) / 100;
      } else if (body.monto_abono > saldoActual) {
        cambio = Math.round((body.monto_abono - saldoActual) * 100) / 100;
        montoAplicar = saldoActual;
      } else {
        montoAplicar = body.monto_abono;
        cambio = 0;
      }
      const nuevoAbono = {
        id_abono: nuevoId(), monto_abono: montoAplicar, cambio,
        tipo_pago: body.tipo_pago || "efectivo",
        desglose_mixto_efectivo: body.desglose_mixto_efectivo ?? null,
        desglose_mixto_tarjeta: body.desglose_mixto_tarjeta ?? null,
        comentario: body.comentario || null,
        fecha_pago: new Date().toISOString(), _pendienteSubir: true,
      };
      const abonos = [...(s.abonos || []), nuevoAbono];
      const actualizado = await colActualizar("servicios", idServicio, { abonos });
      return servicioCompleto(actualizado, await contextoRelaciones());
    }
    // Conceptos: editar (cantidad/costos) y quitar — igual que la tabla editable de la web
    if (seg.length === 4 && seg[2] === "detalles" && (method === "PUT" || method === "DELETE")) {
      const idServicio = parseInt(seg[1], 10);
      const idDetalle = Number(seg[3]);
      const s = await colGetOne("servicios", idServicio);
      if (!s) throw new Error("La orden no existe.");
      if (s.status !== "abierto") throw new Error("La orden no está abierta: sus conceptos ya no se pueden editar.");
      const detalle = (s.detalles || []).find((d) => Number(d.id_servicio_detalle) === idDetalle);
      if (!detalle) throw new Error("Ese concepto ya no existe en la orden.");
      let detalles;
      if (method === "PUT") {
        // Si solo cambia la cantidad (botones +/- de piezas) sin mandar
        // también un costo_refaccion nuevo, se reescala el importe en
        // proporción — igual que el backend real — para que el total/saldo
        // no se quede en el precio de cuando había menos (o más) piezas.
        let cambios = { ...body };
        if (cambios.cantidad !== undefined && cambios.costo_refaccion === undefined) {
          const cantidadAnterior = detalle.cantidad || 1;
          const nuevaCantidad = Math.max(Number(cambios.cantidad) || 1, 1);
          if (cantidadAnterior && detalle.costo_refaccion) {
            const precioUnitario = detalle.costo_refaccion / cantidadAnterior;
            cambios.costo_refaccion = Math.round(precioUnitario * nuevaCantidad * 100) / 100;
          }
          cambios.cantidad = nuevaCantidad;
        }
        detalles = s.detalles.map((d) => (Number(d.id_servicio_detalle) === idDetalle ? { ...d, ...cambios, _pendienteSubir: true } : d));
      } else {
        // Regresa las piezas a donde se descontaron (inventario del vehículo o stock general)
        await regresarStock(detalle);
        detalles = s.detalles.filter((d) => Number(d.id_servicio_detalle) !== idDetalle);
      }
      const actualizado = await colActualizar("servicios", idServicio, { detalles });
      return servicioCompleto(actualizado, await contextoRelaciones());
    }

    // Finalizar: cobra el saldo (si hay), cierra la orden y calcula el cambio —
    // mismo contrato que POST /servicios/{id}/finalizar del backend.
    if (seg.length === 3 && seg[2] === "finalizar" && method === "POST") {
      const idServicio = parseInt(seg[1], 10);
      const s = await colGetOne("servicios", idServicio);
      if (!s) throw new Error("La orden no existe.");
      if (s.status !== "abierto") throw new Error("Solo se pueden finalizar órdenes abiertas.");
      const saldo = Math.round(agregarCostos(s).costos.saldo_pendiente * 100) / 100;
      const abonos = [...(s.abonos || [])];
      let cambio = 0;
      if (saldo > 0.005) {
        const tipo = body.tipo_pago || "efectivo";
        const recibido = tipo === "mixto"
          ? (Number(body.desglose_mixto_efectivo) || 0) + (Number(body.desglose_mixto_tarjeta) || 0)
          : body.monto_recibido != null ? Number(body.monto_recibido) : (tipo === "tarjeta" ? saldo : 0);
        if (recibido + 0.005 < saldo) throw new Error(`El pago no cubre el saldo: faltan $${(saldo - recibido).toFixed(2)}.`);
        cambio = Math.round((recibido - saldo) * 100) / 100;
        abonos.push({
          id_abono: nuevoId(), numero_abono: abonos.length + 1, monto_abono: saldo, cambio, tipo_pago: tipo,
          desglose_mixto_efectivo: tipo === "mixto" ? Number(body.desglose_mixto_efectivo) || 0 : null,
          desglose_mixto_tarjeta: tipo === "mixto" ? Number(body.desglose_mixto_tarjeta) || 0 : null,
          comentario: "Pago al finalizar la orden", fecha_pago: new Date().toISOString(), _pendienteSubir: true,
        });
      }
      const historial = [...(s.historial_etapas || []), { id_registro: nuevoId(), etapa: "listo_entrega", fecha: new Date().toISOString(), comentario: "Orden finalizada", actualizado_por: "admin" }];
      const actualizado = await colActualizar("servicios", idServicio, {
        abonos, status: "cerrado", pagado: true, etapa: "listo_entrega", historial_etapas: historial,
        comentarios_finales: body.comentarios_finales ?? s.comentarios_finales ?? null,
        fecha_salida_servicio: new Date().toISOString(),
      });
      return {
        servicio: servicioCompleto(actualizado, await contextoRelaciones()),
        cambio, saldo_pendiente: 0,
        notificaciones: { push: false, correo: false, chat: false }, // sin servidor no hay a quién avisar
      };
    }

    // Garantías: órdenes que se abrieron como reclamación de esta
    if (seg.length === 3 && seg[2] === "reclamaciones" && method === "GET") {
      const idServicio = parseInt(seg[1], 10);
      const ctx = await contextoRelaciones();
      return (await colGetAll("servicios"))
        .filter((x) => Number(x.id_servicio_original) === idServicio)
        .map((x) => servicioCompleto(x, ctx));
    }

    // Chat de la orden (en local no hay cliente del otro lado, pero queda el registro)
    if (seg.length === 4 && seg[2] === "chat" && seg[3] === "mensajes") {
      const idServicio = parseInt(seg[1], 10);
      if (method === "GET") {
        return (await colGetAll("chat_mensajes")).filter((m) => m.id_servicio === idServicio);
      }
      if (method === "POST") {
        return colInsertar("chat_mensajes", {
          id_servicio: idServicio, autor_tipo: "taller", autor_nombre: "Taller",
          tipo: body.tipo || "mensaje", texto: body.texto, ruta_foto: null, fecha: new Date().toISOString(),
        }, "id_mensaje");
      }
    }
    if (seg.length === 4 && seg[2] === "chat" && seg[3] === "foto" && method === "POST") {
      const idServicio = parseInt(seg[1], 10);
      const archivo = body && body.get ? body.get("archivo") : null;
      const texto = (body && body.get && body.get("texto")) || "📷 Foto";
      let ruta = null;
      if (archivo && archivo.uri) {
        const base64 = await FileSystem.readAsStringAsync(archivo.uri, { encoding: FileSystem.EncodingType.Base64 });
        ruta = `data:${archivo.type || "image/jpeg"};base64,${base64}`;
      }
      return colInsertar("chat_mensajes", {
        id_servicio: idServicio, autor_tipo: "taller", autor_nombre: "Taller",
        tipo: "mensaje", texto, ruta_foto: ruta, fecha: new Date().toISOString(),
      }, "id_mensaje");
    }
  }

async function colInsertarConIdFijo(coleccion, id, registro) {
  const db = await getDb();
  await db.runAsync("INSERT INTO colecciones (coleccion, id, datos_json) VALUES (?, ?, ?)", [coleccion, id, JSON.stringify(registro)]);
  return registro;
}


  // ---------------- COTIZACIONES (mismo contrato que routers/cotizaciones.py) ----------------
  if (seg[0] === "cotizaciones") {
    const conCostos = (c) => {
      if (!c) return c;
      const detalles = c.detalles || [];
      const subtotal = Math.round(detalles.reduce((a, d) => a + (Number(d.costo_mano_obra) || 0) + (Number(d.costo_refaccion) || 0) + (Number(d.costo_extra) || 0), 0) * 100) / 100;
      const iva = Math.round(subtotal * (Number(c.iva_porcentaje) || 0) / 100 * 100) / 100;
      return { ...c, detalles, costos: { subtotal, iva, total: Math.round((subtotal + iva) * 100) / 100 } };
    };
    if (seg.length === 1 && method === "GET") return (await colGetAll("cotizaciones")).map(conCostos).sort((a, b) => b.id_cotizacion - a.id_cotizacion);
    if (seg.length === 1 && method === "POST") {
      if (!body.titulo?.trim()) throw new Error("La cotización necesita un título.");
      return conCostos(await colInsertar("cotizaciones", {
        titulo: body.titulo.trim(), iva_porcentaje: body.iva_porcentaje ?? 16, comentarios: body.comentarios || null,
        vigente_hasta: body.vigente_hasta || null, fecha_cotizacion: new Date().toISOString(), detalles: [],
      }, "id_cotizacion"));
    }
    const idCot = parseInt(seg[1], 10);
    if (seg.length === 2) {
      if (method === "GET") {
        const c = await colGetOne("cotizaciones", idCot);
        if (!c) throw new Error("Cotización no encontrada");
        return conCostos(c);
      }
      if (method === "PUT") return conCostos(await colActualizar("cotizaciones", idCot, body));
      if (method === "DELETE") { await colEliminar("cotizaciones", idCot); return null; }
    }
    if (seg[2] === "detalles") {
      const c = await colGetOne("cotizaciones", idCot);
      if (!c) throw new Error("Cotización no encontrada");
      let detalles = c.detalles || [];
      if (seg.length === 3 && method === "POST") {
        detalles = consolidarRefacciones([...detalles, {
          id_cotizacion_detalle: nuevoId(), id_cotizacion: idCot, id_tipo_servicio: body.id_tipo_servicio ?? null,
          id_refaccion: body.id_refaccion ?? null, descripcion: body.descripcion ?? null, cantidad: Math.max(Number(body.cantidad) || 1, 1),
          costo_mano_obra: Number(body.costo_mano_obra) || 0, costo_refaccion: Number(body.costo_refaccion) || 0, costo_extra: Number(body.costo_extra) || 0,
        }], "id_cotizacion_detalle");
      } else if (seg.length === 4 && method === "PUT") {
        detalles = detalles.map((d) => {
          if (Number(d.id_cotizacion_detalle) !== Number(seg[3])) return d;
          const cambios = { ...body };
          const sinCostos = !["costo_mano_obra", "costo_refaccion", "costo_extra"].some((k) => k in cambios);
          if ("cantidad" in cambios && sinCostos) {
            const antes = Number(d.cantidad) || 1, nueva = Math.max(Number(cambios.cantidad) || 1, 1);
            for (const k of ["costo_mano_obra", "costo_refaccion", "costo_extra"]) cambios[k] = Math.round(((Number(d[k]) || 0) / antes * nueva) * 100) / 100;
          }
          return { ...d, ...cambios };
        });
      } else if (seg.length === 4 && method === "DELETE") {
        detalles = detalles.filter((d) => Number(d.id_cotizacion_detalle) !== Number(seg[3]));
      }
      return conCostos(await colActualizar("cotizaciones", idCot, { detalles }));
    }
  }

  // ---------------- PROMOCIONES ----------------
  if (seg[0] === "promociones") {
    if (seg.length === 1 && method === "GET") return colGetAll("promociones");
    if (seg.length === 1 && method === "POST") return colInsertar("promociones", body, "id_promocion");
    if (seg.length === 2 && method === "PUT") return colActualizar("promociones", parseInt(seg[1], 10), body);
    if (seg.length === 2 && method === "DELETE") { await colEliminar("promociones", parseInt(seg[1], 10)); return null; }
    if (seg.length === 3 && seg[2] === "imagen" && method === "POST") {
      const idPromocion = parseInt(seg[1], 10);
      const archivo = body && body.get ? body.get("archivo") : null;
      if (archivo && archivo.uri) {
        const base64 = await FileSystem.readAsStringAsync(archivo.uri, { encoding: FileSystem.EncodingType.Base64 });
        return colActualizar("promociones", idPromocion, { ruta_imagen: `data:${archivo.type || "image/jpeg"};base64,${base64}` });
      }
      return colGetOne("promociones", idPromocion);
    }
  }

  // ---------------- DATOS DEL TALLER ----------------
  if (seg[0] === "configuracion-taller") {
    const CONFIG_ID = 1;
    if (seg.length === 1 && method === "GET") {
      const existente = await colGetOne("configuracion_taller", CONFIG_ID);
      return existente || { id_configuracion: CONFIG_ID, nombre_taller: "Mi Taller", direccion: null, telefono: null, correo: null, rfc: null, ruta_logo: null };
    }
    if (seg.length === 1 && method === "PUT") {
      const existente = await colGetOne("configuracion_taller", CONFIG_ID);
      if (existente) return colActualizar("configuracion_taller", CONFIG_ID, body);
      return colInsertarConIdFijo("configuracion_taller", CONFIG_ID, { id_configuracion: CONFIG_ID, ruta_logo: null, ...body });
    }
    if (seg.length === 2 && seg[1] === "logo" && method === "POST") {
      // El logo llega como FormData (archivo real) — en modo local no hay
      // servidor de archivos, así que se guarda como base64 directo en la
      // base local. Funciona igual para mostrarlo en <Image>, solo pesa
      // más que guardar nomás la ruta.
      const archivo = body && body.get ? body.get("archivo") : null;
      const existente = await colGetOne("configuracion_taller", CONFIG_ID);
      const config = existente || { id_configuracion: CONFIG_ID, nombre_taller: "Mi Taller", direccion: null, telefono: null, correo: null, rfc: null, ruta_logo: null };
      if (archivo && archivo.uri) {
        const base64 = await FileSystem.readAsStringAsync(archivo.uri, { encoding: FileSystem.EncodingType.Base64 });
        config.ruta_logo = `data:${archivo.type || "image/jpeg"};base64,${base64}`;
      }
      if (existente) return colActualizar("configuracion_taller", CONFIG_ID, { ruta_logo: config.ruta_logo });
      return colInsertarConIdFijo("configuracion_taller", CONFIG_ID, config);
    }
  }

  // ---------------- COMISIONES ----------------
  if (seg[0] === "comisiones" && seg.length === 1 && method === "GET") {
    const existentes = await colGetAll("configuracion_comisiones");
    const tiposFaltantes = ["efectivo", "tarjeta", "mixto"].filter((t) => !existentes.some((c) => c.tipo_pago === t));
    for (const tipo of tiposFaltantes) {
      const db = await getDb();
      await db.runAsync("INSERT INTO colecciones (coleccion, id, datos_json) VALUES (?, ?, ?)", [
        "configuracion_comisiones", tipo, JSON.stringify({ tipo_pago: tipo, porcentaje: tipo === "tarjeta" ? 3.5 : 0 }),
      ]);
    }
    return colGetAll("configuracion_comisiones");
  }
  if (seg[0] === "comisiones" && seg.length === 2 && method === "PUT") {
    const db = await getDb();
    await db.runAsync("UPDATE colecciones SET datos_json = ? WHERE coleccion = ? AND id = ?", [
      JSON.stringify({ tipo_pago: seg[1], porcentaje: body.porcentaje }), "configuracion_comisiones", seg[1],
    ]);
    return { tipo_pago: seg[1], porcentaje: body.porcentaje };
  }

  // ---------------- REFACCIONES ----------------
  if (seg[0] === "refacciones") {
    if (seg.length === 1) {
      if (method === "GET") {
        let lista = await colGetAll("refacciones");
        const q = params.get("q");
        if (q) lista = lista.filter((r) => coincideTexto(r.nombre_refaccion, q));
        return lista;
      }
      if (method === "POST") return colInsertar("refacciones", body, "id_refaccion");
    }
    if (seg.length === 2) {
      const idRef = parseInt(seg[1], 10);
      if (method === "GET") return colGetOne("refacciones", idRef);
      if (method === "PUT") return colActualizar("refacciones", idRef, body);
      if (method === "DELETE") { await colEliminar("refacciones", idRef); return null; }
    }
  }

  // ---------------- EMPLEADOS ----------------
  if (seg[0] === "empleados") {
    if (seg.length === 1) {
      if (method === "GET") return colGetAll("empleados");
      if (method === "POST") return colInsertar("empleados", { ...body, activo: true }, "id_empleado");
    }
    if (seg.length === 2 && method === "PUT") return colActualizar("empleados", parseInt(seg[1], 10), body);
    if (seg.length === 2 && method === "DELETE") { await colEliminar("empleados", parseInt(seg[1], 10)); return null; }
    if (seg[1] === "mi-dashboard") return { servicios_recientes: [], total_servicios: 0 };
  }

  // ---------------- NÓMINA ----------------
  if (seg[0] === "nomina") {
    if (seg[1] === "periodos") {
      if (seg.length === 2 && method === "GET") {
        const periodos = await colGetAll("periodos_nomina");
        const recibos = await colGetAll("recibos_nomina");
        return periodos.map((p) => ({ ...p, recibos: recibos.filter((r) => r.id_periodo === p.id_periodo) }));
      }
      if (seg.length === 2 && method === "POST") {
        const periodo = await colInsertar("periodos_nomina", { ...body, status: "abierto", fecha_pago: null }, "id_periodo");
        const empleados = (await colGetAll("empleados")).filter((e) => e.activo !== false && Number(e.sueldo_base) > 0);
        const recibos = [];
        for (const emp of empleados) {
          const recibo = await colInsertar("recibos_nomina", {
            id_periodo: periodo.id_periodo,
            id_empleado: emp.id_empleado,
            sueldo_base: Number(emp.sueldo_base) || 0,
            bonos: 0, bonos_nota: null, deducciones: 0, deducciones_nota: null,
            total_pagar: Number(emp.sueldo_base) || 0,
            pagado: false, fecha_pago: null,
          }, "id_recibo");
          recibos.push({ ...recibo, empleado: emp });
        }
        return { ...periodo, recibos };
      }
      if (seg.length === 3 && method === "GET") {
        const periodo = await colGetOne("periodos_nomina", parseInt(seg[2], 10));
        if (!periodo) throw new Error("Periodo no encontrado");
        const empleados = await colGetAll("empleados");
        const recibos = (await colGetAll("recibos_nomina"))
          .filter((r) => r.id_periodo === periodo.id_periodo)
          .map((r) => ({ ...r, empleado: empleados.find((e) => e.id_empleado === r.id_empleado) || null }));
        return { ...periodo, recibos };
      }
      if (seg.length === 3 && method === "DELETE") {
        const periodo = await colGetOne("periodos_nomina", parseInt(seg[2], 10));
        if (!periodo) throw new Error("Periodo no encontrado");
        if (periodo.status === "pagado") throw new Error("Este periodo ya se pagó, no se puede eliminar.");
        await colEliminar("periodos_nomina", periodo.id_periodo);
        return null;
      }
    }
    if (seg[1] === "recibos" && seg.length === 3 && method === "PUT") {
      const recibo = await colGetOne("recibos_nomina", parseInt(seg[2], 10));
      if (!recibo) throw new Error("Recibo no encontrado");
      if (recibo.pagado) throw new Error("Este recibo ya está pagado, no se puede editar.");
      const totalPagar = (Number(recibo.sueldo_base) || 0) + (Number(body.bonos) || 0) - (Number(body.deducciones) || 0);
      return colActualizar("recibos_nomina", recibo.id_recibo, { ...body, total_pagar: totalPagar });
    }
    if (seg[1] === "recibos" && seg.length === 4 && seg[3] === "pagar" && method === "POST") {
      const recibo = await colGetOne("recibos_nomina", parseInt(seg[2], 10));
      if (!recibo) throw new Error("Recibo no encontrado");
      const actualizado = await colActualizar("recibos_nomina", recibo.id_recibo, { pagado: true, fecha_pago: new Date().toISOString() });
      const pendientes = (await colGetAll("recibos_nomina")).filter((r) => r.id_periodo === recibo.id_periodo && !r.pagado);
      if (pendientes.length === 0) await colActualizar("periodos_nomina", recibo.id_periodo, { status: "pagado", fecha_pago: new Date().toISOString() });
      return actualizado;
    }
  }

  // ---------------- PROVEEDORES ----------------
  if (seg[0] === "proveedores") {
    if (seg.length === 1) {
      if (method === "GET") return colGetAll("proveedores");
      if (method === "POST") return colInsertar("proveedores", body, "id_proveedor");
    }
    if (seg.length === 2) {
      const idProv = parseInt(seg[1], 10);
      if (method === "PUT") return colActualizar("proveedores", idProv, body);
      if (method === "DELETE") { await colEliminar("proveedores", idProv); return null; }
    }
    // Productos y deudas del proveedor (antes se descartaban en modo local)
    if (seg.length === 3 && (seg[2] === "deudas" || seg[2] === "productos")) {
      const idProv = parseInt(seg[1], 10);
      const coleccion = seg[2] === "deudas" ? "proveedor_deudas" : "proveedor_productos";
      const campoId = seg[2] === "deudas" ? "id_deuda" : "id_producto_proveedor";
      if (method === "GET") return (await colGetAll(coleccion)).filter((x) => x.id_proveedor === idProv);
      if (method === "POST") {
        const extra = seg[2] === "deudas"
          ? { monto_total: Number(body.monto_total) || 0, saldo_total: Number(body.saldo_total ?? body.monto_total) || 0, cantidad_producto: Number(body.cantidad_producto) || 0, fecha: new Date().toISOString() }
          : {};
        return colInsertar(coleccion, { ...body, ...extra, id_proveedor: idProv }, campoId);
      }
    }
  }

  // ---------------- HERRAMIENTAS ----------------
  if (seg[0] === "herramientas" && seg.length === 1) {
    if (method === "GET") return colGetAll("herramientas");
    if (method === "POST") return colInsertar("herramientas", body, "id_herramienta");
  }
  if (seg[0] === "herramientas" && seg.length === 2) {
    const idHerr = parseInt(seg[1], 10);
    if (method === "PUT") return colActualizar("herramientas", idHerr, body);
    if (method === "DELETE") { await colEliminar("herramientas", idHerr); return null; }
  }
  if (seg[0] === "herramientas-marcas") {
    if (seg.length === 1 && method === "GET") return colGetAll("herramientas_marcas");
    if (seg.length === 1 && method === "POST") return colInsertar("herramientas_marcas", body, "id_herramienta_marca");
    if (seg.length === 2 && method === "PUT") return colActualizar("herramientas_marcas", parseInt(seg[1], 10), body);
    if (seg.length === 2 && method === "DELETE") { await colEliminar("herramientas_marcas", parseInt(seg[1], 10)); return null; }
  }

  // ---------------- CATÁLOGOS SIMPLES (ver/crear) ----------------
  const CATALOGOS_SIMPLES = {
    "vehiculos-marcas": { coleccion: "vehiculos_marcas", idCampo: "id_marca_vehiculo" },
    "colores-vehiculos": { coleccion: "colores_vehiculos", idCampo: "id_color" },
    "tipos-servicio": { coleccion: "tipos_servicio", idCampo: "id_tipo_servicio" },
    "refacciones-marcas": { coleccion: "refacciones_marcas", idCampo: "id_marca_refaccion" },
    "refacciones-categorias": { coleccion: "refacciones_categorias", idCampo: "id_categoria_refaccion" },
    "paises": { coleccion: "paises", idCampo: "id_pais" },
    "estados": { coleccion: "estados", idCampo: "id_estado" },
    "ciudades": { coleccion: "ciudades", idCampo: "id_ciudad" },
  };
  if (CATALOGOS_SIMPLES[seg[0]] && seg.length === 1) {
    const { coleccion, idCampo } = CATALOGOS_SIMPLES[seg[0]];
    if (method === "GET") {
      // Filtros por query igual que el backend (ej. /ciudades/?id_estado=12)
      let lista = await colGetAll(coleccion);
      for (const [k, v] of params.entries()) {
        if (v !== "" && lista.some((x) => k in x)) lista = lista.filter((x) => String(x[k]) === v);
      }
      return lista;
    }
    if (method === "POST") return colInsertar(coleccion, body, idCampo);
  }
  if (CATALOGOS_SIMPLES[seg[0]] && seg.length === 2) {
    const { coleccion } = CATALOGOS_SIMPLES[seg[0]];
    const idItem = parseInt(seg[1], 10);
    if (method === "PUT") return colActualizar(coleccion, idItem, body);
    if (method === "DELETE") { await colEliminar(coleccion, idItem); return null; }
  }
  if (seg[0] === "vehiculos-modelos" && method === "GET") {
    const todos = await colGetAll("vehiculos_modelos");
    const idMarca = params.get("id_marca_vehiculo");
    return idMarca ? todos.filter((m) => String(m.id_marca_vehiculo) === idMarca) : todos;
  }
  if (seg[0] === "vehiculos-modelos" && seg.length === 1 && method === "POST") {
    return colInsertar("vehiculos_modelos", body, "id_modelo_vehiculo");
  }
  if (seg[0] === "vehiculos-modelos" && seg.length === 2) {
    const idModelo = parseInt(seg[1], 10);
    if (method === "PUT") return colActualizar("vehiculos_modelos", idModelo, body);
    if (method === "DELETE") { await colEliminar("vehiculos_modelos", idModelo); return null; }
  }
  if (seg[0] === "refacciones-subcategorias" && method === "GET") {
    const todos = await colGetAll("refacciones_subcategorias");
    const idCategoria = params.get("id_categoria_refaccion");
    return idCategoria ? todos.filter((s) => String(s.id_categoria_refaccion) === idCategoria) : todos;
  }
  if (seg[0] === "refacciones-subcategorias" && seg.length === 1 && method === "POST") {
    return colInsertar("refacciones_subcategorias", body, "id_subcategoria_refaccion");
  }
  if (seg[0] === "refacciones-subcategorias" && seg.length === 2) {
    const idSub = parseInt(seg[1], 10);
    if (method === "PUT") return colActualizar("refacciones_subcategorias", idSub, body);
    if (method === "DELETE") { await colEliminar("refacciones_subcategorias", idSub); return null; }
  }

  // ---------------- USUARIOS (para selects de "responsable") ----------------
  if (seg[0] === "auth" && seg[1] === "me" && method === "GET") {
    // Usa los permisos de la última vez que hubo servidor (respeta el paquete contratado)
    let permisos = CATALOGO_PERMISOS.map((p) => p.clave);
    try {
      const guardado = await AsyncStorage.getItem("sm_permisos_cache");
      if (guardado) permisos = JSON.parse(guardado);
    } catch { /* sin caché: todos */ }
    return { username: "admin", nombre_completo: "Administrador General", rol: "Administrador General", permisos };
  }
  // Multi-taller: en modo local el celular trabaja con un solo taller
  if (seg[0] === "auth" && seg[1] === "talleres" && method === "GET") return [];
  if (seg[0] === "auth" && (seg[1] === "verificar-activacion" || seg[1] === "activar-taller") && method === "POST") {
    throw new Error("Para activar tu taller necesitas conexión con el servidor.");
  }
  if (seg[0] === "auth" && seg[1] === "seleccionar-taller" && method === "POST") {
    throw new Error("Para cambiar de taller necesitas conexión con el servidor.");
  }
  if (seg[0] === "auth" && seg[1] === "recuperar-password" && method === "POST") {
    return { detail: "En modo local no hay administrador que reciba el aviso. Pide a quien te dio el celular que revise tu usuario directamente." };
  }
  if (seg[0] === "auth" && seg[1] === "password" && method === "PUT") {
    if (body?.password_actual !== ADMIN_PASSWORD_DEFECTO_LOCAL && !(await isPasswordAdminCambiada())) {
      throw new Error("La contraseña actual no es correcta");
    }
    if (!body?.password_nueva || body.password_nueva.length < 6) {
      throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
    }
    await setPasswordAdminCambiada(true);
    return { status: "ok" };
  }

  // ---------------- DASHBOARD (calculado a partir de los datos locales) ----------------
  if (seg[0] === "dashboard" && seg[1] === "resumen") {
    const [servicios, clientes, vehiculos, refacciones] = await Promise.all([
      colGetAll("servicios"), colGetAll("clientes"), colGetAll("vehiculos"), colGetAll("refacciones"),
    ]);
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const serviciosEsteMes = servicios.filter((s) => s.fecha_entrada_servicio && new Date(s.fecha_entrada_servicio) >= inicioMes).length;
    const saldoPendienteTotal = servicios
      .filter((s) => s.status !== "cancelado")
      .map(agregarCostos)
      .filter((s) => !s.pagado)
      .reduce((acc, s) => acc + Math.max(s.costos.saldo_pendiente, 0), 0);
    return {
      total_clientes: clientes.length,
      total_vehiculos: vehiculos.length,
      servicios_abiertos: servicios.filter((s) => s.status === "abierto").length,
      servicios_este_mes: serviciosEsteMes,
      solicitudes_recuperacion_pendientes: 0,
      refacciones_bajo_stock: refacciones.filter((r) => (r.cantidad_refaccion ?? 0) <= (r.umbral_rojo ?? 1)).length,
      saldo_pendiente_clientes: Math.round(saldoPendienteTotal * 100) / 100,
      deuda_con_proveedores: Math.round((await colGetAll("proveedor_deudas")).reduce((a, d) => a + (Number(d.saldo_total) || 0), 0) * 100) / 100,
    };
  }
  if (seg[0] === "dashboard" && seg[1] === "proximos-servicios") return [];
  if (seg[0] === "dashboard" && seg[1] === "servicios-mensuales") {
    const servicios = await colGetAll("servicios");
    const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const hoy = new Date();
    const periodos = [];
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      periodos.push({ anio: fecha.getFullYear(), mes: fecha.getMonth() });
    }
    return periodos.map(({ anio, mes }) => {
      const delMes = servicios.filter((s) => {
        if (!s.fecha_entrada_servicio) return false;
        const f = new Date(s.fecha_entrada_servicio);
        return f.getFullYear() === anio && f.getMonth() === mes;
      });
      const ingresos = delMes.reduce((acc, s) => acc + agregarCostos(s).costos.total, 0);
      return { mes: `${MESES[mes]} ${anio}`, cantidad: delMes.length, ingresos: Math.round(ingresos * 100) / 100 };
    });
  }

  // ---------------- FOTOS (no implementado en modo local todavía) ----------------
  if (seg[0] === "fotos") {
    if (seg.length === 1 && method === "GET") {
      const tipo = params.get("entidad_tipo");
      const idEnt = params.get("entidad_id");
      return (await colGetAll("fotos")).filter((f) => (!tipo || f.entidad_tipo === tipo) && (!idEnt || String(f.entidad_id) === idEnt));
    }
    if (seg.length === 1 && method === "POST") {
      const archivo = body && body.get ? body.get("archivo") : null;
      if (!archivo || !archivo.uri) throw new Error("No llegó ninguna foto.");
      const base64 = await FileSystem.readAsStringAsync(archivo.uri, { encoding: FileSystem.EncodingType.Base64 });
      return colInsertar("fotos", {
        entidad_tipo: body.get("entidad_tipo"), entidad_id: Number(body.get("entidad_id")),
        ruta_archivo: `data:${archivo.type || "image/jpeg"};base64,${base64}`, fecha: new Date().toISOString(),
      }, "id_foto");
    }
    if (seg.length === 2 && method === "DELETE") { await colEliminar("fotos", parseInt(seg[1], 10)); return null; }
  }

  // Facturación: en modo local no hay timbrado (requiere el PAC), no hay facturas
  if (seg[0] === "facturacion") return method === "GET" ? [] : (() => { throw new Error("La facturación necesita conexión con el servidor."); })();

  // Inventario por vehículo (compatibilidades marca/modelo) — mismo contrato que
  // InventarioRefaccionIn/Out del backend: la fila trae refaccion, marca_refaccion,
  // proveedor y sus compatibilidades resueltas.
  if (seg[0] === "inventario-refacciones") {
    const completar = async (fila) => {
      if (!fila) return fila;
      const [refs, marcasRef, provs] = await Promise.all([colGetAll("refacciones"), colGetAll("refacciones_marcas"), colGetAll("proveedores")]);
      return {
        ...fila,
        refaccion: refs.find((r) => String(r.id_refaccion) === String(fila.id_refaccion)) || null,
        marca_refaccion: marcasRef.find((m) => String(m.id_marca_refaccion) === String(fila.id_marca_refaccion)) || null,
        proveedor: provs.find((x) => String(x.id_proveedor) === String(fila.id_proveedor)) || null,
        compatibilidades: fila.compatibilidades || [],
      };
    };
    const normalizar = (b) => ({
      ...b,
      id_refaccion: b.id_refaccion != null ? Number(b.id_refaccion) : undefined,
      cantidad: b.cantidad != null ? Number(b.cantidad) || 0 : undefined,
      preciopropio: b.preciopropio != null ? Number(b.preciopropio) || 0 : undefined,
      preciocliente: b.preciocliente != null ? Number(b.preciocliente) || 0 : undefined,
    });
    if (seg.length === 1 && method === "GET") {
      const filas = await colGetAll("inventario_refacciones");
      return Promise.all(filas.map(completar));
    }
    if (seg.length === 1 && method === "POST") {
      if (!body.id_refaccion) throw new Error("Elige la refacción.");
      const b = normalizar(body);
      const nuevo = await colInsertar("inventario_refacciones", {
        umbral_naranja: 4, umbral_rojo: 1, cantidad: 0, preciopropio: 0, preciocliente: 0, ...b, compatibilidades: [],
      }, "id_inventario_refaccion");
      return completar(nuevo);
    }
    if (seg.length === 2) {
      const idInv = parseInt(seg[1], 10);
      if (method === "GET") return completar(await colGetOne("inventario_refacciones", idInv));
      if (method === "PUT") return completar(await colActualizar("inventario_refacciones", idInv, normalizar(body)));
      if (method === "DELETE") { await colEliminar("inventario_refacciones", idInv); return null; }
    }
  }
  if (seg[0] === "inventario-refacciones-compatibilidades") {
    if (seg.length === 1 && method === "POST") {
      const idInv = Number(body.id_inventario_refaccion);
      const fila = await colGetOne("inventario_refacciones", idInv);
      if (!fila) throw new Error("Ese registro de inventario no existe.");
      const compat = {
        id_compatibilidad: nuevoId(),
        id_inventario_refaccion: idInv,
        id_marca_vehiculo: Number(body.id_marca_vehiculo),
        id_modelo_vehiculo: body.id_modelo_vehiculo != null ? Number(body.id_modelo_vehiculo) : null,
      };
      const lista = fila.compatibilidades || [];
      if (lista.some((c) => c.id_marca_vehiculo === compat.id_marca_vehiculo && c.id_modelo_vehiculo === compat.id_modelo_vehiculo)) {
        throw new Error("Esa compatibilidad ya está registrada.");
      }
      await colActualizar("inventario_refacciones", idInv, { compatibilidades: [...lista, compat] });
      return compat;
    }
    if (seg.length === 2 && method === "DELETE") {
      const idCompat = Number(seg[1]);
      for (const fila of await colGetAll("inventario_refacciones")) {
        if ((fila.compatibilidades || []).some((c) => Number(c.id_compatibilidad) === idCompat)) {
          await colActualizar("inventario_refacciones", fila.id_inventario_refaccion, {
            compatibilidades: fila.compatibilidades.filter((c) => Number(c.id_compatibilidad) !== idCompat),
          });
        }
      }
      return null;
    }
  }

  // ---------------- NO CUBIERTO TODAVÍA ----------------
  // citas, inspecciones, codigos-postales: se deja pendiente a propósito —
  // no forman parte del flujo principal (cliente → vehículo → orden →
  // cobro) que se necesitaba funcionando primero en modo local.
  // ---------------- USUARIOS, ROLES Y PERMISOS (mismo contrato que routers/auth.py y routers/roles.py) ----------------
  // /auth/usuarios… es lo que usa la web; /usuarios/ y /roles/ se conservan como alias.
  const rutaU = seg[0] === "auth" && ["usuarios", "roles", "permisos", "solicitudes-recuperacion"].includes(seg[1]) ? seg.slice(1) : seg;
  if (rutaU[0] === "permisos" || (rutaU[0] === "roles" && rutaU[1] === "permisos-disponibles")) {
    if (method === "GET") return CATALOGO_PERMISOS;
  }
  if (rutaU[0] === "solicitudes-recuperacion") {
    if (method === "GET") return [];
    throw new Error("En modo local no hay solicitudes de recuperación pendientes.");
  }
  if (rutaU[0] === "roles") {
    const roles = await rolesLocales();
    const idRol = rutaU[1] ? parseInt(rutaU[1], 10) : null;
    const validarPermisos = (claves = []) => {
      const faltantes = claves.filter((c) => !CATALOGO_PERMISOS.some((p) => p.clave === c));
      if (faltantes.length) throw new Error(`Permiso(s) no reconocido(s): ${faltantes.sort().join(", ")}`);
      return claves;
    };
    if (!idRol && method === "GET") return roles;
    if (!idRol && method === "POST") {
      if (roles.some((r) => r.nombre === body.nombre)) throw new Error("Ya existe un rol con ese nombre.");
      const nuevo = await colInsertar("roles", { nombre: body.nombre, descripcion: body.descripcion ?? null, es_sistema: false, permisos: validarPermisos(body.permisos || []) }, "id_rol");
      return resolverRol(nuevo);
    }
    const rol = roles.find((r) => r.id_rol === idRol);
    if (idRol && !rol) throw new Error("Rol no encontrado.");
    if (idRol && method === "PUT") {
      const cambios = {};
      if (body.nombre !== undefined) cambios.nombre = body.nombre;
      if (body.descripcion !== undefined) cambios.descripcion = body.descripcion;
      if (body.permisos !== undefined && body.permisos !== null) cambios.permisos = validarPermisos(body.permisos);
      return resolverRol(await colActualizar("roles", idRol, cambios));
    }
    if (idRol && method === "DELETE") {
      if (rol.es_sistema) throw new Error("Los roles base del sistema no se pueden eliminar.");
      if ((await colGetAll("usuarios_cuentas")).some((u) => u.id_rol === idRol)) throw new Error("Hay usuarios con este rol — reasígnalos antes de eliminarlo.");
      await colEliminar("roles", idRol);
      return null;
    }
  }
  if (rutaU[0] === "usuarios") {
    const roles = await rolesLocales();
    const conRol = (u) => { if (!u) return u; const { password, ...resto } = u; return { ...resto, rol: roles.find((r) => r.id_rol === u.id_rol) || null }; };
    const idUsuario = rutaU[1] ? parseInt(rutaU[1], 10) : null;
    if (!idUsuario && method === "GET") {
      const lista = await colGetAll("usuarios_cuentas");
      return lista.sort((a, b) => String(a.username).localeCompare(String(b.username))).map(conRol);
    }
    if (!idUsuario && method === "POST") {
      if (!roles.some((r) => r.id_rol === Number(body.id_rol))) throw new Error("El rol indicado no existe");
      if ((await colGetAll("usuarios_cuentas")).some((u) => u.username === body.username)) throw new Error("Ese nombre de usuario ya existe");
      const { password, ...datos } = body;
      return conRol(await colInsertar("usuarios_cuentas", { ...datos, id_rol: Number(datos.id_rol), activo: true }, "id_usuario"));
    }
    if (idUsuario && !(await colGetOne("usuarios_cuentas", idUsuario))) throw new Error("Usuario no encontrado");
    if (idUsuario && rutaU[2] === "desactivar" && method === "PUT") return conRol(await colActualizar("usuarios_cuentas", idUsuario, { activo: false }));
    if (idUsuario && !rutaU[2] && method === "PUT") {
      const { password, ...cambios } = body;
      if (cambios.id_rol !== undefined && !roles.some((r) => r.id_rol === Number(cambios.id_rol))) throw new Error("El rol indicado no existe");
      if (cambios.id_rol !== undefined) cambios.id_rol = Number(cambios.id_rol);
      return conRol(await colActualizar("usuarios_cuentas", idUsuario, cambios));
    }
    if (idUsuario && method === "DELETE") { await colEliminar("usuarios_cuentas", idUsuario); return null; }
  }

  // ---------------- INSPECCIONES ----------------
  const ITEMS_INSPECCION_LOCAL = {
    "Llantas": ["Presión y/o sensor de presión"],
    "Frenos": ["Balatas delanteras", "Balatas traseras", "Líquido de frenos"],
    "Luces": ["Faros delanteros", "Luces traseras", "Direccionales", "Luz de freno", "Luz de reversa"],
    "Fluidos": ["Nivel de aceite de motor", "Anticongelante/refrigerante", "Líquido limpiaparabrisas", "Líquido de dirección hidráulica"],
    "Batería y eléctrico": ["Batería (carga y terminales)", "Alternador", "Marcha"],
    "Suspensión y dirección": ["Amortiguadores delanteros", "Amortiguadores traseros", "Rótulas y terminales"],
    "Carrocería": ["Limpiaparabrisas", "Espejos", "Cinturones de seguridad"],
  };
  if (seg[0] === "inspecciones" && seg.length === 2 && seg[1] === "items" && method === "GET") {
    let idItem = 1;
    const items = [];
    for (const categoria of Object.keys(ITEMS_INSPECCION_LOCAL)) {
      for (const nombre_item of ITEMS_INSPECCION_LOCAL[categoria]) {
        items.push({ id_item: idItem, categoria, nombre_item, orden: idItem, activo: true });
        idItem++;
      }
    }
    return items;
  }
  if (seg[0] === "inspecciones" && seg[1] !== "items") {
    if (seg.length === 1 && method === "GET") {
      let lista = await colGetAll("inspecciones");
      const idServicio = params.get("id_servicio");
      const idVehiculo = params.get("id_vehiculo");
      if (idServicio) lista = lista.filter((i) => String(i.id_servicio) === idServicio);
      if (idVehiculo) lista = lista.filter((i) => String(i.id_vehiculo) === idVehiculo);
      return lista.sort((a, b) => b.id_inspeccion - a.id_inspeccion);
    }
    if (seg.length === 1 && method === "POST") {
      const itemsCatalogo = await solicitudLocal("/inspecciones/items", "GET");
      const resultados = (body.resultados || []).map((r, i) => ({
        id_resultado: i + 1, ...r, item: itemsCatalogo.find((it) => it.id_item === r.id_item) || null,
      }));
      return colInsertar("inspecciones", { ...body, resultados, fecha_inspeccion: new Date().toISOString() }, "id_inspeccion");
    }
    if (seg.length === 2) {
      const idInsp = parseInt(seg[1], 10);
      if (method === "GET") return colGetOne("inspecciones", idInsp);
      if (method === "PUT") {
        const cuerpo = { ...body };
        if (cuerpo.resultados) {
          const itemsCatalogo = await solicitudLocal("/inspecciones/items", "GET");
          cuerpo.resultados = cuerpo.resultados.map((r, i) => ({
            id_resultado: i + 1, ...r, item: itemsCatalogo.find((it) => it.id_item === r.id_item) || null,
          }));
        }
        return colActualizar("inspecciones", idInsp, cuerpo);
      }
    }
  }

  if (seg[0] === "citas" || seg[0] === "inspecciones") {
    return method === "GET" ? [] : { ok: true };
  }
  if (seg[0] === "codigos-postales" && seg.length === 2) {
    const fila = CODIGOS_POSTALES[seg[1]];
    if (!fila) throw new Error("No se encontró ese código postal en el catálogo cargado (por ahora solo León, GTO).");
    const [estado, municipio, ciudad, colonias] = fila;
    return { cp: seg[1], estado, municipio, ciudad, colonias };
  }

  throw new Error(`Modo local: el endpoint "${method} ${path}" todavía no tiene equivalente local.`);
}

// ---- Stock: mismo criterio que backend/app/routers/servicios.py ----
async function descontarStock(servicio, idRefaccion, cantidad) {
  if (!idRefaccion) return null;
  const refaccion = await colGetOne("refacciones", Number(idRefaccion));
  if (!refaccion) throw new Error("La refacción indicada no existe");
  const vehiculo = await colGetOne("vehiculos", Number(servicio.id_vehiculo));
  if (vehiculo?.id_marca_vehiculo) {
    const filas = await colGetAll("inventario_refacciones");
    const inv = filas.find((r) => String(r.id_refaccion) === String(idRefaccion) && (r.compatibilidades || []).some((c) =>
      String(c.id_marca_vehiculo) === String(vehiculo.id_marca_vehiculo) && String(c.id_modelo_vehiculo) === String(vehiculo.id_modelo_vehiculo)));
    if (inv) {
      await colActualizar("inventario_refacciones", inv.id_inventario_refaccion, { cantidad: Math.max((inv.cantidad || 0) - cantidad, 0) });
      return inv.id_inventario_refaccion;
    }
  }
  await colActualizar("refacciones", refaccion.id_refaccion, { cantidad_refaccion: Math.max((refaccion.cantidad_refaccion || 0) - cantidad, 0) });
  return null;
}

async function regresarStock(detalle) {
  const cant = detalle.cantidad || 1;
  if (detalle.id_inventario_refaccion) {
    const inv = await colGetOne("inventario_refacciones", Number(detalle.id_inventario_refaccion));
    if (inv) await colActualizar("inventario_refacciones", inv.id_inventario_refaccion, { cantidad: (inv.cantidad || 0) + cant });
  } else if (detalle.id_refaccion) {
    const ref = await colGetOne("refacciones", Number(detalle.id_refaccion));
    if (ref) await colActualizar("refacciones", ref.id_refaccion, { cantidad_refaccion: (ref.cantidad_refaccion || 0) + cant });
  }
}

// Una misma refacción no se repite: se suman cantidad e importes en el primer renglón
function consolidarRefacciones(detalles, campoId) {
  const salida = [];
  const vistos = {};
  for (const d of detalles) {
    if (!d.id_refaccion) { salida.push(d); continue; }
    const clave = `${d.id_refaccion}|${d.id_inventario_refaccion ?? ""}`;
    const base = vistos[clave];
    if (!base) { vistos[clave] = { ...d }; salida.push(vistos[clave]); continue; }
    base.cantidad = (base.cantidad || 1) + (d.cantidad || 1);
    base.costo_mano_obra = (Number(base.costo_mano_obra) || 0) + (Number(d.costo_mano_obra) || 0);
    base.costo_refaccion = (Number(base.costo_refaccion) || 0) + (Number(d.costo_refaccion) || 0);
    base.costo_extra = (Number(base.costo_extra) || 0) + (Number(d.costo_extra) || 0);
    base._pendienteSubir = true;
  }
  return salida.map((d) => (campoId in d ? d : d));
}

// Relaciones que el backend real resuelve con JOIN (cliente, vehículo con
// marca/modelo/color) — las pantallas leen servicio.cliente.nombre_cliente, etc.
async function contextoRelaciones() {
  const [clientes, vehiculos, marcas, modelos, colores] = await Promise.all([
    colGetAll("clientes"), colGetAll("vehiculos"), colGetAll("vehiculos_marcas"),
    colGetAll("vehiculos_modelos"), colGetAll("colores_vehiculos"),
  ]);
  return { clientes, vehiculos, marcas, modelos, colores };
}

const mismoId = (a, b) => a != null && b != null && String(a) === String(b);

function vehiculoCompleto(v, ctx) {
  if (!v) return v;
  return {
    ...v,
    marca: ctx.marcas.find((m) => mismoId(m.id_marca_vehiculo, v.id_marca_vehiculo)) || v.marca || null,
    modelo: ctx.modelos.find((m) => mismoId(m.id_modelo_vehiculo, v.id_modelo_vehiculo)) || v.modelo || null,
    color: ctx.colores.find((c) => mismoId(c.id_color, v.id_color)) || v.color || null,
    cliente: ctx.clientes.find((c) => mismoId(c.id_cliente, v.id_cliente)) || v.cliente || null,
  };
}

function servicioCompleto(s, ctx) {
  if (!s) return s;
  const cliente = ctx.clientes.find((c) => mismoId(c.id_cliente, s.id_cliente)) || s.cliente || null;
  const vehiculo = vehiculoCompleto(ctx.vehiculos.find((v) => mismoId(v.id_vehiculo, s.id_vehiculo)), ctx) || s.vehiculo || null;
  const historial_etapas = (s.historial_etapas || []).map((h, i) => (h.id_registro ? h : { ...h, id_registro: `${s.id_servicio}-${i}` }));
  return agregarCostos({ ...s, cliente, vehiculo, historial_etapas });
}

function agregarCostos(servicio) {
  if (!servicio) return servicio;
  const detalles = servicio.detalles || [];
  const r2 = (n) => Math.round(n * 100) / 100;
  const ivaPorcentaje = servicio.iva_porcentaje ?? 0;
  const subtotal = r2(detalles.reduce((acc, d) => acc + (Number(d.costo_mano_obra) || 0) + (Number(d.costo_refaccion) || 0) + (Number(d.costo_extra) || 0), 0));
  const iva = r2(subtotal * (ivaPorcentaje / 100));
  const total = r2(subtotal + iva);
  const abonos = (servicio.abonos || []).map((a, i) => ({ numero_abono: i + 1, ...a }));
  const totalAbonado = r2(abonos.reduce((acc, a) => acc + (Number(a.monto_abono) || 0), 0));
  const saldo = r2(total - totalAbonado);
  return {
    ...servicio,
    abonos,
    iva_porcentaje: ivaPorcentaje,
    // Se calcula siempre: si una orden pagada se reabre y se le agregan cargos, deja de estar pagada
    pagado: total > 0 && saldo <= 0.005,
    costos: { subtotal, iva, total, total_abonado: totalAbonado, saldo_pendiente: saldo },
  };
}
