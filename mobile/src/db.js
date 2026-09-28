import * as SQLite from "expo-sqlite";
import {
  VERSION_CATALOGOS, TIPOS_SERVICIO, COLORES, CATEGORIAS_REFACCION, ESTADOS_MEXICO,
  CIUDADES_POR_ESTADO, MARCAS_VEHICULO, MODELOS_VEHICULO,
} from "./catalogosBase";

// Base de datos LOCAL en el celular (SQLite) — vive en el propio dispositivo,
// sin depender de conexión. La sincronización con el servidor (sync.js) es
// la que la mantiene al día, pero la app puede leer de aquí sin internet.
//
// Alcance de esta primera versión: guarda una COPIA de lectura de clientes,
// vehículos, servicios (con sus conceptos/detalles) y refacciones — lo
// necesario para ver el trabajo del taller sin señal. La sincronización es
// de servidor → celular (para ver datos offline); guardar cambios hechos
// SIN conexión y subirlos después es un paso futuro, no esta primera versión.

// Una sola conexión compartida por toda la app. Se guarda la PROMESA (no la
// conexión ya abierta) para que si varias pantallas piden la base al mismo
// tiempo, todas esperen la misma apertura en lugar de abrir conexiones
// paralelas (eso provocaba "NativeDatabase.prepareAsync ... NullPointerException").
// Vive en globalThis para sobrevivir a las recargas en caliente de Metro.
const LLAVE_GLOBAL = "__aldmDbPromise";

export function getDb() {
  if (!globalThis[LLAVE_GLOBAL]) {
    globalThis[LLAVE_GLOBAL] = abrirBase().catch((err) => {
      globalThis[LLAVE_GLOBAL] = null; // permite reintentar en la siguiente llamada
      throw err;
    });
  }
  return globalThis[LLAVE_GLOBAL];
}

async function abrirBase() {
  const db = await SQLite.openDatabaseAsync("sistema_mecanico_local.db");
  await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY,
        nombre_cliente TEXT,
        paterno_cliente TEXT,
        materno_cliente TEXT,
        telefono1_cliente TEXT,
        correo_cliente TEXT,
        actualizado_en TEXT
      );

      CREATE TABLE IF NOT EXISTS vehiculos (
        id INTEGER PRIMARY KEY,
        id_cliente INTEGER,
        placas_vehiculo TEXT,
        marca TEXT,
        modelo TEXT,
        anio TEXT,
        color TEXT,
        actualizado_en TEXT
      );

      CREATE TABLE IF NOT EXISTS servicios (
        id INTEGER PRIMARY KEY,
        id_cliente INTEGER,
        id_vehiculo INTEGER,
        nombre_servicio TEXT,
        status TEXT,
        etapa TEXT,
        fecha_ingreso TEXT,
        datos_json TEXT,
        actualizado_en TEXT
      );

      CREATE TABLE IF NOT EXISTS refacciones (
        id INTEGER PRIMARY KEY,
        nombre_refaccion TEXT,
        categoria TEXT,
        subcategoria TEXT,
        cantidad_refaccion INTEGER,
        actualizado_en TEXT
      );

      CREATE TABLE IF NOT EXISTS meta (
        clave TEXT PRIMARY KEY,
        valor TEXT
      );

      CREATE TABLE IF NOT EXISTS colecciones (
        coleccion TEXT NOT NULL,
        id INTEGER NOT NULL,
        datos_json TEXT NOT NULL,
        PRIMARY KEY (coleccion, id)
      );
  `);
  try {
    await sembrarDatosIniciales(db);
  } catch (err) {
    // La siembra es solo para no arrancar vacío; si falla no debe tumbar la base.
    console.warn("No se pudieron sembrar datos iniciales:", err?.message);
  }
  return db;
}

// ---- Metadatos (última sincronización, etc.) ----

export async function getMeta(clave) {
  const db = await getDb();
  const fila = await db.getFirstAsync("SELECT valor FROM meta WHERE clave = ?", [clave]);
  return fila ? fila.valor : null;
}

export async function setMeta(clave, valor) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
    [clave, valor]
  );
}

export async function getUltimaSincronizacion() {
  return getMeta("ultima_sincronizacion");
}

// ---- Reemplazo completo de cada tabla al sincronizar ----
// Se borra e inserta de nuevo en cada sync: para el tamaño de datos de un
// taller (cientos de registros, no millones) es simple y confiable, sin
// tener que resolver qué cambió registro por registro.

export async function reemplazarClientes(lista) {
  const db = await getDb();
  const ahora = new Date().toISOString();
  await db.execAsync("DELETE FROM clientes");
  for (const c of lista) {
    await db.runAsync(
      `INSERT INTO clientes (id, nombre_cliente, paterno_cliente, materno_cliente, telefono1_cliente, correo_cliente, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.id_cliente, c.nombre_cliente, c.paterno_cliente, c.materno_cliente, c.telefono1_cliente, c.correo_cliente, ahora]
    );
  }
}

