const TOKEN_KEY = "sm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  cacheGet.clear(); // otra sesión u otro taller: nada de lo guardado le pertenece
}

// --- Menos peticiones --------------------------------------------------------
// Catálogos que casi nunca cambian: se guardan unos minutos en memoria para no pedirlos en cada pantalla.
// Cualquier alta/edición/baja sobre el mismo catálogo borra su copia. Además, si la misma consulta
// ya está en vuelo, se reutiliza en lugar de repetirla.
const CATALOGOS = ["/vehiculos-marcas/", "/vehiculos-modelos/", "/refacciones-marcas/", "/refacciones-categorias/", "/colores-vehiculos/", "/tipos-servicio/", "/estados/", "/ciudades/", "/paises/"];
const VIGENCIA_MS = 5 * 60 * 1000;
const cacheGet = new Map(); // ruta -> { t, datos } | { enVuelo }
const base = (path) => path.split("?")[0];
const esCatalogo = (path) => CATALOGOS.includes(base(path));
const copia = (d) => (typeof structuredClone === "function" ? structuredClone(d) : JSON.parse(JSON.stringify(d)));
function invalidar(path) {
  const b = base(path).replace(/\/\d+\/?$/, "/");
  for (const k of cacheGet.keys()) if (base(k).startsWith(b)) cacheGet.delete(k);
}
function pedirConCache(path) {
  // Solo los catálogos (listas chicas) pasan por el caché; todo lo demás va directo, sin copiar nada
  if (!esCatalogo(path)) return request(path);
  const guardado = cacheGet.get(path);
  if (guardado?.enVuelo) return guardado.enVuelo.then(copia);
  if (guardado && Date.now() - guardado.t < VIGENCIA_MS) return Promise.resolve(copia(guardado.datos));
  const promesa = request(path);
  cacheGet.set(path, { enVuelo: promesa, t: 0 });
  return promesa.then(
    (datos) => { cacheGet.set(path, { t: Date.now(), datos: copia(datos) }); return datos; },
    (err) => { cacheGet.delete(path); throw err; },
  );
}

const escribir = (path, opciones) => request(path, opciones).finally(() => invalidar(path));

export const api = {
  get: (path) => pedirConCache(path),
  post: (path, body) => escribir(path, { method: "POST", body }),
  postForm: (path, formData) => escribir(path, { method: "POST", body: formData, isForm: true }),
  put: (path, body) => escribir(path, { method: "PUT", body }),
  del: (path) => escribir(path, { method: "DELETE" }),
};

export async function login(username, password) {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  const res = await fetch("/api/auth/login", { method: "POST", body: form });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // sin cuerpo de respuesta (ej. el servidor se reinició a medio camino)
  }
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.detail || "No se pudo iniciar sesión. Intenta de nuevo.");
  }
  setToken(data.access_token);
  return data;
}
