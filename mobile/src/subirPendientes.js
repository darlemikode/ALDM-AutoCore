import { colPendientes, colRenumerarTrasSubida, colActualizar } from "./db";
import { API_URL } from "./config";

// Sube al servidor real lo que se creó/editó en modo local (ver
// localMode.js / apiLocal.js). Antes esto solo lo disparaba el usuario a
// mano ("Subir cambios pendientes" en Ajustes) porque en modo local la
// sesión guardada era falsa y no servía para autenticarse. Ahora que el
// modo local es automático (se prende solo al perder conexión, con la
// sesión real ya guardada de antes), autoSync.js llama subirPendientesConToken
// sola en cuanto vuelve a haber servidor, reusando esa misma sesión — ya
// no hace falta volver a escribir usuario/contraseña. El botón manual
// sigue aquí como respaldo (p. ej. si el token real ya venció).
//
// Orden importante: clientes → vehículos → servicios (con sus detalles y
// abonos) → refacciones. Cada colección depende de que la anterior ya
// tenga su ID real del servidor, por eso el orden no es arbitrario.
//
// Validación de integridad: antes de crear un cliente o vehículo nuevo se
// busca en el servidor si ya existe uno con el mismo teléfono/placas. Esto
// evita duplicados cuando una subida anterior sí llegó al servidor pero la
// respuesta se perdió por la caída de conexión (el registro local se quedó
// marcado como pendiente aunque el servidor ya lo tenía).
//
// Alcance de esta primera versión: cubre el flujo principal (cliente →
// vehículo → orden → detalle/abonos) y refacciones. Empleados, proveedores,
// herramientas y catálogos generales quedan para una siguiente vuelta,
// siguiendo este mismo patrón.

async function loginReal(username, password) {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) throw new Error("No se pudo iniciar sesión con el servidor real. Revisa usuario/contraseña y que el servidor esté prendido y accesible.");
  const data = await res.json();
  return data.access_token;
}

