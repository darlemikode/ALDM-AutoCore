// Ayudantes compartidos: API del súper administrador (para preparar datos) y
// acciones comunes en el panel web.
const { expect, request } = require("@playwright/test");

const SUFIJO = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`.toUpperCase();
const API = () => process.env.API_URL.replace(/\/$/, "") + "/";

// Cliente de la API ya autenticado (por defecto como el admin / súper admin)
async function apiComo(usuario = "admin", password = process.env.E2E_PASSWORD) {
  const ctx = await request.newContext({ baseURL: API() });
  const r = await ctx.post("auth/login", { form: { username: usuario, password } });
  if (!r.ok()) throw new Error(`login ${usuario}: ${r.status()} ${await r.text()}`);
  const sesion = await r.json();
  const h = { Authorization: `Bearer ${sesion.access_token}` };
  const llamar = async (metodo, ruta, data) => {
    const res = await ctx.fetch(ruta.replace(/^\//, ""), { method: metodo, headers: h, data });
    const cuerpo = res.status() === 204 ? null : await res.json().catch(() => null);
    if (!res.ok()) throw new Error(`${metodo} ${ruta} -> ${res.status()} ${JSON.stringify(cuerpo)}`);
    return cuerpo;
  };
  return {
    sesion,
    get: (r) => llamar("GET", r),
    post: (r, d = {}) => llamar("POST", r, d),
    put: (r, d) => llamar("PUT", r, d),
    del: (r) => llamar("DELETE", r),
    cerrar: () => ctx.dispose(),
  };
}

async function paquete(sa, nombre) {
  const paquetes = await sa.get("/superadmin/paquetes");
  return nombre ? paquetes.find((p) => p.nombre === nombre) : paquetes.reduce((a, b) => (b.precio_mensual > a.precio_mensual ? b : a));
}

// Da de alta un taller con su administrador ya registrado (vía API)
async function crearTallerConAdmin(sa, { nombre, usuario, password = "secreto1", paqueteNombre } = {}) {
  const s = SUFIJO();
  const p = await paquete(sa, paqueteNombre);
  const taller = await sa.post("/superadmin/talleres", {
    nombre_comercial: nombre || `E2E Taller ${s}`, id_paquete: p.id_paquete, en_prueba: true,
    admin: { nombre_completo: `Admin ${s}`, username: usuario || `e2e_${s.toLowerCase()}`, password },
  });
  return { taller, usuario: usuario || `e2e_${s.toLowerCase()}`, password };
}

// Campo de un formulario del panel (etiqueta visible + su input)
const campo = (page, etiqueta) => page.locator(".field", { has: page.locator(`label:text-is("${etiqueta}")`) }).locator("input, select, textarea").first();

async function entrar(page, usuario, password, { conTutoriales = false } = {}) {
  // Las pruebas no quieren el recorrido de bienvenida encima (salvo la que lo prueba)
  if (!conTutoriales) await page.addInitScript(() => { try { localStorage.setItem("sm_sin_tutoriales", "1"); } catch (e) { /* nada */ } });
  await page.goto("/login");
  await campo(page, "Usuario").fill(usuario);
  await campo(page, "Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

// Entra y espera a que cargue el panel (antes de navegar a otra página)
async function entrarAlPanel(page, usuario, password) {
  await entrar(page, usuario, password);
  await expect(page.locator(".main")).toBeVisible();
}

async function entrarYElegirSiHaceFalta(page, usuario, password, nombreTaller) {
  await entrar(page, usuario, password);
  const selector = page.locator(".selector-taller");
  await expect(page.locator(".main, .selector-taller").first()).toBeVisible();
  if (await selector.isVisible()) {
    await selector.getByRole("button", { name: new RegExp(nombreTaller || ".") }).first().click();
  }
}

const tallerActual = (page) => page.locator(".taller-actual-nombre");
const enlaceMenu = (page, texto) => page.locator(".sidebar a.nav-link", { hasText: texto });

module.exports = { SUFIJO, apiComo, paquete, crearTallerConAdmin, campo, entrar, entrarAlPanel, entrarYElegirSiHaceFalta, tallerActual, enlaceMenu };
