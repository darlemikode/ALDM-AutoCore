// Paquetes: cada uno funciona con lo que incluye y no rompe pantallas de otro módulo.
const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

async function tallerCon(sa, paqueteNombre) {
  const T = await crearTallerConAdmin(sa, { paqueteNombre });
  return { T, api: await apiComo(T.usuario, T.password) };
}

test.describe("Paquetes y módulos", () => {
  test("Arranque: da de alta usuarios con los roles base, pero no edita roles", async () => {
    const sa = await apiComo();
    const { api } = await tallerCon(sa, "Arranque");
    const roles = await api.get("/auth/roles");
    expect(roles.map((r) => r.nombre)).toEqual(expect.arrayContaining(["Administrador General", "Técnico / Mecánico"]));
    expect((await api.get("/auth/permisos")).length).toBeGreaterThan(10);
    const tecnico = roles.find((r) => r.nombre.startsWith("Técnico"));
    const u = await api.post("/auth/usuarios", { username: `tec_${SUFIJO().toLowerCase()}`, password: "secreto1", nombre_completo: "Técnico Arranque", id_rol: tecnico.id_rol });
    expect(u.rol.id_rol).toBe(tecnico.id_rol);
    await expect(api.get("/roles/")).rejects.toThrow(/403/);
    await expect(api.post("/roles/", { nombre: "Personalizado", permisos: [] })).rejects.toThrow(/403/);
    await api.cerrar(); await sa.cerrar();
  });

  test("Taller Pro: incluye roles y permisos (crea un rol propio)", async () => {
    const sa = await apiComo();
    const { api } = await tallerCon(sa, "Taller Pro");
    expect((await api.get("/roles/")).length).toBeGreaterThan(0);
    const rol = await api.post("/roles/", { nombre: `Ayudante ${SUFIJO()}`, descripcion: "Prueba", permisos: ["servicios.ver"] });
    expect(rol.id_rol).toBeTruthy();
    await api.cerrar(); await sa.cerrar();
  });

  test("app móvil del taller: solo desde Taller Pro", async () => {
    const sa = await apiComo();
    const ar = await crearTallerConAdmin(sa, { paqueteNombre: "Arranque" });
    const pro = await crearTallerConAdmin(sa, { paqueteNombre: "Taller Pro" });
    const login = (T) => fetch(`${process.env.API_URL || "http://localhost:8000/api"}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-App": "taller" },
      body: new URLSearchParams({ username: T.usuario, password: T.password }).toString(),
    });
    const r1 = await login(ar);
    expect(r1.status).toBe(403);
    expect((await r1.json()).detail).toMatch(/Taller Pro/);
    expect((await login(pro)).status).toBe(200);
    // La web del plan Arranque sigue entrando normal
    const web = await apiComo(ar.usuario, ar.password);
    expect(Array.isArray(await web.get("/servicios/"))).toBe(true);
    await web.cerrar(); await sa.cerrar();
  });

  test("comisiones: cada taller tiene las suyas (antes solo el primero podía)", async () => {
    const sa = await apiComo();
    const a = await tallerCon(sa, "Taller Pro");
    const b = await tallerCon(sa, "Arranque");
    expect((await a.api.get("/comisiones/")).length).toBe(3);
    expect((await b.api.get("/comisiones/")).length).toBe(3);
    await a.api.put("/comisiones/tarjeta", { porcentaje: 4.2 });
    expect((await b.api.get("/comisiones/")).find((c) => c.tipo_pago === "tarjeta").porcentaje).toBe(3.5);
    await a.api.cerrar(); await b.api.cerrar(); await sa.cerrar();
  });

  test("Arranque en la web: menú sin módulos ajenos y pantallas sin errores", async ({ page }) => {
    const sa = await apiComo();
    const { T } = await tallerCon(sa, "Arranque");
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    await entrarAlPanel(page, T.usuario, T.password);
    const menu = await page.$$eval(".sidebar a.nav-link", (as) => as.map((a) => a.textContent.trim()));
    expect(menu).not.toContain("Citas solicitadas");
    expect(menu).not.toContain("Mi dashboard");
    expect(menu).not.toContain("Inventario");
    expect(menu).not.toContain("Asistente (chatbot)");
    for (const ruta of ["/refacciones", "/usuarios", "/asignacion-roles"]) {
      await page.goto(ruta); await page.waitForTimeout(1200);
      await expect(page.locator(".toast-error")).toHaveCount(0);
    }
    await expect(page.getByText("Técnico / Mecánico").first()).toBeVisible(); // asigna los roles base
    await expect(page.getByText("editar qué puede hacer cada rol")).toHaveCount(0); // pero no los edita
    expect(errores).toEqual([]);
    await sa.cerrar();
  });
});