async function llamar(path, method, body, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status}: ${texto || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function limpiarCamposInternos(registro) {
  const { _pendienteSubir, ...limpio } = registro;
  return limpio;
}

// Busca en el servidor un registro que coincida por un dato "natural"
// (teléfono, placas) en vez de por ID — el ID local no significa nada para
// el servidor. Si algo coincide exacto, se usa ese en vez de crear otro.
async function buscarCoincidenciaExacta(path, valor, campoComparar, token) {
  if (!valor) return null;
  const resultado = await llamar(`${path}?q=${encodeURIComponent(valor)}`, "GET", undefined, token);
  const lista = Array.isArray(resultado) ? resultado : [];
  return lista.find((r) => (r[campoComparar] || "").trim().toLowerCase() === String(valor).trim().toLowerCase()) || null;
}

async function subirClientes(reporte, token) {
  const mapaIdCliente = {};
  const pendientes = await colPendientes("clientes");
  for (const c of pendientes) {
    const idLocal = c.id_cliente;
    const cuerpo = limpiarCamposInternos(c);
    delete cuerpo.id_cliente;
    try {
      let resultado;
      if (c._pendienteSubir === "crear") {
        const existente = await buscarCoincidenciaExacta("/clientes/", cuerpo.telefono1, "telefono1", token).catch(() => null);
        resultado = existente || (await llamar("/clientes/", "POST", cuerpo, token));
      } else {
        resultado = await llamar(`/clientes/${idLocal}`, "PUT", cuerpo, token);
      }
      const guardado = await colRenumerarTrasSubida("clientes", idLocal, resultado, "id_cliente");
      mapaIdCliente[idLocal] = guardado.id_cliente;
      reporte.clientes.subidos++;
    } catch (err) {
      reporte.clientes.errores.push({ idLocal, mensaje: err.message });
    }
  }
  return mapaIdCliente;
}

async function subirVehiculos(reporte, mapaIdCliente, clientesPendientesCrear, token) {
  const mapaIdVehiculo = {};
  const pendientes = await colPendientes("vehiculos");
  for (const v of pendientes) {
    const idLocal = v.id_vehiculo;
    const cuerpo = limpiarCamposInternos(v);
    delete cuerpo.id_vehiculo;
    // Si el cliente de este vehículo también era local y ya se subió,
    // aquí se traduce al ID real que le dio el servidor.
    if (mapaIdCliente[cuerpo.id_cliente] !== undefined) cuerpo.id_cliente = mapaIdCliente[cuerpo.id_cliente];
    // Integridad: si el cliente de este vehículo era un registro local
    // nuevo y su subida falló arriba, mandar este vehículo lo dejaría
    // apuntando a un id_cliente que no existe en el servidor. Se deja
    // pendiente para la próxima vuelta en vez de mandarlo así.
    if (clientesPendientesCrear.has(cuerpo.id_cliente) && mapaIdCliente[cuerpo.id_cliente] === undefined) {
      reporte.vehiculos.errores.push({ idLocal, mensaje: "Su cliente todavía no se pudo subir; se reintentará después." });
      continue;
    }
    try {
      let resultado;
      if (v._pendienteSubir === "crear") {
        const existente = await buscarCoincidenciaExacta("/vehiculos/", cuerpo.placas_vehiculo, "placas_vehiculo", token).catch(() => null);
        resultado = existente || (await llamar("/vehiculos/", "POST", cuerpo, token));
      } else {
        resultado = await llamar(`/vehiculos/${idLocal}`, "PUT", cuerpo, token);
      }
      const guardado = await colRenumerarTrasSubida("vehiculos", idLocal, resultado, "id_vehiculo");
      mapaIdVehiculo[idLocal] = guardado.id_vehiculo;
      reporte.vehiculos.subidos++;
    } catch (err) {
      reporte.vehiculos.errores.push({ idLocal, mensaje: err.message });
    }
  }
  return mapaIdVehiculo;
}

async function subirServicios(reporte, mapaIdCliente, mapaIdVehiculo, clientesPendientesCrear, vehiculosPendientesCrear, token) {
  const pendientes = await colPendientes("servicios");
  for (const s of pendientes) {
    const idLocal = s.id_servicio;
    const esNuevo = s._pendienteSubir === "crear";
    const cuerpo = limpiarCamposInternos(s);
    delete cuerpo.id_servicio;
    const detalles = cuerpo.detalles || [];
    const abonos = cuerpo.abonos || [];
    delete cuerpo.detalles;
    delete cuerpo.abonos;
    delete cuerpo.costos; // se recalcula solo en el servidor

    if (mapaIdCliente[cuerpo.id_cliente] !== undefined) cuerpo.id_cliente = mapaIdCliente[cuerpo.id_cliente];
    if (mapaIdVehiculo[cuerpo.id_vehiculo] !== undefined) cuerpo.id_vehiculo = mapaIdVehiculo[cuerpo.id_vehiculo];

    // Integridad: misma idea que en vehículos — si el cliente o el
    // vehículo de esta orden eran nuevos y no se pudieron subir, no se
    // manda la orden con una referencia que no existe en el servidor.
    if (
      (clientesPendientesCrear.has(cuerpo.id_cliente) && mapaIdCliente[cuerpo.id_cliente] === undefined) ||
      (vehiculosPendientesCrear.has(cuerpo.id_vehiculo) && mapaIdVehiculo[cuerpo.id_vehiculo] === undefined)
    ) {
      reporte.servicios.errores.push({ idLocal, mensaje: "Su cliente o vehículo todavía no se pudo subir; se reintentará después." });
      continue;
    }

    try {
      let servicioServidor;
      let idServidor;
      if (esNuevo) {
        servicioServidor = await llamar("/servicios/", "POST", cuerpo, token);
        idServidor = servicioServidor.id_servicio;
      } else {
        // La orden ya existe en el servidor con este mismo ID — solo se
        // manda el cambio de cabecera; sus detalles/abonos nuevos se
        // revisan aparte abajo, uno por uno.
        servicioServidor = await llamar(`/servicios/${idLocal}`, "PUT", cuerpo, token);
        idServidor = idLocal;
      }

      // Se sube CADA detalle/abono que todavía está marcado como
      // pendiente — sea porque la orden es nueva (todos lo están) o
      // porque se agregaron/editaron después de la primera subida.
      const detallesActualizados = [];
      for (const d of detalles) {
        if (!d._pendienteSubir) { detallesActualizados.push(d); continue; }
        const cuerpoDetalle = { ...d };
        delete cuerpoDetalle._pendienteSubir;
        delete cuerpoDetalle.id_servicio_detalle;
        delete cuerpoDetalle.id_servicio;
        try {
          const detalleServidor = await llamar(`/servicios/${idServidor}/detalles`, "POST", cuerpoDetalle, token);
          detallesActualizados.push(detalleServidor);
        } catch (err) {
          reporte.servicios.errores.push({ idLocal, mensaje: `Detalle no subido: ${err.message}` });
          detallesActualizados.push(d); // se queda pendiente, se reintenta la próxima vez
        }
      }
      const abonosActualizados = [];
      for (const a of abonos) {
        if (!a._pendienteSubir) { abonosActualizados.push(a); continue; }
        try {
          const abonoServidor = await llamar(`/servicios/${idServidor}/abonos`, "POST", { monto_abono: a.monto_abono, comentario: a.comentario || null }, token);
          abonosActualizados.push(abonoServidor);
        } catch (err) {
          reporte.servicios.errores.push({ idLocal, mensaje: `Abono no subido: ${err.message}` });
          abonosActualizados.push(a); // se queda pendiente, se reintenta la próxima vez
        }
      }

      await colRenumerarTrasSubida("servicios", idLocal, { ...servicioServidor, detalles: detallesActualizados, abonos: abonosActualizados }, "id_servicio");

      // Si algún detalle o abono no se pudo subir, la orden se vuelve a
      // marcar como pendiente — si no, la próxima "Subir pendientes" ya
      // no la revisaría, y ese detalle/abono se quedaría perdido para siempre.
      const quedaronPendientes = detallesActualizados.some((d) => d._pendienteSubir) || abonosActualizados.some((a) => a._pendienteSubir);
      if (quedaronPendientes) {
        await colActualizar("servicios", idServidor, {});
      }
      reporte.servicios.subidos++;
    } catch (err) {
      reporte.servicios.errores.push({ idLocal, mensaje: err.message });
    }
  }
}

async function subirRefacciones(reporte, token) {
  const pendientes = await colPendientes("refacciones");
  for (const r of pendientes) {
    const idLocal = r.id_refaccion;
    const cuerpo = limpiarCamposInternos(r);
    delete cuerpo.id_refaccion;
    try {
      let resultado;
      if (r._pendienteSubir === "crear") {
        resultado = await llamar("/refacciones/", "POST", cuerpo, token);
      } else {
        resultado = await llamar(`/refacciones/${idLocal}`, "PUT", cuerpo, token);
      }
      const guardado = await colRenumerarTrasSubida("refacciones", idLocal, resultado, "id_refaccion");
      reporte.refacciones.subidos++;
      void guardado;
    } catch (err) {
      reporte.refacciones.errores.push({ idLocal, mensaje: err.message });
    }
  }
}

function reporteVacio() {
  return {
    clientes: { subidos: 0, errores: [] },
    vehiculos: { subidos: 0, errores: [] },
    servicios: { subidos: 0, errores: [] },
    refacciones: { subidos: 0, errores: [] },
  };
}

// Usada por autoSync.js: ya se tiene un token real válido (la sesión con
// la que el usuario ya había iniciado sesión antes de perder la conexión),
// no hace falta volver a pedir usuario/contraseña.
export async function subirPendientesConToken(token) {
  const reporte = reporteVacio();
  // Se anota de antemano qué clientes/vehículos eran "crear" (nuevos, sin
  // ID real todavía) para poder detectar referencias huérfanas más abajo,
  // sin importar en qué orden hayan quedado tras la subida.
  const [clientesAntes, vehiculosAntes] = await Promise.all([colPendientes("clientes"), colPendientes("vehiculos")]);
  const clientesPendientesCrear = new Set(clientesAntes.filter((c) => c._pendienteSubir === "crear").map((c) => c.id_cliente));
  const vehiculosPendientesCrear = new Set(vehiculosAntes.filter((v) => v._pendienteSubir === "crear").map((v) => v.id_vehiculo));

  const mapaIdCliente = await subirClientes(reporte, token);
  const mapaIdVehiculo = await subirVehiculos(reporte, mapaIdCliente, clientesPendientesCrear, token);
  await subirServicios(reporte, mapaIdCliente, mapaIdVehiculo, clientesPendientesCrear, vehiculosPendientesCrear, token);
  await subirRefacciones(reporte, token);
  return reporte;
}

// Botón manual ("Subir cambios pendientes" en Ajustes) — se pide
// usuario/contraseña por si el token guardado ya venció.
export async function subirPendientes(username, password) {
  const token = await loginReal(username, password);
  return subirPendientesConToken(token);
}

export async function contarPendientesTotal() {
  const [clientes, vehiculos, servicios, refacciones] = await Promise.all([
    colPendientes("clientes"),
    colPendientes("vehiculos"),
    colPendientes("servicios"),
    colPendientes("refacciones"),
  ]);
  return clientes.length + vehiculos.length + servicios.length + refacciones.length;
}