export async function reemplazarVehiculos(lista) {
  const db = await getDb();
  const ahora = new Date().toISOString();
  await db.execAsync("DELETE FROM vehiculos");
  for (const v of lista) {
    await db.runAsync(
      `INSERT INTO vehiculos (id, id_cliente, placas_vehiculo, marca, modelo, anio, color, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.id_vehiculo, v.id_cliente, v.placas_vehiculo, v.marca, v.modelo, v.anio, v.color, ahora]
    );
  }
}

export async function reemplazarServicios(lista) {
  const db = await getDb();
  const ahora = new Date().toISOString();
  await db.execAsync("DELETE FROM servicios");
  for (const s of lista) {
    await db.runAsync(
      `INSERT INTO servicios (id, id_cliente, id_vehiculo, nombre_servicio, status, etapa, fecha_ingreso, datos_json, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id_servicio, s.id_cliente, s.id_vehiculo, s.nombre_servicio, s.status, s.etapa || null, s.fecha_ingreso_servicio || null, JSON.stringify(s), ahora]
    );
  }
}

export async function reemplazarRefacciones(lista) {
  const db = await getDb();
  const ahora = new Date().toISOString();
  await db.execAsync("DELETE FROM refacciones");
  for (const r of lista) {
    await db.runAsync(
      `INSERT INTO refacciones (id, nombre_refaccion, categoria, subcategoria, cantidad_refaccion, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [r.id_refaccion, r.nombre_refaccion, r.categoria, r.subcategoria, r.cantidad_refaccion, ahora]
    );
  }
}

// ---- Lecturas locales (para cuando no hay internet) ----

export async function leerClientesLocal() {
  const db = await getDb();
  return db.getAllAsync("SELECT * FROM clientes ORDER BY nombre_cliente");
}

export async function leerVehiculosLocal(idCliente) {
  const db = await getDb();
  if (idCliente) return db.getAllAsync("SELECT * FROM vehiculos WHERE id_cliente = ?", [idCliente]);
  return db.getAllAsync("SELECT * FROM vehiculos");
}

export async function leerServiciosLocal() {
  const db = await getDb();
  const filas = await db.getAllAsync("SELECT * FROM servicios ORDER BY id DESC");
  return filas.map((f) => JSON.parse(f.datos_json));
}

export async function leerRefaccionesLocal() {
  const db = await getDb();
  return db.getAllAsync("SELECT * FROM refacciones ORDER BY nombre_refaccion");
}

export async function contarRegistrosLocal() {
  const db = await getDb();
  const [c, v, s, r] = await Promise.all([
    db.getFirstAsync("SELECT COUNT(*) as n FROM clientes"),
    db.getFirstAsync("SELECT COUNT(*) as n FROM vehiculos"),
    db.getFirstAsync("SELECT COUNT(*) as n FROM servicios"),
    db.getFirstAsync("SELECT COUNT(*) as n FROM refacciones"),
  ]);
  return { clientes: c.n, vehiculos: v.n, servicios: s.n, refacciones: r.n };
}

// =====================================================================
// Motor genérico de "colecciones" — usado por apiLocal.js para que la app
// funcione completa en modo local (MODO_LOCAL = true en localMode.js) sin
// tener que crear una tabla SQL distinta por cada tipo de dato. Cada
// colección (clientes, vehiculos, servicios, refacciones, empleados,
// proveedores, herramientas, citas, inspecciones, catálogos...) guarda sus
// registros como JSON, con un id autonumérico propio de la colección.
// =====================================================================

export async function colGetAll(coleccion) {
  const db = await getDb();
  const filas = await db.getAllAsync("SELECT datos_json FROM colecciones WHERE coleccion = ? ORDER BY id", [coleccion]);
  return filas.map((f) => JSON.parse(f.datos_json));
}

export async function colGetOne(coleccion, id) {
  const db = await getDb();
  const fila = await db.getFirstAsync("SELECT datos_json FROM colecciones WHERE coleccion = ? AND id = ?", [coleccion, id]);
  return fila ? JSON.parse(fila.datos_json) : null;
}

async function colSiguienteId(coleccion) {
  const db = await getDb();
  const fila = await db.getFirstAsync("SELECT MAX(id) as maxId FROM colecciones WHERE coleccion = ?", [coleccion]);
  return (fila && fila.maxId ? fila.maxId : 0) + 1;
}

export async function colInsertar(coleccion, datosSinId, campoId) {
  const db = await getDb();
  const nuevoId = await colSiguienteId(coleccion);
  // _pendienteSubir: "crear" = registro nuevo, todavía no existe en el
  // servidor. "actualizar" = ya existe en el servidor pero se editó en
  // local. subirPendientes.js usa esto para saber si mandar POST o PUT.
  const registro = { ...datosSinId, [campoId]: nuevoId, _pendienteSubir: "crear" };
  await db.runAsync("INSERT INTO colecciones (coleccion, id, datos_json) VALUES (?, ?, ?)", [coleccion, nuevoId, JSON.stringify(registro)]);
  return registro;
}

// Se llama tras subir un registro al servidor con éxito: lo vuelve a
// guardar bajo el ID real que asignó el servidor (borra el local viejo,
// inserta con el id nuevo) y le quita la marca de pendiente.
export async function colRenumerarTrasSubida(coleccion, idLocalViejo, registroDelServidor, campoId) {
  const db = await getDb();
  const limpio = { ...registroDelServidor };
  delete limpio._pendienteSubir;
  await db.runAsync("DELETE FROM colecciones WHERE coleccion = ? AND id = ?", [coleccion, idLocalViejo]);
  await db.runAsync("INSERT INTO colecciones (coleccion, id, datos_json) VALUES (?, ?, ?)", [coleccion, limpio[campoId], JSON.stringify(limpio)]);
  return limpio;
}

export async function colPendientes(coleccion) {
  const todos = await colGetAll(coleccion);
  return todos.filter((r) => r._pendienteSubir);
}

export async function colContarPendientes() {
  const db = await getDb();
  const filas = await db.getAllAsync("SELECT coleccion, datos_json FROM colecciones");
  return filas.filter((f) => {
    try { return JSON.parse(f.datos_json)._pendienteSubir; } catch { return false; }
  }).length;
}

export async function colActualizar(coleccion, id, cambios) {
  const actual = await colGetOne(coleccion, id);
  if (!actual) return null;
  // Si ya estaba marcado "crear" (nunca se subió), se queda así — sigue
  // siendo un registro que solo existe en local. Si no, se marca
  // "actualizar" para que se suba el cambio la próxima vez que se sincronice.
  const marca = actual._pendienteSubir === "crear" ? "crear" : "actualizar";
  const actualizado = { ...actual, ...cambios, _pendienteSubir: marca };
  const db = await getDb();
  await db.runAsync("UPDATE colecciones SET datos_json = ? WHERE coleccion = ? AND id = ?", [JSON.stringify(actualizado), coleccion, id]);
  return actualizado;
}

export async function colReemplazarCompleto(coleccion, id, registroCompleto) {
  const db = await getDb();
  await db.runAsync("UPDATE colecciones SET datos_json = ? WHERE coleccion = ? AND id = ?", [JSON.stringify(registroCompleto), coleccion, id]);
  return registroCompleto;
}

export async function colEliminar(coleccion, id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM colecciones WHERE coleccion = ? AND id = ?", [coleccion, id]);
}

// Siembra inicial — para que la app no arranque completamente vacía la
// primera vez que se instala el APK en modo local. Solo se corre si la
// colección todavía no tiene nada (no pisa datos ya capturados).
// Recibe la conexión directamente (no llama a getDb) porque se ejecuta
// mientras la base se está abriendo. Cada registro se guarda con el id de su
// propio campo (id_usuario, id_marca, ...) — antes se usaba `r.id`, que no
// existe, y eso provocaba "NOT NULL constraint failed: colecciones.id".
async function sembrarSiVacio(db, coleccion, campoId, registros) {
  const fila = await db.getFirstAsync("SELECT COUNT(*) AS n FROM colecciones WHERE coleccion = ?", [coleccion]);
  if (fila && fila.n > 0) return;
  for (const r of registros) {
    await db.runAsync(
      "INSERT OR IGNORE INTO colecciones (coleccion, id, datos_json) VALUES (?, ?, ?)",
      [coleccion, r[campoId], JSON.stringify(r)]
    );
  }
}

// ---- Catálogos base (mismos que el backend: seed.py + CSV) ----
// Se fusionan POR NOMBRE: lo que el usuario ya capturó se respeta y solo se
// agrega lo que falta. Se corre una vez por versión de catálogos.

async function leerColeccion(db, coleccion) {
  const filas = await db.getAllAsync("SELECT id, datos_json FROM colecciones WHERE coleccion = ?", [coleccion]);
  return filas.map((f) => ({ idFila: f.id, ...JSON.parse(f.datos_json) }));
}

async function insertarLote(db, coleccion, registros, campoId) {
  // Inserción en bloques (mucho más rápida que una por una en el celular)
  for (let i = 0; i < registros.length; i += 150) {
    const bloque = registros.slice(i, i + 150);
    const marcas = bloque.map(() => "(?, ?, ?)").join(", ");
    const valores = bloque.flatMap((r) => [coleccion, r[campoId], JSON.stringify(r)]);
    await db.runAsync(`INSERT OR IGNORE INTO colecciones (coleccion, id, datos_json) VALUES ${marcas}`, valores);
  }
}

// items: [{ nombre, idPreferido?, extra? }] -> regresa { claveNormalizada: id }
async function fusionarPorNombre(db, coleccion, campoId, campoNombre, items, claveExtra = null) {
  const existentes = (await leerColeccion(db, coleccion)).filter((r) => r[campoId] != null);
  const clave = (nombre, extra) => `${claveExtra ? `${extra[claveExtra]}|` : ""}${String(nombre).trim().toLowerCase()}`;
  const mapa = {};
  const usados = new Set(existentes.map((r) => r[campoId]));
  existentes.forEach((r) => { mapa[clave(r[campoNombre], r)] = r[campoId]; });
  let siguiente = Math.max(0, ...usados) + 1;
  const nuevos = [];
  for (const it of items) {
    const extra = it.extra || {};
    const k = clave(it.nombre, extra);
    if (mapa[k] != null) continue;
    let id = it.idPreferido;
    if (id == null || usados.has(id)) id = siguiente;
    usados.add(id);
    siguiente = Math.max(siguiente, id + 1);
    mapa[k] = id;
    nuevos.push({ [campoId]: id, [campoNombre]: it.nombre, ...extra, activo: true });
  }
  if (nuevos.length) await insertarLote(db, coleccion, nuevos, campoId);
  return mapa;
}

async function sembrarDatosIniciales(db) {
  await sembrarSiVacio(db, "usuarios", "id_usuario", [
    { id_usuario: 1, username: "admin", nombre_usuario: "Administrador", rol: "Dueño", activo: true },
  ]);

  const version = await db.getFirstAsync("SELECT valor FROM meta WHERE clave = 'version_catalogos'");
  if (version && Number(version.valor) >= VERSION_CATALOGOS) return;

  await db.withTransactionAsync(async () => {
    // Una versión anterior sembraba marcas con el campo equivocado
    // (id_marca en lugar de id_marca_vehiculo) — se limpian esas filas.
    for (const r of await leerColeccion(db, "vehiculos_marcas")) {
      if (r.id_marca_vehiculo == null) await db.runAsync("DELETE FROM colecciones WHERE coleccion = 'vehiculos_marcas' AND id = ?", [r.idFila]);
    }

    await fusionarPorNombre(db, "tipos_servicio", "id_tipo_servicio", "nombre_tipo",
      TIPOS_SERVICIO.map((nombre, i) => ({ nombre, idPreferido: i + 1 })));
    await fusionarPorNombre(db, "colores_vehiculos", "id_color", "nombre_color",
      COLORES.map((nombre, i) => ({ nombre, idPreferido: i + 1 })));

    // Marcas y modelos de vehículo (79 marcas / 1008 modelos del CSV del backend)
    const mapaMarcas = await fusionarPorNombre(db, "vehiculos_marcas", "id_marca_vehiculo", "nombre_marca",
      MARCAS_VEHICULO.map(([id, nombre]) => ({ nombre, idPreferido: id })));
    const idMarcaReal = {};
    MARCAS_VEHICULO.forEach(([id, nombre]) => { idMarcaReal[id] = mapaMarcas[nombre.trim().toLowerCase()]; });
    await fusionarPorNombre(db, "vehiculos_modelos", "id_modelo_vehiculo", "nombre_modelo",
      MODELOS_VEHICULO.filter(([idMarca]) => idMarcaReal[idMarca]).map(([idMarca, nombre], i) => ({
        nombre, idPreferido: i + 1, extra: { id_marca_vehiculo: idMarcaReal[idMarca] },
      })), "id_marca_vehiculo");

    // Categorías y subcategorías de refacción
    const nombresCat = Object.keys(CATEGORIAS_REFACCION);
    const mapaCat = await fusionarPorNombre(db, "refacciones_categorias", "id_categoria_refaccion", "nombre_categoria",
      nombresCat.map((nombre, i) => ({ nombre, idPreferido: i + 1 })));
    const subcats = [];
    nombresCat.forEach((cat) => CATEGORIAS_REFACCION[cat].forEach((sub) => {
      subcats.push({ nombre: sub, extra: { id_categoria_refaccion: mapaCat[cat.toLowerCase()] } });
    }));
    await fusionarPorNombre(db, "refacciones_subcategorias", "id_subcategoria_refaccion", "nombre_subcategoria", subcats, "id_categoria_refaccion");

    // México, sus 32 estados y ciudades principales
    const mapaPais = await fusionarPorNombre(db, "paises", "id_pais", "nombre_pais", [{ nombre: "México", idPreferido: 1 }]);
    const idMexico = mapaPais["méxico"];
    const mapaEstados = await fusionarPorNombre(db, "estados", "id_estado", "nombre_estado",
      ESTADOS_MEXICO.map((nombre, i) => ({ nombre, idPreferido: i + 1, extra: { id_pais: idMexico } })));
    const ciudades = [];
    Object.entries(CIUDADES_POR_ESTADO).forEach(([estado, lista]) => lista.forEach((nombre) => {
      ciudades.push({ nombre, extra: { id_estado: mapaEstados[estado.toLowerCase()] } });
    }));
    await fusionarPorNombre(db, "ciudades", "id_ciudad", "nombre_ciudad", ciudades, "id_estado");

    await db.runAsync(
      "INSERT INTO meta (clave, valor) VALUES ('version_catalogos', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
      [String(VERSION_CATALOGOS)]
    );
  });
}
