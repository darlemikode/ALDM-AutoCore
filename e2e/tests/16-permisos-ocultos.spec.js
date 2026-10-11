// Lo que tu rol no puede hacer no se muestra: sin botones que terminan en «no tienes permiso».
const { test, expect } = require("@playwright/test");
const { SUFIJO, apiComo, crearTallerConAdmin, entrarAlPanel } = require("./helpers");

async function tallerConRol(nombreRol) {
  const sa = await apiComo();
  const T = await crearTallerConAdmin(sa, { paqueteNombre: "Full Garage" });
  const admin = await apiComo(T.usuario, T.password);
  const rol = (await admin.get("/auth/roles")).find((r) => r.nombre.startsWith(nombreRol));
  const usuario = `rol_${SUFIJO().toLowerCase()}`;
  await admin.post("/auth/usuarios", { username: usuario, password: "secreto1", nombre_completo: `Prueba ${nombreRol}`, id_rol: rol.id_rol });
  return { sa, admin, usuario, password: "secreto1" };
}

test.describe("Acciones ocultas sin permiso", () => {
  test("Jefe de taller: edita clientes pero no los da de alta", async ({ page }) => {
    const { sa, admin, usuario, password } = await tallerConRol("Jefe de Taller");
    await admin.post("/clientes/", { nombre_cliente: "Cliente Visible", telefono1: "4771112233" });
    await entrarAlPanel(page, usuario, password);
    await expect(page.getByText("Registrar cliente")).toHaveCount(0);
    await page.goto("/clientes");
    await expect(page.getByText("Cliente Visible").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nuevo cliente/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar" }).first()).toBeVisible();
    await admin.cerrar(); await sa.cerrar();
  });

  test("Asesor: sin alta ni edición de vehículos y refacciones", async ({ page }) => {
    const { sa, admin, usuario, password } = await tallerConRol("Asesor de Servicio");
    const c = await admin.post("/clientes/", { nombre_cliente: "Dueño Auto", telefono1: "4772223344" });
    await admin.post("/vehiculos/", { id_cliente: c.id_cliente, placas_vehiculo: "ASE-001" });
    await entrarAlPanel(page, usuario, password);
    await page.goto("/vehiculos");
    await expect(page.getByText("ASE-001").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nuevo vehículo/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await page.goto("/refacciones");
    await expect(page.getByRole("button", { name: /Nueva refacción/ })).toHaveCount(0);
    await page.goto("/clientes");
    await expect(page.getByRole("button", { name: /Nuevo cliente/ })).toHaveCount(0);
    await admin.cerrar(); await sa.cerrar();
  });

  test("Inventario usa sus propios permisos y el panel filtra por fechas", async () => {
    const { sa, admin, usuario, password } = await tallerConRol("Asesor de Servicio");
    const asesor = await apiComo(usuario, password);
    await expect(asesor.post("/inventario-refacciones/", {})).rejects.toThrow(/403/);
    const c = await admin.post("/clientes/", { nombre_cliente: "Rango", telefono1: "4773334455" });
    const v = await admin.post("/vehiculos/", { id_cliente: c.id_cliente, placas_vehiculo: "RAN-001" });
    await admin.post("/servicios/", { id_cliente: c.id_cliente, id_vehiculo: v.id_vehiculo, nombre_servicio: "Prueba", iva_porcentaje: 0, tipos_mantenimiento_ids: [] });
    const total = (lista) => lista.reduce((t, e) => t + e.cantidad, 0);
    expect(total(await admin.get("/dashboard/servicios-por-estado"))).toBeGreaterThan(0);
    expect(total(await admin.get("/dashboard/servicios-por-estado?desde=2000-01-01&hasta=2000-12-31"))).toBe(0);
    const hoy = new Date().toISOString().slice(0, 10);
    expect(total(await admin.get(`/dashboard/servicios-por-estado?desde=${hoy}&hasta=${hoy}`))).toBeGreaterThan(0);
    await asesor.cerrar(); await admin.cerrar(); await sa.cerrar();
  });
});
