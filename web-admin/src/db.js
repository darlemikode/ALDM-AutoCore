// Base de datos LOCAL del navegador (IndexedDB) — es el equivalente en web
// de la base SQLite que usa la app del celular: vive en la propia
// computadora/navegador, sin depender de conexión.
//
// Mismo alcance que en el celular: guarda una copia de lectura de
// clientes, vehículos, servicios y refacciones. La sincronización es
// servidor → navegador (para poder ver datos si se cae el internet);
// guardar cambios hechos sin conexión y subirlos después es un paso futuro.

const NOMBRE_DB = "sistema_mecanico_local";
const VERSION_DB = 1;
const TIENDAS = ["clientes", "vehiculos", "servicios", "refacciones", "meta"];

let dbPromise = null;

export function abrirDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      TIENDAS.forEach((nombre) => {
        if (!db.objectStoreNames.contains(nombre)) {
          const keyPath = nombre === "meta" ? "clave" : "id";
          db.createObjectStore(nombre, { keyPath });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function conTienda(nombreTienda, modo, fn) {
  return abrirDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(nombreTienda, modo);
        const store = tx.objectStore(nombreTienda);
        const resultado = fn(store);
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = () => reject(tx.error);
      })
  );
}

function pedirTodo(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function pedirUno(store, clave) {
  return new Promise((resolve, reject) => {
    const req = store.get(clave);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Metadatos (última sincronización) ----

export async function getMeta(clave) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get(clave);
    req.onsuccess = () => resolve(req.result ? req.result.valor : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(clave, valor) {
  return conTienda("meta", "readwrite", (store) => store.put({ clave, valor }));
}

export async function getUltimaSincronizacion() {
  return getMeta("ultima_sincronizacion");
}

// ---- Reemplazo completo de cada tienda al sincronizar ----
// Igual que en el celular: se borra todo y se vuelve a llenar en cada
// sync — simple y confiable para el tamaño de datos de un taller.

async function reemplazarTienda(nombreTienda, lista, idField) {
  const db = await abrirDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(nombreTienda, "readwrite");
    const store = tx.objectStore(nombreTienda);
    store.clear();
    lista.forEach((item) => {
      store.put({ ...item, id: item[idField] });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function reemplazarClientes(lista) {
  return reemplazarTienda("clientes", lista, "id_cliente");
}
export function reemplazarVehiculos(lista) {
  return reemplazarTienda("vehiculos", lista, "id_vehiculo");
}
export function reemplazarServicios(lista) {
  return reemplazarTienda("servicios", lista, "id_servicio");
}
export function reemplazarRefacciones(lista) {
  return reemplazarTienda("refacciones", lista, "id_refaccion");
}

// ---- Lecturas locales (para cuando no hay internet) ----

export function leerClientesLocal() {
  return conTienda("clientes", "readonly", pedirTodo);
}
export function leerVehiculosLocal() {
  return conTienda("vehiculos", "readonly", pedirTodo);
}
export function leerServiciosLocal() {
  return conTienda("servicios", "readonly", pedirTodo);
}
export function leerRefaccionesLocal() {
  return conTienda("refacciones", "readonly", pedirTodo);
}

export async function contarRegistrosLocal() {
  const [clientes, vehiculos, servicios, refacciones] = await Promise.all([
    leerClientesLocal(),
    leerVehiculosLocal(),
    leerServiciosLocal(),
    leerRefaccionesLocal(),
  ]);
  return {
    clientes: clientes.length,
    vehiculos: vehiculos.length,
    servicios: servicios.length,
    refacciones: refacciones.length,
  };
}
